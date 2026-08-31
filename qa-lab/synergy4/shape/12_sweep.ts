/**
 * 12 — 실전 스위프: 축 안의 «서로를 키울 법한» 조합을 p0에 강제해 판을 완주시킨다.
 * 크래시·훅 예외·불변식 위반·소프트락을 본다.
 */
import { PERSONAS, assignPreset, conflicting, runMatch, SEATS } from "../../harness.js";
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";

const COMBOS: string[][] = [
  // 형 완화끼리
  ["polar_ends", "mixed_triplet"],
  ["polar_ends", "broken_border"],
  ["polar_ends", "broken_wall"],
  ["polar_ends", "wind_lineage"],
  ["polar_ends", "async_chiitoi"],
  ["polar_ends", "true_dragon"],
  ["polar_ends", "tanyao_break"],
  ["polar_ends", "royal_kokushi"],
  ["polar_ends", "joker"],
  ["mixed_triplet", "broken_border"],
  ["mixed_triplet", "broken_wall"],
  ["mixed_triplet", "async_chiitoi"],
  ["mixed_triplet", "wind_lineage"],
  ["mixed_triplet", "open_kokushi"],
  ["mixed_triplet", "joker"],
  ["broken_border", "broken_wall"],
  ["broken_border", "wind_lineage"],
  ["broken_border", "mixed_nine_gates"],
  ["broken_wall", "wind_lineage"],
  ["broken_wall", "off_by_one"],
  ["broken_wall", "even_world"],
  ["async_chiitoi", "joker"],
  ["async_chiitoi", "tanyao_break"],
  ["true_dragon", "broken_border"],
  ["true_dragon", "polar_ends"],
  ["true_dragon", "wind_lineage"],
  ["true_dragon", "tanyao_break"],
  // 국사·역만
  ["open_kokushi", "royal_kokushi"],
  ["open_kokushi", "giant_god"],
  ["royal_kokushi", "giant_god"],
  ["royal_kokushi", "nagashi_yakuman"],
  ["giant_god", "nagashi_yakuman"],
  ["open_kokushi", "polar_ends"],
  ["nagashi_yakuman", "polar_ends"],
  ["nagashi_yakuman", "tanyao_break"],
  ["mixed_nine_gates", "suit_unify"],
  ["mixed_nine_gates", "picky_eater"],
  ["mixed_nine_gates", "tile_dyeing"],
  ["mixed_nine_gates", "joker"],
  // honor / suit
  ["wind_lineage", "three_dragons_will"],
  ["wind_lineage", "genesis"],
  ["wind_lineage", "north_trader"],
  ["wind_lineage", "honor_return"],
  ["genesis", "three_dragons_will"],
  ["genesis", "honor_return"],
  ["genesis", "north_trader"],
  ["honor_return", "north_trader"],
  ["suit_unify", "tile_dyeing"],
  ["suit_unify", "picky_eater"],
  ["tile_dyeing", "picky_eater"],
  ["suit_unify", "tanyao_break"],
  ["even_world", "tanyao_break"],
  ["even_world", "polar_ends"],
  ["joker", "wind_lineage"],
  ["joker", "royal_kokushi"],
  // relax_win
  ["avenger", "open_kokushi"],
  ["avenger", "mixed_triplet"],
  ["avenger", "polar_ends"],
  ["late_bloomer", "mixed_triplet"],
  ["late_bloomer", "broken_border"],
  ["late_bloomer", "polar_ends"],
  // 3장
  ["polar_ends", "mixed_triplet", "tanyao_break"],
  ["polar_ends", "mixed_triplet", "broken_border"],
  ["mixed_triplet", "broken_border", "async_chiitoi"],
  ["open_kokushi", "royal_kokushi", "giant_god"],
  ["true_dragon", "polar_ends", "mixed_triplet"],
  ["wind_lineage", "broken_border", "broken_wall"],
];

const SEEDS = [11, 47];
type Row = { combo: string; seed: number; crash?: string; eff: number; viol: string[]; rounds: number };
const rows: Row[] = [];

for (const combo of COMBOS) {
  const bad = combo.find((a, i) => combo.slice(i + 1).some((b) => conflicting(a, b)));
  if (bad !== undefined) { console.log(`SKIP(conflict) ${combo.join("+")}`); continue; }
  for (const seed of SEEDS) {
    const rng = new Prng(seed * 977);
    const preset = assignPreset(rng, "hanchan", combo, Math.max(2, combo.length));
    const personas = Object.fromEntries(SEATS.map((s) => [s, s === "p0" ? PERSONAS["masher"]! : PERSONAS["chaos"]!])) as Record<PlayerId, any>;
    let r;
    try {
      r = await runMatch({ seed, mode: "hanchan", preset, personas, timeoutMs: 120_000 });
    } catch (e) {
      rows.push({ combo: combo.join("+"), seed, crash: String(e), eff: 0, viol: [], rounds: 0 });
      continue;
    }
    const viol = [...new Set(r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED").map((v) => `${v.kind}: ${v.detail.slice(0, 120)}`))];
    rows.push({ combo: combo.join("+"), seed, ...(r.crash !== undefined ? { crash: r.crash } : {}), eff: r.effectErrors.length, viol, rounds: r.rounds });
    if (r.crash !== undefined || r.effectErrors.length > 0 || viol.length > 0) {
      console.log(`\n!! ${combo.join("+")} seed=${seed} rounds=${r.rounds}`);
      if (r.crash !== undefined) console.log(`   CRASH ${r.crash.split("\n")[0]}`);
      for (const e of [...new Set(r.effectErrors)].slice(0, 5)) console.log(`   EFFECT ${e}`);
      for (const v of viol.slice(0, 8)) console.log(`   VIOL ${v}`);
    } else {
      console.log(`ok ${combo.join("+")} seed=${seed} rounds=${r.rounds}`);
    }
  }
}
const bad = rows.filter((r) => r.crash !== undefined || r.eff > 0 || r.viol.length > 0);
console.log(`\n=== ${rows.length}판 중 신호 ${bad.length}건 ===`);
for (const b of bad) console.log(`  ${b.combo} seed=${b.seed} crash=${b.crash?.split("\n")[0] ?? "-"} eff=${b.eff} viol=${b.viol.length}`);
