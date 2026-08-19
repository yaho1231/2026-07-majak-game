/**
 * hand-a 스윕 2 — 강제 지급 + 사용 횟수 감시 + 도메인 불변식.
 *
 * 사용: tsx qa-lab/hand-a/sweep2.ts <mode> <seedsPerAug> [augId ...]
 *
 * 각 좌석에 같은 증강 1종만(드래프트 없음) → 그 증강만의 결함이 드러난다.
 * 액션 타입별 좌석당 발동 횟수를 세어 "게임 내 N회" 약속과 대조한다.
 */
import { PersonaAgent, PERSONAS, SEATS } from "../harness.js";
import type { Persona } from "../harness.js";
import { runMatch2 } from "./run.js";
import { handChecks, newCtx } from "./checks.js";
import { handZone, isNumberSuit } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";

const MINE = [
  "red_five_touch", "take_back", "tile_dyeing", "suit_unify", "hand_swap3",
  "full_hand_swap", "future_sight", "bottom_deal", "alchemist", "pond_snatch",
  "grave_rob", "silent_swap",
] as const;

/** 액션 타입 → 게임당 좌석별 상한 (mode별). null = 순/국 단위라 여기서 안 본다 */
const GAME_LIMIT: Record<string, (mode: string) => number> = {
  red_touch: () => 1,
  hand_swap: () => 2,
  swap3: () => 2,
  mono_world: (m) => (m === "tonpuu" ? 1 : 2),
  grave_rob: (m) => (m === "tonpuu" ? 1 : 2),
  pond_snatch: () => 3,
  alchemy: () => 5,
  tile_dye: () => 5,
};

const mode = (process.argv[2] ?? "hanchan") as "hanchan" | "tonpuu";
const nSeeds = Number(process.argv[3] ?? 5);
const only = process.argv.slice(4);
const augs = only.length > 0 ? only : [...MINE];

const personaSets: Record<PlayerId, Persona>[] = [
  { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.folder!, p3: PERSONAS.caller! },
  { p0: PERSONAS.masher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.masher!, p3: PERSONAS.folder! },
  { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.masher!, p3: PERSONAS.riichiRusher! },
];

let games = 0;
let rounds = 0;
const problems: string[] = [];
const usage = new Map<string, number>();

for (const aug of augs) {
  for (let s = 0; s < nSeeds; s++) {
    const seed = 2000 + s * 37;
    const preset = { p0: [aug], p1: [aug], p2: [aug], p3: [aug] } as Record<PlayerId, readonly string[]>;
    const personas = personaSets[s % personaSets.length]!;
    const agents = SEATS.map((id, i) => new PersonaAgent(id, personas[id]!, seed * 131 + i * 7 + 1));
    const ctx = newCtx();
    // red_five_touch 전용 불변식: 각인한 랭크는 손에 들어오는 즉시 내 적도라여야 한다
    const redMiss: string[] = [];
    const onState = (st: GameState, out: never[]): void => {
      handChecks(st, out as never, ctx);
      if (aug === "red_five_touch") {
        for (const seat of st.config.playerIds) {
          const rank = st.augmentData[`red_five_touch:rank:${seat}`];
          if (typeof rank !== "number") continue;
          for (const id of st.zones[handZone(seat)]?.tileIds ?? []) {
            const t = st.tiles[id];
            if (t === undefined || !isNumberSuit(t.kind) || t.kind.rank !== rank) continue;
            const a = t.attrs as { red?: boolean; redFor?: string } | undefined;
            if (a?.red !== true) {
              redMiss.push(`${seat} rank=${rank} tile=${id} attrs=${JSON.stringify(a)} phase=${st.round.phase}`);
            }
          }
        }
      }
    };
    const r = await runMatch2({
      seed, mode, preset, agents,
      onState: onState as never,
      timeoutMs: 240_000,
    });
    games++;
    rounds += r.rounds;
    // 좌석별 액션 횟수
    const over: string[] = [];
    for (const a of agents) {
      const counts = new Map<string, number>();
      for (const t of a.actionLog) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
        usage.set(t, (usage.get(t) ?? 0) + 1);
      }
      for (const [t, n] of counts) {
        const lim = GAME_LIMIT[t];
        if (lim !== undefined && n > lim(mode)) over.push(`${a.id} ${t}=${n} > ${lim(mode)}`);
      }
    }
    const kinds = [...new Set(r.violations.map((v) => v.kind))];
    const bad = r.crash !== undefined || r.effectErrors.length > 0 || r.violations.length > 0 || over.length > 0 || redMiss.length > 0;
    const acted = SEATS.map((id) => {
      const a = agents.find((x) => x.id === id)!;
      const n = a.actionLog.filter((t) => GAME_LIMIT[t] !== undefined || !["discard", "pass", "riichi", "pon", "chi", "win", "ankan", "minkan", "shouminkan"].includes(t)).length;
      return n;
    }).join("/");
    if (bad) {
      const line = `${aug} seed=${seed} ${mode} rounds=${r.rounds} aug-actions=${acted} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} viol=${r.violations.length}[${kinds.join(",")}] over=${over.join(";")} redMiss=${redMiss.length}`;
      problems.push(line);
      console.log("!! " + line);
      for (const v of r.violations.slice(0, 3)) console.log("   ", JSON.stringify(v));
      for (const e of r.effectErrors.slice(0, 3)) console.log("   eff:", e);
      for (const m of redMiss.slice(0, 3)) console.log("   redMiss:", m);
    } else {
      console.log(`ok ${aug} seed=${seed} rounds=${r.rounds} aug-actions=${acted}`);
    }
  }
}
console.log(`\n=== games=${games} rounds=${rounds} problem-games=${problems.length}`);
for (const l of problems) console.log(" ", l);
console.log("usage:", JSON.stringify(Object.fromEntries([...usage].sort((a, b) => b[1] - a[1]))));
