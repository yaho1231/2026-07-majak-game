/**
 * batch_0804_sweep — 6차 사용자 발안 8종을 실게임 한 국에 얹어 크래시·소프트락이
 * 없는지 훑는다.
 *
 * 특히 **폭주 리치**는 TURN_PASSED를 가로채 순서를 자기에게 고정하므로, 놓아 주는
 * 조건이 어긋나면 그 국이 영원히 안 끝난다 — 완주 자체가 계약이다.
 * **화수분**은 install에서 다른 증강을 지급하므로 카탈로그를 넘겨 지급 경로까지 태운다.
 */

import { describe, expect, it } from "vitest";
import { FlowController, createStandardGame, installAugment } from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { contentAugments } from "../src/index.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { cornucopia } from "../src/augments/cornucopia.js";
import { timePressure } from "../src/augments/time_pressure.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { doraAfterimage } from "../src/augments/dora_afterimage.js";
import { signFlip } from "../src/augments/sign_flip.js";
import { runawayRiichi } from "../src/augments/runaway_riichi.js";
import { pickyEater } from "../src/augments/picky_eater.js";

const NEW_AUGMENTS: AugmentDef[] = [
  mirrorDora,
  cornucopia,
  timePressure,
  blindRon,
  doraAfterimage,
  signFlip,
  runawayRiichi,
  pickyEater,
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

/** 증강 액션이 보이면 한 번씩 눌러 본다 — 발동 경로까지 완주로 검증하기 위함 */
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
  // 화수분이 지급할 대상이 있어야 하므로 카탈로그 전체를 실어 준다
  const game = createStandardGame({ seed, extraAugments: contentAugments });
  game.engine.submit({ player: "p0", type: "draftPick", payload: { augmentId: aug.id } });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku, catalog: game.augments });
  const flow = new FlowController(game.engine);
  const usedAug = new Set<string>();
  let status = flow.begin();
  let guard = 0;
  while (status.kind === "awaiting" && guard++ < 2000) {
    const prompt = status.prompts[0]!;
    status = flow.submit(prompt.player, decide(prompt.options, usedAug));
  }
  // guard에 걸려 나왔다면 소프트락이다 (폭주 리치의 턴 고정이 안 풀린 경우)
  expect(status.kind).toBe("roundOver");
}

describe("6차 신규 8종 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
