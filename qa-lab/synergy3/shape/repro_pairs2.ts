/**
 * shape 축 2차 — 남은 쌍들.
 * 기대는 각 블록 위에 미리 적었다.
 */
import { measure, table, line } from "./lib.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";
import { brokenWall } from "../../../packages/content/src/augments/broken_wall.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { asyncChiitoi } from "../../../packages/content/src/augments/async_chiitoi.js";
import { windLineage } from "../../../packages/content/src/augments/wind_lineage.js";
import { tanyaoBreak } from "../../../packages/content/src/augments/tanyao_break.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";

const BB = { name: "국경", augs: [brokenBorder] };
const MT = { name: "결속", augs: [mixedTriplet] };
const BW = { name: "윤회", augs: [brokenWall] };
const PE = { name: "양극", augs: [polarEnds] };
const AC = { name: "비대칭", augs: [asyncChiitoi] };
const WL = { name: "계보", augs: [windLineage] };
const TB = { name: "탕야오", augs: [tanyaoBreak] };
const NG = { name: "연꽃", augs: [mixedNineGates] };

// 19. 계보 × 결속 — 자패 커쯔에 무늬 개념이 없으므로 결속은 자패에 관여하지 않아야 한다.
table("19. 계보 × 결속 — 자패", { hand: "123z234z123z55m66m".replace("66m","66m"), winType: "tsumo" }, WL, MT);

// 20. 계보 × 삼원 커쯔 — 백발중 슌쯔(1판)와 대삼원(역만)이 같은 손에서 어느 쪽이 채택되는가.
//     기대: 역만이 이긴다. 슌쯔 쪽 1판이 역만에 덧붙지 않는다.
console.log("\n### 20. 계보 — 白白白發發發中中中 (대삼원) 손");
line("없음", measure({ hand: "555z666z777z234m99m", winType: "tsumo" }, []));
line("계보", measure({ hand: "555z666z777z234m99m", winType: "tsumo" }, [windLineage]));
line("계보+결속", measure({ hand: "555z666z777z234m99m", winType: "tsumo" }, [windLineage, mixedTriplet]));
console.log("  (백발중 3벌 = 자일색 후보)");
line("계보", measure({ hand: "567z567z567z234z44z", winType: "tsumo" }, [windLineage]));

// 21. 탕야오 해방 × 국경 — 혼색 슌쯔로 이룬 전부-수패 손에 1·9가 끼면?
table("21. 탕야오해방 × 국경", { hand: "1m2p3s 9m8p7s 234m 567p 99s".replace(/ /g,""), winType: "tsumo" }, TB, BB);

// 22. 탕야오 해방 × 결속 — 혼색 커쯔(1m1p1s)는 전부 수패 + 노두
table("22. 탕야오해방 × 결속", { hand: "1m1p1s9m9p9s234m567m22m", winType: "tsumo" }, TB, MT);

// 23. 양극 × 윤회 — 1·9를 서로 다른 방식으로 쓰는 둘. 같은 손에서 충돌하나?
table("23. 양극 × 윤회", { hand: "199m891p891s234m99m".replace("99m","55m"), winType: "tsumo" }, PE, BW);

// 24. 양극 × 국경 — 혼색 노두 커쯔(1m9m1p)는 서지 않아야 한다(양극은 같은 무늬 한정)
table("24. 양극 × 국경", { hand: "1m9m1p199p199s111z22z", winType: "tsumo" }, PE, BB);

// 25. 비대칭 × 국경 — 치또이와 표준형이 동시에 성립하면 비싼 쪽만.
table("25. 비대칭 × 국경", { hand: "1m1p2m2p3m3p4m4p5m5p6m6p7m7p", winType: "tsumo" }, AC, BB);

// 26. 비대칭 × 윤회
table("26. 비대칭 × 윤회", { hand: "8m8p9m9p1s1m2s2p3s3p4s4p", winType: "tsumo" }, AC, BW);

// 27. 연꽃 × 계보 — 자패가 한 장이라도 있으면 연꽃은 불성립(카드 명시).
table("27. 연꽃 × 계보", { hand: "11m1p2s3m4p5s6m7p8s9m9p123z", winType: "tsumo" }, NG, WL);

// 28. 연꽃 × 비대칭 — 뼈대는 치또이가 아니므로 서로 무관해야.
table("28. 연꽃 × 비대칭", { hand: "11m1p2s3m4p5s6m7p8s9m9p9s5m", winType: "tsumo" }, NG, AC);

// 29. 국경 × 결속 × 윤회 (삼중) — 랭크만 맞으면 뭐든 몸통 + 순환
console.log("\n### 29. 삼중 — 국경+결속+윤회");
const H29 = "9m1p2s9m1p2s1m1p1s234m22z".replace("22z", "22m");
line("없음", measure({ hand: H29, winType: "tsumo" }, []));
line("국경", measure({ hand: H29, winType: "tsumo" }, [brokenBorder]));
line("국경+윤회", measure({ hand: H29, winType: "tsumo" }, [brokenBorder, brokenWall]));
line("국경+윤회+결속", measure({ hand: H29, winType: "tsumo" }, [brokenBorder, brokenWall, mixedTriplet]));
line("4중(+양극)", measure({ hand: H29, winType: "tsumo" }, [brokenBorder, brokenWall, mixedTriplet, polarEnds]));

// 30. 탕야오 해방 × 양극 × 결속 (삼중) — 청노두 아닌 손에서 판이 겹치나
console.log("\n### 30. 삼중 — 탕야오해방+양극+결속");
const H30 = "1m1p1s9m9p9s199m234p55p";
for (const [n, a] of [
  ["없음", []],
  ["탕야오", [tanyaoBreak]],
  ["양극+결속", [polarEnds, mixedTriplet]],
  ["셋 다", [tanyaoBreak, polarEnds, mixedTriplet]],
] as const) line(n, measure({ hand: H30, winType: "tsumo" }, a as never));

// 31. 탕야오 해방 × 양극 — 준찬타와 탕야오가 한 손에 동시에 붙는가 (소스 주석: 의도된 설계)
console.log("\n### 31. 탕야오해방 × 양극 — 준찬타 + 탕야오해방 동시");
const H31 = "199m199p199s789m11m";
for (const [n, a] of [
  ["없음", []],
  ["양극", [polarEnds]],
  ["탕야오", [tanyaoBreak]],
  ["양극+탕야오", [polarEnds, tanyaoBreak]],
] as const) line(n, measure({ hand: H31, winType: "tsumo" }, a as never));

// 32. 탕야오 해방 × 윤회 — 891 슌쯔로 준찬타 + 탕야오
console.log("\n### 32. 탕야오해방 × 윤회 — 준찬타 + 탕야오해방");
const H32 = "891m891p891s789m11m";
for (const [n, a] of [
  ["없음", []],
  ["윤회", [brokenWall]],
  ["윤회+탕야오", [brokenWall, tanyaoBreak]],
] as const) line(n, measure({ hand: H32, winType: "tsumo" }, a as never));
