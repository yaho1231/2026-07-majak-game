/**
 * 뒤섞인 아홉 개의 연꽃 (mixed_nine_gates) — 무늬를 지우는 범위가 **화료형뿐**인지.
 *
 * 이 증강은 손이 구련 뼈대(1112345678999)일 때 `scoring.mixedRuns`·`mixedTriplets`·
 * `mixedPairs`를 켠다. 그 규칙 키는 채점 전용이 아니라 **후로 검증기도 함께 읽어서**
 * (치=scoringOptionsOf().mixedRuns, 펑·깡=mixedTripletsFor → sameCallKind),
 * 뼈대를 완성한 순간 보유자에게 혼색 치·펑이 열려 있었다 — 누르면 멘젠이 깨져
 * 역만이 영구히 날아가는 함정 버튼이다(2026-08-20 QA 확정).
 * 카드가 못박은 "치·퐁·대명깡·안깡을 하면 성립하지 않는다"에 맞춰, 뼈대 위에 있는
 * 동안에는 보유자의 후로·깡 자체를 닫는다.
 */

import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 무늬가 흩어진 구련 뼈대 13장 (랭크 1112345678999) */
const SKELETON = "11m1p2s3m4p5s6m7p8s9m9p9s";
/** 대조군 — 뼈대가 아닌 평범한 13장 (혼색 치 재료 3m·4p를 갖고 있다) */
const PLAIN = "11m1p3m4p2s5s6m7p8s9m9p2p";
/** 대조군 — 뼈대가 아닌 평범한 13장 (동색 치 재료 2s·3s를 갖고 있다) */
const PLAIN_SOU = "11m1p2s3s5s6m7p8s9m9p9s2p";

function scene(hand: string, discard: string, withAug: boolean): Game {
  const st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: discard },
  });
  const game = createStandardGameFromState(st);
  if (withAug) {
    installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
  }
  return game;
}

function tileIn(game: Game, player: PlayerId, key: string): TileId {
  const ids = game.engine.state.zones[handZone(player)]?.tileIds ?? [];
  const id = ids.find((t) => kindKey(kindOf(game.engine.state, t)) === key);
  if (id === undefined) throw new Error(`손에 없다: ${key}`);
  return id;
}

/** 후로 액션 validate 결과 — null이면 허용 */
function validate(game: Game, type: "chi" | "pon", keys: string[]): string | null {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`no ${type}`);
  const tileIds = keys.map((k) => tileIn(game, "p0", k));
  return def.validate(
    { player: "p0", type, payload: { tileIds } } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
}

describe("뒤섞인 아홉 개의 연꽃 (mixed_nine_gates)", () => {
  it("뼈대 위에서 혼색 치가 열리지 않는다 (증강 없을 때와 마찬가지로 거부)", () => {
    expect(validate(scene(SKELETON, "2s", false), "chi", ["man3", "pin4"])).toBe(
      "tiles cannot form a run",
    );
    expect(validate(scene(SKELETON, "2s", true), "chi", ["man3", "pin4"])).not.toBeNull();
  });

  it("뼈대 위에서 혼색 펑이 열리지 않는다", () => {
    expect(validate(scene(SKELETON, "1s", false), "pon", ["man1", "pin1"])).toBe(
      "tiles do not match the discard",
    );
    expect(validate(scene(SKELETON, "1s", true), "pon", ["man1", "pin1"])).not.toBeNull();
  });

  it("뼈대가 아닌 손이면 후로는 평소대로다 (동색 치 허용 · 혼색 치 거부)", () => {
    expect(validate(scene(PLAIN_SOU, "1s", true), "chi", ["sou2", "sou3"])).toBeNull();
    expect(validate(scene(PLAIN, "2s", true), "chi", ["man3", "pin4"])).toBe(
      "tiles cannot form a run",
    );
  });

  it("화료형은 그대로 열려 있다 — 무늬가 흩어진 구련이 역만으로 선다", () => {
    const st = craft({
      hands: { p0: SKELETON, p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5p" },
    });
    const game = createStandardGameFromState(st);
    installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
    const ron = game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "ron", ron, {
        rules: game.engine.rules,
        from: "p1",
      }),
      game.yaku,
    );
    expect(ev?.ok).toBe(true);
    expect(ev?.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(true);
  });
});
