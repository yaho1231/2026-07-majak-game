/**
 * 봇 액티브 증강 정책이 공유하는 소소한 도구들.
 *
 * 각 증강의 `bot.choose`는 순수 함수여야 하고(부수효과 금지), 뷰(가시성 필터가
 * 적용된 자기 시점)만 보고 발동 여부·대상을 정한다. 여기 모인 함수들은 그 판단에
 * 자주 쓰는 계산(손패 kind 목록·개수·손 약함 판정)을 한 곳에 둔다.
 *
 * 설계 원칙(docs/10_AUGMENT_SYSTEM.md, Augment.ts): 발동은 **명백히 유리하고
 * 자해 위험이 낮을 때만**. 판단할 수 없는 증강(폴드·무르기류)은 정책을 두지 않는다.
 */

import { handZone, kindKey } from "@majak/core";
import type {
  BotAugmentOption,
  BotDecisionContext,
  PlayerId,
  PlayerView,
  TileId,
  TileKind,
} from "@majak/core";

/**
 * 봇이 **판단할 수 없어 정책을 두지 않은** 액티브 증강 id.
 *
 * 다단계 블라인드 교환·상대 대기 추정이 필요한 것들이다. 봇이 이걸 뽑으면
 * 증강 한 칸을 놀리는 셈이라, 드래프트에서 **후순위로 미룬다**(BotAgent.decideDraft).
 * `bot_policy_coverage.test.ts`가 이 목록을 그대로 읽어 "정책도 없고 목록에도 없는
 * 액티브 증강"을 잡는다 — 목록과 테스트의 단일 진실이다.
 *
 * 2026-07-29: 봇이 위험(리치·안전패)과 샹텐을 읽게 되면서 **폴드 계열 4종**
 * (자유 선언·승부수·손바닥 뒤집기·장사진)이 판단 가능해져 목록에서 빠졌다.
 */
export const BOT_UNUSABLE_AUGMENTS: readonly string[] = [
  "future_sight", // 2단계 블라인드 교환 — 순이득 여부 불명
  "meld_dissolve", // 자기 후로 되돌리기 — 템포 손해 판단 불가
  "hand_swap3", // 지정→3장 넘김→3장 받음의 다단계 — 한 번의 choose로 조율 불가
  "tile_split", // 어떤 패를 어떻게 쪼갤지 — 손패 가치 추정 필요
  "frame_up", // 어떤 패를 누구에게 심을지 — 상대 대기 추정 필요
];

const isNum = (k: TileKind): boolean =>
  k.suit === "man" || k.suit === "pin" || k.suit === "sou";

/** 홀더의 감춰진 손패(후로 제외) kind 목록 — 뷰 기준. */
export function handKindsOf(view: PlayerView, holder: PlayerId): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[handZone(holder)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/** 특정 패(보통 쯔모패)를 뺀 홀더의 손패 kind 목록 — "이 패가 없어도 되는가" 판단용. */
export function handKindsExcept(
  view: PlayerView,
  holder: PlayerId,
  exclude: TileId,
): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[handZone(holder)]?.tileIds ?? []) {
    if (id === exclude) continue;
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/** kindKey → 손패 내 장수 맵. */
export function kindCounts(kinds: TileKind[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of kinds) {
    const key = kindKey(k);
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

/** 이 kind가 손패의 다른 패와 짝(같은 패 2장 이상)을 이루는가. */
export function hasPair(kinds: TileKind[], k: TileKind): boolean {
  return kinds.filter((o) => o.suit === k.suit && o.rank === k.rank).length >= 2;
}

/** 이 kind가 손패에서 슌쯔로 이어질 이웃(±1·±2 같은 색)을 가지는가. */
export function hasNeighbor(kinds: TileKind[], k: TileKind): boolean {
  if (!isNum(k)) return false;
  return kinds.some((o) => {
    if (o.suit !== k.suit) return false;
    const d = Math.abs(o.rank - k.rank);
    return d === 1 || d === 2;
  });
}

/**
 * 손패가 "갈아엎을 만큼 나쁜가" — 손을 통째로 재구성하는 증강(밥상 뒤엎기·통째로
 * 바꾸기·개벽 등)을 켤지 판단한다.
 *
 * 기준은 **샹텐**이다(BotAgent가 국사·치토이까지 포함해 계산해 넘긴다). 예전엔 고립패
 * 수로 어림했는데, 그러면 요구패 13종처럼 **국사 텐파이인 손**도 "고립패 13장"으로
 * 읽혀 엎어 버렸다 — 사람은 절대 그러지 않는다.
 */
export function handIsPoor(ctx: BotDecisionContext, minShanten = 4): boolean {
  if (ctx.tenpai) return false;
  return ctx.shanten >= minShanten;
}

/** 텐파이일 때 오름패가 세상에 몇 장 남아 있는가 (0이면 죽은 대기). */
export function waitTilesLeft(ctx: BotDecisionContext): number {
  let n = 0;
  for (const w of ctx.waits) n += ctx.remaining(w);
  return n;
}

/**
 * {tileId}를 버리는 후보들 중 **가장 안전한** 패를 고른다 (리치 중 안전패 선택용).
 * 지금 판에 위협이 없으면 null — 안전패를 고를 이유가 없다.
 */
export function pickSafestDiscard(
  ctx: BotDecisionContext,
  type: string,
): BotAugmentOption | null {
  if (ctx.threat <= 0) return null;
  let best: BotAugmentOption | null = null;
  let bestSafety = -Infinity;
  for (const o of ctx.options) {
    if (o.type !== type) continue;
    const tileId = (o.payload as { tileId?: TileId }).tileId;
    const kind = tileId !== undefined ? ctx.view.tiles[tileId]?.kind : undefined;
    if (kind === undefined) continue;
    const s = ctx.safety(kind);
    if (s > bestSafety) {
      bestSafety = s;
      best = o;
    }
  }
  return best;
}

const sameKind = (a: TileKind, b: TileKind): boolean =>
  a.suit === b.suit && a.rank === b.rank;

/** kinds에서 k와 같은 패 한 장을 뺀 새 목록. */
function withoutOne(kinds: TileKind[], k: TileKind): TileKind[] {
  const out: TileKind[] = [];
  let removed = false;
  for (const x of kinds) {
    if (!removed && sameKind(x, k)) {
      removed = true;
      continue;
    }
    out.push(x);
  }
  return out;
}

/**
 * 이 kind를 손에 넣거나 남기면 쓸모가 있는가 — 같은 패가 **한 장이라도** 있거나
 * (=짝이 된다) 슌쯔 이웃(±1·±2)이 있다.
 *
 * ⚠ `hasPair`와 헷갈리지 말 것: hasPair는 그 목록 안에 이미 2장 이상 있는지를 본다.
 * "지금 뽑은/가져올 패가 쓸모 있나"는 그 패를 뺀 나머지와 비교해야 하므로 이 함수다.
 */
export function usefulIn(kinds: TileKind[], k: TileKind): boolean {
  return kinds.some((x) => sameKind(x, k)) || hasNeighbor(kinds, k);
}

/**
 * origKind 한 장을 newKind로 바꾸면 손이 나아지는가 —
 * 바꾼 패가 (나머지 손패 기준) 쓸모 있어지고, 원래 패는 고립패였을 때만 true.
 * 연금술(±1)·염색(무늬 변경)처럼 패 1장을 갈아 짝·슌쯔를 만드는 판단에 쓴다.
 */
export function tileSwapImproves(
  kinds: TileKind[],
  origKind: TileKind,
  newKind: TileKind,
): boolean {
  const rest = withoutOne(kinds, origKind);
  return usefulIn(rest, newKind) && !usefulIn(rest, origKind);
}

/** 지금 리액션 대상이 된 버림패의 kind (없으면 undefined) — 커스텀 콜 정책용. */
export function lastDiscardKind(view: PlayerView): TileKind | undefined {
  const ld = view.round.lastDiscard;
  if (ld === null) return undefined;
  return view.tiles[ld.tileId]?.kind;
}

/** 홀더의 자풍 (1동 2남 3서 4북). 좌석·오야·진행 방향에서 계산한다. */
export function seatWindOf(view: PlayerView, holder: PlayerId): number {
  const me = view.players.find((p) => p.id === holder);
  if (me === undefined) return 0;
  const n = view.players.length;
  const diff = me.seat - view.round.dealerSeat;
  return ((((diff * view.round.direction) % n) + n) % n) + 1;
}

/**
 * 이 패가 홀더에게 역패인가 (삼원패 · 자풍 · 장풍).
 * 역패 커쯔는 그 자체가 역이라, 후로 계열 증강이 "울어도 되는가"를 판단하는 기준이 된다.
 */
export function isYakuhaiFor(
  view: PlayerView,
  holder: PlayerId,
  kind: TileKind,
): boolean {
  if (kind.suit === "dragon") return true;
  if (kind.suit === "wind") {
    return kind.rank === seatWindOf(view, holder) || kind.rank === view.round.prevalentWind;
  }
  return false;
}

/**
 * {tileId}를 버리는 후보들 중 '가장 고립된' 패(짝·이웃 없는 패 우선)를 고른다.
 * 리치류(오픈 리치·올인)에서 어떤 패로 선언할지 정할 때, 남은 손의 대기를 가장
 * 덜 해치는 패를 버리게 한다. 후보가 없으면 null.
 */
export function pickIsolatedDiscard(
  view: PlayerView,
  holder: PlayerId,
  options: readonly BotAugmentOption[],
  type: string,
): BotAugmentOption | null {
  const mine = options.filter((o) => o.type === type);
  if (mine.length === 0) return null;
  const kinds = handKindsOf(view, holder);
  let best: BotAugmentOption | null = null;
  let bestScore = Infinity;
  for (const o of mine) {
    const tileId = (o.payload as { tileId?: TileId }).tileId;
    const k = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
    if (k === undefined) continue;
    const rest = withoutOne(kinds, k);
    // 낮을수록 고립 → 우선 버림. 짝(2) > 이웃(1) 보유일수록 남긴다.
    const score = (rest.some((x) => sameKind(x, k)) ? 2 : 0) + (hasNeighbor(rest, k) ? 1 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best ?? mine[0] ?? null;
}
