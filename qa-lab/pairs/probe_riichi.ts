/** RIICHI_HAND_MUTATED 최소 재현 — 변형 순간의 전후 상태를 그대로 찍는다 */
import { Prng, handZone, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, fillSeats, runMatch } from "./lib.js";

const A = process.argv[2] ?? "future_sight";
const B = process.argv[3] ?? "reload";
const SEED = Number(process.argv[4] ?? 5251);
const MIX = Number(process.argv[5] ?? 2);
const WATCH = (process.argv[6] ?? "p2") as PlayerId;

const rng = new Prng(SEED * 7919 + 13);
const preset = fillSeats(rng, "hanchan", [A, B]) as Record<string, string[]>;
preset["p2"] = [A, B];
console.log("preset", JSON.stringify(preset));

const mixes = [
  [PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!],
  [PERSONAS.masher!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.folder!],
  [PERSONAS.masher!, PERSONAS.stall!, PERSONAS.chaos!, PERSONAS.stall!],
];
const mx = mixes[MIX % 3]!;

let roundIdx = 0;
let prev: { sig: string; melds: number; phase: string; turn: number } | null = null;
const sigOf = (st: GameState, seat: PlayerId): string =>
  (st.zones[handZone(seat)]?.tileIds ?? [])
    .map((id) => {
      const t = st.tiles[id];
      return t === undefined ? String(id) : kindKey(t.kind);
    })
    .slice()
    .sort()
    .join(",");

await runMatch({
  seed: SEED,
  mode: "hanchan",
  preset: preset as never,
  personas: { p0: mx[0]!, p1: mx[1]!, p2: mx[2]!, p3: mx[3]! },
  onRound: (_st, phase) => {
    if (phase === "start") {
      roundIdx++;
      prev = null;
      console.log(`--- round #${roundIdx} start`);
    }
  },
  onState: (st) => {
    const rp = st.round.byPlayer[WATCH];
    if (rp?.riichi == null) {
      prev = null;
      return;
    }
    const melds = rp.meldCount ?? rp.melds?.length ?? 0;
    const sig = sigOf(st, WATCH);
    const n = st.zones[handZone(WATCH)]?.tileIds.length ?? 0;
    const cur = { sig, melds, phase: st.round.phase, turn: st.round.turnCount };
    if (prev !== null && prev.melds === melds && prev.sig !== sig && n === 13 && prev.sig.split(",").length === 13) {
      console.log(`!! MUTATED round#${roundIdx} ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`);
      console.log(`   prev phase=${prev.phase} turn=${prev.turn} melds=${prev.melds}\n     ${prev.sig}`);
      console.log(`   now  phase=${cur.phase} turn=${cur.turn} melds=${melds} n=${n}\n     ${sig}`);
      console.log(`   riichi=${JSON.stringify(rp.riichi)} discards=${(st.zones[`discards:${WATCH}`]?.tileIds ?? []).length}`);
    }
    if (n === 13) prev = cur;
  },
});
console.log("done");
