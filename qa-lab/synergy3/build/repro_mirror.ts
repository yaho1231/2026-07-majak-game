/**
 * 거울(mirror_dora)이 다른 도라·배수 증강과 겹칠 때 도라 판수가 실제로 늘어나는가.
 *   A: mirror_dora 단독
 *   B: multi 빌드 (aotenjou_ceiling + eternal_dealer + mirror_dora + ankan_dora)
 *   C: kandora 빌드 (ankan_dora + snake_kan + mirror_dora + red_five_touch)
 * 화료마다 doraHan / augDoraHan 을 모은다. augDoraHan = "증강이 얹은 개인 도라 몫".
 */
import { runBuild } from "./run.js";
import type { PlayerId } from "@majak/core";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

async function go(ids: readonly string[], label: string): Promise<void> {
  let wins = 0, dora = 0, aug = 0, ura = 0, withAug = 0;
  for (const seed of SEEDS) {
    await runBuild({
      seed, mode: "tonpuu",
      preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      onEvent: (e) => {
        if (e.type !== "RoundSettled") return;
        const p = e.payload as unknown as { winInfos?: { winner: string; doraHan: number; uraHan: number; augDoraHan?: number }[] };
        for (const w of p.winInfos ?? []) {
          if (w.winner !== "p0") continue;
          wins++; dora += w.doraHan; ura += w.uraHan; aug += w.augDoraHan ?? 0;
          if ((w.augDoraHan ?? 0) > 0) withAug++;
        }
      },
    });
  }
  const r = (x: number): string => (wins === 0 ? "-" : (x / wins).toFixed(2));
  console.log(`${label}: p0화료 ${wins} · 평균 도라 ${r(dora)} · 평균 뒷도라 ${r(ura)} · 평균 augDoraHan ${r(aug)} · augDora>0 인 화료 ${withAug}`);
}

await go(["mirror_dora"], "A mirror_dora 단독      ");
await go(["aotenjou_ceiling", "eternal_dealer", "mirror_dora", "ankan_dora"], "B multi 빌드           ");
await go(["ankan_dora", "snake_kan", "mirror_dora", "red_five_touch"], "C kandora 빌드         ");
await go([], "D 대조군(증강 없음)    ");
