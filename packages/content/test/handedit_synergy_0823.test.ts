/**
 * 손패 조작·강 시너지 회귀 — 2026-08-23 QA synergy3(handedit)가 확정한 결함들.
 *
 * 이번 축이 찾은 것은 대부분 **"내가 버린 패"의 근거가 카드마다 달랐다**는 한 뿌리다.
 * 누명(frame_up)은 실물과 후리텐 이력을 **남에게** 돌리는데, 그 둘 중 아무거나
 * "내가 버린 패"로 읽던 카드들이 한꺼번에 어긋났다. 코어에 `ownDiscards`(실제로 내가
 * 버린 패)를 두고 그쪽으로 근거를 모은 것이 확정 2·3·4의 공통 수정이다.
 *
 * 1. 연금술사가 `handAltered` 표식을 안 찍어 첫 순에 고쳐 만든 오야 손에 천화가 붙었다.
 * 2. 강 회수 3종의 "내 바닥은 대상이 아니다" 가드가 **바닥의 주인**으로 판정해,
 *    누명으로 남의 바닥에 심어 둔 내 패를 도로 집었다.
 * 3. 바닥의 족보가 후리텐 이력을 읽어 **피해자**의 역류 통관을 완성시켰다(3판→5판).
 * 4. 자패 귀환도 같은 뿌리 — 보유자의 기억은 사라지고 피해자가 공짜 자패를 받았다.
 * 5. 모래시계 연장 종료를 패산 고갈로 판정해, 강 회수가 패산을 되채우면 "최대 4장"이
 *    7장까지 늘어났다.
 * 6. 무르기가 강에서 집어 온 패까지 패산에 묻었다.
 * 7. 손을 통째로 빼앗겨도 "무슨 색으로 통일했다"는 공개 표식이 원주인 자리에 남았다.
 *
 * 픽스처 규약은 `settle_synergy_0823.test.ts` 와 같다 — `craft()` 로 장면을 세우고
 * 증강을 심은 뒤, **실제 액션**을 태워 잰다. 특히 누명 장면은 크래프트로 흉내 낼 수
 * 없다(실물의 주인과 실제 버린 사람이 갈라진 상태라서) — 반드시 액션을 태운다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundViewKey } from "../src/util.js";
import { alchemist } from "../src/augments/alchemist.js";
import { bottomYaku } from "../src/augments/bottom_yaku.js";
import { frameUp } from "../src/augments/frame_up.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { honorReturn } from "../src/augments/honor_return.js";
import { hourglass } from "../src/augments/hourglass.js";
import { pickyEater, questProgress } from "../src/augments/picky_eater.js";
import { pondSnatch } from "../src/augments/pond_snatch.js";
import { silentSwap } from "../src/augments/silent_swap.js";
import { suitUnify } from "../src/augments/suit_unify.js";
import { takeBack } from "../src/augments/take_back.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(
  state: GameState,
  map: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] === undefined ? p : { ...p, augments: [...(map[p.id] as string[])] },
    ),
  };
}

function start(
  state: GameState,
  installs: { def: AugmentDef; holder: PlayerId }[],
): Game {
  const game = createStandardGameFromState(state);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, {
      yaku: game.yaku,
      catalog: game.augments,
    });
  }
  return game;
}

const handIds = (s: GameState, p: PlayerId): TileId[] => [
  ...(s.zones[handZone(p)]?.tileIds ?? []),
];
const pondIds = (s: GameState, p: PlayerId): TileId[] => [
  ...(s.zones[discardsZone(p)]?.tileIds ?? []),
];

/** 액션의 validate 만 잰다 (프롬프트 흐름과 무관하게 가드 그 자체) */
function validate(
  game: Game,
  type: string,
  player: PlayerId,
  payload: unknown,
): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`액션 ${type} 이 등록되지 않았다`);
  return def.validate(
    { player, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
}

/** 액션을 실제로 태운다 (거부되면 그 자리에서 터뜨린다 — 조용히 지나가면 테스트가 거짓말이 된다) */
function act(game: Game, player: PlayerId, type: string, payload: unknown): void {
  const err = validate(game, type, player, payload);
  if (err !== null) throw new Error(`${type} 거부됨: ${err}`);
  const res = game.engine.submit({ player, type, payload } as never);
  if (res.ok !== true) throw new Error(`${type} 실패: ${JSON.stringify(res)}`);
}

/** 그 좌석 손에서 특정 종류의 tileId 하나 */
function findInHand(s: GameState, p: PlayerId, key: string): TileId {
  const id = handIds(s, p).find((t) => kindKey(kindOf(s, t)) === key);
  if (id === undefined) throw new Error(`${p} 손에 ${key} 가 없다`);
  return id;
}

/** 그 손패로 쯔모 화료했을 때의 역·판수 */
function scoreTsumo(
  game: Game,
  player: PlayerId,
  winTile: TileId,
): { names: string[]; han: number; yakuman: number } {
  const ctx = buildWinContext(game.engine.state, player, "tsumo", winTile, {
    rules: game.engine.rules,
  });
  const ev = evaluateWin(ctx, game.yaku);
  return {
    names: ev?.yaku.map((y) => y.name) ?? [],
    han: ev?.han ?? 0,
    yakuman: ev?.yakumanCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 확정 1 — alchemist × 천화 게이트
// ---------------------------------------------------------------------------

describe("확정 1 · alchemist × 천화 게이트", () => {
  /**
   * 오야 p0 이 첫 순(버림 0장)에 **연금술로 한 장을 옮겨** 손을 완성시킨다.
   * 형제 카드(염색·분열·짝수의 세계·조커)는 전부 `handAltered` 를 찍는데 연금술만
   * 빠져 있어 이 손에 천화 역만(48,000점)이 붙었다.
   */
  function firstTurnDealer(hand: string, augs: string[]): Game {
    const base = craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const scene: GameState = {
      ...withAugments(base, { p0: augs }),
      round: { ...base.round, firstTurn: true, dealerSeat: 0 },
    };
    return start(
      scene,
      augs.includes("alchemist") ? [{ def: alchemist, holder: "p0" }] : [],
    );
  }

  it("연금술로 첫 순에 고친 손에는 천화가 붙지 않는다", () => {
    // 123m 456m 789m 123p + 3m4m — 4만을 3만으로 옮기면 3만 아타마로 완성형
    const game = firstTurnDealer("123m456m789m123p3m4m", ["alchemist"]);
    const four = findInHand(game.engine.state, "p0", "man4");
    act(game, "p0", "alchemy", { tileId: four, delta: -1 });

    const ids = handIds(game.engine.state, "p0");
    const got = scoreTsumo(game, "p0", ids[ids.length - 1] as TileId);
    expect(got.names).not.toContain("천화");
    expect(got.yakuman).toBe(0);
    // 고친 손이 무효가 되는 것은 아니다 — 평범한 역으로는 화료한다
    expect(got.han).toBeGreaterThan(0);
  });

  it("대조군 — 아무것도 고치지 않은 배패에는 천화가 그대로 붙는다", () => {
    const game = firstTurnDealer("123m456m789m123p33m", []);
    const ids = handIds(game.engine.state, "p0");
    const got = scoreTsumo(game, "p0", ids[ids.length - 1] as TileId);
    expect(got.names).toContain("천화");
  });
});

// ---------------------------------------------------------------------------
// 확정 2 · 3 · 4 — 누명이 갈라놓은 "내가 버린 패"
// ---------------------------------------------------------------------------

/**
 * p0 이 누명으로 손패 한 장을 p1 바닥에 심는다 — **실제 액션**을 태운다.
 * 심은 뒤 p0 의 turn.act 로 되감아, 강 회수 가드를 그 자리에서 잰다
 * (심은 직후는 reaction 단계라 가드만 재려면 턴을 되돌려야 한다).
 */
function frameThen(cfg: {
  holderHand: string;
  /** 심을 패의 kindKey */
  plant: string;
  augs: string[];
  installs: { def: AugmentDef; holder: PlayerId }[];
}): { game: Game; planted: TileId } {
  const base = withAugments(
    craft({
      hands: { p0: cfg.holderHand, p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "2z3z", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up", ...cfg.augs] },
  );
  const first = start(base, [{ def: frameUp, holder: "p0" }, ...cfg.installs]);
  const planted = findInHand(first.engine.state, "p0", cfg.plant);
  act(first, "p0", "frame_discard", { tileId: planted, target: "p1" });

  // 심긴 상태 그대로 p0 의 새 순을 세운다 (증강 설치는 새 게임에서 다시 한다)
  const s = first.engine.state;
  const drawn = handIds(s, "p0")[0] as TileId;
  const rewound: GameState = {
    ...s,
    round: {
      ...s.round,
      phase: "turn.act",
      turnSeat: 0,
      lastDiscard: null,
      lastDrawnTile: drawn,
      lastDrawRinshan: false,
    },
  };
  return {
    game: start(rewound, [{ def: frameUp, holder: "p0" }, ...cfg.installs]),
    planted,
  };
}

describe("확정 2 · frame_up × 강 회수 3종", () => {
  const HAND = "123m456m789m123p3m9p";

  it("정적의 손 — 누명으로 남의 바닥에 심은 내 패는 집을 수 없다", () => {
    const { game, planted } = frameThen({
      holderHand: HAND,
      plant: "man3",
      augs: ["silent_swap"],
      installs: [{ def: silentSwap, holder: "p0" }],
    });
    // 실물은 분명히 p1 바닥에 있다 — 누명이 실제로 그 상태를 만들었다
    expect(pondIds(game.engine.state, "p1")).toContain(planted);
    // 후리텐 이력도 p1 쪽에 갔다 (누명 본래 효과는 그대로 살아 있어야 한다)
    expect(game.engine.state.round.byPlayer["p1"]?.discardedKinds).toContain("man3");
    expect(game.engine.state.round.byPlayer["p0"]?.discardedKinds).not.toContain("man3");

    expect(validate(game, "silent_take", "p0", { tileId: planted })).toBe(
      "cannot take a tile you discarded",
    );
  });

  it("날치기 — 같은 패를 줍지 못한다", () => {
    const { game, planted } = frameThen({
      holderHand: HAND,
      plant: "man3",
      augs: ["pond_snatch"],
      installs: [{ def: pondSnatch, holder: "p0" }],
    });
    expect(
      validate(game, "pond_snatch", "p0", { fromPlayer: "p1", snatchId: planted }),
    ).toBe("cannot snatch a tile you discarded");
  });

  it("무덤 도굴 — 같은 패를 파내지 못한다", () => {
    const { game, planted } = frameThen({
      holderHand: HAND,
      plant: "man3",
      augs: ["grave_rob"],
      installs: [{ def: graveRob, holder: "p0" }],
    });
    expect(
      validate(game, "grave_rob", "p0", { fromPlayer: "p1", graveId: planted }),
    ).toBe("cannot rob a tile you discarded");
  });

  it("대조군 — 남이 진짜로 버린 패는 그대로 집을 수 있다", () => {
    const { game } = frameThen({
      holderHand: HAND,
      plant: "man3",
      augs: ["silent_swap"],
      installs: [{ def: silentSwap, holder: "p0" }],
    });
    const theirs = pondIds(game.engine.state, "p1").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === "wind2",
    ) as TileId;
    expect(validate(game, "silent_take", "p0", { tileId: theirs })).toBeNull();
  });
});

describe("확정 3 · frame_up × bottom_yaku", () => {
  /**
   * p1(피해자)은 1만~8만만 버렸다. p0 이 **9만을 p1 바닥에 심으면** 예전에는 그 9만이
   * p1 의 후리텐 이력에 들어가 p1 의 역류 통관(+2판)을 공짜로 완성시켰다.
   */
  it("심긴 9만은 피해자의 역류 통관을 완성시키지 않는다", () => {
    const base = withAugments(
      craft({
        hands: {
          p0: "9m1112223334z4z",
          p1: "234m456m789p234s55s",
          p2: "*",
          p3: "*",
        },
        discards: { p0: "1z", p1: "12345678m", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up"], p1: ["bottom_yaku"] },
    );
    const game = start(base, [
      { def: frameUp, holder: "p0" },
      { def: bottomYaku, holder: "p1" },
    ]);
    const winTile = findInHand(game.engine.state, "p1", "sou5");
    const before = scoreTsumo(game, "p1", winTile);

    const nine = findInHand(game.engine.state, "p0", "man9");
    act(game, "p0", "frame_discard", { tileId: nine, target: "p1" });

    // 누명 본래 효과(실물·후리텐 이력)는 그대로 p1 쪽에 간다
    expect(pondIds(game.engine.state, "p1")).toContain(nine);
    expect(game.engine.state.round.byPlayer["p1"]?.discardedKinds).toContain("man9");

    const after = scoreTsumo(game, "p1", winTile);
    expect(after.han).toBe(before.han);
    expect(after.names.join(",")).not.toContain("역류");
  });

  it("보유자가 누명으로 흘린 9만은 자기 역류 통관에 그대로 남는다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "234m456m789p234s55s9m", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "12345678m", p1: "2z3z", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up", "bottom_yaku"] },
    );
    const game = start(base, [
      { def: frameUp, holder: "p0" },
      { def: bottomYaku, holder: "p0" },
    ]);
    const nine = findInHand(game.engine.state, "p0", "man9");
    act(game, "p0", "frame_discard", { tileId: nine, target: "p1" });

    // 후리텐 이력에는 없다(그게 누명의 효과다) — 그래도 "내가 버린 패"이므로 통관은 선다
    expect(game.engine.state.round.byPlayer["p0"]?.discardedKinds).not.toContain("man9");
    const got = scoreTsumo(game, "p0", findInHand(game.engine.state, "p0", "sou5"));
    expect(got.names.join(",")).toContain("역류");
  });
});

describe("확정 4 · frame_up × honor_return", () => {
  /**
   * p0 이 東을 누명으로 p1 바닥에 심는다. 예전에는 보유자의 귀환이 그 東을 기억하지
   * 못하고(내 이력에서 사라져서), 피해자가 버리지도 않은 東의 주인이 됐다.
   */
  function plantEast(holderAugs: string[], victimAugs: string[]): Game {
    const base = withAugments(
      craft({
        hands: { p0: "1z123m456m789m12p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1m2m", p1: "9m", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up", ...holderAugs], p1: [...victimAugs] },
    );
    const installs: { def: AugmentDef; holder: PlayerId }[] = [
      { def: frameUp, holder: "p0" },
    ];
    if (holderAugs.includes("honor_return")) {
      installs.push({ def: honorReturn, holder: "p0" });
    }
    if (victimAugs.includes("honor_return")) {
      installs.push({ def: honorReturn, holder: "p1" });
    }
    const first = start(base, installs);
    const east = findInHand(first.engine.state, "p0", "wind1");
    act(first, "p0", "frame_discard", { tileId: east, target: "p1" });
    expect(pondIds(first.engine.state, "p1")).toContain(east);
    return first;
  }

  it("보유자의 귀환은 누명으로 흘린 자패를 그대로 기억한다", () => {
    const game = plantEast(["honor_return"], []);
    // 심긴 직후는 reaction 단계라 p0 의 순으로 되감아 가드만 잰다
    const s = game.engine.state;
    const rewound = start(
      {
        ...s,
        round: { ...s.round, phase: "turn.act", turnSeat: 0, lastDiscard: null },
      },
      [{ def: frameUp, holder: "p0" }, { def: honorReturn, holder: "p0" }],
    );
    // 후리텐 이력에서는 東이 사라졌다(누명의 효과) — 그래도 귀환의 재료로는 남아야 한다
    expect(s.round.byPlayer["p0"]?.discardedKinds).not.toContain("wind1");
    expect(validate(rewound, "honor_recall", "p0", {})).toBeNull();
  });

  it("피해자는 심긴 자패를 귀환 재료로 쓰지 못한다", () => {
    const game = plantEast([], ["honor_return"]);
    const s = game.engine.state;
    // p1 의 후리텐 이력에는 東이 들어갔지만(누명의 효과) 실제로 버린 적은 없다
    expect(s.round.byPlayer["p1"]?.discardedKinds).toContain("wind1");
    const rewound = start(
      {
        ...s,
        round: { ...s.round, phase: "turn.act", turnSeat: 1, lastDiscard: null },
      },
      [{ def: frameUp, holder: "p0" }, { def: honorReturn, holder: "p1" }],
    );
    expect(validate(rewound, "honor_recall", "p1", {})).toBe(
      "no honor tiles in your discards",
    );
  });
});

// ---------------------------------------------------------------------------
// 확정 5 — hourglass 연장 길이
// ---------------------------------------------------------------------------

describe("확정 5 · hourglass × 강 회수", () => {
  /**
   * 모래시계의 연장은 "남은 영상패(최대 4장)"를 혼자 도는 것이다. 그런데 종료 판정이
   * **패산이 마르는 것**이라, 강 회수(쯔모패를 패산으로 되돌린다)가 패산을 되채울
   * 때마다 솔로 쯔모가 늘어났다 — 실측 4회 → 7회.
   *
   * ⚠ 버림은 전부 중장패로 둔다 — 요구패·자패만 버리면 나가시가 서서 연장 자체가
   *   열리지 않는다(모래시계의 별도 가드).
   */
  function soakExtension(augs: string[], useRiver: string | null): number {
    const base = craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5m", p1: "2z3z4z5z6z7z", p2: "1m2m3m4m5m6m", p3: "1p2p3p4p5p6p" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 패산을 1장만 남겨 곧바로 유국을 맞는다 (남는 패는 p3 바닥으로 치운다)
    const wall = base.zones[WALL];
    const p3 = base.zones[discardsZone("p3")];
    if (wall === undefined || p3 === undefined) throw new Error("존이 없다");
    const ids = wall.tileIds;
    const scene = withAugments(
      {
        ...base,
        zones: {
          ...base.zones,
          [WALL]: { ...wall, tileIds: ids.slice(0, 1) },
          [discardsZone("p3")]: {
            ...p3,
            tileIds: [...p3.tileIds, ...ids.slice(1)],
          },
        },
      },
      { p0: augs },
    );
    const defs: Record<string, AugmentDef> = {
      hourglass,
      pond_snatch: pondSnatch,
      silent_swap: silentSwap,
    };
    const game = start(
      scene,
      augs.map((a) => ({ def: defs[a] as AugmentDef, holder: "p0" as PlayerId })),
    );

    let draws = 0;
    let extending = false;
    let lastSeen: TileId | null = null;
    const flow = new FlowController(game.engine);
    let st = flow.begin();
    for (let steps = 0; st.kind === "awaiting" && steps < 300; steps++) {
      const prompt = st.prompts[0];
      if (prompt === undefined) break;
      const s = game.engine.state;
      if (
        Object.keys(s.augmentData).some(
          (k) => k.startsWith("hourglass:opened:") && s.augmentData[k] === true,
        )
      ) {
        extending = true;
      }
      const opts = prompt.options;
      if (extending && useRiver !== null) {
        const hit = opts.find((o) => o.type === useRiver);
        if (hit !== undefined) {
          st = flow.submit(prompt.player, hit as never);
          continue;
        }
      }
      if (
        extending &&
        prompt.player === "p0" &&
        s.round.phase === "turn.act" &&
        s.round.lastDrawnTile !== lastSeen
      ) {
        draws++;
        lastSeen = s.round.lastDrawnTile;
      }
      const drawn = s.round.lastDrawnTile;
      const pick =
        opts.find(
          (o) =>
            o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
        ) ??
        opts.find((o) => o.type === "discard") ??
        opts.find((o) => o.type === "pass") ??
        opts[0];
      if (pick === undefined) break;
      st = flow.submit(prompt.player, pick as never);
    }
    // 왕패에서 실제로 패가 넘어갔는지 (연장이 열렸다는 증거)
    expect(game.engine.state.zones[DEAD_WALL]?.tileIds.length).toBeLessThan(14);
    return draws;
  }

  it("모래시계 단독 — 솔로 쯔모는 4회", () => {
    expect(soakExtension(["hourglass"], null)).toBe(4);
  });

  it("날치기를 연장 중에 써도 4회를 넘지 않는다", () => {
    expect(soakExtension(["hourglass", "pond_snatch"], "pond_snatch")).toBe(4);
  });

  it("정적의 손을 연장 중에 써도 4회를 넘지 않는다", () => {
    expect(soakExtension(["hourglass", "silent_swap"], "silent_take")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 확정 6 — take_back × 강 회수
// ---------------------------------------------------------------------------

describe("확정 6 · take_back × 강 회수", () => {
  function riverScene(aug: string, def: AugmentDef): Game {
    const base = withAugments(
      craft({
        hands: { p0: "123m456m789m12p34p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z", p1: "4z2z3z", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: [aug, "take_back"] },
    );
    return start(base, [
      { def, holder: "p0" },
      { def: takeBack, holder: "p0" },
    ]);
  }

  it("정적의 손으로 집어 온 패는 무를 수 없다", () => {
    const game = riverScene("silent_swap", silentSwap);
    const north = pondIds(game.engine.state, "p1").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === "wind4",
    ) as TileId;
    act(game, "p0", "silent_take", { tileId: north });
    // 집어 온 패가 쯔모패 자리에 섰다 — 예전에는 이 상태로 무르기가 통과했다
    expect(game.engine.state.round.lastDrawnTile).toBe(north);
    expect(validate(game, "take_back", "p0", {})).toBe(
      "that tile did not come from the wall",
    );
  });

  it("날치기로 주워 온 패도 무를 수 없다", () => {
    const game = riverScene("pond_snatch", pondSnatch);
    const north = pondIds(game.engine.state, "p1").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === "wind4",
    ) as TileId;
    act(game, "p0", "pond_snatch", { fromPlayer: "p1", snatchId: north });
    expect(game.engine.state.round.lastDrawnTile).toBe(north);
    expect(validate(game, "take_back", "p0", {})).toBe(
      "that tile did not come from the wall",
    );
  });

  it("대조군 — 패산에서 온 쯔모패는 그대로 무를 수 있다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "123m456m789m12p34p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["take_back"] },
    );
    const game = start(base, [{ def: takeBack, holder: "p0" }]);
    expect(validate(game, "take_back", "p0", {})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 확정 8 — frame_up 의 conflicts:["picky_eater"] 는 근거가 사라졌다
// ---------------------------------------------------------------------------

describe("확정 8 · frame_up × picky_eater", () => {
  /**
   * 그 conflicts 의 근거는 "심긴 패 한 장이 편식 퀘스트를 통째로 깬다"였다.
   * 편식은 그 뒤 자기 버림 목록(`myDiscardKinds`)으로 옮겨 갔으므로 근거가 사라졌다.
   * `conflicts_and_threshold.test.ts` 에서 그 케이스를 빼면서, **편식 쪽 가드**를
   * 지키는 회귀를 여기에 남긴다 (QA synergy3 handedit 확정 8, 2026-08-23).
   */
  it("남이 심은 패는 편식 퀘스트를 깨지 않는다", () => {
    const base = withAugments(
      craft({
        hands: { p0: "1p123m456m789m12p", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z", p1: "12345m", p2: "5z", p3: "6z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up"], p1: ["picky_eater"] },
    );
    const game = start(base, [
      { def: frameUp, holder: "p0" },
      { def: pickyEater, holder: "p1" },
    ]);
    const before = questProgress(game.engine.state, "p1");
    expect(before.failed).toBe(false);

    // p0 이 **1통**(만수가 아니다)을 p1 바닥에 심는다
    const pin = findInHand(game.engine.state, "p0", "pin1");
    act(game, "p0", "frame_discard", { tileId: pin, target: "p1" });

    // 누명 본래 효과(후리텐 오염)는 걸렸는데 퀘스트는 멀쩡해야 한다
    expect(game.engine.state.round.byPlayer["p1"]?.discardedKinds).toContain("pin1");
    const after = questProgress(game.engine.state, "p1");
    expect(after.failed).toBe(false);
    expect(after.count).toBe(before.count);
  });

  it("누명은 편식과 함께 뽑힐 수 있다 (conflicts 를 지웠다)", () => {
    expect(frameUp.conflicts ?? []).not.toContain("picky_eater");
  });
});

// ---------------------------------------------------------------------------
// 확정 7 — 손을 통째로 빼앗겼을 때 남는 가공 표식
// ---------------------------------------------------------------------------

describe("확정 7 · full_hand_swap × suit_unify 표식", () => {
  it("손을 통째로 빼앗기면 '무슨 색으로 통일했다'는 공개 표식도 남지 않는다", () => {
    const base = withAugments(
      craft({
        hands: {
          p0: "123m456m789m12p34p",
          p1: "234567899p2345p",
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 1,
        drawnLastFor: "p1",
      }),
      { p0: ["full_hand_swap"], p1: ["suit_unify"] },
    );
    const first = start(base, [
      { def: fullHandSwap, holder: "p0" },
      { def: suitUnify, holder: "p1" },
    ]);
    act(first, "p1", "mono_world", { suit: "sou" });
    const channel = roundViewKey("*", "suit_unify:p1");
    expect(first.engine.state.augmentData[channel]).toBe("sou");

    // p0 의 순으로 세워 손을 통째로 빼앗는다
    const s = first.engine.state;
    const game = start(
      {
        ...s,
        round: {
          ...s.round,
          phase: "turn.act",
          turnSeat: 0,
          lastDiscard: null,
          lastDrawnTile: handIds(s, "p0")[0] as TileId,
        },
      },
      [
        { def: fullHandSwap, holder: "p0" },
        { def: suitUnify, holder: "p1" },
      ],
    );
    act(game, "p0", "hand_swap", { target: "p1" });

    // 통일된 손은 p0 이 쥐고 있다 — 표식이 p1 자리에 남아 있으면 화면이 거짓말을 한다
    const sou = handIds(game.engine.state, "p0").filter(
      (id) => kindOf(game.engine.state, id).suit === "sou",
    ).length;
    expect(sou).toBeGreaterThanOrEqual(13);
    expect(game.engine.state.augmentData[channel]).toBeUndefined();
  });
});
