/**
 * **허장성세로 퐁을 쳐서 손이 완성되면 화료할 수 있어야 한다** (2026-09-08 사용자 보고).
 *
 * 이 증강은 잡패 한 장을 목표패로 바꿔 커쯔를 채운다. 그래서 남은 열한 장이 이미
 * 3멘쯔 + 머리인 자리에서는 **퐁이 그대로 손을 끝낸다.** 그런데 표준 화료 액션은
 * 자기 순에서 `lastDrawnTile`을 요구하고 그 값은 콜 직후 null이라, 완성된 손을 눈앞에
 * 두고도 화료 표시가 뜨지 않았다 — 이길 수 없는 손을 들고 타패를 강요당했다.
 *
 * 지불은 쯔모 취급이다(`bluff_pretense.ts` completedWinTile 주석). 버린 사람은
 * 펑당했을 뿐이고, 그 패 한 장으로는 이 손이 서지 않았기 때문이다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";
import { tileDyeing } from "../src/augments/tile_dyeing.js";

/** 中(dragon3) */
const CHUN = kindKey({ suit: "dragon", rank: 3 });
const FIVE_PIN = kindKey({ suit: "pin", rank: 5 });
const FIVE_MAN = kindKey({ suit: "man", rank: 5 });
const FOUR_PIN = kindKey({ suit: "pin", rank: 4 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/**
 * p0: 123m 456m 789m 99p (= 3멘쯔 + 머리, 열한 장) + 中 한 장 + 고립된 1삭.
 * p1이 中을 버린다 → 허장성세로 1삭이 中이 되어 커쯔가 서고, 그 순간 손이 끝난다.
 * 역은 역패(中)라 열린 손이어도 성립한다.
 */
function scene() {
  const base = craft({
    hands: { p0: "123m456m789m99p7z1s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "7z" },
  });
  const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
  installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
  return game;
}

describe("허장성세 — 퐁이 손을 끝냈을 때", () => {
  it("퐁 직후 화료 옵션이 뜨고, 쯔모로 정산된다", () => {
    const game = scene();
    const flow = new FlowController(game.engine);
    const bluff = { type: "bluff_pon", payload: { tileId: handIdsOf(game.engine.state, "p0").find((id) => kindKey(kindOf(game.engine.state, id)) === CHUN)! } };

    let status = flow.begin();
    expect(status.kind).toBe("awaiting");
    status = flow.submit("p0", bluff as ActionOption);

    // 퐁이 서고 손이 완성됐다 — 이제 «방금 뽑은 패» 자리가 채워져 화료 버튼이 뜬다
    expect(status.kind).toBe("awaiting");
    const prompt = status.kind === "awaiting" ? status.prompts[0] : undefined;
    expect(prompt?.player).toBe("p0");
    const win = (prompt?.options as ActionOption[]).find((o) => o.type === "win");
    expect(win, "퐁으로 손이 완성됐는데 화료 옵션이 없다").toBeDefined();

    const done = flow.submit("p0", win!);
    expect(done.kind).toBe("roundOver");
    expect(done.kind === "roundOver" ? done.outcome : null).toBe("win");
  });

  it("손이 안 끝났으면 화료 옵션은 뜨지 않는다 — 문은 완성된 손에만 열린다", () => {
    const base = craft({
      hands: { p0: "123m456m78m99p22s7z1s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "7z" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const chun = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === CHUN,
    )!;
    let status = flow.begin();
    status = flow.submit("p0", { type: "bluff_pon", payload: { tileId: chun } } as ActionOption);
    const prompt = status.kind === "awaiting" ? status.prompts[0] : undefined;
    expect((prompt?.options as ActionOption[]).some((o) => o.type === "win")).toBe(false);
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
  });

  /*
   * **완성된 몸통은 재료가 되지 않는다** (2026-09-04 사용자 보고, #467 재적용 2026-09-16).
   *
   * 예전 재료 선정은 «이웃이 가장 적은 패»를 골랐다 — 손패 123m 456m 99p 88s 55s + 中 에서
   * 몸통 끝의 1만과 각 또이쯔는 이어짐 점수가 같고(2), 동점이면 손패 앞쪽이 그냥 뽑혀
   * **완성 몸통 123m의 1만이** 재료로 타 버렸다. 이제는 후보마다 "펑을 한 뒤의 손"을
   * 그대로 만들어 샹텐을 재므로(`spareTile.pickSpareTiles`), 몸통을 깨는 1만(1샹텐)이
   * 아니라 또이쯔 하나(텐파이)가 재료가 된다.
   */
  it("완성된 몸통(123m)은 재료가 되지 않는다 — 펑 뒤의 손이 좋아지는 잡패가 탄다", () => {
    const base = craft({
      hands: { p0: "123m456m99p88s55s7z", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "7z" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const chun = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === CHUN,
    )!;
    const r = game.engine.submit({ player: "p0", type: "bluff_pon", payload: { tileId: chun } });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    const keys = handIdsOf(st, "p0").map((id) => kindKey(kindOf(st, id)));
    // 두 완성 몸통은 한 장도 빠지지 않았다
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      expect(keys.filter((k) => k === kindKey({ suit: "man", rank })).length).toBe(1);
    }
    // 재료는 또이쯔 하나(9p·8s·5s 중 하나)에서 나왔다 — 中 커쯔가 섰다
    const melds = st.round.byPlayer["p0"]?.melds ?? [];
    expect(melds.length).toBe(1);
    expect(melds[0]?.tileIds.every((id) => kindKey(kindOf(st, id)) === CHUN)).toBe(true);
  });
});

/** 손패에서 종류가 key인 tileId들 (craft가 넣은 순서) */
function idsOf(state: GameState, player: PlayerId, key: string): TileId[] {
  return handIdsOf(state, player).filter((id) => kindKey(kindOf(state, id)) === key);
}

/**
 * 어느 증강이든 생성패에 남기는 표식 그대로 — `tileKindChanged(..., attrs: { conjured: true })`
 * 의 리듀서 결과와 같은 모양. 염색·연금술사·조커·거신 등 18개 파일이 이 한 줄을 찍는다.
 */
function markConjured(state: GameState, id: TileId): GameState {
  const tile = state.tiles[id];
  if (tile === undefined) throw new Error(`no tile ${id}`);
  return { ...state, tiles: { ...state.tiles, [id]: { ...tile, attrs: { ...tile.attrs, conjured: true } } } };
}

function promptOf(status: ReturnType<FlowController["begin"]>, player: PlayerId) {
  expect(status.kind, `${player} 프롬프트를 기대했는데 ${status.kind}`).toBe("awaiting");
  const p = status.kind === "awaiting" ? status.prompts.find((x) => x.player === player) : undefined;
  expect(p, `${player} 프롬프트 없음`).toBeDefined();
  return p!;
}

/** 다른 자리의 리액션(pass)을 다 넘기고 p0 프롬프트가 올 때까지 진행 */
function passOthers(flow: FlowController, s: ReturnType<FlowController["begin"]>) {
  while (s.kind === "awaiting" && s.prompts.every((p) => p.player !== "p0")) {
    const other = s.prompts[0]!;
    s = flow.submit(other.player, other.options.find((o) => o.type === "pass")!);
  }
  return s;
}

/**
 * **문은 bluff_pon 에만 열린다** (QA 5라운드 C-6 / A-7, 2026-09-16).
 *
 * 예전 게이트는 «방금 눕힌 몸통에 conjured 패가 있는가»였다. 그 표식은 염색·연금술사·
 * 조커·거신 등 18개 카드가 공유하므로, 다른 증강이 만든 패가 든 **표준 퐁·치**로 손이
 * 완성되면 후리텐 자리에서 쯔모 화료가 떴다(론은 후리텐이라 막히는데 퐁으로 우회) —
 * 방총자 전액 지불이 쯔모 분할로 바뀌는 문제까지 겹친다. 이제는 CALL_MADE 의
 * `payload.via === "bluff_pon"` 만 본다. 아래 세 장면은 게이트를 되돌리면 실패한다.
 */
describe("허장성세 — 다른 증강의 생성패가 든 표준 퐁·치는 문을 열지 않는다", () => {
  function assertNoWinAfterStandardCall(
    flow: FlowController,
    game: ReturnType<typeof createStandardGameFromState>,
    status: ReturnType<FlowController["begin"]>,
    label: string,
  ): void {
    expect(game.engine.state.round.phase).toBe("turn.act");
    const win = promptOf(status, "p0").options.find((o) => o.type === "win");
    expect(win, `${label}: 표준 콜(bluff_pon 아님) 직후인데 화료 옵션이 떴다 — 후리텐 우회`).toBeUndefined();
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
  }

  /**
   * ① 실제 염색 액션으로 conjured 를 만드는 정공법.
   * p0(오야) 자기 순: 123m456m789m99p 5p 5m + 쯔모 5p. 염색으로 5m→5p(conjured), 원본 5p 하나를
   * 버려 5p 후리텐. p1이 5p를 버리면 론 없이 표준 퐁만 뜬다(손에 5p 2장이라 bluff_pon 후보도
   * 없다). 그 퐁으로 123m456m789m99p + 555p = 완성(일기통관).
   */
  it("염색으로 만든 5p가 든 표준 퐁 — 후리텐이면 쯔모 화료도 없다", () => {
    const base = craft({
      hands: { p0: "123m456m789m99p5p5m5p", p1: "123s456s789s11z3z5p", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = withAug(base, "p0", ["bluff_pretense", "tile_dyeing"]);
    const game = createStandardGameFromState(state, undefined, [bluffPretense, tileDyeing]);
    installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });

    const fiveMan = idsOf(game.engine.state, "p0", FIVE_MAN)[0]!;
    const dyed = game.engine.submit({ player: "p0", type: "tile_dye", payload: { tileId: fiveMan, suit: "pin" } });
    expect(dyed.ok, `염색 실패: ${dyed.ok ? "" : dyed.reason}`).toBe(true);
    expect(game.engine.state.tiles[fiveMan]?.attrs.conjured).toBe(true);

    const flow = new FlowController(game.engine);
    let status = flow.begin();

    // p0: 쯔모한 원본 5p를 버린다 → 5p 후리텐
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe(FIVE_PIN);
    const dis0 = promptOf(status, "p0").options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId === drawn,
    )!;
    status = flow.submit("p0", dis0);

    // p1이 5p를 버린다
    const p1five = idsOf(game.engine.state, "p1", FIVE_PIN)[0]!;
    const dis1 = promptOf(status, "p1").options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId === p1five,
    )!;
    status = flow.submit("p1", dis1);

    const react = promptOf(status, "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    expect(react.options.some((o) => o.type === "bluff_pon"), "2장인데 bluff_pon이 떴다").toBe(false);
    const pon = react.options.find((o) => o.type === "pon");
    expect(pon).toBeDefined();
    status = passOthers(flow, flow.submit("p0", pon!));

    expect(game.engine.state.round.byPlayer["p0"]?.melds.at(-1)?.kind).toBe("pon");
    assertNoWinAfterStandardCall(flow, game, status, "염색 5p 표준 퐁");
  });

  /** ② 표식만 찍은 장면(어느 생성 증강이든 같다) — 표준 퐁. 자기 버림 5p(후리텐), p1이 5p. */
  it("conjured 표식만 있는 5p가 든 표준 퐁 — 문이 닫혀 있다", () => {
    const base = craft({
      hands: { p0: "123m456m789m99p5p5p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5p", p1: "", p2: "", p3: "" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5p" },
    });
    const conj = idsOf(base, "p0", FIVE_PIN)[1]!;
    const state = markConjured(withAug(base, "p0", ["bluff_pretense"]), conj);
    const game = createStandardGameFromState(state);
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const react = promptOf(flow.begin(), "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    expect(react.options.some((o) => o.type === "bluff_pon")).toBe(false);
    const pon = react.options.find((o) => o.type === "pon");
    expect(pon).toBeDefined();
    const s = passOthers(flow, flow.submit("p0", pon!));
    assertNoWinAfterStandardCall(flow, game, s, "표식만 찍은 5p 표준 퐁");
  });

  /** ③ 표준 치 — 멜드 종류도 무관. 4p(conjured), 자기 버림 5p(후리텐), 상가 p3가 5p → 345p 치. */
  it("conjured 4p가 든 표준 치(345p) — 문이 닫혀 있다", () => {
    const base = craft({
      hands: { p0: "123m456m789m99p3p4p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5p", p1: "", p2: "", p3: "" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: "5p" },
    });
    const conj = idsOf(base, "p0", FOUR_PIN)[0]!;
    const state = markConjured(withAug(base, "p0", ["bluff_pretense"]), conj);
    const game = createStandardGameFromState(state);
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const react = promptOf(flow.begin(), "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    const chi = react.options.find((o) => o.type === "chi");
    expect(chi, "치 후보 없음").toBeDefined();
    const s = passOthers(flow, flow.submit("p0", chi!));
    expect(game.engine.state.round.byPlayer["p0"]?.melds.at(-1)?.kind).toBe("chi");
    assertNoWinAfterStandardCall(flow, game, s, "conjured 4p 표준 치");
  });

  /** 판정 근거가 로그에 남는다 — 리플레이 재구성에서도 같은 게이트가 선다 */
  it("bluff_pon 의 CALL_MADE 이벤트에 via: \"bluff_pon\" 이 실린다", () => {
    const game = scene();
    const chun = idsOf(game.engine.state, "p0", CHUN)[0]!;
    const r = game.engine.submit({ player: "p0", type: "bluff_pon", payload: { tileId: chun } });
    expect(r.ok).toBe(true);
    const made = game.engine.eventLog.find((e) => e.type === "CallMade");
    expect((made?.payload as { via?: string } | undefined)?.via).toBe("bluff_pon");
  });
});
