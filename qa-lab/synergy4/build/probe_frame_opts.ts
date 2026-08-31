import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const orig = proto.decide;
for (const ids of [["frame_up"], ["rank_gate"], []]) {
  const c: Record<string, number> = {}; const chosenC: Record<string, number> = {};
  let decisions = 0, discOpts = 0;
  proto.decide = async function (p: any) {
    const r = await orig.call(this, p);
    if ((this as any).id === "p0") {
      decisions++;
      const t = new Set<string>((p.options ?? []).map((o: any) => o.type));
      for (const x of t) c[x] = (c[x] ?? 0) + 1;
      discOpts += (p.options ?? []).filter((o: any) => o.type === "discard").length;
      chosenC[r.type] = (chosenC[r.type] ?? 0) + 1;
    }
    return r;
  };
  for (let s = 1; s <= 12; s++) await runBuild({ seed: s, mode: "hanchan", preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
  console.log(ids.join("+") || "none", "결정", decisions, "discard후보총수", discOpts, "\n 제시:", JSON.stringify(c), "\n 선택:", JSON.stringify(chosenC));
}
proto.decide = orig;
