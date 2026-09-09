/**
 * 리치 계열 QA 회귀 (2026-08-20) — `qa-lab/findings/riichi.md` · `qa-lab/findings/text.md`.
 *
 * 각 it()은 그 보고서의 확정 한 건에 1:1로 대응한다. 재현 스크립트
 * (`qa-lab/riichi/*.ts` · `qa-lab/text/b2/*.ts`)를 테스트로 옮긴 것이다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";
import { counter } from "../src/augments/counter.js";
import { lastStand } from "../src/augments/last_stand.js";
import { lateDouble } from "../src/augments/late_double.js";
import { noRetreat } from "../src/augments/no_retreat.js";
import { noRonPact } from "../src/augments/no_ron_pact.js";
import { offByOne } from "../src/augments/off_by_one.js";
import { openRiichiReveal } from "../src/augments/open_riichi_reveal.js";
import { riichiSeal } from "../src/augments/riichi_seal.js";
import { riichiUpgrade } from "../src/augments/riichi_upgrade.js";
import { siegeRiichi } from "../src/augments/siege_riichi.js";
import { silentPact } from "../src/augments/silent_pact.js";
import { soulStrike } from "../src/augments/soul_strike.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { contentAugments } from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugs(
  state: GameState,
  augs: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      augs[p.id] === undefined ? p : { ...p, augments: [...augs[p.id]!] },
    ),
  };
}

/** 패산 맨 앞을 한 장 뽑아 손에 얹는다 (그 사람의 turn.act 재현) */
function giveDraw(st: GameState, player: PlayerId): GameState {
  const wall = st.zones[WALL]!.tileIds;
  const t = wall[0] as TileId;
  const seat = st.players.find((p) => p.id === player)!.seat;
  return {
    ...st,
    zones: {
      ...st.zones,
      [WALL]: { ...st.zones[WALL]!, tileIds: wall.slice(1) },
      [`hand:${player}`]: {
        ...st.zones[`hand:${player}`]!,
        tileIds: [...st.zones[`hand:${player}`]!.tileIds, t],
      },
    },
    round: { ...st.round, phase: "turn.act", turnSeat: seat, lastDrawnTile: t },
  };
}

function handTile(game: Game, player: PlayerId, key: string): TileId {
  const st = game.engine.state;
  const id = handIdsOf(st, player).find((t) => kindKey(kindOf(st, t)) === key);
  if (id === undefined) throw new Error(`${player} 손에 ${key}가 없다`);
  return id;
}

// ───────────────────────────────────────────────────────────────────────────
// 리치 확정 1 — 공성계(노텐 리치)가 커스텀 리치 3종에 닿는다
// ───────────────────────────────────────────────────────────────────────────
describe("siege_riichi × 커스텀 리치 — 노텐 후보가 실제로 뜬다 (리치 확정 1)", () => {
  /** 완전 노텐 14장 */
  const NOTEN = "147m147p147s1234z5z";

  const CASES: { id: string; def: AugmentDef; action: string }[] = [
    { id: "stealth_riichi", def: stealthRiichi, action: "stealth_riichi" },
    { id: "no_retreat", def: noRetreat, action: "no_retreat_riichi" },
    { id: "open_riichi_reveal", def: openRiichiReveal, action: "open_riichi" },
    // 대조군 — 원래부터 후보 필터가 없었다
    { id: "all_or_nothing", def: allOrNothing, action: "all_in_riichi" },
  ];

  for (const c of CASES) {
    it(`${c.id} — 노텐이어도 후보가 뜬다`, () => {
      const st = withAugs(
        craft({
          hands: { p0: NOTEN, p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        { p0: ["siege_riichi", c.id] },
      );
      const game = createStandardGameFromState(st);
      installAugment(game.engine, siegeRiichi, "p0", { yaku: game.yaku });
      installAugment(game.engine, c.def, "p0", { yaku: game.yaku });

      const status = new FlowController(game.engine).begin();
      if (status.kind !== "awaiting") throw new Error("expected awaiting");
      const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
      expect(opts.filter((o) => o.type === c.action).length).toBeGreaterThan(0);
    });
  }

  it("공성계가 없으면 노텐 후보는 그대로 0개다", () => {
    const st = withAugs(
      craft({
        hands: { p0: NOTEN, p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["stealth_riichi"] },
    );
    const game = createStandardGameFromState(st);
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
    expect(opts.filter((o) => o.type === "stealth_riichi")).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 리치 확정 6 — 더블리치 판정은 바닥 길이가 아니라 discardCount
// ───────────────────────────────────────────────────────────────────────────
describe("더블리치 판정 — 바닥이 비어도 순은 discardCount다 (리치 확정 6)", () => {
  function scene(emptyPond: boolean, augs: string[] = []): GameState {
    const base = withAugs(
      craft({
        hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z2z", p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: augs },
    );
    if (!emptyPond) return base;
    // 날치기·도굴이 내 바닥을 비운 상태 — discardCount는 2 그대로다
    return {
      ...base,
      zones: {
        ...base.zones,
        [discardsZone("p0")]: {
          ...base.zones[discardsZone("p0")]!,
          tileIds: [],
        },
      },
    };
  }

  for (const emptyPond of [false, true]) {
    it(`이미 2장 버린 뒤의 리치는 더블이 아니다 (바닥비움=${emptyPond})`, () => {
      const game = createStandardGameFromState(scene(emptyPond));
      const r = game.engine.submit({
        player: "p0",
        type: "riichi",
        payload: { tileId: handTile(game, "p0", "sou5") },
      });
      expect(r.ok).toBe(true);
      expect(game.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(false);
    });

    it(`riichi_upgrade의 트리플리치도 서지 않는다 (바닥비움=${emptyPond})`, () => {
      const game = createStandardGameFromState(
        scene(emptyPond, ["riichi_upgrade"]),
      );
      installAugment(game.engine, riichiUpgrade, "p0", { yaku: game.yaku });
      game.engine.submit({
        player: "p0",
        type: "riichi",
        payload: { tileId: handTile(game, "p0", "sou5") },
      });
      expect(game.engine.state.augmentData["riichi_upgrade:triple:p0"]).not.toBe(
        true,
      );
    });
  }

  it("진짜 첫 버림 리치는 여전히 더블리치다", () => {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(base);
    game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: handTile(game, "p0", "sou5") },
    });
    expect(game.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 확정 12 — 승부수로 리치를 물리면 스텔스 표식도 함께 내려간다
// ───────────────────────────────────────────────────────────────────────────
describe("stealth_riichi × last_stand — 취소가 은닉 표식을 함께 내린다 (문구 확정 12)", () => {
  function mk(st: GameState): Game {
    const game = createStandardGameFromState(st);
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
    return game;
  }
  const scene = (): GameState =>
    withAugs(
      craft({
        hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["stealth_riichi", "last_stand"] },
    );

  it("취소한 국에는 리치를 다시 걸 수 없다 — 은닉 세탁 경로가 통째로 닫힌다", () => {
    const g1 = mk(scene());
    expect(
      g1.engine.submit({
        player: "p0",
        type: "stealth_riichi",
        payload: { tileId: handTile(g1, "p0", "sou5") },
      }).ok,
    ).toBe(true);

    // 내 순으로 되돌려 승부수로 취소
    const afterRiichi: GameState = {
      ...g1.engine.state,
      round: { ...g1.engine.state.round, phase: "turn.act", turnSeat: 0 },
    };
    const g2 = mk(afterRiichi);
    expect(
      g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} }).ok,
    ).toBe(true);
    const stealthKeys = Object.entries(g2.engine.state.augmentData).filter(
      ([k]) => k.startsWith("stealth_riichi:active"),
    );
    for (const [, v] of stealthKeys) expect(v).not.toBe(true);

    /*
     * 원래 이 자리는 "다시 뽑아 표준 리치를 걸면 은닉되지 않는다"였다. 그런데
     * 2026-08-22(QA aug-2 확정 8)부터 **취소한 국에는 리치를 다시 걸 수 없다** —
     * 취소가 국 스코프 이력을 남기고 `riichi.blocked`가 그것을 본다. 순비용 0으로
     * 일발을 재장전하고 영구 리치 후리텐을 세탁하던 경로를 통째로 막은 것이라,
     * 여기서 걱정하던 "은닉 세탁"도 함께 사라졌다 — 재리치 자체가 없다.
     */
    const g3 = mk(giveDraw(g2.engine.state, "p0"));
    const before = g3.engine.state.players.find((p) => p.id === "p0")!.score;
    const r = g3.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g3.engine.state.round.lastDrawnTile as TileId },
    });
    expect(r.ok).toBe(false);
    const after = g3.engine.state;
    // 공탁도 나가지 않고 리치도 서지 않는다
    expect(before - after.players.find((p) => p.id === "p0")!.score).toBe(0);
    expect(after.round.byPlayer["p0"]?.riichi ?? null).toBeNull();
    const v1 = buildPlayerView(after, "p1", g3.engine.rules);
    expect(v1.round.byPlayer["p0"]?.riichiDeclared).not.toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 리치 확정 5 — 사가리치는 숨은 리치를 세지 않는다
// ───────────────────────────────────────────────────────────────────────────
describe("사가리치 — 숨은 리치는 4번째로 세지 않는다 (리치 확정 5)", () => {
  const R = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };
  const rk = (s: GameState): string =>
    `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

  function scene(stealth: boolean): GameState {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    return {
      ...withAugs(base, stealth ? { p3: ["stealth_riichi"] } : {}),
      augmentData: stealth
        ? { ...base.augmentData, [`stealth_riichi:active:${rk(base)}:p3#round`]: true }
        : base.augmentData,
      round: {
        ...base.round,
        riichiPot: stealth ? 3000 : 4000,
        byPlayer: Object.fromEntries(
          Object.entries(base.round.byPlayer).map(([id, rs]) => [
            id,
            {
              ...rs,
              riichi: { ...R, cost: id === "p3" && stealth ? 0 : 1000 },
            },
          ]),
        ) as typeof base.round.byPlayer,
      },
    };
  }

  it("공개 리치 3 + 스텔스 리치 1이면 유국이 아니다", () => {
    const st = scene(true);
    const game = createStandardGameFromState(st);
    installAugment(game.engine, stealthRiichi, "p3", { yaku: game.yaku });
    const status = new FlowController(game.engine).begin();
    expect(status.kind).toBe("awaiting");
    expect(game.engine.state.round.phase).not.toBe("round.over");
  });

  it("공개 리치가 4개면 예전대로 유국이다", () => {
    const game = createStandardGameFromState(scene(false));
    new FlowController(game.engine).begin();
    expect(game.engine.state.round.phase).toBe("round.over");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 확정 6·7 — counter
// ───────────────────────────────────────────────────────────────────────────
describe("counter (문구 확정 6·7)", () => {
  const P0 = "234m345p345s678s5s"; // 13장 텐파이
  const P1 = "123m456m789m11p234p"; // 14장

  function scene(p0augs: string[], p1augs: string[]): GameState {
    return withAugs(
      craft({
        hands: { p0: P0, p1: P1, p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: p0augs, p1: p1augs },
    );
  }

  it("공탁을 내지 않는 리치로 추격해도 대납은 1000점이다", () => {
    const st = scene(["counter", "no_retreat"], []);
    const g1 = createStandardGameFromState(st);
    installAugment(g1.engine, counter, "p0", { yaku: g1.yaku });
    installAugment(g1.engine, noRetreat, "p0", { yaku: g1.yaku });
    g1.engine.submit({
      player: "p1",
      type: "riichi",
      payload: { tileId: g1.engine.state.zones["hand:p1"]!.tileIds.at(-1)! },
    });

    const g2 = createStandardGameFromState(giveDraw(g1.engine.state, "p0"));
    installAugment(g2.engine, counter, "p0", { yaku: g2.yaku });
    installAugment(g2.engine, noRetreat, "p0", { yaku: g2.yaku });
    const p1Before = g2.engine.state.players.find((p) => p.id === "p1")!.score;
    const r = g2.engine.submit({
      player: "p0",
      type: "no_retreat_riichi",
      payload: { tileId: g2.engine.state.round.lastDrawnTile as TileId },
    });
    expect(r.ok).toBe(true);
    const after = g2.engine.state;
    // 공탁은 내지 않았지만(cost 0) 대납은 표준 공탁 1000점이다
    expect(after.round.byPlayer["p0"]?.riichi?.cost).toBe(0);
    expect(p1Before - after.players.find((p) => p.id === "p1")!.score).toBe(1000);
    expect(after.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(false);
  });

  it("추격 대상이 숨은 리치면 전원 공개 채널로 새지 않는다", () => {
    const st = scene(["counter"], ["stealth_riichi"]);
    const g1 = createStandardGameFromState(st);
    installAugment(g1.engine, counter, "p0", { yaku: g1.yaku });
    installAugment(g1.engine, stealthRiichi, "p1", { yaku: g1.yaku });
    g1.engine.submit({
      player: "p1",
      type: "stealth_riichi",
      payload: { tileId: g1.engine.state.zones["hand:p1"]!.tileIds.at(-1)! },
    });

    const g2 = createStandardGameFromState(giveDraw(g1.engine.state, "p0"));
    installAugment(g2.engine, counter, "p0", { yaku: g2.yaku });
    installAugment(g2.engine, stealthRiichi, "p1", { yaku: g2.yaku });
    g2.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g2.engine.state.round.lastDrawnTile as TileId },
    });
    const data = g2.engine.state.augmentData;
    expect(data["view:*:counter:p0"]).toBeUndefined();
    // 보유자 본인은 자기가 누구를 잡았는지 알아야 한다
    expect(data["view:p0:counter:p0"]).toBe("p1");
    // 반격 자체는 성립한다
    expect(data["counter:struck:p0"]).toBe(true);
  });

  it("보이는 리치가 대상이면 예전대로 전원 공개다", () => {
    const st = scene(["counter"], []);
    const g1 = createStandardGameFromState(st);
    installAugment(g1.engine, counter, "p0", { yaku: g1.yaku });
    g1.engine.submit({
      player: "p1",
      type: "riichi",
      payload: { tileId: g1.engine.state.zones["hand:p1"]!.tileIds.at(-1)! },
    });
    const g2 = createStandardGameFromState(giveDraw(g1.engine.state, "p0"));
    installAugment(g2.engine, counter, "p0", { yaku: g2.yaku });
    g2.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g2.engine.state.round.lastDrawnTile as TileId },
    });
    expect(g2.engine.state.augmentData["view:*:counter:p0"]).toBe("p1");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 확정 9·10 — no_ron_pact
// ───────────────────────────────────────────────────────────────────────────
describe("no_ron_pact (문구 확정 9·10)", () => {
  function scene(augs: string[], turnCount: number): GameState {
    const base = withAugs(
      craft({
        hands: { p0: "234m345p345s678s5s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
      }),
      { p0: augs },
    );
    return giveDraw({ ...base, round: { ...base.round, turnCount } }, "p0");
  }
  function mk(st: GameState): Game {
    const g = createStandardGameFromState(st);
    installAugment(g.engine, noRonPact, "p0", { yaku: g.yaku });
    installAugment(g.engine, lastStand, "p0", { yaku: g.yaku });
    return g;
  }
  const immune = (g: Game): boolean =>
    g.engine.rules.resolve<boolean>("win.ronImmune", {
      playerId: "p0",
      state: g.engine.state,
    });

  it("리치로 파기한 조약은 승부수로 물려도 돌아오지 않는다", () => {
    const g = mk(scene(["no_ron_pact", "last_stand"], 3));
    expect(immune(g)).toBe(true);
    g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g.engine.state.round.lastDrawnTile as TileId },
    });
    expect(immune(g)).toBe(false);

    const g2 = mk(giveDraw(g.engine.state, "p0"));
    expect(
      g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} }).ok,
    ).toBe(true);
    expect(immune(g2)).toBe(false);
  });

  it("남이 순을 밀어도(turnCount 7) 내가 안 버렸으면 조약은 살아 있다", () => {
    const g = mk(scene(["no_ron_pact", "last_stand"], 7));
    expect(g.engine.state.round.byPlayer["p0"]?.discardCount).toBe(0);
    expect(immune(g)).toBe(true);
  });

  it("내가 7번째로 버리면 조약은 만료된다", () => {
    const base = withAugs(
      craft({
        hands: { p0: "234m345p345s678s5s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1234567z", p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
      }),
      { p0: ["no_ron_pact", "last_stand"] },
    );
    const g = mk(giveDraw(base, "p0"));
    expect(g.engine.state.round.byPlayer["p0"]?.discardCount).toBe(7);
    expect(immune(g)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 확정 8 — late_double × 안깡
// ───────────────────────────────────────────────────────────────────────────
describe("late_double — 깡의 영상 쯔모가 순을 먹지 않는다 (문구 확정 8)", () => {
  function scene(): GameState {
    const base = withAugs(
      craft({
        hands: { p0: "1111m234p567p234s5s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "123456z", p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["late_double"] },
    );
    return { ...base, round: { ...base.round, dealerSeat: 0 } };
  }
  function mk(st: GameState): Game {
    const g = createStandardGameFromState(st);
    installAugment(g.engine, lateDouble, "p0", { yaku: g.yaku });
    return g;
  }

  it("7번째 버림으로 거는 리치는 더블이다 (깡 없음)", () => {
    const g = mk(scene());
    const r = g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g.engine.state.round.lastDrawnTile as TileId },
    });
    expect(r.ok).toBe(true);
    expect(g.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
  });

  it("같은 7번째 버림인데 그 순에 안깡을 쳤어도 더블이다", () => {
    const g = mk(scene());
    const flow = new FlowController(g.engine);
    flow.begin();
    const man1 = handIdsOf(g.engine.state, "p0")
      .filter((id) => kindOf(g.engine.state, id).suit === "man")
      .slice(0, 4);
    flow.submit("p0", { type: "ankan", payload: { tileIds: man1 } } as never);
    expect(g.engine.state.round.lastDrawRinshan).toBe(true);
    const r = g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g.engine.state.round.lastDrawnTile as TileId },
    });
    expect(r.ok).toBe(true);
    expect(g.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
  });

  it("8번째 버림의 리치는 승격되지 않는다", () => {
    const base = withAugs(
      craft({
        hands: { p0: "1111m234p567p234s5s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1234567z", p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["late_double"] },
    );
    const g = mk(base);
    g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: g.engine.state.round.lastDrawnTile as TileId },
    });
    expect(g.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 확정 13 — riichi_upgrade 봉인 공개 표시
// ───────────────────────────────────────────────────────────────────────────
describe("riichi_upgrade — 리치를 물리면 봉인 표시도 내려간다 (문구 확정 13)", () => {
  function mk(st: GameState): Game {
    const g = createStandardGameFromState(st);
    installAugment(g.engine, riichiUpgrade, "p0", { yaku: g.yaku });
    installAugment(g.engine, lastStand, "p0", { yaku: g.yaku });
    return g;
  }
  const scene = (): GameState =>
    withAugs(
      craft({
        hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["riichi_upgrade", "last_stand"] },
    );

  it("승부수로 취소하면 공개 채널이 그 자리에서 비워진다", () => {
    const g = mk(scene());
    g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: handTile(g, "p0", "sou5") },
    });
    const sealed = g.engine.state.augmentData["view:*:riichi_upgrade:p0"];
    expect(typeof sealed).toBe("string");
    expect(sealed).not.toBe("");

    const g2 = mk({
      ...g.engine.state,
      round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0 },
    });
    expect(
      g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} }).ok,
    ).toBe(true);
    expect(g2.engine.state.augmentData["view:*:riichi_upgrade:p0"]).toBe("");
    // 실제 봉인도 함께 풀려 있다
    expect(
      g2.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: sealed as PlayerId,
        state: g2.engine.state,
      }),
    ).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 리치 확정 3 — off_by_one 죽은 대기
// ───────────────────────────────────────────────────────────────────────────
describe("off_by_one — 죽은 대기에는 밀지 않는다 (리치 확정 3)", () => {
  /**
   * p0가 3p/9s 샹퐁 대기로 리치. 죽은 대기 판에서는 3p 4장이 p0(2장)·p1(2장)에
   * 전부 들어가 남은 3p가 0장이다. 살아 있는 판에서는 p1이 3p를 쥐지 않는다.
   */
  function scene(deadWait: boolean): GameState {
    const base = craft({
      hands: {
        p0: "123m456m789m33p99s",
        p1: deadWait ? "33p11122233344s" : "55566677788899s",
        p2: "555m666m777m888m9m",
        p3: "111m222m333m444m1p",
      },
      phase: "turn.draw",
      turnSeat: 0,
    });
    // 패산 맨 위를 4p로 (sys.draw는 wall[0]을 뽑는다). 왕패에 있으면 맞바꾼다.
    const wall = [...base.zones[WALL]!.tileIds];
    const dead = [...(base.zones[DEAD_WALL]?.tileIds ?? [])];
    let pin4 = wall.find((id) => kindKey(base.tiles[id]!.kind) === "pin4");
    let zonesPatch: GameState["zones"] = {};
    if (pin4 === undefined) {
      pin4 = dead.find((id) => kindKey(base.tiles[id]!.kind) === "pin4");
      if (pin4 === undefined) throw new Error("4p가 어디에도 없다");
      const head = wall[0]!;
      zonesPatch = {
        [DEAD_WALL]: {
          ...base.zones[DEAD_WALL]!,
          tileIds: dead.map((id) => (id === pin4 ? head : id)),
        },
      };
      wall[0] = pin4;
    }
    return {
      ...withAugs(base, { p0: ["off_by_one"] }),
      zones: {
        ...base.zones,
        ...zonesPatch,
        [WALL]: {
          ...base.zones[WALL]!,
          tileIds: [pin4, ...wall.filter((id) => id !== pin4)],
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

  const countKind = (st: GameState, key: string): number =>
    Object.values(st.tiles).filter((t) => kindKey(t.kind) === key).length;
  const leftUndrawn = (st: GameState, key: string): number =>
    [WALL, DEAD_WALL]
      .flatMap((z) => st.zones[z]?.tileIds ?? [])
      .filter((id) => kindKey(kindOf(st, id)) === key).length;

  it("오름패가 한 장도 안 남았으면 밀지 않는다 (5번째 장이 생기지 않는다)", () => {
    const st = scene(true);
    expect(leftUndrawn(st, "pin3")).toBe(0);
    const game = createStandardGameFromState(st);
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    const status = new FlowController(game.engine).begin();
    const after = game.engine.state;
    expect(kindKey(kindOf(after, after.round.lastDrawnTile as TileId))).toBe("pin4");
    expect(countKind(after, "pin3")).toBe(4);
    if (status.kind === "awaiting") {
      const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
      expect(opts.filter((o) => o.type === "win")).toHaveLength(0);
    }
  });

  it("오름패가 남아 있으면 예전대로 민다", () => {
    const st = scene(false);
    expect(leftUndrawn(st, "pin3")).toBeGreaterThan(0);
    const game = createStandardGameFromState(st);
    installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    const after = game.engine.state;
    expect(kindKey(kindOf(after, after.round.lastDrawnTile as TileId))).toBe("pin3");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 문구 — 낡은 문장 (palm_flip 잔재 · silent_pact 자기모순 · 오픈 리치 배타 목록)
// ───────────────────────────────────────────────────────────────────────────
describe("문구 — 구현과 어긋난 문장이 남아 있지 않다", () => {
  it("palm_flip은 더 이상 리치를 풀지 않는다 — 그 문구가 남아 있으면 안 된다", () => {
    for (const def of [riichiSeal, allOrNothing]) {
      for (const text of [def.description, def.detail ?? ""]) {
        expect(text).not.toMatch(/손바닥 뒤집기/);
      }
    }
  });

  it("silent_pact — description과 detail이 같은 말을 한다 (안깡은 파기가 아니다)", () => {
    expect(silentPact.description).toMatch(/대명깡/);
    expect(silentPact.detail ?? "").toMatch(/대명깡/);
    // "퐁·치·깡"이라는 옛 표기가 남아 있으면 안 된다
    expect(silentPact.description).not.toMatch(/퐁·치·깡/);
  });

  it("open_riichi_reveal — detail의 배타 목록이 실제 대칭 배제와 같다", () => {
    // 배타 문장은 이제 손으로 적지 않고 `conflicts`에서 생성한다
    // (src/conflictNotes.ts — 2026-08-22 QA round2 확정 1). 그래서 원본 정의가
    // 아니라 **출고되는 카탈로그**를 본다.
    const shipped = contentAugments.find((d) => d.id === openRiichiReveal.id);
    const detail = shipped?.detail ?? "";
    for (const name of ["승부수", "손바닥 뒤집기", "염색", "스텔스 리치"]) {
      expect(detail).toContain(name);
    }
    // 실제로 잠기는 것: 자기 conflicts 3종 + 반대편(stealth_riichi)에서 건 1종
    expect([...(openRiichiReveal.conflicts ?? [])].sort()).toEqual([
      "last_stand",
      "palm_flip",
      "tile_dyeing",
    ]);
    expect(stealthRiichi.conflicts ?? []).toContain("open_riichi_reveal");
  });

  it("riichi_upgrade — description도 detail·구현과 같이 '리치가 유지되는 동안'이다", () => {
    expect(riichiUpgrade.detail ?? "").toContain("리치가 유지되는 동안");
    expect(riichiUpgrade.detail ?? "").toContain("리치가 유지되는 동안");
  });

  it("off_by_one — 죽은 대기 예외가 detail에 적혀 있다", () => {
    expect(offByOne.detail ?? "").toMatch(/4장/);
  });

  it("소스 주석에도 palm_flip이 리치를 푼다는 잔재가 없다", () => {
    // 이 테스트는 문구(카드)만 본다 — 주석은 리뷰 대상이라 여기서는 확인하지 않는다.
    expect(soulStrike.detail ?? "").not.toMatch(/손바닥 뒤집기로 리치를 풀면/);
  });
});
