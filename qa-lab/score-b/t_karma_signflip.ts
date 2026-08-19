/**
 * 카르마 강탈 × 반전 — 국 중 ScoreChanged 부호 반전이 총합을 어떻게 움직이는가.
 * 실행: tsx qa-lab/score-b/t_karma_signflip.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };
const tot = (s: GameState): number => s.players.reduce((n, p) => n + p.score, 0) + s.round.riichiPot;

function scene(armed: PlayerId[], gauge: number): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const data: Record<string, unknown> = { "karma:gauge:p0": gauge };
  for (const a of armed) data[`sign_flip:armedRound:${a}`] = "1-1-0";
  return { ...s, augmentData: { ...s.augmentData, ...data } };
}

function run(label: string, give: Record<string, string[]>, armed: PlayerId[]): void {
  const s = scene(armed, 12000);
  const before = tot(s);
  const { game, flow } = start(s, give as never);
  const res = flow.submit("p0", { type: "karma_burn", payload: {} });
  const a = game.engine.state;
  say(
    `${label}: kind=${res.kind} scores=${JSON.stringify(a.players.map((p) => `${p.id}:${p.score}`))} ` +
    `총합 ${before} -> ${tot(a)} (Δ${tot(a) - before}) gauge=${String(a.augmentData["karma:gauge:p0"])}`,
  );
}

run("K1 karma만", { p0: ["karma"] }, []);
run("K2 karma + 피해자 p1이 sign_flip(발동 중)", { p0: ["karma"], p1: ["sign_flip"] }, ["p1"]);
run("K3 karma 보유자 자신이 sign_flip(발동 중)", { p0: ["karma", "sign_flip"] }, ["p0"]);
run("K4 피해자 셋 전부 sign_flip(발동 중)", { p0: ["karma"], p1: ["sign_flip"], p2: ["sign_flip"], p3: ["sign_flip"] }, ["p1", "p2", "p3"]);
