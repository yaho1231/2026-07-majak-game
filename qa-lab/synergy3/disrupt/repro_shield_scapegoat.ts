/**
 * 역만 방어술(yakuman_shield) × 덤터기(scapegoat) — 대조군 4칸.
 *
 * 장면: p0 이 사암각(역만)을 **쯔모**한다. p1 이 역만 방어술을 든다.
 *       p0 은 덤터기로 p1 을 지목해 쯔모 지불 **전액**을 p1 에게 몰아준다.
 *
 * 카드가 약속한 것:
 *  - yakuman_shield description: "역만 피해를 막는다 — **내가 낸 몫을 전액 돌려받는다**"
 *    detail: "쯔모면 **내 분담분이 돌아온다**"
 *  - scapegoat detail: "지목당한 사람이 **전액을 혼자 낸다** — 그 국 정산에서 다른 증강이
 *    새로 부과하는 지불까지 그 사람에게 몰린다"
 *
 * 기대: 덤터기가 p1 에게 몰아준 지불도 「p1 이 그 역만에 낸 몫」이므로,
 *       방어술은 그 전액을 돌려주고 **p1 의 최종 증감은 0** 이어야 한다.
 *       (론 경로에서는 코드가 명시적으로 그렇게 처리한다 —
 *        "책임전가·눈먼 총알이 그 지불을 나에게 돌렸어도 역만 피해인 것은 같다")
 *
 * 대조군: 눈먼 총알(blind_ron)로 **론** 지불을 방어막 보유자에게 돌린 경우.
 */
import { craft, setup, startFlow, lastSettled, table } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";

/** p0 사암각 단기 쯔모 (111m 222m 333m 444p 5s + 5s 쯔모) */
function tsumoScene(): GameState {
  return craft({
    hands: {
      p0: "111m222m333m444p55s",
      p1: "*",
      p2: "*",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

function run(label: string, aug: Partial<Record<PlayerId, string[]>>, mark: boolean) {
  const game = setup(tsumoScene(), aug);
  const flow = startFlow(game);
  if (mark) {
    const st = flow.submit("p0", { type: "scapegoat_mark", payload: { target: "p1" } });
    if (st.kind !== "awaiting") throw new Error(`mark: ${st.kind}`);
  }
  const st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind !== "roundOver") throw new Error(`win: ${st.kind} ${JSON.stringify(st)}`);
  const p = lastSettled(game) as {
    deltas: Record<string, number>;
    winInfos?: { points: number; limit?: string; yakumanCount: number }[];
  };
  const d = p.deltas;
  return {
    조합: label,
    "화료점": p.winInfos?.[0]?.points,
    p0: d["p0"],
    "p1(방어막)": d["p1"],
    p2: d["p2"],
    p3: d["p3"],
    총합: Object.values(d).reduce((a, b) => a + b, 0),
  };
}

table("역만 쯔모 × 덤터기 × 역만 방어술", [
  run("없음", {}, false),
  run("A=덤터기(p0→p1)", { p0: ["scapegoat"] }, true),
  run("B=역만 방어술(p1)", { p1: ["yakuman_shield"] }, false),
  run("A+B", { p0: ["scapegoat"], p1: ["yakuman_shield"] }, true),
]);

// ── 대조군: 론 경로(눈먼 총알)에서는 전액 환급되는가
function ronScene(): GameState {
  return craft({
    hands: { p0: "111m222m333m444p5s", p1: "*", p2: "*", p3: "*" },
    discards: { p3: "9p" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: "5s" },
  });
}

function runRon(label: string, aug: Partial<Record<PlayerId, string[]>>) {
  const game = setup(ronScene(), aug);
  const flow = startFlow(game);
  const st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind !== "roundOver") throw new Error(`ron: ${st.kind}`);
  const p = lastSettled(game) as { deltas: Record<string, number>; winInfos?: { points: number }[] };
  const d = p.deltas;
  return {
    조합: label,
    화료점: p.winInfos?.[0]?.points,
    p0: d["p0"],
    p1: d["p1"],
    p2: d["p2"],
    "p3(쏜 사람)": d["p3"],
    총합: Object.values(d).reduce((a, b) => a + b, 0),
  };
}

table("대조군 — 역만 론 × 눈먼 총알 × 역만 방어술", [
  runRon("없음", {}),
  runRon("방어막만(p3)", { p3: ["yakuman_shield"] }),
  runRon("눈먼 총알(p2) + 방어막(p3)", { p2: ["blind_ron"], p3: ["yakuman_shield"] }),
  runRon("눈먼 총알(p2) + 방어막(p1)", { p2: ["blind_ron"], p1: ["yakuman_shield"] }),
]);
