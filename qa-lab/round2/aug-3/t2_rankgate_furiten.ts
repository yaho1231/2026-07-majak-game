/**
 * H2 — 격(rank_gate)에 지목당한 사람이 "5판 미만이라 론이 잠긴" 패에 대해
 * 그대로 **후리텐 처리**를 받는가.
 *
 * 코어는 win.ronImmune(천하무적·불가침 조약)일 때는 markPassFuriten을 통째로
 * 건너뛴다 — "규칙이 론을 막았으면 넘긴 화료가 없다"(FlowController.markPassFuriten).
 * win.minHan(격)에는 같은 예외가 없다.
 */
import { runFocus } from "./focus.js";

// 프롬프트의 locked를 보려면 에이전트를 직접 감싸야 한다 → focus의 prefer만으로는 부족.
// 대신 이벤트 로그의 FuritenMarked 와, 같은 순간의 상태를 대조한다.
import { HanchanController, DEFAULT_HANCHAN_CONFIG, Prng } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

interface Hit { seed: number; player: string; round: string; permanent: boolean; minHan: number }
const hits: Hit[] = [];
let lockedSeen = 0;

class A implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  constructor(readonly id: PlayerId, seed: number, private readonly riichi: boolean, private readonly mark: boolean) {
    this.nickname = id; this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  /** 방금 "minHan으로 잠긴 론"을 본 사람 (전역, 라운드키와 함께) */
  static lastLocked = new Map<string, { minHan: number; at: number }>();
  static tick = 0;
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const locked = (p as unknown as { locked?: { type: string; reason: string; minHan?: number }[] }).locked ?? [];
    for (const l of locked) {
      if (l.type === "win" && l.reason === "minHan") {
        lockedSeen++;
        A.lastLocked.set(this.id, { minHan: l.minHan ?? 0, at: A.tick });
      }
    }
    const o = p.options;
    if (this.mark) {
      const m = o.find((x) => x.type === "rank_gate_mark");
      if (m !== undefined) return m;
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    if (this.riichi) {
      const r = o.find((x) => x.type === "riichi");
      if (r !== undefined) return r;
    }
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[this.rng.int(d.length)] as ActionOption;
    return o[this.rng.int(o.length)] as ActionOption;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return (c[0] as AugmentDef).id; }
}

for (let seed = 1; seed <= 80; seed++) {
  const agents = SEATS.map((id, i) => new A(id, seed * 131 + i, id !== "p0", id === "p0"));
  A.lastLocked.clear();
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG, mode: "hanchan", seed, maxWind: 2, westEntry: false,
    draftSchedules: [], extraAugments: contentAugments,
    presetAugments: { p0: ["rank_gate"], p1: [], p2: [], p3: [] },
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onEvent: (j: string) => {
      A.tick++;
      const e = JSON.parse(j) as { type: string; payload: Record<string, unknown> };
      if (e.type !== "FuritenMarked") return;
      const st = ctrl.gameState;
      if (st === null) return;
      const pid = String(e.payload["player"]);
      const seen = A.lastLocked.get(pid);
      // 같은 리액션 창에서 본 잠금인지 — tick 차이가 아주 작을 때만 센다
      if (seen === undefined || A.tick - seen.at > 12) return;
      hits.push({
        seed, player: pid,
        round: `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`,
        permanent: e.payload["permanent"] === true,
        minHan: seen.minHan,
      });
      A.lastLocked.delete(pid);
    },
  } as never);
  try { await ctrl.run(); } catch (e) { console.log(`seed=${seed} ERR ${String(e)}`); }
}
console.log(`lockedPrompts=${lockedSeen} furitenAfterLockedWin=${hits.length}`);
for (const h of hits.slice(0, 15)) console.log(JSON.stringify(h));
