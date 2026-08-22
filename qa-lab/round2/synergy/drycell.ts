/**
 * 좌석 칸을 **말리는** 픽 전략으로 칸 보충 경로를 노린다 (conflicts 가 많은 카드를 골라
 * 뒤 스테이지의 제외 목록을 최대로 키운다). 전체 카탈로그에서 좌석 간 오퍼 겹침·중복 보유가 나는가.
 */
import { createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { AugmentDef, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const N = Number(process.argv[2] ?? 500);
const MODE = (process.argv[3] ?? "hanchan") as "hanchan" | "tonpuu";
let overlap6 = 0, overlap3 = 0, dup = 0, fallback = 0, shortOffer = 0;
const ex: string[] = [];
const ow = console.warn; console.warn = () => { fallback++; };
for (let i = 0; i < N; i++) {
  const seed = 6_600_000 + i;
  const game = createStandardGame({
    seed, playerIds: [...SEATS], mode: MODE, startScore: 25000, redFivesPerSuit: 1,
    extraAugments: contentAugments,
  } as never);
  const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
  for (const stage of hanchanConfigForMode(MODE).draftSchedules!) {
    const shown = new Map<PlayerId, AugmentDef[]>();
    for (const seat of SEATS) {
      const { choices, rerolls } = draft.rollWithRerolls(stage, seat as PlayerId);
      shown.set(seat as PlayerId, [...choices, ...rerolls]);
      if (choices.length < 3) shortOffer++;
    }
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const A = shown.get(SEATS[a]!)!.map((d) => d.id), B = shown.get(SEATS[b]!)!.map((d) => d.id);
      for (const id of A) if (B.includes(id)) {
        overlap6++;
        if (A.slice(0, 3).includes(id) && B.slice(0, 3).includes(id)) overlap3++;
        if (ex.length < 5) ex.push(`${MODE} seed=${seed} ${stage} ${SEATS[a]}×${SEATS[b]} ${id}`);
      }
    }
    for (const seat of SEATS) {
      const pool = shown.get(seat as PlayerId)!;
      if (pool.length === 0) continue;
      // conflicts 가 가장 많은 것을 고른다 = 다음 스테이지 제외 목록을 최대로
      const d = [...pool].sort((x, y) => (y.conflicts?.length ?? 0) - (x.conflicts?.length ?? 0))[0]!;
      try { draft.pick(stage, seat as PlayerId, d.id); } catch { /* */ }
    }
  }
  const owner = new Map<string, string>();
  for (const p of game.engine.state.players) for (const id of p.augments) {
    const prev = owner.get(id);
    if (prev !== undefined) { dup++; if (ex.length < 10) ex.push(`DUP ${MODE} seed=${seed} ${id} ${prev}+${p.id}`); }
    else owner.set(id, p.id);
  }
}
console.warn = ow;
console.log(`${N} 게임 (${MODE}, conflicts-탐욕 픽): 오퍼겹침6=${overlap6} 겹침3=${overlap3} DUP=${dup} 폴백경고=${fallback} SHORT=${shortOffer}`);
for (const e of ex) console.log("  ", e);
