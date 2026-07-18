/**
 * 등급 통일 드래프트(#6) + 도박사 계열 지급(#7) 검증.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGame,
  DraftController,
  draftDoneKey,
} from "@majak/core";
import type { AugmentTier } from "@majak/core";
import { contentAugments } from "../src/index.js";

type Game = ReturnType<typeof createStandardGame>;

function makeGame(seed: number): Game {
  return createStandardGame({ seed, extraAugments: contentAugments });
}

/** 조건을 만족하는 게임을 시드를 훑어 찾는다 (결정적 탐색). */
function findGame(pred: (g: Game, d: DraftController) => boolean): {
  game: Game;
  draft: DraftController;
} {
  for (let seed = 1; seed < 4000; seed++) {
    const game = makeGame(seed);
    const draft = new DraftController(game.engine, game.augments);
    if (pred(game, draft)) return { game, draft };
  }
  throw new Error("no matching seed found");
}

function tierOf(game: Game, id: string): AugmentTier | undefined {
  return game.augments.get(id)?.tier;
}

describe("#6 등급 통일 드래프트", () => {
  it("한 증강턴의 제시는 모두 같은 등급이고, 전원이 같은 등급을 받는다", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = makeGame(seed);
      const draft = new DraftController(game.engine, game.augments);
      for (const stage of ["gameStart", "southEntry"] as const) {
        const tier = draft.tierForStage(stage);
        for (const pid of ["p0", "p1", "p2", "p3"]) {
          const roll = draft.roll(stage, pid);
          expect(roll.length).toBeGreaterThan(0);
          expect(roll.every((d) => d.tier === tier)).toBe(true);
        }
      }
    }
  });
});

describe("#7 도박사 지급", () => {
  it("도박사(실버) 픽 → 무작위 골드 증강을 함께 얻는다", () => {
    const { game, draft } = findGame((_g, d) =>
      d.roll("gameStart", "p0").some((c) => c.id === "gambler"),
    );
    draft.pick("gameStart", "p0", "gambler");
    const owned = game.engine.state.players.find((p) => p.id === "p0")!.augments;
    expect(owned[0]).toBe("gambler");
    expect(owned.length).toBeGreaterThanOrEqual(2);
    // 두 번째로 얻은 것은 골드 등급(전문 도박사면 연쇄로 프리즘까지 이어짐)
    expect(tierOf(game, owned[1]!)).toBe("gold");
    if (owned[1] === "gambler_pro") {
      expect(tierOf(game, owned[2]!)).toBe("prism");
    }
    // 정식 픽만 스테이지 완료 플래그를 남긴다
    expect(game.engine.state.augmentData[draftDoneKey("gameStart", "p0")]).toBe(true);
  });

  it("전문 도박사(골드) 픽 → 무작위 프리즘 증강을 함께 얻는다", () => {
    const { game, draft } = findGame((_g, d) =>
      d.roll("gameStart", "p0").some((c) => c.id === "gambler_pro"),
    );
    draft.pick("gameStart", "p0", "gambler_pro");
    const owned = game.engine.state.players.find((p) => p.id === "p0")!.augments;
    expect(owned[0]).toBe("gambler_pro");
    expect(owned.length).toBeGreaterThanOrEqual(2);
    expect(tierOf(game, owned[1]!)).toBe("prism");
  });

  it("지급된 증강은 이벤트 로그에 기록되어 재구성 가능하다", () => {
    const { game, draft } = findGame((_g, d) =>
      d.roll("gameStart", "p0").some((c) => c.id === "gambler"),
    );
    draft.pick("gameStart", "p0", "gambler");
    const drafted = game.engine.eventLog.filter(
      (e) => e.type === "AugmentDrafted" && (e.payload as { player: string }).player === "p0",
    );
    // 최소 2건(도박사 + 지급) 이상 기록
    expect(drafted.length).toBeGreaterThanOrEqual(2);
  });
});
