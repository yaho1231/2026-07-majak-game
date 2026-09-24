/**
 * 모래시계(sandglass) · 위그드라실(yggdrasil) — 2026-09-24 신규 2종.
 *
 * 모래시계
 *  1. 고른 손패 3장이 패산 맨 위로, 패산 맨 위 3장이 손으로 온다 (장수 불변).
 *  2. 2국에 1회 — 쓴 뒤 2국이 지나야 다시 열린다.
 *  3. 패산이 3장 이하면 쓸 수 없다. 리치 중에는 쓸 수 없다.
 *  4. 쯔모패를 내보내면 들어온 패가 새 쯔모패가 된다.
 *
 * 위그드라실
 *  1. 발동하면 손패의 자패만 발이 된다 (수패·후로는 그대로).
 *  2. 켜진 국에 쯔모한 자패도 발이 된다. 수패 쯔모는 그대로다.
 *  3. 발로만 화료하면 더블 역만 위그드라실 — 다른 역만(자일색·스안커)과 중첩되지 않는다.
 *  4. 발동하지 않은 국에는 역이 서지 않는다.
 *  5. 동풍전 1회 · 반장전 2회. 리치 중에는 발동할 수 없다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_STARTED,
  TILE_DRAWN,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  handIdsOf,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const HATSU: TileKind = { suit: "dragon", rank: 2 };

function withAug(state: GameState, holder: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

function mk(
  aug: "sandglass" | "yggdrasil",
  hand: string,
  opts: { mode?: "tonpuu" | "hanchan"; melds?: { kind: "pon"; spec: string }[] } = {},
): Game {
  let state = withAug(
    craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      drawnLastFor: "p0",
      ...(opts.melds !== undefined ? { melds: { p0: opts.melds } } : {}),
      phase: "turn.act",
      turnSeat: 0,
    }),
    "p0",
    [aug],
  );
  if (opts.mode !== undefined) state = { ...state, config: { ...state.config, mode: opts.mode } };
  const game = createStandardGameFromState(state);
  installAugment(game.engine, aug === "sandglass" ? C.sandglass : C.yggdrasil, "p0", {
    yaku: game.yaku,
  });
  return game;
}

function emit(game: Game, event: { type: string; payload: unknown }): void {
  if (!game.engine.actions.has("__test_emit")) {
    game.engine.actions.register({
      type: "__test_emit",
      validate: () => null,
      toEvents: (req) => [req.payload as { type: string; payload: unknown }],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_emit", payload: event });
  if (!res.ok) throw new Error(`emit failed: ${res.reason}`);
}

const wall = (g: Game): TileId[] => [...(g.engine.state.zones[WALL]?.tileIds ?? [])];
const hand = (g: Game): TileId[] => handIdsOf(g.engine.state, "p0");
const kinds = (g: Game): string[] =>
  hand(g).map((id) => kindKey(g.engine.state.tiles[id]!.kind)).sort();

function swap(g: Game, tileIds: TileId[]) {
  return g.engine.submit({
    player: "p0",
    type: "sandglass_swap",
    payload: { tileIds: [...tileIds].sort((a, b) => a - b) },
  });
}

/** 손패 **밖**의 그 종류 실물 패 (없으면 null) */
function outside(g: Game, kind: TileKind): TileId | null {
  const inHand = new Set(hand(g));
  for (const t of Object.values(g.engine.state.tiles)) {
    if (!inHand.has(t.id) && kindKey(t.kind) === kindKey(kind)) return t.id;
  }
  return null;
}

/** 발이 아닌 자패인가 */
function isWindOrOtherDragon(g: Game, id: TileId): boolean {
  const k = g.engine.state.tiles[id]!.kind;
  return k.suit === "wind" || (k.suit === "dragon" && k.rank !== 2);
}

// ───────────────────────────── 모래시계 ─────────────────────────────

describe("모래시계 — 손패 3장 ↔ 패산 맨 위 3장", () => {
  it("고른 3장이 패산 맨 위로, 패산 맨 위 3장이 손으로 간다", () => {
    const g = mk("sandglass", "123m456p789s1122z3z");
    const out = hand(g).slice(0, 3);
    const top = wall(g).slice(0, 3);
    const wallLen = wall(g).length;
    expect(swap(g, out).ok).toBe(true);
    const sortedOut = [...out].sort((a, b) => a - b);
    expect(wall(g).slice(0, 3)).toEqual(sortedOut);
    expect(wall(g).length).toBe(wallLen);
    for (const id of top) expect(hand(g)).toContain(id);
    for (const id of out) expect(hand(g)).not.toContain(id);
    expect(hand(g).length).toBe(14);
  });

  it("쯔모패를 내보내면 들어온 패가 새 쯔모패가 된다", () => {
    const g = mk("sandglass", "123m456p789s1122z3z");
    const drawn = g.engine.state.round.lastDrawnTile;
    if (drawn == null) throw new Error("craft는 쯔모패를 세운다");
    const others = hand(g).filter((id) => id !== drawn).slice(0, 2);
    const top = wall(g).slice(0, 3);
    expect(swap(g, [drawn, ...others]).ok).toBe(true);
    expect(top).toContain(g.engine.state.round.lastDrawnTile);
  });

  it("2국에 1회 — 쓴 뒤 2국이 지나야 다시 열린다", () => {
    /** 국 시작을 n번 흘린 뒤(증강 기록 유지) 다시 내 순으로 세운 게임 */
    const after = (g: Game, n: number): Game => {
      for (let i = 0; i < n; i++) emit(g, { type: ROUND_STARTED, payload: {} });
      const prev = g.engine.state;
      const next = createStandardGameFromState({
        ...prev,
        round: { ...prev.round, phase: "turn.act", turnSeat: 0 },
      });
      installAugment(next.engine, C.sandglass, "p0", { yaku: next.yaku });
      return next;
    };
    const g = mk("sandglass", "123m456p789s1122z3z");
    expect(swap(g, hand(g).slice(0, 3)).ok).toBe(true);
    expect(swap(g, hand(g).slice(0, 3)).ok).toBe(false);
    const one = after(g, 1);
    expect(swap(one, hand(one).slice(0, 3)).ok).toBe(false);
    const two = after(one, 1);
    const r = swap(two, hand(two).slice(0, 3));
    expect(r.ok ? "ok" : r.reason).toBe("ok");
  });

  it("패산이 3장 이하면 쓸 수 없다", () => {
    const g = mk("sandglass", "123m456p789s1122z3z");
    const base = g.engine.state;
    const cut = (n: number): Game => {
      const w = base.zones[WALL]!;
      const next = createStandardGameFromState({
        ...base,
        zones: { ...base.zones, [WALL]: { ...w, tileIds: w.tileIds.slice(0, n) } },
      });
      installAugment(next.engine, C.sandglass, "p0", { yaku: next.yaku });
      return next;
    };
    const three = cut(3);
    expect(swap(three, hand(three).slice(0, 3)).ok).toBe(false);
    const four = cut(4);
    expect(swap(four, hand(four).slice(0, 3)).ok).toBe(true);
  });

  it("리치 중에는 쓸 수 없다", () => {
    const g = mk("sandglass", "123m456p789s1122z3z");
    const s = g.engine.state;
    const riichi = createStandardGameFromState({
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false } as never },
        },
      },
    });
    installAugment(riichi.engine, C.sandglass, "p0", { yaku: riichi.yaku });
    expect(swap(riichi, hand(riichi).slice(0, 3)).ok).toBe(false);
  });
});

// ───────────────────────────── 위그드라실 ─────────────────────────────

function call(g: Game) {
  return g.engine.submit({ player: "p0", type: "yggdrasil_call", payload: {} });
}

describe("위그드라실 — 자패가 발이 된다", () => {
  it("발동하면 손패의 자패만 발이 되고 수패·후로는 그대로다", () => {
    const g = mk("yggdrasil", "123m45p1234567z", { melds: [{ kind: "pon", spec: "111z" }] });
    expect(call(g).ok).toBe(true);
    expect(kinds(g)).toEqual(
      ["man1", "man2", "man3", "pin4", "pin5", ...Array(7).fill(kindKey(HATSU))].sort(),
    );
    const meld = g.engine.state.round.byPlayer["p0"]!.melds[0]!;
    for (const id of meld.tileIds) {
      expect(kindKey(g.engine.state.tiles[id]!.kind)).toBe("wind1");
    }
  });

  it("켜진 국에 쯔모한 자패는 발이 되고, 수패 쯔모는 그대로다", () => {
    const g = mk("yggdrasil", "123m456p789s1122z");
    expect(call(g).ok).toBe(true);
    const w = wall(g);
    const honor = w.find((id) => isWindOrOtherDragon(g, id))!;
    const num = w.find((id) => g.engine.state.tiles[id]!.kind.suit !== "wind" && g.engine.state.tiles[id]!.kind.suit !== "dragon")!;
    const numKind = kindKey(g.engine.state.tiles[num]!.kind);
    emit(g, { type: TILE_DRAWN, payload: { player: "p0", tileId: honor, rinshan: false } });
    expect(kindKey(g.engine.state.tiles[honor]!.kind)).toBe(kindKey(HATSU));
    emit(g, { type: TILE_DRAWN, payload: { player: "p0", tileId: num, rinshan: false } });
    expect(kindKey(g.engine.state.tiles[num]!.kind)).toBe(numKind);
  });

  it("발동하지 않은 국의 자패 쯔모는 그대로다", () => {
    const g = mk("yggdrasil", "123m456p789s1122z");
    const honor = wall(g).find((id) => isWindOrOtherDragon(g, id))!;
    const before = kindKey(g.engine.state.tiles[honor]!.kind);
    emit(g, { type: TILE_DRAWN, payload: { player: "p0", tileId: honor, rinshan: false } });
    expect(kindKey(g.engine.state.tiles[honor]!.kind)).toBe(before);
  });

  it("발로만 화료하면 더블 역만 위그드라실 하나만 — 자일색·스안커와 중첩되지 않는다", () => {
    // 풍패 13장 → 발동하면 발 13장. 실물 발로 쯔모.
    const g = mk("yggdrasil", "1111222233334z");
    expect(call(g).ok).toBe(true);
    const tile = outside(g, HATSU)!;
    const ev = evaluateWin(
      buildWinContext(g.engine.state, "p0", "tsumo", tile, { rules: g.engine.rules }),
      g.yaku,
    );
    expect(ev?.ok).toBe(true);
    expect(ev?.yaku.map((y) => y.id)).toEqual(["yggdrasil"]);
    expect(ev?.yakumanCount).toBe(2);
  });

  it("발이 아닌 패가 섞이면 위그드라실이 아니다", () => {
    const g = mk("yggdrasil", "111m2222333344z");
    expect(call(g).ok).toBe(true);
    const tile = outside(g, HATSU)!;
    const ev = evaluateWin(
      buildWinContext(g.engine.state, "p0", "tsumo", tile, { rules: g.engine.rules }),
      g.yaku,
    );
    expect(ev?.ok).toBe(true);
    expect(ev?.yaku.map((y) => y.id)).not.toContain("yggdrasil");
  });

  it("발동하지 않았으면 실물 발 14장이라도(불가능하지만) 역이 서지 않는다 — 켜진 국 한정", () => {
    const g = mk("yggdrasil", "666z");
    // 발동 없이 역 검사: 켜짐 표식이 없으면 check가 false
    const def = g.yaku.get("yggdrasil");
    expect(def).toBeDefined();
    const ok = def!.check(
      { form: "standard", pair: HATSU, sets: [], waitType: "tanki", isClosed: true },
      { hand: [], melds: [], winningTile: HATSU, winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null, winnerId: "p0" },
    );
    expect(ok).toBe(false);
  });

  it("동풍전 1회 · 반장전 2회", () => {
    /** 증강 기록을 들고 본장만 올린 다음 국 */
    const next = (g: Game): Game => {
      const prev = g.engine.state;
      const n = createStandardGameFromState({
        ...prev,
        round: { ...prev.round, honba: prev.round.honba + 1 },
      });
      installAugment(n.engine, C.yggdrasil, "p0", { yaku: n.yaku });
      return n;
    };
    const t = mk("yggdrasil", "123m456p789s1122z", { mode: "tonpuu" });
    expect(call(t).ok).toBe(true);
    expect(call(t).ok).toBe(false); // 같은 국 재발동 불가
    expect(call(next(t)).ok).toBe(false);

    const hc = mk("yggdrasil", "123m456p789s1122z", { mode: "hanchan" });
    expect(call(hc).ok).toBe(true);
    const hc2 = next(hc);
    expect(call(hc2).ok).toBe(true);
    expect(call(next(hc2)).ok).toBe(false);
  });

  it("리치 중에는 발동할 수 없다", () => {
    const g = mk("yggdrasil", "123m456p789s1122z");
    const s = g.engine.state;
    const riichi = createStandardGameFromState({
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false } as never },
        },
      },
    });
    installAugment(riichi.engine, C.yggdrasil, "p0", { yaku: riichi.yaku });
    expect(call(riichi).ok).toBe(false);
  });
});
