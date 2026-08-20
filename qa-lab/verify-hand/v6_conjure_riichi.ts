/**
 * 의심 3 재검증 — conjure_draw 가 리치 중에 발동되는 것이 '리치 손 동결' 규약 위반인가.
 * 검사: 발동 전후로 손패의 tileId·kind 가 하나라도 바뀌는가 / 장수가 바뀌는가.
 * (바뀌지 않는다면 "손패를 건드리는 액티브를 막는다"(honor_return.ts:91-96)의 대상이 아니다.)
 */
import {
  FlowController, createStandardGameFromState, handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { conjureDraw } from "../../packages/content/src/augments/conjure_draw.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const snap = (st: GameState, p: PlayerId): string =>
  st.zones[handZone(p)]!.tileIds.map((i) => `${i}:${kindKey(kindOf(st, i))}`).join(" ");

const base = craft({
  hands: { p0: "123456789m123p5s9s", p1: "*", p2: "*", p3: "*" },
  discards: { p0: "1z2z3z" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const st: GameState = {
  ...withAug(base, "p0", ["conjure_draw"]),
  round: {
    ...base.round,
    byPlayer: {
      ...base.round.byPlayer,
      p0: { ...base.round.byPlayer.p0!, riichi: { declaredTurn: 1, ippatsu: false, double: false } as never },
    },
  },
};
const game = createStandardGameFromState(st);
installAugment(game.engine, conjureDraw, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
const s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

const before = game.engine.state;
console.log(`리치 중 = ${before.round.byPlayer.p0?.riichi != null}`);
console.log(`발동 전 손패: ${snap(before, "p0")}`);
const wallBefore = Object.keys(before.zones).length;

const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
const target = opts.find(
  (o) => o.type === "conjure_tsumo" && kindKey(kindOf(before, (o.payload as { tileId: TileId }).tileId)) === "sou5",
);
if (target === undefined) throw new Error("sou5 후보 없음");
flow.submit("p0", target as never);
const after = game.engine.state;
console.log(`발동 후 손패: ${snap(after, "p0")}`);
console.log(`손패 동일 = ${snap(before, "p0") === snap(after, "p0")}  · 존 수 동일 = ${wallBefore === Object.keys(after.zones).length}`);
console.log(
  snap(before, "p0") === snap(after, "p0")
    ? "→ 손패를 한 장도 건드리지 않는다. 리치 동결 규약의 대상이 아니다 (예약만 남긴다)"
    : "→ 손패가 바뀌었다",
);
