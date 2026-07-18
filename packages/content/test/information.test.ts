/**
 * information 그룹 증강 테스트 — 투시·영상 정찰·안개 강·역만 방어술.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
} from "@majak/core";
import type { PlayerId, PlayerView, TileId, ZoneView } from "@majak/core";
import { craft } from "./helpers.js";
import { xrayHand } from "../src/augments/xray_hand.js";
import { rinshanPreview } from "../src/augments/rinshan_preview.js";
import { hiddenRiver } from "../src/augments/hidden_river.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";

/** 뷰에서 Zone을 꺼낸다 (없으면 즉시 실패) */
function zoneOf(view: PlayerView, zoneId: string): ZoneView {
  const z = view.zones[zoneId];
  if (z === undefined) throw new Error(`Zone not in view: ${zoneId}`);
  return z;
}

describe("xray_hand — 투시", () => {
  function setup() {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, xrayHand, "p0", { yaku: game.yaku });
    return game;
  }

  it("보유자 뷰: 상대 손패 앞 3장 공개 + hiddenCount 10", () => {
    const game = setup();
    const st = game.engine.state;
    const view = buildPlayerView(st, "p0", game.engine.rules);

    for (const opp of ["p1", "p2", "p3"] as PlayerId[]) {
      const zone = zoneOf(view, handZone(opp));
      expect(zone.tileIds).toEqual(
        (st.zones[handZone(opp)]?.tileIds ?? []).slice(0, 3),
      );
      expect(zone.tileIds).toHaveLength(3);
      expect(zone.hiddenCount).toBe(10);
      // 공개된 패는 메타데이터(kind)도 함께 온다
      for (const id of zone.tileIds) expect(view.tiles[id]).toBeDefined();
    }
    // 본인 손패는 기존대로 전체 공개
    expect(zoneOf(view, handZone("p0")).tileIds).toHaveLength(13);
    expect(zoneOf(view, handZone("p0")).hiddenCount).toBe(0);
  });

  it("타인 뷰: 기존대로 손패 전체 비공개 (보유자 손패 포함)", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);

    for (const other of ["p0", "p2", "p3"] as PlayerId[]) {
      const zone = zoneOf(view, handZone(other));
      expect(zone.tileIds).toHaveLength(0);
      expect(zone.hiddenCount).toBe(13);
    }
    expect(zoneOf(view, handZone("p1")).tileIds).toHaveLength(13);
  });
});

describe("rinshan_preview — 영상 정찰", () => {
  function setup() {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, rinshanPreview, "p0", { yaku: game.yaku });
    return game;
  }

  it("보유자 뷰: 왕패 앞 4장(영상패) 공개, 나머지는 장수만", () => {
    const game = setup();
    const st = game.engine.state;
    const view = buildPlayerView(st, "p0", game.engine.rules);
    const zone = zoneOf(view, DEAD_WALL);

    expect(zone.tileIds).toEqual(
      (st.zones[DEAD_WALL]?.tileIds ?? []).slice(0, 4),
    );
    expect(zone.tileIds).toHaveLength(4);
    expect(zone.hiddenCount).toBe(10); // 왕패 14장 중 4장만 공개
    for (const id of zone.tileIds) expect(view.tiles[id]).toBeDefined();
  });

  it("타인 뷰: 왕패는 기존대로 전부 비공개", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    const zone = zoneOf(view, DEAD_WALL);
    expect(zone.tileIds).toHaveLength(0);
    expect(zone.hiddenCount).toBe(14);
  });
});

describe("hidden_river — 안개 강", () => {
  function setup() {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z", p1: "9m" },
      phase: "reaction",
      turnSeat: 0,
      lastDiscard: { player: "p0", spec: "5s" },
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, hiddenRiver, "p0", { yaku: game.yaku });
    return game;
  }

  it("타인 뷰: 보유자의 강은 장수만 보이고, 마지막 버림패는 반응 판정용으로 보인다", () => {
    const game = setup();
    const st = game.engine.state;
    const view = buildPlayerView(st, "p1", game.engine.rules);

    // 보유자(p0)의 강: 내용 비공개, 장수(3장)만
    const river = zoneOf(view, discardsZone("p0"));
    expect(river.tileIds).toHaveLength(0);
    expect(river.hiddenCount).toBe(3);

    // 마지막 버림패는 lastDiscard 채널로 노출 (론·부로 판정 가능)
    const lastId = st.round.lastDiscard?.tileId as TileId;
    expect(view.round.lastDiscard?.tileId).toBe(lastId);
    expect(view.tiles[lastId]).toBeDefined();

    // 다른 플레이어(p1)의 강은 기존대로 공개
    const otherRiver = zoneOf(view, discardsZone("p1"));
    expect(otherRiver.tileIds).toHaveLength(1);
    expect(otherRiver.hiddenCount).toBe(0);
  });

  it("보유자 본인 뷰: 자기 강은 그대로 전체 공개", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const river = zoneOf(view, discardsZone("p0"));
    expect(river.tileIds).toHaveLength(3);
    expect(river.hiddenCount).toBe(0);
  });
});

describe("yakuman_shield — 역만 방어술", () => {
  /** 쯔모패 버림 → 타가 전원 패스 → winner 론 */
  function runRon(
    game: ReturnType<typeof createStandardGameFromState>,
    discarder: PlayerId,
    winner: PlayerId,
  ): void {
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    status = flow.submit(discarder, { type: "discard", payload: { tileId: drawn } });
    if (status.kind !== "awaiting") throw new Error("expected reaction");
    for (const prompt of status.prompts) {
      if (prompt.player === winner) continue;
      flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    flow.submit(winner, { type: "win", payload: {} });
  }

  it("역만 방총: 잃을 점수를 돌려받고, 화료자 이득이 같은 만큼 줄어든다 (제로섬)", () => {
    // p0(친)가 1z를 버려 p1의 국사무쌍(역만)에 방총
    const state = craft({
      hands: {
        p0: "2358m2358p2358s1z", // 마지막 1z가 쯔모패 → 그대로 방총
        p1: "19m19p19s1234567z", // 국사무쌍 13면 대기
        p2: "147m147p147s2233z",
        p3: "258m369p258s4455z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const baseline = createStandardGameFromState(state);
    const withAug = createStandardGameFromState(structuredClone(state));
    installAugment(withAug.engine, yakumanShield, "p0", { yaku: withAug.yaku });

    runRon(baseline, "p0", "p1");
    runRon(withAug, "p0", "p1");

    // 기준선: 역만 방총으로 크게 잃는다
    const baseP0 = baseline.engine.state.players[0]?.score ?? 0;
    expect(baseP0).toBeLessThan(25000);

    // 증강: 잃을 점수 전액(=역만 점수)이 환급되고, 화료자 이득도 같은 만큼 감소
    const augP0 = withAug.engine.state.players[0]?.score ?? 0;
    const augP1 = withAug.engine.state.players[1]?.score ?? 0;
    expect(augP0).toBe(25000);
    expect(augP1).toBe(25000);
    // 제로섬 유지: 총점 보존
    const total =
      withAug.engine.state.players.reduce((s, p) => s + p.score, 0) +
      withAug.engine.state.round.riichiPot;
    expect(total).toBe(100000);
  });

  it("역만이 아닌 방총에는 발동하지 않는다", () => {
    // p0가 p1의 5s 단기 탕야오(일반역)에 방총 — 증강 유무와 실점이 같아야 한다
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s", // 마지막 5s가 쯔모패 → 그대로 방총
        p1: "234m345p345s678s5s", // 5s 단기 탕야오
        p2: "147m147p147s2233z",
        p3: "258m369p258s4455z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const baseline = createStandardGameFromState(state);
    const withAug = createStandardGameFromState(structuredClone(state));
    installAugment(withAug.engine, yakumanShield, "p0", { yaku: withAug.yaku });

    runRon(baseline, "p0", "p1");
    runRon(withAug, "p0", "p1");

    const baseP0 = baseline.engine.state.players[0]?.score ?? 0;
    const augP0 = withAug.engine.state.players[0]?.score ?? 0;
    expect(baseP0).toBeLessThan(25000); // 실제로 잃었고
    expect(augP0).toBe(baseP0); // 환급은 없다
  });
});
