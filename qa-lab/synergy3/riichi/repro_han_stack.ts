/**
 * 리치 판수를 올리는 것들을 겹치면 어떻게 되는가.
 *   no_retreat(리치·일발 2판 + 뒷도라 2배) × late_double(7순까지 더블+1판)
 *   × riichi_upgrade(언제나 더블 · 자연 더블이면 트리플=4판)
 *   × open_riichi_reveal("리치를 3판으로 취급") × soul_strike("2판, 더블이면 3판")
 *
 * 장면: p0 텐파이(1s 단기) → 리치 선언 → p1이 곧바로 1s를 버려 론(일발).
 * 뒷도라 표시패 1p → p0의 222p가 뒷도라 3장.
 */
import { craft, mkGame, setIndicators, withAugments, pick, optionsFor, drive, settledOf, winRow, table, FlowController } from "./lib.js";
import type { GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s"; // 14장 — 9s를 버리면 1s 단기 텐파이
const P1_HAND = "1s234567m123p445z";

function scene(augs: string[], p1augs: string[] = []): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p"); // 도라=북(없음), 뒷도라=2p(p0에 3장)
  return withAugments(s, { p0: augs, p1: p1augs });
}

/** riichiAction: 표준 "riichi" 또는 커스텀 액션 타입 */
function run(augs: string[], riichiAction: string): ReturnType<typeof winRow> {
  const st = scene(augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const opt = pick(status, "p0", riichiAction, (p) => {
    const id = p["tileId"] as number;
    return game.engine.state.tiles[id]!.kind.suit === "sou";
  });
  status = flow.submit("p0", opt);
  drive(game, flow, status, { winFor: ["p0"], discardPlan: { p1: ["1s"] } });
  const settled = settledOf(game);
  if (settled === null) throw new Error("no settle");
  return winRow(settled, "p0");
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
rows["없음 (표준 리치)"] = run([], "riichi");
rows["A no_retreat"] = run(["no_retreat"], "no_retreat_riichi");
rows["B late_double"] = run(["late_double"], "riichi");
rows["A+B"] = run(["no_retreat", "late_double"], "no_retreat_riichi");
rows["C riichi_upgrade"] = run(["riichi_upgrade"], "riichi");
rows["A+C"] = run(["no_retreat", "riichi_upgrade"], "no_retreat_riichi");
rows["B+C"] = run(["late_double", "riichi_upgrade"], "riichi");
rows["A+B+C"] = run(["no_retreat", "late_double", "riichi_upgrade"], "no_retreat_riichi");
rows["D open_riichi_reveal"] = run(["open_riichi_reveal"], "open_riichi");
rows["B+D"] = run(["late_double", "open_riichi_reveal"], "open_riichi");
rows["C+D"] = run(["riichi_upgrade", "open_riichi_reveal"], "open_riichi");
rows["B+C+D"] = run(["late_double", "riichi_upgrade", "open_riichi_reveal"], "open_riichi");
rows["E soul_strike"] = run(["soul_strike"], "soul_strike");
rows["B+E"] = run(["late_double", "soul_strike"], "soul_strike");
rows["C+E"] = run(["riichi_upgrade", "soul_strike"], "soul_strike");

console.log(table(rows));
