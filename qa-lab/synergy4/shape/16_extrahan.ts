/**
 * 16 — «+N판» 두 계열이 겹칠 때. 
 *   A) score.extraHan 계열 (진짜 용 +3 · 복수자 +2 · 북풍상인 +북장수)
 *   B) 뱅크 환산 계열 addWinHanBonus (대기만성 +3 / 동풍전판 +2)
 * 둘을 함께 들면 «+6판 한 번»과 같아야 한다. 실제 지불을 잰다.
 */
import { contentAugments } from "@majak/content";
import { calculateScore } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { settle } from "./lib.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

// 진짜 용(17장) 손 — 5멘쯔 + 머리, 평범한 역만 (핑후급)
const TD = "123m456m789m123p55p678p";   // 17장? 3*5+2
const TD13 = TD; // tsumo

function show(label: string, augs: any[], hand: string, wind = 2, num = 3) {
  try {
    const r = settle({ hand, winType: "tsumo", augs: { p0: augs }, prevalentWind: wind, roundNumber: num });
    const i: any = r.info;
    console.log(`  ${label.padEnd(34)} han=${i?.han} extraHan=${i?.extraHan} fu=${i?.fu} points=${i?.points} | deltas=${JSON.stringify(r.deltas)} sum=${r.sum}`);
    console.log(`     augPoints=${JSON.stringify(r.augPoints)}`);
  } catch (e) {
    console.log(`  ${label.padEnd(34)} 실패 ${(e as Error).message}`);
  }
}

console.log("=== 16 «+N판» 두 계열의 겹침 ===");
console.log("손(17장):", TD, " 남3국(대기만성 만개), 쯔모");
show("진짜용만 (+3판 extraHan)", [A("true_dragon")], TD);
show("진짜용+대기만성 (+3+3)", [A("true_dragon"), A("late_bloomer")], TD);
console.log("\n  참고: 같은 손을 만개 전(동1국)에 재면 대기만성 몫이 0이어야 한다");
show("진짜용+대기만성(만개 전)", [A("true_dragon"), A("late_bloomer")], TD, 0, 1);

console.log("\n[표준 14장 손으로 두 계열을 겹쳐 본다]");
const H = "123m456m789m123p55p";
show("없음", [], H);
show("대기만성만 (+3, 뱅크)", [A("late_bloomer")], H);
show("복수자만 (원수 없음 = +0)", [A("avenger")], H);
show("북풍상인만", [A("north_trader")], H);
show("대기만성+북풍상인", [A("late_bloomer"), A("north_trader")], H);

console.log("\n[상한에 걸리지 않는 싼 손으로 다시]");
const cheap = "234m567m345p678p234s55z";
const cheap14 = "234m567m22z345p678p";   // 14장
show("14장 없음(론)", [], cheap14);
show("14장 대기만성(+3)", [A("late_bloomer")], cheap14);
show("17장 진짜용(+3)", [A("true_dragon")], cheap);
show("17장 진짜용+대기만성(+3+3)", [A("true_dragon"), A("late_bloomer")], cheap);
console.log("  기대: 진짜용+대기만성 지불 = 진짜용 손의 «+6판» 한 번과 같아야 한다");
