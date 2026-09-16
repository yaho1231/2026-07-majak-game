/**
 * 선언 상태형 카드 — **무장해제되면 전원 공개 배너도 함께 내린다** (docs/55 §2-2 C-4, 2026-09-16).
 *
 * 코어의 무장해제 게이트(`isSourceDisarmed`)는 Modifier·Interceptor·Reaction·액티브
 * 버튼만 건너뛴다. **이미 `augmentData`에 실린 `view:*:` 값**은 건드리지 못한다. 그래서
 * "선언하면 그 국 내내 유효"인 증강은 잠긴 뒤에도 배너가 남아 **효과는 꺼졌는데
 * 화면은 켜져 있다**고 말했다 — 2026-08-23 synergy3 disrupt 확정 4가 천하무적·불가침·
 * 봉인술에 `clearViewOnDisarm`으로 고친 결함인데, 같은 구조의 형제 카드에는 옮겨지지
 * 않았다(조커·모양 규칙 3종·반전·모 아니면 도·핏빛 계약·일확천금·잔상·오픈 리치).
 *
 * 판단 기준은 «배너가 약속하는 효과가 무장해제로 꺼지는가»다. 꺼지면 배너도 내린다.
 * 반대로 «이미 일어난 사실»(만개·도굴·파혼 …)의 배너는 잠겨도 참이므로 대상이 아니다 —
 * 아래 §정적 스캔의 예외 표가 그 목록이고, 표 밖의 새 위반은 스캔이 잡는다.
 *
 * 각 장면은 **선언 → 상대가 disarm 으로 지목 → 제3자 뷰에 채널 없음 + 실제 효과 꺼짐**을
 * 한 번에 본다. 효과 확인은 각 카드의 기존 테스트에서 «효과 확인» 장면을 빌려 왔다.
 * 되돌리면(각 파일의 `clearViewOnDisarm` 한 줄을 지우면) «채널 없음» 쪽이 실패한다.
 *
 * §6은 A-5가 «같은 결함 — 아직 안 고쳤다»로 남겨 둔 잔여 4종(밀실의 도라·밑장빼기·
 * 거울·리치 봉인)을 A-9에서 같은 규약으로 고친 장면이다(docs/55 A-9). 거울은 "*"
 * 동기화 리액션이 통보 연쇄 안에서 비운 채널을 도로 채우는 함정이 있어, 그 장면이
 * 곧 그 가드의 회귀 테스트다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildPlayerView,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  scoringOptionsOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { craft } from "./helpers.js";
import { contentAugments } from "../src/index.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

// ───────────────────────── 공용 하네스 (disrupt_synergy_0823 와 같은 모양) ─────────────────────────

function defOf(id: string): AugmentDef {
  const d = contentAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`unknown augment ${id}`);
  return d;
}

/** map: 좌석 → 증강 id 목록. 카탈로그에서 def를 찾아 전부 install 한다. */
function setup(state: GameState, map: Partial<Record<PlayerId, string[]>>) {
  const withA: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, augments: [...(map[p.id] ?? [])] })),
  };
  const game = createStandardGameFromState(withA);
  for (const [pid, ids] of Object.entries(map)) {
    for (const id of ids ?? []) {
      installAugment(game.engine, defOf(id), pid as PlayerId, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  return game;
}

type Game = ReturnType<typeof setup>;

function submit(game: Game, player: PlayerId, type: string, payload: unknown = {}): void {
  const res = game.engine.submit({ player, type, payload } as never);
  if (!res.ok) throw new Error(`${type} rejected: ${res.reason}`);
}

/** 엔진 상태의 round 필드를 직접 갈아 끼운다 (턴 이동만 필요할 때) */
function patch(game: Game, round: Partial<GameState["round"]>): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, ...round },
  };
}

function viewOf(game: Game, viewer: PlayerId) {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules, {
    yaku: game.yaku,
  });
}

/** viewer 의 augmentView 채널 중 needle 을 포함하는 것들 */
function banners(game: Game, viewer: PlayerId, needle: string): Record<string, unknown> {
  const av = (viewOf(game, viewer).augmentView ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(av).filter(([k]) => k.includes(needle)));
}

function lastSettled(game: Game): RoundSettledPayload {
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function hand(game: Game, p: PlayerId): TileId[] {
  return [...(game.engine.state.zones[handZone(p)]?.tileIds ?? [])];
}

function handTilesOfKind(game: Game, p: PlayerId, key: string): TileId[] {
  const st = game.engine.state;
  return hand(game, p).filter((id) => kindKey(kindOf(st, id)) === key);
}

/** p0(disarm)이 p1의 `id`를 잠근다 — 자기 순이어야 하므로 턴을 옮겨 두고 누른다 */
function disarmP1(game: Game, id: string): void {
  patch(game, { phase: "turn.act", turnSeat: 0 });
  submit(game, "p0", "disarm_lock", { target: "p1", augmentId: id });
}

/**
 * `who`가 지금 손(14장 · 쯔모패 = 손의 마지막 장)으로 쯔모 화료해 국을 끝낸다.
 * 정산은 FlowController가 하므로(코어 `WIN_DECLARED`는 항등 리듀서) 그 시점에 세운다 —
 * 무장해제 게이트를 **실제 정산 경로**에서 통과시키기 위해서다(인터셉터 목록을 직접
 * 돌리는 픽스처는 게이트를 안 탄다).
 */
function tsumoWin(game: Game, who: PlayerId): RoundSettledPayload {
  const h = hand(game, who);
  const seat = game.engine.state.players.find((p) => p.id === who)!.seat;
  patch(game, { phase: "turn.act", turnSeat: seat, lastDrawnTile: h[h.length - 1]! });
  const flow = new FlowController(game.engine);
  const st = flow.begin();
  if (st.kind !== "awaiting") throw new Error(`expected awaiting, got ${st.kind}`);
  const done = flow.submit(who, { type: "win", payload: {} });
  if (done.kind !== "roundOver") throw new Error(`expected roundOver, got ${done.kind}`);
  return lastSettled(game);
}

/** 멘젠 쯔모 + 탕야오가 붙는 14장 (마지막 장이 쯔모패) */
const TANYAO_14 = "234m567m234p678s55p";

// ═══════════════ 1. 규칙 모디파이어형 — 조커·모양 규칙 3종·잔상 ═══════════════

describe("조커 — 잠기면 «백이 조커» 배너와 만능패가 함께 꺼진다", () => {
  // 111m 999m 55m 23s 白 23p — 백이 조커일 때만 14삭·14통 대기 (joker.test 의 손)
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: "111999m55m23s23p5z", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
      }),
      { p0: ["disarm"], p1: ["joker"] },
    );
    submit(g, "p1", "joker_call", {});
    if (disarmIt) disarmP1(g, "joker");
    return g;
  };
  const wild = (g: Game): string[] =>
    (scoringOptionsOf(g.engine.state, g.engine.rules, "p1").wildKinds ?? []).map(kindKey);

  it("대조군 — 발동하면 제3자에게 배너가 서고 백이 만능패다", () => {
    const g = build(false);
    expect(banners(g, "p2", "joker")["joker:p1"]).toBe(true);
    expect(wild(g)).toEqual(["dragon1"]);
  });

  it("잠기면 채널이 통째로 사라지고 백은 그냥 백이다", () => {
    const g = build(true);
    expect(wild(g)).toEqual([]);
    expect(banners(g, "p2", "joker")).toEqual({});
  });
});

describe.each([
  { id: "mixed_triplet", action: "declare_mixed_triplet", option: "mixedTriplets" },
  { id: "broken_border", action: "declare_broken_border", option: "mixedRuns" },
  { id: "async_chiitoi", action: "declare_async_chiitoi", option: "chiitoiMixedPairs" },
] as const)("$id — 잠기면 «이번 국 규칙» 배너와 규칙이 함께 꺼진다", ({ id, action, option }) => {
  // 국의 첫 순(p1 버림 0장)에만 선언할 수 있다
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: "123m456p789s11z2z", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: [id] },
    );
    submit(g, "p1", action, {});
    if (disarmIt) disarmP1(g, id);
    return g;
  };
  const ruleOn = (g: Game): boolean =>
    scoringOptionsOf(g.engine.state, g.engine.rules, "p1")[option] === true;

  it("대조군 — 선언하면 배너가 서고 규칙이 켜진다", () => {
    const g = build(false);
    expect(banners(g, "p2", id)[`${id}:p1`]).toBe(true);
    expect(ruleOn(g)).toBe(true);
  });

  it("잠기면 채널이 사라지고 규칙은 표준으로 돌아간다", () => {
    const g = build(true);
    expect(ruleOn(g)).toBe(false);
    expect(banners(g, "p2", id)).toEqual({});
  });
});

describe("잔상 — 잠기면 «되살아난 도라» 배너와 개인 도라가 함께 꺼진다", () => {
  const PREV: TileKind = { suit: "pin", rank: 5 };
  const build = (disarmIt: boolean): Game => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    // 직전 국의 도라 — 매 국 정산 리액션이 적어 두는 자리를 그대로 심는다
    const g = setup(
      { ...base, augmentData: { ...base.augmentData, "dora_afterimage:prevDora": [PREV] } },
      { p0: ["disarm"], p1: ["dora_afterimage"] },
    );
    submit(g, "p1", "dora_recall", {});
    if (disarmIt) disarmP1(g, "dora_afterimage");
    return g;
  };
  const extraDora = (g: Game): string[] =>
    g.engine.rules
      .resolve<readonly TileKind[]>("scoring.extraDoraKinds", {
        playerId: "p1",
        state: g.engine.state,
      })
      .map(kindKey);

  it("대조군 — 발동하면 배너가 서고 지난 국 도라가 내 도라다", () => {
    const g = build(false);
    expect(banners(g, "p2", "dora_afterimage")["dora_afterimage:p1"]).toEqual(["pin5"]);
    expect(extraDora(g)).toEqual(["pin5"]);
  });

  it("잠기면 채널이 사라지고 그 도라는 값하지 않는다", () => {
    const g = build(true);
    expect(extraDora(g)).toEqual([]);
    expect(banners(g, "p2", "dora_afterimage")).toEqual({});
  });
});

// ═══════════════ 2. 정산 인터셉터형 — 반전·핏빛 계약·일확천금·모 아니면 도 ═══════════════

describe("반전 — 잠기면 «부호 반전» 배너와 정산 뒤집기가 함께 꺼진다", () => {
  /** p1이 자기 첫 순에 반전을 켜고(선택), p0이 잠그고(선택), p1이 쯔모 화료한다 */
  const run = (opts: { arm: boolean; disarmIt: boolean }): { g: Game; p: RoundSettledPayload } => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["sign_flip"] },
    );
    if (opts.arm) submit(g, "p1", "sign_flip_use", {});
    if (opts.disarmIt) disarmP1(g, "sign_flip");
    const p = tsumoWin(g, "p1");
    return { g, p };
  };

  it("대조군 — 켜면 배너가 서고 화료 델타가 음수로 뒤집힌다", () => {
    const vanilla = run({ arm: false, disarmIt: false }).p;
    const g = setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["sign_flip"] },
    );
    submit(g, "p1", "sign_flip_use", {});
    expect(banners(g, "p2", "sign_flip")["sign_flip:p1"]).toBe(true);
    const armed = run({ arm: true, disarmIt: false }).p;
    expect(vanilla.deltas["p1"]).toBeGreaterThan(0);
    expect(armed.deltas["p1"]).toBe(-(vanilla.deltas["p1"] ?? 0));
  });

  it("잠기면 채널이 사라지고 정산 부호는 정상이다", () => {
    const vanilla = run({ arm: false, disarmIt: false }).p;
    // 배너는 정산 **전**에 봐야 한다 — 국 스코프 채널은 정산 뒤 어차피 지워진다
    const g = setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["sign_flip"] },
    );
    submit(g, "p1", "sign_flip_use", {});
    disarmP1(g, "sign_flip");
    expect(banners(g, "p2", "sign_flip")).toEqual({});
    const locked = run({ arm: true, disarmIt: true }).p;
    expect(locked.deltas["p1"]).toBe(vanilla.deltas["p1"]);
  });
});

describe("핏빛 계약 — 잠기면 계약 배지와 1.5배가 함께 꺼진다", () => {
  const build = (): Game =>
    setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["blood_contract"] },
    );

  it("대조군 — 계약하면 배지가 서고 탕야오 화료가 1.5배다", () => {
    const vanilla = tsumoWin(build(), "p1");
    const g = build();
    submit(g, "p1", "blood_contract_declare", { yaku: "tanyao" });
    expect(banners(g, "p2", "blood_contract")["blood_contract:p1"]).toBe("tanyao");
    const armed = tsumoWin(g, "p1");
    expect(armed.deltas["p1"]).toBeGreaterThan(vanilla.deltas["p1"] ?? 0);
  });

  it("잠기면 채널이 사라지고 배수는 붙지 않는다", () => {
    const vanilla = tsumoWin(build(), "p1");
    const g = build();
    submit(g, "p1", "blood_contract_declare", { yaku: "tanyao" });
    disarmP1(g, "blood_contract");
    expect(banners(g, "p2", "blood_contract")).toEqual({});
    const locked = tsumoWin(g, "p1");
    expect(locked.deltas["p1"]).toBe(vanilla.deltas["p1"]);
  });
});

describe("일확천금 — 잠기면 «이번 국 N배» 배너와 배수가 함께 꺼진다", () => {
  const build = (seed: number): Game =>
    setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
        seed,
      }),
      { p0: ["disarm"], p1: ["jackpot"] },
    );
  const multOf = (g: Game): number =>
    g.engine.state.augmentData[roundScopedKey("jackpot", "mult", g.engine.state, "p1")] as number;

  /**
   * 룰렛은 시드에 결정적이다 — 1배가 뽑히면 «배수 미적용»을 구분할 수 없으므로
   * **3배가 나오는 시드**를 고른다(첫 시드가 그렇지 않을 수 있어 앞에서부터 찾는다).
   */
  function seedWithTriple(): number {
    for (let seed = 1; seed < 200; seed++) {
      const g = build(seed);
      submit(g, "p1", "jackpot_roll", {});
      if (multOf(g) === 3) return seed;
    }
    throw new Error("no seed rolls 3x within 200 tries");
  }
  const SEED = seedWithTriple();

  it("대조군 — 굴리면 «3배» 배너가 서고 화료 델타가 불어난다", () => {
    const vanilla = tsumoWin(build(SEED), "p1");
    const g = build(SEED);
    submit(g, "p1", "jackpot_roll", {});
    expect(multOf(g)).toBe(3);
    expect(banners(g, "p2", "jackpot")["jackpot:p1"]).toBe("3배");
    const armed = tsumoWin(g, "p1");
    expect(armed.deltas["p1"]).toBeGreaterThan(vanilla.deltas["p1"] ?? 0);
  });

  it("잠기면 채널이 사라지고 배수는 걸리지 않는다", () => {
    const vanilla = tsumoWin(build(SEED), "p1");
    const g = build(SEED);
    submit(g, "p1", "jackpot_roll", {});
    disarmP1(g, "jackpot");
    expect(banners(g, "p2", "jackpot")).toEqual({});
    const locked = tsumoWin(g, "p1");
    expect(locked.deltas["p1"]).toBe(vanilla.deltas["p1"]);
  });
});

describe("모 아니면 도 — 잠기면 «올인» 배너와 판돈 정산이 함께 꺼진다", () => {
  const ALL_IN = 12000; // 25,000 의 절반을 1,000 단위 내림
  /**
   * p1이 리치를 걸고(1s 단기 — 올인 리치 또는 대조용 표준 리치), p0이 잠그고(선택),
   * **p0이** 쯔모 화료한다 — 타가 화료면 판돈 절반(6,000)이 뱅크로 넘어가는 것이
   * 이 카드의 벌칙이다.
   */
  const build = (riichi: "all_in_riichi" | "riichi", disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: TANYAO_14, p1: "123m456m789m123p11s", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["all_or_nothing"] },
    );
    submit(g, "p1", riichi, { tileId: handTilesOfKind(g, "p1", "sou1")[0]! });
    if (disarmIt) disarmP1(g, "all_or_nothing");
    return g;
  };

  it("대조군 — 걸면 «올인 12,000» 배너가 서고 타가 화료에 6,000을 잃는다", () => {
    const g = build("all_in_riichi", false);
    expect(banners(g, "p2", "all_or_nothing")["all_or_nothing:p1"]).toBe(ALL_IN);
    const armed = tsumoWin(g, "p0");
    const vanilla = tsumoWin(build("riichi", false), "p0");
    expect(armed.deltas["p1"]).toBe((vanilla.deltas["p1"] ?? 0) - ALL_IN / 2);
  });

  it("잠기면 채널이 사라지고 판돈은 잃지 않는다 (리치 자체는 그대로다)", () => {
    const g = build("all_in_riichi", true);
    expect(g.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    expect(banners(g, "p2", "all_or_nothing")).toEqual({});
    const locked = tsumoWin(g, "p0");
    // 판돈 벌칙이 없으면 같은 패로 표준 리치를 건 것과 정확히 같은 정산이다
    const vanilla = tsumoWin(build("riichi", false), "p0");
    expect(locked.deltas["p1"]).toBe(vanilla.deltas["p1"]);
    expect(locked.augPoints?.some((n) => n.augId === "all_or_nothing") ?? false).toBe(false);
  });
});

// ═══════════════ 3. 오픈 리치 — 손패 공개·직격 역만이 꺼지면 오름패 배지도 내린다 ═══════════════

describe("오픈 리치 — 잠기면 오름패 배지와 손패 공개가 함께 꺼진다", () => {
  // 5s 하나를 버리면 2s/5s/8s 대기 (open_riichi.test 의 손)
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: "234m345p345s678s55s", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["open_riichi_reveal"] },
    );
    submit(g, "p1", "open_riichi", { tileId: handTilesOfKind(g, "p1", "sou5")[0]! });
    if (disarmIt) disarmP1(g, "open_riichi_reveal");
    return g;
  };
  const p1HandSeenBy = (g: Game, viewer: PlayerId) => viewOf(g, viewer).zones[handZone("p1")]!;

  it("대조군 — 선언하면 오름패 배지가 서고 손패 13장이 전원에게 보인다", () => {
    const g = build(false);
    expect(new Set(banners(g, "p2", "open_riichi_reveal")["open_riichi_reveal:p1"] as string[]))
      .toEqual(new Set(["sou2", "sou5", "sou8"]));
    expect(p1HandSeenBy(g, "p2").tileIds.length).toBe(13);
  });

  it("잠기면 채널이 사라지고 손패는 다시 가려진다 (리치·공탁은 그대로)", () => {
    const g = build(true);
    expect(g.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    expect(g.engine.state.round.riichiPot).toBe(1000);
    const seen = p1HandSeenBy(g, "p2");
    expect(seen.tileIds.length).toBe(0);
    expect(seen.hiddenCount).toBeGreaterThan(0);
    expect(banners(g, "p2", "open_riichi_reveal")).toEqual({});
  });
});

// ═══════════════ 4. 스파이 — 예외 표의 근거: 적발 배너는 정산에서만 서고 효과와 함께 게이트된다 ═══════════════

describe("스파이 — 적발 배너는 «이미 훔친 사실»이라 지울 채널이 없다 (예외 표 근거)", () => {
  /**
   * p0(스파이)이 3m을 찍어 두고, p2(disarm)가 잠근 뒤(선택), p1이 3m 단기 쯔모로 화료한다.
   * 훔치기(정산 인터셉터)와 적발 배너(정산 리액션)는 **같은 정산에서 함께** 게이트되므로
   * 국 중 무장해제와 배너가 겹칠 창이 없다 — 그래서 `clearViewOnDisarm` 대상이 아니다.
   */
  const MAN3 = kindKey({ suit: "man", rank: 3 });
  const run = (disarmIt: boolean): { g: Game; p: RoundSettledPayload } => {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m123p3m3m", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const g = setup(
      { ...base, augmentData: { ...base.augmentData, "spy:mark:p0": MAN3 } },
      { p0: ["spy"], p2: ["disarm"] },
    );
    if (disarmIt) {
      patch(g, { phase: "turn.act", turnSeat: 2 });
      submit(g, "p2", "disarm_lock", { target: "p0", augmentId: "spy" });
    }
    const p = tsumoWin(g, "p1");
    return { g, p };
  };

  it("대조군 — 찍힌 패로 화료하면 이득이 스파이에게 가고 적발 배너가 선다", () => {
    const { g, p } = run(false);
    expect(p.deltas["p0"]).toBeGreaterThan(0);
    expect(p.deltas["p1"]).toBe(0);
    expect(banners(g, "p3", "spy")["spy:caught:p0"]).toBe(MAN3);
  });

  it("잠기면 훔치지도 않고 배너도 서지 않는다 — 배너와 효과가 같은 문으로 꺼진다", () => {
    const { g, p } = run(true);
    expect(p.deltas["p0"]).toBeLessThan(0);
    expect(p.deltas["p1"]).toBeGreaterThan(0);
    expect(banners(g, "p3", "spy")).toEqual({});
  });
});

// ═══════════════ 6. A-9 잔여 4종 — 밀실의 도라·밑장빼기·거울·리치 봉인 ═══════════════

describe("밀실의 도라 — 잠기면 안깡 도라 뱃지와 +4판이 함께 꺼진다", () => {
  // 1m 넉 장을 안깡 — 쯔모한 순(drawnLastFor)이어야 깡을 칠 수 있다
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: "1111m234p567s78m55p", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["ankan_dora"] },
    );
    submit(g, "p1", "ankan", { tileIds: handTilesOfKind(g, "p1", "man1") });
    if (disarmIt) disarmP1(g, "ankan_dora");
    return g;
  };
  const extraHan = (g: Game): number =>
    g.engine.rules.resolve<number>("score.extraHan", { playerId: "p1", state: g.engine.state });

  it("대조군 — 깡치면 제3자에게 도라 뱃지가 서고 +4판이다", () => {
    const g = build(false);
    const badge = banners(g, "p2", "ankan_dora")["ankan_dora:p1"] as { kinds: string[] };
    expect(badge.kinds).toEqual(["man1"]);
    expect(extraHan(g)).toBe(4);
  });

  it("잠기면 채널이 사라지고 판은 붙지 않는다 (깡 자체는 그대로다)", () => {
    const g = build(true);
    expect(g.engine.state.round.byPlayer["p1"]?.melds.length).toBe(1);
    expect(extraHan(g)).toBe(0);
    expect(banners(g, "p2", "ankan_dora")).toEqual({});
  });
});

describe("밑장빼기 — 잠기면 «밑장 예약 중» 표시와 밑장 쯔모가 함께 꺼진다", () => {
  // p1이 13장으로 자기 순에 예약만 걸어 둔다(버림은 필요 없다 — validate는 손 장수를 안 본다)
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 1 }),
      { p0: ["disarm"], p1: ["bottom_deal"] },
    );
    submit(g, "p1", "bottom_deal", {});
    if (disarmIt) disarmP1(g, "bottom_deal");
    return g;
  };
  /** p1의 다음 쯔모를 실제로 돌려(turn.draw → FlowController) 어느 자리에서 뽑혔는지 본다 */
  const drawFor = (g: Game): { drawn: TileId; top: TileId; bottom: TileId } => {
    const wall = g.engine.state.zones[WALL]!.tileIds;
    const top = wall[0]!;
    const bottom = wall[wall.length - 1]!;
    patch(g, { phase: "turn.draw", turnSeat: 1, lastDrawnTile: null });
    new FlowController(g.engine).begin();
    return { drawn: g.engine.state.round.lastDrawnTile!, top, bottom };
  };

  it("대조군 — 예약하면 전원·보유자 표시가 서고 다음 쯔모는 밑장이다", () => {
    const g = build(false);
    expect(banners(g, "p2", "bottom_deal")["bottom_deal:armed:p1"]).toBe(true);
    expect(viewOf(g, "p1").augmentView["bottom_deal:armed:p1"]).toBe(true);
    const { drawn, bottom } = drawFor(g);
    expect(drawn).toBe(bottom);
  });

  it("잠기면 두 표시가 사라지고 다음 쯔모는 그냥 위에서 나온다", () => {
    const g = build(true);
    expect(banners(g, "p2", "bottom_deal")).toEqual({});
    expect(viewOf(g, "p1").augmentView["bottom_deal:armed:p1"]).toBeUndefined();
    const { drawn, top } = drawFor(g);
    expect(drawn).toBe(top);
  });
});

describe("거울 — 잠기면 앞도라 채널과 개인 도라가 함께 꺼진다 (동기화 리액션이 도로 채우지 않는다)", () => {
  /**
   * 앞도라 채널은 "*" 리액션이 매 이벤트 동기화한다 — 설치 직후엔 아직 이벤트가 없어
   * p1이 한 장 버려 첫 동기화를 일으킨다. 그 뒤 p0이 잠근다.
   */
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: TANYAO_14, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["mirror_dora"] },
    );
    submit(g, "p1", "discard", { tileId: hand(g, "p1")[0]! });
    if (disarmIt) disarmP1(g, "mirror_dora");
    return g;
  };
  const extraDora = (g: Game): string[] =>
    g.engine.rules
      .resolve<readonly TileKind[]>("scoring.extraDoraKinds", {
        playerId: "p1",
        state: g.engine.state,
      })
      .map(kindKey);

  it("대조군 — 표시패의 앞 패가 채널에 실리고 내 도라다", () => {
    const g = build(false);
    const kinds = extraDora(g);
    expect(kinds.length).toBeGreaterThan(0);
    expect(banners(g, "p2", "mirror_dora")["mirror_dora:p1"]).toEqual(kinds);
  });

  it("잠기면 채널이 사라지고(연쇄 뒤에도) 앞도라는 값하지 않는다", () => {
    const g = build(true);
    expect(extraDora(g)).toEqual([]);
    expect(banners(g, "p2", "mirror_dora")).toEqual({});
    // 통보 연쇄가 끝난 뒤 다른 이벤트가 와도(이제는 게이트가 리액션을 끈다) 되살아나지 않는다
    patch(g, { phase: "turn.act", turnSeat: 0, lastDrawnTile: hand(g, "p0")[0]! });
    submit(g, "p0", "discard", { tileId: hand(g, "p0")[0]! });
    expect(banners(g, "p2", "mirror_dora")).toEqual({});
  });
});

describe("리치 봉인 — 잠기면 «봉인» 배너와 상대 리치 잠금이 함께 꺼진다", () => {
  // 1s 단기 — 국의 첫 리치를 p1이 건다
  const build = (disarmIt: boolean): Game => {
    const g = setup(
      craft({
        hands: { p0: "*", p1: "123m456m789m123p11s", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["disarm"], p1: ["riichi_seal"] },
    );
    submit(g, "p1", "riichi", { tileId: handTilesOfKind(g, "p1", "sou1")[0]! });
    if (disarmIt) disarmP1(g, "riichi_seal");
    return g;
  };
  const p2Blocked = (g: Game): boolean =>
    g.engine.rules.resolve<boolean>("riichi.blocked", { playerId: "p2", state: g.engine.state });

  it("대조군 — 첫 리치를 걸면 배너가 서고 상대의 리치가 잠긴다", () => {
    const g = build(false);
    expect(banners(g, "p2", "riichi_seal")["riichi_seal:p1"]).toBe("봉인");
    expect(p2Blocked(g)).toBe(true);
  });

  it("잠기면 채널이 사라지고 상대는 리치를 걸 수 있다 (내 리치는 그대로다)", () => {
    const g = build(true);
    expect(g.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    expect(p2Blocked(g)).toBe(false);
    expect(banners(g, "p2", "riichi_seal")).toEqual({});
  });
});

// ═══════════════ 5. 정적 스캔 — 새 위반은 여기서 잡힌다 ═══════════════

/**
 * «전원 공개 채널 + 규칙 모디파이어/정산 인터셉터/인터셉터»를 한 파일에 가진 증강은
 * `AUGMENT_DISARMED` 반응이나 `clearViewOnDisarm`이 있거나 아래 예외 표에 있어야 한다.
 *
 * 표는 **양방향**으로 고정한다 — 표에 있는 파일이 고쳐지면(반응이 생기면) 여기서
 * 빼라고 실패하고, 표 밖의 새 위반은 그대로 실패한다. 예외 사유를 한 줄씩 적는다.
 */
describe("정적 스캔 — 전원 공개 채널 × 효과 훅 = 무장해제 반응 필수", () => {
  const AUG_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/augments");
  const PUBLIC_CHANNEL = /roundViewKey\(\s*"\*"/;
  const EFFECT_HOOK = /\.addModifier\s*[<(]|settleInterceptor\(|ctx\.interceptor\(/;
  const HANDLED = /AUGMENT_DISARMED|clearViewOnDisarm/;

  /**
   * «이미 일어난 사실»의 배너 — 잠겨도 참이므로 남아도 거짓말이 아니다.
   * (물리 상태·이력이 이미 바뀌었고 무장해제는 그것을 되돌리지 않는다.)
   */
  const FACT_BANNERS: Record<string, string> = {
    cliff_bloom: "«만개» — 손이 이미 화료형으로 다시 피었다",
    die_hard: "부활 표식은 정산 Shield 단계에서 deltas에 실은 뒤 켠다 — 정산 시점에만 서고 그때 인터셉터와 함께 게이트된다",
    frame_up: "상대 바닥에 이미 심긴 패(누명)",
    giant_god: "«각성» — 바닥 13장과 손패가 이미 맞바뀌었다(되돌리기는 true_dragon 처럼 별개 과제)",
    grave_rob: "무덤에서 이미 꺼내 화료한 패",
    hourglass: "왕패 4장이 이미 패산으로 넘어왔고, 연장 중에는 보유자만 순이 있어 무장해제 창 자체가 없다",
    meld_dissolve: "이미 해체된 후로(파혼)",
    north_trader: "«北N장» — 후로 자리에 실제로 빼놓은 장수(도라 판은 모디파이어가 끄지만 장수 표시는 실물과 같다)",
    rinshan_preview: "이미 재배열된 영상패 순서",
    soul_strike: "폭주(연속 쯔모) 중에는 TURN_PASSED 가 보유자에게 고정돼 상대에게 무장해제할 순이 없다 — 선언이 곧 리치 버림이라 선언 직후 바로 폭주다",
    spy: "적발 배너는 정산 리액션에서만 서고(훔친 뒤의 사실) 같은 정산의 인터셉터와 함께 게이트된다 — 위 §4 장면이 근거",
    void_kan: "손패 1장이 이미 바뀌어 오름패가 됐다(컷인용 채널)",
  };

  // A-5가 «같은 결함 — 아직 안 고쳤다»로 남겨 뒀던 4종(ankan_dora·bottom_deal·
  // mirror_dora·riichi_seal)은 A-9에서 고쳐 §6 장면으로 옮겼다 — 이제 표에 없다.

  const files = readdirSync(AUG_DIR).filter((f) => f.endsWith(".ts"));

  it("스캔 대상은 실제로 존재한다 (정규식이 죽으면 스캔이 조용히 통과한다)", () => {
    const matched = files.filter((f) => {
      const src = readFileSync(join(AUG_DIR, f), "utf8");
      return PUBLIC_CHANNEL.test(src) && EFFECT_HOOK.test(src);
    });
    // 이 파일이 고친 9종 + 형제(천하무적·불가침·봉인술)는 반드시 잡혀야 한다
    for (const f of [
      "joker.ts", "shapeDeclare.ts", "sign_flip.ts", "all_or_nothing.ts", "blood_contract.ts",
      "jackpot.ts", "dora_afterimage.ts", "open_riichi_reveal.ts",
      "invincible.ts", "no_ron_pact.ts", "call_seal.ts",
    ]) {
      expect(matched, `${f} 가 스캔에 안 잡힌다 — 정규식을 확인하라`).toContain(f);
    }
  });

  it("무장해제 반응이 없는 파일 = 예외 표 (양방향)", () => {
    const missing = files
      .filter((f) => {
        const src = readFileSync(join(AUG_DIR, f), "utf8");
        return PUBLIC_CHANNEL.test(src) && EFFECT_HOOK.test(src) && !HANDLED.test(src);
      })
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    const listed = Object.keys(FACT_BANNERS).sort();

    const newOffenders = missing.filter((id) => !listed.includes(id));
    expect(
      newOffenders,
      "전원 공개 채널을 싣는데 무장해제에 안 내리는 새 증강 — clearViewOnDisarm 을 달거나 사유를 적어 예외 표에 넣어라",
    ).toEqual([]);

    const stale = listed.filter((id) => !missing.includes(id));
    expect(
      stale,
      "예외 표에 있는데 이제 스캔에 안 잡힌다(고쳐졌거나 채널이 사라졌다) — 표에서 빼라",
    ).toEqual([]);
  });

  it("고친 9종 + A-9 4종은 전부 clearViewOnDisarm 을 쓴다 (되돌리면 여기서 실패)", () => {
    for (const f of [
      "joker.ts", "shapeDeclare.ts", "sign_flip.ts", "all_or_nothing.ts", "blood_contract.ts",
      "jackpot.ts", "dora_afterimage.ts", "open_riichi_reveal.ts",
      "ankan_dora.ts", "bottom_deal.ts", "mirror_dora.ts", "riichi_seal.ts",
    ]) {
      const src = readFileSync(join(AUG_DIR, f), "utf8");
      expect(/clearViewOnDisarm\(/.test(src), `${f} 에 clearViewOnDisarm 이 없다`).toBe(true);
    }
  });
});
