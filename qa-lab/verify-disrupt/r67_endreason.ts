/**
 * 재검증 6·7: **실제 BotAgent**로 완주시켜 종국 분포를 잰다.
 *
 *  6) 반장전이 서입(westEntryDecided)까지 가는 비율 — 페르소나 하네스 탓인가 실제인가.
 *     증강 있음/없음 두 조건으로 갈라 잰다(증강이 점수를 평평하게 만드는지 보려고).
 *  7) 동풍전 마지막 드래프트(eastFourth)를 집은 증강이 **몇 국** 쓰이는가.
 *
 * 실행: tsx qa-lab/verify-disrupt/r67_endreason.ts <판수> [hanchan|tonpuu] [aug|noaug]
 */
import {
  HanchanController, ROUND_STARTED, standardAugments,
} from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId } from "@majak/core";
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { contentAugments } from "@majak/content";

const GAMES = Number(process.argv[2] ?? 40);
const MODE = (process.argv[3] ?? "hanchan") as GameMode;
const WITH_AUG = (process.argv[4] ?? "aug") === "aug";
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
/* eslint-disable @typescript-eslint/no-explicit-any */

const catalog = [...standardAugments, ...contentAugments];
const reasons = new Map<string, number>();
const roundsPer: number[] = [];
/** eastFourth(동풍전 마지막) 드래프트 이후 남은 국 수 */
const afterLast: number[] = [];
let lastStageRound = -1;
let rounds = 0;

for (let g = 0; g < GAMES; g++) {
  const gs = 777_000 + g * 131;
  const bots = SEATS.map((id, i) => {
    const b = new BotAgent(id, `Bot_${id}`, gs + i, WITH_AUG ? catalog : []);
    b.setGameMode(MODE === "tonpuu" ? "tonpuu" : "hanchan");
    return b;
  });
  rounds = 0;
  lastStageRound = -1;
  const cfg: any = {
    ...hanchanConfigForMode(MODE),
    ...(WITH_AUG ? { extraAugments: contentAugments } : { draftSchedules: [], extraAugments: [] }),
    seed: gs,
  };
  const stages: string[] = cfg.draftSchedules ?? [];
  const lastStage = stages[stages.length - 1];
  const ctrl = new HanchanController(bots, cfg, {
    onEvent: (json: string) => {
      const e = JSON.parse(json) as { type: string };
      if (e.type === ROUND_STARTED) rounds++;
    },
    onDraftEnd: (stage: string) => {
      if (stage === lastStage) lastStageRound = rounds;
    },
    onGameOver: (_r: unknown, reason: string) => {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    },
  } as any);
  await ctrl.run().catch((e) => {
    reasons.set("CRASH", (reasons.get("CRASH") ?? 0) + 1);
    console.log("crash", String(e).slice(0, 120));
  });
  roundsPer.push(rounds);
  if (lastStageRound >= 0) afterLast.push(rounds - lastStageRound);
}

console.log(`모드=${MODE} 증강=${WITH_AUG ? "있음" : "없음"} 판수=${GAMES}`);
const total = [...reasons.values()].reduce((a, b) => a + b, 0);
for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(4)}  ${((v / total) * 100).toFixed(1)}%`);
}
const avgR = roundsPer.reduce((a, b) => a + b, 0) / Math.max(1, roundsPer.length);
console.log(`  평균 국 수 ${avgR.toFixed(2)}  (최소 ${Math.min(...roundsPer)} / 최대 ${Math.max(...roundsPer)})`);
if (afterLast.length > 0) {
  const zero = afterLast.filter((x) => x <= 0).length;
  const one = afterLast.filter((x) => x === 1).length;
  const avg = afterLast.reduce((a, b) => a + b, 0) / afterLast.length;
  console.log(`  마지막 드래프트 이후 남은 국: 평균 ${avg.toFixed(2)}  0국 ${zero}판  1국 ${one}판  (표본 ${afterLast.length})`);
}
