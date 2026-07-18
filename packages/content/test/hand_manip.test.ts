/**
 * hand_manip 그룹 테스트 — 손패 조작 증강 4종.
 * suit_unify / red_five_touch / hand_swap3 / full_hand_swap
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  Prng,
  SYSTEM_PLAYER,
  TILE_KIND_CHANGED,
  createStandardGame,
  createStandardGameFromState,
  handIdsOf,
  handZone,
  installAugment,
  isNumberSuit,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { suitUnify } from "../src/augments/suit_unify.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";

/** 크래프트 상태에 보유 증강을 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

function sysStart(game: ReturnType<typeof createStandardGame>): void {
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.startRound",
    payload: {},
  });
  if (!r.ok) throw new Error(r.reason);
}

// ─────────────────────────── suit_unify ───────────────────────────

describe("suit_unify — 단색 세계", () => {
  it("보유자만 혼일색·청일색이 봉인된다", () => {
    const game = createStandardGame({ seed: 3 });
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    const forHolder = game.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p0",
    });
    expect(forHolder).toContain("honitsu");
    expect(forHolder).toContain("chinitsu");
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", { playerId: "p1" }),
    ).toEqual([]);
  });

  it("첫 국 시작 시 손패 수패가 무작위 한 종류로 통일되고 전원에게 공개된다", () => {
    const game = createStandardGame({ seed: 11 });
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    sysStart(game);

    const state = game.engine.state;
    const suit = state.augmentData["view:*:suit_unify:p0"];
    expect(["man", "pin", "sou"]).toContain(suit);
    // 손패의 모든 수패가 공개된 종류로 통일 (자패는 그대로), 새로 만든 패는 conjured 표시
    const hand = handIdsOf(state, "p0");
    for (const id of hand) {
      const kind = kindOf(state, id);
      if (isNumberSuit(kind)) {
        expect(kind.suit).toBe(suit);
        // 색이 바뀐(생성된) 패는 원본과 구분되게 conjured 속성을 갖는다
        expect(state.tiles[id]?.attrs.conjured).toBe(true);
      }
    }
    // 변경 대상은 보유자 손패뿐
    const changeEvent = game.engine.eventLog.find(
      (e) => e.type === TILE_KIND_CHANGED,
    );
    expect(changeEvent).toBeDefined();
    const changes = (
      changeEvent?.payload as { changes: { tileId: TileId }[] }
    ).changes;
    for (const c of changes) expect(hand).toContain(c.tileId);
    // 완료 플래그
    expect(state.augmentData["suit_unify:done:p0"]).toBe(true);
  });

  it("두 번째 국에는 다시 발동하지 않는다 (게임당 1회)", () => {
    const game = createStandardGame({ seed: 11 });
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    sysStart(game);
    // 유산국 처리 후 다음 국 시작
    const abort = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleAbort",
      payload: {},
    });
    expect(abort.ok).toBe(true);
    sysStart(game);

    const changeCount = game.engine.eventLog.filter(
      (e) => e.type === TILE_KIND_CHANGED,
    ).length;
    expect(changeCount).toBe(1); // 첫 국의 1회뿐
  });
});

// ─────────────────────────── red_five_touch ───────────────────────────

describe("red_five_touch — 붉은 손길", () => {
  function craftRedState(): GameState {
    // 5가 6장 (각 suit 2장씩 — 첫 사본은 원래 적도라, 둘째는 일반)
    const s = craft({
      hands: { p0: "55m55p55s12346m789p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["red_five_touch"]);
  }

  it("자기 턴 프롬프트에 노출되고, 손패의 모든 5가 적도라가 된다 (게임당 1회)", () => {
    const game = createStandardGameFromState(craftRedState());
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });

    const countRedFives = (state: GameState): number =>
      handIdsOf(state, "p0").filter((id) => {
        const kind = kindOf(state, id);
        return (
          isNumberSuit(kind) &&
          kind.rank === 5 &&
          state.tiles[id]?.attrs.red === true
        );
      }).length;
    expect(countRedFives(game.engine.state)).toBe(3); // 원래 적도라 3장뿐

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const option = prompt.options.find((o) => o.type === "red_touch");
    expect(option).toBeDefined();

    const next = flow.submit("p0", option as { type: string; payload: unknown });

    const state = game.engine.state;
    expect(countRedFives(state)).toBe(6); // 손패의 5 전부 적도라
    expect(state.augmentData["red_five_touch:used:p0"]).toBe(true);
    // 같은 턴이 이어지고 (phase 유지), red_touch는 더 이상 제시되지 않는다
    expect(state.round.phase).toBe("turn.act");
    if (next.kind !== "awaiting") throw new Error("expected awaiting");
    const reprompt = next.prompts.find((p) => p.player === "p0")!;
    expect(reprompt.options.some((o) => o.type === "red_touch")).toBe(false);
    expect(reprompt.options.some((o) => o.type === "discard")).toBe(true);
    // 재사용 거부
    const again = game.engine.submit({ player: "p0", type: "red_touch", payload: {} });
    expect(again.ok).toBe(false);
  });

  it("손패에 5가 없으면 쓸 수 없다", () => {
    const s = withAugments(
      craft({
        hands: { p0: "123m678m789m12312p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["red_five_touch"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    const result = game.engine.submit({ player: "p0", type: "red_touch", payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no fives in hand");
  });
});

// ─────────────────────────── hand_swap3 ───────────────────────────

describe("hand_swap3 — 3장 강탈", () => {
  function craftSwapState(seed = 1): GameState {
    const s = craft({
      hands: {
        p0: "123m456m789m123p99p", // 13장 + 마지막이 쯔모패 취급 (14장)
        p1: "111p222p333s44s55z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed,
    });
    return withAugments(s, "p0", ["hand_swap3"]);
  }

  it("무작위 3장씩 교환되고 게임당 1회만 가능하다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    const before = game.engine.state;
    const p0Before = [...(before.zones[handZone("p0")]?.tileIds ?? [])];
    const p1Before = [...(before.zones[handZone("p1")]?.tileIds ?? [])];
    const prngBefore = before.prngState;

    const result = game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(true);

    const state = game.engine.state;
    const p0After = state.zones[handZone("p0")]?.tileIds ?? [];
    const p1After = state.zones[handZone("p1")]?.tileIds ?? [];
    // 장수 보존
    expect(p0After).toHaveLength(p0Before.length);
    expect(p1After).toHaveLength(p1Before.length);
    // 정확히 3장씩 이동
    const given = p0Before.filter((id) => p1After.includes(id));
    const taken = p1Before.filter((id) => p0After.includes(id));
    expect(given).toHaveLength(3);
    expect(taken).toHaveLength(3);
    // 쯔모패 참조는 항상 보유자 손 안의 패를 가리킨다
    expect(p0After).toContain(state.round.lastDrawnTile);
    // 난수 소비 반영 + 사용 플래그
    expect(state.prngState).not.toBe(prngBefore);
    expect(state.augmentData["hand_swap3:used:p0"]).toBe(true);
    // 재사용 거부
    const again = game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p2" },
    });
    expect(again.ok).toBe(false);
  });

  it("쯔모패를 넘겼으면 받아온 마지막 패가 쯔모패가 된다", () => {
    // toEvents와 같은 방식으로 난수를 미리 재현해, 쯔모패가 give에 포함되는 시드를 찾는다
    let found: { state: GameState; take: TileId[] } | null = null;
    for (let seed = 1; seed <= 100 && found === null; seed++) {
      const state = craftSwapState(seed);
      const drawn = state.round.lastDrawnTile as TileId;
      const prng = new Prng(0);
      prng.setState(state.prngState);
      const give = prng
        .shuffle([...(state.zones[handZone("p0")]?.tileIds ?? [])])
        .slice(0, 3);
      const take = prng
        .shuffle([...(state.zones[handZone("p1")]?.tileIds ?? [])])
        .slice(0, 3);
      if (give.includes(drawn)) found = { state, take };
    }
    if (found === null) throw new Error("no seed gives away the drawn tile");

    const game = createStandardGameFromState(found.state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    const result = game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(true);
    // 쯔모패가 손을 떠났으므로 take의 마지막 패로 교체된다
    expect(game.engine.state.round.lastDrawnTile).toBe(found.take[2]);
    expect(
      game.engine.state.zones[handZone("p0")]?.tileIds ?? [],
    ).toContain(game.engine.state.round.lastDrawnTile);
  });

  it("리치 중인 상대는 지정할 수 없다", () => {
    const base = craftSwapState();
    const rs = base.round.byPlayer["p1"]!;
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    const result = game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("target is in riichi");
    // 프롬프트에서도 리치 상대는 후보에서 걸러진다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const targets = prompt.options
      .filter((o) => o.type === "swap3")
      .map((o) => (o.payload as { target: PlayerId }).target);
    expect(targets.sort()).toEqual(["p2", "p3"]);
  });
});

// ─────────────────────────── full_hand_swap ───────────────────────────

describe("full_hand_swap — 통째로 바꾸기", () => {
  function craftFullSwapState(): GameState {
    const s = craft({
      hands: {
        p0: "123m456m789m11223s", // 13장 + 마지막 3s가 쯔모패 취급 (14장)
        p1: "123p456p789p111z2z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["full_hand_swap"]);
  }

  it("첫 순에 손패 전체(쯔모패 제외)를 상대와 맞바꾼다 (게임당 1회)", () => {
    const game = createStandardGameFromState(craftFullSwapState());
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });

    const before = game.engine.state;
    const drawn = before.round.lastDrawnTile as TileId;
    const p0Before = [...(before.zones[handZone("p0")]?.tileIds ?? [])];
    const p1Before = [...(before.zones[handZone("p1")]?.tileIds ?? [])];

    const result = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(true);

    const state = game.engine.state;
    const p0After = [...(state.zones[handZone("p0")]?.tileIds ?? [])].sort((a, b) => a - b);
    const p1After = [...(state.zones[handZone("p1")]?.tileIds ?? [])].sort((a, b) => a - b);
    // 내 손 = 상대의 13장 + 내 쯔모패 / 상대 손 = 내 13장 (쯔모패 제외)
    expect(p0After).toEqual([...p1Before, drawn].sort((a, b) => a - b));
    expect(p1After).toEqual(
      p0Before.filter((id) => id !== drawn).sort((a, b) => a - b),
    );
    // 쯔모패는 그대로 내 손에 남아 버림 흐름이 이어진다
    expect(state.round.lastDrawnTile).toBe(drawn);
    expect(state.augmentData["full_hand_swap:used:p0"]).toBe(true);
    // 재사용 거부
    const again = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p2" },
    });
    expect(again.ok).toBe(false);
  });

  it("첫 순(turnCount<=1)이 지나면 쓸 수 없다", () => {
    const base = craftFullSwapState();
    const state: GameState = {
      ...base,
      round: { ...base.round, turnCount: 2 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
    const result = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("only on the first turn");
  });
});
