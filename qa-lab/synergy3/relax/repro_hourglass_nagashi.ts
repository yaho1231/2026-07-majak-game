/**
 * hourglass(뒤집힌 모래시계) × nagashi_yakuman(유국역만) — 둘 다 `draw` 축.
 *
 * 설명:
 *  - 유국역만: "유국까지 요구패와 자패만 버렸다면 … 역만"
 *  - 모래시계: "유국이 선언되는 순간 내가 텐파이라면 국이 끝나지 않고 … 4장을 쯔모한다"
 *    → **자동 발동이다. 끄거나 미룰 수 없다.**
 *
 * 기대(먼저 적음):
 *  유국역만이 성립한 유국에서 모래시계가 끼면, 연장 중 버리는 4장 중 하나라도
 *  요구패가 아니면 역만(48,000)이 통째로 사라진다. 보유자는 그걸 **거절할 수 없다.**
 *  대조군: 없음 / 유국역만만 / 모래시계만 / 둘 다 (시드 여러 개)
 */
import { FlowController, WALL, handIdsOf } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft, start, emptyWall, lastSettled, table } from "./lib.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { nagashiYakuman } from "../../../packages/content/src/augments/nagashi_yakuman.js";

function scene(seed: number): GameState {
  const base = craft({
    hands: {
      p0: "234m345p456s678s2s", // 텐파이
      p1: "147m147p147s1234z",
      p2: "147m147p147s1234z",
      p3: "147m147p147s1234z",
    },
    discards: { p0: "99m99p9s" }, // 전부 요구패 → 유국역만 성립
    phase: "turn.draw",
    turnSeat: 0,
    seed,
  });
  return emptyWall(base);
}

function run(label: string, seed: number, defs: Parameters<typeof start>[1]): void {
  const g = start(scene(seed), defs);
  const r = g.engine.submit({ player: "__system", type: "sys.settleDraw", payload: {} });
  if (!r.ok) throw new Error("rejected");
  let settled = lastSettled(g);
  const log: string[] = [];
  if (settled === null) {
    const flow = new FlowController(g.engine);
    let st = flow.begin();
    for (let i = 0; i < 40 && st.kind === "awaiting"; i++) {
      const pr = st.prompts.find((p) => p.player === "p0") ?? st.prompts[0];
      if (pr === undefined) break;
      const win = pr.options.find((o) => o.type === "win");
      if (win !== undefined && pr.player === "p0") {
        flow.submit("p0", win);
        break;
      }
      const draw = pr.options.find((o) => o.type === "draw");
      if (draw !== undefined) {
        st = flow.submit(pr.player, draw);
        continue;
      }
      const discard = pr.options.find((o) => o.type === "discard");
      if (discard !== undefined && pr.player === "p0") {
        const tileId = g.engine.state.round.lastDrawnTile ?? handIdsOf(g.engine.state, "p0").at(-1)!;
        const k = g.engine.state.tiles[tileId]!.kind;
        log.push(`${k.suit}${k.rank}`);
        st = flow.submit("p0", { type: "discard", payload: { tileId } });
        continue;
      }
      const pass = pr.options.find((o) => o.type === "pass") ?? pr.options[0];
      if (pass === undefined) break;
      st = flow.submit(pr.player, pass);
    }
    settled = lastSettled(g);
  }
  table(`${label} (seed=${seed})`, [
    { label: "연장에서 버린 패", value: log.length === 0 ? "연장 없음" : log.join(",") },
    { label: "outcome", value: settled?.outcome },
    { label: "p0 delta", value: settled?.deltas["p0"] },
    { label: "drawSpecial", value: settled?.drawSpecial?.label ?? "없음" },
  ]);
}

for (const seed of [1, 7, 42]) {
  run("① 없음", seed, []);
  run("② 유국역만만", seed, [nagashiYakuman]);
  run("③ 모래시계만", seed, [hourglass]);
  run("④ 둘 다", seed, [nagashiYakuman, hourglass]);
}
