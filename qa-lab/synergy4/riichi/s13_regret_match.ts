/**
 * synergy4 / riichi — S13. regret × free_riichi_discard 를 **실전 반장전**에서 잡는다.
 * 유국이 난 국마다 (1) 스냅샷 텐파이 (2) 물리 손 텐파이 (3) regret이 보존한 13장을 찍는다.
 */
import { Prng, winHandKindsOf, handIdsOf, kindOf, meldCountOf, winningKinds, scoringOptionsOf, createStandardGameFromState } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { runMatch, PERSONAS, assignPreset } from "../../harness.js";

const target = ["regret", "free_riichi_discard"];
const personas = {
  p0: PERSONAS["riichiRusher"]!, p1: PERSONAS["chaos"]!,
  p2: PERSONAS["folder"]!, p3: PERSONAS["folder"]!,
} as Record<PlayerId, (typeof PERSONAS)[string]>;

function tenpaiOf(st: GameState, rules: never, who: PlayerId, kinds: readonly ReturnType<typeof kindOf>[]): boolean {
  return winningKinds(kinds as never, meldCountOf(st, who), undefined, scoringOptionsOf(st, rules as never, who)).length > 0;
}

let found = 0;
for (let seed = 1; seed <= 40 && found < 6; seed++) {
  const preset = assignPreset(new Prng(seed), "hanchan", target, 2);
  // eslint-disable-next-line no-await-in-loop
  await runMatch({
    seed, mode: "hanchan", preset, personas, timeoutMs: 60_000,
    onRound: (st, phase) => {
      const rules = (createStandardGameFromState(st) as unknown as { engine: { rules: never } }).engine.rules;
      if (phase === "end") {
        const snap = winHandKindsOf(st, rules as never, "p0");
        const phys = handIdsOf(st, "p0").map((id) => kindOf(st, id));
        const kept = st.augmentData["regret:keep:p0"] ?? st.augmentData[Object.keys(st.augmentData).find((k) => k.includes("regret") && k.includes("keep")) ?? ""];
        const s = tenpaiOf(st, rules as never, "p0", snap);
        const p = tenpaiOf(st, rules as never, "p0", phys.slice(0, 13));
        if (s !== p || kept !== undefined) {
          found++;
          console.log(`\nseed=${seed} ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`);
          console.log(`  스냅샷 텐파이=${s} / 물리 텐파이=${p}`);
          console.log(`  스냅샷: ${snap.map((k) => `${k.suit}${k.rank}`).join(" ")}`);
          console.log(`  물리  : ${phys.map((k) => `${k.suit}${k.rank}`).join(" ")}`);
          console.log(`  regret 보존: ${JSON.stringify(kept)?.slice(0, 300)}`);
        }
      }
    },
  });
}
console.log(`\n관측 ${found}건`);
