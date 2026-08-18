/**
 * docs/21 §C-3 · §C-4 마감 (2026-08-18 사용자 확정).
 *
 * **C-3 (죽기살기 × 수비 증강)** — 죽기살기는 "크게 잃는 순간"을 자원으로 쓴다.
 * 그 순간을 지우는 수비 증강과 함께 들면 수비가 성공할수록 수익이 0에 수렴한다.
 * 사용자 결정: 효과를 바꾸지 않고 **픽 단계에서 상호 배제**한다(C-1과 같은 방식).
 *
 * **C-4 (완전 중복 7쌍)** — 원칙은 "역할 분리 우선, 안 되면 상호 배제"다.
 * 실측해 보니 감사 이후의 작업들이 이미 대부분을 해소했고(docs/25 §conflicts와
 * 2026-08-02·08-15 재설계), 남은 것은 **두 번째 픽도 자기 몫을 하는 부분 중복**뿐이다.
 * 이 파일은 그 해소 상태를 못박아, 누가 되돌리면 테스트가 먼저 깨지게 한다.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEAD_WALL, createStandardGameFromState, installAugment } from "@majak/core";
import type { AugmentDef, GameState, PlayerId, VisibilityRule } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft } from "./helpers.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { rinshanPreview } from "../src/augments/rinshan_preview.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";

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

/** 주석을 걷어 낸 실행 코드 — "주석에는 남아 있어도 되지만 코드에서 하면 안 된다"용 */
function codeOf(id: string): string {
  return readFileSync(`packages/content/src/augments/${id}.ts`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("C-3 — 죽기살기는 '크게 잃는 순간'을 지우는 수비와 함께 뽑히지 않는다", () => {
  const cases: [string, string][] = [
    ["yakuman_shield", "역만 실점 0 — 죽기살기가 노리는 가장 큰 실점을 정확히 지운다"],
    ["invincible", "그 국 무방총 — 마이너스로 내려갈 주된 경로가 사라진다"],
    ["no_ron_pact", "론 면역 — 같은 이유"],
    ["always_tenpai", "노텐 벌점 면제 — 화료 없는 국의 유일한 실점 경로를 막는다"],
  ];
  for (const [other, why] of cases) {
    it(`die_hard ↔ ${other} — ${why}`, () => {
      expect(excludes("die_hard", other)).toBe(true);
    });
  }
});

describe("C-4 — 감사 당시의 중복이 실제로 해소돼 있다", () => {
  it("① win.furiten.enabled + win.requiresYaku — 복수자 ↔ 대기만성 두 판 모두 배제", () => {
    expect(excludes("avenger", "late_bloomer")).toBe(true);
    expect(excludes("avenger", "late_bloomer_east")).toBe(true);
  });

  it("① 대기만성 두 판은 모드 게이트로 애초에 같은 게임에 뜨지 않는다", () => {
    expect(defOf("late_bloomer").modes).toEqual(["hanchan"]);
    expect(defOf("late_bloomer_east").modes).toEqual(["tonpuu"]);
  });

  it("② scoring.uraWithoutRiichi — 숨은 칼날 ↔ 혼 사냥 배제", () => {
    expect(excludes("hidden_blade", "soul_hunt")).toBe(true);
  });

  it("③ win.ronImmune — 천하무적 ↔ 불가침 조약 배제", () => {
    expect(excludes("invincible", "no_ron_pact")).toBe(true);
  });

  it("④ riichi.cost=0 — 손바닥 뒤집기는 더 이상 리치 비용을 건드리지 않는다", () => {
    // 2026-08-15 재설계로 '공짜 리치'에서 '대기 교체'로 옮겼다. 되돌리면
    // 물러설 수 없는 선언과 다시 같은 키를 같은 값으로 쓰게 된다.
    expect(codeOf("palm_flip")).not.toMatch(/riichi\.cost/);
    expect(codeOf("no_retreat")).toMatch(/riichi\.cost/);
  });

  it("⑤ riichi.blocked — 리치 봉인 ↔ 이중 선언 배제", () => {
    expect(excludes("riichi_seal", "riichi_upgrade")).toBe(true);
  });

  it("⑦ visibility.discards — 안개 둘은 가리는 범위가 다르고, 좁은 쪽이 이긴다", () => {
    // 박무 = count_only(통째로), 안개 덮인 바닥 = 최근 6장. 넓은 쪽이 좁은 쪽을
    // 덮으면 설치 순서로 정보가 새므로, hidden_river는 이미 좁혀진 값을 넓히지 않는다.
    const code = codeOf("hidden_river");
    expect(code).toMatch(/cur === "count_only"/);
    expect(code).toMatch(/cur === "hidden"/);
    expect(codeOf("brief_fog")).toMatch(/"count_only"/);
  });
});

/**
 * ⑥ visibility.deadWall — 왕패를 여는 넷은 **열람 범위가 합성**되고, 그 결과가
 * 설치(=픽) 순서에 의존하지 않는다. 각자의 본체(교환·끌어오기·선택+만개)는 그대로
 * 남으므로 두 번째 픽이 죽지 않는다. 셋 다 `widenPeek`을 쓰는 것이 그 근거다
 * (하나라도 cur를 무시하고 덮으면 넓은 쪽이 좁은 쪽으로 **좁혀진다** — docs/25 P7).
 */
describe("C-4 ⑥ 왕패 열람은 합성되고 픽 순서에 의존하지 않는다", () => {
  const PEEKERS: readonly [string, AugmentDef][] = [
    ["dead_wall_master", deadWallMaster],
    ["rinshan_preview", rinshanPreview],
    ["cliff_bloom", cliffBloom],
  ];

  function peekCount(order: readonly [string, AugmentDef][]): number {
    const holder: PlayerId = "p0";
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: holder,
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === holder ? { ...p, augments: order.map(([id]) => id) } : p,
      ),
    };
    const g = createStandardGameFromState(state, undefined, contentAugments);
    for (const [, def] of order) {
      installAugment(g.engine, def, holder, { yaku: g.yaku });
    }
    const rule = g.engine.rules.resolve<VisibilityRule>("visibility.deadWall", {
      playerId: holder,
      state: g.engine.state,
    });
    if (typeof rule !== "object") return 0;
    return rule.count;
  }

  it("모든 설치 순서가 같은 열람 범위를 준다 (= 왕패 14장 전체)", () => {
    const deadWallSize = 14;
    const seen = new Set<number>();
    // 3종의 순열 6가지를 전부 돈다
    for (let i = 0; i < PEEKERS.length; i++) {
      for (let j = 0; j < PEEKERS.length; j++) {
        for (let k = 0; k < PEEKERS.length; k++) {
          if (i === j || j === k || i === k) continue;
          seen.add(
            peekCount([
              PEEKERS[i] as [string, AugmentDef],
              PEEKERS[j] as [string, AugmentDef],
              PEEKERS[k] as [string, AugmentDef],
            ]),
          );
        }
      }
    }
    expect([...seen]).toEqual([deadWallSize]);
  });

  it("왕패의 주인 없이도 좁은 쪽이 넓은 쪽을 깎지 않는다", () => {
    const withBoth = peekCount([
      ["cliff_bloom", cliffBloom],
      ["rinshan_preview", rinshanPreview],
    ]);
    const reversed = peekCount([
      ["rinshan_preview", rinshanPreview],
      ["cliff_bloom", cliffBloom],
    ]);
    expect(withBoth).toBe(reversed);
    // 영상 정찰 1장보다 절벽(남은 영상패 수)이 넓다 — 1로 좁혀지면 P7 회귀다
    expect(withBoth).toBeGreaterThan(1);
  });

  it("왕패를 여는 넷은 전부 widenPeek으로 합성한다", () => {
    for (const id of ["dead_wall_master", "rinshan_preview", "cliff_bloom", "ura_peek"]) {
      expect(codeOf(id)).toMatch(/widenPeek/);
    }
  });

  it("각자의 본체(액션)는 서로 다르다 — 두 번째 픽이 아무 일도 안 하지 않는다", () => {
    // 열람이 겹쳐도 교환·끌어오기·선택은 남는다. 액션 id가 하나로 합쳐지면 그때는
    // 진짜 중복이므로, 서로 다른 id를 쓰고 있다는 사실을 못박는다.
    const actions = ["dead_wall_master", "rinshan_preview", "cliff_bloom", "ura_peek"].map(
      (id) => {
        const m = /const ACTION\w* = "([^"]+)"/.exec(codeOf(id));
        return m?.[1] ?? id;
      },
    );
    expect(new Set(actions).size).toBe(actions.length);
  });
});

describe("왕패 열람의 근거 — deadWall zone은 14장이다", () => {
  it("craft가 만드는 왕패가 14장이라 위 기대값이 성립한다", () => {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    expect(s.zones[DEAD_WALL]?.tileIds.length).toBe(14);
  });
});
