/**
 * 리치로 잠긴 손이 **보유자 자신의 손패 조작 증강**으로 통째로 풀린다.
 *
 * `riichi_hand_manip_immunity.test.ts`는 "리치를 선언한 **상대**는 대상이 되지 않는다"만
 * 지킨다. 세 증강의 validate도 `riichiBlocksSwap(..., target)` 하나뿐이라 **쓰는 사람**이
 * 리치 중인지는 아무도 보지 않는다.
 */
import {
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { fullHandSwap } from "../../packages/content/src/augments/full_hand_swap.js";
import { handSwap3 } from "../../packages/content/src/augments/hand_swap3.js";
import { seatSwap } from "../../packages/content/src/augments/seat_swap.js";

const RIICHI = { double: true, ippatsu: true, discardIndex: 0, cost: 1000 };

function scene(aug: string): GameState {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: [aug] } : p,
    ),
    round: {
      ...base.round,
      turnCount: 1,
      riichiPot: 1000,
      byPlayer: {
        ...base.round.byPlayer,
        p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

const CASES: { name: string; def: AugmentDef; action: string; payload: unknown }[] = [
  { name: "full_hand_swap", def: fullHandSwap, action: "hand_swap", payload: { target: "p1" } },
  { name: "hand_swap3", def: handSwap3, action: "swap3", payload: { target: "p1" } },
  { name: "seat_swap", def: seatSwap, action: "seat_swap", payload: { target: "p1" } },
];

for (const c of CASES) {
  const st = scene(c.name);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, c.def, "p0", { yaku: game.yaku });
  const before = [...game.engine.state.zones[handZone("p0")]!.tileIds].join(",");
  const r = game.engine.submit({ player: "p0", type: c.action, payload: c.payload as never });
  const after = game.engine.state;
  const hand = [...(after.zones[handZone("p0")]?.tileIds ?? [])].join(",");
  console.log(
    `${c.name.padEnd(16)} submit.ok=${r.ok}${r.ok ? "" : ` (${String((r as { error?: unknown }).error)})`} ` +
      `손패바뀜=${hand !== before} 리치유지=${after.round.byPlayer["p0"]?.riichi != null} 공탁=${after.round.riichiPot}`,
  );
}
