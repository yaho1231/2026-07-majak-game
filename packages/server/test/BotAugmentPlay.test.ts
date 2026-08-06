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
} from "@majak/core";

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
   * **뱅크가 내는 점수와 지불자가 내는 점수는 다르다.**
   *
   * 처음에는 "타점이 커지면 쏘는 쪽도 더 낸다"고 보고 둘을 같은 방향으로 묶었는데,
   * 틀렸다. 큰손(차액을 뱅크가 채움)·일확천금·판돈 굴리기·핏빛 계약·카운터·
   * 모 아니면 도는 늘어난 몫을 **뱅크가 발행**한다 — 그 상대에게 쏴도 내 지갑에서
   * 나가는 돈은 한 푼도 안 늘어난다. 반대로 뚫린 천장은 초과분을 **지불자에게서**
   * 가져오고, 가불 인생은 상대 셋에게서 직접 뜯는다.
   *
   * 그래서 검사할 것은 "같은 방향"이 아니라 **"위협이 1보다 작아지지 않는다"** 이다.
   * 값이 오르는 증강이 쏘는 쪽을 **더 싸게** 만들 수는 없다.
   */
  it("값이 오르는 증강의 위협이 1보다 작을 수는 없다", () => {
    for (const [id, play] of Object.entries(AUGMENT_PLAY)) {
      if (play.value !== undefined && play.value > 1) {
        expect(play.threat ?? 1, id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("뱅크가 발행하는 큰 점수는 쏘는 쪽 비용을 바꾸지 않는다", () => {
    // 이 여섯은 늘어난 몫이 뱅크에서 나온다 — 각 증강 파일이 그렇게 적고 있다
    for (const id of [
      "big_hand",
      "jackpot",
      "let_it_ride",
      "blood_contract",
      "all_or_nothing",
      "counter",
    ]) {
      expect(AUGMENT_PLAY[id]?.threat, id).toBeUndefined();
      expect(AUGMENT_PLAY[id]?.value, id).toBeGreaterThan(1);
    }
  });
});
