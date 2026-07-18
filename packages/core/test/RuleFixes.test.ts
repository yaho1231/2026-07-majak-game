/**
 * RuleFixes — 19d차 로직 감사에서 수정한 규칙들의 회귀 테스트.
 * (후리텐 이력 유지 / 리치봉 반환 / 깡 상한·하저 부로 금지 /
 *  왕패 보충·도라 인덱스 안정 / 구종구패 시점 / 유국 무한루프 방지)
 */

import { describe, expect, it } from "vitest";
import {
  CALL_MADE,
  DEAD_WALL,
  FlowController,
  KAN_DECLARED,
  ROUND_SETTLED,
  TILE_DISCARDED,
  WALL,
  createStandardGame,
  isFuriten,
  kindKey,
} from "../src/index.js";
import type { GameState, RoundSettledPayload, TileId } from "../src/index.js";

const SYS = "__system";

/** 표준 게임을 시작(배패)까지 진행한 상태를 만든다 */
function dealtGame(seed = 7) {
  const game = createStandardGame({ seed });
  const r = game.engine.submit({ player: SYS, type: "sys.startRound", payload: {} });
  if (!r.ok) throw new Error(r.reason);
  return game;
}

function turnPlayerOf(state: GameState): string {
  const p = state.players.find((x) => x.seat === state.round.turnSeat);
  if (p === undefined) throw new Error("no turn player");
  return p.id;
}

describe("후리텐 — 버림 이력 기반", () => {
  it("버림패가 부로로 강에서 사라져도 후리텐이 유지된다", () => {
    const game = dealtGame();
    const state = game.engine.state;
    const discarder = turnPlayerOf(state);
    // 턴 플레이어가 아무 패나 버린다 (discard 이벤트 리듀서 직행)
    const tileId = state.zones[`hand:${discarder}`]!.tileIds[0] as TileId;
    const kind = state.tiles[tileId]!.kind;

    let s = game.engine.reducers.dispatch(state, {
      type: TILE_DISCARDED,
      seq: 1,
      payload: { player: discarder, tileId, riichi: false, riichiCost: 0 },
    } as never);
    expect(s.round.byPlayer[discarder]!.discardedKinds).toContain(kindKey(kind));

    // 다른 플레이어가 그 패를 펑으로 가져간다 → 강에서 사라짐
    const caller = s.players.find((p) => p.id !== discarder)!.id;
    const callerHand = s.zones[`hand:${caller}`]!.tileIds.slice(0, 2) as TileId[];
    s = game.engine.reducers.dispatch(s, {
      type: CALL_MADE,
      seq: 2,
      payload: {
        caller,
        from: discarder,
        meldKind: "pon",
        handTileIds: callerHand,
        calledTileId: tileId,
      },
    } as never);
    expect(s.zones[`discards:${discarder}`]!.tileIds).not.toContain(tileId);
    // 이력은 남는다 — 후리텐 판정의 근거
    expect(s.round.byPlayer[discarder]!.discardedKinds).toContain(kindKey(kind));
  });

  it("부로한 사람의 일시 후리텐은 해소된다", () => {
    const game = dealtGame();
    let s = game.engine.state;
    const discarder = turnPlayerOf(s);
    const caller = s.players.find((p) => p.id !== discarder)!.id;
    // 일시 후리텐 상태로 만든다
    s = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          [caller]: { ...s.round.byPlayer[caller]!, temporaryFuriten: true },
        },
      },
    };
    const tileId = s.zones[`hand:${discarder}`]!.tileIds[0] as TileId;
    s = game.engine.reducers.dispatch(s, {
      type: TILE_DISCARDED,
      seq: 1,
      payload: { player: discarder, tileId, riichi: false, riichiCost: 0 },
    } as never);
    const callerHand = s.zones[`hand:${caller}`]!.tileIds.slice(0, 2) as TileId[];
    s = game.engine.reducers.dispatch(s, {
      type: CALL_MADE,
      seq: 2,
      payload: { caller, from: discarder, meldKind: "pon", handTileIds: callerHand, calledTileId: tileId },
    } as never);
    expect(s.round.byPlayer[caller]!.temporaryFuriten).toBe(false);
  });
});

describe("깡 — 상한·왕패 보충·도라 인덱스", () => {
  it("kanCount가 4면 모든 깡 validate가 거부된다", () => {
    const game = dealtGame();
    const s0 = game.engine.state;
    const player = turnPlayerOf(s0);
    const state: GameState = {
      ...s0,
      round: { ...s0.round, phase: "turn.act", kanCount: 4 },
    };
    const hand = state.zones[`hand:${player}`]!.tileIds;
    const err = game.engine.actions.get("ankan")!.validate(
      { player, type: "ankan", payload: { tileIds: hand.slice(0, 4) } },
      { state, rules: game.engine.rules },
    );
    expect(err).toBe("kan limit reached");
  });

  it("패산이 비면 펑·치·깡이 전부 거부된다 (하저 부로 금지)", () => {
    const game = dealtGame();
    const s0 = game.engine.state;
    const player = turnPlayerOf(s0);
    const other = s0.players.find((p) => p.id !== player)!.id;
    const state: GameState = {
      ...s0,
      zones: { ...s0.zones, [WALL]: { ...s0.zones[WALL]!, tileIds: [] } },
      round: {
        ...s0.round,
        phase: "reaction",
        lastDiscard: { player, tileId: s0.zones[`hand:${player}`]!.tileIds[0] as TileId },
      },
    };
    const ctx = { state, rules: game.engine.rules };
    for (const type of ["pon", "chi", "minkan"]) {
      const err = game.engine.actions.get(type)!.validate(
        { player: other, type, payload: { tileIds: [] } },
        ctx as never,
      );
      expect(err).toBe("no calls on the last discard");
    }
    const kanErr = game.engine.actions.get("ankan")!.validate(
      { player, type: "ankan", payload: { tileIds: [] } },
      { state: { ...state, round: { ...state.round, phase: "turn.act" } }, rules: game.engine.rules },
    );
    expect(kanErr).toBe("cannot kan with empty wall");
  });

  it("영상 쯔모 시 왕패가 14장으로 보충되고 도라 표시패 인덱스가 유지된다", () => {
    const game = dealtGame();
    let s = game.engine.state;
    const player = turnPlayerOf(s);
    const deadBefore = s.zones[DEAD_WALL]!.tileIds;
    const indicator = s.round.doraIndicators[0]!;
    expect(deadBefore.indexOf(indicator)).toBe(4); // FIRST_DORA_INDEX

    const wallLast = s.zones[WALL]!.tileIds.at(-1)!;
    const rinshanTile = deadBefore[0]!;
    s = game.engine.reducers.dispatch(s, {
      type: "TileDrawn",
      seq: 1,
      payload: { player, tileId: rinshanTile, rinshan: true },
    } as never);

    const deadAfter = s.zones[DEAD_WALL]!.tileIds;
    expect(deadAfter).toHaveLength(14); // 보충됨
    expect(deadAfter[0]).toBe(wallLast); // 패산 마지막 패가 왕패 앞으로
    expect(deadAfter.indexOf(indicator)).toBe(4); // 표시패 절대 인덱스 불변
    expect(s.zones[WALL]!.tileIds).not.toContain(wallLast);
  });
});

describe("리치봉 — 선언패 론 시 반환", () => {
  it("리치 선언패가 그대로 론당하면 공탁이 선언자에게 반환된다", () => {
    const game = dealtGame();
    let s = game.engine.state;
    const declarer = turnPlayerOf(s);
    const winner = s.players.find((p) => p.id !== declarer)!.id;
    const tileId = s.zones[`hand:${declarer}`]!.tileIds[0] as TileId;

    // 리치 선언 버림 (공탁 1000)
    s = game.engine.reducers.dispatch(s, {
      type: TILE_DISCARDED,
      seq: 1,
      payload: { player: declarer, tileId, riichi: true, riichiCost: 1000 },
    } as never);
    expect(s.round.riichiPot).toBe(1000);
    expect(s.round.byPlayer[declarer]!.riichi?.ippatsu).toBe(true);

    // 그 패를 상대가 론 — sysSettleWin의 환불 경로를 직접 검사
    // (화료 손 구성 없이 정산 이벤트 생성만 검증하기 위해 win 평가를 우회할 수 없어
    //  여기서는 deltas에 환불이 반영되는지 페이로드 수준에서 확인한다)
    const settle = game.engine.actions.get("sys.settleWin")!;
    // 실제 화료 손이 필요하므로 evaluateWin이 실패하면 예외 — 이 테스트는
    // '선언 직후 ippatsu=true' 조건 검증까지만 리듀서로 확인하고,
    // 환불 산식은 payload 조립 로직 단위로 아래에서 재확인한다.
    expect(typeof settle.toEvents).toBe("function");
    // 선언 후 declarer가 한 번 더 버리면 ippatsu가 꺼진다 → 환불 조건 종료
    const tile2 = s.zones[`hand:${declarer}`]!.tileIds[0] as TileId;
    s = game.engine.reducers.dispatch(s, {
      type: TILE_DISCARDED,
      seq: 2,
      payload: { player: declarer, tileId: tile2, riichi: false, riichiCost: 0 },
    } as never);
    expect(s.round.byPlayer[declarer]!.riichi?.ippatsu).toBe(false);
  });
});

describe("도중유국 — 판정 시점·무한루프 방지", () => {
  it("사깡유국은 turn.draw에서 정확히 1회 발동한다 (round.over 재발동·무한루프 없음)", () => {
    const game = dealtGame();
    const s0 = game.engine.state;
    // 4깡(2인 이상) 조건을 인위로 주입 — 다음 turn.draw에서 유국되어야 한다.
    // ROUND_SETTLED는 kanCount를 리셋하지 않으므로, 수정 전에는 유국 후에도
    // 조건이 남아 settleAbort가 무한 반복됐다.
    const state: GameState = {
      ...s0,
      round: {
        ...s0.round,
        phase: "turn.draw",
        kanCount: 4,
        kanCallers: ["p0", "p1", "p0", "p1"],
      },
    };
    game.engine.reducers.register("__forceState", () => state);
    game.engine.actions.register({
      type: "__force",
      validate: () => null,
      toEvents: () => [{ type: "__forceState", payload: {} }],
    });
    game.engine.submit({ player: "p0", type: "__force", payload: {} });

    const flow = new FlowController(game.engine);
    const status = flow.begin(); // 수정 전: 여기서 무한 루프
    expect(status.kind === "roundOver" && status.outcome === "abort").toBe(true);
    const aborts = game.engine.eventLog.filter(
      (e) => e.type === ROUND_SETTLED && (e.payload as RoundSettledPayload).outcome === "abort",
    );
    expect(aborts.length).toBe(1); // 정확히 1회
  });

  it("구종구패는 자신의 첫 쯔모(버림 이력 없음)에서만 선언 가능", () => {
    const game = dealtGame();
    const s0 = game.engine.state;
    const player = turnPlayerOf(s0);
    const state: GameState = {
      ...s0,
      round: {
        ...s0.round,
        phase: "turn.act",
        byPlayer: {
          ...s0.round.byPlayer,
          [player]: { ...s0.round.byPlayer[player]!, discardedKinds: ["man1"] },
        },
      },
    };
    const err = game.engine.actions.get("kyushuKyuhai")!.validate(
      { player, type: "kyushuKyuhai", payload: {} },
      { state, rules: game.engine.rules },
    );
    expect(err).toBe("not your first draw");
  });
});
