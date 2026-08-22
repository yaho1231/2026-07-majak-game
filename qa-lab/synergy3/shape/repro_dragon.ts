/**
 * 진짜 용(true_dragon, 5멘쯔 17장 · 화료 +3판) × 나머지 화료형 확장.
 *
 * 기대(미리 적음):
 *  ① 진짜 용 + 국경/결속/윤회/양극/계보 — 17장 5멘쯔 형태에 그대로 얹힌다. +3판.
 *  ② 진짜 용 + 조커 — conflicts에 없다. 조커가 5멘쯔의 빈자리를 메워야 한다.
 *  ③ 진짜 용 + 탕야오해방 — 17장 손에도 탕야오해방 2판이 붙는다.
 *  ④ 진짜 용 + 대기만성 — extraHan이 3+3=6으로 **합산**된다(진짜 용 주석의 약속).
 *     역만이면 둘 다 0이어야 한다.
 *  ⑤ 진짜 용의 역만 — 5멘쯔 손에서 스안커·청일 같은 역만이 제대로 잡히는가.
 */
import { measure, line } from "./lib.js";
import { trueDragon } from "../../../packages/content/src/augments/true_dragon.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";
import { brokenWall } from "../../../packages/content/src/augments/broken_wall.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { windLineage } from "../../../packages/content/src/augments/wind_lineage.js";
import { tanyaoBreak } from "../../../packages/content/src/augments/tanyao_break.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { jokerOnData } from "./lib.js";

console.log("true_dragon conflicts:", trueDragon.conflicts);

const BLOOM = { prevalentWind: 2, roundNumber: 4 }; // 남4국 = 만개

// ① 17장 5멘쯔 기본형 (234m 567m 234p 567p 234s + 99s = 17장)
const H17 = "234m567m234p567p234s99s";
console.log("\n### ① 진짜 용 기본 17장 (5멘쯔+머리)");
line("없음", measure({ hand: H17, winType: "tsumo" }, []));
line("진짜용", measure({ hand: H17, winType: "tsumo" }, [trueDragon]));
line("진짜용+국경", measure({ hand: H17, winType: "tsumo" }, [trueDragon, brokenBorder]));
line("진짜용+탕야오", measure({ hand: H17, winType: "tsumo" }, [trueDragon, tanyaoBreak]));

// ② 혼색 슌쯔 5개 — 국경 없으면 화료형 아님
const H17X = "1m2p3s4m5p6s7m8p9s 2m3p4s 5m6p7s 99s".replace(/ /g, "");
console.log("\n### ② 진짜 용 × 국경 — 혼색 슌쯔 5멘쯔");
line("없음", measure({ hand: H17X, winType: "tsumo" }, []));
line("국경", measure({ hand: H17X, winType: "tsumo" }, [brokenBorder]));
line("진짜용", measure({ hand: H17X, winType: "tsumo" }, [trueDragon]));
line("진짜용+국경", measure({ hand: H17X, winType: "tsumo" }, [trueDragon, brokenBorder]));

// ③ 진짜 용 × 조커 (conflicts 없음)
const H17J = "234m567m234p567p23s5z99s"; // 234s의 4s 자리에 백
console.log("\n### ③ 진짜 용 × 조커 — 백이 5멘쯔의 빈자리를 메우나");
line("없음", measure({ hand: H17J, winType: "tsumo", data: jokerOnData }, []));
line("조커", measure({ hand: H17J, winType: "tsumo", data: jokerOnData }, [joker]));
line("진짜용", measure({ hand: H17J, winType: "tsumo", data: jokerOnData }, [trueDragon]));
line("진짜용+조커", measure({ hand: H17J, winType: "tsumo", data: jokerOnData }, [trueDragon, joker]));

// ④ extraHan 합산 — 진짜 용(+3) × 대기만성(+3, 만개 구간)
console.log("\n### ④ extraHan 합산 — 진짜 용 × 대기만성(남4국)");
line("없음", measure({ hand: H17, winType: "tsumo", ...BLOOM }, []));
line("진짜용", measure({ hand: H17, winType: "tsumo", ...BLOOM }, [trueDragon]));
line("대기만성", measure({ hand: H17, winType: "tsumo", ...BLOOM }, [lateBloomer]));
line("진짜용+대기만성", measure({ hand: H17, winType: "tsumo", ...BLOOM }, [trueDragon, lateBloomer]));
console.log("  (만개 전 = 동1국)");
line("진짜용+대기만성(동1)", measure({ hand: H17, winType: "tsumo" }, [trueDragon, lateBloomer]));

// ⑤ 역만이면 extraHan 0 — 진짜 용 5멘쯔 스안커
const H17Y = "111m222m333p444p555s66s"; // 5커쯔 + 머리 = 17장
console.log("\n### ⑤ 진짜 용 5커쯔 (역만) — +3판이 붙지 않아야 한다");
line("진짜용", measure({ hand: H17Y, winType: "tsumo" }, [trueDragon]));
line("진짜용+대기만성", measure({ hand: H17Y, winType: "tsumo", ...BLOOM }, [trueDragon, lateBloomer]));

// ⑥ 대기만성 × 역만 — 무역 화료 규칙이 역만에도 열리는가 / +3판이 안 붙는가
console.log("\n### ⑥ 대기만성 × 양극(청노두 역만) — 만개 구간");
const YAK = "199m199p199s111p99s";
line("양극(동1)", measure({ hand: YAK, winType: "tsumo" }, [polarEnds]));
line("양극+대기만성(남4)", measure({ hand: YAK, winType: "tsumo", ...BLOOM }, [polarEnds, lateBloomer]));

// ⑦ 대기만성 × 역 없는 손 — 규칙(win.requiresYaku)은 정산 밖이라 여기선 ok=false로 보인다.
console.log("\n### ⑦ 대기만성 — 역 없는 손 (ok 플래그와 +3판)");
const NOYAKU = "234m567m234p678p22s"; // 론이면 역 없음
line("없음(론)", measure({ hand: NOYAKU, winType: "ron", winTile: "2s" }, []));
line("대기만성(남4·론)", measure({ hand: NOYAKU, winType: "ron", winTile: "2s", ...BLOOM }, [lateBloomer]));
line("대기만성+계보(남4·론)", measure({ hand: NOYAKU, winType: "ron", winTile: "2s", ...BLOOM }, [lateBloomer, windLineage]));

// ⑧ 진짜 용 × 결속/양극/계보 — 5멘쯔 + 확장 몸통
console.log("\n### ⑧ 진짜 용 × 결속/양극/윤회/계보");
line("진짜용+결속", measure({ hand: "1m1p1s2m2p2s3m3p3s444m555m66m", winType: "tsumo" }, [trueDragon, mixedTriplet]));
line("결속만", measure({ hand: "1m1p1s2m2p2s3m3p3s444m555m66m", winType: "tsumo" }, [mixedTriplet]));
line("진짜용+양극", measure({ hand: "199m199p199s111z222z33z", winType: "tsumo" }, [trueDragon, polarEnds]));
line("양극만", measure({ hand: "199m199p199s111z222z33z", winType: "tsumo" }, [polarEnds]));
line("진짜용+윤회", measure({ hand: "891m891p891s234m567m99m", winType: "tsumo" }, [trueDragon, brokenWall]));
line("진짜용+계보", measure({ hand: "123z234z567z234m567m99m", winType: "tsumo" }, [trueDragon, windLineage]));
line("계보만", measure({ hand: "123z234z567z234m567m99m", winType: "tsumo" }, [windLineage]));
