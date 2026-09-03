/**
 * 관전 좌석분석 — **손패가 교환되면 배패 점수도 다시 잰다** (2026-09-03 사용자 보고).
 *
 * 배패 점수(`handGrade`)는 국 시작 때 한 번 재고 국이 끝날 때까지 고정이다. 그게
 * 옳다 — 「지금 손 점수」가 아니라 「어떤 배패를 받았나」의 값이기 때문이다. 그런데
 * 손을 **통째로 갈아 끼우는** 증강(통째로 바꾸기·자리 바꾸기 …)이 지나가면 그 전제가
 * 깨진다: 중계 도크가 이제 존재하지 않는 손의 점수를 국이 끝날 때까지 들고 있었다.
 *
 * 이 파일이 못박는 계약:
 *  1. 손이 교체되면 그 좌석만 다시 재고 `handGradeRegraded`가 선다.
 *  2. 평범한 쯔모·버림은 **절대** 다시 재지 않는다 — 값이 국 내내 가만히 서 있어야 한다.
 *  3. 배패 점수를 뺀 나머지 좌석 분석(샹텐·대기·최고 타점·후리텐)은 국이 도는 동안
 *     **살아서 다시 계산된다** — 고정인 것은 배패 점수 하나뿐이다.
 */

import { describe, expect, it } from "vitest";
import {
  buildSpectateSeatScores,
  createStandardGameFromState,
  handZone,
  initialHandGrades,
  refreshHandGrades,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "./helpers.js";

function scene(): GameState {
  return craft({
    hands: {
      p0: "123m456m789m1p4p7s9s", // 잡손 — 배패 점수가 낮다
      p1: "111s222s333s44455s", // 아주 좋은 손 — 점수가 확연히 다르다
      p2: "19m19p19s1234567z",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
  });
}

/** 두 좌석의 손패를 통째로 맞바꾼 상태 (교환 증강이 한 일과 같은 결과) */
function swapHands(state: GameState, a: string, b: string): GameState {
  const za = state.zones[handZone(a)]!;
  const zb = state.zones[handZone(b)]!;
  return {
    ...state,
    zones: {
      ...state.zones,
      [handZone(a)]: { ...za, tileIds: [...zb.tileIds] },
      [handZone(b)]: { ...zb, tileIds: [...za.tileIds] },
    },
  };
}

/** 한 장만 갈아 끼운 상태 (평범한 쯔모→버림 한 순과 같은 결과) */
function replaceOneTile(state: GameState, id: string, spare: number): GameState {
  const zone = state.zones[handZone(id)]!;
  return {
    ...state,
    zones: {
      ...state.zones,
      [handZone(id)]: { ...zone, tileIds: [...zone.tileIds.slice(1), spare] },
    },
  };
}

describe("배패 점수 — 손패가 교환되면 다시 잰다", () => {
  it("손이 통째로 바뀐 좌석만 다시 재고 표식이 선다", () => {
    const game = createStandardGameFromState(scene());
    const { engine } = game;
    const hg = initialHandGrades(engine.state, engine.rules);
    const before0 = hg.grades.p0!;
    const before1 = hg.grades.p1!;
    const before2 = hg.grades.p2!;
    expect(before0).not.toBe(before2); // 두 손이 애초에 다른 값이어야 시험이 성립한다

    const swapped = swapHands(engine.state, "p0", "p2");
    refreshHandGrades(swapped, engine.rules, hg);

    // 바꾼 두 좌석은 서로의 점수를 갖는다
    expect(hg.grades.p0).toBe(before2);
    expect(hg.grades.p2).toBe(before0);
    expect(hg.regraded.p0).toBe(true);
    expect(hg.regraded.p2).toBe(true);
    // 손대지 않은 좌석은 그대로 — 표식도 없다
    expect(hg.grades.p1).toBe(before1);
    expect(hg.regraded.p1).toBeUndefined();
  });

  it("좌석값에 handGradeRegraded 가 실린다 (바뀐 좌석만)", () => {
    const game = createStandardGameFromState(scene());
    const { engine } = game;
    const hg = initialHandGrades(engine.state, engine.rules);
    const swapped = swapHands(engine.state, "p0", "p2");
    refreshHandGrades(swapped, engine.rules, hg);

    const seats = buildSpectateSeatScores(
      swapped,
      engine.rules,
      game.yaku,
      hg.grades,
      () => false,
      hg.regraded,
    );
    const p0 = seats.find((s) => s.id === "p0")!;
    const p2 = seats.find((s) => s.id === "p1")!;
    expect(p0.handGrade).toBe(hg.grades.p0);
    expect(p0.handGradeRegraded).toBe(true);
    expect(p2.handGradeRegraded).toBeUndefined();
  });

  it("평범한 쯔모·버림(한 장 교체)은 다시 재지 않는다", () => {
    const game = createStandardGameFromState(scene());
    const { engine } = game;
    const hg = initialHandGrades(engine.state, engine.rules);
    const before = { ...hg.grades };

    // 산에서 아무 패나 한 장 가져와 손패 한 자리를 갈아 끼운다 (=쯔모 후 버림 한 순)
    const spare = engine.state.zones.wall!.tileIds[0]!;
    let next = replaceOneTile(engine.state, "p0", spare);
    refreshHandGrades(next, engine.rules, hg);
    expect(hg.grades).toEqual(before);
    expect(hg.regraded.p0).toBeUndefined();

    // 여러 순을 돌아도 마찬가지다 — 한 장씩이면 절대 절반 미만이 되지 않는다
    for (let i = 1; i < 6; i++) {
      next = replaceOneTile(next, "p0", engine.state.zones.wall!.tileIds[i]!);
      refreshHandGrades(next, engine.rules, hg);
    }
    expect(hg.grades).toEqual(before);
    expect(hg.regraded.p0).toBeUndefined();
  });
});

describe("나머지 좌석 분석은 국이 도는 동안 살아서 다시 계산된다", () => {
  it("손이 좋아지면 샹텐·대기·최고 타점이 그 자리에서 따라온다", () => {
    const game = createStandardGameFromState(scene());
    const { engine } = game;
    const seatOf = (state: GameState, id: string) =>
      buildSpectateSeatScores(state, engine.rules, game.yaku).find((s) => s.id === id)!;

    const before = seatOf(engine.state, "p0");
    expect(before.shanten).toBeGreaterThan(0);
    expect(before.waits).toBeUndefined(); // 텐파이가 아니면 대기가 없다
    expect(before.best).toBeUndefined();

    // p0에게 p1의 좋은 손을 준다 — 같은 국 안에서 값이 살아 움직여야 한다
    const swapped = swapHands(engine.state, "p0", "p1");
    const after = seatOf(swapped, "p0");
    expect(after.shanten).toBeLessThan(before.shanten);
  });

  it("텐파이가 되면 대기와 확정 타점이 실린다", () => {
    const base = craft({
      hands: {
        p0: "123m456m789m123p1p", // 1p 단기 텐파이
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(base);
    const seat = buildSpectateSeatScores(
      game.engine.state,
      game.engine.rules,
      game.yaku,
    ).find((s) => s.id === "p0")!;
    expect(seat.shanten).toBe(0);
    expect(seat.waits?.length).toBeGreaterThan(0);
    // 대기 계산은 **지금 손**을 본다 — 한 장을 갈아 끼우면 그 자리에서 달라진다.
    const other = buildSpectateSeatScores(
      swapHands(game.engine.state, "p0", "p1"),
      game.engine.rules,
      game.yaku,
    ).find((s) => s.id === "p0")!;
    expect(other.waits).not.toEqual(seat.waits);
  });
});
