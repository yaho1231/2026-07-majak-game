/**
 * 누명 (frame_up) — 내 버림을 상대 명의로 심는다.
 *  1. 패가 지목 대상의 바닥으로 가고, 그 사람의 후리텐 이력(discardedKinds)에 새겨진다.
 *  2. 손패 출처·방총 책임(lastDiscard.player)은 실제로 버린 나 그대로다.
 *  3. 내 바닥·내 이력에는 남지 않는다(내 후리텐 회피).
 *  4. 자기 자신 지목·리치 중은 거부된다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { frameUp } from "../src/augments/frame_up.js";

const M3 = kindKey({ suit: "man", rank: 3 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function scene(riichi = false): GameState {
  const base = craft({
    hands: { p0: "3m123m456m789m11p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(base, "p0", ["frame_up"]);
  if (!riichi) return s;
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
      },
    },
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
  return game;
}

function findTile(game: ReturnType<typeof setup>, key: string): TileId {
  const st = game.engine.state;
  return handIdsOf(st, "p0").find((id) => kindKey(kindOf(st, id)) === key) as TileId;
}

describe("누명 (frame_up)", () => {
  it("심은 패가 대상의 바닥·후리텐 이력에 기록된다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    const r = game.engine.submit({
      player: "p0",
      type: "frame_discard",
      payload: { tileId: tile, target: "p1" },
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    // 대상 바닥에 패가 있다
    expect(st.zones[discardsZone("p1")]?.tileIds).toContain(tile);
    // 대상의 후리텐 이력에 새겨졌다
    expect(st.round.byPlayer["p1"]?.discardedKinds).toContain(M3);
    // 내 바닥·이력에는 없다 (내 후리텐 회피)
    expect(st.zones[discardsZone("p0")]?.tileIds ?? []).not.toContain(tile);
    expect(st.round.byPlayer["p0"]?.discardedKinds ?? []).not.toContain(M3);
    // 손패에서는 빠졌다 (표준 버림과 동일)
    expect(handIdsOf(st, "p0")).not.toContain(tile);
    // 방총 책임은 실제 버린 나 — lastDiscard.player = p0
    expect(st.round.lastDiscard?.player).toBe("p0");
    expect(st.round.lastDiscard?.tileId).toBe(tile);
    // 사용 카운터 소진
    expect(st.augmentData["frame_up:uses:p0"]).toBe(1);
  });

  it("자기 자신은 지목할 수 없다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    expect(
      game.engine.submit({
        player: "p0",
        type: "frame_discard",
        payload: { tileId: tile, target: "p0" },
      }).ok,
    ).toBe(false);
  });

  it("리치 중에는 발동할 수 없다", () => {
    const game = setup(scene(true));
    const tile = findTile(game, M3);
    expect(
      game.engine.submit({
        player: "p0",
        type: "frame_discard",
        payload: { tileId: tile, target: "p1" },
      }).ok,
    ).toBe(false);
  });

  /**
   * 회귀: 심긴 패는 **지목당한 사람의 바닥**에 있지만 방총 책임(lastDiscard.player)은
   * 실제로 버린 사람이다. 후로 리듀서가 버린 사람의 바닥에서 패를 꺼내려 하면
   * "Tile N is not in zone discards:X"로 국이 통째로 죽었다 — 심긴 패를 아무나 울면
   * 재현됐고, 반장전 퍼즈 240판 중 6판이 이걸로 중단됐다.
   */
  it("심긴 패를 제3자가 펑해도 엔진이 죽지 않는다", () => {
    // p0가 3m을 버릴 참, p2는 3m 2장 보유 → 펑 가능
    const base = craft({
      hands: {
        p0: "3m123m456m789m11p",
        p1: "*",
        p2: "33m123p456p789p1s1s",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = setup(withAug(base, "p0", ["frame_up"]));
    const tile = findTile(game, M3);

    const flow = new FlowController(game.engine);
    flow.begin();
    let status = flow.submit("p0", {
      type: "frame_discard",
      payload: { tileId: tile, target: "p1" },
    } as never);

    // 패는 p1 바닥에, 책임은 p0
    expect(game.engine.state.zones[discardsZone("p1")]?.tileIds).toContain(tile);
    expect(game.engine.state.round.lastDiscard).toEqual({ player: "p0", tileId: tile });

    // p2가 펑 — 반응은 전원 응답으로 해소되므로 나머지는 pass
    const pon = status.kind === "awaiting"
      ? status.prompts.find((p) => p.player === "p2")?.options.find((o) => o.type === "pon")
      : undefined;
    expect(pon).toBeDefined();
    expect(() => {
      status = flow.submit("p2", pon as never);
      let guard = 0;
      while (status.kind === "awaiting" && guard++ < 6) {
        const pr = status.prompts[0]!;
        const pass = pr.options.find((o) => o.type === "pass");
        if (pass === undefined) break;
        status = flow.submit(pr.player, pass);
      }
    }).not.toThrow();

    // 후로가 실제로 성립했다 — 패는 p1 바닥을 떠나 p2의 후로로 갔다
    const st = game.engine.state;
    expect(st.zones[discardsZone("p1")]?.tileIds ?? []).not.toContain(tile);
    expect(st.zones[meldsZone("p2")]?.tileIds).toContain(tile);
    const meld = st.round.byPlayer["p2"]?.melds[0];
    expect(meld?.kind).toBe("pon");
    // 방총 책임은 실제로 버린 p0 그대로 (누명의 설계)
    expect(meld?.calledFrom).toBe("p0");
  });

  it("대조군: creditTo 없는 표준 버림은 내 바닥·내 이력에 남는다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    game.engine.submit({ player: "p0", type: "discard", payload: { tileId: tile } });
    const st = game.engine.state;
    expect(st.zones[discardsZone("p0")]?.tileIds).toContain(tile);
    expect(st.round.byPlayer["p0"]?.discardedKinds).toContain(M3);
    expect(st.round.byPlayer["p1"]?.discardedKinds ?? []).not.toContain(M3);
  });
});
