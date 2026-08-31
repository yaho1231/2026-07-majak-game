/**
 * 10 — «역 없이 화료 허용»(relax_win) × 형 완화.
 * 형 완화는 «역이 하나도 없는 화료형»을 흔하게 만든다 → relax_win이 그것을 실제로 살리는가.
 */
import { contentAugments } from "@majak/content";
import type { GameState, PlayerId } from "@majak/core";
import { settle, measure, line } from "./lib.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const on = (...ids: string[]) => (state: GameState, holder: PlayerId) =>
  Object.fromEntries(ids.map((id) => [roundScopedKey(id, "on", state, holder), true]));

// 국경+결속으로만 서는 손 — 론이면 역이 하나도 없다
const HAND = "2m2p2s2m3p4s567m234p1z";  // 13장 (론패 1z 제외)
const WIN = "1z";

console.log("=== 10 relax_win × 형 완화 ===\n");
console.log("[손]", HAND, " 론 화료패", WIN, "(국경+결속으로만 서는 형, 론이면 무역)");
line("국경+결속 (론)", measure({ hand: HAND + WIN, winTile: WIN, winType: "ron", data: on("mixed_triplet", "broken_border") }, [A("broken_border"), A("mixed_triplet")]));

const base = {
  hand: HAND, winTile: WIN, winType: "ron" as const, from: "p1" as PlayerId,
  data: on("mixed_triplet", "broken_border"),
};
for (const [label, augs, wind, num] of [
  ["형완화만", [A("broken_border"), A("mixed_triplet")], 0, 1],
  ["형완화+대기만성(만개 전 동1국)", [A("broken_border"), A("mixed_triplet"), A("late_bloomer")], 0, 1],
  ["형완화+대기만성(만개 남3국)", [A("broken_border"), A("mixed_triplet"), A("late_bloomer")], 2, 3],
] as [string, any[], number, number][]) {
  try {
    const r = settle({ ...base, augs: { p0: augs }, prevalentWind: wind, roundNumber: num });
    console.log(`  ${label.padEnd(30)} deltas=${JSON.stringify(r.deltas)} sum=${r.sum}`);
    console.log(`     winInfo=${JSON.stringify(r.info)}`);
  } catch (e) {
    console.log(`  ${label.padEnd(30)} 정산 실패: ${(e as Error).message}`);
  }
}

console.log("\n[복수자 — 원수의 버림패에 한해 무역 론]");
for (const [label, nem] of [["원수 미지정", null], ["원수=p1", "p1"]] as [string, string | null][]) {
  try {
    const r = settle({
      ...base,
      augs: { p0: [A("broken_border"), A("mixed_triplet"), A("avenger")] },
      data: (st, h) => ({ ...on("mixed_triplet", "broken_border")(st, h), ...(nem ? { [`avenger:nemesis:${h}`]: nem } : {}) }),
    });
    console.log(`  ${label.padEnd(30)} deltas=${JSON.stringify(r.deltas)} han=${(r.info as any)?.han} yaku=${JSON.stringify((r.info as any)?.yaku?.map?.((y: any) => y.id))}`);
  } catch (e) {
    console.log(`  ${label.padEnd(30)} 정산 실패: ${(e as Error).message}`);
  }
}

console.log("\n[우는 국사(kokushiOnly) × relax_win — 형 지정 계열과의 만남]");
// 국사는 언제나 역이 있으므로 relax_win은 무해해야 한다
const k = "119m19p19s1234z567z";
line("우는국사만", measure({ hand: k, winTile: "1m", winType: "ron" }, [A("open_kokushi")]));
line("우는국사+복수자", measure({ hand: k, winTile: "1m", winType: "ron" }, [A("open_kokushi"), A("avenger")]));
line("우는국사+대기만성", measure({ hand: k, winTile: "1m", winType: "ron" }, [A("open_kokushi"), A("late_bloomer")]));
