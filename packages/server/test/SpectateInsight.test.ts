/**
 * 중계 보조값 — 예상 타점·위험패 (docs/36 A2·A4).
 *
 * 지키는 것 둘.
 *  · **관전 뷰에서만** 만든다. 손패가 가려진 시점에서 이 값을 만들면 계산이 아니라
 *    지어내기이고, 그 값이 대국자에게 가면 그건 그냥 치트다.
 *  · 계산은 **봇이 쓰는 그 눈** 그대로다 — 화면과 봇이 다른 숫자를 말하면 둘 중
 *    하나는 거짓말인데 어느 쪽인지 알 수 없다.
 */

import { describe, expect, it } from "vitest";
import { buildPlayerView, SPECTATOR_ID } from "@majak/core/information/PlayerView.js";
import { RuleRegistry } from "@majak/core/engine/rules/RuleRegistry.js";
import { defineVisibilityRules } from "@majak/core/information/PlayerView.js";
import {
  createInitialGameState,
  setupRound,
} from "@majak/core/engine/state/GameState.js";
import { buildSpectateInsight } from "../src/spectateInsight.js";

function makeView(viewer: string) {
  const state = setupRound(
    createInitialGameState(
      { seed: 11, playerIds: ["p0", "p1", "p2", "p3"] },
      { startScore: 25000, redFivesPerSuit: 1 },
    ),
  );
  const rules = new RuleRegistry();
  defineVisibilityRules(rules);
  return buildPlayerView(state, viewer, rules);
}

describe("중계 보조값", () => {
  it("관전 뷰가 아니면 만들지 않는다", () => {
    expect(buildSpectateInsight(makeView("p0"))).toBeNull();
  });

  it("네 좌석 모두의 예상 타점과 샹텐을 낸다", () => {
    const insight = buildSpectateInsight(makeView(SPECTATOR_ID));
    expect(insight).not.toBeNull();
    expect(insight!.seats).toHaveLength(4);
    for (const s of insight!.seats) {
      // 배패 직후라 텐파이일 리 없다 — 샹텐은 0 이상이고, 값은 음수가 되지 않는다.
      expect(s.shanten).toBeGreaterThanOrEqual(0);
      expect(s.points).toBeGreaterThanOrEqual(0);
      expect(s.han).toBeGreaterThanOrEqual(0);
    }
  });

  it("배패 직후에는 위험패를 매기지 않는다 — 읽을 위협이 없다", () => {
    // 아무도 텐파이가 아니고 바닥도 비었다. 이때 색을 칠하면 그건 근거 없는 겁주기다.
    const insight = buildSpectateInsight(makeView(SPECTATOR_ID));
    expect(insight!.danger).toBeUndefined();
    expect(insight!.dangerSeat).toBeUndefined();
  });
});
