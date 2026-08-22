/**
 * 손패를 직접 만드는 증강끼리 — 개벽(genesis) · 삼원의 의지(three_dragons_will) ·
 * 짝수의 세계(even_world) · 마작의 거신병(giant_god).
 *
 * 기대(미리 적음):
 *  H1. 셋을 같은 국에 연달아 발동해도 **손패 장수는 불변**(14장)이고 패 종류 총량이 깨지지 않는다.
 *  H2. 개벽(자패↔수패 반전)을 삼원의 의지 뒤에 쓰면 방금 만든 대삼원이 수패로 날아간다.
 *      반대로 삼원의 의지를 개벽 뒤에 쓰면 조건이 사라져 버튼이 안 뜬다.
 *      → 서로를 파괴하는 조합인데 두 카드 어디에도 그 말이 없다(설명 확인용).
 *  H3. 짝수의 세계 × 양극/윤회 — 1·9가 2·8로 사라져 그 두 증강의 재료가 통째로 없어진다.
 *      짝수의 세계 × 탕야오 해방 — 카드가 "1·9가 없는 손은 원래의 탕야오"라고 이미 적었다.
 *  H4. 거신병 각성 뒤 삼원의 의지 — 손이 국사 13장이라 잡패가 없다 → 발동 불가여야 한다.
 *      (발동되면 국사 손패가 삼원패로 덮여 13면 대기가 깨진다.)
 */
import {
  FlowController,
  createStandardGameFromState,
  buildWinContext,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { genesis } from "../../../packages/content/src/augments/genesis.js";
import { threeDragonsWill } from "../../../packages/content/src/augments/three_dragons_will.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { giantGod } from "../../../packages/content/src/augments/giant_god.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { tanyaoBreak } from "../../../packages/content/src/augments/tanyao_break.js";

function scene(hand: string, augs: AugmentDef[], discards?: string) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    ...(discards !== undefined ? { discards: { p0: discards } as never } : {}),
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

const handOf = (g: Game): string[] =>
  (g.engine.state.zones[handZone("p0")]?.tileIds ?? [])
    .map((t) => kindKey(kindOf(g.engine.state, t)))
    .sort();

/** 게임 전체 타일 종류별 장수 중 4장을 넘는 것 */
function overflow(g: Game): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of Object.values(g.engine.state.tiles)) {
    const k = kindKey(t.kind);
    c[k] = (c[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(c).filter(([, n]) => n > 4));
}

function fire(g: Game, type: string): boolean {
  const flow = new FlowController(g.engine);
  const s = flow.begin();
  if (s.kind !== "awaiting") return false;
  const p = s.prompts.find((x) => x.player === "p0");
  const opt = p?.options.find((o) => o.type === type);
  if (opt === undefined) return false;
  flow.submit("p0", opt as never);
  return true;
}

function score(g: Game): string {
  const st = g.engine.state;
  const ids = st.zones[handZone("p0")]?.tileIds ?? [];
  const ctx = buildWinContext(st, "p0", "tsumo", ids[ids.length - 1] as TileId, { rules: g.engine.rules });
  const ev = evaluateWin(ctx, g.yaku);
  return ev === null ? "화료형 아님" : `yakuman=${ev.yakumanCount} han=${ev.han} :: ${ev.yaku.map((y) => y.id).join(" ")}`;
}

// ── H1/H2. 삼원의 의지 → 개벽 ─────────────────────────────
console.log("### H1/H2. 삼원의 의지 → 개벽 (같은 국, 같은 순)");
{
  // 백3 발3 中1 + 잡패 7 = 14장
  const g = scene("555z666z7z123m456p9s", [threeDragonsWill, genesis, evenWorld]);
  console.log("  시작 :", handOf(g).join(" "), `(${handOf(g).length}장)`);
  console.log("  의지 발동:", fire(g, "dragons_will"));
  console.log("  후    :", handOf(g).join(" "), `(${handOf(g).length}장)`, "| 4장 초과:", JSON.stringify(overflow(g)));
  console.log("  채점  :", score(g));
  console.log("  개벽 발동:", fire(g, "genesis_flip"));
  console.log("  후    :", handOf(g).join(" "), `(${handOf(g).length}장)`, "| 4장 초과:", JSON.stringify(overflow(g)));
  console.log("  채점  :", score(g));
  console.log("  짝수 발동:", fire(g, "even_world_flip"));
  console.log("  후    :", handOf(g).join(" "), `(${handOf(g).length}장)`, "| 4장 초과:", JSON.stringify(overflow(g)));
}

console.log("\n### H2-b. 개벽 → 삼원의 의지 (순서 반대)");
{
  const g = scene("555z666z7z123m456p9s", [threeDragonsWill, genesis]);
  console.log("  개벽 발동:", fire(g, "genesis_flip"));
  console.log("  후    :", handOf(g).join(" "));
  console.log("  의지 발동:", fire(g, "dragons_will"), "(조건이 사라졌으면 false)");
}

// ── H3. 짝수의 세계 × 양극/탕야오 해방 ────────────────────
console.log("\n### H3. 짝수의 세계 × 양극 — 1·9 재료가 사라진다");
{
  const g = scene("199m199p199s111z22z".replace("22z", "2z2z"), [evenWorld, polarEnds]);
  console.log("  전:", handOf(g).join(" "), "|", score(g));
  console.log("  짝수 발동:", fire(g, "even_world_flip"));
  console.log("  후:", handOf(g).join(" "), "|", score(g), "| 4장 초과:", JSON.stringify(overflow(g)));
}
console.log("\n### H3-b. 짝수의 세계 × 탕야오 해방 — 2판이 1판으로 내려앉는가");
{
  const g = scene("111m234m567m99m9m9m".slice(0, 0) + "123m456m789m111p99p", [evenWorld, tanyaoBreak]);
  console.log("  전:", handOf(g).join(" "), "|", score(g));
  console.log("  짝수 발동:", fire(g, "even_world_flip"));
  console.log("  후:", handOf(g).join(" "), "|", score(g), "| 4장 초과:", JSON.stringify(overflow(g)));
}

// ── H4. 거신병 각성 뒤 삼원의 의지 ────────────────────────
console.log("\n### H4. 거신병 각성 → 삼원의 의지");
{
  const g = scene("555z666z7z123m456p9s".replace("9s", "9s"), [giantGod, threeDragonsWill], "19m19p19s1234z567z");
  console.log("  시작:", handOf(g).join(" "), `(${handOf(g).length}장)`);
  console.log("  의지 조건:", fire(g, "dragons_will"));
  console.log("  후  :", handOf(g).join(" "), `(${handOf(g).length}장)`);
  console.log("  거신병 발동:", fire(g, "giant_god"));
  console.log("  후  :", handOf(g).join(" "), `(${handOf(g).length}장)`);
  console.log("  의지 재발동:", fire(g, "dragons_will"));
  console.log("  후  :", handOf(g).join(" "), `(${handOf(g).length}장)`, "|", score(g));
}
