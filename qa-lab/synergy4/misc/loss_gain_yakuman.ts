/**
 * 결함 1의 귀결 — 반전이 만든 «가짜 손실»을 죽기살기가 되돌릴 때 25,000 상한에 걸린다.
 * 장면: p0(오야, 점수 10,000)가 국사무쌍 쯔모(48,000).
 */
import {
  craft, mkGame, withAugments, drive, settledOf, FlowController,
  arm, deltasOf, augPointsOf, sumDeltas, withScores,
} from "./lib.js";
import type { GameState } from "@majak/core";

function run(label: string, augs: string[]): void {
  let s: GameState = craft({
    hands: { p0: "19m19p19s1234567z1z", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "", p1: "", p2: "", p3: "" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = { ...s, round: { ...s.round, dealerSeat: 0 } };
  s = withScores(s, { p0: 10_000, p1: 30_000, p2: 30_000, p3: 30_000 });
  s = withAugments(s, { p0: augs });
  if (augs.includes("sign_flip")) s = arm(s, "sign_flip", "p0");
  const g = mkGame(s);
  const flow = new FlowController(g.engine);
  drive(g, flow, flow.begin(), { winFor: ["p0"] });
  const settled = settledOf(g);
  if (settled === null) { console.log(`${label}: 정산 없음`); return; }
  console.log(
    `${label.padEnd(22)} | ${deltasOf(settled)} | 합=${sumDeltas(settled)} | ` +
    `die_hard소모=${String(g.engine.state.augmentData["die_hard:uses:p0"] ?? 0)} | ${augPointsOf(settled)}`,
  );
}
run("없음", []);
run("sign_flip", ["sign_flip"]);
run("sign_flip+die_hard", ["sign_flip", "die_hard"]);
