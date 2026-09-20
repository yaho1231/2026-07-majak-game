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
import { meanGap } from "./style.js";

/** 로짓 1 = 몇 점. 연구 하네스로 사람 비율에 맞춰 잡은 값 (docs/58 §리치) */
export const RIICHI_STYLE_GAIN = 1500;

/** `points`는 리치 판수를 **얹지 않은** 손 값 — 연구가 그 값으로 셀을 나눴다 */
export function riichiTilt(read: BotRead, waitTiles: number, points: number): number {
  const turn = bucketTurn(read.turn);
  const wait = bucketWait(waitTiles);
  const gap = meanGap([
    RIICHI_STYLE[`wait=${wait}|turn=${turn}`],
    RIICHI_STYLE[`pts=${bucketPoints(points)}|turn=${turn}`],
    RIICHI_STYLE[`wait=${wait}|threat=${bucketThreat(read.threat)}`],
  ]);
  return gap * RIICHI_STYLE_GAIN;
}
