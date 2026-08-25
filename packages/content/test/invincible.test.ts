/**
 * invincible (천하무적) — 2국당 1회, 선언한 국 동안 타가는 보유자를 론할 수 없다.
 * 코어 규칙 `win.ronImmune`(playerId = '쏘일 사람')로 표준 win 액션의 리액션 분기를 막는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { invincible } from "../src/augments/invincible.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** p0가 5s를 버리고 p1이 그걸 론할 수 있는 리액션 상황 */
function craftRon(): GameState {
  const s = craft({
    hands: { p0: "*", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 0,
    lastDiscard: { player: "p0", spec: "5s" },
  });
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
    ),
  };
}

describe("invincible (천하무적)", () => {
  it("선언 전에는 평소대로 론당한다", () => {
    const game = createStandardGameFromState(craftRon());
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBeNull();
  });

  it("선언한 국에는 아무도 보유자의 버림패를 론할 수 없다", () => {
    const base = craftRon();
    const state: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        [`invincible:active:${roundKey(base)}:p0#round`]: true,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBe("discarder is immune to ron");
  });

  // 쿨다운은 2026-08-25 반장전 QA에서 모드별로 갈렸다 — 동풍전 2국 · 반장전 3국.
  // 여기서는 동풍전(기준선)을 못박고, 반장전 쪽은 hanchan_balance_0825.test.ts가 본다.
  it("자기 턴에 선언하면 플래그와 쿨다운(동풍전 2국)이 기록되고, 쿨다운 중에는 막힌다", () => {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      config: { ...base.config, mode: "tonpuu" },
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });

    const r = game.engine.submit({
      player: "p0",
      type: "invincible_guard",
      payload: {},
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    expect(st.augmentData[`invincible:active:${roundKey(st)}:p0#round`]).toBe(true);
    expect(st.augmentData["invincible:cd:p0"]).toBe(2);

    // 같은 국 재선언 거부
    const again = game.engine.submit({
      player: "p0",
      type: "invincible_guard",
      payload: {},
    });
    expect(again.ok).toBe(false);
  });
});

/**
 * 숨어 있던 공격력 (docs/25 최우선#4).
 *
 * `win.ronImmune`은 win 액션의 **론 옵션만** 없앤다. 그런데 FlowController의
 * `markPassFuriten`은 "대기패가 지나갔다"만 보고 후리텐을 찍었고, 리치 중이면
 * `permanent: true`(리치 후리텐 = 국 끝까지 론 불가)까지 걸었다.
 *
 * 결과: 천하무적 보유자는 **아무 패나 던지는 것만으로** 리치자 전원을 그 국 내내
 * 쯔모 전용으로 만들 수 있었다. 설명("내 버림패로 쏘이지 않는다")에 없는 능력이다.
 */
describe("invincible — 막은 버림은 후리텐도 만들지 않는다", () => {
  /** p1이 5s 대기로 리치 중이고, p0가 그 5s를 버리는 장면 */
  function scene(active: boolean): Game {
    const base = craft({
      // p0의 손에 p1의 대기패(5s)를 쥐어 준다 — 그 5s를 버리는 것이 이 테스트의 전부다
      hands: { p0: "123m456m789m11p23p5s", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const p1r = base.round.byPlayer["p1"];
    if (p1r === undefined) throw new Error("no p1 round state");
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
      ),
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...p1r,
            riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
          },
        },
        riichiPot: base.round.riichiPot + 1000,
      },
      augmentData: {
        ...base.augmentData,
        ...(active ? { [`invincible:active:${roundKey(base)}:p0#round`]: true } : {}),
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    return game;
  }

  /** p0가 5s를 버린다 (p1의 대기패) */
  function discard5s(game: Game): void {
    const s = game.engine.state;
    const tileId = handIdsOf(s, "p0").find((t) => {
      const k = kindOf(s, t);
      return k.suit === "sou" && k.rank === 5;
    });
    if (tileId === undefined) throw new Error("p0 has no 5s");
    const flow = new FlowController(game.engine);
    flow.begin();
    let status = flow.submit("p0", { type: "discard", payload: { tileId } });
    // 리액션 창을 전원 패스로 닫아야 markPassFuriten이 돈다 (버림만으로는 아직 아무도 넘긴 게 아니다)
    for (let guard = 0; guard < 8 && status.kind === "awaiting"; guard++) {
      const prompt = status.prompts[0];
      if (prompt === undefined) break;
      const pass = prompt.options.find((o) => o.type === "pass");
      if (pass === undefined) break;
      status = flow.submit(prompt.player, pass);
    }
  }

  it("천하무적을 안 켰으면 종전대로 리치 후리텐이 찍힌다 (기준선)", () => {
    const game = scene(false);
    discard5s(game);
    expect(game.engine.state.round.byPlayer["p1"]?.riichiFuriten).toBe(true);
  });

  it("천하무적을 켠 국에는 리치자에게 후리텐이 찍히지 않는다", () => {
    const game = scene(true);
    discard5s(game);
    // 예전에는 여기가 true라, p1은 p2·p3의 버림으로도 론할 수 없게 됐다
    expect(game.engine.state.round.byPlayer["p1"]?.riichiFuriten).toBe(false);
    expect(game.engine.state.round.byPlayer["p1"]?.temporaryFuriten).toBe(false);
  });
});

/**
 * 창깡(챤깡)은 막지 않는다 (2026-08-20 QA defcall §4).
 *
 * 코어의 소비 지점이 `win.ronImmune`을 `lastDiscard.player ?? chankan.player`로
 * 조회하는 탓에, 무적을 켜면 **내 깡을 창깡당하는 것까지** 함께 막혔다. 카드는
 * "내 **버림패**로 론"만 막는다고 적어 두었고, 그 때문에 성립하지 않는 깡을 노리는
 * 증강(void_kan)이 무적 보유자 앞에서 통째로 죽었다. 깡은 버림이 아니다.
 */
describe("invincible — 창깡은 막지 않는다", () => {
  function chankanScene(active: boolean): Game {
    const base = craft({
      hands: { p0: "234m345p345s678s5s", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 0,
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
      ),
      round: {
        ...base.round,
        lastDiscard: null,
        chankan: { player: "p0", tileId: 0, closedKan: false },
      },
      augmentData: active
        ? { ...base.augmentData, [`invincible:active:${roundKey(base)}:p0#round`]: true }
        : base.augmentData,
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    return game;
  }

  it("무적을 켜도 창깡 대상(보유자)에게는 ronImmune이 서지 않는다", () => {
    for (const active of [false, true]) {
      const game = chankanScene(active);
      const immune = game.engine.rules.resolve<boolean>("win.ronImmune", {
        playerId: "p0",
        state: game.engine.state,
      });
      expect(immune).toBe(false);
    }
  });

  it("버림패 경로는 그대로 막힌다 (회귀 방지)", () => {
    const base = craftRon();
    const game = createStandardGameFromState({
      ...base,
      augmentData: {
        ...base.augmentData,
        [`invincible:active:${roundKey(base)}:p0#round`]: true,
      },
    });
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBe("discarder is immune to ron");
  });
});
