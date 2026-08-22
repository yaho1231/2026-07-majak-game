/**
 * 손패 장수·패산/왕패 총량 불변식 — 손패 조작 증강을 **같은 순에 겹쳐 쓴다**.
 *
 * 기대(먼저 적는다):
 *   어떤 조합이든 ① 보유자 손패 14장(쯔모 직후) ② 상대 손패 13장
 *   ③ WALL+DEAD_WALL+손+바닥+멜드 = 136장, 같은 tileId 가 두 존에 겹치지 않음
 *   ④ 왕패 14장 유지.
 *   손패 장수를 바꾸는 것(분열·조커·밥상 뒤엎기·연금술)은 전부 "장수는 변하지 않는다"라고
 *   적혀 있으므로 두 개를 연달아 써도 같아야 한다.
 */
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import { timeStop } from "../../../packages/content/src/augments/time_stop.js";
import type { AugmentDef } from "@majak/core";
import {
  craft,
  withAugments,
  start,
  handIds,
  wallLen,
  deadLen,
  tileCensus,
  kindOverflow,
  handSpec,
  check,
  section,
  done,
  validate,
  type GameState,
  type PlayerId,
} from "./lib.js";

const DEFS: Record<string, AugmentDef> = {
  alchemist,
  tile_split: tileSplit,
  tile_dyeing: tileDyeing,
  even_world: evenWorld,
  suit_unify: suitUnify,
  table_flip: tableFlip,
  full_hand_swap: fullHandSwap,
  dead_wall_master: deadWallMaster,
  joker,
  conjure_draw: conjureDraw,
  take_back: takeBack,
  time_stop: timeStop,
};

function scene(augs: string[], hand = "234m567m99p234s55p5z"): GameState {
  return withAugments(
    craft({
      hands: { p0: hand, p1: "111p222p333p44s55s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: augs },
  );
}

interface Step {
  type: string;
  payload: unknown;
  player?: PlayerId;
}

/** 조합 하나를 돌리고 불변식을 잰다 */
function run(
  name: string,
  augs: string[],
  steps: (s: GameState, g: ReturnType<typeof start>["game"]) => (Step | ((s2: GameState) => Step))[],
  hand?: string,
): void {
  const st = scene(augs, hand);
  const before = {
    wall: wallLen(st),
    dead: deadLen(st),
    census: tileCensus(st),
  };
  const g = start(
    st,
    augs.map((a) => ({ def: DEFS[a] as AugmentDef, holder: "p0" as PlayerId })),
  );
  const list = steps(g.game.engine.state, g.game);
  const results: string[] = [];
  for (const raw of list) {
    const s = typeof raw === "function" ? raw(g.game.engine.state) : raw;
    const player = s.player ?? "p0";
    const v = validate(g.game, s.type, player, s.payload);
    results.push(`${s.type}:${JSON.stringify(v)}`);
    if (v !== null) continue;
    g.flow!.submit(player, { type: s.type, payload: s.payload });
  }
  const after = g.game.engine.state;
  const c = tileCensus(after);
  const over = kindOverflow(after);
  console.log(`\n  · ${name}  [${results.join(" | ")}]`);
  console.log(
    `    손패 p0=${handIds(after, "p0").length} p1=${handIds(after, "p1").length} · WALL ${before.wall}→${wallLen(after)} · DEAD ${before.dead}→${deadLen(after)} · 존내 총 ${c.total}`,
  );
  check(
    `${name}: 보유자 손패 14장`,
    handIds(after, "p0").length === 14,
    `${handIds(after, "p0").length}장 (${handSpec(after, "p0")})`,
  );
  check(`${name}: 상대 손패 13장`, handIds(after, "p1").length === 13, `${handIds(after, "p1").length}장`);
  check(`${name}: 왕패 14장`, deadLen(after) === 14, `${deadLen(after)}장`);
  check(`${name}: 존 중복 없음`, c.dupes.length === 0, c.dupes.join(","));
  check(`${name}: 총 136장`, c.total === 136, `${c.total}장`);
  if (Object.keys(over).length > 0) {
    console.log(`    ※ 5장 이상 존재하는 종류: ${JSON.stringify(over)}`);
  }
}

const num = (s: GameState, p: PlayerId, i: number): number => handIds(s, p)[i] as number;

section("손패 장수 불변식 — 같은 순에 둘 겹치기");

run("분열 → 연금술", ["tile_split", "alchemist"], (s) => [
  { type: "split_tile", payload: { tileId: num(s, "p0", 0), a: 1 } },
  { type: "alchemy", payload: { tileId: num(s, "p0", 3), delta: 1 } },
]);

run("연금술 → 분열", ["alchemist", "tile_split"], (s) => [
  { type: "alchemy", payload: { tileId: num(s, "p0", 3), delta: 1 } },
  { type: "split_tile", payload: { tileId: num(s, "p0", 0), a: 1 } },
]);

run("연금술 → 염색 (같은 순, 서로 다른 턴 가드)", ["alchemist", "tile_dyeing"], (s) => [
  { type: "alchemy", payload: { tileId: num(s, "p0", 0), delta: 1 } },
  { type: "tile_dye", payload: { tileId: num(s, "p0", 1), suit: "sou" } },
]);

run("연금술 ×2 (같은 순 재사용 차단 확인)", ["alchemist"], (s) => [
  { type: "alchemy", payload: { tileId: num(s, "p0", 0), delta: 1 } },
  { type: "alchemy", payload: { tileId: num(s, "p0", 1), delta: 1 } },
]);

run("분열 → 짝수의 세계", ["tile_split", "even_world"], (s) => [
  { type: "split_tile", payload: { tileId: num(s, "p0", 2), a: 1 } },
  { type: "even_world_flip", payload: {} },
]);

run("짝수의 세계 → 분열", ["even_world", "tile_split"], (s) => [
  { type: "even_world_flip", payload: {} },
  { type: "split_tile", payload: { tileId: num(s, "p0", 2), a: 1 } },
]);

run("단색 세계 → 분열", ["suit_unify", "tile_split"], (s) => [
  { type: "mono_world", payload: { suit: "pin" } },
  { type: "split_tile", payload: { tileId: num(s, "p0", 2), a: 1 } },
]);

run("분열 → 단색 세계", ["tile_split", "suit_unify"], (s) => [
  { type: "split_tile", payload: { tileId: num(s, "p0", 2), a: 1 } },
  { type: "mono_world", payload: { suit: "pin" } },
]);

run("단색 세계 → 염색 → 연금술 (3중)", ["suit_unify", "tile_dyeing", "alchemist"], () => [
  { type: "mono_world", payload: { suit: "sou" } },
  (s2: GameState) => ({ type: "tile_dye", payload: { tileId: num(s2, "p0", 0), suit: "man" } }),
  (s2: GameState) => ({ type: "alchemy", payload: { tileId: num(s2, "p0", 1), delta: -1 } }),
]);

run("왕패의 주인 ×2 → 밥상 뒤엎기", ["dead_wall_master", "table_flip"], (s) => [
  { type: "dw_swap", payload: { handTileId: num(s, "p0", 0), deadIndex: 0 } },
  { type: "dw_swap", payload: { handTileId: num(s, "p0", 1), deadIndex: 1 } },
  { type: "table_flip_do", payload: {} },
]);

run("밥상 뒤엎기 → 왕패의 주인 ×2", ["table_flip", "dead_wall_master"], () => [
  { type: "table_flip_do", payload: {} },
  (s2: GameState) => ({ type: "dw_swap", payload: { handTileId: num(s2, "p0", 0), deadIndex: 0 } }),
  (s2: GameState) => ({ type: "dw_swap", payload: { handTileId: num(s2, "p0", 1), deadIndex: 1 } }),
]);

run("밥상 뒤엎기 → 통째로 바꾸기", ["table_flip", "full_hand_swap"], () => [
  { type: "table_flip_do", payload: {} },
  { type: "hand_swap", payload: { target: "p1" } },
]);

run("통째로 바꾸기 → 밥상 뒤엎기", ["full_hand_swap", "table_flip"], () => [
  { type: "hand_swap", payload: { target: "p1" } },
  { type: "table_flip_do", payload: {} },
]);

run("왕패의 주인 → 통째로 바꾸기", ["dead_wall_master", "full_hand_swap"], (s) => [
  { type: "dw_swap", payload: { handTileId: num(s, "p0", 0), deadIndex: 4 } },
  { type: "hand_swap", payload: { target: "p1" } },
]);

run("조커 → 분열", ["joker", "tile_split"], (s) => [
  { type: "joker_call", payload: {} },
  { type: "split_tile", payload: { tileId: num(s, "p0", 0), a: 1 } },
], "234m567m99p234s5p5z5z");

run("소환 → 무르기 (같은 순)", ["conjure_draw", "take_back"], (s) => [
  { type: "conjure_tsumo", payload: { tileId: num(s, "p0", 0) } },
  { type: "take_back", payload: {} },
]);

run("시간 정지 → 분열", ["time_stop", "tile_split"], (s) => [
  { type: "time_stop_use", payload: {} },
  { type: "split_tile", payload: { tileId: num(s, "p0", 0), a: 1 } },
]);

done();
