/**
 * 리치 중 안깡 — **지킬 대기가 없는 리치는 손이 완전히 잠긴다**.
 *
 * 배경(QA verify-score 확정 4, 2026-08-20): `isRiichiSafeAnkan`은 "깡 전후의 대기
 * 집합이 같으면 허용"이라는 표준 규칙인데, 노텐 리치(공성계 siege_riichi 등)는
 * `before = after = ∅`라 **어떤 안깡이든** 통과했다. 남이 이미 깡 3개를 만들어 둔
 * 국에서 대기와 무관한 아무 안깡 하나로 사깡산료를 성립시켜 국을 통째로 무효화하고
 * (델타 전원 0), 카드가 약속한 노텐 벌부 3,000을 회피할 수 있었다.
 *
 * 진짜 리치는 언제나 텐파이라 이 가드에 걸리지 않는다 — 아래 대조군 둘이 그걸 못박는다.
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

/** p0에게 지정한 손패를 쥐여 준 turn.act 스냅샷 (마지막 패가 쯔모패다) */
function craft(p0hand: string): GameState {
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
    if (p === "p0") {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(p0hand).map(take),
      };
    } else {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    }
    zones[meldsZone(p)] = { ...createZone(meldsZone(p), "melds", p), tileIds: [] };
    zones[discardsZone(p)] = { ...createZone(discardsZone(p), "discards", p), tileIds: [] };
    byPlayer[p] = {
      riichi:
        p === "p0"
          ? { double: false, ippatsu: false, discardIndex: 0, cost: 1000 }
          : null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds: [] as Meld[],
      discardedKinds: [],
      discardCount: 0,
      tsumogiriIds: [],
      ownDiscards: [],
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
      turnCount: 1,
      riichiPot: 1000,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: zones[handZone("p0")]?.tileIds.at(-1) ?? null,
      lastDiscard: null,
      firstTurn: false,
      byPlayer,
    },
  };
}

/** 쯔모패와 같은 종류 4장으로 안깡을 시도한다 */
function tryAnkan(p0hand: string): { ok: boolean; reason?: string } {
  const state = craft(p0hand);
  const game = createStandardGameFromState(state);
  const ids = state.zones[handZone("p0")]?.tileIds ?? [];
  const drawn = state.round.lastDrawnTile;
  if (drawn === null) throw new Error("쯔모패가 없다");
  const key = kindKey(state.tiles[drawn]!.kind);
  const quad = ids.filter((id) => kindKey(state.tiles[id]!.kind) === key);
  expect(quad).toHaveLength(4);
  const r = game.engine.submit({
    player: "p0",
    type: "ankan",
    payload: { tileIds: quad } as never,
  });
  return r.ok
    ? { ok: true }
    : { ok: false, reason: String((r as { reason?: unknown }).reason) };
}

describe("리치 중 안깡 — 대기가 없으면 아무 안깡도 못 친다", () => {
  it("노텐 리치는 4장 짝이 있어도 안깡이 거부된다", () => {
    // 1z·2z·3z가 각각 4장. 쯔모패(마지막 패)는 3z. 13장 손패는 명백히 노텐이다.
    const r = tryAnkan("5m6p1111z2222z3333z");
    // ★ 회귀 지점: 예전에는 before = after = ∅ 라 `sameKindSet`이 무조건 통과시켰고,
    //   이 안깡 하나로 사깡산료(도중유국)를 만들어 노텐 벌부를 회피할 수 있었다.
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("riichi");
  });

  it("텐파이 리치에서 대기를 바꾸는 안깡은 여전히 거부된다 (표준 규칙 유지)", () => {
    // 구련보등형 — 1m 안깡은 대기 집합을 통째로 바꾼다.
    const r = tryAnkan("999m2345678m1111m");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("riichi");
  });

  it("텐파이 리치에서 대기를 바꾸지 않는 안깡은 계속 허용된다 (가드가 표준을 깨지 않는다)", () => {
    // 345m 678m 99p 55s + 안커 222m. 쯔모 2m으로 안깡해도 샹퐁 대기(9p/5s)는 그대로다.
    const r = tryAnkan("345m678m99p55s2222m");
    expect(r).toEqual({ ok: true });
  });
});
