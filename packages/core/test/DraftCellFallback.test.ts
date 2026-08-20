/**
 * 드래프트 좌석 칸 — **풀이 얕아져도 "한 게임에 같은 증강을 둘이 갖지 않는다"가 꺼지지 않는다.**
 *
 * 예전 `cellFor` 는 `pool < seats*24 + draw` 면 곧장 `null` 을 돌려 전역 균등 추첨으로
 * 강등했고, 그 폴백 경로는 `heldByOthers` 를 걸지 않아 **경고 한 줄 없이** 중복 방지가
 * 꺼졌다. 오늘 카탈로그의 여유는 12~13장뿐(115 vs 요구치 102)이라, 증강 13종만 정리하거나
 * modes/draftStages 제한을 몇 개 더 걸면 절벽처럼 무너졌다 — 실측 -13종에서 게임의 52.5%가
 * 중복 보유였다(2026-08-20 QA disrupt 확정 5). 값이 아니라 **불변식**이 깨지는데 로그도
 * 테스트도 아무 말을 하지 않는 것이 이 건의 본질이라, 여기서 그 침묵을 못 박는다.
 *
 * 두 겹으로 막는다:
 *  ① 칸 크기를 풀에 맞춰 좁혀 **서로 소인 분할 자체를 지킨다** (구조적).
 *  ② 그래도 칸을 못 만들 만큼 작으면 폴백에서도 금지 목록을 유지하고 경고를 남긴다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AugmentRegistry } from "../src/augment/AugmentRegistry.js";
import { DraftController } from "../src/augment/DraftController.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { GameState } from "../src/engine/state/GameState.js";

const SEATS = ["p0", "p1", "p2", "p3"];

function dummy(id: string): AugmentDef {
  return {
    id,
    tier: "prism",
    category: "scoring",
    name: id,
    description: id,
    detail: id,
    complexity: 1,
    install: () => undefined,
  } as AugmentDef;
}

function setup(poolSize: number, held: Record<string, string[]> = {}) {
  const base: GameState = createInitialGameState(
    { seed: 4242, playerIds: SEATS },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, augments: [...(held[p.id] ?? [])] })),
  };
  const extras: AugmentDef[] = [];
  for (let i = 0; i < poolSize; i++) extras.push(dummy(`a${i}`));
  const game = createStandardGameFromState(state, undefined, extras);
  // 표준 증강까지 섞이면 풀 크기가 흔들린다 — 더미만 남긴 레지스트리를 쓴다.
  const only = new AugmentRegistry();
  only.addAll(extras);
  return new DraftController(game.engine, only);
}

/** 이 스테이지에서 좌석마다 제시(+새로고침)되는 id 전부 */
function offersOf(draft: DraftController): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of SEATS) {
    const { choices, rerolls } = draft.rollWithRerolls("gameStart", p);
    out.set(p, [...choices, ...rerolls].map((d) => d.id));
  }
  return out;
}

describe("드래프트 좌석 칸 — 얕은 풀에서의 강등", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("여유가 사라져도 좌석끼리 오퍼가 겹치지 않는다 (칸을 좁혀서 분할을 지킨다)", () => {
    // 예전 문턱(4×24+6=102) 바로 아래 — 여기가 절벽이었다
    for (const size of [102, 101, 96, 80, 60]) {
      const offers = offersOf(setup(size));
      const seen = new Map<string, string>();
      for (const [seat, ids] of offers) {
        for (const id of ids) {
          expect(seen.has(id), `pool=${size}: ${id} 가 ${seen.get(id)} 와 ${seat} 에 겹쳤다`).toBe(
            false,
          );
          seen.set(id, seat);
        }
      }
    }
  });

  it("남이 이미 가진 증강은 어떤 풀 크기에서도 다시 제시되지 않는다", () => {
    for (const size of [115, 102, 96, 60, 30, 20]) {
      const mine = ["a0", "a1", "a2"];
      const draft = setup(size, { p1: mine });
      const ids = new Set(
        [...offersOf(draft).entries()]
          .filter(([seat]) => seat !== "p1")
          .flatMap(([, v]) => v),
      );
      for (const held of mine) {
        expect(ids.has(held), `pool=${size}: 남이 든 ${held} 이 다시 제시됐다`).toBe(false);
      }
    }
  });

  it("칸을 아예 못 만들 만큼 작으면 **조용히** 넘어가지 않는다 (경고 1회)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    offersOf(setup(20));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("전역 추첨");
  });

  it("칸이 서는 크기에서는 경고를 내지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    offersOf(setup(115));
    offersOf(setup(96));
    expect(warn).not.toHaveBeenCalled();
  });
});
