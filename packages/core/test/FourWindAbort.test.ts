/**
 * 사풍연타(fourWind) 판정은 **각자의 첫 버림**으로 본다 — 바닥의 현재 장수가 아니라.
 *
 * 예전에는 네 바닥이 정확히 1장씩인지로 셌다. 그러면 첫 바퀴에 개입하는 증강 하나만
 * 있어도 판정이 조용히 무너진다(docs/25 방해 #9):
 *  - 날치기(pond_snatch)가 남의 바닥에서 한 장을 가져가면 그 바닥이 0장 → 성립해야 할
 *    도중유국이 안 난다.
 *  - 시간 정지(time_stop)로 한 사람이 두 번 버리면 그 바닥이 2장 → 역시 안 난다.
 * 버림 이력의 **첫 장**을 보면 바닥을 어떻게 헤집어도 판정이 흔들리지 않는다.
 * (누명 frame_up은 이력 자체를 남에게 돌리므로 첫 바퀴 발동이 따로 막혀 있다.)
 */

import { describe, expect, it } from "vitest";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { createInitialGameState, setupRound } from "../src/engine/state/GameState.js";
import { discardsZone, handZone } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { GameState } from "../src/engine/state/GameState.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import type { TileId } from "../src/mahjong/tiles/Tile.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];
/** 동(wind 1) */
const EAST = { suit: "wind" as const, rank: 1 };

/** 네 사람이 전부 동을 첫 버림으로 낸 상태 (첫 바퀴 유지) */
function fourEastState(): GameState {
  const base = setupRound(
    createInitialGameState(
      { seed: 7, playerIds: [...PLAYERS] },
      { startScore: 25000, redFivesPerSuit: 1 },
    ),
  );
  // 동 4장을 찾아 네 사람 바닥에 한 장씩 놓는다
  const eastIds = Object.values(base.tiles)
    .filter((t) => kindKey(t.kind) === kindKey(EAST))
    .map((t) => t.id);
  let zones = { ...base.zones };
  const byPlayer = { ...base.round.byPlayer };
  PLAYERS.forEach((p, i) => {
    const id = eastIds[i] as TileId;
    // 손패·패산 어디에 있든 빼내고 그 사람 바닥에 넣는다
    for (const [zid, z] of Object.entries(zones)) {
      if (z.tileIds.includes(id)) {
        zones[zid] = { ...z, tileIds: z.tileIds.filter((t) => t !== id) };
      }
    }
    const dz = zones[discardsZone(p)];
    zones[discardsZone(p)] = { ...(dz as NonNullable<typeof dz>), tileIds: [id] };
    byPlayer[p] = {
      ...byPlayer[p]!,
      discardedKinds: [kindKey(EAST)],
      discardCount: 1,
    };
  });
  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: "turn.draw",
      turnSeat: 0,
      firstTurn: true,
      byPlayer,
    },
  };
}

/** FlowController를 한 번 돌려 도중유국이 났는지 본다 */
function abortsAsFourWind(state: GameState): boolean {
  const game = createStandardGameFromState(state);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  return status.kind === "roundOver" && status.outcome === "abort";
}

describe("사풍연타 판정", () => {
  it("네 명의 첫 버림이 모두 동이면 도중유국 (기준선)", () => {
    expect(abortsAsFourWind(fourEastState())).toBe(true);
  });

  it("한 사람의 바닥에서 패가 빠져나가도(날치기) 판정이 유지된다", () => {
    const base = fourEastState();
    const zone = base.zones[discardsZone("p1")];
    const robbed: GameState = {
      ...base,
      zones: {
        ...base.zones,
        // 바닥은 비었지만 버림 이력은 남는다 — 날치기가 가져간 상황
        [discardsZone("p1")]: { ...(zone as NonNullable<typeof zone>), tileIds: [] },
      },
    };
    expect(abortsAsFourWind(robbed)).toBe(true);
  });

  it("한 사람이 두 번 버려도(시간 정지) 첫 버림 넷이 동이면 성립한다", () => {
    const base = fourEastState();
    const rs = base.round.byPlayer["p2"]!;
    const zone = base.zones[discardsZone("p2")];
    const extraId = base.zones[handZone("p2")]?.tileIds[0] as TileId;
    const twice: GameState = {
      ...base,
      zones: {
        ...base.zones,
        [handZone("p2")]: {
          ...(base.zones[handZone("p2")] as NonNullable<typeof zone>),
          tileIds: (base.zones[handZone("p2")]?.tileIds ?? []).slice(1),
        },
        [discardsZone("p2")]: {
          ...(zone as NonNullable<typeof zone>),
          tileIds: [...(zone?.tileIds ?? []), extraId],
        },
      },
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p2: {
            ...rs,
            discardedKinds: [...rs.discardedKinds, kindKey({ suit: "man", rank: 1 })],
            discardCount: 2,
          },
        },
      },
    };
    expect(abortsAsFourWind(twice)).toBe(true);
  });

  it("첫 버림이 서로 다르면 성립하지 않는다 (대조군)", () => {
    const base = fourEastState();
    const rs = base.round.byPlayer["p3"]!;
    const differs: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p3: { ...rs, discardedKinds: [kindKey({ suit: "wind", rank: 2 })] },
        },
      },
    };
    expect(abortsAsFourWind(differs)).toBe(false);
  });
});
