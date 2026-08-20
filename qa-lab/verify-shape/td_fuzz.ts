/**
 * shape 의심 1 — true_dragon(totalSets=5)의 역 조합 퍼즈.
 *
 *   npx tsx qa-lab/verify-shape/td_fuzz.ts [표본수]
 *
 * 무작위 화료형을 5멘쯔(17장)와 4멘쯔(14장)로 각각 만들어 채점하고,
 * "4멘쯔로는 원리상 동시 성립이 불가능한 슌쯔역 조합"의 출현율과 판수 분포를 비교한다.
 * 여기서 재는 것은 **헛성립**이 아니라 **중복 계상의 빈도와 크기**다.
 */
import { YakuRegistry, evaluateWin, registerStandardYaku, Prng, kindKey } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";

const reg = new YakuRegistry();
registerStandardYaku(reg);
const N = Number(process.argv[2] ?? 60000);
const SUITS = ["man", "pin", "sou"] as const;
const IMPOSSIBLE: string[][] = [
  ["ittsuu", "ryanpeiko"], ["sanshoku", "ryanpeiko"],
  ["sanshoku", "ittsuu"], ["ittsuu", "iipeiko"], ["sanshoku", "iipeiko"],
];

function allKinds(): TileKind[] {
  const out: TileKind[] = [];
  for (const s of SUITS) for (let r = 1; r <= 9; r++) out.push({ suit: s, rank: r });
  for (let r = 1; r <= 4; r++) out.push({ suit: "wind", rank: r });
  for (let r = 1; r <= 3; r++) out.push({ suit: "dragon", rank: r });
  return out;
}
const UNIVERSE = allKinds();

/** 무작위 화료형 하나 (sets개 멘쯔 + 머리). 장수 4 초과면 null */
function randomHand(rng: Prng, sets: number): TileKind[] | null {
  const used = new Map<string, number>();
  const out: TileKind[] = [];
  const put = (k: TileKind): boolean => {
    const key = kindKey(k);
    const n = (used.get(key) ?? 0) + 1;
    if (n > 4) return false;
    used.set(key, n);
    out.push(k);
    return true;
  };
  for (let i = 0; i < sets; i++) {
    if (rng.int(100) < 70) { // 슌쯔 (역 조합을 보려는 것이므로 슌쯔를 두껍게)
      const s = SUITS[rng.int(3)] as (typeof SUITS)[number];
      const st = rng.int(7) + 1;
      for (let d = 0; d < 3; d++) if (!put({ suit: s, rank: st + d })) return null;
    } else {
      const k = UNIVERSE[rng.int(UNIVERSE.length)] as TileKind;
      for (let d = 0; d < 3; d++) if (!put(k)) return null;
    }
  }
  const p = UNIVERSE[rng.int(UNIVERSE.length)] as TileKind;
  if (!put(p) || !put(p)) return null;
  return out;
}

function score(hand: TileKind[], opts: DecomposeOptions): { yaku: string[]; han: number } | null {
  const ctx = {
    hand, melds: [], winningTile: hand[hand.length - 1] as TileKind,
    winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null,
    options: opts, winnerId: "p0",
  } as unknown as WinContext;
  const r = evaluateWin(ctx, reg);
  return r === null || !r.ok ? null : { yaku: r.yaku.map((y) => y.id), han: r.han };
}

for (const sets of [4, 5]) {
  const rng = new Prng(20260820 + sets);
  const opts: DecomposeOptions = sets === 5 ? { totalSets: 5 } : {};
  let made = 0, wins = 0, hits = 0, kazoe = 0, hanSum = 0, han6 = 0;
  const combo = new Map<string, number>();
  let sample = "";
  for (let i = 0; i < N; i++) {
    const hand = randomHand(rng, sets);
    if (hand === null) continue;
    made++;
    const r = score(hand, opts);
    if (r === null) continue;
    wins++;
    hanSum += r.han;
    if (r.han >= 6) han6++;
    if (r.yaku.includes("kazoe_yakuman")) kazoe++;
    const ids = new Set(r.yaku);
    let hit = false;
    for (const set of IMPOSSIBLE) {
      if (set.every((y) => ids.has(y))) {
        hit = true;
        const k = set.join("+");
        combo.set(k, (combo.get(k) ?? 0) + 1);
      }
    }
    if (hit) {
      hits++;
      if (sample === "") sample = `${hand.map(kindKey).join(" ")} → [${r.yaku.join(" ")}] han=${r.han}`;
    }
  }
  console.log(
    `\n=== ${sets}멘쯔 (${sets === 5 ? "true_dragon" : "표준"}) — 조립 ${made} · 화료 ${wins} ===\n` +
    `  평균 판수 ${(hanSum / Math.max(1, wins)).toFixed(2)} · 6판 이상 ${han6} (${((han6 / Math.max(1, wins)) * 100).toFixed(1)}%) · kazoe ${kazoe}\n` +
    `  4멘쯔 불가 조합: ${hits}건 (${((hits / Math.max(1, wins)) * 100).toFixed(2)}%)`,
  );
  for (const [k, v] of [...combo].sort((a, b) => b[1] - a[1])) console.log(`    ${k} x${v}`);
  if (sample !== "") console.log(`    예: ${sample}`);
}
