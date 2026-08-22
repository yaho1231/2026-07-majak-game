/**
 * 확정 후보 — 성립하지 않는 깡(void_kan)의 `forgeWait` 가 **세상에 없는 5번째 장**을 만든다.
 *
 * 상대가 안깡으로 넉 장을 **눈앞에 눕히는 그 순간**, 홀더의 손패 한 장이 그 종류로 바뀐다.
 * 테이블에 4장이 공개돼 있는데 홀더 손에 다섯 번째 장이 생기고, 그 장으로 화료한다.
 * 같은 부류가 aug-3 확정 1(`peek_forge`)로 이미 잡혔고 공용 자 `copiesLeftUndrawn` 가
 * `content/src/util.ts` 에 있는데 void_kan 은 안 쓴다.
 */
import { createStandardGameFromState, installAugment, kindKey, handIdsOf } from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { copiesLeftUndrawn } from "../../../packages/content/src/util.js";
import { voidKan } from "../../../packages/content/src/augments/void_kan.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
function totalCopies(s: GameState, key: string): number {
  return Object.values(s.tiles).filter((t) => kindKey(t.kind) === key).length;
}
function handOf(s: GameState, p: PlayerId): string {
  return handIdsOf(s, p).map((id) => kindKey(s.tiles[id]!.kind)).join(" ");
}

// p0(void_kan 홀더)은 1s 단기 텐파이 13장. p1 은 1만 4장을 쥐고 안깡을 친다.
const base = craft({
  hands: {
    p0: "234m567m234p567p1s",
    p1: "1111m99p99s567s2z",
    p2: "*",
    p3: "*",
  },
  // 1삭 석 장이 이미 바닥에 나와 있다 — p0 손의 한 장까지 합치면 네 장 전부가 소진이다
  discards: { p0: "", p1: "1s", p2: "1s", p3: "1s" },
  phase: "turn.act",
  turnSeat: 1,
  drawnLastFor: "p1",
});
const s = withAug(base, "p0", ["void_kan"]);
const game = createStandardGameFromState(s);
installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });

console.log("[전] p0 손패 =", handOf(game.engine.state, "p0"));
console.log("[전] man1 게임 전체 =", totalCopies(game.engine.state, "man1"), "장");
console.log(
  "[전] sou1 게임 전체 =",
  totalCopies(game.engine.state, "sou1"),
  "장 · 아직 안 나온 장수 copiesLeftUndrawn =",
  copiesLeftUndrawn(game.engine.state, { suit: "sou", rank: 1 }),
);

const p1hand = handIdsOf(game.engine.state, "p1");
const ids = p1hand.filter((id) => kindKey(game.engine.state.tiles[id]!.kind) === "man1");
const r = game.engine.submit({
  player: "p1",
  type: "ankan",
  payload: { tileIds: ids as [TileId, TileId, TileId, TileId] },
});
console.log("p1 안깡 submit ok=", r.ok, r.ok ? "" : JSON.stringify(r));

const after = game.engine.state;
console.log("[후] p0 손패 =", handOf(after, "p0"));
console.log("[후] man1 게임 전체 =", totalCopies(after, "man1"), "장");
console.log(
  "[후] sou1 게임 전체 =",
  totalCopies(after, "sou1"),
  "장 · 아직 안 나온 장수 copiesLeftUndrawn =",
  copiesLeftUndrawn(after, { suit: "sou", rank: 1 }),
);
const meld = after.round.byPlayer["p1"]!.melds.map((m) =>
  m.tileIds.map((id) => kindKey(after.tiles[id]!.kind)).join(""),
);
console.log("[후] p1 후로(전원에게 보이는 넉 장) =", meld.join(" / "));
console.log("[후] p0 view 채널 =", after.augmentData["view:*:void_kan:p0#round"]);
