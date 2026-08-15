/**
 * hand_manip 그룹 테스트 — 손패 조작 증강 4종.
 * suit_unify / red_five_touch / hand_swap3 / full_hand_swap
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SYSTEM_PLAYER,
  TILE_KIND_CHANGED,
  WALL,
  buildPlayerView,
  createStandardGameFromState,
  handIdsOf,
  handZone,
  installAugment,
  isNumberSuit,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey, roundViewKey, viewKey } from "../src/util.js";
import { suitUnify } from "../src/augments/suit_unify.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { trueDragon } from "../src/augments/true_dragon.js";

/** 크래프트 상태에 보유 증강을 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

// ─────────────────────────── suit_unify ───────────────────────────

describe("suit_unify — 단색 세계", () => {
  /** 동1국·자기 첫 턴(아직 안 버림) 상태의 p0 손패를 만든다 */
  function craftFirstHand(discards?: string): GameState {
    return withAugments(
      craft({
        hands: { p0: "123m456m789p123s99p", p1: "*", p2: "*", p3: "*" },
        ...(discards !== undefined ? { discards: { p0: discards } } : {}),
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
        seed: 11,
      }),
      "p0",
      ["suit_unify"],
    );
  }

  it("발동 전후 어느 쪽도 역을 봉인하지 않는다 — 청일색까지 그대로 (48차)", () => {
    const game = createStandardGameFromState(craftFirstHand());
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    const resolveFor = (pid: PlayerId): string[] =>
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: pid,
        state: game.engine.state,
      });

    expect(resolveFor("p0")).not.toContain("chinitsu");

    const res = game.engine.submit({ player: "p0", type: "mono_world", payload: { suit: "pin" } });
    expect(res.ok).toBe(true);

    // 리미트는 횟수(게임당 1회)뿐 — 통일해 준 색으로 청일색을 그대로 노릴 수 있다
    expect(resolveFor("p0")).toEqual([]);
    expect(resolveFor("p1")).toEqual([]);
  });

  it("첫 패를 받은 자기 턴에 버튼으로 발동하면 수패가 무작위 한 종류로 통일되고 전원 공개된다", () => {
    const game = createStandardGameFromState(craftFirstHand());
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    const before = game.engine.state;

    // 자기 턴 프롬프트에 발동 버튼이 뜬다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    // 이 크래프트 상태의 패산에는 통수가 넉넉하다 — 실물 교환 경로를 확인하려고 통수를 고른다
    const option = prompt.options.find(
      (o) => o.type === "mono_world" && (o.payload as { suit?: string }).suit === "pin",
    );
    expect(option).toBeDefined();

    flow.submit("p0", option as { type: string; payload: unknown });

    const state = game.engine.state;
    const suit = state.augmentData["view:*:suit_unify:p0#round"];
    expect(suit).toBe("pin");
    // 손패의 모든 수패가 공개된 종류로 통일 (자패는 그대로)
    const hand = handIdsOf(state, "p0");
    for (const id of hand) {
      const kind = kindOf(state, id);
      if (isNumberSuit(kind)) expect(kind.suit).toBe(suit);
    }
    // 손패 장수는 그대로 (개벽과 같은 1:1 실물 교환)
    expect(hand).toHaveLength(handIdsOf(before, "p0").length);
    // 패산 장수도 그대로 — 내보낸 만큼 되받는다
    expect(state.zones[WALL]?.tileIds).toHaveLength(before.zones[WALL]?.tileIds.length ?? 0);

    // 생성(conjured)은 **패산에 그 숫자의 통수가 없었을 때만** 일어난다.
    // 있었으면 실물과 맞바꾸므로 새 패를 만들지 않는다 (2026-07-31 실물 교환 규약).
    const availableByRank = new Map<number, number>();
    for (const id of before.zones[WALL]?.tileIds ?? []) {
      const k = kindOf(before, id);
      if (k.suit !== "pin") continue;
      availableByRank.set(k.rank, (availableByRank.get(k.rank) ?? 0) + 1);
    }
    let realSwaps = 0;
    for (const id of handIdsOf(before, "p0")) {
      const k = kindOf(before, id);
      if (!isNumberSuit(k) || k.suit === "pin") continue;
      const left = availableByRank.get(k.rank) ?? 0;
      if (left > 0) {
        availableByRank.set(k.rank, left - 1);
        realSwaps++;
      } else {
        // 패산이 비어 그 자리에서 만들어진 패 — conjured 표식이 붙는다
        expect(state.tiles[id]?.attrs.conjured).toBe(true);
      }
    }
    expect(realSwaps).toBeGreaterThan(0); // 실물 교환 경로가 실제로 돈다
    // 사용 카운터
    expect(state.augmentData["suit_unify:uses:p0"]).toBe(1);
  });

  it("동풍전 1회만·첫 패에만 발동한다", () => {
    // 발동 → 사용 카운터 → 재사용 거부 (동풍전이라 1회)
    const first0 = craftFirstHand();
    const game = createStandardGameFromState({
      ...first0,
      config: { ...first0.config, mode: "tonpuu" },
    });
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    const first = game.engine.submit({ player: "p0", type: "mono_world", payload: { suit: "pin" } });
    expect(first.ok).toBe(true);
    const again = game.engine.submit({ player: "p0", type: "mono_world", payload: { suit: "pin" } });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("already used");

    // 이미 한 번 버린 뒤(첫 패가 아님)엔 발동할 수 없다
    const g2 = createStandardGameFromState(craftFirstHand("1z"));
    installAugment(g2.engine, suitUnify, "p0", { yaku: g2.yaku });
    const late = g2.engine.submit({ player: "p0", type: "mono_world", payload: { suit: "pin" } });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe("only on the first hand");
  });
});

// ─────────────────────────── red_five_touch ───────────────────────────

describe("red_five_touch — 붉은 손길", () => {
  function craftRedState(): GameState {
    // 5가 6장 (각 suit 2장씩 — 첫 사본은 원래 적도라, 둘째는 일반)
    const s = craft({
      hands: { p0: "55m55p55s12346m789p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["red_five_touch"]);
  }

  // 52차(docs/16 §1b B): 5 고정 → 1~9 중 지정. payload가 {} → { rank }로 바뀌었다.
  it("자기 턴 프롬프트에 노출되고, 지정한 숫자가 전부 적도라가 된다 (게임당 1회)", () => {
    const game = createStandardGameFromState(craftRedState());
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });

    const countRedFives = (state: GameState): number =>
      handIdsOf(state, "p0").filter((id) => {
        const kind = kindOf(state, id);
        return (
          isNumberSuit(kind) &&
          kind.rank === 5 &&
          state.tiles[id]?.attrs.red === true
        );
      }).length;
    expect(countRedFives(game.engine.state)).toBe(3); // 원래 적도라 3장뿐

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    // 손패에 실제로 있는 랭크만 후보로 나온다 (1·2·3·4·5·6·7·8·9 중 이 손에 있는 것)
    const rankOptions = prompt.options.filter((o) => o.type === "red_touch");
    expect(rankOptions.length).toBeGreaterThan(0);
    const ranks = rankOptions.map((o) => (o.payload as { rank: number }).rank);
    expect(ranks).toContain(5);
    expect(ranks).not.toContain(0);
    const option = rankOptions.find((o) => (o.payload as { rank: number }).rank === 5);
    expect(option).toBeDefined();

    const next = flow.submit("p0", option as { type: string; payload: unknown });

    const state = game.engine.state;
    expect(countRedFives(state)).toBe(6); // 손패의 5 전부 적도라
    expect(state.augmentData["red_five_touch:used:p0"]).toBe(true);
    // 같은 턴이 이어지고 (phase 유지), red_touch는 더 이상 제시되지 않는다
    expect(state.round.phase).toBe("turn.act");
    if (next.kind !== "awaiting") throw new Error("expected awaiting");
    const reprompt = next.prompts.find((p) => p.player === "p0")!;
    expect(reprompt.options.some((o) => o.type === "red_touch")).toBe(false);
    expect(reprompt.options.some((o) => o.type === "discard")).toBe(true);
    // 재사용 거부
    const again = game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 3 } });
    expect(again.ok).toBe(false);
  });

  it("지정한 숫자는 이후 뽑는 패·다음 국 배패에도 계속 각인된다 (2026-07-31 버프)", () => {
    const game = createStandardGameFromState(craftRedState());
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    expect(
      game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 5 } }).ok,
    ).toBe(true);
    expect(game.engine.state.augmentData["red_five_touch:rank:p0"]).toBe(5);

    /*
     * "이 패가 p0에게 적도라로 값하는가" — helpers의 redCount와 같은 정의를 쓴다.
     * 각인(redFor)이 없는 **자연 적도라**는 누구에게나 적도라이므로 여기 포함된다.
     * (붉은 손길은 자연 적도라에는 각인을 찍지 않는다 — docs/25 국면 #13)
     */
    const isRed5 = (state: GameState, id: TileId): boolean => {
      const k = kindOf(state, id);
      const owner = state.tiles[id]?.attrs.redFor;
      return (
        isNumberSuit(k) &&
        k.rank === 5 &&
        state.tiles[id]?.attrs.red === true &&
        (owner === undefined || owner === "p0")
      );
    };

    // 한 장 버리고 턴을 넘겨 p0이 새로 쯔모할 때까지 돌린다
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 200) {
      const prompt = status.prompts[0]!;
      const drew =
        prompt.player === "p0" &&
        prompt.options.some((o) => o.type === "discard") &&
        game.engine.state.round.lastDrawnTile !== null &&
        guard > 1;
      if (drew) break;
      const pick =
        prompt.options.find((o) => o.type === "discard") ??
        prompt.options.find((o) => o.type === "pass") ??
        prompt.options[0]!;
      status = flow.submit(prompt.player, pick);
    }
    // 새로 뽑은 패가 5라면 그 자리에서 적도라가 되어 있다 (아니면 5가 안 왔을 뿐)
    for (const id of handIdsOf(game.engine.state, "p0")) {
      const k = kindOf(game.engine.state, id);
      if (isNumberSuit(k) && k.rank === 5) expect(isRed5(game.engine.state, id)).toBe(true);
    }

    // 다음 국 — setupRound가 tiles를 원본으로 되돌려도 각인이 다시 새겨진다
    const settle = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleAbort",
      payload: { reason: "kyushuKyuhai" },
    });
    expect(settle.ok).toBe(true);
    expect(
      game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} }).ok,
    ).toBe(true);
    const next = game.engine.state;
    const fives = handIdsOf(next, "p0").filter((id) => {
      const k = kindOf(next, id);
      return isNumberSuit(k) && k.rank === 5;
    });
    for (const id of fives) expect(isRed5(next, id)).toBe(true);
  });

  it("5가 아닌 숫자도 지정할 수 있다 (52차: 아무 숫자나)", () => {
    const game = createStandardGameFromState(craftRedState());
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    const countRed = (state: GameState, rank: number): number =>
      handIdsOf(state, "p0").filter((id) => {
        const kind = kindOf(state, id);
        return (
          isNumberSuit(kind) && kind.rank === rank && state.tiles[id]?.attrs.red === true
        );
      }).length;
    // 1은 손패에 1장(1m)뿐이고 원래 적도라가 아니다
    expect(countRed(game.engine.state, 1)).toBe(0);
    const r = game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 1 } });
    expect(r.ok).toBe(true);
    expect(countRed(game.engine.state, 1)).toBeGreaterThan(0);
    // 5는 건드리지 않았으므로 원래대로 3장
    expect(countRed(game.engine.state, 5)).toBe(3);
  });

  it("손패에 그 숫자가 없으면 쓸 수 없다", () => {
    const s = withAugments(
      craft({
        hands: { p0: "123m678m789m12312p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["red_five_touch"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    // 이 손(123m678m789m12312p)에는 5가 한 장도 없다
    const result = game.engine.submit({ player: "p0", type: "red_touch", payload: { rank: 5 } });
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────── hand_swap3 ───────────────────────────

describe("hand_swap3 — 등가교환", () => {
  function craftSwapState(seed = 1): GameState {
    const s = craft({
      hands: {
        p0: "123m456m789m123p99p", // 13장 + 마지막이 쯔모패 취급 (14장)
        p1: "111p222p333s44s55z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed,
    });
    return withAugments(s, "p0", ["hand_swap3"]);
  }

  /** 국 단위 상태 키 (구현이 roundKey를 키에 섞는다) */
  const targetKeyOf = (s: GameState): string =>
    `hand_swap3:target:${roundKey(s)}:p0`;
  const leftKeyOf = (s: GameState): string =>
    `hand_swap3:left:${roundKey(s)}:p0`;
  const giveKeyOf = (s: GameState): string =>
    `hand_swap3:give:${roundKey(s)}:p0`;
  const revealKeyOf = (target: PlayerId): string =>
    roundViewKey("p0", `revealTiles:${target}`);

  type Game = ReturnType<typeof createStandardGameFromState>;

  /** 오름차순 3장 (제시 옵션과 JSON 완전일치해야 하므로 정렬이 필수) */
  const triple = (ids: readonly TileId[], from = 0): TileId[] =>
    [...ids].sort((a, b) => a - b).slice(from, from + 3);

  /** 지정 액션 제출 */
  function aim(game: Game, target: PlayerId) {
    return game.engine.submit({ player: "p0", type: "swap3", payload: { target } });
  }
  /** 넘길 내 3장 선택 */
  function give(game: Game, gives: TileId[]) {
    return game.engine.submit({
      player: "p0",
      type: "swap3_give",
      payload: { gives },
    });
  }
  /** 가져올 상대 3장 선택 (여기서 실제 교환) */
  function take(game: Game, takes: TileId[]) {
    return game.engine.submit({
      player: "p0",
      type: "swap3_take",
      payload: { takes },
    });
  }

  it("상대를 지정해도 손패는 전혀 움직이지 않고, 상대 손패가 나에게만 공개된다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    const before = game.engine.state;
    const p0Before = [...(before.zones[handZone("p0")]?.tileIds ?? [])];
    const p1Before = [...(before.zones[handZone("p1")]?.tileIds ?? [])];
    const prngBefore = before.prngState;
    const drawnBefore = before.round.lastDrawnTile;

    expect(aim(game, "p1").ok).toBe(true);

    const state = game.engine.state;
    // 손패는 양쪽 다 그대로 (중간 상태에서 장수가 깨지지 않는다)
    expect([...(state.zones[handZone("p0")]?.tileIds ?? [])]).toEqual(p0Before);
    expect([...(state.zones[handZone("p1")]?.tileIds ?? [])]).toEqual(p1Before);
    expect(state.round.lastDrawnTile).toBe(drawnBefore);
    // 무작위를 전혀 쓰지 않는다
    expect(state.prngState).toBe(prngBefore);
    // 게임 사용 1회 소비 + 이번 국 지정·3:3 교환 1회
    expect(state.augmentData["hand_swap3:used:p0"]).toBe(1);
    expect(state.augmentData[targetKeyOf(state)]).toBe("p1");
    expect(state.augmentData[leftKeyOf(state)]).toBe(1);
    expect(state.augmentData[giveKeyOf(state)]).toEqual([]);
    // 대상의 실제 손패가 보유자 전용 채널로 공개된다
    expect(state.augmentData[revealKeyOf("p1")]).toEqual(p1Before);

    // 보유자 뷰에는 상대 손패가 '진짜 패'로 실리고, 제3자 뷰에는 없다
    const holderView = buildPlayerView(state, "p0", game.engine.rules);
    for (const id of p1Before) expect(holderView.tiles[id]).toBeDefined();
    const otherView = buildPlayerView(state, "p2", game.engine.rules);
    for (const id of p1Before) expect(otherView.tiles[id]).toBeUndefined();

    // 지정 후 프롬프트는 '넘길 내 3장' 조합으로 바뀐다 (C(14,3) = 364)
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const giveOptions = prompt.options.filter((o) => o.type === "swap3_give");
    expect(giveOptions).toHaveLength(364);
    expect(prompt.options.some((o) => o.type === "swap3")).toBe(false);
    expect(prompt.options.some((o) => o.type === "swap3_take")).toBe(false);
  });

  it("내 3장 → 상대 3장 두 단계로 여섯 장이 한 번에 자리를 바꾼다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    expect(aim(game, "p1").ok).toBe(true);

    const size0 = handIdsOf(game.engine.state, "p0").length;
    const size1 = handIdsOf(game.engine.state, "p1").length;
    const gives = triple(handIdsOf(game.engine.state, "p0"));
    const takes = triple(handIdsOf(game.engine.state, "p1"));

    // 1단계: 넘길 3장 선택 — 아직 아무 패도 움직이지 않는다
    expect(give(game, gives).ok).toBe(true);
    expect(handIdsOf(game.engine.state, "p0")).toHaveLength(size0);
    expect(game.engine.state.augmentData[giveKeyOf(game.engine.state)]).toEqual(gives);

    // 이 시점 프롬프트는 '가져올 상대 3장' 조합 (C(13,3) = 286)
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    expect(prompt.options.filter((o) => o.type === "swap3_take")).toHaveLength(286);
    expect(prompt.options.some((o) => o.type === "swap3_give")).toBe(false);

    // 2단계: 가져올 3장 선택 → 그 자리에서 교환
    const prng = game.engine.state.prngState;
    expect(take(game, takes).ok).toBe(true);

    const after = game.engine.state;
    for (const id of takes) expect(handIdsOf(after, "p0")).toContain(id);
    for (const id of gives) expect(handIdsOf(after, "p0")).not.toContain(id);
    for (const id of gives) expect(handIdsOf(after, "p1")).toContain(id);
    for (const id of takes) expect(handIdsOf(after, "p1")).not.toContain(id);
    // 장수는 양쪽 다 보존
    expect(handIdsOf(after, "p0")).toHaveLength(size0);
    expect(handIdsOf(after, "p1")).toHaveLength(size1);
    // 교환 횟수 소진 + 대기 중인 선택 비움 + 공개 채널은 **비워진다**
    // (교환이 끝나면 상대 손패를 계속 보여 주지 않는다 — 2026-08-02 사용자 지시)
    expect(after.augmentData[leftKeyOf(after)]).toBe(0);
    expect(after.augmentData[giveKeyOf(after)]).toEqual([]);
    expect(after.augmentData[revealKeyOf("p1")]).toEqual([]);
    // 무작위는 여전히 쓰지 않는다
    expect(after.prngState).toBe(prng);

    // 같은 국에는 두 번째 교환이 없다 (52차 후속: 사용자 피드백으로 국당 1회 제한)
    const again = give(game, triple(handIdsOf(after, "p0")));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("already swapped this round");
  });

  /**
   * 무엇이 오갔는지가 **당사자 둘 다**에게 통보된다 (2026-08-12 사용자 지적:
   * "알림도 없어서 티가 안 난다"). 각자 기준으로 준 것/받은 것이 뒤집혀 실리고,
   * 제3자 채널에는 아무것도 실리지 않는다.
   */
  it("교환이 성사되면 준 패·받은 패가 당사자 둘에게만 통보된다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    expect(aim(game, "p1").ok).toBe(true);

    const gives = triple(handIdsOf(game.engine.state, "p0"));
    const takes = triple(handIdsOf(game.engine.state, "p1"));
    const kindsOf = (s: GameState, ids: readonly TileId[]): string[] =>
      ids.map((id) => kindKey(s.tiles[id]!.kind));
    const giveKinds = kindsOf(game.engine.state, gives);
    const takeKinds = kindsOf(game.engine.state, takes);

    expect(give(game, gives).ok).toBe(true);
    expect(take(game, takes).ok).toBe(true);

    const after = game.engine.state;
    const noticeOf = (viewer: PlayerId): unknown =>
      after.augmentData[roundViewKey(viewer, "hand_swap3:swapped")];

    const mine = noticeOf("p0") as {
      with: PlayerId;
      gave: TileKind[];
      got: TileKind[];
      holder: boolean;
    };
    expect(mine.with).toBe("p1");
    expect(mine.holder).toBe(true);
    expect(mine.gave.map(kindKey)).toEqual(giveKinds);
    expect(mine.got.map(kindKey)).toEqual(takeKinds);

    // 지정당한 쪽은 방향이 뒤집힌다 — 자기가 넘긴 것이 gave다
    const theirs = noticeOf("p1") as {
      with: PlayerId;
      gave: TileKind[];
      got: TileKind[];
      holder: boolean;
    };
    expect(theirs.with).toBe("p0");
    expect(theirs.holder).toBe(false);
    expect(theirs.gave.map(kindKey)).toEqual(takeKinds);
    expect(theirs.got.map(kindKey)).toEqual(giveKinds);

    // 제3자에게는 새지 않는다
    expect(noticeOf("p2")).toBeUndefined();
    expect(noticeOf("p3")).toBeUndefined();

    // 뷰까지 실제로 내려간다 — 국 스코프 표식이 떨어진 채널 이름으로 (클라가 읽는 이름)
    const viewOf = (viewer: PlayerId): Record<string, unknown> =>
      buildPlayerView(after, viewer, game.engine.rules).augmentView;
    expect(viewOf("p0")["hand_swap3:swapped"]).toEqual(mine);
    expect(viewOf("p1")["hand_swap3:swapped"]).toEqual(theirs);
    expect(viewOf("p2")["hand_swap3:swapped"]).toBeUndefined();
  });

  /**
   * 지정과 실제 교환 사이(넘길 3장을 고르는 동안)에는 "누구와 바꾸기로 했는지"가
   * 화면 어디에도 없었다(2026-08-15 사용자 요청). 공개 채널에 대상만 실어 이름표
   * pill에 세우고, 교환이 끝나는 순간 비운다.
   */
  it("지정하면 대상이 전원 공개 채널에 실리고, 교환이 끝나면 비워진다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    const aimView = (viewer: PlayerId): unknown =>
      buildPlayerView(game.engine.state, viewer, game.engine.rules).augmentView[
        "hand_swap3:p0"
      ];

    // 지정 전에는 아무에게도 안 보인다
    expect(aimView("p0")).toBeUndefined();

    expect(aim(game, "p1").ok).toBe(true);
    // 지정 사실은 원래 전원 공개(actionFx)라 제3자에게도 그대로 실린다
    expect(aimView("p0")).toBe("p1");
    expect(aimView("p1")).toBe("p1");
    expect(aimView("p2")).toBe("p1");

    expect(give(game, triple(handIdsOf(game.engine.state, "p0"))).ok).toBe(true);
    // 넘길 3장을 고르는 동안에도 표식은 그대로 서 있다
    expect(aimView("p0")).toBe("p1");

    expect(take(game, triple(handIdsOf(game.engine.state, "p1"))).ok).toBe(true);
    // 교환이 끝나면 사라진다 (빈 값은 buildPlayerView가 잘라 낸다)
    expect(aimView("p0")).toBeUndefined();
    expect(aimView("p2")).toBeUndefined();
  });

  it("내 손패·상대 손패에 없는 패는 고를 수 없고, 지정 전에는 교환할 수 없다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    const p0 = [...handIdsOf(game.engine.state, "p0")];
    const p1 = [...handIdsOf(game.engine.state, "p1")];
    const p2 = [...handIdsOf(game.engine.state, "p2")];

    // 지정 전 선택 거부
    const early = give(game, triple(p0));
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe("no target designated");

    expect(aim(game, "p1").ok).toBe(true);

    // gives가 내 손패가 아니면 거부
    const notMine = give(game, triple(p1));
    expect(notMine.ok).toBe(false);
    if (!notMine.ok) expect(notMine.reason).toBe("give tile not in hand");

    // 3장을 고르기 전에는 가져올 수 없다
    const tooEarly = take(game, triple(p1));
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.reason).toBe("choose your three tiles first");

    expect(give(game, triple(p0)).ok).toBe(true);

    // takes가 지정한 상대의 손패가 아니면 거부 (다른 상대의 패)
    const notTheirs = take(game, triple(p2));
    expect(notTheirs.ok).toBe(false);
    if (!notTheirs.ok) expect(notTheirs.reason).toBe("take tile not in target hand");

    // 자기 자신은 지정할 수 없다
    const selfAim = aim(game, "p0");
    expect(selfAim.ok).toBe(false);
    if (!selfAim.ok) expect(selfAim.reason).toBe("cannot target yourself");
  });

  it("쯔모패를 넘기면 받아온 패가 새 쯔모패가 된다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    expect(aim(game, "p1").ok).toBe(true);

    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const myHand = handIdsOf(game.engine.state, "p0");
    const gives = [...new Set([drawn, ...myHand])]
      .slice(0, 3)
      .sort((a, b) => a - b);
    const takes = triple(handIdsOf(game.engine.state, "p1"));
    expect(gives).toContain(drawn);

    expect(give(game, gives).ok).toBe(true);
    expect(take(game, takes).ok).toBe(true);

    const state = game.engine.state;
    // 쯔모패가 손을 떠났으므로 받아온 패가 새 쯔모패 — 버림·리치 흐름이 이어진다
    expect(takes).toContain(state.round.lastDrawnTile as TileId);
    expect(handIdsOf(state, "p0")).toContain(state.round.lastDrawnTile);
    expect(handIdsOf(state, "p1")).toContain(drawn);
  });

  it("교환을 쓴 국에는 다시 지정할 수 없고, 국이 바뀌면 남은 횟수로 다시 쓴다", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    expect(aim(game, "p1").ok).toBe(true);
    expect(game.engine.state.augmentData["hand_swap3:used:p0"]).toBe(1);
    expect(give(game, triple(handIdsOf(game.engine.state, "p0"))).ok).toBe(true);
    expect(take(game, triple(handIdsOf(game.engine.state, "p1"))).ok).toBe(true);

    // 52차 후속(사용자 피드백): **교환을 쓴 국에는 재사용 불가** —
    // 프롬프트에서 지정 후보가 사라지고 직접 제출도 거부된다.
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    expect(prompt.options.some((o) => o.type === "swap3")).toBe(false);
    expect(prompt.options.some((o) => o.type === "swap3_give")).toBe(false);
    expect(prompt.options.some((o) => o.type === "swap3_take")).toBe(false);
    expect(aim(game, "p2").ok).toBe(false);

    // 국이 바뀌면(국 단위 플래그가 만료되면) 남은 지정 횟수로 다시 쓸 수 있다.
    // 국 전환은 honba를 올린 상태로 게임을 다시 세워 재현한다(roundKey가 달라진다).
    const nextRound = (g: typeof game): typeof game => {
      const st = g.engine.state;
      const g2 = createStandardGameFromState({
        ...st,
        round: { ...st.round, honba: st.round.honba + 1 },
      });
      installAugment(g2.engine, handSwap3, "p0", { yaku: g2.yaku });
      return g2;
    };

    const game2 = nextRound(game);
    expect(aim(game2, "p2").ok).toBe(true);
    expect(game2.engine.state.augmentData["hand_swap3:used:p0"]).toBe(2);

    // 게임당 2회 — 세 번째 지정은 국이 바뀌어도 거부된다
    const game3 = nextRound(game2);
    const third = aim(game3, "p3");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe("swap3 already used");
  });

  it("리치 중인 상대는 지정할 수 없다", () => {
    const base = craftSwapState();
    const rs = base.round.byPlayer["p1"]!;
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    const result = aim(game, "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("target is in riichi");
    // 프롬프트에서도 리치 상대는 후보에서 걸러진다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const targets = prompt.options
      .filter((o) => o.type === "swap3")
      .map((o) => (o.payload as { target: PlayerId }).target);
    expect(targets.sort()).toEqual(["p2", "p3"]);
  });

  it("지정한 상대가 리치를 걸면 남은 교환도 그 자리에서 멈춘다", () => {
    const base = craftSwapState();
    const rs = base.round.byPlayer["p1"]!;
    // 이미 지정하고 넘길 3장까지 골라 둔 상태에서 대상이 리치를 건 상황
    const gives = [...(base.zones[handZone("p0")]?.tileIds ?? [])]
      .sort((a, b) => a - b)
      .slice(0, 3);
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
      augmentData: {
        ...base.augmentData,
        [targetKeyOf(base)]: "p1",
        [leftKeyOf(base)]: 1,
        [giveKeyOf(base)]: gives,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    const blocked = take(
      game,
      triple(handIdsOf(game.engine.state, "p1")),
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("target is in riichi");
    // 손패는 그대로 (교환이 일어나지 않았다)
    expect(handIdsOf(game.engine.state, "p0")).toEqual(handIdsOf(state, "p0"));
    expect(handIdsOf(game.engine.state, "p1")).toEqual(handIdsOf(state, "p1"));
  });

  it("국이 넘어가면 지정·공개가 사라진다 (다음 국 배패가 새지 않는다)", () => {
    const game = createStandardGameFromState(craftSwapState());
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    expect(aim(game, "p1").ok).toBe(true);
    expect(game.engine.state.augmentData[revealKeyOf("p1")]).not.toEqual([]);

    const before = game.engine.state;
    // 국을 끝내고 다음 국을 연다
    for (const type of ["sys.settleAbort", "sys.startRound"]) {
      const res = game.engine.submit({ player: SYSTEM_PLAYER, type, payload: {} });
      expect(res.ok).toBe(true);
    }

    const state = game.engine.state;
    // 공개 채널은 국 스코프 키(roundViewKey)라 setupRound가 통째로 지운다.
    // 국 단위 키(지정·잔여 교환)도 새 국에서는 조회되지 않는다.
    expect(state.augmentData[revealKeyOf("p1")]).toBeUndefined();
    expect(state.augmentData[targetKeyOf(state)]).toBeUndefined();
    expect(state.augmentData[leftKeyOf(state)]).toBeUndefined();
    // 게임 단위 사용 횟수는 국을 넘어 유지된다
    expect(state.augmentData["hand_swap3:used:p0"]).toBe(1);
    // (이전 국 키는 남아 있어도 새 국 조회에 걸리지 않는다)
    expect(state.augmentData[targetKeyOf(before)]).toBe("p1");
  });
});

// ─────────────────────────── full_hand_swap ───────────────────────────

describe("full_hand_swap — 통째로 바꾸기", () => {
  function craftFullSwapState(): GameState {
    const s = craft({
      hands: {
        p0: "123m456m789m11223s", // 13장 + 마지막 3s가 쯔모패 취급 (14장)
        p1: "123p456p789p111z2z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(s, "p0", ["full_hand_swap"]);
  }

  it("첫 순에 상대 손패를 통째로 강탈한다 — 내 패는 패산 맨 밑으로 (게임당 2회)", () => {
    const game = createStandardGameFromState(craftFullSwapState());
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });

    const before = game.engine.state;
    const drawn = before.round.lastDrawnTile as TileId;
    const p0Before = [...(before.zones[handZone("p0")]?.tileIds ?? [])];
    const p1Before = [...(before.zones[handZone("p1")]?.tileIds ?? [])];
    const wallBefore = [...(before.zones[WALL]?.tileIds ?? [])];
    const myGiven = p0Before.filter((id) => id !== drawn);

    const result = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(true);

    const state = game.engine.state;
    const p0After = [...(state.zones[handZone("p0")]?.tileIds ?? [])].sort((a, b) => a - b);
    const p1After = [...(state.zones[handZone("p1")]?.tileIds ?? [])];
    const wallAfter = [...(state.zones[WALL]?.tileIds ?? [])];

    // 내 손 = 강탈한 상대의 13장 + 내 쯔모패
    expect(p0After).toEqual([...p1Before, drawn].sort((a, b) => a - b));
    // 48차 강탈: 내 패는 상대가 아니라 패산 맨 밑으로 들어간다
    expect(wallAfter.slice(-myGiven.length)).toEqual(myGiven);
    for (const id of myGiven) expect(p1After).not.toContain(id);
    // 상대는 패산 위에서 같은 장수를 새로 받는다 (빼앗긴 자기 패를 되받지 않는다)
    expect(p1After).toEqual(wallBefore.slice(0, p1Before.length));
    expect(p1After).toHaveLength(p1Before.length);
    // 패산 총량 불변 — 내 13장이 들어가고 상대가 13장을 받아 상쇄된다
    expect(wallAfter).toHaveLength(wallBefore.length);
    // 쯔모패는 그대로 내 손에 남아 버림 흐름이 이어진다
    expect(state.round.lastDrawnTile).toBe(drawn);
    expect(state.augmentData["full_hand_swap:used:p0"]).toBe(1);
    // 누구를 털었는지 전원 공개
    expect(state.augmentData["view:*:full_hand_swap:p0#round"]).toBe("p1");
    // 2회째도 가능 (다른 상대와)
    const second = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p2" },
    });
    expect(second.ok).toBe(true);
    expect(game.engine.state.augmentData["full_hand_swap:used:p0"]).toBe(2);
    // 3회째는 거부 (게임당 2회)
    const again = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p3" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("hand_swap already used");
  });

  it("배패 장수가 다른 상대(진짜 용)는 강탈할 수 없다", () => {
    // p1이 진짜 용(배패 16장) 보유 — p0(13장)과 손패 장수가 달라 통째로 가져오면
    // 손패 수/화료형 규칙이 플레이어에 고정돼 있어 버림·화료 판정이 깨진다.
    const game = createStandardGameFromState(craftFullSwapState());
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
    installAugment(game.engine, trueDragon, "p1", { yaku: game.yaku });

    const result = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("hand sizes differ");

    // 프롬프트 후보에서도 진짜 용 상대(p1)는 걸러지고, 같은 장수인 p2·p3만 남는다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const targets = prompt.options
      .filter((o) => o.type === "hand_swap")
      .map((o) => (o.payload as { target: PlayerId }).target);
    expect(targets.sort()).toEqual(["p2", "p3"]);
  });

  it("첫 순(turnCount<=1)이 지나면 쓸 수 없다", () => {
    const base = craftFullSwapState();
    const state: GameState = {
      ...base,
      round: { ...base.round, turnCount: 2 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
    const result = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("only on the first turn");
  });
});

describe("red_five_touch — 원래 적도라에는 각인을 찍지 않는다 (docs/25 국면 #13)", () => {
  /*
   * `redFor`는 "이 적도라는 이 사람 것"이라는 각인이라, 각인된 패는 **다른 사람에게는
   * 적도라로 세지 않는다**(helpers의 redCount). 그런데 각인 대상에서 **패산에서 나온
   * 진짜 적도라**를 빼지 않아, 보유자가 마침 들고 있던 자연 적5까지 자기 것으로
   * 도장이 찍혔다 → 그 패가 손을 떠나면(버림 후 펑·손 교환) 새 주인은 원래 있던
   * 적도라 값을 잃는다. 보유자가 얻는 것은 없다(각인 없이도 이미 자기에게 붙는다).
   */
  it("자연 적5는 redFor 없이 남고, 나머지 5만 각인된다", () => {
    const base = craft({
      hands: { p0: "55m55p55s12346m789p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 손패의 5 중 한 장을 '패산에서 나온 진짜 적도라'로 만든다 (redFor 없음)
    const fiveIds = handIdsOf(base, "p0").filter((id) => {
      const k = kindOf(base, id);
      return isNumberSuit(k) && k.rank === 5;
    });
    const naturalRed = fiveIds[0] as TileId;
    const state: GameState = withAugments(
      {
        ...base,
        tiles: {
          ...base.tiles,
          [naturalRed]: {
            ...(base.tiles[naturalRed] as NonNullable<(typeof base.tiles)[number]>),
            attrs: { red: true },
          },
        },
      },
      "p0",
      ["red_five_touch"],
    );

    const game = createStandardGameFromState(state);
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 5 },
    });
    expect(r.ok).toBe(true);

    const after = game.engine.state;
    // 자연 적도라는 그대로 — 누구에게나 적도라다
    expect(after.tiles[naturalRed]?.attrs.red).toBe(true);
    expect(after.tiles[naturalRed]?.attrs.redFor).toBeUndefined();

    // 원래 적도라가 아니었던 5는 보유자 각인이 찍힌다.
    // (패산에는 무늬당 자연 적5가 한 장씩 들어 있으므로 손패의 5가 전부
    //  평범한 패인 것은 아니다 — 입력 상태에서 red가 아니었던 것만 고른다.)
    const plainFives = fiveIds.filter((id) => state.tiles[id]?.attrs.red !== true);
    expect(plainFives.length).toBeGreaterThan(0);
    for (const id of plainFives) {
      expect(after.tiles[id]?.attrs.redFor).toBe("p0");
    }
    // 입력에서 이미 자연 적도라였던 5는 전부 각인 없이 남는다
    for (const id of fiveIds) {
      if (state.tiles[id]?.attrs.red === true) {
        expect(after.tiles[id]?.attrs.redFor).toBeUndefined();
      }
    }
  });
});
