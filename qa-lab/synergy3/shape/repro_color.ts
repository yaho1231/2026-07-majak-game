/**
 * 색 변환 축 — 단색 세계(suit_unify) · 염색(tile_dyeing) × 화료형/역 판정.
 *
 * 기대(미리 적음):
 *  C1. 자패가 손에 남은 채 통일하면 청일색이 아니라 **혼일색**이어야 한다
 *      (카드: "통일된 색으로 청일색이 인정되고" — 자패 얘기는 없다).
 *  C2. 단색 세계 × 뒤섞인 아홉 개의 연꽃 — 통일하면 무늬가 1종이 되어 연꽃 역만
 *      (무늬 2종 이상 요구)이 죽고 **표준 구련보등**이 대신 선다. 역만 수는 1이어야 한다.
 *  C3. 단색 세계 × 무너진 국경 — 통일 후 국경은 할 일이 없다(조용한 무효화).
 *      새 형태가 생기지 않는지만 확인.
 *  C4. 염색 → 단색 세계 순서로 같은 국에 둘 다 — 손패 장수·적도라가 보존되는가.
 *  C5. 단색 세계는 같은 국에 두 번 못 쓴다(국당 1회). 염색은 국당 제한이 없다(게임 5회).
 */
import {
  FlowController,
  createStandardGameFromState,
  evaluateWin,
  buildWinContext,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { asyncChiitoi } from "../../../packages/content/src/augments/async_chiitoi.js";

function scene(hand: string, augs: AugmentDef[]) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  st = {
    ...st,
    players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)),
  };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  return game;
}

type Game = ReturnType<typeof scene>;

const handOf = (g: Game): string =>
  (g.engine.state.zones[handZone("p0")]?.tileIds ?? [])
    .map((t) => kindKey(kindOf(g.engine.state, t)))
    .sort()
    .join(" ");

function options(g: Game): { type: string; payload: unknown }[] {
  const flow = new FlowController(g.engine);
  const s = flow.begin();
  if (s.kind !== "awaiting") return [];
  const p = s.prompts.find((x) => x.player === "p0");
  return (p?.options ?? []) as never;
}

function fire(g: Game, type: string, match?: (p: unknown) => boolean): boolean {
  const flow = new FlowController(g.engine);
  const s = flow.begin();
  if (s.kind !== "awaiting") return false;
  const p = s.prompts.find((x) => x.player === "p0");
  const opt = p?.options.find((o) => o.type === type && (match === undefined || match(o.payload)));
  if (opt === undefined) return false;
  flow.submit("p0", opt as never);
  return true;
}

function scoreNow(g: Game, winKey?: string): string {
  const st = g.engine.state;
  const ids = st.zones[handZone("p0")]?.tileIds ?? [];
  const id =
    winKey === undefined
      ? (ids[ids.length - 1] as TileId)
      : (ids.find((t) => kindKey(kindOf(st, t)) === winKey) as TileId);
  const ctx = buildWinContext(st, "p0", "tsumo", id, { rules: g.engine.rules });
  const ev = evaluateWin(ctx, g.yaku);
  if (ev === null) return "화료형 아님";
  return `yakuman=${ev.yakumanCount} han=${ev.han} :: ${ev.yaku.map((y) => `${y.id}(${y.han})`).join(" ")}`;
}

// ── C1. 자패가 남은 채 통일 ─────────────────────────────────
console.log("### C1. 자패가 남은 손을 통일하면 청일색인가 혼일색인가");
{
  const g = scene("123m456p789s11z22z2m", [suitUnify]);
  console.log("  통일 전:", handOf(g));
  console.log("  발동:", fire(g, "mono_world", (p) => (p as { suit: string }).suit === "pin"));
  console.log("  통일 후:", handOf(g));
  console.log("  채점:", scoreNow(g));
}

// ── C2. 단색 세계 × 연꽃 ────────────────────────────────────
console.log("\n### C2. 단색 세계 × 뒤섞인 아홉 개의 연꽃 (혼색 구련 뼈대를 통일)");
for (const [n, augs] of [
  ["연꽃만", [mixedNineGates]],
  ["연꽃+단색", [mixedNineGates, suitUnify]],
  ["단색만", [suitUnify]],
] as const) {
  const g = scene("11m1p2s3m4p5s6m7p8s9m9p9s5m", augs as never);
  console.log(`  [${n}] 통일 전 채점:`, scoreNow(g));
  const ok = fire(g, "mono_world", (p) => (p as { suit: string }).suit === "man");
  console.log(`  [${n}] 통일 발동=${ok} → ${ok ? handOf(g) : "-"}`);
  if (ok) console.log(`  [${n}] 통일 후 채점:`, scoreNow(g));
}

// ── C3. 단색 세계 × 무너진 국경 ─────────────────────────────
console.log("\n### C3. 단색 세계 × 무너진 국경 — 통일 뒤 국경이 하는 일");
{
  const g = scene("1m2p3s4m5p6s7m8p9s11z22z3m", [suitUnify, brokenBorder]);
  console.log("  통일 전:", handOf(g), "|", scoreNow(g));
  fire(g, "mono_world", (p) => (p as { suit: string }).suit === "sou");
  console.log("  통일 후:", handOf(g), "|", scoreNow(g));
}

// ── C4. 염색 + 단색 세계 같은 국 ────────────────────────────
console.log("\n### C4. 염색 → 단색 세계 (같은 국)");
{
  const g = scene("123m456p789s11z22z2m", [tileDyeing, suitUnify]);
  const before = handOf(g);
  const opts = options(g);
  console.log("  옵션 종류:", [...new Set(opts.map((o) => o.type))].join(","));
  const dyed = fire(g, "tile_dye");
  console.log("  염색 발동:", dyed, dyed ? handOf(g) : "");
  const uni = fire(g, "mono_world", (p) => (p as { suit: string }).suit === "pin");
  console.log("  통일 발동:", uni, uni ? handOf(g) : "");
  console.log("  장수 before/after:", before.split(" ").length, "→", handOf(g).split(" ").length);
}

// ── C5. 국당 1회 확인 ───────────────────────────────────────
console.log("\n### C5. 같은 국에 단색 세계 두 번?");
{
  const g = scene("123m456p789s11z22z2m", [suitUnify]);
  console.log("  1회차:", fire(g, "mono_world", (p) => (p as { suit: string }).suit === "pin"));
  console.log("  2회차:", fire(g, "mono_world", (p) => (p as { suit: string }).suit === "sou"));
}

// ── C6. 단색 세계 × 비대칭 — 통일하면 랭크 짝이 진짜 짝이 된다 ─
console.log("\n### C6. 단색 세계 × 비대칭 — 통일 후 치또이");
{
  const g = scene("1m1p2m2p3m3p4m4p5m5p6m6p7m7p", [suitUnify, asyncChiitoi]);
  console.log("  통일 전:", scoreNow(g));
  const ok = fire(g, "mono_world", (p) => (p as { suit: string }).suit === "man");
  console.log("  통일 발동:", ok, handOf(g));
  console.log("  통일 후:", scoreNow(g));
}
