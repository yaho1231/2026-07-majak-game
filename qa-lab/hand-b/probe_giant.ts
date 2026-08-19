/**
 * 거신병 정밀 조사
 *  A) 재각성 루프 — 손패가 순국사이고 바닥도 국사 13종을 덮으면 무한히 다시 눌린다?
 *  B) 쯔모패가 손패 배열의 끝이 아닐 때 handOut(앞 13장)이 쯔모패를 바닥으로 내던지는가
 */
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { giantGod } from "../../packages/content/src/augments/giant_god.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

console.log("### A) 재각성 루프");
{
  // 손패 = 순수 국사 13장, 바닥 = 국사 13종
  const base = craft({
    hands: { p0: "19m19p19s1234567z", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "19m19p19s1234z567z" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const { game, flow, status } = start(withAug(base, "p0", ["giant_god"]));
  let s = status;
  let n = 0;
  for (; n < 50; n++) {
    if (s.kind !== "awaiting") break;
    const pr = s.prompts.find((p) => p.player === "p0");
    const opt = pr?.options.find((o) => o.type === "giant_god");
    if (opt === undefined) break;
    s = flow.submit("p0", opt as { type: string; payload: unknown });
  }
  const st = game.engine.state;
  console.log(`  연속 발동 횟수 = ${n}`);
  console.log(`  손패=${st.zones[handZone("p0")]?.tileIds.length} 바닥=${st.zones[discardsZone("p0")]?.tileIds.length}`);
  console.log(`  discardedKinds=${st.round.byPlayer.p0?.discardedKinds.length} discardCount=${st.round.byPlayer.p0?.discardCount}`);
  console.log(`  → ${n >= 50 ? "🔴 무한 재발동 (턴이 넘어가지 않는다)" : "정상 종료"}`);
}

console.log("\n### B) 쯔모패가 손패 배열 끝이 아닐 때");
{
  const base = craft({
    hands: { p0: "234567m2345p234s7z", p1: "*", p2: "*", p3: "*" }, // 14장
    discards: { p0: "19m19p19s1234z567z" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const hand = base.zones[handZone("p0")]!.tileIds;
  // 쯔모패가 배열 중간(index 0)인 상태 — 손패를 재배열하는 증강 뒤에 생길 수 있는 배치
  const state: GameState = {
    ...base,
    round: { ...base.round, lastDrawnTile: hand[0] as TileId },
  };
  const drawnId = hand[0] as TileId;
  const { game, flow, status } = start(withAug(state, "p0", ["giant_god"]));
  const pr = status.kind === "awaiting" ? status.prompts.find((p) => p.player === "p0") : undefined;
  const opt = pr?.options.find((o) => o.type === "giant_god");
  console.log(`  액티브 제시=${opt !== undefined}`);
  if (opt !== undefined) {
    let s2;
    try {
      s2 = flow.submit("p0", opt as { type: string; payload: unknown });
    } catch (e) {
      console.log(`  🔴 submit 중 throw: ${String(e)}`);
    }
    const st = game.engine.state;
    const h = st.zones[handZone("p0")]?.tileIds ?? [];
    const pond = st.zones[discardsZone("p0")]?.tileIds ?? [];
    console.log(`  lastDrawnTile=${st.round.lastDrawnTile} (원래 쯔모패 ${drawnId})`);
    console.log(`  쯔모패가 손에 있는가=${h.includes(st.round.lastDrawnTile as TileId)} / 바닥에 있는가=${pond.includes(st.round.lastDrawnTile as TileId)}`);
    console.log(`  손패=${h.length} 바닥=${pond.length}`);
    if (s2?.kind === "awaiting") {
      const pr2 = s2.prompts.find((p) => p.player === "p0");
      const types = new Set(pr2?.options.map((o) => o.type));
      console.log(`  다음 프롬프트 옵션종류=${[...types].join(",")}`);
      // 쯔모패를 버리려고 시도 (리치 쯔모기리 강제 경로가 읽는 값)
      const disc = pr2?.options.find((o) => o.type === "discard");
      if (disc !== undefined) {
        try {
          flow.submit("p0", disc as { type: string; payload: unknown });
          console.log("  버림 정상");
        } catch (e) {
          console.log(`  🔴 버림에서 throw: ${String(e)}`);
        }
      }
    }
  }
}
