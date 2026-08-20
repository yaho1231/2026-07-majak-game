/**
 * information 그룹 증강 테스트 — 투시·영상 정찰·안개 바닥·역만 방어술.
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
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type {
  FlowStatus,
  GameState,
  PlayerId,
  PlayerView,
  TileId,
  ZoneView,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { xrayHand } from "../src/augments/xray_hand.js";
import { uraPeek } from "../src/augments/ura_peek.js";
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
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    // 액티브 액션 validate가 player.augments를 확인하므로 보유 증강으로 등록한다
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: [...p.augments, "xray_hand"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, xrayHand, "p0", { yaku: game.yaku });
    return game;
  }

  it("발동 후 보유자 뷰: 상대 세 명의 손패가 전부 공개된다 (hiddenCount 0)", () => {
    const game = setup();
    // 액티브 재설계 — 자기 턴에 발동해야 그 국 동안 공개된다
    const res = game.engine.submit({ player: "p0", type: "xray_reveal", payload: {} });
    expect(res.ok).toBe(true);
    const st = game.engine.state;
    const view = buildPlayerView(st, "p0", game.engine.rules);

    for (const opp of ["p1", "p2", "p3"] as PlayerId[]) {
      const zone = zoneOf(view, handZone(opp));
      const full = st.zones[handZone(opp)]?.tileIds ?? [];
      expect(zone.tileIds).toEqual(full);
      expect(zone.hiddenCount).toBe(0);
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

  it("보유자 뷰: 다음 영상패(왕패 맨 앞 1장) 공개, 나머지는 장수만", () => {
    const game = setup();
    const st = game.engine.state;
    const view = buildPlayerView(st, "p0", game.engine.rules);
    const zone = zoneOf(view, DEAD_WALL);

    // sys.drawRinshan은 항상 deadWall[0]을 뽑으므로 맨 앞 1장만이 정확한 다음 영상패다.
    expect(zone.tileIds).toEqual(
      (st.zones[DEAD_WALL]?.tileIds ?? []).slice(0, 1),
    );
    expect(zone.tileIds).toHaveLength(1);
    expect(zone.hiddenCount).toBe(13); // 왕패 14장 중 1장만 공개
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

describe("hidden_river — 안개 바닥", () => {
  // 52차 후속(사용자 피드백): 상시 패시브 → **선언하는 액티브**.
  // (2026-08-15: 게임 1회·게임 끝까지 → 동풍전 1·반장전 2회·그 국 동안. 플래그가 국 스코프다.)
  // 선언(declare_fog) 전에는 바닥이 정상적으로 보이므로, 테스트도 선언 상태를 만들어야 한다.
  function setup(declared = true) {
    const state = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      // p0 바닥은 8장(+lastDiscard 1장) — 최근 6장만 남고 앞이 가려지는지 본다
      discards: { p0: "1z2z3z4z5z6z7z1m", p1: "9m" },
      phase: "reaction",
      turnSeat: 0,
      lastDiscard: { player: "p0", spec: "5s" },
    });
    const game = createStandardGameFromState(
      declared
        ? {
            ...state,
            augmentData: {
              ...state.augmentData,
              [`hidden_river:fog:${roundKey(state)}:p0#round`]: true,
            },
          }
        : state,
    );
    installAugment(game.engine, hiddenRiver, "p0", { yaku: game.yaku });
    return game;
  }

  it("선언하기 전에는 바닥이 정상적으로 보인다", () => {
    const game = setup(false);
    const view = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    const river = zoneOf(view, discardsZone("p0"));
    expect(river.tileIds.length).toBeGreaterThan(0);
    expect(river.hiddenCount).toBe(0);
  });

  it("타인 뷰: 최근 6장만 보이고 그 앞은 장수만 남는다", () => {
    const game = setup();
    const st = game.engine.state;
    const view = buildPlayerView(st, "p1", game.engine.rules);

    // 보유자(p0)의 바닥 9장 중 뒤 6장만 공개, 앞 3장은 장수만
    const river = zoneOf(view, discardsZone("p0"));
    expect(river.tileIds).toHaveLength(6);
    expect(river.hiddenCount).toBe(3);

    // 마지막 버림패는 그 6장에 들어 있다 (론·후로 판정 가능)
    const lastId = st.round.lastDiscard?.tileId as TileId;
    expect(view.round.lastDiscard?.tileId).toBe(lastId);
    expect(view.tiles[lastId]).toBeDefined();
    expect(river.tileIds).toContain(lastId);
  });

  it("보유자 본인 뷰: 네 사람의 바닥이 전부 그대로 보인다", () => {
    const game = setup();
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const mine = zoneOf(view, discardsZone("p0"));
    expect(mine.tileIds).toHaveLength(9);
    expect(mine.hiddenCount).toBe(0);
    const theirs = zoneOf(view, discardsZone("p1"));
    expect(theirs.tileIds).toHaveLength(1);
    expect(theirs.hiddenCount).toBe(0);
  });
});

describe("ura_peek — 이면투시", () => {
  const URA_VIEW_KEY = "view:p0:ura#round";

  function setup() {
    const state = craft({
      hands: { p0: "1111m456m789m123p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState({
      ...state,
      players: state.players.map((p) =>
        p.id === "p0" ? { ...p, augments: [...p.augments, "ura_peek"] } : p,
      ),
    });
    installAugment(game.engine, uraPeek, "p0", { yaku: game.yaku });
    return game;
  }

  /** 직전 status에서 p0의 안깡(1만 4장) 옵션을 찾아 그대로 제출한다 */
  function ankan(flow: FlowController, status: FlowStatus): void {
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((pr) => pr.player === "p0");
    const option = prompt?.options.find((o) => o.type === "ankan");
    if (option === undefined) throw new Error("ankan option not offered");
    flow.submit("p0", option);
  }

  const uraKinds = (game: ReturnType<typeof createStandardGameFromState>) =>
    uraIndicatorIds(game.engine.state).map((id) =>
      kindKey(kindOf(game.engine.state, id)),
    );

  it("발동 후 깡으로 도라가 늘면 새 뒷도라도 함께 보인다", () => {
    const game = setup();
    const flow = new FlowController(game.engine);
    flow.begin();

    const afterPeek = flow.submit("p0", {
      type: "ura_peek_reveal",
      payload: {},
    });
    const first = game.engine.state.augmentData[URA_VIEW_KEY];
    expect(first).toEqual(uraKinds(game));
    expect(first).toHaveLength(1);

    // 안깡 → 새 도라 표시패가 뒤집힌다
    ankan(flow, afterPeek);
    expect(game.engine.state.round.doraIndicators).toHaveLength(2);

    // 새로 생긴 뒷도라까지 보유자 뷰 채널에 반영된다
    const after = game.engine.state.augmentData[URA_VIEW_KEY];
    expect(after).toEqual(uraKinds(game));
    expect(after).toHaveLength(2);
  });

  it("발동하지 않았다면 깡이 나도 아무것도 보이지 않는다", () => {
    const game = setup();
    const flow = new FlowController(game.engine);
    ankan(flow, flow.begin());
    expect(game.engine.state.round.doraIndicators).toHaveLength(2);
    expect(game.engine.state.augmentData[URA_VIEW_KEY]).toBeUndefined();
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
