/**
 * new_batch_sweep — 2026-07-18 신규 배치(19종)를 실게임 한 국에 강제로 얹어
 * 크래시가 없는지 훑는다. 각 증강을 p0에 설치하고 여러 시드로 한 국을 완주시킨다.
 * (봇 드라이버는 화료를 우선하고, 증강 액션이 뜨면 종류당 한 번 눌러 리듀서·인터셉터
 *  경로까지 실제로 태운다.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { hiddenBlade } from "../src/augments/hidden_blade.js";
import { uraPeek } from "../src/augments/ura_peek.js";
import { takeBack } from "../src/augments/take_back.js";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { alchemist } from "../src/augments/alchemist.js";
import { scapegoat } from "../src/augments/scapegoat.js";
import { bloodContract } from "../src/augments/blood_contract.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";
import { devilsAdvance } from "../src/augments/devils_advance.js";
import { letItRide } from "../src/augments/let_it_ride.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";
import { eternalDealer } from "../src/augments/eternal_dealer.js";
import { brokenBorder } from "../src/augments/broken_border.js";
import { pondSnatch } from "../src/augments/pond_snatch.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { spy } from "../src/augments/spy.js";
import { openRiichiReveal } from "../src/augments/open_riichi_reveal.js";

const NEW_AUGMENTS: AugmentDef[] = [
  hiddenBlade,
  uraPeek,
  takeBack,
  tileDyeing,
  alchemist,
  scapegoat,
  bloodContract,
  aotenjouCeiling,
  devilsAdvance,
  letItRide,
  allOrNothing,
  eternalDealer,
  brokenBorder,
  pondSnatch,
  graveRob,
  spy,
  openRiichiReveal,
];

const STD = new Set([
  "discard",
  "riichi",
  "pon",
  "chi",
  "minkan",
  "ankan",
  "shouminkan",
  "win",
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

/** 증강을 p0에 얹고 한 국을 완주시킨다. 예외가 나면 실패. */
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

describe("신규 배치 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
