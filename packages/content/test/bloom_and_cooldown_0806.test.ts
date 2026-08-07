/**
 * 2026-08-06 사용자 지시 회귀 테스트.
 *
 * 여기서 지키는 계약:
 *  1. 만개(절벽 위에 피어난 꽃)는 **지금 손과 가장 가까운 화료형**으로 재구성된다 —
 *     이미 완성돼 있던 몸통은 그대로 살아남고(생성패로 덮이지 않는다), 손이 통째로
 *     남의 것으로 바뀌지 않는다.
 *  2. 그래도 결과는 반드시 **화료형**이다 (후로가 있어도, 손이 엉망이어도).
 *  3. "N국에 1회" 쿨다운은 보유자 화면에 **남은 국 수**로 실린다 — 발동한 그 자리에서
 *     바로, 그리고 국이 지날 때마다 하나씩 줄어 0이 되면 사라진다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_STARTED,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isWinningShape,
  kindKey,
  meldCountOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import { cooldownViewKey, roundKey } from "../src/util.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(
  state: GameState,
  grants: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      grants[p.id] === undefined
        ? p
        : { ...p, augments: [...p.augments, ...(grants[p.id] as string[])] },
    ),
  };
}

function mk(
  state: GameState,
  installs: { def: AugmentDef; holder: PlayerId }[],
): Game {
  const game = createStandardGameFromState(state);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku });
  }
  return game;
}

/** 이벤트를 그대로 흘려 넣는 테스트 전용 액션 (ROUND_STARTED 흉내) */
function emit(game: Game, event: { type: string; payload: unknown }): void {
  if (!game.engine.actions.has("__test_emit")) {
    game.engine.actions.register({
      type: "__test_emit",
      validate: () => null,
      toEvents: (req) => [req.payload as { type: string; payload: unknown }],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_emit", payload: event });
  if (!res.ok) throw new Error(`emit failed: ${res.reason}`);
}

const handKinds = (game: Game, p: PlayerId): TileKind[] =>
  handIdsOf(game.engine.state, p).map((id) => game.engine.state.tiles[id]!.kind);

/** 생성패(conjured)로 덮인 손패 장수 — 만개가 실제로 갈아엎은 장수다 */
const conjuredCount = (game: Game, p: PlayerId): number =>
  handIdsOf(game.engine.state, p).filter(
    (id) => game.engine.state.tiles[id]!.attrs?.conjured === true,
  ).length;

// ────────────────────────── 1·2. 만개는 내 손에서 핀다 ──────────────────────────

describe("만개 — 지금 손과 가장 가까운 화료형으로 다시 짠다", () => {
  /**
   * p0 = 절벽 위에 피어난 꽃. 이번 국에 이미 깡을 1번 한 것으로 기록해 두면
   * 다음 안깡이 두 번째 깡 = 만개 조건이 된다.
   */
  function bloom(hand: string): Game {
    const base0 = craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const base: GameState = {
      ...withAug(base0, { p0: ["cliff_bloom"] }),
      augmentData: {
        ...base0.augmentData,
        [`cliff_bloom:kans:${roundKey(base0)}:p0`]: 1,
      },
    };
    const game = mk(base, [{ def: C.cliffBloom, holder: "p0" }]);
    const flow = new FlowController(game.engine);
    const start = flow.begin();
    if (start.kind !== "awaiting") throw new Error("expected awaiting");
    const ankan = (start.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "ankan",
    );
    expect(ankan).toBeDefined();
    flow.submit("p0", ankan!);
    expect(
      game.engine.state.augmentData[`cliff_bloom:bloomed:${roundKey(game.engine.state)}:p0`],
    ).toBe(true);
    return game;
  }

  it("이미 완성돼 있던 몸통은 그대로 남는다 (전부 갈아엎지 않는다)", () => {
    // 1만 4장(깡 재료) + 234p·567p·234s 완성 + 9s. 깡+영상 쯔모 뒤 손패는 11장이고,
    // 그중 아홉 장이 이미 세 몸통이다 — 살릴 수 있는 만큼 살아남아야 한다.
    const game = bloom("1111m234p567p234s9s");
    const kinds = handKinds(game, "p0");
    expect(isWinningShape(kinds, meldCountOf(game.engine.state, "p0"))).toBe(true);
    // 손대야 하는 것은 남은 자투리 한 장뿐 — 예전 고정 배치는 10장을 전부 덮었다
    expect(conjuredCount(game, "p0")).toBeLessThanOrEqual(2);
    const keys = kinds.map(kindKey);
    for (const k of ["pin2", "pin3", "pin4", "pin5", "pin6", "pin7", "sou2", "sou3", "sou4"]) {
      expect(keys).toContain(k);
    }
  });

  it("손이 엉망이어도 결과는 반드시 화료형이다", () => {
    // 몸통이라고는 없는 손 — 채움 멘쯔가 자리를 메워야 한다
    const game = bloom("1111m147p258s369m2p");
    expect(isWinningShape(handKinds(game, "p0"), meldCountOf(game.engine.state, "p0"))).toBe(
      true,
    );
  });

  it("후로(깡)가 있어도 남은 손패 장수에 딱 맞는 화료형이 된다", () => {
    // 작두만 잔뜩인 손 — 깡이 곧 후로라 멘젠 치또이는 애초에 성립하지 않는다.
    // 깡 뒤 남는 11장(= 머리 + 멘쯔 3개)이 정확히 떨어지는지 본다.
    const game = bloom("1111m22p33p44p55s66s");
    const state = game.engine.state;
    expect(meldCountOf(state, "p0")).toBe(1);
    expect(handIdsOf(state, "p0")).toHaveLength(11);
    expect(isWinningShape(handKinds(game, "p0"), 1)).toBe(true);
  });
});

// ───────────────────────── 3. 쿨다운 잔량이 화면에 실린다 ─────────────────────────

describe("N국에 1회 — 남은 국 수가 보유자 화면에 실린다", () => {
  /** p0 = 물러설 수 없는 선언(2국에 1회). 국의 첫 순이라 바로 선언할 수 있다. */
  function scene(): Game {
    const base = withAug(
      craft({
        hands: { p0: "123m456m789m123p45s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["no_retreat"] },
    );
    return mk(base, [{ def: C.noRetreat, holder: "p0" }]);
  }

  const left = (game: Game): unknown =>
    game.engine.state.augmentData[cooldownViewKey("no_retreat", "p0")];

  it("발동한 그 자리에서 '2국 남음'이 뜨고, 국이 지날 때마다 줄어 0에서 사라진다", () => {
    const game = scene();
    // 아직 안 썼으면 표시가 없다
    expect(left(game)).toBeUndefined();

    const flow = new FlowController(game.engine);
    const start = flow.begin();
    if (start.kind !== "awaiting") throw new Error("expected awaiting");
    const declare = (start.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "declare_no_retreat",
    );
    expect(declare).toBeDefined();
    flow.submit("p0", declare!);

    // 발동 직후 — 다음 국을 기다려서는 안 된다(발동해 놓고 "아직 쓸 수 있음"으로 보였다)
    expect(left(game)).toBe(2);

    // 국이 하나 지나면 1, 둘 지나면 0
    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(left(game)).toBe(1);
    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(left(game)).toBe(0);
  });
});
