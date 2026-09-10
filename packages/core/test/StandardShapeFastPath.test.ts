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

  it("option variants (wrapRuns / honorRuns / totalSets / kokushiDupes / chiitoiMixedPairs) ≡ generic", () => {
    const rng = new Prng(4242);
    const variants = [
      { wrapRuns: true },
      { honorRuns: true },
      { totalSets: 5 },
      { kokushiDupes: 1 },
      { kokushiDupes: 2 },
      { chiitoiMixedPairs: true },
      { wrapRuns: true, honorRuns: true, kokushiDupes: 1 },
      { chiitoiMixedPairs: true, wrapRuns: true },
      { kokushiMeldKinds: [] as TileKind[] },
    ];
    /** 순환 슌쯔·자패 슌쯔가 섞인 조립 손 */
    const build = (sets: number, withPair: boolean): TileKind[] => {
      const out: TileKind[] = [];
      for (let s = 0; s < sets; s++) {
        const k = pick(rng, KINDS);
        const roll = rng.int(4);
        if (roll === 0 && (k.suit === "wind" || k.suit === "dragon")) {
          const max = k.suit === "wind" ? 4 : 3;
          const b = Math.min(k.rank, max - 2);
          out.push({ suit: k.suit, rank: b }, { suit: k.suit, rank: b + 1 }, { suit: k.suit, rank: b + 2 });
        } else if (roll <= 1 && k.suit !== "wind" && k.suit !== "dragon") {
          const wr = (r: number): number => ((r - 1) % 9) + 1;
          out.push(k, { suit: k.suit, rank: wr(k.rank + 1) }, { suit: k.suit, rank: wr(k.rank + 2) });
        } else {
          out.push(k, k, k);
        }
      }
      if (withPair) {
        const k = pick(rng, KINDS);
        out.push(k, k);
      }
      const shake = rng.int(3);
      for (let i = 0; i < shake && out.length > 0; i++) out[rng.int(out.length)] = pick(rng, KINDS);
      return out;
    };
    const orphans = KINDS.filter((k) => (k.suit === "wind" || k.suit === "dragon") || k.rank === 1 || k.rank === 9);
    let checked = 0;
    let wins = 0;
    for (const opts of variants) {
      const totalSets = opts.totalSets ?? 4;
      for (let i = 0; i < 6000; i++) {
        const melds = rng.int(totalSets + 1);
        const n = (totalSets - melds) * 3 + 2;
        const roll = rng.int(4);
        let hand: TileKind[];
        if (roll === 0) hand = randomHand(rng, Math.min(n, 14));
        else if (roll === 1 && melds === 0 && totalSets === 4) {
          // 국사 근처 손
          hand = [];
          while (hand.length < 14) hand.push(pick(rng, orphans));
        } else if (roll === 2 && melds === 0 && totalSets === 4) {
          // 치또이 근처 손 — 쌍 7개, 일부는 무늬만 다른 같은 랭크
          hand = [];
          while (hand.length < 14) {
            const k = pick(rng, KINDS);
            const mate = rng.int(3) === 0 && k.suit !== "wind" && k.suit !== "dragon"
              ? { suit: pick(rng, ["man", "pin", "sou"]), rank: k.rank }
              : k;
            hand.push(k, mate);
          }
        } else hand = build(totalSets - melds, true);
        // 같은 패 5장 이상은 실제 손에 없다 — 걸러 낸다
        const cnt = new Map<string, number>();
        let bad = false;
        for (const k of hand) {
          const c = (cnt.get(kindKey(k)) ?? 0) + 1;
          cnt.set(kindKey(k), c);
          if (c > 4) bad = true;
        }
        if (bad) continue;
        const fast = isWinningShape(hand, melds, opts);
        const slow = isWinningShapeGeneric(hand, melds, opts);
        if (fast !== slow) {
          throw new Error(
            `mismatch opts=${JSON.stringify(opts)} melds=${melds} hand=${hand.map(kindKey).join(",")} fast=${fast} slow=${slow}`,
          );
        }
        checked++;
        if (fast) wins++;
        if (hand.length >= 2 && rng.int(4) === 0) {
          const h13 = [...hand];
          h13.splice(rng.int(h13.length), 1);
          const f = winningKinds(h13, melds, undefined, opts).map(kindKey).sort();
          const g = KINDS.filter((c) => isWinningShapeGeneric([...h13, c], melds, opts)).map(kindKey).sort();
          expect(f).toEqual(g);
        }
      }
    }
    expect(checked).toBeGreaterThan(30_000);
    expect(wins).toBeGreaterThan(2_000);
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
