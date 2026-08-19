/**
 * 증강이 만드는 **비표준 상태**에서 봇의 읽기·입찰이 던지거나 말이 안 되는 값을 내는가.
 *
 * 같은 종류 5장(생성패)·17장 손패(진짜 용)·국사 후로(우는 국사)·패산 0장·
 * 조커(와일드)·비표준 화료형 옵션을 각각 세워 buildRead + 버림/리치/후로/깡 입찰을 돌린다.
 *
 *   tsx qa-lab/bot/odd_state_probe.ts
 */
import { Prng } from "@majak/core";
import type { PlayerView } from "@majak/core";
import { botScene } from "../../packages/server/test/botTestView.js";
import { buildRead, readPlan } from "../../packages/server/src/bot/read.js";
import { bidDiscard, bidRiichi } from "../../packages/server/src/bot/discard.js";
import { bidKan } from "../../packages/server/src/bot/kan.js";
import { profileOf } from "../../packages/server/src/bot/profile.js";

const prof = profileOf("balanced");

interface Case {
  name: string;
  build: () => ReturnType<typeof botScene>;
}

const CASES: Case[] = [
  {
    name: "같은 패 5장 (생성패)",
    build: () => botScene({ hand: "11111m456p789s22z", turnCount: 6 }),
  },
  {
    name: "같은 패 6장",
    build: () => botScene({ hand: "111111m456p789s2z", turnCount: 6 }),
  },
  {
    name: "17장 손패 (진짜 용)",
    build: () => botScene({ hand: "123456789m123456p78s", turnCount: 4 }),
  },
  {
    name: "10장 손패 (손이 깎임)",
    build: () => botScene({ hand: "123m456p789s2z", turnCount: 4 }),
  },
  {
    name: "패산 0장",
    build: () => botScene({ hand: "123m456p789s22m5p", turnCount: 17, wallLeft: 0 }),
  },
  {
    name: "조커(와일드 백) + 치또이 텐파이",
    build: () =>
      botScene({
        hand: "1133m5577p9922s5z",
        turnCount: 8,
        scoringOptions: { wildKinds: [{ suit: "dragon", rank: 1 }] } as never,
      }),
  },
  {
    name: "치또이 전용 옵션 + 표준형 손",
    build: () =>
      botScene({
        hand: "123m456p789s22m5p",
        turnCount: 8,
        scoringOptions: { chiitoiOnly: true } as never,
      }),
  },
  {
    name: "국사 전용 옵션 + 평범한 손",
    build: () =>
      botScene({
        hand: "123m456p789s22m5p",
        turnCount: 8,
        scoringOptions: { kokushiOnly: true } as never,
      }),
  },
  {
    name: "빈 손패",
    build: () => botScene({ hand: "", turnCount: 1 }),
  },
];

let bad = 0;
for (const c of CASES) {
  try {
    const scene = c.build();
    const view: PlayerView = scene.view;
    const read = buildRead(view, "p0", { mode: "hanchan" });
    const plan = readPlan(read, null as never);
    const d = bidDiscard(read, scene.discardOptions(), plan, prof, new Prng(3));
    const r = bidRiichi(read, scene.riichiOptions(), plan, prof);
    const k = bidKan(read, scene.discardOptions(), prof, plan);
    const finite = (n: number | undefined): boolean => n === undefined || Number.isFinite(n);
    const ok = finite(d?.value) && finite(r?.value) && finite(k?.value);
    if (!ok) bad++;
    console.log(
      `${c.name.padEnd(28)} shanten=${read.shanten} tenpai=${read.tenpai} waits=${read.waits.length} ` +
        `discardBid=${d === null ? "-" : d.value.toFixed(0)} riichiBid=${r === null ? "-" : r.value.toFixed(0)} ${ok ? "" : "  <-- 비유한값"}`,
    );
  } catch (err) {
    bad++;
    console.log(`${c.name.padEnd(28)} THROW: ${String((err as Error).message).slice(0, 160)}`);
  }
}
console.log(bad === 0 ? "\n모두 통과 (던지지 않음 · 유한값)" : `\n이상 ${bad}건`);
