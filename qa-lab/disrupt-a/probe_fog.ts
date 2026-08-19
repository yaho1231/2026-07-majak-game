/**
 * hidden_river(안개 덮인 바닥) — 뷰 수준 검증.
 *  기대 ① 선언 전에는 모두가 바닥 전부를 본다.
 *  기대 ② 선언 후 비보유자는 각 바닥의 **최근 6장만** 본다(자기 바닥은 전부).
 *  기대 ③ 보유자는 네 바닥 전부를 그대로 본다.
 *  기대 ④ 국이 끝나면 안개가 걷힌다.
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController, discardsZone } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, GameState, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";

const problems: string[] = [];
let checks = 0;
const HOLDER: PlayerId = "p2";

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  last: PlayerView | null = null;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(v: PlayerView): void { this.last = v; }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.id === HOLDER) {
      const f = o.find((x) => x.type === "declare_fog");
      if (f !== undefined) return f;
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[d.length - 1]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => new A(id));
const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed: 7, maxWind: 1, westEntry: false, draftSchedules: [],
  extraAugments: contentAugments,
  presetAugments: { p0: [], p1: [], p2: ["hidden_river"], p3: [] },
  agentDecideTimeoutMs: 20_000,
} as never, {} as never);

ctrl.addSpectator({
  id: "qa",
  sendView: () => {
    const st = ctrl.gameState as GameState | null;
    if (st === null) return;
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    const fogged = Object.entries(st.augmentData).some(
      ([k, v]) => k === `hidden_river:fog:${rk}:${HOLDER}` && v === true,
    );
    for (const a of agents) {
      const v = a.last;
      if (v === null) continue;
      for (const owner of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
        const real = st.zones[discardsZone(owner)]?.tileIds.length ?? 0;
        const z = v.zones[discardsZone(owner)];
        if (z === undefined) continue;
        const shown = z.tileIds.length;
        const hidden = z.hiddenCount;
        checks++;
        if (shown + hidden !== real) {
          problems.push(`장수 불일치 ${a.id}가 본 ${owner}: ${shown}+${hidden} != ${real}`);
        }
        const shouldFullySee = !fogged || a.id === HOLDER || a.id === owner;
        if (shouldFullySee && hidden > 0) {
          problems.push(`${fogged ? "안개중" : "안개전"} ${a.id}가 ${owner} 바닥을 못 본다 (hidden=${hidden})`);
        }
        if (!shouldFullySee && real > 6 && shown !== 6) {
          problems.push(`안개중 ${a.id}가 본 ${owner} 바닥 공개장수=${shown} (기대 6, 실제 ${real}장)`);
        }
      }
    }
  },
});

await ctrl.run().catch((e) => console.log("crash", String(e).slice(0, 100)));
const uniq = [...new Set(problems)];
console.log(`검사 ${checks}회 · 문제 ${uniq.length}종 (총 ${problems.length}건)`);
for (const p of uniq.slice(0, 20)) console.log("  " + p);
