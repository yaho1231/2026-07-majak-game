/**
 * callStyle — 후로를 **사람이 우는 모양에서** 울게 기울인다.
 *
 * 실측(docs/58, 상위 계층 11,700 기회): 사람의 울음률 20%, 봇 10%. 격차는 고르지 않다 —
 * 역패 1샹텐 67% vs 15%, **이미 연 손**에서 63~82% vs 11~25%(사람은 한 번 열면 끝까지
 * 달린다), 치는 12% vs 7%로 비슷하다. 이 저장소에서 후로 문턱을 세 번 풀어 세 번 약해진
 * 이유가 여기 있다 — 문턱을 풀면 사람이 안 우는 모양까지 같이 열린다. 사람이 우는 셀만
 * 기울인다.
 *
 * 기울기는 네 표(종류×샹텐 · 종류×멘젠 · 샹텐×멘젠 · 종류×순목)의 평균 로짓 차 × GAIN(점).
 */
import type { TileKind } from "@majak/core";
import type { BotRead } from "../read.js";
import { bucketShanten, bucketTurn } from "./buckets.js";
import { CALL_STYLE } from "./priors.js";
import { meanGap } from "./style.js";

export const CALL_STYLE_GAIN = 800;

export function callTilt(read: BotRead, optionType: string, called: TileKind): number {
  const kind =
    optionType === "chi" ? "chi" : read.isYakuhai(called) ? "yakuhai" : "pon";
  const sh = bucketShanten(read.shanten);
  const menzen = read.menzen ? "menzen" : "open";
  const gap = meanGap([
    CALL_STYLE[`kind=${kind}|sh=${sh}`],
    CALL_STYLE[`kind=${kind}|menzen=${menzen}`],
    CALL_STYLE[`sh=${sh}|menzen=${menzen}`],
    CALL_STYLE[`kind=${kind}|turn=${bucketTurn(read.turn)}`],
  ]);
  return gap * CALL_STYLE_GAIN;
}
