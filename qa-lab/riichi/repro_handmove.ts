/** seed=5600 tonpuu — p1의 리치 손패가 줄어드는 순간에 후로(멘쯔)가 늘었는지 본다. */
import { Prng, handZone } from "@majak/core";
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


const seed = 5600;
const preset = riichiPreset(new Prng(seed * 7919 + 13), seed % 3 === 0 ? 3 : 2);
const rushMasher: Persona = { name: "리치광", augmentBias: 0.95, riichiBias: 1, callBias: 0.15, kanBias: 0.4, alwaysWin: true };
const rusher: Persona = { ...PERSONAS.riichiRusher!, augmentBias: 0.5 };
const PERS: Persona[][] = [
  [rusher, rushMasher, PERSONAS.caller!, PERSONAS.folder!],
];
const ps = PERS[0]!;
let last = "";
const r = await runMatch({
  seed, mode: "tonpuu", preset,
  personas: { p0: ps[0]!, p1: ps[1]!, p2: ps[2]!, p3: ps[3]! },
  onState: (st: GameState) => {
    const rs = st.round.byPlayer["p1"];
    if (rs?.riichi == null) return;
    const cur = `hand=${st.zones[handZone("p1")]?.tileIds.length} melds=${rs.melds.length}(${rs.melds.map((m) => m.kind).join(",")}) drawn=${st.round.lastDrawnTile}`;
    if (cur !== last) { console.log(cur); last = cur; }
  },
});
console.log("viol", r.violations.filter((v) => v.kind === "RIICHI_HAND_MOVED").length);
