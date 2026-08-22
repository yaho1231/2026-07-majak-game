/**
 * 조커(joker) × 국사 — 조커가 메운 국사가 **국사13면(더블 역만)**으로 승격되는가.
 *
 * 대조: 왕의 징표(royal_kokushi)는 같은 일("빠진 종류를 다른 요구패 중복으로 메운다")을
 * 하면서 국사 **1역만**에 머문다(qa-lab/findings/shape.md 167줄에 그렇게 확인돼 있다).
 * 기대: 조커도 같아야 한다 — 조커는 "빈자리를 메우는" 물건이지 대기를 13면으로
 * 만들어 준 것이 아니다.
 */
import { measure, line, jokerOnData } from "./lib.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { royalKokushi } from "../../../packages/content/src/augments/royal_kokushi.js";

const J = [joker];
const R = [royalKokushi];
const JR = [joker, royalKokushi];

// (a) 진짜 국사13면 — 13종 전부 + 아무 요구패 1장 (조커 무관, 더블 역만이 정답)
console.log("### (a) 진짜 국사 13면 (13종 + 中 중복) — 기준선");
line("없음", measure({ hand: "19m19p19s1234z567z7z", winType: "tsumo", winTile: "dragon3".replace("dragon3","7z") }, []));

// (b) 12종 + 중복 (北 없음) — 왕의 징표만 성립. 1역만이 정답(선례 확인됨)
console.log("\n### (b) 12종 + 9m 중복 (北 없음)");
line("없음", measure({ hand: "19m19p19s123z567z9m", winType: "tsumo" }, []));
line("왕징표", measure({ hand: "19m19p19s123z567z9m", winType: "tsumo" }, R));

// (c) 백(白=조커) 2장으로 北 + 머리를 메운 손 — 12종 실물 + 白白
console.log("\n### (c) 실물 11종(白 제외) + 白白 — 조커 2장");
const C = "19m19p19s123z67z5z5z";
line("없음", measure({ hand: C, winType: "tsumo", data: jokerOnData }, []));
line("조커", measure({ hand: C, winType: "tsumo", data: jokerOnData }, J));
line("왕징표", measure({ hand: C, winType: "tsumo", data: jokerOnData }, R));
line("조커+왕징표", measure({ hand: C, winType: "tsumo", data: jokerOnData }, JR));

// (d) 실물 10종 + 白白白白 — 조커 4장이 3종을 메운다
console.log("\n### (d) 실물 10종 + 白 4장");
const D = "19m19p19s12z67z5z5z5z5z";
line("조커", measure({ hand: D, winType: "tsumo", data: jokerOnData }, J));
line("조커+왕징표", measure({ hand: D, winType: "tsumo", data: jokerOnData }, JR));

// (e) 조커 1장으로 머리만 메운 손 (13종 실물 중 白은 조커) — 승격되나
console.log("\n### (e) 실물 12종(白 없음) + 白 2장");
const E = "19m19p19s1234z67z5z5z";
line("없음", measure({ hand: E, winType: "tsumo", data: jokerOnData }, []));
line("조커", measure({ hand: E, winType: "tsumo", data: jokerOnData }, J));
