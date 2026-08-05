/**
 * 증강 플레이북 — **표가 실제 카탈로그와 맞물려 있는가**, 그리고 배수가 상식에 맞는가.
 *
 * 표의 가장 큰 위험은 **오타**다. 없는 id를 적어 두면 아무 일도 일어나지 않고,
 * 그건 "봇이 반영하고 있다"는 착각으로 남는다. 그래서 실시간 카탈로그와 대조한다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";
import {
  AUGMENT_PLAY,
  augmentThreatMultiplier,
  augmentValueMultiplier,
} from "../src/bot/augmentPlaybook.js";

const CATALOG_IDS = new Set(contentAugments.map((d) => d.id));

describe("표가 카탈로그와 맞물린다", () => {
  it("표의 모든 id가 실제 증강이다 (오타는 조용히 무시되므로)", () => {
    const unknown = Object.keys(AUGMENT_PLAY).filter((id) => !CATALOG_IDS.has(id));
    expect(unknown).toEqual([]);
  });

  it("배수는 전부 양수다 (0·음수는 값어치 계산을 뒤집는다)", () => {
    for (const [id, play] of Object.entries(AUGMENT_PLAY)) {
      for (const v of [play.threat, play.value]) {
        if (v !== undefined) expect(v, id).toBeGreaterThan(0);
      }
    }
  });
});

describe("위협 배수 — 이 사람에게 쏘면 얼마나 비싼가", () => {
  it("증강이 없으면 중립이다", () => {
    expect(augmentThreatMultiplier([])).toBe(1);
  });

  it("표에 없는 증강은 중립이다 (모르는 증강이 섞여도 안전하다)", () => {
    expect(augmentThreatMultiplier(["__unknown__", "omni_chi"])).toBe(1);
  });

  it("만년 오야에게 쏘는 것이 평범한 상대보다 비싸다", () => {
    expect(augmentThreatMultiplier(["eternal_dealer"])).toBeGreaterThan(1.2);
  });

  it("책임전가를 든 상대에게는 오히려 덜 비싸다 (지불이 흩어진다)", () => {
    expect(augmentThreatMultiplier(["blame_shift"])).toBeLessThan(1);
  });

  it("배너 없이 비싼 손(스텔스 리치·숨은 칼날)은 특히 무겁게 본다", () => {
    // 리치 배너가 없어 봇의 위협 추정이 눈을 감는 자리 — 배수로 메운다
    expect(augmentThreatMultiplier(["stealth_riichi"])).toBeGreaterThan(
      augmentThreatMultiplier(["late_double"]),
    );
    expect(augmentThreatMultiplier(["hidden_blade"])).toBeGreaterThan(1.2);
  });

  it("겹쳐 들면 더 무섭지만 상한이 있다 (곱이 폭주하지 않는다)", () => {
    const stacked = augmentThreatMultiplier([
      "aotenjou_ceiling",
      "big_hand",
      "eternal_dealer",
      "ankan_dora",
      "mirror_dora",
    ]);
    expect(stacked).toBeGreaterThan(augmentThreatMultiplier(["aotenjou_ceiling"]));
    expect(stacked).toBeLessThanOrEqual(2.2);
  });

  it("지불이 흩어져도 실점이 0이 되지는 않는다 (하한)", () => {
    expect(augmentThreatMultiplier(Array.from({ length: 6 }, () => "blame_shift"))).toBe(
      0.4,
    );
  });
});

describe("값어치 배수 — 내 손이 얼마나 비싼가", () => {
  it("증강이 없으면 중립이다", () => {
    expect(augmentValueMultiplier([])).toBe(1);
  });

  it("상한을 없애는 증강이 도라 한 장짜리보다 크게 친다", () => {
    expect(augmentValueMultiplier(["aotenjou_ceiling"])).toBeGreaterThan(
      augmentValueMultiplier(["red_five_touch"]),
    );
  });

  it("방해·정보 증강은 손 값어치를 바꾸지 않는다", () => {
    expect(augmentValueMultiplier(["disarm", "xray_hand", "call_seal"])).toBe(1);
  });

  it("타점 증강을 겹쳐 들면 값어치가 오른다", () => {
    expect(augmentValueMultiplier(["big_hand", "ankan_dora"])).toBeGreaterThan(
      augmentValueMultiplier(["big_hand"]),
    );
  });

  /**
   * 위협과 값어치는 **같은 사실의 양면**이다 — 상대에게 비싼 손은 내가 들어도 비싸다.
   * 한쪽만 적어 두면 봇이 "남이 들면 무섭지만 내가 들면 평범한" 증강을 갖게 된다.
   */
  it("타점 증강은 위협과 값어치가 같은 방향이다", () => {
    for (const [id, play] of Object.entries(AUGMENT_PLAY)) {
      if (play.value !== undefined && play.value > 1) {
        expect(play.threat, id).toBeGreaterThan(1);
      }
    }
  });
});
