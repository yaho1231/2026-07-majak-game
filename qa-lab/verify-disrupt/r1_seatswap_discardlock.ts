/**
 * 재검증 1: seat_swap × discard_lock — 자리 바꿈이 봉인을 증발시키는가.
 *
 * p0(오야)가 자기 첫 순에 seal_hands → p1/p2/p3 손패의 실제 tileId를 봉인.
 * p1이 자기 첫 순에 seat_swap(target=p2) → 손패를 통째로 교환.
 * 엔진의 최종 판정 `lockedDiscardIds(state, rules, pid)` 를 교환 직전/직후로 비교한다.
 * (뷰가 아니라 엔진 판정 = 실제 버림 금지 여부다)
 *
 * 실행: tsx qa-lab/verify-disrupt/r1_seatswap_discardlock.ts [swap|noswap] [seed]
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController, lockedDiscardIds } from "@majak/core";
import type {
  ActionOption, AugmentDef, DecisionPrompt, DraftStage,
  PlayerAgent, PlayerId, PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";

const MODE = process.argv[2] ?? "swap";
const SWAP_AUG = process.argv[4] ?? "seat_swap";
const SWAP_ACT = SWAP_AUG === "full_hand_swap" ? "hand_swap" : "seat_swap";
const SEED = Number(process.argv[3] ?? 3);
const SWAPPER: PlayerId = "p1";
const TARGET: PlayerId = "p2";
const PIDS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/* eslint-disable @typescript-eslint/no-explicit-any */
let GAME: any = null;
let sealed = false;
let swapDone = false;
let steps = 0;

const lockSnap = (): Record<string, number[]> => {
  if (GAME === null) return {};
  const st = GAME.engine.state;
  return Object.fromEntries(
    PIDS.map((p) => [p, [...lockedDiscardIds(st, GAME.engine.rules, p)]]),
  );
};

class A implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(_v: PlayerView): void { /* 엔진 상태를 직접 본다 */ }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (steps < 24) {
      steps++;
      console.log(`  [${steps}] ${this.id} locks=${JSON.stringify(lockSnap())}`);
      if (GAME !== null && sealed) {
        const ad = GAME.engine.state.augmentData as Record<string, unknown>;
        const led = Object.entries(ad).filter(([k]) => k.includes("discardLockReveal"));
        console.log(`        원장부=${JSON.stringify(led)}`);
      }
    }
    if (this.id === "p0" && !sealed) {
      const s = o.find((x) => x.type === "seal_hands");
      if (s !== undefined) {
        sealed = true;
        console.log(">>> p0 seal_hands");
        return s;
      }
    }
    if (MODE === "swap" && this.id === SWAPPER && !swapDone && sealed) {
      const s = o.find(
        (x) => x.type === SWAP_ACT &&
          (x.payload as { target?: string } | undefined)?.target === TARGET,
      );
      if (s !== undefined) {
        swapDone = true;
        console.log(`>>> ${SWAPPER} seat_swap → ${TARGET}`);
        return s;
      }
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

const agents = PIDS.map((id) => new A(id));
const ctrl = new HanchanController(agents, {
  ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed: SEED, maxWind: 1,
  westEntry: false, draftSchedules: [],
  extraAugments: contentAugments,
  presetAugments: {
    p0: ["discard_lock"],
    p1: MODE === "swap" ? [SWAP_AUG] : [],
    p2: [], p3: [],
  },
  agentDecideTimeoutMs: 20_000,
} as never, { onRoundStart: (g: any) => { GAME = g; } } as never);

await ctrl.run().catch((e) => console.log("end", String(e).slice(0, 100)));
console.log(`aug=${SWAP_AUG} mode=${MODE} seed=${SEED} 봉인=${sealed} 교환=${swapDone}`);
