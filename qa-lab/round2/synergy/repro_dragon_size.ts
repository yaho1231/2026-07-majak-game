/**
 * 재현: triples seed=770026 hanchan — p3 가 true_dragon 을 들고도 손패가 13/14장.
 * 위반 시점의 disarm 상태·보유·존을 통째로 찍는다.
 */
import { handZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";

const preset = { p0:["snake_kan","mixed_nine_gates"], p1:["pseudo_dealer","nagashi_yakuman"],
                 p2:["blind_ron","last_stand"], p3:["north_trader","big_hand"] } as never;
const mixes: Persona[] = [PERSONAS.chaos!, PERSONAS.masher!, PERSONAS.caller!, PERSONAS.masher!]; // i%4==2 → mixes[2]
let shots = 0;
const r = await runMatch({
  seed: 770026, mode: "hanchan", preset,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.stall!, p2: PERSONAS.chaos!, p3: PERSONAS.stall! } as never,
  onState: (st: GameState) => {
    if (st.round.phase !== "turn.act") return;
    for (const seat of st.config.playerIds as PlayerId[]) {
      const p = st.players.find((x) => x.id === seat)!;
      if (!p.augments.includes("true_dragon")) continue;
      const hz = st.zones[handZone(seat)]; if (hz === undefined) continue;
      const rp = st.round.byPlayer[seat] as any;
      const melds = rp?.meldCount ?? rp?.melds?.length ?? 0;
      const eff = hz.tileIds.length + melds * 3;
      const isTurn = p.seat === st.round.turnSeat;
      const want = isTurn ? [17,16] : [16,17];
      if (!want.includes(eff) && shots < 6) {
        shots++;
        console.log(`--- VIOL seat=${seat} round=${st.round.wind}-${st.round.number}-${st.round.honba} phase=${st.round.phase}`);
        console.log(`   eff=${eff} hand=${hz.tileIds.length} melds=${melds} turn=${isTurn} held=[${p.augments.join(",")}]`);
        const dis = Object.entries(st.augmentData).filter(([k]) => k.includes("disarm"));
        console.log(`   disarmKeys=${JSON.stringify(dis)}`);
        const td = Object.entries(st.augmentData).filter(([k]) => k.includes("true_dragon") || k.includes("dragon"));
        console.log(`   dragonKeys=${JSON.stringify(td)}`);
        console.log(`   allAug=${st.players.map((x)=>`${x.id}:[${x.augments.join(",")}]`).join(" ")}`);
      }
    }
  },
  timeoutMs: 120_000,
});
console.log("rounds", r.rounds, "viol", r.violations.length, "eff", r.effectErrors.length);
