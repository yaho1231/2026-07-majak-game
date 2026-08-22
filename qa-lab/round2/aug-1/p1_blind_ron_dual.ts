/** 눈먼 총알(blind_ron) 다중 보유 — 지불자 재배선이 몇 번 적용되는가 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, win, sum, roundKeyOf } from "./rig.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const blindRon = byId.get("blind_ron")!;

for (let honba = 0; honba < 8; honba++) {
  const rows: string[] = [];
  for (const holders of [["p0"], ["p0", "p2"], ["p0", "p1", "p2"]]) {
    const augments: Record<string, unknown> = {};
    for (const h of holders) augments[h] = [blindRon];
    const probe = scene({ augments: augments as never, honba });
    const rk = roundKeyOf(probe);
    const data: Record<string, unknown> = {};
    for (const h of holders) data[`blind_ron:armedRound:${h}`] = rk;
    const g = scene({ augments: augments as never, data, honba });

    const before = { p0: 0, p1: -8000, p2: 0, p3: 8000 };
    const out = settle(g, realWinPayload(g, {
      deltas: { ...before },
      winInfos: [win({ winner: "p3", from: "p1", winType: "ron", points: 8000 })],
    }));
    const d = out.deltas as Record<string, number>;
    let flag = "";
    if ((d["p1"] ?? 0) > 0) flag += ` ❌쏜사람 +${d["p1"]}`;
    const worst = Math.min(...Object.values(d));
    if (worst < -8000) flag += ` ❌한명이 ${worst}`;
    if (sum(d) !== 0) flag += ` ❌합=${sum(d)}`;
    rows.push(`  [${holders.join(",")}] ${JSON.stringify(d)}${flag}`);
  }
  console.log(`honba=${honba} rk=1-1-${honba}\n${rows.join("\n")}`);
}
