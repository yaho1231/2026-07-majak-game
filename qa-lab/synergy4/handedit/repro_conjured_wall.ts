/**
 * «만든 패»가 공용 패산으로 새어 나간다 — 손패를 **가공하는 카드** + 손패를 **패산으로
 * 되돌리는 카드**의 조합.
 *
 * 가공(생성패를 만든다): 염색·연금술사·분열·짝수의 세계·단색 세계·편식·조커·
 *                        삼원의 의지·소환·미련(다음 국 배패 주입)
 * 반납(손패를 패산 맨 밑으로 보낸다): 개벽·밥상 뒤엎기·통째로 바꾸기·미래를 보는 자·
 *                        단색 세계 자신·무르기
 *
 * 예측(먼저 적는다):
 *   각 카드의 설명은 «손패 장수도 패산 총량도 변하지 않는다»만 약속한다. 실물 수지는
 *   맞겠지만, 가공된 실물이 패산으로 돌아가면 **그 종류가 게임 안에 5장 이상 존재하게
 *   되고 아무나 그것을 뽑는다.** synergy3 handedit 의심 2 가 소환×무르기 한 장으로
 *   이 경로를 지적했고 "같은 경로가 단색 세계·밥상 뒤엎기·통째로 바꾸기에도 있다"고
 *   적은 채 확인하지 않았다. 여기서 그 나머지를 실제로 재고, **남이 그 패를 실제로
 *   뽑는 데까지** 몰아 본다.
 */
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { genesis } from "../../../packages/content/src/augments/genesis.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { threeDragonsWill } from "../../../packages/content/src/augments/three_dragons_will.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { craft, withAugments, tileCensus, check, section, done } from "./lib.js";

const DEFS: Record<string, unknown> = {
  tile_dyeing: tileDyeing,
  suit_unify: suitUnify,
  alchemist,
  tile_split: tileSplit,
  even_world: evenWorld,
  genesis,
  joker,
  table_flip: tableFlip,
  three_dragons_will: threeDragonsWill,
  full_hand_swap: fullHandSwap,
  future_sight: futureSight,
};
const SEQ: Record<string, string[]> = {
  tile_dyeing: ["tile_dye"],
  suit_unify: ["mono_world"],
  alchemist: ["alchemy"],
  tile_split: ["split_tile"],
  even_world: ["even_world_flip"],
  genesis: ["genesis_flip"],
  joker: ["joker_call"],
  table_flip: ["table_flip_do"],
  three_dragons_will: ["dragons_will"],
  full_hand_swap: ["hand_swap"],
  future_sight: ["future_arm", "future_exchange"],
};

const MAKERS = [
  "tile_dyeing",
  "alchemist",
  "tile_split",
  "even_world",
  "suit_unify",
  "joker",
  "three_dragons_will",
];
const RETURNERS = ["genesis", "table_flip", "full_hand_swap", "future_sight"];

type Game = ReturnType<typeof createStandardGameFromState>;

function scene(augs: string[]): { game: Game; flow: FlowController } {
  const base = craft({
    hands: { p0: "1234m11p99s555z666z", p1: "234p567p234s789s1m", p2: "*", p3: "*" },
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
function press(flow: FlowController, types: string[]): string[] {
  const fired: string[] = [];
  for (const t of types) {
    const st = flow.begin();
    if (st.kind !== "awaiting") break;
    const o =
      st.prompts.find((p) => p.player === "p0")?.options.filter((x) => x.type === t) ?? [];
    if (o.length === 0) continue;
    flow.submit("p0" as never, o[0] as never);
    fired.push(t);
  }
  return fired;
}
/** 게임 전체에서 종류별 실물 장수 — 4장을 넘는 것만 */
function overflow(s: GameState): Record<string, number> {
  const c = new Map<string, number>();
  for (const t of Object.values(s.tiles)) c.set(kindKey(t.kind), (c.get(kindKey(t.kind)) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const [k, n] of c) if (n > 4) out[k] = n;
  return out;
}
/** 패산에 들어 있는 생성패 */
function inWall(s: GameState): string[] {
  const out: string[] = [];
  for (const id of s.zones[WALL]?.tileIds ?? []) {
    if (s.tiles[id]?.attrs?.conjured === true) out.push(kindKey(kindOf(s, id)));
  }
  return out;
}

section("§1 가공 → 반납: 생성패가 패산으로 돌아가는가 (28 조합)");
let leaks = 0;
for (const m of MAKERS) {
  for (const r of RETURNERS) {
    const { game, flow } = scene([m, r]);
    const fired = press(flow, [...(SEQ[m] as string[]), ...(SEQ[r] as string[])]);
    const s = game.engine.state;
    const w = inWall(s);
    const c = tileCensus(s);
    const ok = c.dupes.length === 0 && c.total === 136;
    if (w.length > 0) leaks++;
    console.log(
      `  ${w.length === 0 ? "· " : "‼ "}${m} → ${r}: 발동[${fired.join(">")}] 패산 속 생성패 ${w.length}장 ${JSON.stringify(w)} · 게임 내 4장 초과 ${JSON.stringify(overflow(s))} · census ${c.total}/${c.dupes.length}`,
    );
    check(`${m}→${r}: 실물 수지(136·중복0)는 유지`, ok, `${c.total}/${c.dupes.length}`);
  }
}
console.log(`\n  생성패가 패산으로 샌 조합 = ${leaks} / 28`);

// ────────────────────────────────────────────────────────────
section("§2 그 패를 «남»이 실제로 뽑는가 — 삼원의 의지 → 밥상 뒤엎기");
{
  const { game, flow } = scene(["three_dragons_will", "table_flip"]);
  press(flow, ["dragons_will", "table_flip_do"]);
  const before = game.engine.state;
  console.log(`  · 반납 직후 게임 내 4장 초과 = ${JSON.stringify(overflow(before))}`);
  const leaked = new Set(
    (before.zones[WALL]?.tileIds ?? []).filter((id) => before.tiles[id]?.attrs?.conjured === true),
  );
  console.log(`  · 패산 속 생성패 tileId = ${JSON.stringify([...leaked])}`);
  // 국을 계속 돌려 남이 그 패를 뽑는지 본다
  let st = flow.begin();
  let steps = 0;
  const drawnBy = new Map<TileId, PlayerId>();
  while (st.kind === "awaiting" && steps < 400) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    if (drawn !== null && leaked.has(drawn) && !drawnBy.has(drawn)) {
      drawnBy.set(drawn, pr.player);
    }
    const pick =
      pr.options.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
      ) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    st = flow.submit(pr.player, pick as never);
  }
  const others = [...drawnBy.entries()].filter(([, who]) => who !== "p0");
  console.log(
    `  · 생성패를 뽑은 사람 = ${JSON.stringify([...drawnBy.entries()].map(([id, w]) => `${id}:${w}`))}`,
  );
  check(
    "생성패(5장째 이상)를 보유자 아닌 사람이 뽑았다 — 공용 패산 오염이 실제로 남에게 간다",
    others.length > 0,
    `${others.length}명분`,
  );
  // 그 사람 손에 같은 종류가 몇 장까지 쌓였나
  const s2 = game.engine.state;
  for (const p of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    const cnt = new Map<string, number>();
    for (const id of s2.zones[handZone(p)]?.tileIds ?? []) {
      const k = kindKey(kindOf(s2, id));
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
    const big = [...cnt.entries()].filter(([, n]) => n >= 4);
    if (big.length > 0) console.log(`  · ${p} 손에 ${JSON.stringify(big)}`);
  }
  const c = tileCensus(s2);
  check("끝까지 실물 수지는 유지된다 (136·중복0)", c.dupes.length === 0 && c.total === 136, `${c.total}/${c.dupes.length}`);
}

done();
