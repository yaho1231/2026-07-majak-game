/**
 * 격(rank_gate) — 지목 배지는 **국이 끝나면** 내려간다.
 *
 * detail이 "지목은 전원에게 공개되고 국이 끝나면 풀린다"라고 약속하는데, 배지를
 * 지우는 곳이 **다음 국의** `ROUND_STARTED` 리액션 하나뿐이라 정산 화면과 증강
 * 드래프트 내내 지목이 걸려 있는 것처럼 보였다 — 제한은 이미 끝난 뒤인데도.
 * (2026-08-20 QA 문구 감사 §27)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { rankGate } from "../src/augments/rank_gate.js";

/** p0가 국 첫 순에 쯔모 화료할 수 있는 장면 (지목 창이 열려 있다) */
function tsumoScene(): GameState {
  const base = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["rank_gate"] } : p,
    ),
    round: { ...base.round, firstTurn: true, goAroundBroken: false },
  };
}

describe("rank_gate — 지목 배지의 수명", () => {
  it("정산이 끝나면 전원 공개 배지가 내려간다", () => {
    const game = createStandardGameFromState(tsumoScene());
    installAugment(game.engine, rankGate, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const flow = new FlowController(game.engine);
    flow.begin();

    const marked = flow.submit("p0", {
      type: "rank_gate_mark",
      payload: { target: "p1" as PlayerId },
    });
    expect(marked.kind).toBe("awaiting");
    expect(game.engine.state.augmentData["view:*:rank_gate:p0"]).toMatchObject({
      by: "p0",
      target: "p1",
    });

    const over = flow.submit("p0", { type: "win", payload: {} });
    expect(over.kind).toBe("roundOver");
    // 국이 끝났다 = 배지도 내려간다 (다음 국 시작을 기다리지 않는다)
    expect(game.engine.state.augmentData["view:*:rank_gate:p0"]).toBeNull();
  });
});
