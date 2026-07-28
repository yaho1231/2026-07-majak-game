/**
 * 52차 기존 증강 버프 (그룹 ⑤C·D·F) 테스트.
 *
 * C 정보형: rinshan_preview(영상 정찰) · peek_riichi_waits(선언 간파) · ura_peek(이면투시)
 * D 발동 빈도: yakuman_shield(역만 방어술) · nagashi_yakuman(유국역만) · last_stand(승부수)
 * F 체감: seat_swap(자리 바꿈) · let_it_ride(판돈 굴리기)
 *
 * 판정 근거: docs/16_AUGMENT_REDESIGN.md §1b
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  SYSTEM_PLAYER,
  WALL,
  createStandardGame,
  createStandardGameFromState,
  handIdsOf,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  playerAtSeat,
  uraIndicatorIds,
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
import { rinshanPreview } from "../src/augments/rinshan_preview.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { uraPeek } from "../src/augments/ura_peek.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";
import { lastStand } from "../src/augments/last_stand.js";
import { seatSwap } from "../src/augments/seat_swap.js";
import { letItRide } from "../src/augments/let_it_ride.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** state.players[].augments에 증강 보유를 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(
  state: GameState,
  grants: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const extra = grants[p.id];
      return extra === undefined ? p : { ...p, augments: [...p.augments, ...extra] };
    }),
  };
}

/** augmentData를 직접 주입한다 */
function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

/** 대상 플레이어를 리치 상태로 만든다 */
function withRiichi(state: GameState, player: PlayerId): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`unknown player: ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [player]: {
          ...rs,
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

function validateOf(
  game: Game,
  type: string,
  player: PlayerId,
  payload: unknown,
): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`no ${type} action`);
  return def.validate(
    { player, type, payload },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function submitOk(game: Game, player: PlayerId, type: string, payload: unknown): void {
  const r = game.engine.submit({ player, type, payload });
  if (!r.ok) throw new Error(`${type} failed: ${r.reason}`);
}

function sys(game: Game, type: string): void {
  const r = game.engine.submit({ player: SYSTEM_PLAYER, type, payload: {} });
  if (!r.ok) throw new Error(`${type} failed: ${r.reason}`);
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === "RoundSettled") return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

const deadWallOf = (game: Game): TileId[] =>
  game.engine.state.zones[DEAD_WALL]?.tileIds ?? [];

// ───────────────────────── C. 정보형 ─────────────────────────

describe("rinshan_preview (영상 정찰) — 영상패 끌어오기", () => {
  function setup(): Game {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withAugments(state, { p0: ["rinshan_preview"] }),
    );
    installAugment(game.engine, rinshanPreview, "p0", { yaku: game.yaku });
    return game;
  }

  it("깡 없이 영상패를 쯔모패와 맞바꾼다 — 왕패 장수는 그대로, 쯔모패가 갱신된다", () => {
    const game = setup();
    const beforeDeadWall = [...deadWallOf(game)];
    const beforeHandSize = handIdsOf(game.engine.state, "p0").length;
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const rinshanTile = beforeDeadWall[0] as TileId;
    expect(drawn).not.toBe(rinshanTile);

    expect(validateOf(game, "rinshan_pull", "p0", {})).toBeNull();
    submitOk(game, "p0", "rinshan_pull", {});

    const after = deadWallOf(game);
    // 왕패 장수 보존 + 뺀 자리(맨 앞)에 쯔모패가 들어간다
    expect(after).toHaveLength(beforeDeadWall.length);
    expect(after[0]).toBe(drawn);
    expect(after.slice(1)).toEqual(beforeDeadWall.slice(1));
    // 영상패는 손으로, 쯔모패 참조도 새 패로 갱신
    expect(handIdsOf(game.engine.state, "p0")).toContain(rinshanTile);
    expect(handIdsOf(game.engine.state, "p0")).not.toContain(drawn);
    expect(game.engine.state.round.lastDrawnTile).toBe(rinshanTile);
    // 손패 장수는 그대로 (한 장 나가고 한 장 들어온다)
    expect(game.engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(
      beforeHandSize,
    );
  });

  it("국당 1회 — 두 번째 발동은 거부된다", () => {
    const game = setup();
    submitOk(game, "p0", "rinshan_pull", {});
    expect(validateOf(game, "rinshan_pull", "p0", {})).toBe("already used this round");
  });

  it("비보유자는 쓸 수 없다", () => {
    const game = setup();
    expect(validateOf(game, "rinshan_pull", "p1", {})).toBe(
      "no rinshan_preview augment",
    );
  });
});

describe("peek_riichi_waits (선언 간파) — 대기패 위조", () => {
  /** p1은 9p 단기 텐파이로 리치 중 */
  function setup(): Game {
    const state = craft({
      hands: { p0: "*", p1: "234m3459p345678s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withRiichi(withAugments(state, { p0: ["peek_riichi_waits"] }), "p1"),
    );
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });
    return game;
  }

  it("간파하기 전에는 위조할 수 없다", () => {
    const game = setup();
    const tileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    expect(validateOf(game, "peek_forge", "p0", { tileId, kind: "pin9" })).toBe(
      "kind not among peeked waits",
    );
  });

  it("간파한 대기패를 내 손패 1장으로 만들어낸다 (conjured)", () => {
    const game = setup();
    submitOk(game, "p0", "peek_waits", { target: "p1" });
    expect(game.engine.state.augmentData["view:p0:waits:p1"]).toContain("pin9");

    const tileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    expect(validateOf(game, "peek_forge", "p0", { tileId, kind: "pin9" })).toBeNull();
    submitOk(game, "p0", "peek_forge", { tileId, kind: "pin9" });

    expect(kindKey(kindOf(game.engine.state, tileId))).toBe("pin9");
    expect(game.engine.state.tiles[tileId]?.attrs.conjured).toBe(true);
    // 손패 장수는 변하지 않는다 (종류만 바뀐다)
    expect(handIdsOf(game.engine.state, "p0")).toContain(tileId);
  });

  it("국당 1회 — 두 번째 위조는 거부되고, 간파하지 않은 종류도 거부된다", () => {
    const game = setup();
    submitOk(game, "p0", "peek_waits", { target: "p1" });
    const hand = handIdsOf(game.engine.state, "p0");
    submitOk(game, "p0", "peek_forge", { tileId: hand[0] as TileId, kind: "pin9" });
    expect(
      validateOf(game, "peek_forge", "p0", { tileId: hand[1] as TileId, kind: "pin9" }),
    ).toBe("already forged this round");
  });

  it("턴 프롬프트에 (손패 × 간파한 대기) 위조 후보가 노출된다", () => {
    const game = setup();
    submitOk(game, "p0", "peek_waits", { target: "p1" });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const forge = (status.prompts.find((p) => p.player === "p0")?.options ?? []).filter(
      (o) => o.type === "peek_forge",
    );
    expect(forge.length).toBe(handIdsOf(game.engine.state, "p0").length);
  });
});

describe("ura_peek (이면투시) — 뒷도라 바꿔치기", () => {
  function setup(): Game {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugments(state, { p0: ["ura_peek"] }));
    installAugment(game.engine, uraPeek, "p0", { yaku: game.yaku });
    return game;
  }

  it("확인하기 전에는 바꿔치기할 수 없다", () => {
    const game = setup();
    expect(validateOf(game, "ura_swap", "p0", { deadIndex: 0 })).toBe(
      "ura not revealed yet",
    );
  });

  it("뒷도라 표시패를 왕패의 다른 패와 맞바꾸고, 새 뒷도라가 보유자에게 보인다", () => {
    const game = setup();
    submitOk(game, "p0", "ura_peek_reveal", {});

    const before = [...deadWallOf(game)];
    const doraBefore = [...game.engine.state.round.doraIndicators];
    const uraId = uraIndicatorIds(game.engine.state)[0] as TileId;
    const uraPos = before.indexOf(uraId);
    const target = before[0] as TileId;
    expect(game.engine.state.augmentData["view:p0:ura"]).toEqual([
      kindKey(kindOf(game.engine.state, uraId)),
    ]);

    expect(validateOf(game, "ura_swap", "p0", { deadIndex: 0 })).toBeNull();
    submitOk(game, "p0", "ura_swap", { deadIndex: 0 });

    const after = deadWallOf(game);
    expect(after).toHaveLength(before.length);
    expect(after[uraPos]).toBe(target); // 뒷도라 자리에 고른 패가 들어왔다
    expect(after[0]).toBe(uraId); // 원래 뒷도라는 그 자리로 밀려났다
    // 도라 표시패는 그대로 (도라가 흔들리지 않는다)
    expect(game.engine.state.round.doraIndicators).toEqual(doraBefore);
    expect(uraIndicatorIds(game.engine.state)[0]).toBe(target);
    // 보유자 뷰가 새 뒷도라로 갱신된다
    expect(game.engine.state.augmentData["view:p0:ura"]).toEqual([
      kindKey(kindOf(game.engine.state, target)),
    ]);
  });

  it("도라·뒷도라 표시패 자리와는 바꿀 수 없고, 국당 1회만 가능하다", () => {
    const game = setup();
    submitOk(game, "p0", "ura_peek_reveal", {});
    const deadWall = deadWallOf(game);
    const doraPos = deadWall.indexOf(
      game.engine.state.round.doraIndicators[0] as TileId,
    );
    expect(validateOf(game, "ura_swap", "p0", { deadIndex: doraPos })).toBe(
      "cannot swap with an indicator slot",
    );
    expect(validateOf(game, "ura_swap", "p0", { deadIndex: doraPos + 1 })).toBe(
      "cannot swap with an indicator slot",
    );

    submitOk(game, "p0", "ura_swap", { deadIndex: 0 });
    expect(validateOf(game, "ura_swap", "p0", { deadIndex: 1 })).toBe(
      "already swapped this round",
    );
  });
});

// ───────────────────────── D. 발동 빈도 ─────────────────────────

describe("yakuman_shield (역만 방어술) — 역만 전용 / 횟수 무제한", () => {
  /** 쯔모패 버림 → 타가 전원 패스 → winner 론 */
  function runRon(game: Game, discarder: PlayerId, winner: PlayerId): void {
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    status = flow.submit(discarder, { type: "discard", payload: { tileId: drawn } });
    if (status.kind !== "awaiting") throw new Error("expected reaction");
    for (const prompt of status.prompts) {
      if (prompt.player === winner) continue;
      flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    flow.submit(winner, { type: "win", payload: {} });
  }

  /** p0(친)가 8m을 버려 p1의 순정구련보등(역만)에 방총 */
  function yakumanState(): GameState {
    return craft({
      hands: {
        p0: "2358p2358s1234z8m",
        p1: "1112345678999m",
        p2: "147s147p2233445z",
        p3: "258s369p5566677z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  /** p0(친)가 9m을 버려 p1의 청일색(하네만, 구련이 아니라 역만 아님)에 방총 */
  function haneState(): GameState {
    return craft({
      hands: {
        p0: "2358p2358s1234z9m",
        p1: "2233445567899m",
        p2: "147s147p2233445z",
        p3: "258s369p5566677z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  it("역만 방총이면 손실 전액이 무효화된다", () => {
    const base = createStandardGameFromState(yakumanState());
    runRon(base, "p0", "p1");
    expect(lastSettled(base).deltas["p0"] ?? 0).toBeLessThanOrEqual(-32000);

    const game = createStandardGameFromState(
      withAugments(yakumanState(), { p0: ["yakuman_shield"] }),
    );
    installAugment(game.engine, yakumanShield, "p0", { yaku: game.yaku });
    runRon(game, "p0", "p1");

    expect(lastSettled(game).deltas["p0"]).toBe(0);
    // 누적 방어 횟수가 전원 공개 채널에 실린다
    expect(game.engine.state.augmentData["yakuman_shield:used:p0"]).toBe(1);
    expect(game.engine.state.augmentData["view:*:yakuman_shield:p0"]).toBe(1);
  });

  it("횟수 제한이 없다 — 이미 여러 번 막았어도 계속 막는다 (2026-07-26 밸런스)", () => {
    const game = createStandardGameFromState(
      withData(withAugments(yakumanState(), { p0: ["yakuman_shield"] }), {
        "yakuman_shield:used:p0": 5,
      }),
    );
    installAugment(game.engine, yakumanShield, "p0", { yaku: game.yaku });
    runRon(game, "p0", "p1");

    expect(lastSettled(game).deltas["p0"]).toBe(0);
    expect(game.engine.state.augmentData["yakuman_shield:used:p0"]).toBe(6);
  });

  it("하네만은 막지 않는다 — 역만 전용이다 (2026-07-26 밸런스)", () => {
    const base = createStandardGameFromState(haneState());
    runRon(base, "p0", "p1");
    const baseDelta = lastSettled(base).deltas["p0"] ?? 0;
    expect(baseDelta).toBeLessThanOrEqual(-12000); // 하네만 이상 실점

    const game = createStandardGameFromState(
      withAugments(haneState(), { p0: ["yakuman_shield"] }),
    );
    installAugment(game.engine, yakumanShield, "p0", { yaku: game.yaku });
    runRon(game, "p0", "p1");
    expect(lastSettled(game).deltas["p0"]).toBe(baseDelta);
    expect(game.engine.state.augmentData["yakuman_shield:used:p0"]).toBeUndefined();
  });

  it("만관 이하 방총에는 발동하지 않는다", () => {
    const mangan = (): GameState =>
      craft({
        hands: {
          p0: "129m258p369s124z5s",
          p1: "234m345p345s678s5s",
          p2: "147m147p147s2233z",
          p3: "258m369p258s4455z",
        },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      });
    const base = createStandardGameFromState(mangan());
    runRon(base, "p0", "p1");
    const game = createStandardGameFromState(
      withAugments(mangan(), { p0: ["yakuman_shield"] }),
    );
    installAugment(game.engine, yakumanShield, "p0", { yaku: game.yaku });
    runRon(game, "p0", "p1");
    expect(lastSettled(game).deltas["p0"]).toBe(lastSettled(base).deltas["p0"]);
    expect(game.engine.state.augmentData["yakuman_shield:used:p0"]).toBeUndefined();
  });
});

describe("nagashi_yakuman (유국역만) — 무울림 조건 삭제", () => {
  /** 패산이 비어 유국 직전인 상태 (p0의 버림은 전부 요구패·자패) */
  function drawState(): GameState {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z567z" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    return {
      ...s,
      zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } },
    };
  }

  function settleDraw(game: Game): RoundSettledPayload {
    sys(game, "sys.settleDraw");
    return lastSettled(game);
  }

  it("자패까지 인정하며, 울림 기록이 있어도 성립한다", () => {
    const base = settleDraw(createStandardGameFromState(drawState()));

    // 예전에 불성립 사유였던 called 플래그를 심어도 이제는 성립한다
    const game = createStandardGameFromState(
      withData(withAugments(drawState(), { p0: ["nagashi_yakuman"] }), {
        "nagashi_yakuman:called:p0": "1-1-0",
      }),
    );
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const settled = settleDraw(game);

    for (const id of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const diff = (settled.deltas[id] ?? 0) - (base.deltas[id] ?? 0);
      expect(diff).toBe(id === "p0" ? 48000 : -16000);
    }
  });

  it("버림에 중장패가 섞이면 여전히 불성립", () => {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z5m" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    const st = { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
    const base = settleDraw(createStandardGameFromState(st));
    const game = createStandardGameFromState(
      withAugments(st, { p0: ["nagashi_yakuman"] }),
    );
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    expect(settleDraw(game).deltas["p0"]).toBe(base.deltas["p0"]);
  });
});

describe("last_stand (승부수) — 패산 조건 삭제", () => {
  function setup(): Game {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withRiichi(withAugments(state, { p0: ["last_stand"] }), "p0"),
    );
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
    return game;
  }

  it("패산이 가득 남아 있어도 리치를 취소할 수 있다", () => {
    const game = setup();
    expect(game.engine.state.zones[WALL]?.tileIds.length ?? 0).toBeGreaterThan(10);
    expect(validateOf(game, "cancel_riichi", "p0", {})).toBeNull();

    const before = game.engine.state.players[0]?.score ?? 0;
    submitOk(game, "p0", "cancel_riichi", {});
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).toBeNull();
    expect(game.engine.state.round.byPlayer["p0"]?.riichiFuriten).toBe(false);
    expect(game.engine.state.players[0]?.score).toBe(before + 1000);
  });

  it("국당 1회 — 두 번째는 거부된다 (리치 중이 아니어도 거부)", () => {
    const game = setup();
    submitOk(game, "p0", "cancel_riichi", {});
    expect(validateOf(game, "cancel_riichi", "p0", {})).toBe("already used this round");
  });
});

// ───────────────────────── F. 체감 ─────────────────────────

describe("seat_swap (자리 바꿈) — 즉시 적용", () => {
  function firstTurnState(): GameState {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return { ...s, round: { ...s.round, firstTurn: true } };
  }

  function setup(state: GameState): Game {
    const game = createStandardGameFromState(
      withAugments(state, { p0: ["seat_swap"] }),
    );
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    return game;
  }

  const seatOf = (game: Game, id: PlayerId): number =>
    game.engine.state.players.find((p) => p.id === id)?.seat ?? -1;

  it("국 첫 순에 선언하면 즉시 자리와 손패가 통째로 바뀐다 (오야가 뒤바뀐다)", () => {
    const game = setup(firstTurnState());
    const s0 = game.engine.state;
    const p0Before = [...handIdsOf(s0, "p0")];
    const p2Before = [...handIdsOf(s0, "p2")];
    // 발동자에게 남을 쯔모패 (craft: drawnLastFor="p0" → p0 손패 마지막 장)
    const keep = s0.round.lastDrawnTile as TileId;

    expect(validateOf(game, "seat_swap", "p0", { target: "p2" })).toBeNull();
    submitOk(game, "p0", "seat_swap", { target: "p2" });

    expect(seatOf(game, "p0")).toBe(2);
    expect(seatOf(game, "p2")).toBe(0);
    expect(seatOf(game, "p1")).toBe(1);
    expect(seatOf(game, "p3")).toBe(3);
    // 오야 자리(dealerSeat)는 그대로지만 그 자리에 앉은 사람이 바뀐다
    expect(game.engine.state.round.dealerSeat).toBe(0);
    expect(playerAtSeat(game.engine.state, 0).id).toBe("p2");
    // 손패까지 교환 — p0은 p2의 손 + 자기 쯔모패, p2는 p0의 손 − 쯔모패
    const p0After = handIdsOf(game.engine.state, "p0");
    const p2After = handIdsOf(game.engine.state, "p2");
    expect([...p0After].sort()).toEqual([...p2Before, keep].sort());
    expect([...p2After].sort()).toEqual(p0Before.filter((t) => t !== keep).sort());
    // 총 장수 보존
    expect(p0After.length + p2After.length).toBe(p0Before.length + p2Before.length);
    // 진행 중인 턴은 사람을 따라간다 (14장을 쥔 사람이 계속 친다 — 장수 정합성)
    expect(game.engine.state.round.turnSeat).toBe(2);
    expect(playerAtSeat(game.engine.state, game.engine.state.round.turnSeat).id).toBe(
      "p0",
    );
    expect(game.engine.eventLog.some((e) => e.type === "SeatsSwapped")).toBe(true);
  });

  it("동풍전 1회 — 재사용은 거부된다", () => {
    const base = firstTurnState();
    const tonpuu: GameState = { ...base, config: { ...base.config, mode: "tonpuu" } };
    const game = setup(tonpuu);
    submitOk(game, "p0", "seat_swap", { target: "p2" });
    expect(validateOf(game, "seat_swap", "p0", { target: "p1" })).toBe(
      "seat_swap no uses left",
    );
  });

  it("첫 바퀴가 지났으면 거부된다", () => {
    const notFirst = setup(
      (() => {
        const s = firstTurnState();
        return { ...s, round: { ...s.round, firstTurn: false } };
      })(),
    );
    expect(validateOf(notFirst, "seat_swap", "p0", { target: "p2" })).toBe(
      "not the first turn of the round",
    );
  });

  // 발동 창은 "아무도 안 버렸을 때"가 아니라 **내가 아직 안 버렸을 때**다.
  // 전자로 잠그면 논리적으로 오야의 첫 액션에서만 참이 되어, 이 증강이 오야 자리를
  // 훔치는 게 아니라 넘겨주는 물건이 되어 버린다(docs/16 §1b F).
  it("앞사람이 이미 버렸어도 내 첫 순이면 쓸 수 있다", () => {
    const othersDiscarded = setup(
      (() => {
        const s = craft({
          hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
          discards: { p3: "1m" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        });
        return { ...s, round: { ...s.round, firstTurn: true } };
      })(),
    );
    expect(validateOf(othersDiscarded, "seat_swap", "p0", { target: "p2" })).toBeNull();
  });

  it("내가 이미 버린 뒤에는 거부된다", () => {
    const mineDiscarded = setup(
      (() => {
        const s = craft({
          hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
          discards: { p0: "1m" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        });
        return { ...s, round: { ...s.round, firstTurn: true } };
      })(),
    );
    expect(validateOf(mineDiscarded, "seat_swap", "p0", { target: "p2" })).toBe(
      "you already discarded this round",
    );
  });
});

describe("let_it_ride (판돈 굴리기) — 연승 배수", () => {
  /** p0가 그대로 쯔모 화료할 수 있는 상태 */
  function winState(): GameState {
    return craft({
      hands: {
        p0: "234m34555p345678s",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  function runTsumo(game: Game): RoundSettledPayload {
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const win = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "win");
    if (win === undefined) throw new Error("no win option");
    flow.submit("p0", win);
    return lastSettled(game);
  }

  function setup(streak?: number): Game {
    let st = withAugments(winState(), { p0: ["let_it_ride"] });
    if (streak !== undefined) st = withData(st, { "let_it_ride:streak:p0": streak });
    const game = createStandardGameFromState(st);
    installAugment(game.engine, letItRide, "p0", { yaku: game.yaku });
    return game;
  }

  const baseGain = (): number => {
    const base = createStandardGameFromState(winState());
    return runTsumo(base).deltas["p0"] ?? 0;
  };

  it("첫 화료는 2배, 2연승은 3배, 3연승 이상은 4배(상한)", () => {
    const gain = baseGain();
    expect(gain).toBeGreaterThan(0);
    expect(runTsumo(setup()).deltas["p0"]).toBe(gain * 2);
    expect(runTsumo(setup(1)).deltas["p0"]).toBe(gain * 3);
    expect(runTsumo(setup(2)).deltas["p0"]).toBe(gain * 4);
    expect(runTsumo(setup(9)).deltas["p0"]).toBe(gain * 4); // 상한
  });

  it("화료하면 연승이 오르고 다음 배수가 전원에게 공개된다", () => {
    const game = setup(1);
    runTsumo(game);
    expect(game.engine.state.augmentData["let_it_ride:streak:p0"]).toBe(2);
    expect(game.engine.state.augmentData["view:*:let_it_ride:p0"]).toEqual({
      streak: 2,
      multiplier: 4,
    });
  });

  it("유국이면 연승이 초기화된다 (잃는 점수는 없다)", () => {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    const st = withData(
      withAugments(
        { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } },
        { p0: ["let_it_ride"] },
      ),
      { "let_it_ride:streak:p0": 2 },
    );
    const game = createStandardGameFromState(st);
    installAugment(game.engine, letItRide, "p0", { yaku: game.yaku });
    sys(game, "sys.settleDraw");
    expect(game.engine.state.augmentData["let_it_ride:streak:p0"]).toBe(0);
    expect(game.engine.state.augmentData["view:*:let_it_ride:p0"]).toEqual({
      streak: 0,
      multiplier: 2,
    });
  });

  it("방총하면 연승이 초기화된다", () => {
    const ronState = craft({
      hands: {
        p0: "129m258p369s124z5s",
        p1: "234m345p345s678s5s",
        p2: "147m147p147s2233z",
        p3: "258m369p258s4455z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withData(withAugments(ronState, { p0: ["let_it_ride"] }), {
        "let_it_ride:streak:p0": 2,
      }),
    );
    installAugment(game.engine, letItRide, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    status = flow.submit("p0", { type: "discard", payload: { tileId: drawn } });
    if (status.kind !== "awaiting") throw new Error("expected reaction");
    for (const prompt of status.prompts) {
      if (prompt.player === "p1") continue;
      flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    flow.submit("p1", { type: "win", payload: {} });

    expect(game.engine.state.augmentData["let_it_ride:streak:p0"]).toBe(0);
  });
});

// ───────────────────────── 실게임 크래시 스위프 ─────────────────────────

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

/** 증강을 p0에 얹고 한 국을 완주시킨다. 예외가 나면 실패 */
function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  // 보유 검사(player.augments)가 있는 증강이라 직접 넣어 액션 경로까지 태운다
  game.engine.state.players.find((p) => p.id === "p0")?.augments.push(aug.id);
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

describe("52차 C·D·F 버프 — 실게임 한 국 크래시 스위프", () => {
  const AUGMENTS: AugmentDef[] = [
    rinshanPreview,
    peekRiichiWaits,
    uraPeek,
    yakumanShield,
    nagashiYakuman,
    lastStand,
    seatSwap,
    letItRide,
  ];
  const SEEDS = [1, 7, 42, 999];
  for (const aug of AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
