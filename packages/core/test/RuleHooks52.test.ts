/**
 * RuleHooks52 — 52차(2026-07-22)에 신설한 코어 규칙 훅 7종의 회귀 테스트.
 *
 * 이 훅들은 docs/16_AUGMENT_REDESIGN.md §1b·§1c의 증강이 쓰는 확장 지점이다.
 * 증강 쪽 테스트와 별개로, **코어가 규칙을 실제로 읽는지**를 여기서 못박는다.
 *   riichi.blocked / win.minHan / riichi.hidden / win.closedKanRobbable /
 *   score.honbaPerStick / scoring.seatWind / round.keepDealer
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
import { buildWinContext } from "../src/mahjong/flow/helpers.js";
import { buildPlayerView } from "../src/information/PlayerView.js";
import { ROUND_SETTLED } from "../src/mahjong/flow/flowEvents.js";
import type { RoundSettledPayload } from "../src/mahjong/flow/flowEvents.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const SYS = "__system";

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

/** 원하는 손패·멜드로 국 중간 스냅샷을 만든다 (Augment.test.ts의 craft를 축약 이식) */
function craft(cfg: {
  hands: Record<PlayerId, string>;
  discards?: Record<PlayerId, string>;
  melds?: Partial<Record<PlayerId, { kind: Meld["kind"]; spec: string }[]>>;
  phase: string;
  turnSeat: number;
  drawnLastFor?: PlayerId;
  lastDiscard?: { player: PlayerId; spec: string };
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
  let lastDiscardRef: { player: PlayerId; tileId: TileId } | null = null;
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

  if (cfg.lastDiscard !== undefined) {
    const kind = h(cfg.lastDiscard.spec)[0] as TileKind;
    const tileId = take(kind);
    const zone = zones[discardsZone(cfg.lastDiscard.player)];
    zones[discardsZone(cfg.lastDiscard.player)] = {
      ...(zone as NonNullable<typeof zone>),
      tileIds: [...(zone?.tileIds ?? []), tileId],
    };
    lastDiscardRef = { player: cfg.lastDiscard.player, tileId };
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
      lastDiscard: lastDiscardRef,
      firstTurn: false,
      byPlayer,
    },
  };
}

function validateOf(
  game: ReturnType<typeof createStandardGameFromState>,
  type: string,
  player: PlayerId,
  payload: unknown = {},
): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`no ${type} action`);
  return def.validate(
    { player, type, payload },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** 특정 플레이어에게만 값을 고정하는 modifier (증강의 setHolderRule과 같은 모양) */
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

describe("riichi.blocked — 리치 봉인", () => {
  /** p0가 텐파이·멘젠이라 원래는 리치를 걸 수 있는 상태 */
  function riichiReady() {
    // 23m + 456p789p + 111s + 55z (13장) → 1m/4m 대기, 버릴 패를 넣어 14장으로
    const state = craft({
      hands: { p0: "23m456789p111s55z9m", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return createStandardGameFromState(state);
  }

  it("규칙이 기본값이면 리치를 걸 수 있다", () => {
    const game = riichiReady();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(validateOf(game, "riichi", "p0", { tileId: drawn })).toBeNull();
  });

  it("riichi.blocked가 켜지면 그 사람만 리치가 막힌다", () => {
    const game = riichiReady();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    holderRule(game, "riichi.blocked", "p0", true);
    expect(validateOf(game, "riichi", "p0", { tileId: drawn })).toBe(
      "riichi is sealed this round",
    );
    // 다른 사람에게는 영향이 없다 (규칙은 playerId 스코프)
    expect(
      game.engine.rules.resolve<boolean>("riichi.blocked", { playerId: "p1" }),
    ).toBe(false);
  });
});

describe("win.minHan — 최소 판 게이트 (격)", () => {
  /** 탕야오뿐인 싼 손(2판 미만)을 쯔모 직전 상태로 만든다 */
  function cheapTsumo() {
    // 234m 567m 234p 567p 55s = 탕야오 + 핑후 정도의 싼 손
    const state = craft({
      hands: { p0: "234567m234567p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return createStandardGameFromState(state);
  }

  it("기본값 0이면 싼 손도 화료할 수 있다", () => {
    const game = cheapTsumo();
    expect(validateOf(game, "win", "p0")).toBeNull();
  });

  it("win.minHan이 높으면 그 사람의 싼 화료가 거부된다", () => {
    const game = cheapTsumo();
    holderRule(game, "win.minHan", "p0", 13);
    expect(validateOf(game, "win", "p0")).toBe("below minimum han");
  });

  it("score.extraHan으로 판을 채우면 게이트를 통과한다", () => {
    const game = cheapTsumo();
    holderRule(game, "win.minHan", "p0", 13);
    holderRule(game, "score.extraHan", "p0", 13);
    expect(validateOf(game, "win", "p0")).toBeNull();
  });
});

describe("riichi.hidden — 스텔스 리치 (뷰 은닉)", () => {
  function riichiDeclaredState() {
    const state = craft({
      hands: { p0: "23m456789p111s55z", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z" },
      phase: "turn.act",
      turnSeat: 1,
    });
    return {
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p0: {
            ...state.round.byPlayer.p0!,
            riichi: { double: false, ippatsu: true, discardIndex: 0 },
          },
        },
      },
    };
  }

  it("기본값이면 타인에게 리치가 보인다", () => {
    const game = createStandardGameFromState(riichiDeclaredState());
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(view.round.byPlayer.p0?.riichiDeclared).toBe(true);
    expect(view.round.byPlayer.p0?.riichiTileIndex).toBe(0);
  });

  it("riichi.hidden이 켜지면 타인 뷰에서 리치 신호 3종이 사라진다", () => {
    const game = createStandardGameFromState(riichiDeclaredState());
    holderRule(game, "riichi.hidden", "p0", true);
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(view.round.byPlayer.p0?.riichiDeclared).toBe(false);
    expect(view.round.byPlayer.p0?.doubleRiichi).toBe(false);
    expect(view.round.byPlayer.p0?.riichiTileIndex).toBeUndefined();
  });

  it("본인 뷰에는 그대로 보인다 (자기 리치는 자기가 안다)", () => {
    const game = createStandardGameFromState(riichiDeclaredState());
    holderRule(game, "riichi.hidden", "p0", true);
    const own = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    expect(own.round.byPlayer.p0?.riichiDeclared).toBe(true);
    expect(own.round.byPlayer.p0?.riichiTileIndex).toBe(0);
  });
});

describe("scoring.seatWind — 자풍 고정 (만년 오야)", () => {
  it("기본값이면 실제 자리에서 자풍이 계산된다", () => {
    const state = craft({
      hands: { p0: "234567m234567p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const game = createStandardGameFromState(state);
    const p1 = game.engine.state.players.find((p) => p.id === "p1")!;
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const ctx = buildWinContext(game.engine.state, "p1", "tsumo", drawn, {
      rules: game.engine.rules,
    });
    // 자리 1 = 남(2). 실제 좌석에서 계산된다.
    expect(ctx.seatWind).toBe(p1.seat + 1);
  });

  it("scoring.seatWind가 있으면 그 값으로 고정된다", () => {
    const state = craft({
      hands: { p0: "234567m234567p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const game = createStandardGameFromState(state);
    holderRule(game, "scoring.seatWind", "p1", 1); // 동으로 고정
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const ctx = buildWinContext(game.engine.state, "p1", "tsumo", drawn, {
      rules: game.engine.rules,
    });
    expect(ctx.seatWind).toBe(1);
  });
});

describe("score.honbaPerStick / round.keepDealer — 정산 훅", () => {
  /** p1(비오야)이 p0에게서 론하는 정산 상황을 만든다 */
  function settleRon(honba: number) {
    const state = craft({
      hands: { p0: "*", p1: "234567m234567p5s", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 0,
      lastDiscard: { player: "p0", spec: "5s" },
    });
    return createStandardGameFromState({
      ...state,
      round: { ...state.round, honba },
    });
  }

  function settleWinDeltas(
    game: ReturnType<typeof createStandardGameFromState>,
  ): RoundSettledPayload {
    const tileId = game.engine.state.round.lastDiscard!.tileId;
    const res = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: {
        wins: [{ winner: "p1", from: "p0", tileId, winType: "ron" as const }],
      },
    });
    if (!res.ok) throw new Error(res.reason);
    const ev = game.engine.eventLog.filter((e) => e.type === ROUND_SETTLED).at(-1);
    return ev!.payload as RoundSettledPayload;
  }

  it("기본 본장 지불은 1개당 300점이다", () => {
    const base = settleWinDeltas(settleRon(0));
    const withHonba = settleWinDeltas(settleRon(2));
    expect((withHonba.deltas.p1 ?? 0) - (base.deltas.p1 ?? 0)).toBe(600);
  });

  it("score.honbaPerStick을 올리면 그 화료자의 본장만 비싸진다", () => {
    const base = settleWinDeltas(settleRon(0));
    const game = settleRon(2);
    holderRule(game, "score.honbaPerStick", "p1", 1500);
    const boosted = settleWinDeltas(game);
    expect((boosted.deltas.p1 ?? 0) - (base.deltas.p1 ?? 0)).toBe(3000);
    // 쏜 사람이 그대로 낸다 (뱅크 발행이 아니라 이동)
    expect((boosted.deltas.p0 ?? 0) - (base.deltas.p0 ?? 0)).toBe(-3000);
  });

  it("비오야가 화료하면 기본적으로 오야가 넘어간다", () => {
    const p = settleWinDeltas(settleRon(0));
    // p0(자리 0)가 오야였고 p1이 화료 → 다음 국은 자리 1이 오야
    expect(p.dealerSeat).toBe(1);
    expect(p.honba).toBe(0);
  });

  it("round.keepDealer가 켜지면 비오야가 화료해도 연장되고 오야 자리가 그 사람에게 옮겨 온다", () => {
    const game = settleRon(0);
    holderRule(game, "round.keepDealer", "p1", true);
    const p = settleWinDeltas(game);
    // 2026-07-29 감사: 예전에는 dealerSeat가 옛 오야(0) 그대로라, 보유자가 자기 연장
    // 횟수를 태워 **남의 오야를 늘려 주는** 결과였다. 이제 자리를 가져온다.
    const p1Seat = game.engine.state.players.find((pl) => pl.id === "p1")?.seat;
    expect(p.dealerSeat).toBe(p1Seat);
    expect(p.honba).toBe(1);
  });
});
