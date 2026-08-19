/** 미련(regret)이 실기에서 조건을 밟는가 — 유국 횟수 · 그때 p0의 멘젠 텐파이 여부를 센다 */
import { WALL, handZone, kindOf, isTenpai, meldCountOf } from "@majak/core";
import type { GameState } from "@majak/core";
import { PERSONAS, runMatch } from "../harness.js";

const N = Number(process.argv[2] ?? 10);
const START = Number(process.argv[3] ?? 6000);

let draws = 0;
let tenpaiAtDraw = 0;
let keeps = 0;
let rounds = 0;
const problems: string[] = [];

for (let i = 0; i < N; i++) {
  const seed = START + i;
  let sawKeep = false;
  const r = await runMatch({
    seed,
    mode: "hanchan",
    preset: { p0: ["regret"], p1: ["table_flip"], p2: ["even_world"], p3: ["tile_split"] },
    personas: { p0: PERSONAS.folder!, p1: PERSONAS.folder!, p2: PERSONAS.folder!, p3: PERSONAS.folder! },
    onRound: (st: GameState, phase) => {
      if (phase !== "end") return;
      const wall = st.zones[WALL]?.tileIds.length ?? 0;
      if (wall > 0) return;
      draws++;
      const hand = (st.zones[handZone("p0")]?.tileIds ?? []).map((id) => kindOf(st, id));
      const menzen = meldCountOf(st, "p0") === 0;
      if (menzen && isTenpai(hand, 0)) tenpaiAtDraw++;
    },
    onState: (st: GameState) => {
      const v = st.augmentData["regret:keep:p0"];
      if (Array.isArray(v) && v.length > 0 && !sawKeep) { sawKeep = true; keeps++; }
      if (!(Array.isArray(v) && v.length > 0)) sawKeep = false;
    },
  });
  rounds += r.rounds;
  if (r.crash !== undefined) problems.push(`seed=${seed} CRASH ${r.crash.split("\n")[0]}`);
  for (const e of r.effectErrors) problems.push(`seed=${seed} EFF ${e}`);
  console.log(`seed=${seed} rounds=${r.rounds} 유국누적=${draws} 유국시멘젠텐파이=${tenpaiAtDraw} 보존발생=${keeps}`);
}
console.log(`\n=== ${N} matches, ${rounds} rounds — 유국 ${draws}, 그중 p0 멘젠텐파이 ${tenpaiAtDraw}, regret 보존 ${keeps}`);
for (const p of problems) console.log("  " + p);
