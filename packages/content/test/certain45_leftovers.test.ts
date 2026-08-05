/**
 * docs/25 '확신도 확실' 45건 전수 대조에서 **아직 열려 있던 4건**의 회귀 테스트.
 *
 * 넷 다 같은 부류다 — **판정의 단일 진실을 안 쓰고 사본·우회 경로를 만든 것**.
 *  - 리치 #3  스텔스 리치가 멘젠 판정을 자체 구현해 묵계(silent) 후로를 안 뺐다
 *  - 리치 #4  스텔스 표시 플래그를 버림보다 늦게 세워 은닉 분기가 안 돌았다
 *  - 리치 #7  선언 간파가 물리 손패로 대기를 계산해 hand.winTileIds를 무시했다
 *  - 방해 #3  누명이 표준 discard를 안 거쳐 봉인을 통째로 우회했다
 */

import { describe, expect, it } from "vitest";
import {
  RuleLayer,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  openMeldCountOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { frameUp } from "../src/augments/frame_up.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

// ─────────────────── 리치 #3 · #4 — 스텔스 리치 ───────────────────

describe("스텔스 리치 — 멘젠 판정은 코어와 같아야 한다 (리치 #3)", () => {
  it("묵계(silent) 후로는 멘젠을 깨지 않는다 — 코어와 같은 답", () => {
    const base = craft({
      hands: { p0: "123m456m789m11s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "111z" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs = base.round.byPlayer["p0"]!;
    const withSilent: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          // 묵계 — 눈에 보이게 눕지만 멘젠은 유지된다
          p0: { ...rs, melds: rs.melds.map((m) => ({ ...m, silent: true })) },
        },
      },
    };
    // 코어의 판정: 묵계는 노출 후로로 세지 않는다
    expect(openMeldCountOf(withSilent, "p0")).toBe(0);

    // 스텔스 리치의 **validate**도 같은 답을 내야 한다 (여기서 멘젠을 본다).
    // 후보 제시(holderTurnOptions)는 멘젠을 안 보므로 그것만으로는 검증되지 않는다.
    const game = createStandardGameFromState(withAug(withSilent, "p0", ["stealth_riichi"]));
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("stealth_riichi");
    if (def === undefined) throw new Error("no stealth_riichi action");
    const tileId = handIdsOf(game.engine.state, "p0").at(-1) as TileId;
    const reason = def.validate(
      { player: "p0", type: "stealth_riichi", payload: { tileId } },
      { state: game.engine.state, rules: game.engine.rules },
    );
    expect(reason).not.toBe("riichi requires a closed hand");
  });
});

describe("스텔스 리치 — 은닉 표시가 버림보다 먼저 선다 (리치 #4)", () => {
  it("버림 리액션이 도는 시점에 이미 riichi.hidden이 켜져 있다", () => {
    /*
     * root 이벤트는 순서대로 하나씩 완전히 처리된다. 표시 플래그를 버림 뒤에 두면
     * 그 버림의 리액션이 도는 동안 riichi.hidden이 꺼져 있어, 은닉 분기가 한 번도
     * 안 돌고 스텔스 리치가 전원에게 새어 나간다.
     */
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["stealth_riichi"]));
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });

    // 버림을 관측해 그 시점의 riichi.hidden을 기록하는 리액션을 끼워 넣는다
    let hiddenAtDiscard: boolean | null = null;
    game.engine.effects.register({
      source: "test:probe",
      layer: RuleLayer.Prism,
      on: "TileDiscarded",
      react: (_event, rc) => {
        hiddenAtDiscard = rc.rules.resolve<boolean>("riichi.hidden", {
          playerId: "p0",
          state: rc.state,
        });
      },
    });

    const tileId = handIdsOf(game.engine.state, "p0").at(-1) as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId },
    });
    expect(r.ok).toBe(true);
    expect(hiddenAtDiscard).toBe(true);
  });
});

// ─────────────────── 리치 #7 — 선언 간파 ───────────────────

describe("선언 간파 — 화료 판정용 손패로 대기를 센다 (리치 #7)", () => {
  it("hand.winTileIds가 손패를 덮어쓰면 그 손의 대기를 보여 준다", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m123p1s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs1 = base.round.byPlayer["p1"]!;
    const state: GameState = withAug(
      {
        ...base,
        round: {
          ...base.round,
          byPlayer: {
            ...base.round.byPlayer,
            p1: { ...rs1, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
          },
        },
      },
      "p0",
      ["peek_riichi_waits"],
    );

    const game = createStandardGameFromState(state);
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });

    // 자유 선언처럼 p1의 화료 판정 손패를 스냅샷으로 덮는다 (마지막 한 장을 뺀 12장)
    const p1Hand = [...handIdsOf(game.engine.state, "p1")];
    const snapshot = p1Hand.slice(0, p1Hand.length - 1);
    game.engine.rules.addModifier<readonly TileId[] | null>("hand.winTileIds", {
      source: "test:snapshot",
      layer: RuleLayer.Prism,
      apply: (cur, rctx) => (rctx.playerId === "p1" ? snapshot : cur),
    });

    const r = game.engine.submit({
      player: "p0",
      type: "peek_waits",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);

    /*
     * 스냅샷은 12장이라 화료형이 서지 않는다 → 대기 0종.
     * 물리 손패(13장)로 계산하면 1s 단기 대기가 나온다 — 둘이 확실히 갈린다.
     */
    expect(game.engine.state.augmentData["view:p0:waits:p1"]).toEqual([]);
  });
});

// ─────────────────── 방해 #3 — 누명 × 봉인 ───────────────────

describe("누명 — 봉인된 패는 명의를 돌려서도 못 버린다 (방해 #3)", () => {
  function scene(): GameState {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      // 첫 바퀴가 아니어야 누명을 쓸 수 있다
      discards: { p0: "1z", p1: "1z", p2: "1z", p3: "1z" },
    });
    return withAug(base, "p0", ["frame_up"]);
  }

  function frameResult(sealFirst: boolean): boolean {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
    const target = handIdsOf(game.engine.state, "p0")[0] as TileId;
    if (sealFirst) {
      game.engine.rules.addModifier<TileId[]>("discard.blockedTileIds", {
        source: "test:seal",
        layer: RuleLayer.Prism,
        apply: (cur, rctx) => (rctx.playerId === "p0" ? [...cur, target] : cur),
      });
    }
    return game.engine.submit({
      player: "p0",
      type: "frame_discard",
      payload: { tileId: target, target: "p1" },
    }).ok;
  }

  it("봉인이 없으면 종전대로 누명이 성립한다 (기준선)", () => {
    expect(frameResult(false)).toBe(true);
  });

  it("봉인된 패로는 누명을 쓸 수 없다", () => {
    expect(frameResult(true)).toBe(false);
  });
});
