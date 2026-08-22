/**
 * A2 — ankan_dora × mirror_dora × snake_kan(랭크 섞인 안깡) × dora_afterimage
 * 안깡 묶음마다 +4판(extraHan)과, 표시패에서 오는 도라가 어떻게 겹치는가.
 */
import { craft, setIndicator, setup, evalWin, extraHan, table, discardsZone, reserveInWall } from "./lib.js";
import type { GameState, TileId } from "./lib.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { doraAfterimage } from "../../../packages/content/src/augments/dora_afterimage.js";

const DEFS: Record<string, any> = { mirror_dora: mirrorDora, ankan_dora: ankanDora, dora_afterimage: doraAfterimage };

/** p0: 안깡 1개 + 손패 10장, p1의 5s로 론 (일기통관) */
function scene(kanSpec: string, indicator: string): GameState {
  let st = craft({
    hands: { p0: "123456789m5s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_closed", spec: kanSpec }] },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "5s" },
  });
  st = reserveInWall(st, [indicator]);
  return setIndicator(st, indicator);
}

function run(label: string, kanSpec: string, indicator: string, augs: string[]) {
  const game = setup(scene(kanSpec, indicator), augs.map((a) => ({ def: DEFS[a], holder: "p0" as const })));
  const ron = game.engine.state.zones[discardsZone("p1")]!.tileIds.at(-1) as TileId;
  const ev = evalWin(game, "p0", "ron", ron, { from: "p1" });
  const eh = extraHan(game, "p0");
  return { 조합: label, 깡: kanSpec, 표시패: indicator, doraHan: ev?.doraHan ?? -1, extraHan: eh, "han(정산)": (ev?.han ?? 0) + eh };
}

table("A2: 안깡 3333p · 표시패 9p(도라 1p, 앞도라 8p — 손·깡과 무관)", [
  run("없음", "3333p", "9p", []),
  run("ankan_dora", "3333p", "9p", ["ankan_dora"]),
  run("mirror", "3333p", "9p", ["mirror_dora"]),
  run("A+B", "3333p", "9p", ["ankan_dora", "mirror_dora"]),
]);

table("A2b: 안깡 3333p · 표시패 4p(도라 5p 없음, 거울 앞도라 3p = 깡 4장)", [
  run("없음", "3333p", "4p", []),
  run("ankan_dora", "3333p", "4p", ["ankan_dora"]),
  run("mirror", "3333p", "4p", ["mirror_dora"]),
  run("A+B", "3333p", "4p", ["ankan_dora", "mirror_dora"]),
]);

table("A2c: 안깡 3333p · 표시패 2p(표준 도라 3p = 깡 4장) — 표준 도라와 ankan_dora 겹침", [
  run("없음", "3333p", "2p", []),
  run("ankan_dora", "3333p", "2p", ["ankan_dora"]),
  run("mirror", "3333p", "2p", ["mirror_dora"]),
  run("A+B", "3333p", "2p", ["ankan_dora", "mirror_dora"]),
]);

table("A2d: 장사진 안깡 3456p (랭크 섞인 깡) · 표시패 9p", [
  run("없음", "3456p", "9p", []),
  run("ankan_dora", "3456p", "9p", ["ankan_dora"]),
  run("mirror", "3456p", "9p", ["mirror_dora"]),
  run("A+B", "3456p", "9p", ["ankan_dora", "mirror_dora"]),
]);
