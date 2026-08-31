/**
 * no_ron_pact × meld_dissolve — 실제로 퐁한 뒤 파혼으로 지우면 조약이 되살아나는가.
 * (no_ron_pact 소스는 meldedKey 로 막았다고 적혀 있다 — 실제 콜 경로로 확인한다.)
 */
import { craft, mkGame, withAugments, optionsFor, FlowController, tileOf, pick } from "./lib.js";
import type { GameState, ActionOption, PlayerId } from "@majak/core";
import { openMeldCountOf, meldCountOf } from "@majak/core";

let s: GameState = craft({
  hands: { p0: "1z1z123m456m789m9p", p1: "1z1188m1188s2z3z4z", p2: "*", p3: "*" },
  discards: { p0: "", p1: "", p2: "", p3: "" },
  phase: "turn.act",
  turnSeat: 1,
  drawnLastFor: "p1",
});
s = withAugments(s, { p0: ["no_ron_pact", "meld_dissolve"] });
const g = mkGame(s);
const flow = new FlowController(g.engine);
let status = flow.begin();
const show = (tag: string): void => {
  const st = g.engine.state;
  const raw = Object.entries(st.augmentData).find(([k]) => k.includes("no_ron_pact:active"));
  const melded = Object.entries(st.augmentData).find(([k]) => k.includes("no_ron_pact:melded"));
  console.log(`  ${tag}: 후로=${meldCountOf(st, "p0")} | 조약active=${String(raw?.[1])} | melded표식=${String(melded?.[1])}`);
};
show("시작");
// p1이 1z를 버린다
const z = tileOf(g.engine.state, "p1", "1z");
status = flow.submit("p1", pick(status, "p1", "discard", (p) => (p["tileId"] as number) === z));
// p0 퐁
status = flow.submit("p0", pick(status, "p0", "pon"));
show("퐁 후");
// p0 파혼
const dis = optionsFor(status, "p0").find((o) => o.type === "dissolve_meld");
if (dis === undefined) console.log("  파혼 후보 없음:", [...new Set(optionsFor(status, "p0").map((o) => o.type))].join(","));
else {
  status = flow.submit("p0", dis);
  show("파혼 직후");
  const d = optionsFor(status, "p0").filter((o) => o.type === "discard");
  if (d.length > 0) status = flow.submit("p0", d[0] as ActionOption);
  show("파혼 후 버림까지");
  console.log("  p0 리치 후보:", optionsFor(status, "p0").some((o) => o.type === "riichi"));
}
