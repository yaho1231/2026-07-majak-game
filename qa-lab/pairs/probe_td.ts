/** true_dragon 16장 손패가 13장으로 돌아간 이유 확인 (무장해제 여부) */
import { Prng, handZone } from "@majak/core";
import { PERSONAS, fillSeats, runMatch } from "./lib.js";
const rng = new Prng(20220 * 7919 + 13);
const preset = fillSeats(rng, "hanchan", ["xray_hand", "time_stop"]) as Record<string, string[]>;
preset["p2"] = ["xray_hand", "time_stop"];
console.log(JSON.stringify(preset));
let idx = 0;
let last = "";
await runMatch({
  seed: 20220,
  mode: "hanchan",
  preset: preset as never,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.folder! },
  onRound: (st, ph) => {
    if (ph === "start") {
      idx++; last = "";
      const n = st.zones[handZone("p1")]?.tileIds.length ?? 0;
      const dis = JSON.stringify(st.augmentData["engine:disarmed#round"] ?? st.augmentData["engine:disarmed"] ?? null);
      console.log(`--- round #${idx} start: p1 hand=${n} disarmed=${dis} augs=${JSON.stringify(st.players.find((p) => p.id === "p1")?.augments)}`);
    }
  },
  onState: (st) => {
    const n = st.zones[handZone("p1")]?.tileIds.length ?? 0;
    const m = st.round.byPlayer["p1"]?.meldCount ?? 0;
    const dis = JSON.stringify(st.augmentData["engine:disarmed#round"] ?? st.augmentData["engine:disarmed"] ?? null);
    const k = `${n}+${m} dis=${dis}`;
    if (k !== last && idx <= 3) { console.log(`   p1 hand=${n} melds=${m} disarmed=${dis} phase=${st.round.phase}`); last = k; }
  },
});
