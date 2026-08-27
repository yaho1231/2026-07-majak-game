/**
 * 정산 시너지 회귀 — 2026-08-23 QA synergy3(score/relax/riichi)가 확정한 결함들.
 *
 * 이번 라운드가 찾은 것은 "단계는 나눠 놨는데 **같은 단계 안에서 서로를 못 보는**"
 * 구멍들이다. 픽스처 규약은 `settle_accounting_qa.test.ts` 머리말과 같다.
 *
 * 1. 같은 `Redistribute` 안의 두 재배선(책임전가·눈먼 총알)이 서로의 결과를 무시해
 *    **방총한 사람이 16,000점을 벌었다**(총합은 0이라 드리프트 검사에 안 걸린다).
 * 2. 책임전가에 `Reassert` 재확인이 없어 뚫린 천장의 상한 해제분이 3분할을 빠져나갔다.
 * 3. 스파이가 **뱅크 발행분까지** 훔쳐, 큰손이 하한을 두 번 발행하고(3,900 손에
 *    20,100 발행) 모 아니면 도의 판돈이 통째로 새어 나갔다.
 * 4. 죽기살기의 반등에 상한이 없어, 덤터기로 몰아 준 손실을 226,000점 흑자로 뒤집었다.
 * 5. "+N판" 증강 둘이 각자 원본 `info.han`을 밑값으로 삼아 합이 +(N+M)판이 아니었다.
 * 6. 뱅크 환산 "+N판"이 뚫린 천장의 상한 해제를 못 봐, 같은 "+3판"이 실판 계열과
 *    6,000점 갈렸다(계수역만 구간에서는 통째로 0).
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  WALL,
  calculateScore,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";
import { bigHand } from "../src/augments/big_hand.js";
import { blameShift } from "../src/augments/blame_shift.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { dieHard } from "../src/augments/die_hard.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { lateBloomer } from "../src/augments/late_bloomer.js";
import { scapegoat } from "../src/augments/scapegoat.js";
import { spy } from "../src/augments/spy.js";
import { roundKey } from "../src/util.js";

/** augmentData 의 국 스코프 키 접두 (content/util.ts roundKey 와 같다) */
const rkOf = (s: GameState): string => roundKey(s);

type Game = ReturnType<typeof createStandardGameFromState>;

function blank(score = 25000): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return { ...base, players: base.players.map((p) => ({ ...p, score })) };
}

function withAugs(
  state: GameState,
  spec: readonly { player: PlayerId; def: AugmentDef }[],
  extra: (s: GameState) => Record<string, unknown> = () => ({}),
): Game {
  const ids = new Map<PlayerId, string[]>();
  for (const { player, def } of spec) {
    ids.set(player, [...(ids.get(player) ?? []), def.id]);
  }
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(ids.get(p.id) ?? [])],
    })),
    augmentData: { ...state.augmentData, ...extra(state) },
  };
  const uniq = [...new Map(spec.map((x) => [x.def.id, x.def])).values()];
  const game = createStandardGameFromState(seeded, undefined, uniq);
  for (const { player, def } of spec) {
    installAugment(game.engine, def, player, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

function settle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
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

const sum = (d: Record<PlayerId, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

function win(
  o: Partial<WinInfo> & { winner: PlayerId; winType: "ron" | "tsumo"; points: number },
): WinInfo {
  return {
    from: null,
    han: 3,
    fu: 30,
    yaku: [],
    yakumanCount: 0,
    doraHan: 0,
    uraHan: 0,
    redHan: 0,
    limit: null,
    ...o,
  } as WinInfo;
}

function winPayload(
  g: Game,
  deltas: Record<PlayerId, number>,
  winInfos: WinInfo[],
): RoundSettledPayload {
  const r = g.engine.state.round;
  return {
    outcome: "win",
    deltas,
    dealerSeat: r.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
    winInfos,
  } as RoundSettledPayload;
}

/** p0(오야)가 p1에게서 24,000 론 */
const RON_24K = (g: Game): RoundSettledPayload =>
  winPayload(g, { p0: 24000, p1: -24000, p2: 0, p3: 0 }, [
    win({ winner: "p0", winType: "ron", from: "p1", points: 24000, han: 8, fu: 40 }),
  ]);

/**
 * 책임전가가 홀더에게 뱅크에서 발행한 판수 가산분 (2026-08-27 사양 — 론 +2판).
 * 지불 재배선 자체는 여전히 총액 불변이라, 정산 총합은 정확히 이 값이 된다.
 */
function blameBonus(out: RoundSettledPayload): number {
  return (out.augPoints ?? [])
    .filter((n) => n.player === "p0" && n.augId === "blame_shift")
    .reduce((a, n) => a + n.points, 0);
}

describe("책임전가 × 눈먼 총알 — 쏜 사람이 흑자가 되지 않는다", () => {
  it("두 재배선이 겹쳐도 방총자의 최종 증감은 0 이하다", () => {
    for (const bulletHolder of ["p0", "p2", "p3"] as PlayerId[]) {
      const g = withAugs(
        blank(),
        [
          { player: "p0", def: blameShift },
          { player: bulletHolder, def: blindRon },
        ],
        (s) => ({ [`blind_ron:armedRound:${bulletHolder}`]: roundKey(s) }),
      );
      const out = settle(g, RON_24K(g));
      expect(out.deltas["p1"]).toBeLessThanOrEqual(0);
      // 2026-08-27: 책임전가에 론 +2판(뱅크 발행)이 붙어 총합은 그 가산분만큼 양수다.
      expect(sum(out.deltas)).toBe(blameBonus(out));
      // 누구도 손값보다 많이 물지 않는다
      for (const v of Object.values(out.deltas)) expect(v).toBeGreaterThanOrEqual(-24000);
    }
  });
});

describe("책임전가 × 뚫린 천장 — 상한 해제분도 함께 3분할된다", () => {
  it("쏜 사람이 나머지 둘보다 더 내지 않는다", () => {
    const g = withAugs(blank(), [
      { player: "p0", def: blameShift },
      { player: "p0", def: aotenjouCeiling },
    ]);
    const out = settle(g, RON_24K(g));
    expect(out.deltas["p1"]).toBe(out.deltas["p2"]);
    expect(out.deltas["p2"]).toBe(out.deltas["p3"]);
    expect(sum(out.deltas)).toBe(blameBonus(out));
  });
});

describe("스파이 — 훔치는 것은 화료의 값까지다 (뱅크 발행분은 남는다)", () => {
  const smallRon = (g: Game): RoundSettledPayload =>
    winPayload(g, { p0: 3900, p1: -3900, p2: 0, p3: 0 }, [
      win({
        winner: "p0",
        winType: "ron",
        from: "p1",
        points: 3900,
        han: 2,
        fu: 40,
        winningTileId: g.engine.state.zones["hand:p0"]?.tileIds[0] as number,
      }),
    ]);

  it("큰손의 만관 하한을 두 번 발행하지 않는다", () => {
    const base = blank();
    const markedId = base.zones["hand:p0"]?.tileIds[0] as number;
    const markedKind = base.tiles[markedId]?.kind;
    const key = `${markedKind?.suit}${markedKind?.rank}`;
    const g = withAugs(
      base,
      [
        { player: "p0", def: bigHand },
        { player: "p2", def: spy },
      ],
      (s) => ({
        [`big_hand:round:p0`]: roundKey(s),
        [`spy:mark:p2`]: key,
      }),
    );
    const out = settle(g, smallRon(g));
    // 화료자는 하한(오야 만관)을 받고, 스파이는 지불자가 실제로 낸 만큼만 가져간다.
    expect(out.deltas["p0"]).toBe(12000);
    expect(out.deltas["p2"]).toBe(3900);
    expect(out.deltas["p1"]).toBe(-3900);
    // 뱅크 발행은 하한 한 벌뿐이다 (예전에는 20,100 = 하한 두 벌)
    expect(sum(out.deltas)).toBe(12000);
  });

  it("모 아니면 도의 판돈은 화료자에게 남는다", () => {
    // 판돈은 "그 리치로 화료"했을 때만 나온다 — 리치 상태를 심는다
    const b0 = blank();
    const base: GameState = {
      ...b0,
      round: {
        ...b0.round,
        byPlayer: {
          ...b0.round.byPlayer,
          p0: {
            ...(b0.round.byPlayer["p0"] as never as Record<string, unknown>),
            riichi: { turn: 1, ippatsu: false },
          } as never,
        },
      },
    } as GameState;
    const markedId = base.zones["hand:p0"]?.tileIds[0] as number;
    const markedKind = base.tiles[markedId]?.kind;
    const key = `${markedKind?.suit}${markedKind?.rank}`;
    const g = withAugs(
      base,
      [
        { player: "p0", def: allOrNothing },
        { player: "p1", def: spy },
      ],
      (s) => ({
        [`all_or_nothing:active:${rkOf(s)}:p0#round`]: 12000,
        [`all_or_nothing:uses:${rkOf(s)}:p0#round`]: 1,
        [`spy:mark:p1`]: key,
      }),
    );
    const out = settle(g, smallRon(g));
    expect(out.deltas["p0"]).toBeGreaterThanOrEqual(12000);
    // 쏜 사람이 흑자가 되지 않는다
    expect(out.deltas["p1"]).toBeLessThanOrEqual(0);
  });
});

describe("죽기살기 — 반등 폭은 시작 점수 한 벌까지다", () => {
  it("덤터기로 몰아 준 큰 손실을 226,000점 흑자로 뒤집지 않는다", () => {
    const g = withAugs(
      blank(5000),
      [
        { player: "p0", def: scapegoat },
        { player: "p1", def: dieHard },
      ],
      (s) => ({ [`scapegoat:target:${roundKey(s)}:p0#round`]: "p1" }),
    );
    const out = settle(
      g,
      winPayload(g, { p0: 24000, p1: -8000, p2: -8000, p3: -8000 }, [
        win({ winner: "p0", winType: "tsumo", points: 24000, han: 8, fu: 40 }),
      ]),
    );
    /*
     * 되돌아오는 폭은 25,000 한 벌까지 — 예전에는 상한이 없어 113,000이 그대로 뒤집혔다.
     * 2026-08-27 트리거 교체 뒤에는 상한이 **뒤집혀 들어오는 금액**에 걸린다
     * (0 미만으로 내려간 깊이가 아니라 그 국의 실점이 뒤집히기 때문).
     */
    expect(out.deltas["p1"] ?? 0).toBeLessThanOrEqual(25000);
  });

  it("카드의 예시(−8,000 → +8,000) — 바닥권이면 실점이 그대로 뒤집힌다", () => {
    // 2026-08-27: 트리거가 "정산 후 0 미만"에서 "정산 시점 점수 ≤12,500"으로 바뀌었다.
    const g = withAugs(blank(10000), [{ player: "p1", def: dieHard }]);
    const out = settle(
      g,
      winPayload(g, { p0: 8000, p1: -8000, p2: 0, p3: 0 }, [
        win({ winner: "p0", winType: "ron", from: "p1", points: 8000, han: 5, fu: 40 }),
      ]),
    );
    expect(out.deltas["p1"]).toBe(8000); // 상대도 +8,000, 나도 +8,000
    expect(out.deltas["p0"]).toBe(8000);
  });
});

describe('"+N판" 증강은 서로 겹쳐도 정확히 덧셈이다', () => {
  /** 남4국(만개 구간) · 패산 1장(해저) · 2s 탕키 텐파이 — 해저 쯔모로 화료한다 */
  function haiteiScene(): GameState {
    const base = craft({
      hands: { p0: "234m345p456s678s2s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    const wall = base.zones[WALL]?.tileIds ?? [];
    const at = wall.findIndex((id) => {
      const k = base.tiles[id]?.kind;
      return k?.suit === "sou" && k.rank === 2;
    });
    expect(at).toBeGreaterThanOrEqual(0);
    return {
      ...base,
      zones: {
        ...base.zones,
        [WALL]: { ...(base.zones[WALL] as object), tileIds: [wall[at] as number] },
      },
      round: {
        ...base.round,
        prevalentWind: 2,
        roundNumber: 4,
        doraIndicators: [base.zones[DEAD_WALL]?.tileIds[4] as number],
      },
    } as GameState;
  }

  const drive = (defs: AugmentDef[]): number => {
    const g = withAugs(
      haiteiScene(),
      defs.map((def) => ({ player: "p0" as PlayerId, def })),
    );
    const flow = new FlowController(g.engine);
    let status = flow.begin();
    for (let i = 0; i < 6 && status.kind === "awaiting"; i++) {
      const prompt = status.prompts.find((pr) => pr.player === "p0");
      const w = prompt?.options.find((o) => o.type === "win");
      if (w !== undefined) {
        flow.submit("p0", w);
        break;
      }
      const draw = prompt?.options.find((o) => o.type === "draw");
      expect(draw).toBeDefined();
      status = flow.submit("p0", draw as never);
    }
    for (let i = g.engine.eventLog.length - 1; i >= 0; i--) {
      const e = g.engine.eventLog[i];
      if (e?.type === ROUND_SETTLED) {
        return (e.payload as RoundSettledPayload).deltas["p0"] ?? 0;
      }
    }
    throw new Error("no settlement");
  };

  it("+3판 × 2 = +6판 (6판 → 12판 = 삼배만)", () => {
    // 각자 +3판이면 6판 → 9판 = 배만 24,000. 둘이면 +6판 → 12판 = 삼배만 36,000.
    // 예전에는 둘 다 원본 6판을 밑값으로 삼아 (24,000−18,000)을 두 번 얹어 30,000이었다.
    expect(drive([lateBloomer])).toBe(24000);
    expect(drive([haiteiLord])).toBe(24000);
    expect(drive([lateBloomer, haiteiLord])).toBe(36000);
  });
});

describe("뚫린 천장 — 뱅크 환산 +N판도 상한 해제를 본다", () => {
  it('같은 "+3판"이 상한 해제 곡선 위에서 계산된다', () => {
    const g = withAugs(blank(), [
      { player: "p0", def: aotenjouCeiling },
      { player: "p0", def: haiteiLord },
    ]);
    const rules = g.engine.rules;
    // 상한 해제가 보유자에게만 켜진다
    expect(rules.resolve<boolean>("score.uncapped", { playerId: "p0" })).toBe(true);
    expect(rules.resolve<boolean>("score.uncapped", { playerId: "p1" })).toBe(false);
    // 8판 + 3판 = 11판 → 상한 없는 base 8000 → 오야 론 48,000
    const capped = calculateScore({ han: 11, fu: 40, isDealer: true, winType: "ron" });
    const uncapped = calculateScore({
      han: 11,
      fu: 40,
      isDealer: true,
      winType: "ron",
      uncapped: true,
    });
    expect(capped.total).toBe(36000);
    expect(uncapped.total).toBe(48000);
    // 뚫린 천장의 상한 해제분 자체도 같은 곡선이다 (8판 = 30,000)
    const out = settle(g, RON_24K(g));
    expect(out.deltas["p0"]).toBe(30000);
  });
});
