/**
 * 어느 증강이 판을 느리게 만드는가 — 같은 시드 3판씩, 판당 평균 시간과 p0의 pass 응답 수.
 */
import { runBuild } from "./run.js";
import type { PlayerId } from "@majak/core";

const SEEDS = [1, 2, 3];

async function go(ids: readonly string[], label: string): Promise<void> {
  let ms = 0, pass = 0, rounds = 0;
  for (const seed of SEEDS) {
    const r = await runBuild({
      seed, mode: "tonpuu",
      preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
    });
    ms += r.ms; rounds += r.rounds;
    pass += r.actionsBySeat["p0"]?.["pass"] ?? 0;
  }
  console.log(`${label.padEnd(34)} 판당 ${(ms / SEEDS.length / 1000).toFixed(1)}s · 국 ${rounds} · p0 pass ${pass}`);
}

await go([], "대조군");
await go(["omni_chi"], "omni_chi");
await go(["mixed_triplet"], "mixed_triplet");
await go(["broken_border"], "broken_border");
await go(["mixed_triplet", "broken_border"], "mixed_triplet + broken_border");
await go(["omni_chi", "mixed_triplet", "broken_border"], "셋 다");
