/**
 * 더블론 × 책임전가(blame_shift) — 화료자가 둘일 때 지불 재배선이 맞는가.
 * detail: "더블론이면 화료자를 뺀 나머지끼리 나누므로 3분할이 아니라 2분할이 된다"
 * 실행: tsx qa-lab/score-b/t_doubleron.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };

/** p0·p2 가 모두 9s 단기 대기, p1이 9s 방총 */
function scene(honba: number): GameState {
  const s = craft({
    hands: {
      p0: "123m123p123s678s9s",
      p2: "456m456p456s678p9s",
      p1: "*", p3: "*",
    },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  return { ...s, round: { ...s.round, honba } };
}

function run(label: string, give: Record<string, string[]>, honba: number): void {
  let flow;
  try {
    ({ flow } = start(scene(honba), give as never));
  } catch (e) { say(`${label}: 조립 실패 ${String(e).split("\n")[0]}`); return; }
  // p0가 먼저 론, 이어서 p2도 론 (같은 버림패)
  let st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind === "awaiting") {
    try { st = flow.submit("p2", { type: "win", payload: {} }); }
    catch (e) { say(`${label}: p2 론 불가 ${String(e).split("\n")[0]}`); }
  }
  if (st.kind !== "roundOver") { say(`${label}: 끝나지 않음 ${st.kind}`); return; }
  const p = lastSettled(flow);
  const sum = Object.values(p.deltas).reduce((a, b) => a + b, 0);
  const bank = (p.augPoints ?? []).filter((n) => n.augId === "sign_flip").reduce((n, x) => n + x.points, 0);
  const potGain = (p.winInfos ?? []).reduce((n, w) => n + (w.riichiPotGain ?? 0), 0);
  const winners = (p.winInfos ?? []).map((w) => w.winner);
  const losers = (["p0", "p1", "p2", "p3"] as PlayerId[]).filter((x) => !winners.includes(x));
  const paid = losers.map((x) => -(p.deltas[x] ?? 0));
  say(
    `${label}: 잔차=${sum - potGain - bank} winners=${winners} deltas=${JSON.stringify(p.deltas)} ` +
    `losers=${losers} pay=${JSON.stringify(paid)} ` +
    `pts=${JSON.stringify((p.winInfos ?? []).map((w) => [w.winner, w.points, w.honbaBonus ?? 0]))} ` +
    `aug=${JSON.stringify((p.augPoints ?? []).map((n) => `${n.augId}:${n.player}:${n.points}`))}`,
  );
}

run("X0 더블론 · 증강 없음", {}, 3);
run("X1 더블론 · p0만 blame_shift", { p0: ["blame_shift"] }, 3);
run("X2 더블론 · p2만 blame_shift (본장은 p0 몫)", { p2: ["blame_shift"] }, 3);
run("X3 더블론 · p0·p2 둘 다 blame_shift ← 서로 덮어쓰는가", { p0: ["blame_shift"], p2: ["blame_shift"] }, 3);
run("X4 더블론 · 둘 다 blame_shift + p0 honba_hunter", { p0: ["blame_shift", "honba_hunter"], p2: ["blame_shift"] }, 3);
run("X5 더블론 · 본장 0 · 둘 다 blame_shift", { p0: ["blame_shift"], p2: ["blame_shift"] }, 0);
