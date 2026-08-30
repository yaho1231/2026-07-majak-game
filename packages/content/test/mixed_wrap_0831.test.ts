/**
 * 2026-08-31 점검 — **무너진 국경(혼색 슌쯔) + 끝없는 윤회(순환 슌쯔)** 가 겹칠 때.
 *
 * 양극+동수의 결속에서 "퐁은 되는데 깡은 안 되던" 반쪽(`polar_kan_0831`)과 같은 종류의
 * 구멍이 이 조합에도 있는지 본다 — 두 규칙이 함께 걸린 슌쯔(8만-9통-1삭)가
 * **치 후보·치 판정·화료 분해** 세 곳에서 모두 같은 답을 내야 한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  kindKey,
  winningKinds,
  installAugment,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { brokenBorder } from "../src/augments/broken_border.js";
import { brokenWall } from "../src/augments/broken_wall.js";
import { craft } from "./helpers.js";

/** 두 규칙을 «켜진 상태»로 놓는다 (무너진 국경의 선언 절차는 shapeDeclare 쪽 테스트가 본다) */
function bothOn(game: ReturnType<typeof createStandardGameFromState>): void {
  for (const rule of ["scoring.mixedRuns", "scoring.wrapRuns"]) {
    game.engine.rules.addModifier<boolean>(rule, {
      source: `test:${rule}`,
      layer: 100,
      apply: (cur, ctx) => (ctx.playerId === "p0" ? true : cur),
    });
  }
}

describe("무너진 국경 + 끝없는 윤회", () => {
  it("무늬가 섞이고 9를 넘는 슌쯔(8만-9통-1삭)로 치를 칠 수 있다", () => {
    const state: GameState = (() => {
      const s = craft({
        hands: { p0: "9p1s234p567s88s2z3z", p1: "1112345678999p", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 3,
        lastDiscard: { player: "p3", spec: "8m" },
      });
      return {
        ...s,
        players: s.players.map((p) =>
          p.id === "p0" ? { ...p, augments: ["broken_border", "broken_wall"] } : p,
        ),
      };
    })();
    const game = createStandardGameFromState(state);
    installAugment(game.engine, brokenBorder, "p0", { yaku: game.yaku });
    installAugment(game.engine, brokenWall, "p0", { yaku: game.yaku });
    bothOn(game);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("not awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    expect(prompt?.options.some((o) => o.type === "chi")).toBe(true);
  });

  it("화료 분해도 같은 몸통을 본다 — 8만·9통·1삭이 한 슌쯔다", () => {
    // 8만9통1삭(혼색 + 순환) · 9만1통2삭(혼색 + 순환) · 345만 · 678통 + 9삭 단기
    const hand = [
      ...[8].map((rank) => ({ suit: "man" as const, rank })),
      { suit: "pin" as const, rank: 9 },
      { suit: "sou" as const, rank: 1 },
      { suit: "man" as const, rank: 9 },
      { suit: "pin" as const, rank: 1 },
      { suit: "sou" as const, rank: 2 },
      ...[3, 4, 5].map((rank) => ({ suit: "man" as const, rank })),
      ...[6, 7, 8].map((rank) => ({ suit: "pin" as const, rank })),
      { suit: "sou" as const, rank: 9 },
    ];
    const waits = winningKinds(hand, 0, undefined, {
      mixedRuns: true,
      wrapRuns: true,
    }).map(kindKey);
    expect(waits).toContain(kindKey({ suit: "sou", rank: 9 }));
    // 둘 중 하나만 켜면 이 손은 서지 않는다 (두 규칙이 실제로 함께 걸린 몸통이라는 근거)
    expect(winningKinds(hand, 0, undefined, { mixedRuns: true })).toHaveLength(0);
    expect(winningKinds(hand, 0, undefined, { wrapRuns: true })).toHaveLength(0);
  });
});
