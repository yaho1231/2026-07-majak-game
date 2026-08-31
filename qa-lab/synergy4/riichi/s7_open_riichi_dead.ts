/**
 * synergy4 / riichi — S7. 오픈 리치(open_riichi_reveal)의 «리치 3판 취급»이
 * 리치 판수 증강과 겹치면 **정확히 0**이 된다 — 대가(공탁 1,000 + 오름패 전원 공개)만 남는다.
 *
 * 소스: open_riichi_reveal.ts:287~300 — "3판으로 취급은 덮어쓰기다"라며
 * late_double(+1)·riichi_upgrade(트리플 +2)를 세어 빼기 때문에 차액이 0이 된다.
 *
 * 여기서는 (1) 공탁이 실제로 나가는지 (2) 오름패가 전원 공개 채널에 실리는지
 * (3) 화료값이 late_double 단독과 완전히 같은지를 한 화면에 보인다.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, optionsFor, FlowController,
} from "./lib.js";
import type { ActionOption, GameState } from "@majak/core";
import { run as valueRun } from "./s1b_lowhan.js";

const P0_HAND = "123m456m789m222p1s9s";
const P1_HAND = "234m567m234p55z2s3s";

function declareProbe(label: string, augs: string[], action: string): void {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "5z");
  s = stackWall(s, ["1s"]);
  s = withAugments(s, { p0: augs }) as GameState;
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const before = game.engine.state.players.find((p) => p.id === "p0")!.score;
  const opt = optionsFor(status, "p0").find((o) => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined || o.type !== action) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  });
  if (opt === undefined) { console.log(`${label}: !! ${action} 없음`); return; }
  status = flow.submit("p0", opt as ActionOption);
  const st = game.engine.state;
  const after = st.players.find((p) => p.id === "p0")!.score;
  const pub = Object.entries(st.augmentData)
    .filter(([k]) => k.startsWith("view:*") && k.includes("open_riichi"))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" | ");
  console.log(`${label.padEnd(34)} 공탁 ${before - after}점  pot=${st.round.riichiPot}  공개=${pub || "(없음)"}`);
}

console.log("=== 선언 시점의 대가 ===");
declareProbe("표준 리치", [], "riichi");
declareProbe("open_riichi 단독", ["open_riichi_reveal"], "open_riichi");
declareProbe("open_riichi + late_double", ["open_riichi_reveal", "late_double"], "open_riichi");
declareProbe("late_double 단독(표준 리치)", ["late_double"], "riichi");

console.log("\n=== 화료값 (p1이 리치 중 → 역만 아님, 저타점판) ===");
const rows: [string, ReturnType<typeof valueRun>][] = [
  ["표준 리치", valueRun([], "riichi", { p1riichi: true })],
  ["D open_riichi 단독", valueRun(["open_riichi_reveal"], "open_riichi", { p1riichi: true })],
  ["B late_double 단독", valueRun(["late_double"], "riichi", { p1riichi: true })],
  ["D+B (open으로 선언)", valueRun(["open_riichi_reveal", "late_double"], "open_riichi", { p1riichi: true })],
  ["D+B (표준 리치로 선언)", valueRun(["open_riichi_reveal", "late_double"], "riichi", { p1riichi: true })],
  ["C riichi_upgrade 단독", valueRun(["riichi_upgrade"], "riichi", { p1riichi: true })],
  ["D+C (open으로 선언)", valueRun(["open_riichi_reveal", "riichi_upgrade"], "open_riichi", { p1riichi: true })],
  ["B+C", valueRun(["late_double", "riichi_upgrade"], "riichi", { p1riichi: true })],
  ["D+B+C (open으로 선언)", valueRun(["open_riichi_reveal", "late_double", "riichi_upgrade"], "open_riichi", { p1riichi: true })],
];
for (const [k, r] of rows) {
  console.log(`${k.padEnd(28)} han=${r?.han} extra=${r?.extraHan} 점수=${r?.points} augPoints=${r?.augPoints || "-"}`);
}
