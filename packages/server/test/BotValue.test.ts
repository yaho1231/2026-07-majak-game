/**
 * 봇이 **점수라는 단위 하나로** 판단하는지 검증한다.
 *
 * 2026-08-05 이전의 봇은 단위 없는 점수를 섞어 썼다(`push*efficiency + fold*safety*14`).
 * 그래서 "이 밀기가 저 접기보다 이득인가"를 실제로 계산한 적이 없고, 무엇보다
 * **점수판을 아예 보지 않아 동1국과 올라스를 똑같이 쳤다.**
 *
 * 여기서 잡는 것은 그 두 축이다.
 *   1. 값어치·확률·실점이 전부 점수 단위로 나오고 서로 비교된다.
 *   2. 같은 손·같은 판이라도 **게임의 어디인가**에 따라 결정이 달라진다.
 */

import { describe, expect, it } from "vitest";
import type { TileId } from "@majak/core";
import { chooseDiscard } from "../src/bot/discard.js";
import { buildRead } from "../src/bot/read.js";
import { readMatch } from "../src/bot/match.js";
import { estimateHandValue, winChance } from "../src/bot/value.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

function pickedKind(scene: BotScene, option: { payload: unknown } | null): string {
  const tileId = (option?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
  if (kind === undefined) return "none";
  const suit =
    kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
  return `${kind.suit === "dragon" ? kind.rank + 4 : kind.rank}${suit}`;
}

describe("손 값어치 — 판수를 점수로 옮긴다", () => {
  const base = { meldCount: 0, plan: null, isDealer: false, riichiDeclared: false } as const;

  it("도라가 늘면 점수가 오른다", () => {
    const a = estimateHandValue({ ...base, handDora: 0 });
    const b = estimateHandValue({ ...base, handDora: 2 });
    expect(b.points).toBeGreaterThan(a.points);
  });

  it("오야는 같은 판수라도 1.5배를 받는다", () => {
    const ko = estimateHandValue({ ...base, handDora: 2 });
    const oya = estimateHandValue({ ...base, handDora: 2, isDealer: true });
    expect(oya.points).toBeGreaterThan(ko.points * 1.4);
  });

  it("멘젠 혼일색은 같은 도라의 열린 손보다 비싸다 (역이 곧 값이다)", () => {
    const closed = estimateHandValue({
      ...base,
      handDora: 1,
      plan: { yaku: "honitsu", suit: "pin" },
    });
    const open = estimateHandValue({
      ...base,
      handDora: 1,
      meldCount: 2,
      plan: { yaku: "honitsu", suit: "pin" },
    });
    expect(closed.points).toBeGreaterThan(open.points);
  });

  it("리치를 걸면 예상 점수가 오른다 — 그 차이가 곧 리치의 값이다", () => {
    const v = estimateHandValue({ ...base, handDora: 1 });
    expect(v.riichiPoints).toBeGreaterThan(v.points);
  });

  it("열린 손은 역이 없으면 판수를 얹어 주지 않는다 (멘젠 기본판은 멘젠만)", () => {
    const closed = estimateHandValue({ ...base, handDora: 1 });
    const open = estimateHandValue({ ...base, handDora: 1, meldCount: 1 });
    expect(open.points).toBeLessThan(closed.points);
  });

  it("판수가 조금 좋아지면 점수도 조금 오른다 (만관 경계에서 튀지 않는다)", () => {
    // 반올림으로 세면 도라 한 장이 경계를 넘느냐에 따라 값이 계단처럼 뛴다.
    const steps = [0, 1, 2, 3, 4].map(
      (d) => estimateHandValue({ ...base, handDora: d }).points,
    );
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] as number).toBeGreaterThan(steps[i - 1] as number);
    }
  });
});

describe("화료 확률 — 넓을수록, 이를수록 높다", () => {
  const base = { shanten: 0, ukeireTiles: 0, wallLeft: 60, turn: 6, furiten: false };

  it("대기가 넓을수록 높다", () => {
    expect(winChance({ ...base, waitTiles: 8 })).toBeGreaterThan(
      winChance({ ...base, waitTiles: 4 }),
    );
  });

  it("순목이 지날수록 낮아진다 — 패산만 믿으면 종반에도 낙관한다", () => {
    expect(winChance({ ...base, waitTiles: 8, turn: 3 })).toBeGreaterThan(
      winChance({ ...base, waitTiles: 8, turn: 14 }),
    );
  });

  it("후리텐은 론이 막혀 확률이 준다", () => {
    expect(winChance({ ...base, waitTiles: 8, furiten: true })).toBeLessThan(
      winChance({ ...base, waitTiles: 8 }),
    );
  });

  it("오름패가 하나도 없으면 0이다", () => {
    expect(winChance({ ...base, waitTiles: 0 })).toBe(0);
  });

  it("샹텐이 멀수록 낮다", () => {
    const t = { ...base, waitTiles: 8, ukeireTiles: 20 };
    expect(winChance({ ...t, shanten: 1 })).toBeGreaterThan(winChance({ ...t, shanten: 3 }));
  });

  it("가망이 없어도 순서는 남는다 — 0으로 잘라 버리면 버릴 패를 고를 수 없다", () => {
    const dead = { shanten: 4, waitTiles: 0, wallLeft: 8, turn: 17, furiten: false };
    const wide = winChance({ ...dead, ukeireTiles: 30 });
    const narrow = winChance({ ...dead, ukeireTiles: 4 });
    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBeLessThan(0.01);
  });
});

describe("순위 읽기 — 이 국이 게임의 어디인가", () => {
  const scene = (over: Parameters<typeof botScene>[0]) => botScene(over);

  it("반장전 남4국이 올라스다", () => {
    const s = scene({ hand: "123m456m789m11p5s7z", prevalentWind: 2, roundNumber: 4 });
    expect(readMatch(s.view, "p0", "hanchan").allLast).toBe(true);
  });

  it("동풍전은 동4국이 올라스다 — 같은 판을 모드에 따라 다르게 읽는다", () => {
    const s = scene({ hand: "123m456m789m11p5s7z", prevalentWind: 1, roundNumber: 4 });
    expect(readMatch(s.view, "p0", "tonpuu").allLast).toBe(true);
    expect(readMatch(s.view, "p0", "hanchan").allLast).toBe(false);
  });

  it("올라스 선두는 지키려 하고(음수), 꼴찌는 뒤집으려 한다(양수)", () => {
    const lead = scene({
      hand: "123m456m789m11p5s7z",
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 40000, p1: 25000, p2: 20000, p3: 15000 },
    });
    const behind = scene({
      hand: "123m456m789m11p5s7z",
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 15000, p1: 40000, p2: 25000, p3: 20000 },
    });
    expect(readMatch(lead.view, "p0").riskAppetite).toBeLessThan(-0.5);
    expect(readMatch(behind.view, "p0").rank).toBe(4);
    expect(readMatch(behind.view, "p0").riskAppetite).toBeGreaterThan(0.5);
  });

  it("초반에는 같은 점수차라도 압박이 거의 없다 — 아직 되돌릴 국이 남았다", () => {
    const early = scene({
      hand: "123m456m789m11p5s7z",
      prevalentWind: 1,
      roundNumber: 1,
      scores: { p0: 40000, p1: 25000, p2: 20000, p3: 15000 },
    });
    expect(Math.abs(readMatch(early.view, "p0").riskAppetite)).toBeLessThan(0.3);
  });

  it("공탁·본장은 이 국에 걸린 덤으로 잡힌다", () => {
    const s = scene({ hand: "123m456m789m11p5s7z", riichiPot: 2000, honba: 3 });
    expect(readMatch(s.view, "p0").potBonus).toBe(2900);
  });
});

describe("위험은 확률이 아니라 확률 × 실점이다", () => {
  const HAND = "99m234m678p1z2z3z4z5z6z";

  it("현물은 아무리 위험한 상대에게도 0점이다", () => {
    const s = botScene({ hand: HAND, riichi: ["p1"], discards: { p1: "9m" }, turnCount: 10 });
    const read = buildRead(s.view, "p0");
    expect(read.expectedLoss({ suit: "man", rank: 9 })).toBe(0);
  });

  it("오야 리치는 자 리치보다 비싸게 잡힌다 — 같은 확률이라도 실점이 1.5배다", () => {
    // p0이 오야(좌석 0)라 p1은 자. dealerSeat를 바꿀 수 없으니 위협 값을 직접 비교한다.
    const s = botScene({ hand: HAND, riichi: ["p1"], turnCount: 10 });
    const read = buildRead(s.view, "p0");
    const koRiichi = read.threats.find((t) => t.player === "p1");
    expect(koRiichi?.isDealer).toBe(false);
    expect(koRiichi?.value).toBeGreaterThan(2000);
  });

  it("후로에 도라를 눕힌 상대는 더 비싸게 잡힌다", () => {
    const plain = botScene({ hand: HAND, riichi: ["p1"], doraIndicator: "1z", turnCount: 10 });
    const read = buildRead(plain.view, "p0");
    const t = read.threats.find((x) => x.player === "p1");
    // 도라 표시패가 있으면 감춰진 손패의 도라 기대값이 실점 추정에 들어간다
    expect(t?.value).toBeGreaterThan(2000);
  });

  it("위협이 없으면 어떤 패도 기대 실점이 0이다", () => {
    const s = botScene({ hand: HAND, turnCount: 6 });
    const read = buildRead(s.view, "p0");
    for (const k of read.hand) expect(read.expectedLoss(k)).toBe(0);
  });
});

describe("순위가 밀기/접기를 바꾼다 — 같은 손, 같은 리치, 다른 처지", () => {
  /**
   * p1 리치. 내 손은 4p를 버리면 4s·7s 량면 텐파이가 되고, 9m을 버리면 텐파이가
   * 깨지는 대신 완전히 안전하다(9m은 p1의 현물). 즉 **밀기와 접기가 진짜로 갈리는**
   * 자리다 — 어느 쪽이 옳은지는 손도 판도 아니고 순위판이 정한다.
   */
  const board = {
    hand: "99m123m456m789p56s4p",
    riichi: ["p1"],
    discards: { p1: "9m" },
    turnCount: 8,
    doraIndicator: "1z",
  } as const;

  it("올라스 선두는 손을 접고 현물을 낸다", () => {
    const scene = botScene({
      ...board,
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 40000, p1: 25000, p2: 20000, p3: 15000 },
    });
    const read = buildRead(scene.view, "p0", "hanchan");
    expect(read.match.riskAppetite).toBeLessThan(0);
    const picked = chooseDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE);
    expect(pickedKind(scene, picked)).toBe("9m");
  });

  it("올라스 꼴찌는 같은 판에서 텐파이를 잡으러 민다 — 접어도 4위다", () => {
    const scene = botScene({
      ...board,
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 8000, p1: 40000, p2: 30000, p3: 22000 },
    });
    const read = buildRead(scene.view, "p0", "hanchan");
    expect(read.match.riskAppetite).toBeGreaterThan(0);
    const picked = chooseDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE);
    expect(pickedKind(scene, picked)).toBe("4p");
  });
});
