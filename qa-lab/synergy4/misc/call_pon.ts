/**
 * 후로를 넓히는 카드끼리 — 펑(pon) 축.
 *   mixed_triplet   : 커쯔의 무늬 제한 해제 (1만+1통+1삭)
 *   bluff_pretense  : 손에 1장뿐이어도 펑 (잡패 하나를 변환해 채운다)
 *   silent_pact     : 멘젠이 유지되는 펑 (국 1회)
 *
 * 손패: 1m 1장 · 1p 1장 (1s는 0장). 대면 p2가 1s를 버린다.
 * 예측:
 *   없음            : 후보 없음
 *   결속만          : silent 없음 · 표준 pon(1m+1p) 성립
 *   허장성세만      : 1s가 손에 0장 → bluff 불가
 *   결속+허장성세   : 1m 1장으로 bluff_pon 가능해야 한다(2026-08-23 수정분)
 *   결속+묵계       : silent_pon(1m+1p) 가능
 *   셋 다           : 표준 pon · bluff_pon · silent_pon 세 후보가 모두 보여야 한다
 */
import { craft, mkGame, withAugments, shapeOn, optionsFor, FlowController } from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const HAND = "1m2m3m5m7m9m11z22z33z4z"; // 13장 — 1s와 통하는 패는 1m 한 장뿐

function run(label: string, augs: string[], mixed: boolean): void {
  let s: GameState = craft({
    hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
    discards: { p0: "6z", p1: "6z", p2: "6z", p3: "6z" },
    phase: "reaction",
    turnSeat: 2,
    lastDiscard: { player: "p2", spec: "1s" },
  });
  s = withAugments(s, { p0: augs });
  if (mixed) s = shapeOn(s, "mixed_triplet", "p0");
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const types = optionsFor(status, "p0").map((o) => o.type);
  const call = types.filter((t) => t === "pon" || t === "bluff_pon" || t === "silent_pon");
  console.log(`${label.padEnd(30)} | ${call.length ? call.join(", ") : "(없음)"}`);
}

run("없음", [], false);
run("M mixed_triplet", ["mixed_triplet"], true);
run("B bluff_pretense", ["bluff_pretense"], false);
run("S silent_pact", ["silent_pact"], false);
run("M+B", ["mixed_triplet", "bluff_pretense"], true);
run("M+S", ["mixed_triplet", "silent_pact"], true);
run("B+S", ["bluff_pretense", "silent_pact"], false);
run("M+B+S", ["mixed_triplet", "bluff_pretense", "silent_pact"], true);
