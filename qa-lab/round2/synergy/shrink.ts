/** 카탈로그를 줄여 좌석 칸 폴백을 강제하고, 그때도 게임 내 중복 보유가 막히는지 본다 */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const keep = Number(process.argv[2] ?? 20);
const N = Number(process.argv[3] ?? 200);
const subset = contentAugments.slice(0, keep);
let dup = 0, offerOverlap = 0, pickThrow = 0, shortOffer = 0, games = 0;
const origWarn = console.warn; let warned = 0;
console.warn = () => { warned++; };
for (let i = 0; i < N; i++) {
  const seed = 3_300_000 + i;
  const game = createStandardGame({
    seed, playerIds: [...SEATS], mode: "hanchan", startScore: 25000,
    redFivesPerSuit: 1, extraAugments: subset,
  } as never);
  const rng = new Prng(seed * 11 + 1);
  const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
  for (const stage of hanchanConfigForMode("hanchan").draftSchedules!) {
    const shown = new Map<PlayerId, string[]>();
    for (const seat of SEATS) {
      const { choices, rerolls } = draft.rollWithRerolls(stage, seat as PlayerId);
      shown.set(seat as PlayerId, [...choices, ...rerolls].map((d) => d.id));
      if (choices.length < 3) shortOffer++;
    }
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const A = shown.get(SEATS[a]!)!.slice(0, 3), B = shown.get(SEATS[b]!)!.slice(0, 3);
      for (const id of A) if (B.includes(id)) offerOverlap++;
    }
    for (const seat of SEATS) {
      const pool = shown.get(seat as PlayerId)!;
      if (pool.length === 0) continue;
      try { draft.pick(stage, seat as PlayerId, pool[rng.int(pool.length)]!); }
      catch { pickThrow++; }
    }
  }
  games++;
  const owner = new Set<string>();
  let bad = false;
  for (const p of game.engine.state.players) for (const id of p.augments) {
    if (owner.has(id)) bad = true; else owner.add(id);
  }
  if (bad) dup++;
}
console.warn = origWarn;
console.log(`카탈로그 content=${keep}종(+표준4) · ${games}게임: DUP_GAME 게임수=${dup} · 오퍼겹침=${offerOverlap} · PICK_THROW=${pickThrow} · SHORT_OFFER=${shortOffer} · 폴백경고=${warned}`);
