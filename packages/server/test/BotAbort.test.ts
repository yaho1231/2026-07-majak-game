/**
 * 구종구패 — **봇이 한 번도 못 하던 선언.**
 *
 * `kyushuKyuhai`는 옵션으로 제시되는데 그 옵션에 입찰하는 평가자가 없었다.
 * `bidDiscard`가 언제나 답을 내므로 "아무도 입찰하지 않았을 때"의 난수 폴백에는
 * 도달할 수 없었고, 그래서 배패에 요구패 13종이 흩어져 있어도 봇은 끝까지 뒀다.
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { bidAbort } from "../src/bot/abort.js";
import { bidDiscard } from "../src/bot/discard.js";
import { profileOf } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";

const ABORT: ActionOption = { type: "kyushuKyuhai", payload: {} };

describe("구종구패", () => {
  it("요구패가 흩어진 잡손에서는 선언에 값을 매긴다", () => {
    const scene = botScene({ hand: "19m19p19s123z34556m", turnCount: 1 });
    const bid = bidAbort(buildRead(scene.view, "p0"), [ABORT]);
    expect(bid?.value ?? 0).toBeGreaterThan(0);
  });

  it("국사가 살아 있는 배패는 그냥 둔다 — 유찰이 아까운 손이다", () => {
    // 요구패 13종 = 국사 1샹텐. 잡손이 아니라 역만 배패라 유찰하지 않는다.
    const scene = botScene({ hand: "19m19p19s1234567z", turnCount: 1 });
    const read = buildRead(scene.view, "p0");
    expect(read.shanten).toBeLessThanOrEqual(2);
    expect(bidAbort(read, [ABORT])?.value).toBe(-Infinity);
  });

  it("요구패는 아홉 종인데 국사는 멀면 유찰이 버림을 이긴다", () => {
    // 요구패 9종(19m 19p 19s 동남서) + 중장패 다섯 — 국사 4샹텐, 표준형도 멀다
    const scene = botScene({ hand: "19m19p19s123z34556m", turnCount: 1 });
    const read = buildRead(scene.view, "p0");
    expect(read.shanten).toBeGreaterThan(2);
    const abort = bidAbort(read, [ABORT]);
    const discard = bidDiscard(read, scene.discardOptions(), null, profileOf("balanced"));
    expect(abort).not.toBeNull();
    expect(discard).not.toBeNull();
    expect(abort?.value ?? 0).toBeGreaterThan(discard?.value ?? 0);
  });

  it("옵션이 없는 자리에서는 입찰 자체가 없다", () => {
    const scene = botScene({ hand: "19m19p19s123z34556m", turnCount: 1 });
    const read = buildRead(scene.view, "p0");
    expect(bidAbort(read, scene.discardOptions())).toBeNull();
  });

  it("뒤집어야 하는 처지일수록 유찰의 값이 내려간다 (한 국을 태우는 것이다)", () => {
    const hand = "19m19p19s123z34556m";
    // 올라스 꼴찌 — 남은 기회를 지우면 안 된다
    const desperate = botScene({
      hand,
      turnCount: 1,
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 5000, p1: 40000, p2: 30000, p3: 25000 },
    });
    const calm = botScene({ hand, turnCount: 1 });
    const a = bidAbort(buildRead(desperate.view, "p0", { mode: "hanchan" }), [ABORT]);
    const b = bidAbort(buildRead(calm.view, "p0", { mode: "hanchan" }), [ABORT]);
    expect(a?.value ?? 0).toBeLessThan(b?.value ?? 0);
  });
});
