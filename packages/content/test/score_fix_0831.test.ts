/**
 * 타점 규약 통일 회귀 — 2026-08-31 QA synergy4 (docs/48, docs/49 §1).
 *
 * 이 파일이 지키는 것 (하나라도 되돌리면 여기가 빨개진다):
 *
 * - **A-1 / A-2 / B-6** `jackpot`의 밑값이 «현재 델타»가 아니라 **원본 화료점**이다.
 *   같은 Multiply 단계의 형제(`let_it_ride`·`blood_contract`)가 먼저 불려 놓은 몫에
 *   배수가 다시 걸리면 8,000 쯔모가 48,000이 아니라 **96,000**이 됐고, 0.5배는
 *   부푼 밑값에서 계산된 축소액이 지불액 전액을 덮어 **지불자 셋이 전원 0원**이 됐다.
 *   본장도 형제와 같이 배수 밖으로 뺀다(예전에는 jackpot만 본장을 배수에 태웠다).
 * - **A-4** `counter`의 직격 +3판이 `hanSoFar`를 받는다 — 다른 "+N판"과 정확히 덧셈.
 * - **B-7** `addWinPointBonus`가 **환산액 0에서도 판수 표식(augPoint.han)을 남긴다**.
 *   그 표식이 hanSoFar의 유일한 저장소라, 버리면 뒤에 도는 카드의 밑값이 낮아진다.
 * - **C-7** `soul_strike`의 「리치 2판」이 실판(`score.extraHan`)이라 판수 증강과
 *   하나의 `calculateScore` 안에서 더해진다(예전에는 점수 밴드 차액이라 흡수됐다).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
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
import { jackpot } from "../src/augments/jackpot.js";
import { letItRide } from "../src/augments/let_it_ride.js";
import { bloodContract } from "../src/augments/blood_contract.js";
import { counter } from "../src/augments/counter.js";
import { blameShift } from "../src/augments/blame_shift.js";
import { soulStrike } from "../src/augments/soul_strike.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function blank(score = 25000, dealerSeat = 0): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, score })),
    round: { ...base.round, dealerSeat },
  };
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
  over: Partial<RoundSettledPayload> = {},
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
    ...over,
  } as RoundSettledPayload;
}

const H: PlayerId = "p0";

/** 손 8,000 쯔모 (자) — 본장·공탁은 인자로 얹는다 */
const tsumo8k = (g: Game, honba = 0, pot = 0): RoundSettledPayload =>
  winPayload(
    g,
    {
      p0: 8000 + honba * 300 + pot,
      p1: -2000 - honba * 100,
      p2: -2000 - honba * 100,
      p3: -4000 - honba * 100,
    },
    [
      win({
        winner: "p0",
        winType: "tsumo",
        points: 8000,
        han: 5,
        fu: 30,
        yaku: [{ id: "riichi", name: "리치", han: 1 }],
        ...(honba > 0 ? { honbaBonus: honba * 300 } : {}),
        ...(pot > 0 ? { riichiPotGain: pot } : {}),
      } as never),
    ],
    { honba },
  );

const seedJackpot =
  (mult: number) =>
  (s: GameState): Record<string, unknown> => ({
    [roundScopedKey("jackpot", "mult", s, H)]: mult,
  });
const seedRide =
  (streak: number) =>
  (): Record<string, unknown> => ({ [`let_it_ride:streak:${H}`]: streak });
const seedBlood = (s: GameState): Record<string, unknown> => ({
  [roundScopedKey("blood_contract", "yaku", s, H)]: "riichi",
});
const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState): Record<string, unknown> =>
    Object.assign({}, ...fs.map((f) => f(s)));

describe("A-1/A-2/B-6 — jackpot의 밑값은 원본 화료점이다", () => {
  it("jackpot 3배 × let_it_ride 4배 = 48,000 (곱이 아니라 합, 96,000이 아니다)", () => {
    const g = withAugs(
      blank(),
      [
        { player: H, def: letItRide },
        { player: H, def: jackpot },
      ],
      merge(seedRide(3), seedJackpot(3)),
    );
    const out = settle(g, tsumo8k(g));
    // 8,000(원본) + 24,000(let 4배) + 16,000(jackpot 3배) = 48,000
    expect(out.deltas["p0"]).toBe(48000);
    // 지불자는 표준 금액 그대로 — 늘어난 몫은 전부 뱅크 발행이다
    expect(out.deltas["p1"]).toBe(-2000);
    expect(out.deltas["p3"]).toBe(-4000);
  });

  it("배수 3종을 다 들어도 52,000 (6.5배) — 지수 폭발이 없다", () => {
    const g = withAugs(
      blank(),
      [
        { player: H, def: letItRide },
        { player: H, def: jackpot },
        { player: H, def: bloodContract },
      ],
      merge(seedRide(3), seedJackpot(3), seedBlood),
    );
    expect(settle(g, tsumo8k(g)).deltas["p0"]).toBe(52000);
  });

  it("A-2 — let 4배 + jackpot 0.5배에서 지불자가 면제되지 않는다", () => {
    const g = withAugs(
      blank(),
      [
        { player: H, def: letItRide },
        { player: H, def: jackpot },
      ],
      merge(seedRide(3), seedJackpot(0.5)),
    );
    const out = settle(g, tsumo8k(g));
    // 축소는 **원본 8,000의 절반**(-4,000)이지 부푼 32,000의 절반이 아니다.
    expect(out.deltas["p0"]).toBe(28000);
    // 되돌린 4,000이 지불자에게 분배된다 — 전원 0원(면제)이면 안 된다.
    expect(out.deltas["p1"]).toBe(-1000);
    expect(out.deltas["p2"]).toBe(-1000);
    expect(out.deltas["p3"]).toBe(-2000);
    expect(out.deltas["p1"]! + out.deltas["p2"]! + out.deltas["p3"]!).toBe(-4000);
  });

  it("B-6 — 본장·공탁은 jackpot의 배수 밖이다 (형제 두 장과 같은 규약)", () => {
    const g = withAugs(blank(), [{ player: H, def: jackpot }], seedJackpot(3));
    const out = settle(g, tsumo8k(g, 5, 2000));
    // 밑델타 = 8,000 + 본장 1,500 + 공탁 2,000 = 11,500. 배수는 8,000에만 걸린다.
    expect(out.deltas["p0"]).toBe(11500 + 16000);
  });

  it("배수 없는 국(1배)·유국 경로는 종전 그대로다", () => {
    const g = withAugs(blank(), [{ player: H, def: jackpot }], seedJackpot(1));
    expect(settle(g, tsumo8k(g)).deltas["p0"]).toBe(8000);
    // 유국(winInfos 없음)의 양수 획득은 여전히 배수 대상 — 밑값은 델타 전부
    const g3 = withAugs(blank(), [{ player: H, def: jackpot }], seedJackpot(3));
    const draw = winPayload(
      g3,
      { p0: 3000, p1: -1000, p2: -1000, p3: -1000 },
      [],
      { outcome: "draw" } as Partial<RoundSettledPayload>,
    );
    expect(settle(g3, draw).deltas["p0"]).toBe(9000);
  });
});

describe("A-4 — counter의 직격 +3판이 hanSoFar를 받는다", () => {
  /**
   * p0(자)가 p1에게서 3판30부(3,900) 직격 론. p1은 이번 국 선리치자이고
   * 반격(struck)이 서 있다. `blame_shift`(론을 셋이 나눠 무는 대신 +2판)와 겹친다.
   *
   * 규약: "+N판"은 순서와 무관하게 덧셈 — 둘의 합은 «3판 → 8판 한 번»과 같아야 한다.
   * 예전에는 counter만 hanSoFar를 안 받아 자기 밑값을 3판으로 잡았고, 그만큼
   * blame_shift의 +2판이 통째로 흡수됐다.
   */
  const ron39 = (g: Game): RoundSettledPayload =>
    winPayload(g, { p0: 3900, p1: -3900, p2: 0, p3: 0 }, [
      win({
        winner: "p0",
        winType: "ron",
        from: "p1",
        points: 3900,
        han: 3,
        fu: 30,
        yaku: [{ id: "riichi", name: "리치", han: 1 }],
      }),
    ]);

  const seedCounter = (): Record<string, unknown> => ({
    [`counter:prev:${H}`]: "p1",
    [`counter:struck:${H}`]: true,
  });

  /** p0 몫 중 그 증강이 얹은 금액 */
  const gain = (out: RoundSettledPayload, augId: string): number =>
    ((out.augPoints ?? []) as { augId: string; player: string; points: number }[])
      .filter((n) => n.player === H && n.augId === augId)
      .reduce((s, n) => s + n.points, 0);

  it("counter 단독 몫 − (counter+blame 몫) 이 판수 규약과 일치한다", () => {
    const solo = withAugs(blank(25000, 1), [{ player: H, def: counter }], seedCounter);
    const both = withAugs(
      blank(25000, 1),
      [
        { player: H, def: counter },
        { player: H, def: blameShift },
      ],
      seedCounter,
    );
    const soloOut = settle(solo, ron39(solo));
    const bothOut = settle(both, ron39(both));
    // 3판=3,900 · 5판=8,000 · 6판=12,000 · 8판=16,000 (자 론 표준표)
    // 단독:  counter = 강탈 + (band(6) - band(3))
    // 함께:  blame이 +2판을 먼저 얹으므로 counter는 band(8) - band(5)
    expect(gain(soloOut, "counter") - gain(bothOut, "counter")).toBe(
      12000 - 3900 - (16000 - 8000),
    );
    // 두 카드의 뱅크 발행 합은 «3판 → 8판 한 번»과 같다
    expect(gain(bothOut, "counter") + gain(bothOut, "blame_shift")).toBe(
      gain(soloOut, "counter") - (12000 - 3900) + (16000 - 3900),
    );
  });

  it("직격 +3판이 augPoints에 «판»으로 남는다 (다음 카드의 hanSoFar 저장소)", () => {
    const g = withAugs(blank(25000, 1), [{ player: H, def: counter }], seedCounter);
    const notes = (settle(g, ron39(g)).augPoints ?? []) as {
      augId: string;
      player: string;
      han?: number;
    }[];
    expect(notes.find((n) => n.augId === "counter" && n.player === H)?.han).toBe(3);
  });

  it("쯔모·다른 사람에게서의 론에는 직격 +3판이 붙지 않는다", () => {
    const g = withAugs(blank(25000, 1), [{ player: H, def: counter }], seedCounter);
    const fromP2 = winPayload(g, { p0: 3900, p1: 0, p2: -3900, p3: 0 }, [
      win({ winner: "p0", winType: "ron", from: "p2", points: 3900, han: 3, fu: 30 }),
    ]);
    const notes = (settle(g, fromP2).augPoints ?? []) as { augId: string; han?: number }[];
    expect(notes.find((n) => n.augId === "counter")?.han).toBeUndefined();
  });
});

describe("B-7 — 환산액이 0이어도 판수 표식은 남는다", () => {
  /**
   * 8판30부 자 론(16,000). blame_shift의 +2판은 8판→10판이라 표준표에서 둘 다
   * 배만 16,000 = **0원**이다. 예전에는 그 국에 augPoint 줄이 통째로 사라져,
   * 뒤에 도는 counter가 밑값을 8판으로 잡았다(= 10판이어야 할 자리).
   */
  const ron16k = (g: Game): RoundSettledPayload =>
    winPayload(g, { p0: 16000, p1: -16000, p2: 0, p3: 0 }, [
      win({
        winner: "p0",
        winType: "ron",
        from: "p1",
        points: 16000,
        han: 8,
        fu: 30,
        yaku: [{ id: "riichi", name: "리치", han: 1 }],
      }),
    ]);

  it("blame_shift의 +2판이 0원이어도 han=2 줄이 남는다", () => {
    const g = withAugs(blank(25000, 1), [{ player: H, def: blameShift }]);
    const notes = ((settle(g, ron16k(g)).augPoints ?? []) as {
      augId: string;
      player: string;
      points: number;
      han?: number;
    }[]).filter((n) => n.augId === "blame_shift" && n.player === H);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.points).toBe(0);
    expect(notes[0]?.han).toBe(2);
  });

  it("그 표식 덕에 뒤에 오는 counter가 10판을 밑값으로 잡는다", () => {
    const both = withAugs(
      blank(25000, 1),
      [
        { player: H, def: counter },
        { player: H, def: blameShift },
      ],
      () => ({ [`counter:prev:${H}`]: "p1", [`counter:struck:${H}`]: true }),
    );
    const out = settle(both, ron16k(both));
    const cnt = ((out.augPoints ?? []) as { augId: string; player: string; points: number }[])
      .filter((n) => n.augId === "counter" && n.player === H)
      .reduce((s, n) => s + n.points, 0);
    const solo = withAugs(blank(25000, 1), [{ player: H, def: counter }], () => ({
      [`counter:prev:${H}`]: "p1",
      [`counter:struck:${H}`]: true,
    }));
    const cntSolo = ((settle(solo, ron16k(solo)).augPoints ?? []) as {
      augId: string;
      player: string;
      points: number;
    }[])
      .filter((n) => n.augId === "counter" && n.player === H)
      .reduce((s, n) => s + n.points, 0);
    // 표준표 8판=16,000 · 10판=16,000 · 11판=24,000 · 13판=32,000
    // 단독 = 강탈 + (band(11) - band(8)) = 강탈 + 8,000
    // 함께 = 강탈 + (band(13) - band(10)) = 강탈 + 16,000
    expect(cnt - cntSolo).toBe(32000 - 16000 - (24000 - 16000));
  });
});

describe("C-7 — soul_strike의 리치 2판은 실판이다", () => {
  it("score.extraHan으로 +1판이 실린다 (밴드 차액이 아니다)", () => {
    const g = withAugs(blank(), [{ player: H, def: soulStrike }], (s) => ({
      [roundScopedKey("soul_strike", "declared", s, H)]: true,
    }));
    // 리치가 살아 있어야 한다 — 승부수로 무르면 판수도 함께 사라진다
    const st = g.engine.state;
    const riichi: GameState = {
      ...st,
      round: {
        ...st.round,
        byPlayer: {
          ...st.round.byPlayer,
          p0: { ...st.round.byPlayer["p0"]!, riichi: { turn: 1, ippatsu: false } },
        },
      },
    } as GameState;
    expect(
      g.engine.rules.resolve<number>("score.extraHan", { playerId: H, state: riichi }),
    ).toBe(1);
    // 리치가 없으면 0
    expect(
      g.engine.rules.resolve<number>("score.extraHan", { playerId: H, state: st }),
    ).toBe(0);
  });

  it("발동하지 않은 국에는 붙지 않는다", () => {
    const g = withAugs(blank(), [{ player: H, def: soulStrike }]);
    expect(
      g.engine.rules.resolve<number>("score.extraHan", {
        playerId: H,
        state: g.engine.state,
      }),
    ).toBe(0);
  });
});
