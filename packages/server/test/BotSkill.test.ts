/**
 * 난이도(`profile.skill`)가 **판단에 실제로 닿는가**, 그리고 오라스의 헛된 론을
 * 흘리는가 (QA 4라운드 bot P1·P2).
 *
 * 되돌리면 실패해야 하는 것이 요점이다 — 예전 봇은 `skill`을 `bot/discard.ts`의
 * 흔들림 밴드 한 곳에서만 읽었고, 그래서 easy와 hard가 **같은 리치·같은 후로·같은
 * 수비**를 했다. 아래 검사들은 그 상태로 되돌리면 전부 깨진다.
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { scales, bidDiscard, bidRiichi } from "../src/bot/discard.js";
import { bidCall } from "../src/bot/call.js";
import { shouldDeclineRon } from "../src/bot/winCall.js";
import { NEUTRAL_PROFILE, withDifficulty } from "../src/bot/profile.js";
import type { BotProfile } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";
import type { PlayerView } from "@majak/core";

const easy: BotProfile = withDifficulty(NEUTRAL_PROFILE, "easy");
const hard: BotProfile = withDifficulty(NEUTRAL_PROFILE, "hard");

function readOf(view: PlayerView, profile: BotProfile, mode: "hanchan" | "tonpuu" = "hanchan") {
  return buildRead(view, "p0", { mode, profile });
}

describe("난이도가 판단에 닿는다", () => {
  const threatened: BotViewOptions = {
    hand: "234m567p2388s1122z",
    discards: { p1: "1119m", p2: "234p", p3: "567s" },
    riichi: ["p1"],
    doraIndicator: "1m",
    turnCount: 10,
    wallLeft: 40,
  };

  it("실력이 낮으면 방총 위험을 싸게 본다 (수비 저울)", () => {
    const scene = botScene(threatened);
    const soft = scales(readOf(scene.view, easy), easy);
    const sharp = scales(readOf(scene.view, hard), hard);
    expect(soft.loss).toBeLessThan(sharp.loss);
  });

  it("실력이 낮으면 리치 입찰이 헐거워진다", () => {
    const scene = botScene({
      hand: "234m567p234s55667z",
      doraIndicator: "1m",
      turnCount: 8,
      wallLeft: 45,
    });
    const options = scene.riichiOptions();
    const soft = bidRiichi(readOf(scene.view, easy), options, null, easy);
    const sharp = bidRiichi(readOf(scene.view, hard), options, null, hard);
    expect(soft).not.toBeNull();
    expect(sharp).not.toBeNull();
    expect(soft?.value ?? 0).toBeGreaterThan(sharp?.value ?? 0);
  });

  it("실력이 낮으면 후로 입찰이 헐거워진다", () => {
    const scene = botScene({
      hand: "234m567p23788s55z",
      lastDiscard: { player: "p3", spec: "5z" },
      doraIndicator: "1m",
      turnCount: 6,
    });
    const ids = [scene.idOf("5z"), scene.idOf("5z")];
    const options = [
      { type: "pon", payload: { tileIds: ids } },
      { type: "pass", payload: {} },
    ];
    const soft = bidCall(readOf(scene.view, easy), options, null, easy);
    const sharp = bidCall(readOf(scene.view, hard), options, null, hard);
    expect(soft).not.toBeNull();
    expect(sharp).not.toBeNull();
    expect(soft?.value ?? 0).toBeGreaterThan(sharp?.value ?? 0);
  });

  /**
   * 흔들림 폭이 **성격에만 곱해지던** 시절에는 조용한 원형(noise가 작은 손)에서
   * 난이도가 통째로 사라졌다. 점수 단위 바닥(`blunderFloor`)이 그 구멍을 메운다.
   */
  it("성격이 조용해도 초보는 최선이 아닌 패를 고를 수 있다", () => {
    const scene = botScene({
      hand: "1259m3679p2488s1z",
      doraIndicator: "5z",
      turnCount: 5,
      wallLeft: 50,
    });
    const options = scene.discardOptions();
    const quiet = { ...NEUTRAL_PROFILE, noise: 0 };
    const jitter = { int: (): number => 0 }; // 후보 묶음의 **맨 앞**을 고른다
    const soft = bidDiscard(
      readOf(scene.view, easy),
      options,
      null,
      { ...quiet, skill: 0.35 },
      jitter,
    );
    const sharp = bidDiscard(
      readOf(scene.view, hard),
      options,
      null,
      { ...quiet, skill: 1 },
      jitter,
    );
    // 실력 1은 흔들리지 않는다 — 최선 그대로
    const best = bidDiscard(readOf(scene.view, hard), options, null, { ...quiet, skill: 1 });
    expect(sharp?.option).toBe(best?.option);
    // 초보는 최선보다 나쁜 패를 고를 수 있다 (되돌리면 둘이 항상 같아진다)
    expect(soft?.option).not.toBe(best?.option);
  });
});

describe("오라스 — 순위를 못 바꾸는 론은 흘린다", () => {
  /** 오라스(남4국) 3위. 위와 6000점 차, 아래와 5000점 차 */
  const allLast = (over: Partial<BotViewOptions> = {}): BotViewOptions => ({
    hand: "123m456p789s1122z",
    prevalentWind: 2,
    roundNumber: 4,
    wallLeft: 30,
    turnCount: 8,
    scores: { p0: 20000, p1: 26000, p2: 15000, p3: 39000 },
    ...over,
  });

  /** p0을 자(子)로, 버림 주인을 p1으로 세운다 (botScene의 기본은 p0 = 오야) */
  function scene(over: Partial<BotViewOptions> = {}) {
    const s = botScene(allLast(over));
    const round = s.view.round as { dealerSeat: number; turnSeat: number };
    round.dealerSeat = 1;
    round.turnSeat = 1;
    return s;
  }

  it("순위가 그대로인 오라스 론은 흘린다", () => {
    const s = scene();
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(true);
  });

  it("오라스가 아니면 흘리지 않는다", () => {
    const s = scene({ prevalentWind: 1, roundNumber: 1 });
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("1위는 끝내는 것이 옳다 — 흘리지 않는다", () => {
    const s = scene({ scores: { p0: 39000, p1: 26000, p2: 15000, p3: 20000 } });
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("위 순위가 한 손으로 안 닿으면 흘리지 않는다", () => {
    const s = scene({ scores: { p0: 20000, p1: 45000, p2: 15000, p3: 20000 } });
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("순목이 얼마 안 남았으면 흘리지 않는다 (다시 만들 시간이 없다)", () => {
    const s = scene({ wallLeft: 4 });
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("리치 중이면 흘리지 않는다 (그 국 내내 후리텐이 된다)", () => {
    const s = scene({ myRiichi: true });
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("오야는 흘리지 않는다 — 화료가 연장이라 기회를 늘린다", () => {
    const s = botScene(allLast()); // p0 = 오야 (기본)
    expect(shouldDeclineRon(readOf(s.view, hard), hard)).toBe(false);
  });

  it("초보 봇은 이 계산을 하지 않는다 (난이도 축의 하나)", () => {
    const s = scene();
    expect(shouldDeclineRon(readOf(s.view, easy), easy)).toBe(false);
  });
});
