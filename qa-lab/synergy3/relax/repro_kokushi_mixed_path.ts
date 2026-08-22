/**
 * 위 벽돌 상태에 **실제로 도달할 수 있는가** — 두 콜을 진짜 액션으로 부른다.
 *  ① mixed_triplet 로 1만·1통·1삭 퐁(kind="pon")이 실제로 제시·성립하는가
 *  ② 그 뒤에도 open_kokushi 의 kokushi_pon 이 후보로 뜨는가 (hasNonKokushiMeld 통과)
 */
import { FlowController, kindKey, kindOf } from "@majak/core";
import { craft, start, table } from "./lib.js";
import { openKokushi } from "../../../packages/content/src/augments/open_kokushi.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

const base = craft({
  // 1m 1p (혼색 퐁 재료) + 9p 9s (국사 퐁 재료) + 나머지 자패
  hands: { p0: "1m1p9p9s1234z567z", p1: "*", p2: "*", p3: "*" },
  phase: "reaction",
  turnSeat: 1,
  lastDiscard: { player: "p1", spec: "1s" },
});
const g = start(base, [mixedTriplet, openKokushi]);
const flow = new FlowController(g.engine);
const st = flow.begin();
const pr = st.kind === "awaiting" ? st.prompts.find((p) => p.player === "p0") : undefined;
table("① 1삭 버림에 대한 p0 후보", [
  { label: "options", value: (pr?.options ?? []).map((o) => o.type) },
]);
const pon = (pr?.options ?? []).find((o) => o.type === "pon");
if (pon !== undefined) {
  flow.submit("p0", pon);
  const melds = g.engine.state.round.byPlayer["p0"]?.melds ?? [];
  table("② 혼색 퐁 성립", [
    { label: "melds", value: melds.map((m) => `${m.kind}[${m.tileIds.map((id) => kindKey(kindOf(g.engine.state, id))).join(",")}]`) },
  ]);
}

// ③ 혼색 퐁을 이미 가진 상태에서 9만 버림 — kokushi_pon 이 여전히 뜨는가
{
  const base3 = craft({
    hands: { p0: "9p9s1234z567z", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "1m1p1s", from: "p1" }] },
    phase: "reaction",
    turnSeat: 2,
    lastDiscard: { player: "p2", spec: "9m" },
  });
  const g3 = start(base3, [mixedTriplet, openKokushi]);
  const flow3 = new FlowController(g3.engine);
  const st3 = flow3.begin();
  const pr3 = st3.kind === "awaiting" ? st3.prompts.find((p) => p.player === "p0") : undefined;
  table("③ 혼색 퐁(1m1p1s)을 이미 한 뒤 9만 버림 — kokushi_pon 이 뜨나", [
    { label: "options", value: (pr3?.options ?? []).map((o) => o.type) },
  ]);
  const kp = (pr3?.options ?? []).find((o) => o.type === "kokushi_pon");
  if (kp !== undefined) {
    let s4 = flow3.submit("p0", kp);
    for (let i = 0; i < 6 && s4.kind === "awaiting"; i++) {
      const q = s4.prompts[0];
      if (q === undefined) break;
      const pass = q.options.find((o) => o.type === "pass") ?? q.options[0];
      if (pass === undefined) break;
      s4 = flow3.submit(q.player, pass);
    }
    const melds = g3.engine.state.round.byPlayer["p0"]?.melds ?? [];
    table("④ 두 후로가 공존 — 이 손이 완성될 수 있나", [
      { label: "melds", value: melds.map((m) => m.kind) },
    ]);
  }
}
