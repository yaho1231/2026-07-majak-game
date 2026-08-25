/**
 * 52차 신규 증강 그룹 B 동작 테스트.
 *
 * - silent_swap (정적의 손): 리치 0인 국에서만, 네 명 전원의 바닥에서 1장 회수 + 화료 시 +2판
 * - ankan_dora (밀실의 도라): 안깡 1묶음(깡친 네 장)당 score.extraHan +4 (리치 무관)
 * - foresight (예지): 패산 앞 4장 재배열(23개 순열) + 4순 쿨다운 + 화료 시 +2판
 * - rank_gate (격): 국 첫 순에 상대 1명 지목 → 그 사람의 win.minHan = 5
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildPlayerView,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft, hanBonusPoints } from "./helpers.js";
import { silentSwap } from "../src/augments/silent_swap.js";
import { ankanDora } from "../src/augments/ankan_dora.js";
import { foresight } from "../src/augments/foresight.js";
import { rankGate } from "../src/augments/rank_gate.js";

// ─────────────────────────── 공용 하네스 ───────────────────────────

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

function start(state: GameState, aug: AugmentDef, holder: PlayerId = "p0") {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, aug, holder, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === holder);
  if (prompt === undefined) throw new Error(`no prompt for ${holder}`);
  return { game, flow, prompt };
}

/** 마지막 RoundSettled 페이로드 */
function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

const optionsOf = (
  prompt: { options: readonly ActionOption[] },
  type: string,
): ActionOption[] => prompt.options.filter((o) => o.type === type);

// ─────────────────────────── 크래시 스위프 ───────────────────────────
// (new_batch_sweep.test.ts의 playOneRound를 이 파일에 복사해 사용 — 원본은 수정하지 않는다)

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
  // 보유 검사(player.augments)가 있는 증강이므로 실제로 보유시킨다
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

// ─────────────────────────── silent_swap ───────────────────────────

/** p0은 3만 단기 대기(13장) + 쯔모패 9통. p1 바닥에 3만이 묻혀 있다. */
function silentScene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1z", p1: "3m2z3z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["silent_swap"]);
}

describe("silent_swap (정적의 손)", () => {
  // 2026-08-20 사용자 확정: 정적의 손은 **상대 셋의 바닥에서만** 줍는다.
  // 내 바닥이 대상이던 시절에는 "방금 버린 내 오름패를 도로 집어 후리텐 화료"가
  // 가장 쉬운 사용법이었다(QA hand-a 확정 2).
  it("상대 세 명의 바닥만 후보로 낸다 (내 바닥은 제외)", () => {
    const state = silentScene();
    const { prompt } = start(state, silentSwap);
    const takes = optionsOf(prompt, "silent_take");
    const oppTotal = state.players.reduce(
      (n, p) =>
        p.id === "p0" ? n : n + (state.zones[discardsZone(p.id)]?.tileIds.length ?? 0),
      0,
    );
    expect(oppTotal).toBe(3 + 1 + 1);
    expect(takes).toHaveLength(oppTotal);
    // 내 바닥의 패는 후보에 없다
    const mine = state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
    expect(takes.some((o) => (o.payload as { tileId: TileId }).tileId === mine)).toBe(
      false,
    );
  });

  it("리치가 걸린 국에서는 발동하지 않는다", () => {
    const base = silentScene();
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p2: {
            ...base.round.byPlayer.p2!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    const { prompt } = start(state, silentSwap);
    expect(optionsOf(prompt, "silent_take")).toHaveLength(0);
  });

  it("바닥의 패를 손으로 가져오되 손패 장수·후리텐 이력은 보존된다", () => {
    const state = silentScene();
    const target = state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    expect(kindKey(kindOf(state, target))).toBe("man3");
    const { game, flow } = start(state, silentSwap);
    const handBefore = game.engine.state.zones[handZone("p0")]?.tileIds.length ?? 0;
    const wallBefore = game.engine.state.zones[WALL]?.tileIds.length ?? 0;
    const drawn = game.engine.state.round.lastDrawnTile as TileId;

    flow.submit("p0", { type: "silent_take", payload: { tileId: target } });
    const after = game.engine.state;

    expect(after.zones[handZone("p0")]?.tileIds).toContain(target);
    expect(after.zones[handZone("p0")]?.tileIds).toHaveLength(handBefore);
    expect(after.zones[discardsZone("p1")]?.tileIds).not.toContain(target);
    // 쯔모패는 패산 맨 밑으로 (바닥 → 손 만큼 패산이 1장 늘어난다)
    expect(after.zones[WALL]?.tileIds).toHaveLength(wallBefore + 1);
    expect(after.zones[WALL]?.tileIds.at(-1)).toBe(drawn);
    expect(after.round.lastDrawnTile).toBe(target);
    // 후리텐 이력(discardedKinds)은 절대 건드리지 않는다
    expect(after.round.byPlayer.p1?.discardedKinds).toEqual([
      "man3",
      "wind2",
      "wind3",
    ]);
  });

  it("전원 공개 채널에 좌석 id를 `from`으로 싣지 않는다 (컷인이 패로 읽는 자리다)", () => {
    // `{kind, from}`의 from은 클라이언트 사건 컷인에서 "바뀌기 전 패"다. 좌석 id "p1"이
    // 거기 실려 `p1`이라 적힌 패가 한 장 더 떴다(2026-08-13 사용자 보고).
    const state = silentScene();
    const target = state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    const { game, flow } = start(state, silentSwap);
    flow.submit("p0", { type: "silent_take", payload: { tileId: target } });
    const shown = buildPlayerView(game.engine.state, "p2", game.engine.rules)
      .augmentView["silent_swap:p0"] as Record<string, unknown>;
    expect(shown).toBeDefined();
    expect(shown["from"]).toBeUndefined();
    expect(shown["fromPlayer"]).toBe("p1");
    expect(shown["kind"]).toBe("man3");
  });

  it("국당 1회 — 발동 뒤에는 후보가 사라진다", () => {
    const state = silentScene();
    const target = state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    const { game, flow } = start(state, silentSwap);
    const status = flow.submit("p0", { type: "silent_take", payload: { tileId: target } });
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    expect(optionsOf(prompt, "silent_take")).toHaveLength(0);
    expect(game.engine.state.round.phase).toBe("turn.act");
  });

  it("발동한 국에 화료하면 +2판 — 정산창에도 점수가 아니라 판으로 적힌다", () => {
    const state = silentScene();
    const target = state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    const { game, flow } = start(state, silentSwap);
    const afterTake = flow.submit("p0", {
      type: "silent_take",
      payload: { tileId: target },
    });
    if (afterTake.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = afterTake.prompts.find((p) => p.player === "p0")!;
    const win = optionsOf(prompt, "win")[0];
    expect(win).toBeDefined();
    const before = game.engine.state;
    flow.submit("p0", win!);

    const settled = lastSettled(flow);
    const info = (settled.winInfos ?? []).find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    const bonus = hanBonusPoints(before, "p0", info!, 2);
    expect(bonus).toBeGreaterThan(0);
    expect(settled.deltas.p0).toBe(info!.points + bonus);
    // 2026-08-07 사용자 보고: "+2판인데 정산에 +6000점이 붙는다" — 표시 단위는 판이다.
    const note = (settled.augPoints ?? []).find(
      (a) => a.player === "p0" && a.augId === "silent_swap",
    );
    expect(note).toBeDefined();
    expect(note!.han).toBe(2);
    expect(note!.points).toBe(bonus);
  });

  it("여러 시드로 한 국을 완주한다", () => {
    for (const seed of [1, 2, 3, 42, 999]) playOneRound(silentSwap, seed);
  });
});

// ─────────────────────────── ankan_dora ───────────────────────────

/** p0에게 안깡 N묶음을 쥐여준 상태 (riichi 여부 지정) */
function ankanScene(ankan: number, riichi: boolean): GameState {
  const specs = ["1111m", "2222m", "3333m"].slice(0, ankan);
  const base = craft({
    hands: {
      p0: ["456p789p12s3s", "456p789p12s", "456p789p1s"][ankan - 1] ?? "456p789p12s3s",
      p1: "*",
      p2: "*",
      p3: "*",
    },
    melds: { p0: specs.map((spec) => ({ kind: "kan_closed" as const, spec })) },
    discards: { p0: "1z" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const state = withAugments(base, "p0", ["ankan_dora"]);
  if (!riichi) return state;
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        p0: {
          ...state.round.byPlayer.p0!,
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

describe("ankan_dora (밀실의 도라)", () => {
  it("안깡 1묶음(깡친 네 장)당 +4판", () => {
    for (const [ankan, expected] of [
      [1, 4],
      [2, 8],
      [3, 12],
    ] as const) {
      // riichi 여부와 무관 — 개편 후 리치 조건은 없다
      const state = ankanScene(ankan, false);
      const game = createStandardGameFromState(state);
      installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
      expect(
        game.engine.rules.resolve<number>("score.extraHan", {
          playerId: "p0",
          state: game.engine.state,
        }),
      ).toBe(expected);
    }
  });

  it("리치가 없어도 판이 붙는다 (리치 무관 — 개편)", () => {
    const state = ankanScene(2, false);
    const game = createStandardGameFromState(state);
    installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(8);
  });

  it("도라가 되는 것은 깡에 들어간 네 장뿐 — 손패의 같은 종류에는 붙지 않는다", () => {
    /*
     * 2026-08-04 사용자 확정: "그냥 깡치면 도라 4개가 생긴다"는 개념이다.
     * 예전에는 깡친 **종류**를 개인 도라로 등록하고 손패·후로에서 그 종류를 세어,
     * 랭크가 섞인 깡(장사진 3-4-5-6·바람의 계보 동남서북)은 첫 종류 하나만 잡히고
     * 손패에 남은 같은 패에는 값이 붙는 어긋남이 있었다.
     */
    /*
     * 랭크가 섞인 깡(3-4-5-6m) + 손패에 3m 두 장.
     * 옛 동작: 깡의 첫 종류(3m)만 도라 → 깡 안의 3m 1장 + 손패 3m 2장 = 3판.
     * 새 동작: 깡에 들어간 네 장이 도라 → 손패 3m은 무관 = 4판.
     * (같은 패 4장짜리 보통 깡은 5번째 장이 존재할 수 없어 두 동작이 구분되지 않는다.)
     */
    const base = craft({
      hands: { p0: "33m456p789p12s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed" as const, spec: "3456m" }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, "p0", ["ankan_dora"]));
    installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(4);
  });

  it("랭크가 섞인 깡도 네 장 전부 도라가 된다 (+4판)", () => {
    // 장사진(3-4-5-6)·바람의 계보(동남서북)처럼 랭크가 섞인 안깡
    const base = craft({
      hands: { p0: "456p789p12s3s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed" as const, spec: "3456m" }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, "p0", ["ankan_dora"]));
    installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(4);
  });

  it("안깡이 하나도 없으면 판이 붙지 않는다", () => {
    // 안깡 없는 손 (멜드 미지정)
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, "p0", ["ankan_dora"]));
    installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("보유자가 아닌 사람에게는 적용되지 않는다", () => {
    const state = ankanScene(2, true);
    const game = createStandardGameFromState(state);
    installAugment(game.engine, ankanDora, "p0", { yaku: game.yaku });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("여러 시드로 한 국을 완주한다", () => {
    for (const seed of [1, 2, 3, 42, 999]) playOneRound(ankanDora, seed);
  });
});

// ─────────────────────────── foresight ───────────────────────────

/** p0 텐파이(3만 단기) + 쯔모 3만 = 이미 화료형. 예지를 먼저 쓰고 쯔모할 수 있다. */
function foresightScene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m3m", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1z", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["foresight"]);
}

describe("foresight (예지)", () => {
  it("발동(공개) 후보 하나를 낸다 — 상시 순열 나열이 아니다", () => {
    const { prompt } = start(foresightScene(), foresight);
    expect(optionsOf(prompt, "foresight_reveal")).toHaveLength(1);
    // 재배열은 발동 후에만 — 아직은 후보로 나오지 않는다
    expect(optionsOf(prompt, "foresight_order")).toHaveLength(0);
  });

  it("발동 전에는 패산이 안 보이고, 발동하면 앞 4장이 보유자 채널에 공개된다", () => {
    const { game, flow } = start(foresightScene(), foresight);
    const st0 = game.engine.state;
    // 발동 전: 패산은 보유자에게도 숨김(상시 공개 아님)
    expect(
      buildPlayerView(st0, "p0", game.engine.rules).zones[WALL]?.tileIds,
    ).toHaveLength(0);
    const front = (st0.zones[WALL]?.tileIds ?? [])
      .slice(0, 4)
      .map((id) => kindKey(kindOf(st0, id)));

    flow.submit("p0", { type: "foresight_reveal", payload: {} });
    const st1 = game.engine.state;
    // 발동 후: 보유자 전용 채널에 앞 4장 kind가 실린다 (패산 자체는 여전히 숨김)
    expect(
      buildPlayerView(st1, "p0", game.engine.rules).augmentView["foresight_peek"],
    ).toEqual(front);
    expect(
      buildPlayerView(st1, "p1", game.engine.rules).augmentView["foresight_peek"],
    ).toBeUndefined();
  });

  it("발동 후 order로 앞 4장을 재배열하고 나머지는 그대로 둔다", () => {
    const { game, flow } = start(foresightScene(), foresight);
    flow.submit("p0", { type: "foresight_reveal", payload: {} });
    const before = [...(game.engine.state.zones[WALL]?.tileIds ?? [])];
    flow.submit("p0", { type: "foresight_order", payload: { order: [2, 0, 3, 1] } });
    const after = game.engine.state.zones[WALL]?.tileIds ?? [];
    expect(after.slice(0, 4)).toEqual([before[2], before[0], before[3], before[1]]);
    expect(after.slice(4)).toEqual(before.slice(4));
    expect(after).toHaveLength(before.length);
  });

  // 2026-08-02(사용자 지시) 너프: 열람은 순 쿨다운, **재배열은 국에 1회**.
  it("재배열은 국에 1회 — 두 번째 발동에서는 order 후보가 없고 제출도 거부된다", () => {
    const { game, flow } = start(foresightScene(), foresight);
    flow.submit("p0", { type: "foresight_reveal", payload: {} });
    flow.submit("p0", { type: "foresight_order", payload: { order: [1, 0, 2, 3] } });
    expect(game.engine.state.augmentData["foresight:ordered:1-1-0:p0#round"]).toBe(true);

    // 같은 국에서 다시 발동(공개)한 상황을 만든다 — 쿨다운이 지난 순으로 옮겨 다시 연다
    const base = foresightScene();
    const again: GameState = {
      ...base,
      round: { ...base.round, turnCount: 4 },
      augmentData: { ...base.augmentData, "foresight:ordered:1-1-0:p0#round": true },
    };
    const second = start(again, foresight);
    expect(optionsOf(second.prompt, "foresight_reveal")).toHaveLength(1);
    second.flow.submit("p0", { type: "foresight_reveal", payload: {} });
    const def = second.game.engine.actions.get("foresight_order");
    if (def === undefined) throw new Error("no foresight_order action");
    expect(
      def.validate(
        { player: "p0", type: "foresight_order", payload: { order: [1, 0, 2, 3] } },
        { state: second.game.engine.state, rules: second.game.engine.rules },
      ),
    ).toBe("reorder already used this round");
  });

  it("발동하지 않고 order를 내면 거부된다 (발동=공개가 선행)", () => {
    const { game } = start(foresightScene(), foresight);
    const def = game.engine.actions.get("foresight_order");
    if (def === undefined) throw new Error("no foresight_order action");
    expect(
      def.validate(
        { player: "p0", type: "foresight_order", payload: { order: [1, 0, 2, 3] } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("reveal first");
  });

  // 2026-08-07(사용자 지시) 너프: 열람 쿨다운 2순 → 4순.
  it("사용 후 4순 동안 비활성, 4순이 지나면 다시 열린다", () => {
    /*
     * 0순에 발동한 기록을 심고 **보유자가 버린 수**를 옮겨 가며 발동 후보 수를 본다.
     *
     * 2026-08-22(QA aug-2 확정 3): 순 기준이 `round.turnCount`에서 보유자의
     * `discardCount`로 옮겨 갔다. turnCount는 **오야가 뽑을 때마다** 오르고 영상패도
     * 예외가 아니라, 오야가 깡을 칠 때마다 쿨다운이 공짜로 1순씩 짧아졌다
     * (형제 `future_sight`·`take_back`이 먼저 밟고 먼저 나온 함정이다).
     */
    const scene = (discardCount: number): GameState => {
      const base = foresightScene();
      return {
        ...base,
        round: {
          ...base.round,
          byPlayer: {
            ...base.round.byPlayer,
            p0: { ...base.round.byPlayer.p0!, discardCount },
          },
        },
        augmentData: { ...base.augmentData, "foresight:turn:1-1-0:p0#round": 0 },
      };
    };
    for (const [discardCount, expected] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
      [7, 1],
    ] as const) {
      const { prompt } = start(scene(discardCount), foresight);
      expect(optionsOf(prompt, "foresight_reveal")).toHaveLength(expected);
    }
  });

  it("발동한 국에 화료하면 +2판 — 정산창에도 점수가 아니라 판으로 적힌다", () => {
    const { game, flow } = start(foresightScene(), foresight);
    // 발동(공개)만 해도 소진 플래그가 서고 화료 보너스 대상이 된다 (재배열은 선택)
    const status = flow.submit("p0", { type: "foresight_reveal", payload: {} });
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const win = optionsOf(status.prompts.find((p) => p.player === "p0")!, "win")[0];
    expect(win).toBeDefined();
    const before = game.engine.state;
    flow.submit("p0", win!);
    const settled = lastSettled(flow);
    const info = (settled.winInfos ?? []).find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    const bonus = hanBonusPoints(before, "p0", info!, 2);
    expect(bonus).toBeGreaterThan(0);
    expect(settled.deltas.p0).toBe(info!.points + bonus);
    // 2026-08-07 사용자 보고: "+2판인데 정산에 +6000점이 붙는다" — 표시 단위는 판이다.
    const note = (settled.augPoints ?? []).find(
      (a) => a.player === "p0" && a.augId === "foresight",
    );
    expect(note).toBeDefined();
    expect(note!.han).toBe(2);
    expect(note!.points).toBe(bonus);
  });

  it("여러 시드로 한 국을 완주한다", () => {
    for (const seed of [1, 2, 3, 42, 999]) playOneRound(foresight, seed);
  });
});

// ─────────────────────────── rank_gate ───────────────────────────

/** 국 첫 순(아직 아무도 버리지 않은 상태)의 p0 턴 */
function rankGateScene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const state = withAugments(base, "p0", ["rank_gate"]);
  return { ...state, round: { ...state.round, firstTurn: true } };
}

describe("rank_gate (격)", () => {
  it("국 첫 순에 상대 3명을 후보로 낸다 (자신은 제외)", () => {
    const { prompt } = start(rankGateScene(), rankGate);
    const marks = optionsOf(prompt, "rank_gate_mark");
    expect(marks.map((o) => (o.payload as { target: PlayerId }).target).sort()).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  /*
   * 창의 기준은 **내 이력**이다 (2026-08-25).
   *
   * 예전 판정은 `round.firstTurn`이었는데, 그 플래그는 **누구든** 울면 내려간다.
   * 그래서 내 순이 오기도 전에 앞자리가 한 번 퐁하면, 내가 이 국에 한 장도 버리지
   * 않았는데 국당 1회짜리 선언이 통째로 사라졌다(사용자 보고).
   */
  it("남이 울어 round.firstTurn이 내려가도 내 첫 순이면 발동한다", () => {
    const base = rankGateScene();
    const state: GameState = { ...base, round: { ...base.round, firstTurn: false } };
    const { prompt } = start(state, rankGate);
    expect(optionsOf(prompt, "rank_gate_mark")).toHaveLength(3);
  });

  it("내 첫 순이 지나면(이미 버렸으면) 발동할 수 없다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "9p", p1: "", p2: "", p3: "" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { prompt } = start(withAugments(base, "p0", ["rank_gate"]), rankGate);
    expect(optionsOf(prompt, "rank_gate_mark")).toHaveLength(0);
  });

  it("지목당한 사람만 win.minHan = 5가 되고, 국이 바뀌면 풀린다", () => {
    const { game, flow } = start(rankGateScene(), rankGate);
    flow.submit("p0", { type: "rank_gate_mark", payload: { target: "p2" } });
    const state = game.engine.state;
    const minHan = (p: PlayerId, s: GameState = state): number =>
      game.engine.rules.resolve<number>("win.minHan", { playerId: p, state: s });
    expect(minHan("p2")).toBe(5);
    expect(minHan("p1")).toBe(0);
    expect(minHan("p3")).toBe(0);
    expect(minHan("p0")).toBe(0);
    // 국이 바뀌면(roundKey 변화) 지목이 만료된다
    const nextRound: GameState = {
      ...state,
      round: { ...state.round, roundNumber: state.round.roundNumber + 1 },
    };
    expect(minHan("p2", nextRound)).toBe(0);
  });

  it("국당 1회 — 지목 뒤에는 후보가 사라진다", () => {
    const { flow } = start(rankGateScene(), rankGate);
    const status = flow.submit("p0", {
      type: "rank_gate_mark",
      payload: { target: "p1" },
    });
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    expect(
      optionsOf(status.prompts.find((p) => p.player === "p0")!, "rank_gate_mark"),
    ).toHaveLength(0);
  });

  it("지목 관계가 전원 공개 뷰 채널에 실린다", () => {
    const { game, flow } = start(rankGateScene(), rankGate);
    flow.submit("p0", { type: "rank_gate_mark", payload: { target: "p3" } });
    for (const viewer of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const view = buildPlayerView(game.engine.state, viewer, game.engine.rules);
      const shown = view.augmentView["rank_gate:p0"] as {
        target: PlayerId;
        minHan: number;
      };
      expect(shown.target).toBe("p3");
      expect(shown.minHan).toBe(5);
    }
  });

  it("여러 시드로 한 국을 완주한다", () => {
    for (const seed of [1, 2, 3, 42, 999]) playOneRound(rankGate, seed);
  });
});
