/** 14 — 역만 판정 카드끼리의 우선순위·중복 역만 */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const on = (...ids: string[]) => (state: any, holder: any) =>
  Object.fromEntries(ids.map((id) => [roundScopedKey(id, "on", state, holder), true]));

console.log("=== 14 역만 중복 ===");
console.log("\n[양극 · 노두 커쯔만 (같은 무늬)]  199m199p199s119s11m");
line("양극", measure({ hand: "199m199p199s119s11m", winType: "tsumo" }, [A("polar_ends")]));

console.log("\n[양극+결속 · 무늬 섞인 노두 몸통]  1m9p1s 9m1p9s 1m9p1s? → 구성 확인");
// {1m,9p,1s} {9m,1p,9s} {1m,9p,1s} 는 장수 초과 → {1m,9p,1s}{9m,1p,9s}{9m,9p,9s}{1m,1p,1s}+머리 11m? 14장
const t = "1m9p1s9m1p9s9m9p9s1p1s11m";
line("양극+결속", measure({ hand: t, winType: "tsumo", data: on("mixed_triplet") }, [A("polar_ends"), A("mixed_triplet")]));
line("결속만", measure({ hand: t, winType: "tsumo", data: on("mixed_triplet") }, [A("mixed_triplet")]));

console.log("\n[진짜 용 · 커쯔 5개 (스안커/또이또이)]  17장");
const td = "111m222m333m444p555p66p";
line("진짜용", measure({ hand: td, winType: "tsumo" }, [A("true_dragon")]));
const td2 = "111m999m111p999p111s99s";
line("진짜용(청노두형)", measure({ hand: td2, winType: "tsumo" }, [A("true_dragon")]));
line("진짜용+양극", measure({ hand: td2, winType: "tsumo" }, [A("true_dragon"), A("polar_ends")]));
line("진짜용+탕야오해방", measure({ hand: td, winType: "tsumo" }, [A("true_dragon"), A("tanyao_break")]));

console.log("\n[유국역만 · 형 카드와 함께 들었을 때 채점 경로는 별개]");
console.log("  (유국은 화료가 아니므로 measure 대상 밖 — 12_sweep 의 실전 판에서 본다)");

console.log("\n[거신병 각성 후의 국사 = 13면?]");
const g13 = "19m19p19s1234z567z1m";
line("거신병", measure({ hand: g13, winTile: "1m", winType: "tsumo" }, [A("giant_god")]));
line("거신병+왕징표", measure({ hand: g13, winTile: "1m", winType: "tsumo" }, [A("giant_god"), A("royal_kokushi")]));
