/**
 * discard — 무엇을 버릴 것인가, 그리고 리치를 걸 것인가.
 *
 * 사람이 한 장을 고를 때 재는 것은 넷이다.
 *   1. **진행** — 버린 뒤의 샹텐, 그리고 그 형태가 받는 패의 실제 장수(우케이레).
 *   2. **값어치** — 도라·적도라를 흘리면 같은 형태라도 손이 싸진다.
 *   3. **방향** — 혼일색·탕야오처럼 노리는 역에 어긋나는 패는 일찍 흘린다.
 *   4. **안전** — 상대가 리치를 걸었으면 위 셋을 다 접고 현물부터 낸다.
 *
 * 넷을 그때그때 다른 비율로 섞는 것이 '밀기/접기'다. 여기서는 그 비율(fold)을
 * 위협도 × 내 손의 완성도·값어치 × 성격으로 정하고, 각 후보의 점수를 그 비율로 합친다.
 */

import { kindKey, shantenOf, ukeireOf, winningKinds } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { removeKinds } from "./read.js";
import type { BotRead, HandPlan } from "./read.js";
import type { BotProfile } from "./profile.js";

/** 버림 후보 — 옵션과 그 패의 정보 */
interface Candidate {
  option: ActionOption;
  kind: TileKind;
  red: boolean;
}

function candidatesOf(read: BotRead, options: readonly ActionOption[]): Candidate[] {
  const out: Candidate[] = [];
  for (const option of options) {
    const tileId = (option.payload as { tileId?: TileId }).tileId;
    if (tileId === undefined) continue;
    const meta = read.view.tiles[tileId];
    if (meta === undefined) continue;
    out.push({ option, kind: meta.kind, red: meta.attrs.red === true });
  }
  return out;
}

/**
 * 접는 비중 0(전력으로 민다) ~ 1(완전히 접는다).
 *
 * 텐파이·고타점·오야는 밀고, 2샹텐 이상에 싸구려면 접는다 — 사람의 기준 그대로다.
 * 성격(aggression)이 이 문턱을 좌우해 봇마다 다른 판단이 나온다.
 */
export function foldWeight(read: BotRead, profile: BotProfile): number {
  if (read.threat <= 0) return 0;
  if (read.riichiDeclared) return 0; // 이미 리치 — 선택권이 없다

  // 손이 멀수록 접는다
  const distance = Math.max(0, read.shanten);
  let need = distance === 0 ? 0.25 : distance === 1 ? 0.6 : distance === 2 ? 0.85 : 1;

  // 값어치가 크면 밀 이유가 생긴다 (도라 3 이상이면 사람도 웬만하면 민다)
  need -= Math.min(0.35, read.handDora * 0.09);
  // 텐파이인데 대기까지 좋으면 더 민다
  if (read.tenpai) {
    const waitTiles = read.waits.reduce((n, w) => n + read.remainingOf(w), 0);
    if (waitTiles >= 6) need -= 0.12;
    if (read.furiten) need += 0.25; // 후리텐 텐파이는 론이 안 된다 — 밀 이유가 적다
  }
  // 종반에 노텐이면 어차피 화료가 어렵다 → 방총만 피한다
  if (read.wallLeft <= 12 && read.shanten >= 1) need += 0.25;

  need *= 1.25 - profile.aggression * 0.7;
  return Math.max(0, Math.min(1, read.threat * need));
}

/** 노리는 역에 어긋나는 패에 주는 '버려도 좋다' 가산점 */
function planBonus(kind: TileKind, plan: HandPlan): number {
  if (plan === null) return 0;
  const isNumber = kind.suit === "man" || kind.suit === "pin" || kind.suit === "sou";
  if (plan.yaku === "honitsu") {
    if (isNumber && kind.suit !== plan.suit) return 8; // 딴 색은 최우선 정리
    return -1.5; // 같은 색·자패는 남긴다
  }
  if (plan.yaku === "tanyao") {
    if (!isNumber || kind.rank === 1 || kind.rank === 9) return 4;
    return 0;
  }
  if (plan.yaku === "toitoi") {
    return 0; // 커쯔 지향은 샹텐 계산이 이미 반영한다
  }
  return 0;
}

/**
 * 버릴 패를 고른다. options는 전부 {tileId} payload를 가진 후보(버림 또는 리치 선언패).
 *
 * 진행(샹텐·우케이레)으로 1차 선별하고, 위협이 있으면 안전도를 섞는다.
 * 완전히 접기로 한 상황(fold≈1)에서는 사실상 현물·스지만 보고 고른다.
 */
export function chooseDiscard(
  read: BotRead,
  options: readonly ActionOption[],
  plan: HandPlan,
  profile: BotProfile,
): ActionOption | null {
  const cands = candidatesOf(read, options);
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0]?.option ?? null;

  const fold = foldWeight(read, profile);
  const push = 1 - fold;

  // 1차: 버린 뒤의 샹텐 (같은 종류는 한 번만 계산)
  const shantenBy = new Map<string, number>();
  for (const c of cands) {
    const key = kindKey(c.kind);
    if (shantenBy.has(key)) continue;
    shantenBy.set(key, shantenOf(removeKinds(read.hand, [c.kind]), read.meldCount, read.opts));
  }
  let bestShanten = Infinity;
  for (const s of shantenBy.values()) if (s < bestShanten) bestShanten = s;

  // 2차: 최선 샹텐을 유지하는 후보만 우케이레를 잰다 (전부 재면 비싸다)
  const ukeireBy = new Map<string, number>();
  for (const [key, s] of shantenBy) {
    if (s > bestShanten) continue;
    const c = cands.find((x) => kindKey(x.kind) === key);
    if (c === undefined) continue;
    ukeireBy.set(
      key,
      ukeireOf(
        removeKinds(read.hand, [c.kind]),
        read.meldCount,
        read.remainingOf,
        read.opts,
      ).tiles,
    );
  }

  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    const key = kindKey(c.kind);
    const s = shantenBy.get(key) ?? 8;
    const u = ukeireBy.get(key) ?? 0;
    // 진행: 샹텐 한 단계가 우케이레 어떤 차이보다 크다
    let efficiency = -s * 10 + Math.min(u, 40) * 0.12;
    // 값어치: 도라·적도라를 흘리는 손해
    efficiency -= (read.doraIn([c.kind]) + (c.red ? 1 : 0)) * 1.6;
    // 방향
    efficiency += planBonus(c.kind, plan);

    const safety = read.safetyOf(c.kind);
    const score = push * efficiency + fold * safety * 14;
    // 동점이면 뒤쪽(쯔모패 쪽)을 버린다 — 사람도 쓸모 같으면 쯔모기리한다
    if (score >= bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best?.option ?? cands[cands.length - 1]?.option ?? null;
}

/** 리치 선언 후보 하나의 평가 */
interface RiichiPlan {
  option: ActionOption;
  kind: TileKind;
  /** 대기패로 남아 있는 실제 장수 */
  waitTiles: number;
  /** 대기가 후리텐인가 (내 버림패에 오름패가 있다) */
  furiten: boolean;
  safety: number;
}

/**
 * 리치를 걸지, 건다면 어느 패로 선언할지 정한다. 걸지 않으면 null(일반 버림으로 넘어간다).
 *
 * 리치마작에서 리치는 대체로 이득이라 기본은 "건다"이고, 사람이 실제로 참는 경우만
 * 예외로 뺀다 — **죽은 대기 · 후리텐 · 패산 고갈 · 다마텐이 나은 고타점 · 남의 리치에
 * 맞선 싸구려 나쁜 대기**. 선언패는 가장 넓은 대기를 남기는 쪽으로 고른다.
 */
export function chooseRiichi(
  read: BotRead,
  riichiOptions: readonly ActionOption[],
  profile: BotProfile,
): ActionOption | null {
  if (riichiOptions.length === 0) return null;
  // 패산이 거의 없으면 공탁만 버리는 꼴이다
  if (read.wallLeft <= 4) return null;

  const myDiscards = new Set<string>();
  for (const id of read.view.zones[`discards:${read.me}`]?.tileIds ?? []) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) myDiscards.add(kindKey(k));
  }

  const plans: RiichiPlan[] = [];
  for (const option of riichiOptions) {
    const tileId = (option.payload as { tileId?: TileId }).tileId;
    if (tileId === undefined) continue;
    const kind = read.view.tiles[tileId]?.kind;
    if (kind === undefined) continue;
    const rest = removeKinds(read.hand, [kind]);
    const waits = winningKinds(rest, read.meldCount, undefined, read.opts);
    if (waits.length === 0) continue;
    let waitTiles = 0;
    for (const w of waits) waitTiles += read.remainingOf(w);
    plans.push({
      option,
      kind,
      waitTiles,
      furiten: waits.some((w) => myDiscards.has(kindKey(w))),
      safety: read.safetyOf(kind),
    });
  }
  if (plans.length === 0) return null;

  plans.sort((a, b) => {
    if (a.furiten !== b.furiten) return a.furiten ? 1 : -1;
    if (b.waitTiles !== a.waitTiles) return b.waitTiles - a.waitTiles;
    if (b.safety !== a.safety) return b.safety - a.safety;
    return read.doraIn([a.kind]) - read.doraIn([b.kind]);
  });
  const best = plans[0];
  if (best === undefined) return null;

  // 죽은 대기 — 오름패가 세상에 한 장도 없다
  if (best.waitTiles === 0) return null;

  // 후리텐 리치는 쯔모밖에 없다. 대기가 아주 넓고 저돌적인 성격일 때만.
  if (best.furiten && !(best.waitTiles >= 8 && profile.aggression > 0.6)) return null;

  // 다마텐 — 이미 역이 있고(론이 되고) 손이 충분히 비쌀 때는 굳이 알리지 않는다.
  // noYakuWaits가 비어 있다 = 지금 대기 전부가 역이 붙어 론이 된다는 뜻.
  const hasYaku = (read.view.round.byPlayer[read.me]?.noYakuWaits ?? []).length === 0;
  if (
    hasYaku &&
    read.handDora >= 3 &&
    best.waitTiles >= 5 &&
    read.turn <= 9 &&
    profile.riichiLoose < 0.6
  ) {
    return null;
  }

  // 남이 리치를 걸었는데 내 손은 싸고 대기도 좁다 → 사람도 여기서는 물러선다
  if (
    read.threat >= 0.9 &&
    best.waitTiles <= 3 &&
    read.handDora <= 1 &&
    profile.aggression < 0.7
  ) {
    return null;
  }

  return best.option;
}
