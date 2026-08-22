/**
 * 뒷도라·일발을 건드리는 것들의 겹침.
 *   no_retreat("뒷도라 장당 2판 · 일발 2판") × late_double/riichi_upgrade
 *   soul_hunt / hidden_blade (리치 없이 뒷도라) × ura_peek (뒷도라 표시패 바꿔치기)
 *
 * 장면: p0 텐파이(1s 단기) → 선언 → p1이 곧바로 1s를 버려 p0 론 (= 일발).
 * 뒷도라 표시패 1p → p0의 222p 3장이 뒷도라.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, withRiichi, pick, optionsFor,
  settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import type { GameState, ActionOption, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z2s3s";

function scene(p0augs: string[], p1riichi: boolean): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["1s"]);
  s = withAugments(s, { p0: p0augs });
  return p1riichi ? withRiichi(s, "p1") : s;
}

/**
 * p0가 `riichiAction`으로 선언(없으면 다마텐으로 그냥 9s를 버린다) → p1이 1s를 버림 → p0 론.
 */
function run(
  p0augs: string[],
  riichiAction: string | null,
  opts: { p1riichi?: boolean } = {},
): ReturnType<typeof winRow> {
  const st = scene(p0augs, opts.p1riichi ?? false);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const is9s = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  };
  const opt = optionsFor(status, "p0").find(
    (o) => o.type === (riichiAction ?? "discard") && is9s(o),
  );
  if (opt === undefined) throw new Error(`p0가 ${riichiAction ?? "discard"} 불가`);
  status = flow.submit("p0", opt);
  for (let i = 0; i < 8; i++) {
    const s = status as { kind: string; prompts?: { player: string; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.find((x) => x.options.some((o) => o.type === "pass"));
    if (pr === undefined) break;
    status = flow.submit(pr.player as PlayerId, pr.options.find((o) => o.type === "pass") as ActionOption);
  }
  const d = optionsFor(status, "p1").find((o) => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined || o.type !== "discard") return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 1;
  });
  if (d === undefined) throw new Error("p1이 1s를 못 버린다");
  status = flow.submit("p1", d);
  drive(game, flow, status, { winFor: ["p0"] });
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
rows["A+B+C"] = run(["no_retreat", "late_double", "riichi_upgrade"], "no_retreat_riichi");
// 리치 없는 뒷도라 — p1이 리치 중일 때 다마텐 론
rows["다마텐 (증강 없음, p1리치)"] = run([], null, { p1riichi: true });
rows["F soul_hunt (p1리치)"] = run(["soul_hunt"], null, { p1riichi: true });
rows["G hidden_blade (p1리치)"] = run(["hidden_blade"], null, { p1riichi: true });
rows["G hidden_blade (p1비리치)"] = run(["hidden_blade"], null, {});
rows["F+G (conflicts지만 강제)"] = run(["soul_hunt", "hidden_blade"], null, { p1riichi: true });
rows["F+ura_peek (p1리치)"] = run(["soul_hunt", "ura_peek"], null, { p1riichi: true });
rows["G+ura_peek"] = run(["hidden_blade", "ura_peek"], null, {});
// soul_hunt 보유자가 스스로 리치까지 건 경우 — +1판이 이중으로 붙나?
rows["F+내리치 (p1리치)"] = run(["soul_hunt"], "riichi", { p1riichi: true });

console.log(table(rows));
