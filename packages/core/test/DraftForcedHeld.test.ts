/**
 * 고정 드래프트(`forcedChoices`)는 **이미 가진 증강을 다시 세우지 않는다** (2026-09-06).
 *
 * 튜토리얼은 사람 좌석에 카드 석 장을 못 박는다(`presetDraftChoices`). 그런데 못 박기는
 * 추첨을 통째로 건너뛰므로 `excludeFor`의 «보유분 제외»를 지나치지 않았다 — 같은 석
 * 장이 다음 스테이지에도 그대로 서고, 1스테이지에 고른 카드를 다시 고르면
 * `draftPick`이 "already owns this augment"로 거절한다. 그 거절은 `pick`에서 throw가
 * 되어 **판 전체가 예외로 접힌다**.
 *
 * 실제로 그렇게 죽었다 — 공개 서버 로그 2026-09-03~06 사이 체험 방 5판이
 * "게임이 예외로 종료됐다: Error: draftPick failed: already owns this augment"로
 * 끝났고, 전부 튜토리얼 졸업 직후였다.
 */

import { describe, expect, it } from "vitest";
import { AugmentRegistry } from "../src/augment/AugmentRegistry.js";
import { DraftController } from "../src/augment/DraftController.js";
import { createStandardGame } from "../src/mahjong/flow/standardGame.js";
import type { AugmentDef } from "../src/augment/Augment.js";

function dummies(n: number): AugmentDef[] {
  const cats = ["score", "info", "hand", "shape", "call", "riichi", "defense", "disrupt"] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `dummy_${i}`,
    tier: (["silver", "gold", "prism"] as const)[i % 3]!,
    category: cats[i % cats.length]!,
    complexity: 1,
    name: `더미${i}`,
    description: "테스트용",
    detail: "테스트용",
    install: () => {},
  })) as AugmentDef[];
}

/** 튜토리얼과 같은 모양 — 같은 석 장을 스테이지와 무관하게 못 박는다. */
const PINNED = ["dummy_0", "dummy_1", "dummy_2"] as const;

describe("고정 드래프트와 보유 증강", () => {
  it("못 박은 석 장 중 이미 가진 것은 다음 스테이지에서 빠진다", () => {
    const game = createStandardGame({ seed: 7, playerIds: ["p0", "p1", "p2", "p3"] });
    const registry = new AugmentRegistry();
    registry.addAll(dummies(40));
    const draft = new DraftController(
      game.engine,
      registry,
      { yaku: game.yaku, catalog: registry },
      { forcedChoices: () => PINNED },
    );

    // 1스테이지 — 못 박은 석 장이 그대로 선다.
    expect(draft.rollWithRerolls("gameStart", "p0").choices.map((d) => d.id)).toEqual([...PINNED]);
    draft.pick("gameStart", "p0", "dummy_0");

    // 2스테이지 — 방금 고른 것은 빠지고 나머지 두 장만 선다.
    const next = draft.rollWithRerolls("eastThird", "p0").choices.map((d) => d.id);
    expect(next).not.toContain("dummy_0");
    expect(next).toEqual(["dummy_1", "dummy_2"]);

    // 그리고 남은 것을 고르는 데 예외가 나지 않는다 — 판이 죽던 자리가 여기다.
    expect(() => draft.pick("eastThird", "p0", "dummy_1")).not.toThrow();
  });

  it("못 박은 것을 전부 가지면 평범한 추첨으로 넘어간다 (판이 죽지 않는다)", () => {
    const game = createStandardGame({ seed: 11, playerIds: ["p0", "p1", "p2", "p3"] });
    const registry = new AugmentRegistry();
    registry.addAll(dummies(40));
    const draft = new DraftController(
      game.engine,
      registry,
      { yaku: game.yaku, catalog: registry },
      { forcedChoices: () => PINNED },
    );

    draft.pick("gameStart", "p0", "dummy_0");
    draft.pick("eastThird", "p0", "dummy_1");
    draft.pick("southEntry", "p0", "dummy_2");

    const held = new Set(game.engine.state.players.find((p) => p.id === "p0")?.augments ?? []);
    const offers = draft.rollWithRerolls("southThird", "p0").choices.map((d) => d.id);
    expect(offers.length).toBeGreaterThan(0);
    for (const id of offers) expect(held.has(id)).toBe(false);
    expect(() => draft.pick("southThird", "p0", offers[0]!)).not.toThrow();
  });
});
