/**
 * A그룹 — 개인 도라를 늘리는 증강들의 4칸 대조군.
 * mirror_dora × dora_afterimage × ankan_dora × north_trader
 */
import {
  craft, setIndicator, setUraIndicator, setup, evalWin, extraHan, table,
  handZone, discardsZone, kindKey, kindOf, reserveInWall,
} from "./lib.js";
import type { GameState, TileId } from "./lib.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { doraAfterimage } from "../../../packages/content/src/augments/dora_afterimage.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";

/** p0: 123456789m 234p + 5s (13장), p1이 5s를 버려 론 → 일기통관 */
function scene(): GameState {
  let st = craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "5s" },
  });
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m"); // 도라 = 5m (손에 1장), 거울 앞도라 = 3m (손에 1장)
  return st;
}

/** 직전 국 도라 종류를 심는다 (dora_afterimage가 되살릴 대상) */
function withPrevDora(st: GameState, kinds: { suit: string; rank: number }[], holder = "p0"): GameState {
  const roundKey = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  return {
    ...st,
    augmentData: {
      ...st.augmentData,
      "dora_afterimage:prevDora": kinds,
      // 이번 국에 이미 되살린 것으로 굳힌다 (액션 경로는 따로 검증)
      [`dora_afterimage:recalled:${roundKey}:${holder}#round`]: kinds,
    },
  };
}

function run(label: string, augs: string[], prev?: { suit: string; rank: number }[]) {
  let st = scene();
  if (prev) st = withPrevDora(st, prev);
  const defs = { mirror_dora: mirrorDora, dora_afterimage: doraAfterimage, ankan_dora: ankanDora } as const;
  const game = setup(st, augs.map((a) => ({ def: defs[a as keyof typeof defs], holder: "p0" as const })));
  const ron = game.engine.state.zones[discardsZone("p1")]!.tileIds.at(-1) as TileId;
  const ev = evalWin(game, "p0", "ron", ron, { from: "p1" });
  return {
    조합: label,
    doraHan: ev?.doraHan ?? -1,
    augDoraHan: ev?.augDoraHan ?? -1,
    yakuHan: ev?.yakuHan ?? -1,
    extraHan: extraHan(game, "p0"),
    han: ev?.han ?? -1,
  };
}

console.log("도라 표시패 4m → 표준 도라 5m(손에 1장) / 거울 앞도라 3m(손에 1장) / 잔상 = 직전 국 도라");
table("A1: mirror_dora × dora_afterimage (잔상 대상 = 7m, 손에 1장)", [
  run("없음", []),
  run("mirror만", ["mirror_dora"]),
  run("afterimage만", ["dora_afterimage"], [{ suit: "man", rank: 7 }]),
  run("A+B", ["mirror_dora", "dora_afterimage"], [{ suit: "man", rank: 7 }]),
]);

table("A1b: 잔상 대상이 이번 국 도라와 같을 때 (5m)", [
  run("없음", []),
  run("mirror만", ["mirror_dora"]),
  run("afterimage(5m)만", ["dora_afterimage"], [{ suit: "man", rank: 5 }]),
  run("A+B", ["mirror_dora", "dora_afterimage"], [{ suit: "man", rank: 5 }]),
]);

table("A1c: 잔상 대상이 거울 앞도라와 같을 때 (3m)", [
  run("없음", []),
  run("mirror만", ["mirror_dora"]),
  run("afterimage(3m)만", ["dora_afterimage"], [{ suit: "man", rank: 3 }]),
  run("A+B", ["mirror_dora", "dora_afterimage"], [{ suit: "man", rank: 3 }]),
]);
