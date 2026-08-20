/**
 * 지급형 증강(화수분 계열)의 후보·순서 회귀 — 2026-08-20 QA(cross 확정 1·2, disrupt-b 확정 1).
 *
 * 세 가지를 못 박는다.
 *  ① `grantAugments`의 후보는 **지금 스테이지에 실제로 제시 가능한 것**뿐이다
 *     (예전 조건이 뒤집혀 게임 시작 전용 증강이 남3국에 지급됐다).
 *  ② 같은 스테이지에 **다른 좌석이 집을 수 있는 것**은 지급하지 않는다
 *     (한 게임에 같은 증강을 둘이 보유하는 창을 닫는다).
 *  ③ 재구성(`rebuildAugments`)의 설치 순서가 **원본과 글자 그대로** 같다.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { defineAugment, installAugment } from "../src/augment/Augment.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import { DraftController, rebuildAugments } from "../src/augment/DraftController.js";
import { augmentStageKey } from "../src/augment/events.js";
import { createStandardGame, createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";

/** 설치될 때마다 자기 인스턴스 id를 남기는 기록장 (설치 순서 비교용) */
let installOrder: string[] = [];

function marker(id: string, extra?: Partial<AugmentDef>): AugmentDef {
  return defineAugment({
    id,
    tier: "prism",
    category: "etc",
    complexity: 1,
    name: id,
    description: "-",
    install: (ctx) => {
      installOrder.push(ctx.instanceId);
    },
    ...extra,
  });
}

/** 무엇이든 2장 지급하는 화수분 (후보 목록 자체를 관찰할 수 있게 훅을 남긴다) */
let lastAvailable: string[] = [];
const granter: AugmentDef = defineAugment({
  id: "qa_granter",
  tier: "prism",
  category: "etc",
  complexity: 1,
  name: "qa_granter",
  description: "-",
  install: (ctx) => {
    ctx.grantAugments((available) => {
      lastAvailable = available.map((d) => d.id);
      return available.filter((d) => d.id.startsWith("qa_gift")).slice(0, 2);
    });
    installOrder.push(ctx.instanceId);
  },
});

const gifts = [0, 1, 2, 3].map((i) => marker(`qa_gift_${i}`));
const earlyOnly = marker("qa_early_only", { draftStages: ["gameStart"] });
const lateOnly = marker("qa_late_only", { draftStages: ["southThird"] });
const extras = [granter, ...gifts, earlyOnly, lateOnly];

function newGame(): ReturnType<typeof createStandardGame> {
  const game = createStandardGame({ seed: 4242, extraAugments: extras });
  // 정식 픽이 하듯 보유 목록에 먼저 올린다 (지급 이력 추적이 보유 목록을 근거로 한다)
  game.engine.state.players = game.engine.state.players.map((p) =>
    p.id === "p0" ? { ...p, augments: ["qa_granter"] } : p,
  );
  return game;
}

beforeEach(() => {
  installOrder = [];
  lastAvailable = [];
});

describe("grantAugments — 스테이지 필터", () => {
  it("스테이지가 기록돼 있으면 그 스테이지에 제시 가능한 것만 후보다", () => {
    const game = newGame();
    game.engine.state.augmentData[augmentStageKey("p0", "qa_granter")] = "southThird";
    installAugment(game.engine, granter, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(lastAvailable).toContain("qa_late_only");
    expect(lastAvailable).not.toContain("qa_early_only");
  });

  it("게임 시작 스테이지에서는 늦은 스테이지 전용이 후보에서 빠진다", () => {
    const game = newGame();
    game.engine.state.augmentData[augmentStageKey("p0", "qa_granter")] = "gameStart";
    installAugment(game.engine, granter, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(lastAvailable).toContain("qa_early_only");
    expect(lastAvailable).not.toContain("qa_late_only");
  });

  it("스테이지를 모르는 경로(사전 지급)에서는 스테이지 제한이 붙은 것을 전부 뺀다", () => {
    const game = newGame();
    installAugment(game.engine, granter, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(lastAvailable).not.toContain("qa_early_only");
    expect(lastAvailable).not.toContain("qa_late_only");
    expect(lastAvailable).toContain("qa_gift_0");
  });
});

describe("grantAugments — 같은 스테이지 예약분", () => {
  it("reservedAugmentIds에 든 것은 지급 후보에서 빠진다", () => {
    const game = newGame();
    installAugment(game.engine, granter, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
      reservedAugmentIds: ["qa_gift_0", "qa_gift_1"],
    });
    expect(lastAvailable).not.toContain("qa_gift_0");
    expect(lastAvailable).not.toContain("qa_gift_1");
    const held = game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [];
    expect(held).not.toContain("qa_gift_0");
    expect(held).not.toContain("qa_gift_1");
  });

  it("드래프트 픽은 같은 스테이지 다른 좌석의 오퍼를 예약분으로 넘긴다", () => {
    const game = createStandardGame({ seed: 9001, extraAugments: extras });
    const draft = new DraftController(game.engine, game.augments, {
      yaku: game.yaku,
      catalog: game.augments,
    });
    // 다른 좌석에 이번 스테이지에 제시된 카드들
    const othersOffer = new Set<string>();
    for (const p of ["p1", "p2", "p3"] as PlayerId[]) {
      const { choices, rerolls } = draft.rollWithRerolls("gameStart", p);
      for (const d of [...choices, ...rerolls]) othersOffer.add(d.id);
    }
    const mine = draft.rollWithRerolls("gameStart", "p0").choices[0];
    expect(mine).toBeDefined();
    draft.pick("gameStart", "p0", (mine as AugmentDef).id);
    const held = game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [];
    // 픽 자체를 뺀 나머지(=지급분)는 남의 오퍼와 절대 겹치지 않는다
    for (const id of held.slice(1)) expect(othersOffer.has(id)).toBe(false);
  });
});

describe("rebuildAugments — 지급이 낀 게임의 설치 순서", () => {
  it("재구성이 원본과 같은 순서로 설치한다", () => {
    const game = newGame();
    // p0: 화수분(→ 선물 2장 즉시 지급), p1·p2: 평범한 한 장씩 — 스테이지 순서를 흉내낸다
    installAugment(game.engine, granter, "p0", { yaku: game.yaku, catalog: game.augments });
    installAugment(game.engine, gifts[3] as AugmentDef, "p1", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    game.engine.state.players = game.engine.state.players.map((p) =>
      p.id === "p1" ? { ...p, augments: [...p.augments, "qa_gift_3"] } : p,
    );
    const original = [...installOrder];
    expect(original.filter((s) => s.includes("qa_gift")).length).toBeGreaterThan(0);
    // 지급분이 화수분보다 **먼저** 등록된다 (원본의 인터리브)
    expect(original.indexOf("aug:p0:qa_granter")).toBe(original.length - 2);

    installOrder = [];
    const replay = createStandardGameFromState(
      structuredClone(game.engine.state),
      undefined,
      extras,
    );
    rebuildAugments(replay.engine, replay.augments, {
      yaku: replay.yaku,
      catalog: replay.augments,
    });
    expect(installOrder).toEqual(original);
  });

  it("재구성이 지급분을 두 번 설치하지 않는다", () => {
    const game = newGame();
    installAugment(game.engine, granter, "p0", { yaku: game.yaku, catalog: game.augments });
    const before = [...(game.engine.state.players.find((p) => p.id === "p0")?.augments ?? [])];
    installOrder = [];
    const replay = createStandardGameFromState(
      structuredClone(game.engine.state),
      undefined,
      extras,
    );
    rebuildAugments(replay.engine, replay.augments, {
      yaku: replay.yaku,
      catalog: replay.augments,
    });
    expect(new Set(installOrder).size).toBe(installOrder.length);
    expect(replay.engine.state.players.find((p) => p.id === "p0")?.augments).toEqual(before);
  });
});
