/**
 * 2026-08-20 QA "손패 계열" 확정 5건의 회귀 테스트 (`qa-lab/verdicts/hand.md`).
 *
 * 1. 🔴 `picky_eater` 리치 가드 — 리치 중에 손패를 물들여 **대기를 갈아치웠다**.
 * 2. 🟠 `future_sight` 후로 직후 발동 — 쯔모를 포기한 순에 **쯔모 화료 창**이 열렸다.
 * 4. 🟡 `suit_unify`·`picky_eater` 문구 — 물들이면 적도라가 사라지는데 한 줄도 없었다.
 * 5. 🟡 `pond_snatch`·`silent_swap`·`grave_rob` — 주워 간 패가 `round.lastDiscard`에
 *    남아, 어느 가시 존에도 없는 패의 정체가 세 좌석 뷰에 실렸다.
 *
 * (3번 천화·지화 게이트는 코어 판정이라 `packages/core/test/TenhouAugmentGate.test.ts`.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindOf,
  kindKey,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { pickyEater } from "../src/augments/picky_eater.js";
import { suitUnify } from "../src/augments/suit_unify.js";
import { futureSight } from "../src/augments/future_sight.js";
import { pondSnatch } from "../src/augments/pond_snatch.js";
import { silentSwap } from "../src/augments/silent_swap.js";
import { graveRob } from "../src/augments/grave_rob.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugment(state: GameState, player: PlayerId, id: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

function declareRiichi(state: GameState, player: PlayerId): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`no round state for ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [player]: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
      },
    },
  };
}

function start(state: GameState, def: AugmentDef, player: PlayerId): Game {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, def, player, { yaku: game.yaku });
  return game;
}

function validateOf(
  game: Game,
  type: string,
  player: PlayerId,
  payload: unknown,
): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`no ${type} action`);
  return def.validate(
    { player, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** 그 순에 이 사람에게 제시된 옵션 타입들 */
function optionTypes(game: Game, player: PlayerId): string[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === player);
  if (prompt === undefined) throw new Error(`no prompt for ${player}`);
  return [...new Set(prompt.options.map((o) => o.type))];
}

// ───────────────────────── 1. picky_eater 리치 가드 ─────────────────────────

/**
 * 편식의 퀘스트를 채운 자기 순 — p0가 만수패+자패만 12장 버렸다.
 * 손패는 통(pin) 위주라 만(man)으로 물들이면 대기가 통째로 갈린다.
 */
function pickyReadyScene(): GameState {
  return withAugment(
    craft({
      hands: { p0: "123m456m789m12p5z", p1: "*", p2: "*", p3: "*" },
      // 만수패 9장 + 자패 3장 = 12장 (자패는 무늬를 잠그지도 깨지도 않는다)
      discards: { p0: "111m222m333m1z2z3z", p1: "4z", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    "p0",
    "picky_eater",
  );
}

describe("picky_eater — 리치 중에는 손이 동결된다 (QA hand 확정 5)", () => {
  it("퀘스트를 채웠으면 평소에는 발동할 수 있다 (가드가 과하게 막지 않는다)", () => {
    const game = start(pickyReadyScene(), pickyEater, "p0");
    expect(validateOf(game, "picky_unify", "p0", { suit: "man" })).toBeNull();
    expect(optionTypes(game, "p0")).toContain("picky_unify");
  });

  it("리치 중에는 validate가 반려한다", () => {
    const game = start(declareRiichi(pickyReadyScene(), "p0"), pickyEater, "p0");
    expect(validateOf(game, "picky_unify", "p0", { suit: "man" })).toBe(
      "riichi: hand is frozen",
    );
  });

  it("리치 중에는 버튼 자체가 뜨지 않는다", () => {
    const game = start(declareRiichi(pickyReadyScene(), "p0"), pickyEater, "p0");
    expect(optionTypes(game, "p0")).not.toContain("picky_unify");
  });

  it("형제 suit_unify와 같은 판정이다 (효과가 같으면 가드도 같다)", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = start(
      declareRiichi(withAugment(base, "p0", "suit_unify"), "p0"),
      suitUnify,
      "p0",
    );
    expect(validateOf(game, "mono_world", "p0", { suit: "pin" })).not.toBeNull();
  });
});

// ─────────────────── 2. future_sight 후로 직후 발동 ───────────────────

describe("future_sight — 쯔모를 포기한 순에는 열리지 않는다 (QA hand 확정 2)", () => {
  /** 펑 직후: 손패 11장 + 펑 1개, 쯔모패 없음(`lastDrawnTile === null`) */
  function afterCallScene(): GameState {
    const base = craft({
      hands: { p0: "345m678m55m234p", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "222m", from: "p3" }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    return withAugment(
      { ...base, round: { ...base.round, lastDrawnTile: null } },
      "p0",
      "future_sight",
    );
  }

  it("펑 직후(쯔모패 없음)에는 무장 버튼이 반려된다", () => {
    const game = start(afterCallScene(), futureSight, "p0");
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
    expect(validateOf(game, "future_arm", "p0", {})).toBe("no drawn tile");
    expect(optionTypes(game, "p0")).not.toContain("future_arm");
  });

  it("정상 순(쯔모패 있음)에는 그대로 열린다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = start(withAugment(base, "p0", "future_sight"), futureSight, "p0");
    expect(validateOf(game, "future_arm", "p0", {})).toBeNull();
  });
});

// ─────────────────── 4. 물들이면 적도라가 사라진다 (문구) ───────────────────

describe("문구 — 물들이면 적도라가 사라진다고 적혀 있다 (QA hand 확정 6)", () => {
  const mentionsRed = (text: string): boolean => text.includes("적도라");

  it("suit_unify detail이 적도라 소멸을 명시한다", () => {
    expect(mentionsRed(suitUnify.detail ?? "")).toBe(true);
  });

  it("picky_eater detail이 적도라 소멸과 리치 제약을 함께 명시한다", () => {
    const detail = pickyEater.detail ?? "";
    expect(mentionsRed(detail)).toBe(true);
    expect(detail).toContain("리치");
  });
});

// ──────────── 5. 주워 간 패는 lastDiscard에 남지 않는다 ────────────

describe("바닥에서 걷어 간 패는 lastDiscard를 비운다 (QA hand 확정 7)", () => {
  /** p1이 방금 3만을 버렸고(=lastDiscard), p0의 차례다 */
  function pondScene(augId: string): GameState {
    return withAugment(
      craft({
        hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z", p1: "2z", p2: "5z", p3: "6z" },
        lastDiscard: { player: "p1", spec: "3m" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      augId,
    );
  }

  /** 방금 버려진 그 패의 id */
  const lastDiscardId = (state: GameState): TileId => {
    const last = state.round.lastDiscard;
    if (last === null) throw new Error("no lastDiscard");
    return last.tileId;
  };

  /** 걷어 간 패가 정말 손으로 들어갔고, 바닥에는 없다 */
  function expectMovedToHand(state: GameState, tileId: TileId): void {
    expect(state.zones[handZone("p0")]?.tileIds).toContain(tileId);
    expect(state.zones[discardsZone("p1")]?.tileIds ?? []).not.toContain(tileId);
  }

  it("pond_snatch — 주운 패가 마지막 버림패면 표식을 비운다", () => {
    const state = pondScene("pond_snatch");
    const snatchId = lastDiscardId(state);
    const game = start(state, pondSnatch, "p0");
    const res = game.engine.submit({
      player: "p0",
      type: "pond_snatch",
      payload: { snatchId, fromPlayer: "p1" },
    });
    expect(res.ok).toBe(true);
    expectMovedToHand(game.engine.state, snatchId);
    expect(game.engine.state.round.lastDiscard).toBeNull();
  });

  it("pond_snatch — 다른 패를 주우면 마지막 버림패 표식은 그대로다", () => {
    const state = pondScene("pond_snatch");
    const kept = lastDiscardId(state);
    // p1의 바닥 첫 장(2z)을 대신 줍는다 — 최근 3장 안이라 후보다
    const other = (state.zones[discardsZone("p1")]?.tileIds ?? [])[0] as TileId;
    expect(other).not.toBe(kept);
    const game = start(state, pondSnatch, "p0");
    const res = game.engine.submit({
      player: "p0",
      type: "pond_snatch",
      payload: { snatchId: other, fromPlayer: "p1" },
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.round.lastDiscard?.tileId).toBe(kept);
  });

  it("silent_swap — 집어 온 패가 마지막 버림패면 표식을 비운다", () => {
    const state = pondScene("silent_swap");
    const takenId = lastDiscardId(state);
    const game = start(state, silentSwap, "p0");
    const res = game.engine.submit({
      player: "p0",
      type: "silent_take",
      payload: { tileId: takenId },
    });
    expect(res.ok).toBe(true);
    expectMovedToHand(game.engine.state, takenId);
    expect(game.engine.state.round.lastDiscard).toBeNull();
  });

  it("grave_rob — 파낸 패가 마지막 버림패면 표식을 비운다", () => {
    const state = pondScene("grave_rob");
    const graveId = lastDiscardId(state);
    // 이 패는 p0의 단기 대기(3만)라 도굴 후보로 제시된다
    expect(kindKey(kindOf(state, graveId))).toBe(kindKey({ suit: "man", rank: 3 }));
    const game = start(state, graveRob, "p0");
    const res = game.engine.submit({
      player: "p0",
      type: "grave_rob",
      payload: { graveId, fromPlayer: "p1" },
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.round.lastDiscard).toBeNull();
  });
});
