/**
 * sign_flip(반전) × 손실을 한 사람에게 몰아 주는 카드(scapegoat 덤터기).
 *
 * die_hard(죽기살기)는 같은 구조에서 **뱅크 발행에 상한(시작 점수 25,000)**을 두도록
 * 이미 고쳐졌다(2026-08-23 synergy3 score 확정 3 — 덤터기가 낀 역만을 뒤집어써
 * 226,000점을 발행했다). sign_flip에는 그 상한이 없다.
 *
 * 장면: p1(오야)이 scapegoat로 p0를 지목한 채 큰 손을 쯔모한다. p0가 셋 몫을 전액 부담.
 *       p0는 sign_flip이 켜진 국이다.
 */
import {
  craft, mkGame, withAugments, drive, settledOf, FlowController,
  arm, deltasOf, augPointsOf, sumDeltas, withData, roundKeyOf, withScores,
} from "./lib.js";
import type { GameState } from "@majak/core";

function run(label: string, p0augs: string[], mark: boolean): void {
  let s: GameState = craft({
    hands: { p0: "*", p1: "234s345s567s678s88s", p2: "*", p3: "*" },
    discards: { p0: "6z", p1: "6z" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  s = { ...s, round: { ...s.round, dealerSeat: 1 } };
  s = withScores(s, { p0: 25_000, p1: 25_000, p2: 25_000, p3: 25_000 });
  s = withAugments(s, { p0: p0augs, p1: mark ? ["scapegoat"] : [] });
  if (mark) s = withData(s, { [`scapegoat:target:${roundKeyOf(s)}:p1#round`]: "p0" });
  if (p0augs.includes("sign_flip")) s = arm(s, "sign_flip", "p0");
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  drive(game, flow, status, { winFor: ["p1"] });
  const settled = settledOf(game);
  if (settled === null) { console.log(`${label}: 정산 없음`); return; }
  console.log(
    `${label.padEnd(32)} | ${deltasOf(settled)} | 테이블합=${sumDeltas(settled)} | ${augPointsOf(settled)}`,
  );
}

run("기준 (덤터기 없음)", [], false);
run("덤터기만 (p0가 전액)", [], true);
run("sign_flip만", ["sign_flip"], false);
run("sign_flip + 덤터기", ["sign_flip"], true);
run("die_hard + 덤터기 (상한 비교)", ["die_hard"], true);
