/**
 * 드래프트 픽 검증이 **남의 픽에 흔들리지 않는가.**
 *
 * ## 무엇이 있었나
 *
 * 증강을 켠 아레나가 60배패 만에 예외로 죽었다 —
 * `Error: Augment soul_hunt was not offered to p2`.
 *
 * 스테이지 진행은 (전원에게 오퍼 → 전원 응답 → 고정 순서로 픽 적용)인데,
 * `DraftController.pick`은 "제시된 것인가"를 **다시 뽑아서** 검증한다. 그런데 그 재추첨의
 * 금지 목록에 `heldByOthers`(남이 보유한 증강)가 **살아 있는 상태로** 들어가 있었다.
 * 앞 사람의 픽이 이미 적용된 뒤라 재추첨 결과가 달라지고, 내가 고른 것이 "제시된 적 없다"가
 * 된다. 좌석 칸(`cellFor`)이 서로 소라 원래 이런 일이 없어야 하지만, 칸이 마르면
 * **칸 밖에서 보충**하는 통로로 남의 칸 증강이 새어 들어와 둘이 같은 것을 고를 수 있었다.
 *
 * 고친 방식: 금지 목록의 근거를 **스테이지가 열린 시점의 스냅샷**으로 고정한다.
 */

import { describe, expect, it } from "vitest";
import { DraftController, createStandardGame } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function game(seed: number) {
  return createStandardGame({ seed, mode: "hanchan", extraAugments: contentAugments });
}

describe("픽 검증은 남의 픽에 흔들리지 않는다", () => {
  it("남이 내 후보에 있는 증강을 가져가도 내 후보는 그대로다", () => {
    for (const seed of [7, 42, 909]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });

      const before = draft.roll("gameStart", "p2").map((d) => d.id);
      const leaked = before[0] as string;

      // 칸 밖 보충으로 남에게도 같은 것이 새어 나간 상황을 그대로 만든다 —
      // p0이 **내 후보에 있는** 증강을 이번 스테이지에 가져간다.
      const submitted = g.engine.submit({
        player: "p0" as PlayerId,
        type: "draftPick",
        payload: { augmentId: leaked, markStage: "gameStart" },
      });
      expect(submitted.ok).toBe(true);

      const after = draft.roll("gameStart", "p2").map((d) => d.id);
      expect(after).toEqual(before);
      // 그래서 p2의 픽이 예외로 끊기지 않는다 (예전에는 여기서 죽었다)
      expect(() => draft.pick("gameStart", "p2", leaked)).not.toThrow();
    }
  });

  it("앞 스테이지에서 남이 가져간 것은 여전히 제외된다 (스냅샷이 뒤로 밀리지 않는다)", () => {
    const g = game(31337);
    const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });

    const taken: string[] = [];
    for (const p of PLAYERS) {
      const pick = draft.roll("gameStart", p)[0] as { id: string };
      draft.pick("gameStart", p, pick.id);
      taken.push(pick.id);
    }

    for (const p of PLAYERS) {
      const offer = draft.roll("eastThird", p).map((d) => d.id);
      for (const id of taken) expect(offer).not.toContain(id);
    }
  });
});
