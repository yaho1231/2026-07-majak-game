/** 18 — 비대칭 치또이 × (탕야오해방 / 양극 / 결속 / 조커) */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const on = (...ids: string[]) => (state: any, holder: any) =>
  Object.fromEntries(ids.map((id) => [roundScopedKey(id, "on", state, holder), true]));

const H = "1m1p9m9p2m2p3m3p4m4p5m5p6m6p"; // 혼색 7쌍, 1·9 포함, 전부 수패
const d = on("async_chiitoi");
console.log("=== 18 비대칭 치또이 ===");
console.log("  손:", H, "(14장, 혼색 7쌍)");
line("없음", measure({ hand: H, winType: "tsumo" }, []));
line("비대칭", measure({ hand: H, winType: "tsumo", data: d }, [A("async_chiitoi")]));
line("비대칭+탕야오해방", measure({ hand: H, winType: "tsumo", data: d }, [A("async_chiitoi"), A("tanyao_break")]));
line("비대칭+양극", measure({ hand: H, winType: "tsumo", data: d }, [A("async_chiitoi"), A("polar_ends")]));
line("비대칭+결속", measure({ hand: H, winType: "tsumo", data: on("async_chiitoi", "mixed_triplet") }, [A("async_chiitoi"), A("mixed_triplet")]));

// 론으로 각 쌍의 «다른 쪽»을 잡아도 되는가 (혼색 머리 결함의 치또이판)
console.log("\n  각 쌍의 양쪽 무늬로 화료가 다 되는가 (론)");
for (const w of ["1m", "1p", "9m", "9p", "6m", "6p"]) {
  const m = measure({ hand: H, winTile: w, winType: "ron", data: d }, [A("async_chiitoi")]);
  console.log(`    화료패 ${w}: ${m.shapeOk ? `han=${m.han} ${m.yaku.join(" ")}` : "화료형 아님  <<<"}`);
}

// 자패 섞인 비대칭
const H2 = "1m1p2m2p3m3p4m4p5m5p6m6p55z";
console.log("\n  자패 쌍 포함:", H2);
line("비대칭", measure({ hand: H2, winType: "tsumo", data: d }, [A("async_chiitoi")]));
