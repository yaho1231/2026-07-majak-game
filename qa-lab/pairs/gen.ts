/** 우선순위 버킷별 교차 카테고리 짝 생성 */
import { readFileSync } from "node:fs";
import { Prng } from "@majak/core";
import { DEFS, catOf, usable, byId } from "./lib.js";
import type { Pair } from "./lib.js";

const tags = JSON.parse(
  readFileSync(new URL("./tags.json", import.meta.url), "utf8"),
) as Record<string, { state: boolean; deltas: boolean; uses: boolean; tiles: boolean; win: boolean }>;

export const IDS = DEFS.map((d) => d.id).filter((id) => tags[id] !== undefined);
const has = (id: string, k: keyof (typeof tags)[string]): boolean => tags[id]?.[k] === true;

/** reload / disarm 계열 (사용 횟수·잠금 조작) */
const CONTROLLERS = ["reload", "disarm"];

export function buildBuckets(mode: "hanchan" | "tonpuu"): Record<string, Pair[]> {
  const b: Record<string, Pair[]> = { state: [], deltas: [], tilesWin: [], usesCtl: [], misc: [] };
  for (let i = 0; i < IDS.length; i++) {
    for (let j = i + 1; j < IDS.length; j++) {
      const a = IDS[i]!;
      const c = IDS[j]!;
      if (!usable(a, c, mode)) continue;
      let put = "misc";
      if (has(a, "state") && has(c, "state")) put = "state";
      if (has(a, "deltas") && has(c, "deltas")) put = "deltas";
      if ((has(a, "tiles") && has(c, "win")) || (has(c, "tiles") && has(a, "win"))) put = "tilesWin";
      if (
        (CONTROLLERS.includes(a) && has(c, "uses")) ||
        (CONTROLLERS.includes(c) && has(a, "uses"))
      )
        put = "usesCtl";
      (b[put] as Pair[]).push({ a, b: c, bucket: put });
    }
  }
  return b;
}

/** 버킷 비율대로 n개를 뽑는다 (결정론) */
export function samplePairs(n: number, mode: "hanchan" | "tonpuu", seed: number): Pair[] {
  const bk = buildBuckets(mode);
  const rng = new Prng(seed);
  const weights: [string, number][] = [
    ["usesCtl", 0.12],
    ["deltas", 0.18],
    ["tilesWin", 0.25],
    ["state", 0.33],
    ["misc", 0.12],
  ];
  const out: Pair[] = [];
  const seen = new Set<string>();
  for (const [k, w] of weights) {
    const pool = [...(bk[k] ?? [])];
    const want = Math.round(n * w);
    for (let i = 0; i < want && pool.length > 0; i++) {
      const p = pool.splice(rng.int(pool.length), 1)[0] as Pair;
      const key = `${p.a}|${p.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

if (process.argv[2] === "--stats") {
  for (const mode of ["hanchan", "tonpuu"] as const) {
    const bk = buildBuckets(mode);
    console.log(mode, Object.fromEntries(Object.entries(bk).map(([k, v]) => [k, v.length])));
  }
  console.log("ids", IDS.length, "byId", byId.size, "cats", new Set(IDS.map(catOf)).size);
}
