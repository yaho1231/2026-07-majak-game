/**
 * 후로한 순에 증강이 손을 완성시키면 **쯔모패 없이도 쯔모**할 수 있다 (2026-09-16 사용자 지시).
 *
 * 리플레이 SGJG6Q 실측: 퐁 → 염색 → 조커로 손이 완성됐는데 `win` 후보가 안 떠서
 * 완성된 손의 백을 그대로 버렸다. 원인은 `lastDrawnTile === null`("no drawn tile") —
 * 표준 룰의 «후로한 순에는 쯔모가 없다»가 증강이 고친 손에도 그대로 걸렸다.
 *
 * 못 박는 계약:
 *  1. 퐁 직후 증강(염색)이 손을 완성시키면 그 자리에서 `win`이 뜨고, 정산까지 간다.
 *  2. 증강이 손을 안 건드렸으면 표준 룰 그대로 — 샨퐁 화료패를 론 대신 퐁으로 울어
 *     «완성형»이 돼도 쯔모는 없다.
 *  3. 쯔모패가 있는 보통 순은 예전과 같다(쯔모패가 화료패).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
} from "@majak/core";
import type { ActionOption, FlowStatus, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
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

const optionOf = (s: FlowStatus, player: PlayerId, type: string): ActionOption => {
  const o = s.kind === "awaiting"
    ? s.prompts.find((p) => p.player === player)?.options.find((x) => x.type === type)
    : undefined;
  if (o === undefined) throw new Error(`${player} has no ${type} option`);
  return o;
};

/** p3가 백을 버리고 p0가 그것을 퐁한 직후(p0의 turn.act, 쯔모패 없음)까지 진행한다 */
function afterPon(p0Hand: string) {
  const state = withAug(
    craft({
      hands: { p0: p0Hand, p1: "*", p2: "*", p3: "5z1234m1234p12345s" },
      phase: "turn.act",
      turnSeat: 3,
      drawnLastFor: "p3",
    }),
    "p0",
    ["tile_dyeing"],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, C.tileDyeing, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  const haku = handIdsOf(game.engine.state, "p3").find(
    (id) => kindKey(game.engine.state.tiles[id]!.kind) === "dragon1",
  )!;
  s = flow.submit("p3", { type: "discard", payload: { tileId: haku } });
  expect(s.kind).toBe("awaiting");
  // 리액션: p0는 퐁, 나머지는 패스
  const pon = optionOf(s, "p0", "pon");
  if (s.kind === "awaiting") {
    for (const p of s.prompts) {
      s = flow.submit(p.player, p.player === "p0" ? pon : optionOf(s, p.player, "pass"));
    }
  }
  expect(game.engine.state.round.phase).toBe("turn.act");
  expect(game.engine.state.round.lastDrawnTile).toBeNull();
  return { game, flow, status: s };
}

describe("후로한 순의 증강 완성 → 쯔모", () => {
  it("퐁 직후에는 win이 없다가, 염색으로 손이 완성되면 win이 뜨고 정산까지 간다", () => {
    // 퐁 뒤 손: 123m 456p 789s 3s 3p — 3p를 삭으로 물들이면 33s 머리로 완성 (역: 역패 백)
    const { game, flow, status } = afterPon("123m456p789s3s3p55z");
    expect(typesOf(status, "p0")).not.toContain("win");
    expect(typesOf(status, "p0")).toContain("tile_dye");

    const threePin = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]!.kind) === "pin3",
    )!;
    let s = flow.submit("p0", { type: "tile_dye", payload: { tileId: threePin, suit: "sou" } });
    expect(typesOf(s, "p0")).toContain("win");

    s = flow.submit("p0", { type: "win", payload: {} });
    expect(s.kind).toBe("roundOver");
    const settled = game.engine.eventLog.filter((e) => e.type === "RoundSettled").pop();
    const p = settled?.payload as { outcome: string; winInfos: { winner: string; winType: string; winningTileId: number }[] };
    expect(p.outcome).toBe("win");
    expect(p.winInfos[0]?.winner).toBe("p0");
    expect(p.winInfos[0]?.winType).toBe("tsumo");
    // 화료패는 손패 안의 실물이다 (쯔모패가 없으므로 손에서 고른다)
    expect(typeof p.winInfos[0]?.winningTileId).toBe("number");
  });

  it("증강이 손을 안 건드렸으면 표준 룰 그대로 — 화료패를 퐁으로 울어 완성형이 돼도 쯔모는 없다", () => {
    // 123m 456p 789s 33s 55z: 3s·백 샨퐁 텐파이. 백을 론하지 않고 퐁하면 11장이 완성형이다.
    const { status } = afterPon("123m456p789s33s55z");
    expect(typesOf(status, "p0")).not.toContain("win");
    expect(typesOf(status, "p0")).toContain("discard");
  });

  it("쯔모패가 있는 보통 순은 예전과 같다 — 염색으로 완성되면 쯔모패가 화료패다", () => {
    const state = withAug(
      craft({
        hands: { p0: "123m456p789s11z3s4s2p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["tile_dyeing"],
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, C.tileDyeing, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let s = flow.begin();
    const drawn = game.engine.state.round.lastDrawnTile!;
    expect(typesOf(s, "p0")).not.toContain("win");
    s = flow.submit("p0", { type: "tile_dye", payload: { tileId: drawn, suit: "sou" } });
    expect(typesOf(s, "p0")).toContain("win");
    s = flow.submit("p0", { type: "win", payload: {} });
    const settled = game.engine.eventLog.filter((e) => e.type === "RoundSettled").pop();
    const p = settled?.payload as { winInfos: { winningTileId: number }[] };
    expect(p.winInfos[0]?.winningTileId).toBe(drawn);
  });
});
