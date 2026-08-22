/**
 * hourglass(뒤집힌 모래시계) × haitei_lord(해저의 지배자) — 둘 다 `draw` 축.
 *
 * 기대(먼저 적음):
 *  - 모래시계: 유국 순간 텐파이면 영상패 4장을 나 혼자 연속 쯔모한다.
 *  - 해저의 지배자: 패산 마지막 패를 텐파이로 쯔모하면 그 패가 오름패가 된다(+3판).
 *  → 연장의 **마지막 한 장**이 곧 새 해저패이므로, 둘을 함께 들면
 *    "유국 시 텐파이면 100% 화료"가 된다. 설명 어디에도 그런 말은 없다.
 *  대조군: 없음 / 모래시계만 / 해저만 / 둘 다
 */
import { FlowController, WALL, handIdsOf } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft, start, emptyWall, lastSettled, table } from "./lib.js";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";

function scene(): GameState {
  const base = craft({
    // p0 텐파이(2s 탕키) — 유국 선언 시점
    hands: {
      p0: "234m345p456s678s2s",
      p1: "147m147p147s1234z",
      p2: "147m147p147s1234z",
      p3: "147m147p147s1234z",
    },
    discards: { p0: "9m9p" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  return emptyWall(base);
}

function run(label: string, defs: Parameters<typeof start>[1]): void {
  const g = start(scene(), defs);
  const r = g.engine.submit({ player: "__system", type: "sys.settleDraw", payload: {} });
  if (!r.ok) {
    console.log(label, "settleDraw 거부", JSON.stringify(r).slice(0, 120));
    return;
  }
  const settled = lastSettled(g);
  if (settled !== null) {
    table(label, [
      { label: "결과", value: `유국 — deltas ${JSON.stringify(settled.deltas)}` },
      { label: "drawSpecial", value: settled.drawSpecial },
    ]);
    return;
  }
  // 연장 시작 — 흘려 본다
  const flow = new FlowController(g.engine);
  let st = flow.begin();
  let won: string | null = null;
  const log: string[] = [];
  for (let i = 0; i < 40 && st.kind === "awaiting"; i++) {
    const pr = st.prompts.find((p) => p.player === "p0") ?? st.prompts[0];
    if (pr === undefined) break;
    const win = pr.options.find((o) => o.type === "win");
    if (win !== undefined && pr.player === "p0") {
      won = "p0 화료!";
      flow.submit("p0", win);
      break;
    }
    const draw = pr.options.find((o) => o.type === "draw");
    if (draw !== undefined) {
      log.push(`${pr.player}:draw(wall=${g.engine.state.zones[WALL]?.tileIds.length})`);
      st = flow.submit(pr.player, draw);
      continue;
    }
    const discard = pr.options.find((o) => o.type === "discard");
    if (discard !== undefined && pr.player === "p0") {
      // 대기를 깨지 않도록 방금 뽑은 패를 그대로 버린다(쯔모기리)
      const drawn = g.engine.state.round.lastDrawnTile;
      const tileId = drawn ?? handIdsOf(g.engine.state, "p0").at(-1)!;
      log.push(`p0:discard`);
      st = flow.submit("p0", { type: "discard", payload: { tileId } });
      continue;
    }
    const pass = pr.options.find((o) => o.type === "pass") ?? pr.options[0];
    if (pass === undefined) break;
    st = flow.submit(pr.player, pass);
  }
  const settled2 = lastSettled(g);
  const info = (settled2?.winInfos ?? []).find((w) => w.winner === "p0");
  table(label, [
    { label: "연장 진행", value: log.join(" → ") },
    { label: "화료 여부", value: won ?? "없음" },
    { label: "outcome", value: settled2?.outcome },
    { label: "yaku", value: (info?.yaku ?? []).map((y) => y.id) },
    { label: "han/fu", value: `${info?.han}/${info?.fu}` },
    { label: "deltas", value: settled2?.deltas },
    { label: "augPoints", value: settled2?.augPoints },
  ]);
}

run("① 없음", []);
run("② hourglass 만", [hourglass]);
run("③ haitei_lord 만", [haiteiLord]);
run("④ 둘 다", [hourglass, haiteiLord]);
