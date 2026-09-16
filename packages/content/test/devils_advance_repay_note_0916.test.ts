/**
 * devils_advance 상환 근거 (2026-09-16, QA 5라운드 조합 스위프 B-2).
 *
 * 만관 화료로 빚이 터지면 상대 셋이 3,000씩 뱅크에 갚는다 — 점수 자체는 맞았지만
 * `augPoints`에 보유자 0점 한 줄만 남아 상대 줄에는 근거가 없었다. 결과 화면·리플레이에
 * 이유 없는 −3,000이 뜨고, 하네스는 «총합 −9,000»을 어떤 근거와도 못 맞춰
 * SCORE_DRIFT_UNEXPLAINED 로 잡았다(seed 711641 tonpuu / 710322 hanchan).
 * 이제 상대 셋 각각의 줄에 −3,000 근거가 남고, 근거 합 = deltas 총합 변동이다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { devilsAdvance } from "../src/augments/devils_advance.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function base(): GameState {
  const s = craft({
    hands: { p0: "234m345m456m678m22m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: [...p.augments, "devils_advance"] } : p,
    ),
  };
}

function runTsumoWin(game: Game): RoundSettledPayload {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const win = status.prompts.find((p) => p.player === "p0")?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled");
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("devils_advance — 상환(폭발)이 상대 셋의 줄에 근거를 남긴다", () => {
  it("상대 셋 augPoints −3000씩, 근거 합 = deltas 총합 변동(−9000), 점수는 정확", () => {
    const b = createStandardGameFromState(structuredClone(base()));
    const before = runTsumoWin(b);
    expect(before.winInfos?.[0]?.limit).not.toBe(null);

    const g = createStandardGameFromState(structuredClone(base()));
    installAugment(g.engine, devilsAdvance, "p0");
    const after = runTsumoWin(g);

    const notes = (after.augPoints ?? []).filter((n) => n.augId === "devils_advance");
    for (const id of ["p1", "p2", "p3"]) {
      expect(notes.find((n) => n.player === id)?.points).toBe(-3000);
      expect(after.deltas[id]).toBe((before.deltas[id] ?? 0) - 3000);
    }
    expect(after.deltas["p0"]).toBe(before.deltas["p0"] ?? 0);
    // 근거 합(보유자 0 포함)과 실제 총합 변동이 일치 — 하네스 드리프트 판정이 맞춰지는 조건
    expect(sum(notes.map((n) => n.points))).toBe(-9000);
    expect(sum(Object.values(after.deltas)) - sum(Object.values(before.deltas))).toBe(-9000);
    // 상태 점수도 deltas 대로 적용됐는가
    for (const p of g.engine.state.players) {
      const start = base().players.find((q) => q.id === p.id)?.score ?? 0;
      expect(p.score).toBe(start + (after.deltas[p.id] ?? 0));
    }
  });
});
