/**
 * 스지(筋) — 봇이 **량면만 지우고, 지운 만큼만 안심하는가**.
 *
 * 예전 봇에도 스지가 있기는 했다. 다만 위험도에 곱하는 상수 두 개(스지 ×0.4,
 * 노찬스 ×0.35)였고, 그래서 두 가지가 조용히 틀려 있었다.
 *
 *  1. **같은 것을 두 번 지웠다.** 스지가 지우는 것도 량면이고 벽이 지우는 것도
 *     량면인데 두 상수를 곱해 0.14까지 떨어뜨렸다.
 *  2. **남는 것이 안 보였다.** 스지는 량면만 지운다 — 샤보·간짱·변짱·단기는 그대로
 *     남는데, 상수 곱셈에는 그 몫이 어디에도 없었다.
 *
 * 그리고 세 가지가 아예 없었다 — **통과패**(리치 뒤에 지나간 패), **도라 근처**
 * 경계, **성격**(스지를 밀 구실로 쓰는 사람과 현물만 내는 사람).
 *
 * 여기서 잡는 것:
 *   1. 스지 표(1↔4 … 6↔9)가 이론 그대로이고 같은 무늬에서만 서는가
 *   2. 스지가 **절대 안전이 아닌가** — 현물보다 언제나 위험하고, 0이 되지 않는가
 *   3. 국면(순목·리치 여부·도라)과 성격이 그 신뢰도를 흔드는가
 *   4. 여러 리치를 **각각 따로** 세는가
 */

import { describe, expect, it } from "vitest";
import type { PlayerView, TileKind } from "@majak/core";
import { sujiGradeOf, sujiPartners, waitFactor, KABE_CREDIT } from "../src/bot/suji.js";
import { buildRead } from "../src/bot/read.js";
import { profileOf } from "../src/bot/profile.js";
import { bidDiscard } from "../src/bot/discard.js";
import { botScene } from "./botTestView.js";
import type { BotScene, BotViewOptions } from "./botTestView.js";
import { parseFlags } from "../src/bot/flags.js";

const m = (rank: number): TileKind => ({ suit: "man", rank });
const p = (rank: number): TileKind => ({ suit: "pin", rank });

/** 이 손패는 판단에 쓰지 않는다 — 상대만 보는 장면을 세우는 껍데기다 */
const BASE = "123m456m789m11p5s7z";

const lossOf = (view: PlayerView, kind: TileKind, archetype = "balanced" as const) =>
  buildRead(view, "p0", { profile: profileOf(archetype) }).expectedLoss(kind);

describe("스지 표 — 이론 그대로인가", () => {
  it("버린 패가 지우는 짝이 1↔4 · 2↔5 · 3↔6 · 4↔1,7 · 5↔2,8 · 6↔3,9 · 7↔4 · 8↔5 · 9↔6", () => {
    expect(sujiPartners(1)).toEqual([4]);
    expect(sujiPartners(2)).toEqual([5]);
    expect(sujiPartners(3)).toEqual([6]);
    expect(sujiPartners(4)).toEqual([1, 7]);
    expect(sujiPartners(5)).toEqual([2, 8]);
    expect(sujiPartners(6)).toEqual([3, 9]);
    expect(sujiPartners(7)).toEqual([4]);
    expect(sujiPartners(8)).toEqual([5]);
    expect(sujiPartners(9)).toEqual([6]);
  });

  it("가운데 셋(4·5·6)만 '반쪽 스지'가 있다 — 나머지는 한 장으로 량면이 끊긴다", () => {
    expect(sujiGradeOf(5, new Set([2]))).toBe("half");
    expect(sujiGradeOf(5, new Set([2, 8]))).toBe("full");
    expect(sujiGradeOf(1, new Set([4]))).toBe("full");
    expect(sujiGradeOf(9, new Set([6]))).toBe("full");
    expect(sujiGradeOf(5, new Set([1, 9]))).toBe("none");
  });

  it("같은 무늬에서만 선다 — 4만을 버렸다고 1통이 스지가 되지는 않는다", () => {
    const view = botScene({
      hand: BASE,
      riichi: ["p1"],
      discards: { p1: "4m" },
      turnCount: 8,
    }).view;
    // 4만의 스지인 1만은 내려가고, 무늬가 다른 1통은 그대로다
    expect(lossOf(view, m(1))).toBeLessThan(lossOf(view, p(1)));
  });
});

describe("스지는 '안전'이 아니라 '조금 더 안전'이다", () => {
  const scene = (discards: string) =>
    botScene({ hand: BASE, riichi: ["p1"], discards: { p1: discards }, turnCount: 8 }).view;

  it("양스지 < 한스지 < 무스지 순으로 위험하다", () => {
    const none = lossOf(scene("1z"), m(5));
    const half = lossOf(scene("1z2m"), m(5)); // 2만 버림 → 5만 한스지
    const full = lossOf(scene("1z2m8m"), m(5)); // 2·8만 → 5만 양스지
    expect(full).toBeLessThan(half);
    expect(half).toBeLessThan(none);
  });

  it("양쪽 스지가 다 서도 0이 되지 않는다 — 샤보·간짱·단기가 그대로 남는다", () => {
    expect(lossOf(scene("1z2m8m"), m(5))).toBeGreaterThan(0);
  });

  it("현물은 언제나 스지보다 안전하다 (현물만이 0이다)", () => {
    const view = scene("1z2m8m5p");
    expect(lossOf(view, p(5))).toBe(0); // p1이 직접 버린 패 = 현물
    expect(lossOf(view, m(5))).toBeGreaterThan(0); // 양스지지만 0은 아니다
  });

  it("스지가 지우는 것은 량면뿐이다 — 량면 몫만큼만 내려간다", () => {
    // 5는 량면 몫이 6할이라 양스지로 4할이 남고, 1은 량면 몫이 4할 남짓이다
    const ctx = (discarded: number[]) => ({
      discarded: new Set(discarded),
      aliveAt: () => 4,
      remaining: 3,
      sujiCredit: 1,
      kabeCredit: KABE_CREDIT,
    });
    expect(waitFactor(5, ctx([2, 8]))).toBeCloseTo(0.4, 2);
    expect(waitFactor(5, ctx([]))).toBeCloseTo(1, 5);
    expect(waitFactor(1, ctx([4]))).toBeCloseTo(0.55, 2);
  });
});

describe("벽(카베)과 장수 셈 — 스지가 못 지우는 것을 지운다", () => {
  const ctx = (over: {
    discarded?: number[];
    alive?: Record<number, number>;
    remaining?: number;
  }) => ({
    discarded: new Set(over.discarded ?? []),
    aliveAt: (r: number) => over.alive?.[r] ?? 4,
    remaining: over.remaining ?? 3,
    sujiCredit: 1,
    kabeCredit: KABE_CREDIT,
  });

  it("량면 재료가 세상에 안 남으면 그 량면은 존재할 수 없다 (노찬스)", () => {
    // 5의 량면은 (3,4)와 (6,7)뿐이다. 4와 6이 다 나갔으면 둘 다 죽고 간짱(4,6)도 죽는다
    const dead = waitFactor(5, ctx({ alive: { 4: 0, 6: 0 } }));
    expect(dead).toBeLessThan(waitFactor(5, ctx({})) * 0.4);
    // 그래도 샤보·단기 몫은 남는다 — 벽도 절대 안전을 만들지 않는다
    expect(dead).toBeGreaterThan(0.25);
  });

  it("벽은 스지보다 조금 덜 믿는다 — 장수 셈은 증강 생성패 때문에 완벽하지 않다", () => {
    // 5의 위쪽 량면 (6,7)을 스지로 지운 값 vs 벽으로 지운 값
    const bySuji = waitFactor(5, ctx({ discarded: [8] }));
    const byKabe = waitFactor(5, ctx({ alive: { 7: 0 } }));
    expect(bySuji).toBeLessThan(byKabe);
  });

  it("이미 스지로 지워진 량면을 벽이 한 번 더 지우지는 않는다", () => {
    const sujiOnly = waitFactor(5, ctx({ discarded: [2, 8] }));
    const sujiAndKabe = waitFactor(5, ctx({ discarded: [2, 8], alive: { 3: 0, 7: 0 } }));
    // 3·7이 다 나가도 그 량면은 이미 스지로 죽어 있다 — 값이 더 내려갈 이유가 없다
    expect(sujiAndKabe).toBeCloseTo(sujiOnly, 5);
  });

  it("샤보는 상대 손에 2장이 있어야 성립한다 — 남은 장수가 줄면 그 몫이 사라진다", () => {
    const many = waitFactor(5, ctx({ discarded: [2, 8], remaining: 3 }));
    const one = waitFactor(5, ctx({ discarded: [2, 8], remaining: 1 }));
    const none = waitFactor(5, ctx({ discarded: [2, 8], remaining: 0 }));
    expect(one).toBeLessThan(many);
    expect(none).toBeLessThan(one);
    // 0장이라도 완전히 지우지는 않는다 — 증강 생성패 때문에 장수 셈이 틀릴 수 있다
    expect(none).toBeGreaterThan(0);
  });
});

describe("신뢰도 — 언제 센 스지인가", () => {
  const at = (turnCount: number, riichi: boolean) =>
    botScene({
      hand: BASE,
      ...(riichi ? { riichi: ["p1"] } : { oppMelds: { p1: ["555s", "222p"] } }),
      discards: { p1: "2m8m" },
      turnCount,
    }).view;

  it("종반으로 갈수록 스지가 깎아 주는 폭이 줄어든다", () => {
    // 늦게 텐파이한 손은 량면을 못 만들어 굳는 경우가 많다 — 지울 량면 자체가 적다
    const ratio = (turn: number) => lossOf(at(turn, true), m(5)) / lossOf(at(turn, true), p(5));
    expect(ratio(16)).toBeGreaterThan(ratio(5));
  });

  it("리치자의 스지를 무리치 상대의 스지보다 더 믿는다 (손이 고정돼 있다)", () => {
    const rel = (riichi: boolean) =>
      lossOf(at(10, riichi), m(5)) / lossOf(at(10, riichi), p(5));
    expect(rel(true)).toBeLessThan(rel(false));
  });
});

describe("도라 근처는 스지라도 세게 잡는다", () => {
  const scene = (doraIndicator: string) =>
    botScene({
      hand: BASE,
      riichi: ["p1"],
      discards: { p1: "2m8m" }, // 5만이 양스지
      doraIndicator,
      turnCount: 8,
    }).view;

  it("스지라도 그 패가 도라면 위험이 되올라간다", () => {
    // 4만 표시 → 5만이 도라
    expect(lossOf(scene("4m"), m(5))).toBeGreaterThan(lossOf(scene("4p"), m(5)));
  });

  it("도라 옆자리도 조금 더 세게 잡는다", () => {
    // 5만 표시 → 6만이 도라 → 5만은 도라 옆
    expect(lossOf(scene("5m"), m(5))).toBeGreaterThan(lossOf(scene("4p"), m(5)));
    // 도라 자신보다는 덜하다
    expect(lossOf(scene("5m"), m(5))).toBeLessThan(lossOf(scene("4m"), m(5)));
  });
});

describe("여러 리치는 각각 따로 센다", () => {
  const both = (p1: string, p2: string) =>
    botScene({
      hand: BASE,
      riichi: ["p1", "p2"],
      discards: { p1, p2 },
      turnCount: 8,
    }).view;

  it("한 사람에게만 선 스지는 다른 사람에게 아무 값도 없다", () => {
    // 둘 다 4만을 버린 판 vs p1만 버린 판 — 7만의 위험이 갈려야 한다
    const shared = lossOf(both("4m", "4m"), m(7));
    const onlyOne = lossOf(both("4m", "1z"), m(7));
    expect(onlyOne).toBeGreaterThan(shared);
  });

  it("한 사람의 현물이라도 다른 리치에게는 그냥 무스지다", () => {
    const view = both("5p", "1z");
    // 5통은 p1에게 현물이지만 p2에게는 아무것도 아니다 — 안전도는 위험한 쪽으로 잡힌다
    expect(lossOf(view, p(5))).toBeGreaterThan(0);
  });
});

describe("통과패 — 리치 뒤에 지나간 패는 현물과 같다", () => {
  /** p1이 자기 바닥 1번(0-based)에서 리치. p2의 바닥 2번 이후는 리치 뒤에 지나간 것 */
  const view = botScene({
    hand: BASE,
    riichi: ["p1"],
    riichiTileIndex: { p1: 1 },
    discards: { p1: "1z2z", p2: "9m5p8s" },
    turnCount: 10,
  }).view;

  it("리치 이후에 남이 버렸는데 론하지 않은 패는 100% 안전패다", () => {
    expect(lossOf(view, { suit: "sou", rank: 8 })).toBe(0);
  });

  it("리치 이전에 지나간 패는 세지 않는다 — 그때는 텐파이가 아니었을 수 있다", () => {
    expect(lossOf(view, p(5))).toBeGreaterThan(0);
  });

  it("통과패는 스지를 세우지 않는다 — 남이 버린 패는 그 사람의 후리텐이 아니다", () => {
    // 8삭이 통과했다고 5삭이 스지가 되지는 않는다 (5삭도 8삭도 p1이 버린 적이 없다)
    const naked = botScene({
      hand: BASE,
      riichi: ["p1"],
      riichiTileIndex: { p1: 1 },
      discards: { p1: "1z2z" },
      turnCount: 10,
    }).view;
    expect(lossOf(view, { suit: "sou", rank: 5 })).toBeCloseTo(
      lossOf(naked, { suit: "sou", rank: 5 }),
      5,
    );
  });

  it("리치 선언 자리를 모르면 아무것도 세지 않는다 (틀리는 쪽이 위험하다)", () => {
    const hidden = botScene({
      hand: BASE,
      riichi: ["p1"],
      discards: { p1: "1z2z", p2: "9m5p8s" },
      turnCount: 10,
    }).view;
    expect(lossOf(hidden, { suit: "sou", rank: 8 })).toBeGreaterThan(0);
  });
});

describe("성격 — 스지를 얼마나 믿는가", () => {
  const view = botScene({
    hand: BASE,
    riichi: ["p1"],
    discards: { p1: "2m8m" }, // 5만이 양스지
    turnCount: 8,
  }).view;

  it("공격형은 스지를 밀 구실로 쓰고, 수비형은 스지를 믿지 않는다", () => {
    const risk = (a: Parameters<typeof profileOf>[0]) => lossOf(view, m(5), a);
    expect(risk("attacker")).toBeLessThan(risk("balanced"));
    expect(risk("balanced")).toBeLessThan(risk("defender"));
    // 타점형은 손이 비싸 방총이 아프다 — 균형형보다 조심스럽다
    expect(risk("valueHunter")).toBeGreaterThan(risk("balanced"));
    // 속공형은 깊게 안 읽고 스지면 낸다
    expect(risk("speedster")).toBeLessThan(risk("balanced"));
  });

  it("성격은 스지의 신뢰도만 흔든다 — 현물은 누구에게나 0이다", () => {
    const genbutsu = m(2);
    for (const a of ["attacker", "defender", "valueHunter", "speedster"] as const) {
      expect(lossOf(view, genbutsu, a)).toBe(0);
    }
  });

  it("아무리 저돌적이어도 스지가 무스지보다 위험해지지는 않는다", () => {
    expect(lossOf(view, m(5), "attacker")).toBeLessThan(lossOf(view, p(5), "attacker"));
    expect(lossOf(view, m(5), "defender")).toBeLessThan(lossOf(view, p(5), "defender"));
  });
});

describe("실제 버림에 반영된다", () => {
  /**
   * 종반, p1 리치. 내 손은 멘쯔 넷이 다 서 있고 5만·5통 중 하나로 단기를 잡는 자리다.
   * 형태로는 완전히 대등해서 **안전만이 둘을 가른다** — p1이 2만·8만을 버렸으니
   * 5만이 양스지고 5통은 생 무스지다. 사람이라면 5만을 놓고 5통을 기다린다.
   */
  const scene = (): BotScene =>
    botScene({
      hand: "123m789m123s777p5m5p",
      riichi: ["p1"],
      discards: { p1: "2m8m1z" },
      turnCount: 14,
      wallLeft: 10,
    });

  const picked = (s: BotScene, archetype: Parameters<typeof profileOf>[0]) => {
    const read = buildRead(s.view, "p0", { profile: profileOf(archetype) });
    const bid = bidDiscard(read, s.discardOptions(), null, profileOf(archetype));
    const id = (bid?.option.payload as { tileId?: number } | undefined)?.tileId;
    return id === undefined ? "none" : JSON.stringify(s.view.tiles[id]?.kind);
  };

  it("형태가 대등하면 무스지가 아니라 스지를 놓는다", () => {
    const s = scene();
    const suji = JSON.stringify({ suit: "man", rank: 5 });
    expect(picked(s, "defender")).toBe(suji);
    expect(picked(s, "balanced")).toBe(suji);
    expect(picked(s, "attacker")).toBe(suji);
  });
});

describe("스지 읽기는 끌 수 있다 (측정용 스위치)", () => {
  const opts: BotViewOptions = {
    hand: BASE,
    riichi: ["p1"],
    discards: { p1: "2m8m" },
    turnCount: 8,
  };

  it("noSuji를 켜면 량면 감액이 사라진다 — 벽·장수 셈만 남는다", () => {
    const view = botScene(opts).view;
    const on = buildRead(view, "p0").expectedLoss(m(5));
    const off = buildRead(view, "p0", { flags: parseFlags("noSuji") }).expectedLoss(m(5));
    expect(off).toBeGreaterThan(on);
    // 스지를 끈 5만은 아무것도 못 지운 5통과 같은 값이 된다
    expect(off).toBeCloseTo(buildRead(view, "p0", { flags: parseFlags("noSuji") }).expectedLoss(p(5)), 5);
  });
});
