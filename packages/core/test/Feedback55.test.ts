/**
 * 플레이 피드백 대응으로 코어에 넣은 변경 3건의 회귀 테스트.
 *
 * 1) `mixedTriplets` — 무너진 국경이 슌쯔뿐 아니라 **커쯔·후로(치·펑·깡)** 까지 무늬를 안 가린다
 * 2) `TileAttrs.redFor` — 증강이 만든 적도라는 **만든 사람만** 센다
 * 3) `yakulessWaits` — 역이 없어 론이 안 되는 대기패를 골라낸다("오름패인데 왜 못 먹지?" 방지)
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
import { decompose, isWinningShape } from "../src/mahjong/scoring/decompose.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { buildWinContext, yakulessWaits } from "../src/mahjong/flow/helpers.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

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

function craft(cfg: {
  hands: Record<PlayerId, string>;
  discards?: Record<PlayerId, string>;
  melds?: Partial<Record<PlayerId, { kind: Meld["kind"]; spec: string }[]>>;
  phase: string;
  turnSeat: number;
  drawnLastFor?: PlayerId;
}): GameState {
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
    const spec = cfg.hands[p] ?? "";
    if (spec === "*") {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    } else {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(spec).map(take),
      };
    }
    const meldTiles: TileId[] = [];
    const melds: Meld[] = (cfg.melds?.[p] ?? []).map((m) => {
      const ids = h(m.spec).map(take);
      meldTiles.push(...ids);
      return { kind: m.kind, tileIds: ids };
    });
    zones[meldsZone(p)] = {
      ...createZone(meldsZone(p), "melds", p),
      tileIds: meldTiles,
    };
    const discardIds = h(cfg.discards?.[p] ?? "").map(take);
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: discardIds,
    };
    byPlayer[p] = {
      riichi: null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
      discardCount: h(cfg.discards?.[p] ?? "").length,
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

  const drawn =
    cfg.drawnLastFor === undefined
      ? null
      : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null);

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: cfg.phase,
      turnSeat: cfg.turnSeat,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: drawn,
      lastDiscard: null,
      firstTurn: false,
      byPlayer,
    },
  };
}

function holderRule(
  game: ReturnType<typeof createStandardGameFromState>,
  rule: string,
  holder: PlayerId,
  value: unknown,
): void {
  game.engine.rules.addModifier(rule, {
    source: `test:${rule}:${holder}`,
    layer: RuleLayer.Prism,
    apply: (cur, c) => (c.playerId === holder ? value : cur),
  });
}

describe("mixedTriplets — 혼색 커쯔 (무너진 국경 확장)", () => {
  it("기본값에서는 2만·2통·2삭이 커쯔가 아니다", () => {
    // 222(혼색) + 456m + 789m + 111z + 99p → 혼색 커쯔가 없으면 화료형이 아니다
    const hand = h("2m2p2s456m789m111z99p");
    expect(isWinningShape(hand, 0)).toBe(false);
  });

  it("mixedTriplets를 켜면 혼색 커쯔로 화료형이 성립한다", () => {
    const hand = h("2m2p2s456m789m111z99p");
    expect(isWinningShape(hand, 0, { mixedTriplets: true })).toBe(true);
    const forms = decompose(hand, 0, { mixedTriplets: true });
    const std = forms.filter((f) => f.form === "standard");
    expect(std.length).toBeGreaterThan(0);
    // 무늬가 2종 이상인 커쯔가 실제로 만들어졌다
    const mixed = std.some((f) =>
      f.sets.some(
        (set) =>
          set.type === "triplet" &&
          new Set(set.tiles.map((t) => t.suit)).size >= 2,
      ),
    );
    expect(mixed).toBe(true);
  });

  it("무늬가 섞여도 랭크가 다르면 커쯔가 아니다", () => {
    expect(isWinningShape(h("2m3p4s456m789m111z99p"), 0, { mixedTriplets: true })).toBe(
      false,
    );
  });

  it("자패는 무늬 개념이 없어 기존처럼 동일 패 3장만 커쯔다", () => {
    // 동·남·서를 한 커쯔로 묶을 수 있으면 화료형이 되는 손 — 되면 안 된다
    expect(
      isWinningShape(h("123z456m789m123p99p"), 0, { mixedTriplets: true }),
    ).toBe(false);
  });

  it("혼색 커쯔가 켜져도 순수 커쯔 분해는 그대로 남는다", () => {
    const hand = h("222m456m789m123p99p");
    expect(isWinningShape(hand, 0)).toBe(true);
    expect(isWinningShape(hand, 0, { mixedTriplets: true })).toBe(true);
  });

  it("펑·대명깡·안깡 validate가 무늬를 안 가린다 (scoring.mixedTriplets)", () => {
    const state = craft({
      hands: { p0: "2m2p2s2m456m789m1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const hand = game.engine.state.zones[handZone("p0")]?.tileIds ?? [];
    const kindOfId = (id: TileId): TileKind => game.engine.state.tiles[id]!.kind;
    const twoM = hand.filter((id) => kindKey(kindOfId(id)) === "man2");
    const twoP = hand.find((id) => kindKey(kindOfId(id)) === "pin2") as TileId;
    const twoS = hand.find((id) => kindKey(kindOfId(id)) === "sou2") as TileId;
    const ankan = game.engine.actions.get("ankan");
    if (ankan === undefined) throw new Error("no ankan action");
    const ids = [twoM[0] as TileId, twoM[1] as TileId, twoP, twoS];

    // 기본값: 무늬가 다르면 안깡이 아니다
    expect(
      ankan.validate(
        { player: "p0", type: "ankan", payload: { tileIds: ids } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("tiles are not identical");

    // 무너진 국경: 랭크만 같으면 안깡이 된다
    holderRule(game, "scoring.mixedTriplets", "p0", true);
    expect(
      ankan.validate(
        { player: "p0", type: "ankan", payload: { tileIds: ids } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBeNull();
  });
});

describe("TileAttrs.redFor — 증강이 만든 적도라의 소유권", () => {
  /** p0의 손패 한 장에 적도라를 붙인 상태를 만든다 */
  function withRed(owner?: PlayerId) {
    const state = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const target = state.zones[handZone("p0")]?.tileIds[0] as TileId;
    const tile = state.tiles[target]!;
    return createStandardGameFromState({
      ...state,
      tiles: {
        ...state.tiles,
        [target]: {
          ...tile,
          attrs: {
            ...tile.attrs,
            red: true,
            ...(owner !== undefined ? { redFor: owner } : {}),
          },
        },
      },
    });
  }

  const redCountOf = (
    game: ReturnType<typeof createStandardGameFromState>,
  ): number => {
    const st = game.engine.state;
    return (
      buildWinContext(st, "p0", "tsumo", st.round.lastDrawnTile as TileId, {
        rules: game.engine.rules,
      }).redCount ?? 0
    );
  };

  it("소유자 표시가 없는 적도라(패산의 진짜 적도라)는 그대로 센다", () => {
    expect(redCountOf(withRed())).toBe(1);
  });

  it("내가 만든 적도라는 내가 화료할 때 센다", () => {
    expect(redCountOf(withRed("p0"))).toBe(1);
  });

  it("남이 만든 적도라는 내 화료에서 세지 않는다", () => {
    expect(redCountOf(withRed("p1"))).toBe(0);
  });
});

describe("yakulessWaits — 역이 없어 못 먹는 대기패", () => {
  it("역이 붙는 대기는 목록에 없다", () => {
    // 멘젠 탕야오 텐파이 — 론해도 탕야오가 붙는다
    const state = craft({
      hands: { p0: "234m345p456s678s2s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const game = createStandardGameFromState(state);
    expect(
      yakulessWaits(game.engine.state, "p0", game.engine.rules, game.yaku),
    ).toEqual([]);
  });

  it("후로해서 역이 사라진 손은 그 대기가 역없음으로 잡힌다", () => {
    // 1삭을 펑해 열린 손 + 요구패(1s·9s)가 섞여 탕야오도 안 되고,
    // 슌쯔 배열이 일기통관·삼색과도 어긋나 역이 하나도 붙지 않는 형태
    const state = craft({
      hands: { p0: "234m567m234p9s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "111s" }] },
      phase: "turn.act",
      turnSeat: 1,
    });
    const game = createStandardGameFromState(state);
    const dead = yakulessWaits(game.engine.state, "p0", game.engine.rules, game.yaku);
    // 이 손의 대기(9s 단기)는 역이 하나도 없다 → 목록에 잡혀야 한다
    expect(dead.length).toBeGreaterThan(0);
  });

  it("리치 중이면 리치가 역이 되므로 목록이 비어 있다", () => {
    const base = craft({
      hands: { p0: "234m567m234p9s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed", spec: "1111s" }] },
      phase: "turn.act",
      turnSeat: 1,
    });
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer.p0!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    const game = createStandardGameFromState(state);
    expect(
      yakulessWaits(game.engine.state, "p0", game.engine.rules, game.yaku),
    ).toEqual([]);
  });
});
