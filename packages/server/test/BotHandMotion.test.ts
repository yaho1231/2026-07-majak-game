/**
 * **손동작 읽기** — 쯔모기리인가 手出し인가.
 *
 * 실제 탁에서 가장 강한 읽기 중 하나인데 봇은 여태 한 번도 안 봤다. 뷰에는
 * `tsumogiriIds`가 국 내내 실려 있고(전원 공개 정보), 클라이언트는 바닥에 표식까지
 * 그리는데 봇만 몰랐다 — 그래서 쯔모로 흘러들어온 중장패(우연)와 손에서 꺼낸
 * 중장패(의미 있는 변화)를 같은 신호로 셌다.
 *
 * 여기서 잡는 것은 셋이다.
 *   1. 手出し 중장패는 위협을 올린다 (같은 패라도 쯔모기리면 안 올린다)
 *   2. 연속 쯔모기리(손이 굳었다)도 위협을 올린다
 *   3. **스위치를 끄면 아무 일도 없다** — 실대국 경로는 그대로다
 */

import { describe, expect, it } from "vitest";
import { readThreats } from "../src/bot/danger.js";
import { parseFlags } from "../src/bot/flags.js";
import { botScene } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

const READ2 = parseFlags("read2");

/** p1의 위협도 — 손동작 읽기를 켜고/끄고 */
function threatOf(opts: BotViewOptions, on: boolean): number {
  const scene = botScene(opts);
  const threats = readThreats(
    scene.view,
    "p0",
    [],
    undefined,
    on ? READ2 : undefined,
  );
  return threats.find((t) => t.player === "p1")?.level ?? 0;
}

/** 종반 · p1이 후로 하나를 눕히고 중장패 셋을 흘린 장면 */
const scene = (tsumogiriAt: number[]): BotViewOptions => ({
  hand: "123m456p789s11z22m",
  turnCount: 12,
  oppMelds: { p1: ["555z"] },
  discards: { p1: "19m19p5s6s7s" },
  tsumogiriAt: { p1: tsumogiriAt },
});

describe("손동작 — 手出し와 쯔모기리는 다른 신호다", () => {
  it("手出し로 나온 중장패는 위협을 올린다", () => {
    // 마지막 셋(5s6s7s)이 전부 손에서 나왔다 — 손이 계속 바뀌고 있다
    const tedashi = threatOf(scene([0, 1, 2]), true);
    // 같은 패인데 전부 쯔모기리 — 그냥 흘러들어온 것이라 뜻이 없다
    const drawn = threatOf(scene([0, 1, 2, 3, 4, 5]), true);
    expect(tedashi).toBeGreaterThan(drawn);
  });

  it("연속 쯔모기리는 손이 굳었다는 신호라 위협을 올린다", () => {
    /**
     * 두 신호를 섞지 않으려고 버림패를 **중장패가 아닌 것**으로 끝낸다 —
     * 그러면 手出し 중장패 몫이 양쪽 다 0이라 연속 쯔모기리만 남는다.
     */
    const quiet = (tsumogiriAt: number[]): BotViewOptions => ({
      hand: "123m456p789s11z22m",
      turnCount: 12,
      oppMelds: { p1: ["555z"] },
      discards: { p1: "5s6s7s1m9m9p" },
      tsumogiriAt: { p1: tsumogiriAt },
    });
    const streak = threatOf(quiet([3, 4, 5]), true);
    const none = threatOf(quiet([]), true);
    expect(streak).toBeGreaterThan(none);
  });

  it("스위치를 끄면 손동작이 위협을 전혀 바꾸지 않는다 (실대국 경로)", () => {
    const a = threatOf(scene([0, 1, 2]), false);
    const b = threatOf(scene([0, 1, 2, 3, 4, 5]), false);
    expect(a).toBe(b);
  });

  it("리치 중인 상대에게는 손동작을 세지 않는다 — 선언 뒤는 전부 쯔모기리다", () => {
    const opts: BotViewOptions = {
      hand: "123m456p789s11z22m",
      turnCount: 12,
      riichi: ["p1"],
      discards: { p1: "19m19p5s6s7s" },
    };
    const on = threatOf({ ...opts, tsumogiriAt: { p1: [3, 4, 5] } }, true);
    const off = threatOf(opts, true);
    expect(on).toBe(off);
  });

  it("더블리치는 리치보다 비싸게 잡힌다 — 공개 정보인데 여태 안 봤다", () => {
    const base: BotViewOptions = {
      hand: "123m456p789s11z22m",
      turnCount: 8,
      riichi: ["p1"],
      discards: { p1: "1m9m1p9p" },
      riichiTileIndex: { p1: 0 },
    };
    const scene = botScene(base);
    const rs = scene.view.round.byPlayer["p1"];
    const normal =
      readThreats(scene.view, "p0", [], undefined, READ2).find((t) => t.player === "p1")
        ?.value ?? 0;
    if (rs !== undefined) rs.doubleRiichi = true;
    const dbl =
      readThreats(scene.view, "p0", [], undefined, READ2).find((t) => t.player === "p1")
        ?.value ?? 0;
    expect(dbl).toBeGreaterThan(normal);
  });

  it("일발권이면 실점을 더 크게 본다 — 선언 뒤 아직 한 장도 안 버렸다", () => {
    /** 리치 선언패가 바닥의 마지막 장 = 선언 뒤 한 바퀴가 안 돌았다 */
    const at = (riichiIndex: number, pond: string): number => {
      const scene = botScene({
        hand: "123m456p789s11z22m",
        turnCount: 8,
        riichi: ["p1"],
        discards: { p1: pond },
        riichiTileIndex: { p1: riichiIndex },
      });
      return (
        readThreats(scene.view, "p0", [], undefined, READ2).find((t) => t.player === "p1")
          ?.value ?? 0
      );
    };
    // 네 장을 버렸고 마지막 장이 리치 선언패 → 지금이 일발권
    const fresh = at(3, "1m9m1p9p");
    // 선언 뒤로 두 장을 더 버렸다 → 일발은 이미 지났다
    const stale = at(1, "1m9m1p9p");
    expect(fresh).toBeGreaterThan(stale);
  });

  it("스위치를 끄면 더블리치·일발권도 값을 바꾸지 않는다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 8,
      riichi: ["p1"],
      discards: { p1: "1m9m1p9p" },
      riichiTileIndex: { p1: 3 },
    });
    const rs = scene.view.round.byPlayer["p1"];
    const before =
      readThreats(scene.view, "p0", []).find((t) => t.player === "p1")?.value ?? 0;
    if (rs !== undefined) rs.doubleRiichi = true;
    const after =
      readThreats(scene.view, "p0", []).find((t) => t.player === "p1")?.value ?? 0;
    expect(after).toBe(before);
  });

  it("뷰가 쯔모기리를 안 실어 주면 조용히 0이다 (리플레이 재구성 경로)", () => {
    const withMarks = threatOf(scene([]), true);
    const noMarks = threatOf(
      { ...scene([]), tsumogiriAt: undefined } as BotViewOptions,
      true,
    );
    // 표식이 하나도 없으면 전부 手出し로 읽히므로 둘이 같아야 한다
    expect(withMarks).toBe(noMarks);
  });
});
