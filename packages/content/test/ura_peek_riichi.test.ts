/**
 * 이면투시 바꿔치기(ura_swap)는 **리치 중에 막힌다** (2026-09-16 사용자 보고).
 *
 * 리치를 건 뒤 이면투시로 쯔모패를 뒷도라 표시패와 바꾸면, 리치 중 유일하게 버릴 수
 * 있는 패(쯤모패)가 손에서 사라져 «Turn player has no legal actions»로 국이 터졌다
 * (운영 로그 2026-09-15 13:28 room X25Z4Q). 손패를 갈아 끼우는 계열(hand_swap3·
 * full_hand_swap·dead_wall_master)과 같은 «리치 = 손 동결» 규약을 따른다.
 * 확인(ura_peek_reveal)은 정보만 주므로 리치 중에도 그대로 된다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
} from "@majak/core";
import type { FlowStatus, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { handAlteredKey } from "../src/augments/handAltered.js";
import * as C from "../src/index.js";

function withAug(state: GameState, holder: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

const typesOf = (s: FlowStatus, player: PlayerId): string[] =>
  s.kind === "awaiting"
    ? [...new Set(s.prompts.find((p) => p.player === player)?.options.map((o) => o.type))]
    : [];

function mk() {
  const state = withAug(
    craft({
      hands: { p0: "123m456p789s11z3s4s9p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    "p0",
    ["ura_peek"],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, C.uraPeek, "p0", { yaku: game.yaku });
  return game;
}

describe("이면투시 × 리치", () => {
  it("리치 전에는 바꿔치기가 손패를 갈아 끼우고 천화 게이트 표식을 남긴다", () => {
    const game = mk();
    const flow = new FlowController(game.engine);
    let s = flow.begin();
    s = flow.submit("p0", { type: "ura_peek_reveal", payload: {} });
    expect(typesOf(s, "p0")).toContain("ura_swap");
    const nine = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]!.kind) === "pin9",
    )!;
    s = flow.submit("p0", { type: "ura_swap", payload: { handTileId: nine } });
    expect(handIdsOf(game.engine.state, "p0")).not.toContain(nine);
    expect(game.engine.state.augmentData[handAlteredKey(game.engine.state, "p0")]).toBe(true);
  });

  it("리치를 걸면 바꿔치기 후보가 사라지고 직접 보내도 거부된다 — 국은 그대로 굴러간다", () => {
    const game = mk();
    const flow = new FlowController(game.engine);
    let s = flow.begin();
    s = flow.submit("p0", { type: "ura_peek_reveal", payload: {} });
    const nine = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]!.kind) === "pin9",
    )!;
    s = flow.submit("p0", { type: "riichi", payload: { tileId: nine } });
    // 상대 셋의 순을 넘겨 p0의 다음 순까지
    let guard = 0;
    while (s.kind === "awaiting" && !s.prompts.some((p) => p.player === "p0") && guard++ < 30) {
      for (const p of s.prompts) {
        const pick =
          p.options.find((o) => o.type === "pass") ?? p.options.find((o) => o.type === "discard")!;
        s = flow.submit(p.player, pick);
      }
    }
    expect(game.engine.state.round.byPlayer.p0?.riichi).not.toBeNull();
    expect(typesOf(s, "p0")).not.toContain("ura_swap");

    const drawn = game.engine.state.round.lastDrawnTile!;
    const res = game.engine.submit({
      player: "p0",
      type: "ura_swap",
      payload: { handTileId: drawn },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("riichi");
    // 쯔모패는 손에 그대로 — 강제 쯔모기리가 이어진다
    expect(handIdsOf(game.engine.state, "p0")).toContain(drawn);
    expect(() => flow.submit("p0", { type: "discard", payload: { tileId: drawn } })).not.toThrow();
  });
});
