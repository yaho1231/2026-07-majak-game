/**
 * 반전 — 국 중에 뒤집은 SCORE_CHANGED에 **자기 서명을 남긴다**.
 *
 * 배경(QA verify-score 확정 3, 2026-08-20): `SCORE_CHANGED` 인터셉터가 delta의 부호만
 * 뒤집고 `reason`을 원래 증강 그대로 두었다. 그래서 원장(eventLog)에
 * `{p1, +4000, reason:"karma"}`가 남아 **"카르마가 피해자에게 4,000점을 줬다"**고
 * 거짓말을 했다 — 뱅크가 발행한 점수의 출처를 원장에서 찾을 수 없고, reason을 읽는
 * 감사·리플레이 도구가 같은 거짓을 물려받는다.
 *
 * 정산 경로(`withAugPoint`)와 리치 공탁 보정(`reason = "sign_flip"`)은 원래부터
 * 제대로 서명하고 있었다 — 깨진 것은 이 인터셉터 하나뿐이었다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SCORE_CHANGED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameEvent, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft } from "./helpers.js";

const defOf = (id: string): AugmentDef => {
  const d = contentAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
};

/** karma 보유자 p0 + `armed` 좌석들이 반전을 발동 중인 장면 */
function scene(armed: readonly PlayerId[]): GameState {
  const base = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const data: Record<string, unknown> = { "karma:gauge:p0": 12000 };
  for (const a of armed) // 2026-09-01: 반전은 액티브가 됐다 — 켜진 국 표식 키가 `onRound`다(선발동형과 구분).
    data[`sign_flip:onRound:${a}`] = "1-1-0";
  return { ...base, augmentData: { ...base.augmentData, ...data } };
}

interface Emitted {
  readonly player: string;
  readonly delta: number;
  readonly reason?: string;
}

/** karma를 태우고, 원장에 남은 SCORE_CHANGED 원문을 그대로 읽는다 */
function burn(armed: readonly PlayerId[]): { emitted: Emitted[]; total: number } {
  const give: Partial<Record<PlayerId, string[]>> = { p0: ["karma"] };
  for (const a of armed) give[a] = ["sign_flip"];
  const state: GameState = {
    ...scene(armed),
    players: scene(armed).players.map((p) =>
      give[p.id] !== undefined ? { ...p, augments: [...give[p.id]!] } : p,
    ),
  };
  const game = createStandardGameFromState(state);
  for (const [seat, ids] of Object.entries(give)) {
    for (const id of ids ?? []) {
      installAugment(game.engine, defOf(id), seat as PlayerId, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  flow.submit("p0", { type: "karma_burn", payload: {} });
  const log = (game.engine as unknown as { eventLog: GameEvent[] }).eventLog;
  const emitted = log
    .filter((e) => e.type === SCORE_CHANGED)
    .map((e) => e.payload as Emitted);
  const total = game.engine.state.players.reduce((n, p) => n + p.score, 0);
  return { emitted, total };
}

const of = (list: readonly Emitted[], player: string): Emitted => {
  const e = list.find((x) => x.player === player);
  if (e === undefined) throw new Error(`${player}에 대한 SCORE_CHANGED가 없다`);
  return e;
};

describe("반전 — 국 중 부호 반전은 원장에 자기 이름을 남긴다", () => {
  it("반전이 없으면 원인 증강 이름 그대로다 (대조군)", () => {
    const { emitted } = burn([]);
    expect(of(emitted, "p1").delta).toBe(-4000);
    expect(of(emitted, "p1").reason).toBe("karma");
  });

  it("피해자가 반전 중이면 뒤집힌 발행이 sign_flip으로 서명된다", () => {
    const { emitted } = burn(["p1"]);
    const flipped = of(emitted, "p1");
    expect(flipped.delta).toBe(4000);
    // ★ 회귀 지점: 예전에는 reason이 "karma"로 남아 카르마가 점수를 준 것으로 기록됐다.
    expect(flipped.reason).not.toBe("karma");
    expect(flipped.reason).toBe("karma+sign_flip");
    // 원인은 지우지 않는다 — 누가 옮긴 돈을 누가 뒤집었는지 둘 다 읽혀야 한다.
    expect(flipped.reason).toContain("karma");
    // 반전이 없는 좌석은 그대로다
    expect(of(emitted, "p2").reason).toBe("karma");
    expect(of(emitted, "p0").reason).toBe("karma");
  });

  it("셋 다 반전이어도 뱅크 발행분 전부가 서명된 발행에서 나온다", () => {
    const { emitted, total } = burn(["p1", "p2", "p3"]);
    for (const pid of ["p1", "p2", "p3"]) {
      expect(of(emitted, pid).delta).toBe(4000);
      expect(of(emitted, pid).reason).toBe("karma+sign_flip");
    }
    // 24,000점이 새로 발행됐고, 그 출처가 전부 원장에서 sign_flip으로 추적된다.
    expect(total).toBe(124000);
    // 서명 없는 발행은 카르마 본래의 이동(p0 +12,000)뿐이다 — 발행분 24,000은
    // 전부 sign_flip 서명이 붙은 세 줄에서 나온다.
    const unsigned = emitted.filter((e) => (e.reason ?? "").endsWith("+sign_flip") === false);
    expect(unsigned.map((e) => e.player)).toEqual(["p0"]);
  });

  it("자기 서명한 발행은 다시 뒤집지 않는다 (재진입 없음)", () => {
    const { emitted } = burn(["p1"]);
    // 한 좌석에 대한 SCORE_CHANGED는 정확히 한 번뿐이고, 이중 반전(-4000 복귀)이 없다.
    expect(emitted.filter((e) => e.player === "p1")).toHaveLength(1);
  });
});
