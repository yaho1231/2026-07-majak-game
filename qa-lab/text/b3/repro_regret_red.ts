/**
 * 미련(regret) — "그 손패 13장이 **그대로** 다음 국의 배패가 된다"
 *
 * 보존은 kind만 뜬다(`kindOf`). 주입은 `attrs:{conjured:true, red:false}`로 덮는다.
 * 그래서 보존한 텐파이 손에 적도라(빨간 5)가 있었으면 다음 국에는 **평범한 5**로 돌아온다.
 * 붉은 손길(red_five_touch)의 각인(redFor)도 같은 자리에서 지워진다.
 */
import {
  SYSTEM_PLAYER, createStandardGameFromState, handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { regret } from "../../../packages/content/src/augments/regret.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st, players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const dump = (st: GameState, p: PlayerId) =>
  st.zones[handZone(p)]!.tileIds
    .map((i) => `${kindKey(kindOf(st, i))}${st.tiles[i]!.attrs.red === true ? "(적)" : ""}${st.tiles[i]!.attrs.redFor !== undefined ? `[${st.tiles[i]!.attrs.redFor}]` : ""}`)
    .join(" ");

// p0: 234m456m789m55p + 5s5s?  → 멘젠 텐파이 손을 만든다: 123m456m789m11p 45p (4p/7p 대기)
const base = craft({
  hands: { p0: "123456789m11p45p", p1: "*", p2: "*", p3: "*" },
  phase: "turn.draw",
  turnSeat: 0,
});
// 손패의 5통 한 장을 '패산에서 나온 진짜 적도라'로 만든다 + 만5 한 장에 붉은 손길 각인
const handIds = base.zones[handZone("p0")]!.tileIds;
const pin5 = handIds.find((i) => kindKey(kindOf(base, i)) === "pin5")!;
const man5 = handIds.find((i) => kindKey(kindOf(base, i)) === "man5")!;
const st: GameState = {
  ...withAug(base, "p0", ["regret"]),
  tiles: {
    ...base.tiles,
    [pin5]: { ...base.tiles[pin5]!, attrs: { ...base.tiles[pin5]!.attrs, red: true } },
    [man5]: { ...base.tiles[man5]!, attrs: { ...base.tiles[man5]!.attrs, red: true, redFor: "p0" } },
  },
  zones: { ...base.zones, wall: { ...base.zones["wall"]!, tileIds: [] } },
};

console.log("유국 직전 p0 손패(13장):", dump(st, "p0"));

const game = createStandardGameFromState(st);
installAugment(game.engine, regret, "p0", { yaku: game.yaku });

const r1 = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
console.log("sys.settleDraw ok =", r1.ok);
const kept = game.engine.state.augmentData["regret:keep:p0"] as { suit: string; rank: number }[];
console.log("보존된 값(regret:keep:p0):", JSON.stringify(kept));
console.log("  ⇒ 보존 값에 red/redFor 필드가 있는가:",
  kept.some((k) => Object.keys(k).some((x) => x === "red" || x === "redFor")));

const r2 = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} });
console.log("sys.startRound ok =", r2.ok);
const after = game.engine.state;
console.log("다음 국 p0 배패:", dump(after, "p0"));
const reds = after.zones[handZone("p0")]!.tileIds.filter((i) => after.tiles[i]!.attrs.red === true);
console.log(`  ⇒ 되받은 손의 적도라 장수 = ${reds.length} (유국 직전엔 2장: 진짜 적5통 + 붉은 손길 각인 만5)`);
