/**
 * 카르마(karma) — 게이지가 0이어도 `karma_burn` 후보가 매 턴 뜬다.
 *
 * `ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }])` 는 조건을 하나도 보지
 * 않는다. 형제 증강 invincible이 바로 이 안티패턴을 명시적으로 고쳤다:
 *   "쿨다운 중에는 버튼을 내리지 않는다 — 예전에는 무조건 옵션을 내보내, 눌러도
 *    validate가 조용히 반려하는 **작동하지 않는 버튼**이 떠 있었다."
 * 봇도 `plan({intent:"score", fleeting:true})` 로 그 후보를 집어 제출했다가 반려당한다.
 */
import { createStandardGameFromState } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { karma } from "../../../packages/content/src/augments/karma.js";
import { invincible } from "../../../packages/content/src/augments/invincible.js";
import { installAugment } from "@majak/core";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
const base = craft({ hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
const state = withAug(base, "p0", ["karma", "invincible"]);
const game = createStandardGameFromState(state);
installAugment(game.engine, karma, "p0", { yaku: game.yaku });
installAugment(game.engine, invincible, "p0", { yaku: game.yaku });

const opts = (): { type: string }[] => {
  const st = game.engine.state;
  const provs = (game.engine as unknown as { turnOptionProviders: ((s: GameState, p: PlayerId) => { type: string }[])[] }).turnOptionProviders;
  return provs.flatMap((f) => f(st, "p0"));
};

const gauge = game.engine.state.augmentData["karma:gauge:p0"] ?? 0;
console.log("게이지 =", gauge, "(발동 하한 8000)");
const shown = opts().filter((o) => o.type === "karma_burn").length;
console.log("karma_burn 후보 노출 =", shown);
const r = game.engine.submit({ player: "p0", type: "karma_burn", payload: {} });
console.log("눌렀을 때 =", r.ok, (r as { error?: string }).error ?? "");
console.log(shown > 0 && !r.ok ? "BUG: 게이지 0인데 버튼이 뜨고, 누르면 조용히 반려된다" : "OK");

// 대조군 — 같은 판의 invincible은 쿨다운 중에 후보를 내리는가?
game.engine.submit({ player: "p0", type: "invincible_guard", payload: {} });
console.log("무적 선언 후 invincible_guard 후보 =", opts().filter((o) => o.type === "invincible_guard").length, "(0이어야 정상)");
console.log("무적 선언 후 karma_burn 후보  =", opts().filter((o) => o.type === "karma_burn").length);
