/**
 * 허장성세(bluff_pretense) #496 «퐁으로 완성 시 화료» 게이트 재현 — QA 계획 55 §2-2 C-6 / §4 A-7.
 *
 * ## 의심
 *
 * `bluff_pretense.ts`의 CALL_MADE 반응은 «방금 눕힌 몸통에 생성패(`attrs.conjured`)가
 * 섞여 있는가»만으로 자기 콜(bluff_pon)을 골라낸다. 그런데 conjured 표식은 허장성세만
 * 찍는 것이 아니다 — 염색·연금술사·조커·거신 등 18개 카드가 같은 표식을 손패에 남긴다.
 * 그 패가 든 **표준 퐁·치**로 손이 완성되면(특히 자기 버림패라 론이 후리텐인 자리)
 * 같은 문이 열려 쯔모 화료가 뜬다 — 주석이 «표준 펑은 열지 않는다(후리텐 우회 뒷문)»고
 * 말한 바로 그 뒷문이다.
 *
 * ## 이 파일의 자리
 *
 * 아래 «표준 퐁·치 직후 win 옵션 없음» 검사는 **되돌리면 실패하는 회귀 테스트**다.
 * HEAD(2786003)에서는 실패한다 = 결함 재현. 게이트를 «방금 콜이 bluff_pon이었는가»로
 * 고치면 통과한다. 대조군(허장성세 자기 콜)은 고친 뒤에도 그대로 열려 있어야 한다.
 *
 * 실행: `npx vitest run qa-lab/round5/repro/bluff_conjured_pon.test.ts`
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
import { craft } from "../../../packages/content/test/helpers.js";
import { bluffPretense } from "../../../packages/content/src/augments/bluff_pretense.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";

const FIVE_PIN = kindKey({ suit: "pin", rank: 5 });
const FIVE_MAN = kindKey({ suit: "man", rank: 5 });
const FOUR_PIN = kindKey({ suit: "pin", rank: 4 });
const CHUN = kindKey({ suit: "dragon", rank: 3 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/** 손패에서 종류가 key인 tileId들 (craft가 넣은 순서) */
function idsOf(state: GameState, player: PlayerId, key: string): TileId[] {
  return handIdsOf(state, player).filter((id) => kindKey(kindOf(state, id)) === key);
}

/**
 * 어느 증강이든 생성패에 남기는 표식 그대로 — `tileKindChanged(..., attrs: { conjured: true })`
 * 의 리듀서 결과(core `augment/events.ts` TILE_KIND_CHANGED)와 같은 모양이다.
 * 염색(tile_dyeing.ts:197)·연금술사·조커·거신 등 18개 파일이 이 한 줄을 찍는다.
 */
function markConjured(state: GameState, id: TileId): GameState {
  const tile = state.tiles[id];
  if (tile === undefined) throw new Error(`no tile ${id}`);
  return { ...state, tiles: { ...state.tiles, [id]: { ...tile, attrs: { ...tile.attrs, conjured: true } } } };
}

function prompt(status: ReturnType<FlowController["begin"]>, player: PlayerId) {
  expect(status.kind, `${player} 프롬프트를 기대했는데 ${status.kind}`).toBe("awaiting");
  const p = status.kind === "awaiting" ? status.prompts.find((x) => x.player === player) : undefined;
  expect(p, `${player} 프롬프트 없음`).toBeDefined();
  return p!;
}

const scoresOf = (state: GameState): Record<string, number> =>
  Object.fromEntries(state.players.map((p) => [p.id, p.score]));

/**
 * 표준 콜 직후의 자기 순 프롬프트에서 win 옵션을 뽑고, (있으면) 실제로 눌러 정산까지 본다.
 * 되돌리면 실패하는 단언은 마지막 한 줄이다 — 그 앞은 실패 메시지에 실을 증거 수집.
 */
function assertNoWinAfterStandardCall(flow: FlowController, game: ReturnType<typeof createStandardGameFromState>, status: ReturnType<FlowController["begin"]>, label: string): void {
  const state = game.engine.state;
  expect(state.round.phase).toBe("turn.act");
  const turn = prompt(status, "p0");
  const win = turn.options.find((o) => o.type === "win");
  let evidence = "";
  if (win !== undefined) {
    const before = scoresOf(state);
    const done = flow.submit("p0", win);
    const after = scoresOf(game.engine.state);
    const delta = Object.fromEntries(Object.keys(before).map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)]));
    evidence = ` — 실제로 눌러 보니 ${done.kind}/${done.kind === "roundOver" ? done.outcome : ""}, 점수 변화 ${JSON.stringify(delta)} (lastDrawnTile=${state.round.lastDrawnTile})`;
  }
  expect(
    win,
    `${label}: 표준 콜(bluff_pon 아님) 직후인데 화료 옵션이 떴다 — 후리텐 우회·방총자 전액→쯔모 분할${evidence}`,
  ).toBeUndefined();
}

describe("허장성세 C-6 — 다른 증강의 생성패가 든 표준 퐁·치로 손이 완성될 때", () => {
  /**
   * ① 실제 염색 액션으로 conjured 를 만드는 정공법 장면.
   *
   * p0(오야) 자기 순: 123m456m789m99p 5p 5m + 쯔모 5p. 염색으로 5m→5p(conjured), 원본 5p 하나를
   * 버려 **5p 후리텐**. p1이 5p를 버리면 p0에게는 론 없이(후리텐) 표준 퐁만 뜬다 —
   * 손에 5p가 2장이라 bluff_pon 후보도 없다. 그 퐁으로 123m456m789m99p + 555p = 완성(일기통관).
   */
  it("[재현] 염색으로 만든 5p가 든 표준 퐁 → 후리텐인데 쯔모 화료 문이 열린다", () => {
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

    // 염색: 5m → 5p (conjured 표식은 tile_dyeing.ts:197 이 찍는다)
    const fiveMan = idsOf(game.engine.state, "p0", FIVE_MAN)[0]!;
    const dyed = game.engine.submit({ player: "p0", type: "tile_dye", payload: { tileId: fiveMan, suit: "pin" } });
    expect(dyed.ok, `염색 실패: ${dyed.ok ? "" : dyed.reason}`).toBe(true);
    expect(game.engine.state.tiles[fiveMan]?.attrs.conjured).toBe(true);
    expect(kindKey(kindOf(game.engine.state, fiveMan))).toBe(FIVE_PIN);

    const flow = new FlowController(game.engine);
    let status = flow.begin();

    // p0: 쯔모한 원본 5p를 버린다 → 5p 후리텐
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(kindKey(kindOf(game.engine.state, drawn))).toBe(FIVE_PIN);
    const dis0 = prompt(status, "p0").options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId === drawn,
    );
    expect(dis0).toBeDefined();
    status = flow.submit("p0", dis0!);
    expect(game.engine.state.round.byPlayer["p0"]?.discardedKinds).toContain(FIVE_PIN);

    // 아무도 반응하지 못하고 p1 순 → p1이 5p를 버린다
    const p1turn = prompt(status, "p1");
    const p1five = idsOf(game.engine.state, "p1", FIVE_PIN)[0]!;
    const dis1 = p1turn.options.find(
      (o) => o.type === "discard" && (o.payload as { tileId: TileId }).tileId === p1five,
    );
    expect(dis1).toBeDefined();
    status = flow.submit("p1", dis1!);

    // p0 리액션: 론 없음(후리텐) · bluff_pon 없음(2장) · 표준 퐁만
    const react = prompt(status, "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    expect(react.options.some((o) => o.type === "bluff_pon"), "2장인데 bluff_pon이 떴다").toBe(false);
    const pon = react.options.find((o) => o.type === "pon");
    expect(pon, "표준 퐁 후보 없음").toBeDefined();
    const ponIds = (pon!.payload as { tileIds: TileId[] }).tileIds;
    expect(ponIds).toContain(fiveMan); // 염색된 conjured 패가 몸통에 들어간다

    // 다른 좌석 프롬프트가 함께 떠 있으면 패스시킨다
    let s = flow.submit("p0", pon!);
    while (s.kind === "awaiting" && s.prompts.every((p) => p.player !== "p0")) {
      const other = s.prompts[0]!;
      s = flow.submit(other.player, other.options.find((o) => o.type === "pass")!);
    }

    expect(game.engine.state.round.byPlayer["p0"]?.melds.at(-1)?.kind).toBe("pon");
    assertNoWinAfterStandardCall(flow, game, s, "염색 5p 표준 퐁");
  });

  /**
   * ② 표식만 찍은 장면(어느 생성 증강이든 같다) — 표준 퐁.
   * p0: 123m456m789m99p 5p 5p(conjured), 자기 버림 5p(후리텐). p1이 5p를 버린다.
   */
  it("[재현] conjured 표식만 있는 5p가 든 표준 퐁 → 화료 문이 열린다", () => {
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

    const react = prompt(flow.begin(), "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    expect(react.options.some((o) => o.type === "bluff_pon")).toBe(false);
    const pon = react.options.find((o) => o.type === "pon");
    expect(pon).toBeDefined();
    let s = flow.submit("p0", pon!);
    while (s.kind === "awaiting" && s.prompts.every((p) => p.player !== "p0")) {
      const other = s.prompts[0]!;
      s = flow.submit(other.player, other.options.find((o) => o.type === "pass")!);
    }
    assertNoWinAfterStandardCall(flow, game, s, "표식만 찍은 5p 표준 퐁");
  });

  /**
   * ③ 표준 치 — 멜드 종류도 안 본다.
   * p0: 123m456m789m99p 3p 4p(conjured), 자기 버림 5p(후리텐). 상가 p3가 5p를 버린다 → 345p 치.
   */
  it("[재현] conjured 4p가 든 표준 치(345p) → 화료 문이 열린다", () => {
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

    const react = prompt(flow.begin(), "p0");
    expect(react.options.some((o) => o.type === "win"), "후리텐인데 론이 떴다").toBe(false);
    const chi = react.options.find((o) => o.type === "chi");
    expect(chi, "치 후보 없음").toBeDefined();
    let s = flow.submit("p0", chi!);
    while (s.kind === "awaiting" && s.prompts.every((p) => p.player !== "p0")) {
      const other = s.prompts[0]!;
      s = flow.submit(other.player, other.options.find((o) => o.type === "pass")!);
    }
    expect(game.engine.state.round.byPlayer["p0"]?.melds.at(-1)?.kind).toBe("chi");
    assertNoWinAfterStandardCall(flow, game, s, "conjured 4p 표준 치");
  });

  /**
   * 대조 ④ — 같은 장면에서 conjured 표식이 없으면 문이 닫혀 있다.
   * 게이트가 «표식 하나»뿐임을 보인다(HEAD에서도 통과).
   */
  it("[대조] 표식이 없는 표준 퐁은 화료 문이 안 열린다", () => {
    const base = craft({
      hands: { p0: "123m456m789m99p5p5p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5p", p1: "", p2: "", p3: "" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5p" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const pon = prompt(flow.begin(), "p0").options.find((o) => o.type === "pon")!;
    let s = flow.submit("p0", pon);
    while (s.kind === "awaiting" && s.prompts.every((p) => p.player !== "p0")) {
      const other = s.prompts[0]!;
      s = flow.submit(other.player, other.options.find((o) => o.type === "pass")!);
    }
    expect(prompt(s, "p0").options.some((o) => o.type === "win")).toBe(false);
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
  });

  /**
   * 대조 ⑤ — 허장성세 **자기 콜**(bluff_pon)은 열려야 한다 (#496 의 약속, bluff_pretense_win.test.ts).
   * 게이트를 고쳐도 이 문은 그대로여야 한다.
   */
  it("[대조] bluff_pon 으로 완성되면 화료 문이 열린다 (정상 경로)", () => {
    const base = craft({
      hands: { p0: "123m456m789m99p7z1s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "7z" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const chun = idsOf(game.engine.state, "p0", CHUN)[0]!;
    let s = flow.begin();
    s = flow.submit("p0", { type: "bluff_pon", payload: { tileId: chun } } as ActionOption);
    const win = prompt(s, "p0").options.find((o) => o.type === "win");
    expect(win, "허장성세 자기 콜로 완성됐는데 화료 옵션이 없다").toBeDefined();
    expect(flow.submit("p0", win!).kind).toBe("roundOver");
  });
});
