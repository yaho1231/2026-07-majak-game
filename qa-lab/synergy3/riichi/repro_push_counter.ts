/**
 * 등 떠밀기(push_riichi)로 **상대를 강제로 리치시켜** 다른 카드의 조건을 내가 만든다.
 *
 * ① × counter — 카운터는 "나보다 먼저 리치를 건 상대"가 있어야 산다. 낙인이 그 상대를 만든다.
 * ② × no_ron_pact(피해자) — 조약은 "리치를 걸면" 깨지는데, 그 리치를 남이 강제한다.
 *
 * 진행: p0가 p1에 낙인 → p0 타패 → p1 강제 리치 → p0 추격 리치(카운터 발동)
 *       → p1이 1s를 쯔모기리 → p0 론(직격).
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  settledOf, winRow, table, FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s"; // 9s를 버리면 1s 단기
const P1_HAND = "234m567m234p55z3s4s"; // 2s/5s 대기 (1s는 안전패 → 쯔모기리하면 p0에 직격)

function scene(p0augs: string[], p1augs: string[]): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "1p");
  //         p1     p2     p3     p0     p1
  s = stackWall(s, ["9m", "1z", "2z", "9m", "1s"]);
  return withAugments(s, { p0: p0augs, p1: p1augs });
}

function kindOfId(game: ReturnType<typeof mkGame>, id: number): string {
  const k = game.engine.state.tiles[id]!.kind;
  return `${k.suit}${k.rank}`;
}

function run(p0augs: string[], p1augs: string[] = [], brand = true, log = false, riichiType = "riichi"): {
  row: ReturnType<typeof winRow>;
  scores: Record<string, number>;
  p1강제리치: boolean;
  trace: string[];
} {
  const st = scene(p0augs, p1augs);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  const trace: string[] = [];
  let status: unknown = flow.begin();
  const opts = (p: PlayerId): ActionOption[] => optionsFor(status, p);
  const find = (p: PlayerId, type: string, spec?: string): ActionOption | undefined =>
    opts(p).find(
      (o) =>
        o.type === type &&
        (spec === undefined ||
          kindOfId(game, (o.payload as { tileId: number }).tileId) === spec),
    );

  // 1) 낙인
  if (brand) {
    const b = opts("p0").find(
      (o) => o.type === "push_brand" && (o.payload as { target: string }).target === "p1",
    );
    if (b === undefined) throw new Error("낙인 액션 없음");
    status = flow.submit("p0", b);
    trace.push("p0 낙인 → p1");
  }
  // 2) p0 타패 9s
  const d0 = find("p0", "discard", "sou9");
  if (d0 === undefined) throw new Error("p0 9s 타패 불가");
  status = flow.submit("p0", d0);

  const auto = (limit: number, stopWhen?: () => boolean): void => {
    for (let i = 0; i < limit; i++) {
      const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
      if (s.kind !== "awaiting") return;
      if (stopWhen?.() === true) return;
      // 화료 가능하면 p0만 화료
      const w = s.prompts?.find((pr) => pr.player === "p0" && pr.options.some((o) => o.type === "win"));
      if (w !== undefined) {
        status = flow.submit("p0", w.options.find((o) => o.type === "win") as ActionOption);
        trace.push("p0 론/쯔모");
        continue;
      }
      const pr = s.prompts?.[0];
      if (pr === undefined) return;
      if (pr.player === "p0") return; // p0 차례는 바깥에서 다룬다
      const dd = pr.options.filter((o) => o.type === "discard");
      if (dd.length > 0) {
        const last = dd[dd.length - 1] as ActionOption;
        status = flow.submit(pr.player, last);
        trace.push(
          `${pr.player} 버림 ${kindOfId(game, (last.payload as { tileId: number }).tileId)}` +
            (game.engine.state.round.byPlayer[pr.player]?.riichi != null ? " [리치중]" : ""),
        );
        continue;
      }
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass !== undefined) {
        status = flow.submit(pr.player, pass);
        continue;
      }
      return;
    }
  };

  auto(20);
  const p1강제리치 = game.engine.state.round.byPlayer["p1"]?.riichi != null;
  trace.push(`p1 리치 = ${p1강제리치}`);

  // 3) p0 추격 리치 (9m 타패)
  const r =
    find("p0", riichiType, "man9") ??
    find("p0", riichiType) ??
    find("p0", "riichi", "man9") ??
    find("p0", "riichi");
  if (r !== undefined) {
    status = flow.submit("p0", r);
    trace.push("p0 추격 리치");
  } else {
    const dd = find("p0", "discard", "man9");
    if (dd !== undefined) {
      status = flow.submit("p0", dd);
      trace.push("p0 타패(리치 불가)");
    }
  }
  const midScores = Object.fromEntries(
    game.engine.state.players.map((p) => [p.id, p.score]),
  );
  trace.push(`추격 리치 직후 점수 ${JSON.stringify(midScores)} pot=${game.engine.state.round.riichiPot}`);
  auto(30);

  const settled = settledOf(game);
  const scores: Record<string, number> = {};
  for (const p of game.engine.state.players) scores[p.id] = p.score;
  if (log) console.log(trace.join("\n"));
  return {
    row: settled === null ? null : winRow(settled, "p0"),
    scores,
    p1강제리치,
    trace,
  };
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
const notes: string[] = [];
function cell(label: string, p0: string[], p1: string[], brand: boolean, riichiType = "riichi"): void {
  const o = run(p0, p1, brand, false, riichiType);
  rows[label] = o.row;
  notes.push(
    `${label.padEnd(30)} p1강제리치=${String(o.p1강제리치).padEnd(5)} 최종 ${JSON.stringify(o.scores)}\n${" ".repeat(32)}${o.trace.find((t) => t.startsWith("추격 리치 직후")) ?? ""}`,
  );
}

cell("없음", [], [], false);
cell("A push_riichi", ["push_riichi"], [], true);
cell("B counter", ["counter"], [], false);
cell("A+B push+counter", ["push_riichi", "counter"], [], true);
cell("A+B+공탁0(no_retreat)", ["push_riichi", "counter", "no_retreat"], [], true, "no_retreat_riichi");
cell("A+B+all_or_nothing", ["push_riichi", "counter", "all_or_nothing"], [], true, "all_in_riichi");
cell("all_or_nothing 단독", ["all_or_nothing"], [], false, "all_in_riichi");
cell("A+B+공탁0(stealth)", ["push_riichi", "counter", "stealth_riichi"], [], true, "stealth_riichi");

console.log(table(rows));
console.log("\n" + notes.join("\n"));
console.log("\n--- A+B 진행 로그 ---");
run(["push_riichi", "counter"], [], true, true);
