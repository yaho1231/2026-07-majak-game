/**
 * **모형의 구멍 셋** — 2026-08-08에 스위치를 떼고 기본 동작이 된 것들.
 *
 * 셋 다 "코드를 읽으면 명백히 틀린 자리"였지만 고치면 봇이 노는 방식이 통째로 바뀌는
 * 종류라, 곧바로 기본으로 삼지 않고 `bot/flags.ts`의 스위치 뒤에 두고 2:2 듀플리케이트
 * 대전으로 쟀다(docs/27 §3 — 400배패로 못 가르는 크기를 "방향은 맞다"로 채택했다가
 * 부호가 뒤집힌 전례가 있다). 셋 다 **강함이 표준오차 안에서 그대로**였고, 강함을 잃지
 * 않은 채 모형이 옳아지므로 채택했다.
 *
 *   - `damaten`  — 리치도 후로도 없는 상대의 위협이 11순까지 정확히 0이었다
 *                  (220배패: 순위 −0.0023 ± 0.0553)
 *   - `place2`   — 올라스에 위아래가 둘 다 멀면 압박이 스스로 상쇄돼 0이 됐다
 *                  (340배패: 순위 −0.0206 ± 0.0434)
 *   - `passrisk` — 후로 EV에는 위험 항이 있는데 패스 EV에는 한 줄도 없었다
 *                  (300배패: 순위 −0.0017 ± 0.0310 · 후로율 16.0% → 17.8%)
 *
 * 여기서는 **그 동작이 실제로 그렇게 도는지**를 못 박는다. 강함은 아레나가 답한다.
 * 같은 이유로 재고 **반려한** `menzenfu`도 아래에 남겨 둔다 — 스위치가 살아 있어야
 * 나중에 다시 잴 수 있다.
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { readMatch } from "../src/bot/match.js";
import { bidPass } from "../src/bot/call.js";
import { parseFlags } from "../src/bot/flags.js";
import { profileOf } from "../src/bot/profile.js";
import { estimateHandValue } from "../src/bot/value.js";
import { botScene } from "./botTestView.js";

describe("다마텐 — 보이지 않는 텐파이에 값이 붙는다", () => {
  const scene = (turn: number) =>
    botScene({
      hand: "123m456p789s1122z",
      // 상대 셋 다 리치도 후로도 없다 — 예전에는 12순 전까지 위협이 정확히 0이었다
      discards: { p1: "1111m", p2: "2222p", p3: "3333s" },
      turnCount: turn,
    });

  const threatAt = (turn: number): number => buildRead(scene(turn).view, "p0").threat;

  it("11순 전에도 0이 아니다 — 조용한 멘젠 상대가 '위협 없는 사람'이 아니게 됐다", () => {
    expect(threatAt(6)).toBeGreaterThan(0);
    expect(threatAt(11)).toBeGreaterThan(0);
  });

  it("순목에 대해 연속으로 자란다 — 11순/12순 사이의 절벽이 없다", () => {
    const levels = [4, 8, 11, 14, 17].map(threatAt);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] as number).toBeGreaterThan(levels[i - 1] as number);
    }
    // 11순에서 예전 12순 값과 이어진다 (눈금을 옮긴 것이 아니라 절벽만 없앴다)
    expect(threatAt(11)).toBeCloseTo(0.15, 5);
  });

  it("종반 상한이 리치·후로 손보다 낮다 (다마는 어디까지나 드물다)", () => {
    expect(threatAt(20)).toBeLessThan(0.3);
  });
});

describe("순위 압박 — 사다리 전체를 본다", () => {
  const allLast = (scores: Record<string, number>) =>
    botScene({
      hand: "123m456m789m11p5s7z",
      prevalentWind: 2,
      roundNumber: 4,
      scores,
    });

  it("굳은 2위가 '평시대로 치라'로 읽히던 것이 고쳐졌다", () => {
    // 1위와 +30000, 3위와 −30000 — 어느 쪽도 닿지 않는다.
    // 예전 식: 쫓는 압박 1 − 지키는 압박 1 = 0, 남는 것은 오야 보정 +0.1뿐이었다.
    const s = allLast({ p0: 25000, p1: 55000, p2: 25000 - 30000, p3: 25000 - 30000 });
    const m = readMatch(s.view, "p0", "hanchan");
    expect(m.rank).toBe(2);
    expect(m.riskAppetite).toBeLessThan(-0.2);
  });

  it("코앞의 3위를 쫓는 꼴찌는 세게 민다", () => {
    const s = allLast({ p0: 10000, p1: 55000, p2: 43000, p3: 12000 });
    expect(readMatch(s.view, "p0", "hanchan").riskAppetite).toBeGreaterThan(0.5);
  });

  it("아슬아슬한 선두는 최대한 지킨다", () => {
    const s = allLast({ p0: 30000, p1: 28000, p2: 21000, p3: 21000 });
    expect(readMatch(s.view, "p0", "hanchan").riskAppetite).toBeLessThan(-0.5);
  });

  it("초반에는 사다리를 봐도 압박이 거의 없다 (lateness가 눌러 준다)", () => {
    const early = botScene({
      hand: "123m456m789m11p5s7z",
      scores: { p0: 10000, p1: 40000, p2: 30000, p3: 20000 },
    });
    expect(Math.abs(readMatch(early.view, "p0", "hanchan").riskAppetite)).toBeLessThan(0.3);
  });
});

describe("패스도 공짜가 아니다", () => {
  const scene = () =>
    botScene({
      hand: "3456m3456p3456s7z",
      riichi: ["p1"],
      discards: { p1: "1119m", p2: "999s", p3: "999p" },
      turnCount: 10,
      lastDiscard: { player: "p3", spec: "7m" },
    });

  const passValueOf = (view: ReturnType<typeof botScene>["view"]): number => {
    const options = [{ type: "pass", payload: {} }] as never;
    return bidPass(buildRead(view, "p0"), options, null, profileOf("balanced"))?.value ?? 0;
  };

  it("위협이 있는 판에서는 패스 EV에서도 위험을 뺀다", () => {
    const s = scene();
    const read = buildRead(s.view, "p0");
    expect(read.threat).toBeGreaterThan(0);
    // 위험 항이 붙었으므로, 같은 손을 위협 없는 판에 놓았을 때보다 패스가 싸다
    const calm = botScene({ hand: "3456m3456p3456s7z", turnCount: 10 });
    expect(passValueOf(s.view)).toBeLessThan(passValueOf(calm.view));
  });

  it("위협이 없으면 뺄 것도 없다 (열어도 잃을 것이 없는 판)", () => {
    // 다마텐 경사가 2순부터 자라므로, 위협이 **정확히 0**인 판은 1~2순뿐이다
    const s = botScene({ hand: "3456m3456p3456s7z", turnCount: 1 });
    expect(buildRead(s.view, "p0").threat).toBe(0);
    expect(passValueOf(s.view)).toBeGreaterThan(0);
  });
});

describe("menzenfu — 재 보고 반려한 스위치 (다시 잴 수 있게 남겨 둔다)", () => {
  const base = {
    handDora: 2,
    meldCount: 0,
    plan: null,
    isDealer: false,
    riichiDeclared: false,
  } as const;

  it("기본은 종전대로 30부다 — 후로율을 4.2%p 깎아 채택하지 않았다", () => {
    expect(estimateHandValue({ ...base }).fu).toBe(30);
  });

  it("스위치는 살아 있다 — 켜면 멘젠 손이 비싸진다", () => {
    const split = estimateHandValue({ ...base, menzenFu: true });
    expect(split.fu).toBeGreaterThan(30);
    expect(split.points).toBeGreaterThan(estimateHandValue({ ...base }).points);
  });

  it("스위치 문자열이 실제로 그 자리까지 닿는다", () => {
    const s = botScene({ hand: "123m456m789m11p56s", turnCount: 6 });
    const off = buildRead(s.view, "p0").valueOf({ plan: null });
    const on = buildRead(s.view, "p0", { flags: parseFlags("menzenfu") }).valueOf({ plan: null });
    expect(on.fu).toBeGreaterThan(off.fu);
  });
});
