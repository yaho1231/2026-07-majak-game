/**
 * 기생충(parasite) 정산 수치 — "숙주가 얻는 점수의 절반(100점 단위)을 대신 가져온다,
 * 테이블 총점은 변하지 않는다".
 * p0(기생, 오야)이 p1에 붙고 p1이 첫 쯔모로 화료한다. 대조군과 비교.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";

const HAND = [
  "man2", "man3", "man4", "pin2", "pin3", "pin4",
  "sou2", "sou3", "sou4", "pin6", "pin7", "pin8",
  "sou5", "sou5",
];

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId, readonly host: PlayerId | null) { this.nickname = id; }
  sendView(_v: PlayerView): void {}
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.host !== null) {
      const m = o.find((x) => x.type === "parasite_attach" && (x.payload as { target?: string }).target === this.host);
      if (m !== undefined) return m;
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[0]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

async function run(host: PlayerId | null): Promise<void> {
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id, id === "p0" ? host : null));
  let out = "";
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "tonpuu", seed: 11, maxWind: 1, westEntry: false, draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: { p0: ["parasite"], p1: [], p2: [], p3: [] },
    presetHands: { p0: [], p1: HAND, p2: [], p3: [] },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundEnd: (g: { engine: { eventLog: { type: string; payload: unknown }[] } }) => {
      const last = [...g.engine.eventLog].reverse().find((e) => e.type === "RoundSettled");
      const p = last?.payload as { deltas?: Record<string, number>; winInfos?: { winner: string; winType: string; points: number }[]; augPoints?: unknown[] };
      const sum = Object.values(p.deltas ?? {}).reduce((a, b) => a + b, 0);
      out = `deltas=${JSON.stringify(p.deltas)} 합=${sum} win=${JSON.stringify(p.winInfos?.map((w) => [w.winner, w.winType, w.points]))} augPoints=${JSON.stringify(p.augPoints)}`;
      throw new Error("STOP");
    },
  } as never);
  try { await ctrl.run(); } catch { /* STOP */ }
  console.log(`${host === null ? "대조군  " : `기생 →${host}`} ${out}`);
}

await run(null);
await run("p1");
await run("p2");
