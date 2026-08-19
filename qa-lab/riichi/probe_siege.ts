/**
 * 공성계(siege_riichi, riichi.requiresTenpai=false)가 커스텀 리치 3종에 실제로 닿는가.
 *
 * 각 커스텀 리치 액션의 validate는 규칙에서 텐파이 요구를 읽는다(주석이 그렇게 약속한다).
 * 그러나 후보를 만드는 holderTurnOptions는 tenpaiAfterDiscard로 하드 필터링한다 —
 * 그러면 노텐 상태에서는 버튼이 아예 뜨지 않아 능력이 사라진다.
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { siegeRiichi } from "../../packages/content/src/augments/siege_riichi.js";
import { stealthRiichi } from "../../packages/content/src/augments/stealth_riichi.js";
import { noRetreat } from "../../packages/content/src/augments/no_retreat.js";
import { openRiichiReveal } from "../../packages/content/src/augments/open_riichi_reveal.js";
import { allOrNothing } from "../../packages/content/src/augments/all_or_nothing.js";
import { soulStrike } from "../../packages/content/src/augments/soul_strike.js";

/** 완전 노텐 14장 (1m4m7m 1p4p7p 1s4s7s 東南西北白) */
const NOTEN = "147m147p147s1234z5z";

function scene(augs: string[]): GameState {
  const base = craft({
    hands: { p0: NOTEN, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: [...augs] } : p,
    ),
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
  const st = scene(["siege_riichi", c.name]);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, siegeRiichi, "p0", { yaku: game.yaku });
  installAugment(game.engine, c.def, "p0" as PlayerId, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  const opts = prompt?.options ?? [];
  const mine = opts.filter((o) => o.type === c.action);
  const std = opts.filter((o) => o.type === "riichi");
  // validate가 직접 받아 주는가 (버튼이 없어도 규칙상 합법인가)
  const def = game.engine.actions.get(c.action);
  const hand = game.engine.state.zones["hand:p0"]!.tileIds;
  const tileId = hand[0] as TileId;
  const verdict = def?.validate(
    { player: "p0", type: c.action, payload: { tileId } },
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
  console.log(
    `${c.name.padEnd(20)} 노텐: 표준riichi후보=${std.length} ${c.action}후보=${mine.length} validate=${String(verdict)}`,
  );
}
