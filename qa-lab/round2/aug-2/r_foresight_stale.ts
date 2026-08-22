/**
 * 예지(foresight) — 패산 앞을 **쯔모 이외의 경로**로 소모하면 공개 채널이 갱신되지 않는다.
 *
 * foresight는 TILE_DRAWN 리액션에서만 peek 목록을 한 장씩 깎는다. 그런데 패산 앞을
 * 먹는 증강은 그것 말고도 많다 — 미래를 보는 자(3장), 통째로 바꾸기(13장),
 * 파혼(1장)은 모두 TILE_DRAWN을 내지 않고 WALL 앞에서 패를 가져간다.
 * 그러면 "다음 4장"이 이미 남의 손에 들어간 패를 계속 가리킨다.
 */
import { WALL, createStandardGameFromState, installAugment, kindKey, kindOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { foresight } from "../../../packages/content/src/augments/foresight.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}

const base = craft({
  hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" },
  discards: { p0: "1z2z3z", p1: "1z", p2: "1z", p3: "1z" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state = withAug(base, "p0", ["foresight", "future_sight"]);
const game = createStandardGameFromState(state);
installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });

const peekKey = () =>
  Object.keys(game.engine.state.augmentData).find((k) => k.includes("view:p0:foresight_peek"));
const wallFront = (n = 4) =>
  (game.engine.state.zones[WALL]?.tileIds ?? []).slice(0, n).map((id) => kindKey(kindOf(game.engine.state, id)));

console.log("wall front  :", wallFront());
console.log("reveal ok=", game.engine.submit({ player: "p0", type: "foresight_reveal", payload: {} }).ok);
console.log("peek        :", game.engine.state.augmentData[peekKey()!]);

console.log("arm ok=", game.engine.submit({ player: "p0", type: "future_arm", payload: {} }).ok);
// 무작위 3장 중 하나를 골라 교환 — 후보는 holderTurnOptions와 같은 계산이다
const three = (() => {
  const st = game.engine.state;
  // pickThree는 비공개라 손패 아무 장이나 넣고 validate 실패를 피하려면 옵션에서 얻는다
  const provs = (game.engine as unknown as { turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string; payload: unknown }[])[] }).turnOptionProviders;
  const opts = provs.flatMap((f) => f(st, "p0")).filter((o) => o.type === "future_exchange");
  return opts;
})();
console.log("exchange candidates:", three.length);
const r = game.engine.submit({ player: "p0", type: "future_exchange", payload: three[0]!.payload as never });
console.log("exchange ok=", r.ok, (r as { error?: string }).error ?? "");

console.log("wall front now:", wallFront());
console.log("peek still    :", game.engine.state.augmentData[peekKey()!]);
