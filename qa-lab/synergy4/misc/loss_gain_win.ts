/**
 * 손익 축 — «버는 국»에서 sign_flip + die_hard.
 * 장면: p0(점수 10,000)가 p1의 버림패로 하네만급 론.
 * 예측:
 *   단독 sign_flip : p0 +16000 → -16000 (설계대로 벌면 빼앗긴다)
 *   단독 die_hard  : 발동 안 함(버는 국) — 횟수 보존
 *   A+B            : sign_flip이 -16000으로 만든 뒤 die_hard가 Shield에서 그것을 «손실»로
 *                    보고 다시 +16000으로 되돌린다? 그러면 die_hard 설명("점수가 늘어나는
 *                    국에는 발동하지 않고 횟수도 줄지 않는다")과 어긋난다.
 */
import {
  craft, mkGame, withAugments, drive, settledOf, FlowController,
  withScores, arm, deltasOf, augPointsOf, sumDeltas, tileOf,
} from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const P1 = "1199m1199p11z22z3z8s";
const P0 = "234s345s567s678s8s";

function run(label: string, p0augs: string[]): void {
  let s = craft({
    hands: { p0: P0, p1: P1, p2: "*", p3: "*" },
    discards: { p0: "444z", p1: "555z" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  s = withScores(s, { p0: 10_000, p1: 25_000, p2: 32_500, p3: 32_500 });
  if (process.argv[2] === "dealer") s = { ...s, round: { ...s.round, dealerSeat: 0 } };
  s = withAugments(s, { p0: p0augs });
  if (p0augs.includes("sign_flip")) s = arm(s, "sign_flip", "p0");
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const id = tileOf(game.engine.state, "p1", "8s");
  const st = status as { prompts?: { player: PlayerId; options: { type: string; payload?: Record<string, unknown> }[] }[] };
  const opt = st.prompts?.find((p) => p.player === "p1")?.options
    .find((o) => o.type === "discard" && (o.payload as { tileId: number }).tileId === id);
  if (opt === undefined) throw new Error("no 8s discard");
  status = flow.submit("p1", opt as never);
  drive(game, flow, status, { winFor: ["p0"] });
  const settled = settledOf(game);
  if (settled === null) { console.log(`${label}: 정산 없음`); return; }
  const s2 = game.engine.state;
  console.log(
    `${label.padEnd(22)} | ${deltasOf(settled)} | 합=${sumDeltas(settled)} | ` +
    `die_hard소모=${String(s2.augmentData["die_hard:uses:p0"] ?? 0)} | aug: ${augPointsOf(settled)}`,
  );
}

run("없음", []);
run("A die_hard", ["die_hard"]);
run("B sign_flip", ["sign_flip"]);
run("A+B", ["die_hard", "sign_flip"]);
