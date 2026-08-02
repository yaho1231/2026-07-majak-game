/**
 * 숨은 리치 × 손을 바꾸는 증강 (2026-08-02 사용자 확정).
 *
 * 손을 바꾸는 증강 셋(통째로 바꾸기·손패 3장 교환·자리 바꿈)은 리치 중인 상대를
 * 대상으로 삼을 수 없다. 그런데 `FlowController`는 validate를 통과한 후보만 프롬프트에
 * 담으므로, 그 가드가 그대로면 **스텔스 리치를 건 사람만 대상 목록에서 조용히 사라져**
 * 은닉이 통째로 노출된다.
 *
 * 규칙: **숨은 리치는 대상으로 허용하고, 교환이 성사되면 그 리치를 해제한다.**
 *   · 보이는 리치는 지금까지처럼 대상 불가 (모두가 아는 정보라 누설될 것이 없다).
 *   · 해제 사실은 당사자 전용 채널로만 나간다 (전원 공개하면 한 박자 늦게 새는 것과 같다).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { seatSwap } from "../src/augments/seat_swap.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";

type Game = ReturnType<typeof createStandardGameFromState>;
type Riichi = "none" | "open" | "stealth";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function turnOptions(game: Game, player: PlayerId): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

/**
 * p0가 `swapper` 증강을 들고 자기 첫 순을 맞은 국면. p1의 리치 상태는 `mode`로 정한다.
 * (세 증강 모두 "내 첫 순"이 발동 창이라 turnCount 0·버림 없음으로 맞춘다.)
 */
function scene(swapper: AugmentDef, mode: Riichi): Game {
  const base = craft({
    hands: {
      p0: "123m456m789m11p23p",
      p1: "234m345p345s678s5s",
      p2: "*",
      p3: "*",
    },
    ...(mode === "none" ? {} : { discards: { p1: "5s" } }),
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const p1Round = base.round.byPlayer["p1"];
  if (p1Round === undefined) throw new Error("no p1 round state");
  const r = base.round;
  const state: GameState = {
    ...base,
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p1:
          mode === "none"
            ? p1Round
            : {
                ...p1Round,
                riichi: { double: false, ippatsu: false, discardIndex: 0 },
              },
      },
    },
    augmentData: {
      ...base.augmentData,
      // 스텔스 액션으로 걸었다는 국 단위 표식 — riichi.hidden이 이때만 참이 된다
      ...(mode === "stealth"
        ? {
            [`stealth_riichi:active:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p1`]:
              true,
          }
        : {}),
    },
  };
  const withAugs = withAug(
    withAug(state, "p0", [swapper.id]),
    "p1",
    mode === "stealth" ? ["stealth_riichi"] : [],
  );
  const game = createStandardGameFromState(withAugs);
  installAugment(game.engine, swapper, "p0", { yaku: game.yaku });
  if (mode === "stealth") {
    installAugment(game.engine, stealthRiichi, "p1", { yaku: game.yaku });
  }
  return game;
}

/** p1을 대상으로 삼는 후보가 프롬프트에 있는가 */
function canTargetP1(game: Game, type: string): boolean {
  return turnOptions(game, "p0").some(
    (o) => o.type === type && (o.payload as { target?: string }).target === "p1",
  );
}

const CASES: { name: string; def: AugmentDef; action: string }[] = [
  { name: "통째로 바꾸기", def: fullHandSwap, action: "hand_swap" },
  { name: "손패 3장 교환", def: handSwap3, action: "swap3" },
  { name: "자리 바꿈", def: seatSwap, action: "seat_swap" },
];

describe("숨은 리치는 손 교환의 대상이 된다 (후보 목록이 곧 정보이므로)", () => {
  for (const c of CASES) {
    it(`${c.name} — 리치가 없으면 대상이 된다 (대조군)`, () => {
      expect(canTargetP1(scene(c.def, "none"), c.action)).toBe(true);
    });

    it(`${c.name} — 보이는 리치는 지금까지처럼 대상에서 빠진다`, () => {
      expect(canTargetP1(scene(c.def, "open"), c.action)).toBe(false);
    });

    it(`${c.name} — 숨은 리치는 대상 목록에 그대로 남는다 (빈자리가 곧 누설)`, () => {
      expect(canTargetP1(scene(c.def, "stealth"), c.action)).toBe(true);
    });
  }
});

describe("교환이 성사되면 그 숨은 리치가 풀린다", () => {
  /** 스텔스 표식이 내려갔는가 — riichi.hidden이 더는 켜지지 않는다 */
  function stealthStillHidden(game: Game): boolean {
    return game.engine.rules.resolve<boolean>("riichi.hidden", {
      playerId: "p1",
      state: game.engine.state,
    });
  }

  it("통째로 바꾸기: 손을 뺏은 순간 p1의 리치가 사라진다", () => {
    const game = scene(fullHandSwap, "stealth");
    expect(stealthStillHidden(game)).toBe(true); // 전제
    const r = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
    // 표식도 함께 내려간다 — 남기면 같은 국에 다시 건 **표준** 리치까지 은닉된다
    expect(stealthStillHidden(game)).toBe(false);
  });

  it("자리 바꿈: 자리와 손이 바뀌면 p1의 리치가 사라진다", () => {
    const game = scene(seatSwap, "stealth");
    const r = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
    expect(stealthStillHidden(game)).toBe(false);
  });

  it("손패 3장 교환: 3장이 실제로 갈리는 순간(take)에 풀린다 — 지정만으로는 안 풀린다", () => {
    const game = scene(handSwap3, "stealth");
    expect(
      game.engine.submit({ player: "p0", type: "swap3", payload: { target: "p1" } }).ok,
    ).toBe(true);
    // 지정 단계에서는 아직 손이 그대로다 → 리치도 그대로
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();

    const mine = handIdsOf(game.engine.state, "p0").slice(0, 3) as TileId[];
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: [...mine].sort((a, b) => a - b) },
      }).ok,
    ).toBe(true);
    const theirs = handIdsOf(game.engine.state, "p1").slice(0, 3) as TileId[];
    const r = game.engine.submit({
      player: "p0",
      type: "swap3_take",
      payload: { takes: [...theirs].sort((a, b) => a - b) },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
    expect(stealthStillHidden(game)).toBe(false);
  });

  it("해제 통보는 **당사자 전용 채널**로만 나간다 (전원 공개면 뒤늦게 새는 것과 같다)", () => {
    const game = scene(fullHandSwap, "stealth");
    game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    const keys = Object.keys(game.engine.state.augmentData).filter((k) =>
      k.includes("stealth_riichi:broken"),
    );
    expect(keys.length).toBe(1);
    // view:{당사자}: 로 시작해야 한다 — view:*: 면 전원 공개다
    expect(keys[0]!.startsWith("view:p1:")).toBe(true);
    expect(keys[0]!.startsWith("view:*:")).toBe(false);
  });
});
