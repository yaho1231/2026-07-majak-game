/** 시드 1에서 p0 결정 로그를 둘 다 찍어 «첫 갈림»을 찾는다 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
const proto = BotAgent.prototype as any;
const orig = proto.decide;
const logs: string[][] = [];
for (const ids of [["frame_up"], []]) {
  const log: string[] = [];
  proto.decide = async function (p: any) {
    const r = await orig.call(this, p);
    if ((this as any).id === "p0") {
      const types = [...new Set<string>((p.options ?? []).map((o: any) => o.type))].sort().join(",");
      log.push(`[${types}] -> ${r.type}${JSON.stringify(r.payload ?? {})}`);
    }
    return r;
  };
  await runBuild({ seed: 1, mode: "hanchan", preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
  logs.push(log);
}
proto.decide = orig;
const [a, b] = logs as [string[], string[]];
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  const x = a[i] ?? "-", y = b[i] ?? "-";
  if (x !== y) { console.log(`첫 갈림 #${i}\n  누명보유: ${x}\n  대조군  : ${y}`); break; }
}
console.log("--- 누명 보유 처음 12수 ---"); console.log(a.slice(0, 12).join("\n"));
console.log("--- 대조군 처음 12수 ---"); console.log(b.slice(0, 12).join("\n"));
