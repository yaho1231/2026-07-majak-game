/** H3c — 조약 채널이 왜 되살아나지 않는지: 이벤트별 추적 */
import { Prng } from "@majak/core";
import type { GameState } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

const plist = Object.values(PERSONAS) as Persona[];
const ai = 2, k = 2;
const seedBase = ai * 1009 + k * 7919 + 13;
const rng = new Prng(seedBase * 2654435761);
const preset = assignPreset(rng, "hanchan", ["no_ron_pact"], 2) as Record<string, string[]>;
preset["p2"] = ["no_ron_pact", ...(preset["p2"] ?? []).filter((x) => x !== "no_ron_pact")].slice(0, 2);
const personas = Object.fromEntries(SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona])) as Record<string, Persona>;

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
let prev = "";
const out: string[] = [];
await runMatch({
  seed: seedBase, mode: "hanchan", preset: preset as never, personas: personas as never,
  onState: (st) => {
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    if (rk !== "2-2-5" && rk !== "1-1-0") return;
    const rs = st.round.byPlayer["p2"];
    const line = `${rk} dc=${rs?.discardCount} melds=${rs?.melds?.length} riichi=${rs?.riichi != null} shown=${String(st.augmentData["view:*:no_ron_pact:active:p2#round"])} real=${real(st, "p2")} label=${String(st.augmentData["view:*:no_ron_pact:p2#round"])}`;
    if (line === prev) return;
    prev = line;
    if (out.length < 60) out.push(line);
  },
  timeoutMs: 200_000,
});
console.log(out.join("\n"));
