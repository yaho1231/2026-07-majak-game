/**
 * 잔상(dora_afterimage) — 되살아난 도라가 정말 "직전 국"의 것인가.
 * 실행: tsx qa-lab/score-b/repro_afterimage.ts [seed]
 */
import { doraKindFor, kindKey } from "@majak/core";
import type { GameState, PlayerId, TileKind } from "@majak/core";
import { PERSONAS, runMatch } from "./run.js";

const seed = Number(process.argv[2] ?? 3);
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const rk = (s: GameState): string => `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
const asKinds = (v: unknown): TileKind[] =>
  Array.isArray(v) ? (v.filter((k) => typeof k === "object" && k !== null && "suit" in k) as TileKind[]) : [];

let cur = "";
const r = await runMatch({
  seed,
  mode: "hanchan",
  preset: Object.fromEntries(SEATS.map((s) => [s, ["dora_afterimage", "karma", "mirror_dora"]])) as Record<PlayerId, string[]>,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.chaos!, p3: PERSONAS.caller! },
  onRound: (st, phase) => {
    if (phase === "start") {
      cur = rk(st);
      console.log(`\n[start ${cur}] prevDoraKey=${JSON.stringify(asKinds(st.augmentData["dora_afterimage:prevDora"]).map(kindKey))}`);
    }
  },
  onSettle: (st) => {
    const ind = st.round.doraIndicators.map((t) => kindKey(st.tiles[t]!.kind));
    const dora = st.round.doraIndicators.map((t) => kindKey(doraKindFor(st.tiles[t]!.kind)));
    console.log(`[settle of ${cur}] 표시패=${ind} → 도라=${dora}`);
    console.log(`   prevDoraKey(정산 후)=${JSON.stringify(asKinds(st.augmentData["dora_afterimage:prevDora"]).map(kindKey))}`);
    for (const s of SEATS) {
      const k = `dora_afterimage:recalled:${cur}:${s}`;
      if (st.augmentData[k] !== undefined) {
        console.log(`   ${s} 발동 → recalled=${JSON.stringify(asKinds(st.augmentData[k]).map(kindKey))} (seq used=${String(st.augmentData[`dora_afterimage:usedSeq:${s}`])}, seq=${String(st.augmentData[`dora_afterimage:seq:${s}`])})`);
      }
    }
  },
});
console.log("\ncrash:", r.crash ?? "-", "viol:", r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED").length);
for (const v of r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED")) console.log(" ", v.kind, v.round, v.seat, v.detail);
