/**
 * reload(재장전)가 내 축의 소진을 실제로 되돌리는가 — 카운터형 + 선발동형.
 */
import { craft, mkGame, withAugments, optionsFor, FlowController, withData, roundKeyOf } from "./lib.js";
import type { GameState } from "@majak/core";

function run(target: string, data: Record<string, unknown>): void {
  let s: GameState = craft({
    hands: { p0: "123m456m789m22p33p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = withAugments(s, { p0: ["reload", target] });
  s = withData(s, data);
  const g = mkGame(s);
  const flow = new FlowController(g.engine);
  let status = flow.begin();
  const o = optionsFor(status, "p0").find(
    (x) => x.type === "reload_use" && (x.payload as { augmentId: string }).augmentId === target,
  );
  if (o === undefined) { console.log(`${target.padEnd(14)} | 후보 없음`); return; }
  status = flow.submit("p0", o);
  const after = Object.entries(g.engine.state.augmentData)
    .filter(([k]) => k.startsWith(`${target}:`))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  console.log(`${target.padEnd(14)} | 복구 후: ${after}`);
}

run("die_hard", { "die_hard:uses:p0": 1 });
run("karma", { "karma:uses:p0": 1 });
run("seat_swap", { "seat_swap:uses:p0": 2 });
run("pond_snatch", { "pond_snatch:used:p0": 3 });
// 선발동형(sign_flip): 켜졌던 국이 지나가 spent 표식이 선 상태
{
  let s: GameState = craft({
    hands: { p0: "123m456m789m22p33p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "6z" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  s = withAugments(s, { p0: ["reload", "sign_flip"] });
  s = withData(s, {
    "sign_flip:armedRound:p0": "east-1-0",
    "view:*:spent:sign_flip:p0": true,
  });
  const g = mkGame(s);
  const flow = new FlowController(g.engine);
  let status = flow.begin();
  const o = optionsFor(status, "p0").find(
    (x) => x.type === "reload_use" && (x.payload as { augmentId: string }).augmentId === "sign_flip",
  );
  console.log(`sign_flip      | 후보=${o !== undefined}` + (o === undefined ? "" : ""));
  if (o !== undefined) {
    status = flow.submit("p0", o);
    console.log(`               | 복구 후 armedRound=${JSON.stringify(g.engine.state.augmentData["sign_flip:armedRound:p0"])} (지금 국=${roundKeyOf(g.engine.state)})`);
  }
}
