/**
 * 결정 코어 — 모든 행동이 **같은 축에서 입찰**하는지 검증한다.
 *
 * 2026-08-05 이전 `BotAgent.decideNow`는 고정된 우선순위 사슬이었다
 * (화료 → 증강 → 깡 → 후로 → 리치 → 버림). 각 단계가 "한다/안 한다"만 돌려주고
 * 앞 단계가 하겠다면 뒤 단계는 물어보지도 않아서, **봇은 비교를 한 적이 없었다.**
 * 이 펑이 리치보다 이득인지 물을 자리가 구조적으로 없었고, 새 판단을 붙이려면
 * 사슬 어딘가에 끼워 넣어야 했다 — 그 위치가 곧 판단이 되어 버리는 구조였다.
 *
 * 여기서 잡는 것:
 *   1. 입찰값이 점수 단위로 서로 비교 가능한가 (증강 강도까지 같은 축에 올라오는가)
 *   2. 층 구분이 "게임의 사실"인가 — 턴을 소비하지 않는 행동만 먼저 간다
 *   3. 모든 결정에 근거(`reason`)가 남는가
 */

import { describe, expect, it } from "vitest";
import { augmentPoints, bestBid, EXTRA_ACTION_FLOOR } from "../src/bot/decide.js";
import type { ActionBid } from "../src/bot/decide.js";
import { BOT_WEIGHT } from "@majak/core";
import { bidDiscard, bidRiichi } from "../src/bot/discard.js";
import { bidPass } from "../src/bot/call.js";
import { bidKan } from "../src/bot/kan.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";

const bid = (value: number, type = "x"): ActionBid => ({
  option: { type, payload: {} },
  value,
  reason: "t",
});

describe("입찰 뽑기", () => {
  it("값이 가장 큰 입찰이 이긴다", () => {
    expect(bestBid([bid(10), bid(50), bid(30)])?.value).toBe(50);
  });

  it("동점은 먼저 들어온 쪽이 이긴다 (결정론 — 리플레이가 깨지지 않는다)", () => {
    expect(bestBid([bid(50, "a"), bid(50, "b")])?.option.type).toBe("a");
  });

  it("입찰이 하나도 없으면 null", () => {
    expect(bestBid([null, null])).toBeNull();
  });
});

describe("증강 강도 → 점수 환율", () => {
  /**
   * 증강 정책 115개는 `BOT_WEIGHT`라는 별도 눈금으로 말한다. 그 눈금은 증강끼리
   * 비교하는 데는 충분했지만 깡·리치·버림과는 비교할 수 없었고, 그래서 예전 봇은
   * 발동 가능한 증강이 있으면 값어치와 무관하게 **무조건 먼저 태웠다.**
   */
  const HAND = 8000;

  it("강도 순서가 점수 순서로 보존된다 — 정책을 한 줄도 고치지 않는다", () => {
    const ladder = [
      BOT_WEIGHT.info,
      BOT_WEIGHT.setup,
      BOT_WEIGHT.normal,
      BOT_WEIGHT.advance,
      BOT_WEIGHT.defend,
      BOT_WEIGHT.win,
    ].map((w) => augmentPoints(w, HAND));
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i] as number).toBeGreaterThan(ladder[i - 1] as number);
    }
  });

  /**
   * **이 테스트는 예전에 가장 유리한 한 점만 봤다** — `HAND = 8000`, 강도는 눈금 그대로
   * 20, 참을성 보정 없음. 그 한 점에서는 145점이 나와 문턱 60을 여유롭게 넘는다.
   * 실제 봇이 내는 입찰은 그 점에 거의 없다: 손은 대개 8000점보다 싸고, 강도는
   * 적기(`botPlan`)가 0.55~1.0 배로 깎고, 참을성 있는 원형은 거기에 다시 0.85를 곱한다.
   * 그 셋을 겹치면 손 3,333점 이하에서 **입찰 전 구간이 문턱 아래**였다 —
   * 즉 이 테스트가 지키겠다고 선언한 성질이 실제로는 거짓인 채로 통과하고 있었다.
   *
   * 이제 **정책이 입찰을 만드는 전 구간**을 본다. 문턱은 "그럴듯한 한 점"이 아니라
   * 가장 불리한 구석에서 지켜져야 성질이다.
   */
  it("정보 계열도 '아무것도 안 하기'보다는 값이 있다 — 싼 손·어중간한 적기·참을성 있는 봇까지", () => {
    // botPlan: weight = BOT_WEIGHT.info × (0.55 + 0.45 × 적기), 적기 문턱은 inform 0.35
    const weightAt = (fit: number): number => BOT_WEIGHT.info * (0.55 + 0.45 * fit);
    // BotAgent: 가장 참을성 있는 원형이 곱하는 최악의 계수 (patience = 1)
    const PATIENT = 1.15 - 1 * 0.3;
    for (const hand of [1000, 2000, 3000, 5000, 8000]) {
      for (const fit of [0.35, 0.5, 0.75, 1]) {
        expect(augmentPoints(weightAt(fit), hand) * PATIENT).toBeGreaterThan(EXTRA_ACTION_FLOOR);
      }
    }
  });

  it("문턱을 넘는 것이 정책의 적기 문턱과 이어져 있다 (버려지는 입찰 구간이 없다)", () => {
    // 적기가 문턱 바로 아래면 정책이 아예 입찰을 안 만든다 — 그 아래는 검사 대상이 아니다
    const justBelow = BOT_WEIGHT.info * (0.55 + 0.45 * 0.34);
    const justAbove = BOT_WEIGHT.info * (0.55 + 0.45 * 0.35);
    const PATIENT = 1.15 - 1 * 0.3;
    expect(augmentPoints(justAbove, 1000) * PATIENT).toBeGreaterThan(EXTRA_ACTION_FLOOR);
    // 아래쪽은 '넘어야 한다'가 아니라 '정책이 만들지 않는다'로 막힌다 — 값만 확인
    expect(augmentPoints(justBelow, 1000)).toBeLessThan(augmentPoints(justAbove, 1000));
  });

  it("화료급 발동은 손 값어치에 맞먹는 무게가 된다", () => {
    expect(augmentPoints(BOT_WEIGHT.win, HAND)).toBeGreaterThan(HAND * 0.6);
  });

  it("같은 강도라도 비싼 손에서 더 값나간다", () => {
    expect(augmentPoints(BOT_WEIGHT.normal, 12000)).toBeGreaterThan(
      augmentPoints(BOT_WEIGHT.normal, 1000),
    );
  });
});

describe("턴 소비 층 — 절대 EV로 직접 견준다", () => {
  it("리치와 버림이 같은 축에서 값매겨진다 (다마텐은 규칙이 아니라 결과다)", () => {
    const scene = botScene({ hand: "123m456m789m11p56s1z", doraIndicator: "2m" });
    const read = buildRead(scene.view, "p0");
    const riichi = bidRiichi(read, scene.riichiOptions(), null, NEUTRAL_PROFILE);
    const quiet = bidDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE);
    expect(riichi).not.toBeNull();
    expect(quiet).not.toBeNull();
    // 값싼 손이라 리치가 이긴다 — 그리고 그 판단이 두 숫자의 비교로 설명된다
    expect(riichi?.value).toBeGreaterThan(quiet?.value as number);
  });

  it("모든 입찰에 근거가 붙는다 — 봇이 왜 그렇게 뒀는지가 남는다", () => {
    const scene = botScene({ hand: "123m456m789m11p56s1z" });
    const read = buildRead(scene.view, "p0");
    expect(bidDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE)?.reason).toMatch(
      /샹텐/,
    );
    expect(bidRiichi(read, scene.riichiOptions(), null, NEUTRAL_PROFILE)?.reason).toMatch(
      /대기/,
    );
  });

  it("패스 입찰은 '지금 손 그대로'의 값 — 콜과 같은 축이라 직접 비교된다", () => {
    const scene = botScene({
      hand: "123m456m789m11p5s",
      lastDiscard: { player: "p3", spec: "5s" },
    });
    const read = buildRead(scene.view, "p0");
    const options = [
      { type: "pon", payload: { tileIds: [scene.idOf("5s"), scene.idOf("5s")] } },
      { type: "pass", payload: {} },
    ];
    const pass = bidPass(read, options, null, NEUTRAL_PROFILE);
    expect(pass).not.toBeNull();
    expect(pass?.value).toBeGreaterThanOrEqual(0);
    expect(pass?.reason).toMatch(/패스/);
  });

  it("울면 멘젠 판수가 날아가는 것이 값에 실제로 들어간다", () => {
    // 역패가 아닌 5s 펑 — 멘젠 손을 열면 리치·쯔모·우라가 통째로 사라진다.
    const scene = botScene({
      hand: "123m456m789m55s5s5p",
      lastDiscard: { player: "p3", spec: "5s" },
    });
    const read = buildRead(scene.view, "p0");
    const menzen = read.valueOf({ plan: null });
    const opened = read.valueOf({ plan: null, meldCount: 1 });
    expect(opened.points).toBeLessThan(menzen.points);
  });
});

describe("추가 행동 층 — 턴을 소비하지 않는다", () => {
  it("깡의 값은 새 도라뿐 아니라 영상패(쯔모 한 번)도 센다", () => {
    // 자패 4장 안깡 — 손 모양은 그대로고 쯔모가 한 번 늘어난다
    const scene = botScene({ hand: "1111z123m456m789p5s", turnCount: 4 });
    const read = buildRead(scene.view, "p0");
    const ids = (scene.view.zones["hand:p0"]?.tileIds ?? []).filter((id) => {
      const k = scene.view.tiles[id]?.kind;
      return k?.suit === "wind" && k.rank === 1;
    });
    const kan = bidKan(
      read,
      [{ type: "ankan", payload: { tileIds: ids } }],
      NEUTRAL_PROFILE,
      null,
    );
    expect(kan).not.toBeNull();
    expect(kan?.value).toBeGreaterThan(0);
    expect(kan?.reason).toMatch(/깡/);
  });

  it("남이 리치 중이면 깡의 값이 떨어진다 — 새 도라는 남에게도 붙는다", () => {
    const base = { hand: "1111z123m456m789p5s", turnCount: 8 } as const;
    const idsOf = (scene: ReturnType<typeof botScene>) =>
      (scene.view.zones["hand:p0"]?.tileIds ?? []).filter((id) => {
        const k = scene.view.tiles[id]?.kind;
        return k?.suit === "wind" && k.rank === 1;
      });
    const calm = botScene(base);
    const danger = botScene({ ...base, riichi: ["p1"] });
    const calmBid = bidKan(
      buildRead(calm.view, "p0"),
      [{ type: "ankan", payload: { tileIds: idsOf(calm) } }],
      NEUTRAL_PROFILE,
      null,
    );
    const dangerBid = bidKan(
      buildRead(danger.view, "p0"),
      [{ type: "ankan", payload: { tileIds: idsOf(danger) } }],
      NEUTRAL_PROFILE,
      null,
    );
    expect(dangerBid?.value).toBeLessThan(calmBid?.value as number);
  });
});
