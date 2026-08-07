/**
 * match — 지금 이 국이 **게임 전체에서 어떤 국인가**.
 *
 * 예전 봇은 점수판을 아예 보지 않았다. `PlayerInfo.score`는 뷰에 있었지만 봇의 어느
 * 판단도 읽지 않았고, 그래서 **동1국과 올라스를 똑같이 쳤다.** 사람이라면 절대 그러지
 * 않는다 — 이건 봇이 "기계 같다"고 느껴지는 가장 큰 이유였다.
 *
 *   - 올라스 1위에 2만점 차 → 아무것도 안 하고 흘려 보낸다. 리치도 안 걸고, 남의 리치엔
 *     즉시 접는다. 유국이 최고의 결과다.
 *   - 올라스 4위에 2만점 차 → 만관으로는 모자란다. 후리텐이든 나쁜 대기든 밀어서
 *     역만을 노린다. 방총해도 어차피 4위다.
 *   - 동1국 → 그냥 잘 친다. 순위는 아직 의미가 없다.
 *
 * 이 파일은 그 판단을 **하나의 축**으로 압축한다 — `riskAppetite`(-1 완전 보수 ~
 * +1 무리해서라도 점수). 밀기/접기·리치·후로·깡·증강이 전부 이 값 하나를 곱해 쓴다.
 * 축을 하나로 둔 이유: 판단마다 "올라스 1위면 …" 분기를 심으면 새 판단이 생길 때마다
 * 같은 조건문을 복사해야 하고, 하나만 빠뜨려도 봇이 앞뒤가 안 맞게 논다.
 *
 * 게임 모드(반장전/동풍전)는 뷰에 없다 — 서버가 방을 만들 때 봇에 알려 준다.
 * 모르면 반장전으로 본다(기본 모드).
 */

import type { PlayerId, PlayerView } from "@majak/core";
import { NO_FLAGS } from "./flags.js";
import type { BotFlags } from "./flags.js";

export type BotGameMode = "hanchan" | "tonpuu";

/** 모드별 총 국 수 (연장·서입은 세지 않는다 — 어차피 근사다) */
const TOTAL_ROUNDS: Record<BotGameMode, number> = { hanchan: 8, tonpuu: 4 };

export interface MatchContext {
  myScore: number;
  /** 1(선두) ~ 4(꼴찌) */
  rank: number;
  /** 내가 오야인가 */
  isDealer: boolean;
  /** 이번 국을 포함해 남은 국 수 (근사) */
  roundsLeft: number;
  /** 마지막 국인가 */
  allLast: boolean;
  /**
   * 게임이 얼마나 끝나가는가 0(초반) ~ 1(올라스).
   * 순위 압박은 초반엔 무의미하고 종반에만 실재한다 — 그 정도를 재는 값.
   */
  lateness: number;
  /** 바로 위 순위를 따라잡는 데 필요한 점수 (1위면 0) */
  chase: number;
  /** 바로 아래 순위와 벌어진 점수 (꼴찌면 0) */
  lead: number;
  /** 이 국에 걸린 덤 — 공탁 + 본장 */
  potBonus: number;
  /**
   * -1(순위를 지킨다: 접고, 안 걸고, 유국을 반긴다)
   *  0(평시: 점수 최대화)
   * +1(순위를 뒤집는다: 방총을 감수하고 큰 손을 노린다)
   */
  riskAppetite: number;
}

/**
 * 순위 압박이 실재하기 시작하는 점수차. 이 값을 넘으면 압박이 최대가 된다.
 * 만관(8000)이 한 번에 뒤집을 수 있는 크기라 그 근처로 잡는다.
 */
const PRESSURE_SPAN = 9000;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** 뷰의 점수판과 국 진행에서 이 봇의 처지를 읽는다 */
export function readMatch(
  view: PlayerView,
  me: PlayerId,
  mode: BotGameMode = "hanchan",
  flags: BotFlags = NO_FLAGS,
): MatchContext {
  const scores = view.players.map((p) => ({ id: p.id, score: p.score, seat: p.seat }));
  const myScore = scores.find((p) => p.id === me)?.score ?? 25000;

  // 동점은 자리 순으로 끊는다(실제 순위 규칙과 같진 않지만 판단에는 충분하다)
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.seat - b.seat);
  const rank = sorted.findIndex((p) => p.id === me) + 1 || 1;
  const above = sorted[rank - 2];
  const below = sorted[rank];

  const total = TOTAL_ROUNDS[mode];
  // prevalentWind 1=동 2=남. 연장(서입)으로 총 수를 넘을 수 있으므로 하한을 1로 둔다.
  const played = (view.round.prevalentWind - 1) * 4 + view.round.roundNumber;
  const roundsLeft = Math.max(1, total - played + 1);
  const allLast = roundsLeft <= 1;

  // 남은 국이 줄수록 순위가 실재한다. 마지막 두 국에서 급격히 커진다.
  const lateness = allLast ? 1 : roundsLeft === 2 ? 0.65 : roundsLeft === 3 ? 0.35 : 0.15;

  const chase = above === undefined ? 0 : Math.max(0, above.score - myScore);
  const lead = below === undefined ? 0 : Math.max(0, myScore - below.score);

  const seat = view.players.find((p) => p.id === me)?.seat ?? 0;
  const isDealer = seat === view.round.dealerSeat;

  let riskAppetite = flags.has("place2")
    ? ladderAppetite(sorted, rank, myScore, roundsLeft, lateness)
    : // 예전 식 — 인접 순위만 보고 빼기 때문에 위아래가 둘 다 멀면 0으로 상쇄된다.
      lateness * (clamp01(chase / PRESSURE_SPAN) - clamp01(lead / PRESSURE_SPAN));

  // 오야는 화료하면 연장된다 — 뒤집을 기회가 한 번 더 생기므로 조금 더 민다.
  // 반대로 올라스 오야 선두는 **끝내는 것**이 이득이라 더 지킨다.
  if (isDealer) riskAppetite += allLast && rank === 1 ? -0.15 : 0.1 * lateness;

  return {
    myScore,
    rank,
    isDealer,
    roundsLeft,
    allLast,
    lateness,
    chase,
    lead,
    potBonus: view.round.riichiPot + view.round.honba * 300,
    riskAppetite: Math.max(-1, Math.min(1, riskAppetite)),
  };
}

// ─────────────────────── 순위 사다리 전체를 본다 (`place2`) ───────────────────────

/**
 * 남은 국에서 **뒤집을 수 있는 점수차**의 어림.
 *
 * 하네만 직격이면 한 국에 24000점이 움직인다. 한 국당 그 정도를 '닿을 수 있는 거리'로
 * 잡되, 그 안에서도 가까울수록 실현 가능성이 높으므로 선형으로 깎는다.
 */
const REACH_PER_ROUND = 16000;

/**
 * **이 순위차가 실제로 닿는가** 0(어림없다) ~ 1(코앞이다).
 * 사람이 점수판을 보고 하는 판단은 "몇 점 차인가"가 아니라 "닿는가"다.
 */
const reachable = (gap: number, roundsLeft: number): number =>
  clamp01(1 - gap / (REACH_PER_ROUND * Math.max(1, roundsLeft)));

/**
 * 순위 압박 — **사다리 전체**를 보고 낸다.
 *
 * ## 예전 식이 스스로를 지우고 있었다
 *
 * `lateness × (쫓는 압박 − 지키는 압박)`인데 둘 다 **바로 위·바로 아래 한 칸**만 봤고,
 * 게다가 그냥 뺐다. 그래서 올라스 2위가 1위와 +30000, 3위와 −30000이면 두 항이 각각
 * 1이 되어 **정확히 0("평시처럼 잘 치면 된다")** 이 나온다. 실제로는 2위가 굳어
 * 있으므로 답은 "아무것도 걸지 마라"다. 파일 위에 적어 둔 목표("올라스 1위에 2만점
 * 차 → 아무것도 안 하고 흘려 보낸다")와 정면으로 어긋난다.
 *
 * ## 무엇을 고쳤나
 *
 * 두 항을 **닿는가**로 다시 정의하고, 인접이 아니라 **위 전부·아래 전부**를 본다.
 *
 *  - `upside` — 내가 올라갈 수 있는 자리 중 가장 잘 닿는 것. 아무도 닿지 않으면 0.
 *  - `downside` — 나를 넘어설 수 있는 사람 중 가장 잘 닿는 사람. 없으면 0.
 *
 * 그러면 30000점 차의 1위는 `upside = 0`(못 쫓는다)이 되어 헛되이 밀지 않고,
 * 30000점 아래의 3위는 `downside = 0`(못 쫓긴다)이 되어 헛되이 접지 않는다.
 *
 * ## 그리고 '굳었다'는 상태에 이름을 준다
 *
 * 위도 아래도 닿지 않으면 이 국의 결과가 **내 순위를 바꾸지 못한다.** 그때 점수는
 * 값어치가 없고 방총만 값어치가 있다(우마·점수 자체의 몫이 남는다). 그래서
 * 뺄셈이 0으로 상쇄되는 대신 **음수**가 나오게 항을 하나 더 둔다 — 예전 식이
 * "평시"라고 잘못 답하던 바로 그 자리다.
 */
function ladderAppetite(
  sorted: readonly { id: PlayerId; score: number; seat: number }[],
  rank: number,
  myScore: number,
  roundsLeft: number,
  lateness: number,
): number {
  let upside = 0;
  let downside = 0;
  for (const [i, p] of sorted.entries()) {
    const theirRank = i + 1;
    if (theirRank < rank) upside = Math.max(upside, reachable(p.score - myScore, roundsLeft));
    else if (theirRank > rank)
      downside = Math.max(downside, reachable(myScore - p.score, roundsLeft));
  }
  // 위도 아래도 안 닿는다 = 이 국이 순위를 못 바꾼다 → 변동성을 줄이는 것이 이득이다
  const locked = (1 - upside) * (1 - downside);
  return lateness * (upside - downside - LOCKED_CAUTION * locked);
}

/** 순위가 굳었을 때 얼마나 몸을 사리는가 */
const LOCKED_CAUTION = 0.5;

/** 평시(점수판을 볼 수 없는 테스트 경로)용 중립 문맥 */
export const NEUTRAL_MATCH: MatchContext = {
  myScore: 25000,
  rank: 2,
  isDealer: false,
  roundsLeft: 8,
  allLast: false,
  lateness: 0.15,
  chase: 0,
  lead: 0,
  potBonus: 0,
  riskAppetite: 0,
};
