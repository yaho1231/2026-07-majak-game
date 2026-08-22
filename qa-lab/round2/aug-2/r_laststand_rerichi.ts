/**
 * 승부수(last_stand) — 리치 취소 뒤 **같은 국에 리치를 다시 걸 수 있다.**
 * 순비용 0(1000 환급 → 1000 재지불)에 ① 일발이 새로 붙고 ② 리치 후리텐이 세탁된다.
 *
 * 카드: "(매 국 1회) … 냈던 리치봉을 돌려받고 리치 후리텐도 풀려 **다시 자유롭게 버릴 수
 * 있다**." 폴드 수단으로만 서술돼 있고 "다시 리치를 걸 수 있다"는 말은 없다.
 * 코어의 재리치 가드는 `standardActions.riichiAction.validate` 의
 * `if (rs?.riichi != null) return "already riichi"` 하나뿐이라, 취소로 null이 되면 열린다.
 */
import { createStandardGameFromState, handIdsOf, installAugment, kindKey, kindOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { lastStand } from "../../../packages/content/src/augments/last_stand.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
// 이미 리치를 걸어 둔 채로 이번 순의 쯔모를 받은 상태(손패 14장)를 그대로 조립한다.
// riichiFuriten=true = 리치 중 내 오름패를 넘긴 상태 → 표준 규칙상 **그 국 내내 론 불가**.
const base = craft({
  hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const aug = withAug(base, "p0", ["last_stand"]);
const state: GameState = {
  ...aug,
  round: {
    ...base.round,
    riichiPot: 1000,
    byPlayer: {
      ...base.round.byPlayer,
      p0: { ...base.round.byPlayer.p0!, discardCount: 4,
        riichi: { double: false, ippatsu: false, discardIndex: 3, discardTileId: -1, cost: 1000 },
        riichiFuriten: true },
    },
  },
  players: aug.players.map((p) => (p.id === "p0" ? { ...p, score: 24000 } : p)),
};
const game = createStandardGameFromState(state);
installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });

const show = (tag: string): void => {
  const r = game.engine.state.round.byPlayer.p0!;
  console.log(`${tag.padEnd(16)} riichi=${r.riichi === null ? "null" : JSON.stringify(r.riichi)}\n${" ".repeat(17)}riichiFuriten=${r.riichiFuriten} pot=${game.engine.state.round.riichiPot} score=${game.engine.state.players[0]!.score}`);
};
show("리치 중 + 후리텐");
let r = game.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
console.log("① 리치 취소 ok =", r.ok, JSON.stringify(r));
show("취소 후");
const sou1 = handIdsOf(game.engine.state, "p0").filter((id) => kindKey(kindOf(game.engine.state, id)) === "sou1");
r = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: sou1[0] } });
console.log("② 같은 국 재리치 ok =", r.ok, JSON.stringify(r));
show("재리치 후");
const f = game.engine.state.round.byPlayer.p0!;
console.log(f.riichi !== null && f.riichi.ippatsu === true && f.riichiFuriten === false
  ? "BUG: 같은 국에 리치를 다시 걸었다 — 일발이 새로 붙고 리치 후리텐이 세탁됐다 (순비용 0)"
  : "OK");
