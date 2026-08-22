import { PERSONAS, runMatch } from "../../harness.js";
async function m(): Promise<void> {
  const out: string[] = [];
  const r = await runMatch({ seed: 11, mode: "hanchan",
    preset: { p0: [], p1: [], p2: [], p3: [] } as never,
    personas: { p0: PERSONAS.masher!, p1: PERSONAS.folder!, p2: PERSONAS.caller!, p3: PERSONAS.chaos! },
    onRound: (st, phase) => { if (phase === "end") out.push(`${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} phase=${st.round.phase} scores=${st.players.map((p) => p.score).join("/")}`); },
    onState: () => {} });
  console.log(out.join("\n"));
  console.log("actions", JSON.stringify(r.actionsTaken), "rounds", r.rounds, JSON.stringify(r.finalScores));
}
void m();
