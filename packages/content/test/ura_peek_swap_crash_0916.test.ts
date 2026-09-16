/**
 * 이면투시(ura_peek) 바꿔치기(ura_swap) 뒤 「Turn player pN has no legal actions」로
 * 판이 죽던 운영 크래시의 회귀 테스트 (2026-09-16).
 *
 *   2026-09-15 room X25Z4Q p2 · 2026-09-06 room FERBGU p0 — 둘 다 **리치 중**에
 *   **쯔모패**를 뒷도라 표시패와 바꿨다. 바꿔치기는 쯔모패 실물을 왕패로 보내면서
 *   `round.lastDrawnTile`을 그대로 뒀고, 리치 중 버림은 «쯔모패만»이라
 *   (standardActions discard validate) 손에 없는 패를 가리키는 쯔모패 = 버릴 패 0장.
 *   확인·바꿔치기 모두 이미 써서 다른 선택지도 없어 turnPrompt가 던졌고,
 *   HanchanController.submitGuarded의 discard 폴백은 pending이 이미 비워진 뒤라
 *   «No pending decision»으로 판 전체가 죽었다.
 *
 * 재현 스크립트: qa-lab/round5/repro/ura_swap_crash.ts
 *
 * 고친 것(ura_peek.ts):
 *   - 쯔모패를 내보내면 들어온 뒷도라 표시패가 새 쯔모패다(`replaceDrawnTile`,
 *     왕패의 주인과 같은 규약). 리치든 아니든 쯔모 화료·깡·쯔모기리 판정이 손과 맞는다.
 *   - 리치 중에는 #454(riichiDrawOnly) 규약대로 **쯔모패 한 장만** 바꿀 수 있다 —
 *     고정된 13장을 바꾸면 대기가 어긋난 채 되돌릴 수 없다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  uraIndicatorIds,
} from "@majak/core";
import type { ActionOption, GameState, TileId } from "@majak/core";
import { uraPeek } from "../src/augments/ura_peek.js";
import { craft } from "./helpers.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 13장 텐파이(1z·2z 샹폰) + 쯔모패 3z(서) — 쯔모패가 마지막 장이다 */
const HAND = "123m456p789s1122z3z";

function scene(riichi: boolean): GameState {
  const s = craft({
    hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["ura_peek"] } : p)),
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: {
          ...s.round.byPlayer["p0"]!,
          riichi: riichi
            ? { double: false, ippatsu: false, discardIndex: 0, cost: 1000 }
            : null,
        },
      },
    },
  };
}

/** 이면투시를 이미 발동한(뒷도라를 본) 상태로 세운다 — 바꿔치기가 열린 시점 */
function setup(riichi: boolean): Game {
  const game = createStandardGameFromState(scene(riichi), undefined, [uraPeek]);
  installAugment(game.engine, uraPeek, "p0", { yaku: game.yaku });
  const r = game.engine.submit({ player: "p0", type: "ura_peek_reveal", payload: {} });
  if (!r.ok) throw new Error(`ura_peek_reveal 실패: ${r.reason}`);
  return game;
}

function promptOf(game: Game, flow: FlowController, status = flow.begin()) {
  if (status.kind !== "awaiting") throw new Error(`expected awaiting, got ${status.kind}`);
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("p0 프롬프트가 없다");
  return prompt;
}

const swapOptions = (options: readonly ActionOption[]): TileId[] =>
  options
    .filter((o) => o.type === "ura_swap")
    .map((o) => (o.payload as { handTileId: TileId }).handTileId);

const discardOptions = (options: readonly ActionOption[]): TileId[] =>
  options
    .filter((o) => o.type === "discard")
    .map((o) => (o.payload as { tileId: TileId }).tileId);

describe("ura_swap 뒤 버릴 패가 사라져 판이 죽던 크래시 (2026-09-15 X25Z4Q)", () => {
  it("리치 중에는 바꿔치기 후보가 없고 validate도 막는다 (#516) — 버릴 패가 사라질 길 자체가 없다", () => {
    // 운영 크래시(2026-09-15 X25Z4Q)는 리치 중 쯔모패 바꿔치기였다. #516이 리치 중
    // 바꿔치기를 통째로 닫았으므로 여기서는 «닫혀 있음»만 못 박고, 쯔모패 자리를 잇는
    // 규약(replaceDrawnTile)은 아래 비리치 케이스가 지킨다.
    const game = setup(true);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const flow = new FlowController(game.engine);
    const prompt = promptOf(game, flow);
    expect(swapOptions(prompt.options)).toEqual([]);
    for (const handTileId of handIdsOf(game.engine.state, "p0")) {
      const r = game.engine.submit({ player: "p0", type: "ura_swap", payload: { handTileId } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/riichi/);
    }
    // 리치 중 버림 후보는 쯔모기리 한 장 — 손에 있는 패를 가리킨다
    expect(discardOptions(prompt.options)).toEqual([drawn]);
  });

  it("리치가 아니면 쯔모패를 바꿔도 던지지 않고, 들어온 패가 새 쯔모패다", () => {
    const game = setup(false);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const incoming = uraIndicatorIds(game.engine.state)[0] as TileId;
    const flow = new FlowController(game.engine);
    const prompt = promptOf(game, flow);
    // 리치가 아니면 손패 전부가 후보다 (기존 동작 유지)
    expect(swapOptions(prompt.options).sort()).toEqual(
      [...handIdsOf(game.engine.state, "p0")].sort(),
    );
    const swap = prompt.options.find(
      (o) =>
        o.type === "ura_swap" && (o.payload as { handTileId: TileId }).handTileId === drawn,
    )!;

    let status: ReturnType<FlowController["submit"]> | undefined;
    expect(() => {
      status = flow.submit("p0", swap);
    }).not.toThrow();

    const s = game.engine.state;
    expect(s.round.lastDrawnTile).toBe(incoming);
    expect(handIdsOf(s, "p0")).toContain(incoming);
    const next = promptOf(game, flow, status);
    expect(discardOptions(next.options).length).toBeGreaterThanOrEqual(1);
    expect(discardOptions(next.options)).toContain(incoming);
  });

  it("리치가 아닐 때 쯔모패가 아닌 패를 바꾸면 쯔모패는 그대로다", () => {
    const game = setup(false);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const fixed = handIdsOf(game.engine.state, "p0").find((t) => t !== drawn) as TileId;
    const flow = new FlowController(game.engine);
    const prompt = promptOf(game, flow);
    const swap = prompt.options.find(
      (o) =>
        o.type === "ura_swap" && (o.payload as { handTileId: TileId }).handTileId === fixed,
    )!;
    const status = flow.submit("p0", swap);
    expect(game.engine.state.round.lastDrawnTile).toBe(drawn);
    const next = promptOf(game, flow, status);
    expect(discardOptions(next.options)).toContain(drawn);
  });
});
