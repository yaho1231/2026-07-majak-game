/**
 * 북풍 상인 — "첫 순에 빼면 **내** 천화·지화는 깨진다"가 실제로는
 * 테이블 전체의 첫 순(state.round.firstTurn / goAroundBroken)을 끈다.
 *
 * 확인 대상
 *  ① 다른 사람의 구종구패(kyushuKyuhai — win.firstTurn 요구)가 사라지는가
 *  ② 다른 사람의 지화(chihou — firstTurn && !goAroundBroken) 전제가 깨지는가
 *
 * 실행: ~/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_north_firstturn.ts
 */
import { handIdsOf } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft, start } from "../../score-b/scene.js";

const say = (s: string): void => {
  console.log(s);
};

/** p1 손에 요구패 9종 (구종구패 성립), p0 손에 北 */
const base = craft({
  hands: {
    p0: "4444z123m456m789m1s",
    p1: "19m19p19s123z5p6p7p8p", // 요구패 9종
    p2: "*",
    p3: "*",
  },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});

// craft는 firstTurn=false로 만든다 — 실제 국 첫 순을 재현하려고 켜 준다
const base2: GameState = { ...base, round: { ...base.round, firstTurn: true, goAroundBroken: false } };
const { game, flow } = start(base2, { p0: ["north_trader"] } as never);

const st0: GameState = game.engine.state;
say(`[초기] firstTurn=${st0.round.firstTurn} goAroundBroken=${st0.round.goAroundBroken}`);

// p1이 지금 구종구패를 선언할 수 있는가 (턴이 아니라 validate만 직접 본다)
const canKyushu = (s: GameState): string => {
  const def = game.engine.actions.get("kyushuKyuhai")!;
  const r = def.validate(
    { player: "p1", type: "kyushuKyuhai", payload: {} } as never,
    // 턴만 p1으로 돌린 상태 — 순서 문제를 지우고 '첫 순' 조건만 본다
    { state: { ...s, round: { ...s.round, turnSeat: 1 } }, rules: game.engine.rules } as never,
  );
  return r === null ? "가능" : `불가(${r})`;
};
say(`[초기] p1 구종구패 = ${canKyushu(st0)}`);

// p0이 북빼기
const north = handIdsOf(st0, "p0").find((id: TileId) => {
  const k = st0.tiles[id]!.kind;
  return k.suit === "wind" && k.rank === 4;
})!;
const res = flow.submit("p0", { type: "north_pull", payload: { tileId: north } });
say(`[북빼기] ${res.kind}`);

const st1: GameState = game.engine.state;
say(`[북빼기 후] firstTurn=${st1.round.firstTurn} goAroundBroken=${st1.round.goAroundBroken}`);
say(`[북빼기 후] p1 구종구패 = ${canKyushu(st1)}`);
say(
  `[북빼기 후] p1 지화 전제(firstTurn && !goAroundBroken) = ${
    st1.round.firstTurn && !st1.round.goAroundBroken
  }`,
);
