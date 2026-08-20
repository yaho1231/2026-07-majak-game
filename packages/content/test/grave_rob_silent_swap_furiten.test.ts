/**
 * 무덤 도굴(grave_rob)·정적의 손(silent_swap) — 주운 패로 나는 화료의 후리텐 계약.
 *
 * 두 증강 다 바닥의 패를 손으로 가져와 `lastDrawnTile`로 만든다. 이름만 쯔모일 뿐
 * 실체는 **남이 버린 패로 나는 것**이라, 날치기(pond_snatch)와 같이 후리텐이면
 * 화료할 수 없어야 한다(코어 규칙 `win.tsumoFuriten`). 예전에는 그 모디파이어가
 * 없어 후리텐 플레이어가 바닥에서 오름패를 파내 멘젠쯔모로 나고 상대 셋이 전부
 * 지불했다(qa-lab/findings/hand-a.md 확정 1·2).
 *
 * 정적의 손은 여기에 더해 **자기 바닥이 대상에서 빠졌다**(2026-08-20 사용자 설계 변경).
 * 자기 바닥이 후보에 있으면 "방금 버린 내 오름패를 도로 집는다"가 가장 쉬운 사용법이 된다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  installAugment,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { silentSwap } from "../src/augments/silent_swap.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugment(state: GameState, id: string, player: PlayerId): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [id] } : p,
    ),
  };
}

/**
 * p0: 123m456m789m123p + 3만 단기 대기 (쯔모패 9통은 불필요).
 * p1의 바닥에 3만이 깔려 있다.
 * @param furiten p0가 3만을 이미 버렸는가
 */
function scene(id: string, furiten: boolean): GameState {
  return withAugment(
    craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: {
        p0: furiten ? "3m1z" : "1z",
        p1: "2z3z3m",
        p2: "5z",
        p3: "6z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    id,
    "p0",
  );
}

function start(state: GameState, aug: AugmentDef): { game: Game; flow: FlowController } {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow };
}

function promptOptions(
  flow: FlowController,
  status: ReturnType<FlowController["begin"]>,
): { type: string; payload?: unknown }[] {
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

/** 그 바닥에 있는 3만의 tile id */
function pondThreeMan(state: GameState, owner: PlayerId): TileId {
  const ids = state.zones[discardsZone(owner)]?.tileIds ?? [];
  const found = ids.find((id) => {
    const k = kindOf(state, id);
    return k.suit === "man" && k.rank === 3;
  });
  if (found === undefined) throw new Error(`${owner} pond has no 3m`);
  return found;
}

function winValidate(game: Game): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player: "p0", type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

describe("무덤 도굴 — 파낸 패로 나는 화료", () => {
  it("후리텐이 아니면 파낸 패로 쯔모 화료할 수 있다 (기준선)", () => {
    const { game, flow } = start(scene("grave_rob", false), graveRob);
    const graveId = pondThreeMan(game.engine.state, "p1");
    // 후보로 제시된 옵션을 그대로 낸다 (payload 키 순서까지 FlowController가 대조한다)
    const offered = promptOptions(flow, flow.begin()).find(
      (o) =>
        o.type === "grave_rob" &&
        (o.payload as { graveId: TileId }).graveId === graveId,
    );
    expect(offered).toBeDefined();
    const status = flow.submit("p0", offered as { type: string; payload: unknown });
    expect(game.engine.state.round.lastDrawnTile).toBe(graveId);
    expect(winValidate(game)).toBeNull();
    expect(promptOptions(flow, status).some((o) => o.type === "win")).toBe(true);
  });

  it("후리텐이면 그 패가 후보에 오르지 않고 도굴도 거부된다", () => {
    const state = scene("grave_rob", true);
    const { game, flow } = start(state, graveRob);
    const graveId = pondThreeMan(game.engine.state, "p1");

    // 후보에서 미리 걸러진다 — 게임 1회뿐인 사용 횟수를 못 나는 도굴에 태우지 않는다
    const status = flow.begin();
    const robOpts = promptOptions(flow, status).filter((o) => o.type === "grave_rob");
    expect(robOpts).toEqual([]);

    // 액션 자체도 거부된다
    const def = game.engine.actions.get("grave_rob");
    if (def === undefined) throw new Error("no grave_rob action");
    expect(
      def.validate(
        { player: "p0", type: "grave_rob", payload: { graveId, fromPlayer: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("that tile does not complete your hand");
  });

  it("후리텐이라도 패산에서 뽑은 진짜 쯔모는 표준대로 화료된다", () => {
    const state = withAugment(
      craft({
        hands: { p0: "123m456m789m123p3m3m", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "3m1z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "grave_rob",
      "p0",
    );
    const { game } = start(state, graveRob);
    expect(winValidate(game)).toBeNull();
  });
});

describe("정적의 손 — 집은 패로 나는 화료", () => {
  it("후리텐이 아니면 남의 바닥에서 집은 패로 쯔모 화료할 수 있다 (기준선)", () => {
    const { game, flow } = start(scene("silent_swap", false), silentSwap);
    const tileId = pondThreeMan(game.engine.state, "p1");
    const status = flow.submit("p0", { type: "silent_take", payload: { tileId } });
    expect(game.engine.state.round.lastDrawnTile).toBe(tileId);
    expect(winValidate(game)).toBeNull();
    expect(promptOptions(flow, status).some((o) => o.type === "win")).toBe(true);
  });

  it("후리텐이면 남의 바닥에서 집었어도 그 패로 화료할 수 없다", () => {
    const { game, flow } = start(scene("silent_swap", true), silentSwap);
    const tileId = pondThreeMan(game.engine.state, "p1");
    const status = flow.submit("p0", { type: "silent_take", payload: { tileId } });
    expect(game.engine.state.round.lastDrawnTile).toBe(tileId);
    expect(winValidate(game)).toBe("furiten");
    expect(promptOptions(flow, status).some((o) => o.type === "win")).toBe(false);
  });

  it("내 바닥의 패는 후보에 없고 집으려 해도 거부된다", () => {
    const { game, flow } = start(scene("silent_swap", true), silentSwap);
    const state = game.engine.state;
    const myPond = new Set(state.zones[discardsZone("p0")]?.tileIds ?? []);
    expect(myPond.size).toBeGreaterThan(0);

    const takeOpts = promptOptions(flow, flow.begin()).filter(
      (o) => o.type === "silent_take",
    );
    expect(takeOpts.length).toBeGreaterThan(0);
    const offered = takeOpts.map((o) => (o.payload as { tileId: TileId }).tileId);
    expect(offered.filter((id) => myPond.has(id))).toEqual([]);

    const def = game.engine.actions.get("silent_take");
    if (def === undefined) throw new Error("no silent_take action");
    expect(
      def.validate(
        {
          player: "p0",
          type: "silent_take",
          payload: { tileId: pondThreeMan(state, "p0") },
        },
        { state, rules: game.engine.rules },
      ),
    ).toBe("cannot take from your own pond");
  });
});
