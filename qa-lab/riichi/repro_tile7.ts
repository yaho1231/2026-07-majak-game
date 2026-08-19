/** seed=30244 tonpuu — 리치 중인 p3의 손패가 늘어나는 순간, 그 패가 어디서 왔는지 추적한다. */
import { Prng } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, SEATS, conflicting, runMatch } from "../harness.js";
import type { Persona } from "../harness.js";

const RIICHI12 = ["riichi_upgrade","free_riichi_discard","open_riichi_reveal","no_retreat","all_or_nothing","riichi_seal","off_by_one","stealth_riichi","siege_riichi","late_double","palm_flip","soul_strike"];
function riichiPreset(rng: Prng, per = 2): Record<PlayerId, string[]> {
  const pool = [...RIICHI12];
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const out: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const taken = new Set<string>();
  for (const seat of SEATS) { const held = out[seat]!;
    for (const id of pool) { if (held.length >= per) break; if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue; held.push(id); taken.add(id); } }
  return out;
}
const seed = 30244;
const preset = riichiPreset(new Prng(seed * 7919 + 13), seed % 3 === 0 ? 3 : 2);
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
const zoneOf = (st: GameState, id: number): string => {
  for (const z of Object.values(st.zones)) if ((z.tileIds as unknown as number[]).includes(id)) return z.id;
  return "?";
};
let prev = "";
await runMatch({ seed, mode: "tonpuu", preset,
  personas: { p0: ps[0]!, p1: ps[1]!, p2: ps[2]!, p3: ps[3]! },
  onState: (st) => {
    const rs = st.round.byPlayer["p3"];
    const cur = `p3riichi=${rs?.riichi != null} hand=${st.zones["hand:p3"]?.tileIds.length} melds=${rs?.melds.length} t7=${zoneOf(st, 7)} phase=${st.round.phase} turnSeat=${st.round.turnSeat} drawn=${st.round.lastDrawnTile}`;
    if (cur !== prev) { console.log(cur); prev = cur; }
  },
});
