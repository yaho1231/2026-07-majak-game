/**
 * 22 — A-13 수정 검증. 20_shanten_rate와 같은 표본 생성기로, 코어 shantenOf 대신
 * **봇이 실제로 쓰는** botShantenOf(server/bot/shape.ts)의 놓침 비율을 잰다.
 */
import { Prng, isTenpai, shantenOf, isWinningShape } from "@majak/core";
import type { TileKind } from "@majak/core";
import { botShantenOf } from "../../../packages/server/src/bot/shape.js";

const NUM = ["man", "pin", "sou"] as const;
type Gen = (r: Prng) => TileKind[];
const pickSuit = (r: Prng) => NUM[r.int(3)]!;

const GENS: Record<string, Gen> = {
  polarEnds: (r) => {
    const out: TileKind[] = [];
    for (let i = 0; i < 4; i++) {
      const s = pickSuit(r);
      const ones = 1 + r.int(2);
      for (let j = 0; j < ones; j++) out.push({ suit: s, rank: 1 });
      for (let j = ones; j < 3; j++) out.push({ suit: s, rank: 9 });
    }
    const ps = pickSuit(r), pr = 1 + r.int(9);
    out.push({ suit: ps, rank: pr }, { suit: ps, rank: pr });
    return out;
  },
  wrapRuns: (r) => {
    const out: TileKind[] = [];
    for (let i = 0; i < 4; i++) {
      const s = pickSuit(r), b = 1 + r.int(9);
      for (let d = 0; d < 3; d++) out.push({ suit: s, rank: ((b - 1 + d) % 9) + 1 });
    }
    const ps = pickSuit(r), pr = 1 + r.int(9);
    out.push({ suit: ps, rank: pr }, { suit: ps, rank: pr });
    return out;
  },
  honorRuns: (r) => {
    const out: TileKind[] = [];
    const nHonor = 1 + r.int(2);
    for (let i = 0; i < nHonor; i++) {
      if (r.int(2) === 0) { const b = 1 + r.int(2); for (let d = 0; d < 3; d++) out.push({ suit: "wind", rank: b + d }); }
      else for (let d = 1; d <= 3; d++) out.push({ suit: "dragon", rank: d });
    }
    for (let i = nHonor; i < 4; i++) { const s = pickSuit(r), b = 1 + r.int(7); for (let d = 0; d < 3; d++) out.push({ suit: s, rank: b + d }); }
    const ps = pickSuit(r), pr = 1 + r.int(9);
    out.push({ suit: ps, rank: pr }, { suit: ps, rank: pr });
    return out;
  },
};

const legal = (hand: TileKind[]): boolean => {
  const c = new Map<string, number>();
  for (const k of hand) { const key = `${k.suit}${k.rank}`; c.set(key, (c.get(key) ?? 0) + 1); if ((c.get(key) as number) > 4) return false; }
  return true;
};

const N = 600;
for (const [name, gen] of Object.entries(GENS)) {
  const opts = { [name]: true } as any;
  const rng = new Prng(20260831);
  let samples = 0, missedCore = 0, missedBot = 0;
  for (let i = 0; i < N * 8 && samples < N; i++) {
    const full = gen(rng);
    if (full.length !== 14 || !legal(full)) continue;
    if (!isWinningShape(full, 0, opts)) continue;
    const hand = full.slice(0, 13);
    if (!isTenpai(hand, 0, undefined, opts)) continue;
    samples++;
    if (shantenOf(hand, 0, opts) > 0) missedCore++;
    if (botShantenOf(hand, 0, opts) > 0) missedBot++;
  }
  const pct = (n: number) => ((n / Math.max(1, samples)) * 100).toFixed(1);
  console.log(`  ${name.padEnd(12)} 텐파이 표본 ${String(samples).padStart(4)} | 코어 shantenOf 놓침 ${String(missedCore).padStart(4)} (${pct(missedCore)}%) | 봇 botShantenOf 놓침 ${String(missedBot).padStart(4)} (${pct(missedBot)}%)`);
}
