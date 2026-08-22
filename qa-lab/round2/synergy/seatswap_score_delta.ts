/**
 * 확정 3의 마지막 한 걸음 — 정산 순서가 뒤집히면 **점수가 실제로 달라진다**.
 * parasite(p1, Transfer: 숙주 획득의 절반) × spy(p2, Transfer: 지정패 화료 획득 전액)
 * 두 인터셉터를 같은 ROUND_SETTLED 에 태우되 순서만 바꿔 본다.
 */
import { createStandardGame, ROUND_SETTLED, installAugment, kindKey, kindOf } from "@majak/core";
import { roundScopedKey } from "@majak/content/augments/roundScope.js";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const g = createStandardGame({ seed: 11, playerIds: [...SEATS], mode: "hanchan",
  startScore: 25000, redFivesPerSuit: 1, extraAugments: contentAugments } as never) as any;
for (const [id, who] of [["parasite","p1"],["spy","p2"]] as [string,PlayerId][]) {
  g.engine.submit({ player: who, type: "draftPick", payload: { augmentId: id } });
  installAugment(g.engine, g.augments.get(id)!, who, { yaku: g.yaku, catalog: g.augments });
}
const st0 = g.engine.state;
const winTile = st0.zones["wall"]!.tileIds[0];
const marked = kindKey(kindOf(st0, winTile));
const state = { ...st0, augmentData: { ...st0.augmentData,
  [roundScopedKey("parasite", "target:p1", st0)]: "p0",  // p1 의 숙주 = p0
  ["spy:mark:p2"]: marked,                               // p2 가 찍은 패 = p0 의 화료패
} };
const base = () => ({ type: ROUND_SETTLED, payload: {
  outcome: "win", deltas: { p0: 8000, p1: 0, p2: 0, p3: -8000 },
  winInfos: [{ winner: "p0", points: 8000, yaku: [{ id: "riichi", han: 1 }], honbaBonus: 0, riichiPotGain: 0, winningTileId: winTile }],
  augPoints: [] } } as any);
const chain = g.engine.effects.interceptorsFor(ROUND_SETTLED)
  .filter((c: any) => /parasite|spy/.test(c.source));
const run = (cs: any[]): any => { let ev = base();
  for (const c of cs) { const n = c.intercept(ev, { state, rules: g.engine.rules }); if (n === null) break; ev = n; }
  return ev.payload.deltas; };
const fwd = chain.map((c: any) => c.source);
console.log(`엔진이 준 순서: ${fwd.join(" -> ")}`);
console.log(`  deltas = ${JSON.stringify(run(chain))}`);
const rev = [...chain].reverse();
console.log(`뒤집은 순서:   ${rev.map((c: any) => c.source).join(" -> ")}`);
console.log(`  deltas = ${JSON.stringify(run(rev))}`);
