/**
 * 한 끗 차이 (off_by_one) × 적도라 표식 — 회귀.
 *
 * 밀어 넣기는 쯔모패의 **숫자를 바꾼다**. 적5를 4나 6으로 밀면 존재할 수 없는
 * '적4·적6'이 생기고 정산에 +1판이 그대로 따라붙는다(연금술사가 2026-07-29에
 * 같은 이유로 고쳐진 그 버그).
 *
 * 지금은 `TILE_KIND_CHANGED` 리듀서가 "종류가 실제로 바뀌면 red/redFor를 뗀다"를
 * 보장하므로(#57, `red_attr_on_kind_change.test.ts`) off_by_one은 개별 처리 없이도
 * 안전하다. 이 테스트는 **그 보장이 이 카드의 실제 경로에서 지켜지는지**를 고정한다 —
 * 리듀서의 기본값이 언젠가 되돌려지면 여기서 걸린다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  createInitialGameState,
  evaluateWin,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { offByOne } from "../src/augments/off_by_one.js";

/**
 * p0가 4p/9s 샹퐁 대기로 리치한 채 **적5통**을 쯔모하는 판.
 * 5p는 대기가 아니고 4p의 이웃이므로 한 끗 차이가 4p로 민다.
 */
function scene(): GameState {
  const base = craft({
    hands: {
      p0: "123m789m123p44p99s",
      p1: "111s222s333s777s7s",
      p2: "555m666m777m888m9m",
      p3: "111m222m333m444m1p",
    },
    phase: "turn.draw",
    turnSeat: 0,
  });

  // 패산 맨 위를 5p로 (sys.draw는 wall[0]을 뽑는다). 왕패에 있으면 맞바꾼다.
  const wall = [...base.zones[WALL]!.tileIds];
  const dead = [...(base.zones[DEAD_WALL]?.tileIds ?? [])];
  let pin5 = wall.find((id) => kindKey(base.tiles[id]!.kind) === "pin5");
  let zonesPatch: GameState["zones"] = {};
  if (pin5 === undefined) {
    pin5 = dead.find((id) => kindKey(base.tiles[id]!.kind) === "pin5");
    if (pin5 === undefined) throw new Error("5p가 어디에도 없다");
    const head = wall[0]!;
    zonesPatch = {
      [DEAD_WALL]: {
        ...base.zones[DEAD_WALL]!,
        tileIds: dead.map((id) => (id === pin5 ? head : id)),
      },
    };
    wall[0] = pin5;
  }

  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["off_by_one"] } : p,
    ),
    // 그 5p를 적도라로 못 박는다 (기본 배분이 어디에 넣든 상관없이)
    tiles: {
      ...base.tiles,
      [pin5]: {
        ...base.tiles[pin5]!,
        attrs: { ...base.tiles[pin5]!.attrs, red: true },
      },
    },
    zones: {
      ...base.zones,
      ...zonesPatch,
      [WALL]: {
        ...base.zones[WALL]!,
        tileIds: [pin5, ...wall.filter((id) => id !== pin5)],
      },
    },
    round: {
      ...base.round,
      // 도라 표시패를 비워 도라 판을 0으로 — 이 테스트가 보는 건 적도라뿐이다
      doraIndicators: [],
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...base.round.byPlayer["p0"]!,
          riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
        },
      },
    },
  };
}

describe("off_by_one — 밀어 넣은 패는 적도라를 잃는다", () => {
  it("적5를 밀면 red·redFor가 떨어지고 conjured가 찍힌다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();

    const st = game.engine.state;
    const drawn = st.round.lastDrawnTile as TileId;
    // 실제로 밀렸다
    expect(kindKey(kindOf(st, drawn))).toBe("pin4");

    const tile = st.tiles[drawn]!;
    expect(tile.attrs.conjured).toBe(true);
    expect(tile.attrs.red).toBeUndefined();
    expect(tile.attrs.redFor).toBeUndefined();

    // 존재할 수 없는 '적4통'이 게임 어디에도 없다
    const redPin4 = Object.values(st.tiles).filter(
      (t) => t.attrs.red === true && t.kind.suit === "pin" && t.kind.rank === 4,
    ).length;
    expect(redPin4).toBe(0);
  });

  it("정산에 적도라 판이 붙지 않는다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();

    const st = game.engine.state;
    const drawn = st.round.lastDrawnTile as TileId;
    const ev = evaluateWin(
      buildWinContext(st, "p0", "tsumo", drawn, { rules: game.engine.rules }),
      game.yaku,
    );
    expect(ev).not.toBeNull();
    // 손패의 유일한 적도라 후보가 방금 밀린 그 패다 — 표식이 따라왔다면 여기서 1이 뜬다
    expect(ev?.redHan ?? 0).toBe(0);
    expect(ev?.han).toBe(
      (ev?.yakuHan ?? 0) + (ev?.doraHan ?? 0) + (ev?.uraHan ?? 0) + (ev?.redHan ?? 0),
    );
  });
});
