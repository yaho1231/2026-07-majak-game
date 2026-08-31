/** 게임별: 누명 발동 수 vs 치/퐁 수락률 — «발동이 원인인가, 보유만으로 바뀌는가» */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const orig = proto.decide;
for (const ids of [["frame_up"], []]) {
  for (let s = 1; s <= 8; s++) {
    let fires = 0, chiOff = 0, chiTake = 0, ponOff = 0, ponTake = 0;
    proto.decide = async function (p: any) {
      const r = await orig.call(this, p);
      if ((this as any).id === "p0") {
        const t = new Set<string>((p.options ?? []).map((o: any) => o.type));
        if (t.has("chi")) { chiOff++; if (r.type === "chi") chiTake++; }
        if (t.has("pon")) { ponOff++; if (r.type === "pon") ponTake++; }
        if (r.type === "frame_discard") fires++;
      }
      return r;
    };
    const rep = await runBuild({ seed: s, mode: "hanchan", preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
    console.log(`${ids.join("+") || "none"} s=${s} 발동=${fires} 치 ${chiTake}/${chiOff} 퐁 ${ponTake}/${ponOff} 점수=${rep.finalScores.p0}`);
  }
}
proto.decide = orig;
