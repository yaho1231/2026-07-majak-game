/**
 * B-2 조합 스위프 소프트락 재현 — 판 하나를 `runMatch`로 돌리며 진행 로그를 stderr 로 흘린다.
 *
 *   ~/majak/node_modules/.bin/tsx qa-lab/round5/repro/combo_hang.ts <idx> [k=0] [--timeout ms] [--events]
 *
 * 멈추면 마지막 줄이 «어디서» 멈췄는지 말해 준다(국·phase·turnSeat·벽·마지막 이벤트).
 * ⚠ 동기 무한 루프면 타이머(withTimeout)가 못 울리므로 바깥에서 kill 해야 한다.
 */
import { gameArgs, loadCombos, personasFrom } from "../combo/lib.js";
import { runMatch } from "../../harness.js";
import type { GameState } from "@majak/core";

const idx = Number(process.argv[2]);
const k = Number(process.argv[3] ?? 0);
const ti = process.argv.indexOf("--timeout");
const timeoutMs = ti >= 0 ? Number(process.argv[ti + 1]) : 30_000;
const showEvents = process.argv.includes("--events");
const e = loadCombos().find((c) => c.idx === idx);
if (e === undefined) throw new Error(`idx ${idx} 없음`);
const a = gameArgs(e, k, timeoutMs, true);
console.error(`idx=${idx} k=${k} seed=${a.seed} mode=${a.mode} preset=${JSON.stringify(a.preset)} personas=${a.personaNames.join(",")}`);

let states = 0;
let lastKey = "";
let ev = 0;
const r = await runMatch({
  seed: a.seed, mode: a.mode, preset: a.preset, personas: personasFrom(a.personaNames), drafts: false, timeoutMs,
  onRound: (st: GameState, phase) => {
    console.error(`[round ${phase}] ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} scores=${st.players.map((p) => p.score).join("/")}`);
  },
  onState: (st: GameState) => {
    states++;
    const key = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} phase=${st.round.phase} turn=${st.round.turnSeat} wall=${st.zones["wall"]?.tileIds.length} seq=${st.lastEventSeq}`;
    // 상태 키가 바뀔 때만, 초반 200개는 전부·그 뒤엔 50개마다 찍는다 (무한 반복이면 같은 키가 계속 찍힌다)
    if (key !== lastKey) { lastKey = key; if (states % 50 === 0 || states < 200) console.error(`[state#${states}] ${key}`); }
  },
  onEvent: (line: string) => {
    ev++;
    if (showEvents) {
      try { const j = JSON.parse(line) as { type?: string; payload?: unknown }; console.error(`[ev${ev}] ${j.type} ${JSON.stringify(j.payload).slice(0, 160)}`); } catch { /* */ }
    }
  },
});
console.error(`DONE rounds=${r.rounds} crash=${r.crash ?? "-"} eff=${r.effectErrors.length} viol=${r.violations.length}`);
