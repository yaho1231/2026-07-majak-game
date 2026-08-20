/**
 * 드래프트 픽 분포 A/B — **엔진 없이** 옛 알고리즘과 지금 알고리즘을 같은 제시로 돌린다.
 *
 * 아레나로 재면 다른 에이전트의 동시 수정·조커 버그 같은 잡음이 섞인다. 드래프트는
 * 순수 함수라 여기서 결정적으로 잴 수 있다 — 같은 시드로 같은 3지선다를 만들어
 * 두 알고리즘에 각각 먹이고, **파워 구간별 픽률**을 견준다.
 *
 *   tsx qa-lab/bot/draft_dist.ts [제시횟수] [시드]
 */
import { AUGMENT_POWER_TIERS, Prng, powerScore } from "@majak/core";
import { BOT_UNUSABLE_AUGMENTS, contentAugments } from "@majak/content";
import type { AugmentDef } from "@majak/core";
import { chooseDraft, draftScore } from "../../packages/server/src/bot/draft.js";
import type { DraftContext } from "../../packages/server/src/bot/draft.js";
import { ARCHETYPE_NAMES, profileOf } from "../../packages/server/src/bot/profile.js";

const OFFERS = Number(process.argv[2] ?? 20000);
const SEED = Number(process.argv[3] ?? 11);
const CHOICES = 3;

const catalog = new Map<string, AugmentDef>(contentAugments.map((d) => [d.id, d]));
const all = [...catalog.values()];
const powerOf = (id: string): number => {
  const e = (AUGMENT_POWER_TIERS as Record<string, never>)[id];
  return e === undefined ? 25 : powerScore(e);
};

/** 옛 알고리즘 (밴드 흔들림) — 비교 기준으로만 남긴다 */
const DRAFT_WOBBLE = 0.12;
function chooseDraftOld(
  choices: readonly AugmentDef[],
  ctx: DraftContext,
  rng: { int(n: number): number },
): AugmentDef | undefined {
  if (choices.length === 0) return undefined;
  const scored = choices.map((def) => ({ def, score: draftScore(def, ctx) }));
  let bestScore = -Infinity;
  for (const s of scored) if (s.score > bestScore) bestScore = s.score;
  const band = bestScore * ctx.profile.noise * DRAFT_WOBBLE;
  const near = scored.filter((s) => s.score >= bestScore - band);
  return (near[rng.int(near.length)] ?? scored[0])?.def;
}

interface Tally {
  offered: Map<string, number>;
  picked: Map<string, number>;
}
const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
const blank = (): Tally => ({ offered: new Map(), picked: new Map() });

const oldT = blank();
const newT = blank();

// 같은 제시·같은 성격·같은 난수를 두 알고리즘에 먹인다
const gen = new Prng(SEED);
const rngOld = new Prng(SEED * 7 + 1);
const rngNew = new Prng(SEED * 7 + 1);
const asRngOld = { int: (n: number) => rngOld.int(n) };
const asRngNew = { int: (n: number) => rngNew.int(n) };

for (let i = 0; i < OFFERS; i++) {
  const pool = new Set<AugmentDef>();
  while (pool.size < CHOICES) pool.add(all[gen.int(all.length)] as AugmentDef);
  const choices = [...pool];
  const archetype = ARCHETYPE_NAMES[gen.int(ARCHETYPE_NAMES.length)] as (typeof ARCHETYPE_NAMES)[number];
  const ctx: DraftContext = {
    profile: profileOf(archetype),
    held: [],
    catalog,
    powerOf,
    unusable: BOT_UNUSABLE_AUGMENTS,
  };
  for (const c of choices) {
    bump(oldT.offered, c.id);
    bump(newT.offered, c.id);
  }
  const a = chooseDraftOld(choices, ctx, asRngOld);
  const b = chooseDraft(choices, ctx, asRngNew);
  if (a !== undefined) bump(oldT.picked, a.id);
  if (b !== undefined) bump(newT.picked, b.id);
}

/** 파워 구간별 픽률 */
function byBand(t: Tally): string[] {
  const bands = [
    { name: "≤21 (D)", lo: 0, hi: 21 },
    { name: "22~25", lo: 22, hi: 25 },
    { name: "26~30", lo: 26, hi: 30 },
    { name: "31~35", lo: 31, hi: 35 },
    { name: "36+", lo: 36, hi: 999 },
  ];
  return bands.map((b) => {
    let off = 0;
    let pick = 0;
    for (const d of all) {
      const p = powerOf(d.id);
      if (p < b.lo || p > b.hi) continue;
      off += t.offered.get(d.id) ?? 0;
      pick += t.picked.get(d.id) ?? 0;
    }
    const rate = off === 0 ? 0 : (pick / off) * 100;
    return `${b.name.padEnd(9)} 제시 ${String(off).padStart(6)} · 픽 ${String(pick).padStart(5)} · ${rate.toFixed(1)}%`;
  });
}

const DEAD = [
  "disarm",
  "triple_peek",
  "time_pressure",
  "always_tenpai",
  "brief_fog",
  "die_hard",
  "yakuman_shield",
  "hand_swap3",
  "frame_up",
];

console.log(`제시 ${OFFERS}회 (${CHOICES}지선다) · 시드 ${SEED}\n`);
console.log("── 옛 알고리즘 (밴드 흔들림) ──");
for (const l of byBand(oldT)) console.log("  " + l);
console.log("── 지금 알고리즘 (비율 가중 추첨) ──");
for (const l of byBand(newT)) console.log("  " + l);

console.log("\n── 보고서가 '픽 0'으로 지목한 9종 ──");
for (const id of DEAD) {
  const off = newT.offered.get(id) ?? 0;
  const o = oldT.picked.get(id) ?? 0;
  const n = newT.picked.get(id) ?? 0;
  const flag = BOT_UNUSABLE_AUGMENTS.includes(id) ? "  (BOT_UNUSABLE)" : "";
  console.log(
    `  ${id.padEnd(16)} 파워 ${String(powerOf(id)).padStart(2)} · 제시 ${String(off).padStart(4)} · 옛 픽 ${String(o).padStart(4)} → 지금 픽 ${String(n).padStart(4)}${flag}`,
  );
}

let oldZero = 0;
let newZero = 0;
for (const d of all) {
  const off = newT.offered.get(d.id) ?? 0;
  if (off < 8) continue;
  if ((oldT.picked.get(d.id) ?? 0) === 0) oldZero++;
  if ((newT.picked.get(d.id) ?? 0) === 0) newZero++;
}
console.log(`\n제시 8회 이상인데 한 번도 안 뽑힌 증강:  옛 ${oldZero}종 → 지금 ${newZero}종`);
