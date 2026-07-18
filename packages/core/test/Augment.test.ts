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
import { SCORE_CHANGED } from "../src/augment/events.js";

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
        name: "x",
        description: "y",
        install: () => {},
      }),
    ).toThrow("snake_case");
  });
});

describe("AugmentRegistry.rollChoices", () => {
  const catalog = new AugmentRegistry();
  catalog.addAll(standardAugments);
  const even = { silver: 1, gold: 1, prism: 1 };

  it("서로 다른 count개를 뽑고, 같은 시드면 같은 결과 (결정성)", () => {
    const a = catalog.rollChoices(new Prng(5), even, 3).map((d) => d.id);
    const b = catalog.rollChoices(new Prng(5), even, 3).map((d) => d.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it("가중치 0인 등급은 절대 나오지 않는다", () => {
    for (let seed = 0; seed < 50; seed++) {
      const picks = catalog.rollChoices(
        new Prng(seed),
        { silver: 1, gold: 1, prism: 0 },
        3,
      );
      expect(picks.every((d) => d.tier !== "prism")).toBe(true);
    }
  });

  it("exclude된 증강은 제외된다", () => {
    const picks = catalog.rollChoices(new Prng(9), even, 5, new Set(["cheap_riichi"]));
    expect(picks.some((d) => d.id === "cheap_riichi")).toBe(false);
  });

  it("카탈로그가 부족하면 있는 만큼만 반환", () => {
    const small = new AugmentRegistry();
    small.add(standardAugments[0] as (typeof standardAugments)[number]);
    expect(small.rollChoices(new Prng(1), even, 3)).toHaveLength(1);
  });
});

describe("증강 효과 — Rule Modifier", () => {
  it("cheap_riichi: 보유자만 리치 비용 500, 나머지는 1000", () => {
    const game = createStandardGame({ seed: 1 });
    installAugment(game.engine, standardAugments[0] as never, "p0");
    expect(game.engine.rules.resolve<number>("riichi.cost", { playerId: "p0" })).toBe(500);
    expect(game.engine.rules.resolve<number>("riichi.cost", { playerId: "p1" })).toBe(1000);
  });

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

  it("open_riichi: 부로한 손으로도 리치 검증을 통과", () => {
    const state = craft({
      hands: { p0: "234m345s678s9m9m1s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "222p" }] }, // 부로 1개
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
    // 부로 제약은 통과 (다른 조건은 손패 구성에 따름 — 최소한 closed 사유는 사라진다)
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

describe("증강 효과 — Effect Reaction / Interceptor", () => {
  it("tsumo_bonus: 쯔모 화료 시 ScoreChanged +1000이 방출되고 점수에 반영", () => {
    // p0(친) 멘젠쯔모 화료: 234m 345p 456s 678s 22s (14장 완성형, 마지막 2s를 쯔모로 간주)
    const state = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, standardAugments.find((a) => a.id === "tsumo_bonus") as never, "p0");

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    // 6s 쯔모 화료 (win 옵션 존재)
    const winOption = status.prompts[0]?.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();
    const before = game.engine.state.players[0]?.score ?? 0;
    status = flow.submit("p0", winOption as { type: string; payload: unknown });

    expect(status).toEqual({ kind: "roundOver", outcome: "win" });
    const bonus = game.engine.eventLog.find(
      (e) => e.type === SCORE_CHANGED && (e.payload as { reason?: string }).reason === "tsumo_bonus",
    );
    expect(bonus).toBeDefined();
    // 화료 이득 + 보너스 1000이 모두 반영 (증가폭 ≥ 1000)
    expect((game.engine.state.players[0]?.score ?? 0) - before).toBeGreaterThanOrEqual(1000);
  });

  it("vengeance: 방총 실점이 절반, 화료자 이득도 같은 만큼 감소 (점수 보존)", () => {
    // p0가 p1의 5s 단기 론(탕야오)에 방총. p0가 vengeance 보유
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s", // 5s 버릴 친
        p1: "234m345p345s678s5s", // 5s 단기 탕야오
        p2: "147m147p11z22z33z4z",
        p3: "369m369p369s12z3z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const baseline = createStandardGameFromState(state);
    const withAug = createStandardGameFromState(structuredClone(state));
    installAugment(withAug.engine, standardAugments.find((a) => a.id === "vengeance") as never, "p0");

    const runRon = (game: ReturnType<typeof createStandardGameFromState>) => {
      const flow = new FlowController(game.engine);
      let status = flow.begin();
      if (status.kind !== "awaiting") throw new Error("expected awaiting");
      const fiveSou = game.engine.state.zones[handZone("p0")]?.tileIds.find(
        (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "sou5",
      );
      status = flow.submit("p0", { type: "discard", payload: { tileId: fiveSou } });
      if (status.kind !== "awaiting") throw new Error("expected reaction");
      for (const prompt of status.prompts) {
        if (prompt.player === "p1") continue;
        status = flow.submit(prompt.player, { type: "pass", payload: {} });
      }
      status = flow.submit("p1", { type: "win", payload: {} });
      return game;
    };

    runRon(baseline);
    runRon(withAug);

    const baseP0 = baseline.engine.state.players[0]?.score ?? 0;
    const augP0 = withAug.engine.state.players[0]?.score ?? 0;
    const baseLoss = 25000 - baseP0;
    const augLoss = 25000 - augP0;
    expect(augLoss).toBeLessThan(baseLoss); // 실점 감소
    expect(augLoss).toBeGreaterThan(0);
    // 점수 보존: 합계 100000 유지
    const total = withAug.engine.state.players.reduce((s, p) => s + p.score, 0) +
      withAug.engine.state.round.riichiPot;
    expect(total).toBe(100000);
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
  it("roll은 한 등급에서 결정적으로 제시하고(전원 동일 등급), pick이 상태·효과를 반영한다", () => {
    const game = createStandardGame({ seed: 77 });
    const draft = new DraftController(game.engine, game.augments);

    const choices = draft.roll("gameStart", "p0");
    // 표준 카탈로그는 등급당 2~3개 — 뽑힌 등급 안에서 최대 3개
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.length).toBeLessThanOrEqual(3);
    // 등급 통일: 이 증강턴 제시는 모두 같은 등급이고, tierForStage와 일치
    const tier = draft.tierForStage("gameStart");
    expect(choices.every((d) => d.tier === tier)).toBe(true);
    // 모든 플레이어가 같은 등급을 받는다
    expect(draft.roll("gameStart", "p1").every((d) => d.tier === tier)).toBe(true);
    expect(draft.roll("gameStart", "p0").map((d) => d.id)).toEqual(
      choices.map((d) => d.id),
    ); // 결정적

    const pickId = choices[0]?.id as string;
    draft.pick("gameStart", "p0", pickId);
    expect(game.engine.state.players[0]?.augments).toEqual([pickId]);
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

  it("픽 후 실제 효과가 작동한다 (cheap_riichi를 강제로 픽)", () => {
    const game = createStandardGame({ seed: 5 });
    // 시드를 바꿔가며 cheap_riichi가 p0에게 제시되는 게임을 찾는다
    let found = game;
    let seed = 5;
    while (!new DraftController(found.engine, found.augments)
      .roll("gameStart", "p0")
      .some((d) => d.id === "cheap_riichi")) {
      seed += 1;
      found = createStandardGame({ seed });
      if (seed > 200) throw new Error("cheap_riichi never offered");
    }
    const draft = new DraftController(found.engine, found.augments);
    draft.pick("gameStart", "p0", "cheap_riichi");
    expect(found.engine.rules.resolve<number>("riichi.cost", { playerId: "p0" })).toBe(500);
  });
});

describe("증강 미사용 시 회귀 없음", () => {
  it("증강 없는 표준 게임은 기존과 동일하게 동작 (riichi.cost 1000)", () => {
    const game = createStandardGame({ seed: 1 });
    expect(game.engine.rules.resolve<number>("riichi.cost", { playerId: "p0" })).toBe(1000);
    expect(game.engine.rules.resolve<boolean>("win.requiresYaku", { playerId: "p0" })).toBe(true);
  });
});
