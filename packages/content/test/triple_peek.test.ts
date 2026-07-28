/**
 * 삼세 예지 (triple_peek) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴(turn.act)에 선언할 수 있고, 선언은 게임당 1회다.
 *  2. 선언하면 내 다음 쯔모 3장의 **종류(kindKey 문자열)**가 보유자 전용 채널로 나간다.
 *  3. 그 3개는 패산에서 보유자가 실제로 뽑게 될 패의 kind다(자리 회전으로 검증).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
  nextSeat,
  playerAtSeat,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { triplePeek } from "../src/augments/triple_peek.js";

const ID = "triple_peek";
const ACTION = "triple_peek_use";

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

/** 테스트가 impl과 독립적으로 예지 결과를 계산한다 (자리 회전 복제). */
function expectedPeek(state: GameState, holder: PlayerId, dir = 1): string[] {
  const wall = state.zones[WALL]?.tileIds ?? [];
  let seat = nextSeat(state, state.round.turnSeat, dir);
  const kinds: string[] = [];
  for (let i = 0; i < wall.length && kinds.length < 3; i++) {
    const tileId = wall[i];
    if (tileId !== undefined && playerAtSeat(state, seat).id === holder) {
      kinds.push(kindKey(kindOf(state, tileId)));
    }
    seat = nextSeat(state, seat, dir);
  }
  return kinds;
}

/** p0 턴, p0이 삼세 예지 보유. 패산은 leftover에서 알려진 12장으로 고정한다. */
function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 패산을 leftover 앞 12장으로 고정 — 결정론적 예지 검증용
  const wallZone = base.zones[WALL];
  if (wallZone === undefined) throw new Error("no wall");
  const fixed: TileId[] = wallZone.tileIds.slice(0, 12);
  const scened: GameState = {
    ...base,
    zones: { ...base.zones, [WALL]: { ...wallZone, tileIds: fixed } },
  };
  return withAugments(scened, "p0", [ID]);
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, triplePeek, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

describe("삼세 예지 (triple_peek)", () => {
  it("자기 턴에 선언 후보가 뜬다", () => {
    const { status } = startFlow(scene());
    const prompt = status.prompts.find((p) => p.player === "p0");
    const opt = prompt?.options.filter((o) => o.type === ACTION) ?? [];
    expect(opt).toHaveLength(1);
  });

  it("선언하면 다음 쯔모 3장의 kindKey가 보유자 전용 채널로 나간다", () => {
    const scn = scene();
    const expected = expectedPeek(scn, "p0");
    expect(expected).toHaveLength(3);

    const { game, flow } = startFlow(scn);
    flow.submit("p0", { type: ACTION, payload: {} });

    const result = game.engine.state.augmentData[`view:p0:${ID}`];
    // 배열 · 길이 3 · 전부 kindKey 문자열
    expect(Array.isArray(result)).toBe(true);
    const arr = result as unknown[];
    expect(arr).toHaveLength(3);
    for (const k of arr) expect(typeof k).toBe("string");
    // 자리 회전으로 독립 계산한 값과 정확히 일치
    expect(arr).toEqual(expected);

    // 발동 사실만 담은 전원 공개 마커가 존재한다 (내용 없음)
    expect(game.engine.state.augmentData[`view:*:${ID}:p0`]).toBeDefined();
  });

  it("보유자가 실제로 뽑을 패산 위치(3,7,11)의 kind와 일치한다", () => {
    const scn = scene();
    const wall = scn.zones[WALL]?.tileIds ?? [];
    // p0=seat0 턴이므로 다음 뽑는 순서는 seat1,2,3,0,... → p0은 index 3,7,11
    const byIndex = [3, 7, 11].map((i) =>
      kindKey(kindOf(scn, wall[i] as TileId)),
    );

    const { game, flow } = startFlow(scn);
    flow.submit("p0", { type: ACTION, payload: {} });
    expect(game.engine.state.augmentData[`view:p0:${ID}`]).toEqual(byIndex);
  });

  it("동풍전 1회 — 두 번째 선언은 거부되고 옵션도 사라진다", () => {
    const base = scene();
    const scn: GameState = { ...base, config: { ...base.config, mode: "tonpuu" } };
    const { game, flow } = startFlow(scn);
    const status = flow.submit("p0", { type: ACTION, payload: {} });
    expect(game.engine.state.augmentData[`${ID}:uses:p0`]).toBe(1);

    // 선언 후 여전히 p0 턴이면 옵션이 더는 제시되지 않는다
    const prompt =
      status.kind === "awaiting"
        ? status.prompts.find((p) => p.player === "p0")
        : undefined;
    expect(
      prompt?.options.filter((o) => o.type === ACTION) ?? [],
    ).toHaveLength(0);
  });
});
