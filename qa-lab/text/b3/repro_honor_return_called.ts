/**
 * 귀환(honor_return) — "이번 국에 내가 버린 자패가 가장 최근 것부터 최대 네 장까지 기억되어
 * 다음 국 배패에 그대로 섞여 돌아온다."
 *
 * 실제로는 **내 바닥 존에 남아 있는 자패**만 센다(`recallableHonors`가
 * `state.zones[discardsZone(holder)]`를 읽는다). 코어의 CALL_MADE는 울린 패를
 * 버린 사람의 바닥 존에서 빼내 우는 사람의 멘쯔로 옮긴다(flowEvents.ts:504-513).
 * → **내가 버린 자패를 상대가 퐁·치로 가져가면 그 장은 기억 목록에서 조용히 사라진다.**
 * 하필 역패(白發中·자풍)일수록 울리기 쉬운데, 그게 가장 되받고 싶은 패다.
 */
import {
  FlowController, createStandardGameFromState, discardsZone, handZone,
  installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { honorReturn } from "../../../packages/content/src/augments/honor_return.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st, players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const pond = (st: GameState, p: PlayerId) =>
  st.zones[discardsZone(p)]!.tileIds.map((i) => kindKey(kindOf(st, i))).join(" ");

// p0 바닥에 이미 자패 3장(東·南·白). 손에 白 한 장 더 — 이걸 버리면 p1이 퐁한다.
// p1은 白 2장을 들고 있다.
const base = craft({
  hands: {
    p0: "123456789m11p5z",     // 14장? -> 9+2+1=12 ... 아래에서 확인
    p1: "55z123456789s99s",    // 白 2장 보유
    p2: "*", p3: "*",
  },
  discards: { p0: "1z2z5z" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const st = withAug(base, "p0", ["honor_return"]);
const game = createStandardGameFromState(st);
installAugment(game.engine, honorReturn, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();

console.log("p0 손패:", game.engine.state.zones[handZone("p0")]!.tileIds.length, "장");
console.log("버리기 전 p0 바닥:", pond(game.engine.state, "p0"));

// p0가 白(dragon1)을 버린다
const haku = game.engine.state.zones[handZone("p0")]!.tileIds.find(
  (i) => kindKey(kindOf(game.engine.state, i)) === "dragon1",
)!;
s = flow.submit("p0", { type: "discard", payload: { tileId: haku } });
console.log("p0가 白 버림 → p0 바닥:", pond(game.engine.state, "p0"));

// 리액션: p1이 퐁
const opts = (s as { prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] })
  .prompts ?? [];
for (const pr of opts) {
  const pon = pr.options.find((o) => o.type === "pon");
  if (pr.player === "p1" && pon !== undefined) {
    s = flow.submit("p1", pon);
    break;
  }
}
console.log("p1 퐁 후 p0 바닥:", pond(game.engine.state, "p0"));
console.log("p0 discardedKinds(후리텐 이력):",
  game.engine.state.round.byPlayer.p0!.discardedKinds.join(" "));

// p1이 버리고 한 바퀴 돌아 p0 차례가 오면 honor_recall
let guard = 0;
while (guard++ < 40) {
  const cur = s as { kind: string; prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] };
  if (cur.kind !== "awaiting") break;
  const pr = cur.prompts![0]!;
  if (pr.player === "p0" && pr.options.some((o) => o.type === "honor_recall")) break;
  const pass = pr.options.find((o) => o.type === "pass");
  const disc = pr.options.find((o) => o.type === "discard");
  s = flow.submit(pr.player, (pass ?? disc ?? pr.options[0]!) as never);
}
const r = game.engine.submit({ player: "p0", type: "honor_recall", payload: {} });
console.log("honor_recall ok =", r.ok, r.ok ? "" : (r as { error?: string }).error);
const kept = game.engine.state.augmentData["honor_return:keep:p0"] as { suit: string; rank: number }[] | undefined;
console.log("기억된 자패:", kept === undefined ? "없음" : kept.map((k) => kindKey(k as never)).join(" "));
console.log(`  ⇒ p0가 이번 국에 실제로 버린 자패 = 東·南·白·白 4장 / 기억된 것 = ${kept?.length ?? 0}장`);
