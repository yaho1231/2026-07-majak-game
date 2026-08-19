/**
 * 국경을 넘는 두 증강(미련 regret · 귀환 honor_return)의 약속을 실제 매치에서 검증한다.
 *
 * 약속:
 *  - regret: 황패유국 시 멘젠 텐파이면 그 손패 13장이 **그대로 다음 국의 배패**가 된다.
 *  - honor_return: 발동 시점까지 버린 자패 최대 4장이 **다음 국 배패에 되돌아온다**.
 *  - 둘 다 한 번 쓰이면 보존이 비워져야 하고, 다음 국으로 두 번 새면 안 된다.
 */
import { handZone, kindKey, kindOf } from "@majak/core";
import type { GameState, TileKind } from "@majak/core";
import { PERSONAS, SEATS, runMatch } from "../harness.js";
import type { Violation } from "../harness.js";
import { extraChecks } from "./inv.js";
import type { Memo } from "./inv.js";

const N = Number(process.argv[2] ?? 20);
const START = Number(process.argv[3] ?? 9000);

interface Track {
  pendingRegret: string[] | null;
  pendingHonor: string[] | null;
  roundKey: string;
  checkedThisRound: boolean;
}

const problems: string[] = [];
const VERBOSE = process.env.VERBOSE === "1";
const push = (m: string): void => { problems.push(m); if (VERBOSE) console.log("  ! " + m); };
let deliveredRegret = 0;
let deliveredHonor = 0;
let rounds = 0;

for (let i = 0; i < N; i++) {
  const seed = START + i;
  const memo: Memo = {};
  const t: Track = { pendingRegret: null, pendingHonor: null, roundKey: "", checkedThisRound: true };
  const kindsOfKey = (v: unknown): string[] | null =>
    Array.isArray(v) && v.length > 0 ? (v as TileKind[]).map(kindKey) : null;

  const r = await runMatch({
    seed,
    mode: "hanchan",
    preset: {
      p0: ["regret", "table_flip"],
      p1: ["honor_return", "conjure_draw"],
      p2: ["regret", "picky_eater"],
      p3: ["honor_return", "even_world"],
    },
    personas: {
      p0: PERSONAS[process.env.P0 ?? "folder"]!, p1: PERSONAS.stall!,
      p2: PERSONAS[process.env.P2 ?? "riichiRusher"]!, p3: PERSONAS[process.env.P3 ?? "folder"]!,
    },
    onRound: (st: GameState, phase: "start" | "end") => {
      if (phase !== "start") return;
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const check = (who: "p0" | "p1", want: string[] | null, label: string): number => {
        if (want === null) return 0;
        const ids = st.zones[handZone(who)]?.tileIds ?? [];
        const conj = ids.filter((id) => st.tiles[id]?.attrs.conjured === true).map((id) => kindKey(kindOf(st, id)));
        const pool = [...conj];
        const missing: string[] = [];
        for (const k of want) {
          const at = pool.indexOf(k);
          if (at < 0) missing.push(k);
          else pool.splice(at, 1);
        }
        if (missing.length === 0) return 1;
        push(`seed=${seed} ${rk} ${label} 배달 실패 — 기억=${want.join(" ")} / 배패의 conjured=${conj.join(" ") || "(없음)"} / 손패=${ids.map((i) => kindKey(kindOf(st, i))).join(" ")}`);
        return 0;
      };
      deliveredRegret += check("p0", t.pendingRegret, "regret");
      deliveredHonor += check("p1", t.pendingHonor, "honor_return");
      t.pendingRegret = null;
      t.pendingHonor = null;
      t.roundKey = rk;
    },
    onState: (st: GameState, out: Violation[]) => {
      extraChecks(st, out, memo);
      const rk2 = kindsOfKey(st.augmentData["regret:keep:p0"]);
      if (rk2 !== null) t.pendingRegret = rk2;
      const hk = kindsOfKey(st.augmentData["honor_return:keep:p1"]);
      if (hk !== null) t.pendingHonor = hk;
    },
  });
  rounds += r.rounds;
  if (r.crash !== undefined) push(`seed=${seed} CRASH ${r.crash.split("\n")[0]}`);
  for (const e of r.effectErrors) push(`seed=${seed} EFFERR ${e}`);
  for (const v of r.violations) push(`seed=${seed} ${v.kind} ${v.detail} @${v.round}`);
  process.stdout.write(`seed=${seed} rounds=${r.rounds} regret배달=${deliveredRegret} 귀환배달=${deliveredHonor} 문제=${problems.length}\n`);
}

console.log(`\n=== ${N} matches, ${rounds} rounds — regret 배달 ${deliveredRegret}, honor_return 배달 ${deliveredHonor}`);
if (problems.length === 0) console.log("문제 없음");
for (const p of problems.slice(0, 30)) console.log("  " + p);
void SEATS;
