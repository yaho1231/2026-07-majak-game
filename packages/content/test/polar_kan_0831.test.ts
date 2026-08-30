/**
 * 2026-08-31 사용자 보고 — **양극(polar_ends)은 퐁만 되고 깡이 안 됐다.**
 *
 * 「991을 들고 상대의 9를 깡은 못 치는데, 퐁친 뒤 다음 순에 가깡은 된다」가 그 자리다.
 * 1과 9가 한 패로 통한다면 넉 장도 한 깡이어야 한다 — 대명깡·안깡이 같은 규칙을 본다.
 *
 * 함께 고정하는 것: **동수의 결속을 같이 들면 무늬 국경까지 사라진다**(1만·9통도 한 몸통).
 * 규칙을 하나씩 따로 통과하는 잡종(1만·9만·1통을 «양극+결속»이 아닌 반쪽으로 여는 것)은
 * 두 카드를 다 들었을 때만 열리므로, 한 장만 들었을 때의 그물은 그대로 서 있어야 한다.
 */

import { describe, expect, it } from "vitest";
import { FlowController, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState } from "@majak/core";
import { polarEnds } from "../src/augments/polar_ends.js";
import { craft } from "./helpers.js";

function scene(p0Hand: string, discard: string): GameState {
  const s = craft({
    hands: { p0: p0Hand, p1: "1112345678999p", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: discard },
  });
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["polar_ends"] } : p)),
  };
}

/** 동수의 결속을 «선언된 상태»로 켠다 (선언 절차는 shapeDeclare 쪽 테스트가 본다) */
function withMixedTriplets(game: ReturnType<typeof createStandardGameFromState>): void {
  game.engine.rules.addModifier<boolean>("scoring.mixedTriplets", {
    source: "test:mixed_triplet",
    layer: 100,
    apply: (cur, ctx) => (ctx.playerId === "p0" ? true : cur),
  });
}

function p0Options(state: GameState, mixed = false): string[] {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });
  if (mixed) withMixedTriplets(game);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("not awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  return (prompt?.options ?? []).map((o) => o.type);
}

/** 자기 순(turn.act)에 안깡 후보가 서는가 */
function p0TurnOptions(p0Hand: string, mixed = false): string[] {
  const base = craft({
    hands: { p0: p0Hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["polar_ends"] } : p,
    ),
  };
  const game = createStandardGameFromState(state);
  installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });
  if (mixed) withMixedTriplets(game);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("not awaiting");
  return (status.prompts.find((p) => p.player === "p0")?.options ?? []).map((o) => o.type);
}

describe("양극 — 1·9 혼합 깡", () => {
  it("9만9만1만을 쥐고 남의 9만에 대명깡을 칠 수 있다", () => {
    const types = p0Options(scene("99m1m234p567s88s2z", "9m"));
    expect(types).toContain("pon");
    expect(types).toContain("minkan");
  });

  it("같은 무늬의 1·9 넉 장이면 안깡도 선다", () => {
    expect(p0TurnOptions("1199m234p567s88s2z")).toContain("ankan");
  });

  it("무늬가 다른 1·9는 양극만으로는 여전히 한 몸통이 아니다", () => {
    // 9만9만1통 — 양극은 «같은 무늬의» 1·9만 잇는다
    const types = p0Options(scene("99m1p234p567s88s2z", "9m"));
    expect(types).not.toContain("minkan");
  });

  it("동수의 결속을 함께 들면 무늬가 달라도 깡이 선다", () => {
    const types = p0Options(scene("99m1p234p567s88s2z", "9m"), true);
    expect(types).toContain("pon");
    expect(types).toContain("minkan");
  });
});
