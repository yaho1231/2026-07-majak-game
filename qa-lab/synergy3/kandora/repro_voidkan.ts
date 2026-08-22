/**
 * H — void_kan(성립하지 않는 깡) × 깡 증강 (서로 다른 좌석)
 *  H1 상대가 표준 안깡  H2 상대가 장사진(연속 4장) 안깡  H3 상대가 cliff_bloom로 2연깡
 *  각각 p0의 손패가 어떻게 바뀌고, 창깡 론 후보가 뜨는지, 왕패·도라 회계가 어떤지.
 */
import {
  craft, setup, FlowController, kindKey, kindOf, handZone, DEAD_WALL, rinshanRemaining, table,
} from "./lib.js";
import type { GameState, PlayerId, TileId } from "./lib.js";
import { voidKan } from "../../../packages/content/src/augments/void_kan.js";
import { snakeKan } from "../../../packages/content/src/augments/snake_kan.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";
import { roundKey } from "../../../packages/content/src/util.js";

function scene(p1hand: string, extra?: (st: GameState) => GameState): GameState {
  const st = craft({
    // p0: 123456789m 234p + 5s (5s 단기 텐파이)
    hands: { p0: "123456789m234p5s", p1: p1hand, p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  return extra ? extra(st) : st;
}

function handKinds(s: GameState, p: PlayerId) {
  return s.zones[handZone(p)]!.tileIds.map((id) => kindKey(kindOf(s, id)));
}

function run(label: string, p1hand: string, p1augs: any[], extra?: (st: GameState) => GameState) {
  const game = setup(scene(p1hand, extra), [{ def: voidKan, holder: "p0" }, ...p1augs]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const before = handKinds(game.engine.state, "p0");
  const ankan = status.prompts.find((x: any) => x.player === "p1")?.options.find((o: any) => o.type === "ankan");
  if (!ankan) return { 조합: label, 결과: "p1에게 안깡 후보가 없다" };
  const kanKinds = (ankan.payload.tileIds as TileId[]).map((id) => kindKey(kindOf(game.engine.state, id)));
  status = flow.submit("p1", ankan);
  const s = game.engine.state;
  const after = handKinds(s, "p0");
  const changed = before.map((k, i) => (k === after[i] ? null : `${k}→${after[i]}`)).filter(Boolean);
  const ronOpt = status.kind === "awaiting"
    ? status.prompts.find((x: any) => x.player === "p0")?.options.find((o: any) => o.type === "win")
    : undefined;
  return {
    조합: label,
    "p1의 깡": kanKinds.join(""),
    "chankan 대상": s.round.chankan ? kindKey(kindOf(s, s.round.chankan.tileId)) : "-",
    "p0 손패 변조": changed.join(", ") || "(없음)",
    "p0 론 후보": ronOpt ? "있음" : "없음",
    왕패: s.zones[DEAD_WALL]!.tileIds.length, 영상패: rinshanRemaining(s),
    도라표시패: s.round.doraIndicators.length, pendingDora: s.round.pendingDora,
  };
}

table("H: void_kan(p0) × 상대의 깡", [
  run("H1 표준 안깡(1111z)", "1111z23456789m", []),
  run("H1b + p1이 ankan_dora", "1111z23456789m", [{ def: ankanDora, holder: "p1" }]),
  run("H2 장사진 안깡(3456s)", "3456s23456789m", [{ def: snakeKan, holder: "p1" }]),
  run("H3 cliff_bloom 2번째 깡", "1111z23456789m", [{ def: cliffBloom, holder: "p1" }],
    (st) => ({ ...st, augmentData: { ...st.augmentData, [`cliff_bloom:kans:${roundKey(st)}:p1#round`]: 1 } })),
]);

// ── H4: 창깡 론이 실제로 성립한 뒤 왕패·도라 회계 ──────────────────────────
{
  const game = setup(scene("1111z23456789m"), [{ def: voidKan, holder: "p0" }, { def: ankanDora, holder: "p1" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const ankan = status.prompts.find((x: any) => x.player === "p1")?.options.find((o: any) => o.type === "ankan");
  status = flow.submit("p1", ankan);
  const mid = game.engine.state;
  const ron = status.prompts.find((x: any) => x.player === "p0")?.options.find((o: any) => o.type === "win");
  status = flow.submit("p0", ron);
  const s = game.engine.state;
  console.log("\n--- H4: 창깡 론으로 깡이 강탈된 뒤");
  console.log("   깡 직후: 왕패", mid.zones[DEAD_WALL]!.tileIds.length, "영상패", rinshanRemaining(mid),
    "도라표시패", mid.round.doraIndicators.length, "pendingDora", mid.round.pendingDora, "kanCount", mid.round.kanCount);
  console.log("   론 이후: 왕패", s.zones[DEAD_WALL]!.tileIds.length, "영상패", rinshanRemaining(s),
    "도라표시패", s.round.doraIndicators.length, "pendingDora", s.round.pendingDora, "kanCount", s.round.kanCount);
  console.log("   p1 후로 =", JSON.stringify((s.round.byPlayer["p1"]?.melds ?? []).map((m) => m.kind)));
  console.log("   흐름 =", status.kind);
}
