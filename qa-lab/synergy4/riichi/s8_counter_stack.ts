/**
 * synergy4 / riichi — S8. 카운터(counter)의 «직격 +3판»이 리치 판수 증강과 겹칠 때.
 *
 * counter.ts:368 은 +3판을 `winPointsWithExtraHan`(점수 밴드 차액)으로 낸다.
 * 밴드가 이미 위쪽(배만·삼배만·역만)이면 3판을 얹어도 차액이 작거나 0이다.
 * 반대로 `score.extraHan` 계열(no_retreat·late_double·riichi_upgrade)은 진짜 판수다.
 * 두 종류를 겹쳤을 때 «각각 쓸 때보다 좋아지는가»를 잰다.
 *
 * 진행: p1이 스스로 리치(2s 쯔모 후 리치) → p0가 추격 리치 → p1이 1s를 버려 p0 직격 론.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor,
  settledOf, winRow, table, FlowController,
} from "./lib.js";
import type { ActionOption, GameState, PlayerId } from "@majak/core";

const P0_HAND = "123m456m789m222p1s9s"; // 9s 버리면 1s 단기
const P1_HAND = "234m567m234p55z3s4s";  // 2s를 뽑으면 텐파이 → 리치

function scene(p0augs: string[], ura: string): GameState {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", ura);
  //              p1    p2    p3    p0    p1
  s = stackWall(s, ["2s", "1z", "2z", "9m", "1s"]);
  return withAugments(s, { p0: p0augs });
}

function run(p0augs: string[], declare: string, ura: string): {
  row: ReturnType<typeof winRow>; scores: Record<string, number>; p1riichi: boolean;
} {
  const game = mkGame(scene(p0augs, ura));
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const kindOf = (id: number): string => {
    const k = game.engine.state.tiles[id]!.kind;
    return `${k.suit}${k.rank}`;
  };
  const opt = (p: PlayerId, type: string, spec?: string): ActionOption | undefined =>
    optionsFor(status, p).find((o) => o.type === type &&
      (spec === undefined || kindOf((o.payload as { tileId: number }).tileId) === spec));

  // 1) p0 타패 9s (아직 리치 안 건다 — p1이 먼저 걸어야 카운터가 산다)
  const d0 = opt("p0", "discard", "sou9");
  if (d0 === undefined) throw new Error("p0 9s 불가");
  status = flow.submit("p0", d0);
  // 2) p1이 스스로 리치 (아무 패나 리치 타패)
  {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    const pr = s.prompts?.find((x) => x.player === "p1");
    const r = pr?.options.find((o) => o.type === "riichi");
    if (r === undefined) throw new Error(`p1 리치 불가: ${pr?.options.map((o) => o.type).join(",")}`);
    status = flow.submit("p1", r);
  }
  // 3) p2·p3 진행
  for (let i = 0; i < 8; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.[0];
    if (pr === undefined || pr.player === "p0") break;
    const dd = pr.options.filter((o) => o.type === "discard");
    const pass = pr.options.find((o) => o.type === "pass");
    const o = dd.length > 0 ? dd[dd.length - 1] : pass;
    if (o === undefined) break;
    status = flow.submit(pr.player, o);
  }
  const p1riichi = game.engine.state.round.byPlayer["p1"]?.riichi != null;
  // 4) p0 추격 리치
  const r0 = opt("p0", declare, "man9") ?? opt("p0", declare);
  if (r0 !== undefined) status = flow.submit("p0", r0);
  else {
    const dd = optionsFor(status, "p0").filter((o) => o.type === "discard");
    if (dd.length > 0) status = flow.submit("p0", dd[dd.length - 1] as ActionOption);
  }
  // 5) 끝까지
  for (let i = 0; i < 30; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const w = s.prompts?.find((pr) => pr.player === "p0" && pr.options.some((o) => o.type === "win"));
    if (w !== undefined) { status = flow.submit("p0", w.options.find((o) => o.type === "win") as ActionOption); continue; }
    const pr = s.prompts?.[0];
    if (pr === undefined) break;
    const dd = pr.options.filter((o) => o.type === "discard");
    const pass = pr.options.find((o) => o.type === "pass");
    const o = dd.length > 0 ? dd[dd.length - 1] : pass;
    if (o === undefined) break;
    status = flow.submit(pr.player, o);
  }
  const settled = settledOf(game);
  const scores: Record<string, number> = {};
  for (const p of game.engine.state.players) scores[p.id] = p.score;
  return { row: settled === null ? null : winRow(settled, "p0"), scores, p1riichi };
}

for (const [tag, ura] of [["저타점(뒷도라 0)", "5z"], ["고타점(뒷도라 3)", "1p"]] as const) {
  const rows: Record<string, ReturnType<typeof winRow>> = {};
  const notes: string[] = [];
  const cell = (k: string, a: string[], d = "riichi"): void => {
    try {
      const r = run(a, d, ura);
      rows[k] = r.row;
      notes.push(`${k.padEnd(30)} p1리치=${r.p1riichi} 점수 ${JSON.stringify(r.scores)}`);
    } catch (e) { notes.push(`${k.padEnd(30)} !! ${(e as Error).message}`); }
  };
  cell("0 없음", []);
  cell("K counter", ["counter"]);
  cell("A no_retreat", ["no_retreat"], "no_retreat_riichi");
  cell("K+A", ["counter", "no_retreat"], "no_retreat_riichi");
  cell("B late_double", ["late_double"]);
  cell("K+B", ["counter", "late_double"]);
  cell("C riichi_upgrade", ["riichi_upgrade"]);
  cell("K+C", ["counter", "riichi_upgrade"]);
  cell("K+A+B", ["counter", "no_retreat", "late_double"], "no_retreat_riichi");
  cell("K+A+B+C", ["counter", "no_retreat", "late_double", "riichi_upgrade"], "no_retreat_riichi");
  console.log(`\n======== ${tag} ========`);
  console.log(table(rows));
  console.log(notes.join("\n"));
}
