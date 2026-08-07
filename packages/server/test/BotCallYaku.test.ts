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
import { botScene, h } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

const names = (spec: string, menzen: boolean): YakuName[] =>
  guessYaku(h(spec), menzen).map((g) => g.name);

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
    const g = guessYaku(h("123456789m1234m"), false).find((x) => x.name === "chinitsu");
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
 *
 * ⚠️ **판을 강하게 만들지는 않는다** — 1200배패 두 시드에서 +0.0067 ± 0.0028 /
 * −0.0029 ± 0.0027로 부호가 뒤집혔다(중립). 고정 우선순위 사슬을 지우려고 남긴
 * 것이지 이득이라서가 아니다. 숫자는 `call.ts` 주석에 있다.
 */
describe("콜 후보 고르기 — 속도만이 아니라 값도 본다", () => {
  /**
   * 탕야오로 굳는 손. 5678p를 들고 6p를 받으면 **치가 두 가지**인데 남는 모양이
   * 달라서 값이 갈린다(567p+8p 남김 vs 678p+5p 남김). 둘 다 샹텐도 우케이레도
   * 같아서 **예전 고정 정렬로는 구분이 안 되던 자리**다.
   *
   * ⚠️ 이 장면을 고르는 데 품이 든 이유: 열린 손은 역이 없으면 게이트에서 잘린다.
   * 앞선 판(9m을 들고 있던 손)은 세 경우가 전부 `null`이라 **비교가 공허했다** —
   * `null === null`은 언제나 참이라 테스트가 통과하면서 아무것도 안 재고 있었다.
   * 아래 두 값(663 / 1023)이 실제로 갈리는지가 이 테스트의 전제다.
   */
  const scene = () =>
    botScene({ hand: "234m567s5678p33m", lastDiscard: { player: "p3", spec: "6p" } });
  const pass = { type: "pass", payload: {} };
  const chiLow = (s: BotScene) => ({
    type: "chi",
    payload: { tileIds: [s.idOf("5p"), s.idOf("7p")] },
  });
  const chiHigh = (s: BotScene) => ({
    type: "chi",
    payload: { tileIds: [s.idOf("7p"), s.idOf("8p")] },
  });
  const call = (s: BotScene, options: unknown[]) =>
    bidCall(buildRead(s.view, "p0"), options as never, null, NEUTRAL_PROFILE);

  it("두 치의 값이 실제로 갈린다 (아래 테스트들의 전제)", () => {
    const s = scene();
    const low = call(s, [chiLow(s), pass]);
    const high = call(s, [chiHigh(s), pass]);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(high?.value ?? 0).toBeGreaterThan(low?.value ?? 0);
  });

  /**
   * **안커를 깨뜨리던 자리.** 실게임에서 EV 켠 쪽과 끈 쪽이 실제로 갈린 조합을
   * 그대로 가져왔다 — 5555s 6789s를 들고 7s를 받으면 치가 두 가지인데,
   * 5s+6s로 받으면 **555s 안커가 깨지고** 8s+9s로 받으면 남는다. 둘 다 샹텐이
   * 같아서 예전 고정 정렬은 이 차이를 못 봤다.
   *
   * 이 장면을 실게임에서 건져 온 이유: 손으로 지어낸 장면 385개를 훑었는데 **단
   * 하나도 두 정렬이 갈리지 않았다.** 실제로 갈리는 것은 콜 990번 중 4번뿐이다
   * (`call.ts` 주석의 표). 지어내서는 이 테스트를 쓸 수 없었다.
   */
  it("안커를 깨는 치 대신 남기는 치를 고른다 — 고정 정렬은 못 보던 차이", () => {
    const s = botScene({
      hand: "27m677p55556789s",
      lastDiscard: { player: "p3", spec: "7s" },
    });
    // 555s를 깨서 5s6s7s를 만든다
    const breaksAnko = {
      type: "chi",
      payload: { tileIds: [s.idOf("5s"), s.idOf("6s")] },
    };
    // 7s8s9s를 만들어 555s를 남긴다
    const keepsAnko = {
      type: "chi",
      payload: { tileIds: [s.idOf("8s"), s.idOf("9s")] },
    };
    const bid = (options: unknown[]) =>
      bidCall(buildRead(s.view, "p0"), options as never, null, NEUTRAL_PROFILE);

    // 전제: 둘 다 단독으로는 부를 수 있다 (여기가 null이면 아래가 공허해진다)
    expect(bid([breaksAnko, pass])).not.toBeNull();
    expect(bid([keepsAnko, pass])).not.toBeNull();

    // 입력 순서를 어느 쪽으로 줘도 안커를 남기는 쪽이 뽑혀야 한다
    expect(bid([breaksAnko, keepsAnko, pass])?.option).toEqual(keepsAnko);
    expect(bid([keepsAnko, breaksAnko, pass])?.option).toEqual(keepsAnko);
  });

  it("후보가 하나뿐이면 그 후보가 그대로 뽑힌다", () => {
    const s = scene();
    expect(call(s, [chiLow(s), pass])?.option).toEqual(chiLow(s));
  });
});

describe("EV 재정렬이 전진 게이트를 깨뜨리지 않는다", () => {
  /**
   * 정렬 기준을 EV로 바꾸면 `plans[0]`이 더 이상 '가장 빠른 것'이 아니게 되는데,
   * 전진 게이트는 `plans[0]` 하나만 본다. 전진 후보들 안에서만 다시 세우지 않으면
   * 멀쩡한 콜이 '전진 없음'으로 잘린다 — 첫 구현에서 실제로 낸 버그다.
   *
   * 잡는 방법: **후보를 더 준다고 콜이 사라질 수는 없다.** 하나만 줬을 때 불렀다면
   * 둘을 줬을 때도 불러야 한다.
   */
  it("후보를 더 준다고 콜이 통째로 사라지지 않는다", () => {
    const scene = botScene({
      hand: "234m567s5678p33m",
      lastDiscard: { player: "p3", spec: "6p" },
    });
    const a = { type: "chi", payload: { tileIds: [scene.idOf("5p"), scene.idOf("7p")] } };
    const b = { type: "chi", payload: { tileIds: [scene.idOf("7p"), scene.idOf("8p")] } };
    const pass = { type: "pass", payload: {} };
    const call = (options: unknown[]) =>
      bidCall(buildRead(scene.view, "p0"), options as never, null, NEUTRAL_PROFILE);

    // 전제: 하나씩 주면 둘 다 부른다 (여기가 null이면 아래 비교가 공허해진다)
    expect(call([a, pass])).not.toBeNull();
    expect(call([b, pass])).not.toBeNull();
    expect(call([a, b, pass])).not.toBeNull();
  });
});
