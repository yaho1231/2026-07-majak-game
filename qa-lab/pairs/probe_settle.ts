/**
 * 정산 대조 프로브 — 한 판을 그대로 재현하면서 국마다
 *   (a) 국 시작 점수 합, (b) RoundSettled.deltas 합, (c) augPoints, (d) ScoreChanged,
 *   (e) 국 종료 점수 합
 * 을 찍어 "점수 창조/소멸"의 출처를 특정한다.
 *
 *   tsx qa-lab/pairs/probe_settle.ts <a> <b> <seed> <mode> <mix> [dual]
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  Prng,
} from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "../harness.js";
import { fillSeats } from "./lib.js";

const A = process.argv[2] ?? "hand_swap3";
const B = process.argv[3] ?? "all_or_nothing";
const SEED = Number(process.argv[4] ?? 2293);
const MODE = (process.argv[5] ?? "tonpuu") as "hanchan" | "tonpuu";
const MIX = Number(process.argv[6] ?? 1);
const DUAL = process.argv[7] === "dual";

const rng = new Prng(SEED * 7919 + 13);
const preset = fillSeats(rng, MODE, [A, B]) as Record<string, string[]>;
if (DUAL) preset["p2"] = [A, B];
console.log("preset", JSON.stringify(preset));

const mixes = [
  ["masher", "masher", "masher", "masher"],
  ["masher", "caller", "riichiRusher", "folder"],
  ["masher", "stall", "chaos", "stall"],
];
const names = mixes[MIX % 3]!;
const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS[names[i]!]!, SEED * 131 + i * 7 + 1));

const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG,
  mode: MODE,
  seed: SEED,
  maxWind: MODE === "tonpuu" ? 1 : 2,
  westEntry: false,
  draftSchedules:
    MODE === "tonpuu"
      ? ["eastFirst", "eastThird", "eastFourth"]
      : ["eastFirst", "eastThird", "southEntry", "southThird"],
  extraAugments: contentAugments,
  presetAugments: preset,
  agentDecideTimeoutMs: 20_000,
} as never, {
  onRoundStart: (g: { engine: { state: { players: { id: PlayerId; score: number }[]; round: { riichiPot: number } } } }) => {
    const st = g.engine.state;
    const tot = st.players.reduce((s, p) => s + p.score, 0) + st.round.riichiPot;
    console.log(`\n== ROUND START total=${tot} ${st.players.map((p) => `${p.id}:${p.score}`).join(" ")} pot=${st.round.riichiPot}`);
  },
  onRoundEnd: (g: { engine: { state: { players: { id: PlayerId; score: number }[]; round: { riichiPot: number } } } }) => {
    const st = g.engine.state;
    const tot = st.players.reduce((s, p) => s + p.score, 0) + st.round.riichiPot;
    console.log(`== ROUND END   total=${tot} ${st.players.map((p) => `${p.id}:${p.score}`).join(" ")} pot=${st.round.riichiPot}`);
  },
  onEvent: (j: string) => {
    try {
      const e = JSON.parse(j) as { type?: string; payload?: Record<string, unknown> };
      if (process.env["ALL_EVENTS"] === "1" && e.type !== undefined && /Score|Settle|Riichi|Pot|Augment/i.test(e.type)) {
        console.log(`   EV ${e.type} ${JSON.stringify(e.payload).slice(0, 300)}`);
      }
      if (e.type === "ScoreChanged") {
        console.log(`   ScoreChanged ${JSON.stringify(e.payload)}`);
      } else if (e.type === "RoundSettled") {
        const p = e.payload ?? {};
        console.log(`   RoundSettled deltas=${JSON.stringify(p["deltas"])} sum=${Object.values((p["deltas"] ?? {}) as Record<string, number>).reduce((s, v) => s + v, 0)}`);
        console.log(`     augPoints=${JSON.stringify(p["augPoints"] ?? [])} reason=${String(p["reason"] ?? "")} pot=${String(p["riichiPot"] ?? "")}`);
      }
    } catch { /* ignore */ }
  },
  onEffectError: (f: unknown) => console.log("   EFFECT_ERROR", JSON.stringify(f).slice(0, 300)),
} as never);

await ctrl.run();
const st = ctrl.gameState;
if (st !== null) console.log("\nFINAL", st.players.map((p) => `${p.id}:${p.score}`).join(" "), "sum", st.players.reduce((s, p) => s + p.score, 0));
