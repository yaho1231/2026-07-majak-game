/**
 * 거신병 후리텐 / 통째로 바꾸기 손패 부족 (docs/25 국면 #3·#6, 손패 #1).
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { giantGod } from "../src/augments/giant_god.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";

const ORPHANS = "19m19p19s1234567z";

describe("마작의 거신병 — 되가져온 요구패는 후리텐이 아니다 (docs/25 국면 #3)", () => {
  function scene(): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      // 바닥에 국사 13종이 전부 있어야 발동한다 → 그 13종이 전부 버림 이력에 남는다
      hands: { p0: "234m567m234p567p88s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: ORPHANS },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs = base.round.byPlayer["p0"];
    if (rs === undefined) throw new Error("no p0");
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["giant_god"] } : p,
      ),
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          // 바닥에 있는 13종은 당연히 버림 이력에도 있다
          p0: {
            ...rs,
            discardedKinds: (base.zones[discardsZone("p0")]?.tileIds ?? []).map((id) =>
              kindKey(kindOf(base, id)),
            ),
          },
        },
      },
    };
    const game = createStandardGameFromState(state, undefined, [giantGod]);
    installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
    return game;
  }

  it("각성 후 손에 든 요구패 종류가 버림 이력에서 빠진다", () => {
    const game = scene();
    const before = game.engine.state.round.byPlayer["p0"]?.discardedKinds ?? [];
    expect(before.length).toBeGreaterThanOrEqual(13);

    const res = game.engine.submit({ player: "p0", type: "giant_god", payload: {} });
    if (!res.ok) throw new Error(`giant_god rejected: ${res.reason}`);

    const s = game.engine.state;
    const history = s.round.byPlayer["p0"]?.discardedKinds ?? [];
    // **되가져온 요구패 13종**이 이력에 남아 있으면 13면 전부 후리텐이 된다.
    // (손에 남은 다른 패는 별개다 — 88s처럼 한 장을 실제로 버렸다면 그 종류가
    //  이력에 있는 것이 맞고, 그 패에 대한 후리텐은 정상이다.)
    const orphanKeys = new Set(
      handIdsOf(s, "p0")
        .map((id) => kindOf(s, id))
        .filter(
          (k) =>
            k.suit === "wind" ||
            k.suit === "dragon" ||
            k.rank === 1 ||
            k.rank === 9,
        )
        .map(kindKey),
    );
    expect(orphanKeys.size).toBe(13);
    for (const key of orphanKeys) {
      expect(history).not.toContain(key);
    }
  });

  it("바닥으로 내려간 패는 버림 이력에 더해진다 (상대의 안전패 판단이 맞도록)", () => {
    const game = scene();
    game.engine.submit({ player: "p0", type: "giant_god", payload: {} });
    const s = game.engine.state;
    const history = s.round.byPlayer["p0"]?.discardedKinds ?? [];
    const pondKeys = (s.zones[discardsZone("p0")]?.tileIds ?? []).map((id) =>
      kindKey(kindOf(s, id)),
    );
    // 이력이 곧 바닥이라는 관계가 회복된다 (장수까지 일치)
    expect([...history].sort()).toEqual([...pondKeys].sort());
  });
});

describe("통째로 바꾸기 — 후로 직후에는 발동하지 않는다 (docs/25 손패 #1)", () => {
  function scene(drawn: boolean): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "123p456p789p11s2s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      ...(drawn ? { drawnLastFor: "p0" as PlayerId } : {}),
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["full_hand_swap"] } : p,
      ),
      round: { ...base.round, lastDrawnTile: drawn ? base.round.lastDrawnTile : null },
    };
    const game = createStandardGameFromState(state, undefined, [fullHandSwap]);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
    return game;
  }

  it("쯔모패가 없는 순(후로 직후)에는 거부된다", () => {
    const res = scene(false).engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no drawn tile");
  });

  it("쯔모를 마친 순에는 그 사유로 막히지 않는다 (회귀 방지)", () => {
    const res = scene(true).engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    if (!res.ok) expect(res.reason).not.toBe("no drawn tile");
  });
});
