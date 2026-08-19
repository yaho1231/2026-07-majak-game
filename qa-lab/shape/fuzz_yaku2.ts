/** 화료형을 직접 조립해서 대량 검사 (fuzz_yaku의 생성기 교체판) */
import { Prng, YakuRegistry, evaluateWin, registerStandardYaku, kindKey } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext, WinEvaluation } from "@majak/core";

const reg = new YakuRegistry();
registerStandardYaku(reg);
const NUM = ["man", "pin", "sou"];
const isNum = (s: string): boolean => NUM.includes(s);
const pure = (t: TileKind[]): boolean => new Set(t.map((k) => k.suit)).size === 1;

const OPTSETS: [string, DecomposeOptions][] = [
  ["mixedRuns", { mixedRuns: true }],
  ["mixedTriplets", { mixedTriplets: true }],
  ["wrapRuns", { wrapRuns: true }],
  ["honorRuns", { honorRuns: true }],
  ["polarEnds", { polarEnds: true }],
  ["mixedRuns+mixedTri", { mixedRuns: true, mixedTriplets: true }],
  ["mixedRuns+wrap", { mixedRuns: true, wrapRuns: true }],
  ["honor+mixedTri", { honorRuns: true, mixedTriplets: true }],
  ["polar+mixedTri", { polarEnds: true, mixedTriplets: true }],
  ["wrap+polar", { wrapRuns: true, polarEnds: true }],
  ["honor+wrap", { honorRuns: true, wrapRuns: true }],
  ["totalSets5", { totalSets: 5 }],
  ["totalSets5+mixedRuns+mixedTri", { totalSets: 5, mixedRuns: true, mixedTriplets: true }],
  ["totalSets5+polar", { totalSets: 5, polarEnds: true }],
];

function makeSet(rng: Prng, o: DecomposeOptions): TileKind[] {
  const pickSuit = (): string => NUM[rng.int(3)] as string;
  const kinds: (() => TileKind[])[] = [];
  kinds.push(() => { const s = pickSuit(); const r = 1 + rng.int(7); return [1, 2, 3].map((d) => ({ suit: s, rank: r + d - 1 }) as TileKind); });
  kinds.push(() => { const s = pickSuit(); const r = 1 + rng.int(9); return [0, 0, 0].map(() => ({ suit: s, rank: r }) as TileKind); });
  kinds.push(() => { const s = rng.int(2) === 0 ? "wind" : "dragon"; const r = 1 + rng.int(s === "wind" ? 4 : 3); return [0, 0, 0].map(() => ({ suit: s, rank: r }) as TileKind); });
  if (o.mixedRuns === true) kinds.push(() => { const r = 1 + rng.int(7); return [0, 1, 2].map((d) => ({ suit: pickSuit(), rank: r + d }) as TileKind); });
  if (o.wrapRuns === true) kinds.push(() => { const s = pickSuit(); const r = 1 + rng.int(9); return [0, 1, 2].map((d) => ({ suit: s, rank: ((r - 1 + d) % 9) + 1 }) as TileKind); });
  if (o.mixedTriplets === true) kinds.push(() => { const r = 1 + rng.int(9); return [0, 1, 2].map(() => ({ suit: pickSuit(), rank: r }) as TileKind); });
  if (o.polarEnds === true) kinds.push(() => { const s = pickSuit(); const n = 1 + rng.int(2); return [...Array.from({ length: n }, () => ({ suit: s, rank: 1 }) as TileKind), ...Array.from({ length: 3 - n }, () => ({ suit: s, rank: 9 }) as TileKind)]; });
  if (o.honorRuns === true) kinds.push(() => { const w = rng.int(2) === 0; const s = w ? "wind" : "dragon"; const r = 1 + rng.int(w ? 2 : 1); return [0, 1, 2].map((d) => ({ suit: s, rank: r + d }) as TileKind); });
  return (kinds[rng.int(kinds.length)] as () => TileKind[])();
}

function violations(r: WinEvaluation, hand: TileKind[]): string[] {
  const out: string[] = [];
  const ids = new Set(r.yaku.map((y) => y.id));
  const groups = r.shape?.groups ?? [];
  if (groups.length === 0) return out;
  const runs = groups.filter((g) => g.type === "run");
  const trips = groups.filter((g) => g.type === "triplet" || g.type === "kan");
  const has = (id: string): boolean => ids.has(id);
  const suits = new Set(hand.map((k) => k.suit));
  if (has("chinitsu") && (suits.size !== 1 || !isNum([...suits][0] as string))) out.push(`chinitsu suits=${[...suits]}`);
  if (has("honitsu") && [...suits].filter(isNum).length > 1) out.push(`honitsu suits=${[...suits]}`);
  if (has("tanyao") && hand.some((k) => !isNum(k.suit) || k.rank === 1 || k.rank === 9)) out.push("tanyao w/ terminal");
  if (has("chinroutou") && hand.some((k) => !isNum(k.suit) || (k.rank !== 1 && k.rank !== 9))) out.push("chinroutou w/ non-terminal");
  if (has("tsuuiisou") && hand.some((k) => isNum(k.suit))) out.push("tsuuiisou w/ number");
  if (has("junchan") && hand.some((k) => !isNum(k.suit))) out.push("junchan w/ honor");
  const consec = (g: { tiles: TileKind[] }): number | null => {
    const rs = g.tiles.map((t) => t.rank).sort((a, b) => a - b);
    return rs[1] === (rs[0] as number) + 1 && rs[2] === (rs[1] as number) + 1 ? (rs[0] as number) : null;
  };
  if (has("sanshoku")) {
    const m = new Map<number, Set<string>>();
    for (const g of runs) { if (!pure(g.tiles) || !isNum(g.tiles[0]!.suit)) continue; const st = consec(g); if (st === null) continue; (m.get(st) ?? m.set(st, new Set()).get(st) as Set<string>).add(g.tiles[0]!.suit); }
    if (![...m.values()].some((s) => s.size >= 3)) out.push("sanshoku fake");
  }
  if (has("sanshoku_doukou")) {
    const m = new Map<number, Set<string>>();
    for (const g of trips) { if (!pure(g.tiles) || !isNum(g.tiles[0]!.suit)) continue; if (new Set(g.tiles.map((t) => t.rank)).size !== 1) continue; (m.get(g.tiles[0]!.rank) ?? m.set(g.tiles[0]!.rank, new Set()).get(g.tiles[0]!.rank) as Set<string>).add(g.tiles[0]!.suit); }
    if (![...m.values()].some((s) => s.size >= 3)) out.push("sanshoku_doukou fake");
  }
  if (has("ittsuu")) {
    const m = new Map<string, Set<number>>();
    for (const g of runs) { if (!pure(g.tiles) || !isNum(g.tiles[0]!.suit)) continue; const st = consec(g); if (st === null) continue; (m.get(g.tiles[0]!.suit) ?? m.set(g.tiles[0]!.suit, new Set()).get(g.tiles[0]!.suit) as Set<number>).add(st); }
    if (![...m.values()].some((s) => s.has(1) && s.has(4) && s.has(7))) out.push("ittsuu fake");
  }
  for (const id of ["iipeiko", "ryanpeiko"]) {
    if (!has(id)) continue;
    const c = new Map<string, number>();
    for (const g of runs) { if (!pure(g.tiles)) continue; const k = [...g.tiles].map((t) => t.rank).sort().join(",") + g.tiles[0]!.suit; c.set(k, (c.get(k) ?? 0) + 1); }
    const dup = [...c.values()].filter((n) => n >= 2).length;
    if (id === "iipeiko" && dup < 1) out.push("iipeiko fake");
    if (id === "ryanpeiko" && dup < 2) out.push("ryanpeiko fake");
  }
  return out;
}

const rng = new Prng(777);
const found = new Map<string, string>();
let wins = 0, tries = 0;
const N = Number(process.argv[2] ?? 20000);
for (let i = 0; i < N; i++) {
  for (const [name, o] of OPTSETS) {
    const nSets = o.totalSets ?? 4;
    const hand: TileKind[] = [];
    for (let s = 0; s < nSets; s++) hand.push(...makeSet(rng, o));
    const ps = rng.int(2) === 0 ? (NUM[rng.int(3)] as string) : rng.int(2) === 0 ? "wind" : "dragon";
    const pr = 1 + rng.int(ps === "wind" ? 4 : ps === "dragon" ? 3 : 9);
    hand.push({ suit: ps, rank: pr } as TileKind, { suit: ps, rank: pr } as TileKind);
    const c = new Map<string, number>();
    let ok = true;
    for (const k of hand) { const key = kindKey(k); const n = (c.get(key) ?? 0) + 1; c.set(key, n); if (n > 4) ok = false; }
    if (!ok) continue;
    tries++;
    const ctx = {
      hand, melds: [], winningTile: hand[hand.length - 1] as TileKind,
      winType: i % 2 === 0 ? "tsumo" : "ron", seatWind: 1, prevalentWind: 1,
      riichi: null, options: o, winnerId: "p0",
    } as unknown as WinContext;
    let r: WinEvaluation | null = null;
    try { r = evaluateWin(ctx, reg); } catch (e) { found.set(`${name} THROW ${String(e).slice(0, 80)}`, hand.map(kindKey).join(" ")); continue; }
    if (r === null || !r.ok) continue;
    wins++;
    for (const v of violations(r, hand)) {
      const key = `${name} :: ${v}`;
      if (!found.has(key)) {
        found.set(key, `${hand.map((k) => `${k.rank}${k.suit[0]}`).join(" ")} -> [${r.yaku.map((y) => y.id).join(" ")}] ym=${r.yakumanCount} shape=${(r.shape?.groups ?? []).map((g) => g.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")).join("|")}`);
      }
    }
  }
}
console.log(`조립 ${tries}건 중 화료 ${wins}건. 위반 유형 ${found.size}종`);
for (const [k, v] of found) console.log(`  ${k}\n     ${v}`);
