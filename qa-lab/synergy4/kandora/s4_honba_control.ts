import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "../../harness.js";
import type { PlayerId } from "@majak/core";
/* eslint-disable @typescript-eslint/no-explicit-any */
async function probe(label: string, preset: Record<PlayerId, readonly string[]>, seed: number): Promise<void> {
  const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS["caller"]!, seed * 131 + i));
  const out: string[] = [];
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode: "hanchan", seed, maxWind: 2, westEntry: false,
    draftSchedules: ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments, presetAugments: preset, agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: any) => {
      const st = g.engine.state;
      const dealer = st.players.find((p: any) => p.seat === st.round.dealerSeat)?.id;
      out.push(`${st.round.prevalentWind}-${st.round.roundNumber} 본장=${st.round.honba} 오야=${dealer}`);
    },
  } as never);
  const p = ctrl.run();
  const to = new Promise((_r, rej) => setTimeout(() => { ctrl.requestAbort(); rej(new Error("t")); }, 120_000));
  try { await Promise.race([p, to]); } catch { /* ignore */ }
  console.log(`\n=== ${label} ===\n${out.join("\n")}`);
}
async function main(): Promise<void> {
  await probe("대조군: 증강 없음 (seed 21)", { p0: [], p1: [], p2: [], p3: [] } as never, 21);
  await probe("honba_hunter만 (seed 21)", { p0: ["honba_hunter"], p1: [], p2: [], p3: [] } as never, 21);
  await probe("eternal_dealer만 (seed 21)", { p0: ["eternal_dealer"], p1: [], p2: [], p3: [] } as never, 21);
}
void main();
