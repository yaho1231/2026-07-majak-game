/**
 * 03 — 형 완화가 «역»까지 이어지는가. (없음 / A / B / A+B) 4칸 대조.
 */
import { contentAugments } from "@majak/content";
import type { AugmentDef } from "@majak/core";
import { table, measure, line } from "./lib.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const A = (id: string): AugmentDef => {
  const d = byId.get(id);
  if (d === undefined) throw new Error(id);
  return d;
};
/** 첫 순 선언형 3종을 «켜진 것»으로 주입하는 data 훅 */
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const on = (...ids: string[]) => (state: any, holder: any) =>
  Object.fromEntries(ids.map((id) => [roundScopedKey(id, "on", state, holder), true]));

console.log("=== 03 형 완화 × 역 ===");

// ── 1. 양극 × 탕야오 해방 — 199 커쯔뿐인 손(전부 수패)
table(
  "양극 × 탕야오해방 (199 커쯔 4개 + 11만 머리)",
  { hand: "199m199p199s119s11m", winType: "tsumo" },
  { name: "양극", augs: [A("polar_ends")] },
  { name: "탕해방", augs: [A("tanyao_break")] },
);

// ── 2. 양극 × 동수의 결속 — 무늬 다른 1·9 몸통 (오늘 열린 길)
table(
  "양극 × 결속 (1만9통1삭 몸통)",
  { hand: "1m9p1s9m1p9s234m567m55p", winType: "tsumo", data: on("mixed_triplet") },
  { name: "양극", augs: [A("polar_ends")] },
  { name: "결속", augs: [A("mixed_triplet")] },
);

// ── 3. 양극 × 결속 × 탕야오 해방 (3장)
{
  const sc = { hand: "1m9p1s9m1p9s234m567m55p", winType: "tsumo" as const, data: on("mixed_triplet") };
  console.log("\n### 양극+결속에 탕야오해방을 얹으면");
  line("양극+결속", measure(sc, [A("polar_ends"), A("mixed_triplet")]));
  line("양극+결속+탕해방", measure(sc, [A("polar_ends"), A("mixed_triplet"), A("tanyao_break")]));
}

// ── 4. 바람의 계보 × 삼원의 의지 — 백발중 슌쯔 vs 대삼원 커쯔
table(
  "계보 × 삼원의지 (백발중 커쯔 3개 = 대삼원)",
  { hand: "555z666z777z234m11p", winType: "tsumo" },
  { name: "계보", augs: [A("wind_lineage")] },
  { name: "삼원", augs: [A("three_dragons_will")] },
);
// 백발중 슌쯔 1개 + 나머지
table(
  "계보 × 결속 (백발중 슌쯔 + 혼색커쯔)",
  { hand: "567z2m2p2s234m567m11p", winType: "tsumo", data: on("mixed_triplet") },
  { name: "계보", augs: [A("wind_lineage")] },
  { name: "결속", augs: [A("mixed_triplet")] },
);

// ── 5. 무너진 국경 × 결속 (혼색슌쯔 + 혼색커쯔)
table(
  "국경 × 결속",
  { hand: "2m2p2s2m3p4s567m234p11z", winType: "tsumo", data: on("mixed_triplet", "broken_border") },
  { name: "국경", augs: [A("broken_border")] },
  { name: "결속", augs: [A("mixed_triplet")] },
);

// ── 6. 끝없는 윤회 × 양극 (891 슌쯔 + 199 커쯔)
table(
  "윤회 × 양극",
  { hand: "199m891p234s567s55z", winType: "tsumo" },
  { name: "윤회", augs: [A("broken_wall")] },
  { name: "양극", augs: [A("polar_ends")] },
);

// ── 7. 진짜 용 × 양극 (17장, 5멘쯔)
table(
  "진짜용 × 양극 (17장)",
  { hand: "199m199p234s567s123m55z", winType: "tsumo" },
  { name: "진짜용", augs: [A("true_dragon")] },
  { name: "양극", augs: [A("polar_ends")] },
);
table(
  "진짜용 × 탕야오해방 (17장 전부 수패, 1·9 포함)",
  { hand: "199m199p234s567s123m55p", winType: "tsumo" },
  { name: "진짜용", augs: [A("true_dragon")] },
  { name: "탕해방", augs: [A("tanyao_break")] },
);

// ── 8. 비대칭 치또이 × 탕야오해방 / 양극
table(
  "비대칭 × 탕야오해방 (혼색 7쌍, 1·9 포함)",
  { hand: "1m1p9m9p2233m4455p", winType: "tsumo", data: on("async_chiitoi") },
  { name: "비대칭", augs: [A("async_chiitoi")] },
  { name: "탕해방", augs: [A("tanyao_break")] },
);

// ── 9. 뒤섞인 아홉 개의 연꽃 × 국경/결속 (이미 켜져 있는 옵션과 겹칠 때)
table(
  "뒤섞인 구련 × 국경",
  { hand: "1m1p1s2m3p4s5m6p7s8m9p9s9m2p", winType: "tsumo" },
  { name: "구련", augs: [A("mixed_nine_gates")] },
  { name: "국경", augs: [A("broken_border")] },
);
