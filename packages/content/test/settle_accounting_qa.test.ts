/**
 * 정산 회계 회귀 — 2026-08-20 페르소나 QA가 확정한 결함들.
 *
 * 여기 모은 것은 전부 **정산 payload를 인터셉터 체인에 흘려** 검사한다. 픽스처는
 * 반드시 엔진과 같은 모양이어야 한다 —
 *   · 화료 정산의 `payload.riichiPot`은 **항상 0**이고(다음 국으로 넘길 값),
 *     회수액은 첫 화료자의 `winInfos[].riichiPotGain`에만 실린다.
 *   · 본장 가산분은 론·쯔모 모두 `winInfos[].honbaBonus`에 실린다(론은 첫 화료자만).
 * 이 모양을 흉내 내지 않은 옛 픽스처가 공탁 배수 결함을 통과시켰다
 * (`jackpot_conservation.test.ts` 머리말 참조).
 *
 * 다루는 항목: 일확천금(공탁·유국) · 핏빛 계약(공탁·쯔모 본장) · 책임전가(더블론
 * 본장·이중 보유) · 큰손(하한 재확인) · 덤터기(재배선 재확인) · 눈먼 총알(본장) ·
 * 역만 방어술(쯔모 본장) · 만년 오야(더블론 연장 소모·공개 채널) · 혼 사냥(내 리치) ·
 * 뚫린 천장(오야 취급 분담) · 파혼(남의 유국만관) · 북빼기(남의 첫 순).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  discardsZone,
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
import { blameShift } from "../src/augments/blame_shift.js";
import { bloodContract } from "../src/augments/blood_contract.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";
import { bigHand } from "../src/augments/big_hand.js";
import { eternalDealer } from "../src/augments/eternal_dealer.js";
import { jackpot } from "../src/augments/jackpot.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";
import { northTrader } from "../src/augments/north_trader.js";
import { parasite } from "../src/augments/parasite.js";
import { scapegoat } from "../src/augments/scapegoat.js";
import { soulHunt } from "../src/augments/soul_hunt.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";
import { roundKey } from "../src/util.js";

const SYS = "__system";
type Game = ReturnType<typeof createStandardGameFromState>;

/** 아무 일도 일어나지 않은 turn.act 상태 (p0 차례) */
function blank(): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 지정한 사람들에게 증강을 심고 설치한 게임 */
function withAugs(
  state: GameState,
  spec: readonly { player: PlayerId; def: AugmentDef }[],
  extra: Record<string, unknown> = {},
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
    augmentData: { ...state.augmentData, ...extra },
  };
  const uniq = [...new Map(spec.map((x) => [x.def.id, x.def])).values()];
  const game = createStandardGameFromState(seeded, undefined, uniq);
  for (const { player, def } of spec) {
    installAugment(game.engine, def, player, { yaku: game.yaku });
  }
  return game;
}

/** ROUND_SETTLED를 정산 인터셉터 체인에 흘려 최종 payload를 얻는다 */
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

/** 엔진과 같은 모양의 WinInfo */
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

/** 엔진과 같은 모양의 화료 정산 payload (riichiPot은 언제나 0) */
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

// ─────────────────────── 일확천금 (jackpot) ───────────────────────

describe("jackpot — 공탁과 유국 벌부는 배수 밖이다", () => {
  const scene = (mult: number): Game => {
    const base = blank();
    return withAugs(base, [{ player: "p0", def: jackpot }], {
      [`jackpot:mult:${roundKey(base)}:p0#round`]: mult,
    });
  };

  it("회수한 공탁(riichiPotGain)에는 배수가 걸리지 않는다", () => {
    for (const mult of [2, 3]) {
      const g = scene(mult);
      const out = settle(
        g,
        winPayload(g, { p0: 8000 + 3000, p1: 0, p2: -8000, p3: 0 }, [
          win({ winner: "p0", winType: "ron", from: "p2", points: 8000, riichiPotGain: 3000 }),
        ]),
      );
      expect(out.deltas["p0"]).toBe(8000 * mult + 3000);
      // 지불자는 표준 금액 그대로 — 늘어난 몫은 뱅크가 발행한다
      expect(out.deltas["p2"]).toBe(-8000);
    }
  });

  it("0.5배도 공탁은 깎지 않는다 (공탁이 방총자에게 흘러가지 않는다)", () => {
    const g = scene(0.5);
    const out = settle(
      g,
      winPayload(g, { p0: 8000 + 3000, p1: 0, p2: -8000, p3: 0 }, [
        win({ winner: "p0", winType: "ron", from: "p2", points: 8000, riichiPotGain: 3000 }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(4000 + 3000);
    expect(out.deltas["p2"]).toBe(-4000);
  });

  /** 유국 정산 한 판 (deltas만 갈아 끼운다) */
  const drawPayload = (
    g: ReturnType<typeof scene>,
    deltas: Record<string, number>,
  ): RoundSettledPayload => {
    const r = g.engine.state.round;
    return {
      outcome: "draw",
      deltas,
      dealerSeat: r.dealerSeat,
      honba: r.honba + 1,
      riichiPot: 0,
      roundNumber: r.roundNumber,
      prevalentWind: r.prevalentWind,
    } as RoundSettledPayload;
  };

  it("유국(황패)의 노텐 벌부에는 배수가 걸리지 않는다", () => {
    // 무페널티 — 벌부는 언제나 음수 델타이고, 배수는 **버는 쪽**에만 붙는다.
    for (const mult of [0.5, 3]) {
      const g = scene(mult);
      const draw = drawPayload(g, { p0: -1000, p1: 3000, p2: -1000, p3: -1000 });
      expect(settle(g, draw).deltas["p0"]).toBe(-1000);
    }
  });

  /*
   * 2026-08-22(QA aug-2 확정 9): 예전에는 `outcome !== "win"`이면 통째로 건너뛰어
   * **유국 텐파이 수령·유국만관·유국역만**이 전부 배수 밖이었다. 카드는 "**그 국에
   * 얻는 점수**(공탁 회수분 제외)에 뽑힌 배수가 곱해지며"라고만 적고 어디에도
   * "화료했을 때만"이라 하지 않는다. 벌부 보호는 위 테스트가 보듯 `d <= 0` 한 줄이
   * 혼자서 완전히 해내므로, `outcome` 컷은 양수 획득까지 함께 밀어내고 있었다.
   */
  it("유국 텐파이 수령에는 배수가 붙는다 — 카드가 '그 국에 얻는 점수'라 적었다", () => {
    for (const [mult, expected] of [
      [3, 9000],
      [0.5, 1500],
    ] as const) {
      const g = scene(mult);
      const draw = drawPayload(g, { p0: 3000, p1: -1000, p2: -1000, p3: -1000 });
      expect(settle(g, draw).deltas["p0"]).toBe(expected);
    }
  });

  it("도중유국은 델타가 0이라 아무 일도 일어나지 않는다", () => {
    const g = scene(3);
    const abort = {
      ...drawPayload(g, { p0: 0, p1: 0, p2: 0, p3: 0 }),
      outcome: "abort",
    } as RoundSettledPayload;
    expect(settle(g, abort).deltas).toEqual(abort.deltas);
  });
});

// ─────────────────────── 핏빛 계약 (blood_contract) ───────────────────────

describe("blood_contract — 배수는 손의 화료점에만 걸린다", () => {
  const scene = (): Game => {
    const base = blank();
    return withAugs(base, [{ player: "p0", def: bloodContract }], {
      [`blood_contract:yaku:${roundKey(base)}:p0#round`]: "tanyao",
    });
  };

  it("쯔모 본장(honbaBonus)은 1.5배가 되지 않는다", () => {
    const g = scene();
    const out = settle(
      g,
      winPayload(g, { p0: 8000 + 900, p1: -2900, p2: -3000, p3: -3000 }, [
        win({
          winner: "p0",
          winType: "tsumo",
          points: 8000,
          honbaBonus: 900,
          yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(12000 + 900);
  });

  it("회수한 공탁도 1.5배가 되지 않는다", () => {
    const g = scene();
    const out = settle(
      g,
      winPayload(g, { p0: 8000 + 3000, p1: 0, p2: -8000, p3: 0 }, [
        win({
          winner: "p0",
          winType: "ron",
          from: "p2",
          points: 8000,
          riichiPotGain: 3000,
          yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(12000 + 3000);
  });
});

// ─────────────────────── 책임전가 (blame_shift) ───────────────────────

/**
 * 이 정산에서 **뱅크가 판수로 발행한** 가산분 합계 (표시 전용 재배선 줄은 han이 없다).
 * 2026-08-27 밸런스 웨이브로 책임전가·덤터기가 판수 보너스를 갖게 되면서, 재배선
 * 증강의 정산 총합이 더 이상 0이 아니게 됐다.
 */
function hanBonusTotal(out: RoundSettledPayload): number {
  return (out.augPoints ?? [])
    .filter((n) => n.han !== undefined)
    .reduce((a, n) => a + n.points, 0);
}

describe("blame_shift — 내 화료 몫만, WinInfo에서 직접 센다", () => {
  /** 더블론: p2가 첫 화료자(본장 900을 받는다), p0가 둘째. p1이 쐈다. */
  const doubleRon = (g: Game): RoundSettledPayload =>
    winPayload(g, { p0: 7700, p1: -16600, p2: 8900, p3: 0 }, [
      win({ winner: "p2", winType: "ron", from: "p1", points: 8000, honbaBonus: 900 }),
      win({ winner: "p0", winType: "ron", from: "p1", points: 7700 }),
    ]);

  it("둘째 화료자가 들면 첫 화료자의 본장은 흩어지지 않는다", () => {
    const g = withAugs(blank(), [{ player: "p0", def: blameShift }]);
    const out = settle(g, doubleRon(g));
    // p0 몫 7,700 만 2분할 → 무관한 p3는 3,800, 끝수 100은 쏜 사람 p1이 흡수한다
    // (2026-08-22 QA aug-1 확정 2 — 예전에는 Math.round라 애먼 p3가 3,900으로 더 냈다)
    expect(out.deltas["p3"]).toBe(-3800);
    expect(out.deltas["p1"]).toBe(-16600 + 7700 - 3900);
    // 2026-08-27: 론 +2판(뱅크 발행)이 얹히므로 총합은 그 가산분만큼만 늘어난다 —
    // 지불 재배선 자체는 여전히 총액 불변이다.
    expect(sum(out.deltas)).toBe(sum(doubleRon(g).deltas) + hanBonusTotal(out));
  });

  it("두 명이 함께 들어도 각자 자기 몫을 나눈다", () => {
    const g = withAugs(blank(), [
      { player: "p0", def: blameShift },
      { player: "p2", def: blameShift },
    ]);
    const out = settle(g, doubleRon(g));
    // p2 몫 8,900(본장 포함) ÷2 = 4,400 + p0 몫 7,700 ÷2 = 3,800.
    // 두 끝수(100+100)는 모두 쏜 사람 p1에게 간다 — 확정 2의 내림 규칙.
    expect(out.deltas["p3"]).toBe(-8200);
    // 2026-08-27: 론 +2판(뱅크 발행)이 얹히므로 총합은 그 가산분만큼만 늘어난다 —
    // 지불 재배선 자체는 여전히 총액 불변이다.
    expect(sum(out.deltas)).toBe(sum(doubleRon(g).deltas) + hanBonusTotal(out));
  });
});

// ─────────────────────── 큰손 · 덤터기 (Reassert) ───────────────────────

describe("big_hand — 하한은 이동(Transfer)까지 끝난 뒤에도 지켜진다", () => {
  it("상대 기생충이 절반을 가져가도 총액은 만관 이상이다", () => {
    const base = blank();
    const g = withAugs(
      base,
      [
        { player: "p0", def: bigHand },
        { player: "p1", def: parasite },
      ],
      {
        [`big_hand:round:p0`]: roundKey(base),
        [`parasite:target:p1:${roundKey(base)}#round`]: "p0",
      },
    );
    const out = settle(
      g,
      winPayload(g, { p0: 3900, p1: 0, p2: -3900, p3: 0 }, [
        win({ winner: "p0", winType: "ron", from: "p2", points: 3900 }),
      ]),
    );
    // p0는 craft 기본 오야 자리라 하한이 12,000이다
    expect(out.deltas["p0"]).toBe(12000);
    expect(out.deltas["p1"]).toBeGreaterThan(0); // 기생충은 제 몫을 그대로 가져간다
  });
});

describe("scapegoat — '나머지 둘은 한 푼도 내지 않는다'", () => {
  it("뒤 단계가 새로 부과한 지불도 지목당한 사람에게 몰린다", () => {
    const base = blank();
    const g = withAugs(
      base,
      [
        { player: "p0", def: scapegoat },
        { player: "p1", def: parasite },
      ],
      {
        [`scapegoat:target:${roundKey(base)}:p0#round`]: "p2",
        // 기생충이 p0의 획득 절반을 가져간다 = p0 델타만 줄어든다(지불 부과 아님)
        [`parasite:target:p1:${roundKey(base)}#round`]: "p3",
      },
    );
    const out = settle(
      g,
      winPayload(g, { p0: 12000, p1: -4000, p2: -4000, p3: -4000 }, [
        win({ winner: "p0", winType: "tsumo", points: 12000 }),
      ]),
    );
    expect(out.deltas["p1"]).toBe(0);
    expect(out.deltas["p3"]).toBe(0);
    expect(out.deltas["p2"]).toBe(-12000);
    /*
     * 2026-08-27 사양 변경: 덤터기에 **쯔모 +2판**이 붙었다(뱅크 발행이라 지불자는 더
     * 내지 않는다). 재배선 자체는 여전히 총액 불변이므로, 총합은 정확히 그 가산분이다.
     */
    const bonus = ((out.augPoints ?? []) as { player: string; augId: string; points: number }[])
      .filter((n) => n.player === "p0" && n.augId === "scapegoat")
      .reduce((a, n) => a + n.points, 0);
    expect(bonus).toBeGreaterThan(0);
    expect(sum(out.deltas)).toBe(bonus);
  });
});

// ─────────────────────── 눈먼 총알 (blind_ron) ───────────────────────

describe("blind_ron — 옮기는 것은 손의 지불분뿐", () => {
  it("본장 가산분은 쏜 사람이 그대로 문다", () => {
    const base = blank();
    const g = withAugs(base, [{ player: "p1", def: blindRon }], {
      // armOnNextRound가 세우는 무장 표식 (그 국에만 발동한다)
      [`blind_ron:armedRound:p1`]: roundKey(base),
    });
    const payload = winPayload(g, { p0: 0, p1: 8600, p2: -8600, p3: 0 }, [
      win({ winner: "p1", winType: "ron", from: "p2", points: 8000, honbaBonus: 600 }),
    ]);
    const out = settle(g, payload);
    expect(sum(out.deltas)).toBe(sum(payload.deltas));
    // 8,000만 엉뚱한 사람에게 옮겨 가고 방총자에게 본장 600은 남는다
    // (난수로 뽑힌 피해자가 마침 방총자 자신이면 -8,600 그대로다)
    const victim = (["p0", "p2", "p3"] as PlayerId[]).find(
      (id) => id !== "p2" && (out.deltas[id] ?? 0) < 0,
    );
    if (victim !== undefined) {
      expect(out.deltas[victim]).toBe(-8000);
      expect(out.deltas["p2"]).toBe(-600);
    } else {
      expect(out.deltas["p2"]).toBe(-8600);
    }
  });
});

// ─────────────────────── 역만 방어술 (yakuman_shield) ───────────────────────

describe("yakuman_shield — 환급 상한은 '내가 낸 몫'", () => {
  it("역만 쯔모에서 본장 부담은 남는다", () => {
    const g = withAugs(blank(), [{ player: "p0", def: yakumanShield }]);
    // 자 역만 쯔모(p1) — p0는 **오야 자리**(craft 기본)라 16,000 + 본장 100을 낸다
    const out = settle(
      g,
      winPayload(g, { p0: -16100, p1: 32300, p2: -8100, p3: -8100 }, [
        win({
          winner: "p1",
          winType: "tsumo",
          points: 32000,
          honbaBonus: 300,
          yakumanCount: 1,
          limit: "yakuman",
          payments: { dealer: 16000, others: 8000 },
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(-100); // 본장 몫만 남는다
    expect(out.deltas["p1"]).toBe(32300 - 16000);
  });

  it("역만 직격(론)은 종전대로 본장만 남긴다", () => {
    const g = withAugs(blank(), [{ player: "p0", def: yakumanShield }]);
    const out = settle(
      g,
      winPayload(g, { p0: -32600, p1: 32600, p2: 0, p3: 0 }, [
        win({
          winner: "p1",
          winType: "ron",
          from: "p0",
          points: 32000,
          honbaBonus: 600,
          yakumanCount: 1,
          limit: "yakuman",
          payments: { discarder: 32000 },
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(-600);
  });
});

// ─────────────────────── 만년 오야 (eternal_dealer) ───────────────────────

describe("eternal_dealer — 더블론에서도 연장 횟수를 소모한다", () => {
  it("진짜 오야가 함께 화료해도 오야 자리가 내게 오면 표식이 남는다", () => {
    const base = blank();
    // p2가 보유자(자), p0가 진짜 오야(seat 0)
    const g = withAugs(base, [{ player: "p2", def: eternalDealer }]);
    const r = g.engine.state.round;
    const payload = {
      ...winPayload(g, { p0: 4000, p1: -12000, p2: 8000, p3: 0 }, [
        win({ winner: "p2", winType: "ron", from: "p1", points: 8000 }),
        win({ winner: "p0", winType: "ron", from: "p1", points: 4000 }),
      ]),
      // 만년 오야가 끌어온 다음 국 오야 자리 = 보유자 자리
      dealerSeat: 2,
      dealerContinues: true,
    } as RoundSettledPayload & { extendedBy?: PlayerId[] };
    expect(r.dealerSeat).toBe(0);
    const out = settle(g, payload) as RoundSettledPayload & { extendedBy?: PlayerId[] };
    expect(out.extendedBy).toEqual(["p2"]);
  });

  it("남은 연장 횟수가 전원 공개 채널에 실린다", () => {
    const g = withAugs(blank(), [{ player: "p2", def: eternalDealer }]);
    const hand = g.engine.state.zones["hand:p0"]?.tileIds ?? [];
    const res = g.engine.submit({
      player: "p0",
      type: "discard",
      payload: { tileId: hand[0] },
    });
    expect(res.ok).toBe(true);
    // 판을 안 정한 시나리오는 반장전이다 — 연장 예산은 동풍전 3회 · 반장전 5회
    // (2026-08-23 사용자 지시로 반장전 몫이 1.5배가 됐다).
    expect(g.engine.state.augmentData["view:*:eternal_dealer:p2"]).toBe(
      "연장 (남은 5회)",
    );
  });
});

// ─────────────────────── 파혼 (meld_dissolve) ───────────────────────

describe("meld_dissolve — 남의 유국만관을 되살리지 않는다", () => {
  /** p1은 요구패만 버렸고 그중 한 장이 p0에게 울려 나간다 */
  function run(dissolve: boolean): { nagashi: boolean; pond: number; hist: number } {
    const base = craft({
      hands: { p0: "11z234m345p55s9s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "19m19p19s2334z" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1z" },
    });
    const g = withAugs(base, [{ player: "p0", def: meldDissolve }]);
    const st0 = g.engine.state;
    const ids = st0.zones["hand:p0"]?.tileIds.filter(
      (t) => st0.tiles[t]?.kind.suit === "wind" && st0.tiles[t]?.kind.rank === 1,
    );
    const rp = g.engine.submit({
      player: "p0",
      type: "pon",
      payload: { tileIds: [ids?.[0], ids?.[1]] },
    });
    expect(rp.ok).toBe(true);
    if (dissolve) {
      const rd = g.engine.submit({
        player: "p0",
        type: "dissolve_meld",
        payload: { meldIndex: 0 },
      });
      expect(rd.ok).toBe(true);
    }
    /*
     * 패산을 비운 상태에서 유국 정산을 돌린다. 증강은 **정산 엔진에도 설치한다** —
     * 실경기는 같은 엔진에서 정산이 돌고, 이어하기·리플레이도 `rebuildAugments`로
     * 다시 설치한다. 설치하지 않으면 `draw.nagashiMangan` 모디파이어가 없어
     * 이 회귀를 관측할 수 없다.
     */
    const st = g.engine.state;
    const emptied: GameState = {
      ...st,
      zones: { ...st.zones, [WALL]: { ...st.zones[WALL], tileIds: [] } },
      round: { ...st.round, phase: "turn.draw" },
    } as GameState;
    const g2 = createStandardGameFromState(emptied, undefined, [meldDissolve]);
    installAugment(g2.engine, meldDissolve, "p0", { yaku: g2.yaku });
    const r = g2.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);
    const settled = [...g2.engine.eventLog]
      .reverse()
      .find((e) => e.type === ROUND_SETTLED)?.payload as RoundSettledPayload & {
      drawSpecial?: { augId: string };
    };
    const cur = g2.engine.state;
    return {
      nagashi: settled.drawSpecial?.augId === "nagashi_mangan",
      pond: cur.zones[discardsZone("p1")]?.tileIds.length ?? 0,
      hist: cur.round.byPlayer["p1"]?.discardedKinds.length ?? 0,
    };
  }

  it("울려 나간 패가 강으로 돌아와도 유국만관은 부활하지 않는다", () => {
    expect(run(false).nagashi).toBe(false);
    const after = run(true);
    // 강 장수와 이력이 다시 같아졌는데도 성립하지 않아야 한다
    expect(after.pond).toBe(after.hist);
    expect(after.nagashi).toBe(false);
  });
});

// ─────────────────────── 북빼기 (north_trader) ───────────────────────

/** 손에 있는 北 한 장의 tileId */
function northIdOf(state: GameState, player: PlayerId): number {
  const id = (state.zones[`hand:${player}`]?.tileIds ?? []).find(
    (t) => state.tiles[t]?.kind.suit === "wind" && state.tiles[t]?.kind.rank === 4,
  );
  if (id === undefined) throw new Error("no north tile in hand");
  return id;
}

describe("north_trader — 첫 순 플래그는 테이블 공용 상태다", () => {
  it("북을 빼도 상대의 지화 전제·구종구패가 살아 있다", () => {
    const base = craft({
      hands: { p0: "4z123m456p789s11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // craft는 "게임 중간 스냅샷"이라 firstTurn=false로 만든다 — 국 첫 순을 재현한다
    const first: GameState = {
      ...base,
      round: { ...base.round, firstTurn: true, goAroundBroken: false },
    };
    const g = withAugs(first, [{ player: "p0", def: northTrader }]);
    expect(g.engine.state.round.firstTurn).toBe(true);
    const r = g.engine.submit({
      player: "p0",
      type: "north_pull",
      payload: { tileId: northIdOf(g.engine.state, "p0") },
    });
    expect(r.ok).toBe(true);
    expect(g.engine.state.round.firstTurn).toBe(true);
    expect(g.engine.state.round.goAroundBroken).toBe(false);
  });

  it("보유자 자신의 천화·지화는 win.blockedYaku로 막힌다", () => {
    const base = craft({
      hands: { p0: "4z123m456p789s11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const g = withAugs(base, [{ player: "p0", def: northTrader }]);
    const before = g.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p0",
      state: g.engine.state,
    });
    expect(before).not.toContain("chihou");
    const r = g.engine.submit({
      player: "p0",
      type: "north_pull",
      payload: { tileId: northIdOf(g.engine.state, "p0") },
    });
    expect(r.ok).toBe(true);
    const after = g.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p0",
      state: g.engine.state,
    });
    expect(after).toContain("tenhou");
    expect(after).toContain("chihou");
    // 상대에게는 걸리지 않는다
    const other = g.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p1",
      state: g.engine.state,
    });
    expect(other).not.toContain("chihou");
  });
});

// ─────────────── 뚫린 천장 × 오야 취급 (addWinPointTransfer) ───────────────

describe("addWinPointTransfer — 오야 취급 쯔모는 셋이 똑같이 낸다", () => {
  it("만년 오야(win.treatAsDealer)에서 진짜 오야만 2배로 내지 않는다", () => {
    const base = blank();
    // p2가 만년 오야(자 자리) — 기본 분담은 셋이 균등인데, 이동분만 '친 2배'로
    // 갈리던 것이 QA score-a 확정 5다.
    const g = withAugs(base, [
      { player: "p2", def: eternalDealer },
      { player: "p2", def: aotenjouCeiling },
    ]);
    expect(
      g.engine.rules.resolve<boolean>("win.treatAsDealer", {
        playerId: "p2",
        state: g.engine.state,
      }),
    ).toBe(true);
    // 8판 30부 오야취급 쯔모 = 총 24,000 (셋이 각 8,000)
    const out = settle(
      g,
      winPayload(g, { p0: -8000, p1: -8000, p2: 24000, p3: -8000 }, [
        win({
          winner: "p2",
          winType: "tsumo",
          points: 24000,
          han: 8,
          fu: 30,
          payments: { others: 8000 },
        }),
      ]),
    );
    // 상한 해제분이 실제로 이동해야 이 검사가 의미가 있다
    expect(out.deltas["p2"] ?? 0).toBeGreaterThan(24000);
    // 셋의 부담이 정확히 같아야 한다 (진짜 오야 p0가 더 내지 않는다)
    expect(out.deltas["p0"]).toBe(out.deltas["p1"]);
    expect(out.deltas["p1"]).toBe(out.deltas["p3"]);
    expect(sum(out.deltas)).toBe(0);
  });
});

// ─────────────────────── 혼 사냥 (soul_hunt) ───────────────────────

describe("soul_hunt — '리치 대신' 붙는 1판", () => {
  it("내가 이미 리치라면 덧붙지 않는다", () => {
    const g = withAugs(blank(), [{ player: "p0", def: soulHunt }]);
    const def = g.yaku.get("soul_hunt");
    expect(def).toBeDefined();
    const wctx = {
      winnerId: "p0",
      winType: "ron",
      fromRiichi: true,
      riichi: { double: false, ippatsu: false },
    } as never;
    expect(def?.check({ sets: [] } as never, wctx)).toBe(false);
    const noRiichi = {
      winnerId: "p0",
      winType: "ron",
      fromRiichi: true,
      riichi: null,
    } as never;
    expect(def?.check({ sets: [] } as never, noRiichi)).toBe(true);
  });
});
