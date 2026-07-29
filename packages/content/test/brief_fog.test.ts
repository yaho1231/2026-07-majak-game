/**
 * brief_fog (박무) — hidden_river의 6순 한정판.
 *
 * 검증:
 * (a) 선언 후 6순 창 이내: 비보유자는 타가 바닥을 장수만 본다(count_only).
 * (b) 보유자는 여전히 모든 바닥을 그대로 본다.
 * (c) 6순이 지나면 안개가 걷힌다 — visibility.discards가 기본값(public)으로 돌아온다.
 * (d) 게임당 1회 — 두 번째 선언 거부 + 후보에서 사라짐(안개가 걷힌 뒤에도).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  ActionOption,
  GameState,
  PlayerId,
  RuleContext,
} from "@majak/core";
import { craft } from "./helpers.js";
import { viewKey } from "../src/util.js";

import { briefFog } from "../src/augments/brief_fog.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const USES_KEY = "brief_fog:uses:p0";
/** 선언 순 키는 국 스코프다 (국이 바뀌면 자동 만료) */
const turnKeyFor = (st: GameState): string =>
  `brief_fog:turn:${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}:p0`;

function withAugment(state: GameState, player: PlayerId, id: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

function turnOptions(game: Game): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

function zoneOf(view: ReturnType<typeof buildPlayerView>, id: string) {
  const z = view.zones[id];
  if (z === undefined) throw new Error(`no zone ${id}`);
  return { tileIds: [...z.tileIds], hiddenCount: z.hiddenCount };
}

/** 주어진 state에서 뷰어 pid 기준 visibility.discards 규칙값 */
function discardVisibility(game: Game, pid: PlayerId, state: GameState): string {
  return game.engine.rules.resolve<string>("visibility.discards", {
    playerId: pid,
    state,
  } as unknown as RuleContext);
}

/** turnCount만 바꾼 상태 사본 (안개 창 경과 시뮬레이션) */
function atTurn(state: GameState, turnCount: number): GameState {
  return { ...state, round: { ...state.round, turnCount } };
}

function setup(): Game {
  const state = withAugment(
    craft({
      hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z", p1: "9m", p2: "3z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    }),
    "p0",
    "brief_fog",
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, briefFog, "p0", { yaku: game.yaku });
  return game;
}

describe("brief_fog — 박무 (6순 한정 안개)", () => {
  it("선언 전에는 바닥이 정상적으로 보인다 (상시 패시브가 아니다)", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(zoneOf(view, discardsZone("p0")).hiddenCount).toBe(0);
    expect(zoneOf(view, discardsZone("p0")).tileIds).toHaveLength(2);
    expect(game.engine.state.augmentData[USES_KEY]).toBeUndefined();
    expect(discardVisibility(game, "p1", game.engine.state)).toBe("public");
  });

  it("(a)(b) 선언 후 6순 창 이내: 비보유자는 장수만, 보유자는 전부 본다", () => {
    const game = setup();
    expect(turnOptions(game).some((o) => o.type === "declare_brief_fog")).toBe(
      true,
    );

    const r = game.engine.submit({
      player: "p0",
      type: "declare_brief_fog",
      payload: {},
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    expect(s.augmentData[USES_KEY]).toBe(1);
    expect(s.augmentData[turnKeyFor(s)]).toBe(0); // 선언 순 = turnCount 0
    expect(s.augmentData[viewKey("*", "brief_fog:p0")]).toBe("안개");

    // (a) 타인 뷰: 네 사람 바닥이 전부 장수만
    const other = buildPlayerView(s, "p1", game.engine.rules);
    expect(zoneOf(other, discardsZone("p0")).tileIds).toHaveLength(0);
    expect(zoneOf(other, discardsZone("p0")).hiddenCount).toBe(2);
    expect(zoneOf(other, discardsZone("p1")).hiddenCount).toBe(1);
    expect(discardVisibility(game, "p1", s)).toBe("count_only");

    // (b) 보유자 뷰: 전부 그대로
    const mine = buildPlayerView(s, "p0", game.engine.rules);
    expect(zoneOf(mine, discardsZone("p0")).tileIds).toHaveLength(2);
    expect(zoneOf(mine, discardsZone("p1")).tileIds).toHaveLength(1);
    expect(discardVisibility(game, "p0", s)).toBe("public");
  });

  it("각 플레이어의 마지막 버림패는 안개 속에서도 전원에게 보인다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "declare_brief_fog", payload: {} });
    const s = game.engine.state;
    const map = s.augmentData[viewKey("*", "brief_fog:last:p0")] as Record<
      PlayerId,
      number
    >;
    const other = buildPlayerView(s, "p1", game.engine.rules);
    for (const id of Object.values(map)) {
      expect(other.tiles[id]).toBeDefined();
    }
    // 그 앞 패(p0 첫 버림)는 여전히 보이지 않는다
    const hiddenId = s.zones[discardsZone("p0")]?.tileIds[0] as number;
    expect(other.tiles[hiddenId]).toBeUndefined();
  });

  it("(c) 6순이 지나면 안개가 걷힌다 — visibility가 기본값으로 돌아온다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "declare_brief_fog", payload: {} });
    const s = game.engine.state; // declaredTurn = 0

    // 창 경계 안(turnCount 5): 여전히 안개
    expect(discardVisibility(game, "p1", atTurn(s, 5))).toBe("count_only");
    // 창 밖(turnCount 6): 안개 해제 → 기본값 public
    expect(discardVisibility(game, "p1", atTurn(s, 6))).toBe("public");
    expect(discardVisibility(game, "p1", atTurn(s, 12))).toBe("public");

    // 실제 뷰도 6순 후엔 p0 바닥이 다시 보인다
    const view = buildPlayerView(atTurn(s, 6), "p1", game.engine.rules);
    expect(zoneOf(view, discardsZone("p0")).hiddenCount).toBe(0);
    expect(zoneOf(view, discardsZone("p0")).tileIds).toHaveLength(2);
  });

  it("(d) 게임당 1회 — 두 번째 선언 거부, 후보에서도 사라진다", () => {
    const game = setup();
    expect(
      game.engine.submit({
        player: "p0",
        type: "declare_brief_fog",
        payload: {},
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "declare_brief_fog",
        payload: {},
      }).ok,
    ).toBe(false);
    expect(
      turnOptions(game).some((o) => o.type === "declare_brief_fog"),
    ).toBe(false);
  });

  it("(d) 안개 활성 중에는 다시 선언할 수 없다", () => {
    const game = setup();
    game.engine.submit({ player: "p0", type: "declare_brief_fog", payload: {} });
    // 안개가 활성인 동안에는 사용 횟수가 남아도 재선언이 막힌다
    expect(game.engine.state.augmentData[USES_KEY]).toBe(1);
    expect(
      turnOptions(game).some((o) => o.type === "declare_brief_fog"),
    ).toBe(false);
  });
});
