/**
 * 방해 계열 회귀 — 2026-08-20 QA (disrupt-b 확정 1·2·3·4·6, text 확정 30·32·34).
 *
 * 각 it 하나가 그 보고서의 최소 재현 하나에 대응한다.
 */

import { describe, expect, it } from "vitest";
import {
  SYSTEM_PLAYER,
  ROUND_SCOPED_MARK,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, VisibilityRule } from "@majak/core";
import { craft } from "./helpers.js";
import { callSeal } from "../src/augments/call_seal.js";
import { briefFog } from "../src/augments/brief_fog.js";
import { reload } from "../src/augments/reload.js";
import { disarm } from "../src/augments/disarm.js";
import { timePressure } from "../src/augments/time_pressure.js";
import { voidKan } from "../src/augments/void_kan.js";
import { frameUp } from "../src/augments/frame_up.js";
import { pushRiichi } from "../src/augments/push_riichi.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] ? { ...p, augments: [...(map[p.id] as string[])] } : p,
    ),
  };
}

/** 네 사람이 한 번씩 버린 뒤의 판 (누명의 '첫 바퀴' 보호창 밖) */
function afterFirstGoAround(overrides: Parameters<typeof craft>[0]): GameState {
  return craft({
    discards: { p0: "1z", p1: "1z", p2: "1z", p3: "1z" },
    ...overrides,
  });
}

/*
 * 2026-08-27 — 함구령·박무의 재사용 게이트가 **매치 사용 횟수 → 국 단위 쿨다운**으로
 * 바뀌었다(동풍전 2국·반장전 3국). 재장전은 사용 카운터(`<id>:uses:`)를 되돌리는
 * 물건이라 **국 단위 쿨다운 증강은 애초에 후보가 아니다**(text 확정 34, 아래 describe).
 * 그래서 "재장전이 지속 중인 6순 효과를 끈다"는 경로 자체가 사라졌다 — 확정 2의 요구
 * (효과가 걷히면 안 된다)는 그대로 두고, 재장전이 이제 이 둘을 되살리지 못한다는
 * 사실을 함께 못박는다.
 */
describe("재장전 — 지속 중인 6순 효과를 끄지 않는다 (disrupt-b 확정 2)", () => {
  function scene(augs: string[]): ReturnType<typeof createStandardGameFromState> {
    const s = withAug(
      craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
      { p0: augs },
    );
    const game = createStandardGameFromState(s, undefined, []);
    const defs = { call_seal: callSeal, brief_fog: briefFog, reload } as const;
    for (const a of augs) {
      installAugment(game.engine, defs[a as keyof typeof defs], "p0", { yaku: game.yaku });
    }
    return game;
  }

  it("함구령: 재장전해도 봉인이 6순 동안 살아 있다", () => {
    const game = scene(["call_seal", "reload"]);
    const blocked = (): boolean =>
      game.engine.rules.resolve<boolean>("call.blocked", {
        playerId: "p1" as PlayerId,
        state: game.engine.state,
      });
    expect(blocked()).toBe(false);
    expect(game.engine.submit({ player: "p0", type: "call_seal_use", payload: {} }).ok).toBe(true);
    expect(blocked()).toBe(true);
    // 쿨다운형이라 재장전 대상이 아니다 (사용 카운터가 없다)
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "call_seal" } })
        .ok,
    ).toBe(false);
    expect(game.engine.state.augmentData["call_seal:uses:p0"]).toBeUndefined();
    expect(blocked()).toBe(true); // ← 예전에는 여기서 봉인이 걷혔다
  });

  it("박무: 재장전해도 안개가 걷히지 않는다", () => {
    const game = scene(["brief_fog", "reload"]);
    const vis = (): VisibilityRule =>
      game.engine.rules.resolve<VisibilityRule>("visibility.discards", {
        playerId: "p1" as PlayerId,
        state: game.engine.state,
      });
    game.engine.submit({ player: "p0", type: "declare_brief_fog", payload: {} });
    expect(vis()).toBe("count_only");
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "brief_fog" } })
        .ok,
    ).toBe(false);
    expect(game.engine.state.augmentData["brief_fog:uses:p0"]).toBeUndefined();
    expect(vis()).toBe("count_only");
  });
});

describe("재장전 — 국 단위 쿨다운 증강은 후보가 아니다 (text 확정 34)", () => {
  it("`<id>:seq:` 를 함께 쓰는 증강의 `:used:` 는 소진 카운터로 보지 않는다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const s: GameState = {
      ...withAug(base, { p0: ["discard_lock", "reload"] }),
      augmentData: {
        ...base.augmentData,
        // 봉인술사 규약: seq = 지금까지 진행된 국, used = 마지막 발동 국
        "discard_lock:seq:p0": 3,
        "discard_lock:used:p0": 3,
      },
    };
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, reload, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0" as PlayerId,
      type: "reload_use",
      payload: { augmentId: "discard_lock" },
    });
    expect(res.ok).toBe(false);
    expect(game.engine.state.augmentData["discard_lock:used:p0"]).toBe(3);
  });
});

describe("무장해제 × 초읽기 (disrupt-b 확정 3)", () => {
  it("초읽기를 잠그면 5초 제한 채널이 그 자리에서 내려간다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const s: GameState = {
      ...withAug(base, { p0: ["disarm"], p1: ["time_pressure"] }),
      augmentData: {
        ...base.augmentData,
        [`view:*:time_pressure${ROUND_SCOPED_MARK}`]: 5,
      },
    };
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
    installAugment(game.engine, timePressure, "p1", { yaku: game.yaku });
    expect(game.engine.state.augmentData[`view:*:time_pressure${ROUND_SCOPED_MARK}`]).toBe(5);
    const res = game.engine.submit({
      player: "p0" as PlayerId,
      type: "disarm_lock",
      payload: { target: "p1" as PlayerId, augmentId: "time_pressure" },
    });
    expect(res.ok).toBe(true);
    expect(
      game.engine.state.augmentData[`view:*:time_pressure${ROUND_SCOPED_MARK}`] ?? null,
    ).toBeNull();
  });
});

describe("성립하지 않는 깡 — 리치 중에는 잠긴다 (text 확정 30)", () => {
  function robbable(riichi: boolean): boolean {
    const base = craft({
      hands: { p0: "23456789m45699p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5z", p1: "5z", p2: "5z", p3: "5z" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const tile = base.zones[discardsZone("p0")]?.tileIds[0] as number;
    const s: GameState = {
      ...withAug(base, { p0: ["void_kan"] }),
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...(base.round.byPlayer["p0"] as GameState["round"]["byPlayer"][string]),
            riichi: riichi
              ? { double: false, ippatsu: false, discardIndex: 0, discardTileId: tile, cost: 1000 }
              : null,
          },
        },
      },
    };
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
    return game.engine.rules.resolve<boolean>("win.closedKanRobbable", {
      playerId: "p0" as PlayerId,
      state: game.engine.state,
    });
  }

  it("리치를 걸지 않았으면 안깡 창깡이 열린다", () => {
    expect(robbable(false)).toBe(true);
  });

  it("리치 중에는 열리지 않는다 (문구대로 잠든다)", () => {
    expect(robbable(true)).toBe(false);
  });
});

describe("누명 — 첫 바퀴 보호창 (text 확정 32)", () => {
  it("퐁으로 firstTurn이 내려가도 아무도 안 버렸으면 못 쓴다", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m123p55p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    // 퐁 직후를 흉내낸다 — firstTurn은 내려갔지만 네 사람 모두 버림 0
    const s: GameState = {
      ...withAug(base, { p1: ["frame_up"] }),
      round: { ...base.round, firstTurn: false },
    };
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, frameUp, "p1", { yaku: game.yaku });
    const tile = handIdsOf(game.engine.state, "p1")[0] as number;
    const res = game.engine.submit({
      player: "p1" as PlayerId,
      type: "frame_discard",
      payload: { tileId: tile, target: "p2" as PlayerId },
    });
    expect(res.ok).toBe(false);
  });

  it("네 사람이 한 번씩 버린 뒤에는 열린다", () => {
    const s = withAug(
      afterFirstGoAround({
        hands: { p0: "*", p1: "123m456m789m123p55p", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
      }),
      { p1: ["frame_up"] },
    );
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, frameUp, "p1", { yaku: game.yaku });
    const tile = handIdsOf(game.engine.state, "p1")[0] as number;
    const res = game.engine.submit({
      player: "p1" as PlayerId,
      type: "frame_discard",
      payload: { tileId: tile, target: "p2" as PlayerId },
    });
    expect(res.ok).toBe(true);
  });
});

describe("누명 — 유국만관을 지켜 주지 않는다 (disrupt-b 확정 4)", () => {
  function settleDraw(useFrame: boolean): number[] {
    const base = withAug(
      craft({
        hands: { p0: "5m123p456p789p11s2s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "119m19p1z", p1: "234m", p2: "234p", p3: "234s" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up"] },
    );
    const s: GameState = {
      ...base,
      zones: {
        ...base.zones,
        wall: { ...(base.zones["wall"] as GameState["zones"][string]), tileIds: [] },
      },
    };
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
    const five = handIdsOf(game.engine.state, "p0").find((id) => {
      const k = game.engine.state.tiles[id]?.kind;
      return k?.suit === "man" && k.rank === 5;
    }) as number;
    game.engine.submit(
      useFrame
        ? {
            player: "p0" as PlayerId,
            type: "frame_discard",
            payload: { tileId: five, target: "p1" as PlayerId },
          }
        : { player: "p0" as PlayerId, type: "discard", payload: { tileId: five } },
    );
    const mid: GameState = {
      ...game.engine.state,
      round: { ...game.engine.state.round, phase: "turn.draw" },
    };
    const g2 = createStandardGameFromState(mid, undefined, []);
    installAugment(g2.engine, frameUp, "p0", { yaku: g2.yaku });
    const before = g2.engine.state.players.map((p) => p.score);
    expect(g2.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} }).ok).toBe(
      true,
    );
    return g2.engine.state.players.map((p, i) => p.score - (before[i] as number));
  }

  it("중장패를 남의 바닥에 심어도 유국만관이 성립하지 않는다", () => {
    const standard = settleDraw(false);
    const framed = settleDraw(true);
    expect(standard[0]).toBeLessThan(0); // 표준 버림 = 나가시 깨짐(노텐 벌점)
    expect(framed).toEqual(standard); // 누명이라고 달라지지 않는다
  });
});

describe("등 떠밀기 × 누명 — 선언패 없는 리치를 만들지 않는다 (disrupt-b 확정 6)", () => {
  it("명의가 남에게 가는 버림에는 강제 리치를 얹지 않는다", () => {
    const base = withAug(
      afterFirstGoAround({
        hands: { p0: "*", p1: "123m456m789m123p5z9p", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 1,
      }),
      { p0: ["push_riichi"], p1: ["frame_up"] },
    );
    const game = createStandardGameFromState(base, undefined, []);
    installAugment(game.engine, pushRiichi, "p0", { yaku: game.yaku });
    installAugment(game.engine, frameUp, "p1", { yaku: game.yaku });
    // p0의 낙인은 정식 액션으로 찍는다 (키 이름 규약에 기대지 않는다)
    const seat0: GameState = {
      ...game.engine.state,
      round: { ...game.engine.state.round, turnSeat: 0 },
    };
    const g = createStandardGameFromState(seat0, undefined, []);
    installAugment(g.engine, pushRiichi, "p0", { yaku: g.yaku });
    installAugment(g.engine, frameUp, "p1", { yaku: g.yaku });
    expect(
      g.engine.submit({
        player: "p0" as PlayerId,
        type: "push_brand",
        payload: { target: "p1" as PlayerId },
      }).ok,
    ).toBe(true);

    // 낙인이 찍힌 p1이 누명으로 버린다 → 강제 리치가 얹히면 안 된다
    const back: GameState = {
      ...g.engine.state,
      round: { ...g.engine.state.round, turnSeat: 1 },
    };
    const g2 = createStandardGameFromState(back, undefined, []);
    installAugment(g2.engine, pushRiichi, "p0", { yaku: g2.yaku });
    installAugment(g2.engine, frameUp, "p1", { yaku: g2.yaku });
    const nine = handIdsOf(g2.engine.state, "p1").find((id) => {
      const k = g2.engine.state.tiles[id]?.kind;
      return k?.suit === "pin" && k.rank === 9;
    }) as number;
    const res = g2.engine.submit({
      player: "p1" as PlayerId,
      type: "frame_discard",
      payload: { tileId: nine, target: "p2" as PlayerId },
    });
    expect(res.ok).toBe(true);
    expect(g2.engine.state.round.byPlayer["p1"]?.riichi ?? null).toBeNull();
    expect(g2.engine.state.round.riichiPot).toBe(0);

    // 대조군 — 같은 낙인·같은 패를 **표준 버림**으로 내면 예정대로 강제 리치가 걸린다
    const g3 = createStandardGameFromState(back, undefined, []);
    installAugment(g3.engine, pushRiichi, "p0", { yaku: g3.yaku });
    installAugment(g3.engine, frameUp, "p1", { yaku: g3.yaku });
    expect(
      g3.engine.submit({ player: "p1" as PlayerId, type: "discard", payload: { tileId: nine } }).ok,
    ).toBe(true);
    expect(g3.engine.state.round.byPlayer["p1"]?.riichi ?? null).not.toBeNull();
  });
});

describe("국 스코프 데이터 키 — 국 경계에서 엔진이 지운다 (cross 확정 3)", () => {
  it("함구령의 선언 순 기준점 키에 정리 표식이 붙어 있다", () => {
    const s = withAug(
      craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
      { p0: ["call_seal"] },
    );
    const game = createStandardGameFromState(s, undefined, []);
    installAugment(game.engine, callSeal, "p0", { yaku: game.yaku });
    game.engine.submit({ player: "p0" as PlayerId, type: "call_seal_use", payload: {} });
    const keys = Object.keys(game.engine.state.augmentData).filter((k) =>
      k.startsWith("call_seal:turn:"),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]?.endsWith(ROUND_SCOPED_MARK)).toBe(true);
    // 게임 스코프(쿨다운 기준점)에는 표식이 붙지 않는다 — 국을 넘어 살아야 한다
    expect(typeof game.engine.state.augmentData["call_seal:usedSeq:p0"]).toBe("number");
  });
});
