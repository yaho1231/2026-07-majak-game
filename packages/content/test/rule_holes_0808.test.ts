/**
 * 2026-08-08 QA §2-9 — 설명은 맞는데 코드가 틀렸던 규칙 구멍들.
 *
 * 전부 "카드에 적힌 대로 동작하지 않는다"는 한 부류다. 문구를 고치는 것이 아니라
 * 코드를 문구에 맞춘 것이므로, 여기서는 **문구가 약속한 동작**을 검증한다.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  frontDoraKindFor,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { discardLock } from "../src/augments/discard_lock.js";
import { voidKan } from "../src/augments/void_kan.js";

describe("거울 — 뒷도라는 뒷도라 표시패의 앞 패다", () => {
  /**
   * 예전에는 `extraUraDoraKinds`에도 **표도라 표시패**의 앞 패를 넣었다. 그래서
   * 같은 패가 도라·뒷도라로 두 번 세지고, 진짜 뒷도라 앞패는 영영 안 붙었다.
   */
  it("표도라 앞패와 뒷도라 앞패가 서로 다른 패다", () => {
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    // craft의 기본 왕패에서는 표시패와 뒷도라 표시패의 앞 패가 우연히 같아
    // 두 경로를 구분하지 못한다. 뒷도라 표시패의 종류만 바꿔 확실히 갈라 놓는다.
    const uraId = uraIndicatorIds(base)[0]!;
    const state: GameState = {
      ...base,
      tiles: {
        ...base.tiles,
        [uraId]: { ...base.tiles[uraId]!, kind: { suit: "pin", rank: 7 } },
      },
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["mirror_dora"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [mirrorDora]);
    installAugment(game.engine, mirrorDora, "p0", { yaku: game.yaku });
    const s = game.engine.state;

    const omoteFront = s.round.doraIndicators.map((t) =>
      kindKey(frontDoraKindFor(kindOf(s, t))),
    );
    const uraFront = uraIndicatorIds(s).map((t) =>
      kindKey(frontDoraKindFor(kindOf(s, t))),
    );

    const extraDora = game.engine.rules.resolve<readonly { suit: string; rank: number }[]>(
      "scoring.extraDoraKinds",
      { playerId: "p0", state: s },
    );
    const extraUra = game.engine.rules.resolve<readonly { suit: string; rank: number }[]>(
      "scoring.extraUraDoraKinds",
      { playerId: "p0", state: s },
    );

    // 두 목록이 우연히 같으면 이 테스트는 아무것도 검증하지 못한다 — 먼저 다름을 못박는다
    expect(omoteFront).not.toEqual(uraFront);

    expect(extraDora.map(kindKey)).toEqual(omoteFront);
    // 핵심: 뒷도라 쪽은 **뒷도라 표시패**에서 나온다 (표도라 표시패 재사용 아님)
    expect(extraUra.map(kindKey)).toEqual(uraFront);
  });

  it("보유자가 아니면 어느 쪽에도 안 붙는다", () => {
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["mirror_dora"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [mirrorDora]);
    installAugment(game.engine, mirrorDora, "p0", { yaku: game.yaku });
    const s = game.engine.state;
    for (const rule of ["scoring.extraDoraKinds", "scoring.extraUraDoraKinds"]) {
      const got = game.engine.rules.resolve<readonly unknown[]>(rule, {
        playerId: "p1",
        state: s,
      });
      expect(got).toEqual([]);
    }
  });
});

describe("스텔스 리치 — 봉인된 패는 못 버린다", () => {
  /**
   * 표준 리치는 `lockedDiscardIds`를 검사한다(docs/25 방해 #2). 커스텀 리치에
   * 그 검사가 없어서, 봉인술사에 잠긴 패를 스텔스 리치 한 번으로 털어낼 수 있었다.
   */
  function scene(): { game: ReturnType<typeof createStandardGameFromState>; sealed: TileId } {
    const base = craft({
      hands: { p0: "123m456m789m11p22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0"
          ? { ...p, augments: ["stealth_riichi"] }
          : p.id === "p1"
            ? { ...p, augments: ["discard_lock"] }
            : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [stealthRiichi, discardLock]);
    installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
    installAugment(game.engine, discardLock, "p1", { yaku: game.yaku });
    const sealed = handIdsOf(game.engine.state, "p0")[0]!;
    return { game, sealed };
  }

  it("봉인이 없으면 종전대로 선언된다 (기준선)", () => {
    const { game } = scene();
    const tileId = handIdsOf(game.engine.state, "p0").at(-1)!;
    const res = game.engine.submit({ player: "p0", type: "stealth_riichi", payload: { tileId } });
    // 텐파이 여부와 무관하게, 적어도 "tile is sealed"로는 막히지 않아야 한다
    if (!res.ok) expect(res.reason).not.toBe("tile is sealed");
  });

  it("lockedDiscardIds에 걸린 패는 거절된다", () => {
    const { game, sealed } = scene();
    // 봉인술사의 잠금을 직접 세운다 (증강 발동 경로와 무관하게 규칙만 확인)
    game.engine.rules.addModifier<readonly TileId[]>("discard.blockedTileIds", {
      source: "test",
      layer: 100,
      apply: (cur, rctx) => (rctx.playerId === "p0" ? [...cur, sealed] : cur),
    });
    const res = game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId: sealed },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("tile is sealed");
  });
});

describe("성립하지 않는 깡 — 대명깡에는 발동하지 않는다", () => {
  /**
   * 대명깡은 `round.chankan`이 서지 않아 론 창구가 아예 안 열린다. 그런데도
   * 리액션이 돌면서 폴백으로 깡 친 사람의 손패를 집어 홀더의 대기를 갈아 끼웠다 —
   * 원래 대기는 사라지고 새 대기의 패는 이미 상대 후로에 다 나가 있어 그 국
   * 화료가 불가능해졌다. detail은 정반대를 약속하고 있었다.
   */
  function forgedFor(kanKind: "kan_closed" | "kan_open" | "kan_added"): boolean {
    const base = craft({
      hands: { p0: "123m456m789m123p1s", p1: "1111z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["void_kan"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
    const kanIds = handIdsOf(game.engine.state, "p1");
    const emitted: { type: string }[] = [];
    for (const { react } of game.engine.effects.reactionsFor("KanDeclared")) {
      react(
        { type: "KanDeclared", seq: 1, payload: { player: "p1", kanKind, handTileIds: kanIds } } as never,
        {
          state: game.engine.state,
          rules: game.engine.rules,
          emit: (ev: { type: string }) => emitted.push(ev),
        } as never,
      );
    }
    return emitted.some((e) => e.type === "TileKindChanged");
  }

  it("안깡에는 종전대로 발동한다 (기준선)", () => {
    expect(forgedFor("kan_closed")).toBe(true);
  });

  it("가깡에도 발동한다 (기준선)", () => {
    expect(forgedFor("kan_added")).toBe(true);
  });

  it("대명깡에는 발동하지 않는다", () => {
    expect(forgedFor("kan_open")).toBe(false);
  });
});
