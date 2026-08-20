/**
 * shape 의심 1 재검증 — true_dragon(5멘쯔)에서 "표준에선 불가능한 역 조합"이
 * 실제 대국에서 얼마나 자주 서는가.
 *
 *   npx tsx qa-lab/verify-shape/td_soak.ts [판수] [모드]
 *
 * 표준 4멘쯔에서 원리상 동시 성립이 불가능한 슌쯔역 조합만 센다.
 *  - ittsuu(3슌쯔) + ryanpeiko(4슌쯔)  → 7슌쯔 필요
 *  - sanshoku(3슌쯔) + ittsuu(3슌쯔)   → 겹치지 않으면 6슌쯔 필요(4멘쯔 불가)
 *  - sanshoku + ryanpeiko              → 7슌쯔
 *  - ittsuu + iipeiko                  → 5슌쯔
 */
import { ROUND_SETTLED } from "@majak/core";
import type { GameEvent, PlayerId, RoundSettledPayload, WinInfo } from "@majak/core";
import { PERSONAS, runMatch } from "../shape/h2.js";

const N = Number(process.argv[2] ?? 10);
const MODE = (process.argv[3] ?? "hanchan") as "hanchan" | "tonpuu";
const RUN_YAKU = new Set(["ittsuu", "sanshoku", "iipeiko", "ryanpeiko"]);
/** 4멘쯔로는 동시에 못 서는 조합 (필요 슌쯔 수 > 4) */
const IMPOSSIBLE: Array<[string[], number]> = [
  [["ittsuu", "ryanpeiko"], 7],
  [["sanshoku", "ryanpeiko"], 7],
  [["sanshoku", "ittsuu"], 6],
  [["ittsuu", "iipeiko"], 5],
  [["sanshoku", "iipeiko"], 5],
];

const personaSets = [
  ["masher", "riichiRusher", "caller", "folder"],
  ["chaos", "stall", "masher", "caller"],
];

let wins = 0, tdWins = 0, hits = 0, kazoe = 0;
const combo = new Map<string, number>();
const samples: string[] = [];

for (let i = 0; i < N; i++) {
  const seed = 7000 + i * 31;
  const ps = personaSets[i % personaSets.length] as string[];
  const personas = {
    p0: PERSONAS[ps[0]!]!, p1: PERSONAS[ps[1]!]!, p2: PERSONAS[ps[2]!]!, p3: PERSONAS[ps[3]!]!,
  };
  const preset = { p0: ["true_dragon"], p1: ["true_dragon"], p2: ["true_dragon"], p3: ["true_dragon"] } as Record<PlayerId, string[]>;
  let seen = 0;
  let eng: { eventLog: readonly GameEvent[] } | null = null;
  const drain = (): void => {
    if (eng === null) return;
    const log = eng.eventLog;
    for (let k = seen; k < log.length; k++) {
      const ev = log[k] as GameEvent;
      if (ev.type !== ROUND_SETTLED) continue;
      for (const wi of ((ev.payload as RoundSettledPayload).winInfos ?? []) as WinInfo[]) {
        wins++;
        const ids = new Set(wi.yaku.map((y) => y.id));
        const hasTd = (wi.extraHanBy ?? []).some((e) => e.augId === "true_dragon");
        if (hasTd) tdWins++;
        if (wi.yaku.some((y) => y.id === "kazoe_yakuman")) kazoe++;
        for (const [set] of IMPOSSIBLE) {
          if (set.every((y) => ids.has(y))) {
            hits++;
            const key = set.join("+");
            combo.set(key, (combo.get(key) ?? 0) + 1);
            if (samples.length < 8) samples.push(`seed=${seed} ${key} han=${wi.han} yaku=${wi.yaku.map((y) => `${y.id}:${y.han}`).join(",")}`);
          }
        }
        void RUN_YAKU;
      }
    }
    seen = log.length;
  };
  await runMatch({
    seed, mode: MODE, preset, personas, noDraft: true,
    onGameStart: (g) => { eng = (g as { engine: { eventLog: readonly GameEvent[] } }).engine; },
    onRound: (_s, ph) => { if (ph === "end") drain(); },
    timeoutMs: 180_000,
  });
  drain();
}
console.log(`판=${N} ${MODE} 화료=${wins} (true_dragon 화료=${tdWins}) 셀 수 없는 조합=${hits} kazoe=${kazoe}`);
for (const [k, v] of combo) console.log(`  ${k} x${v}`);
for (const s of samples) console.log("  ", s);
