/**
 * 정산 개입 증강 **동시 보유** 조합 — 서로 덮어쓰는가, 회계가 맞는가.
 * 실행: tsx qa-lab/score-b/t_order.ts
 *
 * 불변식: Σdeltas − 공탁회수 − (sign_flip augPoint 합) == 0
 *   (뱅크 발행은 sign_flip만 하며, 자기 발행액을 augPoints에 정확히 적는다)
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };
let problems = 0;

function scene(honba: number, pot: number, armed: PlayerId[]): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  const data: Record<string, unknown> = {};
  for (const a of armed) data[`sign_flip:armedRound:${a}`] = `1-1-${honba}`;
  return { ...s, round: { ...s.round, honba, riichiPot: pot }, augmentData: { ...s.augmentData, ...data } };
}

const P0SETS = [
  [], ["blame_shift"], ["honba_hunter"], ["sign_flip"], ["karma"],
  ["blame_shift", "honba_hunter"], ["blame_shift", "sign_flip"],
  ["honba_hunter", "sign_flip"], ["blame_shift", "honba_hunter", "sign_flip"],
  ["blame_shift", "honba_hunter", "sign_flip", "karma"],
];
const P1SETS = [[], ["sign_flip"], ["blame_shift"], ["honba_hunter"]];

for (const a of P0SETS) {
  for (const b of P1SETS) {
    const armed: PlayerId[] = [];
    if (a.includes("sign_flip")) armed.push("p0");
    if (b.includes("sign_flip")) armed.push("p1");
    const s = scene(3, 2000, armed);
    let flow;
    try {
      ({ flow } = start(s, { p0: a, p1: b } as never));
      const st = flow.submit("p0", { type: "win", payload: {} });
      if (st.kind !== "roundOver") { say(`p0=${a} p1=${b}: 화료 실패 ${st.kind}`); continue; }
    } catch (e) { say(`p0=${a} p1=${b}: 예외 ${String(e).split("\n")[0]}`); problems++; continue; }
    const p = lastSettled(flow);
    const sum = Object.values(p.deltas).reduce((x, y) => x + y, 0);
    const potGain = (p.winInfos ?? []).reduce((n, w) => n + (w.riichiPotGain ?? 0), 0);
    const bank = (p.augPoints ?? []).filter((n) => n.augId === "sign_flip").reduce((n, x) => n + x.points, 0);
    const residual = sum - potGain - bank;
    const w = p.winInfos?.[0];
    const flag = residual === 0 ? "  " : "!!";
    if (residual !== 0) problems++;
    say(
      `${flag} p0=[${a}] p1=[${b}] 잔차=${residual} Σ=${sum} pot=${potGain} bank=${bank} ` +
      `honbaBonus=${w?.honbaBonus ?? 0} deltas=${JSON.stringify(p.deltas)} ` +
      `aug=${JSON.stringify((p.augPoints ?? []).map((n) => `${n.augId}:${n.player}:${n.points}`))}`,
    );
  }
}
say(`\n문제 ${problems}건`);
