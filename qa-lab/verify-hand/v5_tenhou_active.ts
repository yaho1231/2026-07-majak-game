/**
 * 의심 4 재검증 — 손패 변형 액티브 + 오야 첫 순 → 천화(天和)가 서는가.
 * 대표로 dead_wall_master(왕패의 주인)를 쓴다: detail이 "아직 아무것도 버리지 않은
 * 국의 첫 순"을 발동 창으로 명시하므로 천화 창과 정확히 겹친다.
 */
import {
  DEAD_WALL, FlowController, buildWinContext, createStandardGameFromState,
  evaluateWin, handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { deadWallMaster } from "../../packages/content/src/augments/dead_wall_master.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const show = (st: GameState, p: PlayerId): string =>
  st.zones[handZone(p)]!.tileIds.map((i) => kindKey(kindOf(st, i))).join(" ");

// p0 = 오야(dealerSeat 0). 첫 순, 아무도 아무것도 버리지 않았다.
let st = craft({
  hands: { p0: "123456789m22m55p1z", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
// 왕패 맨 앞에 pin5 한 장을 넣어 둔다 (어느 존에서든 끌어와 자리를 맞바꾼다)
{
  const dw = st.zones[DEAD_WALL]!.tileIds;
  if (!dw.some((i) => kindKey(kindOf(st, i)) === "pin5")) {
    const donor = Object.values(st.tiles).find(
      (t) => kindKey(t.kind) === "pin5" && !st.zones[handZone("p0")]!.tileIds.includes(t.id),
    )!;
    const holderZone = Object.entries(st.zones).find(([, z]) => z.tileIds.includes(donor.id))![0];
    const swapOut = dw[0] as TileId;
    st = {
      ...st,
      zones: {
        ...st.zones,
        [DEAD_WALL]: { ...st.zones[DEAD_WALL]!, tileIds: [donor.id, ...dw.slice(1)] },
        [holderZone]: {
          ...st.zones[holderZone]!,
          tileIds: st.zones[holderZone]!.tileIds.map((t) => (t === donor.id ? swapOut : t)),
        },
      },
    };
  }
}
// 천화 창: 첫 바퀴 · 아무도 울지 않음 · 오야가 아직 아무것도 버리지 않음
st = {
  ...st,
  round: { ...st.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 },
};
console.log(`오야 = seat${st.round.dealerSeat} · firstTurn=${st.round.firstTurn} · p0 버림수=${st.round.byPlayer.p0!.discardedKinds.length}`);
console.log(`발동 전 손패: ${show(st, "p0")}`);

const game = createStandardGameFromState(withAug(st, "p0", ["dead_wall_master"]));
installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

// 1z ↔ 왕패의 pin5 를 맞바꾼다
const cur = game.engine.state;
const junk = cur.zones[handZone("p0")]!.tileIds.find((i) => kindKey(kindOf(cur, i)) === "wind1")!;
const dwIdx = cur.zones[DEAD_WALL]!.tileIds.findIndex((i) => kindKey(kindOf(cur, i)) === "pin5");
const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
const opt = opts.find(
  (o) =>
    o.type === "dw_swap" &&
    (o.payload as { handTileId: TileId; deadIndex: number }).handTileId === junk &&
    (o.payload as { deadIndex: number }).deadIndex === dwIdx,
);
console.log(`dw_swap 후보 총 ${opts.filter((o) => o.type === "dw_swap").length}개 · 1z↔pin5 후보 = ${opt !== undefined}`);
if (opt === undefined) throw new Error("원하는 교환 후보가 없다");
s = flow.submit("p0", opt as never);

const st2 = game.engine.state;
console.log(`교환 후 손패: ${show(st2, "p0")}`);
const drawn = st2.round.lastDrawnTile as TileId;
const ev = evaluateWin(buildWinContext(st2, "p0", "tsumo", drawn, { rules: game.engine.rules }), game.yaku);
console.log(`화료 판정: ok=${ev.ok} 역만=${ev.yakumanCount} 역=${ev.yaku.map((y) => y.id ?? y.name).join(",")}`);
const mine = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0") : undefined;
console.log(`win 제시 = ${mine?.options.some((o) => o.type === "win") === true}`);
console.log(
  ev.yaku.some((y) => (y.id ?? "").includes("tenhou") || (y.name ?? "").includes("천화"))
    ? "→ 증강이 완성한 손에 천화(天和)가 붙었다"
    : "→ 천화는 붙지 않았다",
);
