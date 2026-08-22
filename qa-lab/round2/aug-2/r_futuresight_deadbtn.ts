/**
 * 미래를 보는 자(future_sight) — 리치 중·쿨다운 중·후로 직후에도 `future_arm` 버튼이 뜬다.
 *
 * holderTurnOptions는 `handIdsOf(state, holder).length < 4` 하나만 본다.
 * commonReject가 막는 나머지 조건(리치·쿨다운·쯔모패 없음·패산 부족)은 후보 단계에
 * 전혀 반영되지 않는다. 파일 주석은 그 반대를 전제한다 —
 *   "채널이 없어서 **버튼이 사라지는 것으로만** 다시 쓸 수 없다는 걸 알 수 있었다"
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
function mk(mutate: (s: GameState) => GameState) {
  const base = craft({ hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const game = createStandardGameFromState(mutate(withAug(base, "p0", ["future_sight"])));
  installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
  return game;
}
const optTypes = (game: { engine: unknown }): string[] => {
  const e = game.engine as { state: GameState; turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string }[])[] };
  return e.turnOptionProviders.flatMap((f) => f(e.state, "p0")).map((o) => o.type);
};

const cases: [string, (s: GameState) => GameState][] = [
  ["정상", (s) => s],
  ["리치 중", (s) => ({ ...s, round: { ...s.round, byPlayer: { ...s.round.byPlayer, p0: { ...s.round.byPlayer.p0!, riichi: { turn: 1, ippatsu: false, double: false } } } } })],
  ["후로 직후(쯔모패 없음)", (s) => ({ ...s, round: { ...s.round, lastDrawnTile: null } })],
];
for (const [name, mut] of cases) {
  const g = mk(mut);
  const shown = optTypes(g).filter((t) => t === "future_arm").length;
  const r = g.engine.submit({ player: "p0", type: "future_arm", payload: {} });
  console.log(`${name.padEnd(22)} 버튼=${shown}  누르면 ok=${r.ok} ${(r as { error?: string }).error ?? ""}`);
}
// 쿨다운: 정상 상태에서 한 번 무장 → 교환까지 마치고, 같은 순에 다시 보기
const g = mk((s) => s);
g.engine.submit({ player: "p0", type: "future_arm", payload: {} });
const three = (g.engine as unknown as { state: GameState; turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string; payload: unknown }[])[] })
  .turnOptionProviders.flatMap((f) => f(g.engine.state, "p0")).filter((o) => o.type === "future_exchange");
g.engine.submit({ player: "p0", type: "future_exchange", payload: three[0]!.payload as never });
const shown = optTypes(g).filter((t) => t === "future_arm").length;
const r2 = g.engine.submit({ player: "p0", type: "future_arm", payload: {} });
console.log(`${"교환 직후(쿨다운 3순)".padEnd(22)} 버튼=${shown}  누르면 ok=${r2.ok} ${(r2 as { error?: string }).error ?? ""}`);
