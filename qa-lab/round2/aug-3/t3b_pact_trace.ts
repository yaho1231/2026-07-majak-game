/** H3b — 스위프가 잡은 정확한 판을 재현해 조약 채널 어긋남의 원인을 본다 */
import { Prng } from "@majak/core";
import type { GameState } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

const plist = Object.values(PERSONAS) as Persona[];
const ai = 2, k = 2;             // no_ron_pact, dual
const seedBase = ai * 1009 + k * 7919 + 13;
const rng = new Prng(seedBase * 2654435761);
const preset = assignPreset(rng, "hanchan", ["no_ron_pact"], 2) as Record<string, string[]>;
preset["p2"] = ["no_ron_pact", ...(preset["p2"] ?? []).filter((x) => x !== "no_ron_pact")].slice(0, 2);
const personas = Object.fromEntries(SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona])) as Record<string, Persona>;
console.log("seed", seedBase, JSON.stringify(preset));

function real(st: GameState, h: string): boolean {
  const rs = st.round.byPlayer[h];
  if (rs === undefined) return false;
  if ((rs.discardCount ?? 0) > 6) return false;
  if (rs.riichi != null) return false;
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  if (st.augmentData[`no_ron_pact:declared:${rk}:${h}#round`] === true) return false;
  if ((rs.melds?.length ?? 0) > 0) return false;
  return true;
}
const seen = new Set<string>();
const log: string[] = [];
await runMatch({
  seed: seedBase, mode: "hanchan", preset: preset as never, personas: personas as never,
  onState: (st) => {
    for (const h of ["p0", "p2"]) {
      const key = `view:*:no_ron_pact:active:${h}#round`;
      const shown = st.augmentData[key];
      const r = real(st, h);
      if (shown === undefined || shown === r) continue;
      const rs = st.round.byPlayer[h];
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const sig = `${h}|${rk}|${String(shown)}|${rs?.discardCount}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      log.push(`MISMATCH ${h} ${rk} shown=${String(shown)} real=${r} dc=${rs?.discardCount} melds=${rs?.melds?.length} riichi=${rs?.riichi != null} label=${JSON.stringify(st.augmentData[`view:*:no_ron_pact:${h}#round`])} allKeys=${JSON.stringify(Object.keys(st.augmentData).filter((x) => x.includes("no_ron_pact")))}`);
    }
  },
  timeoutMs: 200_000,
});
console.log(log.slice(0, 20).join("\n"));
console.log("mismatches", log.length);
