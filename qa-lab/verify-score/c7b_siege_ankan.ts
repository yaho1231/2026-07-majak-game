/**
 * 의심 7-② 재검증 — 노텐 리치(공성계) 중 안깡이 **무제한** 허용되는가.
 * isRiichiSafeAnkan(packages/core/src/mahjong/flow/standardActions.ts:84-107)은
 * "깡 전후의 대기 집합이 같으면 허용" — 노텐이면 before = after = ∅ 라 항상 통과한다.
 */
import { createStandardGameFromState, handZone, installAugment, kindKey } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { siegeRiichi } from "../../packages/content/src/augments/siege_riichi.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };

function build(hand: string): ReturnType<typeof createStandardGameFromState> {
  const base = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const st: GameState = {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["siege_riichi"] } : p)),
    round: { ...base.round, turnCount: 1, riichiPot: 1000, byPlayer: { ...base.round.byPlayer, p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI } } },
  };
  const g = createStandardGameFromState(st);
  installAugment(g.engine, siegeRiichi, "p0", { yaku: g.yaku });
  return g;
}

function quadsOf(s: GameState): Map<string, TileId[]> {
  const by = new Map<string, TileId[]>();
  for (const t of s.zones[handZone("p0")]!.tileIds) {
    const k = kindKey(s.tiles[t]!.kind);
    by.set(k, [...(by.get(k) ?? []), t]);
  }
  return new Map([...by].filter(([, v]) => v.length === 4));
}

function attempt(label: string, hand: string): void {
  let g = build(hand);
  const quads = quadsOf(g.engine.state);
  if (quads.size === 0) { console.log(`${label}: 4장 짝 없음`); return; }
  const results: string[] = [];
  for (const [k, ids] of quads) {
    // 쯔모패를 그 4장 중 하나로 고정 (isRiichiSafeAnkan은 lastDrawnTile 포함을 요구)
    const s2: GameState = { ...g.engine.state, round: { ...g.engine.state.round, lastDrawnTile: ids[0]! } };
    const g2 = createStandardGameFromState(s2);
    installAugment(g2.engine, siegeRiichi, "p0", { yaku: g2.yaku });
    const dora0 = g2.engine.state.round.doraIndicators.length;
    const r = g2.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } as never });
    results.push(`${k}:${r.ok ? `허용(도라표시 ${dora0}→${g2.engine.state.round.doraIndicators.length})` : `거부(${String((r as { reason?: unknown }).reason)})`}`);
    if (r.ok) g = g2;
  }
  console.log(`${label}\n   ${results.join("  ")}`);
}

console.log("A. 노텐 리치(공성계) — 손패에 4장 짝 셋, 대기는 ∅");
attempt("   ", "1111z 2222z 3333z 5m");

console.log("\nB. 대조군: 텐파이 리치(구련보등형) — 같은 규칙이 안깡을 거부하는가");
attempt("   ", "11112345678999m");
