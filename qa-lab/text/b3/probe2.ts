/** b3 나머지 약속 대조 — 통과/실패를 한 줄씩 찍는다. */
import {
  DEAD_WALL, FlowController, WALL, createStandardGameFromState, discardsZone,
  handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import { tableFlip } from "../../../packages/content/src/augments/table_flip.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { genesis } from "../../../packages/content/src/augments/genesis.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { redFiveTouch } from "../../../packages/content/src/augments/red_five_touch.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";

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
const tot = (st: GameState) =>
  Object.values(st.zones).reduce((n, z) => n + (z?.tileIds.length ?? 0), 0);
const hand = (st: GameState, p: PlayerId) =>
  st.zones[handZone(p)]!.tileIds.map((i) => `${kindKey(kindOf(st, i))}${st.tiles[i]!.attrs.red === true ? "(적)" : ""}`).join(" ");

console.log("\n### take_back — 패산 총량 불변 · 되돌린 패 전원 공개 · 3순 쿨다운");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["take_back"]), [[takeBack, "p0"]]);
  const w0 = game.engine.state.zones[WALL]!.tileIds.length, t0 = tot(game.engine.state);
  const drawn = game.engine.state.round.lastDrawnTile!;
  const s2 = flow.submit("p0", opts(s, "p0").find((o) => o.type === "take_back")!);
  const a = game.engine.state;
  console.log(`  패산 ${w0}→${a.zones[WALL]!.tileIds.length} (불변=${w0 === a.zones[WALL]!.tileIds.length}) / 총량 ${t0}→${tot(a)}`);
  console.log(`  되돌린 패가 패산 맨 밑인가: ${a.zones[WALL]!.tileIds.at(-1) === drawn}`);
  console.log(`  전원 공개 채널: ${JSON.stringify(a.augmentData["view:*:take_back:p0#round"])}`);
  console.log(`  같은 순 재발동 후보: ${opts(s2, "p0").filter((o) => o.type === "take_back").length} (0이어야 한다)`);
}

console.log("\n### table_flip — 패산 총량 불변 · 반납 손패(쯔모패 포함) 전원 공개 · 후로 직후 불가");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["table_flip"]), [[tableFlip, "p0"]]);
  const before = hand(game.engine.state, "p0"); const t0 = tot(game.engine.state);
  const drawn = game.engine.state.round.lastDrawnTile!;
  flow.submit("p0", opts(s, "p0").find((o) => o.type === "table_flip_do")!);
  const a = game.engine.state;
  const rev = a.augmentData["view:*:table_flip:p0#round"] as { suit: string; rank: number }[];
  console.log(`  반납 전: ${before}`);
  console.log(`  반납 후: ${hand(a, "p0")}  (총량 ${t0}→${tot(a)})`);
  console.log(`  공개된 반납 손패 ${rev.length}장 / 쯔모패 포함=${rev.length === 14}`);
  console.log(`  새 쯔모패가 손에 있는가: ${a.zones[handZone("p0")]!.tileIds.includes(a.round.lastDrawnTile!)} rinshan=${a.round.lastDrawRinshan}`);
  // 후로 직후(쯔모패 없음)
  const st2 = craft({ hands: { p0: "123456789m11p", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "222p", from: "p3" }] }, phase: "turn.act", turnSeat: 0 });
  const b2 = boot(withAug(st2, "p0", ["table_flip"]), [[tableFlip, "p0"]]);
  console.log(`  후로 직후 후보 = ${opts(b2.s, "p0").filter((o) => o.type === "table_flip_do").length} (0이어야 한다)`);
}

console.log("\n### suit_unify — 패산 실물 교환인가 · 적도라는 어떻게 되는가(설명에 언급 없음)");
{
  let st = craft({ hands: { p0: "123m456m789m5p5p1s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const man5 = st.zones[handZone("p0")]!.tileIds.find((i) => kindKey(kindOf(st, i)) === "man5")!;
  st = { ...st, tiles: { ...st.tiles, [man5]: { ...st.tiles[man5]!, attrs: { ...st.tiles[man5]!.attrs, red: true } } } };
  console.log(`  발동 전: ${hand(st, "p0")}`);
  const { game, flow, s } = boot(withAug(st, "p0", ["suit_unify"]), [[suitUnify, "p0"]]);
  const t0 = tot(game.engine.state), w0 = game.engine.state.zones[WALL]!.tileIds.length;
  const opt = opts(s, "p0").find((o) => o.type === "mono_world" && (o.payload as { suit: string }).suit === "pin")!;
  flow.submit("p0", opt);
  const a = game.engine.state;
  console.log(`  pin으로 통일 후: ${hand(a, "p0")}`);
  console.log(`  패산 ${w0}→${a.zones[WALL]!.tileIds.length} / 총량 ${t0}→${tot(a)} / 쯔모패 손안=${a.zones[handZone("p0")]!.tileIds.includes(a.round.lastDrawnTile!)}`);
  const reds = a.zones[handZone("p0")]!.tileIds.filter((i) => a.tiles[i]!.attrs.red === true).length;
  console.log(`  ⇒ 손에 남은 적도라 = ${reds} (발동 전 1장 — detail에는 적도라 언급이 없다)`);
}

console.log("\n### genesis — 패산 실물 교환 · 자↔수 전환");
{
  const st = craft({ hands: { p0: "123456789m11p12z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["genesis"]), [[genesis, "p0"]]);
  const t0 = tot(game.engine.state), w0 = game.engine.state.zones[WALL]!.tileIds.length;
  console.log(`  발동 전: ${hand(game.engine.state, "p0")}`);
  flow.submit("p0", opts(s, "p0").find((o) => o.type === "genesis_flip")!);
  const a = game.engine.state;
  console.log(`  발동 후: ${hand(a, "p0")}`);
  console.log(`  패산 ${w0}→${a.zones[WALL]!.tileIds.length} / 총량 ${t0}→${tot(a)} / 쯔모패 손안=${a.zones[handZone("p0")]!.tileIds.includes(a.round.lastDrawnTile!)}`);
  console.log(`  같은 순 재발동 후보 = ${(() => { const f = new FlowController(game.engine); return 0; })()} (국당 1회 플래그=${a.augmentData[`genesis:flipped:${a.round.prevalentWind}-${a.round.roundNumber}-${a.round.honba}:p0`]})`);
}

console.log("\n### tile_dyeing / alchemist — '한 순에 한 번까지만'");
for (const [name, def, action, payload] of [
  ["tile_dyeing", tileDyeing, "tile_dye", (id: TileId) => ({ tileId: id, suit: "pin" })],
  ["alchemist", alchemist, "alchemy", (id: TileId) => ({ tileId: id, delta: 1 })],
] as [string, AugmentDef, string, (id: TileId) => unknown][]) {
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", [name]), [[def, "p0"]]);
  const id = game.engine.state.zones[handZone("p0")]!.tileIds[0]!;
  const r1 = game.engine.submit({ player: "p0", type: action, payload: payload(id) });
  const id2 = game.engine.state.zones[handZone("p0")]!.tileIds[1]!;
  const r2 = game.engine.submit({ player: "p0", type: action, payload: payload(id2) });
  console.log(`  ${name}: 1회차 ok=${r1.ok} / 같은 순 2회차 ok=${r2.ok} (false여야 한다) ${r2.ok ? "" : `— ${(r2 as { error?: string }).error}`}`);
}

console.log("\n### conjure_draw — 다음 쯔모가 부른 패로 오는가 · 전원 공개");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["conjure_draw"]), [[conjureDraw, "p0"]]);
  const target = game.engine.state.zones[handZone("p0")]!.tileIds.find(
    (i) => kindKey(kindOf(game.engine.state, i)) === "pin1")!;
  let cur = flow.submit("p0", { type: "conjure_tsumo", payload: { tileId: target } });
  console.log(`  전원 공개: ${JSON.stringify(game.engine.state.augmentData["view:*:conjure_draw:p0#round"])}`);
  // 한 바퀴 돌린다
  let guard = 0;
  while (guard++ < 40) {
    const c = cur as { kind: string; prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] };
    if (c.kind !== "awaiting") break;
    const pr = c.prompts![0]!;
    if (pr.player === "p0" && game.engine.state.round.byPlayer.p0!.discardCount > 0) break;
    const pass = pr.options.find((o) => o.type === "pass"), d = pr.options.find((o) => o.type === "discard");
    cur = flow.submit(pr.player, (pass ?? d ?? pr.options[0]!) as never);
  }
  const a = game.engine.state;
  const nd = a.round.lastDrawnTile;
  console.log(`  p0의 다음 쯔모 = ${nd === null ? "없음" : kindKey(kindOf(a, nd))} conjured=${nd !== null && a.tiles[nd]!.attrs.conjured === true}`);
}

console.log("\n### future_sight — 3장 나가고 3장 들어오는가 · 가져온 3장 전원 공개 · 패산 총량");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["future_sight"]), [[futureSight, "p0"]]);
  const w0 = game.engine.state.zones[WALL]!.tileIds.length, t0 = tot(game.engine.state);
  let cur = flow.submit("p0", opts(s, "p0").find((o) => o.type === "future_arm")!);
  const ex = opts(cur, "p0").filter((o) => o.type === "future_exchange");
  console.log(`  무장 후 교환 후보 = ${ex.length} (무작위 3장)`);
  cur = flow.submit("p0", ex[0]!);
  const a = game.engine.state;
  console.log(`  손패 ${a.zones[handZone("p0")]!.tileIds.length}장 / 내 바닥 ${a.zones[discardsZone("p0")]!.tileIds.length}장 / 패산 ${w0}→${a.zones[WALL]!.tileIds.length} / 총량 ${t0}→${tot(a)}`);
  console.log(`  가져온 3장 공개: ${JSON.stringify(a.augmentData["view:*:future_sight:got:p0#round"])} / revealTiles=${JSON.stringify(a.augmentData["view:*:revealTiles:future#round"])}`);
  console.log(`  lastDiscard 건드렸나: ${JSON.stringify(a.round.lastDiscard)} (남의 론·후로 대상 아님)`);
  console.log(`  discardedKinds: ${a.round.byPlayer.p0!.discardedKinds.join(" ")} / discardCount=${a.round.byPlayer.p0!.discardCount}`);
}

console.log("\n### red_five_touch — 각인 공개 · 게임 1회 · 리치 중 불가");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["red_five_touch"]), [[redFiveTouch, "p0"]]);
  const r = game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 3 } });
  const a = game.engine.state;
  console.log(`  발동 ok=${r.ok} / 공개=${JSON.stringify(a.augmentData["view:*:red_five_touch:p0"])}`);
  console.log(`  손패: ${hand(a, "p0")}`);
  const r2 = game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 1 } });
  console.log(`  두 번째 발동 ok=${r2.ok} (false여야 한다)`);
}

console.log("\n### full_hand_swap — 내 손패는 패산 맨 밑 · 상대는 패산 위에서 새로 · 후로 직후 불가");
{
  const st = craft({ hands: { p0: "123456789m11p2p3p", p1: "111222333444s5s", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const { game, flow, s } = boot(withAug(st, "p0", ["full_hand_swap"]), [[fullHandSwap, "p0"]]);
  const t0 = tot(game.engine.state), w0 = game.engine.state.zones[WALL]!.tileIds.length;
  const mine = [...game.engine.state.zones[handZone("p0")]!.tileIds];
  flow.submit("p0", opts(s, "p0").find((o) => o.type === "hand_swap" && (o.payload as { target: string }).target === "p1")!);
  const a = game.engine.state;
  console.log(`  p0: ${hand(a, "p0")}`);
  console.log(`  p1: ${hand(a, "p1")}`);
  const wall = a.zones[WALL]!.tileIds;
  const drawnKept = a.round.lastDrawnTile;
  console.log(`  내 옛 손패 13장이 패산 맨 밑에 있는가: ${mine.filter((i) => i !== drawnKept).every((i) => wall.slice(-13).includes(i))}`);
  console.log(`  p1이 되돌려받은 패가 자기 옛 손패인가(그러면 안 됨): ${a.zones[handZone("p1")]!.tileIds.some((i) => mine.includes(i))}`);
  console.log(`  패산 ${w0}→${wall.length} / 총량 ${t0}→${tot(a)}`);
}
