/**
 * hand-a 페어 스윕 — 같은 사람이 손패 증강 2개를 동시에 들었을 때.
 * 66쌍 × seeds. 네 좌석 모두 같은 쌍을 들어 상호 덮어쓰기까지 본다.
 *
 * 사용: tsx qa-lab/hand-a/sweep_pairs.ts <mode> <seeds> [startIdx endIdx]
 */
import { PersonaAgent, PERSONAS, SEATS } from "../harness.js";
import { runMatch2 } from "./run.js";
import { handChecks, newCtx } from "./checks.js";
import { handZone, isNumberSuit, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";

const MINE = [
  "red_five_touch", "take_back", "tile_dyeing", "suit_unify", "hand_swap3",
  "full_hand_swap", "future_sight", "bottom_deal", "alchemist", "pond_snatch",
  "grave_rob", "silent_swap",
];

const mode = (process.argv[2] ?? "tonpuu") as "hanchan" | "tonpuu";
const nSeeds = Number(process.argv[3] ?? 1);
const from = Number(process.argv[4] ?? 0);
const to = Number(process.argv[5] ?? 999);

const pairs: [string, string][] = [];
for (let i = 0; i < MINE.length; i++)
  for (let j = i + 1; j < MINE.length; j++) pairs.push([MINE[i]!, MINE[j]!]);

let games = 0, rounds = 0;
const problems: string[] = [];

for (const [a, b] of pairs.slice(from, to)) {
  for (let s = 0; s < nSeeds; s++) {
    const seed = 7000 + s * 53;
    const preset = { p0: [a, b], p1: [a, b], p2: [a, b], p3: [a, b] } as Record<PlayerId, readonly string[]>;
    const personas = { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.caller! };
    const agents = SEATS.map((id, i) => new PersonaAgent(id, personas[id]!, seed * 131 + i * 7 + 1));
    const ctx = newCtx();
    /** red_five_touch 각인 누락 (증강으로 손에 들어온 패는 각인되지 않는다) */
    const redMiss: string[] = [];
    const r = await runMatch2({
      seed, mode, preset, agents,
      onState: (st: GameState, out) => {
        handChecks(st, out, ctx);
        if (a !== "red_five_touch" && b !== "red_five_touch") return;
        for (const seat of st.config.playerIds) {
          const rank = st.augmentData[`red_five_touch:rank:${seat}`];
          if (typeof rank !== "number") continue;
          for (const id of st.zones[handZone(seat)]?.tileIds ?? []) {
            const t = st.tiles[id];
            if (t === undefined || !isNumberSuit(t.kind) || t.kind.rank !== rank) continue;
            const at = t.attrs as { red?: boolean } | undefined;
            if (at?.red !== true) {
              redMiss.push(`${seat} rank=${rank} tile=${id}(${kindKey(t.kind)}) phase=${st.round.phase} drawn=${String(st.round.lastDrawnTile)}`);
            }
          }
        }
      },
      timeoutMs: 240_000,
    });
    games++; rounds += r.rounds;
    const kinds = [...new Set(r.violations.map((v) => v.kind))];
    const bad = r.crash !== undefined || r.effectErrors.length > 0 || r.violations.length > 0 || redMiss.length > 0;
    const line = `${a}+${b} seed=${seed} rounds=${r.rounds} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} viol=${r.violations.length}[${kinds.join(",")}] redMiss=${redMiss.length}`;
    if (bad) {
      problems.push(line);
      console.log("!! " + line);
      for (const v of r.violations.slice(0, 3)) console.log("   ", JSON.stringify(v));
      for (const e of r.effectErrors.slice(0, 3)) console.log("   eff:", e);
      for (const m of redMiss.slice(0, 2)) console.log("   redMiss:", m);
    } else console.log("ok " + line);
  }
}
console.log(`\n=== pairs games=${games} rounds=${rounds} problems=${problems.length}`);
for (const l of problems) console.log(" ", l);
