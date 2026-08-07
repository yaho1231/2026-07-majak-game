/**
 * 봇 측정 CLI
 *
 *   npm run arena -- --games 40 [--mode tonpuu] [--seats a,b,c,d] [--augments]
 *   npm run arena -- --games 200 --ab <스위치>    # 2:2 정책 대전 (강함 비교)
 *
 * 봇끼리 판을 돌려 방총률·화료율·평균 순위를 뽑는다. 봇을 고칠 때 이 숫자가
 * 어느 쪽으로 움직였는지 보고 판단한다 — 그게 없으면 튜닝이 계속 추론에 머문다.
 */

import { contentAugments } from "@majak/content";
import type { GameMode } from "@majak/core";
import { formatArena, runArena } from "./bot/arena.js";
import { parseFlags } from "./bot/flags.js";
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
  ...(arg("ab") !== undefined ? { ab: parseFlags(arg("ab")) } : {}),
  // --flags : 네 자리 전부에 스위치를 건다 (--ab와 달리 강함이 아니라 '판의 변화'를 본다)
  ...(arg("flags") !== undefined ? { flags: parseFlags(arg("flags")) } : {}),
  // --calls : 콜 기회가 어디서 걸렸는지 집계한다 (bot/callAudit.ts)
  ...(process.argv.includes("--calls") ? { auditCalls: true } : {}),
});

console.log(formatArena(result));
