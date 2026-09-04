/**
 * 증강 4군 2차 QA 회귀 — 2026-08-22 `qa-lab/round2/aug-4.md`
 * (확정 1·2·3·4·5 + 의심 2·3·5).
 *
 * it 하나가 그 보고서의 최소 재현 하나에 대응한다. 원본 재현 스크립트는
 * `qa-lab/round2/aug-4/` 아래에 있고, 여기서는 같은 장면을 테스트로 굳힌다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  ROUND_SCOPED_MARK,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  doraIndicatorIndex,
  handIdsOf,
  installAugment,
  kindKey,
  uraIndicatorIds,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { takeBack } from "../src/augments/take_back.js";
import { voidKan } from "../src/augments/void_kan.js";
import { uraPeek } from "../src/augments/ura_peek.js";
import { soulStrike } from "../src/augments/soul_strike.js";
import { timePressure } from "../src/augments/time_pressure.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] ? { ...p, augments: [...(map[p.id] as string[])] } : p,
    ),
  };
}

/** 이번 국에 "증강이 손패를 고쳤다"는 표식이 남았는가 (천화·지화 게이트) */
function handAlteredMarks(state: GameState): string[] {
  return Object.keys(state.augmentData).filter((k) => k.startsWith("handAltered:"));
}

/** 게임 전체에 그 종류의 패가 몇 장 존재하는가 (5장째 감시) */
function totalCopies(state: GameState, key: string): number {
  return Object.values(state.tiles).filter((t) => kindKey(t.kind) === key).length;
}

const handKeys = (state: GameState, p: PlayerId): string[] =>
  handIdsOf(state, p).map((id) => kindKey(state.tiles[id]?.kind ?? { suit: "man", rank: 1 }));

/** 패산에 그 종류의 실물이 몇 장 남아 있는가 */
function wallCopies(state: GameState, key: string): number {
  return (state.zones[WALL]?.tileIds ?? []).filter(
    (id) => kindKey(state.tiles[id]?.kind ?? { suit: "man", rank: 1 }) === key,
  ).length;
}

// ───────────────────── 확정 1·3. 염색 (tile_dyeing) ─────────────────────

describe("염색 — 천화 게이트와 5번째 장 (aug-4 확정 1·3)", () => {
  /** 오야(p0) 첫 순. 1삭 한 장만 자리에 안 맞는 14장. */
  function dealerFirstTurn(): GameState {
    const base = craft({
      hands: { p0: "123m456m789m23s11s1p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return {
      ...base,
      round: { ...base.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 },
    };
  }

  function setup(state: GameState): Game {
    const game = createStandardGameFromState(withAug(state, { p0: ["tile_dyeing"] }));
    installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
    return game;
  }

  it("확정 1: 염색으로 손을 고치면 handAltered 표식이 남는다 (가짜 천화 차단)", () => {
    const game = setup(dealerFirstTurn());
    const target = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "pin1",
    ) as TileId;
    // 1통 → 1삭: 패산에 1삭이 남아 있어야 발동한다(확정 3의 가드)
    expect(wallCopies(game.engine.state, "sou1")).toBeGreaterThan(0);

    expect(handAlteredMarks(game.engine.state)).toEqual([]);
    const res = game.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId: target, suit: "sou" },
    });
    expect(res.ok).toBe(true);
    // 이 표식이 없으면 코어 게이트(helpers.ts handAlteredByAugment)가 통과해
    // 오야 첫 순 천화 48,000점이 그대로 나간다 (정상 12,000).
    expect(handAlteredMarks(game.engine.state)).toHaveLength(1);
  });

  it("확정 3: 염색은 패산의 실물과 맞바꾼다 — 장수 분포가 보존된다", () => {
    const game = setup(dealerFirstTurn());
    const before = {
      pin1: totalCopies(game.engine.state, "pin1"),
      sou1: totalCopies(game.engine.state, "sou1"),
    };
    const target = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "pin1",
    ) as TileId;
    expect(
      game.engine.submit({
        player: "p0",
        type: "tile_dye",
        payload: { tileId: target, suit: "sou" },
      }).ok,
    ).toBe(true);

    // 손패는 물들었지만 게임 전체 장수는 그대로다 (예전엔 sou1이 5장이 됐다)
    expect(kindKey(game.engine.state.tiles[target]?.kind as never)).toBe("sou1");
    expect(totalCopies(game.engine.state, "sou1")).toBe(before.sou1);
    expect(totalCopies(game.engine.state, "pin1")).toBe(before.pin1);
  });

  it("확정 3: 넉 장이 이미 전부 드러난 종류로는 물들 수 없다 (후보에서도 빠진다)", () => {
    // 3통 넉 장이 전부 눈에 보인다 — 손 1장 + 바닥 3장
    const base = craft({
      hands: { p0: "3p123m456m789m11s2s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "3p", p2: "3p", p3: "3p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = setup(base);
    expect(totalCopies(game.engine.state, "pin3")).toBe(4);
    const man3 = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "man3",
    ) as TileId;

    const res = game.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId: man3, suit: "pin" },
    });
    expect(res.ok).toBe(false);
    expect(totalCopies(game.engine.state, "pin3")).toBe(4); // 5장째가 생기지 않았다
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    expect(
      opts.some(
        (o) =>
          o.type === "tile_dye" &&
          (o.payload as { tileId?: TileId; suit?: string }).tileId === man3 &&
          (o.payload as { suit?: string }).suit === "pin",
      ),
    ).toBe(false);
  });
});

// ───────────────────── 확정 2. 무르기 (take_back) ─────────────────────

describe("무르기 — 되뽑은 패로 나도 천화가 서지 않는다 (aug-4 확정 2)", () => {
  it("확정 2: TakeBackPerformed 가 handAltered 표식을 남긴다", () => {
    const base = craft({
      hands: { p0: "123456789m23p1s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = {
      ...base,
      round: { ...base.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 },
    };
    const game = createStandardGameFromState(withAug(state, { p0: ["take_back"] }));
    installAugment(game.engine, takeBack, "p0", { yaku: game.yaku });

    expect(handAlteredMarks(game.engine.state)).toEqual([]);
    expect(game.engine.submit({ player: "p0", type: "take_back", payload: {} }).ok).toBe(
      true,
    );
    expect(handAlteredMarks(game.engine.state)).toHaveLength(1);
  });
});

// ───────────────── 확정 4 · 의심 3. 성립하지 않는 깡 (void_kan) ─────────────────

describe("성립하지 않는 깡 — 위조 후보와 재료 (aug-4 확정 4 · 의심 3)", () => {
  /** p0 = 1삭 단기 텐파이(void_kan 보유), p1 = 1만 넉 장으로 안깡 */
  function scene(sou1Gone: boolean): Game {
    const base = craft({
      hands: {
        p0: "234m567m234p567p1s",
        p1: "1111m99p99s567s2z",
        p2: "*",
        p3: "*",
      },
      // 1삭 석 장이 바닥에 나와 있으면 내 손의 한 장까지 넉 장 전부가 소진이다
      discards: sou1Gone ? { p1: "1s", p2: "1s", p3: "1s" } : {},
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const game = createStandardGameFromState(withAug(base, { p0: ["void_kan"] }));
    installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
    return game;
  }

  function p1Ankan(game: Game): boolean {
    const s = game.engine.state;
    const ids = handIdsOf(s, "p1").filter(
      (id) => kindKey(s.tiles[id]?.kind as never) === "man1",
    );
    return game.engine.submit({
      player: "p1",
      type: "ankan",
      payload: { tileIds: ids as [TileId, TileId, TileId, TileId] },
    }).ok;
  }

  it("확정 4: 넉 장이 이미 다 나온 종류로는 위조하지 않는다 (5번째 장 금지)", () => {
    const game = scene(true);
    expect(totalCopies(game.engine.state, "sou1")).toBe(4);

    expect(p1Ankan(game)).toBe(true);

    // 예전에는 man4 한 장이 **다섯 번째 1삭**으로 바뀌었다 — 1삭은 이미 소진인데도.
    // 이제는 그 후보가 걸러지고, 남은 유일한 길인 «깡패(1만)로 단기»가 채택된다.
    expect(totalCopies(game.engine.state, "sou1")).toBeLessThanOrEqual(4);
    // 깡패 자신은 예외다 (forgeWait 주석 참고) — 자패 안깡에는 이 길밖에 없다
    expect(handKeys(game.engine.state, "p0")).toContain("man1");
  });

  it("아직 남아 있는 종류로는 예전처럼 위조한다 (능력이 죽지 않았다)", () => {
    const game = scene(false);
    const before = handKeys(game.engine.state, "p0");
    expect(p1Ankan(game)).toBe(true);
    expect(handKeys(game.engine.state, "p0")).not.toEqual(before);
  });

  it("의심 3: 다른 잡패로도 맞출 수 있으면 도라를 재료로 태우지 않는다", () => {
    const game = scene(false);
    // 도라 표시패를 3만으로 바꾼다 → 이 국의 도라는 4만 (p0 손패의 그 한 장)
    const indicator = game.engine.state.round.doraIndicators[0] as TileId;
    const s0 = game.engine.state;
    const tile = s0.tiles[indicator];
    if (tile === undefined) throw new Error("no indicator tile");
    const patched: GameState = {
      ...s0,
      tiles: { ...s0.tiles, [indicator]: { ...tile, kind: { suit: "man", rank: 3 } } },
    };
    const g2 = createStandardGameFromState(patched);
    installAugment(g2.engine, voidKan, "p0", { yaku: g2.yaku });
    const doraTileId = handIdsOf(g2.engine.state, "p0").find(
      (id) => kindKey(g2.engine.state.tiles[id]?.kind as never) === "man4",
    ) as TileId;
    const doraKindBefore = kindKey(g2.engine.state.tiles[doraTileId]?.kind as never);

    expect(p1Ankan(g2)).toBe(true);
    // 위조 자체는 일어났지만 도라(4만)는 살아남았다
    expect(handKeys(g2.engine.state, "p0")).not.toEqual(handKeys(patched, "p0"));
    expect(kindKey(g2.engine.state.tiles[doraTileId]?.kind as never)).toBe(doraKindBefore);
  });
});

// ───────────────────── 확정 5. 이면투시 (ura_peek) ─────────────────────

describe("이면투시 — 바꿔치기 후보는 내 손패뿐이다 (aug-4 확정 5)", () => {
  function setup(): Game {
    const base = craft({
      hands: { p0: "1111m234p567p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAug(base, { p0: ["ura_peek"] }));
    installAugment(game.engine, uraPeek, "p0", { yaku: game.yaku });
    game.engine.submit({ player: "p0", type: "ura_peek_reveal", payload: {} });
    return game;
  }

  /*
   * 확정 5는 "왕패 자리를 골라 **다음 깡 도라를 직접 심는다**"였다. 2026-09-04에
   * 바꿔치기 상대가 왕패에서 **내 손패**로 바뀌면서 그 축이 통째로 사라졌다 —
   * 이제 고를 수 있는 것은 내 손패뿐이고, 손대는 왕패 자리는 뒷도라 표시패 하나다.
   */
  it("확정 5: 왕패 자리는 후보에 없다 — 도라 표시패 자리도 못 심는다", () => {
    const game = setup();
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    const swaps = opts.filter((o) => o.type === "ura_swap");
    expect(swaps.length).toBeGreaterThan(0);
    expect(
      swaps.every(
        (o) => (o.payload as { deadIndex?: number }).deadIndex === undefined,
      ),
    ).toBe(true);
    // 왕패 자리를 직접 찔러도 거절된다 (손패가 아니다)
    const nextDora = doraIndicatorIndex(game.engine.state, 1);
    expect(
      game.engine.submit({
        player: "p0",
        type: "ura_swap",
        payload: { deadIndex: nextDora },
      }).ok,
    ).toBe(false);
  });

  it("바꿔치기해도 도라 표시패는 흔들리지 않는다", () => {
    const game = setup();
    const doraBefore = [...game.engine.state.round.doraIndicators];
    const handTileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "ura_swap", payload: { handTileId } }).ok,
    ).toBe(true);
    expect(game.engine.state.round.doraIndicators).toEqual(doraBefore);
    expect(uraIndicatorIds(game.engine.state)[0]).toBe(handTileId);
    expect(game.engine.state.zones[DEAD_WALL]?.tileIds).toHaveLength(
      (game.engine.state.zones[DEAD_WALL]?.tileIds ?? []).length,
    );
  });
});

// ───────────────────── 의심 5. 영혼의 일격 (soul_strike) ─────────────────────

describe("영혼의 일격 — 리치가 취소되면 폭주도 끝난다 (aug-4 의심 5)", () => {
  it("의심 5: 리치가 사라지면 연속 쯔모 플래그가 그 자리에서 내려간다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const active = `soul_strike:active:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p0${ROUND_SCOPED_MARK}`;
    const left = `soul_strike:left:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p0${ROUND_SCOPED_MARK}`;
    const state: GameState = {
      ...withAug(base, { p0: ["soul_strike"] }),
      // 폭주 중인데 리치는 이미 취소된 상태 (승부수·은밀한 리치 해제가 만드는 자리)
      augmentData: { ...base.augmentData, [active]: true, [left]: 4 },
    };
    expect(state.round.byPlayer["p0"]?.riichi ?? null).toBeNull();

    const game = createStandardGameFromState(state);
    installAugment(game.engine, soulStrike, "p0", { yaku: game.yaku });
    // 아무 이벤트나 한 번 돌면 정리 리액션이 표식을 내린다
    game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.flipDora", payload: {} });

    expect(game.engine.state.augmentData[active]).toBe(false);
    expect(game.engine.state.augmentData[left]).toBe(0);
  });
});

// ───────────────────── 의심 2. 초읽기 (time_pressure) ─────────────────────

describe("초읽기 — 한 명 무장해제가 남의 것까지 끄지 않는다 (aug-4 의심 2)", () => {
  it("의심 2: 두 명이 들었을 때 한쪽만 잠그면 5초 제한은 남는다", async () => {
    const { disarm } = await import("../src/augments/disarm.js");
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const channel = `view:*:time_pressure${ROUND_SCOPED_MARK}`;
    const state: GameState = {
      ...withAug(base, {
        p0: ["disarm"],
        p1: ["time_pressure"],
        p2: ["time_pressure"],
      }),
      augmentData: {
        ...base.augmentData,
        [channel]: 5,
        // 두 사람 모두 이번 국에 자동 발동해 있다 (armOnNextRound 규약)
        "time_pressure:armedRound:p1": `${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}`,
        "time_pressure:armedRound:p2": `${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}`,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
    installAugment(game.engine, timePressure, "p1", { yaku: game.yaku });
    installAugment(game.engine, timePressure, "p2", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1" as PlayerId, augmentId: "time_pressure" },
    });
    expect(res.ok).toBe(true);
    // p2의 초읽기는 잠긴 적이 없다 — 공용 채널이라도 남의 효과까지 꺼지면 안 된다
    expect(game.engine.state.augmentData[channel]).toBe(5);
  });
});
