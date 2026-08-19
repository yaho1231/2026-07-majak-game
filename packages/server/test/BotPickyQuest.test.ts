/**
 * **편식(picky_eater)을 봇이 실제로 걸어가는가.**
 *
 * 2026-08-19 사용자 보고: "봇 편식 증강 안 쓰는 것 같다." 원인은 발동 정책이 아니라
 * 그 앞이었다 — 편식은 "한 무늬(+자패)만 12장 버리기"라는 국의 절반짜리 퀘스트인데,
 * 봇의 버림 계산에는 그 규율이 한 줄도 없었다. 우연히 12장이 한 무늬로 나올 리 없으니
 * 발동 정책(`pick`)은 부를 것이 영영 생기지 않았다.
 *
 * 여기서 재는 것은 둘이다.
 *   1. 퀘스트가 걸린 국에는 **다른 무늬를 흘리지 않는다** (규율이 결정을 바꾼다).
 *   2. 퀘스트가 없거나 이미 깨진 국에는 **아무것도 안 바뀐다** (평범한 판을 망치지 않는다).
 */

import { describe, expect, it } from "vitest";
import { chooseDiscard } from "../src/bot/discard.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { readDiscardQuest } from "../src/bot/quest.js";
import type { TileId } from "@majak/core";
import { botScene, h } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

/**
 * 통수 3멘쯔 + 5삭 작두가 이미 섰고, 남은 것은 1만·9삭과 방금 쯔모한 2만.
 * 평소라면 외톨이 9삭이 가장 먼저 나간다 — 1만2만은 그래도 몸통이 될 씨앗이다.
 */
const HAND = "123p456p789p55s1m9s 2m";

/** 만수를 8장 흘려 온 국 — 이제 만수와 자패만 버릴 수 있다 */
const QUEST: BotViewOptions = {
  hand: HAND,
  turnCount: 9,
  augments: { p0: ["picky_eater"] },
  augmentView: {
    "picky_eater:progress:p0": { suit: "man", count: 8, need: 12, failed: false },
  },
};

/** 같은 장면인데 퀘스트가 없다 (증강만 들고 있고 아직 진행이 없다) */
const QUIET: BotViewOptions = { ...QUEST, augmentView: {} };

function pick(opts: BotViewOptions): string {
  const scene = botScene(opts);
  const read = buildRead(scene.view, "p0");
  const picked = chooseDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE);
  const tileId = (picked?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
  if (kind === undefined) return "none";
  const suit =
    kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
  return `${kind.suit === "dragon" ? kind.rank + 4 : kind.rank}${suit}`;
}

describe("편식 퀘스트 — 봇이 12장을 채우러 간다", () => {
  it("퀘스트가 없으면 평소대로 외톨이 9삭을 흘린다", () => {
    expect(pick(QUIET)).toBe("9s");
  });

  it("만수 퀘스트가 걸려 있으면 삭수를 흘리지 않는다 (만수를 낸다)", () => {
    const chosen = pick(QUEST);
    expect(chosen).not.toBe("9s");
    expect(chosen.endsWith("m")).toBe(true);
  });

  it("이미 깨진 퀘스트는 아무것도 바꾸지 않는다", () => {
    expect(
      pick({
        ...QUEST,
        augmentView: {
          "picky_eater:progress:p0": { suit: "man", count: 8, need: 12, failed: true },
        },
      }),
    ).toBe("9s");
  });

  it("남은 순이 모자라 못 채우는 국에서는 손을 비틀지 않는다", () => {
    expect(
      pick({
        ...QUEST,
        wallLeft: 8, // 자기 순 3번 남짓 — 8장에서 12장까지 못 간다
        augmentView: {
          "picky_eater:progress:p0": { suit: "man", count: 8, need: 12, failed: false },
        },
      }),
    ).toBe("9s");
  });
});

describe("규율 자체의 모양", () => {
  const questOf = (progress: unknown, wallLeft = 60): ReturnType<typeof readDiscardQuest> => {
    const scene = botScene({
      ...QUEST,
      wallLeft,
      augmentView: { "picky_eater:progress:p0": progress },
    });
    return readDiscardQuest(scene.view, "p0", wallLeft, 4000);
  };

  it("자패는 언제 버려도 퀘스트를 깨지 않는다", () => {
    const q = questOf({ suit: "man", count: 8, need: 12, failed: false });
    expect(q(h("1z")[0]!)).toBeGreaterThan(0);
    expect(q(h("5m")[0]!)).toBeGreaterThan(0); // 잠긴 무늬 — 진행이다
    expect(q(h("5p")[0]!)).toBeLessThan(0); // 다른 수패 — 깨진다
  });

  it("무늬가 아직 안 잠혔으면 규율이 없다 — 첫 한 장은 순수 EV에 맡긴다", () => {
    const q = questOf({ suit: null, count: 0, need: 12, failed: false });
    expect(q(h("5p")[0]!)).toBe(0);
  });

  it("진행이 깊을수록 깨는 값이 커진다", () => {
    const early = questOf({ suit: "man", count: 2, need: 12, failed: false });
    const late = questOf({ suit: "man", count: 10, need: 12, failed: false });
    expect(late(h("5p")[0]!)).toBeLessThan(early(h("5p")[0]!));
  });
});
