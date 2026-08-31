/**
 * 다중 보유 면제 술어 회귀 — 2026-08-31 QA synergy4(계획서 §4).
 *
 * 이 파일이 붙잡는 것은 전부 «**보유자가 둘 이상일 때** 술어가 자기 인스턴스 하나만
 * 알아본다»는 한 가지 모양이다.
 *
 * - **B-10** `dora_conceal` 둘 → 서로의 모디파이어에 걸려 **양쪽 다** 자기 도라를 잃었다.
 *   면제 술어를 `fogScope.holdsAugmentNow`(= 지금 그 증강을 든 사람이면 누구든)로 올렸다.
 * - **C-3** `mirror_dora`가 은폐를 **산수로** 뚫었다(앞도라는 표시패의 정확한 역함수).
 *   사용자 결정으로 구현을 고쳤다 — 은폐 중에는 거울 보유자도 앞도라 목록을 못 받는다.
 *   점수(`scoring.extraDoraKinds`)는 그대로다.
 * - **C-2** `disarm` 둘 → 국 경계 리액션이 해제 목록 **전체를 다시 써서** 마지막 쓰기만
 *   이기고 잠금이 하나 남았다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  DISARMED_SOURCES_KEY,
  FlowController,
  ROUND_SCOPED_MARK,
  SPECTATOR_ID,
  WALL,
  augmentInstanceId,
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
  isConcealedTileId,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
  Zone,
  ZoneId,
} from "@majak/core";
import { craft, h } from "./helpers.js";
import { holdsAugmentNow } from "../src/augments/fogScope.js";
import { counter } from "../src/augments/counter.js";
import { disarm } from "../src/augments/disarm.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { parasite } from "../src/augments/parasite.js";

// ── 픽스처 ─────────────────────────────────────────────────────────────────

function zoneOf(state: GameState, id: ZoneId): Zone {
  const z = state.zones[id];
  if (z === undefined) throw new Error(`no zone ${id}`);
  return z;
}
const tilesOf = (state: GameState, id: ZoneId): TileId[] => [...zoneOf(state, id).tileIds];

interface Install {
  def: AugmentDef;
  holder: PlayerId;
}

function setup(state: GameState, installs: readonly Install[]) {
  const ids = new Map<PlayerId, string[]>();
  for (const i of installs) ids.set(i.holder, [...(ids.get(i.holder) ?? []), i.def.id]);
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(ids.get(p.id) ?? [])],
    })),
  };
  const game = createStandardGameFromState(seeded);
  for (const i of installs) installAugment(game.engine, i.def, i.holder, { yaku: game.yaku });
  return game;
}
type Game = ReturnType<typeof setup>;

function base(): GameState {
  return craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 패산에 그 종류를 확보한다 (다른 좌석 손패와 맞바꾼다) */
function reserveInWall(state: GameState, spec: string): GameState {
  const want = kindKey(h(spec)[0] as TileKind);
  let st = state;
  if (tilesOf(st, WALL).some((id) => kindKey(kindOf(st, id)) === want)) return st;
  for (const d of ["p1", "p2", "p3"] as PlayerId[]) {
    const hz = `hand:${d}` as ZoneId;
    const hand = tilesOf(st, hz);
    const hi = hand.findIndex((id) => kindKey(kindOf(st, id)) === want);
    if (hi < 0) continue;
    const wallIds = tilesOf(st, WALL);
    const swapId = hand[hi] as TileId;
    hand[hi] = wallIds[0] as TileId;
    wallIds[0] = swapId;
    st = {
      ...st,
      zones: {
        ...st.zones,
        [hz]: { ...zoneOf(st, hz), tileIds: hand },
        [WALL]: { ...zoneOf(st, WALL), tileIds: wallIds },
      },
    };
    return st;
  }
  throw new Error(`cannot reserve ${spec}`);
}

/** 도라 표시패를 원하는 종류로 갈아 끼운다 */
function setIndicator(state: GameState, spec: string): GameState {
  const want = kindKey(h(spec)[0] as TileKind);
  const dead = tilesOf(state, DEAD_WALL);
  const wallIds = tilesOf(state, WALL);
  const idx = dead.length - 10;
  const cur = dead[idx] as TileId;
  if (kindKey(kindOf(state, cur)) === want) return state;
  const wi = wallIds.findIndex((id) => kindKey(kindOf(state, id)) === want);
  if (wi < 0) throw new Error(`no ${spec} left in wall`);
  dead[idx] = wallIds[wi] as TileId;
  wallIds[wi] = cur;
  return {
    ...state,
    zones: {
      ...state.zones,
      [DEAD_WALL]: { ...zoneOf(state, DEAD_WALL), tileIds: dead },
      [WALL]: { ...zoneOf(state, WALL), tileIds: wallIds },
    },
    round: {
      ...state.round,
      doraIndicators: state.round.doraIndicators.map((id, i) =>
        i === 0 ? (dead[idx] as TileId) : id,
      ),
    },
  };
}

/** 표시패 4m 짜리 판 (표준 도라 5m · 거울의 앞도라 3m) */
function scene(installs: readonly Install[]): Game {
  let st = base();
  st = reserveInWall(st, "4m");
  st = setIndicator(st, "4m");
  const game = setup(st, installs);
  // 거울의 announce는 매 이벤트마다 도는 리액션이라 흐름을 한 번 태운다
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind === "awaiting") {
    const prompt = status.prompts.find((p) => p.player === "p0");
    const d = prompt?.options.find((o) => o.type === "discard");
    if (d !== undefined) flow.submit("p0", d);
  }
  return game;
}

/** 그 좌석에게 보이는 도라 표시패 종류 */
function doraKindsFor(game: Game, viewer: PlayerId): string[] {
  const v = buildPlayerView(game.engine.state, viewer, game.engine.rules);
  return v.round.doraIndicators.map((id) => kindKey(v.tiles[id]?.kind as TileKind));
}

function channels(game: Game, viewer: PlayerId | typeof SPECTATOR_ID): Record<string, unknown> {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules).augmentView ?? {};
}

// ── B-10 ───────────────────────────────────────────────────────────────────

describe("B-10 가려진 도라 — 보유자가 둘이어도 둘 다 자기 도라를 본다", () => {
  it("단독이면 예전 그대로 (보유자만 본다)", () => {
    const game = scene([{ def: doraConceal, holder: "p0" }]);
    expect(doraKindsFor(game, "p0")).toEqual(["man4"]);
    expect(doraKindsFor(game, "p1")).toEqual([]);
    expect(doraKindsFor(game, SPECTATOR_ID as PlayerId)).toEqual(["man4"]);
  });

  it("둘이 들면 둘 다 본다 — 예전에는 서로의 모디파이어에 걸려 양쪽 다 실명했다", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: doraConceal, holder: "p1" },
    ]);
    expect(doraKindsFor(game, "p0")).toEqual(["man4"]);
    expect(doraKindsFor(game, "p1")).toEqual(["man4"]);
    // 안 든 좌석은 여전히 못 본다 (능력이 약해진 것이 아니다)
    expect(doraKindsFor(game, "p2")).toEqual([]);
    expect(doraKindsFor(game, "p3")).toEqual([]);
  });

  it("가려진 좌석의 왕패에는 자리표가 남아 열린 자리 수가 보존된다 (C-4의 근거)", () => {
    // 왕패를 여는 증강(왕패의 주인)을 든 좌석이라야 왕패 zone이 뷰에 실린다 —
    // C-4가 문제가 되는 화면이 정확히 그 모달이다.
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: deadWallMaster, holder: "p1" },
    ]);
    const v = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    const ids = v.zones["deadWall"]?.tileIds ?? [];
    // 클라이언트의 flippedIndicatorCount 와 같은 식: 보이는 표시패 + 자리표
    const flipped = v.round.doraIndicators.length + ids.filter((id) => isConcealedTileId(id)).length;
    expect(v.round.doraIndicators).toHaveLength(0);
    expect(flipped).toBe(game.engine.state.round.doraIndicators.length);
    expect(flipped).toBeGreaterThan(0);
  });

  it("술어는 «지금 들고 있는가» — 무장해제로 잠긴 인스턴스는 면제되지 않는다", () => {
    const game = scene([{ def: doraConceal, holder: "p0" }]);
    const st = game.engine.state;
    expect(holdsAugmentNow(st, "p0", "dora_conceal")).toBe(true);
    expect(holdsAugmentNow(st, "p1", "dora_conceal")).toBe(false);
    const locked: GameState = {
      ...st,
      augmentData: {
        ...st.augmentData,
        [DISARMED_SOURCES_KEY]: [augmentInstanceId("p0", "dora_conceal")],
      },
    };
    expect(holdsAugmentNow(locked, "p0", "dora_conceal")).toBe(false);
  });
});

// ── C-3 ────────────────────────────────────────────────────────────────────

describe("C-3 거울 — 은폐 중에는 보유자 본인도 앞도라 목록을 못 받는다", () => {
  it("가리는 사람이 없으면 예전처럼 전원 공개", () => {
    const game = scene([{ def: mirrorDora, holder: "p1" }]);
    expect(channels(game, "p1")["mirror_dora:p1"]).toEqual(["man3"]);
    expect(channels(game, "p2")["mirror_dora:p1"]).toEqual(["man3"]);
  });

  it("은폐 국에서는 거울 보유자에게도 가지 않는다 (앞도라 = 표시패의 역함수)", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: mirrorDora, holder: "p1" },
    ]);
    expect(doraKindsFor(game, "p1")).toEqual([]); // 표시패를 못 본다 (전제)
    expect(channels(game, "p1")["mirror_dora:p1"]).toBeUndefined();
    expect(channels(game, "p2")["mirror_dora:p1"]).toBeUndefined();
    expect(channels(game, "p3")["mirror_dora:p1"]).toBeUndefined();
    // 표시패를 실제로 보는 은닉자에게는 숨길 것이 없다
    expect(channels(game, "p0")["mirror_dora:p1"]).toEqual(["man3"]);
  });

  it("자기가 은폐를 함께 들면 그대로 본다 (표시패가 보이니까)", () => {
    const game = scene([
      { def: doraConceal, holder: "p1" },
      { def: mirrorDora, holder: "p1" },
    ]);
    expect(channels(game, "p1")["mirror_dora:p1"]).toEqual(["man3"]);
    expect(channels(game, "p2")["mirror_dora:p1"]).toBeUndefined();
  });

  it("남들이 전부 은폐를 들어 거울만 가려져도 공개 채널이 켜지지 않는다", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: doraConceal, holder: "p2" },
      { def: doraConceal, holder: "p3" },
      { def: mirrorDora, holder: "p1" },
    ]);
    expect(channels(game, "p1")["mirror_dora:p1"]).toBeUndefined();
  });

  it("점수는 그대로 붙는다 — 가려지는 것은 «무엇이 내 앞도라인지»라는 정보뿐", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: mirrorDora, holder: "p1" },
    ]);
    const kinds = game.engine.rules.resolve<readonly TileKind[]>("scoring.extraDoraKinds", {
      playerId: "p1",
      state: game.engine.state,
    });
    expect(kinds.map(kindKey)).toContain("man3");
  });
});

// ── C-2 ────────────────────────────────────────────────────────────────────

describe("C-2 무장해제 — 둘 이상이 들어도 국 경계에 잠금이 남지 않는다", () => {
  const lockedKey = (holder: PlayerId): string => `disarm:locked:${holder}${ROUND_SCOPED_MARK}`;

  /** p0가 9s 론 화료 직전 + 이미 잠가 둔 목록을 심은 판 */
  function disarmScene(locks: readonly [PlayerId, PlayerId, string][]): Game {
    const srcs = locks.map(([, t, a]) => augmentInstanceId(t, a));
    let st = craft({
      hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const data: Record<string, unknown> = { [DISARMED_SOURCES_KEY]: srcs };
    for (const [holder] of locks) {
      data[lockedKey(holder)] = locks
        .filter((l) => l[0] === holder)
        .map(([, t, a]) => augmentInstanceId(t, a));
    }
    st = { ...st, augmentData: { ...st.augmentData, ...data } };
    const installs: Install[] = [];
    for (const [holder, target, augId] of locks) {
      installs.push({ def: disarm, holder });
      const def = augId === "counter" ? counter : parasite;
      installs.push({ def, holder: target });
    }
    return setup(st, installs);
  }

  /** p0의 쯔모 화료로 국을 끝낸다 */
  function settle(game: Game): void {
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 12) {
      const prompt = status.prompts[0];
      if (prompt === undefined) break;
      const pick =
        prompt.options.find((o) => o.type === "win") ??
        prompt.options.find((o) => o.type === "pass") ??
        prompt.options[0];
      if (pick === undefined) break;
      status = flow.submit(prompt.player, pick);
    }
  }

  function disarmedAfter(game: Game): unknown {
    settle(game);
    return game.engine.state.augmentData[DISARMED_SOURCES_KEY];
  }

  it("보유자 한 명이면 예전 그대로 전부 풀린다", () => {
    const game = disarmScene([["p0", "p1", "counter"]]);
    expect(game.engine.state.augmentData[DISARMED_SOURCES_KEY]).toEqual(["aug:p1:counter"]);
    expect(disarmedAfter(game)).toEqual([]);
  });

  it("둘이 각각 잠갔으면 둘 다 풀린다 — 예전에는 마지막 쓰기만 이겨 하나가 남았다", () => {
    const game = disarmScene([
      ["p0", "p1", "counter"],
      ["p2", "p3", "parasite"],
    ]);
    expect(disarmedAfter(game)).toEqual([]);
  });

  it("셋이 잠가도 전부 풀린다", () => {
    const game = disarmScene([
      ["p0", "p1", "counter"],
      ["p2", "p3", "parasite"],
      ["p3", "p1", "counter"],
    ]);
    expect(disarmedAfter(game)).toEqual([]);
  });

  it("잠금 목록(locked)도 자기 것만 비운다", () => {
    const game = disarmScene([
      ["p0", "p1", "counter"],
      ["p2", "p3", "parasite"],
    ]);
    settle(game);
    expect(game.engine.state.augmentData[lockedKey("p0")]).toEqual([]);
    expect(game.engine.state.augmentData[lockedKey("p2")]).toEqual([]);
  });
});
