/**
 * **상대 실점 추정의 값 교정** — 더블리치와 일발권.
 *
 * 뷰에 공개돼 있는데 봇이 한 번도 안 보던 신호 둘이다. 더블리치는 리치보다 한 판
 * 비싸고, 일발권에 쏘면 한 판이 더 붙는다. 리치의 기본값 2.2판에는 일발이 **평균치로**
 * 섞여 있으므로, 지금 이 순간이 일발권일 때만 그 차이를 얹는다.
 *
 * 뷰의 `ippatsu`는 본인 뷰 전용이라 쓰지 않는다(정보 비대칭은 지켜야 한다) —
 * **공개 정보로 유도한다**: 리치 선언패가 아직 그 사람 바닥의 마지막 장이면
 * 선언 뒤로 한 번도 버리지 않았다는 뜻이다.
 *
 * (같은 작업에서 시도한 쯔모기리/手出し 읽기는 재 보고 걷어냈다 — `danger.ts` 주석 참고.)
 */

import { describe, expect, it } from "vitest";
import { readThreats } from "../src/bot/danger.js";
import { parseFlags } from "../src/bot/flags.js";
import { botScene } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

const DANGER_VAL = parseFlags("dangerVal");

describe("실점 추정 — 공개돼 있는데 안 보던 값들", () => {
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
      readThreats(scene.view, "p0", [], undefined, DANGER_VAL).find((t) => t.player === "p1")
        ?.value ?? 0;
    if (rs !== undefined) rs.doubleRiichi = true;
    const dbl =
      readThreats(scene.view, "p0", [], undefined, DANGER_VAL).find((t) => t.player === "p1")
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
        readThreats(scene.view, "p0", [], undefined, DANGER_VAL).find((t) => t.player === "p1")
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
});
