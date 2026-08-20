/**
 * 정보·뷰 계열 QA 회귀 (2026-08-20).
 *
 * qa-lab의 재현 스크립트를 그대로 테스트로 옮긴 것들이다. 전부 "화면이 사실과 다르게
 * 말한다"는 한 부류다 — 게임은 죽지 않고 점수도 맞는데, 플레이어가 읽는 정보가 틀린다.
 *
 *  1. `danger_sense` × `iron_wall`  — 후리텐을 무시하고 론하는 상대를 "안전"으로 칠했다
 *  2. `danger_sense` 무역 텐파이     — 론 자체가 불가능한 대기를 위험으로 칠했다
 *  3. `discard_recall`              — 내 바닥에 놓인 패가 후리텐 이력에 안 남았다
 *  4. `hidden_river` × `hidden_river` — 둘이 걸면 선언한 보유자마저 안개에 갇혔다
 *  5. `discard_lock`                — 채널 이름 변경으로 코어 노출 루프가 끊겼다
 *  6. `mirror_dora`                 — 표시패가 교체되면 낡은 앞도라를 계속 광고했다
 *  7. `triple_peek` × `future_sight` — 패산을 직접 옮기는 증강에 예고가 어긋난 채 남았다
 *  8. `PlayerView.riichiBlocked`    — 공탁 면제 리치 보유자에게 "점수 부족"이라 거짓말했다
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  buildPlayerView,
  createStandardGameFromState,
  doraIndicatorIndex,
  frontDoraKindFor,
  handIdsOf,
  installAugment,
  kindKey,
  nextSeat,
  playerAtSeat,
  standardAugments,
} from "@majak/core";
import type {
  AugmentDef,
  FlowStatus,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { craft } from "./helpers.js";
import { dangerSense } from "../src/augments/danger_sense.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { discardLock } from "../src/augments/discard_lock.js";
import { futureSight } from "../src/augments/future_sight.js";
import { hiddenRiver } from "../src/augments/hidden_river.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { noRetreat } from "../src/augments/no_retreat.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { triplePeek } from "../src/augments/triple_peek.js";
import { roundKey } from "../src/util.js";

const ironWall = standardAugments.find((a) => a.id === "iron_wall") as AugmentDef;
const discardRecall = standardAugments.find(
  (a) => a.id === "discard_recall",
) as AugmentDef;

const MAN3 = kindKey({ suit: "man", rank: 3 });
const SOU2 = kindKey({ suit: "sou", rank: 2 });
const PIN3 = kindKey({ suit: "pin", rank: 3 });

function give(state: GameState, player: PlayerId, id: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

function kindAt(state: GameState, id: TileId): string {
  return kindKey(state.tiles[id]!.kind);
}

/** 프롬프트에서 특정 좌석의 옵션 타입 목록 */
function optionTypes(status: FlowStatus, player: PlayerId): string[] {
  if (status.kind !== "awaiting") return [];
  return (status.prompts.find((p) => p.player === player)?.options ?? []).map(
    (o) => o.type,
  );
}

// ───────────────────────── 1·2. 지뢰 탐지 ─────────────────────────

describe("지뢰 탐지 — '실제로 쏘이는가'가 기준이다", () => {
  const VIEW = "view:p0:danger_sense#round";

  /** p1은 3m 탄키 텐파이. furiten이면 3m을 이미 버려 뒀고, iron이면 철벽을 든다. */
  function scene(furiten: boolean, iron: boolean): GameState {
    let s = craft({
      hands: {
        p0: "3m123p456p789p11s7z7z",
        p1: "123m456m789m123p3m",
        p2: "159m159p159s1234z",
        p3: "147m147p147s1234z",
      },
      ...(furiten ? { discards: { p1: "3m" } } : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = give(s, "p0", "danger_sense");
    if (iron) s = give(s, "p1", "iron_wall");
    return s;
  }

  function scan(furiten: boolean, iron: boolean): {
    kinds: string[];
    flow: FlowController;
    game: ReturnType<typeof createStandardGameFromState>;
  } {
    const game = createStandardGameFromState(scene(furiten, iron));
    installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
    if (iron) installAugment(game.engine, ironWall, "p1", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "danger_sense_use", payload: {} });
    const v = game.engine.state.augmentData[VIEW] as { kinds: string[] };
    return { kinds: v.kinds, flow, game };
  }

  it("평범한 텐파이 상대의 대기는 위험으로 잡는다", () => {
    expect(scan(false, false).kinds).toContain(MAN3);
  });

  it("후리텐이라 론이 막힌 상대의 대기는 빠진다 (오탐 방지)", () => {
    expect(scan(true, false).kinds).not.toContain(MAN3);
  });

  it("철벽 보유자는 후리텐이어도 론하므로 위험으로 잡는다 (거짓 안전 금지)", () => {
    const { kinds, flow, game } = scan(true, true);
    expect(kinds).toContain(MAN3);
    // 실제로 그 패를 던지면 론이 열린다 — 표시와 엔진이 같은 답을 낸다
    const st = game.engine.state;
    const m3 = handIdsOf(st, "p0").find((t) => kindAt(st, t) === MAN3) as TileId;
    const after = flow.submit("p0", { type: "discard", payload: { tileId: m3 } });
    expect(optionTypes(after, "p1")).toContain("win");
  });

  it("역이 없어 론 자체가 불가능한 후로 텐파이의 대기는 빠진다", () => {
    let s = craft({
      hands: {
        p0: "2s119m119p117z34s",
        p1: "123m456p55s34s", // 후로 1개 + 2s/5s 대기, 역 없음
        p2: "*",
        p3: "*",
      },
      melds: { p1: [{ kind: "chi", spec: "789m", from: "p0" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = give(s, "p0", "danger_sense");
    const game = createStandardGameFromState(s);
    installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "danger_sense_use", payload: {} });
    const kinds = (game.engine.state.augmentData[VIEW] as { kinds: string[] }).kinds;
    expect(kinds).not.toContain(SOU2);

    // 실제로 던져도 론은 안 열린다 — 표시와 엔진이 같은 답을 낸다
    const st = game.engine.state;
    const two = handIdsOf(st, "p0").find((t) => kindAt(st, t) === SOU2) as TileId;
    const after = flow.submit("p0", { type: "discard", payload: { tileId: two } });
    expect(optionTypes(after, "p1")).not.toContain("win");
  });
});

// ───────────────────────── 3. 회수 ─────────────────────────

describe("회수 — 내 바닥으로 내보낸 패는 후리텐 이력에 남는다", () => {
  function scene(): GameState {
    const s = craft({
      hands: {
        p0: "3p111m222m333m44m5s",
        p1: "123m456m789m12p99s3p", // 14장, 마지막 3p = 이번 쯔모패(= 내 오름패)
        p2: "*",
        p3: "*",
      },
      discards: { p1: "1z" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    return give(s, "p1", "discard_recall");
  }

  it("회수로 내보낸 쯔모패가 discardedKinds에 새겨지고, 그 패로 론할 수 없다", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, discardRecall, "p1", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const begun = flow.begin();
    if (begun.kind !== "awaiting") throw new Error("expected awaiting");
    const opt = begun.prompts
      .find((p) => p.player === "p1")!
      .options.find((o) => o.type === "recall")!;
    let cur = flow.submit("p1", opt);

    const s1 = game.engine.state;
    expect(s1.round.byPlayer["p1"]!.discardedKinds).toContain(PIN3);

    // 되가져온 패를 다시 버리고 p0가 3p를 버릴 때까지 진행한다
    const back = s1.round.lastDrawnTile as TileId;
    cur = flow.submit("p1", { type: "discard", payload: { tileId: back } });
    for (const p of cur.kind === "awaiting" ? cur.prompts : []) {
      const pass = p.options.find((o) => o.type === "pass");
      if (pass !== undefined) cur = flow.submit(p.player, pass);
    }
    let guard = 0;
    while (cur.kind === "awaiting" && guard++ < 20) {
      const p = cur.prompts[0]!;
      const st = game.engine.state;
      if (p.player === "p0") {
        const three = handIdsOf(st, "p0").find((t) => kindAt(st, t) === PIN3);
        if (
          three !== undefined &&
          p.options.some(
            (o) =>
              o.type === "discard" &&
              (o.payload as { tileId?: TileId }).tileId === three,
          )
        ) {
          cur = flow.submit("p0", { type: "discard", payload: { tileId: three } });
          break;
        }
      }
      const d =
        p.options.find((o) => o.type === "discard") ??
        p.options.find((o) => o.type === "pass") ??
        p.options[0]!;
      cur = flow.submit(p.player, d);
    }
    expect(optionTypes(cur, "p1")).not.toContain("win");
  });
});

// ───────────────────────── 4. 안개 덮인 바닥 ─────────────────────────

describe("안개 덮인 바닥 — 안개를 건 사람은 네 바닥을 그대로 읽는다", () => {
  function probe(holders: PlayerId[], declared: PlayerId[]): (v: PlayerId) => unknown {
    let s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    for (const h of holders) s = give(s, h, "hidden_river");
    const rk = roundKey(s);
    const data: Record<string, unknown> = {};
    for (const h of declared) data[`hidden_river:fog:${rk}:${h}`] = true;
    s = { ...s, augmentData: { ...s.augmentData, ...data } };
    const game = createStandardGameFromState(s);
    for (const h of holders) {
      installAugment(game.engine, hiddenRiver, h, { yaku: game.yaku });
    }
    return (viewer: PlayerId) =>
      game.engine.rules.resolve("visibility.discards", {
        playerId: viewer,
        state: game.engine.state,
        zoneOwner: "p2",
      });
  }

  it("혼자 걸면 보유자만 그대로 보고 나머지는 최근 6장만 본다", () => {
    const see = probe(["p0"], ["p0"]);
    expect(see("p0")).toBe("public");
    expect(see("p1")).toEqual({ mode: "peek", count: 6, pick: "back" });
  });

  it("둘이 각자 걸어도 두 선언자는 모두 그대로 읽는다", () => {
    const see = probe(["p0", "p1"], ["p0", "p1"]);
    expect(see("p0")).toBe("public");
    expect(see("p1")).toBe("public");
    expect(see("p3")).toEqual({ mode: "peek", count: 6, pick: "back" });
  });

  it("보유만 하고 아직 선언하지 않았으면 남의 안개에 그대로 갇힌다", () => {
    const see = probe(["p0", "p1"], ["p0"]);
    expect(see("p1")).toEqual({ mode: "peek", count: 6, pick: "back" });
  });
});

// ───────────────────────── 5. 봉인술사 ─────────────────────────

describe("봉인술사 — 보유자 뷰에 봉인된 '실제 패'가 실린다", () => {
  it("discardLockReveal 채널의 tileId가 view.tiles에 그대로 들어온다", () => {
    let s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = give(s, "p0", "discard_lock");
    const game = createStandardGameFromState(s);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "seal_hands", payload: {} });

    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const channels = Object.entries(view.augmentView).filter(([k]) =>
      k.startsWith("discardLockReveal:"),
    );
    expect(channels.length).toBeGreaterThan(0);
    for (const [, value] of channels) {
      const ids = (value as unknown[]).filter((x): x is number => typeof x === "number");
      expect(ids.length).toBeGreaterThan(0);
      // 채널에 실린 모든 tileId가 '진짜 패'로 그려질 수 있어야 한다 (적도라 속성 포함)
      expect(ids.filter((id) => view.tiles[id] !== undefined)).toEqual(ids);
    }
    // 비보유자에게는 채널 자체가 가지 않는다 (노출 경로를 넓히면서 새면 안 된다)
    const other = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(
      Object.keys(other.augmentView).filter((k) => k.startsWith("discardLockReveal:")),
    ).toEqual([]);
  });
});

// ───────────────────────── 6. 거울의 도라 ─────────────────────────

describe("거울의 도라 — 표시패가 교체되면 공개 채널이 따라간다", () => {
  const CH = "view:*:mirror_dora:p0#round";

  it("왕패의 주인이 표시패를 손패와 맞바꿔도 채널이 새 앞도라를 말한다", () => {
    let s = craft({
      hands: { p0: "*", p1: "123m456m789m123s5p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    // 표시패 자리를 8s로 고정 — 표준 도라 9s, 거울의 앞도라 7s
    const indicatorId = s.zones[DEAD_WALL]!.tileIds[4] as TileId;
    const eightSou: TileKind = { suit: "sou", rank: 8 };
    s = {
      ...s,
      tiles: { ...s.tiles, [indicatorId]: { ...s.tiles[indicatorId]!, kind: eightSou } },
    };
    s = give(s, "p0", "mirror_dora");
    s = give(s, "p1", "dead_wall_master");
    // 국 시작 공개를 흉내낸다 (실게임에서는 ROUND_STARTED 시점에 채널이 채워진다).
    // 이 값이 교체 뒤에도 그대로 남아 있던 것이 원래 버그다.
    s = {
      ...s,
      augmentData: {
        ...s.augmentData,
        [CH]: s.round.doraIndicators.map((t) =>
          kindKey(frontDoraKindFor(s.tiles[t]!.kind)),
        ),
      },
    };

    const game = createStandardGameFromState(s);
    installAugment(game.engine, mirrorDora, "p0", { yaku: game.yaku });
    installAugment(game.engine, deadWallMaster, "p1", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();

    const expected = (st: GameState): string[] =>
      st.round.doraIndicators.map((t) => kindKey(frontDoraKindFor(st.tiles[t]!.kind)));

    expect(game.engine.state.augmentData[CH]).toEqual(expected(game.engine.state));

    const before = game.engine.state;
    const idx = doraIndicatorIndex(before, 0);
    const mine = handIdsOf(before, "p1").find(
      (id) => kindAt(before, id) === "pin5",
    ) as TileId;
    flow.submit("p1", { type: "dw_swap", payload: { handTileId: mine, deadIndex: idx } });

    const after = game.engine.state;
    expect(expected(after)).not.toEqual(expected(before)); // 표시패가 실제로 바뀌었다
    expect(after.augmentData[CH]).toEqual(expected(after));
  });
});

// ───────────────────────── 7. 삼세 예지 ─────────────────────────

describe("삼세 예지 — 패산을 직접 옮기는 증강이 껴도 예고가 어긋나지 않는다", () => {
  const CH = "view:p0:triple_peek#round";

  /** 증강 자신의 알고리즘을 테스트에서 독립적으로 다시 계산한다 */
  function recompute(state: GameState, holder: PlayerId): string[] {
    const wall = state.zones[WALL]?.tileIds ?? [];
    let seat =
      state.round.phase === "turn.draw"
        ? state.round.turnSeat
        : nextSeat(state, state.round.turnSeat, 1);
    const kinds: string[] = [];
    for (let i = 0; i < wall.length && kinds.length < 3; i++) {
      const tileId = wall[i];
      if (tileId !== undefined && playerAtSeat(state, seat).id === holder) {
        kinds.push(kindAt(state, tileId));
      }
      seat = nextSeat(state, seat, 1);
    }
    return kinds;
  }

  it("미래를 보는 자의 패산 교환 직후 예고가 다시 계산된다", () => {
    let s = craft({
      hands: { p0: "123m456m789m123p5p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = give(s, "p0", "triple_peek");
    s = give(s, "p0", "future_sight");
    const game = createStandardGameFromState(s);
    installAugment(game.engine, triplePeek, "p0", { yaku: game.yaku });
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    flow.begin();

    flow.submit("p0", { type: "triple_peek_use", payload: {} });
    const armed = game.engine.state.augmentData[CH] as string[];
    expect(armed).toEqual(recompute(game.engine.state, "p0"));
    expect(armed).toHaveLength(3);

    // 무장하면 그 자리에서 교환 후보(무작위 3장)가 프롬프트에 뜬다
    const armedStatus = flow.submit("p0", { type: "future_arm", payload: {} });
    const opts =
      armedStatus.kind === "awaiting"
        ? (armedStatus.prompts.find((p) => p.player === "p0")?.options ?? [])
        : [];
    const pick = opts.find((o) => o.type === "future_exchange");
    expect(pick).toBeDefined();
    flow.submit("p0", pick!);

    const after = game.engine.state;
    // 패산이 실제로 움직였고(3장 소비 + 2장 바닥으로), 예고가 그에 맞게 갱신됐다
    expect(after.augmentData[CH]).toEqual(recompute(after, "p0"));
    expect(after.augmentData[CH]).not.toEqual(armed);
  });
});

// ───────────────────────── 8. riichiBlocked ─────────────────────────

describe("PlayerView.riichiBlocked — 공탁 면제 리치에는 '점수 부족'을 띄우지 않는다", () => {
  function scene(aug: string, score: number): GameState {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: [aug], score } : p,
      ),
    };
  }

  for (const [name, def, action] of [
    ["stealth_riichi", stealthRiichi, "stealth_riichi"],
    ["no_retreat", noRetreat, "no_retreat_riichi"],
  ] as [string, AugmentDef, string][]) {
    it(`${name} 보유자는 500점이어도 '점수 부족'이 뜨지 않는다`, () => {
      const game = createStandardGameFromState(scene(name, 500));
      installAugment(game.engine, def, "p0", { yaku: game.yaku });
      const flow = new FlowController(game.engine);
      const status = flow.begin();
      // 전제: 그 증강의 리치 후보는 실제로 열려 있다
      expect(optionTypes(status, "p0")).toContain(action);
      const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
      expect(view.round.byPlayer["p0"]?.riichiBlocked).toBeUndefined();
    });
  }

  it("공탁 면제 리치가 없는 평범한 좌석에는 그대로 '점수 부족'이 뜬다", () => {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const s: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === "p0" ? { ...p, score: 500 } : p)),
    };
    const game = createStandardGameFromState(s);
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    expect(view.round.byPlayer["p0"]?.riichiBlocked).toBe("notEnoughPoints");
  });
});
