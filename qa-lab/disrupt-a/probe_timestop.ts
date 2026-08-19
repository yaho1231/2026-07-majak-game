/**
 * time_stop 감사 — "매 국 1회, 추가 턴 1회"가 지켜지는가.
 * 이벤트 로그에서 각 국의 실제 쯔모 순서를 뽑아 본다.
 *  - 보유자가 한 국에 얻는 추가 턴 수 (연속 2회 쯔모, 영상패 제외)
 *  - 선언(TimeStop 액션 = AugmentDataSet time_stop:used) 횟수
 */
import { PERSONAS } from "./h.js";
import type { PlayerId, GameEvent } from "@majak/core";
import { evRun } from "./evrun.js";

interface Row { rk: string; holder: PlayerId; declares: number; extras: number; }
const rows: Row[] = [];
const oddities: string[] = [];

const HOLDERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function analyze(events: readonly GameEvent[], rk: string): void {
  // 쯔모 순서 (영상패 제외)
  const draws: PlayerId[] = [];
  const declares: Record<string, number> = {};
  let ippatsuIssue = 0;
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "TileDrawn" && p.rinshan !== true) draws.push(p.player as PlayerId);
    if (e.type === "AugmentDataSet") {
      const k = String(p.key);
      if (/^time_stop:used:/.test(k) && p.value === true) {
        const who = k.split(":").pop() as string;
        declares[who] = (declares[who] ?? 0) + 1;
      }
    }
  }
  void ippatsuIssue;
  // 연속 중복 쯔모 = 추가 턴
  const extras: Record<string, number> = {};
  for (let i = 1; i < draws.length; i++) {
    if (draws[i] === draws[i - 1]) extras[draws[i]!] = (extras[draws[i]!] ?? 0) + 1;
  }
  for (const h of HOLDERS) {
    const d = declares[h] ?? 0;
    const x = extras[h] ?? 0;
    if (d > 0 || x > 0) rows.push({ rk, holder: h, declares: d, extras: x });
    if (d > 1) oddities.push(`${rk} ${h}: 한 국에 선언 ${d}회`);
    if (x > d) oddities.push(`${rk} ${h}: 선언 ${d}회인데 추가 턴 ${x}회`);
  }
}

let games = 0, rounds = 0;
const crashes: string[] = [];
for (let seed = 1; seed <= 12; seed++) {
  for (const [pn, personas] of Object.entries({
    masher: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
    caller: { p0: PERSONAS.caller!, p1: PERSONAS.caller!, p2: PERSONAS.caller!, p3: PERSONAS.caller! },
    riichi: { p0: PERSONAS.riichiRusher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.riichiRusher! },
  })) {
    const r = await evRun({
      seed,
      mode: seed % 2 === 0 ? "tonpuu" : "hanchan",
      preset: { p0: ["time_stop"], p1: ["time_stop"], p2: ["time_stop"], p3: ["time_stop"] },
      personas,
      onRoundEvents: (ev, st) => {
        analyze(ev, `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`);
      },
    });
    games++; rounds += r.rounds;
    if (r.crash !== undefined) crashes.push(`seed=${seed}/${pn}: ${r.crash}`);
  }
}
const totD = rows.reduce((a, r) => a + r.declares, 0);
const totX = rows.reduce((a, r) => a + r.extras, 0);
console.log(`games=${games} rounds=${rounds} 선언=${totD} 추가턴=${totX}`);
console.log(`이상 ${oddities.length}건`);
for (const o of oddities.slice(0, 30)) console.log("  " + o);
if (crashes.length > 0) console.log("crashes:", crashes.slice(0, 5));
