/**
 * T7 — 3~4장 정보 스택을 실제 판에서 돌리며 채널 격리·누출·크래시를 본다.
 * (좌석마다 다른 스택을 들려, 여는 카드와 가리는 카드를 한 탁자에 세운다.)
 */
import { run } from "./sweep.js";
import type { PlayerId } from "@majak/core";

const STACKS: Record<PlayerId, readonly string[]>[] = [
  {
    p0: ["xray_hand", "tenpai_scan", "dora_conceal", "bottom_deal"],
    p1: ["ura_peek", "danger_sense", "mirror_dora", "triple_peek"],
    p2: ["dead_wall_master", "hidden_river", "foresight"],
    p3: ["rinshan_preview", "brief_fog", "peek_riichi_waits", "dora_afterimage"],
  },
  {
    p0: ["dora_conceal", "mirror_dora", "dead_wall_master"],
    p1: ["dora_conceal", "ura_peek", "dora_afterimage"],
    p2: ["hidden_river", "brief_fog", "xray_hand"],
    p3: ["bottom_deal", "foresight", "triple_peek", "future_sight"],
  },
  {
    p0: ["hidden_river", "xray_hand", "tenpai_scan", "danger_sense"],
    p1: ["brief_fog", "peek_riichi_waits", "hand_swap3"],
    p2: ["brief_fog", "hidden_river"],
    p3: ["full_hand_swap", "conjure_draw", "red_five_touch", "cliff_bloom"],
  },
];

for (let i = 0; i < STACKS.length; i++) {
  for (const seed of [11, 22, 33]) {
    const r = await run(STACKS[i]!, seed + i * 100, "hanchan", 180_000);
    const bad = [
      ...(r.crash !== undefined ? [`CRASH ${r.crash}`] : []),
      ...r.effectErrors.map((e) => `EFFECT ${e}`),
      ...r.hits.map((h) => `${h.kind} ${h.seat} ${h.detail}`),
    ];
    console.log(`\n# 스택 ${i} seed=${seed} rounds=${r.rounds}`);
    for (const b of [...new Set(bad)]) console.log(`   ${b}`);
    if (bad.length === 0) console.log("   (이상 없음)");
  }
}
