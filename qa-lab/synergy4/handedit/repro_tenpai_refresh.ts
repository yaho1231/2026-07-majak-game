/**
 * 손패를 바꾼 **직후** 텐파이 판정이 갱신되는가 — 단독/2장 조합.
 *
 * 예측(먼저 적는다): 손패를 고친 결과 «어떤 한 장을 버리면 텐파이»가 되면, 그 자리에서
 * 리치 후보(`riichi`)가 제시돼야 한다(멘젠·점수·패산 조건은 장면에서 전부 만족시킨다).
 * 반대로 텐파이가 아니게 되면 리치 후보가 사라져야 한다. 갱신이 한 박자 늦으면
 * «고쳐서 텐파이가 됐는데 리치를 못 건다» 또는 그 반대가 나온다.
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  handZone,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type { GameState, TileKind } from "@majak/core";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { genesis } from "../../../packages/content/src/augments/genesis.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { craft, withAugments, check, section, done } from "./lib.js";

type Game = ReturnType<typeof createStandardGameFromState>;
const DEFS: Record<string, unknown> = {
  tile_dyeing: tileDyeing,
  alchemist,
  tile_split: tileSplit,
  even_world: evenWorld,
  genesis,
  joker,
  suit_unify: suitUnify,
  table_flip: tableFlip,
  full_hand_swap: fullHandSwap,
  future_sight: futureSight,
  dead_wall_master: deadWallMaster,
};
const SEQ: Record<string, string[]> = {
  tile_dyeing: ["tile_dye"],
  alchemist: ["alchemy"],
  tile_split: ["split_tile"],
  even_world: ["even_world_flip"],
  genesis: ["genesis_flip"],
  joker: ["joker_call"],
  suit_unify: ["mono_world"],
  table_flip: ["table_flip_do"],
  full_hand_swap: ["hand_swap"],
  future_sight: ["future_arm", "future_exchange"],
  dead_wall_master: ["dw_swap"],
};
const IDS = Object.keys(SEQ);

function scene(augs: string[]): { game: Game; flow: FlowController } {
  const base = craft({
    // 1샹텐 — 한 장만 고치면 텐파이가 되는 손
    hands: { p0: "123m456m789m147p2p", p1: "234p567p234s789s1m", p2: "*", p3: "*" },
    discards: { p0: "", p1: "", p2: "", p3: "" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(withAugments(base, { p0: augs }));
  for (const a of augs) {
    installAugment(game.engine, DEFS[a] as never, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    } as never);
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}
function opts(flow: FlowController): { type: string; payload?: unknown }[] {
  const st = flow.begin();
  return st.kind === "awaiting" ? (st.prompts.find((p) => p.player === "p0")?.options ?? []) : [];
}
function press(flow: FlowController, types: string[]): string[] {
  const fired: string[] = [];
  for (const t of types) {
    const o = opts(flow).filter((x) => x.type === t);
    if (o.length === 0) continue;
    flow.submit("p0" as never, o[0] as never);
    fired.push(t);
  }
  return fired;
}
/** 14장 손에서 «한 장 버리면 텐파이»인가 — 코어 판정으로 직접 계산한 진실값 */
function tenpaiAfterDiscard(g: Game): boolean {
  const s: GameState = g.engine.state;
  const ids = s.zones[handZone("p0")]?.tileIds ?? [];
  const kinds: TileKind[] = ids.map((id) => kindOf(s, id));
  const mc = meldCountOf(s, "p0");
  const o = scoringOptionsOf(s, g.engine.rules, "p0");
  for (let i = 0; i < kinds.length; i++) {
    const rest = kinds.slice(0, i).concat(kinds.slice(i + 1));
    if (winningKinds(rest, mc, undefined, o).length > 0) return true;
  }
  return false;
}

function probe(label: string, augs: string[], seq: string[]): void {
  const { game, flow } = scene(augs);
  const fired = press(flow, seq);
  if (fired.length === 0) {
    console.log(`  -   ${label}: 이 장면에서 발동하지 않음`);
    return;
  }
  const truth = tenpaiAfterDiscard(game);
  const offered = opts(flow).some((o) => o.type === "riichi");
  const ok = truth === offered;
  console.log(
    `  ${ok ? "ok  " : "XX  "}${label}: 발동[${fired.join(">")}] 코어 텐파이=${truth} · 리치 후보=${offered}`,
  );
  check(label, ok, `텐파이=${truth} 리치후보=${offered}`);
}

section("§0 기준선 — 아무것도 안 고친 손");
{
  const { game, flow } = scene([]);
  console.log(
    `  · 코어 텐파이=${tenpaiAfterDiscard(game)} · 리치 후보=${opts(flow).some((o) => o.type === "riichi")}`,
  );
}

section("§1 단독 — 고친 직후 텐파이 판정과 리치 후보가 일치하는가");
for (const a of IDS) probe(a, [a], SEQ[a] as string[]);

section("§2 같은 순 2장 — 두 번 고친 직후");
for (const a of IDS) {
  for (const b of IDS) {
    if (a === b) continue;
    probe(`${a} → ${b}`, [a, b], [...(SEQ[a] as string[]), ...(SEQ[b] as string[])]);
  }
}

done();
