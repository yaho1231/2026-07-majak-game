/**
 * 방어 증강 집중 시나리오 — p1에게 국사무쌍 텐파이를 강제 배패해 역만이 반복적으로
 * 떨어지게 만들고, 방어 증강 보유자가 어떻게 정산되는지 본다.
 *
 * 사용: tsx qa-lab/defcall/scenario.ts <from> <to> [startScore]
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";
import { makeChecks } from "./checks.js";

const KOKUSHI = [
  "man1", "man9", "pin1", "pin9", "sou1", "sou9",
  "wind1", "wind2", "wind3", "wind4",
  "dragon1", "dragon2", "dragon3",
];

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 15);
const startScore = Number(process.argv[4] ?? 8000);

const preset: Record<PlayerId, string[]> = {
  p0: ["yakuman_shield"],
  p1: [],
  p2: ["die_hard"],
  p3: ["always_tenpai"],
};
const personas: any = {
  p0: PERSONAS.folder, p1: PERSONAS.masher, p2: PERSONAS.folder, p3: PERSONAS.caller,
};

const agg: Record<string, number> = {};
const seen = new Set<string>();
let rounds = 0;
for (let seed = from; seed <= to; seed++) {
  const chk = makeChecks(preset, "hanchan");
  const settles: any[] = [];
  const r = await runDefcall({
    seed, mode: "hanchan", preset, personas, noDraft: true,
    presetHands: { p1: KOKUSHI } as any,
    config: { startScore, dobi: true },
    onState: chk.onState,
    onEvent: (e, st, out) => {
      chk.onEvent(e, st, out);
      if (e.type === "RoundSettled") settles.push(e.payload);
    },
  });
  rounds += r.rounds;
  for (const [k, v] of Object.entries(chk.stats)) agg[k] = (agg[k] ?? 0) + v;
  if (r.crash !== undefined) console.log(`CRASH seed=${seed} ${r.crash.split("\n").slice(0, 4).join(" | ")}`);
  for (const ee of r.effectErrors.slice(0, 2)) {
    const k = `EFF ${ee.slice(0, 90)}`;
    if (!seen.has(k)) { seen.add(k); console.log(`${k} seed=${seed}`); }
  }
  for (const v of r.violations) {
    agg[`viol:${v.kind}`] = (agg[`viol:${v.kind}`] ?? 0) + 1;
    const k = v.kind + v.detail.slice(0, 30);
    if (!seen.has(k)) { seen.add(k); console.log(`VIOL ${v.kind} seed=${seed} seat=${v.seat ?? "-"} r=${v.round} :: ${v.detail.slice(0, 260)}`); }
  }
  if (process.env.DUMP === "1") {
    for (const p of settles) {
      console.log(`  settle seed=${seed} ${p.outcome} deltas=${JSON.stringify(p.deltas)} yaku=${JSON.stringify((p.winInfos ?? []).map((w: any) => [w.winner, w.yakumanCount, w.points]))} aug=${JSON.stringify(p.augPoints)}`);
    }
  }
  console.log(`seed=${seed} rounds=${r.rounds} final=${JSON.stringify(r.finalScores)}`);
}
console.log(`\n=== scenario seeds ${from}..${to}: rounds=${rounds}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(agg).sort())));
