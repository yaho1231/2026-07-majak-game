/** p1(진짜 용) 손패가 16 → 13 으로 줄어드는 순간의 이벤트 추적 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng, handZone } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "../harness.js";
import { fillSeats } from "./lib.js";

const rng = new Prng(20220 * 7919 + 13);
const preset = fillSeats(rng, "hanchan", ["xray_hand", "time_stop"]) as Record<string, string[]>;
preset["p2"] = ["xray_hand", "time_stop"];
const names = ["masher", "caller", "riichiRusher", "folder"];
const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS[names[i]!]!, 20220 * 131 + i * 7 + 1));
let round = 0;
let prev = -1;
const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG, mode: "hanchan", seed: 20220, maxWind: 2, westEntry: false,
  draftSchedules: ["eastFirst", "eastThird", "southEntry", "southThird"],
  extraAugments: contentAugments, presetAugments: preset, agentDecideTimeoutMs: 20000,
} as never, {
  onRoundStart: () => { round++; prev = -1; console.log(`--- round #${round}`); },
  onEvent: (j: string) => {
    if (round !== 1) return;
    const e = JSON.parse(j) as { type?: string; payload?: unknown };
    const st = ctrl.gameState;
    const n = st === null ? -1 : (st.zones[handZone("p1")]?.tileIds.length ?? -1);
    const s = JSON.stringify(e.payload ?? {});
    if (n !== prev) {
      console.log(`p1 hand ${prev} -> ${n}   after ${e.type} ${s.slice(0, 160)}`);
      prev = n;
    } else if (e.type !== undefined && /Tile|Draw|Call|Discard|Augment(?!Data)/.test(e.type)) {
      console.log(`      (${e.type} ${s.slice(0, 100)})`);
    }
  },
} as never);
await ctrl.run();
