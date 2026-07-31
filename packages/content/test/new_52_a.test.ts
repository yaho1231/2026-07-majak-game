/**
 * new_52_a — 52차 신규 증강 그룹 A 4종 검증.
 * riichi_seal(리치 봉인) / mixed_nine_gates(뒤섞인 아홉 개의 연꽃) /
 * haitei_lord(해저의 지배자) / off_by_one(한 끗 차이)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildWinContext,
  createStandardGame,
  createStandardGameFromState,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft, h, hanBonusPoints } from "./helpers.js";
import { riichiSeal } from "../src/augments/riichi_seal.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { offByOne } from "../src/augments/off_by_one.js";

type Game = ReturnType<typeof createStandardGameFromState>;

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

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function optionsFor(
  status: ReturnType<FlowController["begin"]>,
  player: PlayerId,
): ActionOption[] {
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

/** 패산을 지정한 마지막 n장만 남기고 잘라낸다 */
function trimWall(state: GameState, keep: number): GameState {
  const wall = state.zones[WALL];
  if (wall === undefined) throw new Error("no wall");
  return {
    ...state,
    zones: { ...state.zones, [WALL]: { ...wall, tileIds: wall.tileIds.slice(0, keep) } },
  };
}

// ─────────────────────── riichi_seal (리치 봉인) ───────────────────────

describe("riichi_seal (리치 봉인)", () => {
  /** p0가 리치를 걸 수 있는 14장(2s 단기 완성형) */
  function riichiReady(): GameState {
    return withAugments(
      craft({
        hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["riichi_seal"],
    );
  }

  it("보유자가 국의 첫 리치를 걸면 다른 사람의 riichi.blocked가 켜진다", () => {
    const game = createStandardGameFromState(riichiReady());
    installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });

    // 봉인 전에는 아무도 잠겨 있지 않다
    for (const id of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      expect(
        game.engine.rules.resolve<boolean>("riichi.blocked", {
          playerId: id,
          state: game.engine.state,
        }),
      ).toBe(false);
    }

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const riichi = optionsFor(status, "p0").find((o) => o.type === "riichi");
    expect(riichi).toBeDefined();
    flow.submit("p0", riichi!);

    const st = game.engine.state;
    expect(st.augmentData["riichi_seal:sealed:1-1-0:p0"]).toBe(true);
    // 보유자 본인은 잠기지 않는다 / 나머지 셋은 잠긴다
    expect(
      game.engine.rules.resolve<boolean>("riichi.blocked", { playerId: "p0", state: st }),
    ).toBe(false);
    for (const id of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(
        game.engine.rules.resolve<boolean>("riichi.blocked", { playerId: id, state: st }),
      ).toBe(true);
    }
    // 전원 공개 뷰 채널
    expect(st.augmentData["view:*:riichi_seal:p0#round"]).toBe("봉인");
  });

  it("봉인된 상대는 리치 옵션 자체가 사라진다", () => {
    // p1이 리치를 걸 수 있는 14장을 들고 자기 턴에 서 있는 상태
    const base = withAugments(
      craft({
        hands: { p0: "*", p1: "234m345p456s678s22s", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      "p0",
      ["riichi_seal"],
    );

    // 봉인이 없으면 p1은 리치를 걸 수 있다 (테스트 유효성)
    const free = createStandardGameFromState(base);
    installAugment(free.engine, riichiSeal, "p0", { yaku: free.yaku });
    expect(
      optionsFor(new FlowController(free.engine).begin(), "p1").some(
        (o) => o.type === "riichi",
      ),
    ).toBe(true);

    // 같은 상태에 p0의 봉인을 세워 둔다.
    // 봉인은 **보유자가 리치를 지고 있는 동안**만 유효하므로(60차) p0도 리치 상태여야 한다.
    const sealed: GameState = {
      ...base,
      augmentData: { ...base.augmentData, "riichi_seal:sealed:1-1-0:p0": true },
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...(base.round.byPlayer["p0"] as object),
            riichi: { discardIndex: 0, ippatsu: false, double: false },
          } as never,
        },
      },
    };
    const game = createStandardGameFromState(sealed);
    installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });
    const opts = optionsFor(new FlowController(game.engine).begin(), "p1");
    expect(opts.some((o) => o.type === "riichi")).toBe(false);
    expect(opts.some((o) => o.type === "discard")).toBe(true); // 타패는 그대로
  });

  it("이미 다른 사람이 리치를 건 국에서는 봉인이 서지 않는다 (소급 없음)", () => {
    const base = riichiReady();
    const st: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...base.round.byPlayer["p1"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    const game = createStandardGameFromState(st);
    installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    flow.submit("p0", optionsFor(status, "p0").find((o) => o.type === "riichi")!);

    expect(game.engine.state.augmentData["riichi_seal:sealed:1-1-0:p0"]).toBeUndefined();
    expect(
      game.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: "p2",
        state: game.engine.state,
      }),
    ).toBe(false);
  });
});

// ───────────── mixed_nine_gates (뒤섞인 아홉 개의 연꽃) ─────────────

describe("mixed_nine_gates (뒤섞인 아홉 개의 연꽃)", () => {
  /**
   * 무늬가 섞인 구련보등 배열 14장.
   * 111m 999m 22p 345p 678p → 랭크 카운트 [3,1,1,1,1,1,1,1,3] + 2 한 장.
   */
  const MIXED = "111m999m22p345p678p";

  function mixedState(hand: string): GameState {
    return withAugments(
      craft({
        hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["mixed_nine_gates"],
    );
  }

  function evalHand(hand: string, install: boolean): ReturnType<typeof evaluateWin> {
    const st = mixedState(hand);
    const game = createStandardGameFromState(st);
    if (install) installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
    const winTile = game.engine.state.round.lastDrawnTile as TileId;
    return evaluateWin(
      buildWinContext(game.engine.state, "p0", "tsumo", winTile, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
  }

  it("무늬가 섞인 1112345678999+@ 는 역만이 된다", () => {
    // 랭크 배열 확인 (테스트 유효성)
    const counts = new Array<number>(10).fill(0);
    for (const k of h(MIXED)) counts[k.rank] = (counts[k.rank] ?? 0) + 1;
    expect(counts.slice(1)).toEqual([3, 2, 1, 1, 1, 1, 1, 1, 3]);

    const before = evalHand(MIXED, false);
    expect(before?.yakumanCount ?? 0).toBe(0);

    const after = evalHand(MIXED, true);
    expect(after).not.toBeNull();
    expect(after!.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(true);
    expect(after!.yakumanCount).toBeGreaterThanOrEqual(1);
  });

  it("무늬가 흩어져 표준 분해가 안 되는 구련 배열도 화료가 된다 (2026-07-31)", () => {
    // 1m1m·1p | 2m3p4s | 5m6p7s | 8m9p9s | 9m9s — 랭크는 1112345678999+9지만
    // 몸통마다 무늬가 다 달라 표준 분해로는 4멘쯔+작두가 서지 않는다.
    const SCATTERED = "11m1p2m3p4s5m6p7s8m9p9m9s9s";
    const counts = new Array<number>(10).fill(0);
    for (const k of h(SCATTERED)) counts[k.rank] = (counts[k.rank] ?? 0) + 1;
    expect(counts.slice(1)).toEqual([3, 1, 1, 1, 1, 1, 1, 1, 4]);

    // 증강이 없으면 화료형 자체가 아니다 — 예전엔 이 상태로 역만만 정의돼 있어
    // "역만인데 화료 버튼이 안 뜨는" 손이 됐다.
    expect(evalHand(SCATTERED, false)).toBeNull();

    const ev = evalHand(SCATTERED, true);
    expect(ev).not.toBeNull();
    expect(ev!.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(true);
    expect(ev!.yakumanCount).toBeGreaterThanOrEqual(1);
  });

  it("구련 배열이 아니면 무늬 무시가 켜지지 않는다 (아무 손이나 혼색 몸통이 되지 않는다)", () => {
    // 랭크가 구련 뼈대가 아닌 평범한 혼색 손 — 무늬가 섞인 몸통은 여전히 화료형이 아니다
    const ev = evalHand("123m456p789s11z22z2m", true);
    expect(ev?.yaku.some((y) => y.id === "mixed_nine_gates") ?? false).toBe(false);
  });

  it("한 무늬 순혈은 표준 구련보등의 몫 — 이 역이 중복으로 붙지 않는다", () => {
    // 1112345678999m + 9m = 순정 구련보등 14장 (9m 4장)
    const ev = evalHand("1112345678999m9m", true);
    expect(ev).not.toBeNull();
    expect(ev!.yaku.some((y) => y.id === "chuuren")).toBe(true);
    expect(ev!.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(false);
  });

  it("자패가 섞이면 성립하지 않는다", () => {
    // 111m 999m 11z(머리) 345p 678p — 랭크 뼈대는 깨지고 자패가 들어간다
    const ev = evalHand("111m999m11z345p678p", true);
    expect(ev?.yaku.some((y) => y.id === "mixed_nine_gates") ?? false).toBe(false);
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(mixedNineGates, seed);
  });
});

// ─────────────────── haitei_lord (해저의 지배자) ───────────────────

describe("haitei_lord (해저의 지배자)", () => {
  /**
   * p0 텐파이(234m345p456s678s2s = 13장, 2s/5s 대기)로 해저패를 뽑는 상황.
   * 패산에 1장만 남겨 두고 turn.draw에서 시작한다.
   */
  function haiteiState(hand13: string): GameState {
    const st = withAugments(
      craft({
        hands: { p0: hand13, p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      "p0",
      ["haitei_lord"],
    );
    return trimWall(st, 1);
  }

  it("텐파이로 해저패를 뽑으면 그 패가 오름패로 바뀌어 해저로월 화료가 열린다", () => {
    const game = createStandardGameFromState(haiteiState("234m345p456s678s2s"));
    installAugment(game.engine, haiteiLord, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const win = optionsFor(status, "p0").find((o) => o.type === "win");
    expect(win).toBeDefined();

    const st = game.engine.state;
    expect(st.augmentData["haitei_lord:fired:1-1-0:p0"]).toBe(true);
    // 패산은 비었고, 쯔모패는 손패에 있다
    expect(st.zones[WALL]?.tileIds).toHaveLength(0);
    const drawn = st.round.lastDrawnTile as TileId;
    expect(st.zones[handZone("p0")]?.tileIds).toContain(drawn);
    // 바뀐 패는 대기(2s/5s) 중 하나여야 한다
    expect(["sou5", "sou2"]).toContain(kindKey(kindOf(st, drawn)));

    flow.submit("p0", win!);
    const settled = lastSettled(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.yaku.some((y) => y.id === "haitei")).toBe(true);
  });

  it("발동한 국의 화료 정산에 +3판이 얹힌다", () => {
    const game = createStandardGameFromState(haiteiState("234m345p456s678s2s"));
    installAugment(game.engine, haiteiLord, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const before = game.engine.state;
    flow.submit("p0", optionsFor(status, "p0").find((o) => o.type === "win")!);

    const settled = lastSettled(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    // 표준 화료 점수 위에 "+3판 환산" 뱅크 점수가 정확히 얹힌다
    const bonus = hanBonusPoints(before, "p0", info!, 3);
    expect(bonus).toBeGreaterThan(0);
    expect((settled.deltas["p0"] ?? 0) - info!.points).toBe(bonus);
  });

  it("텐파이가 아니면 아무 일도 일어나지 않는다", () => {
    // 1m3m5m7m9m1p3p5p7p9p1s3s5s — 텐파이가 아닌 13장
    const game = createStandardGameFromState(haiteiState("13579m13579p135s"));
    installAugment(game.engine, haiteiLord, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(false);
    expect(
      game.engine.state.augmentData["haitei_lord:fired:1-1-0:p0"],
    ).toBeUndefined();
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(haiteiLord, seed);
  });
});

// ─────────────────────── off_by_one (한 끗 차이) ───────────────────────

describe("off_by_one (한 끗 차이)", () => {
  /** 리치 중인 p0가 turn.draw에서 시작하는 상태 (패산 맨 앞 패를 지정 kind로 심는다) */
  function riichiDrawState(hand13: string, plantSpec: string): GameState {
    const base = withAugments(
      craft({
        hands: { p0: hand13, p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      "p0",
      ["off_by_one"],
    );
    const withRiichi: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer["p0"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    // 패산 맨 뒤(다음에 뽑히는 자리)에 원하는 kind의 패를 심는다
    const plant = h(plantSpec)[0]!;
    const wall = withRiichi.zones[WALL]!;
    const pick = wall.tileIds.find(
      (id) => kindKey(withRiichi.tiles[id]!.kind) === kindKey(plant),
    );
    if (pick === undefined) throw new Error(`패산에 ${plantSpec}가 없다`);
    const rest = wall.tileIds.filter((id) => id !== pick);
    // 쯔모는 패산 맨 앞(index 0)에서 뽑는다
    return {
      ...withRiichi,
      zones: { ...withRiichi.zones, [WALL]: { ...wall, tileIds: [pick, ...rest] } },
    };
  }

  /** 234m 345p 22s 45s 678s = 13장, 3s/6s 양면 대기 */
  const RYANMEN = "234m345p22s45s678s";

  it("리치 중 오름패의 ±1을 쯔모하면 그 패가 오름패로 바뀐다", () => {
    // 3s/6s 대기에 7s(=6s+1)를 심는다
    const st = riichiDrawState(RYANMEN, "7s");
    const game = createStandardGameFromState(st);
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    // 7s로 뽑혔지만 6s로 한 칸 밀려 있다
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe("sou6");
    expect(game.engine.state.tiles[drawn]?.attrs?.conjured).toBe(true);
    expect(game.engine.state.augmentData["view:*:off_by_one:p0#round"]).toBe("sou6");
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(true);
  });

  it("아래쪽으로도 밀린다 — 2s를 뽑으면 3s가 된다", () => {
    const game = createStandardGameFromState(riichiDrawState(RYANMEN, "2s"));
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe("sou3");
  });

  it("리치가 아니면 발동하지 않는다", () => {
    const st = riichiDrawState(RYANMEN, "7s");
    const noRiichi: GameState = {
      ...st,
      round: {
        ...st.round,
        byPlayer: {
          ...st.round.byPlayer,
          p0: { ...st.round.byPlayer["p0"]!, riichi: null },
        },
      },
    };
    const game = createStandardGameFromState(noRiichi);
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe("sou7");
  });

  it("2칸 이상 어긋난 패·자패는 밀리지 않는다", () => {
    for (const spec of ["1s", "1z"]) {
      const game = createStandardGameFromState(riichiDrawState(RYANMEN, spec));
      installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
      new FlowController(game.engine).begin();
      const drawn = game.engine.state.round.lastDrawnTile as TileId;
      expect(kindKey(kindOf(game.engine.state, drawn))).toBe(
        kindKey(h(spec)[0]!),
      );
    }
  });

  it("진짜 오름패를 뽑으면 손대지 않는다", () => {
    const game = createStandardGameFromState(riichiDrawState(RYANMEN, "6s"));
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe("sou6");
    expect(game.engine.state.tiles[drawn]?.attrs?.conjured).toBeFalsy();
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(offByOne, seed);
  });
});

// ───────────────────── 크래시 스위프 (실게임 한 국) ─────────────────────

const STD = new Set([
  "discard",
  "riichi",
  "pon",
  "chi",
  "minkan",
  "ankan",
  "shouminkan",
  "win",
  "pass",
  "kyushuKyuhai",
]);

function decide(options: ActionOption[], usedAug: Set<string>): ActionOption {
  const win = options.find((o) => o.type === "win");
  if (win) return win;
  const aug = options.find((o) => !STD.has(o.type) && !usedAug.has(o.type));
  if (aug) {
    usedAug.add(aug.type);
    return aug;
  }
  const riichi = options.find((o) => o.type === "riichi");
  if (riichi) return riichi;
  const discard = options.find((o) => o.type === "discard");
  if (discard) return discard;
  const pass = options.find((o) => o.type === "pass");
  if (pass) return pass;
  return options[0]!;
}

/** 증강을 p0에 얹고 한 국을 완주시킨다. 예외가 나면 실패. */
function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  game.engine.state.players.find((p) => p.id === "p0")!.augments.push(aug.id);
  const flow = new FlowController(game.engine);
  const usedAug = new Set<string>();
  let status = flow.begin();
  let guard = 0;
  while (status.kind === "awaiting" && guard++ < 2000) {
    const prompt = status.prompts[0]!;
    status = flow.submit(prompt.player, decide(prompt.options, usedAug));
  }
  expect(status.kind).toBe("roundOver");
}

describe("그룹 A 크래시 스위프", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of [riichiSeal, mixedNineGates, haiteiLord, offByOne]) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
