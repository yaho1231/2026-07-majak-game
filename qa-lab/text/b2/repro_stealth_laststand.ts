/**
 * 스텔스 리치 × 승부수 — 승부수로 스텔스 리치를 취소해도 은닉 표식
 * (stealth_riichi:active:<round>:<holder>)이 남는다.
 * 그 결과 (a) 같은 국에 스텔스 리치를 한 번 더 걸 수 있고("매 국 1회" 위반),
 *        (b) 같은 국에 공탁 1000점을 낸 **표준 리치**까지 은닉된다.
 * 후자는 stealth_riichi.ts 스스로 "남겨 두면 ... 표준 리치까지 은닉된다"고 적어 둔 사고다.
 */
import { FlowController, buildPlayerView, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { stealthRiichi } from "../../../packages/content/src/augments/stealth_riichi.js";
import { lastStand } from "../../../packages/content/src/augments/last_stand.js";

const HAND = "234m345p345s678s55s"; // 5s 버리면 텐파이 유지

function mk(st: GameState) {
  const game = createStandardGameFromState(st);
  installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
  installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
  return game;
}
const hidden = (g: ReturnType<typeof mk>): boolean =>
  g.engine.rules.has("riichi.hidden") &&
  g.engine.rules.resolve<boolean>("riichi.hidden", { playerId: "p0", state: g.engine.state });


/** 패산에서 한 장 뽑아 손에 얹는다 (쯔모 상태 재현) */
function giveDraw(st: GameState): GameState {
  const wall = st.zones["wall"]!.tileIds;
  const t = wall[0] as TileId;
  return {
    ...st,
    zones: {
      ...st.zones,
      wall: { ...st.zones["wall"]!, tileIds: wall.slice(1) },
      "hand:p0": { ...st.zones["hand:p0"]!, tileIds: [...st.zones["hand:p0"]!.tileIds, t] },
    },
    round: { ...st.round, phase: "turn.act", turnSeat: 0, lastDrawnTile: t },
  };
}

const base = craft({ hands: { p0: HAND, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
let st: GameState = { ...base, players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["stealth_riichi", "last_stand"] } : p)) };

// ① 스텔스 리치 선언
let g = mk(st);
new FlowController(g.engine).begin();
const opts = g.engine.state; // options via flow prompt
const flow1 = new FlowController(mk(st).engine);
const hand = g.engine.state.zones["hand:p0"]!.tileIds;
const tile = hand[0] as TileId;
let r = g.engine.submit({ player: "p0", type: "stealth_riichi", payload: { tileId: tile } });
console.log(`① stealth_riichi submit.ok=${r.ok} riichi=${JSON.stringify(g.engine.state.round.byPlayer["p0"]?.riichi)} score=${g.engine.state.players[0]!.score} pot=${g.engine.state.round.riichiPot} hidden=${hidden(g)}`);

// ② 내 순으로 되돌려 승부수로 취소
st = { ...g.engine.state, round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0, lastDrawnTile: g.engine.state.zones["hand:p0"]!.tileIds.at(-1)! } };
g = mk(st);
r = g.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
console.log(`② cancel_riichi ok=${r.ok} riichi=${JSON.stringify(g.engine.state.round.byPlayer["p0"]?.riichi)} score=${g.engine.state.players[0]!.score} hidden(리치없음)=${hidden(g)}`);
const akeys = Object.keys(g.engine.state.augmentData).filter((k) => k.startsWith("stealth_riichi:active"));
console.log(`   남아 있는 은닉 표식: ${JSON.stringify(akeys.map((k) => [k, g.engine.state.augmentData[k]]))}`);

// ③-a 같은 국에 스텔스 리치 재사용 가능한가 ("매 국 1회")
{
  const g2 = mk(st);
  g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
  const st2 = giveDraw(g2.engine.state);
  const g3 = mk(st2);
  const f = new FlowController(g3.engine).begin();
  const o = (f.kind === "awaiting" ? f.prompts.find((p) => p.player === "p0")?.options ?? [] : []).filter((x) => x.type === "stealth_riichi");
  const rr = g3.engine.submit({ player: "p0", type: "stealth_riichi", payload: { tileId: g3.engine.state.round.lastDrawnTile as TileId } });
  console.log(`③-a 같은 국 2번째 stealth_riichi: 후보=${o.length} submit.ok=${rr.ok} err=${JSON.stringify((rr as any).error ?? (rr as any).reason)} phase=${st2.round.phase} riichi=${g3.engine.state.round.byPlayer["p0"]?.riichi != null}`);
}

// ③-b 취소 뒤 **표준 리치**(공탁 1000점)를 걸면 은닉되는가
{
  const g2 = mk(st);
  g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
  const st2 = giveDraw(g2.engine.state);
  const g3 = mk(st2);
  const before = g3.engine.state.players[0]!.score;
  const rr = g3.engine.submit({ player: "p0", type: "riichi", payload: { tileId: g3.engine.state.round.lastDrawnTile as TileId } });
    const v1 = buildPlayerView(g3.engine.state, "p1", g3.engine.rules);
  const v0 = buildPlayerView(g3.engine.state, "p0", g3.engine.rules);
  console.log(`③-b p1이 보는 p0 리치=${v1.round.byPlayer["p0"]?.riichiDeclared} / p0 본인이 보는 자기 리치=${v0.round.byPlayer["p0"]?.riichiDeclared}`);
  console.log(`③-b 표준 riichi ok=${rr.ok} err=${JSON.stringify((rr as any).error ?? (rr as any).reason)} 공탁지불=${before - g3.engine.state.players[0]!.score} pot=${g3.engine.state.round.riichiPot} → riichi.hidden=${hidden(g3)}`);
}
