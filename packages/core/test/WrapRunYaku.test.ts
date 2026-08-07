/**
 * 순환 슌쯔(broken_wall)와 무늬·순서를 요구하는 역 (docs/25 벽패 #1).
 *
 * 역 판정은 슌쯔의 시작 랭크를 `Math.min(...ranks)`로 구한다. 순환 슌쯔 8-9-1과
 * 9-1-2는 랭크 최솟값이 **1**이라 "1부터 시작하는 슌쯔"로 기록됐고, 그래서
 * 삼색동순·일기통관·이페코가 통째로 헛성립했다.
 *
 * 자매 증강인 무너진 국경(mixedRuns)에는 `isPureRun` 가드가 촘촘히 달려 있는데
 * wrapRuns에는 대응하는 가드가 하나도 없었다.
 *
 * 이 파일은 **표준 역이 그대로인지**를 먼저 고정하고(회귀 방지), 그다음 순환
 * 슌쯔가 그 역들을 훔치지 않는지를 본다. 역 판정 코어를 건드리는 변경이라
 * 증강 없는 게임이 멀쩡한 것이 가장 중요하다.
 */

import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import type { WinContext } from "../src/mahjong/scoring/WinContext.js";
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
const t = (spec: string): TileKind => h(spec)[0] as TileKind;

const registry = new YakuRegistry();
registerStandardYaku(registry);

function evalHand(spec: string, win: string, wrap: boolean): string[] {
  const ctx: WinContext = {
    hand: h(spec),
    winningTile: t(win),
    melds: [],
    winType: "ron",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    ...(wrap ? { options: { wrapRuns: true } } : {}),
  };
  return (evaluateWin(ctx, registry)?.yaku ?? []).map((y) => y.id);
}

describe("표준 역은 그대로다 (회귀 방지 — 증강 없는 게임)", () => {
  it("삼색동순", () => {
    expect(evalHand("234m234p234s678m99s", "2m", false)).toContain("sanshoku");
  });

  it("일기통관", () => {
    expect(evalHand("123m456m789m234p55p", "5p", false)).toContain("ittsuu");
  });

  it("이페코", () => {
    expect(evalHand("112233m456p789s99p", "3m", false)).toContain("iipeiko");
  });

  it("순환 슌쯔를 켜도 진짜 삼색동순은 그대로 성립한다", () => {
    expect(evalHand("234m234p234s678m99s", "2m", true)).toContain("sanshoku");
  });

  it("순환 슌쯔를 켜도 진짜 일기통관은 그대로 성립한다", () => {
    expect(evalHand("123m456m789m234p55p", "5p", true)).toContain("ittsuu");
  });

  it("순환 슌쯔를 켜도 진짜 이페코는 그대로 성립한다", () => {
    expect(evalHand("112233m456p789s99p", "3m", true)).toContain("iipeiko");
  });
});

describe("순환 슌쯔는 무늬·순서 역을 훔치지 않는다", () => {
  it("삼색동순: 만 123 + 통 891 + 삭 891은 '같은 슌쯔'가 아니다", () => {
    // 891p·891s는 랭크 최솟값이 1이라 예전에는 123과 같은 슌쯔로 잡혔다
    expect(evalHand("123m891p891s456m99s", "3m", true)).not.toContain("sanshoku");
  });

  it("일기통관: 891 + 456 + 789는 123을 포함하지 않는다", () => {
    expect(evalHand("891m456m789m234p55p", "5p", true)).not.toContain("ittsuu");
  });

  it("이페코: 123m 한 벌과 891m 한 벌은 같은 슌쯔가 아니다", () => {
    expect(evalHand("123m891m456p789s99p", "3m", true)).not.toContain("iipeiko");
  });

  it("량페코도 마찬가지다", () => {
    expect(evalHand("123m123m891p891p99s", "3m", true)).not.toContain("ryanpeiko");
  });
});

/**
 * 진짜 용(scoring.totalSets = 5)과 역만 뼈대 (docs/25 역/점수 #2·#3).
 *
 * 스안커가 "안커 4개"를 하드코딩해, 5멘쯔에서는 **안커 4 + 슌쯔 1**이 역만이 되고
 * 정작 5안커를 세우면 조건이 깨져 더 좋은 손이 역만에서 탈락했다.
 * 구련보등은 장수를 안 봐서 17장 손으로도 성립했다.
 */
describe("5멘쯔(진짜 용) 역만 뼈대", () => {
  function eval5(spec: string, win: string, tsumo = true): string[] {
    const ctx: WinContext = {
      hand: h(spec),
      winningTile: t(win),
      melds: [],
      winType: tsumo ? "tsumo" : "ron",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
      options: { totalSets: 5 },
    };
    return (evaluateWin(ctx, registry)?.yaku ?? []).map((y) => y.id);
  }

  it("안커 4개 + 슌쯔 1개는 스안커가 아니다", () => {
    // 111m 222m 333m 444m + 567p + 99s — 몸통 하나가 슌쯔다
    expect(eval5("111m222m333m444m567p99s", "1m")).not.toContain("suuankou");
  });

  it("5안커는 스안커로 성립한다 (예전에는 === 4가 깨져 탈락했다)", () => {
    expect(eval5("111m222m333m444m555m99s", "1m")).toContain("suuankou");
  });

  it("구련보등은 17장 손으로 성립하지 않는다", () => {
    // 111p 999p + 234p 345p 567p + 88p — 1·9 셋씩 + 2~8 전부 있지만 17장이다
    expect(eval5("111p999p234p345p567p88p", "1p")).not.toContain("chuuren");
  });
});

describe("표준 14장 역만은 그대로다 (회귀 방지)", () => {
  function eval14(spec: string, win: string): string[] {
    const ctx: WinContext = {
      hand: h(spec),
      winningTile: t(win),
      melds: [],
      winType: "tsumo",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    return (evaluateWin(ctx, registry)?.yaku ?? []).map((y) => y.id);
  }

  it("스안커 (안커 4 + 작두)", () => {
    expect(eval14("111m222m333m444p99s", "1m")).toContain("suuankou");
  });

  it("구련보등 (정확히 14장) — 뼈대 그대로면 순정(9면 대기)", () => {
    // 화료패 1m이 곧 뼈대 초과분이라 화료 직전 손이 순수 1112345678999 = 9면 대기
    expect(eval14("1112345678999m1m", "1m")).toContain("chuuren_junsei");
    expect(eval14("1112345678999m1m", "1m")).not.toContain("chuuren");
  });

  it("구련보등 (9면 대기가 아니면 단일 역만)", () => {
    // 초과분은 1m인데 화료패는 5m — 화료 직전 손이 뼈대가 아니었다
    expect(eval14("1112345678999m1m", "5m")).toContain("chuuren");
    expect(eval14("1112345678999m1m", "5m")).not.toContain("chuuren_junsei");
  });
});

/**
 * 자패 슌쯔(바람의 계보)가 수패 전용 역에 흘러들던 문제 (docs/25 역/점수 #10).
 *
 * 자패는 suit가 하나(wind/dragon)라 `isPureRun`을 그냥 통과한다. 그래서 동남서
 * 두 벌이 이페코가 되고, 자패 슌쯔만으로 핑후까지 붙었다.
 */
describe("자패 슌쯔는 수패 전용 역에 끼지 않는다", () => {
  function evalHonorRuns(spec: string, win: string): string[] {
    const ctx: WinContext = {
      hand: h(spec),
      winningTile: t(win),
      melds: [],
      winType: "ron",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
      options: { honorRuns: true },
    };
    return (evaluateWin(ctx, registry)?.yaku ?? []).map((y) => y.id);
  }

  it("동남서 두 벌은 이페코가 아니다", () => {
    expect(evalHonorRuns("123z123z567z234m55m", "4m")).not.toContain("iipeiko");
  });

  it("자패 슌쯔가 섞이면 핑후가 아니다", () => {
    expect(evalHonorRuns("123z234m345p456s55s", "6s")).not.toContain("pinfu");
  });

  it("수패 슌쯔만으로 이뤄진 핑후는 그대로 성립한다 (회귀 방지)", () => {
    expect(evalHonorRuns("234m345p456s678s99p", "8s")).toContain("pinfu");
  });
});
