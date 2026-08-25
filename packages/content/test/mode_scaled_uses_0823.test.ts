/**
 * 2026-08-23 사용자 지시 3건의 회귀 테스트.
 *
 *  1. **매치 예산은 판 길이를 따라간다** — 동풍전 기준 N회가 반장전에서는 올림 1.5배다
 *     (`scaledUses`). 예전에는 "게임 내 5회"가 두 모드에 똑같이 적용돼, 국이 두 배 도는
 *     반장전에서 같은 카드가 국당 절반 값이었다.
 *  2. **카르마에 매치 예산이 생겼다** — 게이지만 차면 몇 번이든 태우던 것을
 *     동풍전 1회 · 반장전 2회로 잠갔다.
 *  3. **모양 규칙 3종이 액티브가 됐다** — 동수의 결속·무너진 국경·비대칭은 상시가
 *     아니라 **선언한 그 국 동안만** 열리고, 쿨다운은 2국이다.
 */

import { describe, expect, it } from "vitest";
import {
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
  playerOf,
  scoringOptionsOf,
} from "@majak/core";
import type { AugmentDef, GameMode, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { cooldownViewKey, matchUses, roundKey, scaledUses } from "../src/util.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 모드·증강·미리 쌓아 둔 카운터를 얹은 판 하나 */
function scene(opts: {
  mode?: GameMode;
  augments: string[];
  data?: Record<string, unknown>;
  hand?: string;
}): GameState {
  const base = craft({
    hands: { p0: opts.hand ?? "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    ...(opts.mode === undefined
      ? {}
      : { config: { ...base.config, mode: opts.mode } }),
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: opts.augments } : p,
    ),
    augmentData: { ...base.augmentData, ...(opts.data ?? {}) },
  };
}

function game(state: GameState, def: AugmentDef, holder: PlayerId = "p0"): Game {
  const g = createStandardGameFromState(state, undefined, [def]);
  installAugment(g.engine, def, holder, { yaku: g.yaku });
  return g;
}

// ───────────────────────── 1. 매치 예산의 배수 ─────────────────────────

describe("매치 예산 — 동풍전 기준 N회, 반장전은 올림 1.5배", () => {
  const tonpuu = (n: number): number =>
    scaledUses({ config: { mode: "tonpuu" } } as unknown as GameState, n);
  const hanchan = (n: number): number =>
    scaledUses({ config: { mode: "hanchan" } } as unknown as GameState, n);

  it("동풍전은 적힌 그대로, 반장전은 1.5배(올림)다", () => {
    expect([1, 2, 3, 5].map(tonpuu)).toEqual([1, 2, 3, 5]);
    expect([1, 2, 3, 5].map(hanchan)).toEqual([2, 3, 5, 8]);
  });

  it("mode가 없으면 반장전으로 본다 (서버 기본과 같다)", () => {
    expect(scaledUses({ config: {} } as unknown as GameState, 5)).toBe(8);
  });

  it("matchUses는 이 함수의 N=1 자리다 — 규약이 두 곳으로 갈라지지 않는다", () => {
    expect(matchUses({ config: { mode: "tonpuu" } } as unknown as GameState)).toBe(1);
    expect(matchUses({ config: {} } as unknown as GameState)).toBe(2);
  });
});

describe("염색 — 동풍전 5회 · 반장전 8회", () => {
  const dye = (g: Game, idx: number, suit: "man" | "pin" | "sou"): boolean => {
    const hand = g.engine.state.zones["hand:p0"]?.tileIds ?? [];
    return g.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId: hand[idx] as TileId, suit },
    }).ok;
  };

  it("동풍전은 5회에서 막힌다", () => {
    const g = game(
      scene({ mode: "tonpuu", augments: ["tile_dyeing"], data: { "tile_dyeing:used:p0": 5 } }),
      C.tileDyeing,
    );
    expect(dye(g, 0, "pin")).toBe(false);
  });

  it("반장전은 같은 5회에서 아직 세 번 남았다", () => {
    const g = game(
      scene({ mode: "hanchan", augments: ["tile_dyeing"], data: { "tile_dyeing:used:p0": 5 } }),
      C.tileDyeing,
    );
    expect(dye(g, 0, "pin")).toBe(true);
    expect(g.engine.state.augmentData["view:p0:uses:tile_dyeing"]).toEqual({
      left: 2,
      total: 8,
      scope: "match",
    });
  });

  it("반장전도 8회에서는 막힌다", () => {
    const g = game(
      scene({ mode: "hanchan", augments: ["tile_dyeing"], data: { "tile_dyeing:used:p0": 8 } }),
      C.tileDyeing,
    );
    expect(dye(g, 0, "pin")).toBe(false);
    const opts = g.engine.turnOptionProviders.flatMap((p) => p(g.engine.state, "p0"));
    expect(opts.some((o) => o.type === "tile_dye")).toBe(false);
  });
});

describe("연금술사 — 동풍전 5회 · 반장전 8회", () => {
  const alchemy = (g: Game): boolean => {
    const hand = g.engine.state.zones["hand:p0"]?.tileIds ?? [];
    return g.engine.submit({
      player: "p0",
      type: "alchemy",
      payload: { tileId: hand[0] as TileId, delta: 1 },
    }).ok;
  };

  it("동풍전 5회 → 막히고, 반장전 5회 → 아직 열려 있다", () => {
    const used = { "alchemist:used:p0": 5 };
    expect(
      alchemy(game(scene({ mode: "tonpuu", augments: ["alchemist"], data: used }), C.alchemist)),
    ).toBe(false);
    expect(
      alchemy(game(scene({ mode: "hanchan", augments: ["alchemist"], data: used }), C.alchemist)),
    ).toBe(true);
  });
});

// ───────────────────────── 2. 카르마의 매치 예산 ─────────────────────────

describe("카르마 — 동풍전 1회 · 반장전 2회", () => {
  /** 게이지가 가득 찬 판 (게이지는 게임 스코프 카운터라 바로 얹는다) */
  const karmaScene = (mode: GameMode, used: number): GameState =>
    scene({
      mode,
      augments: ["karma"],
      data: { "karma:gauge:p0": 12000, "karma:uses:p0": used },
    });

  const burn = (g: Game): boolean =>
    g.engine.submit({ player: "p0", type: "karma_burn", payload: {} }).ok;

  it("첫 번째는 태울 수 있고 게이지가 0이 된다", () => {
    const g = game(karmaScene("hanchan", 0), C.karma);
    expect(burn(g)).toBe(true);
    expect(g.engine.state.augmentData["karma:gauge:p0"]).toBe(0);
    expect(g.engine.state.augmentData["karma:uses:p0"]).toBe(1);
  });

  it("동풍전은 한 번 태우면 게이지가 다시 차도 못 태운다", () => {
    const g = game(karmaScene("tonpuu", 1), C.karma);
    expect(burn(g)).toBe(false);
    // 버튼 자체가 사라진다 — 게이지는 계속 차므로 남아 있으면 오해를 부른다
    const opts = g.engine.turnOptionProviders.flatMap((p) => p(g.engine.state, "p0"));
    expect(opts.some((o) => o.type === "karma_burn")).toBe(false);
  });

  it("반장전은 두 번째까지 태우고 세 번째는 막힌다", () => {
    expect(burn(game(karmaScene("hanchan", 1), C.karma))).toBe(true);
    expect(burn(game(karmaScene("hanchan", 2), C.karma))).toBe(false);
  });

  it("남은 횟수가 보유자 채널에 실린다", () => {
    const g = game(karmaScene("hanchan", 0), C.karma);
    expect(burn(g)).toBe(true);
    expect(g.engine.state.augmentData["view:p0:uses:karma"]).toEqual({
      left: 1,
      total: 2,
      scope: "match",
    });
  });
});

// ───────────────────── 3. 모양 규칙 3종 — 2국에 1회 액티브 ─────────────────────

const SHAPE: {
  id: string;
  def: AugmentDef;
  action: string;
  option: "mixedTriplets" | "mixedRuns" | "chiitoiMixedPairs";
}[] = [
  {
    id: "mixed_triplet",
    def: C.mixedTriplet,
    action: "declare_mixed_triplet",
    option: "mixedTriplets",
  },
  {
    id: "broken_border",
    def: C.brokenBorder,
    action: "declare_broken_border",
    option: "mixedRuns",
  },
  {
    id: "async_chiitoi",
    def: C.asyncChiitoi,
    action: "declare_async_chiitoi",
    option: "chiitoiMixedPairs",
  },
];

describe.each(SHAPE)("$id — 선언한 국에만 열린다 (2국에 1회)", ({ id, def, action, option }) => {
  const mk = (data?: Record<string, unknown>): Game =>
    game(scene({ augments: [id], ...(data === undefined ? {} : { data }) }), def);
  const optsOf = (g: Game): Record<string, unknown> =>
    scoringOptionsOf(g.engine.state, g.engine.rules, "p0") as Record<string, unknown>;
  const fire = (g: Game): boolean =>
    g.engine.submit({ player: "p0", type: action, payload: {} }).ok;

  it("발동 전에는 규칙이 꺼져 있다 — 보유만으로는 아무 일도 없다", () => {
    expect(optsOf(mk())[option]).toBeUndefined();
  });

  it("발동하면 그 국 동안 규칙이 켜지고, 전원에게 공개된다", () => {
    const g = mk();
    expect(fire(g)).toBe(true);
    expect(optsOf(g)[option]).toBe(true);
    const view = buildPlayerView(g.engine.state, "p1", g.engine.rules);
    expect(view.augmentView[`${id}:p0`]).toBe(true);
    expect(g.engine.state.augmentData[cooldownViewKey(id, "p0")]).toBe(2);
  });

  it("같은 국에 두 번은 못 켠다", () => {
    const g = mk();
    expect(fire(g)).toBe(true);
    expect(fire(g)).toBe(false);
  });

  it("효과는 발동한 그 국에만 산다 (국이 넘어가면 꺼진다)", () => {
    const g = mk();
    expect(fire(g)).toBe(true);
    const prev = g.engine.state;
    const next = game(
      { ...prev, round: { ...prev.round, honba: prev.round.honba + 1 } },
      def,
    );
    expect(roundKey(next.engine.state)).not.toBe(roundKey(prev));
    expect(optsOf(next)[option]).toBeUndefined();
  });

  it("쿨다운이 2국이다 — 바로 다음 국에는 다시 못 켠다", () => {
    const g = mk({ [`${id}:usedSeq:p0`]: 3, [`${id}:seq:p0`]: 4 });
    expect(fire(g)).toBe(false);
    // 2국이 지나면 다시 열린다
    const ok = mk({ [`${id}:usedSeq:p0`]: 3, [`${id}:seq:p0`]: 5 });
    expect(fire(ok)).toBe(true);
  });

  it("리치 중에는 선언할 수 없다 — 잠긴 대기가 다시 계산되면 안 된다", () => {
    const base = scene({ augments: [id] });
    const g = game(
      {
        ...base,
        round: {
          ...base.round,
          byPlayer: {
            ...base.round.byPlayer,
            p0: {
              ...base.round.byPlayer["p0"]!,
              riichi: { double: false, ippatsu: false, discardIndex: 0 },
            },
          },
        },
      },
      def,
    );
    expect(fire(g)).toBe(false);
    const opts = g.engine.turnOptionProviders.flatMap((p) => p(g.engine.state, "p0"));
    expect(opts.some((o) => o.type === action)).toBe(false);
  });

  it("자기 순이 아니면 못 켠다", () => {
    const base = scene({ augments: [id] });
    const g = game({ ...base, round: { ...base.round, turnSeat: 1 } }, def);
    expect(fire(g)).toBe(false);
    expect(playerOf(g.engine.state, "p0").augments).toContain(id);
  });
});
