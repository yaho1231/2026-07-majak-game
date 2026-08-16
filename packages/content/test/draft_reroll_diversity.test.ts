/**
 * 슬롯 새로고침의 **겹침 금지** — 실제 카탈로그(표준 4 + 콘텐츠)로 검증.
 *
 * 사용자 요구(2026-08-17)가 바로 이것이다: "교체되는 것들을 포함해서 플레이어들끼리
 * 증강이 겹치지 않게 미리 골라 둬." 그래서 교체분은 새로고침을 누른 순간에 뽑는 것이
 * 아니라 제시와 **같은 추첨**에서 미리 확정된다(`DraftController.rollWithRerolls`).
 *
 * 여기서 재는 것은 그 성질이 실전 풀에서도 성립하는가다 — `draftStages`·`modes` 필터가
 * 풀을 깎은 뒤에도, 한 좌석이 6장(화면 3 + 교체 3)을 가져가고도 네 좌석 24장이
 * 서로 겹치지 않을 만큼 좌석 칸이 남는가.
 */

import { describe, expect, it } from "vitest";
import { DraftController, createStandardGame } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const HANCHAN_STAGES = ["gameStart", "eastThird", "southEntry", "southThird"] as const;

function game(seed: number, mode: "hanchan" | "tonpuu" = "hanchan") {
  return createStandardGame({ seed, mode, extraAugments: contentAugments });
}

describe("슬롯 새로고침 — 교체분까지 좌석 간 겹치지 않는다", () => {
  it("한 스테이지에서 네 명의 24장(제시 12 + 교체 12)이 전부 서로 다르다", () => {
    for (const seed of [1, 5, 17, 88, 2026, 31337]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const all = PLAYERS.flatMap((p) => {
        const { choices, rerolls } = draft.rollWithRerolls("gameStart", p);
        expect(choices).toHaveLength(3);
        expect(rerolls).toHaveLength(3);
        return [...choices, ...rerolls].map((d) => d.id);
      });
      expect(all).toHaveLength(24);
      expect(new Set(all).size).toBe(24);
    }
  });

  it("동풍전도 마찬가지 — 모드 필터로 풀이 깎여도 칸이 24장을 감당한다", () => {
    for (const seed of [2, 9, 404]) {
      const g = game(seed, "tonpuu");
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const all = PLAYERS.flatMap((p) => {
        const { choices, rerolls } = draft.rollWithRerolls("eastFourth", p);
        return [...choices, ...rerolls].map((d) => d.id);
      });
      expect(new Set(all).size).toBe(24);
    }
  });

  it("게임 전체(4스테이지)에서 누가 어떻게 새로고침해도 같은 증강을 둘이 갖지 않는다", () => {
    // 최악에 가까운 시나리오: 전원이 매 스테이지 **모든 슬롯을 새로고침한 뒤** 픽한다.
    for (const seed of [3, 21, 777, 4242]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const held: string[] = [];
      for (const stage of HANCHAN_STAGES) {
        const pool = new Map(
          PLAYERS.map((p) => [p, draft.rollWithRerolls(stage, p)] as const),
        );
        // 뒤 스테이지에는 앞 스테이지에서 누가 가져간 것이 교체분에도 없다
        for (const { choices, rerolls } of pool.values()) {
          for (const d of [...choices, ...rerolls]) expect(held).not.toContain(d.id);
        }
        for (const p of PLAYERS) {
          // 슬롯 2를 새로고침한 셈 치고 교체분에서 고른다
          const swapped = pool.get(p)!.rerolls[2]!.id;
          draft.pick(stage, p, swapped);
          held.push(swapped);
        }
      }
      expect(new Set(held).size).toBe(held.length); // 16픽 전부 다른 증강
    }
  });

  it("새로고침한 슬롯을 픽해도 거부되지 않는다 (전원 제시 → 전원 픽 순서에서)", () => {
    for (const seed of [4, 64, 1234]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const pool = PLAYERS.map((p) => ({ p, ...draft.rollWithRerolls("gameStart", p) }));
      for (const { p, choices, rerolls } of pool) {
        // 슬롯 0은 그대로, 슬롯 1은 갈아 낀 상태에서 고른다 — 둘 다 통과해야 한다
        const target = p === "p0" ? choices[0]!.id : rerolls[1]!.id;
        expect(() => draft.pick("gameStart", p, target)).not.toThrow();
      }
    }
  });

  it("보유 증강은 교체분으로도 다시 오지 않는다 (내 것도, 남의 것도)", () => {
    const g = game(909);
    const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
    const taken: string[] = [];
    for (const p of PLAYERS) {
      const first = draft.roll("gameStart", p)[0]!.id;
      draft.pick("gameStart", p, first);
      taken.push(first);
    }
    for (const p of PLAYERS) {
      const { choices, rerolls } = draft.rollWithRerolls("southEntry", p);
      for (const d of [...choices, ...rerolls]) expect(taken).not.toContain(d.id);
    }
  });
});
