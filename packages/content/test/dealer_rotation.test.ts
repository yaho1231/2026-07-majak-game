/**
 * 오야 로테이션 기준 자리 (round.rotationSeat) 회귀 테스트.
 *
 * 국 번호는 무조건 +1로 오르는데 다음 오야를 **그 국의 실제 오야** 기준으로
 * 정하면, 오야 자리를 옮기는 증강(찬탈자·만년 오야)이 한 번 개입한 것만으로
 * 로테이션이 통째로 어긋난다 — 어떤 자리는 오야를 두 번 하고 어떤 자리는
 * 한 번도 못 한다. 로테이션은 `rotationSeat`(증강이 건드리지 않는 기준 자리)를
 * 따라 돌아야 한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  createZone,
  installAugment,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "./helpers.js";
import { pseudoDealer } from "../src/augments/pseudo_dealer.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 패산을 비우고 유국 정산 직전(turn.draw)으로 맞춘 상태 */
function drawnOutState(
  base: GameState,
  round: Partial<GameState["round"]> = {},
): GameState {
  return {
    ...base,
    zones: { ...base.zones, [WALL]: createZone(WALL, "wall") },
    round: { ...base.round, phase: "turn.draw", ...round },
  };
}

function emptyTable(): GameState {
  // 전원 노텐(점수 이동 없음) — 로테이션만 본다
  const noten = "147m147p147s1234z";
  return craft({
    hands: { p0: noten, p1: noten, p2: noten, p3: noten },
    phase: "turn.draw",
    turnSeat: 0,
  });
}

/** 유국으로 국을 끝내고 정산 후 round 상태를 돌려준다 */
function settleDraw(state: GameState): GameState {
  const game: Game = createStandardGameFromState(state);
  const res = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleDraw",
    payload: {},
  });
  if (!res.ok) throw new Error(`settleDraw failed: ${res.reason}`);
  return game.engine.state;
}

describe("오야 로테이션 기준 자리", () => {
  it("증강 개입이 없으면 한 장(4국) 동안 네 자리가 한 번씩 오야를 맡는다", () => {
    let st = drawnOutState(emptyTable());
    const dealers: number[] = [st.round.dealerSeat];
    for (let i = 0; i < 3; i++) {
      st = drawnOutState(settleDraw(st));
      dealers.push(st.round.dealerSeat);
    }
    expect(dealers).toEqual([0, 1, 2, 3]);
  });

  it("찬탈자가 오야를 빼앗아도 로테이션은 원래 기준 자리에서 이어진다", () => {
    // p2(자리 2)가 동1국에 오야를 강탈한다
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "123m456p789s11z22z", p3: "*" },
      phase: "turn.act",
      turnSeat: 2,
    });
    const withAug: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p2" ? { ...p, augments: [...p.augments, "pseudo_dealer"] } : p,
      ),
    };
    const game = createStandardGameFromState(withAug);
    installAugment(game.engine, pseudoDealer, "p2", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p2", { type: "claim_dealer", payload: {} });
    const stolen = game.engine.state;
    expect(stolen.round.dealerSeat).toBe(2); // 오야 자리는 진짜로 넘어갔다
    expect(stolen.round.rotationSeat).toBe(0); // 로테이션 기준은 그대로 동1국의 자리 0

    // 전원 노텐 유국 → 동2국. 오야는 로테이션 기준(0)의 다음 자리인 1이어야 한다.
    // (강탈 자리 2를 기준으로 돌리면 자리 3이 되고, 자리 1은 이 장에서 오야를 못 한다.)
    const noten = emptyTable();
    let st = drawnOutState({
      ...noten,
      round: { ...noten.round, dealerSeat: 2, rotationSeat: 0 },
    });
    const dealers: number[] = [];
    for (let i = 0; i < 3; i++) {
      st = drawnOutState(settleDraw(st));
      dealers.push(st.round.dealerSeat);
    }
    expect(dealers).toEqual([1, 2, 3]);
  });

  it("연장(오야 텐파이)은 로테이션 기준을 소모하지 않는다", () => {
    // 오야 자리가 2로 옮겨진 상태(기준은 0)에서 그 오야가 텐파이로 유국 → 연장
    const tenpaiDealer = craft({
      hands: {
        // p2만 텐파이(1p 단기), 나머지는 3면자 + 자패 흩어짐 = 노텐
        p0: "147p258p369p1234z",
        p1: "147p258p369p1234z",
        p2: "123m456m789m123s1p",
        p3: "147p258p369p1234z",
      },
      phase: "turn.draw",
      turnSeat: 2,
    });
    const st1 = settleDraw(
      drawnOutState({
        ...tenpaiDealer,
        round: { ...tenpaiDealer.round, dealerSeat: 2, rotationSeat: 0 },
      }),
    );
    expect(st1.round.dealerSeat).toBe(2); // 연장 — 오야 유지
    expect(st1.round.roundNumber).toBe(1);
    expect(st1.round.rotationSeat).toBe(0); // 기준 자리는 소모되지 않는다

    // 연장이 끝나면 기준 자리의 다음(1)에서 이어진다
    const noten = emptyTable();
    const st2 = settleDraw(
      drawnOutState({
        ...noten,
        round: { ...noten.round, dealerSeat: 2, rotationSeat: 0, roundNumber: 1 },
      }),
    );
    expect(st2.round.dealerSeat).toBe(1);
    expect(st2.round.roundNumber).toBe(2);
  });

  it("장이 넘어가도 기준 자리가 이어져 남장에서도 네 자리가 한 번씩 오야를 맡는다", () => {
    const noten = emptyTable();
    let st = drawnOutState({
      ...noten,
      round: { ...noten.round, roundNumber: 4, dealerSeat: 3, rotationSeat: 3 },
    });
    st = drawnOutState(settleDraw(st));
    expect(st.round.prevalentWind).toBe(2);
    expect(st.round.roundNumber).toBe(1);
    expect(st.round.dealerSeat).toBe(0);
    const dealers: number[] = [st.round.dealerSeat];
    for (let i = 0; i < 3; i++) {
      st = drawnOutState(settleDraw(st));
      dealers.push(st.round.dealerSeat);
    }
    expect(dealers).toEqual([0, 1, 2, 3]);
  });
});
