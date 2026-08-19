/**
 * 불가침 조약의 실제 보호 길이를 잰다 — "매 국 첫 6순"이 몇 장의 버림에 해당하는가.
 * turnCount는 **오야가 뽑을 때만** +1이라, 후로가 많으면 오야 차례가 밀려 6순이 길어진다.
 * 사용: tsx qa-lab/defcall/measure_pact.ts <from> <to>
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 6);
const seats: PlayerId[] = ["p0", "p1", "p2", "p3"];
const preset: any = { p0: ["no_ron_pact"], p1: ["omni_chi"], p2: [], p3: [] };
const personas: any = { p0: PERSONAS.folder, p1: PERSONAS.caller, p2: PERSONAS.caller, p3: PERSONAS.caller };

const samples: number[] = [];
let rounds = 0;
for (let seed = from; seed <= to; seed++) {
  let discardsThisRound = 0;
  let recorded = false;
  let started = false;
  await runDefcall({
    seed, mode: "hanchan", preset, personas, noDraft: true,
    onEvent: (e, st) => {
      if (st === null) return;
      if (e.type === "RoundStarted") { discardsThisRound = 0; recorded = false; rounds++; started = true; }
      if (!started) return;
      if (e.type === "TileDiscarded") discardsThisRound++;
      if (!recorded && st.round.turnCount > 6) { samples.push(discardsThisRound); recorded = true; }
    },
  });
}
samples.sort((a, b) => a - b);
const avg = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
console.log(`rounds=${rounds} 표본=${samples.length}`);
console.log(`조약이 만료(turnCount>6)될 때까지의 총 버림 수: 최소=${samples[0]} 중앙=${samples[Math.floor(samples.length / 2)]} 평균=${avg.toFixed(1)} 최대=${samples.at(-1)}`);
