/** 정적 감사: synergy 표 · powerTier 표 · conflicts 를 카탈로그와 대조 */
import { AUGMENT_SYNERGY, AUGMENT_POWER_TIERS, standardAugments, synergyBias, powerScore } from "@majak/core";
import { contentAugments } from "@majak/content";

const all = [...standardAugments, ...contentAugments];
const ids = new Set(all.map((d) => d.id));
console.log(`catalog=${all.length} synergy=${Object.keys(AUGMENT_SYNERGY).length} tiers=${Object.keys(AUGMENT_POWER_TIERS).length}`);

const missSyn = all.filter((d) => AUGMENT_SYNERGY[d.id] === undefined).map((d) => d.id);
const deadSyn = Object.keys(AUGMENT_SYNERGY).filter((id) => !ids.has(id));
const missTier = all.filter((d) => AUGMENT_POWER_TIERS[d.id] === undefined).map((d) => d.id);
const deadTier = Object.keys(AUGMENT_POWER_TIERS).filter((id) => !ids.has(id));
console.log("SYN_MISSING", missSyn);
console.log("SYN_DEAD_ROW", deadSyn);
console.log("TIER_MISSING", missTier);
console.log("TIER_DEAD_ROW", deadTier);

// antiIds / conflicts 가 존재하지 않는 id 를 가리키는가
for (const [id, e] of Object.entries(AUGMENT_SYNERGY)) {
  for (const a of e.antiIds ?? []) if (!ids.has(a)) console.log(`ANTIID_UNKNOWN ${id} -> ${a}`);
}
for (const d of all) for (const c of d.conflicts ?? []) if (!ids.has(c)) console.log(`CONFLICT_UNKNOWN ${d.id} -> ${c}`);

// conflicts(절대 금지) 인데 synergy 표에서는 오히려 서로 끌어당기는 쌍
let pull = 0;
for (const d of all) for (const c of d.conflicts ?? []) {
  if (!ids.has(c)) continue;
  const b = synergyBias([d.id]);
  const v = b[c];
  if (v !== undefined && v > 1) { console.log(`CONFLICT_BUT_SYNERGY_PULL ${d.id} + ${c} = x${v}`); pull++; }
}
console.log("conflict-pull pairs:", pull);

// 시너지 배수 극단값 분포
const held1 = all.map((d) => d.id);
let maxB = 0, maxK = "";
for (const h of held1) {
  const b = synergyBias([h]);
  for (const [k, v] of Object.entries(b)) if (v > maxB) { maxB = v; maxK = `${h}->${k}`; }
}
console.log(`max single-held bias ${maxB} (${maxK})`);

// 티어 vs 실제 점수: shift 가 큰 것들
const rows = Object.entries(AUGMENT_POWER_TIERS).map(([id, e]) => ({ id, tier: e.tier, score: powerScore(e), shift: e.shift ?? 0 }));
rows.sort((a, b) => b.score - a.score);
console.log("top10", rows.slice(0, 10).map((r) => `${r.id}:${r.tier}:${r.score}`).join(" "));
console.log("bottom5", rows.slice(-5).map((r) => `${r.id}:${r.tier}:${r.score}`).join(" "));
