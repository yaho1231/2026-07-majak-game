/**
 * 자유 선언(free_riichi_discard, 오름패를 선언 시점 손패로 고정) ×
 * 한 끗 차이(off_by_one, 리치 후 쯔모한 ±1 패를 오름패로 민다).
 *
 * 기대: 자유 선언은 "고정된 손패를 기준으로 오름패·화료형이 판정된다"고 못 박았다.
 *       한 끗 차이는 그 오름패를 보고 쯔모패를 바꾼다 → 둘 다 살아야 한다.
 *
 * 장면: p0 1s 단기 리치 → 네 순 뒤 2s를 쯔모 → 1s로 밀려 쯔모 화료.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

function scene(augs: string[]): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "123z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["1z", "2z", "3z", "2s"]); // p0의 다음 쯔모가 2s
  return withAugments(s, { p0: augs });
}

function run(augs: string[]): { row: ReturnType<typeof winRow>; 쯔모패: string; 자유타패: boolean } {
  const st = scene(augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const r = optionsFor(status, "p0").find((o) => {
    const k = game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind;
    return o.type === "riichi" && k.suit === "sou" && k.rank === 9;
  });
  if (r === undefined) throw new Error("리치 불가");
  status = flow.submit("p0", r);
  // p1~p3를 한 바퀴 돌린다 (화료 시도 없음)
  for (let i = 0; i < 12; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    if (pr.player === "p0" && pr.options.some((o) => o.type === "win" || o.type === "discard")) break;
    const pass = pr.options.find((o) => o.type === "pass");
    if (pass !== undefined) {
      status = flow.submit(pr.player, pass);
      continue;
    }
    const dd = pr.options.filter((o) => o.type === "discard");
    if (dd.length === 0) break;
    status = flow.submit(pr.player, dd[dd.length - 1] as ActionOption);
  }
  const drawn = game.engine.state.round.lastDrawnTile;
  const k = drawn === null ? null : game.engine.state.tiles[drawn]!.kind;
  const 쯔모패 = k === null ? "-" : `${k.suit}${k.rank}`;
  const 자유타패 = optionsFor(status, "p0").some((o) => o.type === "free_discard");
  const win = optionsFor(status, "p0").find((o) => o.type === "win");
  if (win === undefined) {
    return { row: null, 쯔모패, 자유타패 };
  }
  status = flow.submit("p0", win);
  drive(game, flow, status, {});
  const settled = settledOf(game);
  return { row: settled === null ? null : winRow(settled, "p0"), 쯔모패, 자유타패 };
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
const notes: string[] = [];
for (const [label, augs] of [
  ["없음", []],
  ["A off_by_one", ["off_by_one"]],
  ["B free_riichi_discard", ["free_riichi_discard"]],
  ["A+B", ["off_by_one", "free_riichi_discard"]],
] as [string, string[]][]) {
  const o = run(augs);
  rows[label] = o.row;
  notes.push(`${label.padEnd(24)} 쯔모패=${o.쯔모패} 자유타패버튼=${o.자유타패} 화료=${o.row !== null}`);
}
console.log(table(rows));
console.log("\n" + notes.join("\n"));
