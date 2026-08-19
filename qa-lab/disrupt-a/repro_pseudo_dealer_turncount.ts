/**
 * 찬탈자(pseudo_dealer)가 round.turnCount(순 카운터)를 어긋나게 하는가.
 *
 * turnCount는 "오야가 뽑을 때만 +1" 로 한 바퀴(1순)를 센다(flowEvents.ts TILE_DRAWN).
 * 찬탈자는 국 도중에 round.dealerSeat를 보유자 자리로 옮기므로, 옮긴 국에서는
 *  - 원래 오야가 이미 그 바퀴에 뽑아 +1 → 새 오야(보유자)가 같은 바퀴에 또 뽑아 +1  (한 바퀴에 2순)
 *  - 또는 반대 방향이면 한 바퀴 통째로 +0
 * 이 된다. 6순 창(박무·후로 봉인)과 "첫 순"(통째로 바꾸기 turnCount<=1) 판정이 이 값을 쓴다.
 */
import { HanchanController, DEFAULT_HANCHAN_CONFIG, Prng, playerAtSeat } from "@majak/core";
import type { GameState, PlayerId, ActionOption, DecisionPrompt, PlayerView, AugmentDef, DraftStage, PlayerAgent } from "@majak/core";
import { contentAugments } from "@majak/content";

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  private rng: Prng;
  constructor(readonly id: PlayerId, readonly claimer: boolean, seed: number) {
    this.nickname = id;
    this.rng = new Prng(seed);
  }
  sendView(): void {}
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.claimer) {
      const c = o.find((x) => x.type === "claim_dealer");
      if (c !== undefined) return c;
    }
    const w = o.find((x) => x.type === "win");
    if (w !== undefined) return w;
    const pass = o.find((x) => x.type === "pass");
    if (pass !== undefined) return pass;
    const d = o.filter((x) => x.type === "discard");
    if (d.length > 0) return d[this.rng.int(d.length)]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}

const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id, i) => new A(id, id === "p2", 99 + i));

// 국 단위 로그: (뽑은 사람 자리, 그 시점 dealerSeat, turnCount)
let log: string[] = [];
let dealerSeatAtStart = -1;
let usurped = false;
let done = false;

const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG,
  mode: "tonpuu",
  seed: 5,
  maxWind: 1,
  westEntry: false,
  draftSchedules: [],
  extraAugments: contentAugments,
  presetAugments: { p0: [], p1: [], p2: ["pseudo_dealer"], p3: [] },
  agentDecideTimeoutMs: 20_000,
} as never, {} as never);

let lastTc = -1;
let lastLen = 0;
ctrl.addSpectator({
  id: "qa",
  sendView: () => {
    const st = ctrl.gameState as GameState | null;
    if (st === null || done) return;
    if (st.round.roundNumber !== 1 || st.round.honba !== 0) return;
    if (dealerSeatAtStart < 0) dealerSeatAtStart = st.round.dealerSeat;
    if (st.round.phase !== "turn.act") return;
    const seat = st.round.turnSeat;
    const tc = st.round.turnCount;
    const key = `seat${seat} dealerSeat=${st.round.dealerSeat} turnCount=${tc}`;
    if (log[log.length - 1] === key) return;
    log.push(key);
    if (st.round.dealerSeat !== dealerSeatAtStart) usurped = true;
    if (usurped && log.length > lastLen + 12) done = true;
    void lastTc;
  },
});

await ctrl.run().catch((e) => console.log("end:", String(e).slice(0, 80)));
console.log("동1국 진행 (자리별 쯔모 순서 / 그 시점 오야자리 / 순 카운터):");
for (const l of log.slice(0, 40)) console.log("  " + l);
