/**
 * 표준 화료형 지름길(`standardShape.ts`)이 일반 분해기와 **같은 답**을 내는가.
 *
 * 성능 리팩토링(2026-09-11)은 판을 한 비트도 바꾸면 안 된다. 무작위 손 수만 개로
 * 지름길과 일반 경로를 대조한다 — 텐파이에 가까운 손이 많이 나오도록 절반은
 * 몸통·머리를 조립해서 만들고 절반은 완전 무작위로 만든다.
 */
import { describe, expect, it } from "vitest";
import { Prng } from "../src/engine/random/Prng.js";
import { isWinningShape, isWinningShapeGeneric } from "../src/mahjong/scoring/decompose.js";
import { winningKinds } from "../src/mahjong/scoring/waits.js";
import { kindKey, standardKinds } from "../src/mahjong/tiles/Tile.js";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";

const KINDS = standardKinds();

function pick<T>(rng: Prng, arr: readonly T[]): T {
  return arr[rng.int(arr.length)] as T;
}

/** 몸통·머리를 조립한 손 — 텐파이·화료형이 자주 나온다 */
function structuredHand(rng: Prng, sets: number, withPair: boolean): TileKind[] {
  const out: TileKind[] = [];
  for (let s = 0; s < sets; s++) {
    const k = pick(rng, KINDS);
    if (k.rank <= 7 && k.suit !== "wind" && k.suit !== "dragon" && rng.int(2) === 0) {
      out.push(k, { suit: k.suit, rank: k.rank + 1 }, { suit: k.suit, rank: k.rank + 2 });
    } else {
      out.push(k, k, k);
    }
  }
  if (withPair) {
    const k = pick(rng, KINDS);
    out.push(k, k);
  }
  // 한두 장을 흔들어 «거의 화료형»도 섞는다
  const shake = rng.int(3);
  for (let i = 0; i < shake && out.length > 0; i++) {
    out[rng.int(out.length)] = pick(rng, KINDS);
  }
  return out;
}

function randomHand(rng: Prng, n: number): TileKind[] {
  const out: TileKind[] = [];
  const count = new Map<string, number>();
  while (out.length < n) {
    const k = pick(rng, KINDS);
    const c = count.get(kindKey(k)) ?? 0;
    if (c >= 4) continue;
    count.set(kindKey(k), c + 1);
    out.push(k);
  }
  return out;
}

describe("standard winning-shape fast path", () => {
  it("isWinningShape ≡ generic decomposer on random 14/11/8/5/2-tile hands", () => {
    const rng = new Prng(20260911);
    let wins = 0;
    for (let i = 0; i < 30_000; i++) {
      const melds = rng.int(5);
      const n = 14 - melds * 3;
      const hand =
        rng.int(2) === 0 ? structuredHand(rng, 4 - melds, true) : randomHand(rng, n);
      const fast = isWinningShape(hand, melds);
      const slow = isWinningShapeGeneric(hand, melds);
      if (fast !== slow) {
        throw new Error(
          `mismatch melds=${melds} hand=${hand.map(kindKey).join(",")} fast=${fast} slow=${slow}`,
        );
      }
      if (fast) wins++;
    }
    expect(wins).toBeGreaterThan(1000); // 화료형이 충분히 섞였는지 (테스트가 헛돌지 않게)
  });

  it("winningKinds ≡ per-candidate generic decomposer on random 13-tile hands", () => {
    const rng = new Prng(777);
    let tenpai = 0;
    for (let i = 0; i < 3_000; i++) {
      const melds = rng.int(4);
      const n = 13 - melds * 3;
      // 완성형에서 한 장을 뺀 손 = 텐파이가 자주 나온다
      const hand = rng.int(2) === 0 ? structuredHand(rng, 4 - melds, true) : randomHand(rng, n);
      if (hand.length === n + 1) hand.splice(rng.int(hand.length), 1);
      if (hand.length !== n) continue;
      const fast = winningKinds(hand, melds).map(kindKey).sort();
      const slow = KINDS.filter((c) => isWinningShapeGeneric([...hand, c], melds))
        .map(kindKey)
        .sort();
      expect(fast).toEqual(slow);
      if (fast.length > 0) tenpai++;
    }
    expect(tenpai).toBeGreaterThan(100);
  });

  it("chiitoi / kokushi edge cases", () => {
    const m = (r: number): TileKind => ({ suit: "man", rank: r });
    const p = (r: number): TileKind => ({ suit: "pin", rank: r });
    const w = (r: number): TileKind => ({ suit: "wind", rank: r });
    const d = (r: number): TileKind => ({ suit: "dragon", rank: r });
    const chiitoi = [m(1), m(1), m(3), m(3), p(5), p(5), p(9), p(9), w(1), w(1), w(4), w(4), d(2), d(2)];
    expect(isWinningShape(chiitoi, 0)).toBe(true);
    // 같은 쌍 두 번(4장)은 치또이가 아니다
    const four = [...chiitoi.slice(0, 12), m(1), m(1)];
    expect(isWinningShape(four, 0)).toBe(isWinningShapeGeneric(four, 0));
    expect(isWinningShape(four, 0)).toBe(false);
    const kokushi = [m(1), m(9), p(1), p(9), { suit: "sou", rank: 1 }, { suit: "sou", rank: 9 }, w(1), w(2), w(3), w(4), d(1), d(2), d(3), d(3)];
    expect(isWinningShape(kokushi, 0)).toBe(true);
    expect(winningKinds(kokushi.slice(0, 13), 0).map(kindKey).sort()).toEqual(
      KINDS.filter((c) => isWinningShapeGeneric([...kokushi.slice(0, 13), c], 0)).map(kindKey).sort(),
    );
  });
});
