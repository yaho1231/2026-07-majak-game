/**
 * 2026-08-22 페르소나 QA 2차(codex-text) 회귀 — 문구·도감 결함.
 *
 * 문구만 고친 항목은 여기서 세지 않는다(문구 검사는 catalog_*·client_augment_brief에 있다).
 * 여기 있는 것은 **구현을 함께 고친 것**뿐이다.
 */

import { createStandardGameFromState, handZone, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { describe, expect, it } from "vitest";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";
import { craft } from "./helpers.js";

function withAugments(state: GameState, who: string, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === who ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** 손패의 특정 kind 한 장을 적도라로 만든다 (qa_hand_manip_0820의 makeRed와 같다) */
function makeRed(state: GameState, who: PlayerId, key: string): GameState {
  const id = (state.zones[handZone(who)]?.tileIds ?? []).find(
    (t) => kindKey(state.tiles[t]?.kind as never) === key,
  ) as TileId;
  return {
    ...state,
    tiles: {
      ...state.tiles,
      [id]: {
        ...(state.tiles[id] as NonNullable<(typeof state.tiles)[TileId]>),
        attrs: { ...(state.tiles[id]?.attrs ?? {}), red: true },
      },
    },
  };
}

/**
 * 의심 1 — 삼원의 의지의 재료가 도라·적도라를 태웠다.
 * 형제(분열 `tile_split`·허장성세 `bluff_pretense`)와 같은 공용 가드
 * `isPreciousMaterial`을 끼웠다.
 */
describe("three_dragons_will — 도라·적도라는 재료가 되지 않는다", () => {
  /** 白白白 發發發 中 + 잡패 — 재료 2장이 필요한 최소 손 */
  function scene(): GameState {
    const base = craft({
      hands: { p0: "555z666z7z5p234m9s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(makeRed(base, "p0", "pin5"), "p0", [threeDragonsWill.id]);
  }

  it("고립된 적도라 대신 다른 잡패를 태운다", () => {
    const state = scene();
    const pin5 = (state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(state.tiles[id]?.kind as never) === "pin5",
    ) as TileId;

    const game = createStandardGameFromState(state, undefined, [threeDragonsWill]);
    installAugment(game.engine, threeDragonsWill, "p0", { yaku: game.yaku });

    const res = game.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
    expect(res.ok).toBe(true);

    const after = game.engine.state;
    // 中 커쯔는 실제로 섰고(재료 2장이 中으로 바뀌었다)
    const kinds = (after.zones[handZone("p0")]?.tileIds ?? []).map((id) =>
      kindKey(after.tiles[id]?.kind as never),
    );
    expect(kinds.filter((k) => k === "dragon3").length).toBe(3);
    // 적도라 5통은 그대로 살아 있어야 한다
    expect(kindKey(after.tiles[pin5]?.kind as never)).toBe("pin5");
    expect(after.tiles[pin5]?.attrs.red).toBe(true);
  });

  it("태울 것이 도라뿐이면 발동 자체가 막히지는 않는다", () => {
    // 잡패가 적도라 5통과 5삭 둘뿐 — 가드가 후보를 다 지워도 폴백이 돈다
    const base = craft({
      hands: { p0: "555z666z7z5p5s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const red = makeRed(makeRed(base, "p0", "pin5"), "p0", "sou5");
    const state = withAugments(red, "p0", [threeDragonsWill.id]);
    const game = createStandardGameFromState(state, undefined, [threeDragonsWill]);
    installAugment(game.engine, threeDragonsWill, "p0", { yaku: game.yaku });

    const res = game.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
    expect(res.ok).toBe(true);
    const after = game.engine.state;
    const kinds = (after.zones[handZone("p0")]?.tileIds ?? []).map((id) =>
      kindKey(after.tiles[id]?.kind as never),
    );
    expect(kinds.filter((k) => k === "dragon3").length).toBe(3);
  });
});
