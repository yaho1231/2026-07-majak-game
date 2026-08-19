/**
 * **무엇을 모으는가** — 봇이 상대의 증강을 보고 타패를 바꾸는가.
 *
 * 2026-08-18 사용자 보고가 출발점이다: 사람이 **개벽**을 써서 손패가 통째로 자패가
 * 됐는데, 봇 셋은 아무 일 없다는 듯 자패를 계속 흘려 **자일색 + 대사희(더블 역만)** 를
 * 헌납했다. 봇이 보던 것은 스칼라 위협 배수 하나뿐이라 "이 사람에게 쏘면 얼마나
 * 비싼가"만 알았고, **어느 패가 비싼가**는 몰랐다.
 *
 * 여기서 재는 것은 셋이다.
 *   1. 개벽이 터진 뒤 자패의 위험이 오르는가 (안전도·기대 실점 둘 다)
 *   2. 그래서 실제로 **버리는 패가 바뀌는가** (봇의 결정까지 내려가는가)
 *   3. 신호가 없을 때는 아무것도 안 바뀌는가 (평범한 판을 망치지 않는가)
 */

import { describe, expect, it } from "vitest";
import { NEUTRAL_DEFENSE, expectedLossOf, readThreats, safetyOf, tileTracker } from "../src/bot/danger.js";
import { readCollect } from "../src/bot/collect.js";
import { chooseDiscard } from "../src/bot/discard.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import type { TileId } from "@majak/core";
import { botScene, h } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

/** 개벽을 쓴 p1 — 자패는 한 장도 안 버렸고, 뒤집혀 나온 수패만 흘리고 있다 */
const GENESIS: BotViewOptions = {
  hand: "123m456p789s1z1z 5p",
  turnCount: 9,
  augments: { p1: ["genesis"] },
  augmentView: { "genesis:p1": true },
  // 자패 하나(6z 발)는 개벽 전에 흘렸다 — "자패를 한 장도 안 버린다" 읽기가
  // 끼어들지 않게 해서, 이 장면의 차이가 **개벽 발동 하나**만 남게 한다.
  discards: { p1: "234m6z567p89s" },
};

/** 같은 장면인데 개벽이 터지지 않았다 (증강만 들고 있다) */
const QUIET: BotViewOptions = {
  ...GENESIS,
  augmentView: {},
};

function threatOf(opts: BotViewOptions) {
  const scene = botScene(opts);
  const threats = readThreats(scene.view, "p0", []);
  const t = threats.find((x) => x.player === "p1");
  if (t === undefined) throw new Error("p1 위협이 없다");
  return { scene, threats, t, remaining: tileTracker(scene.view) };
}

describe("개벽을 쓴 상대 — 자패는 안전패가 아니다", () => {
  it("자패의 안전도가 떨어지고 기대 실점이 오른다", () => {
    const east = h("1z")[0]!;
    const quiet = threatOf(QUIET);
    const fired = threatOf(GENESIS);

    const safeQuiet = safetyOf(east, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE);
    const safeFired = safetyOf(east, [fired.t], fired.remaining, NEUTRAL_DEFENSE);
    expect(safeFired).toBeLessThan(safeQuiet);

    const lossQuiet = expectedLossOf(east, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE);
    const lossFired = expectedLossOf(east, [fired.t], fired.remaining, NEUTRAL_DEFENSE);
    // 배수(패)·판수(실점)·하한(텐파이 확률)이 함께 걸리므로 몇 배가 되어야 한다
    expect(lossFired).toBeGreaterThan(lossQuiet * 3);
  });

  it("같은 상대에게도 **수패**는 그대로다 — 겁을 판 전체로 번지게 하지 않는다", () => {
    const quiet = threatOf(QUIET);
    const fired = threatOf(GENESIS);
    const p5 = h("5p")[0]!;
    const before = safetyOf(p5, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE);
    const after = safetyOf(p5, [fired.t], fired.remaining, NEUTRAL_DEFENSE);
    // 위협도 하한이 올라간 만큼은 같이 내려가지만, 자패만큼 무너지지는 않는다
    const honor = h("1z")[0]!;
    const honorDrop =
      safetyOf(honor, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE) -
      safetyOf(honor, [fired.t], fired.remaining, NEUTRAL_DEFENSE);
    expect(before - after).toBeLessThan(honorDrop);
  });

  it("현물은 여전히 100% 안전하다 — 배수가 후리텐을 지우지는 못한다", () => {
    // p1이 개벽 전에 흘린 자패 하나. 론이 안 되는 것은 규칙이지 어림값이 아니다.
    const fired = threatOf({
      ...GENESIS,
      discards: { p1: "234m6z3z567p89s" },
    });
    const west = h("3z")[0]!;
    expect(safetyOf(west, [fired.t], fired.remaining, NEUTRAL_DEFENSE)).toBe(1);
  });
});

describe("결정까지 내려가는가 — 실제로 버리는 패가 바뀐다", () => {
  /**
   * 3멘쯔 + 머리가 이미 섰고 남은 것은 5삭과 中 한 장. 둘 중 무엇을 버려도 텐파이라
   * **순수하게 안전만으로** 갈리는 자리다. 평소 봇은 외톨이 자패부터 흘린다.
   */
  const HAND = "123m456m789m11p5s7z";

  const pick = (opts: BotViewOptions): string => {
    const scene = botScene(opts);
    const read = buildRead(scene.view, "p0");
    const picked = chooseDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE);
    const tileId = (picked?.payload as { tileId?: TileId } | undefined)?.tileId;
    const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
    if (kind === undefined) return "none";
    const suit =
      kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
    return `${kind.suit === "dragon" ? kind.rank + 4 : kind.rank}${suit}`;
  };

  it("평소에는 외톨이 자패를 흘린다", () => {
    expect(pick({ ...QUIET, hand: HAND })).toBe("7z");
  });

  /*
   * 무엇을 대신 버리는지는 **고정하지 않는다.** 봇은 그 자리에서 가장 안전한 패를
   * 고르는데, 이 장면에서는 p1의 현물(3만)이 그것이다 — 더블 역만이 걸린 자리에서
   * 완성된 슌쯔를 헐고 현물을 내는 것은 사람도 하는 판단이라 틀린 답이 아니다.
   * 이 테스트가 지키려는 것은 하나뿐이다: **자패는 안 나간다.**
   */
  it("개벽이 터진 상대가 있으면 자패를 흘리지 않는다", () => {
    expect(pick({ ...GENESIS, hand: HAND })).not.toBe("7z");
  });
});

describe("읽기의 근거", () => {
  it("개벽이 안 터졌으면 아무것도 안 읽는다 — 들고만 있는 사람은 평범한 상대다", () => {
    const scene = botScene(QUIET);
    expect(readCollect(scene.view, "p1").tags).toEqual([]);
  });

  it("증강이 없어도 자패를 한 장도 안 버리면 읽는다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 11,
      discards: { p1: "234m567p789s123m" },
    });
    const read = readCollect(scene.view, "p1");
    expect(read.tags).toContain("no-honor-discard:12");
    expect(read.riskOf(h("1z")[0]!)).toBeGreaterThan(1);
    expect(read.riskOf(h("5p")[0]!)).toBe(1);
  });

  it("단색 세계가 고른 색만 위험해진다 — 나머지 두 색은 건드리지 않는다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 8,
      augments: { p1: ["suit_unify"] },
      augmentView: { "suit_unify:p1": "pin" },
      discards: { p1: "1z2z3z4z" },
    });
    const read = readCollect(scene.view, "p1");
    expect(read.riskOf(h("5p")[0]!)).toBeGreaterThan(1);
    expect(read.riskOf(h("5m")[0]!)).toBe(1);
    expect(read.riskOf(h("5s")[0]!)).toBe(1);
  });

  it("평범한 상대에게는 아무 배수도 안 붙는다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 8,
      discards: { p1: "1z2z9m9p3z" },
    });
    const read = readCollect(scene.view, "p1");
    expect(read.tags).toEqual([]);
    expect(read.hanBonus).toBe(0);
    expect(read.minLevel).toBe(0);
    expect(read.riskOf(h("1z")[0]!)).toBe(1);
  });
});

/*
 * 2026-08-19 사용자 지적: "편식·단색 세계 같은 걸 상대가 쓴 것에 봇이 대응을 못 한다."
 * 단색 세계는 위에서 이미 읽고 있었는데, **같은 효과의 퀘스트판인 편식**은 공개 채널
 * 이름이 달라 통째로 비어 있었다 — 같은 청일색인데 한쪽만 무서워하고 있었다.
 */
describe("편식 — 발동 전에도, 발동 뒤에도 읽는다", () => {
  it("발동 뒤에는 물든 색이 단색 세계와 똑같이 위험해진다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 12,
      augments: { p1: ["picky_eater"] },
      augmentView: { "picky_eater:p1": "sou" },
      discards: { p1: "1z2z3z4z" },
    });
    const read = readCollect(scene.view, "p1");
    expect(read.tags).toContain("picky_eater:sou");
    expect(read.riskOf(h("5s")[0]!)).toBeGreaterThan(1);
    expect(read.riskOf(h("5m")[0]!)).toBe(1);
  });

  it("퀘스트가 달성 직전이면 실점 추정이 오른다 (예고를 본다)", () => {
    const near = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 12,
      augments: { p1: ["picky_eater"] },
      augmentView: {
        "picky_eater:progress:p1": { suit: "man", count: 9, need: 12, failed: false },
      },
    });
    const read = readCollect(near.view, "p1");
    expect(read.hanBonus).toBeGreaterThan(0);
    expect(read.tags.some((t) => t.startsWith("picky_quest:"))).toBe(true);
  });

  it("깨진 퀘스트·초반 진행은 읽지 않는다", () => {
    const broken = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 12,
      augments: { p1: ["picky_eater"] },
      augmentView: {
        "picky_eater:progress:p1": { suit: "man", count: 9, need: 12, failed: true },
      },
    });
    expect(readCollect(broken.view, "p1").tags).toEqual([]);

    const early = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 4,
      augments: { p1: ["picky_eater"] },
      augmentView: {
        "picky_eater:progress:p1": { suit: "man", count: 3, need: 12, failed: false },
      },
    });
    expect(readCollect(early.view, "p1").tags).toEqual([]);
  });
});

describe("짝수의 세계 — 짝수 수패만 위험해진다", () => {
  it("짝수는 오르고 홀수·자패는 그대로다", () => {
    const scene = botScene({
      hand: "123m456p789s11z22m",
      turnCount: 8,
      augments: { p1: ["even_world"] },
      augmentView: { "even_world:p1": true },
      discards: { p1: "1z2z3z4z" },
    });
    const read = readCollect(scene.view, "p1");
    expect(read.tags).toContain("even_world");
    expect(read.riskOf(h("4p")[0]!)).toBeGreaterThan(1);
    expect(read.riskOf(h("5p")[0]!)).toBe(1);
  });
});
