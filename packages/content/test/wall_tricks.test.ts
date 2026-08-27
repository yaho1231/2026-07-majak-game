/**
 * wall_tricks 그룹 테스트 — 패산 조작 증강 2종.
 * future_sight / bottom_deal
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  Prng,
  ROUND_SETTLED,
  TILE_DISCARDED,
  WALL,
  buildPlayerView,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  handZone,
  installAugment,
  isTenpai,
  kindKey,
  uraIndicatorIds,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileDiscardedPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { botCtx, craft, h, hanBonusPoints } from "./helpers.js";
import { futureSight } from "../src/augments/future_sight.js";
import { bottomDeal } from "../src/augments/bottom_deal.js";
import { botChosenOption } from "@majak/core";

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
  const STACKS_KEY = "future_sight:stacks:1-1-0:p0#round";

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

    // 52차 후속(사용자 피드백): 턴이 시작되자마자 교환 프롬프트가 뜨던 것을 막았다 —
    // **액티브 버튼(future_arm)을 눌러야** 비로소 교환 후보가 제시된다.
    const { flow, prompt } = turnPromptFor(game, "p0");
    expect(prompt.options.some((o) => o.type === "future_exchange")).toBe(false);
    expect(prompt.options.some((o) => o.type === "future_arm")).toBe(true);
    const armed = flow.submit("p0", { type: "future_arm", payload: {} });
    if (armed.kind !== "awaiting") throw new Error("expected awaiting after arm");
    const armedPrompt = armed.prompts.find((p) => p.player === "p0");
    expect(armedPrompt?.options.some((o) => o.type === "future_exchange")).toBe(true);

    // 48차: 무작위 3장 중 바닥에 버릴 패를 내가 고른다 — 여기서는 [1]번을 골라 본다
    const chosen = expectedOut[1] as TileId;
    const status = flow.submit("p0", { type: "future_exchange", payload: { tileId: chosen } });

    const st1 = game.engine.state;
    const hand = st1.zones[handZone("p0")]?.tileIds ?? [];
    const wall = st1.zones[WALL]?.tileIds ?? [];
    const discards = st1.zones[discardsZone("p0")]?.tileIds ?? [];

    // 손패 수 보존: 3장 나가고 3장 들어옴
    expect(hand).toHaveLength(handBefore.length);
    for (const id of expectedIn) expect(hand).toContain(id);
    for (const id of expectedOut) expect(hand).not.toContain(id);
    // 내가 고른 패가 바닥으로, 나머지 2장이 패산 맨 밑으로 (원래 순서 유지)
    expect(discards).toEqual([chosen]);
    expect(wall.slice(-2)).toEqual([expectedOut[0], expectedOut[2]]);
    expect(wall).toHaveLength(wallBefore.length - 1); // 3장 빠지고 2장 돌아옴
    // 마지막으로 들어온 패가 새 쯔모패
    expect(st1.round.lastDrawnTile).toBe(expectedIn[2]);
    // 난수 소비 반영 + 스택·뷰 기록
    expect(st1.prngState).not.toBe(st0.prngState);
    expect(st1.augmentData[STACKS_KEY]).toBe(1);
    // 쌓인 판수는 전원 공개 채널로 나간다 — 이름표 증강 pill이 "+N판"으로 띄운다
    expect(
      buildPlayerView(st1, "p1", game.engine.rules).augmentView["future_sight:p0"],
    ).toBe(1);

    // 같은 순에는 재사용 불가 — 프롬프트에서도 사라지고 직접 제출도 거부
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
      payload: { tileId: hand[0] as TileId },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("future sight is on cooldown");
  });

  // ── 3순에 1회 (2026-08-02 사용자 지시) ──
  const TURNS_KEY = "future_sight:turns:1-1-0:p0#round";
  const LAST_KEY = "future_sight:last:1-1-0:p0#round";

  /** 순 번호(turns)와 마지막 발동 순(last)을 주입하고 무장이 통과하는지 본다 */
  function armOk(turns: number, last: number | null): boolean {
    const st = withAugmentData(craftFutureState(), {
      [TURNS_KEY]: turns,
      ...(last === null ? {} : { [LAST_KEY]: last }),
    });
    const game = createStandardGameFromState(st);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    return game.engine.submit({ player: "p0", type: "future_arm", payload: {} }).ok;
  }

  it("3순에 1회 — 내 순이 세 번 지나야 다시 열린다", () => {
    expect(armOk(0, null)).toBe(true); // 이 국에 아직 안 썼다
    expect(armOk(0, 0)).toBe(false); // 방금 쓴 그 순
    expect(armOk(1, 0)).toBe(false);
    expect(armOk(2, 0)).toBe(false);
    expect(armOk(3, 0)).toBe(true); // 세 순이 지났다
  });

  it("순 카운터는 **내 버림**에만 오른다 — 교환이 바닥에 놓는 한 장은 세지 않는다", () => {
    const game = createStandardGameFromState(craftFutureState());
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const turns = (): unknown => game.engine.state.augmentData[TURNS_KEY];

    game.engine.submit({ player: "p0", type: "future_arm", payload: {} });
    const three = handIdsOf(game.engine.state, "p0");
    const opt = new FlowController(game.engine)
      .begin();
    if (opt.kind !== "awaiting") throw new Error("expected awaiting");
    const ex = opt.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "future_exchange");
    expect(ex).toBeDefined();
    game.engine.submit({ player: "p0", type: "future_exchange", payload: ex!.payload });
    // 교환은 바닥에 한 장을 놓지만 그건 내 '순'이 아니다
    expect(turns()).toBeUndefined();
    expect(three.length).toBeGreaterThan(0);

    // 진짜 버림이 있어야 순이 넘어간다
    const tileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    expect(game.engine.submit({ player: "p0", type: "discard", payload: { tileId } }).ok).toBe(true);
    expect(turns()).toBe(1);
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
    const handIds = game.engine.state.zones[handZone("p0")]?.tileIds ?? [];
    const result = game.engine.submit({
      player: "p0",
      type: "future_exchange",
      payload: { tileId: handIds[0] as TileId },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("riichi: cannot see the future");
  });

  /** 멘젠쯔모 완성형으로 화료시키고, 화료점 위에 얹힌 보너스를 돌려준다 */
  function settleWithStacks(stacks: number): { bonus: number; expected: (han: number) => number } {
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
    const state = withAugmentData(s, { [STACKS_KEY]: stacks });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });

    const { flow, prompt } = turnPromptFor(game, "p0");
    const winOption = prompt.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();
    const before = game.engine.state;
    const status = flow.submit("p0", winOption as { type: string; payload: unknown });
    expect(status).toEqual({ kind: "roundOver", outcome: "win" });

    const settled = game.engine.eventLog
      .filter((e) => e.type === ROUND_SETTLED)
      .map((e) => e.payload as RoundSettledPayload)
      .at(-1);
    expect(settled).toBeDefined();
    const info = (settled?.winInfos ?? []).find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    return {
      bonus: (settled?.deltas["p0"] ?? 0) - info!.points,
      expected: (han) => hanBonusPoints(before, "p0", info!, han),
    };
  }

  it("화료 시 이번 국 **스택당 +1판**을 얻는다", () => {
    // 2026-07-26: 매 순 발동이라 스택당 1판이 과해 2스택당 1판으로 낮췄었다.
    // 2026-08-02: 발동을 3순에 1회로 조이면서 스택당 1판으로 되돌렸다(사용자 지시).
    for (const [stacks, han] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] as const) {
      const { bonus, expected } = settleWithStacks(stacks);
      expect(expected(han)).toBeGreaterThan(0); // 스택 하나부터 실제 점수가 붙는다
      expect(bonus).toBe(expected(han));
    }
  });
});


// ─────────────────────────── bottom_deal ───────────────────────────

describe("bottom_deal — 밑장빼기", () => {
  const PEEK = 3;

  /** 예약 플래그 키 (roundKey 스코프 — 상태에서 직접 뽑아 하드코딩을 피한다) */
  const armedKey = (s: GameState): string => {
    const r = s.round;
    return `bottom_deal:armed:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0#round`;
  };
  const VIEW_ARMED_KEY = "view:p0:bottom_deal:armed:p0#round";
  const NOTICE_KEY = "view:*:bottom_deal:armed:p0#round";
  /** 마지막 선언 턴 번호 키 (2026-08-27 2순 쿨다운) */
  const lastUsedKey = (s: GameState): string => {
    const r = s.round;
    return `bottom_deal:last:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0#round`;
  };
  /** 쿨다운 잔량 pill 채널 (보유자 전용) */
  const COOLDOWN_VIEW_KEY = "view:p0:cooldownTurns:bottom_deal";

  /**
   * 자기 턴(turn.act, 14장) — 예약 절차를 보는 장면.
   * `myDiscards`로 내 버림 수(= 내 턴 번호)를 조절해 쿨다운 경계를 만든다.
   */
  function actScene(myDiscards = ""): GameState {
    const s = craft({
      hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: myDiscards, p1: "", p2: "", p3: "" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["bottom_deal"]);
  }

  /** 자기 쯔모 직전(turn.draw, 13장) — 실제 밑장 쯔모를 보는 장면 */
  function drawScene(armed: boolean): GameState {
    const s = withAugments(
      craft({
        hands: { p0: "123m456m789m123p9p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      "p0",
      ["bottom_deal"],
    );
    return armed ? withAugmentData(s, { [armedKey(s)]: true }) : s;
  }

  /** 패산 맨 밑에 패 한 장을 밀어 넣는다 (미래를 보는 자 등이 하는 짓) */
  function pushToBottom(s: GameState, tileId: TileId): GameState {
    const wall = s.zones[WALL];
    if (wall === undefined) throw new Error("no wall");
    return {
      ...s,
      zones: { ...s.zones, [WALL]: { ...wall, tileIds: [...wall.tileIds, tileId] } },
    };
  }

  it("패산 맨 밑 3장만 보유자에게 공개된다 (앞은 안 보이고, 남에게는 전부 숨는다)", () => {
    const game = createStandardGameFromState(actScene());
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st = game.engine.state;
    const wall = st.zones[WALL]?.tileIds ?? [];
    const mine = buildPlayerView(st, "p0", game.engine.rules);
    const other = buildPlayerView(st, "p1", game.engine.rules);

    // 뒤 3장 그대로 — 배열 순서 유지, 마지막 원소가 맨 밑장
    expect(mine.zones[WALL]?.tileIds).toEqual(wall.slice(-PEEK));
    expect(mine.zones[WALL]?.hiddenCount).toBe(wall.length - PEEK);
    // 다음에 뽑을 앞쪽은 여전히 안 보인다 (미래를 보는 자와 방향이 반대다)
    expect(mine.zones[WALL]?.tileIds).not.toContain(wall[0]);
    // 보인 패는 kind까지 실려 실물로 렌더할 수 있다
    for (const id of mine.zones[WALL]?.tileIds ?? []) {
      expect(mine.tiles[id]?.kind).toBeDefined();
    }
    // 남에게는 그대로 감춰진 채다
    expect(other.zones[WALL]?.tileIds).toEqual([]);
    expect(other.zones[WALL]?.hiddenCount).toBe(wall.length);
  });

  it("열람은 스냅샷이 아니다 — 밑에 D가 들어오면 ABC가 BCD로 밀린다", () => {
    const game = createStandardGameFromState(actScene());
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const wall0 = st0.zones[WALL]?.tileIds ?? [];
    const abc = wall0.slice(-PEEK);
    expect(buildPlayerView(st0, "p0", game.engine.rules).zones[WALL]?.tileIds).toEqual(abc);

    // 다른 증강이 패산 맨 밑으로 패 한 장(D)을 밀어 넣은 상황
    const d = st0.zones[DEAD_WALL]?.tileIds[0] as TileId;
    const st1 = pushToBottom(st0, d);
    const shifted = buildPlayerView(st1, "p0", game.engine.rules).zones[WALL]?.tileIds;

    // ABC → BCD: 창이 그대로 따라 밀린다 (A는 밀려나고 D가 새 밑장)
    expect(shifted).toEqual([...abc.slice(1), d]);
    expect(shifted?.at(-1)).toBe(d);
    expect(shifted).not.toContain(abc[0]);
  });

  it("예약하면 다음 쯔모가 패산 위가 아니라 맨 밑에서 온다 (밑에서 한 장 줄고 장수는 동일)", () => {
    const game = createStandardGameFromState(drawScene(true));
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const wall0 = [...(st0.zones[WALL]?.tileIds ?? [])];
    const top = wall0[0] as TileId;
    const bottom = wall0[wall0.length - 1] as TileId;
    expect(top).not.toBe(bottom);

    new FlowController(game.engine).begin();

    const st1 = game.engine.state;
    const hand = handIdsOf(st1, "p0");
    const wall1 = st1.zones[WALL]?.tileIds ?? [];
    // 맨 밑장이 손으로, 위에서 뽑을 패는 그대로 남았다
    expect(hand).toContain(bottom);
    expect(hand).not.toContain(top);
    expect(st1.round.lastDrawnTile).toBe(bottom);
    // 패산은 **밑에서** 한 장 줄었다 — 앞은 손대지 않았다
    expect(wall1).toEqual(wall0.slice(0, -1));
    // 장수 변화는 위에서 뽑는 것과 같다 → 유국 타이밍이 바뀌지 않는다
    expect(wall1).toHaveLength(wall0.length - 1);
    // 예약은 소비된다 (뷰 채널·전원 공개 마커까지 함께 내려간다)
    expect(st1.augmentData[armedKey(st1)]).toBe(false);
    expect(st1.augmentData[VIEW_ARMED_KEY]).toBe(false);
    expect(st1.augmentData[NOTICE_KEY]).toBe(false);
  });

  it("패산이 한 장뿐이라 바꿀 것이 없으면 예약을 소비하지 않는다", () => {
    /*
     * 인터셉터는 위와 밑이 같은 패면(패산 1장) 그냥 지나가는데, 소비 리액션에는
     * 그 조건이 없어 **국당 1회 예약이 아무 일 없이 날아갔다**(docs/25 벽패 #11).
     * 주석은 "조건이 인터셉터와 같다"고 적혀 있었지만 실제로는 달랐다.
     */
    const base = drawScene(true);
    const wall = base.zones[WALL];
    if (wall === undefined) throw new Error("no wall");
    const one: GameState = {
      ...base,
      zones: {
        ...base.zones,
        // 패산을 한 장만 남긴다 — 위와 밑이 같은 패다
        [WALL]: { ...wall, tileIds: wall.tileIds.slice(0, 1) },
      },
    };
    const game = createStandardGameFromState(one);
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();

    const st = game.engine.state;
    expect(st.augmentData[armedKey(st)]).toBe(true); // 예약은 그대로 살아 있다
  });

  it("밑장을 빼면 보이는 창이 되돌아온다 (BCD → ABC)", () => {
    const game = createStandardGameFromState(drawScene(true));
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const wall0 = st0.zones[WALL]?.tileIds ?? [];
    const bcd = wall0.slice(-PEEK);
    expect(buildPlayerView(st0, "p0", game.engine.rules).zones[WALL]?.tileIds).toEqual(bcd);

    new FlowController(game.engine).begin();

    const shown =
      buildPlayerView(game.engine.state, "p0", game.engine.rules).zones[WALL]?.tileIds;
    // D(=bcd의 마지막)가 손으로 갔으니 그 위 한 장이 새로 창에 들어온다
    expect(shown?.slice(1)).toEqual(bcd.slice(0, -1));
    expect(shown).not.toContain(bcd.at(-1));
    expect(shown).toHaveLength(PEEK);
  });

  it("예약하지 않으면 평소처럼 패산 위에서 뽑는다 (대조군)", () => {
    const game = createStandardGameFromState(drawScene(false));
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const wall0 = [...(game.engine.state.zones[WALL]?.tileIds ?? [])];
    new FlowController(game.engine).begin();

    const st1 = game.engine.state;
    expect(handIdsOf(st1, "p0")).toContain(wall0[0]);
    expect(st1.round.lastDrawnTile).toBe(wall0[0]);
    // 앞에서 한 장 빠지고 밑은 그대로다
    expect(st1.zones[WALL]?.tileIds).toEqual(wall0.slice(1));
  });

  it("턴 후보로 예약 버튼이 제시되고, 제출하면 전원 공개 마커가 켜진다", () => {
    const game = createStandardGameFromState(actScene());
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const { flow, prompt } = turnPromptFor(game, "p0");
    const arms = prompt.options.filter((o) => o.type === "bottom_deal");
    expect(arms).toHaveLength(1);

    flow.submit("p0", { type: "bottom_deal", payload: {} });

    const st = game.engine.state;
    expect(st.augmentData[armedKey(st)]).toBe(true);
    // 선언 사실은 전원이 안다 — 무엇이 보이는지는 아니다 (Rule #4의 전제)
    expect(st.augmentData[NOTICE_KEY]).toBe(true);
    expect(st.augmentData[VIEW_ARMED_KEY]).toBe(true);
    const other = buildPlayerView(st, "p1", game.engine.rules);
    expect(other.augmentView["bottom_deal:armed:p0"]).toBe(true);
    // 그래도 밑 3장은 남에게 안 보인다
    expect(other.zones[WALL]?.tileIds).toEqual([]);
  });

  it("이미 예약했으면 후보도 사라지고 제출도 거부된다", () => {
    const base = actScene();
    const game = createStandardGameFromState(
      withAugmentData(base, { [armedKey(base)]: true }),
    );
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const { prompt } = turnPromptFor(game, "p0");
    expect(prompt.options.some((o) => o.type === "bottom_deal")).toBe(false);
    const r = game.engine.submit({ player: "p0", type: "bottom_deal", payload: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bottom deal already armed");
  });

  /*
   * 밸런스 2026-08-27: **매 순 무제한 → 2순에 1회**.
   * 예전에는 canArm이 "이미 예약됐는가"만 봐서, 예약 → 다음 쯔모에 소비 → 그 턴에
   * 곧바로 재예약이 성립해 국 내내 매 순 밑장을 빼올 수 있었다.
   * 기준은 무르기(take_back)와 같은 **내가 버린 수(= 내 턴 번호)**다.
   */
  describe("2순 쿨다운", () => {
    /** 선언 턴 `last`, 현재 턴 `now`인 장면에서 예약 버튼이 뜨는가 */
    function armableAt(last: number, now: number): boolean {
      const base = actScene(
        Array.from({ length: now }, (_, i) => `${i + 1}z`).join(""),
      );
      expect(base.round.byPlayer["p0"]?.discardCount).toBe(now);
      const game = createStandardGameFromState(
        withAugmentData(base, { [lastUsedKey(base)]: last }),
      );
      installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
      const { prompt } = turnPromptFor(game, "p0");
      const offered = prompt.options.some((o) => o.type === "bottom_deal");
      const res = game.engine.submit({ player: "p0", type: "bottom_deal", payload: {} });
      // 후보 목록과 validate는 반드시 같은 판정을 쓴다
      expect(res.ok).toBe(offered);
      if (!res.ok) expect(res.reason).toBe("bottom deal is on cooldown");
      return offered;
    }

    it("선언한 그 순에는 다시 걸 수 없다", () => {
      expect(armableAt(1, 1)).toBe(false);
    });

    it("한 순만 지나도 아직 잠겨 있다", () => {
      expect(armableAt(1, 2)).toBe(false);
    });

    it("두 순이 지나면 다시 열린다", () => {
      expect(armableAt(1, 3)).toBe(true);
    });

    it("선언하면 그 순 번호가 기록되고 잔량 pill이 2로 찬다", () => {
      const base = actScene("1z2z"); // 내 턴 번호 2
      const game = createStandardGameFromState(base);
      installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
      const { flow } = turnPromptFor(game, "p0");
      flow.submit("p0", { type: "bottom_deal", payload: {} });
      const st = game.engine.state;
      // 쿨다운은 **선언 시점**부터 센다 (소비 시점이 아니다)
      expect(st.augmentData[lastUsedKey(st)]).toBe(2);
      expect(st.augmentData[COOLDOWN_VIEW_KEY]).toBe(2);
    });

    it("국이 바뀌면 쿨다운도 함께 풀린다 (roundKey 스코프)", () => {
      const base = actScene();
      const stale: GameState = {
        ...base,
        // 옛 국의 쿨다운 기록 — 본장이 다르면 이번 국에서 읽히지 않는다
        augmentData: { ...base.augmentData, [lastUsedKey(base)]: 5 },
        round: { ...base.round, honba: base.round.honba + 1 },
      };
      const game = createStandardGameFromState(stale);
      installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
      const { prompt } = turnPromptFor(game, "p0");
      expect(prompt.options.some((o) => o.type === "bottom_deal")).toBe(true);
    });
  });

  it("예약이 소비되고 쿨다운이 없으면 같은 국에 다시 예약할 수 있다", () => {
    const game = createStandardGameFromState(drawScene(true));
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const { flow } = (() => {
      const f = new FlowController(game.engine);
      f.begin();
      return { flow: f };
    })();

    // 밑장 쯔모로 예약이 풀린 뒤(turn.act) 곧바로 다시 예약된다
    expect(game.engine.state.augmentData[armedKey(game.engine.state)]).toBe(false);
    const again = flow.submit("p0", { type: "bottom_deal", payload: {} });
    expect(again.kind).not.toBe("rejected");
    expect(game.engine.state.augmentData[armedKey(game.engine.state)]).toBe(true);
  });

  it("국이 바뀌면 예약이 저절로 풀린다 (roundKey 스코프)", () => {
    const base = actScene();
    // 본장만 다른 상태 — 옛 국의 예약 키는 이번 국에서 읽히지 않는다
    const stale: GameState = {
      ...base,
      augmentData: { ...base.augmentData, [armedKey(base)]: true },
      round: { ...base.round, honba: base.round.honba + 1 },
    };
    const game = createStandardGameFromState(stale);
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const { prompt } = turnPromptFor(game, "p0");
    // 예약이 풀렸으므로 다시 제시된다
    expect(prompt.options.some((o) => o.type === "bottom_deal")).toBe(true);
  });

  it("깡의 영상패는 밑장이 아니다 — 예약이 소비되지 않고 그대로 남는다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "1111m23456789m1p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["bottom_deal"],
    );
    const game = createStandardGameFromState(
      withAugmentData(base, { [armedKey(base)]: true }),
    );
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const wallBottom = st0.zones[WALL]?.tileIds.at(-1) as TileId;
    const rinshan = st0.zones[DEAD_WALL]?.tileIds[0] as TileId;
    const { flow, prompt } = turnPromptFor(game, "p0");
    const ankan = prompt.options.find(
      (o) => o.type === "ankan" && (o.payload as { tileIds: TileId[] }).tileIds.length === 4,
    );
    expect(ankan).toBeDefined();

    flow.submit("p0", { type: "ankan", payload: ankan?.payload as object });

    const st1 = game.engine.state;
    // 영상패를 뽑았고 밑장은 건드리지 않았다
    expect(handIdsOf(st1, "p0")).toContain(rinshan);
    expect(handIdsOf(st1, "p0")).not.toContain(wallBottom);
    expect(st1.zones[WALL]?.tileIds.at(-1)).toBe(wallBottom);
    // 예약은 그대로 살아 있어 다음 일반 쯔모에 쓰인다
    expect(st1.augmentData[armedKey(st1)]).toBe(true);
  });

  it("리치 중에도 쓸 수 있다 (뽑는 자리만 바꾸므로 손이 잠긴 것과 충돌하지 않는다)", () => {
    const base = drawScene(true);
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
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const bottom = game.engine.state.zones[WALL]?.tileIds.at(-1) as TileId;
    new FlowController(game.engine).begin();

    // 리치 중에도 밑장이 그대로 들어온다
    expect(game.engine.state.round.lastDrawnTile).toBe(bottom);
    expect(handIdsOf(game.engine.state, "p0")).toContain(bottom);
  });

  it("타패에는 아무 간섭도 하지 않는다", () => {
    const game = createStandardGameFromState(actScene());
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });

    const st0 = game.engine.state;
    const chosen = handIdsOf(st0, "p0")[0] as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId: chosen },
    });
    expect(r.ok).toBe(true);

    const st1 = game.engine.state;
    expect(st1.zones[discardsZone("p0")]?.tileIds).toEqual([chosen]);
    const discardEvent = game.engine.eventLog.find((e) => e.type === TILE_DISCARDED);
    expect((discardEvent?.payload as TileDiscardedPayload).tileId).toBe(chosen);
    // 예약은 타패로 걸리지도 풀리지도 않는다
    expect(st1.augmentData[armedKey(st1)]).toBeUndefined();
  });
});

// ───────────────── bottom_deal 실게임 스위프 ─────────────────

/**
 * 일반 스위프(backlog_*_sweep)는 증강 액션을 국당 한 번만 쓰므로 밑장빼기의
 * **재예약** 경로가 돌지 않는다. 여기서는 제시될 때마다 매번 예약해 인터셉터와
 * 소비 reaction이 한 국 내내 반복 작동하는지 본다.
 *
 * ⚠ installAugment만으로는 `player.augments`에 id가 들어가지 않는다 (그건 드래프트
 * 리듀서의 몫이다 — augment/events.ts). validate가 보유 여부를 보므로 withAugments로
 * 실제 보유 상태를 만들어야 후보가 제시된다.
 */
describe("bottom_deal — 실게임 한 국 완주 (기회가 될 때마다 재예약)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];

  for (const seed of SEEDS) {
    it(`seed ${seed} — 열릴 때마다 걸어도 완주하고, 간격은 항상 2순 이상이다`, () => {
      const state = withAugments(
        craft({
          hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
          phase: "turn.draw",
          turnSeat: 0,
          seed,
        }),
        "p0",
        ["bottom_deal"],
      );
      const game = createStandardGameFromState(state);
      installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
      const flow = new FlowController(game.engine);
      let status = flow.begin();
      let guard = 0;
      /** 예약을 건 내 턴 번호들 (= 그 시점의 내 버림 수) */
      const armedTurns: number[] = [];
      let maxHand = 0;
      while (status.kind === "awaiting" && guard++ < 2000) {
        const prompt = status.prompts[0]!;
        maxHand = Math.max(maxHand, handIdsOf(game.engine.state, "p0").length);
        const win = prompt.options.find((o) => o.type === "win");
        // 제시되면 무조건 예약한다 — 쿨다운이 허락하는 최대 빈도를 만든다
        const arm = prompt.options.find((o) => o.type === "bottom_deal");
        const discard = prompt.options.find((o) => o.type === "discard");
        const pass = prompt.options.find((o) => o.type === "pass");
        const choice = win ?? arm ?? discard ?? pass ?? prompt.options[0]!;
        if (choice === arm) {
          armedTurns.push(game.engine.state.round.byPlayer["p0"]?.discardCount ?? 0);
        }
        status = flow.submit(prompt.player, choice);
      }
      expect(status.kind).toBe("roundOver");
      // 한 번은 걸렸다 (경로 자체가 돈다)
      expect(armedTurns.length).toBeGreaterThan(0);
      /*
       * 밸런스 2026-08-27: 예전에는 여기서 `> 1`을 요구했다 — 매 순 무제한 재예약이
       * 사양이었기 때문이다. 이제는 **간격**이 계약이다. 짧은 국이면 한 번으로 끝난다.
       */
      for (let i = 1; i < armedTurns.length; i++) {
        expect(armedTurns[i]! - armedTurns[i - 1]!).toBeGreaterThanOrEqual(2);
      }
      // 밑장을 계속 빼도 손패가 불어나지 않는다 (교환이 아니라 쯔모 자리 변경이다)
      expect(maxHand).toBeLessThanOrEqual(14);
    });
  }
});

// ───────────────── bottom_deal 봇 정책 ─────────────────

/**
 * bot.choose를 **실제 뷰**로 태운다. bot_policy_behavior의 합성 뷰와 달리,
 * 밑장빼기의 정책은 `view.zones[WALL]`에 열람으로 들어온 3장을 읽으므로
 * 가시성이 실제로 적용된 뷰가 아니면 시험이 되지 않는다.
 */
describe("bottom_deal — 봇 정책 (실게임 뷰)", () => {
  const rng = { int: () => 0, float: () => 0 };

  /** p0의 실제 프롬프트·뷰로 봇에게 물어본다 */
  function askBot(state: GameState): {
    picked: unknown;
    bottomKind: string;
    hand: TileKind[];
  } {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
    const { prompt } = turnPromptFor(game, "p0");
    const st = game.engine.state;
    const view = buildPlayerView(st, "p0", game.engine.rules);
    const drawn = view.round.myDrawnTile;
    const hand = (view.zones[handZone("p0")]?.tileIds ?? [])
      .filter((id) => id !== drawn)
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    const bottomId = view.zones[WALL]?.tileIds.at(-1) as TileId;
    const picked = botChosenOption(bottomDeal.bot?.choose(
      botCtx(view, prompt.options, {
        rng,
        tenpai: isTenpai(hand, view.round.byPlayer["p0"]?.meldCount ?? 0),
      }),
    ) ?? null);
    return { picked, bottomKind: kindKey(view.tiles[bottomId]!.kind), hand };
  }

  /**
   * 패산 맨 밑을 원하는 패로 갈아 끼운다 (봇이 무엇을 보게 될지 통제한다).
   * 특정 종류 4장이 손패·왕패·남의 손으로 다 빠져 패산에 없을 수 있으므로
   * **후보를 여러 개** 받아 패산에 남아 있는 첫 번째를 쓴다.
   */
  function setBottom(s: GameState, candidates: string): GameState {
    const wall = s.zones[WALL];
    if (wall === undefined) throw new Error("no wall");
    const wanted = h(candidates).map(kindKey);
    for (const key of wanted) {
      const found = wall.tileIds.find((id) => kindKey(s.tiles[id]!.kind) === key);
      if (found === undefined) continue;
      const rest = wall.tileIds.filter((id) => id !== found);
      return {
        ...s,
        zones: { ...s.zones, [WALL]: { ...wall, tileIds: [...rest, found] } },
      };
    }
    throw new Error(`none of ${wanted.join(",")} left in wall`);
  }

  function scene(handSpec: string, bottom: string): GameState {
    return setBottom(
      withAugments(
        craft({
          hands: { p0: handSpec, p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        "p0",
        ["bottom_deal"],
      ),
      bottom,
    );
  }

  it("텐파이 + 밑장이 오름패면 예약한다 (빼오는 순간 쯔모 화료)", () => {
    // 123m456m789m123p + 9p 대기(9p 단기) → 밑장이 9p면 그 자리에서 화료
    const { picked } = askBot(scene("123m456m789m123p9p5z", "9p"));
    expect(picked).not.toBeNull();
    expect((picked as { type: string }).type).toBe("bottom_deal");
  });

  it("밑장이 손에 쓸모없으면 예약하지 않는다 (아낀다)", () => {
    // 수패로만 짠 손 + 밑장이 고립 자패 → 가져올 이유가 없다
    const { picked } = askBot(scene("123m456m789m123p99p", "5z6z7z"));
    expect(picked).toBeNull();
  });

  it("텐파이가 아니어도 손이 진전되는 밑장이면 예약한다", () => {
    // 7p를 들고 있으니 7p(짝)·8p(이웃)는 손을 진전시킨다.
    // (craft의 패산에는 뒤쪽 id만 남으므로 후보를 패산에 실재하는 종류로 잡는다)
    const { picked } = askBot(scene("19m19s7p11z22z33z44z5z", "7p8p6p"));
    expect(picked).not.toBeNull();
    expect((picked as { type: string }).type).toBe("bottom_deal");
  });

  it("예약이 이미 걸려 후보가 없으면 null을 돌려준다 (크래시하지 않는다)", () => {
    const base = scene("123m456m789m123p99p", "9p8p7p");
    const armed = withAugmentData(base, {
      [`bottom_deal:armed:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p0#round`]:
        true,
    });
    expect(askBot(armed).picked).toBeNull();
  });
});
