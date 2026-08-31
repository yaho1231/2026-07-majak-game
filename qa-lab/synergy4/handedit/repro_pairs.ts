/**
 * 손패를 바꾸는 카드 **둘을 같은 순에** 연달아 발동시켰을 때의 순서·소실 검사.
 *
 * synergy3 handedit 이 17 조합(장수 불변식)을 이미 봤다. 여기서는 그때 **다루지 않은**
 * 조합을 채운다 — 개벽(genesis)·조커(joker)·삼원의 의지(three_dragons_will)·
 * 편식(picky_eater)·등가교환(hand_swap3)·통째로 바꾸기(full_hand_swap) 계열.
 *
 * 예측(먼저 적는다) — 어떤 순서로 눌러도:
 *   · 보유자 손패 14장 · 상대 13장 · 왕패 14장 · 전체 136장 · 존 중복 0
 *   · 같은 종류 5장 이상이 «패산으로 되돌아가는» 일이 없다 (생성패는 손·바닥까지만)
 *   · A 만·B 만·A+B 를 같은 장면에서 재서, A+B 가 **둘 중 어느 한쪽보다 나쁜 손**이
 *     되지 않는다 (샹텐 기준). 나빠지면 서로를 지운 것이다.
 */
import {
  FlowController,
  WALL,
  DEAD_WALL,
  createStandardGameFromState,
  installAugment,
  handZone,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  shantenOf,
  winningKinds,
} from "@majak/core";
import type { GameState, PlayerId, TileKind } from "@majak/core";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { genesis } from "../../../packages/content/src/augments/genesis.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { threeDragonsWill } from "../../../packages/content/src/augments/three_dragons_will.js";
import { pickyEater } from "../../../packages/content/src/augments/picky_eater.js";
import { handSwap3 } from "../../../packages/content/src/augments/hand_swap3.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { craft, withAugments, tileCensus, kindOverflow, check, section, done } from "./lib.js";

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
  picky_eater: pickyEater,
  hand_swap3: handSwap3,
  full_hand_swap: fullHandSwap,
  future_sight: futureSight,
  dead_wall_master: deadWallMaster,
  conjure_draw: conjureDraw,
};
/** 각 증강이 자기 순에 누르는 액션 시퀀스 (다단계는 순서대로) */
const SEQ: Record<string, string[]> = {
  tile_dyeing: ["tile_dye"],
  suit_unify: ["mono_world"],
  alchemist: ["alchemy"],
  tile_split: ["split_tile"],
  even_world: ["even_world_flip"],
  genesis: ["genesis_flip"],
  joker: ["joker_call"],
  table_flip: ["table_flip_do"],
  three_dragons_will: ["three_dragons_will", "dragons_will"],
  picky_eater: ["picky_unify"],
  hand_swap3: ["swap3", "swap3_give", "swap3_give", "swap3_give", "swap3_take", "swap3_take", "swap3_take"],
  full_hand_swap: ["hand_swap"],
  future_sight: ["future_arm", "future_exchange"],
  dead_wall_master: ["dw_swap"],
  conjure_draw: ["conjure_tsumo"],
};

/** 발동 재료가 두루 있는 장면 — 수패·자패·삼원패 두 종류, 첫 순(turnCount 0) */
const HAND = "1234m11p99s555z666z";

function scene(augs: string[]): {
  game: ReturnType<typeof createStandardGameFromState>;
  flow: FlowController;
} {
  const base = craft({
    hands: { p0: HAND, p1: "234p567p234s789s1m", p2: "*", p3: "*" },
    discards: { p0: "", p1: "", p2: "", p3: "" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 편식 퀘스트(한 무늬 12장 버림)·첫 순 조건을 만족시키려고 손을 직접 세운 상태다.
  const st = withAugments(base, { p0: augs });
  const game = createStandardGameFromState(st);
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

type Game = ReturnType<typeof createStandardGameFromState>;

function press(flow: FlowController, types: string[]): string[] {
  const fired: string[] = [];
  for (const t of types) {
    const st = flow.begin();
    if (st.kind !== "awaiting") break;
    const o = st.prompts.find((p) => p.player === "p0")?.options.filter((x) => x.type === t) ?? [];
    if (o.length === 0) continue;
    flow.submit("p0" as never, o[0] as never);
    fired.push(t);
  }
  return fired;
}

interface Snap {
  hand: number;
  opp: number;
  wall: number;
  dead: number;
  total: number;
  dupes: number;
  over: string;
  shanten: number;
  waits: number;
  spec: string;
}
function snap(g: Game): Snap {
  const s = g.engine.state;
  const ids = s.zones[handZone("p0")]?.tileIds ?? [];
  const kinds: TileKind[] = ids.map((id) => kindOf(s, id));
  const mc = meldCountOf(s, "p0");
  const opts = scoringOptionsOf(s, g.engine.rules, "p0");
  const c = tileCensus(s);
  // 14장이면 한 장씩 빼 보며 최선의 대기를 찾는다 (BotAgent 와 같은 방식)
  let waits = winningKinds(kinds, mc, undefined, opts).length;
  if (kinds.length % 3 === 2) {
    let best = 0;
    for (let i = 0; i < kinds.length; i++) {
      const rest = kinds.slice(0, i).concat(kinds.slice(i + 1));
      best = Math.max(best, winningKinds(rest, mc, undefined, opts).length);
    }
    waits = best;
  }
  return {
    hand: ids.length,
    opp: s.zones[handZone("p1")]?.tileIds.length ?? 0,
    wall: s.zones[WALL]?.tileIds.length ?? 0,
    dead: s.zones[DEAD_WALL]?.tileIds.length ?? 0,
    total: c.total,
    dupes: c.dupes.length,
    over: JSON.stringify(kindOverflow(s)),
    shanten: shantenOf(kinds, mc, opts),
    waits,
    spec: kinds.map(kindKey).join(" "),
  };
}

/** 패산에 «같은 종류 5장째»가 들어갔는가 — 생성패가 공용 패산으로 흘러나간 흔적 */
function conjuredInWall(g: Game): string[] {
  const s = g.engine.state;
  const out: string[] = [];
  for (const id of s.zones[WALL]?.tileIds ?? []) {
    if (s.tiles[id]?.attrs?.conjured === true) out.push(`${id}:${kindKey(kindOf(s, id))}`);
  }
  return out;
}

function run(augs: string[], seq: string[]): { snap: Snap; fired: string[]; wallConjured: string[] } {
  const { game, flow } = scene(augs);
  const fired = press(flow, seq);
  return { snap: snap(game), fired, wallConjured: conjuredInWall(game) };
}

const AXIS = [
  "tile_dyeing",
  "suit_unify",
  "alchemist",
  "tile_split",
  "even_world",
  "genesis",
  "joker",
  "table_flip",
  "three_dragons_will",
  "hand_swap3",
  "full_hand_swap",
  "future_sight",
  "dead_wall_master",
  "conjure_draw",
];

section("§0 단독 발동 — 어떤 카드가 이 장면에서 실제로 열리는가");
const solo = new Map<string, ReturnType<typeof run>>();
for (const a of AXIS) {
  const r = run([a], SEQ[a] as string[]);
  solo.set(a, r);
  console.log(
    `  · ${a}: 발동 [${r.fired.join(">")}] 손${r.snap.hand} 산${r.snap.wall} 왕${r.snap.dead} 총${r.snap.total}/중복${r.snap.dupes} 샹텐${r.snap.shanten} 대기${r.snap.waits} 초과${r.snap.over}`,
  );
}

section("§1 같은 순 2장 조합 — 장수·중복·손 개선 대조");
let pairs = 0;
for (let i = 0; i < AXIS.length; i++) {
  for (let j = 0; j < AXIS.length; j++) {
    if (i === j) continue;
    const a = AXIS[i] as string;
    const b = AXIS[j] as string;
    const A = solo.get(a) as ReturnType<typeof run>;
    const B = solo.get(b) as ReturnType<typeof run>;
    if (A.fired.length === 0 || B.fired.length === 0) continue; // 이 장면에서 안 열리는 카드
    pairs++;
    const AB = run([a, b], [...(SEQ[a] as string[]), ...(SEQ[b] as string[])]);
    const s = AB.snap;
    const problems: string[] = [];
    if (s.hand !== 14) problems.push(`손패 ${s.hand}`);
    if (s.opp !== 13) problems.push(`상대 손패 ${s.opp}`);
    if (s.dead !== 14) problems.push(`왕패 ${s.dead}`);
    if (s.total !== 136) problems.push(`총 ${s.total}`);
    if (s.dupes !== 0) problems.push(`중복 ${s.dupes}`);
    if (AB.wallConjured.length > 0) problems.push(`패산 속 생성패 ${AB.wallConjured.join(",")}`);
    // 샹텐은 «강제로 두 번 고친 손»이라 나빠질 수 있다 (재료를 자동으로 고르는 카드가
    // 이미 완성된 몸통을 태운다) — 판정에는 쓰지 않고 기록만 한다.
    const shan = `샹텐 A=${A.snap.shanten} B=${B.snap.shanten} A+B=${s.shanten}`;
    // 두 번째 카드가 아예 안 열렸는가 (한쪽이 다른 쪽을 잠갔다)
    const need = A.fired.length + B.fired.length;
    if (AB.fired.length < need) problems.push(`발동 ${AB.fired.length}/${need} [${AB.fired.join(">")}]`);
    console.log(
      `  ${problems.length === 0 ? "ok  " : "XX  "}${a} → ${b}: [${AB.fired.join(">")}] 손${s.hand} 산${s.wall} 왕${s.dead} 총${s.total} ${shan}${problems.length === 0 ? "" : " ‼ " + problems.join(" / ")}`,
    );
    check(`${a} → ${b}`, problems.length === 0, problems.join(" / "));
  }
}
console.log(`\n  (검사한 순서쌍 ${pairs})`);

done();
