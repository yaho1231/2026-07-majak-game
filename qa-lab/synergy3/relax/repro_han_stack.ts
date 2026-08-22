/**
 * 확정 후보 A — "+N판" 두 개를 겹치면 합이 +(N+M)판이 아니다.
 *
 * 기대(설명을 읽고 먼저 적음):
 *   대기만성(만개) "+3판" · 해저의 지배자 "+3판" 을 같이 들고 해저 쯔모로 화료하면
 *   손의 판수는 base + 6 판으로 계산돼야 한다.
 * 실제: 두 증강이 각자 base 기준으로 (S(base+3) - S(base)) 를 따로 얹는다.
 *
 * 대조군 4칸: 없음 / 대기만성만 / 해저만 / 둘 다
 */
import { DEAD_WALL, WALL, FlowController } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft, start, lastSettled, table } from "./lib.js";
import { lateBloomer } from "../../../packages/content/src/augments/late_bloomer.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";

/** 패산을 n장으로 줄인다 (나머지는 버린다 — QA 측정용) */
function trimWall(s: GameState, n: number, keepKind?: string): GameState {
  const wall = s.zones[WALL]!.tileIds;
  let ids = wall.slice(0, n);
  if (keepKind !== undefined) {
    // 원하는 종류의 패를 패산 맨 앞에 둔다
    const idx = wall.findIndex((id) => {
      const t = s.tiles[id]!;
      return `${t.kind.suit}${t.kind.rank}` === keepKind;
    });
    if (idx < 0) throw new Error(`no ${keepKind} in wall`);
    ids = [wall[idx]!];
  }
  return { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: ids } } };
}

function scene(): GameState {
  const base = craft({
    // 13장 텐파이 (2s 탕키) — 탕야오 성립
    hands: { p0: "234m345p456s678s2s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const s = trimWall(base, 1, "sou2");
  return {
    ...s,
    round: {
      ...s.round,
      // 만개 구간 (남4국)
      prevalentWind: 2,
      roundNumber: 4,
      // 도라 표시패를 손과 무관한 것으로 고정
      doraIndicators: [s.zones[DEAD_WALL]!.tileIds[4]!],
    },
  };
}

function run(label: string, defs: Parameters<typeof start>[1]): void {
  const g = start(scene(), defs);
  const flow = new FlowController(g.engine);
  let status = flow.begin();
  // 쯔모 → 화료 옵션
  for (let i = 0; i < 6 && status.kind === "awaiting"; i++) {
    const prompt = status.prompts.find((p) => p.player === "p0");
    const win = prompt?.options.find((o) => o.type === "win");
    if (win !== undefined) {
      flow.submit("p0", win);
      break;
    }
    const draw = prompt?.options.find((o) => o.type === "draw");
    if (draw === undefined) {
      console.log(`  ${label}: no draw/win option`, prompt?.options.map((o) => o.type));
      return;
    }
    status = flow.submit("p0", draw);
  }
  const p = lastSettled(g);
  const info = (p?.winInfos ?? []).find((w) => w.winner === "p0");
  table(label, [
    { label: "han", value: info?.han },
    { label: "fu", value: info?.fu },
    { label: "yaku", value: (info?.yaku ?? []).map((y) => y.id) },
    { label: "손 점수(points)", value: info?.points },
    { label: "delta p0", value: p?.deltas["p0"] },
    { label: "augPoints", value: p?.augPoints },
  ]);
}

run("① 없음", []);
run("② 대기만성만 (+3판)", [lateBloomer]);
run("③ 해저의 지배자만 (+3판)", [haiteiLord]);
run("④ 둘 다 (+3 +3 = +6판이어야)", [lateBloomer, haiteiLord]);
