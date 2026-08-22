/**
 * round4 / bot — 봇의 **계산 시간** 분포 (생각 시간 연출과 별개).
 *
 *   tsx qa-lab/round4/bot/timing.ts <games> <seed> <mode> [--aug]
 *
 * BotAgent를 thinkMs=0으로 돌려 decide()의 순수 계산 시간을 잰다. 운영 서버는
 * 여기에 연출 지연(BOT_THINK_MS=1000)이 더해진다. 계산이 느리면 그 지연을 0으로
 * 낮춰도 판이 빨라지지 않는다.
 */
import { HanchanController, ROUND_STARTED, standardAugments } from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";

const games = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "hanchan") as GameMode;
const useAug = process.argv.includes("--aug");
const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];

const ms: number[] = [];
const byType = new Map<string, number[]>();
const proto = BotAgent.prototype as unknown as { decide: (p: unknown) => Promise<unknown> };
const orig = proto.decide;
proto.decide = async function (p: any): Promise<unknown> {
  const t = performance.now();
  const c: any = await orig.call(this, p);
  const dt = performance.now() - t;
  ms.push(dt);
  const k = String(c?.type);
  const arr = byType.get(k) ?? [];
  arr.push(dt);
  byType.set(k, arr);
  return c;
};

let rounds = 0;
for (let g = 0; g < games; g++) {
  let h = (seed ^ (g * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const gs = (h ^ (h >>> 16)) >>> 0;
  const bots = SEATS.map((id, i) => {
    const b = new BotAgent(id, `Bot_${id}`, gs + i, useAug ? [...standardAugments, ...contentAugments] : undefined);
    b.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
    return b;
  });
  const c = new HanchanController(
    bots,
    {
      ...hanchanConfigForMode(mode),
      ...(useAug ? { extraAugments: contentAugments } : { draftSchedules: [], extraAugments: [] }),
      seed: gs,
    },
    { onEvent: (j: string) => { if ((JSON.parse(j) as any).type === ROUND_STARTED) rounds++; } },
  );
  await c.run();
  process.stderr.write(`[g${g}] n=${ms.length}\n`);
}
proto.decide = orig;

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return +(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(1);
};
console.log(
  JSON.stringify(
    {
      games, mode, aug: useAug, rounds, decisions: ms.length,
      meanMs: +(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)).toFixed(2),
      p50: q(ms, 0.5), p90: q(ms, 0.9), p99: q(ms, 0.99), max: +Math.max(...ms).toFixed(1),
      over100ms: ms.filter((x) => x > 100).length,
      over300ms: ms.filter((x) => x > 300).length,
      byType: Object.fromEntries(
        [...byType].map(([k, v]) => [k, { n: v.length, p50: q(v, 0.5), p99: q(v, 0.99), max: +Math.max(...v).toFixed(1) }]),
      ),
    },
    null,
    1,
  ),
);
