/**
 * seat_swap(자리 바꿈) × silent_pact(묵계) — «멘젠이 유지되는 펑»이 남에게 넘어가는가.
 *
 * seat_swap은 후로를 byPlayer.melds째로 통째로 맞바꾼다(silent 표식 포함).
 * 예측(설명 기준): 묵계의 «멘젠 유지»는 묵계 보유자의 능력이므로, 그 몸통이 남에게
 * 넘어가면 남에게는 평범한 펑이어야 한다. 실측이 다르면 능력이 비보유자에게 샌다.
 */
import { craft, mkGame, withAugments, optionsFor, FlowController, pick } from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";
import { openMeldCountOf, meldCountOf } from "@majak/core";

function markSilent(s: GameState, p: PlayerId): GameState {
  const rs = s.round.byPlayer[p]!;
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        [p]: { ...rs, melds: rs.melds.map((m, i) => (i === 0 ? { ...m, silent: true } : m)) },
      },
    },
  };
}

function report(s: GameState, tag: string): void {
  const line = (["p0", "p1"] as PlayerId[])
    .map((p) => `${p}: 후로=${meldCountOf(s, p)} 노출후로=${openMeldCountOf(s, p)} (멘젠=${openMeldCountOf(s, p) === 0})`)
    .join(" | ");
  console.log(`  ${tag}: ${line}`);
}

let s: GameState = craft({
  hands: { p0: "123m456m789m99p", p1: "234p567p88s22s", p2: "*", p3: "*" },
  melds: {
    p0: [{ kind: "pon", spec: "111z", from: "p2" }],
    p1: [{ kind: "pon", spec: "555z", from: "p2" }],
  },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
s = markSilent(s, "p1"); // p1이 묵계로 부른 펑
s = withAugments(s, { p0: ["seat_swap"], p1: ["silent_pact"] });

const game = mkGame(s);
const flow = new FlowController(game.engine);
let status = flow.begin();
console.log("자리 바꿈 전");
report(game.engine.state, "상태");

const opt = optionsFor(status, "p0").find(
  (o) => o.type === "seat_swap" && (o.payload as { target: PlayerId }).target === "p1",
);
if (opt === undefined) {
  console.log("  seat_swap(p1) 후보 없음:", [...new Set(optionsFor(status, "p0").map((o) => o.type))].join(","));
} else {
  status = flow.submit("p0", opt);
  console.log("자리 바꿈 후 (묵계 몸통이 p0에게 넘어감)");
  report(game.engine.state, "상태");
  console.log(
    "  p0 리치 후보:",
    optionsFor(status, "p0").some((o) => o.type === "riichi"),
    "/ p0 보유증강:",
    game.engine.state.players.find((p) => p.id === "p0")!.augments.join(","),
  );
}
