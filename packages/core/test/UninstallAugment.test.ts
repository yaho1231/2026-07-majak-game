/**
 * uninstallAugment — 증강 하나가 남긴 등록을 **전부** 걷어내는지 검증한다.
 *
 * 예전에는 규칙 모디파이어와 효과(reaction/interceptor)만 지웠다. 턴·리액션 옵션
 * 프로바이더는 그대로 남아 **파괴된 증강의 액티브 버튼이 계속 떴고**, 증강이 게임
 * 스코프에 심어 둔 것(커스텀 역 보유자 집합 등)을 정리할 통로도 없었다 —
 * 증강 파괴/교체 계열을 만들지 못한 원인이다(docs/25 시스템 횡단 #7).
 *
 * 남는 것(의도)과 그 이유는 아래 마지막 describe에 계약으로 못박아 둔다.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGame,
  defineAugment,
  installAugment,
  uninstallAugment,
} from "../src/index.js";
import type { AugmentDef, GameState } from "../src/index.js";

const HOLDER = "p0";

function game(): ReturnType<typeof createStandardGame> {
  return createStandardGame({
    seed: 1,
    playerIds: ["p0", "p1", "p2", "p3"],
  });
}

/** 검증에 필요한 등록만 하는 시험용 증강 */
function probe(opts: { onUninstall?: () => void } = {}): AugmentDef {
  return defineAugment({
    id: "probe_augment",
    tier: "silver",
    category: "etc",
    name: "probe",
    description: "probe",
    detail: "probe",
    install(ctx) {
      ctx.setHolderRule("riichi.cost", 0);
      ctx.reaction("ProbeEvent", () => {
        /* 부작용 없음 — 등록 여부만 본다 */
      });
      ctx.holderTurnOptions(() => [{ type: "probe_action", payload: {} }]);
      ctx.holderReactionOptions(() => [{ type: "probe_call", payload: {} }]);
      if (opts.onUninstall !== undefined) ctx.onUninstall(opts.onUninstall);
    },
  });
}

function turnOptionTypes(
  g: ReturnType<typeof createStandardGame>,
  state: GameState,
): string[] {
  return g.engine.turnOptionProviders
    .flatMap((p) => p(state, HOLDER))
    .map((o) => o.type);
}

function reactionOptionTypes(
  g: ReturnType<typeof createStandardGame>,
  state: GameState,
): string[] {
  return g.engine.reactionOptionProviders
    .flatMap((p) => p(state, HOLDER, { player: "p1", tileId: 0 }))
    .map((o) => o.type);
}

describe("uninstallAugment", () => {
  it("규칙 모디파이어를 걷어낸다", () => {
    const g = game();
    const def = probe();
    installAugment(g.engine, def, HOLDER);
    expect(
      g.engine.rules.resolve<number>("riichi.cost", {
        playerId: HOLDER,
        state: g.engine.state,
      }),
    ).toBe(0);

    uninstallAugment(g.engine, def, HOLDER);
    expect(
      g.engine.rules.resolve<number>("riichi.cost", {
        playerId: HOLDER,
        state: g.engine.state,
      }),
    ).toBe(1000);
  });

  it("효과(reaction/interceptor)를 걷어낸다", () => {
    const g = game();
    const def = probe();
    installAugment(g.engine, def, HOLDER);
    expect(g.engine.effects.reactionsFor("ProbeEvent").length).toBe(1);

    uninstallAugment(g.engine, def, HOLDER);
    expect(g.engine.effects.reactionsFor("ProbeEvent").length).toBe(0);
  });

  it("턴 옵션 프로바이더를 걷어낸다 — 파괴된 증강의 버튼이 남지 않는다", () => {
    const g = game();
    const def = probe();
    installAugment(g.engine, def, HOLDER);
    expect(turnOptionTypes(g, g.engine.state)).toContain("probe_action");

    uninstallAugment(g.engine, def, HOLDER);
    expect(turnOptionTypes(g, g.engine.state)).not.toContain("probe_action");
  });

  it("리액션 옵션 프로바이더를 걷어낸다", () => {
    const g = game();
    const def = probe();
    installAugment(g.engine, def, HOLDER);
    expect(reactionOptionTypes(g, g.engine.state)).toContain("probe_call");

    uninstallAugment(g.engine, def, HOLDER);
    expect(reactionOptionTypes(g, g.engine.state)).not.toContain("probe_call");
  });

  it("증강이 등록한 정리 훅(onUninstall)을 부른다", () => {
    const g = game();
    let cleaned = 0;
    const def = probe({ onUninstall: () => (cleaned += 1) });
    installAugment(g.engine, def, HOLDER);
    expect(cleaned).toBe(0);

    uninstallAugment(g.engine, def, HOLDER);
    expect(cleaned).toBe(1);
    // 두 번 불러도 정리는 한 번만 (등록이 사라졌다)
    uninstallAugment(g.engine, def, HOLDER);
    expect(cleaned).toBe(1);
  });

  it("같은 증강을 다른 사람이 들고 있으면 그쪽 등록은 남는다", () => {
    const g = game();
    const def = probe();
    installAugment(g.engine, def, HOLDER);
    installAugment(g.engine, def, "p1");

    uninstallAugment(g.engine, def, HOLDER);
    const p1Options = g.engine.turnOptionProviders
      .flatMap((p) => p(g.engine.state, "p1"))
      .map((o) => o.type);
    expect(p1Options).toContain("probe_action");
    expect(turnOptionTypes(g, g.engine.state)).not.toContain("probe_action");
  });
});
