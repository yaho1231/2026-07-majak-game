/**
 * 조커 소크 — 봇 넷에게 조커를 쥐어 주고, **켜진 뒤** 봇의 읽기가 실제로 틀리는 횟수를 센다.
 *
 * 불변식: `buildRead`가 노텐이라고 한 손이 실제로는 화료 대기를 갖고 있으면 안 된다.
 *   (`winningKinds(hand, meldCount, undefined, view.scoringOptions)`가 진실이다 —
 *    코어 채점기가 화료를 인정하는 기준이 그것이다)
 *
 *   tsx qa-lab/bot/joker_soak.ts <games> <out.json>
 */
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
  standardAugments,
  winningKinds,
  handZone,
} from "@majak/core";
import type { PlayerId, PlayerView, TileKind } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { buildRead } from "../../packages/server/src/bot/read.js";
import { newMetrics, patchBot, wrapCatalog } from "./instrument.js";
import { writeFileSync } from "node:fs";

const games = Number(process.argv[2] ?? 8);
const out = process.argv[3] ?? "/tmp/joker_soak.json";
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

const m = newMetrics();
const restore = patchBot(m);
const catalog = wrapCatalog(m, contentAugments);
const botCatalog = [...standardAugments, ...catalog];

let decisions = 0;
let wildDecisions = 0;
let blindTenpai = 0;
let blindDiscardOfWait = 0;
const samples: string[] = [];

m.onDecision = ({ bot, chosen }) => {
  const view = (bot as unknown as { lastView: PlayerView | null }).lastView;
  if (view === null) return;
  decisions++;
  const opts = view.scoringOptions ?? {};
  if ((opts as { wildKinds?: unknown[] }).wildKinds === undefined) return;
  wildDecisions++;
  const me = (bot as unknown as { id: PlayerId }).id;
  const hand: TileKind[] = [];
  for (const id of view.zones[handZone(me)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) hand.push(k);
  }
  if (hand.length === 0) return;
  const read = buildRead(view, me, { mode: "tonpuu" });
  const meldCount = view.round.byPlayer[me]?.meldCount ?? 0;
  // 13장이면 그대로, 14장이면 한 장 빼 보며 대기가 있는지
  let realWaits: TileKind[] = winningKinds(hand, meldCount, undefined, opts);
  if (realWaits.length === 0 && hand.length % 3 === 2) {
    for (let i = 0; i < hand.length; i++) {
      const rest = hand.slice(0, i).concat(hand.slice(i + 1));
      const w = winningKinds(rest, meldCount, undefined, opts);
      if (w.length > realWaits.length) realWaits = w;
    }
  }
  if (!read.tenpai && realWaits.length > 0) {
    blindTenpai++;
    if (samples.length < 5) {
      samples.push(
        `${me} shanten=${read.shanten} tenpai=false 이지만 실제 대기 ${realWaits.length}종 · 선택=${chosen?.type}`,
      );
    }
    if (chosen?.type === "discard") blindDiscardOfWait++;
  }
};

for (let g = 0; g < games; g++) {
  const seed = 770_000 + g * 37;
  const bots = SEATS.map((s, i) => {
    const b = new BotAgent(s, `Bot_${s}`, seed + i, botCatalog);
    b.setGameMode("tonpuu");
    return b;
  });
  const preset = Object.fromEntries(SEATS.map((s) => [s, ["joker"]])) as Record<
    PlayerId,
    readonly string[]
  >;
  const ctrl = new HanchanController(
    bots,
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
    {} as never,
  );
  try {
    await ctrl.run();
  } catch (err) {
    console.log(`game ${g} CRASH ${String(err).slice(0, 200)}`);
  }
  console.log(
    `game ${g}: decisions=${decisions} wild=${wildDecisions} 노텐으로_읽은_텐파이=${blindTenpai} 그중_버림=${blindDiscardOfWait}`,
  );
}
restore();
const jokerFired = m.aug.get("joker")?.fired ?? 0;
writeFileSync(
  out,
  JSON.stringify(
    { games, decisions, wildDecisions, blindTenpai, blindDiscardOfWait, jokerFired, samples },
    null,
    1,
  ),
);
console.log(JSON.stringify({ games, decisions, wildDecisions, blindTenpai, blindDiscardOfWait, jokerFired, samples }, null, 1));
