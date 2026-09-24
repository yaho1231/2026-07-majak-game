/**
 * 역풍(reverse_wind) · 늪(swamp) · 욕심(greed) · 위압감(intimidate) — 2026-09-24 신규 4종.
 *
 * 역풍
 *  1. 켜진 국에는 오야 다음 차례가 북가(자리 3)다. 켜지지 않은 국은 표준 순서다.
 *  2. 치는 새 순서의 상가 패로만 된다.
 *  3. 자풍은 방향과 무관하다.
 *  4. 리치 강화의 하가 봉인도 바뀐 순서를 따른다.
 *
 * 늪
 *  1. 발동한 국에 내 패를 운 사람은 다음 2순 동안 쯔모패만 버릴 수 있다. 후로 직후 버림은 자유.
 *  2. 발동하지 않았으면 걸리지 않는다. 남은 순은 전원 공개 채널에 실린다.
 *
 * 욕심
 *  1. 다음 쯔모가 방금 쯔모한 패와 같은 종류로 온다. 국당 1회.
 *  2. 쯔모패가 없는 순(후로 직후)에는 쓸 수 없다.
 *
 * 위압감
 *  1. 이 증강으로 리치하면 타가 전원이 다음 1순 동안 쯔모패만 버릴 수 있다. 그 뒤는 자유.
 *  2. 공탁은 평소대로 낸다. 텐파이가 아니면 쓸 수 없다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  DEAD_WALL,
  TILE_DRAWN,
  buildPlayerView,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  playerAtSeat,
  seatWindOf,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import * as C from "../src/index.js";
import { roundKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const DEFS: Record<string, AugmentDef> = {
  reverse_wind: C.reverseWind,
  swamp: C.swamp,
  greed: C.greed,
  intimidate: C.intimidate,
  riichi_upgrade: C.riichiUpgrade,
};

/** 기본 손 — 서로 치·퐁·론이 거의 안 걸리게 흩어 둔다 (p0는 14장, 마지막이 쯔모패) */
const HANDS: Record<PlayerId, string> = {
  p0: "3m159p159s1234577z",
  p1: "12m2468p2468s222z",
  p2: "4789m37p37s66665z",
  p3: "45m99m28p28s11334z",
};

/** p0 텐파이 손 — 쯔모패(5z)를 버리면 6s·7z 샤보 대기 */
const TENPAI = { p0: "234m567p345s66s77z5z" };
const drawnOf = (g: Game): TileId => {
  const id = g.engine.state.round.lastDrawnTile;
  if (id === null) throw new Error("쯔모패가 없다");
  return id;
};

function build(
  augs: Record<PlayerId, string[]>,
  opts: {
    hands?: Partial<Record<PlayerId, string>>;
    armReverseFor?: PlayerId;
    state?: (s: GameState) => GameState;
  } = {},
): { game: Game; flow: FlowController } {
  let state = craft({
    hands: { ...HANDS, ...(opts.hands as Record<PlayerId, string> | undefined) },
    drawnLastFor: "p0",
    phase: "turn.act",
    turnSeat: 0,
  });
  state = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(augs[p.id] ?? [])],
    })),
  };
  if (opts.armReverseFor !== undefined) {
    state = {
      ...state,
      augmentData: {
        ...state.augmentData,
        [`reverse_wind:armedRound:${opts.armReverseFor}`]: roundKey(state),
      },
    };
  }
  if (opts.state !== undefined) state = opts.state(state);
  const game = createStandardGameFromState(state);
  for (const [holder, ids] of Object.entries(augs)) {
    for (const id of ids) {
      installAugment(game.engine, DEFS[id] as AugmentDef, holder as PlayerId, {
        yaku: game.yaku,
      });
    }
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

function prompts(flow: FlowController) {
  const st = flow.begin();
  return st.kind === "awaiting" ? st.prompts : [];
}

function optionsFor(flow: FlowController, player: PlayerId): ActionOption[] {
  return prompts(flow).find((p) => p.player === player)?.options ?? [];
}

const turnPlayer = (g: Game): PlayerId =>
  playerAtSeat(g.engine.state, g.engine.state.round.turnSeat).id;

/** 리액션 구간이면 전원 패스 (except에 준 사람은 건드리지 않는다) */
function passAll(g: Game, flow: FlowController, except?: PlayerId): void {
  while (g.engine.state.round.phase === "reaction") {
    const ps = prompts(flow).filter((p) => p.player !== except);
    if (ps.length === 0) return;
    for (const p of ps) flow.submit(p.player, { type: "pass", payload: {} });
  }
}

/** 지금 차례인 사람의 버림 선택지 tileId들 */
function discardIds(flow: FlowController, player: PlayerId): TileId[] {
  return optionsFor(flow, player)
    .filter((o) => o.type === "discard")
    .map((o) => (o.payload as { tileId: TileId }).tileId);
}

/** 지금 차례인 사람이 쯔모기리하고 리액션을 전부 흘린다 */
function tsumogiri(g: Game, flow: FlowController): void {
  const who = turnPlayer(g);
  const drawn = g.engine.state.round.lastDrawnTile;
  if (drawn === null) throw new Error(`${who}에게 쯔모패가 없다`);
  flow.submit(who, { type: "discard", payload: { tileId: drawn } });
  passAll(g, flow);
}

function tileOf(g: Game, player: PlayerId, key: string): TileId {
  const id = handIdsOf(g.engine.state, player).find(
    (t) => kindKey(kindOf(g.engine.state, t)) === key,
  );
  if (id === undefined) throw new Error(`${player} 손에 ${key}가 없다`);
  return id;
}

function channel(g: Game, key: string): unknown {
  return buildPlayerView(g.engine.state, "p0", g.engine.rules).augmentView[key];
}

// ───────────────────────────── 역풍 ─────────────────────────────

describe("역풍 — 켜진 국은 차례가 거꾸로 돈다", () => {
  it("오야(자리 0) 다음 차례가 자리 3이다. 켜지지 않았으면 자리 1이다", () => {
    const on = build({ p2: ["reverse_wind"] }, { armReverseFor: "p2" });
    on.flow.submit("p0", {
      type: "discard",
      payload: { tileId: tileOf(on.game, "p0", "wind1") },
    });
    passAll(on.game, on.flow);
    expect(on.game.engine.state.round.turnSeat).toBe(3);
    tsumogiri(on.game, on.flow);
    expect(on.game.engine.state.round.turnSeat).toBe(2);

    const off = build({ p2: ["reverse_wind"] });
    off.flow.submit("p0", {
      type: "discard",
      payload: { tileId: tileOf(off.game, "p0", "wind1") },
    });
    passAll(off.game, off.flow);
    expect(off.game.engine.state.round.turnSeat).toBe(1);
  });

  it("지난 국에 켜졌던 표식은 이번 국에 효과가 없다", () => {
    const g = build(
      { p2: ["reverse_wind"] },
      {
        state: (s) => ({
          ...s,
          augmentData: {
            ...s.augmentData,
            "reverse_wind:armedRound:p2": "1-0-0",
          },
        }),
      },
    );
    expect(
      g.game.engine.rules.resolve<number>("turn.direction", {
        state: g.game.engine.state,
      }),
    ).toBe(1);
  });

  it("치는 새 순서의 상가(자리 0 → 자리 3) 패로만 된다", () => {
    const { game, flow } = build(
      { p2: ["reverse_wind"] },
      { armReverseFor: "p2" },
    );
    flow.submit("p0", {
      type: "discard",
      payload: { tileId: tileOf(game, "p0", "man3") },
    });
    expect(optionsFor(flow, "p3").some((o) => o.type === "chi")).toBe(true);
    expect(optionsFor(flow, "p1").some((o) => o.type === "chi")).toBe(false);
  });

  it("자풍은 바뀌지 않는다 — 자리 3은 여전히 북가다", () => {
    const { game } = build({ p2: ["reverse_wind"] }, { armReverseFor: "p2" });
    expect(
      game.engine.rules.resolve<number>("turn.direction", {
        state: game.engine.state,
      }),
    ).toBe(-1);
    expect(seatWindOf(game.engine.state, "p3")).toBe(4);
    expect(seatWindOf(game.engine.state, "p1")).toBe(2);
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    expect(view.round.direction).toBe(-1);
  });

  it("리치 강화의 하가 봉인은 바뀐 순서의 다음 사람(자리 3)에게 간다", () => {
    const { game, flow } = build(
      { p0: ["riichi_upgrade"], p2: ["reverse_wind"] },
      { armReverseFor: "p2", hands: TENPAI },
    );
    flow.submit("p0", { type: "riichi", payload: { tileId: drawnOf(game) } });
    expect(channel(game, "riichi_upgrade:p0")).toBe("p3");
  });
});

// ───────────────────────────── 늪 ─────────────────────────────

describe("늪 — 내 패를 운 타가는 2순 쯔모기리", () => {
  /** p0가 (늪을 켜고) 3m을 버리고 p1이 치한 뒤, p1이 자유롭게 한 장 버린 데까지 */
  function chiScene(activate: boolean) {
    const s = build({ p0: ["swamp"] });
    const { game, flow } = s;
    if (activate) {
      expect(
        optionsFor(flow, "p0").some((o) => o.type === "swamp_activate"),
      ).toBe(true);
      flow.submit("p0", { type: "swamp_activate", payload: {} });
    }
    flow.submit("p0", {
      type: "discard",
      payload: { tileId: tileOf(game, "p0", "man3") },
    });
    const chi = optionsFor(flow, "p1").find((o) => o.type === "chi");
    if (chi === undefined) throw new Error("p1이 3m을 치할 수 있어야 한다");
    passAll(game, flow, "p1");
    flow.submit("p1", chi);
    expect(turnPlayer(game)).toBe("p1");
    // 후로 직후 버림은 자유 — 여러 장 중에서 고를 수 있다
    const free = discardIds(flow, "p1");
    expect(free.length).toBeGreaterThan(1);
    if (activate) expect(channel(game, "forcedTsumogiri:swamp:p0:p1")).toBe(2);
    flow.submit("p1", { type: "discard", payload: { tileId: free[0]! } });
    passAll(game, flow);
    return s;
  }

  /** p1 차례가 올 때까지 남들은 쯔모기리 */
  function untilP1(g: Game, flow: FlowController): void {
    while (turnPlayer(g) !== "p1") tsumogiri(g, flow);
  }

  it("발동한 국에 치한 사람은 다음 2순 동안 쯔모패만 버릴 수 있다", () => {
    const { game, flow } = chiScene(true);
    for (const left of [2, 1]) {
      untilP1(game, flow);
      expect(discardIds(flow, "p1")).toEqual([
        game.engine.state.round.lastDrawnTile,
      ]);
      expect(channel(game, "forcedTsumogiri:swamp:p0:p1")).toBe(left);
      tsumogiri(game, flow);
    }
    expect(channel(game, "forcedTsumogiri:swamp:p0:p1")).toBeUndefined();
    untilP1(game, flow);
    expect(discardIds(flow, "p1").length).toBeGreaterThan(1);
  });

  it("발동하지 않았으면 울어도 늪에 빠지지 않는다", () => {
    const { game, flow } = chiScene(false);
    untilP1(game, flow);
    expect(discardIds(flow, "p1").length).toBeGreaterThan(1);
  });

  it("한 국에 한 번 켜면 그 국에는 다시 켤 수 없다", () => {
    const { flow } = build({ p0: ["swamp"] });
    flow.submit("p0", { type: "swamp_activate", payload: {} });
    expect(
      optionsFor(flow, "p0").some((o) => o.type === "swamp_activate"),
    ).toBe(false);
  });
});

// ───────────────────────────── 욕심 ─────────────────────────────

describe("욕심 — 방금 쯔모한 패를 다음 순에 한 장 더", () => {
  it("다음 쯔모가 방금 쯔모한 패와 같은 종류로 온다", () => {
    const { game, flow } = build({ p0: ["greed"] });
    const drawn = game.engine.state.round.lastDrawnTile!;
    const want = kindKey(kindOf(game.engine.state, drawn));
    flow.submit("p0", { type: "greed_use", payload: {} });
    // 쯔모패는 그대로 손에 남는다
    expect(handIdsOf(game.engine.state, "p0")).toContain(drawn);
    expect(optionsFor(flow, "p0").some((o) => o.type === "greed_use")).toBe(
      false,
    );
    flow.submit("p0", {
      type: "discard",
      payload: { tileId: tileOf(game, "p0", "wind1") },
    });
    passAll(game, flow);
    while (turnPlayer(game) !== "p0") tsumogiri(game, flow);
    const next = game.engine.state.round.lastDrawnTile!;
    expect(kindKey(kindOf(game.engine.state, next))).toBe(want);
    // 한 번 온 뒤로는 평소 쯔모다 — 국당 1회라 다시 쓸 수도 없다
    expect(optionsFor(flow, "p0").some((o) => o.type === "greed_use")).toBe(
      false,
    );
  });

  it("쯔모패가 없는 순에는 쓸 수 없다", () => {
    const { game } = build(
      { p0: ["greed"] },
      {
        state: (s) => ({ ...s, round: { ...s.round, lastDrawnTile: null } }),
      },
    );
    const r = game.engine.submit({
      player: "p0",
      type: "greed_use",
      payload: {},
    });
    expect(r.ok).toBe(false);
  });

  it("영상패여도 다음 쯔모면 바뀐다", () => {
    const { game, flow } = build({ p0: ["greed"] });
    const want = kindKey(
      kindOf(game.engine.state, game.engine.state.round.lastDrawnTile!),
    );
    flow.submit("p0", { type: "greed_use", payload: {} });
    const id = game.engine.state.zones[DEAD_WALL]!.tileIds[0]!;
    game.engine.actions.register({
      type: "__emit",
      validate: () => null,
      toEvents: () => [
        {
          type: TILE_DRAWN,
          payload: { player: "p0", tileId: id, rinshan: true },
        },
      ],
    });
    expect(
      game.engine.submit({ player: "p0", type: "__emit", payload: {} }).ok,
    ).toBe(true);
    expect(kindKey(kindOf(game.engine.state, id))).toBe(want);
  });
});

// ───────────────────────────── 위압감 ─────────────────────────────

describe("위압감 — 이 증강으로 리치하면 타가 1순 쯔모기리", () => {
  it("타가 전원이 다음 1순 동안 쯔모패만 버릴 수 있고, 그 뒤는 자유다", () => {
    const { game, flow } = build({ p0: ["intimidate"] }, { hands: TENPAI });
    const score = game.engine.state.players.find((p) => p.id === "p0")!.score;
    flow.submit("p0", {
      type: "intimidate_riichi",
      payload: { tileId: drawnOf(game) },
    });
    expect(game.engine.state.round.byPlayer["p0"]!.riichi).not.toBeNull();
    expect(game.engine.state.players.find((p) => p.id === "p0")!.score).toBe(
      score - 1000,
    );
    passAll(game, flow);
    for (const who of ["p1", "p2", "p3"] as const) {
      expect(turnPlayer(game)).toBe(who);
      expect(discardIds(flow, who)).toEqual([
        game.engine.state.round.lastDrawnTile,
      ]);
      expect(channel(game, `forcedTsumogiri:intimidate:p0:${who}`)).toBe(1);
      tsumogiri(game, flow);
      expect(
        channel(game, `forcedTsumogiri:intimidate:p0:${who}`),
      ).toBeUndefined();
    }
    tsumogiri(game, flow); // p0 — 리치라 쯔모기리
    expect(turnPlayer(game)).toBe("p1");
    expect(discardIds(flow, "p1").length).toBeGreaterThan(1);
  });

  it("텐파이가 되지 않는 패로는 걸 수 없다", () => {
    const { game } = build({ p0: ["intimidate"] }, { hands: TENPAI });
    const r = game.engine.submit({
      player: "p0",
      type: "intimidate_riichi",
      payload: { tileId: tileOf(game, "p0", "man2") },
    });
    expect(r.ok).toBe(false);
  });

  it("리치 후보는 텐파이를 남기는 버림에만 선다", () => {
    const { game, flow } = build({ p0: ["intimidate"] }, { hands: TENPAI });
    const opts = optionsFor(flow, "p0").filter(
      (o) => o.type === "intimidate_riichi",
    );
    expect(opts.map((o) => (o.payload as { tileId: TileId }).tileId)).toEqual([
      drawnOf(game),
    ]);
  });
});
