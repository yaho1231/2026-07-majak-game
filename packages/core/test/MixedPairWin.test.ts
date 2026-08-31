/**
 * 혼색 머리(mixedPairs)의 «대표가 아닌 쪽»으로도 화료가 된다 — A-5 회귀.
 *
 * 결함: `Decomposition.pair`에는 혼색 머리의 **대표 한쪽만**(무늬 사전순 앞) 실린다.
 * `buildVariants`가 화료패를 그 한 kind와 1:1로만 견주는 바람에, 다른 쪽 무늬로
 * 화료하면 단기 변형이 하나도 안 만들어져 **변형 0개 → evaluateWin null** 이었다.
 * 그런데 `isWinningShape`·`winningKinds`는 그 패를 오름패로 답한다 — 대기에는 서고
 * 화료는 안 되며, 그 패를 버려 뒀으면 후리텐까지 걸리는 상태였다.
 *
 * 기존 `packages/content/test/mixed_nine_gates.test.ts`가 못 잡은 이유도 여기서
 * 못박는다: 그 뼈대(11m…)는 **순수 머리**가 따로 있고 화료패 5p가 마침 대표 쪽이다.
 * 그래서 아래 «대표 아닌 쪽» 케이스를 명시적으로 센다.
 */
import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import { decompose, isWinningShape } from "../src/mahjong/scoring/decompose.js";
import type { DecomposeOptions } from "../src/mahjong/scoring/decompose.js";
import { winningKinds } from "../src/mahjong/scoring/waits.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const registry = new YakuRegistry();
registerStandardYaku(registry);

/** 「뒤섞인 아홉 개의 연꽃」이 켜는 세 옵션 */
const MIXED: DecomposeOptions = {
  mixedRuns: true,
  mixedTriplets: true,
  mixedPairs: true,
};

/** 화료형으로 인정되는가 (변형이 하나라도 만들어지는가) */
function canWin(skeleton: string, win: string, opts: DecomposeOptions = MIXED): boolean {
  const winTile = h(win)[0] as TileKind;
  return (
    evaluateWin(
      {
        hand: [...h(skeleton), winTile],
        melds: [],
        winningTile: winTile,
        winType: "tsumo",
        seatWind: 1,
        prevalentWind: 1,
        riichi: null,
        options: opts,
      },
      registry,
    ) !== null
  );
}

/** 대기 27종 중 실제로 화료가 되는 종의 수 */
function winnableWaits(skeleton: string, opts: DecomposeOptions = MIXED): {
  waits: string[];
  dead: string[];
} {
  const hand = h(skeleton);
  const waits = winningKinds(hand, 0, undefined, opts);
  const dead: string[] = [];
  for (const w of waits) {
    const spec = `${w.rank}${w.suit === "man" ? "m" : w.suit === "pin" ? "p" : "s"}`;
    if (w.suit !== "man" && w.suit !== "pin" && w.suit !== "sou") continue;
    if (!canWin(skeleton, spec, opts)) dead.push(kindKey(w));
  }
  return { waits: waits.map(kindKey), dead };
}

/** 원 결함 뼈대 — 대기 27종 중 2p·5p·8p·2s·5s·8s 6종이 화료 불가였다 */
const SK1 = "1m1p1s2m3p4s5m6p7s8m9p9s9m";
/** 다른 뼈대 — 2s·5s·8s 3종이 화료 불가였다 */
const SK2 = "1m1m1p2p3p4m5p6m7p8p9p9s9s";

describe("혼색 머리 — 대표 아닌 쪽 화료 (A-5)", () => {
  it("원 결함 뼈대: 대기 27종이 전부 화료된다 (예전엔 6종이 죽었다)", () => {
    const { waits, dead } = winnableWaits(SK1);
    expect(waits).toHaveLength(27);
    expect(dead).toEqual([]);
  });

  it("원 결함 6종을 하나씩 못박는다", () => {
    for (const t of ["2p", "5p", "8p", "2s", "5s", "8s"]) {
      expect(isWinningShape([...h(SK1), ...h(t)], 0, MIXED), `${t} 화료형`).toBe(true);
      expect(canWin(SK1, t), `${t} 채점`).toBe(true);
    }
  });

  it("다른 뼈대의 3종(2s·5s·8s)도 화료된다", () => {
    const { waits, dead } = winnableWaits(SK2);
    expect(waits).toHaveLength(27);
    expect(dead).toEqual([]);
    for (const t of ["2s", "5s", "8s"]) expect(canWin(SK2, t), `${t}`).toBe(true);
  });

  it("혼색 머리 분해는 두 kind를 함께 싣는다 (pairKinds)", () => {
    const ds = decompose([...h(SK1), ...h("2p")], 0, MIXED);
    expect(ds.length).toBeGreaterThan(0);
    const mixed = ds.filter((d) => d.pairKinds !== undefined);
    expect(mixed.length).toBeGreaterThan(0);
    for (const d of mixed) {
      const keys = (d.pairKinds as TileKind[]).map(kindKey);
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
      // 대표(`pair`)는 그중 한쪽이어야 한다
      expect(keys).toContain(kindKey(d.pair as TileKind));
    }
    // 이 손의 머리는 2만+2통 — 화료패 2통은 «대표가 아닌 쪽»이다
    const withWin = mixed.find((d) =>
      (d.pairKinds as TileKind[]).some((k) => kindKey(k) === "pin2"),
    );
    expect(withWin).toBeDefined();
    expect(kindKey(withWin?.pair as TileKind)).not.toBe("pin2");
  });

  it("기존 회귀 테스트의 뼈대는 왜 못 잡았나 — 화료패가 대표 쪽이라 통과했다", () => {
    // 기존 테스트 뼈대: 순수 머리(11m)가 따로 있고 5p는 대표 쪽
    const OLD = "11m1p2s3m4p5s6m7p8s9m9p9s";
    expect(canWin(OLD, "5p")).toBe(true);
    const { dead } = winnableWaits(OLD);
    expect(dead).toEqual([]); // 이 뼈대만으로는 결함이 드러나지 않는다
  });

  it("옵션이 꺼져 있으면 혼색 머리 화료는 서지 않는다 (회귀 가드)", () => {
    // 혼색 머리 없이는 어떤 몸통도 못 세운다 → 대기 자체가 없다
    expect(winningKinds(h("7m7p7p1p1s5m5s"), 2, undefined, { mixedTriplets: true })).toEqual(
      [],
    );
    expect(canWin(SK1, "2p", {})).toBe(false);
  });
});

describe("혼색 머리 × 다른 형 완화 옵션", () => {
  const combos: [string, DecomposeOptions][] = [
    ["양극(polarEnds)", { ...MIXED, polarEnds: true }],
    ["끝없는 윤회(wrapRuns)", { ...MIXED, wrapRuns: true }],
    ["바람의 계보(honorRuns)", { ...MIXED, honorRuns: true }],
    ["동수의 결속(mixedTriplets)", { ...MIXED, mixedTriplets: true }],
    [
      "넷 다",
      { ...MIXED, polarEnds: true, wrapRuns: true, honorRuns: true, mixedTriplets: true },
    ],
  ];
  for (const [name, opts] of combos) {
    it(`${name} 와 겹쳐도 6종이 전부 화료된다`, () => {
      for (const t of ["2p", "5p", "8p", "2s", "5s", "8s"]) {
        expect(canWin(SK1, t, opts), `${name} / ${t}`).toBe(true);
      }
    });
  }
});

describe("다른 형에 회귀 없음", () => {
  it("순수 머리 단기는 그대로 화료된다", () => {
    expect(canWin("123m456m789m123p9s", "9s", {})).toBe(true);
    expect(canWin("123m456m789m123p9s", "9s")).toBe(true);
  });
  it("치또이는 그대로다", () => {
    expect(canWin("1122m3344p5566s9s", "9s", {})).toBe(true);
  });
  it("국사무쌍은 그대로다", () => {
    expect(canWin("19m19p19s1234567z", "1m", {})).toBe(true);
    expect(canWin("19m19p19s1234567z", "1m")).toBe(true);
  });
  it("혼색 머리가 아닌 손에서 화료패가 머리와 다른 무늬면 여전히 화료가 아니다", () => {
    // 1만1통은 mixedPairs 없이는 머리가 아니다
    expect(isWinningShape(h("123m456m789m123p1m1p"), 0, {})).toBe(false);
  });
});
