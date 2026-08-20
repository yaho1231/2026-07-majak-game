/** 뒤집힌 모래시계 집중 실행 — 유국을 많이 만들려고 전원 베타오리로 돌린다 */
import { DEAD_WALL, WALL, discardsZone } from "@majak/core";
import type { GameState } from "@majak/core";
import { PERSONAS, runMatch } from "../harness.js";
import type { Violation } from "../harness.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const N = arg("n", 20);
const START = arg("start", 1);

let opened = 0;
const summary = new Map<string, number>();
const bump = (k: string): void => summary.set(k, (summary.get(k) ?? 0) + 1);

for (let i = 0; i < N; i++) {
  const seed = START + i;
  const seenOpen = new Set<string>();
  const dur: Record<string, { wall0: number; disc0: number[] }> = {};
  const viol: Violation[] = [];
  const r = await runMatch({
    seed,
    mode: "hanchan",
    preset: { p0: ["hourglass"], p1: ["reload"], p2: ["call_seal"], p3: ["brief_fog"] },
    personas: { p0: PERSONAS.folder!, p1: PERSONAS.folder!, p2: PERSONAS.folder!, p3: PERSONAS.stall! },
    onState: (st: GameState) => {
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const isOpen = st.augmentData[`hourglass:opened:${rk}:p0#round`] === true;
      if (!isOpen) return;
      const wall = st.zones[WALL]?.tileIds.length ?? 0;
      const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
      const disc = st.players.map((p) => st.zones[discardsZone(p.id)]?.tileIds.length ?? 0);
      if (!seenOpen.has(rk)) {
        seenOpen.add(rk);
        opened++;
        dur[rk] = { wall0: wall, disc0: disc };
        if (dw < 10) viol.push({ kind: "HG_DEADWALL", detail: `deadWall=${dw} (표시패 블록 침범)`, round: rk });
        if (wall > 4) viol.push({ kind: "HG_WALL_BIG", detail: `연장 시작 wall=${wall}`, round: rk });
      }
      const st0 = dur[rk];
      if (st0 !== undefined) {
        // 연장 중 보유자 외의 사람이 버림을 늘렸는가 (후로 없이는 불가능해야 한다)
        for (let s = 1; s < 4; s++) {
          if (disc[s]! > st0.disc0[s]!) {
            const melds = st.round.byPlayer[`p${s}`]?.melds?.length ?? 0;
            viol.push({
              kind: "HG_OTHER_DISCARDED",
              detail: `p${s} 버림 ${st0.disc0[s]}->${disc[s]} melds=${melds} wall=${wall}`,
              round: rk,
            });
            st0.disc0[s] = disc[s]!;
          }
        }
        if (dw < 10) viol.push({ kind: "HG_DEADWALL", detail: `deadWall=${dw}`, round: rk });
      }
    },
    timeoutMs: 120_000,
  });
  const kinds = new Map<string, string>();
  for (const v of [...r.violations, ...viol]) if (!kinds.has(v.kind)) kinds.set(v.kind, `${v.round} ${v.seat ?? ""} ${v.detail}`);
  if (r.crash || r.effectErrors.length || kinds.size) {
    console.log(`seed=${seed} rounds=${r.rounds}`, r.crash ? `CRASH ${r.crash.split("\n")[0]}` : "");
    for (const [k, d] of kinds) console.log(`   - ${k}: ${d}`);
    if (r.effectErrors.length) console.log("   eff:", [...new Set(r.effectErrors)].slice(0, 3));
  }
  if (r.crash) bump(`CRASH:${r.crash.split("\n")[0].slice(0, 50)}`);
  for (const k of kinds.keys()) bump(k);
}
console.log(`\n=== ${N} matches, 모래시계 연장 ${opened}회 ===`);
for (const [k, v] of [...summary].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
