/**
 * 친(dealer) 축 — 오야를 만들고·유지하고·본장을 불리는 카드들의 겹침.
 *   eternal_dealer : 내 화료는 항상 오야 점수 + 역패 동 + 화료하면 오야가 내 자리로(연장)
 *   honba_hunter   : 내 화료의 본장 단가 300 → 1500
 *   pseudo_dealer  : 그 자리에서 진짜 오야 자리를 빼앗는다
 *
 * 장면: 오야는 p0(seat0). **p2**(자, 3본장)가 p1의 버림패로 론(청일+탕야오).
 * 예측:
 *   없음            : 자 점수 + 본장 900
 *   E eternal       : 오야 배율(1.5배) + 본장 900 + 다음 오야 seat2 + 연장 1 소모
 *   H honba_hunter  : 자 점수 + 본장 4500
 *   E+H             : 오야 배율 + 본장 4500 (둘 다 살아야 한다)
 *   P pseudo(오야 강탈 상태) : 진짜 오야라 오야 배율 + 연장은 «원래 연장»
 *   E+P             : 오야 배율은 중복되지 않고, 연장 횟수는 소모되지 않아야 한다
 */
import {
  craft, mkGame, withAugments, drive, settledOf, FlowController,
  deltasOf, augPointsOf, sumDeltas, tileOf, withData,
} from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const P1 = "1199m1199p11z22z3z8s"; // 14장 (버리는 쪽)
const P2 = "234s345s567s678s8s";   // 13장 — 8s 단기

function run(label: string, augs: string[], usurp: boolean): void {
  let s: GameState = craft({
    hands: { p0: "*", p1: P1, p2: P2, p3: "*" },
    discards: { p1: "444z", p2: "555z" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  s = { ...s, round: { ...s.round, honba: 3, dealerSeat: usurp ? 2 : 0 } };
  s = withAugments(s, { p2: augs });
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const id = tileOf(game.engine.state, "p1", "8s");
  const st = status as { prompts?: { player: PlayerId; options: { type: string; payload?: Record<string, unknown> }[] }[] };
  const opt = st.prompts?.find((p) => p.player === "p1")?.options
    .find((o) => o.type === "discard" && (o.payload as { tileId: number }).tileId === id);
  if (opt === undefined) throw new Error("no 8s discard");
  status = flow.submit("p1", opt as never);
  drive(game, flow, status, { winFor: ["p2"] });
  const settled = settledOf(game);
  if (settled === null) { console.log(`${label}: 정산 없음`); return; }
  const w = (settled.winInfos ?? []).find((x) => x.winner === "p2");
  const keeps = game.engine.state.augmentData["eternal_dealer:keeps:p2"] ?? 0;
  console.log(
    `${label.padEnd(24)} | ${deltasOf(settled)} 합=${sumDeltas(settled)} | ` +
    `han=${w?.han} pts=${w?.points} 역=${(w?.yaku ?? []).map((y) => (typeof y === "string" ? y : (y as {id:string}).id)).join(",")} | ` +
    `다음오야seat=${settled.dealerSeat} honba=${settled.honba} | 연장소모=${String(keeps)} | ${augPointsOf(settled)}`,
  );
}

run("없음", [], false);
run("E eternal_dealer", ["eternal_dealer"], false);
run("H honba_hunter", ["honba_hunter"], false);
run("E+H", ["eternal_dealer", "honba_hunter"], false);
run("P 오야강탈상태", [], true);
run("E+P", ["eternal_dealer"], true);
run("H+P", ["honba_hunter"], true);
run("E+H+P", ["eternal_dealer", "honba_hunter"], true);
