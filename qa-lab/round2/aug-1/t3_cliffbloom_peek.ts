/**
 * 절벽의 꽃(cliff_bloom): 카드는 "**깡할 때마다** 남아 있는 영상패를 모두 보고 고른다"인데,
 * 실제로는 깡을 한 번도 치지 않아도 **배패 직후부터 국 내내** 영상패 4장이 보인다.
 */
import { contentAugments, } from "@majak/content";
import { buildPlayerView, DEAD_WALL } from "@majak/core";
import { scene } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));

for (const [label, augs] of [
  ["증강 없음", {}],
  ["p0 = cliff_bloom", { p0: [A.get("cliff_bloom")!] }],
] as [string, never][]) {
  const gm = scene({ augments: augs });
  const st = gm.engine.state;
  const real = st.zones[DEAD_WALL]?.tileIds ?? [];
  for (const pid of ["p0", "p1"] as const) {
    const v = buildPlayerView(st, pid, gm.engine.rules, { yaku: gm.yaku });
    const ids = (v.zones as Record<string, { tileIds: (number | null)[] }>)[DEAD_WALL]?.tileIds ?? [];
    const visible = ids.filter((t) => t !== null && t !== -1);
    console.log(`${label} / 뷰어=${pid}: 왕패 ${ids.length}칸 중 실제 id로 보이는 것 ${visible.length}개 ${JSON.stringify(visible.slice(0, 6))}`);
  }
  console.log(`  (실제 왕패 앞 4장 = ${JSON.stringify(real.slice(0, 4))}, 깡 0회 · 순 0)\n`);
}
