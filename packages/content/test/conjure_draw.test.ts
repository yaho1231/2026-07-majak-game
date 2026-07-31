/**
 * 소환 (conjure_draw) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴(turn.act)에 손패 1장을 지목하면 그 종류가 목표로 대기열에 오르고,
 *     게임당 1회 소진 플래그가 선다. 발동 내용은 전원 공개.
 *  2. 다음 내 정상 쯔모가 그 목표 패로 물질화된다(conjured) — 뽑은 실물 패의 kind만
 *     바뀌고 손패 장수는 그대로. 대기열은 소비 즉시 비워진다.
 *  3. 게임당 1회 — 이미 소진했으면 다시 제시되지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import { conjureDraw } from "../src/augments/conjure_draw.js";

function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, conjureDraw, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

/** 소환 예약 키는 국 스코프다 (소비 전에 국이 끝나면 자동 만료) */
const pendingFor = (st: GameState): string =>
  `conjure_draw:pending:${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}:p0`;
/** 국 스코프 사용 플래그 키 (roundKey 포함) */
const usedKeyOf = (state: GameState): string => {
  const r = state.round;
  return `conjure_draw:used:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0`;
};

describe("소환 (conjure_draw)", () => {
  it("자기 턴에 손패 1장을 지목하면 목표가 대기열에 오르고 게임당 1회가 소진된다", () => {
    const base = craft({
      hands: { p0: "112233m456p789s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { game, flow, status } = startFlow(withAugments(base, "p0", ["conjure_draw"]));

    const prompt = status.prompts.find((p) => p.player === "p0");
    const opts = prompt?.options.filter((o) => o.type === "conjure_tsumo") ?? [];
    expect(opts.length).toBeGreaterThan(0);
    // 손패 종류당 하나만 제시 (1m/2m/3m 중복 없음)
    expect(opts.length).toBe(
      new Set(opts.map((o) => JSON.stringify(o.payload))).size,
    );

    const opt = opts[0]!;
    const tileId = (opt.payload as { tileId: TileId }).tileId;
    const expectedKind = kindOf(game.engine.state, tileId);

    flow.submit("p0", opt);
    const st = game.engine.state;
    expect(st.augmentData[pendingFor(st)]).toEqual({
      suit: expectedKind.suit,
      rank: expectedKind.rank,
    });
    expect(st.augmentData[usedKeyOf(st)]).toBe(true);
    // 무엇을 불렀는지 전원 공개
    expect(st.augmentData[`view:*:conjure_draw:p0#round`]).toBe(kindKey(expectedKind));
  });

  it("다음 정상 쯔모가 지목한 패로 물질화된다(conjured), 대기열은 비워진다", () => {
    // 대기 목표를 中(dragon 3)으로 미리 세팅하고, p3의 버림 뒤 p0가 자연 쯔모하게 몬다.
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 3,
      drawnLastFor: "p3",
    });
    const CHUN: TileKind = { suit: "dragon", rank: 3 };
    const primed: GameState = {
      ...withAugments(base, "p0", ["conjure_draw"]),
      augmentData: { [pendingFor(base)]: CHUN },
    };
    const { game, flow, status: begun } = startFlow(primed);

    // p3가 쯔모패를 버린다
    const p3drawn = game.engine.state.round.lastDrawnTile as TileId;
    let status = flow.submit("p3", { type: "discard", payload: { tileId: p3drawn } });

    // 리액션(펑·치·론) 프롬프트는 전부 패스 → 턴이 p0에게 넘어가 자연 쯔모
    for (let i = 0; i < 8 && status.kind === "awaiting"; i++) {
      const pr = status.prompts[0];
      if (pr === undefined) break;
      const hasPass = pr.options.some((o) => o.type === "pass");
      if (!hasPass) break; // p0의 턴 프롬프트에 도달 (쯔모 완료)
      status = flow.submit(pr.player, { type: "pass", payload: {} });
    }

    const st = game.engine.state;
    expect(st.round.turnSeat).toBe(0); // 이제 p0 차례
    const drawn = st.round.lastDrawnTile as TileId;
    const tile = st.tiles[drawn]!;
    // 방금 뽑은 패가 中으로 변신 + conjured 표식
    expect(tile.kind).toEqual(CHUN);
    expect(tile.attrs.conjured).toBe(true);
    // 대기열은 소비되어 비워졌다
    expect(st.augmentData[pendingFor(st)]).toBeNull();
    // begun은 p3 턴이었다 (몰이 시작점 확인)
    expect(begun.prompts.some((p) => p.player === "p3")).toBe(true);
  });

  it("게임당 1회 — 이미 소진했으면 다시 제시되지 않는다", () => {
    const base = craft({
      hands: { p0: "112233m456p789s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const used: GameState = {
      ...withAugments(base, "p0", ["conjure_draw"]),
      augmentData: { [usedKeyOf(base)]: true },
    };
    const { status } = startFlow(used);
    const prompt = status.prompts.find((p) => p.player === "p0");
    expect(prompt?.options.filter((o) => o.type === "conjure_tsumo")).toHaveLength(0);
  });
});
