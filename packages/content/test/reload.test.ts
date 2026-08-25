/**
 * 재장전 (reload) — 소진한 내 다른 증강의 사용 횟수를 1 복구.
 *  1. 대상 증강의 `<id>:uses:<holder>` 카운터를 1 되돌리고, 재장전 자신을 1 소진한다.
 *  2. 소진 이력이 없는 증강·미보유 증강·자기 자신은 복구 대상이 아니다.
 */

import { describe, expect, it } from "vitest";
import {
  DraftController,
  createStandardGame,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { contentAugments } from "../src/index.js";
import { reload } from "../src/augments/reload.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0 = reload + call_seal(사용 카운터 지정). */
function scene(callSealUses: number): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const s = withAug(base, "p0", ["reload", "call_seal"]);
  return { ...s, augmentData: { ...s.augmentData, "call_seal:uses:p0": callSealUses } };
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, reload, "p0", { yaku: game.yaku });
  return game;
}

describe("재장전 (reload)", () => {
  it("소진한 증강의 사용 카운터를 1 되돌리고 재장전을 1 소진한다", () => {
    const game = start(scene(2)); // call_seal 2회 소진
    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "call_seal" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["call_seal:uses:p0"]).toBe(1); // 1 복구
    expect(game.engine.state.augmentData["reload:uses:p0"]).toBe(1); // 재장전 소진
  });

  it("소진 이력이 없는(카운터 0) 증강은 후보가 아니다", () => {
    const game = start(scene(0));
    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "call_seal" },
    });
    expect(r.ok).toBe(false);
  });

  it("자기 자신·미보유 증강은 복구할 수 없다", () => {
    const game = start(scene(2));
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "reload" } }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "spy" } }).ok,
    ).toBe(false);
  });

  it("불리언 :used: 플래그로 소진을 기록하는 증강(red_five_touch)도 복구 대상이 된다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const s = withAug(base, "p0", ["reload", "red_five_touch"]);
    const withUsed: GameState = {
      ...s,
      augmentData: { ...s.augmentData, "red_five_touch:used:p0": true },
    };
    const game = start(withUsed);
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    expect(opts.some((o) => o.type === "reload_use")).toBe(true);

    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "red_five_touch" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["red_five_touch:used:p0"]).toBe(false);
  });

  /*
   * 선발동형(뽑은 직후 국에 저절로 터지고 끝나는 것 — 눈먼 총알·초읽기·반전)은
   * 소진 표식이 사용 카운터가 아니라 "켜졌던 국"이라, 예전에는 재장전의 사각지대였다.
   * 한 번 터지면 게임 내내 죽은 칸이었다(2026-08-19 사용자 요청).
   */
  describe("선발동형(눈먼 총알)도 다시 장전할 수 있다", () => {
    const preArmScene = (spent: boolean): GameState => {
      const base = craft({
        hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
      });
      const s = withAug(base, "p0", ["reload", "blind_ron"]);
      return {
        ...s,
        augmentData: {
          ...s.augmentData,
          // 켜졌던 국(동1국)과 "이미 지나갔다" 공개 표식
          "blind_ron:armedRound:p0": "1-1-0",
          ...(spent ? { "view:*:spent:blind_ron:p0": true } : {}),
        },
      };
    };

    it("효과가 지나간 뒤에는 후보로 뜨고, 표식이 지워져 다음 국에 다시 켜진다", () => {
      const game = start(preArmScene(true));
      const provider = game.engine.turnOptionProviders[0];
      const opts = provider ? provider(game.engine.state, "p0") : [];
      expect(
        opts.some(
          (o) =>
            o.type === "reload_use" &&
            (o.payload as { augmentId?: string }).augmentId === "blind_ron",
        ),
      ).toBe(true);

      const r = game.engine.submit({
        player: "p0",
        type: "reload_use",
        payload: { augmentId: "blind_ron" },
      });
      expect(r.ok).toBe(true);
      // 두 표식이 모두 지워져야 `armOnNextRound`가 다음 국에 다시 켠다
      expect(game.engine.state.augmentData["blind_ron:armedRound:p0"]).toBeUndefined();
      expect(game.engine.state.augmentData["view:*:spent:blind_ron:p0"]).toBeUndefined();
      expect(game.engine.state.augmentData["reload:uses:p0"]).toBe(1);
    });

    it("지금 켜져 **있는** 국에는 후보가 아니다 — 타는 중인 것은 소진이 아니다", () => {
      const game = start(preArmScene(false));
      const r = game.engine.submit({
        player: "p0",
        type: "reload_use",
        payload: { augmentId: "blind_ron" },
      });
      expect(r.ok).toBe(false);
    });
  });

  it("holderTurnOptions가 복구 가능한 증강만 후보로 낸다", () => {
    const game = start(scene(1));
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    expect(opts.some((o) => o.type === "reload_use")).toBe(true);
    // 소진 이력이 없으면 후보 없음
    const game2 = start(scene(0));
    const provider2 = game2.engine.turnOptionProviders[0];
    const opts2 = provider2 ? provider2(game2.engine.state, "p0") : [];
    expect(opts2.some((o) => o.type === "reload_use")).toBe(false);
  });

  // 첫 스테이지에는 되살릴 증강이 아직 없다 — 그 자리에서 집으면 한 칸을 빈손으로 쓴다.
  it("첫 드래프트(gameStart)에는 제시되지 않고, 이후 스테이지에는 제시될 수 있다", () => {
    const players: PlayerId[] = ["p0", "p1", "p2", "p3"];
    let laterOffers = 0;
    for (let seed = 1; seed <= 60; seed++) {
      /*
       * 재장전은 «되살릴 수 있는 증강»이 손에 있어야 후보에 뜬다(draftRequires).
       * 그 전제를 세워 둔다 — 전원이 횟수형 증강 하나를 들고, 그 공용 잔량 채널
       * (`view:{보유자}:uses:{id}`)이 이미 서 있는 상태.
       */
      const seeded = createStandardGame({
        seed,
        mode: "hanchan",
        extraAugments: contentAugments,
      });
      const g = createStandardGameFromState(
        {
          ...seeded.engine.state,
          players: seeded.engine.state.players.map((p) => ({
            ...p,
            augments: ["call_seal"],
          })),
          augmentData: {
            ...seeded.engine.state.augmentData,
            ...Object.fromEntries(
              players.map((p) => [
                `view:${p}:uses:call_seal`,
                { left: 2, total: 2, scope: "match" },
              ]),
            ),
          },
        },
        undefined,
        contentAugments,
      );
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      for (const p of players) {
        expect(draft.roll("gameStart", p).map((d) => d.id)).not.toContain("reload");
        for (const stage of ["eastThird", "southEntry", "southThird"] as const) {
          if (draft.roll(stage, p).some((d) => d.id === "reload")) laterOffers++;
        }
      }
    }
    expect(laterOffers).toBeGreaterThan(0);
  });

  /*
   * 되살릴 것이 하나도 없으면 **어느 스테이지에서도** 안 나온다 (2026-08-25 사용자 지시).
   *
   * 액티브(쿨다운·상시)만 들고 있는데 재장전이 3지선다에 뜨면 그 칸은 게임이 끝날
   * 때까지 누를 수 없는 죽은 칸이다. `draftStages`는 첫 스테이지만 막을 뿐이라
   * 두 번째 스테이지 이후의 이 경우를 못 잡았다.
   */
  it("횟수형·선발동형 증강이 하나도 없으면 어느 스테이지에도 제시되지 않는다", () => {
    const players: PlayerId[] = ["p0", "p1", "p2", "p3"];
    let offers = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = createStandardGame({
        seed,
        mode: "hanchan",
        extraAugments: contentAugments,
      });
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      for (const p of players) {
        for (const stage of ["gameStart", "eastThird", "southEntry", "southThird"] as const) {
          if (draft.roll(stage, p).some((d) => d.id === "reload")) offers++;
        }
      }
    }
    expect(offers).toBe(0);
  });
});
