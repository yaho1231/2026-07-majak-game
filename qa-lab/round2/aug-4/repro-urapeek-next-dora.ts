/**
 * 확정 후보 — 이면투시(ura_peek)의 바꿔치기가 **아직 뒤집히지 않은 도라 표시패 자리**를
 * 잠그지 않는다. 카드는 "도라 표시패 자리는 건드릴 수 없다"고 못 박는데,
 * `lockedIndices()` 는 `state.round.doraIndicators`(=이미 뒤집힌 것)만 본다.
 *
 * → 홀더는 (같은 증강이 열어 준) 왕패 전체 시야로 **다음 깡 도라**를 직접 골라 놓을 수 있다.
 *   그 도라는 테이블 전원에게 붙는다.
 */
import {
  DEAD_WALL,
  SYSTEM_PLAYER,
  createStandardGameFromState,
  doraIndicatorIndex,
  handIdsOf,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { uraPeek } from "../../../packages/content/src/augments/ura_peek.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
const dw = (s: GameState): TileId[] => s.zones[DEAD_WALL]!.tileIds;
const kk = (s: GameState, id: TileId): string => kindKey(s.tiles[id]!.kind);

const base = craft({
  hands: { p0: "1111m234p567p55s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const game = createStandardGameFromState(withAug(base, "p0", ["ura_peek"]));
installAugment(game.engine, uraPeek, "p0", { yaku: game.yaku });

let s = game.engine.state;
const nextDoraIdx = doraIndicatorIndex(s, 1); // 2번째 도라 표시패가 놓일 자리
console.log("왕패 길이 =", dw(s).length, "· 영상패 남음 =", dw(s).length - 10);
console.log("현재 도라 표시패 =", s.round.doraIndicators.map((id) => kk(s, id)).join(","));
console.log(`2번째(=다음 깡) 도라 표시패 자리 index = ${nextDoraIdx}, 지금 그 자리 = ${dw(s)[nextDoraIdx]}:${kk(s, dw(s)[nextDoraIdx]!)}`);

console.log("peek ok=", game.engine.submit({ player: "p0", type: "ura_peek_reveal", payload: {} }).ok);
s = game.engine.state;
const uraIdBefore = dw(s)[doraIndicatorIndex(s, 0) + 1]!;
const uraBefore = `${uraIdBefore}:${kk(s, uraIdBefore)}`;
console.log("뒷도라 표시패(내가 본 것) =", uraBefore);

// 카드: "도라 표시패 자리는 건드릴 수 없다" → 그런데 다음 도라 자리는 그대로 열려 있다
const r = game.engine.submit({
  player: "p0",
  type: "ura_swap",
  payload: { deadIndex: nextDoraIdx },
});
console.log(`ura_swap(deadIndex=${nextDoraIdx}) ok=`, r.ok, r.ok ? "" : JSON.stringify(r));
s = game.engine.state;
const placed = dw(s)[doraIndicatorIndex(s, 1)]!;
console.log(`바꾼 뒤 그 자리 = ${placed}:${kk(s, placed)}  (내가 밀어 넣은 옛 뒷도라 표시패 ${uraBefore})`);

// 깡을 쳐서 2번째 도라를 뒤집는다 — 홀더가 심어 둔 패가 그대로 도라 표시패가 된다
const ids = handIdsOf(s, "p0").filter((id) => kk(s, id) === "man1");
const k = game.engine.submit({
  player: "p0",
  type: "ankan",
  payload: { tileIds: ids as [TileId, TileId, TileId, TileId] },
});
console.log("ankan ok=", k.ok, k.ok ? "" : JSON.stringify(k));
s = game.engine.state;
// 깡 도라 개봉 (FlowController가 깡 뒤에 부르는 그 시스템 액션)
const f = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.flipDora", payload: {} });
console.log("sys.flipDora ok=", f.ok, f.ok ? "" : JSON.stringify(f));
s = game.engine.state;
console.log(
  "깡 도라 개봉 후 도라 표시패 =",
  s.round.doraIndicators.map((id) => `${id}:${kk(s, id)}`).join(" , "),
);
console.log("→ 두 번째 표시패의 tileId 가 내가 밀어 넣은 그 패인가?");
