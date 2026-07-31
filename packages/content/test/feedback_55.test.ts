/**
 * feedback_55 — 55차 사용자 플레이 피드백에 따른 기존 증강 사양 변경 5건 검증.
 *
 * 대상: hidden_river(액티브 선언형 + 각자 마지막 버림패 공개) ·
 *       hand_swap3(발동한 국 재사용 금지) ·
 *       future_sight(액티브 버튼 2단계 + 가져온 패 공개) ·
 *       jackpot(룰렛에 0.5배 추가) ·
 *       red_five_touch(적도라에 소유자 각인)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  buildPlayerView,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  handZone,
  installAugment,
  isNumberSuit,
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
import { roundKey, roundViewKey, viewKey } from "../src/util.js";

import { hiddenRiver } from "../src/augments/hidden_river.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { futureSight } from "../src/augments/future_sight.js";
import { jackpot } from "../src/augments/jackpot.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";

type Game = ReturnType<typeof createStandardGameFromState>;

// ─────────────────────────── 공용 하네스 ───────────────────────────

/** 보유 검사(player.augments)가 있는 증강용 — 상태에 보유를 직접 심는다 */
function withAugment(
  state: GameState,
  player: PlayerId,
  id: string,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

/** p0 턴에 뜨는 옵션 목록 */
function turnOptions(game: Game): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

/** 마지막 ROUND_SETTLED payload */
function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/** 탕야오 멘젠쯔모가 가능한 p0 화료 직전 상태 */
function craftTanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** turn.act 상태에서 p0의 쯔모 화료를 끝까지 진행한다 */
function runTsumoWin(game: Game): void {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  const win = prompt?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
}

/** 특정 Zone의 뷰 (없으면 예외) */
function zoneOf(
  view: ReturnType<typeof buildPlayerView>,
  id: string,
): { tileIds: TileId[]; hiddenCount: number } {
  const z = view.zones[id];
  if (z === undefined) throw new Error(`no zone ${id}`);
  return { tileIds: [...z.tileIds], hiddenCount: z.hiddenCount };
}

// ─────────────────────── 크래시 스위프 (한 국 완주) ───────────────────────

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

/** 증강을 p0에 얹고 한 국을 완주시킨다 (new_batch_sweep의 playOneRound 패턴 복사) */
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

// ─────────────────────────── 1. hidden_river ───────────────────────────

describe("hidden_river — 안개는 선언해야 낀다 (액티브)", () => {
  const FOG_KEY = "hidden_river:fog:p0";
  const LAST_KEY = roundViewKey("*", "hidden_river:last:p0");
  // 공개 채널은 보유자별로 갈린다 (박무와 키를 공유하면 서로 덮어쓴다)
  const REVEAL_KEY = roundViewKey("*", "revealTiles:fog:p0");

  function setup(): Game {
    const state = withAugment(
      craft({
        hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z2z", p1: "9m", p2: "3z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed: 5,
      }),
      "p0",
      "hidden_river",
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, hiddenRiver, "p0", { yaku: game.yaku });
    return game;
  }

  it("선언 전에는 바닥이 정상적으로 보인다 (상시 패시브가 아니다)", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(zoneOf(view, discardsZone("p0")).tileIds).toHaveLength(2);
    expect(zoneOf(view, discardsZone("p0")).hiddenCount).toBe(0);
    expect(game.engine.state.augmentData[FOG_KEY]).toBeUndefined();
  });

  it("보유자 턴에 declare_fog 후보가 뜨고, 선언하면 그때부터 안개가 낀다", () => {
    const game = setup();
    expect(turnOptions(game).some((o) => o.type === "declare_fog")).toBe(true);

    const r = game.engine.submit({
      player: "p0",
      type: "declare_fog",
      payload: {},
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    expect(s.augmentData[FOG_KEY]).toBe(true);
    expect(s.augmentData[roundViewKey("*", "hidden_river:p0")]).toBe("안개");

    // 타인 뷰: 네 사람 바닥이 전부 장수만
    const other = buildPlayerView(s, "p1", game.engine.rules);
    expect(zoneOf(other, discardsZone("p0")).tileIds).toHaveLength(0);
    expect(zoneOf(other, discardsZone("p0")).hiddenCount).toBe(2);
    expect(zoneOf(other, discardsZone("p1")).hiddenCount).toBe(1);

    // 보유자 뷰: 전부 그대로
    const mine = buildPlayerView(s, "p0", game.engine.rules);
    expect(zoneOf(mine, discardsZone("p0")).tileIds).toHaveLength(2);
    expect(zoneOf(mine, discardsZone("p1")).tileIds).toHaveLength(1);
  });

  it("게임당 1회 — 두 번째 선언은 거부되고 후보에서도 사라진다", () => {
    const game = setup();
    expect(
      game.engine.submit({ player: "p0", type: "declare_fog", payload: {} }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({ player: "p0", type: "declare_fog", payload: {} }).ok,
    ).toBe(false);
    expect(turnOptions(game).some((o) => o.type === "declare_fog")).toBe(false);
  });

  it("각 플레이어의 마지막 버림패는 안개 속에서도 전원에게 보인다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "declare_fog", payload: {} });

    const s = game.engine.state;
    const lastOf = (p: PlayerId): TileId | undefined =>
      s.zones[discardsZone(p)]?.tileIds.at(-1);
    const map = s.augmentData[LAST_KEY] as Record<PlayerId, TileId>;
    expect(map["p0"]).toBe(lastOf("p0"));
    expect(map["p1"]).toBe(lastOf("p1"));
    expect(map["p2"]).toBe(lastOf("p2"));
    // p3은 버린 패가 없으므로 맵에 없다
    expect(map["p3"]).toBeUndefined();

    // 같은 tileId가 revealTiles 채널에도 실려 '진짜 패'로 그릴 수 있다
    expect(s.augmentData[REVEAL_KEY]).toEqual(Object.values(map));
    const other = buildPlayerView(s, "p1", game.engine.rules);
    for (const id of Object.values(map)) {
      expect(other.tiles[id]).toBeDefined();
    }
    // 반면 바닥의 그 앞 패(p0의 첫 버림)는 여전히 보이지 않는다
    const hiddenId = s.zones[discardsZone("p0")]?.tileIds[0] as TileId;
    expect(other.tiles[hiddenId]).toBeUndefined();
  });

  it("버릴 때마다 '각자의 마지막 버림패' 맵이 갱신된다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "declare_fog", payload: {} });

    const hand = handIdsOf(game.engine.state, "p0");
    const toss = hand[0] as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId: toss },
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    const map = s.augmentData[LAST_KEY] as Record<PlayerId, TileId>;
    expect(map["p0"]).toBe(toss);
    expect(s.augmentData[REVEAL_KEY]).toContain(toss);
  });

  it("실게임 한 국 완주 (3시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(hiddenRiver, seed);
  });
});

// ─────────────────────────── 2. hand_swap3 ───────────────────────────

describe("hand_swap3 — 발동한 국에는 재사용 불가", () => {
  const doneKeyOf = (s: GameState): string =>
    `hand_swap3:done:${roundKey(s)}:p0`;

  function setup(): Game {
    const state = withAugment(
      craft({
        hands: {
          p0: "123m456m789m123p99p",
          p1: "111p222p333s44s55z",
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed: 3,
      }),
      "p0",
      "hand_swap3",
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    return game;
  }

  const triple = (ids: readonly TileId[], from = 0): TileId[] =>
    [...ids].sort((a, b) => a - b).slice(from, from + 3);

  /** 지정 → 넘길 3장 → 가져올 3장까지 한 번 완주 */
  function runFullSwap(game: Game): void {
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3",
        payload: { target: "p1" },
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: triple(handIdsOf(game.engine.state, "p0")) },
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_take",
        payload: { takes: triple(handIdsOf(game.engine.state, "p1")) },
      }).ok,
    ).toBe(true);
  }

  it("다단계는 중간에 끊기지 않고 끝까지 진행된다", () => {
    const game = setup();
    const before = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])];
    runFullSwap(game);
    const after = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])];
    expect(after).toHaveLength(before.length);
    expect(after).not.toEqual(before);
  });

  it("교환이 완료되면 국 단위 done 플래그가 선다", () => {
    const game = setup();
    expect(game.engine.state.augmentData[doneKeyOf(game.engine.state)]).toBe(
      undefined,
    );
    runFullSwap(game);
    expect(game.engine.state.augmentData[doneKeyOf(game.engine.state)]).toBe(
      true,
    );
  });

  it("게임 횟수(2회)가 남아 있어도 같은 국에는 다시 지정할 수 없다", () => {
    const game = setup();
    runFullSwap(game);
    // 게임당 2회 중 1회만 썼다 — 그래도 이 국에는 막힌다
    expect(game.engine.state.augmentData["hand_swap3:used:p0"]).toBe(1);

    const again = game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p2" },
    });
    expect(again.ok).toBe(false);
    expect(turnOptions(game).some((o) => o.type === "swap3")).toBe(false);
    expect(turnOptions(game).some((o) => o.type === "swap3_give")).toBe(false);
  });

  it("다음 국(키가 달라짐)에는 done이 만료되어 다시 지정할 수 있다", () => {
    const game = setup();
    runFullSwap(game);
    // 국이 넘어간 상황을 흉내낸다 — done 키에 roundKey가 섞여 자동 만료된다
    const s = game.engine.state;
    const nextRound: GameState = {
      ...s,
      round: { ...s.round, roundNumber: s.round.roundNumber + 1 },
    };
    expect(nextRound.augmentData[doneKeyOf(nextRound)]).toBeUndefined();
  });

  it("실게임 한 국 완주 (3시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(handSwap3, seed);
  });
});

// ─────────────────────────── 3. future_sight ───────────────────────────

describe("future_sight — 액티브 버튼을 눌러야 발동한다", () => {
  const armedKeyOf = (s: GameState): string =>
    `future_sight:armed:${roundKey(s)}:p0`;
  const GOT_KEY = roundViewKey("*", "future_sight:got:p0");
  const REVEAL_KEY = roundViewKey("*", "revealTiles:future");

  function setup(): Game {
    const state = withAugment(
      craft({
        hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed: 9,
      }),
      "p0",
      "future_sight",
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    return game;
  }

  it("턴 시작에는 future_arm만 뜬다 — 교환 프롬프트가 곧바로 뜨지 않는다", () => {
    const game = setup();
    const opts = turnOptions(game);
    expect(opts.some((o) => o.type === "future_arm")).toBe(true);
    expect(opts.some((o) => o.type === "future_exchange")).toBe(false);
  });

  it("무장 전 future_exchange는 거부된다", () => {
    const game = setup();
    const tileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "future_exchange",
      payload: { tileId },
    });
    expect(r.ok).toBe(false);
  });

  it("무장하면 그때 교환 후보 3장이 제시된다", () => {
    const game = setup();
    expect(
      game.engine.submit({ player: "p0", type: "future_arm", payload: {} }).ok,
    ).toBe(true);
    expect(game.engine.state.augmentData[armedKeyOf(game.engine.state)]).toBe(
      true,
    );

    const opts = turnOptions(game);
    const ex = opts.filter((o) => o.type === "future_exchange");
    expect(ex).toHaveLength(3);
    // 손패는 아직 전혀 움직이지 않았다 (무장은 선언일 뿐)
    expect(handIdsOf(game.engine.state, "p0")).toHaveLength(14);
    expect(opts.some((o) => o.type === "future_arm")).toBe(false);
  });

  it("교환하면 가져온 3장이 전원 공개 채널에 실리고 무장이 풀린다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "future_arm", payload: {} });
    const opt = turnOptions(game).find((o) => o.type === "future_exchange")!;

    const r = game.engine.submit({
      player: "p0",
      type: "future_exchange",
      payload: opt.payload as { tileId: TileId },
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    const got = s.augmentData[GOT_KEY] as TileId[];
    expect(got).toHaveLength(3);
    // 들어온 3장은 실제로 내 손패에 있다
    const hand = handIdsOf(s, "p0");
    for (const id of got) expect(hand).toContain(id);
    // 같은 tileId가 revealTiles 채널에도 실려 상대 화면에서 진짜 패로 그려진다
    for (const id of got) {
      expect(s.augmentData[REVEAL_KEY] as TileId[]).toContain(id);
    }
    const other = buildPlayerView(s, "p1", game.engine.rules);
    for (const id of got) expect(other.tiles[id]).toBeDefined();
    // 교환이 끝나면 무장이 내려간다
    expect(s.augmentData[armedKeyOf(s)]).toBe(false);
  });

  it("무장만 하고 그냥 버리면 무장이 풀린다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "future_arm", payload: {} });
    const toss = handIdsOf(game.engine.state, "p0")[0] as TileId;
    expect(
      game.engine.submit({
        player: "p0",
        type: "discard",
        payload: { tileId: toss },
      }).ok,
    ).toBe(true);
    expect(game.engine.state.augmentData[armedKeyOf(game.engine.state)]).toBe(
      false,
    );
  });

  it("실게임 한 국 완주 (3시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(futureSight, seed);
  });
});

// ─────────────────────────── 4. jackpot ───────────────────────────

describe("jackpot — 룰렛에 0.5배가 추가됐다", () => {
  const multKeyOf = (s: GameState): string =>
    `jackpot:mult:${roundKey(s)}:p0`;

  function setup(seed?: number): Game {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      ...(seed !== undefined ? { seed } : {}),
    });
    const game = createStandardGameFromState(withAugment(base, "p0", "jackpot"));
    installAugment(game.engine, jackpot, "p0");
    return game;
  }

  it("뽑히는 배수는 0.5·1·2·3 네 칸뿐이다", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const game = setup(seed);
      expect(
        game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} })
          .ok,
      ).toBe(true);
      const s = game.engine.state;
      seen.add(s.augmentData[multKeyOf(s)] as number);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0.5, 1, 2, 3]);
  });

  it("0.5배가 뽑히면 뷰 채널에 \"0.5배\"로 표시된다", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = setup(seed);
      game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} });
      const s = game.engine.state;
      if (s.augmentData[multKeyOf(s)] !== 0.5) continue;
      expect(s.augmentData["view:*:jackpot:p0#round"]).toBe("0.5배");
      return;
    }
    throw new Error("0.5배가 한 번도 뽑히지 않았다");
  });

  it("0.5배는 획득 점수를 절반으로 (반올림) 만든다", () => {
    const baseline = createStandardGameFromState(craftTanyaoTsumo());
    runTsumoWin(baseline);
    const baseGain = lastSettled(baseline).deltas["p0"] ?? 0;
    expect(baseGain).toBeGreaterThan(0);

    const raw = withAugment(craftTanyaoTsumo(), "p0", "jackpot");
    const seeded: GameState = {
      ...raw,
      augmentData: { ...raw.augmentData, [multKeyOf(raw)]: 0.5 },
    };
    const game = createStandardGameFromState(seeded);
    installAugment(game.engine, jackpot, "p0");
    runTsumoWin(game);
    expect(lastSettled(game).deltas["p0"]).toBe(Math.round(baseGain * 0.5));
  });

  it("0.5배여도 잃는 국(음수 델타)에는 적용되지 않는다 — 무페널티", () => {
    // p1 쯔모 화료로 p0이 지불하는 국
    const raw = withAugment(
      craft({
        hands: { p0: "*", p1: "234m345p456s678s22s", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      "p0",
      "jackpot",
    );
    const seeded: GameState = {
      ...raw,
      augmentData: { ...raw.augmentData, [multKeyOf(raw)]: 0.5 },
    };
    const baseline = createStandardGameFromState(structuredClone(raw));
    const game = createStandardGameFromState(structuredClone(seeded));
    installAugment(game.engine, jackpot, "p0");

    const winFor = (g: Game): void => {
      const flow = new FlowController(g.engine);
      const status = flow.begin();
      if (status.kind !== "awaiting") throw new Error("expected awaiting");
      const prompt = status.prompts.find((p) => p.player === "p1");
      const win = prompt?.options.find((o) => o.type === "win");
      if (win === undefined) throw new Error("no win option for p1");
      flow.submit("p1", win);
    };
    winFor(baseline);
    winFor(game);

    const paid = lastSettled(baseline).deltas["p0"] ?? 0;
    expect(paid).toBeLessThan(0);
    expect(lastSettled(game).deltas["p0"]).toBe(paid);
  });

  it("국당 1회 — 0.5배가 나와도 다시 굴릴 수 없다", () => {
    const game = setup(1);
    expect(
      game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} }).ok,
    ).toBe(false);
  });

  it("실게임 한 국 완주 (3시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(jackpot, seed);
  });
});

// ─────────────────────────── 5. red_five_touch ───────────────────────────

describe("red_five_touch — 내가 만든 적도라에는 소유자가 각인된다", () => {
  function setup(): Game {
    const state = withAugment(
      craft({
        hands: { p0: "333m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed: 4,
      }),
      "p0",
      "red_five_touch",
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    return game;
  }

  it("attrs에 red와 함께 redFor=보유자 id가 박힌다", () => {
    const game = setup();
    const before = handIdsOf(game.engine.state, "p0").filter((id) => {
      const kind = kindOf(game.engine.state, id);
      return isNumberSuit(kind) && kind.rank === 3;
    });
    expect(before.length).toBeGreaterThan(0);

    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 3 },
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    for (const id of before) {
      const attrs = s.tiles[id]?.attrs as
        | { red?: boolean; redFor?: PlayerId }
        | undefined;
      expect(attrs?.red).toBe(true);
      expect(attrs?.redFor).toBe("p0");
    }
    // 물들이지 않은 패에는 각인이 없다
    const untouched = handIdsOf(s, "p0").find((id) => !before.includes(id));
    expect(
      (s.tiles[untouched as TileId]?.attrs as { redFor?: PlayerId } | undefined)
        ?.redFor,
    ).toBeUndefined();
  });

  it("실게임 한 국 완주 (3시드)", () => {
    for (const seed of [1, 7, 42]) playOneRound(redFiveTouch, seed);
  });
});
