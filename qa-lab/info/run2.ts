/** 표적 시나리오 — 담당 9종을 강제 조합해 좌석별 뷰를 전수 검사 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, assignPreset } from "../harness.js";
import { runSpyMatch } from "./spy.js";
import type { SpyReport } from "./spy.js";

const INFO = ["ura_peek","peek_riichi_waits","xray_hand","rinshan_preview","foresight","dora_conceal","tenpai_scan","danger_sense","triple_peek"] as const;
const P = ["p0","p1","p2","p3"] as PlayerId[];

interface Case { name: string; preset: Record<PlayerId, string[]>; personas: Record<PlayerId, typeof PERSONAS.masher>; mode: "hanchan" | "tonpuu"; }

function personas(names: string[]): Record<PlayerId, typeof PERSONAS.masher> {
  return Object.fromEntries(P.map((p, i) => [p, PERSONAS[names[i]!]!])) as Record<PlayerId, typeof PERSONAS.masher>;
}

function cases(seed: number): Case[] {
  const rng = new Prng(seed * 7919);
  const out: Case[] = [];
  // A) 정보 증강만 4좌석 — 서로 겹치는 최악 조합
  for (let i = 0; i < 3; i++) {
    const pick = (j: number): string[] => [INFO[(seed + i * 4 + j) % INFO.length]!, INFO[(seed + i * 4 + j + 5) % INFO.length]!].filter((v, k, a) => a.indexOf(v) === k);
    out.push({ name: `all-info-${i}`, mode: "hanchan",
      preset: { p0: pick(0), p1: pick(1), p2: pick(2), p3: pick(3) },
      personas: personas(["masher", "stall", "caller", "riichiRusher"]) });
  }
  // B) 가려진 도라 × 왕패를 여는 증강 — concealedTileIdAt 경로
  out.push({ name: "conceal-vs-deadwall", mode: "hanchan",
    preset: { p0: ["dora_conceal"], p1: ["ura_peek", "rinshan_preview"], p2: ["dead_wall_master"], p3: ["cliff_bloom", "bottom_deal"] },
    personas: personas(["stall", "masher", "masher", "masher"]) });
  out.push({ name: "conceal-both", mode: "hanchan",
    preset: { p0: ["dora_conceal", "ura_peek"], p1: ["dora_conceal", "xray_hand"], p2: ["rinshan_preview", "foresight"], p3: ["triple_peek", "dead_wall_master"] },
    personas: personas(["masher", "masher", "masher", "masher"]) });
  // C) 투시 × 은닉계
  out.push({ name: "xray-vs-stealth", mode: "hanchan",
    preset: { p0: ["xray_hand", "peek_riichi_waits"], p1: ["stealth_riichi"], p2: ["brief_fog", "hidden_river"], p3: ["tenpai_scan", "danger_sense"] },
    personas: personas(["masher", "riichiRusher", "caller", "stall"]) });
  // D) 동풍전 + 무작위 잔여
  out.push({ name: "tonpuu-mixed", mode: "tonpuu",
    preset: assignPreset(rng, "tonpuu", [INFO[seed % INFO.length]!, INFO[(seed + 2) % INFO.length]!], 3),
    personas: personas(["chaos", "masher", "folder", "caller"]) });
  // E) 같은 증강 4좌석
  const same = INFO[seed % INFO.length]!;
  out.push({ name: `same-${same}`, mode: "hanchan",
    preset: { p0: [same], p1: [same], p2: [same], p3: [same] },
    personas: personas(["masher", "masher", "stall", "chaos"]) });
  return out;
}

async function main(): Promise<void> {
  const seeds = Number(process.argv[2] ?? 3);
  const start = Number(process.argv[3] ?? 100);
  const tally: Record<string, number> = {};
  const ex: Record<string, string> = {};
  const samples = new Map<string, Set<string>>();
  let rounds = 0, views = 0, matches = 0;
  for (let s = start; s < start + seeds; s++) {
    for (const c of cases(s)) {
      const r: SpyReport = await runSpyMatch({ seed: s, mode: c.mode, preset: c.preset, personas: c.personas, timeoutMs: 60000 });
      matches++; rounds += r.rounds; views += r.views;
      const tag = `seed=${s} case=${c.name} preset=${JSON.stringify(c.preset)}`;
      for (const l of r.leaks) { tally[l.kind] = (tally[l.kind] ?? 0) + 1; ex[l.kind] ??= `${tag} :: ${l.viewer}@${l.round} :: ${l.detail}`; }
      for (const v of r.violations) { tally[v.kind] = (tally[v.kind] ?? 0) + 1; ex[v.kind] ??= `${tag} :: ${v.detail}`; }
      for (const e of r.effectErrors) { tally["EFFECT_ERR"] = (tally["EFFECT_ERR"] ?? 0) + 1; ex["EFFECT_ERR"] ??= `${tag} :: ${e}`; }
      if (r.crash !== undefined) { tally["CRASH"] = (tally["CRASH"] ?? 0) + 1; ex["CRASH"] ??= `${tag} :: ${r.crash}`; }
      for (const [k, vs] of r.publicSamples) {
        let set = samples.get(k); if (!set) { set = new Set(); samples.set(k, set); }
        for (const x of vs) if (set.size < 4) set.add(x);
      }
      process.stdout.write(`  ${tag.slice(0, 60)} rounds=${r.rounds} leaks=${r.leaks.length}\n`);
    }
  }
  console.log(`\n=== ${matches} matches, ${rounds} rounds, ${views} views ===`);
  console.log("TALLY:", JSON.stringify(tally, null, 1));
  for (const [k, v] of Object.entries(ex)) console.log(`\n[${k}] ${v}`);
  console.log("\n=== 비보유자가 받은 '증강 이름' 채널 값 샘플 ===");
  for (const [k, v] of [...samples].sort()) console.log(`  ${k} = ${[...v].join(" ; ")}`);
}
main();
