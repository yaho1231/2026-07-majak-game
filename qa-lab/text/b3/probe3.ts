/** 14장(정상 쯔모 직후) 상태로 다시 확인 — full_hand_swap 패산 수지 / conjure_draw 다음 쯔모 */
import {
  FlowController, WALL, createStandardGameFromState, handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st, players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
function boot(st: GameState, defs: [AugmentDef, PlayerId][]) {
  const game = createStandardGameFromState(st);
  for (const [d, p] of defs) installAugment(game.engine, d, p, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  return { game, flow, s: flow.begin() };
}
const opts = (s: unknown, p: PlayerId) =>
  (s as { prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] })
    .prompts?.find((x) => x.player === p)?.options ?? [];
const tot = (st: GameState) => Object.values(st.zones).reduce((n, z) => n + (z?.tileIds.length ?? 0), 0);

console.log("### full_hand_swap (p0 14장 = 정상 쯔모 직후, p1 13장)");
{
  const st = craft({ hands: { p0: "123456789m11p23p4p", p1: "111222333444s5s", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["full_hand_swap"]), [[fullHandSwap, "p0"]]);
  const w0 = game.engine.state.zones[WALL]!.tileIds.length, t0 = tot(game.engine.state);
  console.log(`  전: p0=${game.engine.state.zones[handZone("p0")]!.tileIds.length}장 p1=${game.engine.state.zones[handZone("p1")]!.tileIds.length}장 패산=${w0}`);
  flow.submit("p0", opts(s, "p0").find((o) => o.type === "hand_swap" && (o.payload as { target: string }).target === "p1")!);
  const a = game.engine.state;
  console.log(`  후: p0=${a.zones[handZone("p0")]!.tileIds.length}장 p1=${a.zones[handZone("p1")]!.tileIds.length}장 패산=${a.zones[WALL]!.tileIds.length} 총량 ${t0}→${tot(a)}`);
  console.log(`  ⇒ 패산 총량 불변 = ${w0 === a.zones[WALL]!.tileIds.length}`);
}

console.log("\n### conjure_draw — 다음 내 쯔모가 부른 패로 오는가");
{
  const st = craft({ hands: { p0: "123456789m11p23p4p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["conjure_draw"]), [[conjureDraw, "p0"]]);
  const target = game.engine.state.zones[handZone("p0")]!.tileIds.find(
    (i) => kindKey(kindOf(game.engine.state, i)) === "pin1")!;
  let cur = flow.submit("p0", { type: "conjure_tsumo", payload: { tileId: target } });
  console.log(`  공개 = ${JSON.stringify(game.engine.state.augmentData["view:*:conjure_draw:p0#round"])}`);
  let guard = 0, seen = 0;
  while (guard++ < 60) {
    const c = cur as { kind: string; prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] };
    if (c.kind !== "awaiting") break;
    const pr = c.prompts![0]!;
    const st2 = game.engine.state;
    if (pr.player === "p0" && st2.round.phase === "turn.act" && st2.round.byPlayer.p0!.discardCount === 1) { seen = 1; break; }
    const pass = pr.options.find((o) => o.type === "pass"), d = pr.options.find((o) => o.type === "discard");
    cur = flow.submit(pr.player, (pass ?? d ?? pr.options[0]!) as never);
  }
  const a = game.engine.state;
  const nd = a.round.lastDrawnTile;
  console.log(`  두 번째 내 순 도달=${seen === 1} / 쯔모패 = ${nd === null ? "없음" : kindKey(kindOf(a, nd))} conjured=${nd !== null && a.tiles[nd]!.attrs.conjured === true}`);
  console.log(`  pending 남았나 = ${JSON.stringify(a.augmentData[`conjure_draw:pending:${a.round.prevalentWind}-${a.round.roundNumber}-${a.round.honba}:p0`])}`);
}
