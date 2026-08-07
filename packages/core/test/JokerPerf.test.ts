/**
 * 조커(wildKinds) 분해 성능 — **백 장수가 늘어도 터지지 않는다.**
 *
 * 2026-08-07 사용자 보고: `123456789백백백백`처럼 백 4장을 쥐면 한 순이 5~10초씩 걸렸다.
 * 원인은 조커를 실제 패로 바꿔 놓고 다시 분해하는 방식이었다 — 후보 34종 × 조커 4장이면
 * 손 하나를 보는 데 34^4개의 분해가 돌고, 대기 계산은 거기에 34를 또 곱한다.
 * 지금은 분해 재귀가 조커를 직접 알아 조커 장수에 지수적으로 늘지 않는다.
 *
 * 문턱은 실제 값(수 ms)보다 훨씬 느슨하게 잡는다 — 기계 속도가 아니라 **알고리즘이
 * 지수로 돌아가는 것**을 잡는 못이다.
 */
import { describe, expect, it } from "vitest";
import { winningKinds, decompose, kindKey } from "../src/index.js";
import type { TileKind } from "../src/index.js";

const m = (r: number): TileKind => ({ suit: "man", rank: r });
const HAKU: TileKind = { suit: "dragon", rank: 1 };
const OPTS = { wildKinds: [HAKU] };

/** 지수 폭발이면 수 초가 걸린다. 실측은 수 ms다 */
const BUDGET_MS = 500;

describe("조커 성능 — 백 장수에 지수로 늘지 않는다", () => {
  it("123456789m + 백백백백 의 대기 계산이 예산 안에서 끝난다", () => {
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), HAKU, HAKU, HAKU, HAKU];
    const t0 = performance.now();
    const waits = winningKinds(hand, 0, undefined, OPTS);
    const ms = performance.now() - t0;
    // 조커 4장이면 무엇을 뽑아도 화료다 — 34종 전부가 대기여야 한다
    expect(waits.length).toBe(34);
    expect(ms, `${ms.toFixed(1)}ms`).toBeLessThan(BUDGET_MS);
  });

  it("같은 손의 채점용 전체 분해도 예산 안에서 끝난다", () => {
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), HAKU, HAKU, HAKU, HAKU, m(1)];
    const t0 = performance.now();
    const all = decompose(hand, 0, OPTS);
    const ms = performance.now() - t0;
    expect(all.length).toBeGreaterThan(0);
    expect(ms, `${ms.toFixed(1)}ms`).toBeLessThan(BUDGET_MS);
    // 모든 분해가 조커를 정확히 4장 배정했고, 바꿔 놓은 손도 14장이다
    for (const d of all) {
      expect(d.wildAs?.length).toBe(4);
      expect(d.effectiveHand?.length).toBe(14);
      expect(d.effectiveHand?.some((k) => kindKey(k) === kindKey(HAKU) )).toBeDefined();
    }
  });

  it("백 1~4장 어디서도 대기 계산이 예산을 넘지 않는다", () => {
    const base = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), { suit: "pin", rank: 1 }, { suit: "pin", rank: 2 }, { suit: "pin", rank: 3 }, { suit: "sou", rank: 5 }] as TileKind[];
    for (const n of [1, 2, 3, 4]) {
      const hand = [...base.slice(0, 13 - n), ...Array.from({ length: n }, () => HAKU)];
      const t0 = performance.now();
      winningKinds(hand, 0, undefined, OPTS);
      const ms = performance.now() - t0;
      expect(ms, `백 ${n}장: ${ms.toFixed(1)}ms`).toBeLessThan(BUDGET_MS);
    }
  });
});
