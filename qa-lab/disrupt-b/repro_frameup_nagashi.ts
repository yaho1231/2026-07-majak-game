/**
 * 누명(frame_up)이 **유국만관(나가시 만관)을 살려 준다**.
 *
 * 나가시 판정은 `round.byPlayer[x].discardedKinds` 로 한다
 * (standardActions.ts:1144 nagashiManganSeats). 누명은 `creditTo` 로 그 이력을
 * 지목당한 사람에게 새기므로, **보유자는 중장패를 버리고도 자기 이력은 요구패만 남는다**.
 * 즉 유국만관을 깨야 할 한 장을 남의 바닥에 버려 성립을 이어 갈 수 있다.
 *
 * 대조군: 같은 패를 표준 버림으로 버리면 나가시가 깨진다.
 */
import { SYSTEM_PLAYER, createStandardGameFromState, installAugment, handIdsOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { frameUp } from "../../packages/content/src/augments/frame_up.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}

function scene(): GameState {
  const s = withAug(
    craft({
      // p0 바닥은 요구패만 — 여기까지는 나가시 성립 중
      hands: { p0: "5m123p456p789p11s2s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "119m19p1z", p1: "234m", p2: "234p", p3: "234s" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up"] },
  );
  // 유국 직전 — 패산을 비운다 (남은 패는 왕패로 옮기지 않고 그냥 버린다: 검사 대상 아님)
  return { ...s, zones: { ...s.zones, wall: { ...s.zones["wall"]!, tileIds: [] } } };
}

function run(useFrame: boolean): void {
  const game = createStandardGameFromState(scene(), undefined, []);
  installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
  const st = game.engine.state;
  const five = handIdsOf(st, "p0").find((id) => {
    const k = st.tiles[id]!.kind;
    return k.suit === "man" && k.rank === 5;
  })!;
  const res = useFrame
    ? game.engine.submit({ player: "p0" as PlayerId, type: "frame_discard", payload: { tileId: five, target: "p1" as PlayerId } })
    : game.engine.submit({ player: "p0" as PlayerId, type: "discard", payload: { tileId: five } });
  // 버림 뒤 phase는 reaction — 유국 정산 지점(turn.draw, 패산 0)으로 옮겨 이어 간다
  const mid: GameState = { ...game.engine.state, round: { ...game.engine.state.round, phase: "turn.draw" } };
  const g2 = createStandardGameFromState(mid, undefined, []);
  installAugment(g2.engine, frameUp, "p0", { yaku: g2.yaku });
  const before = g2.engine.state.players.map((p) => p.score);
  const settle = g2.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
  const after = g2.engine.state.players.map((p) => p.score);
  console.log(
    `${useFrame ? "누명으로 5만 버림" : "표준으로 5만 버림"}: 제출=${res.ok} 정산=${settle.ok} ${settle.ok ? "" : (settle as { reason?: string }).reason ?? ""}`,
  );
  console.log("   p0 discardedKinds:", JSON.stringify(g2.engine.state.round.byPlayer["p0"]?.discardedKinds));
  console.log("   p1 discardedKinds:", JSON.stringify(g2.engine.state.round.byPlayer["p1"]?.discardedKinds));
  console.log("   점수:", before.join("/"), "→", after.join("/"),
    "  변화:", after.map((v, i) => v - before[i]!).join("/"));
}

run(false);
run(true);
