/**
 * 예지(foresight) — 쿨다운·"이번 턴 공개" 판정이 `round.turnCount`다.
 * 그런데 turnCount는 **오야가 뽑을 때마다** 오른다(영상패 쯔모 포함, flowEvents.ts:412).
 * 그래서 오야가 깡을 치면 같은 순 안에서 turnCount가 +1 되어
 *   ① 방금 발동(공개)한 그 순인데 **재배열 후보가 사라지고**
 *   ② 4순 쿨다운이 깡 한 번당 1순씩 짧아진다.
 * (같은 함정을 미래를 보는 자·뒤늦은 출진은 이미 `discardCount`로 옮겨 피했다.)
 */
import { SYSTEM_PLAYER, createStandardGameFromState, handIdsOf, installAugment, kindKey, kindOf } from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { foresight } from "../../../packages/content/src/augments/foresight.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
const base = craft({
  hands: { p0: "1111z234m567m99p1s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state = withAug(base, "p0", ["foresight"]);
const game = createStandardGameFromState(state);
installAugment(game.engine, foresight, "p0", { yaku: game.yaku });

const opts = (): string[] => {
  const st = game.engine.state;
  const provs = (game.engine as unknown as { turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string }[])[] }).turnOptionProviders;
  return provs.flatMap((f) => f(st, "p0")).map((o) => o.type);
};
const cd = (): unknown => game.engine.state.augmentData["view:p0:cooldownTurns:foresight"];

console.log("turnCount =", game.engine.state.round.turnCount);
console.log("reveal ok=", game.engine.submit({ player: "p0", type: "foresight_reveal", payload: {} }).ok);
console.log("turnCount =", game.engine.state.round.turnCount, "| 재배열 후보 =", opts().filter((t) => t === "foresight_order").length, "| 쿨다운 잔량 =", cd());

const ids: TileId[] = handIdsOf(game.engine.state, "p0").filter((id) => kindKey(kindOf(game.engine.state, id)) === "wind1");
const k = game.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } });
console.log("ankan ok=", k.ok, (k as { error?: string }).error ?? "");
const rs = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.drawRinshan", payload: {} });
console.log("rinshan ok=", rs.ok, (rs as { error?: string }).error ?? "");
console.log("turnCount =", game.engine.state.round.turnCount, "| 재배열 후보 =", opts().filter((t) => t === "foresight_order").length, "| 쿨다운 잔량 =", cd());
