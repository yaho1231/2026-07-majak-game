import { describe, expect, it } from "vitest";
import { GameEngine } from "../src/engine/GameEngine.js";
import type { ActionDef } from "../src/engine/actions/ActionRegistry.js";
import {
  TILES_MOVED,
  tilesMoved,
  tilesMovedReducer,
} from "../src/engine/events/TilesMoved.js";
import type { TilesMovedPayload } from "../src/engine/events/TilesMoved.js";
import { identityReducer } from "../src/engine/reducers/ReducerRegistry.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";
import {
  createInitialGameState,
  setupRound,
} from "../src/engine/state/GameState.js";
import {
  createZone,
  discardsZone,
  handZone,
} from "../src/engine/zones/Zone.js";
import type { ProcessorOptions } from "../src/engine/effects/EventProcessor.js";

/** 첫 실전형 액션: 버림. validate는 페이즈·턴·손패 소유를 검사한다 */
const discardAction: ActionDef<{ tileId: number }> = {
  type: "discard",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (state.round.phase !== "turn.discard") return "not in discard phase";
    if (state.round.turnSeat !== player.seat) return "not your turn";
    if (!state.zones[handZone(req.player)]?.tileIds.includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req) => [
    tilesMoved({
      from: handZone(req.player),
      to: discardsZone(req.player),
      tileIds: [req.payload.tileId],
    }),
  ],
};

function buildEngine(opts: { sealedZone?: boolean; processor?: ProcessorOptions } = {}) {
  let state = setupRound(
    createInitialGameState(
      { seed: 42, playerIds: ["p0", "p1", "p2", "p3"] },
      { startScore: 25000, redFivesPerSuit: 1 },
    ),
  );
  // 테스트 편의: 친(p0)이 쯔모를 마친 버림 페이즈라고 가정
  state = { ...state, round: { ...state.round, phase: "turn.discard" } };
  if (opts.sealedZone === true) {
    state = {
      ...state,
      zones: { ...state.zones, sealed: createZone("sealed", "sealed") },
    };
  }
  const engine = new GameEngine(
    opts.processor === undefined ? { state } : { state, processor: opts.processor },
  );
  engine.reducers.register(TILES_MOVED, tilesMovedReducer);
  engine.actions.register(discardAction);
  return engine;
}

function firstHandTile(engine: GameEngine, player: string): number {
  const id = engine.state.zones[handZone(player)]?.tileIds[0];
  if (id === undefined) throw new Error("empty hand");
  return id;
}

describe("GameEngine.submit — 기본 흐름", () => {
  it("합법 버림: 패 이동, seq 부여, lastEventSeq·Event Log 갱신", () => {
    const engine = buildEngine();
    const tileId = firstHandTile(engine, "p0");

    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId } });

    expect(result).toEqual({
      ok: true,
      events: [
        {
          seq: 1,
          type: TILES_MOVED,
          payload: { from: "hand:p0", to: "discards:p0", tileIds: [tileId] },
        },
      ],
      canceled: [],
    });
    expect(engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(12);
    expect(engine.state.zones[discardsZone("p0")]?.tileIds).toEqual([tileId]);
    expect(engine.state.lastEventSeq).toBe(1);
    expect(engine.eventLog).toHaveLength(1);
  });

  it("모르는 액션은 거부", () => {
    const engine = buildEngine();
    const result = engine.submit({ player: "p0", type: "teleport", payload: {} });
    expect(result).toEqual({ ok: false, reason: "Unknown action: teleport" });
  });

  it("검증 거부: 남의 턴 — 사유가 그대로 전달되고 상태 불변", () => {
    const engine = buildEngine();
    const tileId = firstHandTile(engine, "p1");
    const result = engine.submit({ player: "p1", type: "discard", payload: { tileId } });
    expect(result).toEqual({ ok: false, reason: "not your turn" });
    expect(engine.state.zones[handZone("p1")]?.tileIds).toHaveLength(13);
    expect(engine.eventLog).toHaveLength(0);
  });

  it("검증 거부: 손에 없는 패", () => {
    const engine = buildEngine();
    const notMine = firstHandTile(engine, "p1");
    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId: notMine } });
    expect(result).toEqual({ ok: false, reason: "tile not in hand" });
  });

  it("같은 액션 중복 등록은 실패", () => {
    const engine = buildEngine();
    expect(() => engine.actions.register(discardAction)).toThrow("already registered");
  });
});

describe("GameEngine.submit — 증강(Effect)과의 결합", () => {
  it("Prism 증강이 버림의 목적지를 봉인 Zone으로 바꾼다 (payload 수정)", () => {
    const engine = buildEngine({ sealedZone: true });
    engine.effects.register({
      source: "seal-aug",
      layer: RuleLayer.Prism,
      on: TILES_MOVED,
      intercept: (e) => {
        const p = e.payload as TilesMovedPayload;
        return p.to.startsWith("discards:")
          ? { ...e, payload: { ...p, to: "sealed" } }
          : e;
      },
    });
    const tileId = firstHandTile(engine, "p0");

    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId } });

    expect(result.ok).toBe(true);
    expect(engine.state.zones["sealed"]?.tileIds).toEqual([tileId]);
    expect(engine.state.zones[discardsZone("p0")]?.tileIds).toEqual([]);
  });

  it("Gold 증강이 이동을 취소하면 액션은 성공하되 아무 일도 없다", () => {
    const engine = buildEngine();
    engine.effects.register({
      source: "shield-aug",
      layer: RuleLayer.Gold,
      on: TILES_MOVED,
      intercept: () => null,
    });
    const tileId = firstHandTile(engine, "p0");

    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([]);
      expect(result.canceled[0]?.by).toBe("shield-aug");
    }
    expect(engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(13);
    expect(engine.state.lastEventSeq).toBe(0); // 취소된 제안은 seq를 소비하지 않는다
  });

  it("Reaction 콤보: 버림에 반응해 점수 이벤트가 연쇄되고 causedBy가 남는다", () => {
    const engine = buildEngine();
    engine.reducers.register("ScoreChanged", (state, event) => {
      const { player, delta } = event.payload as { player: string; delta: number };
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === player ? { ...p, score: p.score + delta } : p,
        ),
      };
    });
    engine.effects.register({
      source: "bonus-aug",
      layer: RuleLayer.Silver,
      on: TILES_MOVED,
      react: (_e, ctx) =>
        ctx.emit({ type: "ScoreChanged", payload: { player: "p0", delta: 500 } }),
    });
    const tileId = firstHandTile(engine, "p0");

    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((e) => e.type)).toEqual([TILES_MOVED, "ScoreChanged"]);
      expect(result.events[1]?.causedBy).toBe(result.events[0]?.seq);
    }
    expect(engine.state.players[0]?.score).toBe(25500);
  });

  it("폭주 증강: 연쇄 한도 초과 시 액션 전체가 거부되고 상태는 원본 그대로", () => {
    const engine = buildEngine({ processor: { maxChainDepth: 4 } });
    engine.reducers.register("Echo", identityReducer);
    engine.effects.register({
      source: "runaway-aug",
      layer: RuleLayer.Prism,
      on: TILES_MOVED,
      react: (_e, ctx) => ctx.emit({ type: "Echo", payload: {} }),
    });
    engine.effects.register({
      source: "runaway-aug",
      layer: RuleLayer.Prism,
      on: "Echo",
      react: (_e, ctx) => ctx.emit({ type: "Echo", payload: {} }),
    });
    const tileId = firstHandTile(engine, "p0");

    const result = engine.submit({ player: "p0", type: "discard", payload: { tileId } });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("maxChainDepth");
    // 이동 이벤트가 중간까지 적용됐더라도 전부 버려진다 (트랜잭션)
    expect(engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(13);
    expect(engine.state.lastEventSeq).toBe(0);
    expect(engine.eventLog).toHaveLength(0);
  });

  it("Reducer가 등록되지 않은 이벤트는 액션 거부 + 상태 불변", () => {
    const engine = buildEngine();
    engine.actions.register({
      type: "ghost",
      validate: () => null,
      toEvents: () => [{ type: "GhostEvent", payload: {} }],
    });
    const result = engine.submit({ player: "p0", type: "ghost", payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("No reducer registered");
    expect(engine.state.lastEventSeq).toBe(0);
  });

  it("루트 이벤트가 여러 개면 이어지는 seq로 순서대로 처리된다", () => {
    const engine = buildEngine();
    engine.actions.register({
      type: "discardTwo",
      validate: () => null,
      toEvents: (req) => {
        const hand = engine.state.zones[handZone(req.player)]?.tileIds ?? [];
        return [
          tilesMoved({ from: handZone(req.player), to: discardsZone(req.player), tileIds: [hand[0] as number] }),
          tilesMoved({ from: handZone(req.player), to: discardsZone(req.player), tileIds: [hand[1] as number] }),
        ];
      },
    });
    const result = engine.submit({ player: "p0", type: "discardTwo", payload: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((e) => e.seq)).toEqual([1, 2]);
    }
    expect(engine.state.zones[discardsZone("p0")]?.tileIds).toHaveLength(2);
    expect(engine.state.lastEventSeq).toBe(2);
  });
});
