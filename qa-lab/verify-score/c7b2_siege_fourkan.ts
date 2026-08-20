/**
 * 의심 7-② 후속 — 노텐 리치(공성계)의 무제한 안깡에 **실익**이 있는가.
 * 가설: 다른 사람이 이미 깡을 3개 만들어 둔 국에서, 공성계 보유자가 대기와
 * 무관한 안깡을 하나 얹어 kanCount=4를 만들면 사깡산료(도중유국)로 국이 끝난다
 * → detail이 약속한 "유국 시 노텐 벌부도 그대로 걸린다"를 피한다.
 */
import { createStandardGameFromState, handZone, installAugment, kindKey, FlowController } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { siegeRiichi } from "../../packages/content/src/augments/siege_riichi.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };

function scene(): GameState {
  const base = craft({
    // p1이 안깡 3개(kanCount 3, kanCallers=[p1]) — p0는 노텐 리치 + 4장 짝
    hands: { p0: "1111z 2m 4m 6m 8m 2p 4p 6p 8p 3p", p1: "234m5p", p2: "*", p3: "*" },
    melds: { p1: [
      { kind: "ankan", spec: "5555z" },
      { kind: "ankan", spec: "6666z" },
      { kind: "ankan", spec: "7777z" },
    ] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["siege_riichi"] } : p)),
    round: {
      ...base.round, turnCount: 1, riichiPot: 1000, kanCount: 3, kanCallers: ["p1"],
      byPlayer: { ...base.round.byPlayer, p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI } },
    },
  } as GameState;
}

const st0 = scene();
const g = createStandardGameFromState(st0);
installAugment(g.engine, siegeRiichi, "p0", { yaku: g.yaku });
const s = g.engine.state;
const ids: TileId[] = s.zones[handZone("p0")]!.tileIds.filter((t) => kindKey(s.tiles[t]!.kind) === "wind1");
console.log("kanCount(전) =", s.round.kanCount, "kanCallers =", JSON.stringify(s.round.kanCallers), "p0 대기 없음(노텐 리치)");
const s2: GameState = { ...s, round: { ...s.round, lastDrawnTile: ids[0]! } };
const g2 = createStandardGameFromState(s2);
installAugment(g2.engine, siegeRiichi, "p0", { yaku: g2.yaku });
const flow = new FlowController(g2.engine);
flow.begin();
const r = g2.engine.submit({ player: "p0", type: "ankan", payload: { tileIds: ids } as never });
console.log("ankan.ok =", r.ok, r.ok ? "" : String((r as { reason?: unknown }).reason));
const a = g2.engine.state;
console.log("kanCount(후) =", a.round.kanCount, "kanCallers =", JSON.stringify(a.round.kanCallers), "phase =", a.round.phase);
// 강제로 쯔모기리 → 다음 turn.draw에서 사깡산료 판정이 돈다
const drawn = a.round.lastDrawnTile;
if (drawn !== null) {
  const rd = g2.engine.submit({ player: "p0", type: "discard", payload: { tileId: drawn } as never });
  console.log("tsumogiri.ok =", rd.ok, rd.ok ? "" : String((rd as { reason?: unknown }).reason));
}
flow.begin();
const b = g2.engine.state;
console.log("최종 phase =", b.round.phase, "outcome =", JSON.stringify((b.round as { over?: unknown }).over ?? null));
console.log("점수 =", JSON.stringify(b.players.map((p) => `${p.id}:${p.score}`)));

// 반응(창깡) 창을 전원 패스로 닫고 흐름을 이어 본다
console.log("\n[흐름 진행]");
for (let i = 0; i < 40; i++) {
  const s3 = g2.engine.state;
  if (s3.round.phase === "round.over") break;
  const status = flow.begin() as unknown as { kind?: string; prompts?: { player: string; options: { type: string; payload?: unknown }[] }[] };
  const prompts = status.prompts ?? [];
  if (prompts.length === 0) break;
  let acted = false;
  for (const pr of prompts) {
    const pass = pr.options.find((o) => o.type === "pass");
    const tsumogiri = pr.options.find((o) => o.type === "discard");
    const pick = pass ?? tsumogiri;
    if (pick === undefined) continue;
    const rr = flow.submit(pr.player as never, pick as never);
    acted = acted || rr.kind !== "rejected";
  }
  if (!acted) break;
}
const f = g2.engine.state;
console.log("phase =", f.round.phase, "kanCount =", f.round.kanCount);
console.log("점수 =", JSON.stringify(f.players.map((p) => `${p.id}:${p.score}`)));
const settled = [...g2.engine.eventLog].reverse().find((e) => e.type === "RoundSettled");
console.log("정산 =", JSON.stringify(settled?.payload ?? null).slice(0, 400));
