/**
 * 측정 중인 세 스위치 — **모형의 구멍을 메우는 쪽**이 실제로 그렇게 도는가.
 *
 * 셋 다 "코드를 읽으면 명백히 틀린 자리"지만, 고치면 봇의 노는 방식이 통째로 바뀌는
 * 종류라 곧바로 기본 동작으로 삼지 않았다(docs/27 §3 — 400배패로 못 가르는 크기를
 * "방향은 맞다"로 채택했다가 부호가 뒤집힌 전례가 있다). 여기서는 **스위치가 의도한
 * 대로 도는지**만 못 박는다. 강함은 2:2 대전이 답한다.
 *
 *   - `damaten`  — 리치도 후로도 없는 상대의 위협이 11순까지 정확히 0이었다
 *   - `place2`   — 올라스에 위아래가 둘 다 멀면 압박이 스스로 상쇄돼 0이 됐다
 *   - `passrisk` — 후로 EV에는 위험 항이 있는데 패스 EV에는 한 줄도 없었다
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { readMatch } from "../src/bot/match.js";
import { bidPass } from "../src/bot/call.js";
import { parseFlags } from "../src/bot/flags.js";
import { profileOf } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";

const ON = (name: string): ReturnType<typeof parseFlags> => parseFlags(name);

describe("damaten — 보이지 않는 텐파이", () => {
  const scene = (turn: number) =>
    botScene({
      hand: "123m456p789s1122z",
      // 상대 셋 다 리치도 후로도 없다 — 예전에는 12순 전까지 위협이 정확히 0이었다
      discards: { p1: "1111m", p2: "2222p", p3: "3333s" },
      turnCount: turn,
    });

  const threatAt = (turn: number, on: boolean): number =>
    buildRead(scene(turn).view, "p0", { ...(on ? { flags: ON("damaten") } : {}) }).threat;

  it("예전 동작은 11순까지 정확히 0이고 12순에 계단이 선다", () => {
    expect(threatAt(11, false)).toBe(0);
    expect(threatAt(12, false)).toBeCloseTo(0.15, 5);
  });

  it("켜면 순목에 대해 연속으로 자란다 — 절벽이 없다", () => {
    const levels = [4, 8, 11, 14, 17].map((t) => threatAt(t, true));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] as number).toBeGreaterThan(levels[i - 1] as number);
    }
    // 11순에서 예전 12순 값과 이어진다 (눈금을 옮기지 않았다)
    expect(threatAt(11, true)).toBeCloseTo(0.15, 5);
  });

  it("종반 상한이 리치·후로 손보다 낮다 (다마는 어디까지나 드물다)", () => {
    expect(threatAt(20, true)).toBeLessThan(0.3);
  });
});

describe("place2 — 순위 사다리 전체를 본다", () => {
  const allLast = (scores: Record<string, number>) =>
    botScene({
      hand: "123m456m789m11p5s7z",
      prevalentWind: 2,
      roundNumber: 4,
      scores,
    });

  it("굳은 2위가 '평시'로 읽히던 것이 고쳐진다", () => {
    // 1위와 +30000, 3위와 −30000 — 어느 쪽도 닿지 않는다
    const s = allLast({ p0: 25000, p1: 55000, p2: 25000 - 30000, p3: 25000 - 30000 });
    const before = readMatch(s.view, "p0", "hanchan");
    const after = readMatch(s.view, "p0", "hanchan", ON("place2"));
    expect(before.rank).toBe(2);
    // 예전 식: 쫓는 압박 1 − 지키는 압박 1 = 0. 남는 것은 오야 보정뿐이다.
    expect(before.riskAppetite).toBeCloseTo(0.1, 5);
    expect(after.riskAppetite).toBeLessThan(before.riskAppetite - 0.3);
  });

  it("코앞의 3위를 쫓는 꼴찌는 훨씬 세게 민다", () => {
    const s = allLast({ p0: 10000, p1: 55000, p2: 43000, p3: 12000 });
    const before = readMatch(s.view, "p0", "hanchan").riskAppetite;
    const after = readMatch(s.view, "p0", "hanchan", ON("place2")).riskAppetite;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(0.5);
  });

  it("아슬아슬한 선두는 여전히 최대한 지킨다", () => {
    const s = allLast({ p0: 30000, p1: 28000, p2: 21000, p3: 21000 });
    expect(readMatch(s.view, "p0", "hanchan", ON("place2")).riskAppetite).toBeLessThan(-0.5);
  });

  it("초반에는 사다리를 봐도 압박이 거의 없다 (lateness가 눌러 준다)", () => {
    const early = botScene({
      hand: "123m456m789m11p5s7z",
      scores: { p0: 10000, p1: 40000, p2: 30000, p3: 20000 },
    });
    expect(
      Math.abs(readMatch(early.view, "p0", "hanchan", ON("place2")).riskAppetite),
    ).toBeLessThan(0.3);
  });
});

describe("passrisk — 패스도 공짜가 아니다", () => {
  const scene = () =>
    botScene({
      hand: "3456m3456p3456s7z",
      riichi: ["p1"],
      discards: { p1: "1119m", p2: "999s", p3: "999p" },
      turnCount: 10,
      lastDiscard: { player: "p3", spec: "7m" },
    });

  const passValue = (on: boolean): number => {
    const s = scene();
    const read = buildRead(s.view, "p0", { ...(on ? { flags: ON("passrisk") } : {}) });
    const options = [{ type: "pass", payload: {} }] as never;
    return bidPass(read, options, null, profileOf("balanced"))?.value ?? 0;
  };

  it("위협이 있는 판에서 패스 EV가 내려간다", () => {
    expect(read0()).toBeGreaterThan(0);
    expect(passValue(true)).toBeLessThan(passValue(false));
  });

  it("위협이 없으면 켜도 그대로다 (열어도 잃을 것이 없는 판)", () => {
    const s = botScene({ hand: "3456m3456p3456s7z", turnCount: 3 });
    const options = [{ type: "pass", payload: {} }] as never;
    const off = bidPass(buildRead(s.view, "p0"), options, null, profileOf("balanced"));
    const on = bidPass(
      buildRead(s.view, "p0", { flags: ON("passrisk") }),
      options,
      null,
      profileOf("balanced"),
    );
    expect(on?.value).toBe(off?.value);
  });

  /** 위 장면에 실제로 위협이 서 있는지 — 없으면 첫 테스트가 헛돈다 */
  function read0(): number {
    return buildRead(scene().view, "p0").threat;
  }
});
