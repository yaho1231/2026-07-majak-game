/**
 * 패산·왕패를 건드리는 것들을 겹친다 — 미래를 보는 자 · 왕패의 주인 · 소환 · 밥상 뒤엎기.
 *
 * 기대(먼저 적는다):
 *   왕패는 언제나 14장, 패산+왕패+손+바닥+멜드 = 136장, tileId 중복 0.
 *   미래를 보는 자: "나머지 2장은 패산 맨 밑으로 가고 3장을 새로 받는다" → 패산 총량 불변,
 *   손패 장수 불변. 왕패의 주인: 1:1 교환이라 왕패 14장 불변.
 *   소환: "패산도 손패 장수도 그대로다".
 */
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import type { AugmentDef } from "@majak/core";
import {
  craft,
  withAugments,
  start,
  handIds,
  wallLen,
  deadLen,
  tileCensus,
  check,
  section,
  done,
  validate,
  type GameState,
  type PlayerId,
} from "./lib.js";

const DEFS: Record<string, AugmentDef> = {
  future_sight: futureSight,
  dead_wall_master: deadWallMaster,
  conjure_draw: conjureDraw,
  table_flip: tableFlip,
  take_back: takeBack,
};

function scene(augs: string[]): GameState {
  return withAugments(
    craft({
      hands: { p0: "234m567m99p234s55p5z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: augs },
  );
}

type Step = { type: string; payload: unknown } | ((s: GameState) => { type: string; payload: unknown });

function run(name: string, augs: string[], steps: Step[]): void {
  const st = scene(augs);
  const g = start(
    st,
    augs.map((a) => ({ def: DEFS[a] as AugmentDef, holder: "p0" as PlayerId })),
  );
  const res: string[] = [];
  for (const raw of steps) {
    let s = typeof raw === "function" ? raw(g.game.engine.state) : raw;
    let v = validate(g.game, s.type, "p0", s.payload);
    if (s.type === "future_exchange" && v === "tile is not among the three") {
      // 뽑히는 3장은 statePrng 로 정해진다 — 손패를 훑어 통과하는 것을 찾는다
      for (const id of handIds(g.game.engine.state, "p0")) {
        const cand = { type: s.type, payload: { tileId: id } };
        const cv = validate(g.game, cand.type, "p0", cand.payload);
        if (cv === null) { s = cand; v = null; break; }
      }
    }
    res.push(`${s.type}:${JSON.stringify(v)}`);
    if (v === null) g.flow!.submit("p0", { type: s.type, payload: s.payload });
  }
  const a = g.game.engine.state;
  const c = tileCensus(a);
  console.log(`\n  · ${name} [${res.join(" | ")}]`);
  console.log(`    손패 ${handIds(a, "p0").length} · WALL ${wallLen(st)}→${wallLen(a)} · DEAD ${deadLen(st)}→${deadLen(a)} · 총 ${c.total}`);
  check(`${name}: 왕패 14장`, deadLen(a) === 14, String(deadLen(a)));
  check(`${name}: 손패 14장`, handIds(a, "p0").length === 14, String(handIds(a, "p0").length));
  check(`${name}: 중복 0`, c.dupes.length === 0, c.dupes.join(","));
  check(`${name}: 총 136장`, c.total === 136, String(c.total));
  check(
    `${name}: 패산+왕패 합이 보존된다`,
    wallLen(a) + deadLen(a) === wallLen(st) + deadLen(st),
    `${wallLen(st) + deadLen(st)} → ${wallLen(a) + deadLen(a)}`,
  );
}

const hid = (s: GameState, i: number): number => handIds(s, "p0")[i] as number;
/** 미래를 보는 자가 뽑아 보여 준 3장 중 첫 장 */
function futurePick(s: GameState): number {
  const key = Object.keys(s.augmentData).find((k) => k.includes("revealTiles:future"));
  const v = key === undefined ? undefined : s.augmentData[key];
  const ids = Array.isArray(v) ? (v as number[]) : [];
  return ids[0] ?? hid(s, 0);
}

section("패산·왕패 조작 겹치기");

run("미래를 보는 자 (무장→교환)", ["future_sight"], [
  { type: "future_arm", payload: {} },
  (s) => ({ type: "future_exchange", payload: { tileId: futurePick(s) } }),
]);

run("왕패의 주인 ×2 → 미래를 보는 자", ["dead_wall_master", "future_sight"], [
  (s) => ({ type: "dw_swap", payload: { handTileId: hid(s, 0), deadIndex: 0 } }),
  (s) => ({ type: "dw_swap", payload: { handTileId: hid(s, 1), deadIndex: 3 } }),
  { type: "future_arm", payload: {} },
  (s) => ({ type: "future_exchange", payload: { tileId: futurePick(s) } }),
]);

run("미래를 보는 자 → 왕패의 주인", ["future_sight", "dead_wall_master"], [
  { type: "future_arm", payload: {} },
  (s) => ({ type: "future_exchange", payload: { tileId: futurePick(s) } }),
  (s) => ({ type: "dw_swap", payload: { handTileId: hid(s, 0), deadIndex: 0 } }),
]);

run("왕패의 주인(도라 표시패 자리) → 밥상 뒤엎기 → 무르기", ["dead_wall_master", "table_flip", "take_back"], [
  (s) => ({ type: "dw_swap", payload: { handTileId: hid(s, 0), deadIndex: 4 } }),
  { type: "table_flip_do", payload: {} },
  { type: "take_back", payload: {} },
]);

run("소환 → 미래를 보는 자", ["conjure_draw", "future_sight"], [
  (s) => ({ type: "conjure_tsumo", payload: { tileId: hid(s, 0) } }),
  { type: "future_arm", payload: {} },
  (s) => ({ type: "future_exchange", payload: { tileId: futurePick(s) } }),
]);

done();
