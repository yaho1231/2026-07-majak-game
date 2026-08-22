/**
 * docs/26 §실측 재현 — 2차 드래프트(eastThird) 제시 3장 중 시너지/역시너지 비율.
 * 사용: tsx qa-lab/round2/synergy/bias_measure.ts <seeds>
 */
import { createStandardGame, DraftController } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const N = Number(process.argv[2] ?? 400);
const STEALTH_PULL = ["ura_peek", "no_retreat", "late_double", "free_riichi_discard"];
const OPEN = ["open_riichi_reveal", "palm_flip", "all_or_nothing", "soul_strike", "riichi_seal", "riichi_upgrade", "off_by_one"];

function rate(hold: string | null, group: string[]): { pct: number; n: number } {
  let hit = 0, tot = 0;
  for (let i = 0; i < N; i++) {
    const seed = 7_700_000 + i;
    const game = createStandardGame({
      seed, playerIds: [...SEATS], mode: "hanchan", startScore: 25000,
      redFivesPerSuit: 1, extraAugments: contentAugments,
    } as never);
    if (hold !== null) {
      for (const seat of SEATS) game.engine.submit({ player: seat as PlayerId, type: "draftPick", payload: { augmentId: hold } });
    }
    const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
    for (const seat of SEATS) {
      const { choices } = draft.rollWithRerolls("eastThird", seat as PlayerId);
      for (const d of choices) { tot++; if (group.includes(d.id)) hit++; }
    }
  }
  return { pct: (hit / tot) * 100, n: tot };
}

const cases: [string, string | null, string[]][] = [
  ["기준선 → 스텔스풀", null, STEALTH_PULL],
  ["스텔스 보유 → 스텔스풀", "stealth_riichi", STEALTH_PULL],
  ["기준선 → 공개형", null, OPEN],
  ["스텔스 보유 → 공개형", "stealth_riichi", OPEN],
  ["기준선 → 리치축(late_double)", null, ["late_double"]],
  ["late_double 보유 → 리치축", "late_double", STEALTH_PULL.filter((x) => x !== "late_double")],
];
for (const [label, hold, group] of cases) {
  const r = rate(hold, group);
  console.log(`${label}: ${r.pct.toFixed(1)}%  (n=${r.n})`);
}
