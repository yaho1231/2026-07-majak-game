/**
 * 방해·수비·좌석 시너지 회귀 — 2026-08-23 QA synergy3 disrupt 가 확정한 결함들.
 *
 * 이번 축이 찾은 것은 전부 "**한 증강이 자기 파일 안에서만 세상을 본다**"는 한 종류다.
 *
 * 1. 역만 방어술의 쯔모 환급 상한이 표준 분담(1/3)이라, 덤터기가 몰아준 96,000 역만
 *    쯔모에서 **64,000이 그대로 남았다** — 그런데 방어 카운터는 "막았다"고 찍혔다.
 *    론 분기에는 이미 "누가 무는지는 보지 않는다"가 적혀 있었다(확정 1).
 * 2·3. 안개 둘(안개 덮인 바닥·박무)이 겹치면 **양쪽 보유자가 모두** 카드가 약속한
 *    «그대로 읽기»를 잃었다. 박무끼리면 둘 다 0장 — 아무것도 안 든 것보다 못하다.
 *    안개 덮인 바닥은 같은 결함을 이미 한 번 고쳤는데 그 «누구든»이 자기 플래그만
 *    봤다(확정 2·3).
 * 4. 무장해제로 효과는 꺼지는데 **전원 공개 배너가 남아**, 천하무적·불가침 조약이
 *    «론 불가»를 띄운 채 실제로는 론이 열려 있었다(확정 4).
 * 5. 공성계의 **유일한 대가(노텐 벌부)** 를 승승장구가 지워, 노텐 리치가 흑자가
 *    됐다 — conflicts·antiIds 둘 다 없어 한 사람이 얼마든지 함께 들 수 있었다(확정 5).
 *
 * 재현 스크립트 원본은 `qa-lab/synergy3/disrupt/` 에 있다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  buildPlayerView,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { contentAugments } from "../src/index.js";

// ───────────────────────── 공용 하네스 ─────────────────────────

function defOf(id: string): AugmentDef {
  const d = contentAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`unknown augment ${id}`);
  return d;
}

/** map: 좌석 → 증강 id 목록. 카탈로그에서 def를 찾아 전부 install 한다. */
function setup(state: GameState, map: Partial<Record<PlayerId, string[]>>) {
  const withA: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, augments: [...(map[p.id] ?? [])] })),
  };
  const game = createStandardGameFromState(withA);
  for (const [pid, ids] of Object.entries(map)) {
    for (const id of ids ?? []) {
      installAugment(game.engine, defOf(id), pid as PlayerId, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  return game;
}

type Game = ReturnType<typeof setup>;

function submit(game: Game, player: PlayerId, type: string, payload: unknown = {}): void {
  const res = game.engine.submit({ player, type, payload } as never);
  if (!res.ok) throw new Error(`${type} rejected: ${res.reason}`);
}

/** 엔진 상태의 round 필드를 직접 갈아 끼운다 (턴 이동만 필요할 때) */
function patch(game: Game, round: Partial<GameState["round"]>): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, ...round },
  };
}

function viewOf(game: Game, viewer: PlayerId) {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules, {
    yaku: game.yaku,
  });
}

/** viewer 의 augmentView 채널 중 needle 을 포함하는 것들 */
function banners(game: Game, viewer: PlayerId, needle: string): Record<string, unknown> {
  const av = (viewOf(game, viewer).augmentView ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(av).filter(([k]) => k.includes(needle)));
}

function lastSettled(game: Game): RoundSettledPayload {
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function hand(game: Game, p: PlayerId): TileId[] {
  return [...(game.engine.state.zones[handZone(p)]?.tileIds ?? [])];
}

// ═══════════════ 확정 1. 역만 방어술 × 덤터기 ═══════════════

describe("확정 1 — yakuman_shield × scapegoat: 덤터기가 몰아준 역만 쯔모도 전액 막는다", () => {
  /** p0 사암각 단기 쯔모(96,000). p1 이 방어막, p0 이 덤터기로 p1 을 지목한다. */
  const tsumoScene = (): GameState =>
    craft({
      hands: { p0: "111m222m333m444p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });

  function run(aug: Partial<Record<PlayerId, string[]>>, mark: boolean): Game {
    const game = setup(tsumoScene(), aug);
    const flow = new FlowController(game.engine);
    flow.begin();
    if (mark) {
      const st = flow.submit("p0", { type: "scapegoat_mark", payload: { target: "p1" } });
      expect(st.kind).toBe("awaiting");
    }
    expect(flow.submit("p0", { type: "win", payload: {} }).kind).toBe("roundOver");
    return game;
  }

  it("대조군 — 덤터기만 걸면 p1 이 96,000 전액을 문다", () => {
    const p = lastSettled(run({ p0: ["scapegoat"] }, true));
    expect(p.winInfos?.[0]?.points).toBe(96000);
    expect(p.deltas["p1"]).toBe(-96000);
    expect(p.deltas["p2"]).toBe(0);
  });

  it("대조군 — 방어막만 있으면 표준 분담 32,000 이 돌아온다", () => {
    const p = lastSettled(run({ p1: ["yakuman_shield"] }, false));
    expect(p.deltas["p1"]).toBe(0);
  });

  it("덤터기 + 방어막 — 몰린 96,000 이 전액 환급된다 (예전엔 64,000 이 남았다)", () => {
    const game = run({ p0: ["scapegoat"], p1: ["yakuman_shield"] }, true);
    const p = lastSettled(game);
    expect(p.deltas["p1"]).toBe(0);
    // 나머지 둘은 덤터기 약속대로 한 푼도 내지 않는다.
    expect(p.deltas["p2"]).toBe(0);
    expect(p.deltas["p3"]).toBe(0);
    // 2026-08-31: 면제분은 뱅크가 낸다 — 화료자 수령은 깎지 않으므로 총합은 환급액만큼 는다.
    expect(p.deltas["p0"]).toBe(96000);
    expect(Object.values(p.deltas).reduce((a, b) => a + b, 0)).toBe(96000);

    // "막았다"고 찍히는 카운터·공개 채널이 실제 결과와 일치해야 한다 —
    // 예전에는 카운터가 +1 인데 64,000을 물어, 화면에서 원인을 읽을 수 없었다.
    expect((p as { shieldedBy?: PlayerId[] }).shieldedBy).toContain("p1");
    expect(banners(game, "p2", "yakuman_shield")["yakuman_shield:p1"]).toBe(1);
  });

  it("덤터기가 무장해제되면 재배선이 없으므로 상한도 표준 분담으로 돌아간다", () => {
    const game = setup(tsumoScene(), {
      p0: ["scapegoat"],
      p1: ["yakuman_shield"],
      p2: ["disarm"],
    });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "scapegoat_mark", payload: { target: "p1" } });
    patch(game, { phase: "turn.act", turnSeat: 2 });
    submit(game, "p2", "disarm_lock", { target: "p0", augmentId: "scapegoat" });
    patch(game, { phase: "turn.act", turnSeat: 0 });
    expect(flow.submit("p0", { type: "win", payload: {} }).kind).toBe("roundOver");
    const p = lastSettled(game);
    expect(p.deltas["p1"]).toBe(0);
    expect(p.deltas["p2"]).toBe(-32000);
  });
});

// ═══════════════ 확정 2·3. 안개 계열 교차 ═══════════════

describe("확정 2·3 — 안개를 건 사람은 어느 안개에도 가리지 않는다", () => {
  const scene = (): GameState =>
    craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: {
        p0: "123456789m1p",
        p1: "123456789m2p",
        p2: "123456789m3p",
        p3: "123456789m4p",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });

  const actOf = (id: string): string =>
    id === "hidden_river" ? "declare_fog" : "declare_brief_fog";

  /** p0 이 `a`를, p1 이 `b`를 선언한 판을 만든다 (둘 다 선택) */
  function fogGame(a?: string, b?: string): Game {
    const map: Partial<Record<PlayerId, string[]>> = {};
    if (a !== undefined) map["p0"] = [a];
    if (b !== undefined) map["p1"] = [b];
    const game = setup(scene(), map);
    if (a !== undefined) submit(game, "p0", actOf(a), {});
    if (b !== undefined) {
      patch(game, { turnSeat: 1 });
      submit(game, "p1", actOf(b), {});
    }
    return game;
  }

  /** viewer 가 owner 의 바닥을 실제로 몇 장 보는가 */
  function seen(game: Game, viewer: PlayerId, owner: PlayerId): number {
    return viewOf(game, viewer).zones[`discards:${owner}`]?.tileIds.length ?? 0;
  }

  it("대조군 — 안개가 하나뿐이면 그 보유자만 그대로 읽는다", () => {
    const hr = fogGame("hidden_river", undefined);
    expect(seen(hr, "p0", "p2")).toBe(10);
    expect(seen(hr, "p2", "p0")).toBe(6); // 최근 6장

    const bf = fogGame(undefined, "brief_fog");
    expect(seen(bf, "p1", "p2")).toBe(10);
    expect(seen(bf, "p2", "p1")).toBe(0); // count_only
  });

  it("확정 2 — hidden_river × brief_fog: 두 보유자 모두 10장을 그대로 읽는다", () => {
    const g = fogGame("hidden_river", "brief_fog");
    expect(seen(g, "p0", "p2")).toBe(10);
    expect(seen(g, "p1", "p2")).toBe(10);
    // 비보유자는 여전히 더 좁은 쪽(박무의 count_only)에 걸린다
    expect(seen(g, "p2", "p0")).toBe(0);
  });

  it("확정 3 — brief_fog × brief_fog: 양쪽 보유자 모두 10장 (예전엔 둘 다 0장)", () => {
    const g = fogGame("brief_fog", "brief_fog");
    expect(seen(g, "p0", "p2")).toBe(10);
    expect(seen(g, "p1", "p2")).toBe(10);
    expect(seen(g, "p2", "p0")).toBe(0);
  });

  it("hidden_river × hidden_river 도 그대로다 (이미 고쳐져 있던 대조군)", () => {
    const g = fogGame("hidden_river", "hidden_river");
    expect(seen(g, "p0", "p2")).toBe(10);
    expect(seen(g, "p1", "p2")).toBe(10);
    expect(seen(g, "p2", "p0")).toBe(6);
  });
});

// ═══════════════ 확정 4. 무장해제 × 선언 상태 배너 ═══════════════

describe("확정 4 — disarm 으로 잠긴 증강은 전원 공개 배너도 함께 내린다", () => {
  const scene = (): GameState =>
    craft({
      hands: { p0: "123456789m12p33p", p1: "123456789m12p33p", p2: "*", p3: "*" },
      discards: { p0: "1s", p1: "1s", p2: "1s", p3: "1s" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });

  /** p1 이 `id`를 선언한 뒤, p0 이 그것을 무장해제할지 고른다 */
  function run(
    id: string,
    declare: { type: string; payload?: unknown },
    disarmIt: boolean,
  ): Game {
    const game = setup(scene(), { p0: ["disarm"], p1: [id] });
    patch(game, { turnSeat: 1 });
    submit(game, "p1", declare.type, declare.payload ?? {});
    if (disarmIt) {
      patch(game, { turnSeat: 0 });
      submit(game, "p0", "disarm_lock", { target: "p1", augmentId: id });
    }
    return game;
  }

  const cases: { id: string; declare: { type: string; payload?: unknown } }[] = [
    { id: "invincible", declare: { type: "invincible_guard" } },
    { id: "call_seal", declare: { type: "call_seal_use" } },
    { id: "xray_hand", declare: { type: "xray_reveal" } },
    { id: "hidden_river", declare: { type: "declare_fog" } },
    { id: "brief_fog", declare: { type: "declare_brief_fog" } },
    { id: "push_riichi", declare: { type: "push_brand", payload: { target: "p2" } } },
    { id: "parasite", declare: { type: "parasite_attach", payload: { target: "p2" } } },
    { id: "scapegoat", declare: { type: "scapegoat_mark", payload: { target: "p2" } } },
  ];

  for (const c of cases) {
    it(`${c.id} — 선언하면 배너가 서고, 잠기면 사라진다`, () => {
      // 대조군: 선언만 하면 제3자에게 배너가 보인다 (배너가 애초에 안 서면 이 테스트는 의미가 없다)
      expect(Object.keys(banners(run(c.id, c.declare, false), "p2", c.id)).length)
        .toBeGreaterThan(0);
      // 잠근 뒤: 채널이 통째로 사라진다
      expect(banners(run(c.id, c.declare, true), "p2", c.id)).toEqual({});
    });
  }

  it("invincible — 배너가 «론 불가»라고 말하는 동안 실제 면역도 살아 있어야 한다", () => {
    const armed = run("invincible", { type: "invincible_guard" }, false);
    const locked = run("invincible", { type: "invincible_guard" }, true);
    const immune = (g: Game): unknown =>
      g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: g.engine.state,
      } as never);
    expect(immune(armed)).toBe(true);
    expect(banners(armed, "p2", "invincible")["invincible:p1"]).toBe("이번 국 론 불가");
    // 잠긴 뒤에는 둘 다 꺼져 있어야 한다 — 예전에는 면역만 꺼지고 배너가 남았다
    expect(immune(locked)).toBe(false);
    expect(banners(locked, "p2", "invincible")).toEqual({});
  });

  it("no_ron_pact — 조약 배너와 봇용 active 채널이 함께 내려간다", () => {
    // 조약 배너는 «순이 흐를 때» 동기화되므로 버림을 한 번 태운다.
    const build = (disarmIt: boolean): Game => {
      const g = setup(
        craft({
          hands: { p0: "123456789m11p234p", p1: "123456789m11p234p", p2: "*", p3: "*" },
          discards: { p0: "9p", p1: "9p", p2: "9p", p3: "9p" },
          phase: "turn.act",
          turnSeat: 1,
          drawnLastFor: "p1",
        }),
        { p0: ["disarm"], p1: ["no_ron_pact"] },
      );
      const h1 = hand(g, "p1");
      patch(g, { turnSeat: 1, lastDrawnTile: h1[h1.length - 1]! });
      submit(g, "p1", "discard", { tileId: h1[0]! });
      patch(g, { phase: "turn.act", turnSeat: 0 });
      if (disarmIt) submit(g, "p0", "disarm_lock", { target: "p1", augmentId: "no_ron_pact" });
      // 한 번 더 흐른다 (배너 동기화 지점 — 잠긴 뒤라면 다시 서지 않아야 한다)
      const h0 = hand(g, "p0");
      patch(g, { turnSeat: 0, lastDrawnTile: h0[h0.length - 1]! });
      submit(g, "p0", "discard", { tileId: h0[0]! });
      return g;
    };
    const armed = build(false);
    expect(banners(armed, "p2", "no_ron_pact")["no_ron_pact:active:p1"]).toBe(true);

    const locked = build(true);
    expect(banners(locked, "p2", "no_ron_pact")).toEqual({});
    expect(
      locked.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: locked.engine.state,
      } as never),
    ).toBe(false);
  });
});

// ═══════════════ 확정 5. 공성계 × 승승장구 ═══════════════

describe("확정 5 — siege_riichi 와 always_tenpai 는 함께 들 수 없다", () => {
  it("서로를 conflicts 로 잠근다 (노텐 벌부가 공성계의 유일한 대가라서)", () => {
    const siege = defOf("siege_riichi");
    const always = defOf("always_tenpai");
    const clash =
      (siege.conflicts ?? []).includes(always.id) ||
      (always.conflicts ?? []).includes(siege.id);
    expect(clash).toBe(true);
  });

  it("드래프트 배타는 어느 방향이든 성립한다 (한쪽에만 적어도 된다)", () => {
    // HanchanController·draftPick 이 쓰는 판정과 같은 꼴 — 양방향으로 본다.
    const bothWays = (a: string, b: string): boolean =>
      (defOf(a).conflicts ?? []).includes(b) || (defOf(b).conflicts ?? []).includes(a);
    expect(bothWays("siege_riichi", "always_tenpai")).toBe(true);
    expect(bothWays("always_tenpai", "siege_riichi")).toBe(true);
  });
});
