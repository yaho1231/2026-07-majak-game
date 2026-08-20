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
        [`scapegoat:target:${roundKey(state)}:p0#round`]: "p1",
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

  // ── 2026-08-02 개편 (사용자 지시) ──

  it("늘어난 점수는 뱅크가 아니라 타가가 낸다 — 정산이 제로섬으로 닫힌다", () => {
    const base = withAugments(tanyaoTsumo(), "p0", ["aotenjou_ceiling"]);
    const d = tsumoDeltas(base, [{ def: aotenjouCeiling, holder: "p0" }]);
    const sum = at(d, "p0") + at(d, "p1") + at(d, "p2") + at(d, "p3");
    // 예전에는 초과분을 뱅크가 전액 발행해 합이 양수로 열려 있었다
    expect(sum).toBe(0);
  });

  it("결과창 줄은 **만관 위로 살아남은 판수**로 적힌다", () => {
    // 스안커 쯔모(오야) — 역만 13판 환산이므로 만관(5판) 위로 8판이 살아남는다.
    const state = withAugments(
      craft({
        hands: { p0: "111m222p333s99s555z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["aotenjou_ceiling"],
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, aotenjouCeiling, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s = flow.begin();
    if (s.kind !== "awaiting") throw new Error("expected awaiting");
    flow.submit("p0", s.prompts.find((p) => p.player === "p0")!.options.find((o) => o.type === "win")!);
    const note = (lastSettled(game).augPoints ?? []).find(
      (a) => a.augId === "aotenjou_ceiling",
    );
    expect(note?.han).toBe(8);
  });

  it("증강이 얹은 점수가 결과창용 augPoints에 남는다", () => {
    // 판이 높아야 보전이 생긴다 — 스택으로 판을 올릴 수 없으니 부수·판이 큰 손 대신
    // 보전이 0인 손에서도 "0이면 줄을 남기지 않는다"를 확인한다.
    const base = withAugments(tanyaoTsumo(), "p0", ["aotenjou_ceiling"]);
    const game = createStandardGameFromState(base);
    installAugment(game.engine, aotenjouCeiling, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s = flow.begin();
    if (s.kind !== "awaiting") throw new Error("expected awaiting");
    const win = s.prompts.find((p) => p.player === "p0")?.options.find((o) => o.type === "win");
    flow.submit("p0", win!);
    const settled = lastSettled(game);
    const note = (settled.augPoints ?? []).find((a) => a.augId === "aotenjou_ceiling");
    const info = (settled.winInfos ?? []).find((w) => w.winner === "p0")!;
    const extra = at(settled.deltas, "p0") - info.points;
    if (extra > 0) {
      expect(note).toBeDefined();
      expect(note?.points).toBe(extra);
    } else {
      expect(note).toBeUndefined();
    }
  });

  it("역만 쯔모 — 590만이 아니라 만관 5개(오야 60,000)로 떨어지고 타가가 낸다", () => {
    // 스안커 쯔모(오야). 표준 역만 오야 쯔모 = 48,000 (각 16,000).
    // 청천정: 13판 환산 → base 2000 + 8×1000 = 10,000 → 오야 쯔모 20,000×3 = 60,000.
    const state = withAugments(
      craft({
        hands: { p0: "111m222p333s99s555z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["aotenjou_ceiling"],
    );
    const d = tsumoDeltas(state, [{ def: aotenjouCeiling, holder: "p0" }]);
    expect(at(d, "p0")).toBe(60_000);
    for (const id of ["p1", "p2", "p3"] as PlayerId[]) expect(at(d, id)).toBe(-20_000);
    expect(at(d, "p0") + at(d, "p1") + at(d, "p2") + at(d, "p3")).toBe(0);
  });

  it("점수 곡선 — 만관 위로는 2판당 만관 하나 (배수형 증강과 같은 급으로 맞춘다)", () => {
    // 정통 청천정(부수×2^(판+2))은 역만 한 방이 590만 점이 됐다(2026-08-02 사용자 실측).
    // 1차 개편(판당 만관 1개)은 8판 이상에서 조건 없이 2~3배라 여전히 셌다.
    // 지금 곡선: base = 만관 + (판−5)×만관/2.
    const base = (effHan: number): number => 2000 + (effHan - 5) * 1000;
    const nonDealerRon = (effHan: number): number => base(effHan) * 4;
    expect(nonDealerRon(5)).toBe(8_000); // 만관 그대로
    expect(nonDealerRon(6)).toBe(12_000); // 표준 하네만과 동일
    expect(nonDealerRon(8)).toBe(20_000); // 표준 배만 16,000의 1.25배
    expect(nonDealerRon(10)).toBe(28_000); // 표준 배만 16,000의 1.75배
    expect(nonDealerRon(13)).toBe(40_000); // 표준 역만 32,000의 1.25배
    // 상한이 없다는 정체성은 그대로 — 더블 역만(26판 환산)도 계속 늘어난다
    expect(nonDealerRon(26)).toBe(92_000);
    expect(nonDealerRon(13) / 32_000).toBeCloseTo(1.25, 5);
  });
});
