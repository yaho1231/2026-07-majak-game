/**
 * 리액션 경합에서 **진 봇이 판을 붙들지 않는가.**
 *
 * 같은 버림에 론과 펑이 함께 걸리면 `HanchanController`가 상위 선언을 확정하고 나머지
 * 프롬프트를 `cancelDecision()`으로 접는다. `BotAgent`에는 그 메서드가 아예 없어서
 * (`SandboxBotAgent`에만 있었다) 봇은 신호를 못 듣고 생각 시간을 끝까지 잤다.
 * 국은 `Promise.all`로 전원을 기다리므로, 펑을 고른 봇 하나가 **이미 결판난 남의 론을**
 * 최대 3초 남짓 붙들었다 — 경합이 붙은 모든 버림이 그만큼 죽은 시간을 먹었다.
 */

import { describe, expect, it } from "vitest";
import { BotAgent, optionKey } from "../src/BotAgent.js";
import { botScene } from "./botTestView.js";

describe("BotAgent.cancelDecision", () => {
  it("대기 중인 생각 시간을 즉시 끝낸다", async () => {
    const scene = botScene({ hand: "123m456p789s1122z" });
    // 생각 시간 2초 — 취소가 없으면 이 테스트는 2초를 기다린다
    const bot = new BotAgent("p0", "Bot", 1, undefined, 2000);
    bot.sendView(scene.view);

    const started = Date.now();
    const decision = bot.decide({ player: "p0", options: scene.discardOptions() });
    // 결정 자체는 동기로 이미 나와 있다 — 남은 것은 잠자는 시간뿐이다
    await Promise.resolve();
    bot.cancelDecision();
    const chosen = await decision;

    expect(chosen.type).toBe("discard");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("취소가 없으면 그대로 기다린다 (취소가 답을 바꾸지 않는다)", async () => {
    const scene = botScene({ hand: "123m456p789s1122z" });
    const a = new BotAgent("p0", "Bot", 7, undefined, 300);
    const b = new BotAgent("p0", "Bot", 7, undefined, 300);
    a.sendView(scene.view);
    b.sendView(scene.view);

    const cancelled = a.decide({ player: "p0", options: scene.discardOptions() });
    a.cancelDecision();
    const normal = await b.decide({ player: "p0", options: scene.discardOptions() });
    expect(optionKey(await cancelled)).toBe(optionKey(normal));
  });

  it("대기 중이 아닐 때 불러도 아무 일도 없다", () => {
    const bot = new BotAgent("p0");
    expect(() => bot.cancelDecision()).not.toThrow();
  });
});

describe("옵션 비교는 키 순서를 타지 않는다", () => {
  /**
   * `JSON.stringify`는 삽입 순서를 그대로 찍는다. 증강 정책이 `ctx.options`에서 고르지
   * 않고 옵션을 **직접 만들어** 돌려주면 키 순서 하나로 영영 매칭되지 않았고,
   * 경고도 테스트 실패도 없었다.
   */
  it("같은 뜻의 옵션은 키 순서가 달라도 같은 열쇠가 된다", () => {
    expect(optionKey({ type: "pon", payload: { tileIds: [1, 2] } })).toBe(
      optionKey({ payload: { tileIds: [1, 2] }, type: "pon" }),
    );
  });

  it("배열의 순서는 뜻이 있으므로 구별한다", () => {
    expect(optionKey({ type: "pon", payload: { tileIds: [1, 2] } })).not.toBe(
      optionKey({ type: "pon", payload: { tileIds: [2, 1] } }),
    );
  });

  it("undefined 필드는 없는 것과 같다", () => {
    expect(optionKey({ type: "pass", payload: {}, extra: undefined })).toBe(
      optionKey({ type: "pass", payload: {} }),
    );
  });
});
