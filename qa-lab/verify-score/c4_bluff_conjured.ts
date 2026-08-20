/**
 * 의심 4 재검증 — bluff_pretense의 "5번째 장"이 cliff_bloom과 같은 conjured 규약인가.
 * 같은 장면을 두 증강으로 각각 만들어, 생성패에 붙는 표식과 봇 셈 제외를 대조한다.
 */
import { createStandardGameFromState, handZone, installAugment, kindKey, kindOf } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { bluffPretense } from "../../packages/content/src/augments/bluff_pretense.js";

const withAug = (st: GameState, p: PlayerId, ...ids: string[]): GameState => ({
  ...st,
  players: st.players.map((pl) => (pl.id === p ? { ...pl, augments: [...pl.augments, ...ids] } : pl)),
});

const base = craft({
  hands: { p0: "234m345p678s9s7z", p1: "*", p2: "*", p3: "*" },
  phase: "reaction", turnSeat: 1,
  lastDiscard: { player: "p1", spec: "7z" },
});
const game = createStandardGameFromState(withAug(base, "p0", "bluff_pretense"));
installAugment(game.engine, bluffPretense, "p0");
const st0 = game.engine.state;
const id = st0.zones[handZone("p0")]!.tileIds.find((t) => kindKey(kindOf(st0, t)) === "dragon3") as TileId;
const r = game.engine.submit({ player: "p0", type: "bluff_pon", payload: { tileId: id } });
console.log("bluff_pon ok =", r.ok);
const st = game.engine.state;
const all = Object.values(st.tiles).filter((t) => kindKey(t.kind) === "dragon3");
console.log(`dragon3 총 장수 = ${all.length}`);
for (const t of all) {
  console.log(`  ${t.id}  conjured=${String((t.attrs as { conjured?: boolean }).conjured === true)}`);
}
const conj = all.filter((t) => (t.attrs as { conjured?: boolean }).conjured === true).length;
console.log(`→ 진짜 장수 ${all.length - conj} / 생성패 ${conj}`);
console.log(`→ conjured 규약: 화면 보라(.tile-conjured, styles.css:3240) · 봇 위험도 셈 제외(server/src/bot/danger.ts:122, suji.ts:171)`);
