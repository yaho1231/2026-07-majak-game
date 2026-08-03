/**
 * 드래프트 상호 배제 선언 + 천하통일 문턱 (docs/25 §conflicts, 사용자 확정 2026-08-03).
 *
 * conflicts는 104종 중 2종에만 선언돼 있어, 드래프트가 "조용히 죽는 픽"과
 * "게임을 끝내는 픽"을 계속 제시했다. A급(게임 파괴) 5건과 B급(조용한 무효) 5건을
 * 선언하고, 천하통일은 conflicts 대신 **문턱을 증강 발행분만큼 올리는** 방식으로 막는다.
 */

import { describe, expect, it } from "vitest";
import { ROUND_SETTLED, createStandardGameFromState, installAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft } from "./helpers.js";
import { unification } from "../src/augments/unification.js";

const byId = new Map(contentAugments.map((a) => [a.id, a]));
const defOf = (id: string): AugmentDef => {
  const d = byId.get(id);
  if (d === undefined) throw new Error(`unknown augment: ${id}`);
  return d;
};

/** a와 b가 (어느 방향으로든) 상호 배제 관계인가 — 관계는 대칭이라 한쪽 선언이면 충분 */
function excludes(a: string, b: string): boolean {
  return (
    (defOf(a).conflicts ?? []).includes(b) || (defOf(b).conflicts ?? []).includes(a)
  );
}

describe("A급 — 게임 파괴 조합은 함께 뽑히지 않는다", () => {
  const cases: [string, string, string][] = [
    ["free_riichi_discard", "last_stand", "리치 취소 후 스냅샷이 남아 그 국 벽돌"],
    ["free_riichi_discard", "palm_flip", "같은 경로 (RiichiFlipped)"],
    ["open_riichi_reveal", "last_stand", "취소 후 다른 대기로도 직격 역만 성립"],
    ["open_riichi_reveal", "palm_flip", "같은 경로"],
    ["die_hard", "yakuman_shield", "같은 Shield 단계 동률이 픽 순서로 갈린다"],
    ["regret", "honor_return", "둘 다 배패 앞자리를 덮어써 서로를 지운다"],
    ["frame_up", "seat_swap", "discardedKinds 고정으로 첫 순 제한 무력화"],
    ["frame_up", "suit_unify", "같은 경로"],
    ["frame_up", "alchemist", "같은 경로"],
    ["frame_up", "take_back", "같은 경로 (쿨다운이 안 풀린다)"],
  ];
  for (const [a, b, why] of cases) {
    it(`${a} ↔ ${b} — ${why}`, () => {
      expect(excludes(a, b)).toBe(true);
    });
  }
});

describe("B급 — 조용히 사표가 되는 조합도 막는다", () => {
  const cases: [string, string][] = [
    ["invincible", "no_ron_pact"],
    ["riichi_seal", "riichi_upgrade"],
    ["no_retreat", "palm_flip"],
    ["hidden_blade", "soul_hunt"],
    ["avenger", "late_bloomer"],
    ["avenger", "late_bloomer_east"],
  ];
  for (const [a, b] of cases) {
    it(`${a} ↔ ${b}`, () => {
      expect(excludes(a, b)).toBe(true);
    });
  }
});

describe("conflicts가 가리키는 id는 전부 실재한다", () => {
  it("오타·삭제된 id를 가리키지 않는다", () => {
    const known = new Set(contentAugments.map((a) => a.id));
    const dangling: string[] = [];
    for (const def of contentAugments) {
      for (const c of def.conflicts ?? []) {
        // 표준 증강(core)은 여기 목록에 없으므로 그쪽은 건너뛴다
        if (!known.has(c) && !c.startsWith("open_riichi")) dangling.push(`${def.id}→${c}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});

describe("천하통일 — 증강이 만든 점수는 문턱에 세지 않는다", () => {
  function game(): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["unification"] } : p,
      ),
    };
    const g = createStandardGameFromState(state, undefined, [unification]);
    installAugment(g.engine, unification, "p0", { yaku: g.yaku });
    return g;
  }

  const threshold = (g: ReturnType<typeof createStandardGameFromState>): number =>
    g.engine.rules.resolve<number>("match.instantWinScore", {
      playerId: "p0",
      state: g.engine.state,
    });

  it("기본 문턱은 50000이다", () => {
    expect(threshold(game())).toBe(50000);
  });

  it("증강이 얹어 준 점수만큼 문턱이 올라간다", () => {
    const g = game();
    // 유국역만·승승장구 등이 뱅크에서 발행한 32000점을 흉내낸다
    g.engine.reducers.register("__test_settled", (s) => s);
    const reactions = g.engine.effects.reactionsFor(ROUND_SETTLED);
    for (const { react } of reactions) {
      react(
        {
          seq: 1,
          type: ROUND_SETTLED,
          payload: {
            outcome: "draw",
            deltas: {},
            augPoints: [{ player: "p0", augId: "nagashi_yakuman", points: 32000 }],
          },
        },
        {
          state: g.engine.state,
          rules: g.engine.rules,
          emit: (e) => {
            const p = e.payload as { key: string; value: unknown };
            g.engine.state.augmentData[p.key] = p.value;
          },
        },
      );
    }
    expect(threshold(g)).toBe(50000 + 32000);
  });
});
