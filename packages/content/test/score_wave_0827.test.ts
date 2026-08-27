/**
 * 2026-08-27 밸런스 웨이브 — 점수·화료 4건 회귀.
 *
 *  1. 정적의 손(silent_swap): 발동 국 화료 **+2판이 사라졌다**. 후리텐이어도 집어 온
 *     패로 쯔모 화료가 된다(같은 파일의 furiten 테스트가 규칙 쪽을 못박는다).
 *  2. 책임전가(blame_shift): 론 화료 +2판 (blame_shift.test.ts).
 *  3. 덤터기(scapegoat): 쯔모 화료 +2판, 론에는 0판.
 *  4. 등 떠밀기(push_riichi): 내가 떠밀어 리치를 걸게 만든 그 사람을 직격 론으로
 *     잡으면 +3판. 떠민 적이 없거나 다른 사람에게 론하면 0판.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SCOPED_MARK,
  ROUND_SETTLED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { silentSwap } from "../src/augments/silent_swap.js";
import { scapegoat } from "../src/augments/scapegoat.js";
import { pushRiichi } from "../src/augments/push_riichi.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function start(state: GameState, aug: AugmentDef, holder: PlayerId = "p0") {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, aug, holder, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine
    .eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      return log[i]!.payload as RoundSettledPayload;
    }
  }
  throw new Error("no RoundSettled event");
}

/** 그 증강이 이 사람 줄에 남긴 판수 (없으면 0) */
function hanOf(p: RoundSettledPayload, augId: string, player: PlayerId): number {
  return (p.augPoints ?? [])
    .filter((n) => n.augId === augId && n.player === player)
    .reduce((a, n) => a + (n.han ?? 0), 0);
}

/* ────────────────────────────── 1. 정적의 손 ────────────────────────────── */

describe("정적의 손 (silent_swap) — 판수 보너스 삭제", () => {
  it("발동한 국에 화료해도 판수가 붙지 않는다 (후리텐 쯔모 포함)", () => {
    // p0: 3만 단기 대기 + 이미 3만을 버려 후리텐. p1의 바닥에 3만이 있다.
    const state = withAug(
      craft({
        hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "3m1z", p1: "2z3z3m", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["silent_swap"],
    );
    const { game, flow } = start(state, silentSwap);
    const ids = game.engine.state.zones[discardsZone("p1")]?.tileIds ?? [];
    const tileId = ids.find((id) => {
      const k = kindOf(game.engine.state, id);
      return k.suit === "man" && k.rank === 3;
    }) as TileId;
    expect(tileId).toBeDefined();

    flow.submit("p0", { type: "silent_take", payload: { tileId } });
    // 후리텐이어도 이 카드로 집어 온 패로는 화료된다 (2026-08-27 사양)
    const status = flow.submit("p0", { type: "win", payload: {} });
    expect(status.kind).toBe("roundOver");

    const settled = lastSettled(flow);
    expect(settled.outcome).toBe("win");
    expect(settled.winInfos?.[0]?.winner).toBe("p0");
    // 정산 어느 줄에도 정적의 손이 없다 — 점수를 움직이지 않는 카드가 됐다
    expect(
      (settled.augPoints ?? []).filter((n) => n.augId === "silent_swap"),
    ).toEqual([]);
  });
});

/* ────────────────────────────── 3. 덤터기 ────────────────────────────── */

/** p0가 9s 쯔모로 화료하는 장면 */
function tsumoScene(augId: string): GameState {
  return withAug(
    craft({
      hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    "p0",
    [augId],
  );
}

/** p1이 9s를 버려 p0가 론하는 장면 */
function ronScene(augId: string): GameState {
  return withAug(
    craft({
      hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "9s" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "9s" },
    }),
    "p0",
    [augId],
  );
}

describe("덤터기 (scapegoat) — 쯔모 화료 +2판", () => {
  it("쯔모로 화료하면 +2판을 얻고 지불은 여전히 지목당한 사람에게 몰린다", () => {
    const { game, flow } = start(tsumoScene("scapegoat"), scapegoat);
    expect(
      game.engine.submit({
        player: "p0",
        type: "scapegoat_mark",
        payload: { target: "p1" },
      }).ok,
    ).toBe(true);
    flow.submit("p0", { type: "win", payload: {} });

    const settled = lastSettled(flow);
    expect(settled.winInfos?.[0]?.winType).toBe("tsumo");
    expect(hanOf(settled, "scapegoat", "p0")).toBe(2);
    // 지불 재배선은 그대로 — 나머지 둘은 한 푼도 내지 않는다
    expect(settled.deltas["p2"] ?? 0).toBe(0);
    expect(settled.deltas["p3"] ?? 0).toBe(0);
    expect(settled.deltas["p1"] ?? 0).toBeLessThan(0);
  });

  it("론 화료에는 판수가 붙지 않는다", () => {
    const { game, flow } = start(ronScene("scapegoat"), scapegoat);
    expect(game.engine.state.round.phase).toBe("reaction");
    flow.submit("p0", { type: "win", payload: {} });
    const settled = lastSettled(flow);
    expect(settled.winInfos?.[0]?.winType).toBe("ron");
    expect(
      (settled.augPoints ?? []).filter((n) => n.augId === "scapegoat"),
    ).toEqual([]);
  });
});

/* ────────────────────────── 4. 등 떠밀기 직격 ────────────────────────── */

function roundScoped(id: string, name: string, state: GameState, h: PlayerId): string {
  const r = state.round;
  return `${id}:${name}:${r.prevalentWind}-${r.roundNumber}-${r.honba}:${h}${ROUND_SCOPED_MARK}`;
}

/**
 * p1은 9s를 버리면 멘젠 텐파이 → 낙인이 있으면 그 버림이 강제 리치가 된다.
 * p0는 그 9s로 론할 수 있는 삼색 단기 텐파이다.
 */
function pushScene(brand: PlayerId | null): GameState {
  const base = withAug(
    craft({
      hands: {
        p0: "123m123p123s678s9s",
        p1: "456m789m11p23p456p9s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    }),
    "p0",
    ["push_riichi"],
  );
  if (brand === null) return base;
  return {
    ...base,
    augmentData: {
      ...base.augmentData,
      [roundScoped("push_riichi", "brand", base, "p0")]: brand,
    },
  };
}

function p1LastTile(game: { engine: { state: GameState } }): TileId {
  const hand = game.engine.state.zones["hand:p1"]?.tileIds ?? [];
  return hand[hand.length - 1] as TileId;
}

describe("등 떠밀기 (push_riichi) — 강제 리치자 직격 론", () => {
  it("내가 떠밀어 리치를 걸게 만든 사람을 론으로 잡으면 +3판", () => {
    const { game, flow } = start(pushScene("p1"), pushRiichi);
    flow.submit("p1", {
      type: "discard",
      payload: { tileId: p1LastTile(game) },
    });
    // 강제 리치가 실제로 걸렸다
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    // 떠민 상대 기록이 남는다 (낙인은 이미 소진돼 비어 있다)
    expect(
      game.engine.state.augmentData[
        roundScoped("push_riichi", "forced", game.engine.state, "p0")
      ],
    ).toBe("p1");

    flow.submit("p0", { type: "win", payload: {} });
    const settled = lastSettled(flow);
    expect(settled.winInfos?.[0]?.winType).toBe("ron");
    expect(settled.winInfos?.[0]?.from).toBe("p1");
    expect(hanOf(settled, "push_riichi", "p0")).toBe(3);
  });

  it("떠민 적이 없으면(낙인 없음) 같은 론에도 판수가 붙지 않는다", () => {
    const { game, flow } = start(pushScene(null), pushRiichi);
    flow.submit("p1", {
      type: "discard",
      payload: { tileId: p1LastTile(game) },
    });
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
    flow.submit("p0", { type: "win", payload: {} });
    const settled = lastSettled(flow);
    expect(settled.winInfos?.[0]?.winType).toBe("ron");
    expect(
      (settled.augPoints ?? []).filter((n) => n.augId === "push_riichi"),
    ).toEqual([]);
  });

  it("떠민 사람이 아닌 다른 사람에게 론하면 붙지 않는다", () => {
    // 기록만 p2로 심어 둔다 — 실제 론은 p1에게서 난다
    const base = pushScene(null);
    const seeded: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        [roundScoped("push_riichi", "forced", base, "p0")]: "p2",
      },
    };
    const { game, flow } = start(seeded, pushRiichi);
    flow.submit("p1", {
      type: "discard",
      payload: { tileId: p1LastTile(game) },
    });
    flow.submit("p0", { type: "win", payload: {} });
    const settled = lastSettled(flow);
    expect(settled.winInfos?.[0]?.from).toBe("p1");
    expect(
      (settled.augPoints ?? []).filter((n) => n.augId === "push_riichi"),
    ).toEqual([]);
  });
});
