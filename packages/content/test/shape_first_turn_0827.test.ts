/**
 * 2026-08-27 사용자 지시 — 쿨다운·첫 순 제한 배치의 회귀 테스트.
 *
 *  1. **모양 규칙 3종은 국의 첫 순에만 켤 수 있다** — 이 국에 한 장이라도 버린 뒤에는
 *     선언이 막히고 버튼도 사라진다. 예전에는 자기 순이면 국 중 아무 때나 켤 수 있어,
 *     손이 굳은 뒤 "지금 켜면 텐파이"인 순간만 골라 태우는 결과 확인형 카드였다.
 *     판정 규약은 일확천금·통째로 바꾸기와 같다(`discardCount === 0`) — `turnCount`로
 *     재면 상대의 후로 한 번에 내 창이 닫힌다(2026-08-25 사용자 보고).
 *  2. **박무·함구령의 재사용 게이트가 매치 횟수 → 국 단위 쿨다운**이 됐다.
 *     동풍전 2국에 1회 · 반장전 3국에 1회.
 *
 * (모양 3종의 모드별 쿨다운 자체는 `mode_scaled_uses_0823.test.ts`가 함께 본다.)
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { AugmentDef, GameMode, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { cooldownUsedKey, scaledCooldown } from "../src/util.js";

import { asyncChiitoi } from "../src/augments/async_chiitoi.js";
import { brokenBorder } from "../src/augments/broken_border.js";
import { mixedTriplet } from "../src/augments/mixed_triplet.js";
import { briefFog } from "../src/augments/brief_fog.js";
import { callSeal } from "../src/augments/call_seal.js";

/** 국 진행 카운터 키 (util의 `roundSeqKey` 규약 — 내보내지 않으므로 여기서 만든다) */
const seqKey = (id: string): string => `${id}:seq:p0`;

type Game = ReturnType<typeof createStandardGameFromState>;

function scene(opts: {
  id: string;
  mode?: GameMode;
  /** p0가 이 국에 이미 버린 패 (없으면 첫 순) */
  discarded?: boolean;
  data?: Record<string, unknown>;
}): GameState {
  const base = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
    ...(opts.discarded === true
      ? { discards: { p0: "9m", p1: "9p", p2: "9s", p3: "5z" } }
      : {}),
  });
  return {
    ...base,
    ...(opts.mode === undefined ? {} : { config: { ...base.config, mode: opts.mode } }),
    players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: [opts.id] } : p)),
    augmentData: { ...base.augmentData, ...(opts.data ?? {}) },
  };
}

function game(state: GameState, def: AugmentDef, holder: PlayerId = "p0"): Game {
  const g = createStandardGameFromState(state, undefined, [def]);
  installAugment(g.engine, def, holder, { yaku: g.yaku });
  return g;
}

const optionShown = (g: Game, action: string): boolean =>
  g.engine.turnOptionProviders
    .flatMap((p) => p(g.engine.state, "p0"))
    .some((o) => o.type === action);

// ───────────── 1. 모양 규칙 3종 — 국의 첫 순에만 ─────────────

const SHAPE = [
  { id: "mixed_triplet", def: mixedTriplet, action: "declare_mixed_triplet" },
  { id: "broken_border", def: brokenBorder, action: "declare_broken_border" },
  { id: "async_chiitoi", def: asyncChiitoi, action: "declare_async_chiitoi" },
];

describe.each(SHAPE)("$id — 국의 첫 순에만 발동할 수 있다", ({ id, def, action }) => {
  const fire = (g: Game): boolean =>
    g.engine.submit({ player: "p0", type: action, payload: {} }).ok;

  it("아직 한 장도 버리지 않은 내 순에는 켤 수 있다", () => {
    const g = game(scene({ id }), def);
    expect(optionShown(g, action)).toBe(true);
    expect(fire(g)).toBe(true);
  });

  it("이미 한 장 버렸으면 막히고 버튼도 사라진다", () => {
    const g = game(scene({ id, discarded: true }), def);
    expect(optionShown(g, action)).toBe(false);
    expect(fire(g)).toBe(false);
  });

  it("쿨다운이 남아 있으면 첫 순이어도 못 켠다 (두 게이트는 따로 산다)", () => {
    const g = game(
      scene({
        id,
        mode: "hanchan",
        data: { [cooldownUsedKey(id, "p0")]: 3, [seqKey(id)]: 5 },
      }),
      def,
    );
    expect(fire(g)).toBe(false);
    // 눌러 봐야 거절될 버튼은 띄우지 않는다
    expect(optionShown(g, action)).toBe(false);
  });
});

// ───────────── 2. 박무·함구령 — 국 단위 쿨다운 (동풍전 2 · 반장전 3) ─────────────

const DISRUPT = [
  { id: "brief_fog", def: briefFog, action: "declare_brief_fog" },
  { id: "call_seal", def: callSeal, action: "call_seal_use" },
];

describe.each(DISRUPT)("$id — 매치 횟수가 아니라 국 단위 쿨다운이다", ({ id, def, action }) => {
  const fire = (g: Game): boolean =>
    g.engine.submit({ player: "p0", type: action, payload: {} }).ok;
  const at = (mode: GameMode, usedSeq: number, seq: number): Game =>
    game(
      scene({
        id,
        mode,
        data: { [cooldownUsedKey(id, "p0")]: usedSeq, [seqKey(id)]: seq },
      }),
      def,
    );

  it("한 번도 쓰지 않았으면 열려 있다", () => {
    expect(fire(game(scene({ id }), def))).toBe(true);
  });

  it("동풍전은 2국이 지나야 다시 열린다", () => {
    expect(fire(at("tonpuu", 3, 4))).toBe(false);
    expect(fire(at("tonpuu", 3, 5))).toBe(true);
  });

  it("반장전은 3국이 지나야 다시 열린다", () => {
    expect(fire(at("hanchan", 3, 5))).toBe(false);
    expect(fire(at("hanchan", 3, 6))).toBe(true);
  });

  it("잠겨 있는 동안에는 버튼도 뜨지 않는다", () => {
    expect(optionShown(at("hanchan", 3, 5), action)).toBe(false);
    expect(optionShown(at("hanchan", 3, 6), action)).toBe(true);
  });

  it("첫 순 제한은 없다 — 이 둘은 국 중 아무 때나 자기 순에 켤 수 있다", () => {
    expect(fire(game(scene({ id, discarded: true }), def))).toBe(true);
  });
});

describe("scaledCooldown — 동풍전 기준 N국, 반장전은 올림 1.5배", () => {
  const st = (mode?: GameMode): GameState =>
    ({ config: mode === undefined ? {} : { mode } }) as unknown as GameState;

  it("동풍전은 적힌 그대로, 반장전은 1.5배(올림)다", () => {
    expect([1, 2, 3].map((n) => scaledCooldown(st("tonpuu"), n))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((n) => scaledCooldown(st("hanchan"), n))).toEqual([2, 3, 5]);
  });

  it("mode가 없으면 반장전으로 본다 (서버 기본과 같다)", () => {
    expect(scaledCooldown(st(), 2)).toBe(3);
  });
});
