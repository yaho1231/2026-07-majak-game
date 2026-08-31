/**
 * S3 — 의심 2·3을 실판으로 확인한다.
 *
 *  (가) dora_afterimage가 적어 두는 «직전 국의 도라»에 **깡도라 표시패까지** 들어가는가.
 *       들어간다면 깡을 많이 부르는 카드(snake_kan·cliff_bloom·ankan_dora)와 국을 걸쳐
 *       개인 도라 종류가 여러 개 되살아난다.
 *  (나) eternal_dealer가 «다음 국의 오야를 내 자리로» 가져올 때 **본장이 이어지는가**.
 *       이어지면 honba_hunter(본장당 1,500)가 계속 자란다.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "../../harness.js";
import type { PlayerId } from "@majak/core";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function probe(label: string, preset: Record<PlayerId, readonly string[]>, seed: number,
  onRound: (st: any, phase: string, out: string[]) => void): Promise<void> {
  const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS["caller"]!, seed * 131 + i));
  const out: string[] = [];
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "hanchan", seed, maxWind: 2, westEntry: false,
    draftSchedules: ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments, presetAugments: preset,
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: any) => onRound(g.engine.state, "start", out),
    onRoundEnd: (g: any) => onRound(g.engine.state, "end", out),
  } as never);
  const p = ctrl.run();
  const to = new Promise((_r, rej) => setTimeout(() => { ctrl.requestAbort(); rej(new Error("t")); }, 120_000));
  try { await Promise.race([p, to]); } catch { /* ignore */ }
  console.log(`\n=== ${label} (seed ${seed}) ===`);
  console.log(out.join("\n"));
}

async function main(): Promise<void> {
  // (가)
  await probe("잔상 × 깡 카드 — prevDora에 깡도라가 실리는가",
    { p0: ["dora_afterimage", "snake_kan", "cliff_bloom"], p1: [], p2: [], p3: [] }, 55,
    (st, phase, out) => {
      if (phase !== "end") return;
      const prev = st.augmentData["dora_afterimage:prevDora"];
      out.push(`${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} 끝: ` +
        `표시패 ${st.round.doraIndicators.length}개 · prevDora=${JSON.stringify(prev)}`);
    });

  // (나)
  await probe("만년 오야 × 본장 사냥꾼 — 오야가 옮겨질 때 본장",
    { p0: ["eternal_dealer", "honba_hunter"], p1: [], p2: [], p3: [] }, 21,
    (st, phase, out) => {
      if (phase !== "start") return;
      const dealer = st.players.find((p: any) => p.seat === st.round.dealerSeat)?.id;
      out.push(`${st.round.prevalentWind}-${st.round.roundNumber} 본장=${st.round.honba} 오야=${dealer} ` +
        `(본장 가치 p0=${st.round.honba * 1500})`);
    });
}
void main();
