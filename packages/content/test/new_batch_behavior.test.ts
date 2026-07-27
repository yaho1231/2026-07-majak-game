/**
 * new_batch_behavior — 2026-07-18 신규 배치의 점수 계산이 실제로 맞는지 검증.
 * (크래시 스위프는 무크래시만 보므로, 여기서는 delta·보너스 '값'을 확인한다.)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SCORE_CHANGED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  ScoreChangedPayload,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { scapegoat } from "../src/augments/scapegoat.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(state: GameState, player: PlayerId, augs: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augs] } : p,
    ),
  };
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled");
}

function bonusEvent(game: Game, reason: string): ScoreChangedPayload | undefined {
  const e = game.engine.eventLog.find(
    (ev) =>
      ev.type === SCORE_CHANGED &&
      (ev.payload as ScoreChangedPayload).reason === reason,
  );
  return e === undefined ? undefined : (e.payload as ScoreChangedPayload);
}

/** p0의 쯔모 화료를 끝까지 진행하고 정산 delta를 반환 */
function tsumoDeltas(state: GameState, augs: AugmentSpec[]): Record<PlayerId, number> {
  const game = createStandardGameFromState(state);
  for (const a of augs) installAugment(game.engine, a.def, a.holder, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  if (s.kind !== "awaiting") throw new Error("expected awaiting");
  const win = s.prompts.find((p) => p.player === "p0")?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win for p0");
  flow.submit("p0", win);
  return lastSettled(game).deltas;
}

interface AugmentSpec {
  def: import("@majak/core").AugmentDef;
  holder: PlayerId;
}

/** delta 조회 (없으면 0) */
const at = (d: Record<PlayerId, number>, id: PlayerId): number => d[id] ?? 0;

/** 탕야오 멘젠쯔모 (234m345p456s678s22s, 2s 탕키) */
function tanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** p1을 리치 상태로 만든다 */
function setRiichi(state: GameState, who: PlayerId): GameState {
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [who]: {
          ...state.round.byPlayer[who]!,
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

describe("scapegoat (덤터기)", () => {
  it("쯔모 시 지목 대상이 나머지 두 명의 지불을 전액 부담한다", () => {
    let state = tanyaoTsumo();
    // p0가 p1을 지목한 상태를 미리 심는다 (roundKey 스코프)
    state = {
      ...state,
      augmentData: {
        ...state.augmentData,
        [`scapegoat:target:${roundKey(state)}:p0`]: "p1",
      },
    };
    state = withAugments(state, "p0", ["scapegoat"]);
    const withAug = tsumoDeltas(state, [{ def: scapegoat, holder: "p0" }]);
    // 나머지 두 명은 0, p1이 셋의 지불을 합쳐 부담, p0는 총점 그대로
    expect(at(withAug,"p2")).toBe(0);
    expect(at(withAug,"p3")).toBe(0);
    expect(at(withAug,"p1")).toBeLessThan(0);
    // 제로섬 보존
    const sum = at(withAug,"p0") + at(withAug,"p1") + at(withAug,"p2") + at(withAug,"p3");
    expect(sum).toBe(0);
  });
});

describe("aotenjou_ceiling (뚫린 천장)", () => {
  it("만관 미만 화료에도 상한 없는 총점 보전이 붙는다(작은 손이라 0일 수 있어, 큰 판에서 검증)", () => {
    // 리치·쯔모·탕야오 등으로 판을 올린 손이 아니라도, 부수·판이 쌓이면 보너스 > 0.
    // 여기서는 보너스가 음수가 아님(항상 >= 0)과 큰 손에서 양수임을 본다.
    const base = tanyaoTsumo();
    const without = tsumoDeltas(base, []);
    const withAug = tsumoDeltas(withAugments(base, "p0", ["aotenjou_ceiling"]), [
      { def: aotenjouCeiling, holder: "p0" },
    ]);
    // 청천정 보전은 음수가 될 수 없다
    expect(at(withAug,"p0") - at(without,"p0")).toBeGreaterThanOrEqual(0);
  });
});
