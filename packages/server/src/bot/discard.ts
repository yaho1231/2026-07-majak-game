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
import type { ActionBid } from "./decide.js";

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
export function scales(read: BotRead, profile: BotProfile): { gain: number; loss: number } {
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

  const value = read.valueOf({ plan: null });
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


// ─────────────────────────── 후보 한 장을 버린 뒤의 손 ───────────────────────────

/** 버린 뒤의 손 모양 — 화료 확률의 재료 */
interface Shape {
  shanten: number;
  ukeire: number;
  /** 텐파이일 때 오름패의 남은 장수 (노텐이면 0) */
  waitTiles: number;
}

/**
 * 후보마다 버린 뒤의 모양을 잰다. 같은 종류는 한 번만 계산하고, **최선 샹텐을
 * 유지하는 후보만** 우케이레·대기까지 정밀하게 잰다 — 그보다 나쁜 형태는 어차피
 * 화료 확률에서 지므로 비싼 계산을 할 이유가 없다.
 */
function shapesOf(read: BotRead, cands: readonly Candidate[]): Map<string, Shape> {
  const out = new Map<string, Shape>();
  for (const c of cands) {
    const key = kindKey(c.kind);
    if (out.has(key)) continue;
    out.set(key, {
      shanten: shantenOf(removeKinds(read.hand, [c.kind]), read.meldCount, read.opts),
      ukeire: 0,
      waitTiles: 0,
    });
  }
  let bestShanten = Infinity;
  for (const s of out.values()) if (s.shanten < bestShanten) bestShanten = s.shanten;

  for (const [key, shape] of out) {
    if (shape.shanten > bestShanten) continue;
    const c = cands.find((x) => kindKey(x.kind) === key);
    if (c === undefined) continue;
    const rest = removeKinds(read.hand, [c.kind]);
    shape.ukeire = ukeireOf(rest, read.meldCount, read.remainingOf, read.opts).tiles;
    if (shape.shanten <= 0) {
      shape.waitTiles = waitTilesOf(
        winningKinds(rest, read.meldCount, undefined, read.opts),
        read.remainingOf,
      );
    }
  }
  return out;
}

/**
 * 이 패를 버리고 (리치를 걸거나 안 걸고) 갔을 때 **이 판의 절대 EV**.
 *
 * 버림과 리치가 같은 함수로 값매겨지는 것이 요점이다. 예전에는 "리치를 걸까"가
 * 별도의 규칙 뭉치였고 버림과 비교된 적이 없었다. 지금은 둘 다 "이 패를 놓는
 * 서로 다른 두 방식"일 뿐이고, 다마텐은 **리치 EV가 버림 EV보다 낮은 상태**로
 * 저절로 나타난다 — 다마텐이라는 규칙이 따로 없다.
 */
function lineEV(
  read: BotRead,
  c: Candidate,
  shape: Shape,
  plan: HandPlan,
  profile: BotProfile,
  opts: { riichi: boolean; tsumoOnly: boolean; notenStake: number },
): number {
  const scale = scales(read, profile);
  // 값어치 — 도라·적도라를 흘리면 같은 형태라도 손이 싸진다
  const doraLost = read.doraIn([c.kind]) + (c.red ? 1 : 0);
  const value = read.valueOf({ plan, doraDelta: -doraLost });
  const points = opts.riichi ? value.riichiPoints : value.points;

  let pWin = read.winChanceOf({
    shanten: shape.shanten,
    waitTiles: shape.waitTiles,
    ukeireTiles: shape.ukeire,
    tsumoOnly: opts.tsumoOnly,
  });
  if (opts.riichi) pWin *= FOLD_PRESSURE; // 알리면 상대가 조심한다

  /**
   * 순위 압박이 점수의 값어치 자체를 바꾼다. 올라스 선두에게 추가 점수는 거의
   * 쓸모가 없고(원하는 건 국이 조용히 끝나는 것), 꼴찌에게는 액면가보다 비싸다.
   * 리치는 점수를 사는 거래이므로 이 환율이 리치 쪽에만 붙는다.
   */
  const placement = opts.riichi ? 1 + read.match.riskAppetite * 0.35 : 1;
  // 리치를 좋아하는 성격은 같은 계산에서도 리치 쪽에 웃돈을 준다
  const appetite = opts.riichi ? 0.75 + profile.riichiLoose * 0.5 : 1;

  const gain =
    pWin * (points + read.match.potBonus) * placement * appetite +
    (shape.shanten <= 0 ? opts.notenStake : 0) +
    directionGain(c.kind, plan, value.points);

  // 리치는 손을 고정시켜 남은 순의 위험패를 전부 통과시켜야 한다 — 위험이 더 길다
  const horizon = opts.riichi ? LOCKED_PUSH_HORIZON : PUSH_HORIZON;
  const loss = read.expectedLoss(c.kind) * horizon;

  return gain * scale.gain - loss * scale.loss - (opts.riichi ? RIICHI_COST : 0);
}

/**
 * 리치를 선언하면 남은 국 내내 손을 고칠 수 없다 — 위험패가 와도 그대로 낸다.
 * 그래서 리치의 위험은 평시 밀기(`PUSH_HORIZON`)보다 길게 잡는다.
 */
const LOCKED_PUSH_HORIZON = 4;

/** 리치 선언 비용 (공탁) */
const RIICHI_COST = 1000;

/** 리치를 걸면 상대가 조심해져 화료 확률이 이만큼 줄어든다 */
const FOLD_PRESSURE = 0.88;

/**
 * 지금 대기 전부에 역이 붙어 론이 되는가.
 * 역이 없으면 멘젠 손은 **쯔모로만** 이길 수 있다 — 화료 확률이 절반 아래로 떨어지고,
 * 그게 곧 "그래서 리치를 걸어야 한다"의 근거가 된다.
 */
function hasYakuNow(read: BotRead): boolean {
  return (read.view.round.byPlayer[read.me]?.noYakuWaits ?? []).length === 0;
}

// ─────────────────────────── 입찰 ───────────────────────────

/**
 * 버림 입찰 — 후보 중 EV가 가장 큰 한 장.
 *
 * 진행·값어치·방향·안전이 전부 이 EV 하나에 녹아 있다. 접기 규칙은 없다 —
 * 위험이 크면 기대 실점이 커져 안전패가 저절로 이긴다.
 */
export function bidDiscard(
  read: BotRead,
  options: readonly ActionOption[],
  plan: HandPlan,
  profile: BotProfile,
): ActionBid | null {
  const cands = candidatesOf(read, options);
  if (cands.length === 0) return null;

  const shapes = shapesOf(read, cands);
  // 종반에 텐파이를 붙들면 노텐벌부를 피한다 — 화료와 별개로 값이 있는 결과다
  const notenStake = read.wallLeft <= 16 ? NOTEN_PENALTY : 0;
  const tsumoOnly = read.meldCount === 0 && !hasYakuNow(read);

  let best: Candidate | null = null;
  let bestEV = -Infinity;
  for (const c of cands) {
    const shape = shapes.get(kindKey(c.kind));
    if (shape === undefined) continue;
    const ev = lineEV(read, c, shape, plan, profile, {
      riichi: false,
      tsumoOnly,
      notenStake,
    });
    // 동점이면 뒤쪽(쯔모패 쪽)을 버린다 — 사람도 쓸모 같으면 쯔모기리한다
    if (ev >= bestEV) {
      bestEV = ev;
      best = c;
    }
  }
  if (best === null) return null;
  const shape = shapes.get(kindKey(best.kind));
  return {
    option: best.option,
    value: bestEV,
    reason: `버림 샹텐${shape?.shanten ?? "?"} 우케이레${shape?.ukeire ?? 0}`,
  };
}

/**
 * 리치 입찰 — 선언패 후보 중 EV가 가장 큰 한 장. 걸 수 없는 자리면 null.
 *
 * 여기서 걸러내는 것은 **취향이 아니라 불가능**이다(패산 고갈·죽은 대기·후리텐).
 * "걸까 말까"는 이 입찰이 버림 입찰을 이기느냐로 결정된다.
 */
export function bidRiichi(
  read: BotRead,
  riichiOptions: readonly ActionOption[],
  plan: HandPlan,
  profile: BotProfile,
): ActionBid | null {
  if (riichiOptions.length === 0) return null;
  // 패산이 거의 없으면 공탁만 버리는 꼴이다
  if (read.wallLeft <= 4) return null;

  const myDiscards = new Set<string>();
  for (const id of read.view.zones[`discards:${read.me}`]?.tileIds ?? []) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) myDiscards.add(kindKey(k));
  }

  const cands = candidatesOf(read, riichiOptions);
  if (cands.length === 0) return null;
  const shapes = shapesOf(read, cands);

  let best: Candidate | null = null;
  let bestEV = -Infinity;
  let bestShape: Shape | null = null;
  for (const c of cands) {
    const shape = shapes.get(kindKey(c.kind));
    if (shape === undefined || shape.shanten > 0) continue;
    // 죽은 대기 — 오름패가 세상에 한 장도 없다
    if (shape.waitTiles <= 0) continue;
    const rest = removeKinds(read.hand, [c.kind]);
    const waits = winningKinds(rest, read.meldCount, undefined, read.opts);
    const furiten = waits.some((w) => myDiscards.has(kindKey(w)));
    // 후리텐 리치는 쯔모밖에 없다. 대기가 아주 넓고 저돌적인 성격일 때만.
    if (furiten && !(shape.waitTiles >= 8 && profile.aggression > 0.6)) continue;

    const ev = lineEV(read, c, shape, plan, profile, {
      riichi: true,
      tsumoOnly: furiten,
      notenStake: 0, // 리치는 어차피 텐파이 — 노텐벌부는 양쪽 공통이라 비교에서 상쇄된다
    });
    if (ev > bestEV) {
      bestEV = ev;
      best = c;
      bestShape = shape;
    }
  }
  if (best === null) return null;
  return {
    option: best.option,
    value: bestEV,
    reason: `리치 대기${bestShape?.waitTiles ?? 0}장`,
  };
}

// ─────────────────────────── 기존 진입점 (입찰의 얇은 껍데기) ───────────────────────────

/** 버릴 패를 고른다. 후보가 없으면 null */
export function chooseDiscard(
  read: BotRead,
  options: readonly ActionOption[],
  plan: HandPlan,
  profile: BotProfile,
): ActionOption | null {
  return bidDiscard(read, options, plan, profile)?.option ?? null;
}

/**
 * 리치를 걸지, 건다면 어느 패로 선언할지. 걸지 않으면 null(일반 버림으로 넘어간다).
 *
 * **다마텐은 규칙이 아니라 결과다** — 같은 패를 놓는 두 방식(리치/그냥 버림)의 EV를
 * 견줘, 리치가 지면 걸지 않는다. 예전에는 `handDora >= 3` 같은 도라 개수 규칙이었고,
 * 도라 3장짜리 열린 탕야오와 멘젠 혼일색을 같은 손으로 취급했다.
 */
export function chooseRiichi(
  read: BotRead,
  riichiOptions: readonly ActionOption[],
  profile: BotProfile,
  plan: HandPlan = null,
): ActionOption | null {
  const riichi = bidRiichi(read, riichiOptions, plan, profile);
  if (riichi === null) return null;
  // 같은 패를 그냥 버리는 길(=다마텐)과 견준다
  const quiet = bidDiscard(read, riichiOptions, plan, profile);
  if (quiet !== null && quiet.value >= riichi.value) return null;
  return riichi.option;
}
