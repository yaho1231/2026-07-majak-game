/**
 * 의심 5 재검증 — meld_dissolve가 되돌린 패 때문에 discardCount / 강 장수 / 버림 이력이 어긋나는가.
 * (유국만관 되살리기는 defcall 확정 1 — 여기서는 **카운터 정합**만 본다.)
 */
import { WALL, createStandardGameFromState, discardsZone, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { meldDissolve } from "../../packages/content/src/augments/meld_dissolve.js";

const withAug = (st: GameState, p: PlayerId, id: string): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, id] } : pl)),
});

function snap(st: GameState, who: PlayerId): string {
  const b = st.round.byPlayer[who]!;
  const river = st.zones[discardsZone(who)]?.tileIds ?? [];
  return `강=${river.length} discardCount=${b.discardCount} 버림이력=${b.discardedKinds.length} ` +
    `tsumogiri=${b.tsumogiriIds.length} 강종류=[${river.map((t) => kindKey(st.tiles[t]!.kind)).join(",")}]`;
}

const b = craft({
  hands: { p0: "11z234m345p55s9s", p1: "*", p2: "*", p3: "*" },
  discards: { p1: "19m19p19s2334z" },
  phase: "reaction", turnSeat: 1,
  lastDiscard: { player: "p1", spec: "1z" },
});
const g = createStandardGameFromState(withAug(b, "p0", "meld_dissolve"));
installAugment(g.engine, meldDissolve, "p0");
console.log("① 퐁 전      p1:", snap(g.engine.state, "p1"));
const st0 = g.engine.state;
const ids = st0.zones["hand:p0"]!.tileIds.filter((t) => st0.tiles[t]!.kind.suit === "wind" && st0.tiles[t]!.kind.rank === 1);
const rp = g.engine.submit({ player: "p0", type: "pon", payload: { tileIds: [ids[0], ids[1]] } });
console.log("   pon ok =", rp.ok);
console.log("② 퐁 후      p1:", snap(g.engine.state, "p1"));
const rd = g.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } });
console.log("   dissolve ok =", rd.ok);
console.log("③ 파혼 후    p1:", snap(g.engine.state, "p1"));
void WALL;

// ── 대조군: fixture가 아니라 **엔진 액션으로 실제 버린** 강에서 같은 절차를 밟는다
console.log("\n[대조군] p1이 엔진 액션으로 직접 버린 뒤 퐁 → 파혼");
{
  const b2 = craft({
    hands: { p0: "11z234m345p55s9s", p1: "1z123m456p789s99s", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const g2 = createStandardGameFromState(withAug(b2, "p0", "meld_dissolve"));
  installAugment(g2.engine, meldDissolve, "p0");
  console.log("① 버리기 전 p1:", snap(g2.engine.state, "p1"));
  const s = g2.engine.state;
  const t1z = s.zones["hand:p1"]!.tileIds.find((t) => kindKey(s.tiles[t]!.kind) === "wind1")!;
  console.log("   discard ok =", g2.engine.submit({ player: "p1", type: "discard", payload: { tileId: t1z } }).ok);
  console.log("② 버린 뒤   p1:", snap(g2.engine.state, "p1"));
  const s2 = g2.engine.state;
  const own = s2.zones["hand:p0"]!.tileIds.filter((t) => kindKey(s2.tiles[t]!.kind) === "wind1");
  console.log("   pon ok =", g2.engine.submit({ player: "p0", type: "pon", payload: { tileIds: [own[0], own[1]] } }).ok);
  console.log("③ 퐁 후     p1:", snap(g2.engine.state, "p1"));
  console.log("   dissolve ok =", g2.engine.submit({ player: "p0", type: "dissolve_meld", payload: { meldIndex: 0 } }).ok);
  console.log("④ 파혼 후   p1:", snap(g2.engine.state, "p1"));
}
