/**
 * QA 2차 aug-2 확정 10건의 회귀 테스트 (2026-08-22).
 *
 * 원 보고서는 `qa-lab/round2/aug-2.md`, 손으로 돌리는 재현 스크립트는
 * `qa-lab/round2/aug-2/` 에 있다. 여기 있는 것은 그 재현들을 **조립 상태 그대로**
 * 옮겨 붙인 것이라, 수정을 되돌리면 하나씩 다시 빨개진다.
 *
 * 확정 1  🔴 full_hand_swap — 깡↔퐁 조합에서 손패가 영구히 ±1장 (util.sameHandSize)
 * 확정 2  🔴 full_hand_swap·hand_swap3 — 강탈·교환으로 만든 손에 천화 48,000
 * 확정 3  🟠 foresight — 오야 깡 한 번에 재배열이 증발하고 쿨다운이 짧아진다
 * 확정 4  🟠 foresight — 패산 앞을 쯔모 아닌 경로로 먹으면 예언이 유령 패를 가리킨다
 * 확정 5  🟠 honor_return·regret — 배패를 고쳐 놓고 천화·지화 게이트가 열려 있다
 * 확정 6  🔴 joker — 리치 후에 켜서 고정돼야 할 대기가 2종 → 34종
 * 확정 7  🔴 free_riichi_discard — 남이 내 숨은 리치를 풀면 그 국이 통째로 벽돌
 * 확정 8  🔴 last_stand — 취소 뒤 같은 국 재리치로 일발 재장전 + 후리텐 세탁
 * 확정 9  🟡 jackpot — "그 국에 얻는 점수"라 적어 놓고 유국 획득에는 안 붙는다
 * 확정 10 🟡 giant_god — 후로하면 각성 불가인데 카드에 그 말이 없다
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  winHandKindsOf,
  winningKinds,
} from "@majak/core";
import type {
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { concealedSlotsOf, sameHandSize } from "../src/util.js";
import { handAlteredKey } from "../src/augments/handAltered.js";
import { foresight } from "../src/augments/foresight.js";
import { freeRiichiDiscard } from "../src/augments/free_riichi_discard.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { futureSight } from "../src/augments/future_sight.js";
import { giantGod } from "../src/augments/giant_god.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { honorReturn } from "../src/augments/honor_return.js";
import { jackpot } from "../src/augments/jackpot.js";
import { joker } from "../src/augments/joker.js";
import { lastStand } from "../src/augments/last_stand.js";
import { regret } from "../src/augments/regret.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 좌석에 증강 id를 얹는다 (설치는 호출자가 installAugment로 따로) */
function withAugs(s: GameState, m: Partial<Record<PlayerId, string[]>>): GameState {
  return {
    ...s,
    players: s.players.map((p) =>
      m[p.id] === undefined ? p : { ...p, augments: [...(m[p.id] as string[])] },
    ),
  };
}

/** 보유자 턴 후보를 엔진에서 그대로 꺼낸다 (재현 스크립트와 같은 경로) */
function turnOptionTypes(game: Game, p: PlayerId): string[] {
  const provs = (
    game.engine as unknown as {
      turnOptionProviders: ((s: GameState, id: PlayerId) => { type: string }[])[];
    }
  ).turnOptionProviders;
  return provs.flatMap((f) => f(game.engine.state, p)).map((o) => o.type);
}

/** 손패에서 특정 kind의 tileId들 */
function idsOfKind(state: GameState, p: PlayerId, key: string): TileId[] {
  return handIdsOf(state, p).filter((id) => kindKey(kindOf(state, id)) === key);
}

/** 정산 인터셉터 전부를 순서대로 통과시킨다 */
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

/** 이벤트 로그에서 정산된 역 id 목록 */
function settledYaku(game: Game): string[] {
  const out: string[] = [];
  for (const e of game.engine.eventLog.filter((x: GameEvent) => x.type === ROUND_SETTLED)) {
    const p = e.payload as { winInfos?: { yaku: { id: string }[] }[] };
    for (const wi of p.winInfos ?? []) out.push(...wi.yaku.map((y) => y.id));
  }
  return out;
}

// ─────────────── 확정 1 · 통째로 바꾸기의 손패 장수 가드 ───────────────

describe("확정 1 · sameHandSize는 멘쯔 개수가 아니라 손패 슬롯 수를 본다", () => {
  /** p3 = 깡 1개(손패 10 + 영상 쯔모 1), p1 = 퐁 1개(손패 11) */
  function kanVsPon(): Game {
    const base = craft({
      hands: {
        p0: "*",
        p1: "123m456m789m12p", // 11장 — 퐁 하나를 가진 사람의 정상 손패
        p2: "*",
        p3: "1234s5678s99s1p", // 11장 = 깡 하나(손패 10) + 영상 쯔모 1장
      },
      melds: {
        p1: [{ kind: "pon", spec: "555p", from: "p0" }],
        p3: [{ kind: "kan_open", spec: "3333z", from: "p2" }],
      },
      phase: "turn.act",
      turnSeat: 3,
      drawnLastFor: "p3",
    });
    const game = createStandardGameFromState(withAugs(base, { p3: ["full_hand_swap"] }));
    installAugment(game.engine, fullHandSwap, "p3", { yaku: game.yaku });
    return game;
  }

  it("깡 1개와 퐁 1개는 멘쯔 개수가 같아도 손패 장수가 다르다", () => {
    const game = kanVsPon();
    const st = game.engine.state;
    // 개수만 보던 옛 가드는 여기서 true를 냈다 (1 === 1)
    expect(meldCountOf(st, "p3")).toBe(meldCountOf(st, "p1"));
    expect(concealedSlotsOf(st, "p3")).toBe(10); // 깡이 손에서 3장을 가져갔다
    expect(concealedSlotsOf(st, "p1")).toBe(11); // 퐁은 2장
    expect(sameHandSize(game.engine.rules, st, "p3", "p1")).toBe(false);
  });

  it("깡 보유자는 퐁 보유자를 털 수 없다 — 성사되면 손패가 영구히 12장이 됐다", () => {
    const game = kanVsPon();
    const r = game.engine.submit({ player: "p3", type: "hand_swap", payload: { target: "p1" } });
    expect(r.ok).toBe(false);
    const st = game.engine.state;
    expect(handIdsOf(st, "p3").length).toBe(11);
    expect(handIdsOf(st, "p1").length).toBe(11);
  });

  it("같은 종류의 후로끼리는 그대로 통과한다 (가드가 과하지 않다)", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m12p", p2: "*", p3: "123s456s789s12p1m" },
      melds: {
        p1: [{ kind: "pon", spec: "555p", from: "p0" }],
        p3: [{ kind: "pon", spec: "666p", from: "p2" }],
      },
      phase: "turn.act",
      turnSeat: 3,
      drawnLastFor: "p3",
    });
    const game = createStandardGameFromState(withAugs(base, { p3: ["full_hand_swap"] }));
    installAugment(game.engine, fullHandSwap, "p3", { yaku: game.yaku });
    expect(sameHandSize(game.engine.rules, game.engine.state, "p3", "p1")).toBe(true);
    const r = game.engine.submit({ player: "p3", type: "hand_swap", payload: { target: "p1" } });
    expect(r.ok).toBe(true);
    // 교환 뒤에도 양쪽 다 규칙값 그대로다 (p3은 쯔모패를 손에 쥔 채라 11+1)
    expect(handIdsOf(game.engine.state, "p3").length).toBe(12);
    expect(handIdsOf(game.engine.state, "p1").length).toBe(11);
  });
});

// ─────────────── 확정 2 · 강탈·교환으로 만든 손에는 천화가 없다 ───────────────

describe("확정 2 · 손패를 갈아 끼우는 증강은 천화·지화 게이트를 닫는다", () => {
  it("통째로 바꾸기로 완성한 손에 천화가 붙지 않는다", () => {
    const base = craft({
      hands: {
        p0: "123456789m1234s1p", // 14장 — 마지막(쯔모패)이 1p
        p1: "123m456m789m234s1p", // 13장 — 1p 한 장이면 이미 완성형
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAugs(base, { p0: ["full_hand_swap"] }),
      // 국의 첫 바퀴 = 천화 창 (craft 기본은 false라 되돌린다)
      round: { ...base.round, firstTurn: true, turnCount: 1 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });

    expect(game.engine.submit({ player: "p0", type: "hand_swap", payload: { target: "p1" } }).ok).toBe(true);
    // 강탈자·대상 **양쪽** 다 배패가 아닌 손이 됐다
    expect(game.engine.state.augmentData[handAlteredKey(game.engine.state, "p0")]).toBe(true);
    expect(game.engine.state.augmentData[handAlteredKey(game.engine.state, "p1")]).toBe(true);

    const drawn = game.engine.state.round.lastDrawnTile;
    const w = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
    });
    expect(w.ok).toBe(true);
    expect(settledYaku(game)).not.toContain("tenhou");
  });

  it("등가교환은 3장만 바꿔도 게이트를 닫는다 — 교환 당사자 양쪽 모두", () => {
    const base = craft({
      hands: {
        p0: "123456789m1s2s3s5p", // 14장
        p1: "555p666p777p888p9p", // 13장 + 넘겨줄 여유
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAugs(base, { p0: ["hand_swap3"] }),
      round: { ...base.round, firstTurn: true, turnCount: 1 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    expect(game.engine.submit({ player: "p0", type: "swap3", payload: { target: "p1" } }).ok).toBe(true);
    const gives = handIdsOf(game.engine.state, "p0")
      .filter((id) => kindKey(kindOf(game.engine.state, id)).startsWith("sou"))
      .slice(0, 3);
    expect(gives.length).toBe(3);
    expect(game.engine.submit({ player: "p0", type: "swap3_give", payload: { gives } }).ok).toBe(true);
    const takes = handIdsOf(game.engine.state, "p1").slice(0, 3);
    expect(game.engine.submit({ player: "p0", type: "swap3_take", payload: { takes } }).ok).toBe(true);

    const st = game.engine.state;
    expect(st.augmentData[handAlteredKey(st, "p0")]).toBe(true);
    expect(st.augmentData[handAlteredKey(st, "p1")]).toBe(true);
  });
});

// ─────────────── 확정 3·4 · 예지 ───────────────

describe("확정 3 · 예지의 순 기준은 turnCount가 아니라 보유자의 discardCount다", () => {
  function revealed(): Game {
    const base = craft({
      hands: { p0: "1111z234m567m99p1s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugs(base, { p0: ["foresight"] }));
    installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
    expect(game.engine.submit({ player: "p0", type: "foresight_reveal", payload: {} }).ok).toBe(true);
    return game;
  }

  it("오야가 같은 순에 깡을 쳐도 재배열 후보와 쿨다운이 그대로다", () => {
    const game = revealed();
    const orders = (): number =>
      turnOptionTypes(game, "p0").filter((t) => t === "foresight_order").length;
    const cd = (): unknown => game.engine.state.augmentData["view:p0:cooldownTurns:foresight"];
    expect(orders()).toBe(24);
    expect(cd()).toBe(4);

    const ids = idsOfKind(game.engine.state, "p0", "wind1");
    expect(game.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } }).ok).toBe(true);
    expect(game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.drawRinshan", payload: {} }).ok).toBe(true);

    // 영상 쯔모로 turnCount는 실제로 올랐다 — 그런데도 이번 발동분은 살아 있다
    expect(game.engine.state.round.turnCount).toBe(1);
    expect(orders()).toBe(24);
    expect(cd()).toBe(4);
  });

  it("내가 버리면 그 순이 끝난다 — 재배열 창이 닫히고 쿨다운이 준다", () => {
    const game = revealed();
    const st = game.engine.state;
    const tile = handIdsOf(st, "p0").find((id) => kindKey(kindOf(st, id)) === "sou1") as TileId;
    expect(game.engine.submit({ player: "p0", type: "discard", payload: { tileId: tile } }).ok).toBe(true);
    expect(turnOptionTypes(game, "p0").filter((t) => t === "foresight_order").length).toBe(0);
    expect(game.engine.state.augmentData["view:p0:cooldownTurns:foresight"]).toBe(3);
  });
});

describe("확정 4 · 예지는 매 이벤트마다 패산 앞에서 예언을 다시 만든다", () => {
  it("미래를 보는 자가 패산 앞을 갈아 끼우면 예언도 함께 따라간다", () => {
    const base = craft({
      hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z3z", p1: "1z", p2: "1z", p3: "1z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugs(base, { p0: ["foresight", "future_sight"] }));
    installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });

    const front = (n = 4): string[] =>
      (game.engine.state.zones[WALL]?.tileIds ?? [])
        .slice(0, n)
        .map((id) => kindKey(kindOf(game.engine.state, id)));
    const peek = (): unknown => game.engine.state.augmentData["view:p0:foresight_peek#round"]
      ?? game.engine.state.augmentData[
        Object.keys(game.engine.state.augmentData).find((k) => k.includes("foresight_peek")) ?? ""
      ];

    const before = front();
    expect(game.engine.submit({ player: "p0", type: "foresight_reveal", payload: {} }).ok).toBe(true);
    expect(peek()).toEqual(before);

    expect(game.engine.submit({ player: "p0", type: "future_arm", payload: {} }).ok).toBe(true);
    const provs = (
      game.engine as unknown as {
        turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string; payload: unknown }[])[];
      }
    ).turnOptionProviders;
    const opts = provs
      .flatMap((f) => f(game.engine.state, "p0"))
      .filter((o) => o.type === "future_exchange");
    expect(opts.length).toBeGreaterThan(0);
    expect(
      game.engine.submit({ player: "p0", type: "future_exchange", payload: opts[0]!.payload as never }).ok,
    ).toBe(true);

    const after = front();
    expect(after).not.toEqual(before); // 패산 앞이 실제로 바뀌었다
    // 예전에는 여기서 옛 4장(이미 p0 손에 들어간 패)을 계속 보여 줬다
    expect(peek()).toEqual(after);
  });
});

// ─────────────── 확정 5 · 배패를 고쳐 쓰는 크로스국 주입 ───────────────

describe("확정 5 · 배패를 고쳐 쓰면 천화·지화 게이트를 닫는다", () => {
  /** 지난 국의 기억을 얹고 ROUND_STARTED만 태운다 (배패는 이미 끝난 것으로 본다) */
  function injectAtRoundStart(
    augId: string,
    def: Parameters<typeof installAugment>[1],
    data: Record<string, unknown>,
  ): Game {
    const base = craft({
      hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAugs(base, { p0: [augId] }),
      round: { ...base.round, phase: "round.over" as const },
      augmentData: { ...base.augmentData, ...data },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, def, "p0", { yaku: game.yaku });
    expect(game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} }).ok).toBe(true);
    return game;
  }

  it("귀환(honor_return)은 자패를 되받아 넣고 게이트를 닫는다", () => {
    const game = injectAtRoundStart("honor_return", honorReturn, {
      "honor_return:keep:p0": [
        { suit: "dragon", rank: 1 },
        { suit: "dragon", rank: 1 },
        { suit: "dragon", rank: 1 },
        { suit: "wind", rank: 1 },
      ],
    });
    const st = game.engine.state;
    expect(idsOfKind(st, "p0", "dragon1").length).toBeGreaterThan(0); // 주입은 실제로 일어났다
    expect(st.augmentData[handAlteredKey(st, "p0")]).toBe(true);
  });

  it("미련(regret)도 같은 크로스국 주입이라 같은 규약을 따른다", () => {
    const kept = [
      { suit: "man", rank: 1 }, { suit: "man", rank: 2 }, { suit: "man", rank: 3 },
      { suit: "man", rank: 4 }, { suit: "man", rank: 5 }, { suit: "man", rank: 6 },
      { suit: "man", rank: 7 }, { suit: "man", rank: 8 }, { suit: "man", rank: 9 },
      { suit: "pin", rank: 1 }, { suit: "pin", rank: 1 },
      { suit: "sou", rank: 5 }, { suit: "sou", rank: 5 },
    ];
    const game = injectAtRoundStart("regret", regret, { "regret:keep:p0": kept });
    const st = game.engine.state;
    expect(st.augmentData[handAlteredKey(st, "p0")]).toBe(true);
  });
});

// ─────────────── 확정 6 · 조커 ───────────────

describe("확정 6 · 조커는 리치 중에 켤 수 없다", () => {
  function riichiJoker(): Game {
    const base = craft({
      hands: { p0: "234m567m234p55p5z5z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAugs(base, { p0: ["joker"] }),
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer.p0!,
            riichi: { double: false, ippatsu: false, discardIndex: 0, discardTileId: -1, cost: 1000 },
          },
        },
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, joker, "p0", { yaku: game.yaku });
    return game;
  }

  const waitsOf = (game: Game): string[] => {
    const st = game.engine.state;
    const hand13 = winHandKindsOf(st, game.engine.rules, "p0").slice(0, 13);
    return winningKinds(
      hand13,
      meldCountOf(st, "p0"),
      undefined,
      scoringOptionsOf(st, game.engine.rules, "p0"),
    ).map(kindKey);
  };

  it("리치로 잠긴 대기 2종이 34종으로 풀리지 않는다", () => {
    const game = riichiJoker();
    const before = waitsOf(game);
    expect(before).toEqual(["pin5", "dragon1"]);
    const r = game.engine.submit({ player: "p0", type: "joker_call", payload: {} });
    expect(r.ok).toBe(false);
    expect(waitsOf(game)).toEqual(before);
  });

  it("리치 중에는 후보 자체가 뜨지 않는다 (강제 쯔모기리 자동 진행 보존)", () => {
    expect(turnOptionTypes(riichiJoker(), "p0")).not.toContain("joker_call");
  });

  /*
   * 의심 8 → 확정. 조커는 패를 갈아 끼우지 않고 해석만 바꾸지만, 오야가 첫 순에 켜면
   * 완성돼 있지 **않던** 배패가 그 자리에서 완성형으로 읽혀 천화 48,000이 붙었다.
   * 재현: `qa-lab/round2/aug-2/p_joker_tenhou.ts`
   */
  it("오야가 첫 순에 켜서 만든 완성형에 천화가 붙지 않는다", () => {
    const base = craft({
      // 백 두 장이 조커가 되면 234통이 채워져 완성형 — 조커가 없으면 미완성이다
      hands: { p0: "123m456m789m11p2p5z5z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAugs(base, { p0: ["joker"] }),
      round: { ...base.round, firstTurn: true, turnCount: 1, dealerSeat: 0 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, joker, "p0", { yaku: game.yaku });
    expect(game.engine.submit({ player: "p0", type: "joker_call", payload: {} }).ok).toBe(true);
    expect(game.engine.state.augmentData[handAlteredKey(game.engine.state, "p0")]).toBe(true);

    const drawn = game.engine.state.round.lastDrawnTile;
    const w = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
    });
    expect(w.ok).toBe(true);
    // 조커 자체는 멀쩡히 일한다 — 사라지는 것은 역만뿐이다
    const yaku = settledYaku(game);
    expect(yaku).not.toContain("tenhou");
    expect(yaku).toContain("menzen_tsumo");
  });

  it("리치가 아니면 평소대로 켤 수 있다", () => {
    const base = craft({
      hands: { p0: "234m567m234p55p5z5z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugs(base, { p0: ["joker"] }));
    installAugment(game.engine, joker, "p0", { yaku: game.yaku });
    expect(turnOptionTypes(game, "p0")).toContain("joker_call");
    expect(game.engine.submit({ player: "p0", type: "joker_call", payload: {} }).ok).toBe(true);
  });
});

// ─────────────── 확정 7 · 자유 선언 ───────────────

describe("확정 7 · 남이 내 숨은 리치를 풀면 스냅샷도 함께 걷힌다", () => {
  it("리치가 풀린 뒤 화료 판정은 물리 손패로 돌아간다", () => {
    const base = craft({
      hands: {
        p0: "123m456m789m123p11s",
        p1: "456p789p234s567s99s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = withAugs(base, {
      p0: ["stealth_riichi", "free_riichi_discard"],
      p1: ["full_hand_swap"],
    });
    const g1 = createStandardGameFromState(state);
    installAugment(g1.engine, freeRiichiDiscard, "p0", { yaku: g1.yaku });
    installAugment(g1.engine, stealthRiichi, "p0", { yaku: g1.yaku });
    installAugment(g1.engine, fullHandSwap, "p1", { yaku: g1.yaku });

    const pick = idsOfKind(g1.engine.state, "p0", "sou1")[0] as TileId;
    expect(g1.engine.submit({ player: "p0", type: "stealth_riichi", payload: { tileId: pick } }).ok).toBe(true);
    const snapOf = (st: GameState): unknown[] => {
      const k = Object.keys(st.augmentData).find((x) => x.startsWith("free_riichi_discard:snap"));
      return k === undefined ? [] : ((st.augmentData[k] ?? []) as unknown[]);
    };
    expect(snapOf(g1.engine.state).length).toBe(13);

    // p1의 차례로 넘겨 통째로 바꾸기로 p0을 턴다 (숨은 리치는 대상 허용)
    const st2 = g1.engine.state;
    const forced: GameState = {
      ...st2,
      round: {
        ...st2.round,
        phase: "turn.act",
        turnSeat: 1,
        turnCount: 1,
        lastDrawnTile: handIdsOf(st2, "p1")[0] as TileId,
      },
    };
    const g2 = createStandardGameFromState(forced);
    installAugment(g2.engine, freeRiichiDiscard, "p0", { yaku: g2.yaku });
    installAugment(g2.engine, stealthRiichi, "p0", { yaku: g2.yaku });
    installAugment(g2.engine, fullHandSwap, "p1", { yaku: g2.yaku });
    expect(g2.engine.submit({ player: "p1", type: "hand_swap", payload: { target: "p0" } }).ok).toBe(true);

    const st3 = g2.engine.state;
    expect(st3.round.byPlayer.p0?.riichi ?? null).toBeNull(); // 리치는 실제로 풀렸다
    expect(snapOf(st3).length).toBe(0);
    // 예전에는 여기가 "지금 p1 손에 있는 옛 13장"이었다
    expect(g2.engine.rules.resolve("hand.winTileIds", { playerId: "p0", state: st3 })).toBeNull();
    // 깡 봉인도 함께 풀린다
    expect(g2.engine.rules.resolve("call.kan.enabled", { playerId: "p0", state: st3 })).not.toBe(false);
  });
});

// ─────────────── 확정 8 · 승부수 ───────────────

describe("확정 8 · 리치를 취소한 국에는 다시 걸 수 없다", () => {
  it("재리치가 막혀 일발 재장전도 후리텐 세탁도 일어나지 않는다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const aug = withAugs(base, { p0: ["last_stand"] });
    const state: GameState = {
      ...aug,
      round: {
        ...base.round,
        riichiPot: 1000,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer.p0!,
            discardCount: 4,
            riichi: { double: false, ippatsu: false, discardIndex: 3, discardTileId: -1, cost: 1000 },
            riichiFuriten: true,
          },
        },
      },
      players: aug.players.map((p) => (p.id === "p0" ? { ...p, score: 24000 } : p)),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });

    expect(game.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} }).ok).toBe(true);
    expect(game.engine.state.round.byPlayer.p0?.riichi ?? null).toBeNull();
    // 폴드는 정상적으로 성립한다 — 리치봉을 돌려받는다
    expect(game.engine.state.players[0]!.score).toBe(25000);

    const tile = idsOfKind(game.engine.state, "p0", "sou1")[0] as TileId;
    const again = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: tile } });
    expect(again.ok).toBe(false);
    const after = game.engine.state.round.byPlayer.p0!;
    expect(after.riichi).toBeNull();
    expect(game.engine.state.round.riichiPot).toBe(0);
    expect(game.engine.state.players[0]!.score).toBe(25000);
  });

  it("취소하지 않은 국의 리치는 그대로 걸린다 (가드가 과하지 않다)", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugs(base, { p0: ["last_stand"] }));
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
    const tile = idsOfKind(game.engine.state, "p0", "sou1")[0] as TileId;
    expect(game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: tile } }).ok).toBe(true);
  });
});

// ─────────────── 확정 9 · 잭팟 ───────────────

describe("확정 9 · 잭팟은 '그 국에 얻는 점수'에 붙는다 — 유국 획득도 포함", () => {
  function rolled(mult: number): Game {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const r = base.round;
    const key = `jackpot:mult:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0#round`;
    const state: GameState = {
      ...withAugs(base, { p0: ["jackpot"] }),
      augmentData: { ...base.augmentData, [key]: mult },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, jackpot, "p0", { yaku: game.yaku });
    return game;
  }

  const drawPayload = (g: Game, deltas: Record<string, number>): RoundSettledPayload =>
    ({
      outcome: "draw",
      deltas,
      dealerSeat: g.engine.state.round.dealerSeat,
      honba: 0,
      riichiPot: 1000,
      roundNumber: g.engine.state.round.roundNumber,
      prevalentWind: g.engine.state.round.prevalentWind,
      winInfos: [],
    }) as unknown as RoundSettledPayload;

  it("유국 텐파이 수령에도 배수가 붙는다", () => {
    const game = rolled(3);
    const out = runSettle(game, drawPayload(game, { p0: 3000, p1: -1000, p2: -1000, p3: -1000 }));
    expect(out.deltas.p0).toBe(9000);
  });

  it("유국 노텐 벌부는 배수 밖이다 — 남의 룰렛으로 내 벌부가 달라지지 않는다", () => {
    const game = rolled(3);
    const out = runSettle(game, drawPayload(game, { p0: -1000, p1: 3000, p2: -1000, p3: -1000 }));
    expect(out.deltas.p0).toBe(-1000);
  });

  it("도중유국은 델타가 0이라 아무 일도 없다", () => {
    const game = rolled(3);
    const zero = { p0: 0, p1: 0, p2: 0, p3: 0 };
    const out = runSettle(game, {
      ...drawPayload(game, zero),
      outcome: "abort",
    } as unknown as RoundSettledPayload);
    expect(out.deltas.p0).toBe(0);
  });
});

// ─────────────── 확정 10 · 진짜 신 ───────────────

describe("확정 10 · 진짜 신의 카드가 후로 제약을 말한다", () => {
  it("detail에 '한 번이라도 울면 그 국에는 각성할 수 없다'가 적혀 있다", () => {
    expect(giantGod.detail).toContain("치·퐁·깡을 한 번이라도 하면 그 국에는 각성할 수 없다");
  });

  it("실제로도 후로가 하나 있으면 각성 버튼이 나타나지 않는다", () => {
    const kokushi = "1m9m1p9p1s9s1z2z3z4z5z6z7z";
    function scene(melds: boolean): Game {
      const base = craft({
        hands: melds
          ? { p0: "234m567m99p1s2s3s", p1: "*", p2: "*", p3: "*" }
          : { p0: "234m567m99p1s2s3s4s5s6s", p1: "*", p2: "*", p3: "*" },
        ...(melds ? { melds: { p0: [{ kind: "pon" as const, spec: "555p", from: "p1" as PlayerId }] } } : {}),
        discards: { p0: kokushi, p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      });
      const game = createStandardGameFromState(withAugs(base, { p0: ["giant_god"] }));
      installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
      return game;
    }
    // 멘젠이면 버튼이 뜬다 (조건 자체는 채워져 있다)
    expect(turnOptionTypes(scene(false), "p0")).toContain("giant_god");
    // 후로가 하나만 있어도 영영 뜨지 않는다 — 카드가 이제 그 사실을 말한다
    expect(turnOptionTypes(scene(true), "p0")).not.toContain("giant_god");
  });
});
