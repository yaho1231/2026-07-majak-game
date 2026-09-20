/**
 * defenseStyle — 상대 리치에 대한 **접는 정도**를 사람 쪽으로 기울인다.
 *
 * 실측(docs/58, 상위 계층 8,000 지점): 상대 리치일 때 사람이 현물을 내는 비율은 5%로
 * 샹텐과 거의 무관하고, 봇은 3샹텐 이상에서 20~40%다(후반 3샹텐+ 40% vs 사람 5%). 즉
 * 봇은 가망 없는 손을 사람보다 훨씬 일찍·세게 접는다. 텐파이~1샹텐에서는 둘이 비슷하다.
 *
 * 사람이 덜 접는 자리에서 실점 저울(`scales().loss`)을 낮춘다. 사람이 더 접는 자리는
 * 실측에 없으므로 저울을 올리는 일은 없다 — 배율은 [0.55, 1.0]. 강함이 떨어지면 채택하지
 * 않는다(docs/57 §4-6).
 */
import type { BotRead } from "../read.js";
import { bucketPoints, bucketShanten, bucketTurn } from "./buckets.js";
import { DEFENSE_STYLE } from "./priors.js";
import { clamp, meanGap } from "./style.js";

const DEFENSE_STYLE_SLOPE = 0.3;

export function lossFactor(read: BotRead, handPoints: number): number {
  if (read.threat < 0.8) return 1;
  const sh = bucketShanten(read.shanten);
  const gap = meanGap([
    DEFENSE_STYLE[`sh=${sh}|turn=${bucketTurn(read.turn)}`],
    DEFENSE_STYLE[`sh=${sh}|pts=${bucketPoints(handPoints)}`],
  ]);
  // gap < 0 = 사람이 덜 접는다 → 저울을 낮춘다. 올리지는 않는다.
  return clamp(1 + gap * DEFENSE_STYLE_SLOPE, 0.55, 1);
}
