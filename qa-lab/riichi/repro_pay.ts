/**
 * RIICHI_PAY 오탐/실탐 판별용 — seed=4329 tonpuu에서 p2의 리치 선언 앞뒤 브로드캐스트를
 * 점수·공탁까지 통째로 찍는다.
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import type { GameState } from "@majak/core";
import { PERSONAS, SEATS, conflicting, runMatch } from "../harness.js";
import type { Persona } from "../harness.js";

const RIICHI12 = [
  "riichi_upgrade", "free_riichi_discard", "open_riichi_reveal", "no_retreat",
  "all_or_nothing", "riichi_seal", "off_by_one", "stealth_riichi",
  "siege_riichi", "late_double", "palm_flip", "soul_strike",
] as const;
function riichiPreset(rng: Prng, per = 2): Record<PlayerId, string[]> {
  const pool = [...RIICHI12] as string[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const taken = new Set<string>();
  for (const seat of SEATS) {
    const held = out[seat]!;
    for (const id of pool) {
      if (held.length >= per) break;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id); taken.add(id);
    }
  }
  return out;
}


const seed = Number(process.argv[2] ?? 4329);
const rng = new Prng(seed * 7919 + 13);
const preset = riichiPreset(rng, seed % 3 === 0 ? 3 : 2);
console.log("preset", JSON.stringify(preset));

const rushMasher: Persona = { name: "리치광", augmentBias: 0.95, riichiBias: 1, callBias: 0.15, kanBias: 0.4, alwaysWin: true };
const rusher: Persona = { ...PERSONAS.riichiRusher!, augmentBias: 0.5 };
const rushStall: Persona = { name: "리치지연", augmentBias: 0.8, riichiBias: 1, callBias: 0.1, kanBias: 0.2, alwaysWin: false };
const PERS: Persona[][] = [
  [rusher, rushMasher, PERSONAS.caller!, PERSONAS.folder!],
  [rushMasher, rusher, rushStall, PERSONAS.masher!],
  [rushStall, rushMasher, rusher, PERSONAS.chaos!],
  [rusher, rusher, rushMasher, PERSONAS.stall!],
  [rushMasher, PERSONAS.folder!, rusher, rusher],
];
const ps = PERS[seed % PERS.length]!;

let prev: string | null = null;
let prevRiichi = false;
const line = (st: GameState): string =>
  `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} ph=${st.round.phase} pot=${st.round.riichiPot} ` +
  st.players.map((p) => `${p.id}:${p.score}${st.round.byPlayer[p.id]?.riichi != null ? "R" : ""}`).join(" ");

const r = await runMatch({
  seed,
  mode: "tonpuu",
  preset,
  personas: { p0: ps[0]!, p1: ps[1]!, p2: ps[2]!, p3: ps[3]! },
  onState: (st) => {
    const nowR = st.round.byPlayer["p2"]?.riichi != null;
    if (nowR && !prevRiichi) {
      console.log("── p2 리치 등장 ──");
      console.log("  이전:", prev);
      console.log("  지금:", line(st), "cost=", st.round.byPlayer["p2"]?.riichi?.cost);
    }
    prevRiichi = nowR;
    prev = line(st);
  },
});
console.log("final", JSON.stringify(r.finalScores), "viol", r.violations.map((v) => `${v.kind} ${v.detail}`));
