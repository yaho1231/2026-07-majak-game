/**
 * 정산 순서는 게임 상태만으로 정해진다 (docs/25 P6).
 *
 * `settleInterceptor`가 같은 단계(stage)에 둘 이상 앉으면 예전에는 등록 순서(seq)로
 * 밀렸다. 그 순서가 곧 **드래프트 픽 순서**라, 같은 상황에서 최종 점수가
 * "누가 먼저 뽑았는가"로 갈렸다. 재구성(이어하기·리플레이)은 설치 순서가 또 달라서
 * 원본과 다른 결과를 낼 수도 있었다.
 *
 * 이제 단계 안의 순서는 **보유자의 자리(seat)** 로 정해진다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SETTLE_LAYER,
  SETTLE_STAGE,
  createStandardGameFromState,
  installAugment,
  settlePriority,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { settleInterceptor } from "../src/util.js";
import { bigHand } from "../src/augments/big_hand.js";
import { counter } from "../src/augments/counter.js";
import { foresight } from "../src/augments/foresight.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";
import { defineAugment } from "@majak/core";

/** 정산 deltas에 자기 이름을 이어 붙이는 표식용 증강 (같은 단계에 여러 개 앉힌다) */
function marker(id: string): AugmentDef {
  return defineAugment({
    id,
    tier: "prism",
    category: "scoring",
    name: id,
    description: id,
    detail: id,
    install(ctx) {
      settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event) => {
        const p = event.payload as { trace?: string };
        return {
          type: event.type,
          payload: { ...p, trace: `${p.trace ?? ""}${ctx.holder}/${id};` },
        };
      });
    },
  });
}

const augA = marker("mark_a");
const augB = marker("mark_b");

function scene(): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 지정한 설치 순서로 게임을 만들고, ROUND_SETTLED를 흘려 trace를 얻는다 */
function traceOf(order: [AugmentDef, PlayerId][]): string {
  const game = createStandardGameFromState(
    scene(),
    undefined,
    [...new Map(order.map(([d]) => [d.id, d])).values()],
  );
  for (const [def, holder] of order) installAugment(game.engine, def, holder, {});

  const interceptors = game.engine.effects.interceptorsFor(ROUND_SETTLED);
  let payload: { trace?: string } = {};
  for (const { intercept } of interceptors) {
    const out = intercept(
      { type: ROUND_SETTLED, payload },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (out !== null) payload = out.payload as { trace?: string };
  }
  return payload.trace ?? "";
}

describe("같은 정산 단계의 순서는 설치 순서와 무관하다", () => {
  it("설치 순서를 뒤집어도 결과 순서가 같다 (자리 기준)", () => {
    const forward = traceOf([
      [augA, "p1"],
      [augB, "p3"],
    ]);
    const reversed = traceOf([
      [augB, "p3"],
      [augA, "p1"],
    ]);
    expect(forward).toBe(reversed);
    // 자리가 앞선 p1이 먼저 돈다
    expect(forward.indexOf("p1/")).toBeLessThan(forward.indexOf("p3/"));
  });

  /**
   * 회귀 (2026-08-11): 자리만 얹던 시절에는 **한 사람이 같은 단계에 둘**을 쥐면
   * priority가 완전히 동률이라 `EffectRegistry`가 등록 순서(seq) = 드래프트 픽 순서로
   * 밀었다. 결과가 갈리는 조합이 실제로 있다 — 아래 큰손 테스트 참고.
   */
  it("같은 사람이 같은 단계의 증강 둘을 가져도 설치 순서와 무관하다", () => {
    const forward = traceOf([
      [augA, "p2"],
      [augB, "p2"],
    ]);
    const reversed = traceOf([
      [augB, "p2"],
      [augA, "p2"],
    ]);
    expect(forward).toBe(reversed);
    expect(forward.split(";").filter(Boolean)).toHaveLength(2);
  });

  it("SETTLE_LAYER는 그대로 유지된다 — 단계 경계를 넘지 않는다", () => {
    const game = createStandardGameFromState(scene(), undefined, [augA]);
    installAugment(game.engine, augA, "p3", {});
    const found = game.engine.effects
      .interceptorsFor(ROUND_SETTLED)
      .filter((e) => e.source.includes("mark_a"));
    expect(found.length).toBe(1);
    // 자리 3이 얹혀도 다음 단계(DrawPatch=500)를 침범하지 않는다
    expect(SETTLE_STAGE.Transfer + 3).toBeLessThan(SETTLE_STAGE.DrawPatch);
    expect(SETTLE_LAYER).toBeGreaterThan(0);
  });
});

/**
 * 같은 단계·같은 사람 조합에서 **실제로 점수가 갈린다**는 증거.
 *
 * BankTopUp에는 열두 종이 앉아 있고 그중 큰손(big_hand)은 `deltas`의 **현재값**을 읽어
 * 하한까지 채운다 — 다른 가산이 앞에 오면 이미 하한을 넘어 아무것도 안 채우고, 뒤에 오면
 * 하한까지 채운 뒤 가산이 통째로 더 얹힌다. 여기서는 그 패턴을 최소로 재현한다.
 * 자리만 얹던 시절에는 이 두 개가 완전 동률이라 결과가 **드래프트 픽 순서**로 갈렸다.
 */
describe("BankTopUp — 같은 사람이 '가산'과 '하한 보전'을 함께 쥔 경우", () => {
  const FLOOR = 8000;
  const ADD = 5000;

  /** 정액 가산 (addWinPointBonus 계열) */
  const adder = defineAugment({
    id: "probe_flat_adder",
    tier: "prism",
    category: "scoring",
    name: "adder",
    description: "adder",
    detail: "adder",
    install(ctx) {
      settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event) => {
        const p = event.payload as { deltas: Record<string, number> };
        return {
          type: event.type,
          payload: {
            ...p,
            deltas: { ...p.deltas, [ctx.holder]: (p.deltas[ctx.holder] ?? 0) + ADD },
          },
        };
      });
    },
  });

  /** 하한 보전 (big_hand 계열) — 현재값을 읽으므로 교환법칙이 성립하지 않는다 */
  const floorer = defineAugment({
    id: "probe_floor_topup",
    tier: "prism",
    category: "scoring",
    name: "floorer",
    description: "floorer",
    detail: "floorer",
    install(ctx) {
      // big_hand과 같은 단계 — 가산이 전부 끝난 뒤에 하한을 본다.
      settleInterceptor(ctx, SETTLE_STAGE.BankFloor, (event) => {
        const p = event.payload as { deltas: Record<string, number> };
        const cur = p.deltas[ctx.holder] ?? 0;
        if (cur >= FLOOR) return event;
        return {
          type: event.type,
          payload: { ...p, deltas: { ...p.deltas, [ctx.holder]: FLOOR } },
        };
      });
    },
  });

  function settledDelta(order: AugmentDef[]): number {
    const game = createStandardGameFromState(scene(), undefined, [adder, floorer]);
    for (const def of order) installAugment(game.engine, def, "p2", {});
    let payload: { deltas: Record<string, number> } = { deltas: { p2: 1000 } };
    for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
      const out = intercept(
        { type: ROUND_SETTLED, payload },
        { state: game.engine.state, rules: game.engine.rules },
      );
      if (out !== null) payload = out.payload as { deltas: Record<string, number> };
    }
    return payload.deltas["p2"] ?? 0;
  }

  it("픽 순서를 뒤집어도 수령액이 같다", () => {
    // 고치기 전: [adder, floorer] → 1000+5000=6000 → 하한 8000 보전 → 8000
    //            [floorer, adder] → 하한 8000 보전 → +5000 → 13000  (5000점 차)
    expect(settledDelta([adder, floorer])).toBe(settledDelta([floorer, adder]));
  });

  /**
   * 결정론만으로는 부족했다 — 어느 순서로 굳느냐가 **규칙상** 옳아야 한다.
   *
   * 큰손이 약속하는 것은 "그 국에 내가 **받는 것**이 최소 만관"이므로, 뱅크 가산이
   * 전부 얹힌 **뒤에** 하한을 봐야 한다. 하한이 먼저 서면 "만관 + 가산"이 되어
   * 카드의 약속과 달라진다.
   *
   * ⚠ 프로브 두 개로 "픽 순서를 뒤집어도 같다"만 보는 것으로는 이걸 못 잡는다 —
   * 같은 단계에 둬도 id소수가 우연히 유리한 쪽으로 정렬되면 그냥 통과한다(실제로
   * 그랬다). 그래서 **진짜 카탈로그 증강**을 여러 개 깔고 순서를 직접 확인한다.
   */
  it("큰손은 모든 뱅크 가산 뒤에 돈다 (실제 증강으로 확인)", () => {
    const topUps = [counter, foresight, haiteiLord, allOrNothing];
    const game = createStandardGameFromState(scene(), undefined, [bigHand, ...topUps]);
    // 같은 사람이 전부 들고 있을 때가 가장 까다롭다 — 자리 항이 순서를 못 가른다.
    for (const def of [bigHand, ...topUps]) installAugment(game.engine, def, "p2", {});

    // interceptorsFor는 (layer, priority, 등록순) 으로 **정렬된** 목록을 준다.
    const order = game.engine.effects
      .interceptorsFor(ROUND_SETTLED)
      .map((e) => e.source);
    const at = (id: string): number => order.indexOf(`aug:p2:${id}`);

    expect(at("big_hand")).toBeGreaterThanOrEqual(0);
    for (const def of topUps) {
      expect(at(def.id), `${def.id} 보다 큰손이 먼저 돈다`).toBeGreaterThanOrEqual(0);
      expect(at("big_hand"), `큰손이 ${def.id} 보다 앞선다`).toBeGreaterThan(at(def.id));
    }
  });

  it("BankFloor는 BankTopUp 뒤, Transfer 앞이다", () => {
    expect(SETTLE_STAGE.BankTopUp).toBeLessThan(SETTLE_STAGE.BankFloor);
    expect(SETTLE_STAGE.BankFloor).toBeLessThan(SETTLE_STAGE.Transfer);
    // 자리(0~3) + id소수(<1)를 더해도 단계 경계를 넘지 않는다
    expect(SETTLE_STAGE.BankTopUp + 4).toBeLessThanOrEqual(SETTLE_STAGE.BankFloor);
    expect(SETTLE_STAGE.BankFloor + 4).toBeLessThanOrEqual(SETTLE_STAGE.Transfer);
  });
});

/**
 * `settlePriority`의 하위 자리(증강 id 소수)가 **카탈로그 전체에서 겹치지 않는다.**
 *
 * 겹치면 그 두 증강은 같은 단계·같은 자리에서 다시 동률이 되어 픽 순서로 밀린다 —
 * 이 소수는 해시라서 이론상 충돌이 가능하므로, 실제 카탈로그로 못 박아 둔다.
 * 새 증강을 추가했을 때 하필 충돌하면 여기서 빨갛게 뜬다.
 */
describe("settlePriority — 카탈로그 전체에서 동률이 없다", () => {
  it("모든 증강 id가 서로 다른 priority를 만든다", async () => {
    const { contentAugments } = await import("../src/index.js");
    const { standardAugments } = await import("@majak/core");
    const ids = [
      ...new Set(
        [...(standardAugments as AugmentDef[]), ...contentAugments].map((d) => d.id),
      ),
    ];
    expect(ids.length).toBeGreaterThan(100);
    for (const stage of Object.values(SETTLE_STAGE)) {
      for (const seat of [0, 1, 2, 3]) {
        const prios = ids.map((id) => settlePriority(stage, seat, id));
        expect(new Set(prios).size).toBe(ids.length);
        // 자리·id를 얹어도 다음 자리를 침범하지 않는다
        for (const p of prios) {
          expect(p).toBeGreaterThanOrEqual(stage + seat);
          expect(p).toBeLessThan(stage + seat + 1);
        }
      }
    }
  });
});

/**
 * 재구성(이어하기·리플레이)이 원본과 같은 설치 순서를 만든다 (docs/25 P6).
 *
 * 원본 드래프트는 스테이지마다 자리 순으로 한 장씩 돈다(p0 1차, p1 1차, …,
 * p0 2차, …). 예전 `rebuildAugments`는 플레이어별로 몰아서(p0의 전부 → p1의 전부)
 * 설치해 등록 순서가 달라졌다 — seq에 기대는 동률 훅이 뒤집히면 **재개한 게임과
 * 리플레이가 원본과 다른 점수를 낼 수 있었다.**
 */
describe("rebuildAugments — 원본 드래프트 순서를 재현한다", () => {
  it("플레이어별로 몰아서가 아니라 스테이지별 자리 순으로 설치한다", async () => {
    const { AugmentRegistry, rebuildAugments } = await import("@majak/core");

    const order: string[] = [];
    const probe = (id: string): AugmentDef =>
      defineAugment({
        id,
        tier: "prism",
        category: "scoring",
        name: id,
        description: id,
        detail: id,
        install(ctx) {
          order.push(`${ctx.holder}/${id}`);
        },
      });

    const a = probe("probe_a");
    const b = probe("probe_b");

    // p0·p1이 각각 1차로 a, 2차로 b를 뽑은 상태
    const base = scene();
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" || p.id === "p1"
          ? { ...p, augments: ["probe_a", "probe_b"] }
          : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [a, b]);
    const catalog = new AugmentRegistry();
    catalog.addAll([a, b]);

    rebuildAugments(game.engine, catalog, {});

    // 실제 드래프트 순서: 1차(p0,p1) → 2차(p0,p1)
    expect(order).toEqual([
      "p0/probe_a",
      "p1/probe_a",
      "p0/probe_b",
      "p1/probe_b",
    ]);
  });
});
