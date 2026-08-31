/**
 * S1 — 부호 반전(sign_flip) × 뱅크 발행 계열.
 *
 * sign_flip은 (가) SCORE_CHANGED 인터셉터로 «국 중에 증강이 옮기는 점수»를 전부 뒤집고
 * (sign_flip.ts:105-120) (나) 정산의 SignFlip 단계에서 최종 델타의 부호를 뒤집는다.
 *
 * # 예측
 * devils_advance는 **ROUND_STARTED 리액션**으로 `scoreChanged(holder, +10000)`을 낸다
 * (devils_advance.ts:74-78). sign_flip도 같은 ROUND_STARTED에서 «이번 국» 무장을 켠다.
 * 무장이 먼저 서면 가불금 10,000이 **-10,000**으로 뒤집힌다.
 *
 * 카드 문구: 가불 인생 = "첫 국에 뱅크에서 10,000점을 먼저 받고".
 *           반전     = "내 점수의 부호가 뒤집힌다 … 1,000점을 벌면 1,000점을 빼앗긴다".
 * 둘 다 참일 수는 없다. 어느 쪽으로 나오는지 실측한다.
 */
import { craft, setup, FlowController } from "../../synergy3/kandora/lib.js";
import { signFlip } from "../../../packages/content/src/augments/sign_flip.js";
import { devilsAdvance } from "../../../packages/content/src/augments/devils_advance.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function scores(g: any): string {
  return g.engine.state.players.map((p: any) => `${p.id}=${p.score}`).join(" ");
}

function run(label: string, augs: any[]) {
  const st = craft({ hands: { p0: "123456789m234p55s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const game = setup(st, augs);
  const before = scores(game);
  const flow = new FlowController(game.engine);
  flow.begin();
  const after = scores(game);
  const total = game.engine.state.players.reduce((a: number, p: any) => a + p.score, 0);
  console.log(`${label.padEnd(30)} 전: ${before}\n${" ".repeat(30)} 후: ${after}  (총합 ${total})`);
  const data = game.engine.state.augmentData;
  const marks = Object.entries(data).filter(([k]) => k.includes("sign_flip") || k.includes("devils_advance"));
  console.log(`${" ".repeat(30)} 표식: ${marks.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ")}`);
}

console.log("=== S1: 가불 인생(첫 국 +10,000) × 반전(부호 뒤집기) ===");
run("devils_advance 단독", [{ def: devilsAdvance, holder: "p0" }]);
run("sign_flip 단독", [{ def: signFlip, holder: "p0" }]);
run("devils + sign_flip (같은 사람)", [{ def: devilsAdvance, holder: "p0" }, { def: signFlip, holder: "p0" }]);
run("sign_flip + devils (설치 순서 반대)", [{ def: signFlip, holder: "p0" }, { def: devilsAdvance, holder: "p0" }]);
console.log("\n기대: 가불금은 카드 문구대로 +10,000 이거나, 반전 문구대로 -10,000 이거나 —");
console.log("      **설치 순서로 갈리면** 그 자체가 결함이다(정산 순서 단일 진실의 취지).");
