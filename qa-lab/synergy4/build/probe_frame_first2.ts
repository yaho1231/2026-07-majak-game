/** 시드 1: ① 보유+발동봉인(프롬프트에서 frame_discard 제거) ② 미보유 — 첫 갈림 찾기 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const orig = proto.decide;
const out: string[][] = [];
for (const arm of ["suppressed", "none"]) {
  const log: string[] = [];
  proto.decide = async function (p: any) {
    const isMe = (this as any).id === "p0";
    const prompt = isMe && arm === "suppressed" ? { ...p, options: (p.options ?? []).filter((o: any) => o.type !== "frame_discard") } : p;
    const r = await orig.call(this, prompt);
    if (isMe) log.push(`${[...new Set<string>((prompt.options ?? []).map((o: any) => o.type))].sort().join(",")} -> ${r.type}${JSON.stringify(r.payload ?? {})}`);
    return r;
  };
  await runBuild({ seed: 1, mode: "hanchan", preset: { p0: arm === "none" ? [] : ["frame_up"], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
  out.push(log);
}
proto.decide = orig;
const [a, b] = out as [string[], string[]];
for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? "-") !== (b[i] ?? "-")) { console.log(`첫 갈림 #${i}\n  봉인보유: ${a[i]}\n  미보유  : ${b[i]}`); break; }
console.log(a.slice(0, 6).join("\n"), "\n----\n", b.slice(0, 6).join("\n"));
