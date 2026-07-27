/**
 * new_52_c — 52차 신규 증강 그룹 C 4종 검증.
 * dead_wall_master(왕패의 주인) / stealth_riichi(스텔스 리치) /
 * void_kan(성립하지 않는 깡) / honba_hunter(본장 사냥꾼)
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildPlayerView,
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
import { craft } from "./helpers.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { voidKan } from "../src/augments/void_kan.js";
import { honbaHunter } from "../src/augments/honba_hunter.js";

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

// ─────────── 실게임 한 국 완주 스위프 (new_batch_sweep의 playOneRound 복사) ───────────

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
  const discard = options.find((o) => o.type === "discard");
  if (discard) return discard;
  const pass = options.find((o) => o.type === "pass");
  if (pass) return pass;
  return options[0]!;
}

function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
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

// ─────────────────── dead_wall_master (왕패의 주인) ───────────────────

describe("dead_wall_master (왕패의 주인)", () => {
  /** 국 시작(첫 순)·p0 자기 턴 상태. discards를 주면 '이미 버린 뒤'가 된다 */
  function firstTurnState(discards?: string, extra?: Partial<GameState>): GameState {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      ...(discards !== undefined ? { discards: { p0: discards } } : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    return withAugments(
      { ...base, round: { ...base.round, firstTurn: true }, ...extra },
      "p0",
      ["dead_wall_master"],
    );
  }

  function setup(state: GameState): { game: Game; flow: FlowController } {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  it("국 시작 자기 첫 순에 손패 × 왕패 14자리 후보가 뜬다", () => {
    const { flow } = setup(firstTurnState());
    const opts = optionsFor(flow.begin(), "p0").filter((o) => o.type === "dw_swap");
    // 손패 14장 × 왕패 14자리
    expect(opts).toHaveLength(14 * 14);
  });

  it("교환하면 손패와 왕패가 1:1로 맞바뀌고 왕패 장수는 보존된다", () => {
    const { game, flow } = setup(firstTurnState());
    const before = game.engine.state;
    const handTileId = before.zones[handZone("p0")]?.tileIds[0] as TileId;
    const deadIndex = 9;
    const deadTileId = before.zones[DEAD_WALL]?.tileIds[deadIndex] as TileId;

    const opt = optionsFor(flow.begin(), "p0").find(
      (o) =>
        o.type === "dw_swap" &&
        (o.payload as { handTileId: TileId }).handTileId === handTileId &&
        (o.payload as { deadIndex: number }).deadIndex === deadIndex,
    );
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);

    const st = game.engine.state;
    expect(st.zones[handZone("p0")]?.tileIds).toContain(deadTileId);
    expect(st.zones[handZone("p0")]?.tileIds).not.toContain(handTileId);
    expect(st.zones[DEAD_WALL]?.tileIds).toHaveLength(14);
    expect(st.zones[DEAD_WALL]?.tileIds[deadIndex]).toBe(handTileId);
    // 손패 장수는 그대로 14장
    expect(st.zones[handZone("p0")]?.tileIds).toHaveLength(14);
    // 남은 횟수가 뷰 채널로 미러링된다
    expect(st.augmentData["view:p0:dead_wall_master:remaining:p0"]).toBe(1);
    expect(st.augmentData["dead_wall_master:swaps:1-1-0:p0"]).toBe(1);
  });

  it("국당 2장까지 — 2번 쓰면 후보가 사라진다 (2026-07-26 밸런스: 4 → 2)", () => {
    const { game, flow } = setup(firstTurnState());
    let status = flow.begin();
    for (let i = 0; i < 2; i++) {
      const opt = optionsFor(status, "p0").find((o) => o.type === "dw_swap");
      expect(opt).toBeDefined();
      status = flow.submit("p0", opt!);
    }
    expect(game.engine.state.augmentData["view:p0:dead_wall_master:remaining:p0"]).toBe(0);
    expect(optionsFor(status, "p0").some((o) => o.type === "dw_swap")).toBe(false);
    // 타패는 그대로 가능하다 (막힌 상태가 아니다)
    expect(optionsFor(status, "p0").some((o) => o.type === "discard")).toBe(true);
  });

  it("도라 표시패 자리를 집으면 그 자리에서 도라가 바뀐다", () => {
    const { game, flow } = setup(firstTurnState());
    const before = game.engine.state;
    const indicatorId = before.round.doraIndicators[0] as TileId;
    const deadIndex = (before.zones[DEAD_WALL]?.tileIds ?? []).indexOf(indicatorId);
    expect(deadIndex).toBeGreaterThanOrEqual(0);
    const handTileId = before.zones[handZone("p0")]?.tileIds[0] as TileId;

    const opt = optionsFor(flow.begin(), "p0").find(
      (o) =>
        o.type === "dw_swap" &&
        (o.payload as { handTileId: TileId }).handTileId === handTileId &&
        (o.payload as { deadIndex: number }).deadIndex === deadIndex,
    );
    flow.submit("p0", opt!);

    const st = game.engine.state;
    // 표시패는 그 자리를 채운 내 패로 갈아 끼워진다
    expect(st.round.doraIndicators[0]).toBe(handTileId);
    expect(st.zones[DEAD_WALL]?.tileIds[deadIndex]).toBe(handTileId);
  });

  it("이미 버린 뒤(첫 순이 아니면)에는 발동할 수 없다", () => {
    const { flow } = setup(firstTurnState("1z"));
    expect(optionsFor(flow.begin(), "p0").some((o) => o.type === "dw_swap")).toBe(false);
  });

  it("교환해도 화료에 추가 점수가 붙지 않는다 (2026-07-26 밸런스: +6000 삭제)", () => {
    const winPoints = (swaps: number): { delta: number; base: number } => {
      const base = firstTurnState();
      const state: GameState =
        swaps === 0
          ? base
          : {
              ...base,
              augmentData: {
                ...base.augmentData,
                "dead_wall_master:swaps:1-1-0:p0": swaps,
              },
            };
      const { game, flow } = setup(state);
      const status = flow.begin();
      const win = optionsFor(status, "p0").find((o) => o.type === "win");
      expect(win).toBeDefined();
      flow.submit("p0", win!);
      const settled = lastSettled(game);
      const info = settled.winInfos?.find((w) => w.winner === "p0");
      return { delta: settled.deltas["p0"] ?? 0, base: info?.points ?? 0 };
    };

    const none = winPoints(0);
    expect(none.delta - none.base).toBe(0);
    const swapped = winPoints(2);
    expect(swapped.delta - swapped.base).toBe(0);
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(deadWallMaster, seed);
  });
});

// ─────────────────── stealth_riichi (스텔스 리치) ───────────────────

describe("stealth_riichi (스텔스 리치)", () => {
  /** p0가 리치를 걸 수 있는 14장(2s 단기 완성형 직전) */
  function riichiReady(): GameState {
    return withAugments(
      craft({
        hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["stealth_riichi"],
    );
  }

  function setup(state: GameState): { game: Game; flow: FlowController } {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  it("텐파이가 유지되는 패만 후보로 뜬다", () => {
    const { game, flow } = setup(riichiReady());
    const opts = optionsFor(flow.begin(), "p0").filter(
      (o) => o.type === "stealth_riichi",
    );
    expect(opts.length).toBeGreaterThan(0);
    // 표준 리치 후보와 같은 패 집합이어야 한다
    const stdRiichi = new Set(
      optionsFor(new FlowController(game.engine).begin(), "p0")
        .filter((o) => o.type === "riichi")
        .map((o) => (o.payload as { tileId: TileId }).tileId),
    );
    const stealth = new Set(opts.map((o) => (o.payload as { tileId: TileId }).tileId));
    expect([...stealth].sort()).toEqual([...stdRiichi].sort());
  });

  it("공탁 면제 — 점수가 줄지 않고 리치봉도 쌓이지 않는다", () => {
    const { game, flow } = setup(riichiReady());
    const scoreBefore = game.engine.state.players.find((p) => p.id === "p0")!.score;
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "stealth_riichi");
    flow.submit("p0", opt!);

    const st = game.engine.state;
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    expect(st.players.find((p) => p.id === "p0")!.score).toBe(scoreBefore);
    expect(st.round.riichiPot).toBe(0);
  });

  it("타가 뷰에서는 리치가 보이지 않지만 본인 뷰에는 보인다", () => {
    const { game, flow } = setup(riichiReady());
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "stealth_riichi");
    flow.submit("p0", opt!);
    const st = game.engine.state;

    const mine = buildPlayerView(st, "p0", game.engine.rules);
    expect(mine.round.byPlayer["p0"]?.riichiDeclared).toBe(true);
    const theirs = buildPlayerView(st, "p1", game.engine.rules);
    expect(theirs.round.byPlayer["p0"]?.riichiDeclared).toBe(false);
    expect(theirs.round.byPlayer["p0"]?.riichiTileIndex).toBeUndefined();
  });

  it("화료 판정에는 리치 역이 그대로 붙는다 (은닉은 진행 중 뷰에만)", () => {
    const { game, flow } = setup(riichiReady());
    const status = flow.begin();
    // 2s(=22s의 한 장)를 버려 2s/5s 대기를 남긴다
    const opt = optionsFor(status, "p0")
      .filter((o) => o.type === "stealth_riichi")
      .find(
        (o) =>
          kindKey(
            kindOf(game.engine.state, (o.payload as { tileId: TileId }).tileId),
          ) === "sou2",
      );
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);

    const st = game.engine.state;
    // 남은 손패는 234m345p456s678s2s = 2s 단기 대기.
    // 화료패는 손패 '밖'의 실물 패여야 한다 (패산에서 2s를 찾는다)
    const winTile = (st.zones[WALL]?.tileIds ?? []).find(
      (id) => kindKey(kindOf(st, id)) === "sou2",
    ) as TileId;
    expect(winTile).toBeDefined();
    const ev = evaluateWin(
      buildWinContext(st, "p0", "ron", winTile, { rules: game.engine.rules }),
      game.yaku,
    );
    expect(ev).not.toBeNull();
    // (craft 상태는 버림 이력이 없어 더블리치로 성립한다 — 어느 쪽이든 리치 역이다)
    expect(
      ev!.yaku.some((y) => y.id === "riichi" || y.id === "double_riichi"),
    ).toBe(true);
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(stealthRiichi, seed);
  });
});

// ─────────────────── void_kan (성립하지 않는 깡) ───────────────────

describe("void_kan (성립하지 않는 깡)", () => {
  /** p1이 1z 안깡을 칠 수 있는 자기 턴. p0는 2s/5s 대기 텐파이(1z는 오름패가 아니다) */
  function ankanState(p0hand: string): GameState {
    return withAugments(
      craft({
        hands: {
          p0: p0hand,
          p1: "1111z234m567p99s22p",
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
        seed: 3,
      }),
      "p0",
      ["void_kan"],
    );
  }

  function setup(state: GameState): { game: Game; flow: FlowController } {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  it("보유자에게 안깡 챤깡이 열린다 (win.closedKanRobbable)", () => {
    const { game } = setup(ankanState("234m345p456s678s2s"));
    const resolveFor = (pid: PlayerId): boolean =>
      game.engine.rules.resolve<boolean>("win.closedKanRobbable", {
        playerId: pid,
        state: game.engine.state,
      });
    expect(resolveFor("p0")).toBe(true);
    expect(resolveFor("p2")).toBe(false);
  });

  it("타가가 안깡을 선언하면 손패 1장이 바뀌어 창깡 화료가 열린다", () => {
    const { game, flow } = setup(ankanState("234m345p456s678s2s"));
    let status = flow.begin();
    const ankan = optionsFor(status, "p1").find((o) => o.type === "ankan");
    expect(ankan).toBeDefined();
    status = flow.submit("p1", ankan!);

    const st = game.engine.state;
    // 상대 멜드는 그대로 4장 (건드리지 않는다)
    expect(st.round.byPlayer["p1"]?.melds[0]?.tileIds).toHaveLength(4);
    // 내 손패 1장이 새로 만들어진(conjured) 패로 바뀌었다
    const conjured = (st.zones[handZone("p0")]?.tileIds ?? []).filter(
      (id) => st.tiles[id]?.attrs?.conjured === true,
    );
    expect(conjured).toHaveLength(1);
    expect(st.augmentData["view:*:void_kan:p0"]).toBe("wind1");
    // 창깡 론이 후보로 뜬다
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(true);
  });

  it("창깡으로 화료하면 chankan 역으로 정산된다", () => {
    const { game, flow } = setup(ankanState("234m345p456s678s2s"));
    let status = flow.begin();
    status = flow.submit("p1", optionsFor(status, "p1").find((o) => o.type === "ankan")!);
    const win = optionsFor(status, "p0").find((o) => o.type === "win")!;
    flow.submit("p0", win);

    const info = lastSettled(game).winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.yaku.some((y) => y.id === "chankan")).toBe(true);
    // 추가 점수는 없다 — 정산은 표준 화료 점수 그대로
    expect(lastSettled(game).deltas["p0"]).toBeGreaterThan(0);
  });

  it("텐파이가 아니면 손패를 건드리지 않는다", () => {
    // 13579m13579p135s — 텐파이가 아닌 13장
    const { game, flow } = setup(ankanState("13579m13579p135s"));
    let status = flow.begin();
    status = flow.submit("p1", optionsFor(status, "p1").find((o) => o.type === "ankan")!);
    const st = game.engine.state;
    expect(
      (st.zones[handZone("p0")]?.tileIds ?? []).some(
        (id) => st.tiles[id]?.attrs?.conjured === true,
      ),
    ).toBe(false);
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(false);
  });

  it("이미 그 패가 오름패면 손패를 바꾸지 않는다", () => {
    // p1이 3p 안깡 / p0는 12p로 3p를 기다리는 진짜 텐파이
    const state = withAugments(
      craft({
        hands: {
          p0: "234m12p456s678s99s",
          p1: "3333p234m567s99m11z",
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
        seed: 3,
      }),
      "p0",
      ["void_kan"],
    );
    const { game, flow } = setup(state);
    let status = flow.begin();
    status = flow.submit("p1", optionsFor(status, "p1").find((o) => o.type === "ankan")!);

    const st = game.engine.state;
    expect(
      (st.zones[handZone("p0")]?.tileIds ?? []).some(
        (id) => st.tiles[id]?.attrs?.conjured === true,
      ),
    ).toBe(false);
    // 손을 건드리지 않아도 창깡 론은 열린다 (안깡 챤깡 허용)
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(true);
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(voidKan, seed);
  });
});

// ─────────────────── honba_hunter (본장 사냥꾼) ───────────────────

describe("honba_hunter (본장 사냥꾼)", () => {
  /** 본장 n개가 쌓인 상태에서 p0가 쯔모 화료 직전 */
  function honbaState(honba: number): GameState {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 8,
    });
    return withAugments(
      { ...base, round: { ...base.round, honba } },
      "p0",
      ["honba_hunter"],
    );
  }

  it("보유자에게만 본장 단가가 1500이 된다", () => {
    const game = createStandardGameFromState(honbaState(0));
    installAugment(game.engine, honbaHunter, "p0", { yaku: game.yaku });
    const per = (pid: PlayerId): number =>
      game.engine.rules.resolve<number>("score.honbaPerStick", {
        playerId: pid,
        state: game.engine.state,
      });
    expect(per("p0")).toBe(1500);
    expect(per("p1")).toBe(300);
  });

  it("3본장 쯔모 화료에서 표준보다 3600점을 더 받는다", () => {
    const settleWith = (aug: boolean): RoundSettledPayload => {
      const game = createStandardGameFromState(honbaState(3));
      if (aug) installAugment(game.engine, honbaHunter, "p0", { yaku: game.yaku });
      const flow = new FlowController(game.engine);
      const status = flow.begin();
      flow.submit("p0", optionsFor(status, "p0").find((o) => o.type === "win")!);
      return lastSettled(game);
    };
    const plain = settleWith(false);
    const hunted = settleWith(true);
    // 본장 3개 × (1500-300) = 3600 (쯔모는 셋이 1/3씩 더 낸다)
    expect((hunted.deltas["p0"] ?? 0) - (plain.deltas["p0"] ?? 0)).toBe(3600);
    for (const pid of ["p1", "p2", "p3"] as PlayerId[]) {
      expect((plain.deltas[pid] ?? 0) - (hunted.deltas[pid] ?? 0)).toBe(1200);
    }
  });

  it("국 시작마다 현재 본장과 그 가치를 전원 공개 채널에 싣는다", () => {
    const game = createStandardGame({ seed: 4, extraAugments: [honbaHunter] });
    installAugment(game.engine, honbaHunter, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    expect(game.engine.state.augmentData["view:*:honba_hunter:p0"]).toEqual({
      honba: 0,
      perStick: 1500,
      value: 0,
    });
  });

  it("실게임 한 국을 완주한다 (여러 시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(honbaHunter, seed);
  });
});
