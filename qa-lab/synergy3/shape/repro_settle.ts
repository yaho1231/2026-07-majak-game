/**
 * 정산 레벨 — 역만 방어술 × 역만 계열, 그리고 +판 보너스의 재원.
 *
 * 기대(미리 적음):
 *  ① 양극 청노두(더블역만) 쯔모 · p1이 역만 방어술 → p1의 분담분 전액 환급,
 *     화료자 수령은 그만큼 줄고 부족분은 뱅크. 본장·공탁 부담은 남는다.
 *  ② 연꽃(혼색 구련) 역만 론 직격 · 방총자가 방어술 → 방총자 손실 0(본장 제외).
 *  ③ 진짜 용 +3판(score.extraHan)은 **상대가 더 낸다**,
 *     대기만성 +3판(addWinHanBonus)은 **뱅크가 낸다** — 둘을 겹치면 어떻게 되는가.
 */
import { settle } from "./lib.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";
import { yakumanShield } from "../../../packages/content/src/augments/yakuman_shield.js";
import { trueDragon } from "../../../packages/content/src/augments/true_dragon.js";
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { royalKokushi } from "../../../packages/content/src/augments/royal_kokushi.js";

const show = (n: string, s: ReturnType<typeof settle>) => {
  console.log(`  ${n.padEnd(28)} deltas=${JSON.stringify(s.deltas)} sum=${s.sum}`);
  const i = s.info as Record<string, unknown> | undefined;
  if (i) console.log(`  ${"".padEnd(28)} han=${i["han"]} yakuman=${i["yakumanCount"]} points=${i["points"]} limit=${i["limit"]} extraHan=${i["extraHan"]} aug=${JSON.stringify(s.augPoints)}`);
};

const YAK = "199m199p199s111p99s"; // 양극 청노두+스안커 = 더블역만

console.log("### ① 양극 더블역만 쯔모 — p1만 역만 방어술");
show("방어 없음", settle({ hand: YAK, winType: "tsumo", augs: { p0: [polarEnds] } }));
show("p1 방어술", settle({ hand: YAK, winType: "tsumo", augs: { p0: [polarEnds], p1: [yakumanShield] } }));
show("p1 방어술 + 1본장", settle({ hand: YAK, winType: "tsumo", honba: 1, augs: { p0: [polarEnds], p1: [yakumanShield] } }));
show("p1·p2 방어술", settle({ hand: YAK, winType: "tsumo", augs: { p0: [polarEnds], p1: [yakumanShield], p2: [yakumanShield] } }));
show("전원 방어술", settle({ hand: YAK, winType: "tsumo", augs: { p0: [polarEnds], p1: [yakumanShield], p2: [yakumanShield], p3: [yakumanShield] } }));

console.log("\n### ② 연꽃 역만 론 직격 — 방총자 p1이 방어술");
const NG = "11m1p2s3m4p5s6m7p8s9m9p9s5m";
show("방어 없음", settle({ hand: NG, winType: "ron", from: "p1", winTile: "5m", augs: { p0: [mixedNineGates] } }));
show("p1 방어술", settle({ hand: NG, winType: "ron", from: "p1", winTile: "5m", augs: { p0: [mixedNineGates], p1: [yakumanShield] } }));

console.log("\n### ②-b 왕의 징표 국사 역만 론 — 방총자 방어술");
const KK = "19m19p19s123z567z9m9p";
show("방어 없음", settle({ hand: KK, winType: "ron", from: "p1", winTile: "9p", augs: { p0: [royalKokushi] } }));
show("p1 방어술", settle({ hand: KK, winType: "ron", from: "p1", winTile: "9p", augs: { p0: [royalKokushi], p1: [yakumanShield] } }));

console.log("\n### ③ +3판의 재원 — 진짜 용(score.extraHan) vs 대기만성(뱅크)");
const H17 = "234m567m234p567p234s99s";
show("진짜용 쯔모(동1)", settle({ hand: H17, winType: "tsumo", augs: { p0: [trueDragon] } }));
show("대기만성 쯔모(남4)", settle({ hand: "234m567m234p678p22s", winType: "tsumo", prevalentWind: 2, roundNumber: 4, augs: { p0: [lateBloomer] } }));
show("없음 쯔모(대조)", settle({ hand: "234m567m234p678p22s", winType: "tsumo", augs: {} }));
show("진짜용+대기만성(남4)", settle({ hand: H17, winType: "tsumo", prevalentWind: 2, roundNumber: 4, augs: { p0: [trueDragon, lateBloomer] } }));
show("진짜용만(남4)", settle({ hand: H17, winType: "tsumo", prevalentWind: 2, roundNumber: 4, augs: { p0: [trueDragon] } }));

console.log("\n### ④ 방어술 + 공탁(리치봉) 2개 + 2본장 — 공탁은 화료자에게 그대로 가는가");
show("방어 없음", settle({ hand: YAK, winType: "tsumo", honba: 2, riichiSticks: 2, augs: { p0: [polarEnds] } }));
show("p1 방어술", settle({ hand: YAK, winType: "tsumo", honba: 2, riichiSticks: 2, augs: { p0: [polarEnds], p1: [yakumanShield] } }));
show("p1 방어(론 직격)", settle({ hand: YAK, winType: "ron", from: "p1", winTile: "9s", honba: 2, riichiSticks: 2, augs: { p0: [polarEnds], p1: [yakumanShield] } }));
