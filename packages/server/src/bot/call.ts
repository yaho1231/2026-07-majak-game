/**
 * call — 울 것인가(펑·치·대명깡), 운다면 어느 조합으로 울 것인가.
 *
 * 예전 봇은 "역패면 펑, 혼일색이면 아무거나, 탕야오면 아무거나"였다. 그래서 손이 한
 * 발짝도 나아가지 않는 치를 부르고, 이미 텐파이인 멘젠 손을 스스로 열어 리치를 날렸다.
 *
 * 사람이 우는 기준은 셋이 동시에 만족될 때다.
 *   1. **손이 실제로 전진한다** — 울고 난 뒤 샹텐이 줄어야 한다(역패 펑만 예외).
 *   2. **화료할 역이 있다** — 열린 손은 역이 없으면 텐파이해도 못 먹는다.
 *   3. **울 만한 판이다** — 남의 리치에 2샹텐짜리 싸구려를 열지는 않는다.
 *
 * 예외 하나: 종반에 울어서 텐파이가 되면 **형식텐파이**(노텐벌부 회피)로 부른다.
 */

import { kindKey, shantenOf, ukeireOf, winningKinds } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { meldKindsOf, removeKinds } from "./read.js";
import type { BotRead, HandPlan } from "./read.js";
import type { BotProfile } from "./profile.js";
import { scales } from "./discard.js";
import type { ActionBid } from "./decide.js";
import { NOTEN_PENALTY, waitTilesOf } from "./value.js";

const NUMBER_SUITS = new Set(["man", "pin", "sou"]);
const isNumber = (k: TileKind): boolean => NUMBER_SUITS.has(k.suit);
const isSimple = (k: TileKind): boolean => isNumber(k) && k.rank >= 2 && k.rank <= 8;
const isOrphan = (k: TileKind): boolean => !isNumber(k) || k.rank === 1 || k.rank === 9;

/** 콜 후보 하나를 뜯어 본 결과 */
interface CallPlan {
  option: ActionOption;
  /** 손에서 내주는 패 */
  used: TileKind[];
  /** 부른 뒤의 샹텐 */
  shanten: number;
  /** 부른 뒤의 우케이레 장수 */
  ukeire: number;
  /** 부른 뒤가 텐파이면 오름패의 남은 장수 (아니면 0) */
  waitTiles: number;
  /** 이 콜로 성립하는 역 방향 (없으면 null) */
  yaku: HandPlan;
  /** 적도라를 멘쯔에 넣어 버리는가 (같은 값이면 피한다) */
  spendsRed: boolean;
}

export interface CallChoice {
  option: ActionOption;
  /** 이 콜로 확정된 이번 국의 역 방향 */
  plan: HandPlan;
}

/** 콜 입찰 — 값과 함께, 그 콜로 확정되는 역 방향을 실어 보낸다 */
export interface CallBid extends ActionBid {
  plan: HandPlan;
}

/**
 * 울 수 있는 콜 중 가장 나은 것을 **입찰**로 낸다 (부른 뒤 판의 절대 EV).
 * 여기서 null인 것은 "안 부르는 게 낫다"가 아니라 **부를 수 없다**는 뜻이다 —
 * 열린 손에 역이 없거나, 손이 전진하지 않거나, 멘젠 텐파이를 스스로 깨는 콜.
 * 부를지 말지는 이 입찰이 `bidPass`를 이기느냐로 결정된다.
 *
 * 증강이 등록한 커스텀 콜은 여기서 다루지 않는다 — 각 증강의 bot 정책 담당이다.
 */
export function bidCall(
  read: BotRead,
  options: readonly ActionOption[],
  committed: HandPlan,
  profile: BotProfile,
): CallBid | null {
  const callable = options.filter(
    (o) => o.type === "pon" || o.type === "chi" || o.type === "minkan",
  );
  if (callable.length === 0) return null;

  const ld = read.view.round.lastDiscard;
  if (ld === null) return null;
  const called = read.view.tiles[ld.tileId]?.kind;
  if (called === undefined) return null;

  const meldKinds = meldKindsOf(read);
  const hasYakuhaiMeld = countYakuhaiTriplets(read, meldKinds) > 0;
  const menzen = read.meldCount === 0;

  // 이미 멘젠 텐파이 — 열면 리치·멘젠쯔모·이빨 다 날아간다. 사람은 여기서 안 운다.
  if (menzen && read.tenpai) return null;

  const before = shantenOf(read.hand, read.meldCount, read.opts);

  const plans: CallPlan[] = [];
  for (const option of callable) {
    const used = usedKinds(read, option);
    if (used.length === 0) continue;
    const rest = removeKinds(read.hand, used);
    const after = shantenOf(rest, read.meldCount + 1, read.opts);
    const meldTiles = [...used, called];
    const yaku = yakuPathAfter(read, rest, [...meldKinds, ...meldTiles], option, called);
    plans.push({
      option,
      used,
      shanten: after,
      ukeire:
        after <= before
          ? ukeireOf(rest, read.meldCount + 1, read.remainingOf, read.opts).tiles
          : 0,
      waitTiles:
        after <= 0
          ? waitTilesOf(
              winningKinds(rest, read.meldCount + 1, undefined, read.opts),
              read.remainingOf,
            )
          : 0,
      yaku,
      spendsRed: usesRedFive(read, option),
    });
  }
  if (plans.length === 0) return null;

  plans.sort((a, b) => {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (b.ukeire !== a.ukeire) return b.ukeire - a.ukeire;
    if (a.spendsRed !== b.spendsRed) return a.spendsRed ? 1 : -1;
    return 0;
  });

  // 역패 펑은 특별 취급 — 그 커쯔 자체가 역이라 손 모양과 무관하게 확정 이득이다.
  // (샹텐이 나빠지지만 않으면 부른다. 사람도 역패 또이쯔는 거의 항상 펑한다.)
  const yakuhaiPon = plans.find(
    (p) =>
      (p.option.type === "pon" || p.option.type === "minkan") &&
      read.isYakuhai(called) &&
      p.shanten <= before,
  );
  let picked: CallPlan | undefined;
  let plan: HandPlan;
  if (yakuhaiPon !== undefined) {
    // 자패는 슌쯔로 쓸 일이 없으니 4장째가 있으면 대명깡이 상위 호환이다
    const minkan = plans.find((p) => p.option.type === "minkan" && !isNumber(called));
    picked = minkan ?? yakuhaiPon;
    plan = { yaku: "yakuhai" };
  } else {
    const best = plans[0];
    if (best === undefined) return null;

    // 손이 전진하지 않는 콜은 부르지 않는다 (텐파이를 잡는 콜은 전진으로 친다)
    if (best.shanten >= before) return null;

    // 종반 형식텐파이 — 역이 없어도 텐파이면 노텐벌부를 피한다
    const lateTenpai = best.shanten === 0 && read.wallLeft <= 12;

    // 열린 손은 역이 없으면 텐파이해도 못 먹는다 — 값어치가 0인 길이다
    const found = best.yaku ?? (hasYakuhaiMeld ? ({ yaku: "yakuhai" } as const) : null);
    if (found === null && !lateTenpai) return null;

    picked = best;
    plan = found ?? committed;
  }

  const value = evOfCall(read, picked, plan, profile);
  return {
    option: picked.option,
    value,
    plan,
    reason: `후로 샹텐${picked.shanten} ${plan?.yaku ?? "형식텐파이"}`,
  };
}

/**
 * 울지 않고 지금 손 그대로 가는 길의 입찰 (절대 EV).
 * 콜 입찰과 **같은 축**이라 직접 견줄 수 있다 — 이것이 "울까 말까"의 전부다.
 * 예전에는 `fold > 0.5`·`callLoose에 따른 샹텐 상한` 같은 문턱이 그 자리에 있었는데,
 * 그 문턱은 내 손이 만관인지 1000점인지, 상대가 오야인지 자인지를 보지 못했다.
 */
export function bidPass(
  read: BotRead,
  options: readonly ActionOption[],
  committed: HandPlan,
  profile: BotProfile,
): ActionBid | null {
  const pass = options.find((o) => o.type === "pass");
  if (pass === undefined) return null;
  return {
    option: pass,
    value: evOfPass(read, committed, profile),
    reason: `패스 (손 유지 샹텐${Math.max(0, read.shanten)})`,
  };
}

/** 울 것인가 (예전 진입점 — 두 입찰의 비교) */
export function chooseCall(
  read: BotRead,
  options: readonly ActionOption[],
  committed: HandPlan,
  profile: BotProfile,
): CallChoice | null {
  const call = bidCall(read, options, committed, profile);
  if (call === null) return null;
  if (call.value <= evOfPass(read, committed, profile)) return null;
  return { option: call.option, plan: call.plan };
}

/**
 * 이 콜을 부르고 갔을 때 판의 절대 EV.
 *
 * 울면 멘젠 판수(리치·쯔모·우라)가 통째로 날아가므로 `meldCount`를 올려 값을 다시
 * 매긴다 — 그 손실이 계산에 실제로 들어가는 것이 요점이다. 예전에는 샹텐만 보고
 * 울어서, 멘젠 3900이 열린 1000점이 되는 콜도 "전진했으니 이득"으로 읽었다.
 */
function evOfCall(
  read: BotRead,
  picked: CallPlan,
  plan: HandPlan,
  profile: BotProfile,
): number {
  const meldCount = read.meldCount + 1;
  const value = read.valueOf({ plan, meldCount });
  const shape = effectiveShape(read, picked, plan);
  const pWin = read.winChanceOf({
    shanten: shape.shanten,
    waitTiles: picked.waitTiles,
    ukeireTiles: shape.ukeire,
    // 울고 난 손은 **열린 손**이다 — 남의 버림패로도 계속 전진한다
    open: { hand: shape.hand, ukeireKinds: shape.ukeireKinds },
  });
  /**
   * **손을 여는 것에 대한 취향.** 멘젠파는 같은 계산을 하고도 여는 쪽을 싫어하고,
   * 속공파는 반대다 — 어느 쪽도 틀리지 않아서 EV를 뒤엎지 않고 기울이기만 한다.
   *
   * 2026-08-05: 후로 판단을 EV로 옮기면서 `callLoose`가 **어디에도 쓰이지 않게
   * 됐다**(예전엔 `maxOpenShanten` 문턱이 이 값을 읽었다). 성격 넷 중 하나가 조용히
   * 죽어 있었던 셈이라, 여기서 되살린다.
   */
  const appetite = 0.75 + profile.callLoose * 0.5;
  const gain = pWin * (value.points + read.match.potBonus) * appetite;
  // 종반에 텐파이가 걸리면 노텐벌부를 피한다
  const noten = picked.shanten <= 0 && read.wallLeft <= 16 ? NOTEN_PENALTY : 0;
  // 열린 손은 접기 어렵다 — 남은 국의 위험패를 계속 통과시켜야 한다
  const s = scales(read, profile);
  return (gain + noten) * s.gain - openRisk(read) * s.loss;
}

/** 울지 않고 지금 손 그대로 갔을 때 판의 절대 EV */
function evOfPass(read: BotRead, plan: HandPlan, profile: BotProfile): number {
  const value = read.valueOf({ plan });
  const u = ukeireOf(read.hand, read.meldCount, read.remainingOf, read.opts);
  const pWin = read.winChanceOf({
    shanten: Math.max(0, read.shanten),
    waitTiles: read.waitTiles,
    ukeireTiles: u.tiles,
    // 이미 열린 손이면 패스한 뒤에도 계속 부를 수 있다 — 콜 쪽과 같은 자로 재야 한다
    open: read.meldCount > 0 ? { hand: read.hand, ukeireKinds: u.kinds } : undefined,
  });
  const noten = read.tenpai && read.wallLeft <= 16 ? NOTEN_PENALTY : 0;
  const s = scales(read, profile);
  return (pWin * (value.points + read.match.potBonus) + noten) * s.gain;
}

/**
 * 손을 여는 대가 — 이후로는 접을 여지가 줄어 위험패를 계속 내야 한다.
 * 위협이 없으면 0이다(열어도 잃을 것이 없다).
 */
function openRisk(read: BotRead): number {
  if (read.threat <= 0) return 0;
  let loss = 0;
  for (const k of read.hand) loss += read.expectedLoss(k);
  return (loss / Math.max(1, read.hand.length)) * OPEN_HORIZON;
}

/** 열린 손이 남은 국 동안 통과시켜야 하는 위험패의 몫 */
const OPEN_HORIZON = 3;

/** 이 콜이 손에서 내주는 패의 kind 목록 */
function usedKinds(read: BotRead, option: ActionOption): TileKind[] {
  const ids = (option.payload as { tileIds?: TileId[] }).tileIds ?? [];
  const out: TileKind[] = [];
  for (const id of ids) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

function usesRedFive(read: BotRead, option: ActionOption): boolean {
  const ids = (option.payload as { tileIds?: TileId[] }).tileIds ?? [];
  return ids.some((id) => read.view.tiles[id]?.attrs.red === true);
}

/** 후로 패에 들어 있는 역패 커쯔 수 */
function countYakuhaiTriplets(read: BotRead, meldKinds: readonly TileKind[]): number {
  const counts = new Map<string, { kind: TileKind; n: number }>();
  for (const k of meldKinds) {
    const key = kindKey(k);
    const cur = counts.get(key);
    if (cur === undefined) counts.set(key, { kind: k, n: 1 });
    else cur.n++;
  }
  let n = 0;
  for (const { kind, n: c } of counts.values()) {
    if (c >= 3 && read.isYakuhai(kind)) n++;
  }
  return n;
}

/**
 * 이 콜을 부른 뒤 열린 손이 노릴 수 있는 역 — 없으면 null(= 울면 화료할 수 없는 손).
 * 남은 손패가 아직 조건에 어긋나는 패를 한두 장 물고 있어도, 버려서 맞출 수 있는
 * 범위(≤1장)까지는 사람과 같게 인정한다.
 */
function yakuPathAfter(
  read: BotRead,
  rest: readonly TileKind[],
  allMeldKinds: readonly TileKind[],
  option: ActionOption,
  called: TileKind,
): HandPlan {
  // 역패 — 부른 것이 역패 커쯔이거나 이미 역패 후로가 있다
  if (
    (option.type === "pon" || option.type === "minkan") &&
    read.isYakuhai(called)
  ) {
    return { yaku: "yakuhai" };
  }
  if (countYakuhaiTriplets(read, allMeldKinds) > 0) return { yaku: "yakuhai" };

  const all = [...rest, ...allMeldKinds];

  // 혼일색 — 수패가 한 색으로 모이는가 (딴 색 ≤1장까지는 정리 가능으로 본다)
  const counts = new Map<string, number>();
  let numberTotal = 0;
  for (const k of all) {
    if (isNumber(k)) {
      counts.set(k.suit, (counts.get(k.suit) ?? 0) + 1);
      numberTotal++;
    }
  }
  let bestSuit: string | null = null;
  let bestCount = 0;
  for (const [suit, c] of counts) {
    if (c > bestCount) {
      bestSuit = suit;
      bestCount = c;
    }
  }
  if (
    bestSuit !== null &&
    bestCount >= 5 &&
    numberTotal - bestCount <= 1
  ) {
    return { yaku: "honitsu", suit: bestSuit };
  }

  // 탕야오 — 부른 패가 심플이고, 요구패를 흘려도 손이 남는가 (쿠이탄 허용 규칙)
  if (isSimple(called) && all.filter(isOrphan).length <= 1) {
    return { yaku: "tanyao" };
  }

  // 토이토이 — 치가 하나도 없고 커쯔·작두가 충분히 모였을 때
  if (option.type !== "chi" && !hasSequenceMeld(read, allMeldKinds)) {
    const pairs = new Map<string, number>();
    for (const k of rest) {
      const key = kindKey(k);
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    let sets = 0;
    for (const c of pairs.values()) if (c >= 2) sets++;
    if (sets + read.meldCount + 1 >= 4) return { yaku: "toitoi" };
  }

  return null;
}

/**
 * 이 콜로 가려는 역의 **실효 손 모양**.
 *
 * 2026-08-05 측정에서 드러난 것: 게이트를 풀어 후로율을 사람 수준(30~40%)으로
 * 올렸더니 **판이 오히려 나빠졌다** — 유국률 25.6% → 30.8%, 총 화료율 74.4% → 69.3%.
 * 더 울고 덜 이긴 것이다.
 *
 * 원인은 게이트가 아니라 **EV가 낙관적**이라는 데 있었다. 탕야오로 가기로 한 손의
 * 샹텐을 요구패까지 포함해 셌기 때문이다. 그 요구패들은 앞으로 버릴 패라 멘쯔로
 * 쓸 수 없는데도 "쓸 수 있다"고 세니, 실제보다 가까운 손으로 보였다. 그래서 봇은
 * 자기가 실현할 수 없는 속도를 근거로 울었다.
 *
 * 이제 그 역으로 갈 때 **실제로 쓸 수 있는 패만으로** 샹텐과 우케이레를 잰다.
 * 그러면 "요구패 서너 장을 흘려야 하는 탕야오"는 저절로 값이 떨어져 EV에서 진다 —
 * 게이트로 막을 필요가 없어지고, 좋은 쿠이탄은 그대로 통과한다.
 */
function effectiveShape(
  read: BotRead,
  picked: CallPlan,
  plan: HandPlan,
): { shanten: number; ukeire: number; hand: TileKind[]; ukeireKinds: readonly TileKind[] } {
  const meldCount = read.meldCount + 1;
  const plain = removeKinds(read.hand, picked.used);
  const keep = keepFor(plan);
  const rest = keep === null ? plain : plain.filter(keep);
  const hand = rest.length === 0 ? plain : rest;
  const u = ukeireOf(hand, meldCount, read.remainingOf, read.opts);
  // 걸러 낸 게 없으면 이미 잰 값이 그대로다 — 같은 계산을 두 번 하지 않는다
  const shanten = hand === plain ? picked.shanten : shantenOf(hand, meldCount, read.opts);
  return { shanten, ukeire: u.tiles, hand, ukeireKinds: u.kinds };
}

/** 그 역이 손에 남기라고 요구하는 패의 조건 (제약이 없는 역은 null) */
function keepFor(plan: HandPlan): ((k: TileKind) => boolean) | null {
  if (plan === null) return null;
  if (plan.yaku === "tanyao") return isSimple;
  if (plan.yaku === "honitsu") {
    const suit = plan.suit;
    return (k) => !isNumber(k) || k.suit === suit;
  }
  return null;
}

/** 이미 친 후로(치)가 있는가 — 토이토이 판단용 */
function hasSequenceMeld(read: BotRead, _meldKinds: readonly TileKind[]): boolean {
  return (read.view.round.byPlayer[read.me]?.melds ?? []).some((m) => m.kind === "chi");
}
