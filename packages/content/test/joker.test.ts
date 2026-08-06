/**
 * 조커 (joker) — 이번 국 손패의 백(白)이 만능패가 된다.
 *
 * 여기서 못을 박는 계약:
 *  1. 발동 전에는 백이 그냥 백이다 (조커는 켜야 켜진다).
 *  2. 발동하면 백이 **빈자리를 스스로 메운다** — 사용자 예시(23삭·백·23통 → 14삭·14통).
 *  3. 백은 **머리도 몸통도** 된다.
 *  4. 변신은 **가장 비싼 손**으로 자동 결정된다 (고르는 UI가 없다).
 *  5. 백 자체를 **론으로 잡아도** 화료가 성립한다 (화료패가 조커인 경우).
 *  6. 효과는 **발동한 그 국에만** 살고, 쿨다운은 2국이다.
 *  7. 발동 사실은 전원 공개다.
 *  8. 봇은 **백을 쥐고 있고 그 백이 손을 전진시킬 때만** 켠다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_STARTED,

  buildWinContext,
  buildPlayerView,
  createStandardGameFromState,
  evaluateWin,
  handIdsOf,
  installAugment,
  kindKey,
  scoringOptionsOf,
  shantenOf,
  winningKinds,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { botCtx, craft, h } from "./helpers.js";
import { cooldownViewKey, roundKey } from "../src/util.js";
import * as C from "../src/index.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const HAKU: TileKind = { suit: "dragon", rank: 1 };

function withAug(state: GameState, holder: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** p0가 조커를 든 게임 하나 */
function mk(hand: string, opts: { discards?: string } = {}): Game {
  const state = withAug(
    craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      ...(opts.discards !== undefined ? { discards: { p0: opts.discards } } : {}),
      phase: "turn.act",
      turnSeat: 0,
    }),
    "p0",
    ["joker"],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, C.joker, "p0", { yaku: game.yaku });
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

/**
 * **국이 하나 넘어간** 같은 게임 — 증강 기록(augmentData)은 그대로 들고 본장만 올린다.
 * `engine.state`는 읽기 전용이라 상태를 갈아 끼우려면 게임을 다시 세워야 한다.
 */
function nextRoundGame(game: Game): Game {
  const prev = game.engine.state;
  const next = createStandardGameFromState({
    ...prev,
    round: { ...prev.round, honba: prev.round.honba + 1 },
  });
  installAugment(next.engine, C.joker, "p0", { yaku: next.yaku });
  return next;
}

function fire(game: Game, player: PlayerId = "p0"): void {
  const res = game.engine.submit({ player, type: "joker_call", payload: {} });
  if (!res.ok) throw new Error(`joker_call failed: ${res.reason}`);
}

const optsOf = (game: Game, p: PlayerId = "p0"): ReturnType<typeof scoringOptionsOf> =>
  scoringOptionsOf(game.engine.state, game.engine.rules, p);

const handKinds = (game: Game, p: PlayerId = "p0"): TileKind[] =>
  handIdsOf(game.engine.state, p).map((id) => game.engine.state.tiles[id]!.kind);

const waitsOf = (game: Game, p: PlayerId = "p0"): string[] =>
  winningKinds(handKinds(game, p), 0, undefined, optsOf(game, p))
    .map(kindKey)
    .sort();

/** 손패 **밖**에 있는 그 종류의 실물 패 (buildWinContext는 손 밖 화료패를 요구한다) */
function outsideTile(game: Game, kind: TileKind, p: PlayerId = "p0"): TileId {
  const inHand = new Set(handIdsOf(game.engine.state, p));
  for (const t of Object.values(game.engine.state.tiles)) {
    if (!inHand.has(t.id) && kindKey(t.kind) === kindKey(kind)) return t.id;
  }
  throw new Error(`no outside tile of ${kindKey(kind)}`);
}

// ───────────────────────── 1·2. 백이 빈자리를 메운다 ─────────────────────────

describe("조커 — 백이 손의 빈자리를 메운다", () => {
  // 111m 999m 55m 23s 白 23p = 13장. 백이 없으면 23s·23p 중 하나만 완성할 수 있다.
  const HAND = "111999m55m23s23p5z";

  it("발동 전에는 백이 그냥 백이다 — 텐파이가 아니다", () => {
    const game = mk(HAND);
    expect(optsOf(game).wildKinds).toBeUndefined();
    expect(waitsOf(game)).toEqual([]);
  });

  it("발동하면 14삭·14통 대기가 된다 (사용자 예시)", () => {
    const game = mk(HAND);
    fire(game);
    expect(optsOf(game).wildKinds?.map(kindKey)).toEqual(["dragon1"]);
    // 백을 하나 더 뽑아도 화료형이라 dragon1도 대기에 들어온다
    expect(waitsOf(game)).toEqual(["dragon1", "pin1", "pin4", "sou1", "sou4"]);
  });

  it("백이 머리도 된다", () => {
    // 111m 234m 567m 234p + 백 = 4멘쯔 + 백 → 백이 머리 반쪽이라 아무 패로도 화료
    const game = mk("111234567m234p5z");
    fire(game);
    // 단기 대기 — 무엇을 뽑아도 백이 그 패로 변해 머리가 된다
    expect(waitsOf(game).length).toBeGreaterThan(30);
  });

  it("손에 백이 없어도 백이 대기에 들어온다 — 잡으면 그 자리에서 조커가 된다", () => {
    const game = mk("111999m55m234s23p"); // 원래는 14통 대기
    fire(game);
    expect(optsOf(game).wildKinds?.map(kindKey)).toEqual(["dragon1"]);
    expect(waitsOf(game)).toEqual(["dragon1", "pin1", "pin4"]);
  });
});

// ───────────────────────── 3·4. 채점 — 가장 비싼 형태 ─────────────────────────

describe("조커 — 화료와 채점", () => {
  it("백이 몸통을 채워 실제로 화료가 성립한다", () => {
    const game = mk("111999m55m23s23p5z");
    fire(game);
    const tile = outsideTile(game, { suit: "sou", rank: 1 });
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "tsumo", tile, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev).not.toBeNull();
    expect(ev?.ok).toBe(true);
  });

  it("변신은 자동으로 **가장 비싼 쪽**이 채택된다", () => {
    /**
     * 234m 678m 234p 23s 5s + 백 → 4삭을 론하면 백이 어느 자리로도 갈 수 있는데,
     * 백을 5삭으로 써서 삼색동순(234)이 서는 형태가 가장 비싸므로 그쪽이 채택돼야 한다.
     */
    const game = mk("234678m234p235s5z");
    fire(game);
    const tile = outsideTile(game, { suit: "sou", rank: 4 });
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "ron", tile, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev?.ok).toBe(true);
    // 백이 4삭(또는 4만/4통)으로 변해 삼색동순까지 서는 형태를 골랐다
    expect(ev?.yaku.map((y) => y.id)).toContain("sanshoku");
  });

  it("화료패가 백이어도 화료가 성립한다 (조커를 론으로 잡는다)", () => {
    // 111m 999m 55m 234s 23p — 14통 대기인데, 백을 잡으면 그 백이 1통/4통이 된다
    const game = mk("111999m55m234s23p");
    fire(game);
    const tile = outsideTile(game, HAKU);
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "tsumo", tile, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev).not.toBeNull();
    expect(ev?.ok).toBe(true);
  });
});

// ───────────────────────── 5. 국 스코프·쿨다운·공개 ─────────────────────────

describe("조커 — 국 스코프와 쿨다운", () => {
  it("발동은 전원에게 공개되고, 쿨다운 잔량은 본인에게만 보인다", () => {
    const game = mk("111999m55m23s23p5z");
    fire(game);
    const state = game.engine.state;
    expect(state.augmentData[cooldownViewKey("joker", "p0")]).toBe(2);
    const view = buildPlayerView(state, "p1", game.engine.rules);
    expect(view.augmentView["joker:p0"]).toBe(true);
  });

  it("효과는 발동한 그 국에만 산다", () => {
    const game = mk("111999m55m23s23p5z");
    fire(game);
    expect(optsOf(game).wildKinds).toBeDefined();

    // 다음 국 — 발동 기록(augmentData)은 그대로 들고 국만 넘긴다
    const next = nextRoundGame(game);
    expect(roundKey(next.engine.state)).not.toBe(roundKey(game.engine.state));
    expect(optsOf(next).wildKinds).toBeUndefined();
  });

  it("같은 국에 두 번은 못 켠다", () => {
    const game = mk("111999m55m23s23p5z");
    fire(game);
    const res = game.engine.submit({ player: "p0", type: "joker_call", payload: {} });
    expect(res.ok).toBe(false);
  });
});

// ───────────────────────── 6. 봇 정책 ─────────────────────────

describe("조커 — 봇 정책", () => {
  const OPTION = { type: "joker_call", payload: {} };

  function ctxFor(hand: string): ReturnType<typeof botCtx> {
    const game = mk(hand);
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    return botCtx(view, [OPTION], { wallLeft: 60, turn: 4 });
  }

  it("백이 없으면 켜지 않는다", () => {
    expect(C.joker.bot?.choose(ctxFor("111999m55m23s233p"))).toBeNull();
  });

  it("백이 손의 빈자리를 메우면 켠다", () => {
    const picked = C.joker.bot?.choose(ctxFor("111999m55m23s23p5z"));
    expect(picked).not.toBeNull();
  });

  it("백을 조커로 바꿔도 손이 나아지지 않으면 켜지 않는다", () => {
    // 555z(백 커쯔)가 이미 몸통으로 일하고 있어 조커로 만들 이유가 없다
    expect(C.joker.bot?.choose(ctxFor("123456789m11p555z"))).toBeNull();
  });

  it("켠 뒤에는 백을 버리지 않는다 — 샹텐이 백을 몸통으로 센다", () => {
    const game = mk("111999m55m23s23p5z");
    fire(game);
    const opts = optsOf(game);
    const hand = handKinds(game);
    const keep = shantenOf(hand, 0, opts);
    const dropHaku = shantenOf(
      hand.filter((k) => kindKey(k) !== kindKey(HAKU)),
      0,
      opts,
    );
    expect(dropHaku).toBeGreaterThan(keep);
  });
});

// ───────────────────────── 7. 쿨다운 카운터 배선 ─────────────────────────

describe("조커 — 2국에 1회", () => {
  it("발동한 자리에서 2국 잠기고, 국이 지날 때마다 하나씩 풀린다", () => {
    const game = mk("111999m55m23s23p5z");
    const left = (): unknown =>
      game.engine.state.augmentData[cooldownViewKey("joker", "p0")];
    expect(left()).toBeUndefined();
    fire(game);
    expect(left()).toBe(2);
    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(left()).toBe(1);
    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(left()).toBe(0);
  });
});

