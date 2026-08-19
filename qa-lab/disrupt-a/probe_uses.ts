/**
 * 횟수 규약 감사 — 각 증강이 광고한 사용 제한을 지키는가.
 *  pseudo_dealer 2국1회 / discard_lock 2국1회 / hidden_river 매치 1(동풍)·2(반장)
 *  seat_swap 매치 2(동풍)·3(반장) + 국당 1 / time_stop 국당 1
 *  scapegoat·parasite·rank_gate 국당 1
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS } from "./h.js";

const ALL = ["pseudo_dealer", "scapegoat", "hidden_river", "discard_lock",
  "seat_swap", "parasite", "time_stop", "rank_gate"];

interface Use { aug: string; holder: string; roundIdx: number; rk: string; }

const problems: string[] = [];

function collect(events: readonly GameEvent[], roundIdx: number, rk: string, uses: Use[]): void {
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    const push = (aug: string, holder: string): void => { uses.push({ aug, holder, roundIdx, rk }); };
    if (e.type === "DealerUsurped") push("pseudo_dealer", String(p.holder));
    if (e.type === "DiscardLockSealed") push("discard_lock", String(p.holder));
    if (e.type === "SeatsSwapped") push("seat_swap", String(p.a));
    if (e.type !== "AugmentDataSet") continue;
    const k = String(p.key);
    let m = /^scapegoat:target:.+:(p\d)$/.exec(k);
    if (m !== null && typeof p.value === "string") push("scapegoat", m[1]!);
    m = /^parasite:target:(p\d):/.exec(k);
    if (m !== null && typeof p.value === "string") push("parasite", m[1]!);
    m = /^rank_gate:mark:.+:(p\d)$/.exec(k);
    if (m !== null && typeof p.value === "string") push("rank_gate", m[1]!);
    m = /^time_stop:used:.+:(p\d)$/.exec(k);
    if (m !== null && p.value === true) push("time_stop", m[1]!);
    m = /^hidden_river:uses:(p\d)$/.exec(k);
    if (m !== null && typeof p.value === "number") push("hidden_river", m[1]!);
  }
}

function judge(uses: Use[], mode: "hanchan" | "tonpuu", tag: string): void {
  const matchUses = mode === "tonpuu" ? 1 : 2;
  const byAugHolder = new Map<string, Use[]>();
  for (const u of uses) {
    const k = `${u.aug}|${u.holder}`;
    if (!byAugHolder.has(k)) byAugHolder.set(k, []);
    byAugHolder.get(k)!.push(u);
  }
  for (const [k, list] of byAugHolder) {
    const [aug, holder] = k.split("|") as [string, string];
    const perRound = new Map<string, number>();
    for (const u of list) perRound.set(u.rk, (perRound.get(u.rk) ?? 0) + 1);
    const roundOnce = ["scapegoat", "parasite", "rank_gate", "time_stop", "seat_swap"];
    if (roundOnce.includes(aug)) {
      for (const [rk, n] of perRound) {
        if (n > 1) problems.push(`${tag} ${aug}/${holder}: 국 ${rk}에 ${n}회 (국당 1회 위반)`);
      }
    }
    if (aug === "hidden_river" && list.length > matchUses) {
      problems.push(`${tag} hidden_river/${holder}: 매치 ${list.length}회 (한도 ${matchUses})`);
    }
    if (aug === "seat_swap" && list.length > matchUses + 1) {
      problems.push(`${tag} seat_swap/${holder}: 매치 ${list.length}회 (한도 ${matchUses + 1})`);
    }
    // 2국 1회 — 같은 보유자의 두 발동 사이 국 인덱스 차이가 2 미만이면 위반
    if (aug === "pseudo_dealer" || aug === "discard_lock") {
      const idx = list.map((u) => u.roundIdx).sort((a, b) => a - b);
      for (let i = 1; i < idx.length; i++) {
        if (idx[i]! - idx[i - 1]! < 2) {
          problems.push(`${tag} ${aug}/${holder}: 국 ${idx[i - 1]}→${idx[i]} (2국 쿨다운 위반)`);
        }
      }
    }
  }
}

async function one(seed: number, mode: "hanchan" | "tonpuu"): Promise<number> {
  const agents = SEATS.map((id, i) => new PersonaAgent(id, PERSONAS.masher!, seed * 131 + i * 7 + 1));
  const uses: Use[] = [];
  let cursor = 0, roundIdx = 0, rk = "";
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode, seed,
    maxWind: mode === "tonpuu" ? 1 : 2, westEntry: false, draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: { p0: ALL, p1: ALL, p2: ALL, p3: ALL },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { eventLog: GameEvent[]; state: GameState } }) => {
      cursor = g.engine.eventLog.length;
      const r = g.engine.state.round;
      rk = `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
    },
    onRoundEnd: (g: { engine: { eventLog: GameEvent[] } }) => {
      collect(g.engine.eventLog.slice(cursor), roundIdx, rk, uses);
      cursor = g.engine.eventLog.length;
      roundIdx++;
    },
  } as never);
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("TIMEOUT")), 180_000);
      ctrl.run().then(() => { clearTimeout(t); res(); }, (e) => { clearTimeout(t); rej(e); });
    });
  } catch (e) { problems.push(`seed=${seed}/${mode} CRASH ${e instanceof Error ? e.message : String(e)}`); }
  judge(uses, mode, `seed=${seed}/${mode}`);
  const tally: Record<string, number> = {};
  for (const u of uses) tally[u.aug] = (tally[u.aug] ?? 0) + 1;
  console.log(`seed=${seed}/${mode} rounds=${roundIdx} ${JSON.stringify(tally)}`);
  return roundIdx;
}

const a = process.argv.slice(2);
let rounds = 0;
for (let s = Number(a[0] ?? 1); s <= Number(a[1] ?? 4); s++) {
  rounds += await one(s, s % 2 === 0 ? "tonpuu" : "hanchan");
}
console.log(`\n총 ${rounds}국 · 문제 ${problems.length}건`);
for (const p of problems) console.log("  " + p);
