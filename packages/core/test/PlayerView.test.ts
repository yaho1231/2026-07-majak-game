import { describe, expect, it } from "vitest";
import { RuleRegistry } from "../src/engine/rules/RuleRegistry.js";
import { createInitialGameState, setupRound } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import {
  WALL,
  DEAD_WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import {
  buildPlayerView,
  defineVisibilityRules,
  SPECTATOR_ID,
} from "../src/information/PlayerView.js";
import type { VisibilityRule } from "../src/information/PlayerView.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";

// ─────────────────────────── 테스트 유틸 ───────────────────────────

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function makeState(): GameState {
  const base = createInitialGameState(
    { seed: 42, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  return setupRound(base);
}

function makeRules(): RuleRegistry {
  const rules = new RuleRegistry();
  defineVisibilityRules(rules);
  return rules;
}

// ─────────────────────────── §1 표준 가시성 규칙 등록 ───────────────────────────

describe("defineVisibilityRules", () => {
  it("표준 5종 규칙이 모두 정의된다", () => {
    const rules = makeRules();
    const kinds = ["hand", "discards", "melds", "wall", "deadWall"];
    for (const kind of kinds) {
      expect(rules.has(`visibility.${kind}`)).toBe(true);
    }
  });

  it("기본값이 설계 문서와 일치한다", () => {
    const rules = makeRules();
    expect(rules.resolve<VisibilityRule>("visibility.hand")).toBe("owner");
    expect(rules.resolve<VisibilityRule>("visibility.discards")).toBe("public");
    expect(rules.resolve<VisibilityRule>("visibility.melds")).toBe("public");
    expect(rules.resolve<VisibilityRule>("visibility.wall")).toBe("hidden");
    expect(rules.resolve<VisibilityRule>("visibility.deadWall")).toBe("hidden");
  });

  it("중복 등록 시 예외 (엔진 규칙 — define 한 번만)", () => {
    const rules = makeRules();
    expect(() => defineVisibilityRules(rules)).toThrow();
  });
});

// ─────────────────────────── §2 손패 가시성 (owner) ───────────────────────────

describe("PlayerView — 손패(hand) 가시성", () => {
  it("본인은 자신의 손패 전체를 볼 수 있다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    const handZoneId = handZone("p0");
    expect(view.zones[handZoneId]?.tileIds.length).toBe(13);
    expect(view.zones[handZoneId]?.hiddenCount).toBe(0);
  });

  it("타인은 상대 손패를 볼 수 없다 (hiddenCount만 반환)", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    for (const pid of ["p1", "p2", "p3"] as PlayerId[]) {
      const z = view.zones[handZone(pid)];
      expect(z?.tileIds).toHaveLength(0);
      expect(z?.hiddenCount).toBe(13);
    }
  });

  it("tiles 메타데이터는 공개된 패에 대해서만 포함된다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    const ownHand = state.zones[handZone("p0")]?.tileIds ?? [];
    const hiddenHand = state.zones[handZone("p1")]?.tileIds ?? [];

    expect(view.tiles[ownHand[0] as TileId]?.kind).toBeDefined();
    expect(view.tiles[hiddenHand[0] as TileId]).toBeUndefined();
    for (const tileId of view.round.doraIndicators) {
      expect(view.tiles[tileId]?.kind).toBeDefined();
    }
  });

  it("p1 뷰에서는 p1 손패만 공개된다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p1", rules);
    expect(view.zones[handZone("p1")]?.tileIds.length).toBe(13);
    expect(view.zones[handZone("p0")]?.tileIds).toHaveLength(0);
    expect(view.zones[handZone("p0")]?.hiddenCount).toBe(13);
  });
});

// ─────────────────────────── §3 버림패/멜드 (public) ───────────────────────────

describe("PlayerView — 버림패/멜드(discards/melds) 가시성", () => {
  it("버림패는 전원 공개 — 모든 플레이어 뷰에서 hiddenCount=0", () => {
    const state = makeState();
    const rules = makeRules();
    for (const viewer of PLAYERS) {
      const view = buildPlayerView(state, viewer, rules);
      for (const pid of PLAYERS) {
        const z = view.zones[discardsZone(pid)];
        expect(z?.hiddenCount).toBe(0);
      }
    }
  });

  it("멜드는 전원 공개", () => {
    const state = makeState();
    const rules = makeRules();
    for (const viewer of PLAYERS) {
      const view = buildPlayerView(state, viewer, rules);
      for (const pid of PLAYERS) {
        const z = view.zones[meldsZone(pid)];
        expect(z?.hiddenCount).toBe(0);
      }
    }
  });
});

// ─────────────────────────── §4 패산/왕패 (hidden) ───────────────────────────

describe("PlayerView — 패산/왕패(wall/deadWall) 가시성", () => {
  it("패산 tileIds는 빈 배열, hiddenCount는 실제 장수", () => {
    const state = makeState();
    const rules = makeRules();
    const actual = state.zones[WALL]?.tileIds.length ?? 0;
    const view = buildPlayerView(state, "p0", rules);
    expect(view.zones[WALL]?.tileIds).toHaveLength(0);
    expect(view.zones[WALL]?.hiddenCount).toBe(actual);
  });

  it("왕패 hidden — 모든 플레이어에게 비공개", () => {
    const state = makeState();
    const rules = makeRules();
    const actual = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
    for (const viewer of PLAYERS) {
      const view = buildPlayerView(state, viewer, rules);
      expect(view.zones[DEAD_WALL]?.tileIds).toHaveLength(0);
      expect(view.zones[DEAD_WALL]?.hiddenCount).toBe(actual);
    }
  });
});

// ─────────────────────────── §5 관전자 (SPECTATOR_ID) ───────────────────────────

describe("PlayerView — 관전자(SPECTATOR_ID)", () => {
  it("관전자는 모든 Zone의 패를 볼 수 있다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, SPECTATOR_ID, rules);
    // 손패
    for (const pid of PLAYERS) {
      expect(view.zones[handZone(pid)]?.hiddenCount).toBe(0);
      expect(view.zones[handZone(pid)]?.tileIds.length).toBeGreaterThan(0);
    }
    // 패산
    expect(view.zones[WALL]?.hiddenCount).toBe(0);
    expect(view.zones[WALL]?.tileIds.length).toBeGreaterThan(0);
    // 왕패
    expect(view.zones[DEAD_WALL]?.hiddenCount).toBe(0);
    expect(view.zones[DEAD_WALL]?.tileIds.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────── §6 RoundView 공개 정보 ───────────────────────────

describe("PlayerView — RoundView", () => {
  it("기본 국 진행 정보가 포함된다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    expect(view.round.prevalentWind).toBe(1);
    expect(view.round.roundNumber).toBe(1);
    expect(view.round.doraIndicators).toHaveLength(1);
    expect(view.round.uraDoraIndicators).toBeNull();
  });

  it("byPlayer: 본인은 furiten/ippatsu 포함, 타인은 없음", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    expect(view.round.byPlayer["p0"]?.furiten).toBeDefined();
    expect(view.round.byPlayer["p0"]?.furitenReasons).toBeDefined();
    expect(view.round.byPlayer["p0"]?.ippatsu).toBeDefined();
    expect(view.round.byPlayer["p1"]?.furiten).toBeUndefined();
    expect(view.round.byPlayer["p1"]?.furitenReasons).toBeUndefined();
    expect(view.round.byPlayer["p1"]?.ippatsu).toBeUndefined();
  });

  it("byPlayer: 본인 뷰에는 후리텐 사유가 세분화된다", () => {
    const state = makeState();
    const p0 = state.round.byPlayer["p0"];
    if (p0 === undefined) throw new Error("missing p0");
    const next: GameState = {
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p0: {
            ...p0,
            furiten: true,
            temporaryFuriten: true,
            riichiFuriten: true,
          },
        },
      },
    };
    const rules = makeRules();
    const own = buildPlayerView(next, "p0", rules);
    const other = buildPlayerView(next, "p1", rules);

    expect(own.round.byPlayer["p0"]?.furiten).toBe(true);
    expect(own.round.byPlayer["p0"]?.furitenReasons).toEqual([
      "discard",
      "temporary",
      "riichi",
    ]);
    expect(other.round.byPlayer["p0"]?.furiten).toBeUndefined();
    expect(other.round.byPlayer["p0"]?.furitenReasons).toBeUndefined();
  });

  it("byPlayer: 리치 선언 여부는 전원 공개", () => {
    const state = makeState();
    const rules = makeRules();
    // 리치 선언이 없으면 riichiDeclared = false
    const view = buildPlayerView(state, "p0", rules);
    for (const pid of PLAYERS) {
      expect(view.round.byPlayer[pid]?.riichiDeclared).toBe(false);
    }
  });

  it("뒷도라는 기본적으로 null, 옵션으로 전달하면 노출된다", () => {
    const state = makeState();
    const rules = makeRules();
    const ura: TileId[] = [1, 2];
    const view = buildPlayerView(state, "p0", rules, { uraDoraIndicators: ura });
    expect(view.round.uraDoraIndicators).toEqual([1, 2]);
  });

  it("멜드 상세(치/펑/깡·호출 방향)는 전원에게 공개된다", () => {
    const state = makeState();
    const p1 = state.round.byPlayer["p1"];
    if (p1 === undefined) throw new Error("missing p1");
    const meldTileIds = (state.zones[handZone("p1")]?.tileIds ?? []).slice(0, 3) as TileId[];
    const next: GameState = {
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p1: {
            ...p1,
            melds: [
              {
                kind: "pon",
                tileIds: meldTileIds,
                calledFrom: "p0",
                calledTileId: meldTileIds[0] as TileId,
              },
            ],
          },
        },
      },
    };
    const rules = makeRules();
    const view = buildPlayerView(next, "p2", rules);
    const melds = view.round.byPlayer["p1"]?.melds;
    expect(melds).toHaveLength(1);
    expect(melds?.[0]?.kind).toBe("pon");
    expect(melds?.[0]?.calledFrom).toBe("p0");
    expect(melds?.[0]?.tileIds).toEqual(meldTileIds);
  });

  it("리치 선언패 인덱스(riichiTileIndex)는 전원에게 공개된다", () => {
    const state = makeState();
    const p0 = state.round.byPlayer["p0"];
    if (p0 === undefined) throw new Error("missing p0");
    const next: GameState = {
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p0: {
            ...p0,
            riichi: { double: false, ippatsu: true, discardIndex: 4 },
          },
        },
      },
    };
    const rules = makeRules();
    const other = buildPlayerView(next, "p1", rules);
    expect(other.round.byPlayer["p0"]?.riichiTileIndex).toBe(4);
    // 리치 선언 전에는 필드 자체가 없다
    expect(other.round.byPlayer["p1"]?.riichiTileIndex).toBeUndefined();
  });

  it("myDrawnTile: 본인 손패에 있는 쯔모패만 노출, 타인 뷰는 null", () => {
    const state = makeState();
    const drawn = state.zones[handZone("p0")]?.tileIds[0];
    if (drawn === undefined) throw new Error("missing hand tile");
    const next: GameState = {
      ...state,
      round: { ...state.round, lastDrawnTile: drawn },
    };
    const rules = makeRules();
    expect(buildPlayerView(next, "p0", rules).round.myDrawnTile).toBe(drawn);
    expect(buildPlayerView(next, "p1", rules).round.myDrawnTile).toBeNull();
    expect(buildPlayerView(next, SPECTATOR_ID, rules).round.myDrawnTile).toBe(drawn);
  });
});

// ─────────────────────────── §7 PlayerInfo (전원 공개) ───────────────────────────

describe("PlayerView — PlayerInfo", () => {
  it("players 배열에 4명이 있고, 점수·augments 포함", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    expect(view.players).toHaveLength(4);
    for (const p of view.players) {
      expect(p.score).toBe(25000);
      expect(p.augments).toEqual([]);
    }
  });
});

// ─────────────────────────── §8 증강 — 가시성 변경 ───────────────────────────

describe("PlayerView — 증강에 의한 가시성 변경", () => {
  it("손패를 public으로 바꾸면 타인도 볼 수 있다 (전역 변경 예시)", () => {
    const state = makeState();
    const rules = makeRules();
    // System 레이어 Modifier로 손패 전체 공개
    rules.addModifier<VisibilityRule>("visibility.hand", {
      source: "test_augment",
      layer: RuleLayer.System,
      apply: () => "public",
    });
    const view = buildPlayerView(state, "p0", rules);
    for (const pid of PLAYERS) {
      expect(view.zones[handZone(pid)]?.hiddenCount).toBe(0);
      expect(view.zones[handZone(pid)]?.tileIds.length).toBeGreaterThan(0);
    }
  });

  it("setHolderRule 패턴: 보유자(p0) 뷰에서만 상대 손패가 공개된다", () => {
    const state = makeState();
    const rules = makeRules();
    // p0 보유자 뷰에서만 hand → public
    rules.addModifier<VisibilityRule>("visibility.hand", {
      source: "aug:p0:third_eye",
      layer: RuleLayer.Gold,
      apply: (current, ctx) => (ctx.playerId === "p0" ? "public" : current),
    });
    // p0 뷰: 전원 손패 공개
    const viewP0 = buildPlayerView(state, "p0", rules);
    for (const pid of PLAYERS) {
      expect(viewP0.zones[handZone(pid)]?.tileIds.length).toBeGreaterThan(0);
    }
    // p1 뷰: p1 본인만 공개 (p0의 손패도 hidden)
    const viewP1 = buildPlayerView(state, "p1", rules);
    expect(viewP1.zones[handZone("p1")]?.tileIds.length).toBeGreaterThan(0);
    expect(viewP1.zones[handZone("p0")]?.tileIds).toHaveLength(0);
    expect(viewP1.zones[handZone("p0")]?.hiddenCount).toBe(13);
  });

  it("count_only: 패산 장수는 보이지만 내용은 비공개", () => {
    const state = makeState();
    const rules = makeRules();
    rules.addModifier<VisibilityRule>("visibility.wall", {
      source: "aug:p0:wall_counter",
      layer: RuleLayer.Silver,
      apply: (_, ctx) => (ctx.playerId === "p0" ? "count_only" : "hidden"),
    });
    const view = buildPlayerView(state, "p0", rules);
    expect(view.zones[WALL]?.tileIds).toHaveLength(0);
    expect(view.zones[WALL]?.hiddenCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────── §9 미정의 Zone kind 폴백 ───────────────────────────

describe("buildPlayerView — 미정의 Zone kind 폴백", () => {
  it("규칙에 없는 커스텀 Zone kind는 hidden으로 처리된다", () => {
    const state = makeState();
    const rules = makeRules();

    // 커스텀 Zone을 state에 주입
    const customZoneId = "custom:p0:secret";
    const customTileId = 999 as TileId;
    const stateWithCustom: GameState = {
      ...state,
      zones: {
        ...state.zones,
        [customZoneId]: {
          id: customZoneId,
          kind: "secret_stash",
          owner: "p0",
          tileIds: [customTileId],
        },
      },
    };

    const view = buildPlayerView(stateWithCustom, "p1", rules);
    expect(view.zones[customZoneId]?.tileIds).toHaveLength(0);
    expect(view.zones[customZoneId]?.hiddenCount).toBe(1);
  });

  it("커스텀 Zone kind에 규칙을 등록하면 그 규칙이 적용된다", () => {
    const state = makeState();
    const rules = makeRules();
    rules.define<VisibilityRule>("visibility.secret_stash", "owner");

    const customZoneId = "custom:p0:secret";
    const customTileId = 999 as TileId;
    const stateWithCustom: GameState = {
      ...state,
      zones: {
        ...state.zones,
        [customZoneId]: {
          id: customZoneId,
          kind: "secret_stash",
          owner: "p0",
          tileIds: [customTileId],
        },
      },
    };

    // 소유자(p0)는 볼 수 있다
    const viewOwner = buildPlayerView(stateWithCustom, "p0", rules);
    expect(viewOwner.zones[customZoneId]?.tileIds).toHaveLength(1);
    expect(viewOwner.zones[customZoneId]?.hiddenCount).toBe(0);

    // 타인(p1)은 볼 수 없다
    const viewOther = buildPlayerView(stateWithCustom, "p1", rules);
    expect(viewOther.zones[customZoneId]?.tileIds).toHaveLength(0);
    expect(viewOther.zones[customZoneId]?.hiddenCount).toBe(1);
  });
});

// ─────────────────────────── §10 PlayerView 불변성 ───────────────────────────

describe("buildPlayerView — 불변성", () => {
  it("반환된 뷰의 배열을 수정해도 원본 state가 바뀌지 않는다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, SPECTATOR_ID, rules);

    const originalWallLen = state.zones[WALL]?.tileIds.length ?? 0;
    (view.zones[WALL]?.tileIds as TileId[]).push(9999 as TileId);

    expect(state.zones[WALL]?.tileIds.length).toBe(originalWallLen);
  });

  it("doraIndicators 배열도 복사본이다", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    view.round.doraIndicators.push(9999 as TileId);
    expect(state.round.doraIndicators.length).toBe(1);
  });
});
