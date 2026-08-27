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
import { AUGMENT_POWER_TIERS, DraftController, createStandardGame } from "@majak/core";
import type { DraftStage, PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { ALL_AUGMENTS } from "./catalogSource.js";

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

/**
 * 첫 드래프트 풀의 **축 균형** (2026-08-27).
 *
 * 난도 3 제외는 초보 보호가 목적인데, 실측해 보니 난도 3에 타점형이 몰려 있어서
 * (41종 중 61%) 게이트가 사실상 **"첫 픽에서 타점형을 빼는" 장치**로 돌고 있었다 —
 * "초반엔 무조건 속도 증강"이라는 인식의 구조적 원인이다. 난도 값을 다시 매겨
 * (게이트 자체는 그대로) 타점형 비율을 28.8% → 35.8%로 올렸다. 여기서 못박는다.
 *
 * 축은 `AUGMENT_POWER_TIERS`의 p(타점)·s(속도)로 본다. 개벽·단색 세계는 의도된
 * 잭팟이라 집계에서 뺀다.
 */
describe("첫 드래프트 풀의 타점/속도 균형", () => {
  const JACKPOT = new Set(["genesis", "suit_unify"]);

  it("타점우위가 35% 이상이고 속도우위와의 격차가 12%p 이내다", () => {
    const pool = ALL_AUGMENTS.filter(
      (a) =>
        !JACKPOT.has(a.id) &&
        (a.draftStages === undefined || a.draftStages.includes("gameStart")) &&
        (a.complexity ?? 2) < 3,
    );
    let power = 0;
    let speed = 0;
    for (const a of pool) {
      const e = AUGMENT_POWER_TIERS[a.id];
      if (e === undefined) continue;
      if (e.p > e.s) power += 1;
      else if (e.s > e.p) speed += 1;
    }
    const pRatio = power / pool.length;
    const sRatio = speed / pool.length;
    expect(pRatio, `첫 드래프트 타점우위 비율 (${power}/${pool.length})`).toBeGreaterThanOrEqual(0.35);
    expect(sRatio - pRatio, "속도우위가 타점우위보다 이만큼 많다").toBeLessThanOrEqual(0.12);
  });
});
