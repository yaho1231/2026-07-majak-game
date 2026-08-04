/**
 * 증강 파괴(uninstallAugment)가 콘텐츠 쪽 잔재까지 걷어내는지 — 실제 증강으로 검증.
 *
 * 코어가 소유한 등록(규칙·효과·옵션 프로바이더)은 source로 지워지지만, 커스텀 역은
 * 게임당 1회 등록이라 source로 걷어낼 수 없다. 보유자 집합(`yakuHolders`)에 남으면
 * **파괴된 증강의 역이 계속 성립한다**(docs/25 시스템 횡단 #7).
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  installAugment,
  uninstallAugment,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "./helpers.js";
import { yakuHolders } from "../src/util.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { pseudoDealer } from "../src/augments/pseudo_dealer.js";

function table(): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "123m456p789s11z22z", p3: "*" },
    phase: "turn.act",
    turnSeat: 2,
  });
}

describe("증강 파괴 — 커스텀 역", () => {
  it("파괴하면 커스텀 역 보유자 집합에서 빠진다", () => {
    const game = createStandardGameFromState(table());
    installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
    installAugment(game.engine, tanyaoBreak, "p1", { yaku: game.yaku });
    expect(yakuHolders(game.yaku, "tanyao_break").has("p0")).toBe(true);

    uninstallAugment(game.engine, tanyaoBreak, "p0");
    expect(yakuHolders(game.yaku, "tanyao_break").has("p0")).toBe(false);
    // 역 정의 자체는 게임 스코프라 남는다 — 아직 들고 있는 p1이 계속 써야 한다
    expect(game.yaku.get("tanyao_break")).toBeDefined();
    expect(yakuHolders(game.yaku, "tanyao_break").has("p1")).toBe(true);
  });
});

describe("증강 파괴 — 액티브 버튼", () => {
  it("파괴하면 보유자 턴 프롬프트에서 액티브 후보가 사라진다", () => {
    const base = table();
    const withAug: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p2" ? { ...p, augments: [...p.augments, "pseudo_dealer"] } : p,
      ),
    };
    const game = createStandardGameFromState(withAug);
    installAugment(game.engine, pseudoDealer, "p2", { yaku: game.yaku });

    const optionTypes = (): string[] =>
      game.engine.turnOptionProviders
        .flatMap((p) => p(game.engine.state, "p2"))
        .map((o) => o.type);
    expect(optionTypes()).toContain("claim_dealer");

    uninstallAugment(game.engine, pseudoDealer, "p2");
    expect(optionTypes()).not.toContain("claim_dealer");
  });
});
