/**
 * 사람 1 + 봇 3 — 사람이 **봇을 방해하는 증강**을 들고, 봇 셋이 어떻게 반응하는가.
 *
 * 아레나는 넷 다 봇이라 이 구성을 한 번도 밟지 않는다. 여기서는 p0에 페르소나
 * 에이전트(증강광)를 앉히고 봉인·함구령·무장해제 같은 것을 쥐어 준 뒤,
 * 봇 셋의 크래시·정책 예외·안전망 폴백·봉인된 행동 시도를 센다.
 *
 *   tsx qa-lab/bot/mixed.ts <gamesPerSet> <out.json>
 */
import { HanchanController, DEFAULT_HANCHAN_CONFIG, standardAugments } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { PERSONAS, PersonaAgent } from "../harness.js";
import { newMetrics, patchBot, wrapCatalog } from "./instrument.js";
import { writeFileSync } from "node:fs";

const gamesPer = Number(process.argv[2] ?? 3);
const out = process.argv[3] ?? "/tmp/mixed.json";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const m = newMetrics();
const restore = patchBot(m);
const catalog = wrapCatalog(m, contentAugments);
const botCatalog = [...standardAugments, ...catalog];

/** 사람이 드는 방해 증강 세트 · 봇 셋이 드는 증강 */
const SETS: { human: string[]; bots: string[] }[] = [
  { human: ["riichi_seal", "siege_riichi"], bots: ["stealth_riichi", "double_riichi"] },
  { human: ["call_seal", "discard_lock"], bots: ["quick_pon", "omni_chi"] },
  { human: ["disarm", "parasite"], bots: ["joker", "alchemist"] },
  { human: ["genesis", "suit_unify"], bots: ["spy", "xray_hand"] },
  { human: ["table_flip", "seat_swap"], bots: ["take_back", "time_stop"] },
  { human: ["no_ron_pact", "invincible"], bots: ["soul_strike", "pond_snatch"] },
];

const known = new Set(contentAugments.map((d) => d.id));
const results: any[] = [];

for (const [si, set] of SETS.entries()) {
  const human = set.human.filter((x) => known.has(x));
  const bots = set.bots.filter((x) => known.has(x));
  for (let g = 0; g < gamesPer; g++) {
    const seed = 500_000 + si * 313 + g * 17;
    const agents = SEATS.map((id, i) => {
      if (i === 0) return new PersonaAgent(id, PERSONAS.masher!, seed);
      const b = new BotAgent(id, `Bot_${id}`, seed + i, botCatalog);
      b.setGameMode("tonpuu");
      return b;
    });
    const preset = {
      p0: human,
      p1: bots,
      p2: bots,
      p3: bots,
    } as Record<PlayerId, readonly string[]>;
    const effectErrors: string[] = [];
    let crash: string | null = null;
    const thrBefore = m.decideNowThrows.length;
    const cfBefore = [...m.contentFailures.values()].reduce((a, b) => a + b, 0);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        mode: "tonpuu",
        seed,
        maxWind: 1,
        westEntry: false,
        draftSchedules: [],
        extraAugments: catalog,
        presetAugments: preset,
        agentDecideTimeoutMs: 20_000,
      } as never,
      {
        onEffectError: (f: unknown) => {
          const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String(
            (f as { error?: unknown }).error ?? "",
          )}`;
          if (effectErrors.length < 20) effectErrors.push(s);
        },
      } as never,
    );
    try {
      await Promise.race([
        ctrl.run(),
        new Promise((_r, rej) => setTimeout(() => rej(new Error("TIMEOUT 120s")), 120_000)),
      ]);
    } catch (err: unknown) {
      crash = String((err as Error)?.stack ?? err).split("\n").slice(0, 8).join("\n");
    }
    const row = {
      set: si,
      human,
      bots,
      seed,
      crash,
      effectErrors,
      decideNowThrows: m.decideNowThrows.length - thrBefore,
      contentFailures: [...m.contentFailures.values()].reduce((a, b) => a + b, 0) - cfBefore,
    };
    results.push(row);
    console.log(
      `set${si} g${g} human=${human.join("+")} crash=${crash === null ? "-" : crash.split("\n")[0]} thr=${row.decideNowThrows} cf=${row.contentFailures} eff=${effectErrors.length}`,
    );
    writeFileSync(out, JSON.stringify({ results, failures: [...m.contentFailures], unoffered: [...m.unofferedWarns], throws: m.decideNowThrows }, null, 1));
  }
}
restore();
writeFileSync(
  out,
  JSON.stringify(
    { results, failures: [...m.contentFailures], unoffered: [...m.unofferedWarns], throws: m.decideNowThrows, done: true },
    null,
    1,
  ),
);
