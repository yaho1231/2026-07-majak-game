/**
 * riichiStyle — 리치를 **사람이 거는 자리에서** 걸게 기울인다.
 *
 * 실측(docs/58, 상위 계층 2,900 지점): 사람은 초·중반 나쁜 대기(≤3장)에서 봇보다
 * 훨씬 덜 걸고(27% vs 46%), 후반에는 봇보다 훨씬 더 걸며(대기 4~7장 후반 46% vs 31%),
 * 큰 손(8천+)은 다마를 더 고르고(23~30% vs 38~39%), 상대 리치가 있어도 좋은 대기면
 * 더 민다(53% vs 36%). 봇의 리치 EV는 `RIICHI_COST` 1000이 순목·값과 무관하게 평평해서
 * 이 모양이 안 나온다.
 *
 * 기울기는 세 표(대기×순목 · 손값×순목 · 대기×위협)의 평균 로짓 차 × GAIN(점). 표 조회
 * 셋뿐이라 연산량은 없다.
 */
import type { BotRead } from "../read.js";
import { bucketPoints, bucketThreat, bucketTurn, bucketWait } from "./buckets.js";
import { RIICHI_STYLE } from "./priors.js";
import { clamp, meanGap } from "./style.js";

/**
 * 로짓 1 = 몇 점. 1500이면 그림자 봇의 리치율이 상위 사람과 거의 겹치지만(docs/58 §2~4)
 * 2:2에서 4시드 합 −0.02 ± 0.02로 살짝 열세라 1000으로 낮췄다 — 사람 쪽으로 2/3만 간다.
 */
export const RIICHI_STYLE_GAIN = 1000;

/** `points`는 리치 판수를 **얹지 않은** 손 값 — 연구가 그 값으로 셀을 나눴다 */
/**
 * `riichiLoose`(성격)가 따르는 정도를 가른다 — 사람 평균의 **자제**(gap < 0)는 리치를
 * 싫어하는 성격이 더 따르고, 사람 평균의 **공격**(gap > 0)은 리치를 좋아하는 성격이 더
 * 따른다. 성격이 저울이지 규칙이 아니라는 원칙(`BotPlay.test.ts`)이 여기서도 유지된다:
 * 자제 배율 = clamp(2.2 − 2.4·loose, 0, 1.2), 공격 배율 = 2·loose —
 * 균형형(0.6)은 0.76/1.2, 리치파(0.9)는 0/1.8(자제를 아예 안 따른다), 다마파(0.4)는 1.2/0.8.
 */
export function riichiTilt(read: BotRead, waitTiles: number, points: number, riichiLoose = 0.5): number {
  const turn = bucketTurn(read.turn);
  const wait = bucketWait(waitTiles);
  const gap = meanGap([
    RIICHI_STYLE[`wait=${wait}|turn=${turn}`],
    RIICHI_STYLE[`pts=${bucketPoints(points)}|turn=${turn}`],
    RIICHI_STYLE[`wait=${wait}|threat=${bucketThreat(read.threat)}`],
  ]);
  const follow = gap < 0 ? clamp(2.2 - 2.4 * riichiLoose, 0, 1.2) : 2 * riichiLoose;
  return gap * RIICHI_STYLE_GAIN * follow;
}
