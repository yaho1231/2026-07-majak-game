/**
 * inv.ts — 불변식: 같은 시드 = 같은 결과 / 완주 / 점수 총합 보존.
 * **증강을 완전히 끈다** (draftSchedules: [], extraAugments: []).
 * (주의: qa-lab/harness.ts 의 runMatch 는 preset 을 비워도 드래프트가 돌아 증강이 들어간다.)
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng } from "@majak/core";
import type { ActionOption, DecisionPrompt, GameState, PlayerAgent, PlayerId, PlayerView } from "@majak/core";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

class Bot implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private rng: Prng;
  constructor(readonly id: PlayerId, seed: number, private readonly style: number) {
    this.nickname = id; this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    const win = opts.find((o) => o.type === "win");
    if (win !== undefined) return win;
    if (this.style !== 0) {
      const riichi = opts.filter((o) => o.type === "riichi");
      if (riichi.length > 0 && this.rng.next() < 0.85) return riichi[this.rng.int(riichi.length)] as ActionOption;
      for (const t of ["ankan", "shouminkan", "minkan"]) {
        const k = opts.find((o) => o.type === t);
        if (k !== undefined && this.rng.next() < (this.style === 2 ? 0.9 : 0.3)) return k;
      }
      for (const t of ["pon", "chi"]) {
        const c = opts.filter((o) => o.type === t);
        if (c.length > 0 && this.rng.next() < (this.style === 2 ? 0.8 : 0.2)) return c[this.rng.int(c.length)] as ActionOption;
      }
    }
    const d = opts.filter((o) => o.type === "discard");
    if (d.length > 0) return d[this.rng.int(d.length)] as ActionOption;
    return opts[this.rng.int(opts.length)] as ActionOption;
  }
}

interface Res { rounds: number; scores: Record<string, number>; outcomes: string[]; crash?: string }

async function play(seed: number, style: number, mode: "hanchan" | "tonpuu"): Promise<Res> {
  const agents = SEATS.map((id, i) => new Bot(id, seed * 131 + i * 7 + 1, (style + i) % 3));
  const outcomes: string[] = [];
  let rounds = 0;
  let last: GameState | null = null;
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode, seed,
    maxWind: mode === "tonpuu" ? 1 : 2, westEntry: false,
    draftSchedules: [], extraAugments: [], agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { state: GameState } }) => { rounds++; last = g.engine.state; },
    onRoundEnd: (g: { engine: { state: GameState } }) => {
      last = g.engine.state;
      outcomes.push(`${g.engine.state.round.prevalentWind}-${g.engine.state.round.roundNumber}-${g.engine.state.round.honba}:${g.engine.state.players.map((p) => p.score).join("/")}`);
    },
  } as never);
  let crash: string | undefined;
  try { await ctrl.run(); } catch (e) { crash = e instanceof Error ? e.message : String(e); }
  const st = (ctrl.gameState ?? last) as GameState | null;
  const scores: Record<string, number> = {};
  for (const p of st?.players ?? []) scores[p.id] = p.score;
  return { rounds, scores, outcomes, ...(crash !== undefined ? { crash } : {}) };
}

let fail = 0, total = 0;
const check = (n: string, ok: boolean, note = ""): void => {
  total++; if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${note === "" ? "" : ` — ${note}`}`);
};

async function main(): Promise<void> {
  for (const seed of [11, 12, 13, 14]) {
    const a = await play(seed, 1, "hanchan");
    const b = await play(seed, 1, "hanchan");
    const same = JSON.stringify(a) === JSON.stringify(b);
    check(`결정성 seed=${seed}`, same, same ? `rounds=${a.rounds} 최종=${JSON.stringify(a.scores)}` : `A≠B`);
  }
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    for (const mode of ["hanchan", "tonpuu"] as const) {
      const r = await play(seed, 2, mode);
      const sum = Object.values(r.scores).reduce((x, y) => x + y, 0);
      const wins = r.outcomes.filter((o) => !o.endsWith("25000/25000/25000/25000")).length;
      check(`${mode} seed=${seed} 완주·총합`, r.crash === undefined && sum === 100000,
        `crash=${String(r.crash)} sum=${sum} rounds=${r.rounds} 점수변동국=${wins}`);
    }
  }
  console.log(`\n${total - fail}/${total} 통과`);
}
void main();
