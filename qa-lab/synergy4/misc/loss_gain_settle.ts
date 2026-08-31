/**
 * 손익(loss_gain) 축 — 정산 단계에서 «잃을수록 이득» 카드들이 겹칠 때.
 *   die_hard (Shield 단계, 게임 1회, 점수 ≤12,500)
 *   sign_flip (SignFlip 단계, 이번 국만, 부호 반전)
 *   karma     (ROUND_SETTLED 리액션, 최종 delta<0 만큼 게이지 적립)
 *
 * 장면: p0(점수 10,000)가 p1의 하네만(12,000)에 방총한다.
 * 예측:
 *   단독 die_hard : p0 -12000 → +12000 (횟수 1 소모)
 *   단독 sign_flip: p0 -12000 → +12000
 *   단독 karma    : p0 -12000, 게이지 +12000
 *   die_hard+sign_flip: 둘 다 «손실을 이득으로». 순서상 SignFlip이 먼저 → +12000,
 *                       그 뒤 die_hard는 loss>=0 이라 미발동(횟수 보존)이 **기대**.
 *   sign_flip+karma   : 최종 delta가 +12000 → 게이지 0? (설명: "국 정산에서 잃은 점수")
 *   die_hard+karma    : 같은 문제.
 */
import {
  craft, mkGame, withAugments, drive, settledOf, FlowController,
  withScores, arm, deltasOf, augPointsOf, sumDeltas, tileOf,
} from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const P0 = "1199m1199p11z22z3z8s"; // 14장
const P1 = "234s345s567s678s8s";   // 13장 — 8s 단기 (청일+탕야오)

function scene(p0augs: string[], armSignFlip: boolean): GameState {
  let s = craft({
    hands: { p0: P0, p1: P1, p2: "*", p3: "*" },
    discards: { p0: "444z", p1: "555z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = withScores(s, { p0: 10_000, p1: 25_000, p2: 32_500, p3: 32_500 });
  s = withAugments(s, { p0: p0augs });
  if (armSignFlip) s = arm(s, "sign_flip", "p0");
  return s;
}

function run(label: string, p0augs: string[]): void {
  const st = scene(p0augs, p0augs.includes("sign_flip"));
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const id = tileOf(game.engine.state, "p0", "8s");
  const s = status as { prompts?: { player: PlayerId; options: { type: string; payload?: Record<string, unknown> }[] }[] };
  const opt = s.prompts?.find((p) => p.player === "p0")?.options
    .find((o) => o.type === "discard" && (o.payload as { tileId: number }).tileId === id);
  if (opt === undefined) throw new Error("no 8s discard");
  status = flow.submit("p0", opt as never);
  drive(game, flow, status, { winFor: ["p1"] });
  const settled = settledOf(game);
  if (settled === null) { console.log(`${label}: 정산 없음`); return; }
  const st2 = game.engine.state;
  const gauge = st2.augmentData["karma:gauge:p0"] ?? "-";
  const dhUses = st2.augmentData["die_hard:uses:p0"] ?? 0;
  console.log(
    `${label.padEnd(28)} | ${deltasOf(settled)} | 합=${sumDeltas(settled)} | ` +
    `karma게이지=${String(gauge)} | die_hard소모=${String(dhUses)} | aug: ${augPointsOf(settled)}`,
  );
}

run("없음", []);
run("A die_hard", ["die_hard"]);
run("B sign_flip", ["sign_flip"]);
run("C karma", ["karma"]);
run("A+B", ["die_hard", "sign_flip"]);
run("A+C", ["die_hard", "karma"]);
run("B+C", ["sign_flip", "karma"]);
run("A+B+C", ["die_hard", "sign_flip", "karma"]);
