/**
 * 왕패의 주인(dead_wall_master) × 첫 순 안깡 — **영상개화(린샨카이호) 플래그가 남는다**
 *
 * `dw_swap` 리듀서는 쯔모패를 갈아 끼울 때 `round.lastDrawnTile`만 바꾸고
 * `round.lastDrawRinshan`은 건드리지 않는다(dead_wall_master.ts:214-222).
 * 같은 일을 하는 다른 증강(개벽·단색 세계·밥상 뒤엎기)은 전부 `replaceDrawnTile()`을
 * 쓰는데, 그 함수가 하는 일이 바로 **lastDrawRinshan을 false로 되돌리는 것**이다
 * (content/src/util.ts:224-229).
 *
 * 발동 창은 "아직 한 장도 버리지 않은 내 순"이라 **첫 순 안깡 직후에도 열려 있다**.
 * 그래서 영상 쯔모를 왕패에서 고른 다른 패로 바꿔치기해도 영상개화가 그대로 붙는다 —
 * 왕패 14장이 전부 보이는 증강이라 그 안에 오름패가 있으면 골라 오면 된다.
 */
import {
  DEAD_WALL,
  WALL,
  FlowController,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { buildWinContext, evaluateWin } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { deadWallMaster } from "../../packages/content/src/augments/dead_wall_master.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

// p0(오야) 배패 14장 = 안깡 재료 1111m + 234p 567p 234s + 9s 단기
let st = craft({
  hands: { p0: "1111m234p567p234s9s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
// 왕패에 9s를 한 장 심어 둔다 (패산에 있는 9s와 왕패 한 자리를 맞바꾼다 — 총량 보존)
{
  const dw = [...(st.zones[DEAD_WALL]?.tileIds ?? [])];
  const wall = [...(st.zones[WALL]?.tileIds ?? [])];
  const wi = wall.findIndex((id) => kindKey(kindOf(st, id)) === "sou9");
  if (wi < 0) throw new Error("패산에 9s가 없다");
  const swapTo = 3; // 영상패 블록(앞쪽) 안의 아무 자리
  const a = dw[swapTo] as TileId;
  dw[swapTo] = wall[wi] as TileId;
  wall[wi] = a;
  st = {
    ...st,
    zones: {
      ...st.zones,
      [DEAD_WALL]: { ...(st.zones[DEAD_WALL] as never), tileIds: dw },
      [WALL]: { ...(st.zones[WALL] as never), tileIds: wall },
    },
  };
}
st = withAug(st, "p0", ["dead_wall_master"]);
console.log("왕패:", (st.zones[DEAD_WALL]?.tileIds ?? []).map((i) => kindKey(kindOf(st, i))).join(" "));

const game = createStandardGameFromState(st);
installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

// ① 첫 순 안깡
const kan = s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "ankan");
if (kan === undefined) throw new Error("no ankan option");
s = flow.submit("p0", kan as { type: string; payload: unknown });
let cur = game.engine.state;
console.log(
  `안깡 후: 손패=${cur.zones[handZone("p0")]?.tileIds.length} 영상쯔모=${kindKey(kindOf(cur, cur.round.lastDrawnTile as TileId))} ` +
    `lastDrawRinshan=${cur.round.lastDrawRinshan} 왕패=${cur.zones[DEAD_WALL]?.tileIds.length} discardCount=${cur.round.byPlayer.p0?.discardCount}`,
);

// ② 아직 아무것도 안 버렸으므로 dw_swap 창이 열려 있다 — 영상 쯔모를 왕패의 9s와 맞바꾼다
const opts = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
console.log(`dw_swap 후보 = ${opts.filter((o) => o.type === "dw_swap").length} (영상 쯔모 직후인데 열려 있다)`);
const rinshanId = cur.round.lastDrawnTile as TileId;
const dwNow = cur.zones[DEAD_WALL]?.tileIds ?? [];
const nineIdx = dwNow.findIndex((id) => kindKey(kindOf(cur, id)) === "sou9");
const swap = opts.find((o) => {
  const p = o.payload as { handTileId: TileId; deadIndex: number };
  return o.type === "dw_swap" && p.handTileId === rinshanId && p.deadIndex === nineIdx;
});
if (swap === undefined) {
  console.log(`왕패에 9s 없음(idx=${nineIdx}) — 시나리오 구성 실패`);
} else {
  s = flow.submit("p0", swap as { type: string; payload: unknown });
  cur = game.engine.state;
  const hand = cur.zones[handZone("p0")]?.tileIds ?? [];
  console.log(
    `교환 후: 손패=${hand.map((i) => kindKey(kindOf(cur, i))).join(" ")}\n` +
      `        lastDrawnTile=${kindKey(kindOf(cur, cur.round.lastDrawnTile as TileId))} ` +
      `lastDrawRinshan=${cur.round.lastDrawRinshan}  ← 왕패에서 골라 온 패인데 영상 쯔모 취급`,
  );
  const mine = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0") : undefined;
  const win = mine?.options.find((o) => o.type === "win");
  console.log(`화료(win) 제시 = ${win !== undefined}`);
  {
    const ctxA = buildWinContext(cur, "p0", "tsumo", cur.round.lastDrawnTile as TileId, { rules: game.engine.rules });
    const evA = evaluateWin(ctxA, game.yaku);
    const noRinshan: GameState = { ...cur, round: { ...cur.round, lastDrawRinshan: false } };
    const evB = evaluateWin(buildWinContext(noRinshan, "p0", "tsumo", cur.round.lastDrawnTile as TileId, { rules: game.engine.rules }), game.yaku);
    console.log(`  실제 역: ${evA?.yaku.map((y) => y.id).join(",")} / ${evA?.han}판 ${evA?.fu}부 ${evA?.points}점`);
    console.log(`  rinshan 플래그를 끄면: ${evB?.yaku.map((y) => y.id).join(",")} / ${evB?.han}판 ${evB?.fu}부 ${evB?.points}점`);
  }
  if (win !== undefined) {
    s = flow.submit("p0", win as { type: string; payload: unknown });
    const after = game.engine.state;
    console.log("정산 후 점수:", after.players.map((p) => `${p.id}=${p.score}`).join(" "));
    console.log(
      "🔴 확정: 첫 순 안깡 → 왕패의 주인으로 오름패를 골라 와도 lastDrawRinshan이 true로 남아 영상개화가 붙는다",
    );
  }
}
