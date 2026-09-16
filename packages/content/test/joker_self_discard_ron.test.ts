/**
 * **조커 — 자기가 버린 그 패로는 론할 수 없다** (2026-09-04 보고, #467).
 *
 * 조커가 넓힌 대기를 후리텐으로 세지 않는 완화(`furitenOptionsOf`, joker.test.ts 4b)는
 * 그대로다. 그런데 그 완화가 후리텐을 통째로 지워, 조커 덕에 텐파이가 된 손이 **자기가
 * 방금 버린 패로 론**하는 일이 실제로 보고됐다(분열+조커+개벽). `isFuriten`은 손 전체
 * 대기를 보는 판정이라 여기서 false가 맞고, 막아야 하는 것은 그 한 장뿐이다 — 화료패만
 * 보는 코어 `isSelfDiscardedWinTile`이 론 검증(`standardActions` win)에서 그 자리를 막는다.
 *
 * #467이 #469(오래된 base)에 통째로 지워지면서 이 테스트도 함께 사라져 게이트가 조용히
 * 통과했다(docs/55 M-2). 2026-09-16 재적용 — joker.test.ts 안이 아니라 별도 파일에 둔다
 * (같은 시점에 다른 작업이 그 파일을 고치고 있었다).
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  installAugment,
  isFuriten,
  isSelfDiscardedWinTile,
  scoringOptionsOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, holder: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** p0가 조커를 든 자기 순 게임 하나 — 조커를 켜기 위한 장면 */
function armed(hand: string, discards: string): Game {
  const state = withAug(
    craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      discards: { p0: discards },
      phase: "turn.act",
      turnSeat: 0,
    }),
    "p0",
    ["joker"],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, C.joker, "p0", { yaku: game.yaku });
  const res = game.engine.submit({ player: "p0", type: "joker_call", payload: {} });
  if (!res.ok) throw new Error(`joker_call failed: ${res.reason}`);
  return game;
}

/** 조커를 켠 상태(augmentData) 그대로 리액션(론) 장면을 세운다 */
function ronScene(hand: string, discards: string, ronSpec: string): Game {
  const on = armed(hand, discards);
  const state = withAug(
    {
      ...craft({
        hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
        discards: { p0: discards },
        phase: "reaction",
        turnSeat: 1,
        lastDiscard: { player: "p1", spec: ronSpec },
      }),
      augmentData: { ...on.engine.state.augmentData },
    },
    "p0",
    ["joker"],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, C.joker, "p0", { yaku: game.yaku });
  return game;
}

// 111m 999m 55m 23s 白 23p = 13장. 백이 14삭·14통 중 하나를 메워 텐파이가 된다.
const HAND = "111999m55m23s23p5z";

describe("조커 — 자기가 버린 그 패로는 론할 수 없다", () => {
  it("조커가 열어 준 대기라도 이미 버린 패로는 론이 거부된다", () => {
    const game = ronScene(HAND, "1s", "1s");
    const st = game.engine.state;
    // 손 전체 판정은 여전히 후리텐이 아니다 — 막히는 것은 그 한 장뿐이다
    expect(
      isFuriten(st, "p0", scoringOptionsOf(st, game.engine.rules, "p0"), game.engine.rules),
    ).toBe(false);
    expect(isSelfDiscardedWinTile(st, "p0", st.round.lastDiscard!.tileId)).toBe(true);
    const res = game.engine.submit({ player: "p0", type: "win", payload: {} });
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.reason).toBe("furiten");
  });

  it("버린 적 없는 패로는 그대로 론할 수 있다", () => {
    const game = ronScene(HAND, "1s", "4s");
    const st = game.engine.state;
    expect(isSelfDiscardedWinTile(st, "p0", st.round.lastDiscard!.tileId)).toBe(false);
    const res = game.engine.submit({ player: "p0", type: "win", payload: {} });
    expect(res.ok ? "" : res.reason).not.toBe("furiten");
  });
});
