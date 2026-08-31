/**
 * P5 — 강 회수 3종의 후리텐 정합성.
 *   pond_snatch(날치기)·grave_rob(무덤 도굴)은 «집은 패로는 후리텐 쯔모 불가»를
 *   각자 win.tsumoFuriten 모디파이어로 건다. silent_swap(정적의 손)만 그 배선을
 *   일부러 빼서 «후리텐이어도 집어 온 패로 쯔모 화료할 수 있다»(2026-08-27 사용자 지시).
 *
 * 질문: **한 사람이 둘 이상 들면** 그 약속이 서로를 침범하는가?
 *   - silent_swap + pond_snatch 를 함께 들고 후리텐 상태에서 정적의 손으로 집으면,
 *     날치기가 등록해 둔 모디파이어가 켜져 화료가 막히지는 않는가?
 *   - 반대로 정적의 손을 들었다는 이유로 날치기/도굴의 후리텐 금지가 풀리지는 않는가?
 */
import { craft, setup, turnOptions, startFlow2 } from "../../synergy3/disrupt/lib.js";
import { handZone } from "@majak/core";
import type { GameState } from "@majak/core";

/**
 * p0: 234m678m678s23p33p (13장) + 잡패 9m = 14장. 오름패 4p.
 * p0의 바닥에 4p를 미리 깔아 둔다 → **후리텐**.
 * p1 바닥에 4p 한 장 → 회수 대상.
 */
function build(augs: string[]) {
  const state: GameState = craft({
    hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "4p", p1: "4p", p2: "1z", p3: "2z" } as never,
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as never);
  return setup(state, { p0: augs });
}

const SETS: [string, string[]][] = [
  ["pond_snatch 단독", ["pond_snatch"]],
  ["silent_swap 단독", ["silent_swap"]],
  ["grave_rob 단독", ["grave_rob"]],
  ["silent_swap + pond_snatch", ["silent_swap", "pond_snatch"]],
  ["silent_swap + grave_rob", ["silent_swap", "grave_rob"]],
  ["pond_snatch + grave_rob", ["pond_snatch", "grave_rob"]],
  ["셋 다", ["silent_swap", "pond_snatch", "grave_rob"]],
];

for (const [label, augs] of SETS) {
  const g = build(augs);
  const opts = turnOptions(g, "p0");
  const byType: Record<string, number> = {};
  for (const o of opts) byType[o.type] = (byType[o.type] ?? 0) + 1;
  console.log(`\n## ${label}`);
  console.log(`  후리텐(p0) = ${String(g.engine.state.round.byPlayer["p0"]?.furiten)}` +
    ` · 후보 ${JSON.stringify(byType)}`);
  // 회수 액션을 실제로 눌러 보고, 그 뒤 win 이 열리는지 본다
  for (const act of ["silent_take", "pond_snatch", "grave_rob"]) {
    const cand = opts.find((o) => o.type === act);
    if (cand === undefined) continue;
    const g2 = build(augs);
    const { flow } = startFlow2(g2);
    // 4p 를 집는 후보만 고른다
    const o2 = turnOptions(g2, "p0").filter((o) => o.type === act);
    const pick = o2.find((o) => {
      const id = (o.payload as any).tileId ?? (o.payload as any).snatchId ?? (o.payload as any).graveId;
      return g2.engine.state.tiles[id]?.kind.suit === "pin" && g2.engine.state.tiles[id]?.kind.rank === 4;
    });
    if (pick === undefined) { console.log(`  ${act}: 4p 후보 없음`); continue; }
    let st;
    try { st = flow.submit("p0", { type: act, payload: pick.payload } as never); }
    catch (e) { console.log(`  ${act}: 제출 거부 ${(e as Error).message.slice(0, 60)}`); continue; }
    if (st.kind === "roundOver") { console.log(`  ${act}: 즉시 화료(roundOver)`); continue; }
    const canWin = turnOptions(g2, "p0").some((o) => o.type === "win") ||
      ((st as any).prompt?.options ?? []).some((o: any) => o.type === "win");
    const tf = g2.engine.rules.has("win.tsumoFuriten")
      ? g2.engine.rules.resolve("win.tsumoFuriten", { playerId: "p0", state: g2.engine.state }) : "n/a";
    const reason = g2.engine.actions.get("win")!.validate(
      { player: "p0", type: "win", payload: {} } as never,
      { state: g2.engine.state, rules: g2.engine.rules } as never);
    console.log(`  ${act}: 집은 뒤 win 가능=${canWin} · win.tsumoFuriten=${String(tf)} · validate=${String(reason)}`);
  }
}
