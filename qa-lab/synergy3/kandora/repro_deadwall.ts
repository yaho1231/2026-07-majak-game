/**
 * D그룹 — 깡을 겹쳤을 때의 왕패 회계.
 * 왕패 장수 / 남은 영상패 / 도라 표시패 개수 / 패산 장수를 깡마다 잰다.
 */
import { craft, setup, table, DEAD_WALL, WALL, FlowController, rinshanRemaining } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { rinshanPreview } from "../../../packages/content/src/augments/rinshan_preview.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { northTrader } from "../../../packages/content/src/augments/north_trader.js";
import { snakeKan } from "../../../packages/content/src/augments/snake_kan.js";

const DEFS: Record<string, any> = {
  cliff_bloom: cliffBloom, ankan_dora: ankanDora, rinshan_preview: rinshanPreview,
  dead_wall_master: deadWallMaster, north_trader: northTrader, snake_kan: snakeKan,
};

function metrics(st: GameState, tag: string) {
  return {
    시점: tag,
    왕패: st.zones[DEAD_WALL]?.tileIds.length ?? -1,
    남은영상패: rinshanRemaining(st),
    도라표시패: st.round.doraIndicators.length,
    pendingDora: st.round.pendingDora,
    패산: st.zones[WALL]?.tileIds.length ?? -1,
    kanCount: st.round.kanCount,
  };
}

/**
 * p0의 옵션 중 pref 순서대로 하나를 고른다. 다른 좌석은 pass.
 * 최대 steps번 진행하며 각 깡 뒤에 지표를 남긴다.
 */
export function drive(
  hand: string,
  augs: string[],
  pref: string[],
  steps: number,
  holder: PlayerId = "p0",
) {
  const st = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const game = setup(st, augs.map((a) => ({ def: DEFS[a], holder })));
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  const rows = [metrics(game.engine.state, "시작")];
  const log: string[] = [];
  for (let i = 0; i < steps; i++) {
    if (status.kind !== "awaiting") { log.push(`흐름 종료: ${status.kind}`); break; }
    const pr = status.prompts.find((p) => p.player === "p0");
    if (pr === undefined) {
      // 다른 좌석은 전부 pass
      const other = status.prompts[0];
      if (other === undefined) break;
      const pass = other.options.find((o) => o.type === "pass") ?? other.options[0];
      status = flow.submit(other.player, pass as any);
      continue;
    }
    let opt: any;
    for (const t of pref) { opt = pr.options.find((o) => o.type === t); if (opt) break; }
    if (opt === undefined) { log.push(`후보 없음: ${[...new Set(pr.options.map((o) => o.type))].join(",")}`); break; }
    status = flow.submit("p0", opt);
    rows.push(metrics(game.engine.state, `${i}: ${opt.type}`));
  }
  return { rows, log, game };
}

const H = "1111m2222m3333m45s"; // 안깡 3개 재료 (14장)

for (const augs of [[], ["ankan_dora"], ["cliff_bloom"], ["ankan_dora", "cliff_bloom"], ["rinshan_preview"], ["dead_wall_master"], ["rinshan_preview", "dead_wall_master"]]) {
  const { rows, log } = drive(H, augs, ["ankan", "bloom_pick", "rinshan_pull", "discard"], 12);
  table(`깡 3연발 · 증강 = ${augs.length ? augs.join(" + ") : "없음"}`, rows);
  if (log.length) console.log("   ", log.join(" | "));
}
