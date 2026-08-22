/**
 * round4 / bot — "봇과 노는 재미" 측정.
 *
 *   tsx qa-lab/round4/bot/probe4.ts <games> <seed> <mode> [--aug]
 *
 * 재는 것
 *  A. 오라스 화료가 순위를 바꿨는가 (자멸 화료: 끝났는데 순위가 그대로)
 *  B. 다마텐율 — 리치 옵션이 제시됐는데 안 건 비율
 *  C. 유국·형식텐파이 — 유국률과 유국 시 노텐 비율
 *  D. 후로 — 콜 옵션이 제시된 순 대비 실제 후로
 *  E. 원형별 A~D 분해 (페르소나가 실제로 갈리는가)
 */
import { HanchanController, ROUND_STARTED, standardAugments, handZone } from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";

const games = Number(process.argv[2] ?? 20);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "hanchan") as GameMode;
const useAug = process.argv.includes("--aug");
const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];
const TOTAL = mode === "tonpuu" ? 4 : 8;

function gameSeed(s: number, i: number): number {
  let h = (s ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

interface Row {
  riichiOffered: number;
  riichiTaken: number;
  callOffered: number;
  callTaken: number;
  wins: number;
  drawTenpai: number;
  drawNoten: number;
}
const empty = (): Row => ({
  riichiOffered: 0,
  riichiTaken: 0,
  callOffered: 0,
  callTaken: 0,
  wins: 0,
  drawTenpai: 0,
  drawNoten: 0,
});
const byArch = new Map<string, Row>();
const total = empty();
const arch = new Map<string, string>(); // botId(+game) -> archetype

let rounds = 0;
let draws = 0;
// A. 오라스 화료
let orasWins = 0;
let orasWinNoRankChange = 0;
let orasWinRankWorseThan1 = 0;
const orasCases: unknown[] = [];

const proto = BotAgent.prototype as unknown as { decide: (p: unknown) => Promise<unknown> };
const origDecide = proto.decide;

let scores: Record<string, number> = {};
let lastAllLast = false;
let lastWinner: string | null = null;
let rankBefore = 0;
let scoresBefore: Record<string, number> = {};

const rankOf = (s: Record<string, number>, me: string): number => {
  const sorted = [...SEATS].sort((a, b) => (s[b] ?? 0) - (s[a] ?? 0));
  return sorted.indexOf(me) + 1;
};

proto.decide = async function (prompt: any): Promise<unknown> {
  const chosen: any = await origDecide.call(this, prompt);
  const me: string = (this as any).id;
  const a = arch.get(me) ?? "?";
  let row = byArch.get(a);
  if (row === undefined) {
    row = empty();
    byArch.set(a, row);
  }
  const hasRiichi = prompt.options.some((o: any) => o.type === "riichi");
  const hasCall = prompt.options.some(
    (o: any) => o.type === "chi" || o.type === "pon" || o.type === "daiminkan",
  );
  if (hasRiichi) {
    row.riichiOffered++;
    total.riichiOffered++;
    if (chosen?.type === "riichi") {
      row.riichiTaken++;
      total.riichiTaken++;
    }
  }
  if (hasCall) {
    row.callOffered++;
    total.callOffered++;
    if (chosen?.type === "chi" || chosen?.type === "pon" || chosen?.type === "daiminkan") {
      row.callTaken++;
      total.callTaken++;
    }
  }
  if (chosen?.type === "win") {
    const view = (this as any).lastView;
    const allLast = view !== null && (view.round.prevalentWind - 1) * 4 + view.round.roundNumber >= TOTAL;
    lastAllLast = allLast;
    lastWinner = me;
    scoresBefore = { ...scores };
    rankBefore = rankOf(scores, me);
    row.wins++;
    total.wins++;
  }
  return chosen;
};

for (let g = 0; g < games; g++) {
  const gs = gameSeed(seed, g);
  scores = Object.fromEntries(SEATS.map((s) => [s, 25000]));
  const bots = SEATS.map((id, i) => {
    const b = new BotAgent(id, `Bot_${id}`, gs + i, useAug ? [...standardAugments, ...contentAugments] : undefined);
    b.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
    arch.set(id, (b as any).profile.archetype);
    return b;
  });
  const controller = new HanchanController(
    bots,
    {
      ...hanchanConfigForMode(mode),
      ...(useAug ? { extraAugments: contentAugments } : { draftSchedules: [], extraAugments: [] }),
      seed: gs,
    },
    {
      onEvent: (json: string) => {
        const ev = JSON.parse(json) as { type: string; payload?: any };
        if (ev.type === ROUND_STARTED) rounds++;
        if (ev.type !== "RoundSettled") return;
        const p = ev.payload;
        for (const id of SEATS) scores[id] = (scores[id] ?? 0) + (p.deltas?.[id] ?? 0);
        if (p.outcome === "draw") {
          draws++;
          const tenpai: string[] = p.tenpaiPlayers ?? [];
          for (const id of SEATS) {
            const a = arch.get(id) ?? "?";
            const row = byArch.get(a) ?? empty();
            byArch.set(a, row);
            if (tenpai.includes(id)) {
              row.drawTenpai++;
              total.drawTenpai++;
            } else {
              row.drawNoten++;
              total.drawNoten++;
            }
          }
        }
        if (p.outcome === "win" && lastWinner !== null && lastAllLast) {
          orasWins++;
          const after = rankOf(scores, lastWinner);
          if (after === rankBefore) {
            orasWinNoRankChange++;
            if (rankBefore > 1) {
              orasWinRankWorseThan1++;
              if (orasCases.length < 12) {
                orasCases.push({
                  game: g,
                  winner: lastWinner,
                  arch: arch.get(lastWinner),
                  rank: rankBefore,
                  gain: (scores[lastWinner] ?? 0) - (scoresBefore[lastWinner] ?? 0),
                  gapToAbove: (() => {
                    const sorted = [...SEATS].sort((x, y) => (scoresBefore[y] ?? 0) - (scoresBefore[x] ?? 0));
                    const up = sorted[rankBefore - 2];
                    return up === undefined ? 0 : (scoresBefore[up] ?? 0) - (scoresBefore[lastWinner] ?? 0);
                  })(),
                  honba: p.honba,
                });
              }
            }
          }
          lastWinner = null;
          lastAllLast = false;
        }
      },
    },
  );
  await controller.run();
  process.stderr.write(`[g${g}] rounds=${rounds} oras=${orasWins}\n`);
}

proto.decide = origDecide;

const pct = (a: number, b: number): string => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
console.log(
  JSON.stringify(
    {
      games,
      mode,
      aug: useAug,
      rounds,
      drawRate: pct(draws, rounds),
      notenAtDraw: pct(total.drawNoten, total.drawNoten + total.drawTenpai),
      riichiTakeRate: `${total.riichiTaken}/${total.riichiOffered} = ${pct(total.riichiTaken, total.riichiOffered)}`,
      damatenRate: pct(total.riichiOffered - total.riichiTaken, total.riichiOffered),
      callTakeRate: `${total.callTaken}/${total.callOffered} = ${pct(total.callTaken, total.callOffered)}`,
      oras: {
        wins: orasWins,
        noRankChange: orasWinNoRankChange,
        noRankChangeAndNotFirst: orasWinRankWorseThan1,
        cases: orasCases,
      },
      byArchetype: Object.fromEntries(
        [...byArch].map(([k, r]) => [
          k,
          {
            riichi: pct(r.riichiTaken, r.riichiOffered),
            call: pct(r.callTaken, r.callOffered),
            notenAtDraw: pct(r.drawNoten, r.drawNoten + r.drawTenpai),
          },
        ]),
      ),
    },
    null,
    1,
  ),
);
