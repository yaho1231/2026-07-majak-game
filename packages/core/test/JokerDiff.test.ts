/**
 * 조커(wildKinds) 분해의 **차등 검증** — 네이티브 재귀 vs 무식한 치환 기준 구현.
 *
 * 2026-08-07에 조커를 "실제 패로 바꾼 손을 전부 만들어 다시 분해"하는 방식에서
 * **분해 재귀가 조커를 직접 아는** 방식으로 갈아엎었다(백 4장이면 34^4개의 손이 생겨
 * 대기 계산 한 번이 5~10초였다). 빨라졌더라도 **답이 같아야** 하므로, 느리지만
 * 명백히 옳은 치환 구현을 기준으로 두고 무작위·양성 표본을 함께 대조한다.
 *
 * 양성 표본 수(`positives`)를 함께 못 박는다 — 표본이 통째로 "화료형 아님"이면
 * 두 구현이 나란히 false만 돌려주고도 통과해 검증이 헛돈다.
 */
import { describe, expect, it } from "vitest";
import { isWinningShape, standardKinds, kindKey } from "../src/index.js";
import type { TileKind } from "../src/index.js";

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const U = standardKinds();

/** 기준 구현: 조커를 34종으로 전부 치환해 본다 */
function refWinning(hand: TileKind[], meldCount: number, opts: object): boolean {
  const base = hand.filter((k) => kindKey(k) !== kindKey(HAKU));
  const w = hand.length - base.length;
  if (w === 0) return isWinningShape(hand, meldCount, opts);
  const walk = (start: number, acc: TileKind[]): boolean => {
    if (acc.length === w) return isWinningShape([...base, ...acc], meldCount, opts);
    for (let i = start; i < U.length; i++) {
      if (walk(i, [...acc, U[i]!])) return true;
    }
    return false;
  };
  return walk(0, []);
}

function rngHand(seed: number, n: number, jokers: number): TileKind[] {
  let s = seed;
  const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool: TileKind[] = [];
  const count = new Map<string, number>();
  while (pool.length < n - jokers) {
    const k = U[Math.floor(rnd() * U.length)]!;
    const c = count.get(kindKey(k)) ?? 0;
    if (c >= 4 || kindKey(k) === kindKey(HAKU)) continue;
    count.set(kindKey(k), c + 1);
    pool.push(k);
  }
  for (let i = 0; i < jokers; i++) pool.push(HAKU);
  return pool;
}

/** 화료형 손을 만들고 그중 j장을 백으로 바꾼다 (양성 표본을 확보한다) */
function winningish(seed: number, jokers: number): TileKind[] {
  let s = seed;
  const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const suits = ["man", "pin", "sou"];
  const out: TileKind[] = [];
  for (let i = 0; i < 4; i++) {
    const suit = suits[Math.floor(rnd() * 3)]!;
    if (rnd() < 0.5) {
      const r = 1 + Math.floor(rnd() * 7);
      out.push({ suit, rank: r }, { suit, rank: r + 1 }, { suit, rank: r + 2 });
    } else {
      const r = 1 + Math.floor(rnd() * 9);
      out.push({ suit, rank: r }, { suit, rank: r }, { suit, rank: r });
    }
  }
  const pr = 1 + Math.floor(rnd() * 9);
  const ps = suits[Math.floor(rnd() * 3)]!;
  out.push({ suit: ps, rank: pr }, { suit: ps, rank: pr });
  // 무작위 j장을 백으로 갈아 끼운다
  for (let i = 0; i < jokers; i++) out[Math.floor(rnd() * out.length)] = HAKU;
  return out;
}

describe("조커 분해 — 기준 구현과 일치", () => {
  it("양성 표본 — 화료형에서 j장을 백으로 바꿔도 여전히 화료형이고 기준과 일치한다", () => {
    let positives = 0;
    const bad: string[] = [];
    for (const jokers of [1, 2, 3]) {
      for (let i = 0; i < 60; i++) {
        const hand = winningish(i * 6151 + jokers * 97, jokers);
        const mine = isWinningShape(hand, 0, { wildKinds: [HAKU] });
        const ref = refWinning(hand, 0, {});
        if (mine) positives++;
        if (mine !== ref) bad.push(`${hand.map(kindKey).join(",")}: ${mine} vs ${ref}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // 백으로 갈아 끼워도 화료형은 유지돼야 한다 — 표본이 통째로 음성이면 검증이 헛돈 것이다
    expect(positives).toBe(180);
  });

  it("치또이·국사도 기준과 일치한다", () => {
    const bad: string[] = [];
    const chiitoi: TileKind[] = [
      { suit: "man", rank: 1 }, { suit: "man", rank: 1 },
      { suit: "man", rank: 3 }, { suit: "man", rank: 3 },
      { suit: "pin", rank: 5 }, { suit: "pin", rank: 5 },
      { suit: "sou", rank: 7 }, { suit: "sou", rank: 7 },
      { suit: "wind", rank: 1 }, { suit: "wind", rank: 1 },
      { suit: "wind", rank: 3 }, { suit: "wind", rank: 3 },
      { suit: "dragon", rank: 3 }, { suit: "dragon", rank: 3 },
    ];
    const kokushi: TileKind[] = [
      { suit: "man", rank: 1 }, { suit: "man", rank: 9 },
      { suit: "pin", rank: 1 }, { suit: "pin", rank: 9 },
      { suit: "sou", rank: 1 }, { suit: "sou", rank: 9 },
      { suit: "wind", rank: 1 }, { suit: "wind", rank: 2 },
      { suit: "wind", rank: 3 }, { suit: "wind", rank: 4 },
      { suit: "dragon", rank: 2 }, { suit: "dragon", rank: 3 },
      { suit: "man", rank: 1 }, { suit: "pin", rank: 1 },
    ];
    let positives = 0;
    for (const base of [chiitoi, kokushi]) {
      for (let i = 0; i < base.length; i++) {
        for (let j = i; j < base.length; j++) {
          const hand = base.map((k, idx) => (idx === i || idx === j ? HAKU : k));
          const mine = isWinningShape(hand, 0, { wildKinds: [HAKU] });
          const ref = refWinning(hand, 0, {});
          if (mine) positives++;
          if (mine !== ref) bad.push(`${hand.map(kindKey).join(",")}: ${mine} vs ${ref}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(positives).toBeGreaterThan(100);
  });

  for (const [jokers, cases] of [[1, 150], [2, 80], [3, 20]] as const) {
    it(`백 ${jokers}장 손 ${cases}개 (14장 화료형)`, () => {
      const bad: string[] = [];
      for (let i = 0; i < cases; i++) {
        const hand = rngHand(i * 7919 + 13, 14, jokers);
        const mine = isWinningShape(hand, 0, { wildKinds: [HAKU] });
        const ref = refWinning(hand, 0, {});
        if (mine !== ref) bad.push(`${hand.map(kindKey).join(",")}: ${mine} vs ${ref}`);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
  }
  it("이색 옵션까지 켠 채로도 일치 (백 2장)", () => {
    const bad: string[] = [];
    for (const opts of [{ polarEnds: true }, { honorRuns: true }, { wrapRuns: true }, { mixedTriplets: true }]) {
      for (let i = 0; i < 40; i++) {
        const hand = rngHand(i * 104729 + 5, 14, 2);
        const mine = isWinningShape(hand, 0, { ...opts, wildKinds: [HAKU] });
        const ref = refWinning(hand, 0, opts);
        if (mine !== ref) bad.push(`${JSON.stringify(opts)} ${hand.map(kindKey).join(",")}: ${mine} vs ${ref}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it("후로가 있는 손(11장·8장)도 일치", () => {
    const bad: string[] = [];
    for (const [len, melds] of [[11, 1], [8, 2]] as const) {
      for (let i = 0; i < 70; i++) {
        const hand = rngHand(i * 31337 + 77, len, 2);
        const mine = isWinningShape(hand, melds, { wildKinds: [HAKU] });
        const ref = refWinning(hand, melds, {});
        if (mine !== ref) bad.push(`${melds}후로 ${hand.map(kindKey).join(",")}: ${mine} vs ${ref}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
