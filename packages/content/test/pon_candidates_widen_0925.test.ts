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
import type { ActionOption, AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
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
    expect(kans).toContain("pin1,pin1,sou1");
    expect(kans).toContain("pin1,sou1,sou1");
    expect(new Set(kans).size).toBe(kans.length);
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
