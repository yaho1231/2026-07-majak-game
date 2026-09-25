/**
 * 보유자 전용 미리보기 채널 4종 (2026-09-25, docs/59 B18 — U42·U28·U09·U61).
 *
 * 화면만으로는 보여 줄 수 없는 정보를 content가 **보유자에게만** 싣는다:
 *  - 귀환 `honor_return:preview:{holder}` — 지금 누르면 다음 국 배패로 돌아올 자패.
 *    버림 **이력** 기준이라(남이 울어 간 자패 포함·누명으로 흘린 자패 포함) 바닥만 보는
 *    화면은 다시 셀 수 없다. 미리보기 = 실제 기록이어야 한다.
 *  - 카피 `copy:pool:{holder}` — 상대별 가져올 수 있는 액티브 수.
 *  - 등가교환 `hand_swap3:gives:{holder}` — take 단계에서 보여 줄 «넘길 3장».
 *  - 짝수의 세계 `even_world:preview:{holder}` — `{tileId: 바뀔 kindKey}`.
 *
 * 공통 계약:
 *  1. 보유자 뷰에만 실린다 — 다른 좌석 뷰에는 없다(의도·손패 누설 금지).
 *  2. `reaction("*")` 채널은 값이 같으면 다시 내지 않는다(리플레이 이벤트가 늘지 않는다).
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_DATA_SET,
  SYSTEM_PLAYER,
  augmentDataSet,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDataSetPayload,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import * as C from "../src/index.js";
import { honorReturn } from "../src/augments/honor_return.js";
import { frameUp } from "../src/augments/frame_up.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { evenWorld } from "../src/augments/even_world.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(state: GameState, map: Partial<Record<PlayerId, string[]>>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] === undefined ? p : { ...p, augments: [...(map[p.id] as string[])] },
    ),
  };
}

function start(state: GameState, installs: { def: AugmentDef; holder: PlayerId }[]): Game {
  const game = createStandardGameFromState(state, undefined, C.contentAugments);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

function act(game: Game, player: PlayerId, type: string, payload: unknown): void {
  const res = game.engine.submit({ player, type, payload } as never);
  if (res.ok !== true) throw new Error(`${type} 실패: ${JSON.stringify(res)}`);
}

/** 아무 의미 없는 이벤트 하나 — `reaction("*")`를 한 번 돌린다 */
function tick(game: Game, n = 0): void {
  if (!game.engine.actions.has("__tick")) {
    game.engine.actions.register({
      type: "__tick",
      validate: () => null,
      toEvents: (req) => [augmentDataSet("__tick", (req.payload as { n: number }).n)],
    });
  }
  act(game, "p0", "__tick", { n });
}

/** 이 뷰어가 보는 augmentView */
const viewOf = (game: Game, viewer: PlayerId): Record<string, unknown> =>
  buildPlayerView(game.engine.state, viewer, game.engine.rules).augmentView;

/** 이벤트 로그에서 이 채널(접미 포함 원 키)을 쓴 횟수 */
function writesTo(game: Game, channel: string): number {
  return game.engine.eventLog.filter(
    (e) =>
      e.type === AUGMENT_DATA_SET &&
      (e.payload as AugmentDataSetPayload).key.includes(channel),
  ).length;
}

function findInHand(s: GameState, p: PlayerId, key: string): TileId {
  const id = handIdsOf(s, p).find((t) => kindKey(kindOf(s, t)) === key);
  if (id === undefined) throw new Error(`${p} 손에 ${key} 가 없다`);
  return id;
}

// ─────────────────────────── 귀환 ───────────────────────────

describe("귀환 — 발동 전 미리보기(honor_return:preview)", () => {
  const CH = "honor_return:preview:p0";

  it("남이 울어 간 자패도 미리보기에 들고, 미리보기 = 실제로 기록되는 자패다", () => {
    // p0가 東을 버린 뒤 白을 버렸고, 그 白을 p1이 퐁한다 — p0 바닥에는 東만 남는다
    const base = withAugments(
      craft({
        hands: { p0: "123m456m789m12p3s", p1: "55z123p456p789p1s", p2: "*", p3: "*" },
        discards: { p0: "1z" },
        phase: "reaction",
        turnSeat: 0,
        lastDiscard: { player: "p0", spec: "5z" },
      }),
      { p0: ["honor_return"] },
    );
    const game = start(base, [{ def: honorReturn, holder: "p0" }]);
    const st0 = game.engine.state;
    const whites = handIdsOf(st0, "p1").filter((t) => kindKey(kindOf(st0, t)) === "dragon1");
    act(game, "p1", "pon", { tileIds: whites.slice(0, 2) });

    const st = game.engine.state;
    // 바닥에는 白이 없다 — 화면이 바닥만 보고 세면 東 하나만 나온다
    const pond = (st.zones[discardsZone("p0")]?.tileIds ?? []).map((t) => kindKey(kindOf(st, t)));
    expect(pond).not.toContain("dragon1");
    expect(viewOf(game, "p0")[CH]).toEqual(["dragon1", "wind1"]);

    // 그 순간 발동하면 기록되는 것이 정확히 미리보기다 — p0 순으로 되감아 누른다
    const rewound = start(
      { ...st, round: { ...st.round, phase: "turn.act", turnSeat: 0, lastDiscard: null } },
      [{ def: honorReturn, holder: "p0" }],
    );
    const preview = viewOf(game, "p0")[CH];
    act(rewound, "p0", "honor_recall", {});
    const kept = rewound.engine.state.augmentData["honor_return:keep:p0"] as never[];
    expect(kept.map((k) => kindKey(k))).toEqual(preview);
    // 발동하면 비운다 — 다음 국 대기 중에는 다시 누를 수 없다
    expect(viewOf(rewound, "p0")[CH]).toEqual([]);

    // 다음 국 배패에 실제로 들어오는 것도 같은 목록이다
    const settled = rewound.engine.state;
    const next = start(
      { ...settled, round: { ...settled.round, phase: "round.over" } },
      [{ def: honorReturn, holder: "p0" }],
    );
    act(next, SYSTEM_PLAYER, "sys.startRound", {});
    const ns = next.engine.state;
    const injected = handIdsOf(ns, "p0")
      .filter((t) => ns.tiles[t]?.attrs?.conjured === true)
      .map((t) => kindKey(kindOf(ns, t)));
    expect(injected).toEqual(preview);
  });

  it("누명으로 남의 바닥에 흘린 자패도 내 미리보기에 든다 — 피해자 미리보기에는 없다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "1z123m456m789m12p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1m2m", p1: "9m", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up", "honor_return"], p1: ["honor_return"] },
    );
    const game = start(base, [
      { def: frameUp, holder: "p0" },
      { def: honorReturn, holder: "p0" },
      { def: honorReturn, holder: "p1" },
    ]);
    const east = findInHand(game.engine.state, "p0", "wind1");
    act(game, "p0", "frame_discard", { tileId: east, target: "p1" });
    expect(viewOf(game, "p0")["honor_return:preview:p0"]).toEqual(["wind1"]);
    const victim = viewOf(game, "p1")["honor_return:preview:p1"];
    expect(Array.isArray(victim) ? victim : []).toEqual([]);
  });

  it("쓸 수 없으면(횟수 소진·리치 중) 비어 있다", () => {
    const scene = (patch: (s: GameState) => GameState): Game =>
      start(
        patch(
          withAugments(
            craft({
              hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
              discards: { p0: "3m5z1z" },
              phase: "turn.act",
              turnSeat: 0,
            }),
            { p0: ["honor_return"] },
          ),
        ),
        [{ def: honorReturn, holder: "p0" }],
      );
    const emptyOf = (g: Game): unknown[] => {
      tick(g);
      const v = viewOf(g, "p0")[CH];
      return Array.isArray(v) ? v : [];
    };
    // 대조군 — 쓸 수 있으면 두 장이 보인다
    expect(emptyOf(scene((s) => s))).toEqual(["wind1", "dragon1"]);
    expect(
      emptyOf(
        scene((s) => ({ ...s, augmentData: { ...s.augmentData, "honor_return:uses:p0": 99 } })),
      ),
    ).toEqual([]);
    expect(
      emptyOf(
        scene((s) => ({
          ...s,
          round: {
            ...s.round,
            byPlayer: {
              ...s.round.byPlayer,
              p0: {
                ...s.round.byPlayer["p0"]!,
                riichi: { double: false, ippatsu: false, discardIndex: 0 },
              },
            },
          },
        })),
      ),
    ).toEqual([]);
  });

  it("보유자에게만 간다 · 값이 같으면 다시 내지 않는다", () => {
    const game = start(
      withAugments(
        craft({
          hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
          discards: { p0: "5z" },
          phase: "turn.act",
          turnSeat: 0,
        }),
        { p0: ["honor_return"] },
      ),
      [{ def: honorReturn, holder: "p0" }],
    );
    tick(game, 1);
    expect(viewOf(game, "p0")[CH]).toEqual(["dragon1"]);
    for (const other of ["p1", "p2", "p3"] as const) {
      expect(Object.keys(viewOf(game, other)).some((k) => k.includes("honor_return:preview"))).toBe(
        false,
      );
    }
    const before = writesTo(game, CH);
    tick(game, 2);
    tick(game, 3);
    expect(writesTo(game, CH)).toBe(before);
  });
});

// ─────────────────────────── 카피 ───────────────────────────

describe("카피 — 상대별 후보 수(copy:pool)", () => {
  it("가져올 수 있는 액티브 수를 상대마다 싣고, 보유자에게만 보낸다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "123m456p789s1122z3z", p1: "*", p2: "*", p3: "*" },
        drawnLastFor: "p0",
        phase: "turn.act",
        turnSeat: 0,
      }),
      {
        p0: ["copy"],
        // alchemist·joker는 허용 목록, honor_return은 불가(효과가 다음 국에 난다)
        p1: ["alchemist", "honor_return"],
        p2: ["honor_return"],
        p3: ["alchemist", "joker"],
      },
    );
    const defOf = (id: string): AugmentDef => C.contentAugments.find((a) => a.id === id)!;
    const installs = base.players.flatMap((p) =>
      p.augments.map((id) => ({ def: defOf(id), holder: p.id })),
    );
    const game = start(base, installs);
    tick(game, 1);
    expect(viewOf(game, "p0")["copy:pool:p0"]).toEqual({ p1: 1, p2: 0, p3: 2 });
    for (const other of ["p1", "p2", "p3"] as const) {
      expect(Object.keys(viewOf(game, other)).some((k) => k.startsWith("copy:pool"))).toBe(false);
    }
    // 후보가 0인 상대는 실제로도 지목할 수 없다 — 채널과 validate가 같은 판정을 본다
    const opts = game.engine.turnOptionProviders
      .flatMap((prov) => prov(game.engine.state, "p0"))
      .filter((o) => o.type === "copy_take")
      .map((o) => (o.payload as { target: string }).target);
    expect(opts.sort()).toEqual(["p1", "p3"]);
    // 값이 같으면 다시 내지 않는다
    const before = writesTo(game, "copy:pool:p0");
    tick(game, 2);
    expect(writesTo(game, "copy:pool:p0")).toBe(before);
  });
});

// ─────────────────────────── 등가교환 ───────────────────────────

describe("등가교환 — 넘길 3장(hand_swap3:gives)", () => {
  const CH = "hand_swap3:gives:p0";

  function mk(): Game {
    const s = withAugments(
      craft({
        hands: { p0: "123m456m789m123p99p", p1: "111p222p333s44s55z", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["hand_swap3"] },
    );
    return start(s, [{ def: handSwap3, holder: "p0" }]);
  }
  const sorted3 = (ids: readonly TileId[]): TileId[] => [...ids].sort((a, b) => a - b).slice(0, 3);

  it("give에서 싣고 보유자만 본다 — 교환이 끝나면 비운다", () => {
    const game = mk();
    act(game, "p0", "swap3", { target: "p1" });
    expect(viewOf(game, "p0")[CH]).toBeUndefined();
    const gives = sorted3(handIdsOf(game.engine.state, "p0"));
    act(game, "p0", "swap3_give", { gives });
    expect(viewOf(game, "p0")[CH]).toEqual(gives);
    // 교환 상대에게도, 제3자에게도 가지 않는다 — 넘길 패는 교환 전까지 보유자만 안다
    for (const other of ["p1", "p2", "p3"] as const) {
      expect(Object.keys(viewOf(game, other)).some((k) => k.startsWith("hand_swap3:gives"))).toBe(
        false,
      );
    }
    const takes = sorted3(handIdsOf(game.engine.state, "p1"));
    act(game, "p0", "swap3_take", { takes });
    expect(viewOf(game, "p0")[CH]).toEqual([]);
  });

  it("국이 바뀌면 엔진이 지운다(국 스코프 키)", () => {
    const game = mk();
    act(game, "p0", "swap3", { target: "p1" });
    act(game, "p0", "swap3_give", { gives: sorted3(handIdsOf(game.engine.state, "p0")) });
    const s = game.engine.state;
    const next = start({ ...s, round: { ...s.round, phase: "round.over" } }, [
      { def: handSwap3, holder: "p0" },
    ]);
    act(next, SYSTEM_PLAYER, "sys.startRound", {});
    expect(viewOf(next, "p0")[CH]).toBeUndefined();
  });
});

// ─────────────────────────── 짝수의 세계 ───────────────────────────

describe("짝수의 세계 — 변환 미리보기(even_world:preview)", () => {
  const CH = "even_world:preview:p0";

  function mk(): Game {
    const s = withAugments(
      craft({
        hands: { p0: "1m2m3m9m9p4p5s6s7s11z55z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["even_world"] },
    );
    return start(s, [{ def: evenWorld, holder: "p0" }]);
  }

  it("홀수→짝수·9→8, 짝수·자패는 없다 — 발동 결과와 정확히 같다", () => {
    const game = mk();
    tick(game, 1);
    const preview = viewOf(game, "p0")[CH] as Record<string, string>;
    const st = game.engine.state;
    const before = Object.fromEntries(
      Object.keys(preview).map((id) => [id, kindKey(kindOf(st, Number(id)))]),
    );
    // 1m→2m, 3m→4m, 9m→8m, 9p→8p, 5s→6s, 7s→8s (2m·4p·6s·자패는 그대로)
    expect(Object.values(before).sort()).toEqual(
      ["man1", "man3", "man9", "pin9", "sou5", "sou7"].sort(),
    );
    expect(Object.values(preview).sort()).toEqual(
      ["man2", "man4", "man8", "pin8", "sou6", "sou8"].sort(),
    );
    act(game, "p0", "even_world_flip", {});
    const after = game.engine.state;
    for (const [id, key] of Object.entries(preview)) {
      expect(kindKey(kindOf(after, Number(id)))).toBe(key);
    }
    // 쿨다운에 들면 비운다
    expect(viewOf(game, "p0")[CH]).toEqual({});
  });

  it("결정론 · 보유자 전용 · 값이 같으면 다시 내지 않는다", () => {
    const a = mk();
    const b = mk();
    tick(a, 1);
    tick(b, 1);
    expect(viewOf(a, "p0")[CH]).toEqual(viewOf(b, "p0")[CH]);
    for (const other of ["p1", "p2", "p3"] as const) {
      expect(Object.keys(viewOf(a, other)).some((k) => k.startsWith("even_world:preview"))).toBe(
        false,
      );
    }
    const before = writesTo(a, CH);
    tick(a, 2);
    tick(a, 3);
    expect(writesTo(a, CH)).toBe(before);
  });
});

// ─────────────────────────── 무장해제 ───────────────────────────

/*
 * 잠기면 미리보기를 내리고, **내려간 채로 남는다** (2026-09-25 B18 리뷰 라운드 2).
 *
 * 통보(AUGMENT_DISARMED)는 잠금 목록에 넣기 전에 오므로 그 연쇄 안에서는 각 증강의
 * `reaction("*")`가 아직 살아 있다. 가드가 없으면 `clearViewOnDisarm`이 비운 채널을 그
 * 리액션이 곧바로 다시 싣고, 잠금이 걸린 뒤로는 그 값이 국 끝까지 얼어붙었다 — 보유자
 * pill에 «🔒 무장해제로 이번 국 잠김»과 살아 있는 미리보기 칩이 나란히 떴다.
 * `isDisarmEcho` 가드 한 줄을 지우면 아래 «잠근 직후» 단언이 실패한다.
 */
describe("무장해제 — 잠기면 미리보기 채널을 내리고 되살리지 않는다", () => {
  const cases = [
    { id: "honor_return", ch: "honor_return:preview:p1" },
    { id: "even_world", ch: "even_world:preview:p1" },
    { id: "copy", ch: "copy:pool:p1" },
  ] as const;
  const isEmpty = (v: unknown): boolean =>
    v === undefined ||
    (Array.isArray(v) ? v.length === 0 : Object.keys(v as object).length === 0);

  for (const { id, ch } of cases) {
    it(id, () => {
      const base = withAugments(
        craft({
          hands: { p0: "123m456m789m123p99p", p1: "1m3m5m7m9m1p3p5p7p9p1s3s5s", p2: "*", p3: "*" },
          discards: { p1: "5z1z" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        // p2의 연금술사는 카피가 가져올 후보(0이 아니어야 카피 채널이 비어 있지 않다)
        { p0: ["disarm"], p1: [id], p2: ["alchemist"] },
      );
      const defOf = (aid: string): AugmentDef => C.contentAugments.find((a) => a.id === aid)!;
      const game = start(
        base,
        base.players.flatMap((p) => p.augments.map((aid) => ({ def: defOf(aid), holder: p.id }))),
      );
      tick(game, 1);
      // 대조군 — 잠기기 전에는 실려 있다
      expect(isEmpty(viewOf(game, "p1")[ch])).toBe(false);

      act(game, "p0", "disarm_lock", { target: "p1", augmentId: id });
      expect(isEmpty(viewOf(game, "p1")[ch])).toBe(true);
      // 잠긴 동안 다른 이벤트가 와도 되살아나지 않는다(리액션이 게이트에 꺼져 있다)
      tick(game, 2);
      expect(isEmpty(viewOf(game, "p1")[ch])).toBe(true);
    });
  }
});
