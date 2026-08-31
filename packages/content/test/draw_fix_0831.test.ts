/**
 * 4라운드 QA 수정 — 쯔모·손패 술어 정리 (2026-08-31)
 *
 * 되돌리면 실패하는 회귀 테스트만 담는다.
 *
 * - **A-11** `giant_god` × `conjure_draw` — 둘 다 `TILE_DRAWN`에서 같은 tileId의 종류를
 *   바꾼다. 소환이 `haiteiLordWaits`만 보고 물러나서 **거신병은 그 술어에 없었다** →
 *   드래프트 픽 순서가 국사무쌍 성립을 정했고 두 카드의 «국당 1회»가 함께 탔다.
 *   (qa-lab/synergy4/handedit 확정 1)
 * - **B-11** `triple_peek`가 소환 예약을 보지 않아 **오지 않을 패를 예고**했다.
 *   (qa-lab/synergy4/info 확정 2)
 * - **B-5** `time_stop`의 «되돌림이 적용됐나» 판정이 `round.turnSeat === seat`라,
 *   `soul_strike`·`hourglass`가 이미 그 조건을 참으로 만들어 둔 폭주·연장 중에는
 *   **효과 0으로 매 국 1회가 탔다**. (qa-lab/synergy4/handedit 확정 3)
 * - **짝수의 세계 사양 변경** — 도라·적도라 예외를 전부 없앴다(사용자 지시).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  TURN_PASSED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  isNumberSuit,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { conjureDraw } from "../src/augments/conjure_draw.js";
import { evenWorld } from "../src/augments/even_world.js";
import { giantGod } from "../src/augments/giant_god.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { hourglass } from "../src/augments/hourglass.js";
import { soulStrike } from "../src/augments/soul_strike.js";
import { timeStop } from "../src/augments/time_stop.js";
import { triplePeek } from "../src/augments/triple_peek.js";
import { roundViewKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const DEFS: Record<string, AugmentDef> = {
  conjure_draw: conjureDraw,
  giant_god: giantGod,
  haitei_lord: haiteiLord,
  triple_peek: triplePeek,
  time_stop: timeStop,
  soul_strike: soulStrike,
  hourglass: hourglass,
  even_world: evenWorld,
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

/** 지정한 **설치 순서**로 증강을 심은 게임 + FlowController */
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

// ────────────────────────── A-11 ──────────────────────────

/** 국사 13종을 p0이 직접 버려 둔 장면 (거신병 각성 조건) */
const KOKUSHI_POND = "19m19p19s1234z567z";

function kokushiScene(): GameState {
  return craft({
    hands: { p0: "234m567m234p567p22s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: KOKUSHI_POND, p1: "2m", p2: "3m", p3: "4m" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** p0의 «다음 쯔모»까지 판을 돌린다 (쯔모기리로 한 바퀴) */
function advanceToNextP0Draw(game: Game, flow: FlowController): void {
  let st = flow.begin();
  let p0Discards = 0;
  for (let i = 0; i < 40 && st.kind === "awaiting"; i++) {
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      pr.options.find(
        (o) =>
          o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
      ) ??
      pr.options.find((o) => o.type === "discard") ??
      pr.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    if (pr.player === "p0" && pick.type === "discard") p0Discards++;
    st = flow.submit(pr.player, pick as never);
    const s = game.engine.state;
    if (p0Discards >= 1 && s.round.turnSeat === 0 && s.round.phase === "turn.act") break;
  }
}

describe("A-11 거신병 × 소환 — 설치(드래프트 픽) 순서가 국사무쌍을 정하지 않는다", () => {
  for (const order of [
    ["giant_god", "conjure_draw"],
    ["conjure_draw", "giant_god"],
  ]) {
    it(`설치순서 [${order.join(">")}] — 거신병이 이기고 소환 예약은 남는다`, () => {
      const { game, flow } = build(kokushiScene(), order);

      // 소환: 손패 한 장의 종류를 부른다
      const conj = optionsFor(flow, "p0").find((o) => o.type === "conjure_tsumo");
      expect(conj).toBeDefined();
      const calledId = (conj?.payload as { tileId: TileId }).tileId;
      const calledKind = kindKey(kindOf(game.engine.state, calledId));
      flow.submit("p0", conj as never);

      // 거신병 각성
      const awaken = optionsFor(flow, "p0").find((o) => o.type === "giant_god");
      expect(awaken).toBeDefined();
      flow.submit("p0", awaken as never);

      advanceToNextP0Draw(game, flow);

      // ① 거신병의 약속 — «다음 순에 반드시 화료한다»
      expect(optionsFor(flow, "p0").some((o) => o.type === "win")).toBe(true);

      // ② 소환은 **자원을 태우지 않는다** — 예약이 그대로 남아 다음 쯔모를 노린다
      const pending = Object.entries(game.engine.state.augmentData).find(([k]) =>
        k.startsWith("conjure_draw:pending"),
      );
      expect(pending?.[1]).not.toBeNull();
      expect(kindKey(pending?.[1] as never)).toBe(calledKind);
    });
  }

  it("소환 단독이면 물러나지 않는다 (양보가 과하지 않다)", () => {
    const { game, flow } = build(kokushiScene(), ["conjure_draw"]);
    const conj = optionsFor(flow, "p0").find((o) => o.type === "conjure_tsumo");
    const calledId = (conj?.payload as { tileId: TileId }).tileId;
    const calledKind = kindKey(kindOf(game.engine.state, calledId));
    flow.submit("p0", conj as never);
    advanceToNextP0Draw(game, flow);
    const drawn = game.engine.state.round.lastDrawnTile;
    expect(drawn).not.toBeNull();
    expect(kindKey(kindOf(game.engine.state, drawn as TileId))).toBe(calledKind);
  });
});

// ────────────────────────── B-11 ──────────────────────────

const peekChannel = (state: GameState): unknown =>
  state.augmentData[roundViewKey("p0", "triple_peek")];

describe("B-11 삼세 예지 — 쯔모 변형이 예약돼 있으면 «오지 않을 패»를 예고하지 않는다", () => {
  it("소환 예약이 서면 첫 장이 실제로 들어올 소환패로 갱신된다", () => {
    const scene = craft({
      hands: { p0: "123m456m789m123p1s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    const { game, flow } = build(scene, ["triple_peek", "conjure_draw"]);

    const peek = optionsFor(flow, "p0").find((o) => o.type === "triple_peek_use");
    expect(peek).toBeDefined();
    flow.submit("p0", peek as never);
    const before = peekChannel(game.engine.state) as string[];
    expect(before).toHaveLength(3);

    // 예고 첫 장과 **다른** 종류를 부른다 (갱신 여부가 드러나도록)
    const s0 = game.engine.state;
    const target = handIdsOf(s0, "p0").find(
      (id) => kindKey(kindOf(s0, id)) !== before[0],
    );
    expect(target).toBeDefined();
    const targetKey = kindKey(kindOf(s0, target as TileId));
    const conj = optionsFor(flow, "p0").find(
      (o) =>
        o.type === "conjure_tsumo" &&
        kindKey(kindOf(s0, (o.payload as { tileId: TileId }).tileId)) === targetKey,
    );
    expect(conj).toBeDefined();
    flow.submit("p0", conj as never);

    const after = peekChannel(game.engine.state) as string[];
    expect(after[0]).toBe(targetKey); // 예전에는 패산 kind 그대로였다
    expect(after.slice(1)).toEqual(before.slice(1)); // 나머지 두 장은 그대로
  });

  it("거신병 예약(무엇이 될지 그때의 손패가 정한다)은 아예 예고하지 않는다", () => {
    const { game, flow } = build(kokushiScene(), ["triple_peek", "giant_god"]);
    const peek = optionsFor(flow, "p0").find((o) => o.type === "triple_peek_use");
    expect(peek).toBeDefined();
    flow.submit("p0", peek as never);
    expect((peekChannel(game.engine.state) as string[]).length).toBe(3);

    const awaken = optionsFor(flow, "p0").find((o) => o.type === "giant_god");
    expect(awaken).toBeDefined();
    flow.submit("p0", awaken as never);

    // 첫 장은 «패산의 그 패»가 아니라 오름패가 된다 — 모르는 것은 말하지 않는다
    expect((peekChannel(game.engine.state) as string[]).length).toBe(2);
  });
});

// ────────────────────────── B-5 ──────────────────────────

/** 등록된 TURN_PASSED 인터셉터를 순서대로 통과시킨다 (엔진과 같은 경로) */
function runInterceptors(
  game: Game,
  state: GameState,
  nextSeat: number,
): Record<string, unknown> {
  let draft: { type: string; payload: unknown } = {
    type: TURN_PASSED,
    payload: { nextSeat },
  };
  for (const { intercept } of game.engine.effects.interceptorsFor(TURN_PASSED)) {
    const out = intercept(draft, { state, rules: game.engine.rules });
    if (out === null) break;
    draft = out as typeof draft;
  }
  return draft.payload as Record<string, unknown>;
}

function armedTimeStop(order: string[]): Game {
  const scene = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1z", p1: "2z", p2: "3z", p3: "4z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const { game, flow } = build(scene, order);
  const use = optionsFor(flow, "p0").find((o) => o.type === "time_stop_use");
  expect(use).toBeDefined();
  flow.submit("p0", use as never);
  return game;
}

/** 인터셉터가 보는 «내가 방금 버렸다» 상태를 직접 세운다 */
function afterMyDiscard(game: Game): GameState {
  const s = game.engine.state;
  const tileId = s.zones[discardsZone("p0")]?.tileIds[0] as TileId;
  return { ...s, round: { ...s.round, lastDiscard: { player: "p0", tileId } } };
}

describe("B-5 시간 정지 — 남이 이미 되돌려 놓은 순에는 «매 국 1회»를 태우지 않는다", () => {
  it("자연스러운 다음 자리면 되돌리고 적용 표식을 남긴다", () => {
    const game = armedTimeStop(["time_stop"]);
    const payload = runInterceptors(game, afterMyDiscard(game), 1); // 원래는 p1 차례
    expect(payload["nextSeat"]).toBe(0);
    expect(payload["timeStopApplied"]).toBe("p0");
  });

  it("이미 내 자리로 와 있으면(폭주·연장 중) 손대지 않고 표식도 없다", () => {
    const game = armedTimeStop(["time_stop"]);
    const payload = runInterceptors(game, afterMyDiscard(game), 0); // 남이 이미 되돌려 놨다
    expect(payload["nextSeat"]).toBe(0);
    expect(payload["timeStopApplied"]).toBeUndefined();
  });

  it("영혼의 일격 폭주 중에도 표식이 서지 않는다 (효과 0 소모 금지)", () => {
    const game = armedTimeStop(["soul_strike", "time_stop"]);
    // soul_strike를 켜지 않아도 «이미 내 자리»는 같은 입력이다 — 폭주가 만드는 상태를 흉내
    expect(
      runInterceptors(game, afterMyDiscard(game), 0)["timeStopApplied"],
    ).toBeUndefined();
  });

  it("패산이 비면 추가 순을 붙이지 않는다 (뽑을 패가 없다)", () => {
    const game = armedTimeStop(["hourglass", "time_stop"]);
    const s = afterMyDiscard(game);
    const dry: GameState = {
      ...s,
      zones: {
        ...s.zones,
        [WALL]: { ...(s.zones[WALL] as object), tileIds: [] },
      } as GameState["zones"],
    };
    expect(runInterceptors(game, dry, 1)["timeStopApplied"]).toBeUndefined();
  });

  it("리액션은 표식이 있을 때만 armed을 내린다", () => {
    const game = armedTimeStop(["time_stop"]);
    const armedKey = Object.keys(game.engine.state.augmentData).find((k) =>
      k.startsWith("time_stop:armed"),
    ) as string;
    expect(game.engine.state.augmentData[armedKey]).toBe(true);

    const emitted: { type: string; payload: unknown }[] = [];
    for (const { react } of game.engine.effects.reactionsFor(TURN_PASSED)) {
      react(
        { seq: 1, type: TURN_PASSED, payload: { nextSeat: 0 } },
        {
          state: game.engine.state,
          rules: game.engine.rules,
          emit: (e) => emitted.push(e as never),
        },
      );
    }
    // 표식 없는 TURN_PASSED는 armed을 건드리지 않는다
    expect(
      emitted.some(
        (e) => (e.payload as { key?: string }).key === armedKey,
      ),
    ).toBe(false);
  });
});

// ────────────────── 짝수의 세계 사양 변경 ──────────────────

describe("짝수의 세계 — 예외 없이 모든 홀수 수패가 짝수가 된다 (2026-08-31 사양 변경)", () => {
  /** 도라 표시패를 지정한 종류로 세운다 (표시패 → 도라는 +1) */
  function withDoraIndicator(state: GameState, indicatorKey: string): GameState {
    const deadWall = state.zones["deadwall"]?.tileIds ?? [];
    const idx = deadWall.length - 10;
    const slot = deadWall[idx] as TileId;
    const donor = Object.values(state.tiles).find(
      (t) => kindKey(t.kind) === indicatorKey,
    );
    if (donor === undefined) throw new Error(`no tile of ${indicatorKey}`);
    return {
      ...state,
      tiles: { ...state.tiles, [slot]: { ...state.tiles[slot], kind: donor.kind } },
      round: { ...state.round, doraIndicators: [slot] },
    } as GameState;
  }

  it("지금 도라인 홀수 패도, 적도라(빨간 5)도 함께 짝수가 된다", () => {
    // 표시패 4p → 도라는 5p. 손의 5p(+적5)와 5m이 예전에는 그대로 남았다.
    const base = craft({
      hands: { p0: "55m55p123m789m1s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 손패의 5 한 장을 적도라로 만든다
    const fiveId = handIdsOf(base, "p0").find(
      (id) => kindKey(kindOf(base, id)) === "man5",
    ) as TileId;
    const fiveTile = base.tiles[fiveId] as NonNullable<GameState["tiles"][number]>;
    const withRed: GameState = {
      ...base,
      tiles: {
        ...base.tiles,
        [fiveId]: { ...fiveTile, attrs: { ...fiveTile.attrs, red: true } },
      },
    };
    const { game, flow } = build(withDoraIndicator(withRed, "pin4"), ["even_world"]);

    const flip = optionsFor(flow, "p0").find((o) => o.type === "even_world_flip");
    expect(flip).toBeDefined();
    flow.submit("p0", flip as never);

    const s = game.engine.state;
    // 홀수 수패가 한 장도 남지 않는다 — 도라도 적도라도 예외가 아니다
    const odd = handIdsOf(s, "p0").filter((id) => {
      const k = kindOf(s, id);
      return isNumberSuit(k) && k.rank % 2 === 1;
    });
    expect(odd).toEqual([]);
    // 적도라 표식은 종류가 바뀌며 코어가 뗀다 (5가 아니게 되므로)
    expect(s.tiles[fiveId]?.attrs.red).not.toBe(true);
  });

  it("카드 문구가 새 사양을 말한다 (예외 없음 · 자패만 불변)", () => {
    expect(evenWorld.description).toContain("자패만 그대로 남는다");
    expect(evenWorld.description).not.toContain("자패와 도라는 그대로 남는다");
    expect(evenWorld.detail).toContain("적도라(빨간 5)도 예외 없이 짝수가 된다");
  });
});
