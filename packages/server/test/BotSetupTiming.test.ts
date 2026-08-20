/**
 * 포석(setup) 적기 — **축이 순목이 아니라 남은 국이다.**
 *
 * 재장전(reload)은 아레나 220판에서 기회 37회 · 제안 0 · 발동 0이었다
 * (`qa-lab/findings/bot.md` 확정 3 · `qa-lab/bot/reload_probe.ts`). 옛 식
 * `allLast ? 0 : (1 - turn/12) * (wallLeft/40)` 이 문턱 0.45(= MIN_READINESS.setup
 * 0.25 + ONE_SHOT_BAR 0.2)를 **7순부터 전 구간에서** 못 넘겼기 때문이다.
 *
 * 그런데 재장전의 액션은 다른 증강을 **이미 소진해야** 제시된다 — 그 시점은 대개
 * 중후반이다. 제시 조건과 발동 조건이 서로 어긋나 있었다. 다음 국에 쓸 자원을
 * 채우는 일에 **이번 국의 순목**은 애초에 축이 아니다.
 */

import { describe, expect, it } from "vitest";
import type { BotDecisionContext } from "@majak/core";
import { reload } from "@majak/content/augments/reload.js";
import { hiddenRiver } from "@majak/content/augments/hidden_river.js";

interface At {
  turn: number;
  wallLeft: number;
  /** 장풍 1=동 2=남 */
  wind?: number;
  round?: number;
  mode?: "tonpuu" | "hanchan";
  allLast?: boolean;
}

function ctxAt(a: At, actionType: string): BotDecisionContext {
  const mode = a.mode ?? "tonpuu";
  const wind = a.wind ?? 1;
  const round = a.round ?? 1;
  const total = mode === "tonpuu" ? 4 : 8;
  const allLast = a.allLast ?? (wind - 1) * 4 + round >= total;
  return {
    view: {
      players: [{ id: "p0", augments: ["reload", "jackpot"] }],
      round: { mode, prevalentWind: wind, roundNumber: round },
      augmentView: {},
    } as never,
    options: [{ type: actionType, payload: { augmentId: "jackpot" } }] as never,
    holder: "p0",
    rng: { int: () => 0 } as never,
    tenpai: false,
    shanten: 2,
    waits: [],
    turn: a.turn,
    wallLeft: a.wallLeft,
    threat: 0,
    remaining: () => 4,
    safety: () => 0.5,
    placement: { rank: 2, allLast, riskAppetite: 0 },
    handPoints: 3900,
    flags: new Set() as never,
  } as never;
}

const proposesReload = (a: At): boolean =>
  (reload.bot?.choose(ctxAt(a, "reload_use")) ?? null) !== null;

describe("재장전 — 회수할 국이 남아 있으면 순목과 무관하게 제안한다", () => {
  it("동1국 중후반(11순·패산 15)에도 제안한다 — 옛 식은 7순부터 전 구간이 닫혔다", () => {
    expect(proposesReload({ turn: 11, wallLeft: 15, wind: 1, round: 1 })).toBe(true);
  });

  it("동풍전 전 구간 격자에서, 국이 남아 있는 한 순목이 막지 않는다", () => {
    for (const round of [1, 2, 3]) {
      for (const turn of [1, 6, 7, 10, 14]) {
        for (const wallLeft of [60, 30, 10]) {
          expect(
            proposesReload({ turn, wallLeft, wind: 1, round }),
            `동${round}국 ${turn}순 패산${wallLeft}`,
          ).toBe(true);
        }
      }
    }
  });

  it("반장전 남3국(한 국 남음)에서도 제안한다", () => {
    expect(proposesReload({ turn: 12, wallLeft: 10, wind: 2, round: 3, mode: "hanchan" })).toBe(
      true,
    );
  });
});

describe("올라스 — 이번 국 안에서 회수할 수 있을 때만", () => {
  it("올라스 초반(2순·패산 60)에는 제안한다 — 이번 국에 쓸 자리가 남아 있다", () => {
    expect(proposesReload({ turn: 2, wallLeft: 60, wind: 1, round: 4 })).toBe(true);
  });

  it("올라스 종반(12순·패산 10)에는 제안하지 않는다 — 회수할 자리가 없다", () => {
    expect(proposesReload({ turn: 12, wallLeft: 10, wind: 1, round: 4 })).toBe(false);
  });
});

describe("이번 국 안에서 값이 도는 포석은 올라스에도 산다", () => {
  it("안개(그 국 한정)는 올라스 초반에도 선언한다 — 예전엔 allLast가 통째로 0이었다", () => {
    const at = ctxAt({ turn: 3, wallLeft: 55, wind: 1, round: 4 }, "declare_fog");
    expect(hiddenRiver.bot?.choose(at) ?? null).not.toBeNull();
  });
});
