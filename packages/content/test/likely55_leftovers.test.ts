/**
 * docs/25 '확신도 유력' 55건 전수 대조에서 **아직 열려 있던 2건**의 회귀 테스트.
 *
 *  - 리치 #11  커스텀 리치 3종이 `riichi.requiresTenpai`를 하드코딩해, 공성계가
 *              그 규칙을 내려도 이 리치들 앞에서만 능력이 사라졌다
 *  - 벽패 #8   `void_kan`이 리치 중에도 손패를 갈아 끼웠다 (손패 변형 공통 규약 위반)
 */

import { describe, expect, it } from "vitest";
import {
  KAN_DECLARED,
  RuleLayer,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { voidKan } from "../src/augments/void_kan.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

// ─────────────── 리치 #11 — 공성계가 커스텀 리치에도 닿아야 한다 ───────────────

describe("커스텀 리치 — riichi.requiresTenpai를 규칙에서 읽는다 (리치 #11)", () => {
  /** 버려도 텐파이가 안 되는 손 (노텐) */
  function notenScene(): GameState {
    const base = craft({
      hands: { p0: "147m258p369s1234z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAug(base, "p0", ["stealth_riichi"]);
  }

  function declineReason(siege: boolean): string | null {
    const game = createStandardGameFromState(notenScene());
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    if (siege) {
      // 공성계 — 노텐 리치를 허용한다
      game.engine.rules.addModifier<boolean>("riichi.requiresTenpai", {
        source: "test:siege",
        layer: RuleLayer.Prism,
        apply: (cur, rctx) => (rctx.playerId === "p0" ? false : cur),
      });
    }
    const def = game.engine.actions.get("stealth_riichi");
    if (def === undefined) throw new Error("no stealth_riichi action");
    const tileId = handIdsOf(game.engine.state, "p0")[0] as TileId;
    return def.validate(
      { player: "p0", type: "stealth_riichi", payload: { tileId } },
      { state: game.engine.state, rules: game.engine.rules },
    );
  }

  it("공성계가 없으면 노텐 리치는 거부된다 (기준선)", () => {
    expect(declineReason(false)).toBe("not tenpai after discard");
  });

  it("공성계가 텐파이 요구를 내리면 노텐이어도 막지 않는다", () => {
    expect(declineReason(true)).not.toBe("not tenpai after discard");
  });
});

// ─────────────── 벽패 #8 — 리치 중에는 손이 잠긴다 ───────────────

describe("성립하지 않는 깡 — 리치 중에는 손패를 건드리지 않는다 (벽패 #8)", () => {
  function scene(riichi: boolean): GameState {
    const base = craft({
      hands: { p0: "123m456m789m123p1s", p1: "1111z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const s = withAug(base, "p0", ["void_kan"]);
    if (!riichi) return s;
    return {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: RIICHI },
        },
      },
    };
  }

  /** p1의 안깡 이벤트에 대해 void_kan 리액션이 손패를 갈아 끼웠는가 */
  function forged(riichi: boolean): boolean {
    const game = createStandardGameFromState(scene(riichi));
    installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
    const emitted: { type: string }[] = [];
    const kanIds = [...(game.engine.state.zones["hand:p1"]?.tileIds ?? [])] as TileId[];
    for (const { react } of game.engine.effects.reactionsFor(KAN_DECLARED)) {
      react(
        {
          type: KAN_DECLARED,
          seq: 1,
          payload: {
            player: "p1",
            kanKind: "kan_closed",
            handTileIds: kanIds,
          },
        } as never,
        {
          state: game.engine.state,
          rules: game.engine.rules,
          emit: (ev: { type: string }) => emitted.push(ev),
        } as never,
      );
    }
    return emitted.some((e) => e.type === "TileKindChanged");
  }

  it("리치가 아니면 손패를 맞춰 준다 (기준선)", () => {
    expect(forged(false)).toBe(true);
  });

  it("리치 중이면 손패를 건드리지 않는다", () => {
    expect(forged(true)).toBe(false);
  });
});
