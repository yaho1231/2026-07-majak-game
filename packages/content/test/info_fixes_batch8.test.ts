/**
 * 정보 계열 3건 (docs/25 정보 #5·#9·#10).
 */

import { describe, expect, it } from "vitest";
import {
  TILE_DRAWN,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { foresight } from "../src/augments/foresight.js";
import { dangerSense } from "../src/augments/danger_sense.js";
import { roundViewKey } from "../src/util.js";

describe("예지 — 뽑힌 패는 예언 스트립에서 지워진다 (docs/25 정보 #5)", () => {
  function scene(): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["foresight"] } : p,
      ),
      augmentData: {
        ...base.augmentData,
        // 예언 4장이 이미 공개된 상태
        [roundViewKey("p0", "foresight_peek")]: ["man1", "man2", "man3", "man4"],
      },
    };
    const game = createStandardGameFromState(state, undefined, [foresight]);
    installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
    return game;
  }

  const strip = (g: ReturnType<typeof createStandardGameFromState>): string[] =>
    (g.engine.state.augmentData[roundViewKey("p0", "foresight_peek")] as string[]) ?? [];

  /** 누군가 패산에서 한 장 뽑았다는 이벤트를 흘린다 */
  function draw(
    g: ReturnType<typeof createStandardGameFromState>,
    player: PlayerId,
    rinshan: boolean,
  ): void {
    for (const { react } of g.engine.effects.reactionsFor(TILE_DRAWN)) {
      react(
        { seq: 1, type: TILE_DRAWN, payload: { player, tileId: 0, rinshan } },
        {
          state: g.engine.state,
          rules: g.engine.rules,
          emit: (e) => {
            const p = e.payload as { key: string; value: unknown };
            g.engine.state.augmentData[p.key] = p.value;
          },
        },
      );
    }
  }

  it("보유자가 뽑으면 한 장 줄어든다", () => {
    const game = scene();
    draw(game, "p0", false);
    expect(strip(game)).toEqual(["man2", "man3", "man4"]);
  });

  it("**남이 뽑아도** 줄어든다 — 이 예언은 네 자리의 다음 쯔모다", () => {
    const game = scene();
    draw(game, "p1", false);
    // 예전에는 소비 자체가 없어 이미 남의 손에 들어간 패를 계속 보여 줬다
    expect(strip(game)).toEqual(["man2", "man3", "man4"]);
  });

  it("영상패(깡)는 패산 순서를 소모하지 않는다", () => {
    const game = scene();
    draw(game, "p0", true);
    expect(strip(game)).toEqual(["man1", "man2", "man3", "man4"]);
  });

  it("다 소진되면 빈 채로 남는다 (음수 인덱스 없음)", () => {
    const game = scene();
    for (let i = 0; i < 6; i++) draw(game, "p0", false);
    expect(strip(game)).toEqual([]);
  });
});

describe("지뢰 탐지 — 후리텐 상대는 위험으로 세지 않는다 (docs/25 정보 #10)", () => {
  /** p1이 5s 대기 텐파이. furiten이면 5s를 이미 버려 둔 상태로 만든다 */
  function scene(furiten: boolean): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: {
        p0: "123m456m789m11p5s",
        p1: "234m345p345s678s5s",
        p2: "*",
        p3: "*",
      },
      ...(furiten ? { discards: { p1: "5s" } } : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs1 = base.round.byPlayer["p1"];
    if (rs1 === undefined) throw new Error("no p1");
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["danger_sense"] } : p,
      ),
      round: furiten
        ? {
            ...base.round,
            byPlayer: {
              ...base.round.byPlayer,
              p1: { ...rs1, discardedKinds: ["sou5"] },
            },
          }
        : base.round,
    };
    const game = createStandardGameFromState(state, undefined, [dangerSense]);
    installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
    return game;
  }

  function dangerKeys(g: ReturnType<typeof createStandardGameFromState>): string[] {
    const res = g.engine.submit({ player: "p0", type: "danger_sense_use", payload: {} });
    if (!res.ok) throw new Error(`danger_sense rejected: ${res.reason}`);
    // 스냅샷은 `{ kinds, turn }` — turn은 화면의 "N순 기준" 표기용이다
    const v = g.engine.state.augmentData[roundViewKey("p0", "danger_sense")] as
      | { kinds?: string[] }
      | undefined;
    const kinds = v?.kinds;
    if (!Array.isArray(kinds)) throw new Error("danger_sense: kinds 없음");
    return kinds;
  }

  it("후리텐이 아니면 그 대기패가 위험으로 잡힌다 (기준선)", () => {
    expect(dangerKeys(scene(false))).toContain("sou5");
  });

  it("후리텐이면 그 대기패는 위험이 아니다", () => {
    // 예전에는 순수 대기만 봐서 론할 수 없는 패까지 "쏘인다"로 표시했다
    expect(dangerKeys(scene(true))).not.toContain("sou5");
  });
});
