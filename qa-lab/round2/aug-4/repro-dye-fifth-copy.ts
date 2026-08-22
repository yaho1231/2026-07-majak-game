/**
 * 확정 후보 — 염색(tile_dyeing)이 **세상에 없는 5번째 장**을 만든다.
 *
 * 형제 `suit_unify`(단색 세계)는 **완전히 같은 조작**(수패의 무늬만 바꾸고 숫자는 유지)을
 * 하는데, 파일 머리에 왜 kind 덮어쓰기를 버렸는지 적어 두었다:
 *   "예전에는 손패의 kind를 그 자리에서 덮어써(conjured) 색만 바꿨다. 그러면 같은 종류가
 *    게임에 5장 이상 존재하는 비정상 분포가 생기고, 남은 패를 세는 쪽(대기·안전패 계산)이
 *    전부 틀어진다."
 * 그래서 지금은 패산의 같은 숫자·목표 색 실물과 1:1 맞바꾼다(`suitUnifyCore.monoWorldEvent`).
 * 염색은 그 교훈을 안 받았다 — `tileKindChanged` 한 방이 전부다.
 */
import { createStandardGameFromState, handIdsOf, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { copiesLeftUndrawn } from "../../../packages/content/src/util.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
/** 게임 전체(모든 존)에서 그 종류가 몇 장인가 */
function totalCopies(s: GameState, key: string): number {
  return Object.values(s.tiles).filter((t) => kindKey(t.kind) === key).length;
}
/** 눈에 보이는 곳(손·바닥·후로)에 몇 장 나와 있는가 */
function visibleCopies(s: GameState, key: string): number {
  let n = 0;
  for (const [zid, z] of Object.entries(s.zones)) {
    if (zid === "wall" || zid === "deadWall") continue;
    for (const id of z?.tileIds ?? []) if (kindKey(s.tiles[id]!.kind) === key) n++;
  }
  return n;
}

// p1·p2·p3 의 바닥에 3통이 네 장 다 나와 있다 = "3통은 절대 안 맞는다"가 성립하는 판.
const base = craft({
  hands: { p0: "111m22334455m99s", p1: "*", p2: "*", p3: "*" },
  discards: { p0: "", p1: "333p", p2: "3p", p3: "" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const s = withAug(base, "p0", ["tile_dyeing"]);
const game = createStandardGameFromState(s);
installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });

const before = game.engine.state;
console.log(
  `[전] pin3 — 게임 전체 ${totalCopies(before, "pin3")}장 · 이미 보인 장수 ${visibleCopies(before, "pin3")}장 · 아직 안 나온 장수 copiesLeftUndrawn=${copiesLeftUndrawn(before, { suit: "pin", rank: 3 })}`,
);

// 손패의 3만을 3통으로 염색한다 — 3통은 이미 네 장 다 바닥에 나와 있다
const target = handIdsOf(before, "p0").find(
  (id) => kindKey(before.tiles[id]!.kind) === "man3",
)!;
const r = game.engine.submit({
  player: "p0",
  type: "tile_dye",
  payload: { tileId: target, suit: "pin" },
});
console.log("염색 submit ok=", r.ok, r.ok ? "" : JSON.stringify(r));

const after = game.engine.state;
console.log(
  `[후] pin3 — 게임 전체 ${totalCopies(after, "pin3")}장 · 이미 보인 장수 ${visibleCopies(after, "pin3")}장 · 아직 안 나온 장수 copiesLeftUndrawn=${copiesLeftUndrawn(after, { suit: "pin", rank: 3 })}`,
);
console.log(
  `[후] man3 — 게임 전체 ${totalCopies(after, "man3")}장 (원래 4장)`,
);
console.log(
  "→ 바닥에서 네 장을 다 센 수비자에게 '절대 안 맞는' 3통이 p0 손에 한 장 더 있다.",
);

// 대조: 형제 suit_unify 는 같은 조작을 패산 실물과 1:1 로 맞바꾼다 → 총량 불변
