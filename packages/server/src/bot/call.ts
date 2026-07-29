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

import { kindKey, shantenOf, ukeireOf } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { meldKindsOf, removeKinds } from "./read.js";
import type { BotRead, HandPlan } from "./read.js";
import type { BotProfile } from "./profile.js";
import { foldWeight } from "./discard.js";

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

/**
 * 펑·치·대명깡 중 부를 것을 고른다. 부르지 않으면 null(패스).
 * 증강이 등록한 커스텀 콜은 여기서 다루지 않는다 — 각 증강의 bot 정책 담당이다.
 */
export function chooseCall(
  read: BotRead,
  options: readonly ActionOption[],
  committed: HandPlan,
  profile: BotProfile,
): CallChoice | null {
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
  const fold = foldWeight(read, profile);

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
  if (yakuhaiPon !== undefined && fold < 0.7) {
    // 자패는 슌쯔로 쓸 일이 없으니 4장째가 있으면 대명깡이 상위 호환이다
    const minkan = plans.find((p) => p.option.type === "minkan" && !isNumber(called));
    const picked = minkan ?? yakuhaiPon;
    return { option: picked.option, plan: { yaku: "yakuhai" } };
  }

  const best = plans[0];
  if (best === undefined) return null;

  // 손이 전진하지 않는 콜은 부르지 않는다 (텐파이를 잡는 콜은 전진으로 친다)
  if (best.shanten >= before) return null;

  // 종반 형식텐파이 — 역이 없어도 텐파이면 노텐벌부를 피한다
  const lateTenpai = best.shanten === 0 && read.wallLeft <= 12;

  const plan = best.yaku ?? (hasYakuhaiMeld ? { yaku: "yakuhai" as const } : null);
  if (plan === null && !lateTenpai) return null;

  // 판이 위험한데 손이 멀면 열지 않는다 (열린 손은 접기도 어렵다)
  if (fold > 0.5 && best.shanten >= 1 && !lateTenpai) return null;

  // 성격: 느슨한 봇은 1샹텐까지, 단단한 봇은 텐파이가 걸릴 때만 운다
  const maxOpenShanten = profile.callLoose > 0.65 ? 2 : profile.callLoose > 0.35 ? 1 : 0;
  if (best.shanten > maxOpenShanten && !lateTenpai) return null;

  return { option: best.option, plan: plan ?? committed };
}

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
  if (bestSuit !== null && bestCount >= 5 && numberTotal - bestCount <= 1) {
    return { yaku: "honitsu", suit: bestSuit };
  }

  // 탕야오 — 요구패가 ≤1장이고 부른 패도 심플일 때 (쿠이탄 허용 규칙)
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

/** 이미 친 후로(치)가 있는가 — 토이토이 판단용 */
function hasSequenceMeld(read: BotRead, _meldKinds: readonly TileKind[]): boolean {
  return (read.view.round.byPlayer[read.me]?.melds ?? []).some((m) => m.kind === "chi");
}
