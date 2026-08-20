/**
 * 증강에 막힌 화료는 **건너뛰지 않고 잠근다** (2026-08-17 사용자 요청).
 *
 * 예전엔 격(rank_gate)이나 천하무적·불가침 조약에 막히면 론/쯔모 선택지가 그냥
 * 사라졌다 — 당한 쪽에는 아무 일도 일어나지 않은 것과 구분되지 않아서, 왜 화료가
 * 안 되는지 알 방법이 없었다. 지금은 `DecisionPrompt.locked`에 사유가 실려
 * 화면이 잠긴 버튼을 세운다.
 *
 * 여기서 지키는 선:
 *  - 자물쇠는 **손이 실제로 다 됐을 때만** 뜬다 (텐파이 여부를 흘리지 않는다).
 *  - 후리텐·역 없음처럼 **표준 규칙**이 막은 것에는 뜨지 않는다 — 예전 그대로 건너뛴다.
 *  - 잠긴 것은 `options`에 없다 → 봇도 안전폴백도 고를 수 없고, submit도 거절된다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { DecisionPrompt, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { invincible } from "../src/augments/invincible.js";

/** p0가 5s를 버리고, p1이 그걸 론할 수 있는 리액션 상황 (탕야오 단기 = 1판, 싼 손) */
function ronScene(): GameState {
  return craft({
    hands: { p0: "*", p1: "234m567m234s678s5s", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 0,
    lastDiscard: { player: "p0", spec: "5s" },
  });
}

/** p1의 턴에 화료패까지 쥔 상황 (같은 손을 쯔모로) */
function tsumoScene(): GameState {
  return craft({
    hands: { p0: "*", p1: "234m567m234s678s55s", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
}

/** p0가 격을 들고 이번 국에 p1을 지목해 둔 상태 */
function markedByRankGate(base: GameState, target: PlayerId = "p1"): GameState {
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["rank_gate"] } : p,
    ),
    augmentData: {
      ...base.augmentData,
      [`rank_gate:mark:${roundKey(base)}:p0#round`]: target,
    },
  };
}

/** p0가 천하무적을 선언해 둔 상태 (그 국 동안 p0의 버림은 론당하지 않는다) */
function invincibleScene(base: GameState): GameState {
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
    ),
    augmentData: {
      ...base.augmentData,
      [`invincible:active:${roundKey(base)}:p0#round`]: true,
    },
  };
}

function promptsOf(
  state: GameState,
  aug: typeof rankGate,
): DecisionPrompt[] {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts;
}

const forPlayer = (
  prompts: DecisionPrompt[],
  id: PlayerId,
): DecisionPrompt | undefined => prompts.find((p) => p.player === id);

describe("증강에 막힌 화료 — 스킵 대신 자물쇠", () => {
  it("격에 지목당한 사람의 싼 론은 잠긴 채로 프롬프트가 뜬다", () => {
    const prompts = promptsOf(markedByRankGate(ronScene()), rankGate);
    const p1 = forPlayer(prompts, "p1");
    expect(p1).toBeDefined();
    // 고를 수 있는 것은 패스뿐 — 잠긴 론은 options에 없다
    expect(p1!.options.some((o) => o.type === "win")).toBe(false);
    expect(p1!.options.some((o) => o.type === "pass")).toBe(true);
    expect(p1!.locked).toEqual([{ type: "win", reason: "minHan", minHan: 5 }]);
  });

  it("지목이 없으면 예전 그대로 론이 뜬다 (자물쇠 없음)", () => {
    const base = ronScene();
    const noMark: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["rank_gate"] } : p,
      ),
    };
    const p1 = forPlayer(promptsOf(noMark, rankGate), "p1");
    expect(p1!.options.some((o) => o.type === "win")).toBe(true);
    expect(p1!.locked).toBeUndefined();
  });

  it("손이 안 된 사람에게는 자물쇠가 뜨지 않는다 (텐파이를 흘리지 않는다)", () => {
    // p1만 화료형이다. 나머지는 임의 손이라 잠길 것이 없다.
    const prompts = promptsOf(markedByRankGate(ronScene(), "p2"), rankGate);
    for (const p of prompts) {
      expect(p.locked ?? []).toEqual([]);
    }
  });

  it("잠긴 론은 제출할 수 없다", () => {
    const game = createStandardGameFromState(markedByRankGate(ronScene()));
    installAugment(game.engine, rankGate, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    expect(() => flow.submit("p1", { type: "win", payload: {} })).toThrow(
      /was not offered/,
    );
  });

  it("쯔모도 같다 — 자기 턴에 화료패를 쥐어도 잠긴 쯔모로 보인다", () => {
    const prompts = promptsOf(markedByRankGate(tsumoScene()), rankGate);
    const p1 = forPlayer(prompts, "p1");
    expect(p1).toBeDefined();
    expect(p1!.options.some((o) => o.type === "win")).toBe(false);
    expect(p1!.locked).toEqual([{ type: "win", reason: "minHan", minHan: 5 }]);
    // 버릴 패는 그대로 고를 수 있다
    expect(p1!.options.some((o) => o.type === "discard")).toBe(true);
  });

  it("론 면역(천하무적)도 잠긴 론으로 보인다", () => {
    const prompts = promptsOf(invincibleScene(ronScene()), invincible);
    const p1 = forPlayer(prompts, "p1");
    expect(p1).toBeDefined();
    expect(p1!.options.some((o) => o.type === "win")).toBe(false);
    expect(p1!.locked).toEqual([{ type: "win", reason: "ronImmune" }]);
  });

  it("론 면역이어도 손이 안 된 사람에게는 자물쇠가 뜨지 않는다", () => {
    // 면역 검사가 화료형 판정보다 앞에 있으면 전원에게 잠긴 론이 뜬다 — 그 회귀를 막는다
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 0,
      lastDiscard: { player: "p0", spec: "5s" },
    });
    for (const p of promptsOf(invincibleScene(base), invincible)) {
      expect(p.locked ?? []).toEqual([]);
    }
  });
});
