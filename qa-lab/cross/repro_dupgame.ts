/** DUP_GAME 최소 재현 — 드래프트만 돌려 어느 스테이지에서 중복이 생기는지 찍는다. */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "./lib.js";

const seed = Number(process.argv[2] ?? 900050);
const mode = (process.argv[3] ?? "tonpuu") as "hanchan" | "tonpuu";

const game = createStandardGame({
  seed, playerIds: [...SEATS], mode, startScore: 25000, redFivesPerSuit: 1,
  extraAugments: contentAugments,
} as never);
const pickRng = new Prng(seed * 7 + (mode === "tonpuu" ? 1 : 0));
const stages = hanchanConfigForMode(mode).draftSchedules!;
const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });

for (const stage of stages) {
  console.log(`\n--- ${stage} ---`);
  const shown = new Map<PlayerId, string[]>();
  for (const seat of SEATS) {
    const { choices, rerolls } = draft.rollWithRerolls(stage, seat);
    shown.set(seat, [...choices, ...rerolls].map((d) => d.id));
    console.log(`  offer ${seat}: [${choices.map((d) => d.id).join(", ")}] + reroll [${rerolls.map((d) => d.id).join(", ")}]`);
  }
  for (const seat of SEATS) {
    const pool = shown.get(seat)!;
    const chosen = pool[pickRng.int(pool.length)]!;
    draft.pick(stage, seat, chosen);
    console.log(`  pick  ${seat}: ${chosen}`);
  }
  console.log("  held:", JSON.stringify(Object.fromEntries(game.engine.state.players.map((p) => [p.id, p.augments]))));
}
