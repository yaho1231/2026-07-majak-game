/**
 * 드래프트 — 좌석 칸 폴백에서도 **한 게임에 같은 증강이 둘 있지 않다**
 * (QA 2차 synergy 확정 1·3, 2026-08-22).
 *
 * `DraftController` 머리말이 못 박은 불변식이다. 칸(`cellFor`)이 서 있을 때는 칸이
 * 서로 소라 저절로 지켜지지만, 카탈로그가 좁아 칸을 못 만드는 **폴백**에서는 그
 * 방어가 통째로 사라진다. 예전 폴백은 좌석마다 독립적으로 전역 추첨을 돌리면서
 * 스테이지 **시작 시점 스냅샷**(`heldByOthers`)만 걸었는데, 그것으로는 «이번
 * 스테이지에 두 좌석이 동시에 같은 것을 고르는 것»을 막을 수 없다 — 실측으로
 * 폴백이 걸리면 게임의 59~82%가 중복 보유로 끝났다. 더 나쁜 것은 경고 문구가
 * *"게임 내 중복 보유는 계속 막지만"* 이라고 **반대로** 말한 점이다.
 *
 * 오늘 카탈로그(114종)로는 폴백에 도달하지 않지만, 증강을 60종쯤 정리하거나
 * `modes`/`draftStages` 제한을 늘리거나 좌석 수를 바꾸는 순간 절벽처럼 무너진다.
 * 그래서 **좁은 카탈로그를 일부러 만들어** 여기서 붙잡는다.
 *
 * 함께 검사: 시너지 표가 카탈로그의 `conflicts` 와 어긋나지 않는가(확정 3).
 */

import { describe, expect, it } from "vitest";
import { AugmentRegistry } from "../src/augment/AugmentRegistry.js";
import { DraftController } from "../src/augment/DraftController.js";
import type { DraftStage } from "../src/augment/DraftController.js";
import { synergyBias } from "../src/augment/synergy.js";
import { createStandardGame } from "../src/mahjong/flow/standardGame.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";

/** 아무 일도 하지 않는 더미 증강 N종 — 드래프트 배관만 검사한다. */
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

const STAGES: DraftStage[] = ["gameStart", "eastThird", "southEntry", "southThird"];

/**
 * 좁은 카탈로그로 한 게임분 드래프트를 돌리고, 좌석별 보유 목록을 돌려준다.
 * 실제 픽 경로(`offer` → `pick`)를 그대로 쓴다.
 */
function runDraft(catalogSize: number, seed: number): Record<PlayerId, string[]> {
  const game = createStandardGame({ seed, playerIds: ["p0", "p1", "p2", "p3"] });
  const registry = new AugmentRegistry();
  registry.addAll(dummies(catalogSize));
  const draft = new DraftController(game.engine, registry, { yaku: game.yaku, catalog: registry });

  const held: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  for (const stage of STAGES) {
    for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const offers = draft.roll(stage, p);
      // 후보가 아예 없으면 그건 다른 종류의 사고다 — 여기서 드러나게 둔다.
      expect(offers.length, `${stage}/${p} 후보 0장`).toBeGreaterThan(0);
      const first = offers[0];
      if (first === undefined) throw new Error(`${stage}/${p} 후보 0장`);
      draft.recordOffer(stage, p, offers);
      draft.pick(stage, p, first.id);
      held[p]!.push(first.id);
    }
  }
  return held;
}

describe("좌석 칸 폴백 — 같은 증강을 둘이 갖지 않는다", () => {
  // 54 미만이면 칸을 못 만들어 폴백으로 떨어진다(경고가 찍히는 구간).
  for (const size of [30, 40, 48]) {
    it(`카탈로그 ${size}종(폴백 구간)에서도 중복 보유가 0이다`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const held = runDraft(size, seed * 1013);
        const seen = new Map<string, PlayerId>();
        for (const [p, ids] of Object.entries(held) as [PlayerId, string[]][]) {
          for (const id of ids) {
            const owner = seen.get(id);
            expect(owner, `seed=${seed} ${id}: ${owner} 와 ${p} 가 함께 보유`).toBeUndefined();
            seen.set(id, p);
          }
        }
      }
    });
  }

  /**
   * 좌석 수 × 화면 칸보다도 작은 카탈로그에서는 겹침 금지를 **지킬 방법이 없다**
   * (좌석 4 × 3칸 = 12장이 매 스테이지 새로 필요한데 지난 스테이지들이 이미 12장을
   * 가져갔다). 그때 지켜야 할 것은 «빈 드래프트 화면을 만들지 않는다» 쪽이다 —
   * 판이 그 자리에 서는 편이 더 나쁘다. 실제 카탈로그(114종)에서는 도달하지 않는다.
   */
  it("카탈로그 20종(불가능 구간)에서도 빈 화면은 만들지 않는다", () => {
    for (let seed = 1; seed <= 6; seed++) {
      expect(() => runDraft(20, seed * 331)).not.toThrow();
    }
  });

  it("칸이 서는 넉넉한 카탈로그(60종)에서도 그대로다 (회귀 대조군)", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const held = runDraft(60, seed * 7717);
      const all = Object.values(held).flat();
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe("시너지 표는 카탈로그의 배타(conflicts)와 어긋나지 않는다", () => {
  it("함께 가질 수 없는 쌍에는 «함께 오면 좋다» 가중치가 붙지 않는다", async () => {
    // 실제 카탈로그로 검사한다 — 이 검사의 값은 «지금 배포되는 표 둘이 서로를
    // 부정하지 않는가» 이므로 더미로는 뜻이 없다.
    const { contentAugments } = await import("@majak/content");
    const conflictsOf = (id: string): readonly string[] =>
      contentAugments.find((d: AugmentDef) => d.id === id)?.conflicts ?? [];

    const offenders: string[] = [];
    for (const def of contentAugments as AugmentDef[]) {
      const bias = synergyBias([def.id], conflictsOf);
      for (const other of conflictsOf(def.id)) {
        if ((bias[other] ?? 1) > 1) offenders.push(`${def.id} + ${other} = x${bias[other]}`);
      }
      // 반대 방향(상대가 나를 배타하는 경우)도 대칭으로 막혀야 한다.
      for (const [id, mult] of Object.entries(bias)) {
        if (mult > 1 && conflictsOf(id).includes(def.id)) offenders.push(`${def.id} + ${id} = x${mult}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
