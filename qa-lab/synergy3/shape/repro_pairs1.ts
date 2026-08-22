/**
 * shape 축 — 화료형 확장 증강 쌍 (채점 레벨) 대조군 4칸 표.
 *
 * 기대값은 각 블록 위 주석에 **미리** 적었다.
 */
import { measure, table, line, waitsOf, optionsOf } from "./lib.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";
import { brokenWall } from "../../../packages/content/src/augments/broken_wall.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { asyncChiitoi } from "../../../packages/content/src/augments/async_chiitoi.js";
import { windLineage } from "../../../packages/content/src/augments/wind_lineage.js";
import { tanyaoBreak } from "../../../packages/content/src/augments/tanyao_break.js";
import { royalKokushi } from "../../../packages/content/src/augments/royal_kokushi.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";
import { joker } from "../../../packages/content/src/augments/joker.js";

const BB = { name: "국경", augs: [brokenBorder] };
const MT = { name: "결속", augs: [mixedTriplet] };
const BW = { name: "윤회", augs: [brokenWall] };
const PE = { name: "양극", augs: [polarEnds] };
const AC = { name: "비대칭", augs: [asyncChiitoi] };
const WL = { name: "계보", augs: [windLineage] };
const TB = { name: "탕야오", augs: [tanyaoBreak] };
const RK = { name: "왕징표", augs: [royalKokushi] };
const NG = { name: "연꽃", augs: [mixedNineGates] };

// ── 1. 국경 × 결속 — 기대: 슌쯔/커쯔 담당이 갈려 있으므로 A+B는 둘의 합집합.
//    같은 손이 양쪽 판정을 동시에 통과해도 판이 이중으로 붙지는 않아야 한다.
table("1. 국경 × 결속 — 혼색 슌쯔 + 혼색 커쯔 한 손", {
  hand: "1m2p3s 4m5p6s 7m8p9s 1m1p1s 22z".replace(/ /g, ""),
  winType: "tsumo",
}, BB, MT);

// ── 2. 국경 × 윤회 — 기대(미리 적음): 두 규칙은 decompose에서 독립 축이라
//    "무늬 무시 + 순환"이 합성되어 9m1p2s 도 슌쯔가 된다. 어느 카드에도 그 말은 없다.
table("2. 국경 × 윤회 — 9m·1p·2s (혼색 순환 슌쯔)", {
  hand: "9m1p2s9m1p2s 234m 567m 22z".replace(/ /g, ""),
  winType: "tsumo",
}, BB, BW);

// ── 3. 윤회 단독 — 891 순환 슌쯔가 삼색동순/일기통관에 헛성립하는가.
//    기대: 붙지 않아야 한다(순환 슌쯔는 표준 역의 전제 밖).
console.log("\n### 3. 윤회 — 891m 891p 891s 삼색 헛성립?");
line("윤회", measure({ hand: "891m891p891s22z22m".slice(0, 0) + "891m891p891s234m22z", winType: "tsumo" }, [brokenWall]));
line("없음", measure({ hand: "891m891p891s234m22z", winType: "tsumo" }, []));

// ── 4. 양극 × 결속 — 기대: 서로 다른 축(같은 무늬 1·9 / 같은 랭크 다른 무늬)이라
//    1m9m1p 같은 "무늬도 랭크도 섞인" 몸통은 A+B에서도 서지 않는다.
table("4. 양극 × 결속 — 1m9m1p 몸통?", {
  hand: "1m9m1p 199p 199s 111z 22z".replace(/ /g, ""),
  winType: "tsumo",
}, PE, MT);

// ── 5. 양극 × 탕야오해방 — 기대: 1·9만의 손은 청노두(역만)라 탕야오해방 판수는 무시된다.
//    비역만 손(1·9 + 중장패)이면 준찬타/찬타와 탕야오해방이 함께 붙는다(의도된 설계).
table("5. 양극 × 탕야오해방 — 순 노두 손 (청노두)", {
  hand: "199m 199p 199s 111p 99s".replace(/ /g, ""),
  winType: "tsumo",
}, PE, TB);

table("5b. 양극 × 탕야오해방 — 노두+중장 혼합", {
  hand: "199m 199p 234s 456s 99m".replace(/ /g, ""),
  winType: "tsumo",
}, PE, TB);

// ── 6. 윤회 × 탕야오해방 — 891 슌쯔는 1·9를 품고 전부 수패다.
//    기대: 탕야오해방 2판 + 준찬타/찬타가 동시에 붙는다(양극과 같은 논리).
table("6. 윤회 × 탕야오해방 — 891 슌쯔 손", {
  hand: "891m891p891s234m22z".replace("22z", "22m"),
  winType: "tsumo",
}, BW, TB);

// ── 7. 비대칭 × 결속 — 기대: 같은 패 3장이면 치또이가 아니라 일반 손으로 읽힌다.
//    A+B에서 혼색 커쯔가 서면 일반 손이 이기고, 치또이는 사라진다.
table("7. 비대칭 × 결속 — 1m1p1s 를 낀 14장", {
  hand: "1m1p1s 2m2p 3m3p 4m4p 55z 66z".replace(/ /g, ""),
  winType: "tsumo",
}, AC, MT);

// ── 8. 비대칭 × 양극 — 기대: 1m+9m 은 짝이 되지 않는다(양극은 커쯔 전용).
table("8. 비대칭 × 양극 — 1m9m 를 짝으로 쓸 수 있나", {
  hand: "1m9m 1p1p 9p9p 1s1s 9s9s 11z 22z".replace(/ /g, ""),
  winType: "tsumo",
}, AC, PE);

// ── 9. 계보 × 비대칭 — 기대: 자패 슌쯔(동남서)와 치또이는 서로 다른 형태.
//    한 손이 둘 다 되면 비싼 쪽이 채택될 뿐 판이 겹치지 않는다.
table("9. 계보 × 비대칭 — 자패 슌쯔 vs 치또이", {
  hand: "123z 123z 55m 66m 77m 88m".replace(/ /g, ""),
  winType: "tsumo",
}, WL, AC);

// ── 10. 계보 × 국경 — 기대: 자패 슌쯔와 수패 혼색 슌쯔는 독립. 합쳐도 새 형태 없음.
table("10. 계보 × 국경 — 자패 슌쯔 + 혼색 슌쯔", {
  hand: "123z 567z 1m2p3s 4m5p6s 99m".replace(/ /g, ""),
  winType: "tsumo",
}, WL, BB);

// ── 11. 계보 × 윤회 — 기대: 북동남(4-1-2) 순환 바람 슌쯔는 서지 않는다
//    (honorRuns 분기가 wrap을 보지 않는다). 카드는 "슌쯔가 원을 그린다"고만 한다.
table("11. 계보 × 윤회 — 북동남 순환 바람 슌쯔?", {
  hand: "412z 412z 234m 567m 99m".replace(/ /g, ""),
  winType: "tsumo",
}, WL, BW);

// ── 12. 조커 × 왕의 징표 — 기대: 조커(백)가 빠진 요구패를 메워 국사가 선다.
//    역만 1개. 국사13면(더블 역만)이 조커 때문에 헛성립하지 않아야 한다.
console.log("\n### 12. 조커 × 왕의 징표 (조커는 액티브라 규칙만으로는 안 켜진다 — wildKinds 직접 확인)");
console.log("  옵션(조커 미발동):", optionsOf("19m19p19s1234z5z5z", [joker]));
console.log("  옵션(왕징표):", optionsOf("19m19p19s1234z5z5z", [royalKokushi]));

// ── 13. 왕의 징표 × 비대칭 — 기대: 노두·자패 7쌍은 치또이로만 읽히고 국사는 아니다.
table("13. 왕징표 × 비대칭 — 노두 7쌍", {
  hand: "11m99m11p99p11s99s11z".replace(/ /g, ""),
  winType: "tsumo",
}, RK, AC);

// ── 14. 왕의 징표 단독/조합 — 12종 + 중복 2장으로 국사가 서는가, 그때 13면 더블역만이 아닌가.
console.log("\n### 14. 왕의 징표 — 12종 + 중복");
line("없음", measure({ hand: "19m19p19s1234z55z6z", winType: "tsumo" }, []));
line("왕징표", measure({ hand: "19m19p19s1234z55z6z", winType: "tsumo" }, [royalKokushi]));
line("왕징표+비대칭", measure({ hand: "19m19p19s1234z55z6z", winType: "tsumo" }, [royalKokushi, asyncChiitoi]));
line("왕징표+양극", measure({ hand: "19m19p19s1234z55z6z", winType: "tsumo" }, [royalKokushi, polarEnds]));

// ── 15. 연꽃 × 국경 — 기대: 뼈대 손은 연꽃 역만 1개. 국경이 붙어도 역만이 둘이 되지 않는다.
table("15. 연꽃 × 국경 — 혼색 구련 뼈대", {
  hand: "11m1p2s3m4p5s6m7p8s9m9p9s 5m".replace(/ /g, ""),
  winType: "tsumo",
}, NG, BB);

// ── 16. 연꽃 × 탕야오해방 — 기대: 역만이면 탕야오해방 판수는 무시(카드 명시).
table("16. 연꽃 × 탕야오해방", {
  hand: "11m1p2s3m4p5s6m7p8s9m9p9s5m".replace(/ /g, ""),
  winType: "tsumo",
}, NG, TB);

// ── 17. 연꽃 × 결속 — 기대: 15와 동일. 역만 1개.
table("17. 연꽃 × 결속", {
  hand: "11m1p2s3m4p5s6m7p8s9m9p9s5m",
  winType: "tsumo",
}, NG, MT);

// ── 18. 대기(텐파이) 축 — 국경+윤회가 대기를 얼마나 넓히는가 (후리텐 표면적)
console.log("\n### 18. 대기 폭 — 234m 567m 22z + 9m1p2s(13장)");
for (const [n, a] of [["없음", []], ["국경", [brokenBorder]], ["윤회", [brokenWall]], ["국경+윤회", [brokenBorder, brokenWall]]] as const) {
  const w = waitsOf("234m567m22z9m1p2s9m1p", a as never);
  console.log(`  ${n.padEnd(10)} shanten=${w.shanten} waits=${w.waits.length} ${w.waits.join(",")}`);
}
