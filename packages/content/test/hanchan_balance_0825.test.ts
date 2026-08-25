/**
 * 반장전 밸런스 QA (2026-08-25) — 이 감사에서 바뀐 증강들의 회귀 테스트.
 *
 * 배경: 증강 밸런스가 대체로 **동풍전(4국)** 기준으로 잡혀 있어서, 국이 두 배인
 * 반장전(8국)에서 배수가 세 갈래로 갈라졌다 — 매치 예산형은 1.5배(`scaledUses`),
 * 국 스코프·상시형은 2.0배, 게임당 고정·1국 한정형은 1.0배(= 상대적으로 절반).
 * 감사 전문은 `docs/qa-hanchan/00_SUMMARY.md`.
 *
 * 여기서 지키는 것은 **모드에 따라 달라져야 하는 값**과, 국 단위 쿨다운으로 옮겨
 * **국당 밀도를 두 모드에서 같게** 만든 증강들이다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_STARTED,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 크래프트 상태에 보유 증강을 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(state: GameState, pid: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === pid ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** 이벤트를 그대로 흘려 넣는 테스트 전용 액션 (ROUND_STARTED 흉내) */
function emit(game: Game, event: { type: string; payload: unknown }): void {
  if (!game.engine.actions.has("__test_emit")) {
    game.engine.actions.register({
      type: "__test_emit",
      validate: () => null,
      toEvents: (req) => [req.payload as { type: string; payload: unknown }],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_emit", payload: event });
  if (!res.ok) throw new Error(`emit failed: ${res.reason}`);
}

const optionsFor = (
  status: ReturnType<FlowController["begin"]>,
  player: PlayerId,
): ActionOption[] =>
  status.kind === "awaiting"
    ? (status.prompts.find((p) => p.player === player)?.options ?? [])
    : [];

// ───────────────── 왕패의 주인 — 매 국 2회 → 2국에 1회(최대 2장) ─────────────────

describe("dead_wall_master (왕패의 주인) — 2국에 1회", () => {
  function firstTurnState(): GameState {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    return withAugments(base, "p0", ["dead_wall_master"]);
  }

  function setup(): { game: Game; flow: FlowController } {
    const game = createStandardGameFromState(firstTurnState());
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  /** 지금 이 상태에서 dw_swap 후보가 뜨는가 */
  const canSwapNow = (flow: FlowController): boolean =>
    optionsFor(flow.begin(), "p0").some((o) => o.type === "dw_swap");

  /** 왕패 자리 하나를 손패 첫 장과 바꾼다 */
  function swapOnce(game: Game, flow: FlowController): void {
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "dw_swap");
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    expect(game.engine.state.zones[DEAD_WALL]?.tileIds).toHaveLength(14);
  }

  it("한 번의 발동에서 2장까지 이어서 바꿀 수 있다 (두 번째 장은 쿨다운에 막히지 않는다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    // 첫 장에서 쿨다운이 찍혔지만 같은 창의 두 번째 장은 그대로 열려 있어야 한다
    expect(canSwapNow(flow)).toBe(true);
    swapOnce(game, flow);
    expect(canSwapNow(flow)).toBe(false);
    expect(game.engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(14);
  });

  it("1장만 바꾸고 끝내도 그 국은 쓴 것으로 친다 (장수는 플레이어가 고른다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    emit(game, { type: ROUND_STARTED, payload: {} });
    // 다음 국은 쉰다 — 한 장만 썼어도 발동은 한 번이다
    expect(canSwapNow(flow)).toBe(false);
  });

  it("발동한 다음 국은 쉬고, 그다음 국에 다시 열린다", () => {
    const { game, flow } = setup();
    expect(canSwapNow(flow)).toBe(true);
    swapOnce(game, flow);

    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(canSwapNow(flow)).toBe(false);

    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(canSwapNow(flow)).toBe(true);
  });

  it("쿨다운 중에는 남은 교환 횟수 표시도 0이다 (버튼 없는데 '2회 남음'이 뜨지 않는다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    emit(game, { type: ROUND_STARTED, payload: {} });
    const key = "view:p0:dead_wall_master:remaining:p0#round";
    expect(game.engine.state.augmentData[key] ?? 0).toBe(0);
  });
});
