/**
 * 재장전(reload)이 **지속 중인 6순 효과를 그 자리에서 꺼 버린다**.
 *
 * 함구령·박무는 "지금 효과가 살아 있는가"를 `사용 카운터 > 0 && turnCount - 선언순 < 6`
 * 으로 판정한다(call_seal.ts:44 sealActive / brief_fog.ts:96 fogActive).
 * 재장전은 그 사용 카운터를 1 되돌리므로, **1회차 보유자(동풍전)** 나 카운터가 1인
 * 상태에서 재장전을 쓰면 카운터가 0이 되어 활성 판정이 즉시 거짓이 된다 —
 * 남은 순이 몇 순이든 봉인/안개가 그 자리에서 걷힌다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId, VisibilityRule } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { callSeal } from "../../packages/content/src/augments/call_seal.js";
import { briefFog } from "../../packages/content/src/augments/brief_fog.js";
import { reload } from "../../packages/content/src/augments/reload.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}

function scene(augs: string[]) {
  const s = withAug(
    craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
    { p0: augs },
  );
  const game = createStandardGameFromState(s, undefined, []);
  const defs = { call_seal: callSeal, brief_fog: briefFog, reload } as const;
  for (const a of augs) {
    installAugment(game.engine, defs[a as keyof typeof defs], "p0", { yaku: game.yaku });
  }
  return game;
}

// ── ① 함구령 ────────────────────────────────────────────────────────
{
  const game = scene(["call_seal", "reload"]);
  const blocked = (): boolean =>
    game.engine.rules.resolve<boolean>("call.blocked", { playerId: "p1" as PlayerId, state: game.engine.state });

  console.log("선언 전 p1 후로 봉인:", blocked());
  console.log("선언:", game.engine.submit({ player: "p0", type: "call_seal_use", payload: {} }).ok);
  console.log(`선언 직후 (turnCount=${game.engine.state.round.turnCount}) p1 후로 봉인:`, blocked(),
    " uses=", game.engine.state.augmentData["call_seal:uses:p0"]);
  const r = game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "call_seal" } });
  console.log("재장전:", r.ok, r.ok ? "" : (r as { reason?: string }).reason);
  console.log(`재장전 직후 (turnCount=${game.engine.state.round.turnCount}, 아직 1순도 안 지났다) p1 후로 봉인:`,
    blocked(), " uses=", game.engine.state.augmentData["call_seal:uses:p0"]);
}

// ── ② 박무 ──────────────────────────────────────────────────────────
{
  const game = scene(["brief_fog", "reload"]);
  const vis = (): VisibilityRule =>
    game.engine.rules.resolve<VisibilityRule>("visibility.discards", {
      playerId: "p1" as PlayerId,
      state: game.engine.state,
    });
  console.log("\n선언 전 p1이 보는 바닥:", vis());
  game.engine.submit({ player: "p0", type: "declare_brief_fog", payload: {} });
  console.log("선언 직후 p1이 보는 바닥:", vis());
  const r = game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "brief_fog" } });
  console.log("재장전:", r.ok);
  console.log("재장전 직후 p1이 보는 바닥:", vis(),
    " uses=", game.engine.state.augmentData["brief_fog:uses:p0"]);
}
