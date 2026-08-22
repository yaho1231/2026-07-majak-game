/**
 * 카운터(counter) + 배수의 진(last_stand):
 * 추격 리치로 반격을 터뜨린 **직후 리치를 취소**해도, 대납 1,000점·일발 소멸·
 * 반격 플래그가 전부 그대로 남는다. 리치봉은 last_stand가 공탁에서 되돌려 주므로
 * 보유자는 순 +1,000점을 벌고 리치는 걸지 않은 상태가 된다.
 */
import { contentAugments } from "@majak/content";
import { createStandardGameFromState, installAugment, handIdsOf, kindOf, kindKey } from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const defs: AugmentDef[] = [A.get("counter")!, A.get("last_stand")!];

const base = craft({
  hands: {
    // 완성형 14장 — 아무 west 한 장을 버리면 서 단기 텐파이
    p0: "234m567m234p234s11z",
    p1: "*", p2: "*", p3: "*",
  },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});

const state: GameState = {
  ...base,
  players: base.players.map((p) => ({
    ...p,
    augments: p.id === "p0" ? ["counter", "last_stand"] : [],
  })),
  round: {
    ...base.round,
    // p1은 이미 리치를 걸어 둔 상태 (일발 살아 있음)
    byPlayer: {
      ...base.round.byPlayer,
      p1: { ...base.round.byPlayer["p1"]!, riichi: { turn: 1, ippatsu: true, double: false } },
    },
    riichiPot: 1000, // p1이 낸 봉
  },
  augmentData: { ...base.augmentData, "counter:prev:p0": "p1" },
};

const game = createStandardGameFromState(state, undefined, defs);
for (const d of defs) installAugment(game.engine, d, "p0" as PlayerId, { yaku: game.yaku });

const snap = (label: string) => {
  const st = game.engine.state;
  const sc = Object.fromEntries(st.players.map((p) => [p.id, p.score]));
  console.log(`${label}
  점수=${JSON.stringify(sc)}  공탁=${st.round.riichiPot}
  p0.riichi=${JSON.stringify(st.round.byPlayer["p0"]?.riichi ?? null)}
  p1.riichi=${JSON.stringify(st.round.byPlayer["p1"]?.riichi ?? null)}
  counter:struck:p0=${JSON.stringify(st.augmentData["counter:struck:p0"])}`);
};

snap("① 시작");

// p0이 서(west) 한 장을 버리며 추격 리치
const west = handIdsOf(game.engine.state, "p0").find(
  (t) => kindKey(kindOf(game.engine.state, t)) === "wind1",
);
const r1 = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: west } } as never);
console.log(`\n② 추격 리치 submit ok=${r1.ok}${r1.ok ? "" : " reason=" + JSON.stringify(r1)}`);
snap("   ");

// 한 바퀴 뒤 자기 순 — 리치 취소 (배수의 진)
const after = game.engine.state;
const g2 = createStandardGameFromState(
  { ...after, round: { ...after.round, phase: "turn.act", turnSeat: 0 } },
  undefined,
  defs,
);
for (const d of defs) installAugment(g2.engine, d, "p0" as PlayerId, { yaku: g2.yaku });
const r2 = g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} } as never);
console.log(`\n③ 자기 순에 cancel_riichi submit ok=${r2.ok}${r2.ok ? "" : " reason=" + JSON.stringify(r2)}`);
{
  const st = g2.engine.state;
  const sc = Object.fromEntries(st.players.map((p) => [p.id, p.score]));
  console.log(`   점수=${JSON.stringify(sc)}  공탁=${st.round.riichiPot}
   p0.riichi=${JSON.stringify(st.round.byPlayer["p0"]?.riichi ?? null)}
   p1.riichi=${JSON.stringify(st.round.byPlayer["p1"]?.riichi ?? null)}
   counter:struck:p0=${JSON.stringify(st.augmentData["counter:struck:p0"])}
   → p0 순증감 ${(st.players.find((p) => p.id === "p0")?.score ?? 0) - 25000} / p1 순증감 ${(st.players.find((p) => p.id === "p1")?.score ?? 0) - 25000}`);
}
