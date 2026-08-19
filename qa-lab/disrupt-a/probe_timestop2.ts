/**
 * time_stop — 선언 대비 실제 추가 턴 수. detail: "버림이 울리면 발동이 다음 자기
 * 순으로 미뤄질 뿐 소멸하지는 않는다".
 * 국마다 선언 수 / 실제 추가 턴 수 / (선언했는데 그 국에 추가 턴을 못 받은 수)를 센다.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "./h.js";

let totDecl = 0, totExtra = 0, rounds = 0;
const lost: string[] = [];

function analyze(events: readonly GameEvent[], rk: string): void {
  const seq: (PlayerId | "CALL")[] = [];
  const decl = new Set<string>();
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "TileDrawn" && p.rinshan !== true) seq.push(p.player as PlayerId);
    if (e.type === "CallMade") seq.push("CALL");
    if (e.type === "AugmentDataSet" && /^time_stop:used:/.test(String(p.key)) && p.value === true) {
      decl.add(String(p.key).split(":").pop()!);
    }
  }
  const extras = new Map<string, number>();
  for (let i = 1; i < seq.length; i++) {
    const cur = seq[i];
    if (cur === "CALL" || seq[i - 1] === "CALL") continue;
    if (cur === seq[i - 1]) extras.set(cur as string, (extras.get(cur as string) ?? 0) + 1);
  }
  totDecl += decl.size;
  for (const n of extras.values()) totExtra += n;
  for (const who of decl) {
    if ((extras.get(who) ?? 0) === 0) lost.push(`${rk} ${who}`);
  }
}

async function one(seed: number, mode: "hanchan" | "tonpuu"): Promise<void> {
  const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS.masher!, seed * 131 + i * 7 + 1));
  let cursor = 0, rk = "";
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode, seed,
    maxWind: mode === "tonpuu" ? 1 : 2, westEntry: false, draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: { p0: ["time_stop"], p1: ["time_stop"], p2: ["time_stop"], p3: ["time_stop"] },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { eventLog: GameEvent[]; state: GameState } }) => {
      cursor = g.engine.eventLog.length;
      const r = g.engine.state.round;
      rk = `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
    },
    onRoundEnd: (g: { engine: { eventLog: GameEvent[] } }) => {
      analyze(g.engine.eventLog.slice(cursor), rk); cursor = g.engine.eventLog.length; rounds++;
    },
  } as never);
  try { await ctrl.run(); } catch (e) { console.log("crash", String(e).slice(0, 80)); }
}

const a = process.argv.slice(2);
for (let s = Number(a[0] ?? 1); s <= Number(a[1] ?? 4); s++) await one(s, s % 2 === 0 ? "tonpuu" : "hanchan");
console.log(`국=${rounds} 선언=${totDecl} 추가턴=${totExtra} 선언했으나 그 국에 추가턴 없음=${lost.length}`);
console.log(lost.slice(0, 15).join(" | "));
