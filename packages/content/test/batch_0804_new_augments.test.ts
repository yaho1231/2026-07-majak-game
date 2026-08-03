/**
 * 6차 사용자 발안 8종 (2026-08-04) 회귀 테스트.
 *
 * 각 증강의 **계약 한 줄**을 못으로 박는다 — 이름이나 표기가 아니라
 * "무엇이 실제로 달라지는가"를 본다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  ROUND_STARTED,
  TURN_PASSED,
  WALL,
  augmentGrantKey,
  createStandardGame,
  createStandardGameFromState,
  doraKindFor,
  frontDoraKindFor,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft } from "./helpers.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { cornucopia } from "../src/augments/cornucopia.js";
import { timePressure, TIME_PRESSURE_SECONDS } from "../src/augments/time_pressure.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { doraAfterimage } from "../src/augments/dora_afterimage.js";
import { signFlip } from "../src/augments/sign_flip.js";
import { runawayRiichi } from "../src/augments/runaway_riichi.js";
import { pickyEater, questProgress } from "../src/augments/picky_eater.js";

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

/** augmentData에 값을 직접 심는다 (ROUND_STARTED가 하는 일을 크래프트 상태에서 대신) */
function withData(state: GameState, entries: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...entries } };
}

function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/**
 * 루트 이벤트를 직접 흘려보낸다 (엔진에 raw 이벤트 API가 없어 테스트 전용 액션을 쓴다).
 * 리액션·인터셉터는 실제 경로와 똑같이 돈다.
 */
function emit(
  game: ReturnType<typeof createStandardGameFromState>,
  event: { type: string; payload: unknown },
): void {
  if (!game.engine.actions.has("__test_emit")) {
    game.engine.actions.register({
      type: "__test_emit",
      validate: () => null,
      toEvents: (req) => [req.payload as { type: string; payload: unknown }],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_emit", payload: event });
  if (!res.ok) throw new Error(`emit failed: ${res.reason}`);
}

/** 국을 식별하는 키 — content/util.ts의 roundKey와 같은 규약 */
const roundKeyOf = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

/** p0가 9s 단기 대기, p1이 9s를 버려 p0가 론할 수 있는 장면 */
function ronScene(): GameState {
  return craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
}

/** 화료까지 진행해 정산 payload를 얻는다 */
function settleRon(
  state: GameState,
  install?: (game: ReturnType<typeof createStandardGameFromState>) => void,
): RoundSettledPayload {
  const game = createStandardGameFromState(state);
  install?.(game);
  const flow = new FlowController(game.engine);
  flow.begin();
  const status = flow.submit("p0", { type: "win", payload: {} });
  expect(status.kind).toBe("roundOver");
  return lastSettled(flow);
}

// ─────────────────────────── 1. 거울의 도라 ───────────────────────────

describe("거울의 도라 (mirror_dora)", () => {
  it("표시패의 '앞'은 표준 도라의 정확한 역방향 순환이다", () => {
    expect(frontDoraKindFor({ suit: "pin", rank: 5 })).toEqual({ suit: "pin", rank: 4 });
    expect(frontDoraKindFor({ suit: "man", rank: 1 })).toEqual({ suit: "man", rank: 9 });
    expect(frontDoraKindFor({ suit: "wind", rank: 1 })).toEqual({ suit: "wind", rank: 4 });
    expect(frontDoraKindFor({ suit: "dragon", rank: 1 })).toEqual({
      suit: "dragon",
      rank: 3,
    });
  });

  it("표시패의 앞 패가 보유자 손에 있으면 그만큼 도라가 붙는다", () => {
    const base = ronScene();
    // **앞도라만** 내 손에 걸리는 표시패를 왕패에서 찾는다
    // (표준 도라까지 손에 있으면 판 차이가 앞도라 때문인지 알 수 없다).
    const handKinds = new Set(
      (base.zones["hand:p0"]?.tileIds ?? []).map((id) => kindKey(kindOf(base, id))),
    );
    const deadWall = base.zones[DEAD_WALL]?.tileIds ?? [];
    const indicator = deadWall.find((id) => {
      const k = kindOf(base, id);
      return (
        handKinds.has(kindKey(frontDoraKindFor(k))) &&
        !handKinds.has(kindKey(doraKindFor(k)))
      );
    });
    expect(indicator).toBeDefined();
    const staged: GameState = {
      ...base,
      round: { ...base.round, doraIndicators: [indicator as TileId] },
    };

    const plain = settleRon(staged);
    const mirrored = settleRon(withAugments(staged, "p0", ["mirror_dora"]), (game) => {
      installAugment(game.engine, mirrorDora, "p0", { yaku: game.yaku });
    });

    // 도라가 한 장 더 붙었으니 판이 정확히 1 올라간다
    expect(mirrored.winInfos?.[0]?.han).toBe((plain.winInfos?.[0]?.han ?? 0) + 1);
    expect(mirrored.deltas["p0"] ?? 0).toBeGreaterThan(plain.deltas["p0"] ?? 0);
  });

  it("보유하지 않은 사람에게는 앞도라가 붙지 않는다", () => {
    const base = ronScene();
    const plain = settleRon(base);
    // p1이 보유해도 화료자는 p0라 아무것도 달라지지 않는다
    const other = settleRon(withAugments(base, "p1", ["mirror_dora"]), (game) => {
      installAugment(game.engine, mirrorDora, "p1", { yaku: game.yaku });
    });
    expect(other.winInfos?.[0]?.han).toBe(plain.winInfos?.[0]?.han);
  });
});

// ─────────────────────────── 2. 화수분 ───────────────────────────

describe("화수분 (cornucopia)", () => {
  const newGame = (): ReturnType<typeof createStandardGame> =>
    createStandardGame({ seed: 7, extraAugments: contentAugments });

  it("설치하는 순간 무작위 증강 2개가 함께 지급된다", () => {
    const game = newGame();
    game.engine.submit({ player: "p0", type: "draftPick", payload: { augmentId: "cornucopia" } });
    installAugment(game.engine, cornucopia, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const held = game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [];
    expect(held).toContain("cornucopia");
    expect(held).toHaveLength(3);
    // 지급 이력이 상태에 남는다
    const granted = game.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")];
    expect(Array.isArray(granted) && granted.length).toBe(2);
  });

  it("재구성(install 재호출)에서 다시 뽑지 않는다", () => {
    const game = newGame();
    game.engine.submit({ player: "p0", type: "draftPick", payload: { augmentId: "cornucopia" } });
    const extras = { yaku: game.yaku, catalog: game.augments };
    installAugment(game.engine, cornucopia, "p0", extras);
    const after1 = [...(game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [])];
    installAugment(game.engine, cornucopia, "p0", extras);
    const after2 = game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [];
    expect(after2).toEqual(after1);
  });

  it("카탈로그를 안 넘기면 조용히 아무 일도 하지 않는다", () => {
    const game = newGame();
    game.engine.submit({ player: "p0", type: "draftPick", payload: { augmentId: "cornucopia" } });
    installAugment(game.engine, cornucopia, "p0", { yaku: game.yaku });
    expect(game.engine.state.players.find((p) => p.id === "p0")?.augments).toEqual([
      "cornucopia",
    ]);
  });
});

// ─────────────────────────── 3. 초읽기 ───────────────────────────

describe("초읽기 (time_pressure)", () => {
  it("발동한 국에 제한 초를 전원 공개 채널에 싣는다", () => {
    const game = createStandardGameFromState(craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    }));
    installAugment(game.engine, timePressure, "p0", { yaku: game.yaku });
    // 국이 시작되면 armOnNextRound가 이 국을 '그 국'으로 굳히고 채널이 켜진다
    emit(game, { type: ROUND_STARTED, payload: {} });
    const armed = Object.entries(game.engine.state.augmentData).find(([k]) =>
      k.startsWith("view:*:time_pressure"),
    );
    expect(armed?.[1]).toBe(TIME_PRESSURE_SECONDS);
  });
});

// ─────────────────────────── 4. 눈먼 총알 ───────────────────────────

describe("눈먼 총알 (blind_ron)", () => {
  /** 이 국을 '발동한 국'으로 심는다 (평소에는 ROUND_STARTED가 한다) */
  const armed = (s: GameState): GameState =>
    withData(withAugments(s, "p0", ["blind_ron"]), {
      [`blind_ron:armedRound:p0`]: roundKeyOf(s),
    });

  it("총액은 보존되고, 쏜 사람 대신 무작위 한 명이 문다", () => {
    // 본장을 바꿔 가며 여러 번 굴린다 — 대상은 (시드 ⊕ 국 ⊕ 쏜 사람)에서 결정된다
    let redirected = 0;
    for (let honba = 0; honba < 6; honba++) {
      const base = ronScene();
      const staged: GameState = { ...base, round: { ...base.round, honba } };
      const settled = settleRon(armed(staged), (game) => {
        installAugment(game.engine, blindRon, "p0", { yaku: game.yaku });
      });
      // 총액 보존 — 지불자만 바뀐다
      expect(Object.values(settled.deltas).reduce((a, b) => a + b, 0)).toBe(0);
      const payers = (["p1", "p2", "p3"] as PlayerId[]).filter(
        (id) => (settled.deltas[id] ?? 0) < 0,
      );
      // 무는 사람은 언제나 한 명뿐 (또는 화료자 자신이 물어 아무도 없다)
      expect(payers.length).toBeLessThanOrEqual(1);
      if (payers.length === 1 && payers[0] !== "p1") redirected++;
      // 화료자가 뽑히면 실질 0점
      if (payers.length === 0) expect(settled.deltas["p0"] ?? 0).toBe(0);
    }
    // 여섯 판 중 최소 한 번은 엉뚱한 사람이 맞는다 (그게 이 증강의 전부다)
    expect(redirected).toBeGreaterThan(0);
  });

  it("발동한 국이 아니면 쏜 사람이 그대로 문다", () => {
    const base = ronScene();
    const settled = settleRon(withAugments(base, "p0", ["blind_ron"]), (game) => {
      installAugment(game.engine, blindRon, "p0", { yaku: game.yaku });
    });
    expect(settled.deltas["p1"] ?? 0).toBeLessThan(0);
    expect(settled.deltas["p2"] ?? 0).toBe(0);
    expect(settled.deltas["p3"] ?? 0).toBe(0);
  });
});

// ─────────────────────────── 5. 도라의 잔상 ───────────────────────────

describe("도라의 잔상 (dora_afterimage)", () => {
  it("되살린 도라가 이번 국의 도라 위에 겹쳐 붙는다", () => {
    const base = ronScene();
    // 이번 국 표시패와 무관한 종류(2s)를 '직전 국의 도라'로 심는다.
    // p0의 손에는 2s가 한 장 있다.
    const recalled: TileKind[] = [{ suit: "sou", rank: 2 }];
    const plain = settleRon(base);
    const staged = withData(withAugments(base, "p0", ["dora_afterimage"]), {
      [`dora_afterimage:recalled:${roundKeyOf(base)}:p0`]: recalled,
    });
    const boosted = settleRon(staged, (game) => {
      installAugment(game.engine, doraAfterimage, "p0", { yaku: game.yaku });
    });
    expect(boosted.winInfos?.[0]?.han).toBe((plain.winInfos?.[0]?.han ?? 0) + 1);
  });

  it("정산 때 그 국의 도라를 다음 국이 되살릴 수 있게 적어 둔다", () => {
    const base = ronScene();
    const game = createStandardGameFromState(withAugments(base, "p0", ["dora_afterimage"]));
    installAugment(game.engine, doraAfterimage, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "win", payload: {} });
    const prev = game.engine.state.augmentData["dora_afterimage:prevDora"];
    expect(Array.isArray(prev) && prev.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────── 6. 음양 반전 ───────────────────────────

describe("음양 반전 (sign_flip)", () => {
  it("보유자가 쏘이면 잃는 대신 같은 금액을 얻는다 (상대는 정상)", () => {
    // p1이 보유자다 — p0에게 쏘여 잃을 자리에서 반대로 받는다
    const base = ronScene();
    const plain = settleRon(base);
    const loss = plain.deltas["p1"] ?? 0;
    expect(loss).toBeLessThan(0);

    const staged = withData(withAugments(base, "p1", ["sign_flip"]), {
      [`sign_flip:armedRound:p1`]: roundKeyOf(base),
    });
    const flipped = settleRon(staged, (game) => {
      installAugment(game.engine, signFlip, "p1", { yaku: game.yaku });
    });
    expect(flipped.deltas["p1"]).toBe(-loss);
    // 화료자는 평소대로 받는다 — 차액은 뱅크가 발행한다
    expect(flipped.deltas["p0"]).toBe(plain.deltas["p0"]);
  });

  it("보유자가 화료하면 받을 점수를 도로 빼앗긴다", () => {
    const base = ronScene();
    const plain = settleRon(base);
    const staged = withData(withAugments(base, "p0", ["sign_flip"]), {
      [`sign_flip:armedRound:p0`]: roundKeyOf(base),
    });
    const flipped = settleRon(staged, (game) => {
      installAugment(game.engine, signFlip, "p0", { yaku: game.yaku });
    });
    expect(flipped.deltas["p0"]).toBe(-(plain.deltas["p0"] ?? 0));
  });

  it("발동한 국이 아니면 아무것도 뒤집지 않는다", () => {
    const base = ronScene();
    const plain = settleRon(base);
    const settled = settleRon(withAugments(base, "p0", ["sign_flip"]), (game) => {
      installAugment(game.engine, signFlip, "p0", { yaku: game.yaku });
    });
    expect(settled.deltas["p0"]).toBe(plain.deltas["p0"]);
  });
});

// ─────────────────────────── 7. 폭주 리치 ───────────────────────────

describe("폭주 리치 (runaway_riichi)", () => {
  /** p0가 자기 순(turn.act)에 텐파이로 서 있는 장면 — 9s를 버리면 텐파이 유지 */
  const blitzScene = (): GameState =>
    withAugments(
      craft({
        hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["runaway_riichi"],
    );

  function start(state: GameState) {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, runawayRiichi, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    return { game, flow };
  }

  it("발동하면 리치가 걸리고 남은 연속 쯔모가 5로 선다", () => {
    const { game, flow } = start(blitzScene());
    const tileId = game.engine.state.zones["hand:p0"]?.tileIds.at(-1) as TileId;
    flow.submit("p0", { type: "blitz_riichi", payload: { tileId } });
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).not.toBeNull();
    const left =
      game.engine.state.augmentData[
        `runaway_riichi:left:${roundKeyOf(game.engine.state)}:p0`
      ];
    // 선언 직후 이미 한 장을 뽑았을 수 있으므로 5 이하 4 이상
    expect(typeof left === "number" && left <= 5 && left >= 4).toBe(true);
  });

  it("남은 횟수가 있는 동안 턴이 보유자에게 고정된다", () => {
    const state = withData(blitzScene(), {
      [`runaway_riichi:left:${roundKeyOf(blitzScene())}:p0`]: 3,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, runawayRiichi, "p0", { yaku: game.yaku });
    emit(game, { type: TURN_PASSED, payload: { nextSeat: 1 } });
    expect(game.engine.state.round.turnSeat).toBe(0);
  });

  it("남은 횟수가 0이면 턴이 정상적으로 넘어간다", () => {
    const game = createStandardGameFromState(blitzScene());
    installAugment(game.engine, runawayRiichi, "p0", { yaku: game.yaku });
    emit(game, { type: TURN_PASSED, payload: { nextSeat: 1 } });
    expect(game.engine.state.round.turnSeat).toBe(1);
  });

  it("텐파이가 아니면 후보가 아예 뜨지 않는다", () => {
    const broken = withAugments(
      craft({
        hands: { p0: "159m159p159s1234z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["runaway_riichi"],
    );
    const { flow } = start(broken);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const mine = status.prompts.find((pr) => pr.player === "p0");
    expect(mine?.options.some((o) => o.type === "blitz_riichi")).toBe(false);
  });
});

// ─────────────────────────── 8. 편식 ───────────────────────────

describe("편식 (picky_eater)", () => {
  const scene = (discards: string): GameState =>
    withAugments(
      craft({
        hands: { p0: "123m456m789m123p1p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: discards },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["picky_eater"],
    );

  it("한 무늬 + 자패로 12장을 버리면 달성한다", () => {
    // 삭수 9장 + 자패 3장 = 12장
    const p = questProgress(scene("123456789s123z"), "p0");
    expect(p.count).toBe(12);
    expect(p.suit).toBe("sou");
    expect(p.failed).toBe(false);
    expect(p.ready).toBe(true);
  });

  it("다른 무늬를 한 장이라도 버리면 실패한다", () => {
    const p = questProgress(scene("123456789s12z1m"), "p0");
    expect(p.failed).toBe(true);
    expect(p.ready).toBe(false);
  });

  it("자패만 버려도 무늬는 잠기지 않고 진행도는 쌓인다", () => {
    const p = questProgress(scene("1234567z"), "p0");
    expect(p.suit).toBeNull();
    expect(p.failed).toBe(false);
    expect(p.count).toBe(7);
  });

  it("12장을 못 채웠으면 액티브가 열리지 않는다", () => {
    const state = scene("123456789s12z");
    const game = createStandardGameFromState(state);
    installAugment(game.engine, pickyEater, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const mine = status.prompts.find((pr) => pr.player === "p0");
    expect(mine?.options.some((o) => o.type === "picky_unify")).toBe(false);
  });

  it("12장을 채우면 색 후보 3개가 뜨고, 발동하면 손패가 그 색으로 물든다", () => {
    const state = scene("123456789s123z");
    const game = createStandardGameFromState(state);
    installAugment(game.engine, pickyEater, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const mine = status.prompts.find((pr) => pr.player === "p0");
    const suits = (mine?.options ?? [])
      .filter((o) => o.type === "picky_unify")
      .map((o) => (o.payload as { suit: string }).suit);
    expect(new Set(suits)).toEqual(new Set(["man", "pin", "sou"]));

    flow.submit("p0", { type: "picky_unify", payload: { suit: "pin" } });
    const after = game.engine.state;
    const kinds = (after.zones["hand:p0"]?.tileIds ?? []).map((id) => kindOf(after, id));
    // 수패는 전부 통수가 됐고 장수는 그대로다
    expect(kinds.filter((k) => k.suit === "man" || k.suit === "sou")).toEqual([]);
    expect(kinds).toHaveLength(state.zones["hand:p0"]?.tileIds.length ?? 0);
    // 패산 장수도 그대로 (실물 1:1 교환)
    expect(after.zones[WALL]?.tileIds.length).toBe(state.zones[WALL]?.tileIds.length);
  });
});
