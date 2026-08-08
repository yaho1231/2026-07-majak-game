import { describe, expect, it } from "vitest";
import { RuleRegistry } from "../src/engine/rules/RuleRegistry.js";
import {
  ROUND_SCOPED_MARK,
  createInitialGameState,
  setupRound,
} from "../src/engine/state/GameState.js";
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
  isConcealedTileId,
  SPECTATOR_ID,
} from "../src/information/PlayerView.js";
import type { VisibilityRule } from "../src/information/PlayerView.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";
import { createStandardGame } from "../src/mahjong/flow/standardGame.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";

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

  it("게임 모드가 실린다 — 없으면 반장전으로 폴백", () => {
    const rules = makeRules();
    const state = makeState();
    expect(buildPlayerView(state, "p0", rules).round.mode).toBe("hanchan");

    const tonpuu: GameState = { ...state, config: { ...state.config, mode: "tonpuu" } };
    expect(buildPlayerView(tonpuu, "p0", rules).round.mode).toBe("tonpuu");
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

  it("바닥 앞쪽 패가 빠져도 리치 표식은 같은 패를 가리킨다", () => {
    /*
     * 인덱스만 들고 있으면, 도굴(grave_rob)처럼 **바닥 중간에서 패를 빼 가는** 증강이
     * 지나간 뒤 뒤쪽 패가 한 칸씩 당겨져 **엉뚱한 패가 눕혀 표시된다**
     * (docs/25 손패 조작 #4). 표식은 자리가 아니라 그 패를 따라가야 한다.
     */
    const base = makeState();
    const p0 = base.round.byPlayer["p0"];
    if (p0 === undefined) throw new Error("missing p0");
    // p0 바닥에 6장을 깔아 둔다 (패산 앞에서 빌려 온다)
    const wall = base.zones[WALL]?.tileIds ?? [];
    const river = wall.slice(0, 6);
    const zone = base.zones[discardsZone("p0")];
    if (zone === undefined) throw new Error("no discards zone");
    const state: GameState = {
      ...base,
      zones: {
        ...base.zones,
        [discardsZone("p0")]: { ...zone, tileIds: river },
      },
    };
    const declaredId = river[4];
    if (declaredId === undefined) throw new Error("river too short");

    const declared: GameState = {
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p0: {
            ...p0,
            riichi: {
              double: false,
              ippatsu: true,
              discardIndex: 4,
              discardTileId: declaredId,
            },
          },
        },
      },
    };
    const rules = makeRules();
    expect(buildPlayerView(declared, "p1", rules).round.byPlayer["p0"]?.riichiTileIndex)
      .toBe(4);

    // 선언패보다 **앞의** 패 한 장이 바닥에서 빠져나간다 (도굴)
    const robbed: GameState = {
      ...declared,
      zones: {
        ...declared.zones,
        [discardsZone("p0")]: {
          ...zone,
          tileIds: river.filter((id) => id !== river[1]),
        },
      },
    };
    const after = buildPlayerView(robbed, "p1", rules);
    // 인덱스는 3으로 당겨지지만, 가리키는 패는 여전히 선언패 그대로여야 한다
    const afterRiver = after.zones[discardsZone("p0")]?.tileIds ?? [];
    const idx = after.round.byPlayer["p0"]?.riichiTileIndex;
    expect(idx).toBe(3);
    expect(afterRiver[idx as number]).toBe(declaredId);
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

describe("증강 뷰 채널 — 비워진 값·국 스코프 표식", () => {
  function stateWith(augmentData: Record<string, unknown>): GameState {
    const base = setupRound(
      createInitialGameState(
        { seed: 3, playerIds: ["p0", "p1", "p2", "p3"] },
        { startScore: 25000, redFivesPerSuit: 1 },
      ),
    );
    return { ...base, augmentData };
  }

  it('""·null로 비운 채널은 아예 내려가지 않는다 (빈 배지가 남지 않게)', () => {
    const rules = new RuleRegistry();
    defineVisibilityRules(rules);
    const view = buildPlayerView(
      stateWith({
        "view:*:riichi_seal:p0": "",
        "view:*:rank_gate:p0": null,
        "view:*:parasite:p0": "p1",
      }),
      "p1",
      rules,
    );
    expect(view.augmentView["riichi_seal:p0"]).toBeUndefined();
    expect(view.augmentView["rank_gate:p0"]).toBeUndefined();
    expect(view.augmentView["parasite:p0"]).toBe("p1");
  });

  it("국 스코프 표식은 클라이언트에 넘기기 전에 채널 이름에서 떨어진다", () => {
    const rules = new RuleRegistry();
    defineVisibilityRules(rules);
    const view = buildPlayerView(
      stateWith({ [`view:*:jackpot:p0${ROUND_SCOPED_MARK}`]: "3배" }),
      "p1",
      rules,
    );
    expect(view.augmentView["jackpot:p0"]).toBe("3배");
    expect(view.augmentView[`jackpot:p0${ROUND_SCOPED_MARK}`]).toBeUndefined();
  });
});

// ─────────────────────────── §N 손패 배치 (handOrder) ───────────────────────────

describe("손패 배치 — 모든 뷰어가 소유자가 정한 순서를 본다", () => {
  /** p0의 손패를 원하는 종류로 갈아끼우고 그 tileId 목록을 돌려준다 */
  function handOf(state: GameState): TileId[] {
    return [...(state.zones[handZone("p0")]?.tileIds ?? [])];
  }

  it("배치가 없으면 표준 정렬(만→통→삭→풍→삼원)로 보인다 — 봇 손패 폴백", () => {
    const state = makeState();
    const rules = makeRules();
    const view = buildPlayerView(state, "p0", rules);
    const shown = view.zones[handZone("p0")]?.tileIds ?? [];
    const order = shown.map((id) => {
      const k = state.tiles[id]?.kind as TileKind;
      return { suit: k.suit, rank: k.rank };
    });
    const rank = (s: string): number =>
      ({ man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 })[s] ?? 9;
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1]!;
      const b = order[i]!;
      expect(rank(a.suit) * 100 + a.rank).toBeLessThanOrEqual(rank(b.suit) * 100 + b.rank);
    }
  });

  it("소유자가 정한 배치가 본인·타인·관전자 뷰에 똑같이 실린다", () => {
    const state = makeState();
    const rules = makeRules();
    const hand = handOf(state);
    // 일부러 표준 정렬과 다른 순서 (뒤집기)
    const arranged = [...hand].reverse();

    const own = buildPlayerView(state, "p0", rules, { handOrder: { p0: arranged } });
    expect(own.zones[handZone("p0")]?.tileIds).toEqual(arranged);

    // 타인에게는 내용이 안 보이지만(뒷면) 장수는 그대로다
    const other = buildPlayerView(state, "p1", rules, { handOrder: { p0: arranged } });
    expect(other.zones[handZone("p0")]?.tileIds).toEqual([]);
    expect(other.zones[handZone("p0")]?.hiddenCount).toBe(arranged.length);

    // 관전자는 전부 공개 — 소유자가 쥔 배치 그대로여야 한다
    const spec = buildPlayerView(state, SPECTATOR_ID, rules, { handOrder: { p0: arranged } });
    expect(spec.zones[handZone("p0")]?.tileIds).toEqual(arranged);
  });

  it("낡은 배치를 흡수한다 — 없는 패는 무시하고, 새로 들어온 패는 맨 뒤", () => {
    const state = makeState();
    const rules = makeRules();
    const hand = handOf(state);
    // 손패에서 2장을 뺀 배치 + 이미 손을 떠난 가짜 id
    const stale = [...hand.slice(2), 999];

    const view = buildPlayerView(state, SPECTATOR_ID, rules, { handOrder: { p0: stale } });
    const shown = view.zones[handZone("p0")]?.tileIds ?? [];
    expect(shown.length).toBe(hand.length);
    expect(shown).not.toContain(999);
    // 배치에 있던 패가 먼저, 배치에 없던 2장은 뒤로 밀린다
    expect(shown.slice(0, hand.length - 2)).toEqual(hand.slice(2));
    expect(new Set(shown.slice(hand.length - 2))).toEqual(new Set(hand.slice(0, 2)));
  });

  it("엿보기(앞 N장)도 소유자의 배치 기준으로 잘린다", () => {
    const state = makeState();
    const rules = makeRules();
    rules.addModifier<VisibilityRule>("visibility.hand", {
      source: "test_peek",
      layer: RuleLayer.System,
      apply: () => ({ mode: "peek", count: 3 }),
    });
    const arranged = [...handOf(state)].reverse();

    const view = buildPlayerView(state, "p1", rules, { handOrder: { p0: arranged } });
    expect(view.zones[handZone("p0")]?.tileIds).toEqual(arranged.slice(0, 3));
  });
});

// ───────────────── §N 쯔모패 분리 · 쯔모기리 · 버림 자리 (전원 공개) ─────────────────

describe("쯔모패와 버림 자리 — 상대·관전자도 읽을 수 있어야 한다", () => {
  /** p0에게 패산에서 한 장 쥐여 주고 그 tileId를 돌려준다 (쯔모 흉내) */
  function giveDraw(state: GameState): { state: GameState; drawn: TileId } {
    const wall = state.zones[WALL]?.tileIds ?? [];
    const drawn = wall[0] as TileId;
    const hand = state.zones[handZone("p0")]?.tileIds ?? [];
    return {
      state: {
        ...state,
        zones: {
          ...state.zones,
          [WALL]: { ...state.zones[WALL]!, tileIds: wall.slice(1) },
          [handZone("p0")]: {
            ...state.zones[handZone("p0")]!,
            tileIds: [...hand, drawn],
          },
        },
        round: { ...state.round, lastDrawnTile: drawn },
      },
      drawn,
    };
  }

  it("쯔모패는 배치가 없어도 맨 뒤에 놓이고, 전원이 '따로 쥐고 있음'을 본다", () => {
    const { state, drawn } = giveDraw(makeState());
    const rules = makeRules();

    // 관전자 뷰: 배치의 마지막 한 장이 쯔모패
    const spec = buildPlayerView(state, SPECTATOR_ID, rules);
    const shown = spec.zones[handZone("p0")]?.tileIds ?? [];
    expect(shown[shown.length - 1]).toBe(drawn);
    expect(spec.round.byPlayer["p0"]?.drawnSeparated).toBe(true);

    // 손패 내용은 안 보이는 상대에게도 '따로 쥐고 있다'는 사실은 공개된다
    const other = buildPlayerView(state, "p1", rules);
    expect(other.zones[handZone("p0")]?.tileIds).toEqual([]);
    expect(other.round.byPlayer["p0"]?.drawnSeparated).toBe(true);
  });

  it("쯔모패를 손패 사이로 옮겨 배치하면 분리 표시가 사라진다", () => {
    const { state, drawn } = giveDraw(makeState());
    const rules = makeRules();
    const hand = state.zones[handZone("p0")]?.tileIds ?? [];
    // 쯔모패를 맨 앞으로 끌어다 놓은 배치
    const arranged = [drawn, ...hand.filter((id) => id !== drawn)];

    const view = buildPlayerView(state, "p1", rules, { handOrder: { p0: arranged } });
    expect(view.round.byPlayer["p0"]?.drawnSeparated).toBe(false);
  });

  it("버리면 쯔모패 분리가 즉시 풀린다 (다음 쯔모까지 떠 있지 않는다)", () => {
    const game = createStandardGame({ seed: 7 });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const turnPlayer = status.prompts[0]!.player;
    const drawn = game.engine.state.round.lastDrawnTile;
    expect(drawn).not.toBeNull();

    // 쯔모패가 **아닌** 패를 버린다 (손버림)
    const discard = status.prompts[0]!.options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId !== drawn,
    );
    if (discard === undefined) throw new Error("no tedashi option");
    flow.submit(turnPlayer, discard as { type: string; payload: unknown });

    // 버린 사람의 쯔모패는 손에 섞였다 — 흐름이 다음 사람의 쯔모까지 진행되므로
    // round.lastDrawnTile은 이제 **그 다음 사람의** 패다. 버린 사람 것이면 안 된다.
    expect(game.engine.state.round.lastDrawnTile).not.toBe(drawn);
    const view = buildPlayerView(game.engine.state, SPECTATOR_ID, game.engine.rules);
    expect(view.round.byPlayer[turnPlayer]?.drawnSeparated).toBe(false);
    // 그 사람 손패 어디에도 쯔모패가 끝에 떨어져 있지 않다 (배치에 섞였다)
    const hand = view.zones[handZone(turnPlayer)]?.tileIds ?? [];
    expect(hand).toContain(drawn);
    // 손버림이므로 쯔모기리 표식은 붙지 않는다
    expect(view.round.byPlayer[turnPlayer]?.tsumogiriIds).toEqual([]);
  });

  it("쯔모기리로 버리면 그 패에 표식이 남고, 전원이 본다", () => {
    const game = createStandardGame({ seed: 7 });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const turnPlayer = status.prompts[0]!.player;
    const drawn = game.engine.state.round.lastDrawnTile as TileId;

    const discard = status.prompts[0]!.options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId === drawn,
    );
    if (discard === undefined) throw new Error("no tsumogiri option");
    flow.submit(turnPlayer, discard as { type: string; payload: unknown });

    for (const viewer of [turnPlayer, "p1", "p2", SPECTATOR_ID]) {
      const view = buildPlayerView(game.engine.state, viewer, game.engine.rules);
      expect(view.round.byPlayer[turnPlayer]?.tsumogiriIds).toEqual([drawn]);
    }
  });

  it("버림 자리는 지금 바닥에 있는 그 버림패의 것일 때만 실린다", () => {
    const state = makeState();
    const rules = makeRules();
    const origin = { player: "p0", tileId: 5, index: 3, handSize: 14, tsumogiri: false };

    // lastDiscard가 없으면(아직 아무도 안 버림) 표식도 없다
    expect(buildPlayerView(state, "p1", rules, { lastDiscardFrom: origin }).round.lastDiscardFrom)
      .toBeNull();

    // lastDiscard와 짝이 맞을 때만 싣는다
    const discarded: GameState = {
      ...state,
      round: { ...state.round, lastDiscard: { player: "p0", tileId: 5 } },
    };
    expect(
      buildPlayerView(discarded, "p1", rules, { lastDiscardFrom: origin }).round.lastDiscardFrom,
    ).toEqual(origin);

    // 다른 패가 버려진 뒤라면 낡은 표식은 버린다
    const moved: GameState = {
      ...state,
      round: { ...state.round, lastDiscard: { player: "p0", tileId: 9 } },
    };
    expect(
      buildPlayerView(moved, "p1", rules, { lastDiscardFrom: origin }).round.lastDiscardFrom,
    ).toBeNull();
  });
});

// ────────────── §12 가려진 도라 × 왕패 열람 — 자리는 맞고 정체는 가려진다 ──────────────

/**
 * 가려진 도라(dora_conceal)는 왕패를 여는 증강(왕패의 주인·이면투시 등)의 뷰에서
 * **도라 표시패 실물**도 가려야 한다. 예전에는 배열에서 통째로 뺐는데, 왕패는
 * 자리 번호가 곧 의미(0번=다음 영상패, 뒤 10장=표시패 블록)이고 왕패의 주인이
 * 그 자리 번호를 그대로 서버에 보낸다 — 표시패 뒤의 모든 자리가 한 칸씩 밀려
 * 화면에서 고른 것과 **다른 패**가 교환됐다(docs/28 §2-9).
 *
 * 지금은 자리표(음수 id)로 치환한다: 자리는 맞고, 정체는 여전히 전선에 없다.
 */
describe("PlayerView — 가려진 도라 × 왕패 열람", () => {
  /** 왕패가 p0에게 전부 보이고, 그 p0에게만 도라 표시패가 가려진 규칙 */
  function concealRules(): RuleRegistry {
    const rules = makeRules();
    rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: "aug:p0:dead_wall_master",
      layer: RuleLayer.Gold,
      apply: (current, ctx) => (ctx.playerId === "p0" ? "public" : current),
    });
    rules.addModifier<boolean>("visibility.doraIndicators.hidden", {
      source: "aug:p1:dora_conceal",
      layer: RuleLayer.Silver,
      apply: (current, ctx) => (ctx.playerId === "p0" ? true : current),
    });
    return rules;
  }

  it("왕패 뷰의 자리 수와 자리별 정렬이 실제 왕패와 같다", () => {
    const state = makeState();
    const real = state.zones[DEAD_WALL]?.tileIds ?? [];
    const indicators = new Set(state.round.doraIndicators);
    expect(indicators.size).toBeGreaterThan(0);

    const view = buildPlayerView(state, "p0", concealRules());
    const seen = view.zones[DEAD_WALL]?.tileIds ?? [];

    // 자리 수가 같다 — 예전에는 표시패 수만큼 짧아져 뒷자리가 전부 밀렸다
    expect(seen).toHaveLength(real.length);
    for (const [i, id] of real.entries()) {
      if (indicators.has(id)) {
        expect(isConcealedTileId(seen[i] as TileId)).toBe(true);
      } else {
        expect(seen[i]).toBe(id);
      }
    }
    // 장수 계산(tileIds + hiddenCount)도 실제 왕패 장수 그대로
    expect(seen.length + (view.zones[DEAD_WALL]?.hiddenCount ?? 0)).toBe(real.length);
  });

  it("가려진 표시패의 정체는 뷰 어디에서도 유도할 수 없다", () => {
    const state = makeState();
    const view = buildPlayerView(state, "p0", concealRules());
    const hiddenIds = state.round.doraIndicators;
    expect(hiddenIds.length).toBeGreaterThan(0);

    for (const id of hiddenIds) {
      // ① 진짜 tile id가 뷰 어느 Zone에도 실려 있지 않다
      //    (id는 덱 생성 순서라 그 자체로 종류를 드러낸다 — buildStandardTileSet)
      for (const zone of Object.values(view.zones)) {
        expect(zone.tileIds).not.toContain(id);
      }
      // ② tiles 맵에도 없다 → 종류·적도라 여부 어느 것도 알 수 없다
      expect(view.tiles[id]).toBeUndefined();
      // ③ RoundView의 도라 표시패 목록에서도 빠져 있다
      expect(view.round.doraIndicators).not.toContain(id);
      // ④ 직렬화한 전선 어디에도 그 id가 없다
      expect(JSON.stringify(view)).not.toContain(`"id":${id},`);
    }
    // 자리표 id 역시 tiles 맵에 없다 (뒷면으로 그려질 뿐)
    for (const seen of view.zones[DEAD_WALL]?.tileIds ?? []) {
      if (isConcealedTileId(seen)) expect(view.tiles[seen]).toBeUndefined();
    }
  });

  it("가려진 도라가 없는 뷰어는 왕패를 예전 그대로 본다", () => {
    const state = makeState();
    const rules = makeRules();
    rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: "aug:p0:dead_wall_master",
      layer: RuleLayer.Gold,
      apply: (current, ctx) => (ctx.playerId === "p0" ? "public" : current),
    });
    const view = buildPlayerView(state, "p0", rules);
    expect(view.zones[DEAD_WALL]?.tileIds).toEqual(state.zones[DEAD_WALL]?.tileIds);
  });
});
