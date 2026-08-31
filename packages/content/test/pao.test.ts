/**
 * 책임지불(파오 / 包 / sekinin barai) — 01 §9 `score.pao`.
 *
 * 대삼원의 세 번째 삼원패 커쯔·대사희의 네 번째 바람 커쯔를 울려 준 사람이 책임을 진다.
 *   - 쯔모: 책임자가 그 역만분 **전액**을 혼자 낸다 (3분할 없음)
 *   - 론  : 책임자와 방총자가 그 역만분을 **절반씩** 낸다
 *   - 본장·공탁은 파오를 따라가지 않는다 (방총자/평소 분담 그대로)
 *
 * 판정은 **후로 이력**(`Meld.calledFrom`, 배열 순서)만 읽는다 — 완성된 손을 역산하면
 * 증강이 만든 이상한 커쯔에서 엉뚱한 사람이 걸린다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  RuleLayer,
  SYSTEM_PLAYER,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import type { CraftConfig } from "./helpers.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function infoOf(p: RoundSettledPayload, player: PlayerId): WinInfo {
  const info = (p.winInfos ?? []).find((w) => w.winner === player);
  if (info === undefined) throw new Error(`no WinInfo for ${player}`);
  return info;
}

const sum = (d: Record<PlayerId, number>): number =>
  Object.values(d).reduce((a, b) => a + b, 0);

/**
 * p1(자)이 대삼원으로 화료하는 상태.
 *
 * p1 후로: 白(p0에게서) → 發(p2에게서) → 中(`chunFrom`에게서, **세 번째** = 확정)
 * p1 손패: 234m + 55s (5장, 화료패 2m 포함)
 */
function craftDaisangen(
  chunFrom: PlayerId | "self",
  winType: "tsumo" | "ron" = "tsumo",
): GameState {
  const melds: CraftConfig["melds"] = {};
  melds["p1"] = [
    { kind: "pon", spec: "555z", from: "p0" },
    { kind: "pon", spec: "666z", from: "p2" },
    chunFrom === "self"
      ? { kind: "kan_closed", spec: "7777z" }
      : { kind: "pon", spec: "777z", from: chunFrom },
  ];
  // 론은 화료패(2m)가 손이 아니라 p0의 버림패에 있다
  return craft({
    hands: {
      p0: "*",
      p1: winType === "tsumo" ? "234m55s" : "34m55s",
      p2: "*",
      p3: "*",
    },
    melds,
    discards: { p0: "2m" },
    phase: "turn.act",
    turnSeat: 1,
  });
}

/** p1이 쯔모(손패 마지막 장을 화료패로)로 정산 */
function settleTsumo(game: Game): RoundSettledPayload {
  const hand = game.engine.state.zones["hand:p1"]?.tileIds ?? [];
  const tileId = hand[0] as TileId; // 2m (손패 첫 장 = 234m의 2m)
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p1", from: null, tileId, winType: "tsumo" }] },
  });
  if (!r.ok) throw new Error(r.reason);
  return lastSettled(game);
}

/** p1이 p0의 버림패(2m)를 론으로 정산 */
function settleRon(game: Game): RoundSettledPayload {
  const tileId = game.engine.state.zones[discardsZone("p0")]
    ?.tileIds[0] as TileId;
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p1", from: "p0", tileId, winType: "ron" }] },
  });
  if (!r.ok) throw new Error(r.reason);
  return lastSettled(game);
}

describe("파오 — 대삼원 (자 화료, 32000점)", () => {
  it("파오 없음(세 번째를 안깡으로 스스로 맞춤): 쯔모는 평소대로 3분할", () => {
    const p = settleTsumo(createStandardGameFromState(craftDaisangen("self")));
    expect(infoOf(p, "p1").pao).toBeUndefined();
    // 자 역만 쯔모 = 오야 16000 + 자 8000 × 2
    expect(p.deltas["p0"]).toBe(-16000);
    expect(p.deltas["p2"]).toBe(-8000);
    expect(p.deltas["p3"]).toBe(-8000);
    expect(p.deltas["p1"]).toBe(32000);
    expect(sum(p.deltas)).toBe(0);
  });

  it("쯔모: 세 번째 中을 준 p3가 32000 전액을 혼자 낸다", () => {
    const p = settleTsumo(createStandardGameFromState(craftDaisangen("p3")));
    const info = infoOf(p, "p1");
    expect(info.pao).toEqual({
      responsible: "p3",
      yakuId: "daisangen",
      points: 32000,
    });
    expect(p.deltas["p3"]).toBe(-32000);
    expect(p.deltas["p0"]).toBe(0);
    expect(p.deltas["p2"]).toBe(0);
    expect(p.deltas["p1"]).toBe(32000);
    expect(sum(p.deltas)).toBe(0);
  });

  it("론: 책임자 p3와 방총자 p0가 16000씩 절반을 낸다", () => {
    const p = settleRon(createStandardGameFromState(craftDaisangen("p3", "ron")));
    expect(infoOf(p, "p1").pao?.points).toBe(16000);
    expect(p.deltas["p0"]).toBe(-16000);
    expect(p.deltas["p3"]).toBe(-16000);
    expect(p.deltas["p2"]).toBe(0);
    expect(p.deltas["p1"]).toBe(32000);
    expect(sum(p.deltas)).toBe(0);
  });

  it("책임자가 곧 방총자면 그 사람이 전액을 낸다 (절반 재배선 없음)", () => {
    const p = settleRon(createStandardGameFromState(craftDaisangen("p0", "ron")));
    expect(p.deltas["p0"]).toBe(-32000);
    expect(p.deltas["p1"]).toBe(32000);
    expect(sum(p.deltas)).toBe(0);
  });

  it("본장은 파오를 따라가지 않는다 — 론 본장은 방총자가 전액", () => {
    const base = craftDaisangen("p3", "ron");
    const game = createStandardGameFromState({
      ...base,
      round: { ...base.round, honba: 2 },
    });
    const p = settleRon(game);
    // 32000의 절반씩 + 본장 600은 방총자(p0)만
    expect(p.deltas["p0"]).toBe(-16600);
    expect(p.deltas["p3"]).toBe(-16000);
    expect(p.deltas["p1"]).toBe(32600);
    expect(sum(p.deltas)).toBe(0);
  });

  it("본장은 파오를 따라가지 않는다 — 쯔모 본장은 셋이 나눠 낸다", () => {
    const base = craftDaisangen("p3");
    const game = createStandardGameFromState({
      ...base,
      round: { ...base.round, honba: 3 },
    });
    const p = settleTsumo(game);
    // 본장 900 → 1인당 300. 역만분 32000은 p3 혼자.
    expect(p.deltas["p0"]).toBe(-300);
    expect(p.deltas["p2"]).toBe(-300);
    expect(p.deltas["p3"]).toBe(-32300);
    expect(p.deltas["p1"]).toBe(32900);
    expect(sum(p.deltas)).toBe(0);
  });
});

describe("파오 — 붙지 않는 경우", () => {
  it("삼원패 커쯔 하나가 손 안의 안커면 파오가 아니다 (준 사람이 볼 수 없었다)", () => {
    // 中을 손 안 안커로 들고 후로는 白·發 두 개 뿐 — 마지막 후로가 확정시키지 않는다
    const s = craft({
      hands: { p0: "*", p1: "777z34m55s", p2: "*", p3: "*" },
      melds: {
        p1: [
          { kind: "pon", spec: "555z", from: "p0" },
          { kind: "pon", spec: "666z", from: "p3" },
        ],
      },
      discards: { p0: "2m" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const p = settleRon(createStandardGameFromState(s));
    expect(infoOf(p, "p1").yaku.some((y) => y.id === "daisangen")).toBe(true);
    expect(infoOf(p, "p1").pao).toBeUndefined();
    expect(p.deltas["p0"]).toBe(-32000);
  });

  it("대삼원이 아닌 손(소삼원 등)에는 파오가 붙지 않는다", () => {
    const s = craft({
      hands: { p0: "*", p1: "34m55z", p2: "*", p3: "*" },
      melds: {
        p1: [
          { kind: "pon", spec: "666z", from: "p0" },
          { kind: "pon", spec: "777z", from: "p3" },
          { kind: "pon", spec: "999s", from: "p2" },
        ],
      },
      discards: { p0: "2m" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const p = settleRon(createStandardGameFromState(s));
    const info = infoOf(p, "p1");
    expect(info.yaku.some((y) => y.id === "daisangen")).toBe(false);
    expect(info.pao).toBeUndefined();
  });

  it("score.pao=false면 파오가 꺼진다 (평소 지불)", () => {
    const game = createStandardGameFromState(craftDaisangen("p3"));
    game.engine.rules.addModifier<boolean>("score.pao", {
      source: "test",
      layer: RuleLayer.Prism,
      apply: () => false,
    });
    const p = settleTsumo(game);
    expect(infoOf(p, "p1").pao).toBeUndefined();
    expect(p.deltas["p3"]).toBe(-8000);
  });
});

describe("파오 — 대사희 (더블 역만)", () => {
  /** p1 후로: 동·남·서·북 펑. 네 번째(北)를 p2가 줬다. 손패는 머리뿐 */
  function craftDaisuushii(): GameState {
    return craft({
      hands: { p0: "*", p1: "55s", p2: "*", p3: "*" },
      melds: {
        p1: [
          { kind: "pon", spec: "111z", from: "p0" },
          { kind: "pon", spec: "222z", from: "p3" },
          { kind: "pon", spec: "333z", from: "p3" },
          { kind: "pon", spec: "444z", from: "p2" },
        ],
      },
      discards: { p0: "5s" },
      phase: "turn.act",
      turnSeat: 1,
    });
  }

  it("쯔모: 네 번째 北을 준 p2가 더블 역만 64000 전액을 낸다", () => {
    const game = createStandardGameFromState(craftDaisuushii());
    const hand = game.engine.state.zones["hand:p1"]?.tileIds ?? [];
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: {
        wins: [
          { winner: "p1", from: null, tileId: hand[0] as TileId, winType: "tsumo" },
        ],
      },
    });
    if (!r.ok) throw new Error(r.reason);
    const p = lastSettled(game);
    expect(infoOf(p, "p1").pao).toEqual({
      responsible: "p2",
      yakuId: "daisuushii",
      points: 64000,
    });
    expect(p.deltas["p2"]).toBe(-64000);
    expect(p.deltas["p0"]).toBe(0);
    expect(p.deltas["p3"]).toBe(0);
    expect(sum(p.deltas)).toBe(0);
  });
});

describe("파오 × 증강 정산 파이프라인", () => {
  /**
   * 파오는 **코어가 만드는 기본 deltas**다 — 증강 인터셉터는 그 위에서 돈다.
   * 역만 방어술(Shield 단계)은 "최종 손실"을 보고 막으므로, 책임자가 방어막을
   * 들고 있으면 파오로 떠안은 역만분까지 막힌다. 파오는 **누가 내느냐**를 정하고,
   * 방어술은 **그 사람이 실제로 잃느냐**를 정한다 — 층이 다르므로 둘 다 성립한다.
   */
  it("책임자가 역만 방어술을 들고 있으면 파오분도 방어된다", () => {
    const base = craftDaisangen("p3");
    const withAug: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p3" ? { ...p, augments: [...p.augments, "yakuman_shield"] } : p,
      ),
    };
    const game = createStandardGameFromState(withAug);
    installAugment(game.engine, yakumanShield, "p3");
    const p = settleTsumo(game);
    // 파오로 p3에게 32000이 몰렸지만 방어술이 그 손실을 되돌린다
    expect(infoOf(p, "p1").pao?.responsible).toBe("p3");
    expect(p.deltas["p3"]).toBe(0);
    // 2026-08-31: 환급 재원은 뱅크다 — 파오 화료자의 수령은 그대로 32,000이다.
    expect(p.deltas["p1"]).toBe(32000);
    expect(p.deltas["p0"]).toBe(0);
    expect(p.deltas["p2"]).toBe(0);
  });
});
