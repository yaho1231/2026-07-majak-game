/**
 * 날치기 (pond_snatch) — 주운 패로 나는 것에 대한 계약 (docs/28 §2-9).
 *
 * 주운 패는 `lastDrawnTile`이 되어 쯔모 화료가 성립한다(무덤 도굴·정적의 손과 같은
 * 계열). 그런데 코어의 쯔모 분기에는 후리텐 검사가 없어서 — 표준 룰상 쯔모는
 * 후리텐과 무관하니 당연하다 — **후리텐 플레이어가 자기 오름패가 강에 깔리기를
 * 기다렸다가 주워 멘젠쯔모로 나고 상대 셋이 전부 지불했다.**
 *
 * 이름만 쯔모일 뿐 실체는 남이 버린 패로 나는 것이므로, 주운 패로 나는 화료에는
 * 후리텐이 붙는다(코어 규칙 `win.tsumoFuriten`). 패산에서 뽑은 진짜 쯔모는 그대로다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  installAugment,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { pondSnatch } from "../src/augments/pond_snatch.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugment(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: ["pond_snatch"] } : p,
    ),
  };
}

/**
 * p0: 123m456m789m123p + 3m 단기 대기 (쯔모패 9p는 불필요).
 * p1의 최근 버림에 3m이 깔려 있다.
 * @param furiten p0가 3m을 이미 버렸는가 (후리텐)
 */
function scene(furiten: boolean): GameState {
  return withAugment(
    craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: {
        p0: furiten ? "3m1z" : "1z",
        p1: "2z3z3m", // 최근 3장 안에 3만
        p2: "5z",
        p3: "6z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    "p0",
  );
}

function start(state: GameState): { game: Game; flow: FlowController } {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, pondSnatch, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow };
}

/** p1의 바닥에 있는 3만 */
function pondThreeMan(state: GameState): TileId {
  const ids = state.zones[discardsZone("p1")]?.tileIds ?? [];
  const found = ids.find((id) => {
    const k = kindOf(state, id);
    return k.suit === "man" && k.rank === 3;
  });
  if (found === undefined) throw new Error("p1 pond has no 3m");
  return found;
}

/** p0가 p1 바닥의 3만을 줍는다 — 주운 tile id와 그 뒤의 프롬프트를 돌려준다 */
function snatch(
  game: Game,
  flow: FlowController,
): { snatchId: TileId; winOffered: boolean } {
  const snatchId = pondThreeMan(game.engine.state);
  const status = flow.submit("p0", {
    type: "pond_snatch",
    payload: { snatchId, fromPlayer: "p1" },
  });
  if (status.kind !== "awaiting") throw new Error("expected awaiting after snatch");
  const prompt = status.prompts.find((p) => p.player === "p0");
  return {
    snatchId,
    winOffered: prompt?.options.some((o) => o.type === "win") ?? false,
  };
}

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

describe("날치기 — 주운 패로 나는 화료", () => {
  it("후리텐이 아니면 주운 패로 쯔모 화료할 수 있다 (기준선)", () => {
    const { game, flow } = start(scene(false));
    const { snatchId, winOffered } = snatch(game, flow);
    expect(game.engine.state.round.lastDrawnTile).toBe(snatchId);
    expect(winValidate(game, "p0")).toBeNull();
    expect(winOffered).toBe(true);
  });

  it("후리텐이면 주운 패로 화료할 수 없다", () => {
    const { game, flow } = start(scene(true));
    const { winOffered } = snatch(game, flow);
    // 예전에는 여기가 null이었다 — 후리텐 플레이어가 강에서 오름패를 주워
    // 멘젠쯔모로 나고 상대 셋이 전부 지불했다.
    expect(winValidate(game, "p0")).toBe("furiten");
    expect(winOffered).toBe(false);
  });

  it("주운 패를 버리고 새로 쯔모하면 후리텐 판정이 풀린다 (진짜 쯔모는 표준대로)", () => {
    // 패산에서 뽑은 패는 예전 그대로 후리텐과 무관하다.
    const state = withAugment(
      craft({
        hands: { p0: "123m456m789m123p3m3m", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "3m1z" }, // 3만을 버린 적 있다 = 후리텐
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, pondSnatch, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    // 후리텐이어도 쯔모 화료는 표준 룰대로 성립한다
    expect(winValidate(game, "p0")).toBeNull();
  });
});
