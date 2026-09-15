/**
 * 쯔모 변형 조정 — 한 끗 차이·만개 가입 (2026-09-16, docs/55 §2-2 C-1 · §4 A-3)
 *
 * 되돌리면 실패하는 회귀 테스트만 담는다.
 *
 * - `off_by_one`(리치 중 쯔모패를 인접 대기로)·`cliff_bloom`(두 번째 깡의 영상패에서
 *   만개)은 `TILE_DRAWN`에서 같은 tileId의 kind를 바꾸면서 `drawMutators` PRIORITY에
 *   없었다. 그래서 `conjure_draw`와 같은 쯔모에서 만나면 **설치(드래프트 픽) 순서**가
 *   최종 kind를 정했다 — 만개 뒤에 소환이 덮어쓰면 만개한 손이 화료형이 아니게 되어 매치
 *   예산이 헛되이 타고, 반대 순서면 소환의 «국당 1회»가 이미 덮인 패에 소비됐다
 *   (docs/48 A-11 거신병 × 소환과 같은 모양, 2026-08-31에 drawMutators로 고친 계약).
 * - 정적 스캔: `TILE_DRAWN`·`tileKindChanged(`를 둘 다 가진 카드 파일 == PRIORITY ∪ 예외 표.
 *   새 카드가 쯔모에서 kind를 바꾸기 시작하면 어느 한쪽에 넣어야 통과한다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  WALL,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isWinningShape,
  kindKey,
  kindOf,
  meldCountOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { conjureDraw } from "../src/augments/conjure_draw.js";
import {
  DRAW_MUTATOR_EXEMPT,
  DRAW_MUTATOR_PRIORITY,
  cliffBloomBloomedKey,
  cliffBloomBloomsUsedKey,
  cliffBloomKansKey,
  conjurePendingKey,
} from "../src/augments/drawMutators.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { offByOne } from "../src/augments/off_by_one.js";
import { roundScopedKey } from "../src/augments/roundScope.js";
import { roundViewKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const DEFS: Record<string, AugmentDef> = {
  cliff_bloom: cliffBloom,
  conjure_draw: conjureDraw,
  haitei_lord: haiteiLord,
  off_by_one: offByOne,
};

function withAugments(state: GameState, augs: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      augs[p.id] === undefined
        ? p
        : { ...p, augments: [...p.augments, ...(augs[p.id] as string[])] },
    ),
  };
}

/** 지정한 **설치 순서**로 증강을 심은 게임 + FlowController (= 드래프트 픽 순서) */
function build(
  state: GameState,
  order: string[],
  holder: PlayerId = "p0",
): { game: Game; flow: FlowController } {
  const game = createStandardGameFromState(withAugments(state, { [holder]: order }));
  for (const id of order) {
    installAugment(game.engine, DEFS[id] as AugmentDef, holder, {
      yaku: game.yaku,
      catalog: game.augments,
    } as never);
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

function optionsFor(flow: FlowController, player: PlayerId) {
  const st = flow.begin();
  return st.kind === "awaiting"
    ? (st.prompts.find((p) => p.player === player)?.options ?? [])
    : [];
}

/**
 * 패산(WALL) 또는 왕패(DEAD_WALL)의 **맨 앞**(= 다음에 뽑히는 자리, `sys.draw`·
 * `sys.drawRinshan` 둘 다 index 0)을 지정한 종류로 못 박는다. 그 종류의 실물을 패산에서
 * 먼저 찾고, 없으면 왕패의 영상패 자리(앞 4장 — 표시패 블록은 건드리지 않는다)에서 찾아
 * 맨 앞 패와 자리를 맞바꾼다. 손패의 패는 건드리지 않는다.
 */
function pinTop(state: GameState, zone: typeof WALL | typeof DEAD_WALL, key: string): GameState {
  const wall = [...(state.zones[WALL]?.tileIds ?? [])];
  const dead = [...(state.zones[DEAD_WALL]?.tileIds ?? [])];
  const target = zone === WALL ? wall : dead;
  const head = target[0] as TileId;
  const is = (id: TileId): boolean => kindKey(kindOf(state, id)) === key;
  const wallIdx = wall.findIndex(is);
  const deadIdx = dead.slice(0, 4).findIndex(is);
  if (wallIdx >= 0) {
    // zone이 WALL이면 target === wall 이라 아래 두 줄이 같은 배열 안의 교환이 된다
    target[0] = wall[wallIdx] as TileId;
    wall[wallIdx] = head;
  } else if (deadIdx >= 0) {
    target[0] = dead[deadIdx] as TileId;
    dead[deadIdx] = head;
  } else {
    throw new Error(`${key} 가 패산·영상패 어디에도 없다`);
  }
  return {
    ...state,
    zones: {
      ...state.zones,
      [WALL]: { ...(state.zones[WALL] as object), tileIds: wall },
      [DEAD_WALL]: { ...(state.zones[DEAD_WALL] as object), tileIds: dead },
    } as GameState["zones"],
  };
}

/** 소환이 «지금 국에 이미 발동해 예약이 서 있는» 상태 (예약 kind + 국당 1회 소진) */
function withConjurePending(
  state: GameState,
  target: { suit: "man" | "pin" | "sou"; rank: number },
): GameState {
  return {
    ...state,
    augmentData: {
      ...state.augmentData,
      [conjurePendingKey(state, "p0")]: target,
      [roundScopedKey("conjure_draw", "used", state, "p0")]: true,
    },
  };
}

const pendingOf = (s: GameState): unknown => s.augmentData[conjurePendingKey(s, "p0")] ?? null;
const viewOf = (s: GameState, id: string): unknown =>
  s.augmentData[roundViewKey("*", `${id}:p0`)] ?? null;

// ────────────── (1) 한 끗 차이 × 소환 — 리치 중 정상 쯔모 ──────────────

/**
 * p0이 4p/9s 샹퐁으로 리치한 채 **5p**를 쯔모하는 판(off_by_one_red.test.ts와 같은 손).
 * 5p는 대기가 아니고 4p의 이웃이므로 한 끗 차이가 4p로 민다. 소환은 대기가 아닌 **1m**을
 * 불러 두었다 — 소환이 이기면 화료가 아니고, 한 끗 차이가 이기면 그 자리에서 쯔모 화료다.
 */
function riichiScene(): GameState {
  const base = craft({
    hands: {
      p0: "123m789m123p44p99s",
      p1: "111s222s333s777s7s",
      p2: "555m666m777m888m9m",
      p3: "111m222m333m444m1p",
    },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const pinned = pinTop(base, WALL, "pin5");
  return withConjurePending(
    {
      ...pinned,
      round: {
        ...pinned.round,
        byPlayer: {
          ...pinned.round.byPlayer,
          p0: {
            ...(pinned.round.byPlayer["p0"] as NonNullable<
              GameState["round"]["byPlayer"]["p0"]
            >),
            riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
          },
        },
      },
    },
    { suit: "man", rank: 1 },
  );
}

/** 쯔모 직후의 관찰 가능한 결과 전부 — 설치 순서 두 방향에서 이것이 같아야 한다 */
function riichiOutcome(order: string[]) {
  const { game, flow } = build(riichiScene(), order);
  const s = game.engine.state;
  const drawn = s.round.lastDrawnTile as TileId;
  return {
    drawnKind: kindKey(kindOf(s, drawn)),
    conjured: s.tiles[drawn]?.attrs.conjured === true,
    pending: pendingOf(s),
    offByOneView: viewOf(s, "off_by_one"),
    canWin: optionsFor(flow, "p0").some((o) => o.type === "win"),
  };
}

describe("(1) 한 끗 차이 × 소환 — 설치(픽) 순서가 최종 kind 를 정하지 않는다", () => {
  const A = ["off_by_one", "conjure_draw"];
  const B = ["conjure_draw", "off_by_one"];

  it("두 순서의 결과(최종 kind · 소환 예약 · 공개 채널 · 화료 가능)가 완전히 같다", () => {
    expect(riichiOutcome(A)).toEqual(riichiOutcome(B));
  });

  for (const order of [A, B]) {
    it(`[${order.join(">")}] 한 끗 차이가 이기고 소환은 예약을 남긴 채 물러난다`, () => {
      const out = riichiOutcome(order);
      // 밀린 패로 그 자리에서 쯔모 화료 — 예전에는 순서에 따라 man1(화료 아님)이 됐다
      expect(out.drawnKind).toBe("pin4");
      expect(out.conjured).toBe(true);
      expect(out.canWin).toBe(true);
      expect(out.offByOneView).toBe("pin4");
      // 소환의 «국당 1회»는 타지 않는다 — 예약이 그대로 남아 다음 쯔모를 노린다
      // (예전에는 어느 순서든 이 쯔모에서 예약이 소비됐다)
      expect(out.pending).toEqual({ suit: "man", rank: 1 });
    });
  }

  it("소환 단독이면 그대로 부른 패가 온다 (양보가 과하지 않다 — 장면 자체가 소환이 뛰는 장면이다)", () => {
    const { game } = build(riichiScene(), ["conjure_draw"]);
    const s = game.engine.state;
    expect(kindKey(kindOf(s, s.round.lastDrawnTile as TileId))).toBe("man1");
    expect(pendingOf(s)).toBeNull();
  });

  it("한 끗 차이 단독이면 예전과 똑같이 민다", () => {
    const { game } = build(riichiScene(), ["off_by_one"]);
    const s = game.engine.state;
    expect(kindKey(kindOf(s, s.round.lastDrawnTile as TileId))).toBe("pin4");
  });
});

// ────────────── (1-b) 한 끗 차이는 해저의 지배자에게 진다 (순수 양보) ──────────────

describe("(1-b) 한 끗 차이 × 해저의 지배자 — 해저패는 지배자의 것", () => {
  /** 같은 리치 장면, 패산에 5p **한 장만** 남긴다 (이 쯔모가 해저패) */
  function haiteiScene(): GameState {
    const s = riichiScene();
    return {
      ...s,
      zones: {
        ...s.zones,
        [WALL]: { ...(s.zones[WALL] as object), tileIds: [s.zones[WALL]?.tileIds[0] as TileId] },
      } as GameState["zones"],
    };
  }

  for (const order of [
    ["off_by_one", "haitei_lord"],
    ["haitei_lord", "off_by_one"],
  ]) {
    it(`[${order.join(">")}] 지배자가 가져가고 한 끗 차이는 채널도 남기지 않는다`, () => {
      const { game, flow } = build(haiteiScene(), order);
      const s = game.engine.state;
      const drawn = s.round.lastDrawnTile as TileId;
      expect(viewOf(s, "haitei_lord")).not.toBeNull();
      // 진 쪽은 아무것도 emit하지 않는다 — 예전에는 두 카드가 같은 패에 각자 채널을 걸었다
      expect(viewOf(s, "off_by_one")).toBeNull();
      expect(viewOf(s, "haitei_lord")).toBe(kindKey(kindOf(s, drawn)));
      expect(optionsFor(flow, "p0").some((o) => o.type === "win")).toBe(true);
    });
  }
});

// ────────────── (2) 만개 × 소환 — 두 번째 깡의 영상패 ──────────────

/**
 * p0 = 절벽 위에 피어난 꽃 + 소환. 이번 국에 이미 깡 1회를 기록해 두면 다음 안깡(1111m)이
 * 두 번째 깡 = 만개 조건이다. 영상패 자리는 손과 무관한 **동(1z)**으로 못 박고, 소환은
 * 손에 있는 **2p**를 불러 두었다 — 소환이 영상패를 2p로 덮으면 만개한 손이 화료형이 아니게
 * 된다(예전 [만개>소환] 순서의 실제 결과).
 */
function bloomScene(): GameState {
  const base0 = craft({
    hands: { p0: "1111m234p567p234s9s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const base = pinTop(base0, DEAD_WALL, "wind1");
  return withConjurePending(
    {
      ...base,
      augmentData: { ...base.augmentData, [cliffBloomKansKey(base, "p0")]: 1 },
    },
    { suit: "pin", rank: 2 },
  );
}

function bloomOutcome(order: string[]) {
  const { game, flow } = build(bloomScene(), order);
  const ankan = optionsFor(flow, "p0").find((o) => o.type === "ankan");
  expect(ankan).toBeDefined();
  flow.submit("p0", ankan as never);
  const s = game.engine.state;
  const drawn = s.round.lastDrawnTile as TileId;
  const kinds = handIdsOf(s, "p0").map((id) => kindKey(kindOf(s, id)));
  return {
    handKinds: [...kinds].sort(),
    drawnKind: kindKey(kindOf(s, drawn)),
    winning: isWinningShape(
      handIdsOf(s, "p0").map((id) => kindOf(s, id)),
      meldCountOf(s, "p0"),
    ),
    bloomed: s.augmentData[cliffBloomBloomedKey(s, "p0")] === true,
    bloomsUsed: s.augmentData[cliffBloomBloomsUsedKey("p0")] ?? 0,
    pending: pendingOf(s),
    bloomView: viewOf(s, "cliff_bloom"),
    canWin: optionsFor(flow, "p0").some((o) => o.type === "win"),
  };
}

describe("(2) 만개 × 소환 — 설치(픽) 순서가 만개한 손을 깨뜨리지 않는다", () => {
  const A = ["cliff_bloom", "conjure_draw"];
  const B = ["conjure_draw", "cliff_bloom"];

  it("두 순서의 결과(손패 전체 · 예산 · 소환 예약 · 화료 가능)가 완전히 같다", () => {
    expect(bloomOutcome(A)).toEqual(bloomOutcome(B));
  });

  for (const order of [A, B]) {
    it(`[${order.join(">")}] 만개가 이기고(화료형 + 예산 1 소모) 소환은 예약을 남긴다`, () => {
      const out = bloomOutcome(order);
      expect(out.bloomed).toBe(true);
      expect(out.bloomsUsed).toBe(1);
      expect(out.bloomView).toBe("만개");
      // 만개한 손은 그 자리에서 화료형이다 — 예전 [만개>소환]은 영상패가 2p로 덮여 깨졌다
      expect(out.winning).toBe(true);
      expect(out.canWin).toBe(true);
      expect(out.drawnKind).not.toBe("pin2");
      // 소환의 «국당 1회»는 타지 않는다 — 예전 [소환>만개]는 덮인 패에 예약을 소비했다
      expect(out.pending).toEqual({ suit: "pin", rank: 2 });
    });
  }

  it("소환 단독이면 영상패가 그대로 부른 패가 된다 (장면 자체가 소환이 뛰는 장면이다)", () => {
    const { game, flow } = build(bloomScene(), ["conjure_draw"]);
    const ankan = optionsFor(flow, "p0").find((o) => o.type === "ankan");
    flow.submit("p0", ankan as never);
    const s = game.engine.state;
    expect(kindKey(kindOf(s, s.round.lastDrawnTile as TileId))).toBe("pin2");
    expect(pendingOf(s)).toBeNull();
  });
});

// ────────────── (3) 정적 스캔 — 가입 ∪ 예외 == 쯔모에서 kind 를 바꾸는 카드 ──────────────

describe("(3) 정적 스캔 — TILE_DRAWN 에서 tileKindChanged 를 쏘는 카드는 전부 조정에 가입돼 있다", () => {
  const AUG_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/augments");

  it("TILE_DRAWN ∧ tileKindChanged( 를 둘 다 가진 augments/*.ts == PRIORITY ∪ 예외 표", () => {
    const found = readdirSync(AUG_DIR)
      .filter((f) => f.endsWith(".ts"))
      // 조정자 자신은 카드가 아니다 (머리말에 두 문자열이 다 나온다)
      .filter((f) => f !== "drawMutators.ts")
      .filter((f) => {
        const src = readFileSync(join(AUG_DIR, f), "utf8");
        return src.includes("TILE_DRAWN") && src.includes("tileKindChanged(");
      })
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    const expected = [...DRAW_MUTATOR_PRIORITY, ...DRAW_MUTATOR_EXEMPT].sort();
    expect(found).toEqual(expected);
  });

  it("가입 표와 예외 표는 겹치지 않고, 가입 표의 카드는 전부 yieldsDrawTo 또는 최상위다", () => {
    expect(
      DRAW_MUTATOR_PRIORITY.filter((id) => DRAW_MUTATOR_EXEMPT.includes(id)),
    ).toEqual([]);
    // 최상위(해저의 지배자)만 물러날 일이 없다 — 나머지는 전부 공용 술어로 양보한다
    for (const id of DRAW_MUTATOR_PRIORITY.slice(1)) {
      const src = readFileSync(join(AUG_DIR, `${id}.ts`), "utf8");
      expect(src, `${id}.ts 가 yieldsDrawTo 를 읽지 않는다`).toContain("yieldsDrawTo(");
    }
  });
});
