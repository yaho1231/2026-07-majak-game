/**
 * discard — 무엇을 버릴 것인가, 그리고 리치를 걸 것인가.
 *
 * **2026-08-05 재작성.** 예전에는 단위 없는 점수를 섞었다 —
 * `push * efficiency + fold * safety * 14`. 상수 14는 어디서 나온 값이 아니라 손으로
 * 맞춘 값이고, 그래서 "이 밀기가 저 접기보다 이득인가"를 봇이 실제로 **계산한 적이
 * 없었다.** 그저 두 휴리스틱을 비벼 놓았을 뿐이다.
 *
 * 지금은 후보 한 장마다 딱 두 값을 점수 단위로 낸다.
 *
 *   기대 획득 = 이 패를 버린 뒤의 화료 확률 × (그때의 손 값어치 + 판돈)
 *   기대 실점 = 이 패를 버렸을 때의 방총 확률 × 상대의 예상 실점
 *
 * 그리고 뺀다. 그게 전부다. 진행(샹텐·우케이레)은 화료 확률에, 값어치(도라)와
 * 방향(혼일색·탕야오)은 손 값어치에 들어가 있으므로, 예전의 네 항목이 전부 이
 * 뺄셈 하나로 합쳐진다 — 그리고 이제 그 결과는 **점수**라 다른 판단(후로·깡·증강)과
 * 직접 비교할 수 있다.
 *
 * 성격(`profile`)과 순위 압박(`match.riskAppetite`)은 이 뺄셈의 양쪽에 곱해지는
 * **저울**로만 작용한다. 판단 규칙을 바꾸지 않고 같은 계산의 무게만 바꾼다 —
 * 그래서 성격이 늘어도 로직이 갈라지지 않는다.
 */

import { kindKey, shantenOf, ukeireOf, winningKinds } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { removeKinds } from "./read.js";
import type { BotRead, HandPlan } from "./read.js";
import type { BotProfile } from "./profile.js";
import { NOTEN_PENALTY, waitTilesOf } from "./value.js";

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
 * 한 번 밀기로 마음먹으면 **그 뒤로도 계속 위험패를 낸다.** 지금 이 한 장의 방총
 * 확률만 재면 밀기가 언제나 싸 보이므로, 남은 국 동안 낼 위험패의 몫을 곱해 둔다.
 * 리치에 맞서 끝까지 미는 경우 보통 두세 장을 더 통과시켜야 한다.
 */
const PUSH_HORIZON = 2.5;

/**
 * 밀기와 접기에 각각 곱하는 저울.
 *
 * 성격(공격성)과 순위 압박(riskAppetite)이 **판단 규칙이 아니라 저울에만** 붙는다.
 * 올라스 선두는 같은 계산을 하고도 실점을 크게 세어 접고, 꼴찌는 획득을 크게 세어
 * 민다 — 사람이 그러는 것과 같고, 새 성격을 추가해도 분기가 늘지 않는다.
 */
function scales(read: BotRead, profile: BotProfile): { gain: number; loss: number } {
  const bias = (profile.aggression - 0.5) * 0.6 + read.match.riskAppetite * 0.45;
  return {
    gain: Math.max(0.4, 1 + bias),
    loss: Math.max(0.35, 1 - bias),
  };
}

/**
 * 접는 비중 0(전력으로 민다) ~ 1(완전히 접는다).
 *
 * 이제 이 값은 규칙이 아니라 **위 두 기대값의 비율**이다 — 밀어서 얻을 것보다 잃을
 * 것이 크면 1에 가까워진다. `call.ts`가 "지금 울 판인가"를 물을 때 쓰는 한 줄 요약이다.
 */
export function foldWeight(read: BotRead, profile: BotProfile): number {
  if (read.threat <= 0) return 0;
  if (read.riichiDeclared) return 0; // 이미 리치 — 선택권이 없다

  const value = read.valueOf(null);
  const ukeire = ukeireOf(read.hand, read.meldCount, read.remainingOf, read.opts).tiles;
  const gain =
    read.winChanceOf({
      shanten: Math.max(0, read.shanten),
      waitTiles: read.waitTiles,
      ukeireTiles: ukeire,
    }) *
    (value.points + read.match.potBonus);

  // 지금 손에 든 패를 계속 흘려야 한다 — 그 평균 위험이 미는 값이다
  let loss = 0;
  for (const k of read.hand) loss += read.expectedLoss(k);
  loss = (loss / Math.max(1, read.hand.length)) * PUSH_HORIZON;

  const s = scales(read, profile);
  const g = gain * s.gain;
  const l = loss * s.loss;
  if (g + l <= 0) return 0;
  return Math.max(0, Math.min(1, l / (g + l)));
}

/**
 * 노리는 역에 어긋나는 패를 지금 흘리는 것의 값어치 (점수 단위).
 *
 * 방향은 **미래의 판수**다 — 혼일색으로 가는 손에서 딴 색 한 장을 물고 있으면 3판이
 * 날아간다. 샹텐·우케이레는 이 손해를 보지 못한다(딴 색도 멘쯔가 되기는 하므로).
 * 그래서 손 값어치에 비례하는 몫으로 따로 얹는다 — 상수 대신 비율이라, 싸구려 손에서는
 * 방향에 덜 집착하고 비싼 손에서는 더 집착한다. 사람과 같다.
 */
function directionGain(kind: TileKind, plan: HandPlan, handPoints: number): number {
  if (plan === null) return 0;
  const isNumber = kind.suit === "man" || kind.suit === "pin" || kind.suit === "sou";
  if (plan.yaku === "honitsu") {
    if (isNumber && kind.suit !== plan.suit) return handPoints * 0.18; // 딴 색은 최우선 정리
    return handPoints * -0.03; // 같은 색·자패는 남긴다
  }
  if (plan.yaku === "tanyao") {
    return !isNumber || kind.rank === 1 || kind.rank === 9 ? handPoints * 0.09 : 0;
  }
  // 토이토이는 커쯔 지향이라 샹텐 계산이 이미 반영한다
  return 0;
}

/**
 * 버릴 패를 고른다. options는 전부 {tileId} payload를 가진 후보(버림 또는 리치 선언패).
 *
 * 후보마다 **버린 뒤의 손**을 실제로 세워 화료 확률과 값어치를 재고, 그 기대 획득에서
 * 이 패의 기대 실점을 뺀다. 접는 판단은 따로 없다 — 위험이 크면 기대 실점이 커져
 * 자연히 안전패가 이긴다. 그게 사람이 하는 계산이다.
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

  const scale = scales(read, profile);

  // 1차: 버린 뒤의 샹텐 (같은 종류는 한 번만 계산)
  const shantenBy = new Map<string, number>();
  for (const c of cands) {
    const key = kindKey(c.kind);
    if (shantenBy.has(key)) continue;
    shantenBy.set(key, shantenOf(removeKinds(read.hand, [c.kind]), read.meldCount, read.opts));
  }
  let bestShanten = Infinity;
  for (const s of shantenBy.values()) if (s < bestShanten) bestShanten = s;

  // 2차: 최선 샹텐을 유지하는 후보만 우케이레·대기를 잰다 (전부 재면 비싸다).
  // 그보다 나쁜 형태는 어차피 화료 확률에서 지므로 정밀하게 잴 이유가 없다.
  const ukeireBy = new Map<string, number>();
  const waitsBy = new Map<string, number>();
  for (const [key, s] of shantenBy) {
    if (s > bestShanten) continue;
    const c = cands.find((x) => kindKey(x.kind) === key);
    if (c === undefined) continue;
    const rest = removeKinds(read.hand, [c.kind]);
    ukeireBy.set(key, ukeireOf(rest, read.meldCount, read.remainingOf, read.opts).tiles);
    if (s <= 0) {
      waitsBy.set(
        key,
        waitTilesOf(winningKinds(rest, read.meldCount, undefined, read.opts), read.remainingOf),
      );
    }
  }

  // 종반에 텐파이를 붙들면 노텐벌부를 피한다 — 화료와 별개로 값이 있는 결과다
  const notenStake = read.wallLeft <= 16 ? NOTEN_PENALTY : 0;

  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    const key = kindKey(c.kind);
    const s = shantenBy.get(key) ?? 8;
    const u = ukeireBy.get(key) ?? 0;
    const w = waitsBy.get(key) ?? 0;

    // 값어치 — 도라·적도라를 흘리면 같은 형태라도 손이 싸진다
    const doraLost = read.doraIn([c.kind]) + (c.red ? 1 : 0);
    const value = read.valueOf(plan, -doraLost);

    const pWin = read.winChanceOf({ shanten: s, waitTiles: w, ukeireTiles: u });
    const gain =
      pWin * (value.points + read.match.potBonus) +
      (s <= 0 ? notenStake : 0) +
      directionGain(c.kind, plan, value.points);

    const loss = read.expectedLoss(c.kind) * PUSH_HORIZON;

    const score = gain * scale.gain - loss * scale.loss;
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
 *
 * 2026-08-05: 다마텐 판단이 `handDora >= 3`이라는 도라 개수 규칙이었다. 도라 3장짜리
 * 열린 탕야오와 도라 3장짜리 멘젠 혼일색은 값이 두 배 넘게 차이 나는데도 같은 취급을
 * 받았다. 이제 **리치를 걸었을 때와 안 걸었을 때의 예상 점수를 실제로 비교**한다.
 * 그리고 순위 압박을 본다 — 올라스 선두는 웬만하면 안 걸고, 꼴찌는 웬만하면 건다.
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

  // 다마텐 — 이미 역이 있고(론이 되고) 리치로 늘어나는 점수보다 감추는 이득이 클 때.
  // noYakuWaits가 비어 있다 = 지금 대기 전부가 역이 붙어 론이 된다는 뜻.
  const hasYaku = (read.view.round.byPlayer[read.me]?.noYakuWaits ?? []).length === 0;
  if (hasYaku && damatenIsBetter(read, best, profile)) return null;

  // 남이 리치를 걸었는데 밀어서 얻을 것보다 잃을 것이 크다 → 사람도 여기서는 물러선다.
  // 리치는 손을 고정시켜 **이후 모든 위험패를 강제로 통과시키는** 선언이라, 접을
  // 여지를 완전히 버리는 값이 여기 들어간다.
  if (read.threat > 0) {
    const value = read.valueOf(null);
    const gain =
      read.winChanceOf({ shanten: 0, waitTiles: best.waitTiles, ukeireTiles: 0 }) *
      (value.riichiPoints + read.match.potBonus);
    let loss = 0;
    for (const k of read.hand) loss += read.expectedLoss(k);
    loss = (loss / Math.max(1, read.hand.length)) * LOCKED_PUSH_HORIZON;
    const s = scales(read, profile);
    if (gain * s.gain < loss * s.loss) return null;
  }

  return best.option;
}

/**
 * 리치를 선언하면 남은 국 내내 손을 고칠 수 없다 — 위험패가 와도 그대로 낸다.
 * 그래서 리치의 위험은 평시 밀기(`PUSH_HORIZON`)보다 길게 잡는다.
 */
const LOCKED_PUSH_HORIZON = 4;

/** 리치 선언 비용 (공탁) */
const RIICHI_COST = 1000;

/**
 * 다마텐이 나은가 — 리치로 늘어나는 기대 점수가 그 비용·위험보다 작은가.
 *
 * 리치가 주는 것: 리치·일발·우라·쯔모의 기대 판수(약 2판). 뺏는 것: 공탁 1000점,
 * 손 고정, 그리고 **상대가 전부 접어 론이 줄어드는 몫**. 이미 만관 언저리인 손은
 * 판수를 더 얹어도 점수 구간이 그대로라 리치의 이득이 실제로 거의 없다 — 그때
 * 사람이 다마텐을 고르는 이유가 바로 이것이다.
 */
function damatenIsBetter(
  read: BotRead,
  best: { waitTiles: number },
  profile: BotProfile,
): boolean {
  const value = read.valueOf(null);
  const pWin = read.winChanceOf({ shanten: 0, waitTiles: best.waitTiles, ukeireTiles: 0 });
  /**
   * 순위 압박이 리치의 웃돈을 깎거나 키운다.
   *
   * 올라스 선두에게 추가 점수는 거의 쓸모가 없다 — 이기고 있는 사람이 원하는 것은
   * **국이 조용히 끝나는 것**이다. 그래서 판수를 더 얹는 대가로 손을 고정하고 1000점을
   * 내는 거래가 손해가 된다. 반대로 꼴찌에게는 같은 판수 상승이 순위를 바꾸므로
   * 액면가보다 비싸다. 사람이 다마텐을 고르는 진짜 이유가 대개 이것이다.
   */
  const placement = 1 + read.match.riskAppetite * 0.35;
  // 리치를 걸면 상대가 접는다 — 론 기회가 줄어드는 몫
  const riichiEV =
    pWin * FOLD_PRESSURE * (value.riichiPoints + read.match.potBonus) * placement - RIICHI_COST;
  const damatenEV = pWin * (value.points + read.match.potBonus);
  // 리치를 좋아하는 성격은 같은 계산에서도 리치 쪽에 웃돈을 준다
  return damatenEV > riichiEV * (0.75 + profile.riichiLoose * 0.5);
}

/** 리치를 걸면 상대가 조심해져 화료 확률이 이만큼 줄어든다 */
const FOLD_PRESSURE = 0.88;
