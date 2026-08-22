import { handZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "../../pairs/lib.js";
const preset = { p0:["honba_hunter","hourglass"], p1:["palm_flip","call_seal"], p2:["silent_swap","polar_ends"], p3:["big_hand","riichi_upgrade"] } as never;
// triples: i%4===2 → mixes[2] = [masher, stall, chaos, stall]
let shots = 0;
await runMatch({ seed: 773874, mode: "hanchan", preset,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.stall!, p2: PERSONAS.chaos!, p3: PERSONAS.stall! } as never,
  onState: (st: GameState) => {
    if (st.round.phase !== "turn.act" || shots >= 2) return;
    for (const seat of st.config.playerIds as PlayerId[]) {
      const p = st.players.find((x) => x.id === seat)!;
      if (!p.augments.includes("true_dragon")) continue;
      const hz = st.zones[handZone(seat)]; if (hz === undefined) continue;
      const rp = st.round.byPlayer[seat] as any;
      const eff = hz.tileIds.length + (rp?.meldCount ?? rp?.melds?.length ?? 0) * 3;
      const isTurn = p.seat === st.round.turnSeat;
      if (![isTurn?17:16, isTurn?16:17].includes(eff)) {
        shots++;
        console.log(`VIOL ${seat} eff=${eff}`);
        console.log("  disarmed =", JSON.stringify(st.augmentData["engine:disarmed#round"]));
        console.log("  all =", st.players.map((x)=>`${x.id}:[${x.augments.join(",")}]`).join(" "));
      }
    }
  }, timeoutMs: 120_000 });
console.log("done shots=", shots);
