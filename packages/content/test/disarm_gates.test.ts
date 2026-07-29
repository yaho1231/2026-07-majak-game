/**
 * 무장해제 게이트 회귀 (2026-07-29 감사).
 *
 * 예전에는 `isSourceDisarmed` 가드가 `holderTurnOptions` **한 경로에만** 걸려 있었다.
 * 그래서 "규칙도, 발동 효과도, 액티브 버튼도 전부 잠긴다"는 설명과 달리
 *   ① 리액션(후로) 콜 버튼   ② 증강이 등록한 커스텀 역
 * 이 둘은 잠가도 그대로 작동했다. 여기서 세 경로를 한꺼번에 고정한다.
 */

import { describe, expect, it } from "vitest";
import {
  DISARMED_SOURCES_KEY,
  FlowController,
  augmentInstanceId,
  createStandardGameFromState,
  installAugment,
  isSourceDisarmed,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { openKokushi } from "../src/augments/open_kokushi.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { disarm } from "../src/augments/disarm.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";
import { craft } from "./helpers.js";

function withAugments(
  state: GameState,
  who: Record<PlayerId, string[]>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      who[p.id] === undefined ? p : { ...p, augments: [...(who[p.id] as string[])] },
    ),
  };
}

/** state.augmentData에 무장해제 목록을 직접 심는다 (disarm이 하는 일과 동일) */
function preDisarmed(state: GameState, sources: string[]): GameState {
  return {
    ...state,
    augmentData: { ...state.augmentData, [DISARMED_SOURCES_KEY]: sources },
  };
}

function boot(state: GameState, augs: [AugmentDef, PlayerId][]) {
  // 같은 증강을 두 명이 가질 수 있으므로 카탈로그에는 중복 없이 넣는다
  const catalog = [...new Map(augs.map(([d]) => [d.id, d])).values()];
  const game = createStandardGameFromState(state, undefined, catalog);
  for (const [def, holder] of augs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku });
  }
  return game;
}

describe("무장해제 게이트 ① 리액션(후로) 콜 버튼", () => {
  /** p1이 1z를 버리고, p0(우는 국사)이 2z3z를 들고 있어 kokushi_pon이 성립하는 장면 */
  function scene(disarmed: boolean): GameState {
    let s = craft({
      hands: {
        p0: "23z19m19p19s1112m",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1z" },
    });
    s = withAugments(s, { p0: ["open_kokushi"] });
    return disarmed
      ? preDisarmed(s, [augmentInstanceId("p0", "open_kokushi")])
      : s;
  }

  it("잠기지 않았으면 kokushi_pon 후보가 제시된다 (대조군)", () => {
    const game = boot(scene(false), [[openKokushi, "p0"]]);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "kokushi_pon")).toBe(true);
  });

  it("잠기면 kokushi_pon 후보가 사라지고 제출도 거부된다", () => {
    const game = boot(scene(true), [[openKokushi, "p0"]]);
    expect(
      isSourceDisarmed(game.engine.state, augmentInstanceId("p0", "open_kokushi")),
    ).toBe(true);

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    // 후보가 하나도 없으면 p0에게는 프롬프트 자체가 열리지 않는다
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "kokushi_pon") ?? false).toBe(false);

    // 제출 경로(validate)도 독립적으로 막는다
    const hand = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
    const res = game.engine.submit({
      player: "p0",
      type: "kokushi_pon",
      payload: { tileIds: [hand[0], hand[1]] },
    });
    expect(res.ok).toBe(false);
  });
});

describe("무장해제 게이트 ② 커스텀 역", () => {
  /** 탕야오 해방 — 자패가 섞여도 탕야오가 붙는 커스텀 역 */
  function scene(disarmed: boolean): GameState {
    let s = craft({
      hands: {
        p0: "234m567m234p55z678s",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withAugments(s, { p0: ["tanyao_break"] });
    return disarmed
      ? preDisarmed(s, [augmentInstanceId("p0", "tanyao_break")])
      : s;
  }

  it("잠기지 않으면 커스텀 역이 등록되어 있다 (대조군)", () => {
    const game = boot(scene(false), [[tanyaoBreak, "p0"]]);
    const custom = game.yaku.all().filter((y) => y.source !== undefined);
    expect(custom.length).toBeGreaterThan(0);
    expect(custom.every((y) => y.source === augmentInstanceId("p0", "tanyao_break"))).toBe(
      true,
    );
  });

  it("증강이 등록한 역에는 source가 붙어 있어 evaluate가 걸러낼 수 있다", () => {
    const game = boot(scene(true), [[tanyaoBreak, "p0"]]);
    const src = augmentInstanceId("p0", "tanyao_break");
    expect(isSourceDisarmed(game.engine.state, src)).toBe(true);
    // 역 정의에 source가 실려 있어야 disarmedSources 대조가 가능하다
    const custom = game.yaku.all().filter((y) => y.source === src);
    expect(custom.length).toBeGreaterThan(0);
  });
});

describe("무장해제 게이트 ③ disarm 자신", () => {
  function scene(): GameState {
    let s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, {
      p0: ["disarm"],
      p1: ["always_tenpai"],
      p2: ["always_tenpai"],
    });
  }

  it("한 국에 두 번 잠글 수 없다 (첫 대상이 영구 무효화되던 원인)", () => {
    const game = boot(scene(), [
      [disarm, "p0"],
      [alwaysTenpai, "p1"],
      [alwaysTenpai, "p2"],
    ]);
    const first = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    expect(first.ok).toBe(true);
    expect(
      isSourceDisarmed(game.engine.state, augmentInstanceId("p1", "always_tenpai")),
    ).toBe(true);

    const second = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p2", augmentId: "always_tenpai" },
    });
    expect(second.ok).toBe(false);
    // 첫 대상은 목록에 그대로 남아 국 종료에 정상 복구된다
    expect(
      isSourceDisarmed(game.engine.state, augmentInstanceId("p1", "always_tenpai")),
    ).toBe(true);
    expect(
      isSourceDisarmed(game.engine.state, augmentInstanceId("p2", "always_tenpai")),
    ).toBe(false);
  });

  it("잠근 대상은 목록(배열)으로 기록된다", () => {
    const game = boot(scene(), [
      [disarm, "p0"],
      [alwaysTenpai, "p1"],
    ]);
    game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    const locked = game.engine.state.augmentData["disarm:locked:p0"];
    expect(Array.isArray(locked)).toBe(true);
    expect(locked).toEqual([augmentInstanceId("p1", "always_tenpai")]);
  });
});
