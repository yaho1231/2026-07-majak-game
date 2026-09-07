/**
 * 무너진 국경(broken_border) × 장사진(snake_kan) — 함께 들었을 때.
 *
 * 둘 다 «몸통의 모양»을 바꾸지만 담당이 갈려 있다:
 * - 무너진 국경은 **슌쯔의 무늬 제한**(`scoring.mixedRuns`)을 그 국 동안 지운다.
 * - 장사진은 **깡의 재료**(`call.snakeKan` → `isRunQuad`)를 연속 4장까지 넓힌다.
 *
 * 2026-09-07 사용자 지시로 둘이 만나면 **혼색 4연속(3만4통5삭6통)도 깡이 된다** —
 * 장사진은 넉 장을 슌쯔의 일종으로 세우는 물건이라(`WinContext.meldToSet`이 슌쯔성
 * 몸통으로 내보낸다), 슌쯔의 무늬 국경이 사라진 국에 4연속 깡에만 그 국경이 남을
 * 이유가 없다.
 *
 * 이 파일이 지키는 선은 넷이다:
 *  1. 선언 전에는 혼색 4연속이 깡이 **아니다** (대조군 — 늘 열려 있으면 안 된다).
 *  2. 선언하면 혼색 4연속이 후보에 뜨고 실제로 깡이 선다.
 *  3. 단색 4연속은 무너진 국경과 무관하게 그대로다 (넓히다 종전 것을 잃지 않는다).
 *  4. 담당의 경계 — 혼색 4연속은 **커쯔로 세지 않는다**(그건 동수의 결속 담당이다).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildVariants,
  buildWinContext,
  createStandardGameFromState,
  installAugment,
  kindOf,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { snakeKan } from "../src/augments/snake_kan.js";
import { brokenBorder } from "../src/augments/broken_border.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

function setup(state: GameState): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(withAug(state, "p0", ["snake_kan", "broken_border"]));
  installAugment(game.engine, snakeKan, "p0", { yaku: game.yaku });
  installAugment(game.engine, brokenBorder, "p0", { yaku: game.yaku });
  return game;
}

function options(game: ReturnType<typeof createStandardGameFromState>): ActionOption[] {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error(`expected awaiting, got ${status.kind}`);
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

/** 안깡 후보를 「3man4pin5sou6pin」처럼 사람이 읽는 문자열로 편다 */
function ankanShapes(game: ReturnType<typeof createStandardGameFromState>): string[] {
  return options(game)
    .filter((o) => o.type === "ankan")
    .map((o) =>
      (o.payload as { tileIds: TileId[] }).tileIds
        .map((id) => {
          const k = kindOf(game.engine.state, id);
          return `${k.rank}${k.suit}`;
        })
        .join(""),
    );
}

/** 혼색 4연속만 있고 같은 무늬 연속은 없는 손 — 3만·4통·5삭·6통 */
const MIXED_QUAD_HAND = { p0: "3m4p5s6p1112999m1s", p1: "*", p2: "*", p3: "*" } as const;

const mixedQuadScene = (): GameState =>
  craft({ hands: { ...MIXED_QUAD_HAND }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });

describe("무너진 국경 × 장사진 — 혼색 4연속 깡", () => {
  it("선언 전에는 혼색 4연속이 깡이 아니다 (대조군)", () => {
    expect(ankanShapes(setup(mixedQuadScene()))).toEqual([]);
  });

  it("무너진 국경을 선언하면 혼색 4연속도 장사진 깡이 된다", () => {
    const game = setup(mixedQuadScene());
    expect(game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} }).ok).toBe(
      true,
    );
    expect(ankanShapes(game)).toContain("3man4pin5sou6pin");
  });

  it("혼색 4연속 깡이 실제로 선다 — 깡 멜드까지 표준 경로다", () => {
    const game = setup(mixedQuadScene());
    game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} });
    const quad = options(game).find(
      (o) =>
        o.type === "ankan" &&
        new Set(
          (o.payload as { tileIds: TileId[] }).tileIds.map(
            (id) => kindOf(game.engine.state, id).suit,
          ),
        ).size > 1,
    );
    expect(quad).toBeDefined();
    if (quad === undefined) return;
    const before = game.engine.state.round.byPlayer["p0"]?.melds.length ?? 0;
    expect(game.engine.submit({ player: "p0", type: "ankan", payload: quad.payload }).ok).toBe(true);
    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    expect(melds).toHaveLength(before + 1);
    expect(melds[melds.length - 1]?.kind).toBe("kan_closed");
  });

  it("단색 4연속은 무너진 국경과 무관하게 그대로 후보다", () => {
    const game = setup(
      craft({
        hands: { p0: "3456m123p999s1z1z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    expect(ankanShapes(game)).toContain("3man4man5man6man");
  });

  /*
   * 담당의 경계 — 혼색 4연속은 **커쯔로 세지 않는다**.
   * `WinContext.meldToSetChoices`의 커쯔 해석은 같은 무늬일 때만 열린다. 무늬가 섞인
   * 커쯔는 동수의 결속(`mixedTriplets`) 담당이라, 무너진 국경 하나로 또이또이·산안커까지
   * 열리면 두 증강의 역할 분담이 무너진다.
   */
  it("혼색 4연속 깡은 채점에서 슌쯔성 몸통으로만 나간다 (커쯔 해석 없음)", () => {
    const game = setup(
      craft({
        // 혼색 4연속 깡 + 커쯔 셋 + 머리 — 깡을 커쯔로 세면 또이또이가 설 손이다
        hands: { p0: "111m999p777s1z1z", p1: "*", p2: "*", p3: "*" },
        melds: { p0: [{ kind: "kan_closed", spec: "3m4p5s6p" }] },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} });
    const st = game.engine.state;
    const hand = st.zones["hand:p0"]?.tileIds ?? [];
    const ctx = buildWinContext(st, "p0", "tsumo", hand.at(-1) as TileId, {
      rules: game.engine.rules,
    });
    const variants = buildVariants(ctx);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(v.sets.find((set) => set.isKan)?.type).toBe("run");
    }
  });
});

describe("무너진 국경 × 장사진 — 혼색 슌쯔 화료", () => {
  it("장사진 깡을 세운 손이 혼색 슌쯔로 화료한다", () => {
    // 3456통 장사진 깡 + 손패는 혼색 슌쯔 둘 + 커쯔 + 머리 (11장)
    const game = setup(
      craft({
        hands: { p0: "2m3p4s5m6p7s9m9m9m1z1z", p1: "*", p2: "*", p3: "*" },
        melds: { p0: [{ kind: "kan_closed", spec: "3456p" }] },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    // 선언 전에는 혼색 슌쯔가 몸통이 아니라 화료가 서지 않는다
    expect(options(game).some((o) => o.type === "win")).toBe(false);
    expect(game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} }).ok).toBe(
      true,
    );
    expect(options(game).some((o) => o.type === "win")).toBe(true);
  });
});
