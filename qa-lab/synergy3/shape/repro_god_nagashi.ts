/**
 * 마작의 거신병(giant_god) × 유국역만(nagashi_yakuman).
 *
 * 두 카드의 조건은 **포함 관계**다:
 *   거신병 = "국사무쌍 13종을 내가 전부 버려 뒀다" (13종 전부 요구패)
 *   유국역만 = "내가 버린 패가 전부 요구패·자패"
 * 즉 거신병을 켤 수 있는 판은 (다른 걸 안 버렸다면) 곧 유국역만이 서 있는 판이다.
 *
 * 기대(미리 적음):
 *  · 각성 전: 유국이면 유국역만 성립(+32000/48000).
 *  · 각성 후: 거신병이 버림 이력을 갈아 끼운다(요구패 이력 전부 삭제 + 내려보낸 손패
 *    13장의 비요구패를 이력에 추가). 그래서 **유국역만이 조용히 깨진다**.
 *    어느 카드에도 그런 말은 없다. 각성 = 화료 보장이라 보통은 문제가 안 되지만,
 *    남이 먼저 화료하거나 유국이 오면 (거신병은 다음 순 쯔모로 화료하므로 그 사이
 *    상대 론·유국이 끼어들 수 있다) 32,000점이 사라진다.
 */
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  createZone,
  FlowController,
  installAugment,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { giantGod } from "../../../packages/content/src/augments/giant_god.js";
import { nagashiYakuman } from "../../../packages/content/src/augments/nagashi_yakuman.js";

const POND = "19m19p19s1234z567z"; // 국사 13종 = 전부 요구패
const HAND = "234567m2345p234s";   // 13장, 요구패 없음

function scene() {
  let st: GameState = craft({
    hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
    discards: { p0: POND },
    phase: "turn.act",
    turnSeat: 0,
  });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ["giant_god", "nagashi_yakuman"] } : p)) };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
  installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
  return game;
}

function settleDraw(src: GameState) {
  // 유국 상태로 만든다 — 패산 비우고 phase=turn.draw (증강을 다시 심은 새 게임으로)
  const st: GameState = {
    ...src,
    zones: { ...src.zones, [WALL]: { ...createZone(WALL, "wall"), tileIds: [] } },
    round: { ...src.round, phase: "turn.draw" },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
  installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
  const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} } as never);
  if (!(r as { ok: boolean }).ok) throw new Error((r as { reason: string }).reason);
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      const p = log[i]!.payload as Record<string, unknown>;
      return { deltas: p["deltas"], special: p["drawSpecial"] };
    }
  }
  throw new Error("no settle");
}

// ── A. 각성하지 않고 유국 ──
{
  const g = scene();
  console.log("A. 각성 전 유국:");
  console.log("   discardedKinds:", g.engine.state.round.byPlayer["p0"]?.discardedKinds.join(","));
  console.log("  ", JSON.stringify(settleDraw(g.engine.state)));
}

// ── B. 각성한 뒤 유국 ──
{
  const g = scene();
  const flow = new FlowController(g.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  const opt = prompt?.options.find((o) => o.type === "giant_god");
  console.log("\nB. 각성 후 유국:  거신병 옵션 =", opt !== undefined);
  flow.submit("p0", opt as never);
  const rs = g.engine.state.round.byPlayer["p0"];
  console.log("   각성 후 discardedKinds:", rs?.discardedKinds.join(","));
  console.log("   손패:", (g.engine.state.zones["hand:p0"]?.tileIds ?? []).length, "장");
  console.log("  ", JSON.stringify(settleDraw(g.engine.state)));
}
