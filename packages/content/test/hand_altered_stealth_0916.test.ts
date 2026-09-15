/**
 * 2026-09-16 QA 계획(docs/55) 묶음 A-4·A-6의 회귀 테스트.
 *
 *  C-2  자리 바꿈으로 받은 손에 첫 순 쯔모 화료 → 지화 없음 (handAltered 표식)
 *  C-3  선언 간파의 위조로 만든 손에 첫 순 쯔모 화료 → 지화 없음 (handAltered 표식)
 *  C-5  리치 봉인 — 상대가 스텔스 리치 중이어도 내 리치가 «그 국의 첫 리치»라 봉인이 선다
 *  C-5  등 떠밀기 — 스텔스 리치 중인 낙인 대상을 «리치 안 한 사람»으로 취급해 낙인이 터진다
 *
 * 수정을 되돌리면 하나씩 다시 빨개진다. 스텔스 리치 장면은 stealth_swap_target.test.ts와
 * 같은 방식으로 조립한다(riichi 필드 + 국 단위 스텔스 표식 + 증강 설치). 대조군(보이는
 * 리치)은 «효과 자체는 바꾸지 않는다»를 고정한다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
} from "@majak/core";
import type { GameEvent, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundViewKey } from "../src/util.js";
import { handAlteredKey } from "../src/augments/handAltered.js";
import { roundScopedKey } from "../src/augments/roundScope.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { pushRiichi } from "../src/augments/push_riichi.js";
import { riichiSeal } from "../src/augments/riichi_seal.js";
import { seatSwap } from "../src/augments/seat_swap.js";
import { stealthActiveKey, stealthRiichi } from "../src/augments/stealth_riichi.js";

type Game = ReturnType<typeof createStandardGameFromState>;
type Riichi = "open" | "stealth";

/** 좌석에 증강 id를 얹는다 (설치는 호출자가 installAugment로 따로) */
function withAugs(s: GameState, m: Partial<Record<PlayerId, string[]>>): GameState {
  return {
    ...s,
    players: s.players.map((p) =>
      m[p.id] === undefined ? p : { ...p, augments: [...(m[p.id] as string[])] },
    ),
  };
}

/** 이 사람을 리치 상태로 둔다 (선언패 자리 0 = craft의 discards 첫 장) */
function withRiichi(s: GameState, p: PlayerId, double = false): GameState {
  const rs = s.round.byPlayer[p];
  if (rs === undefined) throw new Error(`no round state for ${p}`);
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        [p]: { ...rs, riichi: { double, ippatsu: false, discardIndex: 0 } },
      },
    },
  };
}

/** 스텔스 액션으로 걸었다는 국 단위 표식 — riichi.hidden은 이때만 참이 된다 */
function withStealthMark(s: GameState, p: PlayerId): GameState {
  return { ...s, augmentData: { ...s.augmentData, [stealthActiveKey(s, p)]: true } };
}

/** 남들 눈에 이 사람의 리치가 숨어 있는가 */
function hiddenFor(game: Game, p: PlayerId): boolean {
  return game.engine.rules.resolve<boolean>("riichi.hidden", {
    playerId: p,
    state: game.engine.state,
  });
}

function scoreOf(game: Game, p: PlayerId): number {
  return game.engine.state.players.find((x) => x.id === p)?.score ?? NaN;
}

/** 이벤트 로그의 정산 화료 정보 (역 id 목록) */
function settledWins(game: Game): { yaku: string[] }[] {
  const out: { yaku: string[] }[] = [];
  for (const e of game.engine.eventLog.filter((x: GameEvent) => x.type === ROUND_SETTLED)) {
    const p = e.payload as { winInfos?: { yaku: { id: string }[] }[] };
    for (const wi of p.winInfos ?? []) out.push({ yaku: wi.yaku.map((y) => y.id) });
  }
  return out;
}

/** 첫 순 쯔모 화료를 정산한다 — 천화·지화가 붙는지는 여기서 결정된다 */
function tsumoWin(game: Game, winner: PlayerId): { yaku: string[] }[] {
  const drawn = game.engine.state.round.lastDrawnTile;
  expect(drawn).not.toBeNull();
  expect(handIdsOf(game.engine.state, winner)).toContain(drawn);
  const w = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner, from: null, tileId: drawn, winType: "tsumo" }] },
  });
  expect(w.ok).toBe(true);
  const wins = settledWins(game);
  expect(wins).toHaveLength(1);
  return wins;
}

// ─────────────── C-2 · 자리 바꿈으로 받은 손에는 천화·지화가 없다 ───────────────

describe("C-2 · 자리 바꿈으로 받은 손에는 천화·지화가 없다", () => {
  it("오야가 자와 자리·손을 바꿔 첫 순에 쯔모해도 지화가 붙지 않는다", () => {
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
      ...withAugs(base, { p0: ["seat_swap"] }),
      // 국의 첫 바퀴 = 천화·지화 창 (craft 기본은 false라 되돌린다)
      round: { ...base.round, firstTurn: true, turnCount: 1 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });

    expect(
      game.engine.submit({ player: "p0", type: "seat_swap", payload: { target: "p1" } }).ok,
    ).toBe(true);
    const st = game.engine.state;
    // p0는 이제 자(seat 1)이고, 손은 p1의 13장 + 내 쯔모패 1p = 완성형
    expect(st.players.find((p) => p.id === "p0")?.seat).toBe(1);
    expect(st.round.dealerSeat).toBe(0);
    // 교환 당사자 **양쪽** 다 배패가 아닌 손이 됐다 (통째로 바꾸기·등가교환과 같은 규약)
    expect(st.augmentData[handAlteredKey(st, "p0")]).toBe(true);
    expect(st.augmentData[handAlteredKey(st, "p1")]).toBe(true);

    const [win] = tsumoWin(game, "p0");
    expect(win?.yaku).not.toContain("chihou");
    expect(win?.yaku).not.toContain("tenhou");
  });
});

// ─────────────── C-3 · 선언 간파의 위조로 만든 손에는 천화·지화가 없다 ───────────────

describe("C-3 · 선언 간파의 위조로 만든 손에는 천화·지화가 없다", () => {
  it("오야 더블리치 뒤 자가 첫 순에 간파→위조로 완성해 쯔모해도 지화가 붙지 않는다", () => {
    const base = craft({
      hands: {
        p0: "123m456m789m234s1p", // 13장 — 1p 단기 대기. 첫 버림(9s)으로 더블리치를 걸었다
        p1: "123m456m789m234s1p9s", // 14장 — 쯔모패 9s를 1p로 위조하면 완성형
        // 위조는 "세상에 없는 5번째 장"을 만들지 않는다(copiesLeftUndrawn) — 남은 1p 두 장이
        // 패산에 있어야 하므로 나머지 둘의 손은 "*"(낮은 id부터 자동 채움 = 1p를 삼킨다)가 아니라
        // 자패·삭수로 명시한다.
        p2: "1122334455667z",
        p3: "5566778899s777z",
      },
      discards: { p0: "9s" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    let s = withRiichi(withAugs(base, { p1: ["peek_riichi_waits"] }), "p0", true);
    s = { ...s, round: { ...s.round, firstTurn: true, turnCount: 1 } };
    const game = createStandardGameFromState(s);
    installAugment(game.engine, peekRiichiWaits, "p1", { yaku: game.yaku });

    // 간파 — 오야의 대기는 1p 한 종류
    expect(
      game.engine.submit({ player: "p1", type: "peek_waits", payload: { target: "p0" } }).ok,
    ).toBe(true);
    expect(game.engine.state.augmentData["view:p1:waits:p0"]).toEqual(["pin1"]);

    // 위조 — 쯔모패 9s를 그 1p로
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const forged = game.engine.submit({
      player: "p1",
      type: "peek_forge",
      payload: { tileId: drawn, kind: "pin1" },
    });
    expect(forged.ok, JSON.stringify(forged)).toBe(true);
    const st = game.engine.state;
    expect(st.augmentData[handAlteredKey(st, "p1")]).toBe(true);

    const [win] = tsumoWin(game, "p1");
    expect(win?.yaku).not.toContain("chihou");
    expect(win?.yaku).not.toContain("tenhou");
  });
});

// ─────────────── C-5 · 리치 봉인은 숨은 리치를 리치로 세지 않는다 ───────────────

describe("C-5 · 리치 봉인은 숨은 리치를 리치로 세지 않는다", () => {
  /** p0 = 리치 봉인, 완성형 14장으로 자기 턴. p1은 이미 리치 중(보이는/숨은). */
  function scene(mode: Riichi): Game {
    const base = craft({
      hands: { p0: "123m456m789m123p11p", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
      discards: { p1: "5s" }, // p1의 리치 선언패 자리(discardIndex 0)
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    let s = withRiichi(
      withAugs(base, { p0: ["riichi_seal"], p1: mode === "stealth" ? ["stealth_riichi"] : [] }),
      "p1",
    );
    if (mode === "stealth") s = withStealthMark(s, "p1");
    const game = createStandardGameFromState(s);
    installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });
    if (mode === "stealth") installAugment(game.engine, stealthRiichi, "p1", { yaku: game.yaku });
    return game;
  }

  const banner = (g: Game): unknown => g.engine.state.augmentData[roundViewKey("*", "riichi_seal:p0")];
  const blockedFor = (g: Game, p: PlayerId): boolean =>
    g.engine.rules.resolve<boolean>("riichi.blocked", { playerId: p, state: g.engine.state });

  /** p0가 리치를 선언한다 — 완성형 14장이라 무엇을 버려도 텐파이 (쯔모패 1p를 버린다) */
  function declareRiichi(g: Game): void {
    const tileId = handIdsOf(g.engine.state, "p0")[13] as TileId;
    expect(g.engine.submit({ player: "p0", type: "riichi", payload: { tileId } }).ok).toBe(true);
    expect(g.engine.state.round.byPlayer["p0"]?.riichi).not.toBeNull();
  }

  it("보이는 리치가 먼저 있으면 봉인은 서지 않는다 (대조군 — 효과 불변)", () => {
    const g = scene("open");
    declareRiichi(g);
    expect(banner(g)).not.toBe("봉인");
    expect(blockedFor(g, "p2")).toBe(false);
  });

  it("상대의 숨은 리치는 리치가 아닌 것으로 본다 — 봉인 배너가 서고 이후 리치가 잠긴다", () => {
    const g = scene("stealth");
    expect(hiddenFor(g, "p1")).toBe(true); // 전제: 남들 눈에 p1은 리치가 아니다
    declareRiichi(g);
    // 예전엔 여기서 봉인이 조용히 서지 않아 "누군가 숨은 리치 중"이 보유자에게 샜다
    expect(banner(g)).toBe("봉인");
    expect(blockedFor(g, "p2")).toBe(true);
    expect(blockedFor(g, "p3")).toBe(true);
    expect(blockedFor(g, "p0")).toBe(false); // 보유자 본인은 잠기지 않는다
    // 봉인은 소급하지 않는다 — p1의 숨은 리치는 그대로 살아 있고 여전히 숨어 있다
    expect(g.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    expect(hiddenFor(g, "p1")).toBe(true);
  });
});

// ─────────────── C-5 · 등 떠밀기는 숨은 리치 중인 대상을 «리치 안 한 사람»으로 취급한다 ───────────────

describe("C-5 · 등 떠밀기는 숨은 리치 중인 낙인 대상을 «리치 안 한 사람»으로 취급한다", () => {
  const brandKey = (s: GameState): string => roundScopedKey("push_riichi", "brand", s, "p0");
  const forcedKey = (s: GameState): string => roundScopedKey("push_riichi", "forced", s, "p0");
  const firedKey = roundViewKey("*", "push_riichi:fired:p0");

  /** p0 = 등 떠밀기, p1에게 낙인. p1은 이미 리치 중(보이는/숨은)이고 9s를 버리면 텐파이. */
  function scene(mode: Riichi): Game {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m11p23p9s", p2: "*", p3: "*" },
      discards: { p1: "5s" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    let s = withRiichi(
      withAugs(base, { p0: ["push_riichi"], p1: mode === "stealth" ? ["stealth_riichi"] : [] }),
      "p1",
    );
    if (mode === "stealth") s = withStealthMark(s, "p1");
    s = { ...s, augmentData: { ...s.augmentData, [brandKey(s)]: "p1" } };
    const game = createStandardGameFromState(s);
    installAugment(game.engine, pushRiichi, "p0", { yaku: game.yaku });
    if (mode === "stealth") installAugment(game.engine, stealthRiichi, "p1", { yaku: game.yaku });
    return game;
  }

  /** 리치 중이라 쯔모패(9s)만 버릴 수 있다 — 버린 뒤에도 텐파이 */
  function tsumogiri(g: Game): void {
    const tileId = g.engine.state.round.lastDrawnTile as TileId;
    expect(g.engine.submit({ player: "p1", type: "discard", payload: { tileId } }).ok).toBe(true);
  }

  it("보이는 리치 중인 대상에게는 종전대로 아무 일도 없다 (대조군 — 효과 불변)", () => {
    const g = scene("open");
    const before = scoreOf(g, "p1");
    tsumogiri(g);
    const st = g.engine.state;
    expect(st.augmentData[brandKey(st)]).toBe("p1"); // 낙인 유지
    expect(st.augmentData[firedKey]).toBeUndefined();
    expect(scoreOf(g, "p1")).toBe(before);
  });

  it("숨은 리치 중인 대상이 멘젠 텐파이로 버리면 낙인이 터져 강제(공개) 리치가 된다", () => {
    const g = scene("stealth");
    expect(hiddenFor(g, "p1")).toBe(true); // 전제: 남들 눈에 p1은 리치가 아니다
    const before = scoreOf(g, "p1");
    tsumogiri(g);
    const st = g.engine.state;
    // 예전엔 원시 riichi를 보고 그냥 지나가서, 보유자가 "텐파이인데 안 터진다 → 숨은 리치"를 추론했다
    expect(st.augmentData[brandKey(st)]).toBe(""); // 낙인 소진
    expect(st.augmentData[firedKey]).toBe("p1"); // 발동 연출(전원 공개)
    expect(st.augmentData[forcedKey(st)]).toBe("p1"); // 직격 +2판의 근거
    // 강제 리치는 공탁을 낸 표준 리치가 됐고 은닉은 내려갔다 — 화면이 한 가지 말을 한다
    expect(st.round.byPlayer["p1"]?.riichi?.cost).toBe(1000);
    expect(scoreOf(g, "p1")).toBe(before - 1000);
    expect(hiddenFor(g, "p1")).toBe(false);
  });
});
