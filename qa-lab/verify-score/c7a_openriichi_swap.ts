/**
 * 의심 7-① 재검증 — open_riichi_reveal의 "직격 역만"이 full_hand_swap / seat_swap으로
 * 대기를 갈아치운 뒤에도 성립하는가. (conflicts 목록에는 여전히 둘이 없다.)
 * 실제 open_riichi 액션을 선언한 뒤 두 교환을 시도한다.
 */
import { createStandardGameFromState, handZone, installAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { openRiichiReveal } from "../../packages/content/src/augments/open_riichi_reveal.js";
import { fullHandSwap } from "../../packages/content/src/augments/full_hand_swap.js";
import { seatSwap } from "../../packages/content/src/augments/seat_swap.js";
import { handSwap3 } from "../../packages/content/src/augments/hand_swap3.js";

console.log("conflicts(open_riichi_reveal) =", JSON.stringify(openRiichiReveal.conflicts));

const CASES: { name: string; def: AugmentDef; action: string; payload: unknown }[] = [
  { name: "full_hand_swap", def: fullHandSwap, action: "hand_swap", payload: { target: "p1" } },
  { name: "seat_swap", def: seatSwap, action: "seat_swap", payload: { target: "p1" } },
  { name: "hand_swap3", def: handSwap3, action: "swap3", payload: { target: "p1" } },
];

for (const c of CASES) {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const st: GameState = {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["open_riichi_reveal", c.name] } : p)),
    round: { ...base.round, turnCount: 0 },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });
  installAugment(game.engine, c.def, "p0", { yaku: game.yaku });
  const hand = game.engine.state.zones[handZone("p0")]!.tileIds;
  const rr = game.engine.submit({ player: "p0", type: "open_riichi", payload: { tileId: hand[hand.length - 1] } as never });
  const declared = game.engine.state.round.byPlayer["p0"]?.riichi != null;
  const before = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].join(",");
  const rs = game.engine.submit({ player: "p0", type: c.action, payload: c.payload as never });
  const after = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].join(",");
  console.log(
    `${c.name.padEnd(16)} open_riichi.ok=${rr.ok} riichi세팅=${declared} → ${c.action}.ok=${rs.ok} 손패바뀜=${after !== before}` +
    (rs.ok ? "" : `  reason=${String((rs as { reason?: unknown }).reason)}`),
  );
}

// ── 리치가 이미 걸린 뒤 자기 순(turn.act)으로 돌아온 장면에서 다시 시도한다
console.log("\n[리치 유지 상태의 자기 순]");
const RIICHI = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };
for (const c of CASES) {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const st: GameState = {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["open_riichi_reveal", c.name] } : p)),
    round: {
      ...base.round, turnCount: 1, riichiPot: 1000,
      byPlayer: { ...base.round.byPlayer, p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI } },
    },
    augmentData: { ...base.augmentData, [`open_riichi_reveal:declared:1-1-0:p0#round`]: true },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });
  installAugment(game.engine, c.def, "p0", { yaku: game.yaku });
  const before = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].join(",");
  const rs = game.engine.submit({ player: "p0", type: c.action, payload: c.payload as never });
  const after = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].join(",");
  console.log(`${c.name.padEnd(16)} ${c.action}.ok=${rs.ok} 손패바뀜=${after !== before}` + (rs.ok ? "" : `  reason=${String((rs as { reason?: unknown }).reason)}`));
}
