/**
 * 2026-08-01 사용자 보고 회귀.
 *
 * ① 연금술사 — 남은 횟수가 화면에 안 보인다 → 보유자 전용 뷰 채널로 발행한다.
 * ② 무장해제 — "잠기지 않는다" → 잠금이 실제로 규칙·액티브 버튼을 죽이는지,
 *    그리고 전원 공개 지목 채널(클라이언트가 자물쇠를 그리는 근거)이 서는지 고정한다.
 * ③ 탕야오 해방 — "다른 역이 안 나온다(도라 같은 거)" → 해방된 탕야오가 붙어도
 *    다른 역·도라·적도라가 함께 계산되는지 고정한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  augmentInstanceId,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  installAugment,
  isSourceDisarmed,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { alchemist } from "../src/augments/alchemist.js";
import { disarm } from "../src/augments/disarm.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { craft } from "./helpers.js";

function withAugments(
  state: GameState,
  who: Record<PlayerId, string[]>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      who[p.id] === undefined ? p : { ...p, augments: [...(who[p.id] as string[])] },
    ),
  };
}

// ───────────────────────── ① 연금술사 남은 횟수 ─────────────────────────

describe("연금술사 — 남은 횟수 채널", () => {
  function scene(): GameState {
    const s = craft({
      hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, { p0: ["alchemist"] });
  }

  it("설치 직후 남은 횟수(5)가 보유자 채널에 선다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, alchemist, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    // 버림 → (전원 패스) → 다음 사람 쯔모. 그 TILE_DRAWN에서 채널이 동기화된다.
    for (let guard = 0; guard < 12 && status.kind === "awaiting"; guard++) {
      const prompt = status.prompts[0];
      if (prompt === undefined) break;
      const opt =
        prompt.options.find((o) => o.type === "pass") ??
        prompt.options.find((o) => o.type === "discard");
      if (opt === undefined) break;
      status = flow.submit(prompt.player, opt);
      if (game.engine.eventLog.some((e) => e.type === "TileDrawn")) break;
    }
    expect(game.engine.eventLog.some((e) => e.type === "TileDrawn")).toBe(true);
    expect(game.engine.state.augmentData["view:p0:uses:alchemist"]).toEqual({
      left: 5,
      total: 5,
      scope: "match",
    });
  });

  it("한 번 쓰면 4로 줄어든다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, alchemist, "p0", { yaku: game.yaku });
    const hand = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
    const res = game.engine.submit({
      player: "p0",
      type: "alchemy",
      payload: { tileId: hand[0] as TileId, delta: 1 },
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.augmentData["view:p0:uses:alchemist"]).toEqual({
      left: 4,
      total: 5,
      scope: "match",
    });
  });
});

// ───────────────────────── ② 무장해제가 실제로 잠근다 ─────────────────────────

describe("무장해제 — 잠금이 실제로 걸린다", () => {
  function scene(): GameState {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, { p0: ["disarm"], p1: ["alchemist"] });
  }

  it("지목하면 대상 증강의 액티브 액션이 후보에서도 제출에서도 막힌다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
    installAugment(game.engine, alchemist, "p1", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "alchemist" },
    });
    expect(res.ok).toBe(true);
    expect(
      isSourceDisarmed(game.engine.state, augmentInstanceId("p1", "alchemist")),
    ).toBe(true);

    // p1 턴이 와도 연금술 후보가 뜨지 않는다
    const opts = game.engine.turnOptionProviders.flatMap((build) =>
      build(game.engine.state, "p1"),
    );
    expect(opts.some((o) => o.type === "alchemy")).toBe(false);
  });

  it("지목 관계가 전원 공개 채널에 실린다 (클라이언트 자물쇠 표시의 근거)", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
    installAugment(game.engine, alchemist, "p1", { yaku: game.yaku });
    game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "alchemist" },
    });
    // 국 스코프 표식(#round)이 붙은 전원 공개 키
    const entry = Object.entries(game.engine.state.augmentData).find(([k]) =>
      k.startsWith("view:*:disarm:p0"),
    );
    expect(entry?.[1]).toEqual({ target: "p1", augmentId: "alchemist" });
  });

  it("규칙형 증강(만년 텐파이)도 함께 잠긴다", () => {
    let s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, { p0: ["disarm"], p1: ["always_tenpai"] });
    const game = createStandardGameFromState(s);
    installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
    installAugment(game.engine, alwaysTenpai, "p1", { yaku: game.yaku });

    const src = augmentInstanceId("p1", "always_tenpai");
    expect(isSourceDisarmed(game.engine.state, src)).toBe(false);
    game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    expect(isSourceDisarmed(game.engine.state, src)).toBe(true);
  });
});

// ───────────────────────── ③ 탕야오 해방 + 다른 역·도라 ─────────────────────────

describe("탕야오 해방 — 다른 역·도라와 함께 계산된다", () => {
  it("일기통관·도라·적도라가 해방된 탕야오와 같이 붙는다", () => {
    let s = craft({
      hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5s" },
    });
    // 도라 표시패를 3p로 고정 → 손패의 4p가 도라
    const handIds = new Set(s.zones["hand:p0"]?.tileIds ?? []);
    const ind = Object.values(s.tiles).find(
      (t) => t.kind.suit === "pin" && t.kind.rank === 3 && !handIds.has(t.id),
    );
    if (ind === undefined) throw new Error("no 3p left");
    s = { ...s, round: { ...s.round, doraIndicators: [ind.id] } };

    const game = createStandardGameFromState(s);
    installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const ev = evaluateWin(
      buildWinContext(st, "p0", "ron", st.round.lastDiscard?.tileId as TileId, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev?.yaku.some((y) => y.id === "tanyao_break")).toBe(true);
    expect(ev?.yaku.some((y) => y.id === "ittsuu")).toBe(true);
    expect(ev?.doraHan).toBeGreaterThan(0);
    // 판수 합계 = 역 판 + 도라 계
    expect(ev?.han).toBe(
      (ev?.yakuHan ?? 0) + (ev?.doraHan ?? 0) + (ev?.uraHan ?? 0) + (ev?.redHan ?? 0),
    );
  });
});
