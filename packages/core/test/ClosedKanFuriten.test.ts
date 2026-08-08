/**
 * 안깡을 "거절"해도 후리텐이 찍히던 버그의 회귀 테스트 (docs/28 §2-1).
 *
 * 안깡은 표준 룰상 **국사무쌍 외에는 창깡 대상이 아니다** — 론 자체가 불가능하니
 * 넘긴 화료도 없다. 그런데 markPassFuriten이 `chankan`만 보고 `closedKan`을 보지
 * 않아, 남 셋이 그 패로 동순 후리텐이 되고 **리치 중이면 영구 후리텐**이 됐다.
 *
 * 바로 위(win.ronImmune, 천하무적)에서 고친 것과 같은 종류의 실수다:
 * 규칙이 론을 막았다면 후리텐도 붙지 않는다.
 */

import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState, Meld } from "../src/engine/state/GameState.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** 원하는 손패로 turn.act 스냅샷을 만든다 (Augment.test.ts의 craft를 이 테스트에 맞게 축약) */
function craft(hands: Record<PlayerId, string>, drawnLastFor: PlayerId): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 0 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };

  const zones = { ...base.zones };
  const byPlayer = { ...base.round.byPlayer };
  const fillLater: PlayerId[] = [];
  for (const p of PLAYERS) {
    const spec = hands[p] ?? "";
    if (spec === "*") {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    } else {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(spec).map(take),
      };
    }
    zones[meldsZone(p)] = { ...createZone(meldsZone(p), "melds", p), tileIds: [] };
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: [],
    };
    byPlayer[p] = {
      riichi: null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds: [] as Meld[],
      discardedKinds: [],
      discardCount: 0,
      tsumogiriIds: [],
    };
  }

  let rest = [...pool.values()].flat().sort((a, b) => a - b);
  for (const p of fillLater) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: rest.slice(0, 13),
    };
    rest = rest.slice(13);
  }
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: "turn.act",
      turnSeat: 0,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: zones[handZone(drawnLastFor)]?.tileIds.at(-1) ?? null,
      lastDiscard: null,
      firstTurn: false,
      byPlayer,
    },
  };
}

function withRiichi(state: GameState, player: PlayerId): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`no round state for ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [player]: {
          ...rs,
          riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
        },
      },
    },
  };
}

/** p0가 `kindSpec` 4장으로 안깡을 치고, 남은 셋이 전부 패스한다 */
function ankanThenPass(
  game: ReturnType<typeof createStandardGameFromState>,
  kindSpec: string,
): void {
  const s = game.engine.state;
  const want = kindKey(h(kindSpec)[0] as TileKind);
  const ids = (s.zones[handZone("p0")]?.tileIds ?? []).filter(
    (id) => kindKey(s.tiles[id]!.kind) === want,
  );
  if (ids.length !== 4) throw new Error(`p0 does not hold four ${kindSpec}`);
  const flow = new FlowController(game.engine);
  flow.begin();
  let status = flow.submit("p0", { type: "ankan", payload: { tileIds: ids } });
  for (let guard = 0; guard < 8 && status.kind === "awaiting"; guard++) {
    const prompt = status.prompts[0];
    if (prompt === undefined) break;
    const pass = prompt.options.find((o) => o.type === "pass");
    if (pass === undefined) break;
    status = flow.submit(prompt.player, pass);
  }
}

describe("안깡 — 론할 수 없었던 사람은 후리텐이 되지 않는다", () => {
  it("리치자의 대기패로 안깡을 쳐도 리치 후리텐이 찍히지 않는다", () => {
    // p1: 34m123p456p789p11s 리치 (2m/5m 대기) · p0: 5만 4장으로 안깡
    const state = withRiichi(
      craft(
        {
          p0: "5555m22334455p66s",
          p1: "34m123p456p789p11s",
          p2: "*",
          p3: "*",
        },
        "p0",
      ),
      "p1",
    );
    const game = createStandardGameFromState(state);
    ankanThenPass(game, "5m");

    const rs = game.engine.state.round.byPlayer["p1"];
    // 예전에는 둘 다 true였다 → p1은 그 국 내내 누구에게서도 론할 수 없었다
    expect(rs?.riichiFuriten).toBe(false);
    expect(rs?.temporaryFuriten).toBe(false);
  });

  it("리치가 아니어도 동순 후리텐이 찍히지 않는다", () => {
    const state = craft(
      { p0: "5555m22334455p66s", p1: "34m123p456p789p11s", p2: "*", p3: "*" },
      "p0",
    );
    const game = createStandardGameFromState(state);
    ankanThenPass(game, "5m");

    expect(game.engine.state.round.byPlayer["p1"]?.temporaryFuriten).toBe(false);
  });

  it("국사무쌍 텐파이는 안깡을 론할 수 있었으므로, 넘기면 후리텐이 찍힌다", () => {
    // p1: 99m19p19s1234567z — 1m 단기 국사 대기. p0가 1만 안깡 → p1은 창깡 가능.
    const state = withRiichi(
      craft(
        { p0: "1111m22334455p66s", p1: "99m19p19s1234567z", p2: "*", p3: "*" },
        "p0",
      ),
      "p1",
    );
    const game = createStandardGameFromState(state);
    ankanThenPass(game, "1m");

    expect(game.engine.state.round.byPlayer["p1"]?.riichiFuriten).toBe(true);
  });
});
