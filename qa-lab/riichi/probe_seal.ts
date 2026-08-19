/**
 * 리치 봉인(riichi_seal)이 커스텀 리치 5종을 막는가.
 * p0 = 봉인 보유자이자 그 국의 첫 리치. p1 = 텐파이 + 커스텀 리치 증강.
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { riichiSeal } from "../../packages/content/src/augments/riichi_seal.js";
import { stealthRiichi } from "../../packages/content/src/augments/stealth_riichi.js";
import { noRetreat } from "../../packages/content/src/augments/no_retreat.js";
import { openRiichiReveal } from "../../packages/content/src/augments/open_riichi_reveal.js";
import { allOrNothing } from "../../packages/content/src/augments/all_or_nothing.js";
import { soulStrike } from "../../packages/content/src/augments/soul_strike.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };
const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

function scene(aug: string): GameState {
  const base = craft({
    // p1: 234m345p345s678s55s (5s 버리면 텐파이 유지)
    hands: { p0: "*", p1: "234m345p345s678s55s", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0"
        ? { ...p, augments: ["riichi_seal"] }
        : p.id === "p1"
          ? { ...p, augments: [aug] }
          : p,
    ),
    // p0가 이미 첫 리치를 걸어 봉인이 서 있는 상태
    augmentData: { ...base.augmentData, [`riichi_seal:sealed:${rk(base)}:p0`]: true },
    round: {
      ...base.round,
      riichiPot: 1000,
      byPlayer: {
        ...base.round.byPlayer,
        p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

const CASES: { name: string; def: AugmentDef; action: string }[] = [
  { name: "stealth_riichi", def: stealthRiichi, action: "stealth_riichi" },
  { name: "no_retreat", def: noRetreat, action: "no_retreat_riichi" },
  { name: "open_riichi_reveal", def: openRiichiReveal, action: "open_riichi" },
  { name: "all_or_nothing", def: allOrNothing, action: "all_in_riichi" },
  { name: "soul_strike", def: soulStrike, action: "soul_strike" },
];

for (const c of CASES) {
  const st = scene(c.name);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });
  installAugment(game.engine, c.def, "p1", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const opts = status.prompts.find((p) => p.player === "p1")?.options ?? [];
  const mine = opts.filter((o) => o.type === c.action);
  const std = opts.filter((o) => o.type === "riichi");
  // 실제 제출까지 해 본다
  const hand = game.engine.state.zones["hand:p1"]!.tileIds;
  const r = game.engine.submit({
    player: "p1",
    type: c.action,
    payload: { tileId: hand[0] as TileId },
  });
  const nowRiichi = game.engine.state.round.byPlayer["p1"]?.riichi != null;
  console.log(
    `${c.name.padEnd(20)} 표준riichi후보=${std.length} ${c.action}후보=${mine.length} submit.ok=${r.ok} p1리치성립=${nowRiichi}`,
  );
}
