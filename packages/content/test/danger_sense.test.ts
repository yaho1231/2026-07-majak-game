/**
 * 지뢰 탐지 (danger_sense) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴에 선언하면, 내 손패 중 지금 버리면 방총이 되는 종류가 보유자 전용
 *     채널(view:p0:danger_sense)에 kindKey 문자열 배열로 실린다.
 *  2. 상대의 대기와 겹치는 종류만 잡히고, 아무도 기다리지 않는 안전패는 빠진다.
 *  3. 발동은 게임당 1회 — 다시 후보로 제시되지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { dangerSense } from "../src/augments/danger_sense.js";

const VIEW_KEY = "view:p0:danger_sense";
const MAN3 = kindKey({ suit: "man", rank: 3 }); // 위험패: p1의 오름패
const DRAGON3 = kindKey({ suit: "dragon", rank: 3 }); // 7z 중(red) — 아무도 안 기다리는 안전패

function withAugment(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, "danger_sense"] } : p,
    ),
  };
}

/**
 * p0(보유자)은 자기 턴. 손패에 3m(위험)과 7z(안전)을 쥔다.
 * p1은 3m 단기(탄키) 대기 텐파이 — 3m으로만 화료한다.
 * p2·p3은 흩어진 노텐 손이라 아무것도 기다리지 않는다.
 */
function scene(): GameState {
  const base = craft({
    hands: {
      p0: "3m123p456p789p11s7z7z", // 14장, 3m·7z 포함
      p1: "123m456m789m123p3m", // 13장, 3m 탄키 텐파이
      p2: "159m159p159s1234z", // 노텐
      p3: "147m147p147s1234z", // 노텐
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugment(base, "p0");
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

describe("지뢰 탐지 (danger_sense)", () => {
  it("자기 턴에 선언 후보가 제시된다", () => {
    const { status } = startFlow(scene());
    const prompt = status.prompts.find((p) => p.player === "p0");
    const opt = prompt?.options.find((o) => o.type === "danger_sense_use");
    expect(opt).toBeDefined();
  });

  it("선언하면 상대 오름패와 겹치는 내 손패 종류만 보유자 채널에 실린다", () => {
    const { game, flow } = startFlow(scene());
    expect(game.engine.state.augmentData[VIEW_KEY]).toBeUndefined();

    flow.submit("p0", { type: "danger_sense_use", payload: {} });

    const danger = game.engine.state.augmentData[VIEW_KEY];
    expect(Array.isArray(danger)).toBe(true);
    // p1이 기다리는 3m은 위험패로 잡힌다
    expect(danger).toContain(MAN3);
    // 아무도 안 기다리는 7z(중)은 안전 — 목록에 없다
    expect(danger).not.toContain(DRAGON3);
  });

  it("발동은 국당 1회 — 이후 후보로 제시되지 않는다", () => {
    const { game, flow } = startFlow(scene());
    flow.submit("p0", { type: "danger_sense_use", payload: {} });
    // 국 스코프 플래그(roundKey 포함)가 켜진다
    const ad = game.engine.state.augmentData;
    expect(
      Object.keys(ad).some(
        (k) => k.startsWith("danger_sense:used:") && k.endsWith(":p0") && ad[k] === true,
      ),
    ).toBe(true);

    // 재선언 시도는 validate가 막는다
    expect(() =>
      flow.submit("p0", { type: "danger_sense_use", payload: {} }),
    ).toThrow();
  });
});
