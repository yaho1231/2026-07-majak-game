/**
 * augbug 후속 지시(coordinator) — i=94148 SCORE_DRIFT_UNEXPLAINED 정밀 재현.
 * devils_advance의 "만관 폭발" 정산이 상대 3명의 -3000씩에 augPoints 근거를 남기는지
 * 직접 확인한다. packages/ 는 건드리지 않는다.
 */
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type { GameState, RoundSettledPayload, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { devilsAdvance } from "../../../packages/content/src/augments/devils_advance.js";

const SYS = "__system";
type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}
function lastSettled(game: Game): RoundSettledPayload {
  const e = [...game.engine.eventLog].reverse().find((ev) => ev.type === ROUND_SETTLED);
  if (e === undefined) throw new Error("no ROUND_SETTLED found");
  return e.payload as RoundSettledPayload;
}

// p0가 만관 이상(쯔모)으로 화료 — devils_advance 보유. 청일색+역패 등으로 확실히 만관을 넘긴다.
// 손패: 청일색(만수 일색) + 역패(백)로 하네만급을 노린다. 정확한 판수는 중요하지 않다 —
// "만관 이상"(WinInfo.limit !== null)만 만족하면 된다.
// 순정구련보등(역만, 만관 훨씬 초과) — 14장 전체를 그대로 hands에 싣고
// phase:turn.act + drawnLastFor로 "방금 쯔모한 손"을 만든다(콴 확인 완료,
// combat_augments.test.ts의 drawnLastFor 관례를 그대로 따름).
function craftMangan(): GameState {
  return craft({
    hands: { p0: "11112345678999m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

const st = withAug(craftMangan(), "p0", ["devils_advance"]);
const game = createStandardGameFromState(st);
installAugment(game.engine, devilsAdvance, "p0", { yaku: game.yaku });

const drawTile = game.engine.state.zones["hand:p0"]?.tileIds.at(-1) as TileId;
const r = game.engine.submit({
  player: SYS,
  type: "sys.settleWin",
  payload: { wins: [{ winner: "p0", from: null, tileId: drawTile, winType: "tsumo" }] },
});
if (!r.ok) {
  console.log(`SETUP FAILED: ${r.reason}`);
  process.exit(1);
}
const settled = lastSettled(game);
console.log("deltas:", JSON.stringify(settled.deltas));
console.log("augPoints:", JSON.stringify(settled.augPoints));
const total = Object.values(settled.deltas).reduce((a, b) => a + (b ?? 0), 0);
console.log("delta 총합(이 정산만):", total);

const explainedForOpponents = ["p1", "p2", "p3"].map((id) => {
  const notes = (settled.augPoints ?? []).filter((n: { player?: string }) => n.player === id);
  return { id, delta: settled.deltas[id], notes };
});
console.log("상대 3명의 delta vs augPoints 근거:", JSON.stringify(explainedForOpponents, null, 2));
