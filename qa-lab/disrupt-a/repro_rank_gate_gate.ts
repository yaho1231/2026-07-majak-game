/**
 * rank_gate(격) — 지목당한 사람의 싼 손이 정말 막히는가 / 자물쇠가 뜨는가.
 * 강제 배패: p1은 탕야오 단기 텐파이 + 첫 쯔모로 화료패(sou5).
 * p0(격 보유, 오야)가 첫 순에 p1을 지목한다.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";

const P1_HAND = [
  "man2", "man3", "man4",
  "pin2", "pin3", "pin4",
  "sou2", "sou3", "sou4",
  "pin6", "pin7", "pin8",
  "sou5",   // 13번째 — 단기 대기
  "sou5",   // 14번째 = 첫 쯔모 (화료패)
];

const log: string[] = [];

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId, readonly mark: boolean) { this.nickname = id; }
  sendView(_v: PlayerView): void {}
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    const locked = (p as { locked?: { type: string; reason: string; minHan?: number }[] }).locked;
    if (this.id === "p1") log.push(`[p1] 프롬프트 opts=${o.map((x) => x.type).join(",")}`);
    if (locked !== undefined && locked.length > 0) {
      log.push(`[${this.id}] 자물쇠: ${JSON.stringify(locked)}`);
    }
    if (this.mark) {
      const m = o.find((x) => x.type === "rank_gate_mark" && (x.payload as { target?: string }).target === "p1");
      if (m !== undefined) { log.push("[p0] 격 지목 → p1"); return m; }
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) { log.push(`[${this.id}] 화료! (프롬프트: ${o.map((x) => x.type).join(",")})`); return w; }
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[0]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

async function run(withGate: boolean): Promise<void> {
  log.length = 0;
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id, withGate && id === "p0"));
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "tonpuu", seed: 11, maxWind: 1, westEntry: false, draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: { p0: withGate ? ["rank_gate"] : [], p1: [], p2: [], p3: [] },
    presetHands: { p0: [], p1: P1_HAND, p2: [], p3: [] },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundEnd: (g: { engine: { eventLog: { type: string; payload: unknown }[] } }) => {
      const last = [...g.engine.eventLog].reverse().find((e) => e.type === "RoundSettled");
      const p = last?.payload as { outcome?: string; winInfos?: { winner: string; han: number }[] } | undefined;
      log.push(`정산: outcome=${p?.outcome} wins=${JSON.stringify(p?.winInfos)}`);
      throw new Error("STOP");
    },
  } as never);
  try { await ctrl.run(); } catch { /* STOP */ }
  console.log(`\n=== ${withGate ? "격 지목 있음" : "대조군(격 없음)"} ===`);
  for (const l of log.slice(0, 20)) console.log("  " + l);
}

await run(false);
await run(true);
