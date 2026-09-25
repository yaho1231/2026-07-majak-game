/**
 * 봇 × 넓어진 퐁 후보 (2026-09-25, docs/59 U58).
 *
 * 코어가 동수의 결속·양극 국에서 퐁 재료를 서명(종류·적도라)마다 하나씩 더 낸다(FlowController).
 * 봇(bidCall)은 후보마다 샹텐·우케이레·EV를 재서 고르므로 늘어난 후보를 그대로 받는다 —
 * 여기서는 (1) 늘어난 후보도 실제로 재 보고(단독 입찰이 선다), (2) 고른 것이 입력 순서에 따라
 * 바뀌지 않으며, (3) 둘을 함께 주면 단독 입찰 중 값이 큰 쪽을 고른다는 것만 고정한다.
 * 어느 짝이 «옳은지»는 봇 EV의 판단이라 여기서 못 박지 않는다(토이토이 길이면 슌쯔를 깨는 쪽이 낫다).
 */

import { describe, expect, it } from "vitest";
import { bidCall } from "../src/bot/call.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";

describe("봇 — 동수의 결속 퐁 후보가 둘일 때 (U58)", () => {
  // 1만 버림 · 손패 1통1통 1삭 23삭 … — [1통,1삭](예전 첫 후보)과 [1통,1통](새 후보)
  const s = botScene({
    hand: "11p1s23s555z77z99m4m",
    lastDiscard: { player: "p1", spec: "1m" },
    scoringOptions: { mixedTriplets: true },
  });
  const hand = s.view.zones["hand:p0"]!.tileIds;
  const [p1a, p1b, s1] = [hand[0]!, hand[1]!, hand[2]!];
  const oldFirst = { type: "pon", payload: { tileIds: [p1a, s1] } };
  const added = { type: "pon", payload: { tileIds: [p1a, p1b] } };
  const pass = { type: "pass", payload: {} };
  const bid = (options: unknown[]) =>
    bidCall(buildRead(s.view, "p0"), options as never, null, NEUTRAL_PROFILE);

  it("새 후보도 단독으로 재 본다 — 입찰이 선다", () => {
    expect(bid([added, pass])).not.toBeNull();
    expect(bid([oldFirst, pass])).not.toBeNull();
  });

  it("둘을 함께 주면 입력 순서와 무관하게 같은 것을, 단독 입찰 값이 큰 쪽을 고른다", () => {
    const a = bid([oldFirst, added, pass]);
    const b = bid([added, oldFirst, pass]);
    expect(a?.option).toEqual(b?.option);
    const best =
      (bid([oldFirst, pass])?.value ?? -Infinity) >= (bid([added, pass])?.value ?? -Infinity)
        ? oldFirst
        : added;
    expect(a?.option).toEqual(best);
  });
});
