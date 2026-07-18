/**
 * riichi_family 그룹 테스트 — 리치 계열 증강 3종.
 * riichi_upgrade(이중 선언) / free_riichi_discard(자유 선언) / peek_riichi_waits(선언 간파)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SYSTEM_PLAYER,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey, viewKey } from "../src/util.js";
import { riichiUpgrade } from "../src/augments/riichi_upgrade.js";
import { freeRiichiDiscard } from "../src/augments/free_riichi_discard.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 손패에서 특정 kindKey의 패 id들을 찾는다 */
function handTilesOfKind(game: Game, player: PlayerId, key: string): TileId[] {
  const state = game.engine.state;
  return (state.zones[handZone(player)]?.tileIds ?? []).filter(
    (id) => kindKey(kindOf(state, id)) === key,
  );
}

/** 플레이어에게 증강 보유 표시 (드래프트 이벤트 없이 직접 주입) */
function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments } : p,
    ),
  };
}

/** 플레이어를 리치 상태로 패치 */
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
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

// ─────────────────────────── riichi_upgrade ───────────────────────────

describe("riichi_upgrade (이중 선언)", () => {
  /** p0 텐파이 (5s 하나 버리면 2s/5s/8s 대기) — 14장 turn.act */
  function craftRiichiState(firstDiscard: boolean): GameState {
    return craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      ...(firstDiscard ? {} : { discards: { p0: "1z" } }),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  function declareRiichi(game: Game): void {
    const tileId = handTilesOfKind(game, "p0", "sou5")[0];
    expect(tileId).toBeDefined();
    const result = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId },
    });
    expect(result.ok).toBe(true);
  }

  it("첫 버림이 아닌 리치도 더블리치로 승격된다 (트리플 아님)", () => {
    const state = craftRiichiState(false); // 이미 1z를 버린 뒤 → 자연 더블 아님
    const baseline = createStandardGameFromState(structuredClone(state));
    declareRiichi(baseline);
    expect(baseline.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(false);

    const game = createStandardGameFromState(state);
    installAugment(game.engine, riichiUpgrade, "p0", { yaku: game.yaku });
    declareRiichi(game);
    expect(game.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
    // 자연 더블 조건이 아니므로 추가 판 없음
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("자연 더블리치 조건이면 +1판 플래그, 국이 끝나면 해제된다", () => {
    const game = createStandardGameFromState(craftRiichiState(true));
    installAugment(game.engine, riichiUpgrade, "p0", { yaku: game.yaku });
    declareRiichi(game);

    expect(game.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
    expect(game.engine.state.augmentData["riichi_upgrade:triple:p0"]).toBe(true);
    // 보유자에게만 +1판
    const resolveExtra = (playerId: PlayerId): number =>
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId,
        state: game.engine.state,
      });
    expect(resolveExtra("p0")).toBe(1);
    expect(resolveExtra("p1")).toBe(0);

    // 국 종료(ROUND_SETTLED) 시 플래그 해제
    const result = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleAbort",
      payload: {},
    });
    expect(result.ok).toBe(true);
    expect(resolveExtra("p0")).toBe(0);
  });
});

// ─────────────────────────── free_riichi_discard ───────────────────────────

describe("free_riichi_discard (자유 선언)", () => {
  /**
   * p0 리치 중: 22m 345p 345s 678s 45s + 쯔모 2m (14장).
   * 쯔모 2m을 버려도, 손의 다른 2m을 버려도 대기 {3s,6s}는 동일하다.
   */
  function craftFreeState(): GameState {
    let s = craft({
      hands: { p0: "22m345p345s678s45s2m", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, "p0", ["free_riichi_discard"]);
    return withRiichi(s, "p0");
  }

  const counterKey = (state: GameState): string =>
    `free_riichi_discard:used:${roundKey(state)}:p0`;

  it("대기가 보존되는 패만 허용된다 (validate)", () => {
    const game = createStandardGameFromState(craftFreeState());
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("free_discard");
    expect(def).toBeDefined();
    const ctx = { state: game.engine.state, rules: game.engine.rules };
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const otherTwoMan = handTilesOfKind(game, "p0", "man2").find(
      (id) => id !== drawn,
    ) as TileId;
    const fourSou = handTilesOfKind(game, "p0", "sou4")[0] as TileId;

    // 같은 종류(2m) → 대기 보존 → 허용
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: otherTwoMan } },
        ctx,
      ),
    ).toBeNull();
    // 4s를 버리면 대기가 {5s}로 변함 → 거부
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: fourSou } },
        ctx,
      ),
    ).toBe("discard would change waits");
    // 쯔모패 자체는 일반 버림을 쓰라고 거부
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: drawn } },
        ctx,
      ),
    ).toBe("drawn tile must use the normal discard");
  });

  it("프롬프트에 후보가 노출되고, 실행 시 점수 변화 없이 버려지며 카운터가 는다", () => {
    const game = createStandardGameFromState(craftFreeState());
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    const frees = (prompt?.options ?? []).filter(
      (o) => o.type === "free_discard",
    );
    // 손의 2m 두 장만 합법 (나머지는 대기가 변해 걸러진다)
    expect(frees).toHaveLength(2);
    // 리치 중이므로 일반 버림은 쯔모패 하나뿐
    expect(
      (prompt?.options ?? []).filter((o) => o.type === "discard"),
    ).toHaveLength(1);

    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const choice = frees.find(
      (o) => (o.payload as { tileId: TileId }).tileId !== drawn,
    ) as { type: string; payload: unknown };
    const chosenId = (choice.payload as { tileId: TileId }).tileId;
    flow.submit("p0", choice);

    const st = game.engine.state;
    expect(st.zones[discardsZone("p0")]?.tileIds).toContain(chosenId);
    expect(st.zones[handZone("p0")]?.tileIds).not.toContain(chosenId);
    expect(st.zones[handZone("p0")]?.tileIds).toHaveLength(13);
    expect(st.round.phase).toBe("reaction");
    // 리치 유지, 공탁·점수 불변 (riichiCost 0)
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    expect(st.round.riichiPot).toBe(0);
    expect(st.players.find((p) => p.id === "p0")?.score).toBe(25000);
    // 국 단위 사용 카운터 +1
    expect(st.augmentData[counterKey(st)]).toBe(1);
  });

  it("국당 3회를 소진하면 거부되고, 리치 중이 아니어도 거부된다", () => {
    const spent = craftFreeState();
    const spentState: GameState = {
      ...spent,
      augmentData: { [counterKey(spent)]: 3 },
    };
    const game = createStandardGameFromState(spentState);
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("free_discard");
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const otherTwoMan = handTilesOfKind(game, "p0", "man2").find(
      (id) => id !== drawn,
    ) as TileId;
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: otherTwoMan } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("free discard exhausted this round");

    // 리치 중이 아닌 보유자는 사용 불가
    let noRiichi = craft({
      hands: { p0: "22m345p345s678s45s2m", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    noRiichi = withAugments(noRiichi, "p0", ["free_riichi_discard"]);
    const game2 = createStandardGameFromState(noRiichi);
    installAugment(game2.engine, freeRiichiDiscard, "p0", { yaku: game2.yaku });
    const drawn2 = game2.engine.state.round.lastDrawnTile as TileId;
    const other2 = handTilesOfKind(game2, "p0", "man2").find(
      (id) => id !== drawn2,
    ) as TileId;
    expect(
      game2.engine.actions.get("free_discard")?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: other2 } },
        { state: game2.engine.state, rules: game2.engine.rules },
      ),
    ).toBe("not in riichi");
  });
});

// ─────────────────────────── peek_riichi_waits ───────────────────────────

describe("peek_riichi_waits (선언 간파)", () => {
  /** p0 턴, p1은 5s 단기 대기로 리치 중 */
  function craftPeekState(): GameState {
    let s = craft({
      hands: {
        p0: "123m456m789m123p19p",
        p1: "234m345p345s678s5s", // 2s/5s/8s 3면 대기 텐파이
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, "p0", ["peek_riichi_waits"]);
    return withRiichi(s, "p1");
  }

  it("리치 중인 상대만 지정할 수 있고, 실행 시 1000점 지불·대기 공개·1회 제한", () => {
    const game = createStandardGameFromState(craftPeekState());
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("peek_waits");
    expect(def).toBeDefined();
    const ctx = { state: game.engine.state, rules: game.engine.rules };

    // 리치 중이 아닌 상대는 거부
    expect(
      def?.validate(
        { player: "p0", type: "peek_waits", payload: { target: "p2" } },
        ctx,
      ),
    ).toBe("target is not in riichi");

    // 프롬프트에는 리치 중인 p1 후보만 노출
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    const peeks = (prompt?.options ?? []).filter((o) => o.type === "peek_waits");
    expect(peeks).toEqual([{ type: "peek_waits", payload: { target: "p1" } }]);

    // 실행: 보유자 -1000 → 대상 +1000, 보유자 뷰에 대기 기록
    const after = flow.submit("p0", peeks[0] as { type: string; payload: unknown });
    const st = game.engine.state;
    expect(st.players.find((p) => p.id === "p0")?.score).toBe(24000);
    expect(st.players.find((p) => p.id === "p1")?.score).toBe(26000);
    expect(st.augmentData[viewKey("p0", "waits:p1")]).toEqual([
      "sou2",
      "sou5",
      "sou8",
    ]);
    expect(
      st.augmentData[`peek_riichi_waits:used:${roundKey(st)}:p0:p1`],
    ).toBe(true);

    // 턴은 이어지고 (같은 turn.act), 같은 상대는 다시 간파할 수 없다
    expect(st.round.phase).toBe("turn.act");
    if (after.kind !== "awaiting") throw new Error("expected awaiting");
    const reprompt = after.prompts.find((p) => p.player === "p0");
    expect(
      (reprompt?.options ?? []).some((o) => o.type === "peek_waits"),
    ).toBe(false);
    expect(
      def?.validate(
        { player: "p0", type: "peek_waits", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("already peeked this player this round");
  });

  it("점수가 1000점 미만이면 사용할 수 없다", () => {
    const base = craftPeekState();
    const poor: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, score: 900 } : p,
      ),
    };
    const game = createStandardGameFromState(poor);
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });
    expect(
      game.engine.actions.get("peek_waits")?.validate(
        { player: "p0", type: "peek_waits", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("not enough points");
  });

  it("간파한 오름패는 새 국이 시작되면 사라진다 (국을 넘겨 남지 않는다)", () => {
    const game = createStandardGameFromState(craftPeekState());
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });

    // 간파 실행 → 보유자 뷰에 대기 기록
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    flow.submit("p0", { type: "peek_waits", payload: { target: "p1" } });
    expect(game.engine.state.augmentData[viewKey("p0", "waits:p1")]).toEqual([
      "sou2",
      "sou5",
      "sou8",
    ]);

    // 국을 넘긴다 (유국 → 다음 국 시작)
    const sys = (type: string): void => {
      const r = game.engine.submit({ player: SYSTEM_PLAYER, type, payload: {} });
      if (!r.ok) throw new Error(`${type} failed: ${r.reason}`);
    };
    sys("sys.settleAbort");
    sys("sys.startRound");

    // 지난 국의 간파 결과는 남아 있지 않다
    expect(
      game.engine.state.augmentData[viewKey("p0", "waits:p1")],
    ).toBeUndefined();
  });
});
