/**
 * 정보 누설 3건 (docs/25 정보 #1·#2·#3).
 */

import { describe, expect, it } from "vitest";
import {
  SPECTATOR_ID,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { briefFog } from "../src/augments/brief_fog.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { uraPeek } from "../src/augments/ura_peek.js";
import { roundKey } from "../src/util.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, who: Record<PlayerId, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      who[p.id] === undefined ? p : { ...p, augments: [...(who[p.id] as string[])] },
    ),
  };
}

function viewOf(game: Game, viewer: PlayerId) {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules);
}

describe("박무 — 피해자가 자기 바닥은 본다 (docs/25 정보 #2)", () => {
  function scene(): Game {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1m2m", p1: "3p4p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...withAug(base, { p0: ["brief_fog"] }),
      augmentData: {
        ...base.augmentData,
        // 박무가 지금 깔려 있는 상태를 직접 심는다 (선언 횟수 + 선언 순)
        [`brief_fog:uses:p0`]: 1,
        [`brief_fog:turn:${roundKey(base)}:p0#round`]: base.round.turnCount,
      },
    };
    const game = createStandardGameFromState(state, undefined, [briefFog]);
    installAugment(game.engine, briefFog, "p0", { yaku: game.yaku });
    return game;
  }

  it("안개가 깔려도 p1은 자기 바닥을 그대로 본다", () => {
    const game = scene();
    const view = viewOf(game, "p1");
    const own = view.zones[discardsZone("p1")];
    // 예전에는 count_only가 소유자를 면제하지 않아 자기 바닥이 뒷면이었다
    expect(own?.tileIds.length).toBe(2);
    expect(own?.hiddenCount).toBe(0);
  });
});

describe("가려진 도라 — 왕패를 열어도 표시패는 안 보인다 (docs/25 정보 #3)", () => {
  function scene(): Game {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    // p0 = 가려진 도라, p1 = 이면투시(왕패 열람)
    const state: GameState = {
      ...withAug(base, { p0: ["dora_conceal"], p1: ["ura_peek"] }),
      augmentData: {
        ...base.augmentData,
        [`ura_peek:used:${roundKey(base)}:p1#round`]: true,
      },
    };
    const game = createStandardGameFromState(state, undefined, [doraConceal, uraPeek]);
    installAugment(game.engine, doraConceal, "p0", { yaku: game.yaku });
    installAugment(game.engine, uraPeek, "p1", { yaku: game.yaku });
    return game;
  }

  it("왕패 열람 뷰어에게 도라 표시패 tileId가 실리지 않는다", () => {
    const game = scene();
    const indicators = game.engine.state.round.doraIndicators;
    expect(indicators.length).toBeGreaterThan(0);

    const view = viewOf(game, "p1");
    const deadWall = view.zones["deadWall"];
    if (deadWall === undefined) return; // 열람이 안 열렸으면 애초에 누설이 없다
    for (const id of indicators) {
      expect(deadWall.tileIds).not.toContain(id);
    }
  });

  it("관전자는 종전대로 전부 본다", () => {
    const game = scene();
    const view = buildPlayerView(game.engine.state, SPECTATOR_ID, game.engine.rules);
    expect(view.round.doraIndicators.length).toBeGreaterThan(0);
  });
});

/*
 * docs/59 B18 (2026-09-25) — 발동 전 미리보기 채널 넷은 **보유자에게만** 간다.
 * 귀환(돌아올 자패)·카피(상대별 후보 수)·등가교환(넘길 3장)·짝수의 세계(바뀔 패). 전원에게 보이면
 * «그 증강을 쓸 것»이라는 의도와 손패 일부가 드러난다. 관전자는 종전대로 전부 본다.
 */
describe("보유자 전용 미리보기 채널 — 상대에게 가지 않는다 (docs/59 B18)", () => {
  const PREFIXES = ["honor_return:preview", "copy:pool", "hand_swap3:gives", "even_world:preview"];

  function scene(): Game {
    const base = withAug(
      craft({
        hands: { p0: "1m3m5m7m9m2p4p6p8p1s3s5s7s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z5z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["honor_return", "copy", "hand_swap3", "even_world"], p1: ["alchemist"] },
    );
    const game = createStandardGameFromState(base, undefined, C.contentAugments);
    for (const p of base.players) {
      for (const id of p.augments) {
        const def = C.contentAugments.find((a) => a.id === id)!;
        installAugment(game.engine, def, p.id, { yaku: game.yaku, catalog: game.augments });
      }
    }
    // 지정 → 넘길 3장 — 등가교환 채널이 실리고, 그 사이 이벤트가 나머지 채널도 돌린다
    const submit = (type: string, payload: unknown): void => {
      const r = game.engine.submit({ player: "p0", type, payload } as never);
      if (!r.ok) throw new Error(`${type}: ${JSON.stringify(r)}`);
    };
    submit("swap3", { target: "p1" });
    const hand = [...(game.engine.state.zones["hand:p0"]?.tileIds ?? [])].sort((a, b) => a - b);
    submit("swap3_give", { gives: hand.slice(0, 3) });
    return game;
  }

  it("보유자는 넷 다 본다", () => {
    const keys = Object.keys(viewOf(scene(), "p0").augmentView);
    for (const prefix of PREFIXES) {
      expect(keys.some((k) => k.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it("교환 상대를 포함한 다른 좌석에는 하나도 가지 않는다", () => {
    const game = scene();
    for (const viewer of ["p1", "p2", "p3"] as const) {
      const keys = Object.keys(viewOf(game, viewer).augmentView);
      for (const prefix of PREFIXES) {
        expect(
          keys.filter((k) => k.includes(prefix)),
          `${viewer}에게 ${prefix}가 샜다`,
        ).toEqual([]);
      }
    }
  });

  it("관전자는 종전대로 본다", () => {
    const game = scene();
    const keys = Object.keys(
      buildPlayerView(game.engine.state, SPECTATOR_ID, game.engine.rules).augmentView,
    );
    for (const prefix of PREFIXES) expect(keys.some((k) => k.startsWith(prefix)), prefix).toBe(true);
  });
});
