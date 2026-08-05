/**
 * 봇 측정 CLI — `npm run arena -- --games 40 [--mode tonpuu] [--seats a,b,c,d] [--augments]`
 *
 * 봇끼리 판을 돌려 방총률·화료율·평균 순위를 뽑는다. 봇을 고칠 때 이 숫자가
 * 어느 쪽으로 움직였는지 보고 판단한다 — 그게 없으면 튜닝이 계속 추론에 머문다.
 */

import { contentAugments } from "@majak/content";
import type { GameMode } from "@majak/core";
import { formatArena, runArena } from "./bot/arena.js";
import type { ArchetypeName } from "./bot/profile.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const games = Number(arg("games") ?? 20);
const mode = (arg("mode") ?? "hanchan") as GameMode;
const seed = Number(arg("seed") ?? 0x5eed);
const seatsArg = arg("seats");
const seats = seatsArg?.split(",") as
  | [ArchetypeName, ArchetypeName, ArchetypeName, ArchetypeName]
  | undefined;

const result = await runArena({
  games,
  seed,
  mode,
  ...(seats !== undefined ? { seats } : {}),
  ...(process.argv.includes("--augments") ? { augments: contentAugments } : {}),
});

console.log(formatArena(result));
