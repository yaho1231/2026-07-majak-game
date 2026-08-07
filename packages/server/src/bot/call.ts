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
import type { CallOutcome } from "./callAudit.js";

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
  /**
   * 입찰까지 온 기회의 **결말**을 나중에 적는 손잡이 — 이겼는지 졌는지는
   * `BotAgent`가 전부 견줘 봐야 알 수 있으므로 여기서 바로 못 적는다.
   */
  audit(outcome: CallOutcome, margin?: number): null;
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
  const menzen = read.menzen;
  const before = shantenOf(read.hand, read.meldCount, read.opts);

  /**
   * 이 콜 기회가 어디서 끝났는지 한 줄 남긴다 (`bot/callAudit.ts`).
   * 실대국에서는 `callAudit`이 없어 아무 일도 하지 않는다.
   */
  const audit = (outcome: CallOutcome, margin?: number): null => {
    read.callAudit?.record({
      outcome,
      canPon: callable.some((o) => o.type === "pon" || o.type === "minkan"),
      yakuhai: read.isYakuhai(called),
      shantenBefore: before,
      turn: read.turn,
      ...(margin === undefined ? {} : { margin }),
    });
    return null;
  };

  // 이미 멘젠 텐파이 — 열면 리치·멘젠쯔모·이빨 다 날아간다. 사람은 여기서 안 운다.
  if (menzen && read.tenpai) return audit("menzen_tenpai");

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
  if (plans.length === 0) return audit("no_shape");

  /**
   * 후보 여럿 중 **무엇을 부를 것인가.**
   *
   * 예전에는 여기가 고정된 정렬이었다 — 샹텐 → 우케이레 → 적도라. 즉 **속도만** 보고
   * 골랐고, 부른 뒤 손이 얼마짜리가 되는지는 선택에 아예 들어가지 않았다.
   * `decide.ts`가 "고정된 우선순위 사슬은 판단하지 않은 판단"이라고 적어 둔 그 형태가
   * 여기 남아 있었던 셈이다.
   *
   * 이게 왜 문제인가는 `bot/openTally.ts`의 첫 측정이 보여 준다 — 울고 난 손은
   * 멘젠 손의 절반 이하 값이다(3371 vs 6896). 속도로만 고르면 같은 기회에서
   * **더 싼 쪽**을 고르는 일이 생긴다(도라를 멘쯔에 묻는 치, 역이 싸지는 조합).
   *
   * 그래서 후보마다 EV를 내고 가장 큰 것을 고른다 — 봇의 다른 모든 판단과 같은 축이다.
   * 속도 정렬은 EV가 같을 때의 결정론적 순서로만 남는다.
   *
   * ## 재 봤더니 **중립이다** (2026-08-07 · `callValue` 스위치)
   *
   * 동풍전 1200배패(2400판) 2:2, 두 시드:
   *
   * | 시드 | 평균 순위 차 | 1인당 점수 차 |
   * |---|---|---|
   * | 기본 | +0.0067 ± 0.0028 (2.4σ) | +85 ± 45 |
   * | 987654321 | −0.0029 ± 0.0027 | −52 ± 51 |
   *
   * 후로율·화료율·방총률은 세 자리 다 소수점까지 같았다. 즉 **부르는 빈도는 그대로이고
   * 무엇을 부를지만 바뀐다.**
   *
   * 왜 중립인지는 **얼마나 자주 선택을 바꾸는지**를 세어 보면 안다. 같은 시드로
   * 동풍전 80배패를 EV 켜고/끄고 돌려 실제로 부른 조합을 줄줄이 비교했다:
   *
   * | | 횟수 |
   * |---|---|
   * | 실제로 부른 콜 | 990 |
   * | **조합이 달라짐** | **4 (0.4%)** |
   *
   * 판당 한 번도 안 걸린다. 2400판에서 순위가 안 움직이는 게 당연하다.
   *
   * ⚠️ 여기까지 오는 데 **계측을 두 번 틀렸다.** 처음엔 정렬이 뒤집힌 횟수를 셌는데
   * (613 기회 중 10) 그 자리는 역 게이트보다 앞이라 상당수가 그 뒤 `no_yaku`로
   * 잘렸다. 다음엔 최종 선택과 고정 정렬 승자를 비교했는데(15건) **전부 아래
   * `yakuhaiPon` 분기의 대명깡-펑 차이**였지 EV와 무관했다. 이 분기의 효과를 재려면
   * 같은 시드로 양쪽을 다 돌려 결과를 비교하는 수밖에 없다.
   *
   * 그래도 걷어내지 않은 이유는 **바뀌는 0.4%가 전부 명백히 옳은 쪽**이기 때문이다.
   * 예를 들어 5555s6789s로 7s를 받을 때 고정 정렬은 5s+6s를 집어 **안커를 깨뜨렸고**,
   * EV는 8s+9s를 집어 555s를 남긴다. 4m6m으로 받아 3m4m 량멘을 남기는 자리도 같다.
   * 드물게 틀리던 것을 드물게 고친다 — 판을 강하게 만들지는 않지만 마작으로서 옳다.
   *
   * 겸사겸사 **고정된 우선순위 사슬이 하나 사라진다** — `decide.ts`가 "판단하지 않은
   * 판단"이라 부르는 그 형태가 여기 남아 있었다.
   *
   * ⚠️ **방법론 — 이게 이 실험에서 얻은 제일 큰 것이다.** 첫 시드가 2.4σ 양수였다.
   * 그대로 채택했으면 아무것도 안 하는 변경을 "유의미하게 이득"으로 기록할 뻔했다.
   * 2400판의 2σ도 시드 하나로는 못 믿는다 — **A/B는 항상 시드 둘 이상으로 본다.**
   */
  plans.sort((a, b) => {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (b.ukeire !== a.ukeire) return b.ukeire - a.ukeire;
    if (a.spendsRed !== b.spendsRed) return a.spendsRed ? 1 : -1;
    return 0;
  });
  if (plans.length > 1) {
    /**
     * **전진하는 후보들 안에서만** EV로 다시 세운다.
     *
     * 전부를 EV로 세우면 `plans[0]`이 더 이상 '가장 빠른 것'이 아니게 되는데,
     * 바로 아래의 전진 게이트는 `plans[0]` 하나만 본다. 그러면 전진하는 후보가
     * 따로 있는데도 "전진 없음"으로 잘린다 — 정렬 기준을 바꾸면서 그 뒤의 판정이
     * 무엇을 전제하고 있었는지 함께 봐야 하는 자리다.
     */
    const advancing = plans.filter((p) => p.shanten < before);
    if (advancing.length > 1) {
      const scored = advancing.map((p) => ({
        p,
        // 그 후보로 갔을 때 확정되는 역 방향까지 반영해 값을 낸다
        ev: evOfCall(read, p, p.yaku ?? committed, profile),
      }));
      scored.sort((a, b) => b.ev - a.ev);
      const rest = plans.filter((p) => p.shanten >= before);
      plans.length = 0;
      for (const x of scored) plans.push(x.p);
      for (const p of rest) plans.push(p);
    }
  }

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
    if (best === undefined) return audit("no_shape");

    // 손이 전진하지 않는 콜은 부르지 않는다 (텐파이를 잡는 콜은 전진으로 친다)
    if (best.shanten >= before) return audit("no_progress");

    // 종반 형식텐파이 — 역이 없어도 텐파이면 노텐벌부를 피한다
    const lateTenpai = best.shanten === 0 && read.wallLeft <= 12;

    // 열린 손은 역이 없으면 텐파이해도 못 먹는다 — 값어치가 0인 길이다
    const found = best.yaku ?? (hasYakuhaiMeld ? ({ yaku: "yakuhai" } as const) : null);
    if (found === null && !lateTenpai) return audit("no_yaku");

    picked = best;
    plan = found ?? committed;
  }

  const value = evOfCall(read, picked, plan, profile);
  return {
    option: picked.option,
    value,
    plan,
    audit,
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
 *
 * ## 이 게이트를 넓히는 실험은 세 번 반박됐다
 *
 * 값어치 쪽(`bot/yaku.ts`)은 청일색·일통·삼색동순·찬타·준찬타까지 읽는데 이 게이트는
 * 넷만 안다. 그 어긋남이 #152 집계에서 "역 없음 36.6%"로 잡혔고, 그래서 게이트가
 * 그 읽기를 그대로 쓰게 해 봤다 (2026-08-06, 동풍전 400배패 = 800판, 2:2 정책 대전):
 *
 *     역 없음 34.6% → 29.8% · 구조적 거절 83.1% → 77.6%  (게이트는 실제로 열렸다)
 *     후로율 15.4% → 19.3%   화료율 18.9% → 18.7%   방총률 10.9% → 11.7%
 *     평균 순위 -0.0250 ± 0.0282 · 1인당 점수 -855 ± 550
 *
 * 게이트는 열렸고 후로율도 사람 쪽으로 갔는데 **판은 나빠졌다.** #136·#148의 쿠이탄
 * 완화와 정확히 같은 모양이다 — 세 번 다 더 울고 덜 이겼다.
 *
 * 그러니 봇의 낮은 후로율은 **아는 역이 적어서가 아니다.** 새로 통과시킨 콜은 EV에서
 * 대부분 다시 걸렸고(EV 판단 11.4% → 16.3%, 실제 콜은 5.4% → 6.0%뿐), 통과한 것들은
 * 손해였다. 역 읽기를 넓히는 일은 **값어치와 방향** 쪽에서 값을 하지 여기서는 아니다.
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

  /**
   * 탕야오 — 부른 패가 심플이고, 요구패를 흘려도 손이 남는가 (쿠이탄 허용 규칙).
   *
   * **이 `1`을 푸는 실험은 두 번 반박됐다. 세 번째를 하지 않기 위해 숫자를 남긴다.**
   *
   * #136이 처음 풀었을 때는 판의 효율로만 쟀다(유국 25.6→30.6%, 총 화료 74.4→69.4%).
   * 그때는 "게이트가 아니라 열린 손의 EV가 낙관적인 것이 원인"이라고 보고 되돌렸고,
   * 실제로 낙관 둘을 찾아 고쳤다 — 요구패까지 멘쯔로 세던 샹텐(`effectiveShape`,
   * #136)과 남의 버림패로 부르는 몫을 아예 안 세던 화료 확률(`callableUkeireTiles`,
   * #146). 브레이크가 게이트가 아니라 EV에 있어야 한다는 설계 그대로다.
   *
   * 둘 다 고쳐진 뒤 같은 게이트를 **강함으로** 다시 쟀다 (2026-08-06, 동풍전
   * 400배패 = 800판, 2:2 정책 대전. 요구패 허용 1장 → 3장):
   *
   *     후로율 15.0% → 25.3%   화료율 19.5% → 18.1%   방총률 11.1% → 11.9%
   *     평균 순위 차 -0.0450 ± 0.0399 · 1인당 점수 차 -1314 ± 754
   *
   * 후로율은 사람 범위(30~40%)에 가까워졌는데 **더 울고 덜 이겼다.** 두 지표 모두
   * 음수로 일관되고, 점수 차는 표준오차의 1.7배다. EV의 낙관을 걷어낸 뒤에도 결론이
   * 같다는 것은, 봇의 후로율이 낮은 이유가 **쿠이탄 문턱이 아니라는 뜻**이다.
   * 늘어난 콜은 요구패 두세 장을 안고 여는 손이고, 그런 손은 느리고 싸고 접지도
   * 못한다. 사람의 30~40%는 다른 데서 온다 — 역패·도라가 실린 손을 우는 쪽일 것이다.
   */
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

/**
 * 그 역이 손에 남기라고 요구하는 패의 조건 (제약이 없는 역은 null).
 *
 * 이게 있어야 `effectiveShape`가 **앞으로 버릴 패를 멘쯔로 세지 않는다**(#136).
 * 역을 새로 알아볼 때마다 여기도 같이 채워야 그 규율이 유지된다 — 안 채우면
 * 그 역으로 가는 콜만 옛날처럼 낙관적으로 값매겨진다.
 */
function keepFor(plan: HandPlan): ((k: TileKind) => boolean) | null {
  if (plan === null) return null;
  switch (plan.yaku) {
    case "tanyao":
      return isSimple;
    case "honitsu": {
      const suit = plan.suit;
      return (k) => !isNumber(k) || k.suit === suit;
    }
    case "chinitsu": {
      // 청일색은 자패도 못 쓴다
      const suit = plan.suit;
      return (k) => isNumber(k) && k.suit === suit;
    }
    case "chanta":
      // 찬타의 몸통에 4·5·6은 못 들어간다 (2·3·7·8은 슌쯔로 쓰인다)
      return (k) => !isNumber(k) || k.rank < 4 || k.rank > 6;
    case "junchan":
      // 준찬타는 자패까지 뺀다
      return (k) => isNumber(k) && (k.rank < 4 || k.rank > 6);
    default:
      return null;
  }
}

/** 이미 친 후로(치)가 있는가 — 토이토이 판단용 */
function hasSequenceMeld(read: BotRead, _meldKinds: readonly TileKind[]): boolean {
  return (read.view.round.byPlayer[read.me]?.melds ?? []).some((m) => m.kind === "chi");
}
