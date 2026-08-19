/**
 * 공탁을 내지 않는 리치(스텔스 리치·물러설 수 없는 선언)를 들고 점수가 1000점 미만일 때,
 * 본인 뷰의 `riichiBlocked`가 "notEnoughPoints"라고 말하는가 — 실제로는 걸 수 있는데도.
 */
import {
  FlowController,
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { stealthRiichi } from "../../packages/content/src/augments/stealth_riichi.js";
import { noRetreat } from "../../packages/content/src/augments/no_retreat.js";

function scene(aug: string, score: number): GameState {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: [aug], score } : p,
    ),
  };
}

for (const [name, def, action] of [
  ["stealth_riichi", stealthRiichi, "stealth_riichi"],
  ["no_retreat", noRetreat, "no_retreat_riichi"],
] as [string, AugmentDef, string][]) {
  const game = createStandardGameFromState(scene(name, 500));
  installAugment(game.engine, def, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const opts =
    status.kind === "awaiting"
      ? (status.prompts.find((p) => p.player === "p0")?.options ?? [])
      : [];
  const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
  console.log(
    `${name.padEnd(16)} score=500 ${action}후보=${opts.filter((o) => o.type === action).length} ` +
      `표준riichi후보=${opts.filter((o) => o.type === "riichi").length} ` +
      `view.riichiBlocked=${String(view.round.byPlayer["p0"]?.riichiBlocked)}`,
  );
}
