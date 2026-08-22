import { Prng, createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";
const keep = Number(process.argv[2] ?? 56);
const N = Number(process.argv[3] ?? 100);
const subset = contentAugments.slice(0, keep);
console.log("cornucopia 포함?", subset.some((d) => d.id === "cornucopia"));
for (let i = 0; i < N; i++) {
  const seed = 3_300_000 + i;
  const game = createStandardGame({ seed, playerIds: [...SEATS], mode: "hanchan", startScore: 25000, redFivesPerSuit: 1, extraAugments: subset } as never);
  const rng = new Prng(seed * 11 + 1);
  const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
  const log: string[] = [];
  for (const stage of hanchanConfigForMode("hanchan").draftSchedules!) {
    const shown = new Map<PlayerId, string[]>();
    for (const seat of SEATS) {
      const { choices, rerolls } = draft.rollWithRerolls(stage, seat as PlayerId);
      shown.set(seat as PlayerId, [...choices, ...rerolls].map((d) => d.id));
    }
    for (const seat of SEATS) {
      const pool = shown.get(seat as PlayerId)!;
      if (pool.length === 0) continue;
      const pick = pool[rng.int(pool.length)]!;
      log.push(`${stage} ${seat} offer6=[${pool.join(",")}] pick=${pick}`);
      try { draft.pick(stage, seat as PlayerId, pick); } catch (e) { log.push(`  THROW ${String(e).slice(0,80)}`); }
      log.push(`   held: ${game.engine.state.players.map((p)=>`${p.id}:[${p.augments.join(",")}]`).join(" ")}`);
    }
  }
  const owner = new Map<string, string>(); const dups: string[] = [];
  for (const p of game.engine.state.players) for (const id of p.augments) {
    const prev = owner.get(id); if (prev !== undefined) dups.push(`${id}: ${prev}+${p.id}`); else owner.set(id, p.id);
  }
  if (dups.length > 0) { console.log(`seed=${seed} DUP ${dups.join(" ")}`); console.log(log.join("\n")); break; }
}
