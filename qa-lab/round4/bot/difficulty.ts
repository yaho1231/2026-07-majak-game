/**
 * round4 / bot — 난이도 손잡이가 실제로 실력을 바꾸는가.
 *
 *   tsx qa-lab/round4/bot/difficulty.ts <games> <seed> <mode> <easy|normal>
 *
 * 같은 탁에 easy 둘 · hard 둘을 앉히고, 같은 배패를 좌석을 바꿔 두 번 돌린다
 * (듀플리케이트). 평균 순위 차가 곧 난이도의 크기다.
 * 부수적으로 리치율·후로율·방총률을 난이도별로 나눠 센다 — 난이도가 **버림
 * 흔들림에만** 붙는다는 코드의 주장(bot/discard.ts wobble)을 확인한다.
 */
import { HanchanController, ROUND_STARTED } from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId } from "@majak/core";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
import type { BotDifficulty } from "../../../packages/server/src/bot/profile.js";

const games = Number(process.argv[2] ?? 20);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "hanchan") as GameMode;
const weak = (process.argv[5] ?? "easy") as BotDifficulty;
const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];

function gameSeed(s: number, i: number): number {
  let h = (s ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

interface Side {
  place: number[];
  score: number;
  riichi: number;
  calls: number;
  dealIns: number;
  wins: number;
  decisions: number;
}
const mk = (): Side => ({ place: [], score: 0, riichi: 0, calls: 0, dealIns: 0, wins: 0, decisions: 0 });
const easySide = mk();
const hardSide = mk();
let rounds = 0;
const perDeal: number[] = [];

const proto = BotAgent.prototype as unknown as { decide: (p: unknown) => Promise<unknown> };
const origDecide = proto.decide;
let level: Record<string, BotDifficulty> = {};
proto.decide = async function (prompt: any): Promise<unknown> {
  const chosen: any = await origDecide.call(this, prompt);
  const side = level[(this as any).id] === weak ? easySide : hardSide;
  side.decisions++;
  if (chosen?.type === "riichi") side.riichi++;
  if (chosen?.type === "chi" || chosen?.type === "pon" || chosen?.type === "daiminkan") side.calls++;
  if (chosen?.type === "win") side.wins++;
  return chosen;
};

for (let g = 0; g < games; g++) {
  const gs = gameSeed(seed, g);
  // 좌석 교대 — 같은 배패를 두 번, 약한 쪽을 다른 자리에 앉힌다
  for (const flip of [0, 1]) {
    const scores: Record<string, number> = Object.fromEntries(SEATS.map((s) => [s, 25000]));
    level = {};
    const bots = SEATS.map((id, i) => {
      const b = new BotAgent(id, `Bot_${id}`, gs + i);
      b.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
      const isWeak = (i % 2) === flip;
      b.setDifficulty(isWeak ? weak : "hard");
      level[id] = isWeak ? weak : "hard";
      return b;
    });
    const controller = new HanchanController(
      bots,
      { ...hanchanConfigForMode(mode), draftSchedules: [], extraAugments: [], seed: gs },
      {
        onEvent: (json: string) => {
          const ev = JSON.parse(json) as { type: string; payload?: any };
          if (ev.type === ROUND_STARTED) rounds++;
          if (ev.type === "WinDeclared" && ev.payload?.from != null) {
            const side = level[ev.payload.from] === weak ? easySide : hardSide;
            side.dealIns++;
          }
          if (ev.type === "RoundSettled") {
            for (const id of SEATS) scores[id] = (scores[id] ?? 0) + (ev.payload?.deltas?.[id] ?? 0);
          }
        },
      },
    );
    await controller.run();
    const sorted = [...SEATS].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    let weakPlaceSum = 0;
    for (const id of SEATS) {
      const place = sorted.indexOf(id) + 1;
      const side = level[id] === weak ? easySide : hardSide;
      side.place.push(place);
      side.score += scores[id] ?? 0;
      if (level[id] === weak) weakPlaceSum += place;
    }
    perDeal.push(weakPlaceSum / 2);
  }
  process.stderr.write(`[g${g}] rounds=${rounds}\n`);
}
proto.decide = origDecide;

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]): number => {
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return Math.sqrt(v / xs.length);
};
const show = (s: Side, n: string): unknown => ({
  side: n,
  games: s.place.length,
  avgPlacement: +mean(s.place).toFixed(4),
  avgScore: Math.round(s.score / Math.max(1, s.place.length)),
  riichiPerGame: +(s.riichi / Math.max(1, s.place.length)).toFixed(2),
  callsPerGame: +(s.calls / Math.max(1, s.place.length)).toFixed(2),
  dealInsPerGame: +(s.dealIns / Math.max(1, s.place.length)).toFixed(2),
  winsPerGame: +(s.wins / Math.max(1, s.place.length)).toFixed(2),
});
console.log(
  JSON.stringify(
    {
      games,
      mode,
      weak,
      rounds,
      weakAvgPlacement: +mean(perDeal).toFixed(4),
      standardError: +se(perDeal).toFixed(4),
      sides: [show(easySide, weak), show(hardSide, "hard")],
    },
    null,
    1,
  ),
);
