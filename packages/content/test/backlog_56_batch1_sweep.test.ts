/**
 * backlog_56_batch1_sweep — 56차 백로그 배치 1(3종)을 실게임 한 국에 얹어 크래시가
 * 없는지 훑는다. 세 증강 모두 패시브 규칙형(setHolderRule)이라 액티브 액션은 없지만,
 * 분해·리치 판정 경로가 매 순 돌아가므로 완주 자체가 회귀 가드다.
 *   - mixed_triplet (동수의 결속) : scoring.mixedTriplets
 *   - royal_kokushi (왕의 징표)   : scoring.kokushiDupes
 *   - siege_riichi  (공성계)      : riichi.requiresTenpai=false (노텐 리치 허용)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { mixedTriplet } from "../src/augments/mixed_triplet.js";
import { royalKokushi } from "../src/augments/royal_kokushi.js";
import { siegeRiichi } from "../src/augments/siege_riichi.js";
import { polarEnds } from "../src/augments/polar_ends.js";
import { asyncChiitoi } from "../src/augments/async_chiitoi.js";
import { genesis } from "../src/augments/genesis.js";
import { unification } from "../src/augments/unification.js";
import { tableFlip } from "../src/augments/table_flip.js";
import { soulHunt } from "../src/augments/soul_hunt.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";

const NEW_AUGMENTS: AugmentDef[] = [
  mixedTriplet,
  royalKokushi,
  siegeRiichi,
  polarEnds,
  asyncChiitoi,
  genesis,
  unification,
  tableFlip,
  soulHunt,
  bluffPretense,
];

const STD = new Set([
  "discard",
  "riichi",
  "win",
  "pon",
  "chi",
  "minkan",
  "ankan",
  "shouminkan",
  "pass",
  "kyushuKyuhai",
]);

function decide(options: ActionOption[], usedAug: Set<string>): ActionOption {
  const win = options.find((o) => o.type === "win");
  if (win) return win;
  const aug = options.find((o) => !STD.has(o.type) && !usedAug.has(o.type));
  if (aug) {
    usedAug.add(aug.type);
    return aug;
  }
  const discard = options.find((o) => o.type === "discard");
  if (discard) return discard;
  const pass = options.find((o) => o.type === "pass");
  if (pass) return pass;
  return options[0]!;
}

function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const usedAug = new Set<string>();
  let status = flow.begin();
  let guard = 0;
  while (status.kind === "awaiting" && guard++ < 2000) {
    const prompt = status.prompts[0]!;
    status = flow.submit(prompt.player, decide(prompt.options, usedAug));
  }
  expect(status.kind).toBe("roundOver");
}

describe("56차 백로그 배치 1 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
