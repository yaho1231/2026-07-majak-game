/**
 * QA 2차 aug-1 확정 6건의 회귀 테스트 (2026-08-22).
 *
 * 확정 1 🔴 blind_ron — 두 좌석이 들면 재배선이 두 번 걸려 방총한 사람이 돈을 벌었다.
 * 확정 2 🟡 blame_shift — 끝수가 쏜 사람이 아니라 애먼 두 사람에게 갔다.
 * 확정 3 🟠 cliff_bloom — 깡을 한 번도 안 쳐도 배패부터 영상패를 계속 봤다.
 * 확정 4 🟠 counter × last_stand — 리치를 무르면 반격만 남고 대가가 사라졌다.
 * 확정 5 🟠 danger_sense — 론 면역·격에 막혀 절대 쏘일 수 없는 패까지 위험으로 칠했다.
 * 확정 6 🟡 dead_wall_master — 교환 창이 닫힌 뒤에도 이름표가 "2회 남음"이라고 말했다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  createInitialGameState,
  createStandardGameFromState,
  installAugment,
  RuleLayer,
  buildPlayerView,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { blameShift } from "../src/augments/blame_shift.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { counter } from "../src/augments/counter.js";
import { lastStand } from "../src/augments/last_stand.js";
import { dangerSense } from "../src/augments/danger_sense.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { briefFog } from "../src/augments/brief_fog.js";
import { discardLock } from "../src/augments/discard_lock.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/**
 * 같은 증강을 **여러 좌석**이 드는 장면. 카탈로그 중복 등록을 피하려고 defs는
 * id별로 한 번만 넘기고, installAugment만 좌석마다 부른다(실제 엔진과 같은 배선).
 */
function scene(opts: {
  augments: Partial<Record<PlayerId, readonly AugmentDef[]>>;
  data?: Record<string, unknown>;
}): Game {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const defs: AugmentDef[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(opts.augments)) {
    for (const d of list ?? []) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      defs.push(d);
    }
  }
  const state: GameState = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      augments: (opts.augments[p.id] ?? []).map((d) => d.id),
    })),
    augmentData: { ...base.augmentData, ...(opts.data ?? {}) },
  };
  const game = createStandardGameFromState(state, undefined, defs);
  for (const [pid, list] of Object.entries(opts.augments)) {
    for (const d of list ?? []) {
      installAugment(game.engine, d, pid as PlayerId, { yaku: game.yaku });
    }
  }
  return game;
}

function runSettle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
  let out = payload;
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const r = intercept(
      { type: ROUND_SETTLED, payload: out },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (r !== null) out = r.payload as RoundSettledPayload;
  }
  return out;
}

const winInfo = (
  o: Partial<WinInfo> & { winner: PlayerId; points: number },
): WinInfo =>
  ({
    from: null,
    winType: "tsumo",
    han: 3,
    fu: 30,
    yakumanCount: 0,
    yaku: [],
    limit: null,
    ...o,
  }) as unknown as WinInfo;

const winPayload = (g: Game, deltas: Record<string, number>, infos: WinInfo[]) =>
  ({
    outcome: "win",
    deltas,
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    winInfos: infos,
  }) as unknown as RoundSettledPayload;

const roundKeyOf = (g: Game): string => {
  const r = g.engine.state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
};

const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

// ───────────────────────── 확정 1 · blind_ron ─────────────────────────

describe("확정 1 · 눈먼 총알(blind_ron)은 보유자가 몇이든 국당 한 번만 재배선한다", () => {
  /** p1이 p2에게 8000점 론 — 보유자 목록만 바꿔 가며 같은 정산을 돌린다 */
  function redistribute(holders: PlayerId[]): Record<string, number> {
    const augments: Partial<Record<PlayerId, AugmentDef[]>> = {};
    for (const h of holders) augments[h] = [blindRon];
    const probe = scene({ augments: {} });
    const rk = roundKeyOf(probe);
    const data: Record<string, unknown> = {};
    for (const h of holders) data[`blind_ron:armedRound:${h}`] = rk;
    const game = scene({ augments, data });
    const out = runSettle(
      game,
      winPayload(
        game,
        { p0: 0, p1: 8000, p2: -8000, p3: 0 },
        [winInfo({ winner: "p1", from: "p2", winType: "ron", points: 8000 })],
      ),
    );
    return out.deltas as Record<string, number>;
  }

  it("한 명이 들었을 때: 쏜 사람은 면제되고 대신 한 명이 문다 (총합 불변)", () => {
    const d = redistribute(["p0"]);
    expect(sum(d)).toBe(0);
    expect(d["p1"]).toBe(8000);
    expect(d["p2"]).toBe(0); // 쏜 사람 — 면제일 뿐 이득은 없다
    expect(Object.values(d).filter((v) => v === -8000)).toHaveLength(1);
  });

  it("두 명이 들어도 이동은 한 번뿐 — 쏜 사람이 돈을 벌지 않는다", () => {
    const d = redistribute(["p0", "p3"]);
    expect(sum(d)).toBe(0);
    expect(d["p2"]).toBe(0);
    expect(d["p2"]).not.toBeGreaterThan(0);
    // 두 번 걸리면 누군가 -16000을 문다
    expect(Math.min(...Object.values(d))).toBe(-8000);
  });

  it("세 명이 들어도 결과는 한 명이 들었을 때와 완전히 같다", () => {
    expect(redistribute(["p0", "p2", "p3"])).toEqual(redistribute(["p0"]));
  });
});

// ───────────────────────── 확정 2 · blame_shift ─────────────────────────

describe("확정 2 · 책임전가(blame_shift)의 끝수는 쏜 사람이 흡수한다", () => {
  it("8000점 론의 3분할에서 쏜 사람이 가장 많이 낸다 (2800 / 2600 / 2600)", () => {
    const game = scene({ augments: { p0: [blameShift] } });
    const out = runSettle(
      game,
      winPayload(
        game,
        { p0: 8000, p1: -8000, p2: 0, p3: 0 },
        [winInfo({ winner: "p0", from: "p1", winType: "ron", points: 8000 })],
      ),
    );
    const d = out.deltas as Record<string, number>;
    expect(sum(d)).toBe(0);
    expect(d["p0"]).toBe(8000); // 홀더 수령액 불변
    // 쏜 사람(p1)이 끝수까지 진다 — 예전에는 -2600으로 **가장 적게** 냈다
    expect(d["p1"]).toBe(-2800);
    expect(d["p2"]).toBe(-2600);
    expect(d["p3"]).toBe(-2600);
    expect(-(d["p1"] as number)).toBeGreaterThanOrEqual(-(d["p2"] as number));
  });

  it("100점으로 나누어떨어지는 금액은 그대로 균등하다 (6000 → 2000씩)", () => {
    const game = scene({ augments: { p0: [blameShift] } });
    const out = runSettle(
      game,
      winPayload(
        game,
        { p0: 6000, p1: -6000, p2: 0, p3: 0 },
        [winInfo({ winner: "p0", from: "p1", winType: "ron", points: 6000 })],
      ),
    );
    const d = out.deltas as Record<string, number>;
    expect(d["p1"]).toBe(-2000);
    expect(d["p2"]).toBe(-2000);
    expect(d["p3"]).toBe(-2000);
  });
});

// ───────────────────────── 확정 3 · cliff_bloom ─────────────────────────

describe("확정 3 · 절벽 위의 꽃(cliff_bloom)의 왕패 열람은 깡 문맥에서만 열린다", () => {
  /** 배패 직후(깡 0회·순 0)의 보유자 뷰에서 실제 tileId로 보이는 왕패 칸 수 */
  function visibleDeadWall(withAug: boolean): number {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" && withAug ? { ...p, augments: ["cliff_bloom"] } : p,
      ),
    };
    const game = createStandardGameFromState(
      state,
      undefined,
      withAug ? [cliffBloom] : [],
    );
    if (withAug) {
      installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });
    }
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const real = new Set(game.engine.state.zones[DEAD_WALL]?.tileIds ?? []);
    return (view.zones[DEAD_WALL]?.tileIds ?? []).filter((id: number) => real.has(id))
      .length;
  }

  it("깡을 한 번도 치지 않은 보유자는 왕패를 한 장도 볼 수 없다", () => {
    expect(visibleDeadWall(true)).toBe(0);
    expect(visibleDeadWall(false)).toBe(0);
  });
});

// ───────────────────────── 확정 4 · counter × last_stand ─────────────────────────

describe("확정 4 · 카운터(counter)는 추격 리치를 무르면 반격도 함께 무른다", () => {
  /** p1이 선리치를 건 뒤, p0(카운터+승부수)가 추격 리치를 걸 수 있는 장면 */
  function chaseScene() {
    const base = craft({
      // p0: 9s 단기 텐파이 (리치 선언 가능) — 14장째로 1z를 쥐고 있다
      hands: { p0: "123m123p123s678s9s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["counter", "last_stand"] } : p,
      ),
      round: {
        ...base.round,
        riichiPot: 1000,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...base.round.byPlayer["p1"]!,
            riichi: { double: false, ippatsu: true, discardIndex: 0 },
          },
        },
      },
      augmentData: { ...base.augmentData, "counter:prev:p0": "p1" },
    };
    const game = createStandardGameFromState(state, undefined, [counter, lastStand]);
    installAugment(game.engine, counter, "p0", { yaku: game.yaku });
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    return { game, flow, status };
  }

  const scoreOf = (g: Game, id: PlayerId): number =>
    g.engine.state.players.find((p) => p.id === id)?.score ?? 0;

  /** 지금 프롬프트에서 원하는 타입의 선택지를 그대로 꺼낸다 (FlowController는 제시한
   *  객체와 완전히 같은 것만 받는다 — 손으로 조립하면 "not offered"로 튕긴다). */
  function pick(st: ReturnType<FlowController["begin"]>, player: PlayerId, type: string) {
    if (st.kind !== "awaiting") return undefined;
    const prompt = st.prompts.find((p) => p.player === player);
    return prompt?.options.find((o) => o.type === type);
  }

  it("추격 리치는 상대가 1,000점을 대납하고 일발을 지운다", () => {
    const { game, flow, status } = chaseScene();
    const before = { p0: scoreOf(game, "p0"), p1: scoreOf(game, "p1") };
    const riichi = pick(status, "p0", "riichi");
    expect(riichi).toBeDefined();
    flow.submit("p0", riichi!);
    // 공탁 1000을 내고 상대가 1000을 대납 → 순증감 0, 상대는 -1000
    expect(scoreOf(game, "p0")).toBe(before.p0);
    expect(scoreOf(game, "p1")).toBe(before.p1 - 1000);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(false);
    expect(game.engine.state.augmentData["counter:struck:p0"]).toBe(true);
  });

  it("승부수로 리치를 취소하면 대납 1,000점이 되돌아가고 struck이 내려간다", () => {
    const { game, flow, status } = chaseScene();
    const before = { p0: scoreOf(game, "p0"), p1: scoreOf(game, "p1") };
    let st = flow.submit("p0", pick(status, "p0", "riichi")!);
    // 자기 순이 다시 올 때까지 다른 좌석은 넘긴다(론 기회는 패스, 자기 순이면 쯔모기리)
    for (let i = 0; i < 12; i++) {
      if (st.kind !== "awaiting") break;
      const prompt = st.prompts[0];
      if (prompt === undefined || prompt.player === "p0") break;
      const opt =
        prompt.options.find((o) => o.type === "pass") ??
        prompt.options.find((o) => o.type === "discard");
      if (opt === undefined) break;
      st = flow.submit(prompt.player, opt);
    }
    const cancel = pick(st, "p0", "cancel_riichi");
    expect(cancel, "자기 순에 cancel_riichi가 제시돼야 한다").toBeDefined();
    const ok = flow.submit("p0", cancel!);
    expect(ok.kind).not.toBe("rejected");
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).toBeNull();
    // 반격이 없던 일이 된다 — 두 사람 다 시작 점수로 돌아온다
    expect(scoreOf(game, "p0")).toBe(before.p0);
    expect(scoreOf(game, "p1")).toBe(before.p1);
    expect(game.engine.state.augmentData["counter:struck:p0"]).toBe(false);
    // 국당 1회는 그대로 소진된다 — 취소가 기회를 되돌려 주지는 않는다
    expect(game.engine.state.augmentData["counter:spent:p0"]).toBe(true);
  });
});

// ───────────────────────── 확정 5 · danger_sense ─────────────────────────

describe("확정 5 · 지뢰 탐지(danger_sense)는 쏘일 수 없는 패를 위험으로 세지 않는다", () => {
  /** p1이 9s 단기로 텐파이한 장면. p0가 9s를 쥐고 있어 원래는 위험으로 잡힌다. */
  function senseScene(rule?: { key: string; value: unknown }) {
    const base = craft({
      hands: {
        p0: "19m19p19s1234567z9s",
        p1: "123m123p123s678s9s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["danger_sense"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [dangerSense]);
    installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
    if (rule !== undefined) {
      game.engine.rules.addModifier(rule.key, {
        source: "test",
        layer: RuleLayer.System,
        apply: () => rule.value,
      });
    }
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "danger_sense_use", payload: {} });
    const data = game.engine.state.augmentData as Record<string, unknown>;
    // roundViewKey는 `#round` 접미사(엔진의 국 스코프 청소 대상)를 붙인다.
    const key = "view:p0:danger_sense#round";
    const v = data[key] as { kinds?: string[] } | undefined;
    expect(v, "danger_sense_use가 스캔 결과를 싣지 못했다").toBeDefined();
    return (v?.kinds ?? []) as string[];
  }

  it("기준선: 상대의 실제 대기는 위험으로 잡힌다", () => {
    // p1은 6s/9s 대기(123m123p123s 산색 = 역 있음)이고 p0가 9s를 쥐고 있다.
    expect(senseScene()).toContain("sou9");
  });

  it("내가 론 면역인 국(천하무적·불가침 조약)에는 위험패가 하나도 없다", () => {
    expect(senseScene({ key: "win.ronImmune", value: true })).toEqual([]);
  });

  it("격(win.minHan)에 막혀 론할 수 없는 싼 대기는 위험이 아니다", () => {
    expect(senseScene({ key: "win.minHan", value: 13 })).toEqual([]);
  });
});

// ───────────────────────── 확정 6 · dead_wall_master ─────────────────────────

describe("확정 6 · 왕패의 주인(dead_wall_master)의 이름표는 canSwap을 따른다", () => {
  const REMAIN = "view:p0:dead_wall_master:remaining:p0";

  function swapScene() {
    const base = createInitialGameState(
      { seed: 7, playerIds: ["p0", "p1", "p2", "p3"] },
      { startScore: 25000, redFivesPerSuit: 1 },
    );
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["dead_wall_master"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [deadWallMaster]);
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    return { game, flow, status };
  }

  // roundViewKey는 `#round` 접미사를 붙인다(엔진이 국 경계에서 지우는 스코프 표식).
  const remainKey = (_g: Game): string => `${REMAIN}#round`;

  it("국 시작에는 2회로 뜨고, 한 장도 안 바꾼 채 첫 타패를 넘기면 0으로 내려간다", () => {
    const { game, flow, status } = swapScene();
    expect(game.engine.state.augmentData[remainKey(game)]).toBe(2);

    // p0(오야)가 아무것도 교환하지 않고 그대로 버린다
    expect(status.kind).toBe("awaiting");
    const prompt = status.kind === "awaiting" ? status.prompts[0] : undefined;
    const discard = prompt?.options.find((o) => o.type === "discard");
    expect(discard).toBeDefined();
    const after = flow.submit("p0", discard!);

    // 이름표가 더 이상 "2회 남음"이라고 말하지 않는다 (실제 버튼도 사라진 시점)
    expect(game.engine.state.augmentData[remainKey(game)]).toBe(0);
    const p0Turn =
      after.kind === "awaiting" &&
      after.prompts.some(
        (pr) => pr.player === "p0" && pr.options.some((o) => o.type === "dw_swap"),
      );
    expect(p0Turn).toBe(false);
  });
});

// ═════════════════════ 의심에서 실재로 확인해 고친 것 ═════════════════════

// ───────────────── 의심 5 · brief_fog — 결과 화면의 유령 배지 ─────────────────

describe("의심 5 · 박무(brief_fog)의 배지는 국이 끝나면 함께 걷힌다", () => {
  const NOTICE = "view:*:brief_fog:p0#round";

  it("6순이 다 가기 전에 국이 끝나도 ROUND_SETTLED에서 표식이 내려간다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["brief_fog"] } : p,
      ),
      augmentData: { ...base.augmentData, [NOTICE]: "안개 (4순 남음)" },
    };
    const game = createStandardGameFromState(state, undefined, [briefFog]);
    installAugment(game.engine, briefFog, "p0", { yaku: game.yaku });

    // ROUND_SETTLED 리액션이 등록돼 있고, 표식을 빈 문자열로 내린다
    const emitted: { key?: string; value?: unknown }[] = [];
    const reactions = game.engine.effects
      .reactionsFor(ROUND_SETTLED)
      .filter((r) => r.source.includes("brief_fog"));
    expect(reactions.length, "brief_fog가 ROUND_SETTLED를 듣지 않는다").toBeGreaterThan(0);
    for (const { react } of reactions) {
      react(
        { type: ROUND_SETTLED, payload: { outcome: "draw" } } as never,
        {
          state: game.engine.state,
          rules: game.engine.rules,
          emit: (e: { payload?: unknown }) =>
            emitted.push((e.payload ?? {}) as { key?: string; value?: unknown }),
        } as never,
      );
    }
    expect(emitted.some((e) => e.key === NOTICE && e.value === "")).toBe(true);
  });
});

// ───────── 의심 9 · discard_lock — 봉인 즉시 쿨다운 칩이 서야 한다 ─────────

describe("의심 9 · 봉인술사(discard_lock)는 발동과 동시에 쿨다운 칩을 세운다", () => {
  const CHIP = "view:p0:cooldown:discard_lock";

  it("봉인한 순간 `2국`으로 올라간다 — 다음 국 시작까지 0으로 남지 않는다", () => {
    const base = createInitialGameState(
      { seed: 11, playerIds: ["p0", "p1", "p2", "p3"] },
      { startScore: 25000, redFivesPerSuit: 1 },
    );
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["discard_lock"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [discardLock]);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();

    expect(game.engine.state.augmentData[CHIP]).toBe(0); // 아직 쓸 수 있다
    const seal =
      status.kind === "awaiting"
        ? status.prompts
            .find((p) => p.player === "p0")
            ?.options.find((o) => o.type === "seal_hands")
        : undefined;
    expect(seal, "국 첫 순의 보유자에게 seal_hands가 제시돼야 한다").toBeDefined();
    flow.submit("p0", seal!);

    // 버튼은 사라졌는데 칩은 "0국"으로 남아 있던 것이 의심 9다
    expect(game.engine.state.augmentData[CHIP]).toBe(2);
  });
});
