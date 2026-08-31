/**
 * 「보유만 해도 나빠지는가」 vs 「발동 때문인가」를 가른다.
 *  ① 누명 보유 + 정상   ② 누명 보유 + frame_discard 후보를 프롬프트에서 제거(발동 불가)  ③ 미보유
 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const orig = proto.decide;
const N = Number(process.argv[2] ?? 10);
for (const arm of ["보유+발동", "보유+발동봉인", "미보유"]) {
  const ids = arm === "미보유" ? [] : ["frame_up"];
  let chiOff = 0, chiTake = 0, score = 0, fires = 0;
  proto.decide = async function (p: any) {
    const isMe = (this as any).id === "p0";
    const prompt = isMe && arm === "보유+발동봉인"
      ? { ...p, options: (p.options ?? []).filter((o: any) => o.type !== "frame_discard") }
      : p;
    const r = await orig.call(this, prompt);
    if (isMe) {
      const t = new Set<string>((prompt.options ?? []).map((o: any) => o.type));
      if (t.has("chi")) { chiOff++; if (r.type === "chi") chiTake++; }
      if (r.type === "frame_discard") fires++;
    }
    return r;
  };
  for (let s = 1; s <= N; s++) {
    const rep = await runBuild({ seed: s, mode: "hanchan", preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
    score += rep.finalScores.p0 ?? 0;
  }
  console.log(`${arm}: 평균점수=${(score / N).toFixed(0)} 치수락=${chiTake}/${chiOff} 누명발동=${fires}`);
}
proto.decide = orig;
