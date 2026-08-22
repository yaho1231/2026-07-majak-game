/** 티어 라벨과 산식 점수가 어긋나는 곳 — shift/fixed 로 설명되는가 */
import { AUGMENT_POWER_TIERS, POWER_TIER_ORDER, powerScore } from "@majak/core";
const rows = Object.entries(AUGMENT_POWER_TIERS as Record<string, any>).map(([id, s]) => ({
  id, score: powerScore(s), shift: s.shift ?? 0, fixed: s.fixed ?? null, rare: s.rare ?? false,
  tier: s.tier,
}));
const idx = (t: string): number => POWER_TIER_ORDER.indexOf(t as never);
// 같은 점수인데 티어가 다른 / 점수는 높은데 티어가 낮은 쌍 중 shift·fixed 로 설명 안 되는 것
let unexplained = 0;
for (const a of rows) for (const b of rows) {
  if (a.id >= b.id) continue;
  if (a.score <= b.score) continue;           // a 가 더 세다
  if (idx(a.tier) <= idx(b.tier)) continue;   // 그런데 a 의 티어가 더 낮다 (ORDER 는 센 것부터)
  if (a.shift !== 0 || b.shift !== 0 || a.fixed !== null || b.fixed !== null) continue;
  unexplained++;
  if (unexplained <= 15) console.log(`INVERSION ${a.id}(${a.tier},${a.score}) > ${b.id}(${b.tier},${b.score}) — shift/fixed 없음`);
}
console.log(`설명 안 되는 티어 역전 ${unexplained}쌍 / ${rows.length}종`);
const big = rows.filter((r) => Math.abs(r.shift) >= 2);
console.log(`shift 절대값 2 이상: ${big.map((r)=>`${r.id}(${r.tier},${r.score},shift=${r.shift})`).join(" ")}`);
const rareNoShift = rows.filter((r) => r.rare && r.shift >= 0);
console.log(`rare 인데 shift 가 음수가 아님(주석상 금지): ${rareNoShift.map((r)=>`${r.id}(shift=${r.shift})`).join(" ") || "없음"}`);
