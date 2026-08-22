/**
 * 오픈 리치(open_riichi_reveal) 조합.
 *
 * ① × riichi_seal — "리치를 걸지 않은 사람에게서 론하면 역만"의 **탈출구를 봉인이 없앤다**.
 * ② × late_double / riichi_upgrade — "그 리치를 3판으로 취급"이 몇 판이 되는가.
 *
 * 장면: p0 텐파이(1s 단기) → 리치 계열 선언 → p1이 1s를 쯔모해 버린다 → p0 론.
 *   p1은 텐파이(2s3s 대기 1s/4s)라 봉인이 없으면 그 1s로 추격 리치를 걸 수 있다.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, pick, optionsFor,
  settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import type { GameState, ActionOption } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z2s3s"; // 1s/4s 대기 텐파이

function scene(p0augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  s = stackWall(s, ["1s"]); // p1이 곧바로 1s를 쯔모한다
  return withAugments(s, { p0: p0augs });
}

interface Out {
  p1리치가능: boolean;
  결과: ReturnType<typeof winRow>;
}

function run(p0augs: string[], riichiAction: string, p1Riichi: boolean): Out {
  const st = scene(p0augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  status = flow.submit(
    "p0",
    pick(status, "p0", riichiAction, (p) => {
      const id = p["tileId"] as number;
      const k = game.engine.state.tiles[id]!.kind;
      return k.suit === "sou" && k.rank === 9;
    }),
  );
  // p1 차례까지 진행 (반응 pass)
  for (let i = 0; i < 8; i++) {
    const s = status as { kind: string; prompts?: { player: string; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.find((x) => x.options.some((o) => o.type === "pass"));
    if (pr === undefined) break;
    status = flow.submit(pr.player as never, pr.options.find((o) => o.type === "pass") as ActionOption);
  }
  const canRiichi = optionsFor(status, "p1").some(
    (o) =>
      o.type === "riichi" &&
      game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind.suit === "sou",
  );
  // p1: 1s를 버린다 (추격 리치를 걸 수 있으면 건다)
  const want = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 1;
  };
  const opt =
    (p1Riichi && canRiichi
      ? optionsFor(status, "p1").find((o) => o.type === "riichi" && want(o))
      : undefined) ?? optionsFor(status, "p1").find((o) => o.type === "discard" && want(o));
  if (opt === undefined) throw new Error("p1이 1s를 버릴 수 없다");
  status = flow.submit("p1", opt);
  drive(game, flow, status, { winFor: ["p0"] });
  const settled = settledOf(game);
  if (settled === null) throw new Error("no settle");
  return { p1리치가능: canRiichi, 결과: winRow(settled, "p0") };
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
const notes: string[] = [];

function cell(label: string, augs: string[], action: string, p1Riichi: boolean): void {
  const o = run(augs, action, p1Riichi);
  rows[label] = o.결과;
  notes.push(`${label.padEnd(34)} p1 추격리치 가능=${o.p1리치가능}`);
}

// ① 역만 게이트 × 봉인
cell("없음(표준리치) · p1추격", [], "riichi", true);
cell("A open_riichi · p1추격", ["open_riichi_reveal"], "open_riichi", true);
cell("A open_riichi · p1다마", ["open_riichi_reveal"], "open_riichi", false);
cell("B riichi_seal · p1추격시도", ["riichi_seal"], "riichi", true);
cell("A+B open+seal · p1추격시도", ["open_riichi_reveal", "riichi_seal"], "open_riichi", true);
cell("A+C open+riichi_upgrade", ["open_riichi_reveal", "riichi_upgrade"], "open_riichi", true);
cell("A+D open+late_double", ["open_riichi_reveal", "late_double"], "open_riichi", true);
cell("A+C+D open+upgrade+late", ["open_riichi_reveal", "riichi_upgrade", "late_double"], "open_riichi", true);
cell("C riichi_upgrade 단독", ["riichi_upgrade"], "riichi", true);
cell("D late_double 단독", ["late_double"], "riichi", true);
cell("C+D", ["riichi_upgrade", "late_double"], "riichi", true);

console.log(table(rows));
console.log("\n" + notes.join("\n"));
