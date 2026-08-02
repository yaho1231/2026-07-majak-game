/**
 * new_batch_0719_sweep — 2026-07-19 신규 배치(5종)를 실게임 한 국에 강제로 얹어
 * 크래시가 없는지 훑는다. new_batch_sweep.test.ts와 같은 드라이버.
 * (증강 액션 time_stop_use가 뜨면 눌러 추가 턴 리다이렉트 경로까지 태운다.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef } from "@majak/core";

import { invincible } from "../src/augments/invincible.js";
import { karma } from "../src/augments/karma.js";
import { timeStop } from "../src/augments/time_stop.js";

const NEW_AUGMENTS: AugmentDef[] = [invincible, karma, timeStop];

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

describe("신규 배치 0719 크래시 스위프 (실게임 한 국)", () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 100, 999];
  for (const aug of NEW_AUGMENTS) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});

describe("시간 정지 — 추가 턴이 실제로 발동한다", () => {
  it("선언하면 보유자가 연속으로 두 번 쯔모한다", () => {
    const game = createStandardGame({ seed: 5, extraAugments: [timeStop] });
    installAugment(game.engine, timeStop, "p0", { yaku: game.yaku });
    // 실게임에선 DraftController가 기록하는 보유 목록을 테스트에선 직접 넣어 준다
    // (installAugment는 규칙·훅만 걸고 player.augments엔 손대지 않음).
    game.engine.state.players
      .find((p) => p.id === "p0")!
      .augments.push("time_stop");
    const flow = new FlowController(game.engine);

    // p0 턴에서 시간정지 선언→버림 후, 곧바로 다시 p0에게 턴이 오는지(추가 턴) 본다.
    let status = flow.begin();
    let declared = false;
    let extraTurnSeen = false;
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 500) {
      const prompt = status.prompts[0]!;
      const isP0 = prompt.player === "p0";

      if (isP0 && !declared && prompt.options.some((o) => o.type === "time_stop_use")) {
        status = flow.submit("p0", { type: "time_stop_use", payload: {} });
        declared = true;
        continue;
      }
      if (isP0 && declared) {
        const discard = prompt.options.find((o) => o.type === "discard")!;
        status = flow.submit("p0", discard);
        if (status.kind === "awaiting" && status.prompts[0]!.player === "p0") {
          extraTurnSeen = true;
        }
        break;
      }
      // 그 외 좌석: 화료·후로는 피하고 첫 버림/패스로 조용히 진행 (p0 턴을 빨리 돌린다)
      const discard = prompt.options.find((o) => o.type === "discard");
      const pass = prompt.options.find((o) => o.type === "pass");
      status = flow.submit(prompt.player, discard ?? pass ?? prompt.options[0]!);
    }

    expect(declared).toBe(true);
    expect(extraTurnSeen).toBe(true);
  });

  // 2026-08-02(사용자 지시) 버프: 2국당 1회 → **매 국 1회**.
  // 소진 기록이 국(roundKey) 스코프라 국이 바뀌면 그대로 다시 충전된다.
  it("소진은 국 단위 — 같은 국에선 못 쓰고 다음 국엔 다시 열린다", () => {
    const game = createStandardGame({ seed: 5, extraAugments: [timeStop] });
    installAugment(game.engine, timeStop, "p0", { yaku: game.yaku });
    game.engine.state.players.find((p) => p.id === "p0")!.augments.push("time_stop");
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    expect(status.prompts[0]!.options.some((o) => o.type === "time_stop_use")).toBe(true);

    flow.submit("p0", { type: "time_stop_use", payload: {} });
    const s = game.engine.state;
    expect(s.augmentData["time_stop:used:1-1-0:p0"]).toBe(true);

    const def = game.engine.actions.get("time_stop_use");
    if (def === undefined) throw new Error("no time_stop_use action");
    // 이번 국엔 charge가 없다 (armed 플래그를 지워도 소진 기록이 막는다)
    const disarmed = {
      ...s,
      augmentData: { ...s.augmentData, "time_stop:armed:1-1-0:p0": false },
    };
    expect(
      def.validate(
        { player: "p0", type: "time_stop_use", payload: {} },
        { state: disarmed, rules: game.engine.rules },
      ),
    ).toBe("no charge this round");

    // 다음 국(동2국)에서는 소진 키가 달라져 다시 쓸 수 있다
    const nextRound = {
      ...disarmed,
      round: { ...disarmed.round, roundNumber: 2 },
    };
    expect(
      def.validate(
        { player: "p0", type: "time_stop_use", payload: {} },
        { state: nextRound, rules: game.engine.rules },
      ),
    ).toBeNull();
  });
});
