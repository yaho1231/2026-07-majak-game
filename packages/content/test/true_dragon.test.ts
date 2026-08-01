/**
 * true_dragon 그룹 테스트 — 진짜 용 1종 (엔진 훅 통합 검증).
 * 배패 16장(deal.handSize) · 5멘쯔 1작두(scoring.totalSets) · 화료 +2판(score.extraHan)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildPlayerView,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  createStandardGame,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { trueDragon } from "../src/augments/true_dragon.js";
import { seatSwap } from "../src/augments/seat_swap.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function riichiValidate(
  game: Game,
  player: PlayerId,
  tileId: TileId,
): string | null {
  const def = game.engine.actions.get("riichi");
  if (def === undefined) throw new Error("no riichi action");
  return def.validate(
    { player, type: "riichi", payload: { tileId } },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** 보유자 17장 완성형: 123m 456m 789m 123p 456p + 77s (정확히 5멘쯔 1작두) */
function craftWin17() {
  return craft({
    hands: { p0: "123m456m789m123p456p77s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

describe("true_dragon (진짜 용)", () => {
  it("배패: sys.startRound 후 보유자는 16장, 나머지는 13장을 받는다", () => {
    const game = createStandardGame({ seed: 1 });
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.startRound",
      payload: {},
    });
    expect(res.ok).toBe(true);

    const state = game.engine.state;
    expect(state.zones[handZone("p0")]?.tileIds).toHaveLength(16);
    for (const p of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(state.zones[handZone(p)]?.tileIds).toHaveLength(13);
    }
  });

  it("화료: 17장 5멘쯔 1작두 손이 보유자에겐 쯔모 화료형으로 인정된다", () => {
    const game = createStandardGameFromState(craftWin17());
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("리치: 5멘쯔 구성에서 1장 빠진 16장 텐파이면 리치 선언이 검증을 통과한다", () => {
    // 손 17장 = 텐파이 16장(123m456m789m123p456p + 7s 단기) + 쯔모패 1z
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "123m456m789m123p456p7s1z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    // 미설치: 16장 손은 표준(4멘쯔) 기준으로는 텐파이가 아니다
    expect(riichiValidate(game, "p0", drawn)).toBe("not tenpai after discard");

    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });
    expect(riichiValidate(game, "p0", drawn)).toBeNull();
  });

  it("비보유(설치 전): 같은 17장 손은 화료형이 아니다", () => {
    const game = createStandardGameFromState(craftWin17());
    expect(winValidate(game, "p0")).toBe("not a winning hand");
  });

  it("화료 +3판: 정산 winInfo에 extraHan 3이 반영된다 (보유자 전용)", () => {
    const game = createStandardGameFromState(craftWin17());
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });

    // 규칙 합성: 보유자만 +3, 비보유자는 0
    const rctx = { state: game.engine.state };
    expect(
      game.engine.rules.resolve<number>("score.extraHan", { ...rctx, playerId: "p0" }),
    ).toBe(3);
    expect(
      game.engine.rules.resolve<number>("score.extraHan", { ...rctx, playerId: "p1" }),
    ).toBe(0);

    // 쯔모 화료 → 정산까지 실주행
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const winOption = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();
    const done = flow.submit("p0", winOption as { type: string; payload: unknown });
    expect(done).toEqual({ kind: "roundOver", outcome: "win" });

    const settled = game.engine.eventLog.find((e) => e.type === ROUND_SETTLED);
    const payload = settled?.payload as RoundSettledPayload | undefined;
    const info = payload?.winInfos?.[0];
    expect(info?.winner).toBe("p0");
    expect(info?.extraHan).toBe(3);
    // 멘젠쯔모 1판 + 추가 3판 이상
    expect(info?.han ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("드래프트 상호 배제: 진짜 용은 14장/4멘쯔 전제 특수형 증강과 conflicts로 잠긴다", () => {
    // decompose가 치토이·국사를 totalSets===4 && hand===14에서만 열거하므로
    // 진짜 용(5멘쯔·17장)과 함께 있으면 죽거나(픽 낭비) 소프트락(우는 국사)이 된다.
    const locked = [
      "open_kokushi",
      "giant_god",
      "royal_kokushi",
      "async_chiitoi",
      "mixed_nine_gates",
      "void_kan",
    ];
    for (const id of locked) expect(trueDragon.conflicts).toContain(id);
  });

  it("자리 바꿈 가드: 배패 장수가 다른 진짜 용(16장)은 손패 교환 대상이 될 수 없다", () => {
    // seat_swap은 손패를 통째로 맞바꾼다 — 장수가 다르면 양쪽 손이 화료 불능이 되므로
    // sameHandSize 가드로 막는다. (다른 플레이어가 진짜 용을 보유하는 교차 케이스)
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0"
          ? { ...p, augments: ["seat_swap"] }
          : p.id === "p1"
            ? { ...p, augments: ["true_dragon"] }
            : p,
      ),
      round: { ...base.round, firstTurn: true },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    installAugment(game.engine, trueDragon, "p1", { yaku: game.yaku });

    const def = game.engine.actions.get("seat_swap");
    if (def === undefined) throw new Error("no seat_swap action");
    const validate = (target: PlayerId): string | null =>
      def.validate(
        { player: "p0", type: "seat_swap", payload: { target } },
        { state: game.engine.state, rules: game.engine.rules },
      );

    expect(validate("p1")).toBe("hand sizes differ"); // 진짜 용 = 16장 → 거부
    expect(validate("p2")).toBeNull(); // 표준 상대 = 13장 → 교환 가능
  });
  it("상대 시점 장수: 쯔모 17장 → 버림 16장이 그대로 실린다 (13장으로 보이지 않는다)", () => {
    // 진짜 용 보유자의 손패는 남에게 뒷면이지만 **장수는 전원 공개**다.
    // 버린 뒤에도 16장이어야 상대가 "저 사람은 용이다"를 계속 읽을 수 있다.
    const game = createStandardGame({ seed: 3 });
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const seenByP1 = (): number => {
      const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
      const zone = view.zones[handZone("p0")];
      return (zone?.tileIds.length ?? 0) + (zone?.hiddenCount ?? 0);
    };

    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    expect(seenByP1()).toBe(17); // 배패 16 + 쯔모 1

    const discard = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "discard");
    if (discard === undefined) throw new Error("no discard option");
    flow.submit("p0", discard as { type: string; payload: unknown });
    expect(seenByP1()).toBe(16); // 표준 13장이 아니다
  });
});
