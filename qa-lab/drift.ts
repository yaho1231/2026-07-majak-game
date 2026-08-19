/** 점수 총합 드리프트 추적 — 드리프트 직전 이벤트를 찍는다 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, assignPreset } from "./harness.js";
import type { Persona } from "./harness.js";

const plist = Object.values(PERSONAS) as Persona[];

async function run(i: number): Promise<void> {
  const rng = new Prng(i * 2654435761);
  const mode = i % 3 === 0 ? "tonpuu" : "hanchan";
  const forced = [contentAugments[i % contentAugments.length]!.id];
  const preset = assignPreset(rng, mode, forced, 2);
  const personas = Object.fromEntries(SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona]));
  const seed = i * 7919 + 13;
  const agents = SEATS.map((id, k) => new PersonaAgent(id, personas[id] as Persona, seed * 131 + k * 7 + 1));
  const recent: string[] = [];
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode, seed, maxWind: mode === "tonpuu" ? 1 : 2, westEntry: false,
    draftSchedules: mode === "tonpuu" ? ["eastFirst","eastThird","eastFourth"] : ["eastFirst","eastThird","southEntry","southThird"], extraAugments: contentAugments, presetAugments: preset, agentDecideTimeoutMs: 20000,
  } as never, {
    onEvent: (j: string) => { recent.push(j.slice(0, 400)); if (recent.length > 8) recent.shift(); },
  } as never);
  let prev: number | undefined;
  ctrl.addSpectator({
    id: "d",
    sendView: () => {
      const st = ctrl.gameState; if (st === null) return;
      const total = st.players.reduce((a, p) => a + p.score, 0) + (st.round.riichiPot ?? 0);
      if (prev !== undefined && total !== prev) {
        console.log(`\n### i=${i} DRIFT ${prev} -> ${total} (${total - prev}) @ ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`);
        console.log("scores:", st.players.map((p) => `${p.id}:${p.score}`).join(" "), "pot:", st.round.riichiPot);
        console.log("preset:", JSON.stringify(preset));
        console.log("recent events:\n  " + recent.join("\n  "));
      }
      prev = total;
    },
  });
  try { await ctrl.run(); } catch (e) { console.log("crash", String(e)); }
}
for (const i of process.argv.slice(2).map(Number)) await run(i);
