/**
 * backlog_5th_batch2_sweep — 5차 §2b 배치 2(정보형 3종·파혼)를 실게임 한 국에 얹어
 * 크래시가 없는지 훑는다. 전부 액티브(자동 발동)라 발동 경로까지 완주로 검증된다.
 * (ankan_dora 개편은 new_52_b의 시드 스위프가 이미 커버한다.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { tenpaiScan } from "../src/augments/tenpai_scan.js";
import { dangerSense } from "../src/augments/danger_sense.js";
import { triplePeek } from "../src/augments/triple_peek.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";
import { windLineage } from "../src/augments/wind_lineage.js";
import { silentPact } from "../src/augments/silent_pact.js";
import { regret } from "../src/augments/regret.js";
import { disarm } from "../src/augments/disarm.js";
import { pushRiichi } from "../src/augments/push_riichi.js";
import { reload } from "../src/augments/reload.js";
import { honorReturn } from "../src/augments/honor_return.js";
import { tileSplit } from "../src/augments/tile_split.js";
import { frameUp } from "../src/augments/frame_up.js";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";
import { snakeKan } from "../src/augments/snake_kan.js";
import { palmFlip } from "../src/augments/palm_flip.js";
import { northTrader } from "../src/augments/north_trader.js";
import { hourglass } from "../src/augments/hourglass.js";

const NEW_AUGMENTS: AugmentDef[] = [
  tenpaiScan,
  dangerSense,
  triplePeek,
  meldDissolve,
  windLineage,
  silentPact,
  regret,
  disarm,
  pushRiichi,
  reload,
  honorReturn,
  tileSplit,
  frameUp,
  threeDragonsWill,
  snakeKan,
  palmFlip,
  northTrader,
  hourglass,
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

describe("5차 §2b 배치 2 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
