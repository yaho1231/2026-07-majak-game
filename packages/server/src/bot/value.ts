/**
 * value — "이 손은 얼마짜리인가", 그리고 "이길 확률은 얼마인가".
 *
 * 예전 봇의 모든 판단은 **단위가 없는 점수**로 이루어졌다. 버림은
 * `push * efficiency + fold * safety * 14`, 리치는 `handDora >= 3`, 후로는 샹텐 비교.
 * 상수 14와 3은 어디서 나온 값이 아니라 손으로 맞춘 값이라, 서로 다른 판단을 비교할
 * 수도 없고("이 깡이 저 후로보다 이득인가?") 새 상황이 생기면 또 상수를 늘려야 했다.
 *
 * 사람은 그렇게 세지 않는다. 사람이 세는 단위는 **점수 하나**다.
 *   "이 리치는 8000점짜리고 오름패가 6장 남았으니 절반쯤 먹는다.
 *    저 리치에 이 패를 던지면 6% 확률로 7700점을 준다. 밀 만하다."
 *
 * 이 파일은 그 두 값을 낸다.
 *   - `estimateHandValue` — 지금 손이 화료하면 몇 점인가 (판수 추정 → 코어 점수표)
 *   - `winChance`         — 남은 순목 안에 이 손이 화료할 확률
 *
 * 둘을 곱하면 **기대 획득 점수**가 나오고, 위험 쪽(`danger.ts`의 기대 실점)과 같은
 * 단위로 비교할 수 있다. 이후의 모든 판단(밀기/접기·리치·후로·깡·증강)은 이 축 하나
 * 위에서 이루어진다 — 새 판단을 붙일 때 새 상수를 만들 필요가 없다.
 *
 * 정확도보다 **일관성**이 목적이다. 여기 나오는 값은 실제 확률의 근사이지만, 모든
 * 판단이 같은 근사를 쓰므로 비교는 옳게 된다.
 */

import { calculateScore } from "@majak/core";
import type { TileKind } from "@majak/core";
import type { HandPlan } from "./read.js";
import { bestYakuHan } from "./yaku.js";

/** 손 하나의 값어치 추정 */
export interface HandValue {
  /** 예상 판수 (도라·적도라 포함, 화료 시) */
  han: number;
  /** 예상 부수 */
  fu: number;
  /** 이 손으로 론했을 때 받는 점수 (오야 보정 포함) */
  points: number;
  /** 리치를 걸었을 때의 예상 점수 — 다마텐과 비교하는 값 */
  riichiPoints: number;
}

/**
 * 리치가 얹어 주는 기대 판수.
 *
 * 리치 1판은 확정이고, 나머지는 확률적으로 붙는다 — 일발 ≈ 0.25판, 우라도라 ≈ 0.55판,
 * 멘젠쯔모 ≈ 0.4판(화료의 약 40%가 쯔모). 통계적으로 "리치는 약 2판"이라고 부르는 값이다.
 */
const RIICHI_HAN = 2.2;

/** 역을 못 찾은 멘젠 손에 얹는 기본 판수 (핑후·탕야오·이페코 중 하나는 대개 붙는다) */
const MENZEN_BASE_HAN = 1;

/**
 * 노리는 역이 주는 판수. 열린 손은 한 판 깎이는 역(혼일색·준찬타 계열)이 있으므로
 * 멘젠/열린 손을 나눠 센다.
 */
function planHan(plan: HandPlan, menzen: boolean): number {
  if (plan === null) return menzen ? MENZEN_BASE_HAN : 0;
  switch (plan.yaku) {
    case "yakuhai":
      return 1;
    case "tanyao":
      return 1;
    case "honitsu":
      return menzen ? 3 : 2;
    case "toitoi":
      // 토이토이 2판 + 대개 따라오는 삼암각·역패로 실질 3판 근처
      return menzen ? 3 : 2;
  }
}

/** 역없는 열린 손에 남기는 잔값 — 화료가 사실상 막혔다는 뜻 */
const YAKULESS_OPEN = 0.15;

/** 토이토이·자패 커쯔가 많은 손은 부수가 높다 — 만관 경계를 가르는 값이라 무시할 수 없다 */
function estimateFu(plan: HandPlan, menzen: boolean): number {
  if (plan !== null && plan.yaku === "toitoi") return 40;
  return menzen ? 30 : 30;
}

/**
 * **기대 판수**를 점수로 옮긴다 — 반올림하지 않고 두 정수 판수 사이를 보간한다.
 *
 * 판수는 확률 분포다. "기대 4.6판"은 4판일 때도 5판일 때도 있다는 뜻인데, 5로
 * 반올림하면 만관(8000)으로 세고 4로 내리면 7700으로 센다. 만관·하네만 경계에서
 * 이 차이가 그대로 판단을 뒤집는다 — 도라 한 장이 우연히 경계를 넘느냐에 따라 봇이
 * 리치를 걸었다 말았다 한다. 사람은 그 경계에서 그렇게 요동치지 않는다.
 *
 * 보간하면 값이 판수에 대해 **연속**이 되어, 조금 좋아진 손은 조금 더 비싸진다.
 */
export function pointsForHan(han: number, fu: number, isDealer: boolean): number {
  const lo = Math.max(1, Math.floor(han));
  const t = Math.max(0, Math.min(1, han - lo));
  const at = (h: number): number =>
    calculateScore({ han: h, fu, isDealer, winType: "ron" }).total;
  return at(lo) * (1 - t) + at(lo + 1) * t;
}

export interface HandValueInput {
  /** 손 전체(후로 포함)의 도라 + 적도라 수 */
  handDora: number;
  /** 후로 수 (0이면 멘젠) */
  meldCount: number;
  /** 이 국에 노리는 역 방향 */
  plan: HandPlan;
  /** 내가 오야인가 */
  isDealer: boolean;
  /** 이미 리치를 선언했는가 — 그러면 points에 리치 판수가 이미 들어간다 */
  riichiDeclared: boolean;
  /**
   * 손 전체(손패 + 후로)의 패. 주면 **역을 직접 읽어** 판수를 잡는다
   * (`bot/yaku.ts`) — 청일색·치또이·일통·산색·찬타처럼 `plan`이 모르는 역들이다.
   * 안 주면 예전처럼 `plan`이 아는 네 역만 센다.
   */
  kinds?: readonly TileKind[];
}

/**
 * 지금 손이 화료하면 몇 점인가.
 *
 * 판수 = 도라 + 노리는 역 + (리치) → 코어 점수표(`calculateScore`)로 점수를 낸다.
 * 코어를 쓰는 이유는 만관·하네만 경계와 오야 1.5배가 실제 게임과 **정확히 같아야**
 * 하기 때문이다. 손으로 만든 표는 규칙이 바뀌면 조용히 어긋난다.
 */
export function estimateHandValue(input: HandValueInput): HandValue {
  const menzen = input.meldCount === 0;
  // 방향(`plan`)이 아는 역과, 손을 직접 읽어 찾은 역 중 **비싼 쪽**을 쓴다.
  // 방향은 "무엇을 버릴까"의 기준이라 좁게 잡혀 있고, 그래서 청일색·치또이처럼
  // 방향이 모르는 비싼 역을 놓친다 — 그걸 여기서 메운다.
  const fromPlan = planHan(input.plan, menzen);
  const fromHand = input.kinds === undefined ? 0 : bestYakuHan(input.kinds, menzen);
  const base = input.handDora + Math.max(fromPlan, fromHand);
  const fu = estimateFu(input.plan, menzen);

  const withRiichi = menzen ? base + RIICHI_HAN : base;
  const han = input.riichiDeclared ? withRiichi : base;

  /**
   * 열린 손은 **역이 없으면 텐파이해도 화료할 수 없다.** 점수표는 판수 0을 1로
   * 올려 세므로(1판 미만이라는 점수가 없다) 그냥 두면 역없는 열린 손이 1판짜리
   * 멘젠 손과 같은 값으로 잡힌다 — 울어서 손을 망치는 판단이 여기서 나온다.
   * 완전히 0으로 두지는 않는다: 남은 쯔모로 탕야오가 붙거나 해저가 걸리는 길이
   * 닫힌 것은 아니라, 아주 낮은 잔값만 남긴다.
   */
  const yakuless = !menzen && Math.max(fromPlan, fromHand) === 0;
  const score = (h: number): number =>
    pointsForHan(h, fu, input.isDealer) * (yakuless ? YAKULESS_OPEN : 1);

  return {
    han,
    fu,
    points: score(han),
    riichiPoints: score(withRiichi),
  };
}

// ─────────────────────────── 화료 확률 ───────────────────────────

/**
 * 보이지 않는 곳에 남은 패의 총량 — 확률의 분모.
 * 패산 + 상대 셋의 손패(각 13장). 정확히는 왕패도 있지만 그건 뽑히지 않으므로
 * "내가 만날 수 있는 패"라는 뜻에서는 이 근사가 맞다.
 */
function unseenTiles(wallLeft: number): number {
  return Math.max(1, wallLeft + 13 * 3);
}

/** 한 국은 대개 18순 근처에서 끝난다 (패산 70장 ÷ 4) */
const TURNS_PER_ROUND = 18;

/**
 * 내 남은 쯔모 횟수.
 *
 * 넷이 한 번씩 돌아가므로 패산의 1/4이지만, **순목(`turnCount`)도 함께 본다.**
 * 깡·증강으로 패산이 늘거나 뷰가 패산을 정확히 못 실어 줄 때, 패산만 믿으면
 * 12순째에도 "아직 15번 뽑는다"고 착각해 가망 없는 손을 계속 민다.
 * 둘 중 작은 쪽이 현실이다.
 */
function myDrawsLeft(wallLeft: number, turn: number): number {
  return Math.max(0, Math.min(Math.floor(wallLeft / 4), TURNS_PER_ROUND - turn));
}

/**
 * 한 순에 대기패를 만날 확률에 곱하는 배수.
 *
 * 내 쯔모 1장 외에 **상대 셋의 버림패로도 론**이 되므로 기회는 1장이 아니다.
 * 다만 상대가 위험패를 그대로 흘려 줄 확률은 1이 아니고(특히 리치 후에는 낮다),
 * 대기패 중 일부는 남이 안고 죽는다. 통계적으로 쯔모 대비 2배 남짓이 관측된다.
 */
const RON_MULTIPLIER = 2.2;

/**
 * 상대가 나보다 먼저 화료하거나 유국으로 끝나 내 텐파이가 무산되는 몫.
 * 4인 중 하나가 이기는 게임이라, 아무리 좋은 텐파이도 100%가 되지 않는다.
 */
const RACE_FACTOR = 0.78;

export interface WinChanceInput {
  /** 0=텐파이 */
  shanten: number;
  /** 텐파이일 때 오름패의 남은 장수 합 */
  waitTiles: number;
  /** 우케이레(샹텐을 줄이는 패)의 남은 장수 합 — 노텐일 때 쓴다 */
  ukeireTiles: number;
  /** 패산 잔량 */
  wallLeft: number;
  /** 이번 국의 순목 */
  turn: number;
  /** 후리텐이면 론이 없다 — 쯔모만 남는다 */
  furiten: boolean;
}

/**
 * 시간이 다 됐을 때의 **바닥값**.
 *
 * 확률을 0으로 딱 잘라 버리면 가망 없는 손에서 봇의 판단 근거가 통째로 사라진다 —
 * 모든 후보의 기대 획득이 정확히 0이 되어 어느 패를 버릴지 고를 수 없게 된다
 * (실제로 그러면 배열 마지막 패를 기계적으로 흘린다). 사람은 가망이 없어도 여전히
 * "그나마 나은" 형태를 남긴다. 그래서 0 대신 **아주 작지만 순서가 살아 있는 값**을
 * 준다 — 위험 앞에서는 무시될 만큼 작고, 위험이 없을 때는 유일한 기준이 된다.
 */
function hopelessFloor(ukeireTiles: number): number {
  return 0.004 * Math.min(1, ukeireTiles / 40);
}

/**
 * 남은 순목 안에 이 손이 화료할 확률 (0~1).
 *
 * 텐파이는 "매 순 대기패를 만날 확률"의 여사건을 순목만큼 곱해서 낸다.
 * 노텐은 먼저 **텐파이까지 걸리는 기대 순목**을 우케이레로 재고, 남은 순목에
 * 평균적인 대기(6장)로 텐파이 확률식을 다시 적용한다.
 *
 * 실측 감각과 맞춰 둔 기준점:
 *   - 6순째 량면(8장) 텐파이 → 약 50%
 *   - 12순째 칸짱(4장) 텐파이 → 약 20%
 *   - 6순째 1샹텐(우케이레 16장) → 약 30%
 * 절대값이 몇 %인지보다 **상황 간의 비율**이 맞는 것이 중요하다 — 판단은 비교로 난다.
 */
export function winChance(input: WinChanceInput): number {
  const draws = myDrawsLeft(input.wallLeft, input.turn);
  const unseen = unseenTiles(input.wallLeft);
  // 후리텐은 론이 막힌다 — 기회가 쯔모 1장으로 줄어든다
  const chances = input.furiten ? 1 : RON_MULTIPLIER;

  if (input.shanten <= 0) {
    if (input.waitTiles <= 0) return 0; // 죽은 대기 — 시간이 남아도 오를 패가 없다
    if (draws <= 0) return hopelessFloor(input.waitTiles);
    const perTurn = Math.min(0.9, (input.waitTiles / unseen) * chances);
    return (1 - (1 - perTurn) ** draws) * RACE_FACTOR;
  }

  // 노텐: 텐파이까지 몇 순 걸리는가.
  // 샹텐 한 단계를 줄이는 데 (분모/우케이레) 순 걸리고, 손이 자라면서 우케이레도
  // 넓어지므로 0.75를 곱해 낙관 보정한다.
  const ukeire = Math.max(1, input.ukeireTiles);
  const turnsPerStep = (unseen / ukeire) * 0.75;
  const remain = draws - turnsPerStep * input.shanten;
  if (remain <= 0) return hopelessFloor(input.ukeireTiles);

  // 텐파이 후의 대기는 평균 6장으로 본다 (량면 8 · 칸짱 4의 가운데)
  const perTurn = Math.min(0.9, (6 / unseen) * chances);
  return (1 - (1 - perTurn) ** remain) * RACE_FACTOR;
}

/**
 * 이 국에서 노텐으로 끝날 때 잃는 점수의 기대값 (노텐벌부).
 * 종반에 "형식텐파이라도 잡을까"를 점수로 판단하려면 이 값이 필요하다.
 * 4인 노텐벌부는 텐파이 인원에 따라 1000~3000점이고, 평균 1500점 근처다.
 */
export const NOTEN_PENALTY = 1500;

/** 오름패의 남은 장수 합 */
export function waitTilesOf(
  waits: readonly TileKind[],
  remainingOf: (k: TileKind) => number,
): number {
  let n = 0;
  for (const w of waits) n += remainingOf(w);
  return n;
}
