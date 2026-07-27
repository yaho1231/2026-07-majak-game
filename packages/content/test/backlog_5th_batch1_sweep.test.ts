/**
 * backlog_5th_batch1_sweep — 5차 §2b 배치 1(9종)을 실게임 한 국에 얹어 크래시가 없는지 훑는다.
 * 액티브형(brief_fog·call_seal·even_world·giant_god)은 자동 발동되고, 패시브형
 * (blame_shift·no_ron_pact·always_tenpai·dora_conceal·late_double)은 규칙·인터셉터 경로가
 * 매 순 돌아가므로 완주 자체가 회귀 가드다. (giant_god은 랜덤 국에서 발동 조건이 거의 안 서지만
 * 규칙·후보 생성 경로 크래시 가드로 함께 훑는다.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { blameShift } from "../src/augments/blame_shift.js";
import { noRonPact } from "../src/augments/no_ron_pact.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { lateDouble } from "../src/augments/late_double.js";
import { callSeal } from "../src/augments/call_seal.js";
import { evenWorld } from "../src/augments/even_world.js";
import { briefFog } from "../src/augments/brief_fog.js";
import { giantGod } from "../src/augments/giant_god.js";
import { conjureDraw } from "../src/augments/conjure_draw.js";
import { bottomYaku } from "../src/augments/bottom_yaku.js";

const NEW_AUGMENTS: AugmentDef[] = [
  blameShift,
  noRonPact,
  alwaysTenpai,
  doraConceal,
  lateDouble,
  callSeal,
  evenWorld,
  briefFog,
  giantGod,
  conjureDraw,
  bottomYaku,
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

describe("5차 §2b 배치 1 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
