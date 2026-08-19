/**
 * sign_flip이 **어느 국**에 켜지는가 — "뽑는 순간 ... 이번 국 동안" 이 맞는지.
 * 실행: tsx qa-lab/score-b/repro_signflip_round.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "./run.js";

const preset = {
  p0: ["mirror_dora", "north_trader"],
  p1: ["blame_shift", "dora_afterimage"],
  p2: ["unification", "sign_flip", "karma"],
  p3: ["ankan_dora", "soul_hunt", "honba_hunter"],
} as Record<PlayerId, string[]>;

const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

const r = await runMatch({
  seed: 252,
  mode: "tonpuu",
  preset,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.chaos!, p2: PERSONAS.folder!, p3: PERSONAS.caller! },
  onRound: (st, phase) => {
    const total = st.players.reduce((n, p) => n + p.score, 0) + st.round.riichiPot;
    console.log(
      `[${phase}] round=${rk(st)} total=${total} ` +
      `armedRound(sign_flip:p2)=${String(st.augmentData["sign_flip:armedRound:p2"])} ` +
      `spent=${String(st.augmentData["view:*:spent:sign_flip:p2"])}`,
    );
  },
  onSettle: (st, p) => {
    const sum = Object.values(p.deltas).reduce((a, b) => a + b, 0);
    console.log(`   settle outcome=${p.outcome} Σ=${sum} deltas=${JSON.stringify(p.deltas)} aug=${JSON.stringify(p.augPoints ?? [])}`);
  },
});
console.log("violations:", JSON.stringify(r.violations, null, 1));
console.log("crash:", r.crash ?? "-");
