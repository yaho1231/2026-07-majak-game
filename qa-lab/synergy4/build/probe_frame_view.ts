/** 보유 사실을 «봇의 뷰에서만» 지우면 정상으로 돌아오는가 (원인이 player.augments인지 확정) */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const origView = proto.sendView, origDecide = proto.decide;
const N = Number(process.argv[2] ?? 8);
for (const arm of ["보유(그대로)", "보유+id를 더미로 바꿔 보여주기", "미보유"]) {
  let chiOff = 0, chiTake = 0, score = 0;
  proto.sendView = function (v: any) {
    if (arm === "보유+id를 더미로 바꿔 보여주기" && (this as any).id === "p0" && v?.players !== undefined) {
      const players = v.players.map((p: any) => (p.id === "p0" ? { ...p, augments: (p.augments ?? []).map((a: string) => (a === "frame_up" ? "zzz_dummy" : a)) } : p));
      return origView.call(this, { ...v, players });
    }
    return origView.call(this, v);
  };
  proto.decide = async function (p: any) {
    const isMe = (this as any).id === "p0";
    const prompt = isMe && arm !== "미보유" ? { ...p, options: (p.options ?? []).filter((o: any) => o.type !== "frame_discard") } : p;
    const r = await origDecide.call(this, prompt);
    if (isMe) { const t = new Set<string>((prompt.options ?? []).map((o: any) => o.type)); if (t.has("chi")) { chiOff++; if (r.type === "chi") chiTake++; } }
    return r;
  };
  for (let s = 1; s <= N; s++) {
    const rep = await runBuild({ seed: s, mode: "hanchan", preset: { p0: arm === "미보유" ? [] : ["frame_up"], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
    score += rep.finalScores.p0 ?? 0;
  }
  console.log(`${arm}: 평균점수=${(score / N).toFixed(0)} 치수락=${chiTake}/${chiOff}`);
}
proto.sendView = origView; proto.decide = origDecide;
