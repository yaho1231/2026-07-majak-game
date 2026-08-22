/** 특정 조합이 실제 드래프트에서 한 손에 모일 확률 (봇/무작위 픽 · 시너지 탐욕 픽) */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode, synergyBias } from "@majak/core";
import type { AugmentDef, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const N = Number(process.argv[2] ?? 800);
const MODE = (process.argv[3] ?? "hanchan") as "hanchan" | "tonpuu";
const WATCH: string[][] = [
  ["let_it_ride", "jackpot"],
  ["let_it_ride", "jackpot", "blood_contract"],
  ["let_it_ride", "blood_contract"],
];
const hits = WATCH.map(() => ({ rand: 0, greedy: 0 }));
for (const pickMode of ["rand", "greedy"] as const) {
  for (let i = 0; i < N; i++) {
    const seed = 9_100_000 + i;
    const game = createStandardGame({
      seed, playerIds: [...SEATS], mode: MODE, startScore: 25000,
      redFivesPerSuit: 1, extraAugments: contentAugments,
    } as never);
    const rng = new Prng(seed * 13 + 5);
    const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
    for (const stage of hanchanConfigForMode(MODE).draftSchedules!) {
      for (const seat of SEATS) {
        const { choices, rerolls } = draft.rollWithRerolls(stage, seat as PlayerId);
        const pool: AugmentDef[] = [...choices, ...rerolls];
        if (pool.length === 0) continue;
        let d: AugmentDef;
        if (pickMode === "greedy") {
          const held = game.engine.state.players.find((p) => p.id === seat)?.augments ?? [];
          const b = synergyBias(held);
          d = [...pool].sort((x, y) => (b[y.id] ?? 1) - (b[x.id] ?? 1))[0]!;
        } else d = pool[rng.int(pool.length)]!;
        draft.pick(stage, seat as PlayerId, d.id);
      }
    }
    for (let w = 0; w < WATCH.length; w++) {
      const want = WATCH[w]!;
      if (game.engine.state.players.some((p) => want.every((id) => p.augments.includes(id)))) {
        hits[w]![pickMode]++;
      }
    }
  }
}
console.log(`${N} 게임 × 2 픽전략 (${MODE})`);
for (let w = 0; w < WATCH.length; w++) {
  console.log(`  ${WATCH[w]!.join(" + ")}: 무작위픽 ${hits[w]!.rand}/${N} (${(hits[w]!.rand/N*100).toFixed(1)}%) · 시너지탐욕픽 ${hits[w]!.greedy}/${N} (${(hits[w]!.greedy/N*100).toFixed(1)}%)`);
}
