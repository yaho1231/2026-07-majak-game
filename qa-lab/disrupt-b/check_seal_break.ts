/** seed=1016(동풍전)에서 잡힌 SEAL_BROKEN_CALL이 무장해제 탓인지 확인한다 */
import type { GameState } from "@majak/core";
import { PERSONAS, runMatch } from "../harness.js";

const seen: Record<string, number> = {};
await runMatch({
  seed: 1016,
  mode: "tonpuu",
  preset: {
    p0: ["call_seal", "brief_fog"],
    p1: ["disarm", "late_bloomer_east"],
    p2: ["suit_unify", "pond_snatch"],
    p3: ["hourglass", "no_retreat"],
  },
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.folder!, p3: PERSONAS.caller! },
  onState: (st: GameState) => {
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    const declared = st.augmentData[`call_seal:turn:${rk}:p0`];
    const uses = st.augmentData["call_seal:uses:p0"];
    const active = typeof uses === "number" && uses > 0 && typeof declared === "number" && st.round.turnCount - declared < 6;
    if (!active) return;
    for (const q of st.players) {
      if (q.id === "p0") continue;
      const melds = st.round.byPlayer[q.id]?.melds ?? [];
      const open = melds.filter((m) => m.kind !== "kan_closed" && m.silent !== true).length;
      const key = `${rk}:${q.id}`;
      if (open > (seen[key] ?? 0)) {
        console.log(
          `봉인 중 후로: ${q.id} ${melds.map((m) => m.kind).join(",")} (declared=${String(declared)} now=${st.round.turnCount})`,
        );
        console.log("   무장해제 목록:", JSON.stringify(st.augmentData["engine:disarmed#round"]));
        console.log("   call_seal uses:", uses);
      }
      seen[key] = open;
    }
  },
  timeoutMs: 180_000,
});
