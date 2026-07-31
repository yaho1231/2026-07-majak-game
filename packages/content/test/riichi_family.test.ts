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
  winHandKindsOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey, roundViewKey, viewKey } from "../src/util.js";
import { riichiUpgrade } from "../src/augments/riichi_upgrade.js";
import { freeRiichiDiscard } from "../src/augments/free_riichi_discard.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { lastStand } from "../src/augments/last_stand.js";

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

  it("자연 더블리치 조건이면 트리플리치 +2판(=4판) 플래그, 국이 끝나면 해제된다", () => {
    const game = createStandardGameFromState(craftRiichiState(true));
    installAugment(game.engine, riichiUpgrade, "p0", { yaku: game.yaku });
    declareRiichi(game);

    expect(game.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
    expect(game.engine.state.augmentData["riichi_upgrade:triple:p0"]).toBe(true);
    // 보유자에게만 +2판 — 더블리치 2판과 합쳐 트리플리치 4판(2026-07-26 밸런스)
    const resolveExtra = (playerId: PlayerId): number =>
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId,
        state: game.engine.state,
      });
    expect(resolveExtra("p0")).toBe(2);
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

  it("리치 후에는 쯔모패가 아닌 손패를 대기 보존 검사 없이 아무거나 버릴 수 있다", () => {
    const game = createStandardGameFromState(craftFreeState());
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("free_discard");
    expect(def).toBeDefined();
    const ctx = { state: game.engine.state, rules: game.engine.rules };
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const otherTwoMan = handTilesOfKind(game, "p0", "man2").find(
      (id) => id !== drawn,
    ) as TileId;
    // 4s를 버리면 예전에는 대기가 변한다고 거부됐지만, 이제는 허용된다
    const fourSou = handTilesOfKind(game, "p0", "sou4")[0] as TileId;

    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: otherTwoMan } },
        ctx,
      ),
    ).toBeNull();
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: fourSou } },
        ctx,
      ),
    ).toBeNull();
    // 쯔모패 자체는 일반 버림을 쓰라고 거부
    expect(
      def?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: drawn } },
        ctx,
      ),
    ).toBe("drawn tile must use the normal discard");
  });

  it("프롬프트에 쯔모패를 제외한 손패 전부가 후보로 노출되고, 실행 시 점수 변화 없이 버려진다", () => {
    const game = createStandardGameFromState(craftFreeState());
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    const frees = (prompt?.options ?? []).filter(
      (o) => o.type === "free_discard",
    );
    // 쯔모패를 제외한 손패 13장 전부가 후보 (대기 보존 필터 없음)
    expect(frees).toHaveLength(13);
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
  });

  it("리치 중이 아니면 거부된다", () => {
    let noRiichi = craft({
      hands: { p0: "22m345p345s678s45s2m", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    noRiichi = withAugments(noRiichi, "p0", ["free_riichi_discard"]);
    const game = createStandardGameFromState(noRiichi);
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const other = handTilesOfKind(game, "p0", "man2").find(
      (id) => id !== drawn,
    ) as TileId;
    expect(
      game.engine.actions.get("free_discard")?.validate(
        { player: "p0", type: "free_discard", payload: { tileId: other } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("not in riichi");
  });

  it("리치 선언 시 손패가 스냅샷으로 저장되고 대기가 뷰 채널로 노출된다", () => {
    // 실제 리치 액션을 태워 TILE_DISCARDED(riichi:true) 반응으로 스냅샷을 만든다
    let s = craft({
      hands: { p0: "22m345p345s678s45s2m", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, "p0", ["free_riichi_discard"]);
    const game = createStandardGameFromState(s);
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });

    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: drawn },
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    const snap = st.augmentData[`free_riichi_discard:snap:${roundKey(st)}:p0`];
    expect(Array.isArray(snap)).toBe(true);
    expect(snap as TileId[]).toHaveLength(13);
    // 스냅샷은 리치 버림 직후의 실제 손패와 일치한다
    expect([...(snap as TileId[])].sort((a, b) => a - b)).toEqual(
      [...(st.zones[handZone("p0")]?.tileIds ?? [])].sort((a, b) => a - b),
    );
    // 대기(오름패)가 보유자 전용 뷰 채널로 노출된다
    const waits = st.augmentData[roundViewKey("p0", "free_declare_waits:p0")];
    expect(Array.isArray(waits)).toBe(true);
    expect((waits as string[]).sort()).toEqual(["sou3", "sou6", "sou9"]);
  });

  it("스냅샷이 있으면 대기·화료 판정은 물리 손패가 아니라 스냅샷으로 고정된다", () => {
    // 물리 손패(p0)와 다른 타일 id를 스냅샷으로 심어, 판정이 스냅샷을 쓰는지 확인한다.
    let s = craft({
      hands: {
        p0: "19m19p19s1234567z", // 물리 손패 (국사형, 텐파이 아님)
        p1: "234m234p234s2255z", // 스냅샷으로 쓸 손패
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, "p0", ["free_riichi_discard"]);
    s = withRiichi(s, "p0");
    const snapIds = [...(s.zones[handZone("p1")]?.tileIds ?? [])];
    s = { ...s, augmentData: { [`free_riichi_discard:snap:${roundKey(s)}:p0`]: snapIds } };
    const game = createStandardGameFromState(s);
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });

    // winHandKindsOf(p0)가 물리 손패가 아니라 스냅샷(p1의 손패) kind를 돌려준다
    const frozen = winHandKindsOf(game.engine.state, game.engine.rules, "p0")
      .map(kindKey)
      .sort();
    const snapKinds = snapIds.map((id) => kindKey(kindOf(game.engine.state, id))).sort();
    const physicalKinds = (game.engine.state.zones[handZone("p0")]?.tileIds ?? [])
      .map((id) => kindKey(kindOf(game.engine.state, id)))
      .sort();
    expect(frozen).toEqual(snapKinds);
    expect(frozen).not.toEqual(physicalKinds);
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

  it("리치 중인 상대만 지정할 수 있고, 실행은 무료·대기 공개·국당 1회 (48차 무페널티 / 2026-07-26 국당 1회)", () => {
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

    // 실행: 점수 이동 없음(예전엔 보유자 -1000 → 대상 +1000), 보유자 뷰에 대기 기록
    const after = flow.submit("p0", peeks[0] as { type: string; payload: unknown });
    const st = game.engine.state;
    expect(st.players.find((p) => p.id === "p0")?.score).toBe(25000);
    expect(st.players.find((p) => p.id === "p1")?.score).toBe(25000);
    expect(st.augmentData[viewKey("p0", "waits:p1")]).toEqual([
      "sou2",
      "sou5",
      "sou8",
    ]);
    expect(st.augmentData[`peek_riichi_waits:used:${roundKey(st)}:p0`]).toBe(true);

    // 턴은 이어지고 (같은 turn.act), 그 국엔 더 이상 간파할 수 없다 (국당 1회)
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
    ).toBe("already peeked this round");
  });

  it("점수가 바닥이어도 사용할 수 있다 — 비용이 없다 (48차 무페널티)", () => {
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
    ).toBeNull();
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

// ─────────────────────────── 리치 자동 버림과 증강 ───────────────────────────

/**
 * 리치를 걸면 손이 잠겨 쯔모기리 말고는 둘 수 있는 수가 없다 —
 * FlowController가 그런 순의 프롬프트에 auto를 붙여 진행부가 대신 두게 한다.
 * 다만 증강이 그 순에 다른 수를 열어 준다면 여전히 사람이 골라야 한다.
 */
describe("리치 자동 버림 — 증강이 선택지를 열면 자동으로 두지 않는다", () => {
  /** p0 리치 상태 + 쓸모없는 쯔모 1장 (14장 turn.act) */
  function forcedState(augments: string[]): GameState {
    return withRiichi(
      withAugments(
        craft({
          hands: { p0: "123m456p789s55z66z1m", p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        "p0",
        augments,
      ),
      "p0",
    );
  }

  function p0Prompt(game: Game): { options: { type: string }[]; auto?: true } {
    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    if (prompt === undefined) throw new Error("no prompt for p0");
    return prompt;
  }

  it("증강이 없으면 쯔모기리 하나뿐 — auto", () => {
    const prompt = p0Prompt(createStandardGameFromState(forcedState([])));
    expect(prompt.options).toHaveLength(1);
    expect(prompt.auto).toBe(true);
  });

  it("자유 선언(free_riichi_discard)은 버릴 패를 고르게 하므로 auto가 아니다", () => {
    const game = createStandardGameFromState(forcedState(["free_riichi_discard"]));
    installAugment(game.engine, freeRiichiDiscard, "p0", { yaku: game.yaku });
    const prompt = p0Prompt(game);
    expect(prompt.options.some((o) => o.type === "free_discard")).toBe(true);
    expect(prompt.auto).toBeUndefined();
  });

  it("승부수(last_stand)는 리치 취소를 열어 두므로 auto가 아니다", () => {
    const game = createStandardGameFromState(forcedState(["last_stand"]));
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
    const prompt = p0Prompt(game);
    expect(prompt.options.some((o) => o.type === "cancel_riichi")).toBe(true);
    expect(prompt.auto).toBeUndefined();
  });
});
