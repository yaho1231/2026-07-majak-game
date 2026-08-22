/**
 * 재현: 리치 빌드에서 no_retreat 가 stealth_riichi 에게 **보유 순서만으로** 영구히
 * 진다 (봇 입찰 동점 → 먼저 본 쪽이 이긴다: BotAgent.ts:772).
 *
 * 같은 시드·같은 두 증강, preset 순서만 바꿔 발동 횟수를 센다.
 */
import { runBuild } from "./run.js";
import type { PlayerId } from "@majak/core";

const SEEDS = [1, 3, 4, 5, 6];

async function count(order: readonly string[]): Promise<Record<string, number>> {
  const total: Record<string, number> = {};
  for (const seed of SEEDS) {
    const r = await runBuild({
      seed, mode: "tonpuu",
      preset: { p0: order, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
    });
    for (const [id, c] of r.botMetrics.aug) {
      if (!order.includes(id)) continue;
      total[`${id}.제안`] = (total[`${id}.제안`] ?? 0) + c.proposed;
      total[`${id}.발동`] = (total[`${id}.발동`] ?? 0) + c.fired;
    }
    total["p0최종"] = (total["p0최종"] ?? 0) + (r.finalScores.p0 ?? 0);
    const mine = r.wins.filter((w) => w.winner === "p0");
    total["p0화료수"] = (total["p0화료수"] ?? 0) + mine.length;
    total["p0화료점합"] = (total["p0화료점합"] ?? 0) + mine.reduce((a, w) => a + w.points, 0);
    total["p0판합"] = (total["p0판합"] ?? 0) + mine.reduce((a, w) => a + w.han, 0);
  }
  return total;
}

const a = await count(["stealth_riichi", "no_retreat"]);
console.log("preset [stealth_riichi, no_retreat] :", a);
const b = await count(["no_retreat", "stealth_riichi"]);
console.log("preset [no_retreat, stealth_riichi] :", b);
