/** HAND_SIZE_STRICT 위반 순간의 p1 상태를 통째로 찍는다 (seed 20220, mix=1) */
import { Prng, handZone, meldsZone } from "@majak/core";
import { PERSONAS, fillSeats, runMatch } from "./lib.js";
const rng = new Prng(20220 * 7919 + 13);
const preset = fillSeats(rng, "hanchan", ["xray_hand", "time_stop"]) as Record<string, string[]>;
preset["p2"] = ["xray_hand", "time_stop"];
let idx = 0;
let shown = 0;
await runMatch({
  seed: 20220, mode: "hanchan", preset: preset as never,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.folder! },
  onRound: (_s, ph) => { if (ph === "start") idx++; },
  onState: (st) => {
    if (st.round.phase !== "turn.act" || shown > 8) return;
    const rp = st.round.byPlayer["p1"];
    const hand = st.zones[handZone("p1")]?.tileIds.length ?? 0;
    const mz = st.zones[meldsZone("p1")]?.tileIds.length ?? 0;
    const m = rp?.meldCount ?? rp?.melds?.length ?? 0;
    const eff = hand + m * 3;
    const isTurn = st.players.find((p) => p.id === "p1")?.seat === st.round.turnSeat;
    const want = isTurn ? 17 : 16;
    if (eff !== want && eff !== (isTurn ? 16 : 17)) {
      shown++;
      console.log(`#${idx} ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} eff=${eff} want=${want} hand=${hand} meldsZone=${mz} meldCount=${String(rp?.meldCount)} melds.len=${rp?.melds?.length} melds=${JSON.stringify(rp?.melds?.map((x) => ({ k: (x as { kind?: string }).kind, n: (x as { tileIds?: number[] }).tileIds?.length })))} turn=${isTurn} disarmed=${JSON.stringify(Object.entries(st.augmentData).filter(([k]) => k.startsWith("engine:disarmed")).map(([k, v]) => [k, v]))}`);
    }
  },
});
console.log("done, shown", shown);
