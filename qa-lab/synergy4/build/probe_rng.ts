/** 결정마다 봇 난수 소비 수를 세어 «누명 보유가 무엇을 더 뽑는가»를 찾는다 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
let draws = 0;
const P = Prng.prototype as any;
const on = P.next, oi = P.int;
P.next = function (...a: any[]) { draws++; return on.apply(this, a); };
P.int = function (...a: any[]) { draws++; return oi.apply(this, a); };
const proto = BotAgent.prototype as any;
const orig = proto.decide;
const out: string[][] = [];
for (const ids of [["frame_up"], []]) {
  const log: string[] = [];
  proto.decide = async function (p: any) {
    const before = draws;
    const r = await orig.call(this, p);
    if ((this as any).id === "p0") log.push(`${[...new Set<string>((p.options ?? []).map((o: any) => o.type))].sort().join(",")} -> ${r.type}${JSON.stringify(r.payload ?? {})} draws=${draws - before}`);
    return r;
  };
  await runBuild({ seed: 1, mode: "hanchan", preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300000 });
  out.push(log);
}
proto.decide = orig; P.next = on; P.int = oi;
const [a, b] = out as [string[], string[]];
for (let i = 0; i < 8; i++) console.log(`#${i}\n  누명: ${a[i]}\n  대조: ${b[i]}`);
