/**
 * 덤터기(scapegoat) 정산 수치 — "내가 받는 점수는 그대로, 누가 내느냐만 바뀐다".
 * p0(오야, 덤터기)이 첫 쯔모로 화료. 대조군(지목 없음)과 지목군(p2 지목)을 비교한다.
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
  constructor(readonly id: PlayerId, readonly mark: PlayerId | null) { this.nickname = id; }
  sendView(_v: PlayerView): void {}
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.mark !== null) {
      const m = o.find((x) => x.type === "scapegoat_mark" && (x.payload as { target?: string }).target === this.mark);
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

async function run(mark: PlayerId | null): Promise<void> {
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id, id === "p0" ? mark : null));
  let out = "";
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "tonpuu", seed: 11, maxWind: 1, westEntry: false, draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: { p0: ["scapegoat"], p1: [], p2: [], p3: [] },
    presetHands: { p0: HAND, p1: [], p2: [], p3: [] },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundEnd: (g: { engine: { eventLog: { type: string; payload: unknown }[] } }) => {
      const last = [...g.engine.eventLog].reverse().find((e) => e.type === "RoundSettled");
      const p = last?.payload as { deltas?: Record<string, number>; winInfos?: { winner: string; winType: string; han: number; points: number }[]; augPoints?: unknown[] };
      out = `deltas=${JSON.stringify(p.deltas)} win=${JSON.stringify(p.winInfos?.map((w) => [w.winner, w.winType, w.han, w.points]))} augPoints=${JSON.stringify(p.augPoints)}`;
      throw new Error("STOP");
    },
  } as never);
  try { await ctrl.run(); } catch { /* STOP */ }
  console.log(`${mark === null ? "대조군      " : `지목 ${mark}   `} ${out}`);
}

await run(null);
await run("p2");
await run("p1");
