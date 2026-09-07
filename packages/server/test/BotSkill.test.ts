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

/**
 * 결정론 난수 지터 — 고정값(`int: () => 0`)으로는 가중 추첨의 **맨 앞만** 뽑혀
 * 「가끔 이쪽」이 한 번도 안 나온다. 씨앗을 바꿔 가며 분포를 본다.
 */
function jitterFrom(seed: number): { int(n: number): number } {
  let s = ((seed + 1) * 2654435761) % 4294967296;
  return {
    int(n: number): number {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return Math.floor((s / 4294967296) * n);
    },
  };
}

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

  /**
   * **손 효율에 난이도가 닿는다** (2026-09-07).
   *
   * `shapesOf`는 원래 최선 샹텐을 유지하는 후보만 정밀하게 쟀고, 그래서 「지금 텐파이가
   * 늦어지는 대신 대기가 넓어지는 형태」는 우케이레 0으로 남아 **구조적으로 선택될 수
   * 없었다** — 난이도를 아무리 낮춰도 텐파이 속도가 hard와 똑같았던 이유다.
   * 실력이 1보다 낮으면 한 샹텐 뒤처지는 형태까지 잰다(`skill.shapeSlack`).
   */
  it("초보만 한 샹텐 뒤처지는 형태까지 후보로 잰다", () => {
    const scene = botScene({
      hand: "1259m3679p2488s1z",
      doraIndicator: "5z",
      turnCount: 5,
      wallLeft: 50,
    });
    const options = scene.discardOptions();
    const seen = new Set<number>();
    // 지터를 여러 번 다르게 줘서 easy가 실제로 느린 형태를 고르는 순간을 잡는다
    for (let i = 0; i < 200; i++) {
      const bid = bidDiscard(readOf(scene.view, easy), options, null, easy, jitterFrom(i));
      const m = /샹텐(\d+)/.exec(bid?.reason ?? "");
      if (m?.[1] !== undefined) seen.add(Number(m[1]));
    }
    const sharp = bidDiscard(readOf(scene.view, hard), options, null, hard);
    const bestShanten = Number(/샹텐(\d+)/.exec(sharp?.reason ?? "")?.[1] ?? 0);
    // 초보는 최선 샹텐도 고르고, 한 발 늦는 형태도 고른다
    expect(seen.has(bestShanten)).toBe(true);
    expect([...seen].some((s) => s > bestShanten)).toBe(true);
  });

  /**
   * 느린 형태는 **이길 수 없다**. `winChanceOf`가 우케이레를 크게 보므로 그냥 같은
   * 저울에 올리면 샹텐이 나쁘고 우케이레만 넓은 형태가 텐파이 직전 형태를 이긴다 —
   * 실측으로 easy 봇이 매 순번 그걸 골라 화료율이 0.010까지 떨어졌다(hard 0.274).
   */
  it("느린 형태가 최선을 밀어내지는 않는다 (흔들림이 없으면 최선 그대로)", () => {
    const scene = botScene({
      hand: "1259m3679p2488s1z",
      doraIndicator: "5z",
      turnCount: 5,
      wallLeft: 50,
    });
    const options = scene.discardOptions();
    // 지터를 안 넘기면 결정론적 최선이다 — 난이도가 달라도 같은 패여야 한다
    const soft = bidDiscard(readOf(scene.view, easy), options, null, easy);
    const sharp = bidDiscard(readOf(scene.view, hard), options, null, hard);
    expect(soft?.option).toBe(sharp?.option);
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
