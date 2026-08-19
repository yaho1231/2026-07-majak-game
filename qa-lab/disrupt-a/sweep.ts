/** 방해 8종 스윕 */
import { PERSONAS, runMatch, SEATS } from "./h.js";
import type { Persona } from "./h.js";
import type { PlayerId } from "@majak/core";
import { DISRUPT8, checkDisrupt, newCtx } from "./inv.js";

const D = [...DISRUPT8];

/** 좌석별 프리셋 조합들 */
function presets(): Record<string, Record<PlayerId, string[]>> {
  const out: Record<string, Record<PlayerId, string[]>> = {};
  // A: 8종을 2개씩 분배
  out.split = { p0: [D[0]!, D[1]!], p1: [D[2]!, D[3]!], p2: [D[4]!, D[5]!], p3: [D[6]!, D[7]!] };
  // B: 회전
  out.rot = { p0: [D[2]!, D[5]!], p1: [D[7]!, D[0]!], p2: [D[1]!, D[6]!], p3: [D[3]!, D[4]!] };
  // C: 전원 동일 증강(겹침 테스트)
  for (const id of D) {
    out[`all_${id}`] = { p0: [id], p1: [id], p2: [id], p3: [id] };
  }
  // D: 두 방해가 같은 대상에 겹치게 — 두 명이 지목형을 들고 나머지는 없음
  out.pair_mark = { p0: ["scapegoat", "rank_gate"], p1: ["parasite", "discard_lock"], p2: [], p3: [] };
  out.pair_dealer = { p0: ["pseudo_dealer", "seat_swap"], p1: ["pseudo_dealer", "seat_swap"], p2: ["time_stop"], p3: ["time_stop"] };
  return out;
}

const personaSets: Record<string, Record<PlayerId, Persona>> = {
  masher: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
  stall: { p0: PERSONAS.stall!, p1: PERSONAS.stall!, p2: PERSONAS.stall!, p3: PERSONAS.stall! },
  folder: { p0: PERSONAS.folder!, p1: PERSONAS.folder!, p2: PERSONAS.folder!, p3: PERSONAS.folder! },
  caller: { p0: PERSONAS.caller!, p1: PERSONAS.caller!, p2: PERSONAS.caller!, p3: PERSONAS.caller! },
  mix: { p0: PERSONAS.masher!, p1: PERSONAS.stall!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.folder! },
};

const args = process.argv.slice(2);
const NSEED = Number(args[0] ?? 4);
const onlyP = args[1];

let games = 0, rounds = 0;
const seenKinds = new Map<string, string>();
const crashes = new Map<string, string>();
const effs = new Map<string, string>();

for (const [pname, preset] of Object.entries(presets())) {
  if (onlyP !== undefined && pname !== onlyP) continue;
  for (const [sname, personas] of Object.entries(personaSets)) {
    for (let seed = 1; seed <= NSEED; seed++) {
      const c = newCtx();
      const mode = seed % 3 === 0 ? "tonpuu" : "hanchan";
      const r = await runMatch({
        seed, mode, preset: preset as never, personas,
        onState: (st, out) => checkDisrupt(st, out, c),
        timeoutMs: 90_000,
      });
      games++; rounds += r.rounds;
      const tag = `${pname}/${sname}/seed=${seed}/${mode}`;
      if (r.crash !== undefined) {
        const key = r.crash.split("\n")[0]!;
        if (!crashes.has(key)) crashes.set(key, tag);
      }
      for (const e of r.effectErrors) {
        const key = e.slice(0, 140);
        if (!effs.has(key)) effs.set(key, tag);
      }
      for (const v of r.violations) {
        const key = `${v.kind}: ${v.detail}`.slice(0, 160);
        if (!seenKinds.has(key)) seenKinds.set(key, tag);
      }
      process.stdout.write(`${r.crash !== undefined ? "X" : r.violations.length > 0 ? "!" : "."}`);
    }
  }
}
console.log(`\n\ngames=${games} rounds=${rounds}`);
console.log(`\n== CRASHES (${crashes.size}) ==`);
for (const [k, t] of crashes) console.log(`  [${t}] ${k}`);
console.log(`\n== EFFECT ERRORS (${effs.size}) ==`);
for (const [k, t] of effs) console.log(`  [${t}] ${k}`);
console.log(`\n== VIOLATIONS (${seenKinds.size}) ==`);
for (const [k, t] of seenKinds) console.log(`  [${t}] ${k}`);
