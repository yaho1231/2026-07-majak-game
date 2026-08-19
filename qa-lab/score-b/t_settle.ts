/**
 * 정산 개입 계열 최소 장면 — karma / blame_shift / honba_hunter / sign_flip.
 * 실행: tsx qa-lab/score-b/t_settle.ts
 */
import { FlowController } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };

function withScores(s: GameState, sc: Partial<Record<PlayerId, number>>): GameState {
  return { ...s, players: s.players.map((p) => (sc[p.id] !== undefined ? { ...p, score: sc[p.id]! } : p)) };
}
function withRound(s: GameState, r: Partial<GameState["round"]>): GameState {
  return { ...s, round: { ...s.round, ...r } };
}
function withData(s: GameState, d: Record<string, unknown>): GameState {
  return { ...s, augmentData: { ...s.augmentData, ...d } };
}
const totalOf = (s: GameState): number =>
  s.players.reduce((n, p) => n + p.score, 0) + s.round.riichiPot;

/** p0 단기 9s 대기, p1이 9s 방총 */
function ronScene(): GameState {
  return craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
}
/** p0 쯔모 장면 */
function tsumoScene(): GameState {
  return craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

function settle(s: GameState, give: Record<string, string[]>, who: PlayerId): void {
  const { flow } = start(s, give as never);
  const st = (flow as FlowController).submit(who, { type: "win", payload: {} });
  if (st.kind !== "roundOver") { say(`  화료 실패 ${st.kind}`); return; }
  const p = lastSettled(flow);
  const sum = Object.values(p.deltas).reduce((a, b) => a + b, 0);
  const w = p.winInfos?.[0];
  say(
    `  Σdeltas=${sum} potGain=${w?.riichiPotGain ?? 0} deltas=${JSON.stringify(p.deltas)} ` +
    `pts=${w?.points} honbaBonus=${w?.honbaBonus ?? 0} aug=${JSON.stringify(p.augPoints ?? [])}`,
  );
}

// ── 1. honba_hunter: 5본장 론/쯔모
say("1a honba_hunter 5본장 론 (보유자 화료)");
settle(withRound(ronScene(), { honba: 5 }), { p0: ["honba_hunter"] }, "p0");
say("1b 대조군: 증강 없음 5본장 론");
settle(withRound(ronScene(), { honba: 5 }), { p0: [] }, "p0");
say("1c honba_hunter 5본장 쯔모");
settle(withRound(tsumoScene(), { honba: 5 }), { p0: ["honba_hunter"] }, "p0");
say("1d honba_hunter 5본장 — 보유자가 아닌 p0가 화료(보유자는 p3)");
settle(withRound(ronScene(), { honba: 5 }), { p3: ["honba_hunter"] }, "p0");

// ── 2. blame_shift
say("2a blame_shift 론 (기본)");
settle(ronScene(), { p0: ["blame_shift"] }, "p0");
say("2b blame_shift + honba_hunter 5본장 론");
settle(withRound(ronScene(), { honba: 5 }), { p0: ["blame_shift", "honba_hunter"] }, "p0");
say("2c blame_shift — 지불자 중 하나가 100점만 남았을 때");
settle(withScores(ronScene(), { p2: 100 }), { p0: ["blame_shift"] }, "p0");
say("2d blame_shift — 지불자 중 하나가 이미 음수(도비 대기)");
settle(withScores(ronScene(), { p2: -3000 }), { p0: ["blame_shift"] }, "p0");

// ── 3. sign_flip (뱅크 발행 — 총합이 깨지는 것이 설계)
say("3a sign_flip 론 화료 (armed)");
{
  const s = withData(ronScene(), { "sign_flip:armedRound:p0": "1-1-0" });
  settle(s, { p0: ["sign_flip"] }, "p0");
}
say("3b sign_flip + blame_shift 동시 (armed) — 정산 순서 겹침");
{
  const s = withData(ronScene(), { "sign_flip:armedRound:p0": "1-1-0" });
  settle(s, { p0: ["sign_flip", "blame_shift"] }, "p0");
}
say("3c sign_flip 보유자가 방총 (armed) — p3가 화료");
{
  const base = craft({
    hands: { p3: "123m123p123s678s9s", p0: "*", p1: "*", p2: "*" },
    discards: { p0: "9s" },
    phase: "reaction",
    turnSeat: 0,
    lastDiscard: { player: "p0", spec: "9s" },
  });
  settle(withData(base, { "sign_flip:armedRound:p0": "1-1-0" }), { p0: ["sign_flip"] }, "p3");
}

// ── 4. karma
say("4 karma burn");
for (const [label, scores, gauge] of [
  ["4a 정상 (게이지 12000, 전원 25000)", {}, 12000],
  ["4b 상대 하나가 800점", { p1: 800 }, 12000],
  ["4c 상대 하나가 음수", { p1: -2000 }, 12000],
  ["4d 상대 전원 0점", { p1: 0, p2: 0, p3: 0 }, 12000],
  ["4e 게이지 8000 정확", {}, 8000],
] as [string, Partial<Record<PlayerId, number>>, number][]) {
  const s = withData(withScores(tsumoScene(), scores), { "karma:gauge:p0": gauge });
  const before = totalOf(s);
  const { game, flow } = start(s, { p0: ["karma"] } as never);
  const res = (flow as FlowController).submit("p0", { type: "karma_burn", payload: {} });
  const after = game.engine.state;
  say(
    `${label}: kind=${res.kind} scores=${JSON.stringify(after.players.map((p) => [p.id, p.score]))} ` +
    `gauge=${String(after.augmentData["karma:gauge:p0"])} total ${before} -> ${totalOf(after)}`,
  );
}
