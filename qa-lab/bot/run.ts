/**
 * 계측 아레나 러너.
 *   tsx qa-lab/bot/run.ts <games> <seed> [mode] [outjson]
 */
import { runArena } from "../../packages/server/src/bot/arena.js";
import { contentAugments } from "@majak/content";
import { newMetrics, patchBot, wrapCatalog } from "./instrument.js";
import { writeFileSync } from "node:fs";

const games = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "tonpuu") as "tonpuu" | "hanchan";
const out = process.argv[5];

const m = newMetrics();
const restore = patchBot(m);
const catalog = wrapCatalog(m, contentAugments);

let crash: string | null = null;
let res: any = null;
try {
  res = await runArena({ games, seed, mode, augments: catalog });
} catch (err: any) {
  crash = String(err?.stack ?? err);
}
restore();

const augRows = [...m.aug].map(([id, c]) => ({ id, ...c, lostTo: [...c.lostTo] }));
const picked = new Map((res?.augmentStats ?? []).map((r: any) => [r.id, r]));
const payload = {
  games,
  seed,
  mode,
  crash,
  rounds: res?.rounds ?? 0,
  decisions: m.decisions,
  drafts: m.drafts,
  decideNowThrows: m.decideNowThrows,
  contentFailures: [...m.contentFailures],
  unofferedWarns: [...m.unofferedWarns],
  conflictViolations: m.conflictViolations,
  modeViolations: m.modeViolations,
  actionToAug: [...m.actionToAug],
  augActions: [...m.augActions].map(([k, v]) => [k, [...v]]),
  draftPicks: [...m.draftPicks],
  augStats: augRows.map((r) => ({
    ...r,
    heldGames: (picked.get(r.id) as any)?.games ?? 0,
    offered: (picked.get(r.id) as any)?.offered ?? 0,
    picks: (picked.get(r.id) as any)?.picked ?? 0,
  })),
  arenaAug: res?.augmentStats ?? [],
};

if (out !== undefined) writeFileSync(out, JSON.stringify(payload, null, 1));
console.log(
  JSON.stringify(
    {
      games,
      seed,
      mode,
      crash: crash === null ? null : crash.slice(0, 500),
      rounds: payload.rounds,
      decisions: m.decisions,
      throws: m.decideNowThrows.length,
      contentFailures: payload.contentFailures.length,
      unoffered: payload.unofferedWarns.length,
      conflicts: m.conflictViolations.length,
      modeViol: m.modeViolations.length,
      elapsedMs: res?.elapsedMs,
    },
    null,
    1,
  ),
);
