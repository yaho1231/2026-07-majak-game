/**
 * 스텔스 리치는 **은닉을 자기 손 안에서 깨는 증강과 함께 나오지 않는다**
 * (2026-08-05 사용자 지시).
 *
 * 이 증강의 존재 이유는 "아무도 내가 리치인 줄 모른다" 하나뿐이라, 내가 든 다른 증강이
 * 리치를 전원 공개로 알리면 능력이 통째로 죽는다. 상대가 막는 것이 아니라 내 손패에서
 * 벌어지는 일이라 플레이로 피할 수도 없다.
 *
 * 여기서는 ① 배제 목록이 그대로 있는지 ② 드래프트가 실제로 그 조합을 안 내는지를 본다.
 */

import { describe, expect, it } from "vitest";
import { AugmentRegistry, createStandardGame } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";

/** 리치를 전원 공개로 알려 은닉을 깨는 증강 */
const LEAKERS = [
  "riichi_seal", // 첫 리치자로서 "봉인"을 전원 공개
  "open_riichi_reveal", // 오름패를 전원 공개
  "all_or_nothing", // 판돈을 전원 공개
  "soul_strike", // 남은 쯔모 수를 전원 공개
  "off_by_one", // 리치 필수 + 바뀐 패를 전원 공개
  "palm_flip", // 리치 중에만 발동 + 해제를 전원 공개
] as const;

/** 은닉과 공존해도 되는 리치 계열 (공개 채널이 없거나 스텔스를 인지한다) */
const COMPATIBLE = [
  "riichi_upgrade", // 스텔스면 트리플리치 표시를 홀더 전용 채널로 보낸다
  "free_riichi_discard",
  "late_double",
  "no_retreat",
  "siege_riichi",
  "push_riichi", // 남을 리치시키는 것이라 내 은닉과 무관
] as const;

describe("스텔스 리치 — 은닉을 깨는 증강 배제", () => {
  it("배제 목록이 그대로 선언돼 있다", () => {
    const declared = new Set(stealthRiichi.conflicts ?? []);
    for (const id of LEAKERS) {
      expect(declared.has(id), `${id}가 conflicts에서 빠졌다`).toBe(true);
    }
  });

  it("배제 대상은 전부 실재하는 증강 id다", () => {
    const known = new Set(contentAugments.map((a) => a.id));
    for (const id of stealthRiichi.conflicts ?? []) {
      expect(known.has(id), `알 수 없는 conflicts 대상: ${id}`).toBe(true);
    }
  });

  it("공존해도 되는 리치 계열은 배제하지 않는다 (과잉 차단 방지)", () => {
    const declared = new Set(stealthRiichi.conflicts ?? []);
    for (const id of COMPATIBLE) {
      expect(declared.has(id), `${id}는 배제 대상이 아니다`).toBe(false);
    }
  });

  it("드래프트가 스텔스 보유자에게 그 조합을 제시하지 않는다", () => {
    /*
     * conflicts는 양방향으로 걸린다 — 보유 증강이 후보를 금지하거나(H.conflicts ∋ def),
     * 후보가 보유 증강을 금지하면(def.conflicts ∋ H) 둘 다 제외된다.
     * 여기서는 카탈로그 수준에서 그 관계가 성립하는지 확인한다.
     */
    const registry = new AugmentRegistry();
    registry.addAll(contentAugments);
    for (const id of LEAKERS) {
      const other = registry.get(id);
      expect(other, `${id}를 카탈로그에서 못 찾았다`).toBeDefined();
      const blocked =
        (stealthRiichi.conflicts ?? []).includes(id) ||
        (other?.conflicts ?? []).includes("stealth_riichi");
      expect(blocked, `${id}와 stealth_riichi가 서로 배제되지 않는다`).toBe(true);
    }
  });

  it("게임을 세워도 카탈로그가 그대로 로드된다 (선언 오류 없음)", () => {
    // defineAugment의 id·계열 검증을 실제로 태운다
    const game = createStandardGame({ seed: 1, playerIds: ["p0", "p1", "p2", "p3"] });
    expect(game.augments).toBeDefined();
  });
});
