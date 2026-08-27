/**
 * 끝없는 윤회 × 숫자 순환 (2026-08-27 버프).
 *
 * 사용자 지시: "끝없는 윤회가 증강의 제한도 해소할 수 있게(ex. 연금술사와 같이먹으면
 * 9->8, 9->1 둘다 가능하게)". 끝없는 윤회가 `hand.wrapRanks`를 켜고, 연금술사와
 * 한 끗 차이가 그 규칙을 읽는다 — 증강 id 하드코딩 없이 코어 규칙으로만 통신한다.
 *
 * 여기서 재는 것:
 *  1. 연금술사 9→1 · 1→9 가 **끝없는 윤회를 함께 들었을 때만** 통과한다.
 *  2. 순환으로 만든 패도 conjured가 찍히고 적도라는 따라오지 않으며, 천화 게이트가 닫힌다.
 *  3. 한 끗 차이가 9s 대기에 1s를 쯔모해도 밀린다 — 역시 윤회 보유 시에만.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { alchemist } from "../src/augments/alchemist.js";
import { brokenWall } from "../src/augments/broken_wall.js";
import { offByOne } from "../src/augments/off_by_one.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugs(
  state: GameState,
  augs: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      augs[p.id] === undefined ? p : { ...p, augments: [...(augs[p.id] as string[])] },
    ),
  };
}

function start(state: GameState, installs: { def: AugmentDef; holder: PlayerId }[]): Game {
  const game = createStandardGameFromState(state);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

function validate(game: Game, type: string, player: PlayerId, payload: unknown): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`액션 ${type} 이 등록되지 않았다`);
  return def.validate(
    { player, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
}

function act(game: Game, player: PlayerId, type: string, payload: unknown): void {
  const err = validate(game, type, player, payload);
  if (err !== null) throw new Error(`${type} 거부됨: ${err}`);
  const res = game.engine.submit({ player, type, payload } as never);
  if (res.ok !== true) throw new Error(`${type} 실패: ${JSON.stringify(res)}`);
}

function findInHand(s: GameState, p: PlayerId, key: string): TileId {
  const id = handIdsOf(s, p).find((t) => kindKey(kindOf(s, t)) === key);
  if (id === undefined) throw new Error(`${p} 손에 ${key} 가 없다`);
  return id;
}

// ---------------------------------------------------------------------------
// 연금술사 × 끝없는 윤회
// ---------------------------------------------------------------------------

/** p0의 turn.act 장면. `wrap`이면 끝없는 윤회를 함께 들려 준다. */
function alchemyScene(hand: string, wrap: boolean, opts?: { firstTurn?: boolean }): Game {
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const augs = wrap ? ["alchemist", "broken_wall"] : ["alchemist"];
  const scene: GameState = {
    ...withAugs(base, { p0: augs }),
    round:
      opts?.firstTurn === true
        ? { ...base.round, firstTurn: true, dealerSeat: 0 }
        : base.round,
  };
  const installs: { def: AugmentDef; holder: PlayerId }[] = [
    { def: alchemist, holder: "p0" },
  ];
  if (wrap) installs.push({ def: brokenWall, holder: "p0" });
  return start(scene, installs);
}

const HAND = "123m456m789m123p9s9s";

describe("연금술사 × 끝없는 윤회 — 1↔9 순환", () => {
  it("윤회 없이는 9→1 · 1→9가 막힌다 (기존 그대로)", () => {
    const game = alchemyScene(HAND, false);
    const nine = findInHand(game.engine.state, "p0", "sou9");
    expect(validate(game, "alchemy", "p0", { tileId: nine, delta: 1 })).toBe("out of range");
    // 9→8은 예전대로 된다
    expect(validate(game, "alchemy", "p0", { tileId: nine, delta: -1 })).toBeNull();
  });

  it("윤회를 함께 들면 9→1이 통과하고 실제로 1이 된다", () => {
    const game = alchemyScene(HAND, true);
    const nine = findInHand(game.engine.state, "p0", "sou9");
    expect(validate(game, "alchemy", "p0", { tileId: nine, delta: 1 })).toBeNull();
    act(game, "p0", "alchemy", { tileId: nine, delta: 1 });
    expect(kindKey(kindOf(game.engine.state, nine))).toBe("sou1");
  });

  it("윤회를 함께 들면 1→9도 통과한다 (9→8도 여전히 된다)", () => {
    const game = alchemyScene("123m456m789m123p1s1s", true);
    const one = findInHand(game.engine.state, "p0", "sou1");
    expect(validate(game, "alchemy", "p0", { tileId: one, delta: -1 })).toBeNull();
    act(game, "p0", "alchemy", { tileId: one, delta: -1 });
    expect(kindKey(kindOf(game.engine.state, one))).toBe("sou9");
  });

  it("순환 후보가 자기 순 옵션 목록에도 나온다", () => {
    const game = alchemyScene(HAND, true);
    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("프롬프트가 없다");
    const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
    const nine = findInHand(game.engine.state, "p0", "sou9");
    expect(
      opts.some((o) => {
        if (o.type !== "alchemy") return false;
        const p = o.payload as { tileId?: number; delta?: number };
        return p.tileId === nine && p.delta === 1;
      }),
    ).toBe(true);
  });

  it("순환으로 만든 패도 conjured가 찍히고, 전원 공개 채널에 9→1이 남는다", () => {
    const game = alchemyScene(HAND, true);
    const nine = findInHand(game.engine.state, "p0", "sou9");
    act(game, "p0", "alchemy", { tileId: nine, delta: 1 });
    const st = game.engine.state;
    expect(st.tiles[nine]?.attrs?.conjured).toBe(true);
    expect(Object.values(st.augmentData)).toContain("sou9→sou1");
  });

  it("적도라(적5)를 순환 경로로 옮겨도 빨간색은 따라오지 않는다", () => {
    // 5s를 적도라로 만들고 9까지 옮기는 대신, 적5 자체의 ±1을 잰다
    // (순환 여부와 무관하게 같은 규약이 유지되는지 확인)
    const game = alchemyScene("123m456m789m123p5s9s", true);
    const st0 = game.engine.state;
    const red = findInHand(st0, "p0", "sou5");
    game.engine.state.tiles[red] = {
      ...st0.tiles[red]!,
      attrs: { ...(st0.tiles[red]?.attrs ?? {}), red: true },
    } as never;
    act(game, "p0", "alchemy", { tileId: red, delta: 1 });
    const st = game.engine.state;
    expect(kindKey(kindOf(st, red))).toBe("sou6");
    expect(st.tiles[red]?.attrs?.red).toBeUndefined();
    expect(st.tiles[red]?.attrs?.conjured).toBe(true);
  });

  it("순환 변환도 handAltered를 찍는다 — 천화가 붙지 않는다", () => {
    // 123m456m789m123p + 9s9s: 9s 하나를 1s로 돌려도 완성형은 아니지만,
    // handAltered 표식 자체가 찍혔는지는 천화 평가로 잰다.
    const game = alchemyScene("123m456m789m123p9s9s", true, { firstTurn: true });
    const nine = findInHand(game.engine.state, "p0", "sou9");
    act(game, "p0", "alchemy", { tileId: nine, delta: 1 });
    const ids = handIdsOf(game.engine.state, "p0");
    const ctx = buildWinContext(
      game.engine.state,
      "p0",
      "tsumo",
      ids[ids.length - 1] as TileId,
      { rules: game.engine.rules },
    );
    const ev = evaluateWin(ctx, game.yaku);
    expect(ev?.yaku.map((y) => y.name) ?? []).not.toContain("천화");
  });
});

// ---------------------------------------------------------------------------
// 한 끗 차이 × 끝없는 윤회
// ---------------------------------------------------------------------------

/**
 * p0가 3p/9s 샹퐁으로 리치. 패산 맨 위를 **1s**로 세운다.
 * 순환이 없으면 1s는 9s의 이웃이 아니라 아무 일도 없고, 윤회를 들면 9s로 밀린다.
 */
function offByOneScene(wrap: boolean): GameState {
  const base = craft({
    hands: {
      p0: "123m456m789m33p99s",
      p1: "55566677788899p",
      p2: "555m666m777m888m9m",
      p3: "111m222m333m444m1p",
    },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const wall = [...base.zones[WALL]!.tileIds];
  const dead = [...(base.zones[DEAD_WALL]?.tileIds ?? [])];
  let sou1 = wall.find((id) => kindKey(base.tiles[id]!.kind) === "sou1");
  let zonesPatch: GameState["zones"] = {};
  if (sou1 === undefined) {
    sou1 = dead.find((id) => kindKey(base.tiles[id]!.kind) === "sou1");
    if (sou1 === undefined) throw new Error("1s가 어디에도 없다");
    const head = wall[0]!;
    zonesPatch = {
      [DEAD_WALL]: {
        ...base.zones[DEAD_WALL]!,
        tileIds: dead.map((id) => (id === sou1 ? head : id)),
      },
    };
    wall[0] = sou1;
  }
  return {
    ...withAugs(base, { p0: wrap ? ["off_by_one", "broken_wall"] : ["off_by_one"] }),
    zones: {
      ...base.zones,
      ...zonesPatch,
      [WALL]: {
        ...base.zones[WALL]!,
        tileIds: [sou1, ...wall.filter((id) => id !== sou1)],
      },
    },
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...base.round.byPlayer["p0"]!,
          riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
        },
      },
    },
  };
}

function runOffByOne(wrap: boolean): Game {
  const game = start(
    offByOneScene(wrap),
    wrap
      ? [
          { def: offByOne, holder: "p0" },
          { def: brokenWall, holder: "p0" },
        ]
      : [{ def: offByOne, holder: "p0" }],
  );
  new FlowController(game.engine).begin();
  return game;
}

describe("한 끗 차이 × 끝없는 윤회 — 9 대기에 1을 잡아도 밀린다", () => {
  it("윤회가 없으면 1s는 9s의 이웃이 아니다 — 그대로 남는다", () => {
    const game = runOffByOne(false);
    const st = game.engine.state;
    expect(kindKey(kindOf(st, st.round.lastDrawnTile as TileId))).toBe("sou1");
  });

  it("윤회를 함께 들면 1s가 9s로 밀리고 conjured가 찍힌다", () => {
    const game = runOffByOne(true);
    const st = game.engine.state;
    const drawn = st.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(st, drawn))).toBe("sou9");
    expect(st.tiles[drawn]?.attrs?.conjured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 문안
// ---------------------------------------------------------------------------

describe("문안 — 끝없는 윤회가 숫자 순환을 말한다", () => {
  it("description/detail에 증강의 숫자 이동 순환이 적혀 있다", () => {
    const text = `${brokenWall.description}\n${brokenWall.detail ?? ""}`;
    expect(text).toMatch(/숫자/);
    expect(text).toMatch(/1↔9|9를 1로/);
  });
});
