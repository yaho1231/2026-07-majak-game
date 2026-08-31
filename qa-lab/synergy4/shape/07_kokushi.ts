/**
 * 07 — 국사 계열 3장(우는 국사 / 왕의 징표 / 거신병) + 역만 판정.
 */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

console.log("=== 07 국사 계열 ===");

// 표준 국사 (13종 + 중복 1) — 13면 대기가 아닌 단순 국사
const K13 = "19m19p19s1234z567z";   // 13장
const std14 = "119m19p19s1234z567z"; // 1만 중복 = 13종 + 1
console.log("\n[표준 국사 14장]", std14);
line("없음", measure({ hand: std14, winTile: "1m", winType: "ron" }, []));
line("왕의징표", measure({ hand: std14, winTile: "1m", winType: "ron" }, [A("royal_kokushi")]));
line("우는국사", measure({ hand: std14, winTile: "1m", winType: "ron" }, [A("open_kokushi")]));
line("왕+우는", measure({ hand: std14, winTile: "1m", winType: "ron" }, [A("royal_kokushi"), A("open_kokushi")]));
line("왕+거신병", measure({ hand: std14, winTile: "1m", winType: "ron" }, [A("royal_kokushi"), A("giant_god")]));

// 13면 대기 (13종 모두 1장 + 화료패) — 더블 역만이어야 한다
const w13 = "19m19p19s1234z567z1m";
console.log("\n[국사 13면 대기]", w13);
line("없음", measure({ hand: w13, winTile: "1m", winType: "ron" }, []));
line("왕의징표", measure({ hand: w13, winTile: "1m", winType: "ron" }, [A("royal_kokushi")]));
line("왕+우는", measure({ hand: w13, winTile: "1m", winType: "ron" }, [A("royal_kokushi"), A("open_kokushi")]));

// 12종 국사 (왕의 징표 전용) — 9삭 없음, 1만·9만 중복
const r12 = "1199m19p1s1234z567z";
console.log("\n[12종 국사 — 왕의 징표 전용]", r12, "(9삭 없음)");
line("없음", measure({ hand: r12, winTile: "9m", winType: "ron" }, []));
line("왕의징표", measure({ hand: r12, winTile: "9m", winType: "ron" }, [A("royal_kokushi")]));
line("왕+우는", measure({ hand: r12, winTile: "9m", winType: "ron" }, [A("royal_kokushi"), A("open_kokushi")]));
line("왕+거신병", measure({ hand: r12, winTile: "9m", winType: "ron" }, [A("royal_kokushi"), A("giant_god")]));
line("왕+양극", measure({ hand: r12, winTile: "9m", winType: "ron" }, [A("royal_kokushi"), A("polar_ends")]));

// 11종 (왕의 징표는 1종까지) — 성립하면 안 된다
const r11 = "1199m1199p1s123z567z";
console.log("\n[11종 국사 — 성립하면 안 됨]", r11);
line("왕의징표", measure({ hand: r11, winTile: "9p", winType: "ron" }, [A("royal_kokushi")]));
line("왕×2(중복설치)", measure({ hand: r11, winTile: "9p", winType: "ron" }, [A("royal_kokushi"), A("royal_kokushi")]));
