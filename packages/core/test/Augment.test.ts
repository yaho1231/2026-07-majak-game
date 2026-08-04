import { describe, expect, it } from "vitest";
import { Prng } from "../src/engine/random/Prng.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import type { Meld } from "../src/engine/state/GameState.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import {
  createStandardGame,
  createStandardGameFromState,
} from "../src/mahjong/flow/standardGame.js";
import { AugmentRegistry } from "../src/augment/AugmentRegistry.js";
import { defineAugment, installAugment } from "../src/augment/Augment.js";
import { DraftController, rebuildAugments } from "../src/augment/DraftController.js";
import { standardAugments } from "../src/augment/standardAugments.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function craft(cfg: {
  hands: Record<PlayerId, string>;
  discards?: Record<PlayerId, string>;
  melds?: Partial<Record<PlayerId, { kind: Meld["kind"]; spec: string }[]>>;
  phase: string;
  turnSeat: number;
  drawnLastFor?: PlayerId;
  lastDiscard?: { player: PlayerId; spec: string };
}): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };

  const zones = { ...base.zones };
  const byPlayer = { ...base.round.byPlayer };
  let lastDiscardRef: { player: PlayerId; tileId: TileId } | null = null;

  const fillLater: PlayerId[] = [];
  for (const p of PLAYERS) {
    const spec = cfg.hands[p] ?? "";
    if (spec === "*") {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    } else {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(spec).map(take),
      };
    }
    const meldTiles: TileId[] = [];
    const melds: Meld[] = (cfg.melds?.[p] ?? []).map((m) => {
      const ids = h(m.spec).map(take);
      meldTiles.push(...ids);
      return { kind: m.kind, tileIds: ids };
    });
    zones[meldsZone(p)] = {
      ...createZone(meldsZone(p), "melds", p),
      tileIds: meldTiles,
    };
    const discardIds = h(cfg.discards?.[p] ?? "").map(take);
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: discardIds,
    };
    byPlayer[p] = {
      riichi: null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
      discardCount: h(cfg.discards?.[p] ?? "").length,
      tsumogiriIds: [],
    };
  }

  if (cfg.lastDiscard !== undefined) {
    const kind = h(cfg.lastDiscard.spec)[0] as TileKind;
    const tileId = take(kind);
    zones[discardsZone(cfg.lastDiscard.player)] = {
      ...(zones[discardsZone(cfg.lastDiscard.player)] as ReturnType<typeof createZone>),
      tileIds: [
        ...(zones[discardsZone(cfg.lastDiscard.player)]?.tileIds ?? []),
        tileId,
      ],
    };
    lastDiscardRef = { player: cfg.lastDiscard.player, tileId };
  }

  let rest = [...pool.values()].flat().sort((a, b) => a - b);
  // "*" 손패는 남은 패에서 13장씩 자동 채움 (내용 무관, 노텐 상관없는 자리)
  for (const p of fillLater) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: rest.slice(0, 13),
    };
    rest = rest.slice(13);
  }
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

  const drawn =
    cfg.drawnLastFor === undefined
      ? null
      : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null);

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: cfg.phase,
      turnSeat: cfg.turnSeat,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: drawn,
      lastDiscard: lastDiscardRef,
      // 게임 중간 스냅샷 의미 — 첫 바퀴 아님 (천화·지화 오판 방지)
      firstTurn: false,
      byPlayer,
    },
  };
}

function winValidate(
  game: ReturnType<typeof createStandardGameFromState>,
  player: PlayerId,
): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

describe("defineAugment", () => {
  it("id는 snake_case여야 한다", () => {
    expect(() =>
      defineAugment({
        id: "Bad Id",
        tier: "silver",
        category: "etc",
        name: "x",
        description: "y",
        install: () => {},
      }),
    ).toThrow("snake_case");
  });
});

describe("AugmentRegistry.rollUniform", () => {
  const catalog = new AugmentRegistry();
  catalog.addAll(standardAugments);

  it("서로 다른 count개를 뽑고, 같은 시드면 같은 결과 (결정성)", () => {
    const a = catalog.rollUniform(new Prng(5), 3).map((d) => d.id);
    const b = catalog.rollUniform(new Prng(5), 3).map((d) => d.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it("등급과 무관하게 카탈로그 전체에서 뽑는다 (52차 등급 폐기)", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      for (const d of catalog.rollUniform(new Prng(seed), 3)) seen.add(d.tier);
    }
    // 표준 카탈로그에는 gold·prism이 섞여 있고, 등급으로 걸러지지 않는다
    expect(seen.size).toBeGreaterThan(1);
  });

  it("exclude된 증강은 제외된다", () => {
    const picks = catalog.rollUniform(new Prng(9), 5, new Set(["iron_wall"]));
    expect(picks.some((d) => d.id === "iron_wall")).toBe(false);
  });

  it("카탈로그가 부족하면 있는 만큼만 반환", () => {
    const small = new AugmentRegistry();
    small.add(standardAugments[0] as (typeof standardAugments)[number]);
    expect(small.rollUniform(new Prng(1), 3)).toHaveLength(1);
  });
});

describe("증강 효과 — Rule Modifier", () => {
  it("iron_wall: 후리텐이어도 보유자는 론 가능", () => {
    const state = craft({
      hands: {
        p0: "234m345p345s678s5s", // 5s 단기 (탕야오) — furiten 걸림
        p1: "*",
        p2: "*",
        p3: "*",
      },
      discards: { p0: "5s" }, // 대기패를 이미 버림 → 후리텐
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5s" },
    });
    const game = createStandardGameFromState(state);
    expect(winValidate(game, "p0")).toBe("furiten");

    installAugment(game.engine, standardAugments.find((a) => a.id === "iron_wall") as never, "p0");
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("open_riichi: 후로한 손으로도 리치 검증을 통과", () => {
    const state = craft({
      hands: { p0: "234m345s678s9m9m1s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "222p" }] }, // 후로 1개
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const def = game.engine.actions.get("riichi");
    const req = { player: "p0" as PlayerId, type: "riichi", payload: { tileId: drawn } };
    const ctx = { state: game.engine.state, rules: game.engine.rules };
    expect(def?.validate(req, ctx)).toBe("riichi requires a closed hand");

    installAugment(game.engine, standardAugments.find((a) => a.id === "open_riichi") as never, "p0");
    // 후로 제약은 통과 (다른 조건은 손패 구성에 따름 — 최소한 closed 사유는 사라진다)
    expect(def?.validate({ ...req }, { state: game.engine.state, rules: game.engine.rules })).not.toBe(
      "riichi requires a closed hand",
    );
  });

  it("yakuless_win: 역 없는 손도 보유자는 화료 가능", () => {
    // 111m 456p 789s 234s + 99p, 6p 론 → 멘젠이지만 111m 암각으로 핑후X, 1m9s로 탕야오X → 무역
    const state = craft({
      hands: {
        p0: "111m45p789s234s99p",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "6p" },
    });
    const game = createStandardGameFromState(state);
    expect(winValidate(game, "p0")).toBe("no yaku");

    installAugment(game.engine, standardAugments.find((a) => a.id === "yakuless_win") as never, "p0");
    expect(winValidate(game, "p0")).toBeNull();
  });
});

describe("증강 효과 — 새 프롬프트 액션 (discard_recall)", () => {
  const RECALL_AUG = () =>
    standardAugments.find((a) => a.id === "discard_recall") as never;

  function turnPromptFor(
    game: ReturnType<typeof createStandardGameFromState>,
    player: PlayerId,
  ) {
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    return {
      flow,
      status,
      prompt: status.prompts.find((p) => p.player === player)!,
    };
  }

  function craftRecallBase() {
    return craft({
      hands: { p0: "123m456m789m123p99p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z" }, // 되가져올 수 있는 자기 버림패 2장
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  /** p0가 discard_recall을 보유한 상태 (드래프트 이벤트 없이 augments 직접 주입) */
  function craftRecallState() {
    const s = craftRecallBase();
    return {
      ...s,
      players: s.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["discard_recall"] } : p,
      ),
    };
  }

  it("증강이 없으면 recall 선택지가 프롬프트에 없다", () => {
    const game = createStandardGameFromState(craftRecallBase()); // 미보유·미설치
    const { prompt } = turnPromptFor(game, "p0");
    expect(prompt.options.some((o) => o.type === "recall")).toBe(false);
  });

  it("증강 보유자의 턴 프롬프트에 자기 버림패마다 recall 후보가 노출된다", () => {
    const game = createStandardGameFromState(craftRecallState());
    installAugment(game.engine, RECALL_AUG(), "p0");
    const { prompt } = turnPromptFor(game, "p0");
    const recalls = prompt.options.filter((o) => o.type === "recall");
    expect(recalls).toHaveLength(2); // 버림패 1z, 2z
  });

  it("recall 실행: 쯔모패↔버림패 스왑, 손패 수 보존, 매 국 1회", () => {
    const game = createStandardGameFromState(craftRecallState());
    installAugment(game.engine, RECALL_AUG(), "p0");

    const st0 = game.engine.state;
    const handLenBefore = st0.zones[handZone("p0")]?.tileIds.length ?? 0;
    const drawnTile = st0.round.lastDrawnTile as number;
    const recallTile = st0.zones[discardsZone("p0")]?.tileIds[0] as number;

    const { flow } = turnPromptFor(game, "p0");
    const status = flow.submit("p0", { type: "recall", payload: { recallTileId: recallTile } });

    const st1 = game.engine.state;
    const hand = st1.zones[handZone("p0")]?.tileIds ?? [];
    const discards = st1.zones[discardsZone("p0")]?.tileIds ?? [];

    // 손패 수 보존, 되가져온 패는 손에 · 쯔모패는 버림패로
    expect(hand).toHaveLength(handLenBefore);
    expect(hand).toContain(recallTile);
    expect(hand).not.toContain(drawnTile);
    expect(discards).toContain(drawnTile);
    expect(discards).not.toContain(recallTile);
    // 사용 플래그 (국 단위 — roundKey 포함)
    const r = st1.round;
    expect(st1.augmentData[`recall_used:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0`]).toBe(true);

    // 회수 후에도 같은 플레이어의 turn.act가 이어지고, recall은 더 이상 제시되지 않는다
    expect(st1.round.phase).toBe("turn.act");
    if (status.kind !== "awaiting") throw new Error("expected awaiting after recall");
    const reprompt = status.prompts.find((p) => p.player === "p0")!;
    expect(reprompt.options.some((o) => o.type === "recall")).toBe(false);
    expect(reprompt.options.some((o) => o.type === "discard")).toBe(true);
  });

  it("recall 이벤트도 리플레이 로그로 재구성된다 (순수 Reducer)", () => {
    const game = createStandardGameFromState(craftRecallState());
    installAugment(game.engine, RECALL_AUG(), "p0");
    const recallTile = game.engine.state.zones[discardsZone("p0")]?.tileIds[0] as number;
    const { flow } = turnPromptFor(game, "p0");
    flow.submit("p0", { type: "recall", payload: { recallTileId: recallTile } });

    // 이벤트 로그를 순수 재적용하면 같은 손패가 나온다.
    // 증강이 등록한 새 이벤트(RecallPerformed) reducer가 필요하므로 rebuildAugments로 재설치.
    const events = game.engine.eventLog;
    let replayed = craftRecallState();
    const replayGame = createStandardGameFromState(replayed);
    rebuildAugments(replayGame.engine, replayGame.augments);
    for (const e of events) replayed = replayGame.engine.reducers.dispatch(replayed, e);
    expect(replayed.zones[handZone("p0")]?.tileIds).toEqual(
      game.engine.state.zones[handZone("p0")]?.tileIds,
    );
  });
});

describe("DraftController — 개인별 3지선다", () => {
  /** 등급 통일을 검증하려면 등급당 3개 이상인 카탈로그가 필요하다 (표준 4종으론 부족) */
  const fillers = (["silver", "gold", "prism"] as const).flatMap((tier) =>
    [0, 1, 2, 3].map((i) =>
      defineAugment({
        id: `filler_${tier}_${i}`,
        tier,
        category: "etc",
        name: `f${i}`,
        description: "-",
        install: () => {},
      }),
    ),
  );

  it("roll은 카탈로그 전체에서 결정적으로 제시하고, pick이 상태·효과를 반영한다", () => {
    const game = createStandardGame({ seed: 77, extraAugments: fillers });
    const draft = new DraftController(game.engine, game.augments);

    const choices = draft.roll("gameStart", "p0");
    expect(choices).toHaveLength(3);
    // 52차 등급 폐기: 등급 통일 없이 카탈로그 전체 균등 — 플레이어마다 다른 3장
    expect(new Set(choices.map((d) => d.id)).size).toBe(3);
    expect(draft.roll("gameStart", "p0").map((d) => d.id)).toEqual(
      choices.map((d) => d.id),
    ); // 결정적

    const pickId = choices[0]?.id as string;
    draft.pick("gameStart", "p0", pickId);
    expect(game.engine.state.players[0]?.augments).toEqual([pickId]);
  });

  it("뽑힌 등급이 고갈돼도 다른 등급에서 보충한다 — 빈 드래프트는 없다", () => {
    // 표준 카탈로그는 gold 1 / prism 3 / silver 0 — 어느 등급이 뽑혀도 3개를 못 채운다
    const game = createStandardGame({ seed: 77 });
    const draft = new DraftController(game.engine, game.augments);
    for (const player of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const choices = draft.roll("gameStart", player);
      expect(choices.length).toBeGreaterThan(0);
      expect(new Set(choices.map((d) => d.id)).size).toBe(choices.length);
    }
    // 보충 경로도 결정적이어야 한다 (리플레이 안전)
    expect(draft.roll("gameStart", "p0").map((d) => d.id)).toEqual(
      draft.roll("gameStart", "p0").map((d) => d.id),
    );
  });

  it("제시되지 않은 증강 픽은 거부된다", () => {
    const game = createStandardGame({ seed: 77 });
    const draft = new DraftController(game.engine, game.augments);
    const offered = new Set(draft.roll("gameStart", "p1").map((d) => d.id));
    const notOffered = standardAugments.find((a) => !offered.has(a.id));
    if (notOffered !== undefined) {
      expect(() => draft.pick("gameStart", "p1", notOffered.id)).toThrow("not offered");
    }
  });

  it("픽 후 실제 효과가 작동한다 (iron_wall을 강제로 픽)", () => {
    const game = createStandardGame({ seed: 5 });
    // 시드를 바꿔가며 iron_wall이 p0에게 제시되는 게임을 찾는다
    let found = game;
    let seed = 5;
    while (!new DraftController(found.engine, found.augments)
      .roll("gameStart", "p0")
      .some((d) => d.id === "iron_wall")) {
      seed += 1;
      found = createStandardGame({ seed });
      if (seed > 200) throw new Error("iron_wall never offered");
    }
    const draft = new DraftController(found.engine, found.augments);
    draft.pick("gameStart", "p0", "iron_wall");
    expect(found.engine.rules.resolve<boolean>("win.furiten.enabled", { playerId: "p0" })).toBe(false);
  });
});

describe("DraftController — 상호 배제(conflicts)", () => {
  // A는 B를 conflicts로 선언한다. B는 아무것도 선언하지 않는다 (대칭 검증용).
  const augA = defineAugment({
    id: "conflict_a",
    tier: "prism",
    category: "etc",
    name: "A",
    description: "-",
    conflicts: ["conflict_b"],
    install: () => {},
  });
  const augB = defineAugment({
    id: "conflict_b",
    tier: "prism",
    category: "etc",
    name: "B",
    description: "-",
    install: () => {},
  });
  const augC = defineAugment({
    id: "conflict_c",
    tier: "prism",
    category: "etc",
    name: "C",
    description: "-",
    install: () => {},
  });

  function setup(): { game: ReturnType<typeof createStandardGame>; draft: DraftController } {
    const game = createStandardGame({ seed: 3 });
    const catalog = new AugmentRegistry();
    catalog.addAll([augA, augB, augC]); // 정확히 3종 → choices=3이면 배제 없인 셋 다 제시
    return { game, draft: new DraftController(game.engine, catalog) };
  }

  function give(game: ReturnType<typeof createStandardGame>, player: PlayerId, id: string): void {
    const r = game.engine.submit({ player, type: "draftPick", payload: { augmentId: id } });
    expect(r.ok).toBe(true);
  }

  it("A를 보유하면 conflicts인 B가 제시되지 않는다 (보유분 A도 제외)", () => {
    const { game, draft } = setup();
    give(game, "p0", "conflict_a");
    const ids = draft.roll("gameStart", "p0").map((d) => d.id);
    expect(ids).not.toContain("conflict_b");
    expect(ids).not.toContain("conflict_a");
    expect(ids).toContain("conflict_c");
  });

  it("역방향도 대칭으로 막힌다 — B를 보유하면 (B가 선언 안 해도) A가 제시되지 않는다", () => {
    const { game, draft } = setup();
    give(game, "p1", "conflict_b");
    const ids = draft.roll("gameStart", "p1").map((d) => d.id);
    expect(ids).not.toContain("conflict_a");
    expect(ids).toContain("conflict_c");
  });

  it("무관한 플레이어에겐 여전히 전부 제시된다", () => {
    const { game, draft } = setup();
    give(game, "p0", "conflict_a");
    const ids = draft.roll("gameStart", "p2").map((d) => d.id);
    expect(new Set(ids)).toEqual(new Set(["conflict_a", "conflict_b", "conflict_c"]));
  });
});


describe("DraftController — 다양성 (좌석별 후보 칸 · 중복 금지)", () => {
  /** 좌석 칸(4 × 18) + 보충 여유를 감당할 만큼 큰 카탈로그 */
  const bigCatalog = Array.from({ length: 120 }, (_, i) =>
    defineAugment({
      id: `div_${i}`,
      tier: "prism",
      category: "etc",
      name: `d${i}`,
      description: "-",
      install: () => {},
    }),
  );

  function bigGame(seed: number): ReturnType<typeof createStandardGame> {
    return createStandardGame({ seed, extraAugments: bigCatalog });
  }

  const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

  it("같은 스테이지에서 네 명의 제시가 서로 하나도 겹치지 않는다", () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const game = bigGame(seed);
      const draft = new DraftController(game.engine, game.augments);
      const all: string[] = [];
      for (const player of PLAYERS) {
        const ids = draft.roll("gameStart", player).map((d) => d.id);
        expect(ids).toHaveLength(3);
        all.push(...ids);
      }
      // 12장 전부 서로 다르다 = 좌석 간 겹침 0
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("두 번째 드래프트도 좌석 간 겹치지 않고, 이미 보유한 증강은 아무에게도 다시 안 나온다", () => {
    const game = bigGame(7);
    const draft = new DraftController(game.engine, game.augments);
    // 1차 드래프트: 전원 첫 번째 후보를 픽
    const picked: string[] = [];
    for (const player of PLAYERS) {
      const first = draft.roll("gameStart", player)[0]?.id as string;
      draft.pick("gameStart", player, first);
      picked.push(first);
    }

    const all: string[] = [];
    for (const player of PLAYERS) {
      const ids = draft.roll("southEntry", player).map((d) => d.id);
      expect(ids).toHaveLength(3);
      // 남이 가진 것도, 내가 가진 것도 다시 나오지 않는다
      for (const id of ids) expect(picked).not.toContain(id);
      all.push(...ids);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it("스테이지 도중 남이 픽해도 내 후보는 흔들리지 않는다 (pick 검증의 전제)", () => {
    const game = bigGame(42);
    const draft = new DraftController(game.engine, game.augments);
    const before = draft.roll("gameStart", "p3").map((d) => d.id);

    // p0·p1·p2가 먼저 픽한 뒤에도 p3에게 제시되는 3장은 그대로여야 한다.
    // (흔들리면 pick의 "제시된 것인가" 검증이 깨져 정상 픽이 거부된다)
    for (const player of ["p0", "p1", "p2"] as PlayerId[]) {
      draft.pick("gameStart", player, draft.roll("gameStart", player)[0]?.id as string);
    }
    expect(draft.roll("gameStart", "p3").map((d) => d.id)).toEqual(before);
    // 실제로 픽도 통과한다
    expect(() => draft.pick("gameStart", "p3", before[0] as string)).not.toThrow();
  });

  it("결정적 — 같은 시드면 몇 번 호출해도 같은 결과", () => {
    const a = bigGame(2026);
    const b = bigGame(2026);
    const da = new DraftController(a.engine, a.augments);
    const db = new DraftController(b.engine, b.augments);
    for (const player of PLAYERS) {
      const ids = da.roll("gameStart", player).map((d) => d.id);
      expect(da.roll("gameStart", player).map((d) => d.id)).toEqual(ids);
      expect(db.roll("gameStart", player).map((d) => d.id)).toEqual(ids);
    }
  });

  it("시드가 다르면 칸 경계도 달라진다 — 같은 좌석이 늘 같은 후보를 받지 않는다", () => {
    const s1 = new DraftController(bigGame(1).engine, bigGame(1).augments)
      .roll("gameStart", "p0")
      .map((d) => d.id);
    const s2 = new DraftController(bigGame(2).engine, bigGame(2).augments)
      .roll("gameStart", "p0")
      .map((d) => d.id);
    expect(s1).not.toEqual(s2);
  });

  it("카탈로그가 작으면 기존 전역 추첨으로 돌아간다 — 빈 드래프트는 없다", () => {
    // 표준 4종만: 좌석 칸을 못 나눈다 → 겹침은 허용하되 반드시 뽑히긴 한다
    const game = createStandardGame({ seed: 77 });
    const draft = new DraftController(game.engine, game.augments);
    for (const player of PLAYERS) {
      const choices = draft.roll("gameStart", player);
      expect(choices.length).toBeGreaterThan(0);
      expect(new Set(choices.map((d) => d.id)).size).toBe(choices.length);
    }
  });
});

describe("증강 미사용 시 회귀 없음", () => {
  it("증강 없는 표준 게임은 기존과 동일하게 동작 (riichi.cost 1000)", () => {
    const game = createStandardGame({ seed: 1 });
    expect(game.engine.rules.resolve<number>("riichi.cost", { playerId: "p0" })).toBe(1000);
    expect(game.engine.rules.resolve<boolean>("win.requiresYaku", { playerId: "p0" })).toBe(true);
  });
});
