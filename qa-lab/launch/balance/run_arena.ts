import { contentAugments } from "@majak/content";
import { runArena } from "../../../packages/server/src/bot/arena.js";
import { writeFileSync } from "node:fs";

const games = Number(process.argv[2] ?? 500);
const seed = Number(process.argv[3] ?? 0x5eed);
const out = process.argv[4] ?? `qa-lab/launch/balance/arena_${games}_${seed}.json`;

const started = Date.now();
const result = await runArena({
  games,
  seed,
  mode: "hanchan",
  augments: contentAugments,
});
writeFileSync(out, JSON.stringify(result, null, 2));
console.error(`done: ${games} games, seed ${seed}, elapsed ${(Date.now() - started) / 1000}s -> ${out}`);
