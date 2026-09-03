/**
 * **액션 타입 → 증강 id** 되찾기 (`augmentIdForActionType`).
 *
 * 관전 중계가 「어느 좌석이 지금 무엇을 고르고 있는가」를 적으려면 `alchemy` 같은
 * 액션 타입에서 증강 이름을 찾아야 한다. 예전에는 그 표가 **클라이언트 소스**에
 * 손으로 적혀 있었고(`App.tsx`의 `alchemy: "alchemist"`), 증강이 늘 때 빠뜨리면
 * 이름이 조용히 사라졌다. 지금은 증강이 자기 선택지를 세우는 그 자리에서 core가
 * 기록한다 — 새 증강은 아무것도 안 해도 저절로 이름이 붙는다(2026-09-03).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  augmentIdForActionType,
  createStandardGameFromState,
  installAugment,
  isAugmentActionType,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { alchemist } from "../src/augments/alchemist.js";

function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === ("p0" as PlayerId) ? { ...p, augments: ["alchemist"] } : p,
    ),
  };
}

describe("액션 타입의 주인 증강", () => {
  it("연금술사가 선택지를 세우면 그 타입의 주인이 기록된다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, alchemist, "p0", { yaku: game.yaku });
    const status = new FlowController(game.engine).begin();
    // 이 판에 실제로 연금술 선택지가 서 있어야 시험이 성립한다
    const opts = status.kind === "awaiting" ? (status.prompts[0]?.options ?? []) : [];
    expect(opts.some((o) => o.type === "alchemy")).toBe(true);
    expect(augmentIdForActionType("alchemy")).toBe("alchemist");
  });

  it("표준 마작 액션은 «증강이 연 선택»이 아니다", () => {
    for (const t of ["discard", "pon", "chi", "ankan", "riichi", "win", "pass"]) {
      expect(isAugmentActionType(t)).toBe(false);
    }
    expect(isAugmentActionType("sys.draw")).toBe(false);
    expect(isAugmentActionType("alchemy")).toBe(true);
  });
});
