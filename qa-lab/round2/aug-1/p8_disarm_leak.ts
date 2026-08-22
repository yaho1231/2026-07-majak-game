/**
 * 무장해제(disarm) — "국이 끝나면 증강도 원래대로 돌아온다"가 지켜지는가.
 *
 * 시나리오: 무장해제 보유자 둘(p0·p2).
 *   ① p0가 p1의 증강을 잠근다
 *   ② p2가 **p0의 무장해제**를 잠근다
 *   ③ 국 종료(ROUND_SETTLED) — p0의 해제 리액션은 자기 source가 잠겨 있어 돌지 않는다
 * 기대: 국이 끝나면 DISARMED_SOURCES_KEY 가 빈다.
 * 실제: ?
 */
import {
  DISARMED_SOURCES_KEY,
  ROUND_SETTLED,
  augmentInstanceId,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const disarm = A.get("disarm") as AugmentDef;
const victimAug = A.get("always_tenpai") as AugmentDef;

const base = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const state: GameState = {
  ...base,
  players: base.players.map((p) => ({
    ...p,
    augments:
      p.id === "p0" || p.id === "p2" ? ["disarm"] : p.id === "p1" ? ["always_tenpai"] : [],
  })),
};
const game = createStandardGameFromState(state, undefined, [disarm, victimAug]);
installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
installAugment(game.engine, victimAug, "p1", { yaku: game.yaku });
installAugment(game.engine, disarm, "p2", { yaku: game.yaku });

// 국 종료 이벤트를 흘려보내는 임시 액션 (리액션까지 실제 파이프라인을 탄다)
game.engine.actions.register({
  type: "qa.settle",
  validate: () => null,
  toEvents: (_req, { state: st }) => [
    {
      type: ROUND_SETTLED,
      payload: {
        outcome: "draw",
        deltas: { p0: 0, p1: 0, p2: 0, p3: 0 },
        dealerSeat: st.round.dealerSeat,
        honba: st.round.honba + 1,
        riichiPot: st.round.riichiPot,
        roundNumber: st.round.roundNumber,
        prevalentWind: st.round.prevalentWind,
        tenpaiPlayers: ["p0", "p1", "p2", "p3"] as PlayerId[],
      },
    },
  ],
} as never);

const show = (tag: string): void => {
  const v = game.engine.state.augmentData[DISARMED_SOURCES_KEY];
  console.log(`${tag}: ${JSON.stringify(v ?? [])}`);
};

// 턴 자리를 p0으로 맞추고 잠근다
let r = game.engine.submit({
  player: "p0",
  type: "disarm_lock",
  payload: { target: "p1", augmentId: "always_tenpai" },
} as never);
console.log(`① p0 → p1.always_tenpai : ok=${r.ok}${r.ok ? "" : ` (${JSON.stringify(r)})`}`);
show("  disarmed");

// p2 차례로 옮긴다
game.engine.reducers.register("qa.SetTurn", (st, ev) => ({
  ...st,
  round: { ...st.round, turnSeat: (ev.payload as { seat: number }).seat },
}));
game.engine.actions.register({
  type: "qa.setTurn",
  validate: () => null,
  toEvents: (req: { payload: unknown }) => [{ type: "qa.SetTurn", payload: req.payload }],
} as never);
game.engine.submit({ player: "p0", type: "qa.setTurn", payload: { seat: 2 } } as never);

r = game.engine.submit({
  player: "p2",
  type: "disarm_lock",
  payload: { target: "p0", augmentId: "disarm" },
} as never);
console.log(`② p2 → p0.disarm : ok=${r.ok}${r.ok ? "" : ` (${JSON.stringify(r)})`}`);
show("  disarmed");

r = game.engine.submit({ player: "p0", type: "qa.settle", payload: {} } as never);
console.log(`③ 국 종료 : ok=${r.ok}`);
show("  disarmed(국 종료 뒤)");

const left = (game.engine.state.augmentData[DISARMED_SOURCES_KEY] ?? []) as string[];
const stuck = left.includes(augmentInstanceId("p1", "always_tenpai"));
console.log(
  stuck
    ? `❌ p1의 always_tenpai 가 국이 끝나도 잠긴 채 남았다 — 매치 끝까지 복구되지 않는다`
    : `OK — 전부 복구됨`,
);

/*
 * 실제 게임은 다음 국 시작(setupRound)에서 **국 스코프 키를 통째로 지운다**.
 * disarm의 `locked` 목록도 국 스코프라 그때 사라진다 — 그러면 다음 국 종료에도
 * `locked.length === 0`이라 해제 리액션이 아무것도 되돌리지 않는다.
 */
game.engine.reducers.register("qa.WipeRoundScoped", (st) => {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st.augmentData)) {
    if (!k.endsWith("#round")) next[k] = v;
  }
  return { ...st, augmentData: next };
});
game.engine.actions.register({
  type: "qa.wipe",
  validate: () => null,
  toEvents: () => [{ type: "qa.WipeRoundScoped", payload: {} }],
} as never);
game.engine.submit({ player: "p0", type: "qa.wipe", payload: {} } as never);
show("  disarmed(다음 국 setupRound 뒤)");
game.engine.submit({ player: "p0", type: "qa.settle", payload: {} } as never);
show("  disarmed(그 국도 끝난 뒤)");
game.engine.submit({ player: "p0", type: "qa.wipe", payload: {} } as never);
game.engine.submit({ player: "p0", type: "qa.settle", payload: {} } as never);
show("  disarmed(두 국 더 지난 뒤)");
