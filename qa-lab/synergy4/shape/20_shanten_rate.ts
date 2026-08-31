/**
 * 20 — 형 완화별 «봇이 자기 텐파이를 못 보는» 비율.
 * 표본을 «구성»으로 만든다: 그 옵션에서 화료형인 손을 만들고 한 장을 빼 텐파이 손을 얻는다.
 * 그 손에 대해 isTenpai(정확)=true 인데 shantenOf>0 이면 봇(read.ts:245)이 자기 텐파이를 못 본다.
 */
import { Prng, isTenpai, shantenOf, isWinningShape } from "@majak/core";
import type { TileKind } from "@majak/core";

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
    // 자패 슌쯔 1~2개 + 나머지 수패 슌쯔
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
  mixedTriplets: (r) => {
    const out: TileKind[] = [];
    for (let i = 0; i < 4; i++) {
      const rk = 1 + r.int(9);
      for (let j = 0; j < 3; j++) out.push({ suit: pickSuit(r), rank: rk });
    }
    const ps = pickSuit(r), pr = 1 + r.int(9);
    out.push({ suit: ps, rank: pr }, { suit: ps, rank: pr });
    return out;
  },
  mixedRuns: (r) => {
    const out: TileKind[] = [];
    for (let i = 0; i < 4; i++) { const b = 1 + r.int(7); for (let d = 0; d < 3; d++) out.push({ suit: pickSuit(r), rank: b + d }); }
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

const N = 1200;
for (const [name, gen] of Object.entries(GENS).filter(([n]) => n === "mixedTriplets" || n === "mixedRuns")) {
  const opts = { [name]: true } as any;
  const rng = new Prng(20260831);
  let samples = 0, missed = 0, missedBase = 0;
  for (let i = 0; i < N * 4 && samples < N; i++) {
    const full = gen(rng);
    if (full.length !== 14 || !legal(full)) continue;
    if (!isWinningShape(full, 0, opts)) continue;
    const hand = full.slice(0, 13);
    if (!isTenpai(hand, 0, undefined, opts)) continue;
    samples++;
    if (shantenOf(hand, 0, opts) > 0) missed++;
    if (shantenOf(hand, 0, {}) > 0) missedBase++;
  }
  console.log(`  ${name.padEnd(16)} 텐파이 표본 ${String(samples).padStart(5)} | 봇이 놓친 것(opts) ${String(missed).padStart(5)} (${((missed / Math.max(1, samples)) * 100).toFixed(1)}%) | 옵션 무시 시 ${missedBase}`);
}
