/**
 * K — snake_kan × cliff_bloom: 연속 4장 두 벌만 있으면 만개가 서는가, 그 결과가 무엇인가.
 * 기대(카드만 읽고): 만개는 "지금 손과 가장 가까운 화료형" — 영상개화 4판짜리 화료.
 */
import { craft, setup, evalWin, extraHan, table, FlowController, handZone, kindKey, kindOf } from "./lib.js";
import type { GameState, TileId } from "./lib.js";
import { snakeKan } from "../../../packages/content/src/augments/snake_kan.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";

function run(hand: string, augs: any[]) {
  const st = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const game = setup(st, augs);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  let kans = 0;
  for (let i = 0; i < 8; i++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts.find((x: any) => x.player === "p0");
    if (!pr) { const q = status.prompts[0]; status = flow.submit(q.player, q.options.find((o: any) => o.type === "pass") ?? q.options[0]); continue; }
    const o = pr.options.find((x: any) => x.type === "ankan");
    if (!o) break;
    status = flow.submit("p0", o);
    kans++;
  }
  const s = game.engine.state;
  const bloomed = Object.entries(s.augmentData).some(([k, v]) => k.includes("cliff_bloom:bloomed") && v === true);
  const ev = s.round.lastDrawnTile === null ? null : evalWin(game, "p0", "tsumo", s.round.lastDrawnTile as TileId);
  return {
    손패: hand, 깡: kans, 만개: bloomed,
    화료: ev?.ok ?? false, 역만: ev?.yakumanCount ?? 0,
    역: (ev?.yaku ?? []).map((y: any) => `${y.id}:${y.han}`).join(",") || "-",
    extraHan: extraHan(game, "p0"),
  };
}

const HANDS = [
  "3456m3456p1199s55s",
  "2345m4567p123s999s",
  "3456m2345s123p999s",
  "1234m6789p258s777z",
  "4567m4567s123p111z",
];
table("K: 장사진 2연깡 → 만개 (같은 손을 snake_kan만 / snake_kan+cliff_bloom으로)", [
  ...HANDS.map((h) => ({ 조합: "snake만", ...run(h, [{ def: snakeKan, holder: "p0" }]) })),
  ...HANDS.map((h) => ({ 조합: "snake+bloom", ...run(h, [{ def: snakeKan, holder: "p0" }, { def: cliffBloom, holder: "p0" }]) })),
]);
