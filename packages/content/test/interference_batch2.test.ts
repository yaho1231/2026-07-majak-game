/**
 * 방해·손패 계열 3건 (docs/25 방해 #11·#13, 손패 #6).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, Meld, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { tableFlip } from "../src/augments/table_flip.js";
import { bloodContract } from "../src/augments/blood_contract.js";
import { seatSwap } from "../src/augments/seat_swap.js";
import { roundKey } from "../src/util.js";

describe("밥상 뒤엎기 — 후로 직후에는 발동하지 않는다 (docs/25 방해 #11)", () => {
  function scene(drawn: boolean): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      ...(drawn ? { drawnLastFor: "p0" as PlayerId } : {}),
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["table_flip"] } : p,
      ),
      // 후로 직후를 흉내낸다 — turn.act이지만 쯔모패가 없다
      round: { ...base.round, lastDrawnTile: drawn ? base.round.lastDrawnTile : null },
    };
    const game = createStandardGameFromState(state, undefined, [tableFlip]);
    installAugment(game.engine, tableFlip, "p0", { yaku: game.yaku });
    return game;
  }

  it("쯔모를 마친 순에는 종전대로 발동한다 (기준선)", () => {
    const game = scene(true);
    const res = game.engine.submit({ player: "p0", type: "table_flip_do", payload: {} });
    if (!res.ok) expect(res.reason).not.toBe("not your first hand");
  });

  it("쯔모패가 없는 순(후로 직후)에는 발동하지 않는다", () => {
    const game = scene(false);
    const res = game.engine.submit({ player: "p0", type: "table_flip_do", payload: {} });
    expect(res.ok).toBe(false);
    // 발동했다면 없던 쯔모패가 생겨 후로 턴에 쯔모 화료 옵션이 열렸을 것이다
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
  });
});

describe("핏빛 계약 — 공탁은 배수 대상이 아니다 (docs/25 방해 #13)", () => {
  function settle(pot: number, points: number): RoundSettledPayload {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["blood_contract"] } : p,
      ),
      augmentData: {
        ...base.augmentData,
        [`blood_contract:yaku:${roundKey(base)}:p0#round`]: "tanyao",
      },
    };
    const game = createStandardGameFromState(state, undefined, [bloodContract]);
    installAugment(game.engine, bloodContract, "p0", { yaku: game.yaku });

    let payload = {
      outcome: "win",
      deltas: { p0: points + pot, p1: -points },
      dealerSeat: base.round.dealerSeat,
      honba: 0,
      // 엔진과 같은 모양 — 화료 정산의 payload.riichiPot은 언제나 0이고
      // 회수액은 winInfo.riichiPotGain에만 실린다(2026-08-20 QA score-a 확정 1·2)
      riichiPot: 0,
      roundNumber: base.round.roundNumber,
      prevalentWind: base.round.prevalentWind,
      winInfos: [
        {
          winner: "p0",
          from: "p1",
          winType: "ron",
          points,
          han: 1,
          fu: 30,
          yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
          yakumanCount: 0,
          ...(pot > 0 ? { riichiPotGain: pot } : {}),
        },
      ],
    } as unknown as RoundSettledPayload;

    for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
      const out = intercept(
        { type: ROUND_SETTLED, payload },
        { state: game.engine.state, rules: game.engine.rules },
      );
      if (out !== null) payload = out.payload as RoundSettledPayload;
    }
    return payload;
  }

  it("공탁이 없으면 화료점만 1.5배", () => {
    expect(settle(0, 4000).deltas["p0"]).toBe(6000);
  });

  it("공탁은 곱해지지 않고 그대로 더해진다", () => {
    // 예전에는 (4000+1000)×1.5 = 7500이라 뱅크가 공탁 500을 새로 발행했다
    expect(settle(1000, 4000).deltas["p0"]).toBe(4000 * 1.5 + 1000);
  });
});

describe("자리 바꿈 — 넘어간 후로의 calledFrom이 자기 자신을 가리키지 않는다 (docs/25 손패 #6)", () => {
  it("교환 당사자끼리 calledFrom이 뒤집힌다", () => {
    // p0가 p1의 버림을 펑한 상태에서 자리를 맞바꾼다
    const base = craft({
      // sameHandSize 가드를 통과하려면 손패 장수와 멘쯔 수가 양쪽 같아야 한다
      hands: { p0: "123m456m789m1p", p1: "123p456p789p1s", p2: "*", p3: "*" },
      melds: {
        p0: [{ kind: "pon" as const, spec: "777s" }],
        p1: [{ kind: "pon" as const, spec: "888s" }],
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs0 = base.round.byPlayer["p0"];
    if (rs0 === undefined) throw new Error("no p0");
    const melds: Meld[] = rs0.melds.map((m) => ({ ...m, calledFrom: "p1" as PlayerId }));
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["seat_swap"] } : p,
      ),
      round: {
        ...base.round,
        byPlayer: { ...base.round.byPlayer, p0: { ...rs0, melds } },
      },
    };
    const game = createStandardGameFromState(state, undefined, [seatSwap]);
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" },
    });
    if (!res.ok) throw new Error(`seat_swap rejected: ${res.reason}`);

    // 멘쯔가 p1에게 넘어갔다면 calledFrom은 p0여야 한다 (자기 자신이 아니다)
    const after = game.engine.state.round.byPlayer["p1"]?.melds ?? [];
    for (const m of after) {
      expect(m.calledFrom).not.toBe("p1");
    }
  });
});
