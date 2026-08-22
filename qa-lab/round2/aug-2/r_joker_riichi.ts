/**
 * 조커(joker) — **리치를 걸어 둔 뒤에도 발동된다.** 그 순간 고정돼 있어야 할 대기가 넓어진다.
 *
 * 형제 증강은 전부 리치 중 액티브를 막는다. honor_return.ts가 그 규약을 문장으로 적어 뒀다:
 *   "같은 계열(giant_god·tile_split·genesis·even_world)과 같은 규약 —
 *    리치 중에는 손패를 건드리는 액티브를 막는다(docs/21 D-2)."
 * 조커의 validate에는 그 줄이 없고, 카드에도 리치 이야기가 한 줄도 없다.
 */
import {
  createStandardGameFromState, installAugment, kindKey, meldCountOf,
  scoringOptionsOf, winHandKindsOf, winningKinds,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { joker } from "../../../packages/content/src/augments/joker.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
// 234m 567m 234p 55p + 백 + 쯔모 1장 → 백이 조커가 되면 대기가 통째로 넓어진다
const base = craft({
  hands: { p0: "234m567m234p55p5z5z", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = {
  ...withAug(base, "p0", ["joker"]),
  round: {
    ...base.round,
    byPlayer: { ...base.round.byPlayer, p0: { ...base.round.byPlayer.p0!, riichi: { turn: 1, ippatsu: false, double: false } } },
  },
};
const game = createStandardGameFromState(state);
installAugment(game.engine, joker, "p0", { yaku: game.yaku });

const waits = (): string[] => {
  const st = game.engine.state;
  const hand14 = winHandKindsOf(st, game.engine.rules, "p0");
  const hand13 = hand14.slice(0, 13);
  return winningKinds(hand13, meldCountOf(st, "p0"), undefined, scoringOptionsOf(st, game.engine.rules, "p0")).map(kindKey);
};

console.log("리치 상태 =", game.engine.state.round.byPlayer.p0?.riichi !== null);
console.log("발동 전 대기 =", waits().join(",") || "(없음)");
const r = game.engine.submit({ player: "p0", type: "joker_call", payload: {} });
console.log("리치 중 joker_call ok =", r.ok, (r as { error?: string }).error ?? "");
console.log("발동 후 대기 =", waits().join(",") || "(없음)");
