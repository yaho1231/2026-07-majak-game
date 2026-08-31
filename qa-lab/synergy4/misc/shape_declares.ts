/**
 * 모양 선언 3종(mixed_triplet · broken_border · async_chiitoi)을 함께 들었을 때,
 * 같은 국 첫 순에 셋 다 선언할 수 있는가 (소스 주석은 «둘을 같이 뽑으면 그때 비로소
 * 랭크만 맞으면 뭐든 몸통이 완성된다»고 진짜 시너지를 약속한다).
 */
import { craft, mkGame, withAugments, optionsFor, FlowController } from "./lib.js";
import type { GameState } from "@majak/core";

const IDS = ["mixed_triplet", "broken_border", "async_chiitoi"];
const ACT: Record<string, string> = {
  mixed_triplet: "declare_mixed_triplet",
  broken_border: "declare_broken_border",
  async_chiitoi: "declare_async_chiitoi",
};

let s: GameState = craft({
  hands: { p0: "1m1p2m3p4s5m6p7s9m9p1s2s3s4m", p1: "*", p2: "*", p3: "*" },
  discards: { p0: "", p1: "", p2: "", p3: "" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
s = withAugments(s, { p0: IDS });
const g = mkGame(s);
const flow = new FlowController(g.engine);
let status = flow.begin();
console.log("첫 순 후보:", [...new Set(optionsFor(status, "p0").map((o) => o.type))].filter((t) => t.startsWith("declare_")).join(", "));
for (const id of IDS) {
  const o = optionsFor(status, "p0").find((x) => x.type === ACT[id]);
  if (o === undefined) { console.log(`  ${id}: 후보 없음`); continue; }
  status = flow.submit("p0", o);
  const on = Object.entries(g.engine.state.augmentData).filter(([k]) => k.includes(":on:")).map(([k]) => k.split(":")[0]);
  console.log(`  ${id} 선언 → 켜진 규칙: ${[...new Set(on)].join(",")}`);
}
