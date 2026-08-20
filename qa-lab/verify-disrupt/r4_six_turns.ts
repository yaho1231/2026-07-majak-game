/**
 * 재검증 4: 함구령(call_seal)·박무(brief_fog)의 "6순"이 후로가 끼면 실제 몇 바퀴인가.
 *
 * 두 증강의 활성 판정은 `round.turnCount - 선언순 < 6`이다. `turnCount`는
 * **오야가 쯔모할 때만** +1 한다(flowEvents.ts:402). 남이 오야의 버림을 울면 오야의
 * 쯔모가 건너뛰어져 그 바퀴는 세지 않는다.
 *
 * 측정: 선언 시점의 테이블 총 버림 수 → 창이 닫히는 시점의 총 버림 수.
 * 6순이면 이상적으로 24장(4인 × 6바퀴)이 지나가야 한다.
 *
 * 실행: tsx qa-lab/verify-disrupt/r4_six_turns.ts <매치수> [call|nocall]
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type {
  ActionOption, AugmentDef, DecisionPrompt, DraftStage,
  PlayerAgent, PlayerId, PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";

const N = Number(process.argv[2] ?? 20);
const CALLERS = (process.argv[3] ?? "call") === "call";
const AUG = process.argv[4] ?? "brief_fog";
const ACT = AUG === "call_seal" ? "call_seal_use" : "declare_brief_fog";
const HOLDER: PlayerId = "p0";
/* eslint-disable @typescript-eslint/no-explicit-any */

interface Window { declaredTurn: number; discardsAtStart: number; }
const samples: { turns: number; discards: number; calls: number }[] = [];

let GAME: any = null;
let win: Window | null = null;
let callsAtStart = 0;
let done = false;

const totalDiscards = (st: any): number =>
  (st.players as any[]).reduce(
    (s, p) => s + (st.round.byPlayer[p.id]?.discardCount ?? 0), 0);
const totalCalls = (st: any): number =>
  (st.players as any[]).reduce(
    (s, p) => s + (st.round.byPlayer[p.id]?.melds?.length ?? 0), 0);

function sample(): void {
  if (GAME === null) return;
  const st = GAME.engine.state;
  const k = Object.keys(st.augmentData).find(
    (x) => x.startsWith(`${AUG}:turn:`) && x.includes(HOLDER));
  const declared = k === undefined ? undefined : st.augmentData[k];
  if (typeof declared !== "number") return;
  if (done) return;
  if (win === null) {
    if (GAME.engine.state.round.turnCount - declared >= 6) { done = true; return; }
    win = { declaredTurn: declared, discardsAtStart: totalDiscards(st) };
    callsAtStart = totalCalls(st);
    return;
  }
  if (st.round.turnCount - win.declaredTurn >= 6) {
    samples.push({
      turns: st.round.turnCount - win.declaredTurn,
      discards: totalDiscards(st) - win.discardsAtStart,
      calls: totalCalls(st) - callsAtStart,
    });
    win = null;
    done = true;
  }
}

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(_v: PlayerView): void { sample(); }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    sample();
    const o = p.options;
    if (this.id === HOLDER) {
      const s = o.find((x) => x.type === ACT);
      if (s !== undefined) return s;
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    if (CALLERS && this.id !== HOLDER) {
      const c = o.find((x) => x.type === "pon" || x.type === "chi" || x.type === "kan");
      if (c !== undefined) return c;
    }
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[Math.min(d.length - 1, 0)]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

for (let seed = 1; seed <= N; seed++) {
  win = null; done = false;
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id));
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed, maxWind: 1, westEntry: false,
    draftSchedules: [], extraAugments: contentAugments,
    presetAugments: { p0: [AUG], p1: [], p2: [], p3: [] },
    agentDecideTimeoutMs: 20_000,
  } as never, { onRoundStart: (g: any) => { GAME = g; win = null; done = false; } } as never);
  await ctrl.run().catch(() => { /* ignore */ });
}

const n = samples.length;
const avgD = samples.reduce((s, x) => s + x.discards, 0) / Math.max(1, n);
const avgC = samples.reduce((s, x) => s + x.calls, 0) / Math.max(1, n);
const rounds = samples.map((x) => x.discards / 4).sort((a, b) => a - b);
console.log(`증강=${AUG} 모드=${CALLERS ? "울보 3인" : "울지 않음"}  창 표본 ${n}개`);
console.log(`  창 동안 지나간 버림: 평균 ${avgD.toFixed(1)}장 = ${(avgD / 4).toFixed(2)}바퀴 (이상 6.00)`);
console.log(`  창 동안 일어난 후로: 평균 ${avgC.toFixed(2)}회`);
if (n > 0) {
  console.log(`  바퀴 분포: 최소 ${rounds[0]!.toFixed(2)} / 중앙 ${rounds[Math.floor(n / 2)]!.toFixed(2)} / 최대 ${rounds[n - 1]!.toFixed(2)}`);
  console.log(`  7바퀴 이상 간 창: ${rounds.filter((r) => r >= 7).length}/${n}`);
}
