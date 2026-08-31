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

import { calculateScore, kindKey } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import type { HandPlan } from "./read.js";
import { bestYakuHan, hanOf } from "./yaku.js";

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

/** 위 2.2판에 섞여 있는 **뒷도라의 기대 판수** — 실제로 본 값으로 갈아 끼울 때 뺀다 */
const EXPECTED_URA_HAN = 0.55;

/** 역을 못 찾은 멘젠 손에 얹는 기본 판수 (핑후·탕야오·이페코 중 하나는 대개 붙는다) */
const MENZEN_BASE_HAN = 1;

/**
 * 노리는 역이 주는 판수 — 표는 `bot/yaku.ts`의 `hanOf` 하나뿐이다.
 * 예전에는 여기와 `yaku.ts`가 각자 숫자를 들고 있어 조용히 어긋날 수 있었다.
 */
function planHan(plan: HandPlan, menzen: boolean): number {
  if (plan === null) return menzen ? MENZEN_BASE_HAN : 0;
  return hanOf(plan.yaku, menzen);
}

/** 역없는 열린 손에 남기는 잔값 — 화료가 사실상 막혔다는 뜻 */
const YAKULESS_OPEN = 0.15;

/**
 * 이 손의 예상 부수.
 *
 * **예전에는 두 갈래가 같은 값이었다**(`menzen ? 30 : 30`) — 즉 분기가 죽어 있었고,
 * 토이토이가 아닌 모든 손이 멘젠·후로를 가리지 않고 30부로 값매겨졌다. 30부와 40부는
 * 4판에서 7700과 8000(만관)을 가르는 자리라 그냥 두면 만관 경계 판단이 통째로 한쪽으로
 * 기운다.
 *
 * 값은 **연속 평균**으로 잡는다 — 이 파일이 판수를 반올림하지 않고 보간하는 것과 같은
 * 이유다(`pointsForHan` 주석). 실제 부수는 분포이고, 판단은 그 분포의 기대값 위에서
 * 내려야 경계에서 요동치지 않는다. `calculateScore`는 부수를 그대로 곱하므로
 * 30·40 같은 표의 눈금이 아니어도 계산이 성립한다.
 *
 *   - 멘젠 론은 +10부가 확정으로 붙는다. 핑후(30부)가 대략 3분의 1이므로
 *     0.33×30 + 0.67×40 ≈ **36**.
 *   - 열린 손은 멘젠 보너스가 없고 대개 슌쯔 중심이라 **30**.
 *   - 토이토이는 커쯔가 넷이라 **40** 이상이 보통이다(종전 그대로).
 */
function estimateFu(plan: HandPlan, menzen: boolean, menzenFu: boolean): number {
  if (plan !== null && plan.yaku === "toitoi") return 40;
  return menzen && menzenFu ? MENZEN_FU : OPEN_FU;
}

/** 멘젠 손의 평균 부수 — 멘젠 론 +10부가 붙고, 셋 중 하나쯤은 핑후(30부)다 */
const MENZEN_FU = 36;
/** 열린 손의 평균 부수 — 멘젠 보너스가 없다 */
const OPEN_FU = 30;

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
  /** 후로 수 (샹텐·역 판정용) */
  meldCount: number;
  /**
   * **점수상 멘젠인가.** 생략하면 `meldCount === 0`으로 본다.
   *
   * 둘을 나눠 놓은 이유는 **안깡** 때문이다. 안깡은 샹텐 계산에서 멘쯔 하나로
   * 세지만 손을 열지 않는다 — 리치도 걸 수 있고 멘젠쯔모·우라도라도 그대로다.
   * 예전에는 `meldCount === 0` 하나가 둘을 겸했기 때문에, 안깡을 친 순간 봇의
   * 손이 '열린 손'이 되어 리치 판수(2.2판)가 통째로 날아가고, 역을 못 찾으면
   * 역없는 열린 손 취급(`YAKULESS_OPEN` = 값의 15%)까지 받았다.
   */
  menzen?: boolean;
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
  /**
   * **증강이 바꾼 화료형 규칙** (`view.scoringOptions`).
   *
   * 샹텐·대기는 이미 이 옵션을 그대로 코어에 넘겨 계산한다(`read.ts`). 값어치만
   * 안 넘기고 있어서, 봇은 **증강이 넓혀 준 모양으로 텐파이인 것은 알면서 값은
   * 평범한 규칙으로 매겼다.** 여기서는 역 읽기(`bot/yaku.ts`)에 넘겨, 무늬가 섞인
   * 커쯔·쌍을 그 규칙대로 세게 한다. 생략하면 평범한 마작 그대로다.
   */
  opts?: DecomposeOptions;
  /**
   * 내가 든 **상시 증강**이 이 손의 값어치에 거는 배수 (`augmentValueMultiplier`).
   *
   * 생략하면 1(증강 없는 손). 판수가 아니라 **점수에** 곱한다 — 표의 값은
   * "평범한 손 대비 기대 타점이 몇 배인가"라서 판수 축이 아니라 점수 축의 값이다.
   */
  augmentMultiplier?: number;
  /**
   * **역이 없어도 화료할 수 있는가** (무형화료 `yakuless_win` 등이 `win.requiresYaku`를 끈다).
   *
   * 열린 손에 걸리는 `YAKULESS_OPEN`(값의 15%)은 "역이 없으면 텐파이해도 못 먹는다"는
   * 규칙에서 나온 값이다. 그 규칙을 지우는 증강을 든 봇에게 그대로 걸면, **그 증강이
   * 열어 주려던 바로 그 후로들이 전부 실제 값의 15%로 값매겨져** 봇이 체계적으로
   * 거절한다 — 증강을 뽑고도 없는 것처럼 논다. 켜지면 잔값 감액을 걸지 않는다.
   */
  noYakuRequired?: boolean;
  /**
   * **열린 손으로도 리치를 걸 수 있는가**, 걸면 리치가 몇 판인가 (개문선언 `open_riichi`).
   *
   * `riichiPoints`는 지금까지 `menzen ? base + RIICHI_HAN : base`였다 — 열린 손의
   * 리치를 **0판**으로 셌다는 뜻이라, 개문선언 보유자의 리치 입찰은 언제나 평범한
   * 버림에 진다. 값을 주면 그 판단이 비로소 열린다. 생략하면 종전대로(열린 손 리치 없음).
   */
  openRiichiHan?: number;
  /**
   * **멘젠 부수 분리를 켠다** (`menzenfu` 스위치 — 측정용 비계).
   *
   * 켜면 멘젠 손이 36부, 끄면 종전대로 멘젠·후로 모두 30부다. 켜는 쪽이 마작으로서
   * 옳지만(멘젠 론 +10부), 값어치가 20% 오르는 변경이라 **후로 판단이 뒤집힌다** —
   * 실제로 "역패 또이쯔는 펑한다"가 835 대 814(2.6% 차)로 아슬아슬하게 서 있었고,
   * 부수를 올리면 패스가 이긴다. 그래서 기본을 종전으로 두고 2:2로 재는 자리를 만든다.
   */
  menzenFu?: boolean;
  /**
   * **이면투시로 실제로 세어 본 뒷도라 장수** (`bot/intel.ts`).
   *
   * `RIICHI_HAN` 2.2판 안에는 뒷도라의 **기대값** 0.55판이 이미 섞여 있다. 표시패를
   * 직접 본 국에는 그 기대값을 빼고 **본 값**을 넣는다 — 그것이 이 카드가 파는
   * 것이고("리치를 걸지 다마로 갈지"), 봇은 여태 그 숫자를 한 번도 안 봤다.
   * 생략하면 종전대로 기대값만 쓴다.
   */
  uraDora?: number | undefined;
}

/**
 * 지금 손이 화료하면 몇 점인가.
 *
 * 판수 = 도라 + 노리는 역 + (리치) → 코어 점수표(`calculateScore`)로 점수를 낸다.
 * 코어를 쓰는 이유는 만관·하네만 경계와 오야 1.5배가 실제 게임과 **정확히 같아야**
 * 하기 때문이다. 손으로 만든 표는 규칙이 바뀌면 조용히 어긋난다.
 */
export function estimateHandValue(input: HandValueInput): HandValue {
  const menzen = input.menzen ?? input.meldCount === 0;
  // 방향(`plan`)이 아는 역과, 손을 직접 읽어 찾은 역 중 **비싼 쪽**을 쓴다.
  // 방향은 "무엇을 버릴까"의 기준이라 좁게 잡혀 있고, 그래서 청일색·치또이처럼
  // 방향이 모르는 비싼 역을 놓친다 — 그걸 여기서 메운다.
  const fromPlan = planHan(input.plan, menzen);
  const fromHand =
    input.kinds === undefined ? 0 : bestYakuHan(input.kinds, menzen, input.opts);
  const base = input.handDora + Math.max(fromPlan, fromHand);
  const fu = estimateFu(input.plan, menzen, input.menzenFu === true);

  /**
   * 리치가 얹는 판수. 열린 손은 원래 리치를 걸 수 없어 0이지만, **개문선언**을 들면
   * 걸 수 있고 그 리치는 판수도 붙는다(`openRiichiHan`). 열린 손에는 멘젠쯔모가 없어
   * 멘젠의 2.2판을 그대로 쓰지 않고 증강이 정한 확정 판수(2판)를 쓴다 — 일발·뒷도라는
   * 열린 손에서도 붙지만(리치 선언만으로 정해지는 것들이다) 기대값이라 여기 안 센다.
   */
  const riichiHan = menzen ? RIICHI_HAN : (input.openRiichiHan ?? 0);
  // 뒷도라를 실제로 봤으면 기대값을 그 값으로 갈아 끼운다 (열린 손에는 리치 판수가
  // 확정값이라 기대 뒷도라가 안 섞여 있으므로 멘젠일 때만 바꾼다)
  const uraAdjust =
    menzen && input.uraDora !== undefined ? input.uraDora - EXPECTED_URA_HAN : 0;
  const withRiichi = base + riichiHan + uraAdjust;
  const han = input.riichiDeclared ? withRiichi : base;

  /**
   * 열린 손은 **역이 없으면 텐파이해도 화료할 수 없다.** 점수표는 판수 0을 1로
   * 올려 세므로(1판 미만이라는 점수가 없다) 그냥 두면 역없는 열린 손이 1판짜리
   * 멘젠 손과 같은 값으로 잡힌다 — 울어서 손을 망치는 판단이 여기서 나온다.
   * 완전히 0으로 두지는 않는다: 남은 쯔모로 탕야오가 붙거나 해저가 걸리는 길이
   * 닫힌 것은 아니라, 아주 낮은 잔값만 남긴다.
   */
  const yakuless =
    !menzen && Math.max(fromPlan, fromHand) === 0 && input.noYakuRequired !== true;
  /**
   * 증강 배수는 **맨 마지막에** 곱한다 — 만관·하네만 경계를 넘겨 세지 않기 위해서다.
   * 판수에 얹으면 배수 1.3이 경계에서 두 배가 되기도 하고 아무 일도 아니기도 한다.
   * 표가 말하는 것은 "기대 타점이 몇 배"이므로 점수에 곱하는 것이 그 뜻 그대로다.
   */
  const augMult = input.augmentMultiplier ?? 1;
  const score = (h: number): number =>
    pointsForHan(h, fu, input.isDealer) * (yakuless ? YAKULESS_OPEN : 1) * augMult;

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
 * 표준 길이를 넘긴 구간에서 인정하는 최대 쯔모 수.
 *
 * 패산이 남아 있다는 사실만 믿고 "아직 열 번 뽑는다"고 세면 종반에 가망 없는 손을
 * 끝없이 민다. 그렇다고 0으로 두면 아래 주석의 붕괴가 일어난다 — 사이를 잡는다.
 */
const EXTENDED_DRAWS = 4;

/**
 * 내 남은 쯔모 횟수.
 *
 * 넷이 한 번씩 돌아가므로 패산의 1/4이지만, **순목(`turnCount`)도 함께 본다.**
 * 뷰가 패산을 정확히 못 실어 줄 때(zone이 없으면 `wallLeftOf`가 70으로 폴백한다)
 * 패산만 믿으면 12순째에도 "아직 15번 뽑는다"고 착각해 가망 없는 손을 계속 민다.
 *
 * **그런데 예전 식은 18순을 넘기면 항상 정확히 0을 돌려줬다** —
 * `min(패산/4, 18 − 순목)`의 오른쪽이 음수가 되기 때문이다. 바로 위 주석이 "깡·증강으로
 * 패산이 늘 수 있다"고 적어 놓고, 정작 그 늘어난 몫을 `min`이 통째로 버리고 있었다.
 * 그러면 `winChance`가 절망 바닥값(≈0.004)으로 무너져 **연장된 구간 내내 봇이 아무것도
 * 밀지 않는다** — 패산이 20장 남은 텐파이를 들고도 안전패만 흘린다.
 *
 * 그래서 순목 상한은 그대로 두되, **그 상한이 다 떨어진 뒤에는 패산이 말하게 한다.**
 * 표준 18순 안에서는 계산이 예전과 한 글자도 다르지 않고(회귀 없음), 넘어간 뒤에만
 * 0 대신 패산이 허락하는 만큼(상한 `EXTENDED_DRAWS`)을 인정한다.
 */
function myDrawsLeft(wallLeft: number, turn: number): number {
  const fromWall = Math.max(0, Math.floor(wallLeft / 4));
  const fromTurn = TURNS_PER_ROUND - turn;
  if (fromTurn > 0) return Math.min(fromWall, fromTurn);
  // 표준 길이를 넘겼다 — 여기서 0을 주면 남은 패산이 있어도 판단이 통째로 죽는다
  return Math.min(fromWall, EXTENDED_DRAWS);
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
  /**
   * **열린 손의 실효 우케이레** (`callableUkeireTiles`). 주면 노텐 구간의 전진
   * 속도를 이 값으로 잰다 — 열린 손은 내 쯔모만 기다리지 않기 때문이다.
   * 닫힌 손에서는 주지 않는다(그 손은 실제로 쯔모만 기다린다).
   */
  openUkeire?: number | undefined;
  /**
   * **확정된 내 다음 쯔모들**이 이 손에 무엇을 하는가 (`bot/intel.ts` — 삼세 예지·예지).
   *
   * 정보 증강이 없으면 `undefined`라 아래 식은 종전과 한 글자도 다르지 않다.
   */
  known?: KnownDrawEffect | undefined;
}

/**
 * 확정 쯔모가 지금 손에 무엇을 하는가 — 확률식이 쓸 수 있는 모양으로 줄인 것.
 *
 * 채널이 주는 것은 «종류 목록»이지만 확률에 필요한 것은 셋뿐이다: 오름패가 **몇
 * 번째**로 오는가, 전진하는 장이 몇 장인가, 확실히 헛도는 장이 몇 장인가.
 */
export interface KnownDrawEffect {
  /** 확정 쯔모 중 오름패가 오는 순번 (1 = 바로 다음 쯔모). 없으면 null */
  hitAt: number | null;
  /** 확정 쯔모 중 샹텐을 줄이는 장수 */
  advances: number;
  /** 확정 쯔모 중 이 손에 아무 쓸모 없는 장수 */
  misses: number;
}

/**
 * **확정 헛쯔모 한 장이 잃는 전진**. 한 순 전부가 아니라 반 순으로 본다 —
 * 그 순에도 원래 우케이레를 만날 기대는 1보다 훨씬 작았기 때문이다(기대 손실은
 * 한 순어치가 아니라 «한 순 × 명중률»에 가깝다). 반올림한 보수적인 값이다.
 */
const KNOWN_MISS_COST = 0.5;

/**
 * **확정 오름패가 눈앞에 있을 때** 남는 위험은 하나뿐이다 — 그 순이 오기 전에
 * 남이 끝내는 것. 국 전체에 걸리는 `RACE_FACTOR`를 그 몇 순 몫으로 나눠 쓴다.
 */
function certainDrawChance(hitAt: number, draws: number): number {
  const share = Math.min(1, hitAt / Math.max(1, draws));
  return Math.min(0.95, 1 - (1 - RACE_FACTOR) * share);
}

// ─────────────────────────── 열린 손의 전진 속도 ───────────────────────────

/**
 * 부를 수 있는 우케이레에 곱하는 배수 — 대기의 `RON_MULTIPLIER`와 **같은 근거**다.
 *
 * 펑은 상대 셋 누구의 버림패로도 부를 수 있으므로 기회가 내 쯔모 1장이 아니다.
 * 다만 상대가 그 패를 그대로 흘려 줄 확률은 1이 아니라(자기 손에 쓰거나 위험을 읽고
 * 안고 죽는다) 3배가 아니라 1.2배쯤 얹힌다 — 론에서 관측된 것과 같은 할인이다.
 */
const PON_REACH = RON_MULTIPLIER;

/** 치는 상가(上家) 한 명한테서만 부른다 — 펑이 얹는 몫의 1/3 */
const CHI_REACH = 1 + (RON_MULTIPLIER - 1) / 3;

const NUMBER_SUITS = new Set(["man", "pin", "sou"]);

/**
 * 열린 손이 **실제로 만날 수 있는** 우케이레 장수.
 *
 * `winChance`의 노텐 구간은 "샹텐 한 단계에 몇 순 걸리는가"를 우케이레 장수만으로
 * 재는데, 그 식은 **내 쯔모만** 센다. 닫힌 손에는 맞지만 열린 손에는 틀리다 —
 * 열린 손은 남의 버림패를 펑·치로 가져와 턴을 쓰지 않고 전진한다. 그래서 지금까지
 * 봇은 후로한 손(과 후로하려는 손)의 속도를 **체계적으로 낮게** 봤고, 후로 EV가
 * 패스 EV에 지는 일이 잦았다(실측 후로율 7~17% vs 사람 30~40%).
 *
 * 여기서는 우케이레 한 종류씩 "이건 부를 수 있는가"를 보고 장수에 배수를 곱한다.
 * 또이쯔를 이루고 있는 패는 펑으로(셋 다), 슌쯔가 될 패는 치로(상가만) 부를 수 있다.
 * 부를 수 없는 패(머리를 갈아 끼우는 단독패 등)는 배수 1 — 그건 정말로 쯔모뿐이다.
 *
 * ## 재 본 결과 (2026-08-06, 동풍전 400배패 = 800판, 2:2 정책 대전)
 *
 *     후로율 12.6% → 16.0%   화료율 18.3% → 18.9%   방총률 10.8% → 11.2%
 *     평균 순위 차 +0.0063 ± 0.0341 → **유의미하지 않음**
 *
 * 강해졌다고는 못 한다. 확인한 것은 **손해가 없다**는 것과, 후로율이 사람 쪽으로
 * 3.4%p 움직였다는 것이다. 여전히 사람(30~40%)에는 크게 못 미치므로 남은 거리는
 * 이 추정이 아니라 `call.ts`의 구조적 문턱(역 요구·샹텐 감소 요구)에 있다 —
 * 다만 #136에서 배웠듯 그 문턱을 그냥 풀면 판이 나빠진다. 다음 실험의 자리다.
 */
export function callableUkeireTiles(
  hand: readonly TileKind[],
  ukeire: readonly TileKind[],
  remainingOf: (kind: TileKind) => number,
): number {
  const counts = new Map<string, number>();
  for (const k of hand) counts.set(kindKey(k), (counts.get(kindKey(k)) ?? 0) + 1);
  const has = (suit: string, rank: number): boolean =>
    (counts.get(kindKey({ suit, rank })) ?? 0) > 0;

  let total = 0;
  for (const k of ukeire) {
    const left = remainingOf(k);
    if (left <= 0) continue;
    // 또이쯔를 들고 있으면 그 패는 펑으로 부를 수 있다
    if ((counts.get(kindKey(k)) ?? 0) >= 2) {
      total += left * PON_REACH;
      continue;
    }
    const r = k.rank;
    const chiable =
      NUMBER_SUITS.has(k.suit) &&
      ((has(k.suit, r - 2) && has(k.suit, r - 1)) ||
        (has(k.suit, r - 1) && has(k.suit, r + 1)) ||
        (has(k.suit, r + 1) && has(k.suit, r + 2)));
    total += left * (chiable ? CHI_REACH : 1);
  }
  return total;
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
    /*
     * **오름패가 오는 것을 이미 봤다.** 확률을 다시 셀 이유가 없다 — 남은 위험은
     * "그 순이 오기 전에 남이 끝내는가" 하나다. 이것이 삼세 예지·예지를 든 봇이
     * 위험패를 안고도 밀어야 하는 이유이고, 여태 그 판단이 없었다(A-14).
     */
    const hitAt = input.known?.hitAt ?? null;
    if (hitAt !== null && hitAt <= draws) return certainDrawChance(hitAt, draws);
    /*
     * 반대로 **확정 헛쯔모**는 그 순의 쯔모 몫을 지운다. 론은 그대로 살아 있으므로
     * (남이 버려 주는 길) 기회 전체가 사라지지는 않는다.
     */
    const misses = Math.min(input.known?.misses ?? 0, draws);
    if (misses > 0) {
      const ronOnly = Math.min(0.9, (input.waitTiles / unseen) * Math.max(0, chances - 1));
      const survive = (1 - ronOnly) ** misses * (1 - perTurn) ** (draws - misses);
      return (1 - survive) * RACE_FACTOR;
    }
    return (1 - (1 - perTurn) ** draws) * RACE_FACTOR;
  }

  // 노텐: 텐파이까지 몇 순 걸리는가.
  // 샹텐 한 단계를 줄이는 데 (분모/우케이레) 순 걸리고, 손이 자라면서 우케이레도
  // 넓어지므로 0.75를 곱해 낙관 보정한다.
  // 열린 손은 남의 버림패로도 전진하므로 실효 장수(`openUkeire`)로 잰다.
  const ukeire = Math.max(1, input.openUkeire ?? input.ukeireTiles);
  const turnsPerStep = (unseen / ukeire) * 0.75;
  /*
   * **확정 쯔모가 샹텐을 줄여 준다면 그만큼은 기다릴 필요가 없다.** 우케이레
   * 확률로 세던 걸음을 확정으로 바꾸는 것이 정보의 값이다 — 반대로 확정 헛쯔모는
   * 걸음을 그만큼 늦춘다(`KNOWN_MISS_COST`).
   */
  const steps = Math.max(0, input.shanten - (input.known?.advances ?? 0));
  const remain =
    draws - turnsPerStep * steps - (input.known?.misses ?? 0) * KNOWN_MISS_COST;
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

/**
 * 노텐벌부가 판단에 들어오기 시작하는 **패산 잔량**.
 *
 * 예전에는 이 문턱이 세 군데에 각각 적혀 있었고 값이 어긋나 있었다 — 버림·콜 EV는 16,
 * 후로의 형식텐파이 게이트만 12였다. 그 사이 네 순 동안 EV는 노텐벌부 회피를 값으로
 * 세는데 게이트가 그 콜을 먼저 잘라, 세어 놓은 값이 쓰이지 않았다. 한 곳에 둔다.
 */
export const NOTEN_WALL = 16;

/** 오름패의 남은 장수 합 */
export function waitTilesOf(
  waits: readonly TileKind[],
  remainingOf: (k: TileKind) => number,
): number {
  let n = 0;
  for (const w of waits) n += remainingOf(w);
  return n;
}
