/**
 * 방해 계열 3건 (docs/25 방해 #1·#2·#4).
 */

import { describe, expect, it } from "vitest";
import {
  DISARMED_SOURCES_KEY,
  ROUND_SCOPED_MARK,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isRoundScopedKey,
  kindOf,
  setupRound,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { disarm } from "../src/augments/disarm.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";
import { discardLock } from "../src/augments/discard_lock.js";
import { roundViewKey } from "../src/util.js";

describe("무장해제 — 잠금이 매치 끝까지 남지 않는다 (docs/25 방해 #1)", () => {
  it("무장해제 목록과 잠금 기록이 국 스코프 키다", () => {
    // 해제 리액션의 source가 자기 자신이라, 무장해제로 무장해제를 잠그면 그 코드가
    // 게이트에 막혀 영영 돌지 않는다. 정리를 엔진에 맡겨야 게이트와 무관해진다.
    expect(isRoundScopedKey(DISARMED_SOURCES_KEY)).toBe(true);
    expect(isRoundScopedKey(`disarm:locked:p0${ROUND_SCOPED_MARK}`)).toBe(true);
  });

  it("국 경계에서 엔진이 잠금을 지운다 — 해제 리액션이 막혀도 풀린다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["disarm"] } : p,
      ),
      augmentData: {
        ...base.augmentData,
        // 무장해제 자신이 잠긴 상태 — 해제 리액션은 게이트에 막혀 돌지 않는다
        [DISARMED_SOURCES_KEY]: ["aug:p0:disarm", "aug:p1:always_tenpai"],
        [`disarm:locked:p0${ROUND_SCOPED_MARK}`]: ["aug:p1:always_tenpai"],
      },
    };

    const next = setupRound(state);
    expect(next.augmentData[DISARMED_SOURCES_KEY]).toBeUndefined();
    expect(next.augmentData[`disarm:locked:p0${ROUND_SCOPED_MARK}`]).toBeUndefined();
  });
});

describe("봉인술사 — 리치 선언으로도 봉인된 패를 못 버린다 (docs/25 방해 #2)", () => {
  /** p1의 손패 한 종류를 봉인해 둔 상태에서, p1이 텐파이로 자기 순을 맞은 장면 */
  function scene(): { game: ReturnType<typeof createStandardGameFromState>; sealed: TileId } {
    const base = craft({
      hands: { p0: "*", p1: "123m456m789m11p234p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    // p1의 4p를 봉인 대상으로 삼는다 — 이 패를 버려야 텐파이가 선다
    const sealed = handIdsOf(base, "p1").find((id) => {
      const k = kindOf(base, id);
      return k.suit === "pin" && k.rank === 4;
    });
    if (sealed === undefined) throw new Error("no 4p");
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["discard_lock"] } : p,
      ),
      augmentData: {
        ...base.augmentData,
        // 봉인 실체는 보유자별 뷰 채널 키에 담긴다 (discard.blockedTileIds가 읽는다)
        [roundViewKey("p0", "discardLockReveal:p1")]: [sealed],
      },
    };
    const game = createStandardGameFromState(state, undefined, [discardLock]);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    return { game, sealed };
  }

  it("봉인이 실제로 걸려 있다 (하네스 확인 — 이게 아니면 아래 테스트가 공허하다)", () => {
    const { game, sealed } = scene();
    const res = game.engine.submit({
      player: "p1",
      type: "discard",
      payload: { tileId: sealed },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("tile is sealed");
  });

  it("봉인된 패로는 **리치 선언으로도** 버릴 수 없다", () => {
    const { game, sealed } = scene();
    const res = game.engine.submit({
      player: "p1",
      type: "riichi",
      payload: { tileId: sealed },
    });
    // 예전에는 riichiAction.validate에 봉인 검사가 없어 "리치 한 번"으로 털렸다
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("tile is sealed");
  });

  it("봉인되지 않은 패로는 종전대로 리치를 걸 수 있다 (회귀 방지)", () => {
    const { game } = scene();
    const free = handIdsOf(game.engine.state, "p1").find((id) => {
      const k = kindOf(game.engine.state, id);
      return k.suit === "pin" && k.rank === 2;
    });
    if (free === undefined) throw new Error("no 2p");
    const res = game.engine.submit({
      player: "p1",
      type: "riichi",
      payload: { tileId: free },
    });
    if (!res.ok) expect(res.reason).not.toBe("tile is sealed");
  });
});

describe("커스텀 콜 우선순위 — 자리 순으로 결정적이다 (docs/25 방해 #4)", () => {
  it("FlowController가 제출 순서가 아니라 자리 거리로 승자를 고른다", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../../core/src/mahjong/flow/FlowController.ts", import.meta.url),
        "utf8",
      ),
    );
    // decisions(Map)의 삽입 순서를 그대로 쓰던 코드가 남아 있으면 안 된다
    expect(src).toContain("byNearestSeat");
    expect(src).not.toMatch(/const customCall = \[\.\.\.decisions\.entries\(\)\]\.find/);
  });
});
