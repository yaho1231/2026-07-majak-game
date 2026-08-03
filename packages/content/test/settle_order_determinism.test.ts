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
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { settleInterceptor } from "../src/util.js";
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

  it("같은 사람이 두 증강을 가지면 종전대로 등록 순서를 따른다 (자리가 같으므로)", () => {
    const t = traceOf([
      [augA, "p2"],
      [augB, "p2"],
    ]);
    expect(t).toBe("p2/mark_a;p2/mark_b;");
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
