/**
 * 마작의 거신병(giant_god) detail:
 *   "되가져온 요구패는 **후리텐도 풀리므로** 그 전에 상대가 요구패를 버리면
 *    **론으로 먼저 끝낼 수도 있다.**"
 *
 * 리듀서(giant_god.ts:213-226)는 되가져온 종류를 버림 이력에서 **한 장씩만** 뺀다
 * (`history.indexOf(key)` → splice 1회). 발동 조건이 "요구패 13종을 내 손으로 전부
 * 버려 두기"라 12순 넘게 요구패를 흘리는 손인데, **같은 요구패를 두 번 버렸으면**
 * 그 한 장이 이력에 남는다. 국사 13면 대기는 그 한 종류만 이력에 있어도
 * **13면 전체가 후리텐**이 되어 론이 원리적으로 불가능해진다.
 *
 * 대조군(중복 없음) vs 실험군(1m 두 번 버림)을 같은 손으로 돌린다.
 */
import { createStandardGameFromState, installAugment, isFuriten, scoringOptionsOf } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { giantGod } from "../../../packages/content/src/augments/giant_god.js";

function run(label: string, discards: string): void {
  const base = craft({
    // 손패는 전부 수패(요구패 없음) 14장 — 내보내도 이력에 요구패가 안 들어간다
    hands: { p0: "234567m234567p22s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: discards, p1: "", p2: "", p3: "" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["giant_god"] } : p,
    ),
  };
  const game = createStandardGameFromState(s, undefined, []);
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });

  const before = game.engine.state.round.byPlayer["p0"]!.discardedKinds;
  const r = game.engine.submit({ player: "p0", type: "giant_god", payload: {} });

  // 발동 뒤 손패 14장 = 국사 13장 + 남은 쯔모패 1장. 그 1장을 버려 13면 대기를 세운다.
  const st1 = game.engine.state;
  const hand = st1.zones["hand:p0"]?.tileIds ?? [];
  const leftover = hand.find((id) => {
    const k = st1.tiles[id]!.kind;
    const num = k.suit === "man" || k.suit === "pin" || k.suit === "sou";
    return num && k.rank !== 1 && k.rank !== 9;
  }) as TileId;
  game.engine.submit({ player: "p0", type: "discard", payload: { tileId: leftover } });

  const st = game.engine.state;
  const fur = isFuriten(st, "p0", scoringOptionsOf(st, game.engine.rules, "p0"), game.engine.rules);
  console.log(`\n[${label}]  발동:${r.ok}`);
  console.log("  발동 전 내 버림 이력:", before.join(" "));
  console.log("  발동 후 내 버림 이력:", st.round.byPlayer["p0"]!.discardedKinds.join(" "));
  console.log("  손패 장수:", (st.zones["hand:p0"]?.tileIds ?? []).length);
  console.log("  → 후리텐:", fur, fur ? "← 13면 대기 전체가 막혔다 (론 불가)" : "(론 가능)");
}

// 대조군 — 요구패를 한 장씩만 버렸다
run("중복 없음", "19m19p19s1234z567z");
// 실험군 — 1m을 두 번 버렸다 (12순 넘게 요구패를 흘리는 손이면 흔한 일)
run("1m 두 번 버림", "119m19p19s1234z567z");
