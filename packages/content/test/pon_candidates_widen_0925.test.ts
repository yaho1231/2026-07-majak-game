/**
 * 동수의 결속·양극 — 퐁·대명깡 재료를 **어느 무늬(랭크) 두 장으로** 쓸지 고를 수 있다
 * (2026-09-25, docs/59 U58).
 *
 * 예전 FlowController는 (일반,일반)/(일반,적)/(적,적) 세 조합에서 **처음 닫히는 짝 하나씩**만
 * 후보로 냈다. 동수의 결속을 켠 국에 1만 버림 + 손패 1통·1삭·1통이면 [1통,1삭]만 떠서,
 * 1삭을 슌쯔용으로 남기는 [1통,1통]을 고를 길이 없었다(서버는 제시한 옵션과 payload 완전일치만
 * 받는다). 이제 (종류, 적도라) 서명이 다른 닫히는 짝을 대표 하나씩 뒤에 붙인다.
 *
 * 지키는 것:
 * - 첫 후보는 예전 그대로(봇·기존 테스트가 보던 첫 퐁) — 새 후보는 뒤에만 붙는다.
 * - «한 규칙 안에서 닫히는 짝만»(QA synergy3) — 잡종 펑은 여전히 안 뜬다.
 * - 규칙이 꺼져 있으면 후보 개수가 예전과 같다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
  handIdsOf,
} from "@majak/core";
import type {
  ActionDef,
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { mixedTriplet } from "../src/augments/mixed_triplet.js";
import { polarEnds } from "../src/augments/polar_ends.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 동수의 결속은 선언한 국에만 열린다 — 국 스코프 on 플래그를 심어 «이미 켠 국»을 만든다 */
const SHAPE_DECLARED = new Set(["mixed_triplet"]);

function start(state: GameState, defs: AugmentDef[], holder: PlayerId = "p0"): Game {
  const declared: Record<string, unknown> = {};
  for (const def of defs) {
    if (SHAPE_DECLARED.has(def.id)) declared[roundScopedKey(def.id, "on", state, holder)] = true;
  }
  const seeded: GameState = {
    ...state,
    augmentData: { ...state.augmentData, ...declared },
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...defs.map((d) => d.id)] } : p,
    ),
  };
  const game = createStandardGameFromState(seeded);
  for (const def of defs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

function scene(hand: string, discard: string): GameState {
  return craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: discard },
  });
}

function options(game: Game, type: string): ActionOption[] {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") return [];
  return (status.prompts.find((p) => p.player === "p0")?.options ?? []).filter(
    (o) => o.type === type,
  );
}

/** 후보가 쓰는 손패의 종류(정렬) — 적도라는 * */
function kinds(game: Game, o: ActionOption): string {
  const ids = (o.payload as { tileIds: TileId[] }).tileIds;
  return ids
    .map((t) => {
      const red = game.engine.state.tiles[t]?.attrs.red === true;
      return `${kindKey(kindOf(game.engine.state, t))}${red ? "*" : ""}`;
    })
    .sort()
    .join(",");
}

describe("퐁 후보 넓히기 — 동수의 결속 (U58)", () => {
  it("1만 버림 + 손패 1통·1삭·1통 → [1통,1삭]과 [1통,1통]을 둘 다 제시한다", () => {
    const game = start(scene("1p1s1p345m678m99s", "1m"), [mixedTriplet]);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    // 첫 후보는 예전 그대로(손패 순서상 첫 닫히는 짝)
    expect(pons[0]).toBe("pin1,sou1");
    expect(pons).toContain("pin1,pin1");
    // 같은 수(같은 서명)는 한 번만
    expect(new Set(pons).size).toBe(pons.length);
  });

  it("새로 붙은 후보를 내면 그 두 장으로 퐁하고 남긴 무늬는 손에 남는다", () => {
    const game = start(scene("1p1s1p345m678m99s", "1m"), [mixedTriplet]);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const opts = status.prompts.find((p) => p.player === "p0")!.options;
    const keep = opts.find((o) => o.type === "pon" && kinds(game, o) === "pin1,pin1");
    expect(keep).toBeDefined();
    flow.submit("p0", keep!);
    const meld = game.engine.state.round.byPlayer["p0"]?.melds.find((m) => m.kind === "pon");
    expect(meld).toBeDefined();
    const hand = handIdsOf(game.engine.state, "p0").map((t) =>
      kindKey(kindOf(game.engine.state, t)),
    );
    expect(hand).toContain("sou1");
  });

  it("대명깡도 서명이 다른 조합을 하나씩 낸다 — 1통1통1삭1삭 + 1만", () => {
    const game = start(scene("1p1p1s1s345m678m9s", "1m"), [mixedTriplet]);
    const kans = options(game, "minkan").map((o) => kinds(game, o));
    // 첫 후보는 예전의 «처음 닫히는 세 장» — 손패 순서 1통1통1삭1삭에서 {1통,1통,1삭}
    expect(kans[0]).toBe("pin1,pin1,sou1");
    expect(kans).toContain("pin1,sou1,sou1");
    expect(new Set(kans).size).toBe(kans.length);
  });
});

describe("퐁 후보 넓히기 — 적도라 × 동수의 결속 (U58)", () => {
  /*
   * (종류, 적도라) 서명이 후보를 가장 많이 불리는 경우(B19 리뷰 라운드 2, 2026-09-25).
   * 5만 버림 + 손패 5통·적5통·5삭 — 앞 세 줄(firstPair)이 [5통,5삭]·[5통,적5통]을 내고,
   * 서명 훑기가 적5통으로 5삭을 받치는 [적5통,5삭]만 더 붙여야 한다.
   */
  it("5만 버림 + 5통·적5통·5삭 → 첫 후보 그대로, 무늬마다 적/일반을 따로, 서명 중복 없음", () => {
    const state = scene("55p5s234m678m99s1z2z", "5m");
    const hand = state.zones["hand:p0"]!.tileIds;
    // craft는 적도라를 어느 장에 둘지 정하지 않는다 — 손패 둘째 장(5통)만 적으로 못박는다
    const tiles = { ...state.tiles };
    hand.forEach((t, i) => {
      tiles[t] = { ...tiles[t]!, attrs: { ...tiles[t]!.attrs, red: i === 1 } };
    });
    const game = start({ ...state, tiles }, [mixedTriplet]);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    expect(pons[0]).toBe("pin5,sou5");
    expect(pons.slice(1)).toEqual(["pin5,pin5*", "pin5*,sou5"]);
    expect(new Set(pons).size).toBe(pons.length);
  });
});

describe("퐁 후보 넓히기 — 검증에 막힌 짝이 서명을 차지하지 않는다 (U58)", () => {
  /*
   * 서명은 validate를 통과한 짝/조합으로만 차지한다(B19 리뷰 라운드 1). seen.add를 validate
   * 앞으로 옮기면, 그 서명의 첫 짝이 막혔을 때 같은 서명의 다른 장이 영영 안 뜬다 — 그 되돌림을
   * 잡으려고 특정 한 장이 든 payload만 거절하는 validate로 이 엔진의 액션 정의를 갈아 끼운다.
   * (레지스트리의 정의 객체는 모듈 상수라 직접 고치면 다른 테스트로 샌다 — 새 객체로 바꾼다.)
   */
  function blockTile(game: Game, type: string, blocked: TileId): void {
    const defs = (game.engine.actions as unknown as { defs: Map<string, ActionDef<unknown>> })
      .defs;
    const orig = defs.get(type)!;
    defs.set(type, {
      ...orig,
      validate: (req, ctx) =>
        (req.payload as { tileIds?: TileId[] }).tileIds?.includes(blocked) === true
          ? "test: blocked"
          : orig.validate(req, ctx),
    });
  }

  it("퐁 — 첫 1통이 막히면 [1통,1삭]은 둘째 1통으로 선다", () => {
    const game = start(scene("1p1s1p345m678m99s", "1m"), [mixedTriplet]);
    const hand = handIdsOf(game.engine.state, "p0");
    blockTile(game, "pon", hand[0]!);
    const opts = options(game, "pon");
    expect(opts.map((o) => kinds(game, o))).toEqual(["pin1,sou1"]);
    expect((opts[0]!.payload as { tileIds: TileId[] }).tileIds).toContain(hand[2]!);
  });

  it("대명깡 — 첫 1통이 막히면 [1통,1삭,1삭]은 둘째 1통으로 선다", () => {
    const game = start(scene("1p1p1s1s345m678m9s", "1m"), [mixedTriplet]);
    const hand = handIdsOf(game.engine.state, "p0");
    blockTile(game, "minkan", hand[0]!);
    const opts = options(game, "minkan");
    expect(opts.map((o) => kinds(game, o))).toEqual(["pin1,sou1,sou1"]);
    expect((opts[0]!.payload as { tileIds: TileId[] }).tileIds).toContain(hand[1]!);
  });
});

describe("퐁 후보 넓히기 — 양극 (U58)", () => {
  it("1만 버림 + 손패 1만·9만·9만 → [1만,9만]과 [9만,9만]", () => {
    const game = start(scene("1m9m9m345p678p99s", "1m"), [polarEnds]);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    expect(pons[0]).toBe("man1,man9");
    expect(pons).toContain("man9,man9");
    expect(pons).toHaveLength(2);
  });

  it("잡종 펑은 여전히 안 뜬다 — 양극만 든 1만 버림에 9만·1통·9만", () => {
    const game = start(scene("9m1p9m345p678s99s", "1m"), [polarEnds]);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    expect(pons).toEqual(["man9,man9"]);
  });
});

describe("퐁 후보 넓히기 — 둘 다 든 최악의 경우 (U58 상한 고정)", () => {
  /*
   * 양극 × 동수의 결속을 함께 들면 1·9 네 종류가 서로 닫혀 조합이 빨리 는다(B19 리뷰 2026-09-25:
   * 이 손에서 퐁 15·대명깡 30, 봇 bidCall 약 77ms). 지금은 드문 조합이라 받아들이지만, 뒤의
   * 변경이 이 수를 몰래 불리지 못하도록 개수를 못박는다 — 늘려야 하면 이 숫자를 의식하고 바꾼다.
   */
  it("1통1통9통9통1삭1삭9삭9삭9만9만 + 1만 → 퐁 15·대명깡 30, 중복 없음", () => {
    const game = start(scene("1p1p9p9p1s1s9s9s9m9m234z", "1m"), [mixedTriplet, polarEnds]);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    const kans = options(game, "minkan").map((o) => kinds(game, o));
    expect(new Set(pons).size).toBe(pons.length);
    expect(new Set(kans).size).toBe(kans.length);
    expect([pons.length, kans.length]).toEqual([15, 30]);
  });
});

describe("퐁 후보 넓히기 — 규칙이 꺼져 있으면 예전과 같다 (U58 회귀)", () => {
  it("표준 퐁은 (일반,일반)/(일반,적) 조합만 — 새로 붙는 후보가 없다", () => {
    const game = start(scene("555m234p678p99s1z", "5m"), []);
    const pons = options(game, "pon").map((o) => kinds(game, o));
    // 손에 적5가 있으면 둘(적 안 씀/씀), 없으면 하나
    const hasRed = handIdsOf(game.engine.state, "p0").some(
      (t) => game.engine.state.tiles[t]?.attrs.red === true,
    );
    expect(pons).toHaveLength(hasRed ? 2 : 1);
    expect(pons[0]).toBe("man5,man5");
  });

  it("비보유자는 동수의 결속 국이어도 무늬 섞인 퐁이 안 뜬다", () => {
    const base = craft({
      hands: { p0: "345m678m99s1z2z3z4z", p1: "*", p2: "1p1s1p345m678m99s", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1m" },
    });
    const game = start(base, [mixedTriplet]);
    const status = new FlowController(game.engine).begin();
    const p2 =
      status.kind === "awaiting" ? status.prompts.find((p) => p.player === "p2") : undefined;
    expect((p2?.options ?? []).filter((o) => o.type === "pon")).toHaveLength(0);
  });
});
