/**
 * **울고 난 손이 어떤 역으로 갈 수 있는가** — 콜 게이트의 역 읽기.
 *
 * 2026-08-06까지 어휘가 두 벌이었다. 손 값어치(`bot/yaku.ts`)는 청일색·치또이·일통·
 * 삼색동순·찬타까지 읽는데, 후로 게이트(`call.yakuPathAfter`)는 역패·탕야오·혼일색·
 * 토이토이 넷만 알았다. 그래서 산색으로 갈 수 있는 손도, 일통이 보이는 손도 게이트가
 * 모르니 "역 없음"으로 잘렸다 — 콜 기회의 36.6%가 거기서 끝났다(#152 집계).
 *
 * 여기서 잡는 것은 둘이다.
 *   1. 새로 알아본 역들이 실제로 판정된다 (그리고 **없는 역을 지어내지 않는다**)
 *   2. 열린 손으로 갈 수 없는 역(치또이·산안커)은 콜 경로에서 빠진다
 */

import { describe, expect, it } from "vitest";
import { guessYaku, hanOf, bestYakuHan } from "../src/bot/yaku.js";
import type { YakuName } from "../src/bot/yaku.js";
import { bidCall } from "../src/bot/call.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { parseFlags } from "../src/bot/flags.js";
import { botScene, h } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

/** 2026-08-06에 더한 넷까지 읽는다 (`extended`) — 재는 중이라 스위치 뒤에 있다 */
const names = (spec: string, menzen: boolean): YakuName[] =>
  guessYaku(h(spec), menzen, true).map((g) => g.name);

describe("역 읽기 — 새로 알아본 역들", () => {
  it("토이토이 — 커쯔가 될 덩이가 넷 이상 모였을 때", () => {
    expect(names("111m333p555s77z99m", false)).toContain("toitoi");
  });

  it("또이쯔가 둘뿐인 손은 토이토이가 아니다", () => {
    expect(names("123m456p789s11m22p", false)).not.toContain("toitoi");
  });

  it("산안커 — 암각 셋. 멘젠에서만 센다", () => {
    expect(names("111m333p555s79m2p", true)).toContain("sanankou");
    expect(names("111m333p555s79m2p", false)).not.toContain("sanankou");
  });

  it("삼색동각 — 같은 숫자의 커쯔·또이쯔가 세 색에 걸칠 때", () => {
    expect(names("333m333p33s123m9p", false)).toContain("sanshokuDoukou");
  });

  it("한 색이라도 비면 삼색동각이 아니다", () => {
    expect(names("333m333p123m456s9p", false)).not.toContain("sanshokuDoukou");
  });

  it("탕야오 — 요구패·자패가 한 장도 없을 때", () => {
    expect(names("234m567p345s22m56p", false)).toContain("tanyao");
  });

  it("1이 한 장이라도 있으면 탕야오가 아니다", () => {
    expect(names("123m567p345s22m56p", false)).not.toContain("tanyao");
  });

  it("색 계열은 어느 색으로 갈지도 함께 알려 준다", () => {
    const g = guessYaku(h("123456789m1234m"), false, true).find((x) => x.name === "chinitsu");
    expect(g?.suit).toBe("man");
  });
});

describe("판수 표는 하나뿐이다 — 열린 손의 쿠이사가리까지", () => {
  it("멘젠에서 깎이지 않고 열린 손에서 한 판 깎이는 역들", () => {
    for (const name of ["honitsu", "chinitsu", "ittsu", "sanshoku", "chanta", "junchan"] as const) {
      expect(hanOf(name, false)).toBe(hanOf(name, true) - 1);
    }
  });

  it("커쯔 계열·1판역은 울어도 안 깎인다", () => {
    for (const name of ["sanankou", "sanshokuDoukou", "yakuhai", "tanyao"] as const) {
      expect(hanOf(name, false)).toBe(hanOf(name, true));
    }
  });

  it("토이토이만 멘젠이 한 판 높다 — 쿠이사가리가 아니라 암각이 따라붙기 때문", () => {
    // 토이토이 자체는 열고 닫고 2판이다. 멘젠 3판은 "커쯔로 몰린 멘젠 손에는
    // 삼암각·역패가 대개 함께 붙는다"는 어림이고, 재작성 전부터 쓰던 값이다.
    expect(hanOf("toitoi", false)).toBe(2);
    expect(hanOf("toitoi", true)).toBe(3);
  });

  it("가장 비싼 역 하나만 센다 — 겹침을 더하면 낙관 쪽으로 기운다", () => {
    // 청일색(멘젠 6판)이면서 일통이기도 한 손
    const kinds = h("123456789m1199m");
    expect(bestYakuHan(kinds, true)).toBe(hanOf("chinitsu", true));
  });
});

/**
 * **무엇을 부를 것인가** — 후보가 여럿일 때의 선택.
 *
 * 예전에는 샹텐 → 우케이레 → 적도라 순의 고정 정렬로 골랐다. 즉 속도만 봤고,
 * 부른 뒤 손이 얼마짜리가 되는지는 선택에 들어가지 않았다. `bot/openTally.ts`의
 * 첫 측정이 "울고 난 손이 멘젠 손의 절반 이하 값"임을 보여 준 뒤에 손댄 자리다.
 */
describe("콜 후보 고르기 — 속도만이 아니라 값도 본다", () => {
  const opts = (scene: BotScene) => [
    // 도라(적5p)를 멘쯔에 묻는 치
    { type: "chi", payload: { tileIds: [scene.idOf("5p"), scene.idOf("6p")] } },
    // 같은 값어치의 다른 치 — 도라를 안 쓴다
    { type: "chi", payload: { tileIds: [scene.idOf("7p"), scene.idOf("8p")] } },
    { type: "pass", payload: {} },
  ];

  it("스위치를 켜면 후보를 EV로 고른다 (기본은 예전 정렬 그대로)", () => {
    const scene = botScene({
      hand: "234m567s5678p99m",
      lastDiscard: { player: "p3", spec: "6p" },
      redAt: [7], // 5p를 적도라로
    });
    const withEv = buildRead(scene.view, "p0", { flags: parseFlags("callValue") });
    const plain = buildRead(scene.view, "p0");
    // 두 경로 다 무언가를 부르거나 둘 다 안 부른다 — 여기서 잡는 것은 '고르는 방식'이
    // 바뀌어도 판단이 깨지지 않는다는 것이다 (구체적 선택은 EV가 정한다)
    const a = bidCall(withEv, opts(scene) as never, null, NEUTRAL_PROFILE);
    const b = bidCall(plain, opts(scene) as never, null, NEUTRAL_PROFILE);
    expect(a === null).toBe(b === null);
    if (a !== null && b !== null) {
      // EV로 고른 쪽이 그 손에서 더 나쁜 값을 낼 수는 없다
      expect(a.value).toBeGreaterThanOrEqual(b.value);
    }
  });

  it("후보가 하나뿐이면 스위치가 아무것도 바꾸지 않는다", () => {
    const scene = botScene({
      hand: "234m567s5678p99m",
      lastDiscard: { player: "p3", spec: "6p" },
    });
    const one = [
      { type: "chi", payload: { tileIds: [scene.idOf("7p"), scene.idOf("8p")] } },
      { type: "pass", payload: {} },
    ];
    const a = bidCall(
      buildRead(scene.view, "p0", { flags: parseFlags("callValue") }),
      one as never,
      null,
      NEUTRAL_PROFILE,
    );
    const b = bidCall(buildRead(scene.view, "p0"), one as never, null, NEUTRAL_PROFILE);
    expect(a?.value).toBe(b?.value);
  });
});

describe("EV 재정렬이 전진 게이트를 깨뜨리지 않는다", () => {
  it("전진하는 후보가 있으면 EV 정렬을 켜도 그 콜이 살아남는다", () => {
    /**
     * 정렬 기준을 바꾸면 `plans[0]`이 '가장 빠른 것'이 아니게 되는데, 전진 게이트는
     * `plans[0]` 하나만 본다. 전진 후보들 안에서만 다시 세우지 않으면 여기서
     * 멀쩡한 콜이 '전진 없음'으로 잘린다.
     */
    const scene = botScene({
      hand: "234m567s5678p99m",
      lastDiscard: { player: "p3", spec: "6p" },
    });
    const options = [
      { type: "chi", payload: { tileIds: [scene.idOf("5p"), scene.idOf("7p")] } },
      { type: "chi", payload: { tileIds: [scene.idOf("7p"), scene.idOf("8p")] } },
      { type: "pass", payload: {} },
    ];
    const on = bidCall(
      buildRead(scene.view, "p0", { flags: parseFlags("callValue") }),
      options as never,
      null,
      NEUTRAL_PROFILE,
    );
    const off = bidCall(buildRead(scene.view, "p0"), options as never, null, NEUTRAL_PROFILE);
    // 스위치가 콜을 통째로 없애 버리면 안 된다
    expect(on === null).toBe(off === null);
  });
});
