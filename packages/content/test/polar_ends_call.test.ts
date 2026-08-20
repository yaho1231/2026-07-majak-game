/**
 * 양극 (polar_ends) — 퐁(후로) 콜 테스트.
 *
 * 사용자 지시(2026-07-25): 같은 무늬의 1과 9를 들고 있을 때 상대가 1(또는 9)을 버리면
 * 199·191·911 몸통으로 **퐁(후로)**할 수 있어야 한다. 기존에는 손 안(멘젠) 분해에만
 * 적용되고 콜은 되지 않았다.
 *
 * 구현은 콜 판정 인프라(sameCallKind + polarEndsFor)에 polarEnds 차원을 얹은 것이라,
 * 보유자에게만 열리고 비보유자에게는 종전대로 막힌다. 깡(4장)은 도라·영상 규약과 충돌해
 * 제외되므로 퐁만 열린다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { polarEnds } from "../src/augments/polar_ends.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** p1이 1m을 버린 반응 국면. p0은 같은 무늬 노두패 9m9m을 들고 있다. */
function scene(): ReturnType<typeof craft> {
  return craft({
    // p0: 9m 9m(양극 퐁 재료) + 나머지 11장(임의)
    hands: {
      p0: "99m234p567p234s99s",
      p1: "*",
      p2: "*",
      p3: "*",
    },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1m" },
  });
}

/** p0 프롬프트에서 pon 후보만 추린다 */
function ponOptions(game: Game) {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting reaction");
  const p0 = status.prompts.find((p) => p.player === "p0");
  return (p0?.options ?? []).filter((o) => o.type === "pon");
}

describe("양극 (polar_ends) — 퐁 콜", () => {
  it("보유자는 9m9m으로 1m 버림에 퐁할 수 있다 (199 몸통)", () => {
    const game = createStandardGameFromState(scene());
    installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });

    const pons = ponOptions(game);
    expect(pons.length).toBeGreaterThan(0);

    // 퐁을 제출하면 199 후로가 형성된다
    const st0 = new FlowController(game.engine);
    const status = st0.begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const opt = pons[0]!;
    st0.submit("p0", opt);

    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    const pon = melds.find((m) => m.kind === "pon");
    expect(pon).toBeDefined();
    // 몸통은 1m + 9m + 9m (같은 무늬 노두패 셋)
    const kinds = (pon?.tileIds ?? [])
      .map((id) => kindKey(kindOf(game.engine.state, id)))
      .sort();
    expect(kinds).toEqual(["man1", "man9", "man9"]);
  });

  it("보유자가 아니면 같은 손이어도 퐁 후보가 뜨지 않는다 (대조군)", () => {
    // p2에게 9m9m을 주고 p0에게 증강 → p2는 퐁 불가
    const base = craft({
      hands: {
        p0: "234p567p234s99s11z",
        p1: "*",
        p2: "99m234p567p234s99s",
        p3: "*",
      },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1m" },
    });
    const game = createStandardGameFromState(base);
    installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });

    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const p2 = status.prompts.find((p: { player: PlayerId }) => p.player === "p2");
    const pons = (p2?.options ?? []).filter((o) => o.type === "pon");
    expect(pons.length).toBe(0);
  });

  it("순수 커쯔 퐁(9m9m + 9m)은 종전대로 동작한다 (회귀)", () => {
    const base = craft({
      hands: {
        p0: "99m234p567p234s99s",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "9m" },
    });
    const game = createStandardGameFromState(base);
    installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });
    expect(ponOptions(game).length).toBeGreaterThan(0);
  });
});

describe("양극 (polar_ends) — 1·9 혼합 퐁 위의 가깡 (QA 2026-08-20)", () => {
  /**
   * detail: "1과 9를 섞어 퐁한 몸통 위로는 가깡을 얹을 수 있다(1만1만9만 + 1만)."
   * 예전에는 shouminkan validate가 polarEnds를 안 봐서 **멘쯔 대표와 같은 랭크만**
   * 통했다 — 퐁한 순서에 따라 1만만 되거나 9만만 되는 반쪽이었다(qa-lab text 확정 21).
   */
  function kakan(meldSpec: string, addSpec: string, holder: boolean): boolean {
    const st = craft({
      hands: { p0: `${addSpec}234p567p11s`, p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon" as const, spec: meldSpec, from: "p1" as PlayerId }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(st);
    if (holder) installAugment(game.engine, polarEnds, "p0", { yaku: game.yaku });
    const target = game.engine.state.round.byPlayer.p0?.melds[0]?.tileIds[0] as number;
    const tileId = (game.engine.state.zones["hand:p0"]?.tileIds ?? [])[0] as number;
    return game.engine.submit({
      player: "p0",
      type: "shouminkan",
      payload: { tileId, targetMeldTileId: target },
    }).ok;
  }

  it("퐁 1m1m9m(대표 1m) 위에 1m — detail의 예시", () => {
    expect(kakan("119m", "1m", true)).toBe(true);
  });

  it("같은 몸통 위에 9m도 얹힌다 (1·9는 한 패로 통한다)", () => {
    expect(kakan("119m", "9m", true)).toBe(true);
  });

  it("퐁 9m9m1m(대표 9m) 위에는 1m·9m 어느 쪽도 얹힌다 — 퐁 순서에 안 갈린다", () => {
    expect(kakan("991m", "1m", true)).toBe(true);
    expect(kakan("991m", "9m", true)).toBe(true);
  });

  it("대조군: 순수 퐁 111m 위의 1m 가깡은 종전대로", () => {
    expect(kakan("111m", "1m", true)).toBe(true);
    expect(kakan("111m", "1m", false)).toBe(true);
  });

  it("대조군: 보유자가 아니면 대표와 랭크가 다른 패는 얹히지 않는다", () => {
    expect(kakan("119m", "9m", false)).toBe(false);
  });
});
