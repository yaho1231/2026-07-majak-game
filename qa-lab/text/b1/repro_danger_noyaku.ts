/**
 * 지뢰 탐지(danger_sense) — "지금 버리면 상대에게 쏘이는 패".
 * 역이 없어 **론 자체가 불가능한** 후로 텐파이 상대의 대기까지 위험으로 칠하는가?
 * (같은 파일이 후리텐 상대는 "오탐은 능력값의 손실"이라며 일부러 뺐다 — 기준이 반쪽이다.)
 */
import { FlowController, createStandardGameFromState, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { dangerSense } from "../../../packages/content/src/augments/danger_sense.js";

const SOU2 = kindKey({ suit: "sou", rank: 2 });
const key = (s: GameState, t: number): string => kindKey(s.tiles[t]!.kind);

function give(state: GameState, player: PlayerId, id: string): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, augments: [...p.augments, id] } : p)) };
}

let s = craft({
  hands: {
    p0: "2s119m119p117z34s",          // 14장 — 2s를 들고 있다
    p1: "123m456p55s34s",             // 후로 1개 + 10장 = 2s/5s 대기, 역 없음
    p2: "*",
    p3: "*",
  },
  melds: { p1: [{ kind: "chi", spec: "789m", from: "p0" }] },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
s = give(s, "p0", "danger_sense");
const game = createStandardGameFromState(s);
installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let cur: any = flow.begin();
cur = flow.submit("p0", { type: "danger_sense_use", payload: {} });
const v = game.engine.state.augmentData["view:p0:danger_sense#round"] as { kinds: string[] };
console.log(`지뢰 탐지 결과 = ${JSON.stringify(v.kinds)}  → 2s를 위험으로 표시? ${v.kinds.includes(SOU2)}`);

// 실제로 2s를 버려 보면 p1이 론할 수 있는가?
const st: GameState = game.engine.state;
const two = st.zones["hand:p0"]!.tileIds.find((t) => key(st, t) === SOU2)!;
cur = flow.submit("p0", { type: "discard", payload: { tileId: two } });
const p1 = cur.prompts?.find((p: any) => p.player === "p1");
console.log(`2s를 버린 뒤 p1 옵션 = ${JSON.stringify(p1?.options.map((o: any) => o.type))} → 실제 론 가능=${p1?.options.some((o: any) => o.type === "win") ?? false}`);
