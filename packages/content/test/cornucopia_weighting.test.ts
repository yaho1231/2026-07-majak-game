/**
 * 수상한 주사위(cornucopia) 지급 추첨의 **티어 가중 + 결정성** 회귀 — 2026-08-27.
 *
 * 예전 구현은 후보에서 완전 균등으로 뽑아, 일반 드래프트가 `powerTier.ts`의
 * `POWER_TIER_WEIGHT`로 눌러 둔 확률과 서버의 자동 조정 오프셋을 이 경로만 우회했다.
 * 여기서 못 박는 것:
 *  ① 지급도 드래프트와 **같은 가중**을 탄다 (약한 티어가 더 자주 나온다).
 *  ② 서버의 자동 조정 오프셋(`setWeightOverrides`)이 지급에도 실린다.
 *  ③ 결정성: 같은 시드·같은 상태면 같은 결과, 리플레이 재구성(`rebuildAugments`)에서도 동일.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_POWER_TIERS,
  AugmentRegistry,
  augmentGrantKey,
  createStandardGame,
  createStandardGameFromState,
  installAugment,
  rebuildAugments,
} from "@majak/core";
import { contentAugments } from "../src/index.js";
import { cornucopia } from "../src/augments/cornucopia.js";

const newGame = (seed: number): ReturnType<typeof createStandardGame> =>
  createStandardGame({ seed, extraAugments: contentAugments });

/** 시드 하나로 p0에게 수상한 주사위를 설치하고 지급된 id 목록을 돌려준다 */
function grantOnce(
  seed: number,
  tweak?: (game: ReturnType<typeof createStandardGame>) => void,
): { game: ReturnType<typeof createStandardGame>; granted: string[] } {
  const game = newGame(seed);
  tweak?.(game);
  game.engine.submit({
    player: "p0",
    type: "draftPick",
    payload: { augmentId: "cornucopia" },
  });
  installAugment(game.engine, cornucopia, "p0", {
    yaku: game.yaku,
    catalog: game.augments,
  });
  const rec = game.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")];
  return { game, granted: Array.isArray(rec) ? (rec as string[]) : [] };
}

describe("수상한 주사위 — 지급 추첨의 티어 가중", () => {
  it("지급된 증강의 평균 가중치가 후보 평균보다 높다 (= 약한 것이 더 자주 나온다)", () => {
    const weightOf = (id: string): number => AugmentRegistry.draftWeight(id);
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const id of grantOnce(seed).granted) {
        sum += weightOf(id);
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
    const grantedMean = sum / n;

    // 균등 추출이었다면 후보 평균 가중치로 수렴한다 (후보는 시드와 무관하게 거의 같다)
    const pool = newGame(1).augments.all();
    const poolMean = pool.reduce((s, d) => s + weightOf(d.id), 0) / pool.length;

    expect(grantedMean).toBeGreaterThan(poolMean);
  });

  it("SS+ 2종(개벽·단색 세계)은 존재하되 D 티어보다 드물게 나온다", () => {
    const tierOf = (id: string): string | undefined => AUGMENT_POWER_TIERS[id]?.tier;
    let ssPlus = 0;
    let dTier = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const id of grantOnce(seed).granted) {
        const t = tierOf(id);
        if (t === "SS+") ssPlus++;
        if (t === "D") dTier++;
      }
    }
    // 완전 배제가 아니다 — 가중치만 정상 적용된다 (사용자 확정: 개벽·단색세계는 유지)
    expect(dTier).toBeGreaterThan(ssPlus);
  });

  it("자동 조정 오프셋(setWeightOverrides)이 지급 추첨에도 실린다", () => {
    // 후보 하나에만 압도적 가중을 주면, 지급 2장 중 하나로 거의 항상 뽑힌다.
    const target = "broken_wall"; // 스테이지 제한 없는 임의의 후보
    const hits = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => {
      const { game, granted } = grantOnce(seed, (g) => {
        expect(g.augments.get(target)).toBeDefined();
        g.augments.setWeightOverrides({ [target]: 10_000 });
      });
      expect(game.augments.weights()[target]).toBe(10_000);
      return granted.includes(target);
    }).length;
    expect(hits).toBe(8);

    // 오프셋이 없으면 8시드 전부에서 뽑히는 일은 없다 (= 위 결과가 오프셋 덕분이다)
    const base = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) =>
      grantOnce(seed).granted.includes(target),
    ).length;
    expect(base).toBeLessThan(8);
  });
});

describe("수상한 주사위 — 결정성", () => {
  it("같은 시드·같은 상태로 두 번 뽑으면 같은 결과다", () => {
    for (const seed of [3, 17, 99, 4242]) {
      expect(grantOnce(seed).granted).toEqual(grantOnce(seed).granted);
    }
  });

  it("재구성(install 재호출)에서 다시 뽑지 않는다", () => {
    const { game, granted } = grantOnce(31);
    const before = [...(game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [])];
    installAugment(game.engine, cornucopia, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(game.engine.state.players.find((p) => p.id === "p0")?.augments).toEqual(before);
    expect(game.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")]).toEqual(granted);
  });

  it("리플레이 재구성(rebuildAugments)이 원본과 같은 지급분을 복원한다", () => {
    const { game, granted } = grantOnce(1234);
    expect(granted).toHaveLength(2);
    const originalHeld = [...(game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [])];

    // 같은 상태에서 게임을 다시 세우고 증강을 재설치한다 (이어하기·리플레이 경로)
    const replay = createStandardGameFromState(
      structuredClone(game.engine.state),
      undefined,
      contentAugments,
    );
    rebuildAugments(replay.engine, replay.augments, {
      yaku: replay.yaku,
      catalog: replay.augments,
    });
    expect(replay.engine.state.players.find((p) => p.id === "p0")?.augments).toEqual(
      originalHeld,
    );
    expect(replay.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")]).toEqual(
      granted,
    );
  });
});
