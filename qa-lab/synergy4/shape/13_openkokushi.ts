/** 13 — 우는 국사 × (왕의 징표 / 양극 / 결속 / 거신병) */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

// kokushi_pon 1개(1만·1통·1삭) + 손패 11장
// 남은 9종: 9m 9p 9s 1z2z3z4z 5z6z7z = 10종… 국사는 13종이므로 후로 3종 + 손 10종 + 머리 = 11장
const melds = [{ kind: "kokushi_pon" as any, spec: "1m1p1s", from: "p1" as any }];
const hand11 = "99m9p9s1234z567z";

console.log("=== 13 우는 국사 (kokushi_pon 1개) ===");
console.log("  후로 1m1p1s / 손 11장", hand11);
line("우는국사", measure({ hand: hand11, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi")]));
line("우는국사+왕징표", measure({ hand: hand11, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi"), A("royal_kokushi")]));
line("우는국사+양극", measure({ hand: hand11, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi"), A("polar_ends")]));
line("우는국사+결속", measure({ hand: hand11, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi"), A("mixed_triplet")]));
line("우는국사+거신병", measure({ hand: hand11, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi"), A("giant_god")]));

// 12종 (9삭 없음) — 왕의 징표가 있어야만 선다

const dupe = "99m99p1234z567z";
console.log("\n  12종(9삭 빠짐) — 왕의 징표 전용");
line("우는국사만", measure({ hand: dupe, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi")]));
line("우는국사+왕징표", measure({ hand: dupe, melds, winTile: "9m", winType: "tsumo" }, [A("open_kokushi"), A("royal_kokushi")]));
