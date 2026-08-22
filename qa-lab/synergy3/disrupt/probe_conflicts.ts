/** 담당 축 27종의 conflicts / antiIds 관계를 뽑아 "같이 들 수 있는가"를 확인한다. */
import { defOf } from "./lib.js";
import { AUGMENT_SYNERGY } from "@majak/core";

const MINE = [
  "disarm", "call_seal", "discard_lock", "rank_gate", "frame_up", "seat_swap",
  "time_pressure", "time_stop", "void_kan", "siege_riichi", "push_riichi",
  "scapegoat", "blind_ron", "parasite", "spy", "invincible", "no_ron_pact",
  "yakuman_shield", "tenpai_scan", "danger_sense", "xray_hand", "hidden_river",
  "brief_fog", "dora_conceal", "always_tenpai", "last_stand", "pseudo_dealer",
];

for (const id of MINE) {
  const d = defOf(id);
  const c = (d as { conflicts?: string[] }).conflicts ?? [];
  if (c.length > 0) console.log(`${id}.conflicts = [${c.join(", ")}]`);
}
console.log("\n-- 역방향(다른 증강이 내 축을 conflicts 로 지목) --");
import("../../../packages/content/src/index.js").then((m) => {
  for (const d of m.contentAugments as { id: string; conflicts?: string[] }[]) {
    const hit = (d.conflicts ?? []).filter((x) => MINE.includes(x));
    if (hit.length > 0 && !MINE.includes(d.id)) {
      console.log(`${d.id}.conflicts ⊃ [${hit.join(", ")}]`);
    }
  }
  console.log("\n-- synergy 표(antiIds) 중 내 축이 낀 것 --");
  const syn = AUGMENT_SYNERGY as unknown as Record<string, { antiIds?: string[] }>;
  for (const [id, e] of Object.entries(syn)) {
    const anti = e.antiIds ?? [];
    if (MINE.includes(id) && anti.length > 0) console.log(`${id}.antiIds = [${anti.join(", ")}]`);
    else if (anti.some((a) => MINE.includes(a))) console.log(`${id}.antiIds ⊃ [${anti.filter((a) => MINE.includes(a)).join(", ")}]`);
  }
});
