/**
 * 뒤늦은 출진(late_double) — "7순까지 건 리치는 더블리치" +
 * "앞서 몇 장을 버렸거나 **후로로 순서가 흐트러졌어도 상관없다**".
 *
 * 그런데 승격 판정은 `state.round.turnCount`이고, 코어는 **오야가 뽑을 때마다** +1 한다
 * (flowEvents.ts:402) — 영상패(rinshan) 쯔모도 예외가 아니다. 그래서 **오야가 깡을 치면
 * 그 자리에서 순 카운터가 하나 더 오르고**, 7순째에 건 리치가 8순 취급이 되어 더블 승격이 사라진다.
 */
import { FlowController, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { lateDouble } from "../../../packages/content/src/augments/late_double.js";

function scene(turnCount: number): GameState {
  const base = craft({
    hands: { p0: "1111m234p567p234s5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["late_double"] } : p)),
    round: { ...base.round, dealerSeat: 0, turnCount },
  };
}
function mk(s: GameState) {
  const g = createStandardGameFromState(s);
  installAugment(g.engine, lateDouble, "p0", { yaku: g.yaku });
  return g;
}

// ① 7순, 깡 없이 바로 리치
{
  const g = mk(scene(7));
  const t = g.engine.state.round.lastDrawnTile as TileId;
  const r = g.engine.submit({ player: "p0", type: "riichi", payload: { tileId: t } });
  console.log(`① 오야 7순 · 깡 없음   riichi.ok=${r.ok} turnCount=${g.engine.state.round.turnCount} double=${g.engine.state.round.byPlayer["p0"]?.riichi?.double}`);
}
// ② 같은 7순인데 그 순에 안깡을 한 번 친 뒤 리치 (FlowController로 영상 쯔모까지 진행)
{
  const g = mk(scene(7));
  const flow = new FlowController(g.engine);
  flow.begin();
  const hand = g.engine.state.zones["hand:p0"]!.tileIds;
  const man1 = hand.filter((id) => g.engine.state.tiles[id]!.kind.suit === "man").slice(0, 4);
  flow.submit("p0", { type: "ankan", payload: { tileIds: man1 } } as never);
  console.log(`② 안깡 후 turnCount 7 → ${g.engine.state.round.turnCount} (영상 쯔모가 오야 쯔모로 세어졌다) rinshan=${g.engine.state.round.lastDrawRinshan}`);
  const t = g.engine.state.round.lastDrawnTile as TileId;
  const r: any = g.engine.submit({ player: "p0", type: "riichi", payload: { tileId: t } });
  console.log(`   같은 7순 리치        riichi.ok=${r.ok} err=${JSON.stringify(r.error ?? r.reason)} double=${g.engine.state.round.byPlayer["p0"]?.riichi?.double}  ← 승격이 사라졌다`);
}
