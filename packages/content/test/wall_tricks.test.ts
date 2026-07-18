/**
 * wall_tricks 그룹 테스트 — 패산 조작 증강 2종.
 * future_sight / rinshan_gamble
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  Prng,
  SCORE_CHANGED,
  TILE_DISCARDED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  handZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  ScoreChangedPayload,
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { futureSight } from "../src/augments/future_sight.js";
import { rinshanGamble } from "../src/augments/rinshan_gamble.js";

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

/** 크래프트 상태에 augmentData 키를 직접 주입한다 */
function withAugmentData(
  state: GameState,
  data: Record<string, unknown>,
): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

/** FlowController를 시작해 특정 플레이어의 턴 프롬프트를 얻는다 */
function turnPromptFor(
  game: ReturnType<typeof createStandardGameFromState>,
  player: PlayerId,
) {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === player);
  if (prompt === undefined) throw new Error(`no prompt for ${player}`);
  return { flow, prompt };
}

// ─────────────────────────── future_sight ───────────────────────────

describe("future_sight — 미래를 보는 자", () => {
  // craft의 초기 국면 roundKey = "장풍1-1국-0본장"
  const STACKS_KEY = "future_sight:stacks:1-1-0:p0";

  function craftFutureState(): GameState {
    const s = craft({
      hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" }, // 13장 + 마지막이 쯔모패 취급
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["future_sight"]);
  }

  it("무작위 3장을 내보내고 패산 위 3장을 가져온다 (스택·뷰 기록, 턴당 1회)", () => {
    const game = createStandardGameFromState(craftFutureState());
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const handBefore = [...handIdsOf(st0, "p0")];
    const wallBefore = [...(st0.zones[WALL]?.tileIds ?? [])];
    // toEvents와 같은 방식으로 난수를 재현해 기대값을 계산 (결정론 검증)
    const prng = new Prng(0);
    prng.setState(st0.prngState);
    const expectedOut = prng.shuffle([...handBefore]).slice(0, 3);
    const expectedIn = wallBefore.slice(0, 3);

    // 보유자 턴 프롬프트에 후보가 노출된다
    const { flow, prompt } = turnPromptFor(game, "p0");
    expect(prompt.options.some((o) => o.type === "future_exchange")).toBe(true);

    const status = flow.submit("p0", { type: "future_exchange", payload: {} });

    const st1 = game.engine.state;
    const hand = st1.zones[handZone("p0")]?.tileIds ?? [];
    const wall = st1.zones[WALL]?.tileIds ?? [];
    const discards = st1.zones[discardsZone("p0")]?.tileIds ?? [];

    // 손패 수 보존: 3장 나가고 3장 들어옴
    expect(hand).toHaveLength(handBefore.length);
    for (const id of expectedIn) expect(hand).toContain(id);
    for (const id of expectedOut) expect(hand).not.toContain(id);
    // [0]은 버림더미로, [1]·[2]는 패산 맨 밑으로
    expect(discards).toEqual([expectedOut[0]]);
    expect(wall.slice(-2)).toEqual([expectedOut[1], expectedOut[2]]);
    expect(wall).toHaveLength(wallBefore.length - 1); // 3장 빠지고 2장 돌아옴
    // 마지막으로 들어온 패가 새 쯔모패
    expect(st1.round.lastDrawnTile).toBe(expectedIn[2]);
    // 난수 소비 반영 + 스택·뷰 기록
    expect(st1.prngState).not.toBe(st0.prngState);
    expect(st1.augmentData[STACKS_KEY]).toBe(1);
    expect(st1.augmentData["view:p0:future_stacks"]).toBe(1);

    // 같은 턴에는 재사용 불가 — 프롬프트에서도 사라지고 직접 제출도 거부
    expect(st1.round.phase).toBe("turn.act");
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const reprompt = status.prompts.find((p) => p.player === "p0");
    expect(
      reprompt?.options.some((o) => o.type === "future_exchange"),
    ).toBe(false);
    expect(reprompt?.options.some((o) => o.type === "discard")).toBe(true);
    const again = game.engine.submit({
      player: "p0",
      type: "future_exchange",
      payload: {},
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("already used this turn");
  });

  it("리치 중에는 쓸 수 없다", () => {
    const base = craftFutureState();
    const rs = base.round.byPlayer["p0"]!;
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const result = game.engine.submit({
      player: "p0",
      type: "future_exchange",
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("riichi: cannot see the future");
  });

  it("화료 시 이번 국 스택 × 500점을 추가로 얻는다", () => {
    // 멘젠쯔모 완성형 + 스택 3 주입 → +1500 기대
    const s = withAugments(
      craft({
        hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["future_sight"],
    );
    const state = withAugmentData(s, { [STACKS_KEY]: 3 });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });

    const { flow, prompt } = turnPromptFor(game, "p0");
    const winOption = prompt.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();
    const status = flow.submit("p0", winOption as { type: string; payload: unknown });
    expect(status).toEqual({ kind: "roundOver", outcome: "win" });

    const bonus = game.engine.eventLog.find(
      (e) =>
        e.type === SCORE_CHANGED &&
        (e.payload as ScoreChangedPayload).reason === "future_sight",
    );
    expect(bonus).toBeDefined();
    expect((bonus?.payload as ScoreChangedPayload).delta).toBe(1500);
    expect((bonus?.payload as ScoreChangedPayload).player).toBe("p0");
  });
});

// ─────────────────────────── rinshan_gamble ───────────────────────────

describe("rinshan_gamble — 도박사의 손", () => {
  const COUNTER_KEY = "rinshan_gamble:p0";
  const PICK_KEY = "rinshan_gamble:pick:p0";
  const USED_KEY = "rinshan_gamble:used:p0";

  function craftGambleState(): GameState {
    const s = craft({
      hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["rinshan_gamble"]);
  }

  /** Interceptor와 같은 시드 유도식으로 기대 대체패를 계산한다 */
  function expectedReplacement(state: GameState): TileId {
    const seed = (state.prngState ^ (state.lastEventSeq * 2654435761)) >>> 0;
    return new Prng(seed).pick(handIdsOf(state, "p0"));
  }

  it("gamble_start: 카운터 5와 사용 플래그가 기록되고, 게임당 1회만 가능하다", () => {
    const game = createStandardGameFromState(craftGambleState());
    installAugment(game.engine, rinshanGamble, "p0", { yaku: game.yaku });

    const { flow, prompt } = turnPromptFor(game, "p0");
    expect(prompt.options.some((o) => o.type === "gamble_start")).toBe(true);
    // pick이 열리기 전에는 take_rinshan이 제시되지 않는다
    expect(prompt.options.some((o) => o.type === "take_rinshan")).toBe(false);

    const status = flow.submit("p0", { type: "gamble_start", payload: {} });

    const st = game.engine.state;
    expect(st.augmentData[COUNTER_KEY]).toBe(5);
    expect(st.augmentData[USED_KEY]).toBe(true);
    // 같은 턴이 이어지고 (phase 유지) 재발동은 프롬프트에서도 사라진다
    expect(st.round.phase).toBe("turn.act");
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const reprompt = status.prompts.find((p) => p.player === "p0");
    expect(reprompt?.options.some((o) => o.type === "gamble_start")).toBe(false);
    const again = game.engine.submit({
      player: "p0",
      type: "gamble_start",
      payload: {},
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("gamble already used");
  });

  it("카운터가 남아 있으면 타패가 결정적 무작위 패로 대체되고 카운터가 준다", () => {
    const state = withAugmentData(craftGambleState(), {
      [COUNTER_KEY]: 5,
      [USED_KEY]: true,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, rinshanGamble, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const handBefore = [...handIdsOf(st0, "p0")];
    const expected = expectedReplacement(st0);
    const chosen = handBefore[0] as TileId; // 플레이어가 버리려던 패

    const r = game.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId: chosen },
    });
    expect(r.ok).toBe(true);

    const st1 = game.engine.state;
    // 실제로 버려진 패는 요청한 패가 아니라 시드로 유도된 무작위 패
    expect(st1.zones[discardsZone("p0")]?.tileIds).toEqual([expected]);
    const discardEvent = game.engine.eventLog.find(
      (e) => e.type === TILE_DISCARDED,
    );
    expect((discardEvent?.payload as TileDiscardedPayload).tileId).toBe(expected);
    const handAfter = st1.zones[handZone("p0")]?.tileIds ?? [];
    expect(handAfter).toHaveLength(handBefore.length - 1);
    expect(handAfter).not.toContain(expected);
    if (expected !== chosen) expect(handAfter).toContain(chosen);
    // 카운터 5→4, 아직 pick은 닫혀 있고, prngState는 소비하지 않는다
    expect(st1.augmentData[COUNTER_KEY]).toBe(4);
    expect(st1.augmentData[PICK_KEY]).toBeUndefined();
    expect(st1.prngState).toBe(st0.prngState);
  });

  it("마지막 5회째 타패가 끝나면 영상패 교환(pick)이 열린다", () => {
    const state = withAugmentData(craftGambleState(), {
      [COUNTER_KEY]: 1,
      [USED_KEY]: true,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, rinshanGamble, "p0", { yaku: game.yaku });

    const chosen = handIdsOf(game.engine.state, "p0")[0] as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId: chosen },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData[COUNTER_KEY]).toBe(0);
    expect(game.engine.state.augmentData[PICK_KEY]).toBe(true);
  });

  it("리치 선언 타패는 대체되지 않는다 (횟수는 소모)", () => {
    // 1z를 버리면 5s 단기 텐파이 — 리치 선언
    const s = withAugments(
      craft({
        hands: { p0: "234m345p345s678s5s1z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["rinshan_gamble"],
    );
    const state = withAugmentData(s, { [COUNTER_KEY]: 5, [USED_KEY]: true });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, rinshanGamble, "p0", { yaku: game.yaku });

    const drawn = game.engine.state.round.lastDrawnTile as TileId; // 1z
    const r = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: drawn },
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    // 선언패는 요청한 그대로 버려진다 (대체 없음)
    expect(st.zones[discardsZone("p0")]?.tileIds).toEqual([drawn]);
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    // 타패 1회로 카운터는 소모된다
    expect(st.augmentData[COUNTER_KEY]).toBe(4);
  });

  it("take_rinshan: 원하는 영상패를 쯔모패와 맞바꾼다 (왕패 장수 보존, 1회용)", () => {
    const state = withAugmentData(craftGambleState(), {
      [COUNTER_KEY]: 0,
      [USED_KEY]: true,
      [PICK_KEY]: true,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, rinshanGamble, "p0", { yaku: game.yaku });

    // 프롬프트에 인덱스 0~3 네 후보가 노출된다 (gamble_start는 사용됨)
    const { flow, prompt } = turnPromptFor(game, "p0");
    const takes = prompt.options.filter((o) => o.type === "take_rinshan");
    expect(takes).toHaveLength(4);
    expect(prompt.options.some((o) => o.type === "gamble_start")).toBe(false);

    const st0 = game.engine.state;
    const drawn = st0.round.lastDrawnTile as TileId;
    const deadBefore = [...(st0.zones[DEAD_WALL]?.tileIds ?? [])];
    const target = deadBefore[2] as TileId;

    flow.submit("p0", { type: "take_rinshan", payload: { index: 2 } });

    const st1 = game.engine.state;
    const hand = st1.zones[handZone("p0")]?.tileIds ?? [];
    const dead = st1.zones[DEAD_WALL]?.tileIds ?? [];
    // 영상패가 손으로, 쯔모패가 그 자리(index 2)로 — 왕패 장수 보존
    expect(hand).toContain(target);
    expect(hand).not.toContain(drawn);
    expect(dead[2]).toBe(drawn);
    expect(dead).toHaveLength(deadBefore.length);
    // 가져온 패가 새 쯔모패, pick 플래그 해제
    expect(st1.round.lastDrawnTile).toBe(target);
    expect(st1.augmentData[PICK_KEY]).toBe(false);
    // 재사용 거부
    const again = game.engine.submit({
      player: "p0",
      type: "take_rinshan",
      payload: { index: 0 },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("no rinshan pick available");
  });
});
