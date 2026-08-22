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
import { NOTEN_PENALTY, NOTEN_WALL, waitTilesOf } from "./value.js";
import { readDiscardQuest } from "./quest.js";
import type { QuestGain } from "./quest.js";
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
 * **공격성이 저울에 주는 폭.**
 *
 * 밀기와 접기의 비교는 결국 이 부등식이고(안전패의 기대 실점은 0이므로),
 *
 *     (위험패의 획득 − 안전패의 획득)  >  위험패의 기대 실점 × PUSH_HORIZON × (loss/gain)
 *
 * **`loss/gain` 비가 곧 "이만큼 벌 수 있어야 민다"의 문턱 배율**이다.
 *
 * 예전 값은 0.6이었다. 그 폭이면 비가 공격형 0.74 · 수비형 1.74 — **2.4배**뿐이라,
 * 후보들의 획득 격차(보통 수백 점)가 기대 실점(100~230점)보다 크면 argmax가 안
 * 뒤집힌다. QA 2차 실측이 그 결과였다: 밀기/접기가 갈려야 하는 장면의 **91.3%를
 * 여섯 원형이 같은 패로** 골랐다(확정 3).
 *
 * 1.4면 비가 공격형 0.34 · 수비형 2.92 — **8.5배**다. 1.8까지 넓히면 갈린 비율이
 * 24.7% → 31.3%까지 가지만 수비형이 실점을 실제의 11배로 세어 과도하게 접기 시작한다.
 *
 * ## 미는 쪽은 안 넓힌다
 *
 * 공격형은 폭을 0.6·1.0·1.4·1.8 어디에 두어도 **밀기율이 78.2%에서 꿈쩍하지
 * 않는다**(전부 68/87). 안전패가 애초에 더 쓸모 있는 장면은 성격으로 뒤집히지 않으므로
 * **미는 쪽은 포화한다** — 넓혀 봐야 판에서 달라 보이지 않는다. 그런데 아레나 2:2는
 * 공격형 넷 탁에서 넓힌 쪽이 꾸준히 열세라고 답했다(정규화 전 −0.1500 ± 0.0689 ·
 * 정규화 후 −0.0967 ± 0.0695). **얻는 것은 없고 잃기만 하는 방향**이라, 미는 쪽 폭은
 * 예전 값 그대로 둔다. 갈라지는 것은 접는 쪽이고, 접는 쪽은 공짜다(−0.0200 ± 0.0675).
 */
const AGGRESSION_SPAN_FOLD = 1.4;
const AGGRESSION_SPAN_PUSH = 0.6;

/** QA 2차 이전의 폭 — `narrowProfile` 스위치가 되돌리는 값 */
const AGGRESSION_SPAN_LEGACY = 0.6;

/**
 * 밀기와 접기에 각각 곱하는 저울.
 *
 * 성격(공격성)과 순위 압박(riskAppetite)이 **판단 규칙이 아니라 저울에만** 붙는다.
 * 올라스 선두는 같은 계산을 하고도 실점을 크게 세어 접고, 꼴찌는 획득을 크게 세어
 * 민다 — 사람이 그러는 것과 같고, 새 성격을 추가해도 분기가 늘지 않는다.
 *
 * ## 성격은 **비**만 바꾼다 — 크기는 안 바꾼다 (2026-08-22)
 *
 * 폭을 그냥 1.4로 넓혔더니 아레나 2:2에서 강함이 **−0.15 ± 0.07**(유의미) 깎였다.
 * 무엇이 깎였는지는 표에 그대로 나왔다 — 수비형 넷 탁에서 **리치율이 18.4% → 10.2%**로
 * 무너졌고, 공격형 넷 탁에서는 반대로 후로율·리치율·방총율이 전부 헐거워졌다.
 *
 * 원인은 밀기/접기 판단이 아니라 **크기**였다. 이 EV에서 저울을 안 타는 절대 상수가
 * 하나 있다 — `RIICHI_COST`(1000점 공탁). 수비형은 `gain`이 0.51로 줄어드니 같은 1000점
 * 공탁이 사실상 **1961점**이 되어 리치가 아예 성립하지 않았고, 공격형은 `gain`이 1.49라
 * 공탁이 671점으로 싸져 아무 리치나 걸었다. 성격이 아니라 저울의 부작용이다.
 *
 * 그래서 **성격이 만든 크기(`norm`)를 도로 나눈다.** 밀기/접기의 비는 한 치도
 * 안 변하므로(EV 전체를 같은 양수로 나누는 것이라 argmax가 그대로다) 원형이 갈라지는
 * 폭은 그대로 유지되고, 절대 상수에 대한 왜곡만 사라진다. 순위 압박(`riskAppetite`)은
 * 따로 재서 고른 값이라 **크기까지 바꾸던 종전 동작 그대로** 둔다 — `lean`이 0인
 * 균형형에서는 `norm`이 정확히 1이라 이 함수가 예전과 완전히 같은 값을 낸다.
 */
export function scales(read: BotRead, profile: BotProfile): { gain: number; loss: number } {
  const lean = profile.aggression - 0.5;
  // `narrowProfile`은 폭을 QA 2차 이전 값으로 되돌리는 **끄는 스위치**다 (bot/flags.ts)
  const legacy = read.flags.has("narrowProfile");
  const span = legacy
    ? AGGRESSION_SPAN_LEGACY
    : lean < 0
      ? AGGRESSION_SPAN_FOLD
      : AGGRESSION_SPAN_PUSH;
  const bias = lean * span + read.match.riskAppetite * 0.45;
  // 성격이 만든 크기만 되돌린다 (예전 저울에서는 이 정규화가 없었다)
  const norm = legacy ? 1 : Math.max(0.4, 1 + lean * span);
  return {
    gain: Math.max(0.4, 1 + bias) / norm,
    loss: Math.max(0.35, 1 - bias) / norm,
  };
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
  const isCore = isNumber && kind.rank >= 4 && kind.rank <= 6;
  switch (plan.yaku) {
    case "honitsu":
      if (isNumber && kind.suit !== plan.suit) return handPoints * 0.18; // 딴 색은 최우선 정리
      return handPoints * -0.03; // 같은 색·자패는 남긴다
    case "chinitsu":
      // 청일색은 자패도 못 쓴다 — 혼일색보다 정리 압력이 세다
      if (!isNumber || kind.suit !== plan.suit) return handPoints * 0.22;
      return handPoints * -0.03;
    case "tanyao":
      return !isNumber || kind.rank === 1 || kind.rank === 9 ? handPoints * 0.2 : 0;
    case "chanta":
      // 4·5·6은 찬타의 어떤 몸통에도 못 들어간다
      return isCore ? handPoints * 0.2 : 0;
    case "junchan":
      return isCore ? handPoints * 0.2 : !isNumber ? handPoints * 0.12 : 0;
    default:
      // 토이토이·산색·일통은 커쯔·특정 슌쯔 지향이라 샹텐 계산이 이미 반영한다
      return 0;
  }
}


// ─────────────────────────── 후보 한 장을 버린 뒤의 손 ───────────────────────────

/** 버린 뒤의 손 모양 — 화료 확률의 재료 */
interface Shape {
  shanten: number;
  ukeire: number;
  /** 텐파이일 때 오름패의 남은 장수 (노텐이면 0) */
  waitTiles: number;
  /** 버린 뒤의 손패와 우케이레 종류 — 열린 손의 전진 속도를 잴 때 쓴다 */
  hand: TileKind[];
  ukeireKinds: readonly TileKind[];
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
      hand: [],
      ukeireKinds: [],
    });
  }
  let bestShanten = Infinity;
  for (const s of out.values()) if (s.shanten < bestShanten) bestShanten = s.shanten;

  for (const [key, shape] of out) {
    if (shape.shanten > bestShanten) continue;
    const c = cands.find((x) => kindKey(x.kind) === key);
    if (c === undefined) continue;
    const rest = removeKinds(read.hand, [c.kind]);
    const u = ukeireOf(rest, read.meldCount, read.remainingOf, read.opts);
    shape.ukeire = u.tiles;
    shape.hand = rest;
    shape.ukeireKinds = u.kinds;
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
  opts: { riichi: boolean; tsumoOnly: boolean; notenStake: number; quest: QuestGain },
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
    // 이미 후로한 손은 남의 버림패로도 전진한다 — 그만큼 빨리 완성된다
    open:
      read.meldCount > 0
        ? { hand: shape.hand, ukeireKinds: shape.ukeireKinds }
        : undefined,
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

  let gain =
    pWin * (points + read.match.potBonus) * placement * appetite +
    (shape.shanten <= 0 ? opts.notenStake : 0) +
    directionGain(c.kind, plan, value.points) +
    // 증강이 버림에 건 규율(편식의 12장 퀘스트 등) — 없으면 0이라 종전과 같다
    opts.quest(c.kind);
  // 속도냐 타점이냐 — 어느 쪽도 틀리지 않는 취향이라 EV를 뒤엎지 않고 기울이기만 한다
  gain *= valueTilt(value.points, profile);

  // 리치는 손을 고정시켜 남은 순의 위험패를 전부 통과시켜야 한다 — 위험이 더 길다
  const horizon = opts.riichi ? LOCKED_PUSH_HORIZON : PUSH_HORIZON;
  const loss = read.expectedLoss(c.kind) * horizon;

  return (
    gain * scale.gain -
    loss * scale.loss -
    (opts.riichi ? RIICHI_COST : 0) +
    bluffBonus(c.kind, profile)
  );
}

/** 사람다운 흔들림에 쓰는 결정론 난수 (BotAgent의 시드 PRNG) */
export interface BotJitter {
  /** 0 이상 n 미만 정수 */
  int(n: number): number;
}

/**
 * **비슷한 선택지 사이에서만** 흔들린다.
 *
 * 사람은 쓸모가 엇비슷한 두 패 중 무엇을 버릴지 매번 같게 고르지 않는다. 봇이
 * 언제나 정확히 같은 한 장을 고르면 그 자체가 읽히는 정보가 되고("쟤는 이 형태에서
 * 항상 이걸 버린다"), 무엇보다 사람으로 보이지 않는다.
 *
 * 흔들림의 폭은 **EV 차이로 묶여 있다.** 손해가 뚜렷한 선택은 성격이 아무리
 * 변덕스러워도 후보에 들어오지 않는다 — 사람다움을 위해 실력을 버리지는 않는다.
 */
function wobble(
  scored: readonly { c: Candidate; ev: number }[],
  bestEV: number,
  profile: BotProfile,
  jitter: BotJitter | undefined,
): { c: Candidate; ev: number } | null {
  if (jitter === undefined || profile.noise <= 0 || scored.length < 2) return null;
  // 폭은 EV 규모에 비례하되, 모두가 0에 가까운 국면(가망 없는 손)에서도 작동하도록
  // 바닥을 둔다. 바닥이 크면 그런 국면에서 **모든 후보가 후보로 묶여** 성격 차이가
  // 사라지므로 작게 잡는다. 성격이 그 폭을 정하고, 난이도가 그 위에 곱해진다.
  /**
   * **난이도가 붙는 유일한 자리**(`profile.skill`). 실력이 낮을수록 "엇비슷하다"고
   * 보는 폭이 넓어져, 봇은 규칙을 몰라서가 아니라 **고르기를 흔들려서** 진다 —
   * 사람이 실수하는 모습과 같다. `skill = 1`이면 곱이 정확히 1이라 종전과 같다.
   */
  const clumsy = 1 + (1 - Math.max(0, Math.min(1, profile.skill))) * BLUNDER_SPAN;
  const band = profile.noise * clumsy * Math.max(30, Math.abs(bestEV) * 0.06);
  const near = scored.filter((x) => x.ev >= bestEV - band);
  if (near.length < 2) return null;
  return near[jitter.int(near.length)] ?? null;
}

/**
 * 실력이 0일 때 흔들림 폭이 몇 배가 되는가.
 *
 * 5배면 초보 봇은 "손해 250점쯤까지는 아무거나" 고르는 셈이라, 안전패를 놔두고
 * 무스지를 흘리는 일이 실제로 일어난다. 그래도 폭이 EV로 묶여 있는 성질은 그대로라
 * **명백한 대형 실수는 여전히 하지 않는다** — 초보 사람도 그렇다.
 */
const BLUNDER_SPAN = 5;

/** 타점 취향의 기준점 — 이 근처의 손은 어느 성격에서도 값이 그대로다 */
const VALUE_REF = 5000;

/**
 * **속도냐 타점이냐**의 기울기.
 *
 * 같은 손을 싸게 빨리 먹을지 비싸게 천천히 먹을지는 실력 문제가 아니라 취향이고,
 * 사람마다 확실히 갈린다. 그래서 EV의 순서를 뒤엎지 않고 **비싼 줄기 쪽으로 살짝
 * 기울이거나 반대로 기울이기만** 한다(중립이면 정확히 1이라 아무 일도 없다).
 */
function valueTilt(points: number, profile: BotProfile): number {
  const k = profile.valueBias - 0.5; // -0.5(속도) ~ +0.5(타점)
  if (k === 0) return 1;
  return (Math.max(500, points) / VALUE_REF) ** k;
}

/**
 * 값을 치르지 않는 거짓말.
 *
 * 접은 국에도 중장패를 흘리면 남에게는 아직 미는 것처럼 보인다 — 실제로 이 봇의
 * 상대 읽기(`danger.readThreats`)가 "종반에 중장패를 흘리는 손"을 텐파이 신호로
 * 잡으므로, 이 허세는 **같은 탁의 봇들에게 실제로 통한다.**
 *
 * 크기를 아주 작게 둔 것이 요점이다. 안전도가 사실상 같은 후보들 사이에서만
 * 순서를 바꾸므로, 허세 때문에 위험패를 내는 일은 일어나지 않는다.
 */
function bluffBonus(kind: TileKind, profile: BotProfile): number {
  const isNumber = kind.suit === "man" || kind.suit === "pin" || kind.suit === "sou";
  if (!isNumber) return 0;
  const look = kind.rank >= 3 && kind.rank <= 7 ? 1 : kind.rank === 2 || kind.rank === 8 ? 0.5 : 0;
  return profile.bluff * look * BLUFF_TIEBREAK;
}

/** 허세가 흔들 수 있는 최대 폭 (점수) — 동점 근처만 건드리는 크기 */
const BLUFF_TIEBREAK = 45;

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
  /**
   * 사람다운 흔들림을 주는 난수 (선택). 넘기지 않으면 **항상 최선**을 고른다 —
   * 평가자 단위 테스트가 흔들리지 않도록 기본은 결정론적 최선이고, 실제 봇만
   * `BotAgent`에서 이 난수를 넘겨 준다.
   */
  jitter?: BotJitter,
): ActionBid | null {
  const cands = candidatesOf(read, options);
  if (cands.length === 0) return null;

  const shapes = shapesOf(read, cands);
  // 종반에 텐파이를 붙들면 노텐벌부를 피한다 — 화료와 별개로 값이 있는 결과다
  const notenStake = read.wallLeft <= NOTEN_WALL ? NOTEN_PENALTY : 0;
  const tsumoOnly = read.menzen && !hasYakuNow(read);
  const quest = readDiscardQuest(read.view, read.me, read.wallLeft, read.valueOf({ plan }).points);
  /*
   * **이 한 장을 버려서 내가 후리텐이 되는가** (QA 2차 bot 확정 2).
   *
   * `bidRiichi`에는 이 검사가 있는데 평시 버림에는 아예 없었다. 그래서 론이
   * 원천 봉쇄된 텐파이에도 론 배수(`value.ts` RON_MULTIPLIER = 2.2)가 그대로
   * 붙어 화료 기대값을 1,000~1,300점(30~40%) 부풀려 셌다. 이 EV는 버림·리치·
   * 후로·깡·증강 판단이 **전부 공유하는 축**이라(`bot/decide.ts`), 부풀림이 그
   * 판단 전부를 함께 기울인다 — 실제로 나타나는 모습은 "후리텐 텐파이를 론 되는
   * 텐파이로 착각해 그 손을 계속 민다"이다(위험패를 통과시키는 문턱이 낮아진다).
   *
   * 배관은 이미 다 있었다 — `winChanceOf`가 `tsumoOnly`를 받아 론 배수를 빼는
   * 경로가 그대로 살아 있고, 여기서 그 값을 후보별로 채워 넣기만 하면 된다.
   */
  const myDiscards = new Set<string>();
  for (const id of read.view.zones[`discards:${read.me}`]?.tileIds ?? []) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) myDiscards.add(kindKey(k));
  }

  const scored: { c: Candidate; ev: number }[] = [];
  let best: Candidate | null = null;
  let bestEV = -Infinity;
  for (const c of cands) {
    const shape = shapes.get(kindKey(c.kind));
    if (shape === undefined) continue;
    // 텐파이가 되는 후보에만 뜻이 있다 — 샹텐이 남은 손에는 대기 자체가 없다.
    let selfFuriten = false;
    if (shape.shanten === 0) {
      const declKey = kindKey(c.kind);
      const waits = winningKinds(
        removeKinds(read.hand, [c.kind]),
        read.meldCount,
        undefined,
        read.opts,
      );
      selfFuriten = waits.some((w) => {
        const k = kindKey(w);
        return k === declKey || myDiscards.has(k);
      });
    }
    const ev = lineEV(read, c, shape, plan, profile, {
      riichi: false,
      tsumoOnly: tsumoOnly || selfFuriten,
      notenStake,
      quest,
    });
    scored.push({ c, ev });
    // 동점이면 뒤쪽(쯔모패 쪽)을 버린다 — 사람도 쓸모 같으면 쯔모기리한다
    if (ev >= bestEV) {
      bestEV = ev;
      best = c;
    }
  }
  if (best === null) return null;
  const wobbled = wobble(scored, bestEV, profile, jitter);
  if (wobbled !== null) {
    best = wobbled.c;
    bestEV = wobbled.ev;
  }
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
  const quest = readDiscardQuest(read.view, read.me, read.wallLeft, read.valueOf({ plan }).points);

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
    /*
     * **선언패 자신도 세어야 한다** (QA 2차 bot 확정 1).
     *
     * `myDiscards`는 선언패가 바닥에 놓이기 **전**의 목록이라, 「커쯔에서 한 장
     * 떼어 량면을 세우는」 흔한 선언에서 선언패가 곧 자기 대기인 경우를 구조적으로
     * 못 봤다. 그 리치는 거는 순간 후리텐이라 국이 끝날 때까지 론이 안 된다 —
     * 봉 1000점은 나갔고 손은 잠겼고 남는 건 쯔모뿐이다. 실측으로 리치 선언의
     * 5.0%가 이 경우였고, 여섯 원형 전부 똑같이 걸었다.
     *
     * 아래의 「대기가 아주 넓고 저돌적이면 예외」 조항은 그대로 둔다 — 후리텐인 줄
     * **알고** 쯔모만 노리는 리치는 성립하는 수다. 문제는 모르고 거는 것이었다.
     */
    const declKey = kindKey(c.kind);
    const furiten = waits.some((w) => {
      const k = kindKey(w);
      return k === declKey || myDiscards.has(k);
    });
    // 후리텐 리치는 쯔모밖에 없다. 대기가 아주 넓고 저돌적인 성격일 때만.
    if (furiten && !(shape.waitTiles >= 8 && profile.aggression > 0.6)) continue;

    const ev = lineEV(read, c, shape, plan, profile, {
      riichi: true,
      tsumoOnly: furiten,
      notenStake: 0, // 리치는 어차피 텐파이 — 노텐벌부는 양쪽 공통이라 비교에서 상쇄된다
      quest,
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
