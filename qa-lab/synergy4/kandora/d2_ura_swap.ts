/**
 * D2 — 뒷도라를 여는 카드 × 뒷도라 표시패를 갈아 끼우는 카드 (의심 2의 확인).
 *
 * `hidden_blade`(리치 없는 멘젠 론에 뒷도라) · `soul_hunt`(상대 리치를 강탈해 뒷도라) 는
 * `scoring.uraWithoutRiichi`를 연다. `ura_peek`은 첫 뒷도라 표시패를 **왕패의 다른 패와
 * 바꿔치기**한다(`ura_swap`, 국당 1회).
 *
 * # 예측
 * 바꿔치기는 왕패의 실물을 맞바꾸므로, 그 뒤에 세는 뒷도라는 **바꾼 뒤의 표시패**여야 한다.
 * 세 카드가 겹쳐도 판수는 «뒷도라 표시패로 정해지는 값» 하나여야 하고, 합산·덮어쓰기 문제가
 * 있으면 여기서 갈린다.
 *
 * 봇은 `ura_swap`을 쓰지 않는 것이 카드의 «의도된 공백»(docs/40 §4)이라 실판에서는 이 장면이
 * 서지 않는다 — 그래서 FlowController로 액션을 직접 눌러 강제한다.
 */
import {
  craft, setup, evalWin, extraHan, table, discardsZone, setIndicator, setUraIndicator,
  reserveInWall, FlowController, kindKey, kindOf,
} from "../../synergy3/kandora/lib.js";
import type { GameState, TileId } from "../../synergy3/kandora/lib.js";
import { uraIndicatorIds } from "@majak/core";
import { uraPeek } from "../../../packages/content/src/augments/ura_peek.js";
import { hiddenBlade } from "../../../packages/content/src/augments/hidden_blade.js";
import { soulHunt } from "../../../packages/content/src/augments/soul_hunt.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** p0: 멘젠 다마텐 — 123456789m 234p + 5s 대기, p1이 5s를 버린다 */
function scene(): GameState {
  let st = craft({
    hands: { p0: "123456789m234p55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  st = reserveInWall(st, ["9p"]);
  st = setIndicator(st, "9p");          // 표도라 1p — 손에 없음
  st = reserveInWall(st, ["4m"]);
  st = setUraIndicator(st, "4m");       // 뒷도라 5m — 손에 1장
  return st;
}

/** 론 장면으로 옮긴다 (p1이 5s를 버림) */
function toRon(st: GameState): GameState {
  return craft({
    hands: { p0: "123456789m234p", p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "5s" },
  }) === null ? st : st;
}

function run(label: string, augs: any[], doSwap: boolean) {
  const game = setup(scene(), augs);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  let swapped = "안 함";
  if (doSwap) {
    // ① 먼저 확인(ura_peek_reveal) — 그래야 ② 바꿔치기 후보가 열린다
    const pick = (t: string): any =>
      status.prompts?.find((x: any) => x.player === "p0")?.options?.find((x: any) => x.type === t);
    const rev = pick("ura_peek_reveal");
    if (rev === undefined) swapped = "### reveal 후보 없음";
    else {
      status = flow.submit("p0", rev);
      const o = pick("ura_swap");
      if (o === undefined) swapped = "### ura_swap 후보 없음";
      else { status = flow.submit("p0", o); swapped = `deadIndex=${(o.payload as any).deadIndex}`; }
    }
  }
  const s = game.engine.state;
  const ura = uraIndicatorIds(s).map((id) => kindKey(kindOf(s, id))).join(" ");
  // 다마텐 론으로 채점 — 화료패는 손의 마지막 장(5s 자리를 대신해 쯔모로 잰다)
  // 손이 14장(쯔모 직후)이면 쯔모 화료로 잰다 — 화료형은 일기통관 + 5s 아타마
  const winTile = s.round.lastDrawnTile as TileId | null;
  const ev = winTile === null ? null : evalWin(game, "p0", "ron", winTile, { from: "p1", includeUra: true });
  return {
    조합: label, 바꿔치기: swapped,
    "뒷도라 표시패": ura,
    doraHan: ev?.doraHan ?? -1, uraHan: ev?.uraHan ?? -1,
    yakuHan: ev?.yakuHan ?? -1, extraHan: extraHan(game, "p0"), han: ev?.han ?? -1,
  };
}

const A = {
  peek: { def: uraPeek, holder: "p0" as const },
  blade: { def: hiddenBlade, holder: "p0" as const },
  soul: { def: soulHunt, holder: "p0" as const },
  mirror: { def: mirrorDora, holder: "p0" as const },
};

table("D2: 리치 없는 멘젠 론 — 뒷도라를 여는 카드 × 뒷도라 표시패 바꿔치기", [
  run("없음", [], false),
  run("hidden_blade만", [A.blade], false),
  run("ura_peek만(바꿔치기 X)", [A.peek], false),
  run("ura_peek만(바꿔치기 O)", [A.peek], true),
  run("blade + peek(바꿔치기 X)", [A.blade, A.peek], false),
  run("blade + peek(바꿔치기 O)", [A.blade, A.peek], true),
  run("blade + peek + mirror(바꿔치기 O)", [A.blade, A.peek, A.mirror], true),
]);

console.log("\n판정: 바꿔치기 O 행의 «뒷도라 표시패»가 바꿔치기 X 행과 달라야 하고,");
console.log("      uraHan은 그 표시패로 계산된 값이어야 한다(hidden_blade가 없으면 uraHan=0).");
console.log("      soul_hunt는 hidden_blade와 conflicts라 따로 잰다.");

table("D2b: soul_hunt(리치 강탈) × ura_peek", [
  run("soul_hunt만", [A.soul], false),
  run("soul_hunt + peek(바꿔치기 O)", [A.soul, A.peek], true),
]);
void toRon;
