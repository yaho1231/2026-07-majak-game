/**
 * QA 증강 감사(2026-08-20) 코어 채점 회귀 — shape 확정 1·2·3 + text 확정 21·22.
 *
 * 네 가지를 못 박는다.
 *  1. 조커를 켜도 샹텐이 치또이·국사를 잃지 않는다 (봇이 자기 텐파이를 노텐으로 읽던 자리).
 *  2. 랭크가 섞인 깡의 **네 번째 패**가 역 판정에서 사라지지 않는다 (장사진 탕야오·바람 계보 북).
 *  3. 느슨한 커쯔(동수의 결속·양극)가 샹퐁 대기를 단기로 바꿔 스안커를 더블 역만으로
 *     격상시키지 않는다.
 *  4. 그러면서 **표준 마작 채점은 한 톨도 바뀌지 않는다** (대조군을 함께 둔다).
 */

import { describe, expect, it } from "vitest";
import {
  YakuRegistry,
  allKinds,
  buildVariants,
  evaluateWin,
  kindKey,
  registerStandardYaku,
  setKinds,
  shantenOf,
} from "../src/index.js";
import type { DecomposeOptions, MeldInfo, TileKind, WinContext } from "../src/index.js";

/** "123m45p6s11z" → TileKind[] */
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

const reg = new YakuRegistry();
registerStandardYaku(reg);

function ctxOf(
  hand: string,
  win: string,
  opts: DecomposeOptions = {},
  melds: MeldInfo[] = [],
): WinContext {
  return {
    hand: h(hand),
    melds,
    winningTile: h(win)[0] as TileKind,
    winType: "tsumo",
    seatWind: 1,
    prevalentWind: 1,
    riichi: null,
    options: opts,
    winnerId: "p0",
  } as unknown as WinContext;
}

const yakuIds = (ctx: WinContext): string[] =>
  (evaluateWin(ctx, reg)?.yaku ?? []).map((y) => y.id);

// ───────────────────────── 1. 조커 샹텐 (shape 확정 1) ─────────────────────────

describe("shantenOf — 조커를 켜도 치또이·국사를 잃지 않는다", () => {
  /** 조커는 백(5z). 손 자체가 이미 텐파이인 13장짜리들 */
  const joker: DecomposeOptions = { wildKinds: [{ suit: "dragon", rank: 1 }] };

  it("국사 13면 텐파이에 백이 섞여도 샹텐 0 (예전엔 7)", () => {
    expect(shantenOf(h("19m19p19s1234567z"), 0, joker)).toBe(0);
  });

  it("국사 텐파이(백 1장)도 샹텐 0 (예전엔 6)", () => {
    expect(shantenOf(h("19m19p19s1234z67z1z"), 0, joker)).toBe(0);
  });

  it("치또이 텐파이(6쌍 + 백)도 샹텐 0", () => {
    expect(shantenOf(h("112233445566m5z"), 0, joker)).toBe(0);
  });

  it("13장 손은 절대 -1(완성)로 읽히지 않는다", () => {
    for (const spec of ["123m456p789s11z55z", "5z5z5z5z123m456p789s", "1122334455m66p5z"]) {
      expect(shantenOf(h(spec), 0, joker)).toBeGreaterThanOrEqual(0);
    }
  });

  it("조커 샹텐은 언제나 표준 샹텐 이하다 (전진시키는 물건이다)", () => {
    for (const spec of [
      "19m19p19s1234567z",
      "112233445566m5z",
      "123m456p789s11z55z",
      "19m19p19s1234z67z1z",
    ]) {
      expect(shantenOf(h(spec), 0, joker)).toBeLessThanOrEqual(shantenOf(h(spec), 0));
    }
  });

  it("조커가 한 장도 없으면 값이 표준과 같다 (옵션만 켠 손)", () => {
    for (const spec of ["19m19p19s1234567z", "112233445566m7z", "123m456p789s11z22z"]) {
      expect(shantenOf(h(spec), 0, joker)).toBe(shantenOf(h(spec), 0));
    }
  });
});

// ────────────────── 2. 랭크가 섞인 깡의 네 번째 패 (shape 확정 3 · text 확정 22) ──────────────────

describe("랭크가 섞인 깡 — 네 번째 패가 역 판정에서 사라지지 않는다", () => {
  const snakeKan = (spec: string): MeldInfo => ({ kind: "kan_closed", tiles: h(spec) });

  it("9만이 든 장사진(6-7-8-9만)에 탕야오가 붙지 않는다", () => {
    const ctx = ctxOf("234p567p345s22s", "2s", {}, [
      snakeKan("6789m"),
    ]);
    expect(yakuIds(ctx)).not.toContain("tanyao");
    for (const v of buildVariants(ctx)) {
      expect(allKinds(v).map(kindKey)).toContain("man9");
    }
  });

  it("동남서북 안깡의 몸통은 네 바람을 다 내놓는다 (북만 빠지던 자리)", () => {
    const ctx = ctxOf("123m456p789s11p", "1p", { honorRuns: true }, [
      { kind: "kan_closed", tiles: h("1234z") },
    ]);
    const v = buildVariants(ctx)[0];
    expect(v).toBeDefined();
    const windRun = (v?.sets ?? []).find((s) => s.tiles[0]?.suit === "wind");
    expect(windRun).toBeDefined();
    expect(setKinds(windRun as never).map((t) => t.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it("표준 깡(같은 패 넉 장)은 아무것도 늘지 않는다 — 표준 채점 불변", () => {
    const ctx = ctxOf("234p567p345s22s", "2s", {}, [{ kind: "kan_closed", tiles: h("6666m") }]);
    const v = buildVariants(ctx)[0];
    const kan = (v?.sets ?? []).find((s) => s.isKan);
    expect(setKinds(kan as never)).toHaveLength(3);
  });
});

// ───────────── 3. 느슨한 커쯔가 스안커를 단기로 격상시키지 않는다 (shape 확정 2) ─────────────

describe("스안커 — 같은 화료패로 샹퐁이 서면 단기로 격상되지 않는다", () => {
  const mixed: DecomposeOptions = { mixedTriplets: true };
  const polar: DecomposeOptions = { polarEnds: true };

  it("동수의 결속: 같은 랭크 4장이 있어도 스안커는 역만 1 · 샹퐁", () => {
    for (const [hand, win] of [
      ["222m222p222s111m11p", "1m"],
      ["333m333p333s555m55s", "5m"],
    ] as const) {
      const std = evaluateWin(ctxOf(hand, win), reg);
      const mt = evaluateWin(ctxOf(hand, win, mixed), reg);
      expect(std?.waitType).toBe("shanpon");
      expect(mt?.waitType).toBe("shanpon");
      expect(mt?.yakumanCount).toBe(std?.yakumanCount);
      expect(mt?.yaku.map((y) => y.id)).not.toContain("suuankou_tanki");
    }
  });

  it("양극: 1·9 혼합 커쯔도 스안커를 더블 역만으로 올리지 않는다", () => {
    const std = evaluateWin(ctxOf("111m99m111p111s222s", "1m"), reg);
    const pe = evaluateWin(ctxOf("111m99m111p111s222s", "1m", polar), reg);
    expect(std?.yakumanCount).toBe(1);
    expect(pe?.yakumanCount).toBe(1);
    expect(pe?.waitType).toBe("shanpon");
  });

  it("양극의 청노두 + 스안커(역만 2)는 그대로다 — 막은 것은 단기 격상뿐", () => {
    const pe = evaluateWin(ctxOf("111m111p111s999m99p", "9m", polar), reg);
    expect(pe?.yaku.map((y) => y.id).sort()).toEqual(["chinroutou", "suuankou"]);
    expect(pe?.yakumanCount).toBe(2);
  });

  it("대조군: 진짜 단기(같은 랭크 4장 없음)는 표준·증강 모두 더블 역만", () => {
    for (const opts of [{}, mixed, polar]) {
      const r = evaluateWin(ctxOf("222m333p444s111m99p", "9p", opts), reg);
      expect(r?.waitType).toBe("tanki");
      expect(r?.yaku.map((y) => y.id)).toContain("suuankou_tanki");
      expect(r?.yakumanCount).toBe(2);
    }
  });

  it("대조군: 평범한 단기 화료(핑후 아님)의 대기 판정이 그대로다", () => {
    const r = evaluateWin(ctxOf("123m456m789m123p55s", "5s"), reg);
    expect(r?.waitType).toBe("tanki");
  });
});
