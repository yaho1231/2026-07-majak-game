/**
 * 공성계(siege_riichi) × 승승장구(always_tenpai) — 같은 좌석.
 *
 * siege_riichi detail: "리치봉 1,000점과 **유국 시 노텐 벌부도 그대로 걸린다**."
 * always_tenpai:       "황패유국 시 손패가 어떻든 항상 텐파이로 취급된다 —
 *                       노텐 벌점을 내지 않고, 노텐인 상대 한 명당 2,000점을 더 받는다."
 *
 * 기대: 두 문장이 정면 충돌한다. 예측 = 승승장구가 이겨 «노텐 리치의 유일한 대가»가 사라지고
 *       오히려 흑자가 된다. 카드에는 어느 쪽이 이기는지 한 글자도 없다.
 *
 * 대조군 4칸(전부 노텐 리치 시나리오): 없음 / 공성계만 / 승승장구만 / 둘 다.
 */
import { WALL, craft, setup, startFlow2, lastSettled, table } from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

/** p0 확실한 노텐, 나머지는 아무거나. 바닥에 중장패를 깔아 유국만관을 없앤다. */
function scene(wallLeft: number): GameState {
  const base = craft({
    hands: {
      p0: "147m258p369s1245z", // 완전 분산 = 노텐 (13장)
      p1: "*",
      p2: "*",
      p3: "*",
    },
    discards: { p0: "34m", p1: "5m", p2: "6m", p3: "6p" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const wall = [...(base.zones[WALL]?.tileIds ?? [])];
  return {
    ...base,
    zones: {
      ...base.zones,
      [WALL]: { ...base.zones[WALL]!, tileIds: wall.slice(0, wallLeft) },
    },
  };
}

/** 첫 discard 후보를 골라 유국까지 몰아친다 */
function drive(game: Game, firstRiichi: boolean) {
  const { flow, status } = startFlow2(game);
  let st = status;
  let guard = 0;
  let first = true;
  while (st.kind === "awaiting" && guard++ < 200) {
    const prompt = (st.prompts as {
      player: PlayerId;
      options: { type: string; payload: unknown }[];
    }[])[0];
    if (prompt === undefined) break;
    let opt = prompt.options.find(
      (o) => o.type === (first && firstRiichi ? "riichi" : "discard"),
    );
    if (opt === undefined) opt = prompt.options.find((o) => o.type === "discard");
    if (opt === undefined) opt = prompt.options.find((o) => o.type === "pass");
    if (opt === undefined) opt = prompt.options[0];
    if (opt === undefined) break;
    if (first && firstRiichi && opt.type !== "riichi") {
      return { failed: "리치 후보가 제시되지 않았다" };
    }
    first = false;
    st = flow.submit(prompt.player, { type: opt.type, payload: opt.payload } as never);
  }
  return { st };
}

function run(label: string, aug: Partial<Record<PlayerId, string[]>>, riichi: boolean) {
  const game = setup(scene(8), aug);
  const r = drive(game, riichi);
  if ("failed" in r) return { 조합: label, 결과: r.failed };
  if (r.st?.kind !== "roundOver") return { 조합: label, 결과: `유국 아님(${r.st?.kind})` };
  const p = lastSettled(game) as {
    outcome: string;
    deltas: Record<string, number>;
    tenpaiPlayers?: string[];
    drawSpecial?: unknown;
  };
  const d = p.deltas;
  return {
    조합: label,
    결과: p.outcome,
    "p0 리치": game.engine.state.round.byPlayer["p0"]?.riichi != null,
    "텐파이 집계": (p.tenpaiPlayers ?? []).join(",") || "(없음)",
    p0: d["p0"],
    p1: d["p1"],
    p2: d["p2"],
    p3: d["p3"],
    총합: Object.values(d).reduce((a, b) => a + b, 0),
    "p0 최종점": game.engine.state.players.find((x) => x.id === "p0")?.score,
  };
}

table("황패유국 — 리치 없음 (기준선)", [
  run("없음", {}, false),
  run("A=공성계만", { p0: ["siege_riichi"] }, false),
  run("B=승승장구만", { p0: ["always_tenpai"] }, false),
  run("A+B", { p0: ["siege_riichi", "always_tenpai"] }, false),
]);

table("황패유국 — p0 가 **노텐 리치**를 걸었다", [
  run("없음(리치 시도)", {}, true),
  run("A=공성계만", { p0: ["siege_riichi"] }, true),
  run("B=승승장구만(리치 시도)", { p0: ["always_tenpai"] }, true),
  run("A+B=공성계+승승장구", { p0: ["siege_riichi", "always_tenpai"] }, true),
]);
