/**
 * combat_augments — 이번에 추가된 증강 4종 검증.
 * vanguard(선봉) / nagashi_yakuman(유국역만) / cliff_bloom(절벽 위에 피어난 꽃) /
 * no_retreat(물러설 수 없는 선언)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
  playerOf,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { vanguard } from "../src/augments/vanguard.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { noRetreat } from "../src/augments/no_retreat.js";

type Game = ReturnType<typeof createStandardGameFromState>;
const SYS = "__system";

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

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/** p0 오야 탕야오 쯔모 손 (14장) */
function tanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** p0의 쯔모 화료를 실행하고 정산을 돌려준다 */
function runTsumo(game: Game): RoundSettledPayload {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const win = status.prompts
    .find((p) => p.player === "p0")
    ?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
  return lastSettled(game);
}

// ─────────────────────────── vanguard (선봉) ───────────────────────────

describe("vanguard (선봉)", () => {
  it("동장 화료 시 얻는 점수가 1.5배", () => {
    const base = runTsumo(createStandardGameFromState(tanyaoTsumo()));
    const baseDelta = base.deltas["p0"] ?? 0;

    const game = createStandardGameFromState(
      withAugments(tanyaoTsumo(), "p0", ["vanguard"]),
    );
    installAugment(game.engine, vanguard, "p0", { yaku: game.yaku });
    const settled = runTsumo(game);

    expect(baseDelta).toBeGreaterThan(0);
    expect(settled.deltas["p0"]).toBe(Math.round((baseDelta * 1.5) / 100) * 100);
  });

  it("동장이 아니면(남장) 0.75배만 얻는다", () => {
    const south = (): GameState => {
      const s = tanyaoTsumo();
      return { ...s, round: { ...s.round, prevalentWind: 2 } };
    };
    const base = runTsumo(createStandardGameFromState(south()));
    const baseDelta = base.deltas["p0"] ?? 0;

    const game = createStandardGameFromState(withAugments(south(), "p0", ["vanguard"]));
    installAugment(game.engine, vanguard, "p0", { yaku: game.yaku });
    const settled = runTsumo(game);

    expect(settled.deltas["p0"]).toBe(Math.round((baseDelta * 0.75) / 100) * 100);
  });

  it("방총(실점)은 배율이 적용되지 않는다", () => {
    // p0가 지불하는 국: p1이 p0의 버림을 론. vanguard는 화료자 본인일 때만 발동.
    const s = withAugments(
      craft({
        hands: { p0: "*", p1: "234m345p456s678s2s", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 1,
        lastDiscard: { player: "p0", spec: "2s" },
      }),
      "p0",
      ["vanguard"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, vanguard, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const win = status.prompts
      .find((p) => p.player === "p1")
      ?.options.find((o) => o.type === "win");
    if (win === undefined) throw new Error("no ron for p1");
    flow.submit("p1", win);
    const settled = lastSettled(game);
    // p0의 실점과 p1의 획득이 정확히 상쇄 (배율 없음)
    expect(settled.deltas["p0"]).toBeLessThan(0);
    expect((settled.deltas["p0"] ?? 0) + (settled.deltas["p1"] ?? 0)).toBe(0);
  });
});

// ─────────────────────── nagashi_yakuman (유국역만) ───────────────────────

describe("nagashi_yakuman (유국역만)", () => {
  /** 유국 상황: 패산 소진, p0 버림 전부 요구패 */
  function drawState(): GameState {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z567z", p1: "234m", p2: "234m", p3: "234m" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    return { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
  }

  function settleDraw(game: Game): RoundSettledPayload {
    const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    if (!r.ok) throw new Error(`settleDraw failed: ${r.reason}`);
    return lastSettled(game);
  }

  it("모든 버림이 요구패이면 유국역만(오야 48000) 지불을 받는다", () => {
    const base = settleDraw(createStandardGameFromState(drawState()));

    const game = createStandardGameFromState(withAugments(drawState(), "p0", ["nagashi_yakuman"]));
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const settled = settleDraw(game);

    // p0는 오야(seat 0) → 전원 16000씩, 총 +48000 (노텐 정산 위에 얹힘)
    for (const id of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const diff = (settled.deltas[id] ?? 0) - (base.deltas[id] ?? 0);
      expect(diff).toBe(id === "p0" ? 48000 : -16000);
    }
  });

  it("버림에 요구패가 아닌 패가 섞이면 성립하지 않는다", () => {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z56z5m" }, // 5m이 섞임
      phase: "turn.draw",
      turnSeat: 0,
    });
    const st = { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
    const base = settleDraw(createStandardGameFromState(st));

    const game = createStandardGameFromState(withAugments(st, "p0", ["nagashi_yakuman"]));
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const settled = settleDraw(game);

    expect(settled.deltas["p0"]).toBe(base.deltas["p0"]);
  });

  it("내 버림이 울리면(called 플래그) 성립하지 않는다", () => {
    const game = createStandardGameFromState(
      withData(withAugments(drawState(), "p0", ["nagashi_yakuman"]), {
        "nagashi_yakuman:called:p0": "1-1-0",
      }),
    );
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const base = settleDraw(createStandardGameFromState(drawState()));
    const settled = settleDraw(game);
    expect(settled.deltas["p0"]).toBe(base.deltas["p0"]);
  });
});

// ───────────────────── cliff_bloom (절벽 위에 피어난 꽃) ─────────────────────

describe("cliff_bloom (절벽 위에 피어난 꽃)", () => {
  /** 1m 안깡 후 234567p9934s(2s·5s 대기)로 텐파이가 되는 손 */
  function bloomState(): GameState {
    return withAugments(
      craft({
        hands: { p0: "1111m234567p9934s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["cliff_bloom"],
    );
  }

  it("bloom_kan이 노출되고, 사용하면 영상개화로 화료한다", () => {
    const game = createStandardGameFromState(bloomState());
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const s0 = flow.begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    const bloom = s0.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "bloom_kan");
    expect(bloom).toBeDefined();

    const s1 = flow.submit("p0", bloom!);
    if (s1.kind !== "awaiting") throw new Error("expected awaiting after kan");
    const win = s1.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "win");
    expect(win).toBeDefined();

    flow.submit("p0", win!);
    const settled = lastSettled(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.yaku.some((y) => y.id === "rinshan")).toBe(true);
  });

  it("텐파이가 되지 않는 깡은 bloom_kan을 노출하지 않는다", () => {
    // 1m 4장을 깡하면 남는 손이 텐파이가 아님 (흩어진 패)
    const s = withAugments(
      craft({
        hands: { p0: "1111m258m369p47s9s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["cliff_bloom"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s0 = flow.begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    const bloom = s0.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "bloom_kan");
    expect(bloom).toBeUndefined();
  });
});

// ─────────────────── no_retreat (물러설 수 없는 선언) ───────────────────

describe("no_retreat (물러설 수 없는 선언)", () => {
  const DECLARED = { "no_retreat:round:p0": "1-1-0" };

  /** 첫 턴 상태 (버림 없음) */
  function firstTurn(): GameState {
    return withAugments(
      craft({
        hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["no_retreat"],
    );
  }

  it("첫 턴에 declare_no_retreat가 노출되고 선언하면 플래그가 선다", () => {
    const game = createStandardGameFromState(firstTurn());
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s0 = flow.begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    const declare = s0.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "declare_no_retreat");
    expect(declare).toBeDefined();

    flow.submit("p0", declare!);
    const st = game.engine.state;
    expect(st.augmentData["no_retreat:used:p0"]).toBe(true);
    expect(st.augmentData["no_retreat:round:p0"]).toBe("1-1-0");
  });

  it("선언 후 리치 전에는 모든 역이 봉인된다 (리치 포함 화료만)", () => {
    const game = createStandardGameFromState(withData(firstTurn(), DECLARED));
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const blocked = game.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p0",
      state: game.engine.state,
    });
    // 리치 중이 아니므로 전 역 봉인 (탕야오·멘젠쯔모 등 다수)
    expect(blocked).toContain("tanyao");
    expect(blocked).toContain("menzen_tsumo");
    expect(blocked.length).toBeGreaterThan(20);
    // 미보유자는 영향 없음
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toEqual([]);
  });

  it("리치를 선언하면 봉인이 풀리고 리치 공탁금은 0", () => {
    const riichiState = (): GameState => {
      const s = withData(firstTurn(), DECLARED);
      return {
        ...s,
        round: {
          ...s.round,
          byPlayer: {
            ...s.round.byPlayer,
            p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
          },
        },
      };
    };
    const game = createStandardGameFromState(riichiState());
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    // 리치 중 → 봉인 해제
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toEqual([]);
    // 공탁금 0
    expect(
      game.engine.rules.resolve<number>("riichi.cost", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("리치·일발·뒷도라가 2판으로 계산된다 (extraHan)", () => {
    // p0 리치+일발 쯔모. 선언 상태에서 extraHan = uraHan(2배분) + 리치1 + 일발1.
    const s = withData(firstTurn(), { ...DECLARED, "no_retreat:used:p0": true });
    const st: GameState = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: true, discardIndex: 0 } },
        },
      },
    };
    // 기대치: 같은 상태를 증강 없이 채점했을 때의 ura + 리치 + 일발
    const ctxEval = evaluateWin(
      buildWinContext(st, "p0", "tsumo", st.round.lastDrawnTile as TileId, {
        includeUra: true,
        rules: createStandardGameFromState(st).engine.rules,
      }),
      createStandardGameFromState(st).yaku,
    );
    const hasRiichi = ctxEval!.yaku.some((y) => y.id === "riichi" || y.id === "double_riichi");
    const hasIppatsu = ctxEval!.yaku.some((y) => y.id === "ippatsu");
    const expectedBonus = ctxEval!.uraHan + (hasRiichi ? 1 : 0) + (hasIppatsu ? 1 : 0);

    const game = createStandardGameFromState(st);
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const settled = runTsumo(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.extraHan).toBe(expectedBonus);
    expect(hasRiichi).toBe(true); // 리치 손인지 확인 (테스트 유효성)
  });
});

// ───────────── 다중 액티브 증강: 한 턴에 여러 발동 후보 노출 ─────────────

describe("여러 액티브 증강 동시 보유", () => {
  it("첫 턴에 cliff_bloom·no_retreat 둘 다 보유하면 두 발동 후보가 모두 노출된다", () => {
    // 안깡→텐파이가 되는 개막 손 + 두 액티브 증강
    const s = withAugments(
      craft({
        hands: { p0: "1111m234567p9934s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["cliff_bloom", "no_retreat"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
    // 클라이언트가 액티브 메뉴로 골라 쓸 수 있도록 두 증강의 액션이 모두 프롬프트에 있다
    expect(opts.some((o) => o.type === "bloom_kan")).toBe(true);
    expect(opts.some((o) => o.type === "declare_no_retreat")).toBe(true);
  });
});
