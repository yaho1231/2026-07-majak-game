/**
 * 의심 3 재검증 — sign_flip이 국 중 SCORE_CHANGED를 뒤집을 때 근거가 남는가.
 * 뒤집힌 이벤트의 reason이 무엇으로 남는지까지 본다.
 */
import type { GameState, PlayerId } from "@majak/core";
import { SCORE_CHANGED } from "@majak/core";
import { craft, start } from "../score-b/scene.js";

const tot = (s: GameState): number => s.players.reduce((n, p) => n + p.score, 0) + s.round.riichiPot;

function scene(armed: PlayerId[]): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const data: Record<string, unknown> = { "karma:gauge:p0": 12000 };
  for (const a of armed) data[`sign_flip:armedRound:${a}`] = "1-1-0";
  return { ...s, augmentData: { ...s.augmentData, ...data } };
}

function run(label: string, give: Record<string, string[]>, armed: PlayerId[]): void {
  const s = scene(armed);
  const before = tot(s);
  const { game, flow } = start(s, give as never);
  const seen: unknown[] = [];
  flow.submit("p0", { type: "karma_burn", payload: {} });
  const a = game.engine.state;
  // 원장(리플레이 로그)에 실린 SCORE_CHANGED를 그대로 읽는다
  const log = (game.engine as unknown as { eventLog: { type: string; payload: unknown }[] }).eventLog;
  for (const e of log) if (e.type === SCORE_CHANGED) seen.push(e.payload);
  console.log(`${label}\n  총합 ${before} -> ${tot(a)} (Δ${tot(a) - before})`);
  console.log(`  SCORE_CHANGED 원장 = ${JSON.stringify(seen)}`);
}

run("A. karma만 (반전 없음)", { p0: ["karma"] }, []);
run("B. karma + 피해자 p1이 sign_flip 발동 중", { p0: ["karma"], p1: ["sign_flip"] }, ["p1"]);
run("C. 피해자 셋 전부 sign_flip", { p0: ["karma"], p1: ["sign_flip"], p2: ["sign_flip"], p3: ["sign_flip"] }, ["p1", "p2", "p3"]);
