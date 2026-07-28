/**
 * 증강 2종 조합 감사(docs/21) 수정 회귀 테스트 — 60차, 2026-07-27.
 *
 * 여기서 지키는 계약:
 *  1. 무장해제 × 진짜 용 — 손패가 표준 장수로 돌아오고 **화료가 가능해진다**(하드락 해소).
 *  2. 무장해제는 순수 액션형 증강의 **액티브 버튼까지** 잠근다.
 *  3. 진짜 용 × 절벽 위에 피어난 꽃 — 17장 손에서도 만개가 작동한다.
 *  4. 진짜 용 × 밑장빼기 — 뷰의 scoringOptions로 5멘쯔 대기를 읽는다.
 *  5. 정산 인터셉터는 **설치(드래프트 픽) 순서와 무관하게** 같은 결과를 낸다.
 *  6. 역만 방어술은 책임전가가 재분배한 지불까지 **완전 면역**한다.
 *  7. 리치 봉인은 오픈 리치·모 아니면 도까지 막는다.
 *  8. 무너진 국경은 슌쯔만, 동수의 결속은 커쯔만 담당한다.
 *  9. 일확천금은 국의 첫 순에만, 가중 확률(0.5/1/2/3 = 30/30/30/10)로 돌아간다.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_DISARMED,
  DISARMED_SOURCES_KEY,
  FlowController,
  ROUND_SETTLED,
  WALL,
  augmentInstanceId,
  buildPlayerView,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isTenpai,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import * as C from "../src/index.js";

// ─────────────────────────── 공용 하네스 ───────────────────────────

function withAug(
  state: GameState,
  grants: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      grants[p.id] === undefined
        ? p
        : { ...p, augments: [...p.augments, ...(grants[p.id] as string[])] },
    ),
  };
}

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

type Game = ReturnType<typeof createStandardGameFromState>;

function mk(
  state: GameState,
  installs: { def: AugmentDef; holder: PlayerId }[],
): Game {
  const game = createStandardGameFromState(state);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku });
  }
  return game;
}

function validate(
  game: Game,
  player: PlayerId,
  type: string,
  payload: unknown,
): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) return `NO ACTION ${type}`;
  return def.validate(
    { player, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function lastSettled(game: Game): RoundSettledPayload {
  const log = (game.engine as unknown as { eventLog: GameEvent[] }).eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      return log[i]!.payload as RoundSettledPayload;
    }
  }
  throw new Error("no RoundSettled");
}

/** 턴 프롬프트에서 특정 타입의 후보만 골라 온다 */
function turnOptions(game: Game, player: PlayerId, type: string): unknown[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") return [];
  const prompt = status.prompts.find((p) => p.player === player);
  return (prompt?.options ?? []).filter((o) => o.type === type);
}

// ─────────────────────────── 1·5. 무장해제 × 진짜 용 ───────────────────────────

describe("무장해제 × 진짜 용 — 손패가 표준 장수로 복귀하고 화료가 가능해진다", () => {
  /** p0=진짜 용(17장 5멘쯔 완성형) · p1=무장해제, p1의 턴 */
  function scene(): GameState {
    return withAug(
      craft({
        // 5멘쯔 1작두 17장 — 진짜 용 화료형. 고립패가 섞여 있어야 반납 대상이 생긴다.
        hands: { p0: "123m456m789m123p456p77s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["true_dragon"], p1: ["disarm"] },
    );
  }

  it("무장해제 전에는 17장 5멘쯔로 화료할 수 있다 (대조군)", () => {
    const g = mk(scene(), [
      { def: C.trueDragon, holder: "p0" },
      { def: C.disarm, holder: "p1" },
    ]);
    expect(handIdsOf(g.engine.state, "p0")).toHaveLength(17);
    expect(
      g.engine.rules.resolve("scoring.totalSets", {
        playerId: "p0",
        state: g.engine.state,
      }),
    ).toBe(5);
  });

  it("무장해제하면 손패 3장이 패산으로 반납되어 14장이 되고, 화료형 판정도 4멘쯔로 돌아온다", () => {
    const g = mk(scene(), [
      { def: C.trueDragon, holder: "p0" },
      { def: C.disarm, holder: "p1" },
    ]);
    const wallBefore = g.engine.state.zones[WALL]?.tileIds.length ?? 0;

    const res = g.engine.submit({
      player: "p1",
      type: "disarm_lock",
      payload: { target: "p0", augmentId: "true_dragon" },
    });
    expect(res.ok).toBe(true);

    const state = g.engine.state;
    // 손패 17 → 14 (표준 쯔모 직후 장수)
    expect(handIdsOf(state, "p0")).toHaveLength(14);
    // 반납한 3장은 패산 맨 밑으로 갔다 (바닥이 아니다 — 방총·후리텐이 생기면 안 된다)
    expect(state.zones[WALL]?.tileIds.length).toBe(wallBefore + 3);
    expect(state.zones["discards:p0"]?.tileIds ?? []).toHaveLength(0);
    // 규칙은 표준으로 복귀
    expect(
      g.engine.rules.resolve("scoring.totalSets", { playerId: "p0", state }),
    ).toBe(4);
    // 잠긴 것도 사실이다
    expect(state.augmentData[DISARMED_SOURCES_KEY]).toContain(
      augmentInstanceId("p0", "true_dragon"),
    );
  });

  it("통보 이벤트(AugmentDisarmed)가 잠금 기록보다 먼저 흐른다 — 순서가 계약이다", () => {
    const g = mk(scene(), [
      { def: C.trueDragon, holder: "p0" },
      { def: C.disarm, holder: "p1" },
    ]);
    g.engine.submit({
      player: "p1",
      type: "disarm_lock",
      payload: { target: "p0", augmentId: "true_dragon" },
    });
    const log = (g.engine as unknown as { eventLog: GameEvent[] }).eventLog;
    const notice = log.findIndex((e) => e.type === AUGMENT_DISARMED);
    const lock = log.findIndex(
      (e) =>
        e.type === "AugmentDataSet" &&
        (e.payload as { key?: string }).key === DISARMED_SOURCES_KEY,
    );
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(notice);
  });

  it("반납 후 손패는 표준 4멘쯔 기준으로 텐파이/화료 판정이 성립한다 (하드락 없음)", () => {
    const g = mk(scene(), [
      { def: C.trueDragon, holder: "p0" },
      { def: C.disarm, holder: "p1" },
    ]);
    g.engine.submit({
      player: "p1",
      type: "disarm_lock",
      payload: { target: "p0", augmentId: "true_dragon" },
    });
    const state = g.engine.state;
    const kinds = handIdsOf(state, "p0").map(
      (id) => state.tiles[id]!.kind,
    );
    const opts = scoringOptionsOf(state, g.engine.rules, "p0");
    // 14장이므로 "한 장 버리면 텐파이"가 물리적으로 가능한 상태다.
    // (반납 3장이 무작위가 아니라 '가장 쓸모없는 것'이라 실제로 텐파이가 남는다)
    const anyTenpai = kinds.some((_k, i) => {
      const rest = kinds.filter((_v, j) => j !== i);
      return isTenpai(rest, 0, undefined, opts);
    });
    expect(anyTenpai).toBe(true);
  });

  it("반납 선택은 결정적이다 — 같은 손패면 항상 같은 3장", () => {
    const run = (): number[] => {
      const g = mk(scene(), [
        { def: C.trueDragon, holder: "p0" },
        { def: C.disarm, holder: "p1" },
      ]);
      const before = handIdsOf(g.engine.state, "p0");
      g.engine.submit({
        player: "p1",
        type: "disarm_lock",
        payload: { target: "p0", augmentId: "true_dragon" },
      });
      const after = new Set(handIdsOf(g.engine.state, "p0"));
      return before.filter((id) => !after.has(id));
    };
    expect(run()).toEqual(run());
  });
});

// ─────────────────────── 2. 무장해제가 액티브 버튼도 잠근다 ───────────────────────

describe("무장해제 — 순수 액션형 증강의 액티브 버튼까지 잠근다", () => {
  /** 단색 세계(suit_unify)는 규칙·효과를 하나도 등록하지 않는 순수 액션형이다 */
  function scene(disarmed: boolean): Game {
    const base = withAug(
      craft({
        hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["suit_unify"], p1: ["disarm"] },
    );
    const state = disarmed
      ? withData(base, {
          [DISARMED_SOURCES_KEY]: [augmentInstanceId("p0", "suit_unify")],
        })
      : base;
    return mk(state, [
      { def: C.suitUnify, holder: "p0" },
      { def: C.disarm, holder: "p1" },
    ]);
  }

  it("잠기지 않았으면 발동 후보가 뜬다 (대조군)", () => {
    expect(turnOptions(scene(false), "p0", "mono_world").length).toBeGreaterThan(0);
  });

  it("잠기면 발동 후보가 사라진다 — FlowController가 미제시 옵션의 submit을 거부한다", () => {
    expect(turnOptions(scene(true), "p0", "mono_world")).toHaveLength(0);
  });
});

// ────────────────── 3. 진짜 용 × 절벽 위에 피어난 꽃 (만개) ──────────────────

describe("진짜 용 × 절벽 위에 피어난 꽃 — 17장 손에서도 만개한다", () => {
  /**
   * p0 = 진짜 용 + 절벽 위에 피어난 꽃. 손패 17장 중 1만 4장(안깡 재료).
   * 이번 국에 이미 깡을 1번 한 것으로 기록해, 이 안깡이 두 번째 깡 = 만개 조건이 된다.
   */
  function scene(dragon: boolean): Game {
    const hand = dragon
      ? "1111m234p567p234s567s9s" // 17장
      : "1111m234p567p234s9s"; // 14장
    const base0 = craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const augs = dragon ? ["true_dragon", "cliff_bloom"] : ["cliff_bloom"];
    const base = withData(withAug(base0, { p0: augs }), {
      [`cliff_bloom:kans:${roundKey(base0)}:p0`]: 1,
    });
    const installs: { def: AugmentDef; holder: PlayerId }[] = [
      { def: C.cliffBloom, holder: "p0" },
    ];
    if (dragon) installs.unshift({ def: C.trueDragon, holder: "p0" });
    return mk(base, installs);
  }

  for (const dragon of [false, true]) {
    it(`진짜 용=${dragon}: 두 번째 안깡으로 만개해 그 자리에서 화료할 수 있다`, () => {
      const g = scene(dragon);
      const flow = new FlowController(g.engine);
      const start = flow.begin();
      if (start.kind !== "awaiting") throw new Error("expected awaiting");
      const ankan = (start.prompts.find((p) => p.player === "p0")?.options ?? []).find(
        (o) => o.type === "ankan",
      );
      expect(ankan).toBeDefined();
      const st = flow.submit("p0", ankan!);
      expect(st.kind).toBe("awaiting");

      // 만개 플래그가 서고, 손패가 완성형으로 재구성돼 화료가 통과한다
      const state = g.engine.state;
      expect(state.augmentData[`cliff_bloom:bloomed:${roundKey(state)}:p0`]).toBe(true);
      expect(validate(g, "p0", "win", {})).toBeNull();
    });
  }
});

// ───────────────── 4. 진짜 용 × 밑장빼기 (뷰의 scoringOptions) ─────────────────

describe("진짜 용 × 밑장빼기 — 봇 뷰가 5멘쯔 대기를 읽는다", () => {
  it("PlayerView.scoringOptions가 보유자의 totalSets를 실어 보낸다", () => {
    const base = withAug(
      craft({
        hands: { p0: "123m456m789m123p456p7s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
      }),
      { p0: ["true_dragon", "bottom_deal"] },
    );
    const g = mk(base, [
      { def: C.trueDragon, holder: "p0" },
      { def: C.bottomDeal, holder: "p0" },
    ]);
    const view = buildPlayerView(g.engine.state, "p0", g.engine.rules);
    expect(view.scoringOptions.totalSets).toBe(5);

    // 그 옵션으로 계산한 16장 손의 대기가 실제로 나온다 (표준 4멘쯔로는 0개)
    const kinds = handIdsOf(g.engine.state, "p0").map(
      (id) => g.engine.state.tiles[id]!.kind,
    );
    expect(winningKinds(kinds, 0, undefined, view.scoringOptions).length).toBeGreaterThan(0);
    expect(winningKinds(kinds, 0)).toHaveLength(0);
  });

  it("진짜 용이 없으면 표준 옵션(빈 객체)이다", () => {
    const g = mk(
      craft({
        hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
      }),
      [],
    );
    const view = buildPlayerView(g.engine.state, "p0", g.engine.rules);
    expect(view.scoringOptions.totalSets).toBeUndefined();
  });
});

// ─────────────── 5·6. 정산 순서 고정 + 역만 방어술 완전 면역 ───────────────

describe("정산 인터셉터 — 설치(픽) 순서와 무관하게 같은 결과", () => {
  function ronScene(): GameState {
    return craft({
      hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "9s" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "9s" },
    });
  }

  function kokushiRonScene(): GameState {
    return craft({
      hands: { p0: "9m19p19s1234567z1m", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "1m" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1m" },
    });
  }

  function runRon(
    state: GameState,
    installs: { def: AugmentDef; holder: PlayerId }[],
  ): RoundSettledPayload {
    const game = mk(state, installs);
    const flow = new FlowController(game.engine);
    flow.begin();
    const st = flow.submit("p0", { type: "win", payload: {} });
    expect(st.kind).toBe("roundOver");
    return lastSettled(game);
  }

  it("기생충 × 일확천금: 어느 쪽을 먼저 설치해도 deltas가 같다", () => {
    const base0 = withAug(ronScene(), { p0: ["jackpot"], p2: ["parasite"] });
    const base = withData(base0, {
      [`jackpot:mult:${roundKey(base0)}:p0`]: 3,
      "parasite:target:p2": "p0",
    });
    const a = runRon(base, [
      { def: C.parasite, holder: "p2" },
      { def: C.jackpot, holder: "p0" },
    ]);
    const b = runRon(base, [
      { def: C.jackpot, holder: "p0" },
      { def: C.parasite, holder: "p2" },
    ]);
    expect(a.deltas).toEqual(b.deltas);
  });

  it("역만 방어술 × 책임전가: 어느 순서든 방어막 보유자의 손실이 0이다 (완전 면역)", () => {
    const base = withAug(kokushiRonScene(), {
      p0: ["blame_shift"],
      p2: ["yakuman_shield"],
    });
    const shieldFirst = runRon(base, [
      { def: C.yakumanShield, holder: "p2" },
      { def: C.blameShift, holder: "p0" },
    ]);
    const blameFirst = runRon(base, [
      { def: C.blameShift, holder: "p0" },
      { def: C.yakumanShield, holder: "p2" },
    ]);
    expect(shieldFirst.deltas).toEqual(blameFirst.deltas);
    // 책임전가로 새로 부과된 지불까지 전액 환급된다
    expect(shieldFirst.deltas["p2"]).toBe(0);
    // 나머지 두 명은 3분할된 몫을 그대로 낸다
    expect(shieldFirst.deltas["p1"]).toBeLessThan(0);
    expect(shieldFirst.deltas["p3"]).toBeLessThan(0);
  });

  it("승승장구 × 유국역만: 순서와 무관하며 텐파이인 상대를 노텐으로 오판하지 않는다", () => {
    const drawScene = (): GameState => {
      const s = craft({
        hands: {
          p0: "234m234p234s55s77s", // 노텐이지만 승승장구로 텐파이 취급
          p1: "123m456m789m123p1p", // 진짜 텐파이
          p2: "234p567p234s567s9s", // 진짜 텐파이
          p3: "159m159p159s1234z", // 진짜 노텐
        },
        discards: { p0: "19m19p19s1234z" }, // 유국역만 성립
        phase: "turn.draw",
        turnSeat: 0,
      });
      return withAug(
        { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } },
        { p0: ["always_tenpai", "nagashi_yakuman"] },
      );
    };
    const settle = (
      installs: { def: AugmentDef; holder: PlayerId }[],
    ): RoundSettledPayload => {
      const game = mk(drawScene(), installs);
      const r = game.engine.submit({
        player: "__system",
        type: "sys.settleDraw",
        payload: {},
      });
      expect(r.ok).toBe(true);
      return lastSettled(game);
    };
    const a = settle([
      { def: C.alwaysTenpai, holder: "p0" },
      { def: C.nagashiYakuman, holder: "p0" },
    ]);
    const b = settle([
      { def: C.nagashiYakuman, holder: "p0" },
      { def: C.alwaysTenpai, holder: "p0" },
    ]);
    expect(a.deltas).toEqual(b.deltas);

    // 노텐 보너스는 실제 노텐 1명(p3)분만 붙는다 — 2000 × 1
    const onlyNagashi = settle([{ def: C.nagashiYakuman, holder: "p0" }]);
    expect((a.deltas["p0"] ?? 0) - (onlyNagashi.deltas["p0"] ?? 0)).toBe(2000);
  });

  it("유국 정산 payload에 실제 텐파이 집계가 실린다", () => {
    const s = craft({
      hands: {
        p0: "123m456m789m123p1p",
        p1: "159m159p159s1234z",
        p2: "159m159p28s1234z",
        p3: "*",
      },
      phase: "turn.draw",
      turnSeat: 0,
    });
    const game = mk(
      { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } },
      [],
    );
    game.engine.submit({
      player: "__system",
      type: "sys.settleDraw",
      payload: {},
    });
    const settled = lastSettled(game);
    expect(settled.tenpaiPlayers).toContain("p0");
    expect(settled.tenpaiPlayers).not.toContain("p1");
  });
});

// ─────────────────────── 7. 리치 봉인이 모든 리치를 막는다 ───────────────────────

describe("리치 봉인 — 커스텀 리치 액션까지 전부 막는다", () => {
  it("봉인 중에는 riichi·stealth_riichi·open_riichi·all_in_riichi가 모두 거부된다", () => {
    const s0 = craft({
      hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 봉인은 "보유자가 리치를 지고 있는 동안"만 산다 — p1을 실제 리치 상태로 둔다
    const sealed: GameState = {
      ...withData(s0, { [`riichi_seal:sealed:${roundKey(s0)}:p1`]: true }),
      round: {
        ...s0.round,
        byPlayer: {
          ...s0.round.byPlayer,
          p1: {
            ...(s0.round.byPlayer["p1"] as object),
            riichi: { discardIndex: 0, ippatsu: false, double: false },
          } as never,
        },
      },
    };
    const base = withAug(
      sealed,
      {
        // 스텔스 리치는 리치 봉인과 conflicts지만, 보유자가 서로 다르면 함께 존재한다
        p0: ["open_riichi_reveal", "all_or_nothing", "stealth_riichi"],
        p1: ["riichi_seal"],
      },
    );
    const g = mk(base, [
      { def: C.riichiSeal, holder: "p1" },
      { def: C.openRiichiReveal, holder: "p0" },
      { def: C.allOrNothing, holder: "p0" },
      { def: C.stealthRiichi, holder: "p0" },
    ]);
    const tileId = handIdsOf(g.engine.state, "p0")[12];
    for (const type of ["riichi", "stealth_riichi", "open_riichi", "all_in_riichi"]) {
      expect(validate(g, "p0", type, { tileId })).toBe("riichi is sealed this round");
    }
  });

  it("스텔스 리치와 리치 봉인은 상호 배제된다 (은닉이 자기 증강에 공개되지 않게)", () => {
    expect(C.stealthRiichi.conflicts).toContain("riichi_seal");
  });
});

// ───────────── 리치 봉인 — 봉인의 대가는 "리치를 지고 있는 것" (60차) ─────────────

describe("리치 봉인 — 리치를 풀면 봉인도 풀린다", () => {
  /**
   * p0 = 리치 봉인 + 손바닥 뒤집기. 텐파이 14장으로 자기 턴에 서 있다.
   * (두 증강 다 보유자가 같아야 "걸었다가 푸는" 한 사람의 흐름을 볼 수 있다)
   */
  function scene(): Game {
    const base = withAug(
      craft({
        hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["riichi_seal", "palm_flip"] },
    );
    return mk(base, [
      { def: C.riichiSeal, holder: "p0" },
      { def: C.palmFlip, holder: "p0" },
    ]);
  }

  const blockedFor = (g: Game, player: PlayerId): boolean =>
    g.engine.rules.resolve<boolean>("riichi.blocked", {
      playerId: player,
      state: g.engine.state,
    });

  const banner = (g: Game): unknown =>
    g.engine.state.augmentData["view:*:riichi_seal:p0"];

  /** p0가 선제 리치를 걸어 봉인이 선 상태까지 진행한다 */
  function declareFirstRiichi(g: Game): FlowController {
    const flow = new FlowController(g.engine);
    const start = flow.begin();
    if (start.kind !== "awaiting") throw new Error("expected awaiting");
    const riichi = (start.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "riichi",
    );
    expect(riichi).toBeDefined();
    flow.submit("p0", riichi!);
    return flow;
  }

  it("선제 리치를 걸면 나머지 셋의 리치가 잠긴다 (대조군)", () => {
    const g = scene();
    expect(blockedFor(g, "p1")).toBe(false);
    declareFirstRiichi(g);
    expect(g.engine.state.round.byPlayer["p0"]?.riichi).not.toBeNull();
    for (const p of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(blockedFor(g, p)).toBe(true);
    }
    expect(banner(g)).toBe("봉인");
    // 보유자 본인은 잠기지 않는다
    expect(blockedFor(g, "p0")).toBe(false);
  });

  /**
   * 이미 선제 리치를 걸어 봉인이 선 상태 + 보유자의 턴(turn.act).
   * 손바닥 뒤집기는 자기 턴에만 눌리므로, 리치 선언 직후가 아니라
   * "리치를 지고 한 바퀴 돌아온 내 순"을 재현해야 한다.
   */
  function sealedOnMyTurn(): Game {
    const s0 = craft({
      hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const base = withAug(
      {
        ...withData(s0, {
          [`riichi_seal:sealed:${roundKey(s0)}:p0`]: true,
          "view:*:riichi_seal:p0": "봉인",
        }),
        round: {
          ...s0.round,
          byPlayer: {
            ...s0.round.byPlayer,
            p0: {
              ...(s0.round.byPlayer["p0"] as object),
              riichi: { discardIndex: 0, ippatsu: false, double: false },
            } as never,
          },
        },
      },
      { p0: ["riichi_seal", "palm_flip"] },
    );
    return mk(base, [
      { def: C.riichiSeal, holder: "p0" },
      { def: C.palmFlip, holder: "p0" },
    ]);
  }

  it("손바닥 뒤집기로 리치를 풀면 그 자리에서 봉인이 풀린다", () => {
    const g = sealedOnMyTurn();
    expect(blockedFor(g, "p1")).toBe(true);

    const res = g.engine.submit({ player: "p0", type: "flip_riichi", payload: {} });
    expect(res.ok).toBe(true);
    expect(g.engine.state.round.byPlayer["p0"]?.riichi).toBeNull();

    // 봉인 즉시 해제
    for (const p of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(blockedFor(g, p)).toBe(false);
    }
  });

  it("봉인이 풀리면 전원 공개 배너도 내려간다 (틀린 정보를 남기지 않는다)", () => {
    const g = sealedOnMyTurn();
    expect(banner(g)).toBe("봉인");

    g.engine.submit({ player: "p0", type: "flip_riichi", payload: {} });
    // 해제 후 이어지는 자유 타패에서 배너가 정리된다
    const tileId = handIdsOf(g.engine.state, "p0")[0] as number;
    const res = g.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId },
    });
    expect(res.ok).toBe(true);
    expect(banner(g)).toBe("");
  });

  it("푼 사이에 상대가 리치를 걸었다면, 같은 국에 다시 걸어도 봉인은 돌아오지 않는다", () => {
    const g = scene();
    declareFirstRiichi(g);
    g.engine.submit({ player: "p0", type: "flip_riichi", payload: {} });

    // 봉인이 풀린 사이 p1이 리치를 건 상태를 만든다
    const s = g.engine.state;
    const withRival: GameState = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: {
            ...(s.round.byPlayer["p0"] as object),
            riichi: { discardIndex: 0, ippatsu: false, double: false },
          } as never,
          p1: {
            ...(s.round.byPlayer["p1"] as object),
            riichi: { discardIndex: 0, ippatsu: false, double: false },
          } as never,
        },
      },
    };
    const g2 = mk(withRival, [
      { def: C.riichiSeal, holder: "p0" },
      { def: C.palmFlip, holder: "p0" },
    ]);
    // p0가 다시 리치 중이어도 p1이 이미 리치라 '선제'가 아니다 → 봉인 없음
    expect(
      g2.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: "p2",
        state: g2.engine.state,
      }),
    ).toBe(false);
  });

  it("국이 바뀌면 봉인이 초기화되고, 다시 선제 리치를 걸면 그 국 동안 또 봉인된다", () => {
    const g = scene();
    declareFirstRiichi(g);
    expect(blockedFor(g, "p1")).toBe(true);

    // 다음 국 = roundKey가 달라진 상태 (본장 +1)
    const s = g.engine.state;
    const nextRound: GameState = {
      ...s,
      round: { ...s.round, honba: s.round.honba + 1 },
    };
    const g2 = mk(nextRound, [{ def: C.riichiSeal, holder: "p0" }]);
    // p0는 여전히 리치 중이지만 이번 국의 봉인 플래그는 없다
    expect(
      g2.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: "p1",
        state: g2.engine.state,
      }),
    ).toBe(false);

    // 그 국에 다시 선제 리치를 세우면 봉인이 돌아온다
    const sealed = withData(nextRound, {
      [`riichi_seal:sealed:${roundKey(nextRound)}:p0`]: true,
    });
    const g3 = mk(sealed, [{ def: C.riichiSeal, holder: "p0" }]);
    expect(
      g3.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: "p1",
        state: g3.engine.state,
      }),
    ).toBe(true);
  });
});

// ──────────────── 8. 무너진 국경(슌쯔) / 동수의 결속(커쯔) 역할 분리 ────────────────

describe("무너진 국경 / 동수의 결속 — 슌쯔와 커쯔를 나눠 담당한다", () => {
  function optsFor(augs: string[], defs: AugmentDef[]) {
    const base = withAug(
      craft({
        hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
      }),
      { p0: augs },
    );
    const g = mk(
      base,
      defs.map((def) => ({ def, holder: "p0" as PlayerId })),
    );
    return scoringOptionsOf(g.engine.state, g.engine.rules, "p0");
  }

  it("무너진 국경은 혼색 슌쯔만 연다 (커쯔는 열지 않는다)", () => {
    const o = optsFor(["broken_border"], [C.brokenBorder]);
    expect(o.mixedRuns).toBe(true);
    expect(o.mixedTriplets).toBeUndefined();
  });

  it("동수의 결속은 혼색 커쯔만 연다", () => {
    const o = optsFor(["mixed_triplet"], [C.mixedTriplet]);
    expect(o.mixedTriplets).toBe(true);
    expect(o.mixedRuns).toBeUndefined();
  });

  it("둘을 함께 가지면 그때 비로소 둘 다 열린다 (죽은 픽이 아니라 시너지)", () => {
    const o = optsFor(
      ["broken_border", "mixed_triplet"],
      [C.brokenBorder, C.mixedTriplet],
    );
    expect(o.mixedRuns).toBe(true);
    expect(o.mixedTriplets).toBe(true);
  });
});

// ─────────────────────────── 9. 일확천금 ───────────────────────────

describe("일확천금 — 국의 첫 순 한정 + 가중 확률", () => {
  function scene(discarded: boolean): Game {
    const s = craft({
      hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
      // 이미 한 장 버린 국이면 첫 순이 아니다
      ...(discarded ? { discards: { p0: "9s" } } : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const base = discarded
      ? {
          ...s,
          round: {
            ...s.round,
            byPlayer: {
              ...s.round.byPlayer,
              p0: {
                ...(s.round.byPlayer["p0"] as object),
                discardedKinds: ["sou9"],
              } as never,
            },
          },
        }
      : s;
    return mk(withAug(base, { p0: ["jackpot"] }), [
      { def: C.jackpot, holder: "p0" },
    ]);
  }

  it("국의 첫 순에는 룰렛 후보가 뜬다", () => {
    expect(turnOptions(scene(false), "p0", "jackpot_roll")).toHaveLength(1);
    expect(validate(scene(false), "p0", "jackpot_roll", {})).toBeNull();
  });

  it("이미 버린 국에는 후보도 없고 validate도 거부된다", () => {
    expect(turnOptions(scene(true), "p0", "jackpot_roll")).toHaveLength(0);
    expect(validate(scene(true), "p0", "jackpot_roll", {})).toBe(
      "only on your first turn",
    );
  });

  it("배수 분포가 0.5/1/2/3 = 30/30/30/10 에 수렴한다", () => {
    // 시드를 바꿔 가며 첫 순 룰렛을 굴려 분포를 본다 (결정론 PRNG · 500회)
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 500; seed++) {
      const s = craft({
        hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed,
      });
      const g = mk(withAug(s, { p0: ["jackpot"] }), [
        { def: C.jackpot, holder: "p0" },
      ]);
      const res = g.engine.submit({
        player: "p0",
        type: "jackpot_roll",
        payload: {},
      });
      expect(res.ok).toBe(true);
      const mult = g.engine.state.augmentData[
        `jackpot:mult:${roundKey(g.engine.state)}:p0`
      ] as number;
      counts.set(mult, (counts.get(mult) ?? 0) + 1);
    }
    // 네 결과가 모두 나오고, 3배가 가장 드물다
    for (const m of [0.5, 1, 2, 3]) expect(counts.get(m) ?? 0).toBeGreaterThan(0);
    const rare = counts.get(3) ?? 0;
    for (const m of [0.5, 1, 2]) {
      expect(counts.get(m) ?? 0).toBeGreaterThan(rare);
    }
    // 3배는 10% 근방 (500회 · ±6%p 여유)
    expect(rare / 500).toBeGreaterThan(0.04);
    expect(rare / 500).toBeLessThan(0.16);
  });
});
