/**
 * 무늬를 요구하는 표준 역이 shape 옵션 아래에서 헛성립하는지 대량 검사.
 * 무작위 14장 손을 만들고, 화료형이면 채택된 몸통(shape)으로 역의 전제를 직접 검증한다.
 */
import { Prng, YakuRegistry, evaluateWin, registerStandardYaku, standardKinds, kindKey } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext, WinEvaluation } from "@majak/core";

const reg = new YakuRegistry();
registerStandardYaku(reg);
const NUM = new Set(["man", "pin", "sou"]);
const pure = (t: TileKind[]): boolean => new Set(t.map((k) => k.suit)).size === 1;

const OPTSETS: [string, DecomposeOptions][] = [
  ["mixedRuns", { mixedRuns: true }],
  ["mixedTriplets", { mixedTriplets: true }],
  ["wrapRuns", { wrapRuns: true }],
  ["honorRuns", { honorRuns: true }],
  ["polarEnds", { polarEnds: true }],
  ["chiitoiMixed", { chiitoiMixedPairs: true }],
  ["kokushiDupes", { kokushiDupes: 1 }],
  ["mixedRuns+mixedTri", { mixedRuns: true, mixedTriplets: true }],
  ["mixedRuns+wrap", { mixedRuns: true, wrapRuns: true }],
  ["honor+mixedTri", { honorRuns: true, mixedTriplets: true }],
  ["polar+mixedTri", { polarEnds: true, mixedTriplets: true }],
  ["wrap+polar", { wrapRuns: true, polarEnds: true }],
  ["chiitoiMixed+kokushiDupes", { chiitoiMixedPairs: true, kokushiDupes: 1 }],
  ["totalSets5", { totalSets: 5 }],
  ["totalSets5+mixedRuns", { totalSets: 5, mixedRuns: true }],
];

/** 채택된 몸통을 보고 역의 전제를 확인한다. 위반이면 사유 문자열. */
function violations(r: WinEvaluation, hand: TileKind[]): string[] {
  const out: string[] = [];
  const ids = new Set(r.yaku.map((y) => y.id));
  const groups = r.shape?.groups ?? [];
  const runs = groups.filter((g) => g.type === "run");
  const trips = groups.filter((g) => g.type === "triplet" || g.type === "kan");
  const has = (id: string): boolean => ids.has(id);
  const suits = new Set(hand.map((k) => k.suit));
  if (has("chinitsu") && (suits.size !== 1 || !NUM.has([...suits][0] as string))) {
    out.push(`chinitsu on suits=${[...suits].join("/")}`);
  }
  if (has("honitsu") && [...suits].filter((s) => NUM.has(s)).length > 1) {
    out.push(`honitsu on suits=${[...suits].join("/")}`);
  }
  if (has("tanyao") && hand.some((k) => !NUM.has(k.suit) || k.rank === 1 || k.rank === 9)) {
    out.push("tanyao with terminal/honor");
  }
  if (has("chinroutou") && hand.some((k) => !NUM.has(k.suit) || (k.rank !== 1 && k.rank !== 9))) {
    out.push("chinroutou with non-terminal");
  }
  if (has("tsuuiisou") && hand.some((k) => NUM.has(k.suit))) out.push("tsuuiisou with number tile");
  if (has("sanshoku") && groups.length > 0) {
    const byStart = new Map<number, Set<string>>();
    for (const g of runs) {
      if (!pure(g.tiles) || !NUM.has(g.tiles[0]!.suit)) continue;
      const rs = g.tiles.map((t) => t.rank).sort((a, b) => a - b);
      if (rs[1] !== rs[0]! + 1 || rs[2] !== rs[1]! + 1) continue; // 순환 제외
      const s = byStart.get(rs[0]!) ?? new Set();
      s.add(g.tiles[0]!.suit);
      byStart.set(rs[0]!, s);
    }
    if (![...byStart.values()].some((s) => s.size >= 3)) out.push("sanshoku without 3 pure same-start runs");
  }
  if (has("sanshoku_doukou") && groups.length > 0) {
    const byRank = new Map<number, Set<string>>();
    for (const g of trips) {
      if (!pure(g.tiles) || !NUM.has(g.tiles[0]!.suit)) continue;
      if (new Set(g.tiles.map((t) => t.rank)).size !== 1) continue;
      const s = byRank.get(g.tiles[0]!.rank) ?? new Set();
      s.add(g.tiles[0]!.suit);
      byRank.set(g.tiles[0]!.rank, s);
    }
    if (![...byRank.values()].some((s) => s.size >= 3)) out.push("sanshoku_doukou without 3 pure same-rank triplets");
  }
  if (has("ittsuu") && groups.length > 0) {
    const bySuit = new Map<string, Set<number>>();
    for (const g of runs) {
      if (!pure(g.tiles) || !NUM.has(g.tiles[0]!.suit)) continue;
      const rs = g.tiles.map((t) => t.rank).sort((a, b) => a - b);
      if (rs[1] !== rs[0]! + 1 || rs[2] !== rs[1]! + 1) continue;
      const s = bySuit.get(g.tiles[0]!.suit) ?? new Set();
      s.add(rs[0]!);
      bySuit.set(g.tiles[0]!.suit, s);
    }
    if (![...bySuit.values()].some((s) => s.has(1) && s.has(4) && s.has(7))) out.push("ittsuu without pure 123/456/789");
  }
  for (const id of ["iipeiko", "ryanpeiko"]) {
    if (!has(id) || groups.length === 0) continue;
    const cnt = new Map<string, number>();
    for (const g of runs) {
      if (!pure(g.tiles)) continue;
      const key = g.tiles.map(kindKey).join("|");
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
    }
    const pairs = [...cnt.values()].filter((n) => n >= 2).length;
    if (id === "iipeiko" && pairs < 1) out.push("iipeiko without duplicate pure run");
    if (id === "ryanpeiko" && pairs < 2) out.push("ryanpeiko without 2 duplicate pure runs");
  }
  if (has("junchan") && hand.some((k) => !NUM.has(k.suit))) out.push("junchan with honor");
  return out;
}

const universe = standardKinds();
const rng = new Prng(20260820);
const found = new Map<string, string>();
let wins = 0;
const N = Number(process.argv[2] ?? 4000);
for (let i = 0; i < N; i++) {
  // 4장 제한을 지키는 무작위 손 (14 또는 17장)
  for (const [name, opts] of OPTSETS) {
    const size = opts.totalSets === 5 ? 17 : 14;
    const counts = new Map<string, number>();
    const hand: TileKind[] = [];
    let guard = 0;
    while (hand.length < size && guard++ < 500) {
      const k = universe[rng.int(universe.length)] as TileKind;
      const key = kindKey(k);
      if ((counts.get(key) ?? 0) >= 4) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      hand.push(k);
    }
    if (hand.length < size) continue;
    const ctx = {
      hand, melds: [], winningTile: hand[hand.length - 1] as TileKind,
      winType: i % 2 === 0 ? "tsumo" : "ron", seatWind: 1, prevalentWind: 1,
      riichi: null, options: opts, winnerId: "p0",
    } as unknown as WinContext;
    let r: WinEvaluation | null = null;
    try { r = evaluateWin(ctx, reg); } catch (e) { found.set(`${name} THROW ${String(e)}`, hand.map(kindKey).join(" ")); continue; }
    if (r === null || !r.ok) continue;
    wins++;
    for (const v of violations(r, hand)) {
      const key = `${name} :: ${v}`;
      if (!found.has(key)) found.set(key, `${hand.map((k) => `${k.rank}${k.suit[0]}`).join("")} -> [${r.yaku.map((y) => y.id).join(" ")}] shape=${(r.shape?.groups ?? []).map((g) => g.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")).join(" ")}`);
    }
  }
}
console.log(`손 ${N * OPTSETS.length}개 중 화료 ${wins}건. 위반 유형 ${found.size}종`);
for (const [k, v] of found) console.log(`  ${k}\n     ${v}`);
