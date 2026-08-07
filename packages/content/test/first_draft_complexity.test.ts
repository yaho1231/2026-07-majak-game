/**
 * 첫 드래프트 난도 필터 — **거르되, 결정성은 건드리지 않는다.**
 *
 * 리플레이·이어하기는 드래프트 오퍼가 시드에서 그대로 재현된다는 것에 기대고 있다
 * (`DraftController.pick`이 제출 검증에 `roll`을 다시 계산한다). 그래서 오퍼 경로에
 * 무언가를 얹을 때는 두 가지를 함께 증명해야 한다.
 *
 *  ① 필터가 **거는 자리에서만** 걸린다 — `gameStart` 외 스테이지의 결과는 한 글자도
 *    안 바뀐다.
 *  ② 필터가 걸린 자리에서도 **같은 시드 → 같은 결과**가 그대로다.
 */

import { describe, expect, it } from "vitest";
import { DraftController, createStandardGame } from "@majak/core";
import type { DraftStage, PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const LATER_STAGES: DraftStage[] = ["eastThird", "southEntry", "southThird"];
const SEEDS = [1, 7, 42, 909, 31337, 2026];

function draftOf(seed: number, mode: "hanchan" | "tonpuu" = "hanchan") {
  const g = createStandardGame({ seed, mode, extraAugments: contentAugments });
  return new DraftController(g.engine, g.augments, { yaku: g.yaku });
}

const complexityOf = (id: string): number =>
  contentAugments.find((a) => a.id === id)?.complexity ?? 2;

describe("첫 드래프트에서 난도 3을 뺀다", () => {
  it("gameStart 오퍼에 난도 3이 하나도 없다", () => {
    for (const seed of SEEDS) {
      const draft = draftOf(seed);
      for (const p of PLAYERS) {
        const offer = draft.roll("gameStart", p).map((d) => d.id);
        expect(offer.length, `seed=${seed} ${p} 오퍼 수`).toBe(3);
        const hard = offer.filter((id) => complexityOf(id) >= 3);
        expect(hard, `seed=${seed} ${p}에 난도 3이 나왔다`).toEqual([]);
      }
    }
  });

  it("두 번째 스테이지부터는 난도 3도 정상적으로 나온다", () => {
    // 한 판을 쳐 본 뒤에는 아무것도 빼지 않는다 — 필터가 gameStart에만 걸린다는 증명.
    let sawHard = false;
    for (const seed of SEEDS) {
      const draft = draftOf(seed);
      for (const stage of LATER_STAGES) {
        for (const p of PLAYERS) {
          if (draft.roll(stage, p).some((d) => complexityOf(d.id) >= 3)) sawHard = true;
        }
      }
    }
    expect(sawHard, "후속 스테이지에서도 난도 3이 한 번도 안 나왔다").toBe(true);
  });
});

describe("드래프트 결정성", () => {
  it("같은 시드는 같은 오퍼를 낸다 (필터가 걸린 gameStart 포함)", () => {
    for (const seed of SEEDS) {
      const a = draftOf(seed);
      const b = draftOf(seed);
      for (const stage of ["gameStart", ...LATER_STAGES] as DraftStage[]) {
        for (const p of PLAYERS) {
          expect(a.roll(stage, p).map((d) => d.id)).toEqual(
            b.roll(stage, p).map((d) => d.id),
          );
        }
      }
    }
  });

  it("한 컨트롤러 안에서 몇 번을 다시 뽑아도 같다 (pick 검증의 전제)", () => {
    const draft = draftOf(4242);
    for (const p of PLAYERS) {
      const first = draft.roll("gameStart", p).map((d) => d.id);
      expect(draft.roll("gameStart", p).map((d) => d.id)).toEqual(first);
      expect(() => draft.pick("gameStart", p, first[0] as string)).not.toThrow();
    }
  });

  it("동풍전에서도 첫 스테이지만 걸린다", () => {
    const draft = draftOf(77, "tonpuu");
    for (const p of PLAYERS) {
      expect(draft.roll("gameStart", p).filter((d) => complexityOf(d.id) >= 3)).toEqual(
        [],
      );
      expect(draft.roll("eastThird", p).length).toBe(3);
    }
  });
});
