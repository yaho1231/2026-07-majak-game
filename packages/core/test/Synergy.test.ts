/**
 * 증강 시너지 표·편향 계산 (augment/synergy.ts).
 *
 * 여기서는 **표 자체의 무결성과 배수 계산**만 본다.
 * 살아 있는 카탈로그와의 대조(미분류가 없는가)와 실제 드래프트 분포는
 * content/test/draft_synergy.test.ts 가 맡는다.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_SYNERGY,
  SYNERGY_PENALTY,
  SYNERGY_TAG_LABEL,
  SELF_ANTI_TAGS,
  synergyBias,
  synergyBonusFor,
} from "../src/augment/synergy.js";
import type { SynergyTag } from "../src/augment/synergy.js";

const ALL_IDS = Object.keys(AUGMENT_SYNERGY);

describe("시너지 표 무결성", () => {
  it("모든 축이 라벨을 가진다 (오타 축이 조용히 섞이지 않는다)", () => {
    const known = new Set(Object.keys(SYNERGY_TAG_LABEL));
    for (const [id, entry] of Object.entries(AUGMENT_SYNERGY)) {
      for (const t of [...entry.tags, ...(entry.anti ?? [])]) {
        expect(known, `${id}: 알 수 없는 축 ${t}`).toContain(t);
      }
    }
  });

  it("antiIds는 표에 있는 id만 가리키고, 자기 자신을 가리키지 않는다", () => {
    for (const [id, entry] of Object.entries(AUGMENT_SYNERGY)) {
      for (const other of entry.antiIds ?? []) {
        expect(ALL_IDS, `${id}.antiIds → ${other}`).toContain(other);
        expect(other).not.toBe(id);
      }
    }
  });

  it("자기 축을 자기 anti로 두지 않는다 (SELF_ANTI_TAGS만 예외)", () => {
    // 예외는 "한 게임에 하나만 사는 부류"뿐이다 — 리치 선언 버튼처럼 자원이 겹쳐
    // 서로를 죽이는 축(SELF_ANTI_TAGS). 그 축은 같은 부류의 **다른** 카드를 밀어낸다.
    const allowed = new Set<SynergyTag>(SELF_ANTI_TAGS);
    for (const [id, entry] of Object.entries(AUGMENT_SYNERGY)) {
      const anti = new Set<SynergyTag>(entry.anti ?? []);
      for (const t of entry.tags) {
        if (allowed.has(t)) continue;
        expect(anti.has(t), `${id}: 축 ${t}가 자기 anti에도 있다`).toBe(false);
      }
    }
  });
});

describe("synergyBias — 배수 계산", () => {
  it("보유가 없으면 완전 중립이다 (첫 드래프트는 안 건드린다)", () => {
    expect(synergyBias([])).toEqual({});
  });

  it("겹치는 축 수만큼 배수가 오르고, 상한에서 멈춘다", () => {
    expect(synergyBonusFor(0)).toBe(1);
    expect(synergyBonusFor(1)).toBeGreaterThan(1);
    expect(synergyBonusFor(2)).toBeGreaterThan(synergyBonusFor(1));
    expect(synergyBonusFor(9)).toBe(synergyBonusFor(3));
  });

  it("보유한 것 자신은 편향 대상이 아니다", () => {
    expect(synergyBias(["stealth_riichi"])["stealth_riichi"]).toBeUndefined();
  });

  it("리치를 집으면 리치 축 증강의 가중치가 오른다", () => {
    const bias = synergyBias(["late_double"]); // riichi · riichi_value · han · menzen
    expect(bias["ura_peek"]).toBeGreaterThan(1); // riichi_value 공유
    expect(bias["free_riichi_discard"]).toBeGreaterThan(1); // riichi · menzen 공유
    // 축이 하나도 겹치지 않는 것은 그대로 1.0 (표에 항목이 없다)
    expect(bias["discard_lock"]).toBeUndefined();
  });

  it("겹치는 축이 많을수록 더 크게 오른다", () => {
    const bias = synergyBias(["ankan_dora"]); // kan · dora · han · menzen
    expect(bias["snake_kan"]).toBeGreaterThan(bias["mirror_dora"] as number);
  });
});

describe("역시너지 — 스텔스 리치", () => {
  const bias = synergyBias(["stealth_riichi"]);

  it("리치를 드러내는 증강은 눌린다 (은닉이 존재 이유다)", () => {
    for (const id of [
      "open_riichi_reveal",
      "all_or_nothing",
      "soul_strike",
      "riichi_seal",
      "off_by_one",
      "palm_flip",
      "riichi_upgrade",
    ]) {
      expect(bias[id], `${id}이 눌리지 않았다`).toBe(SYNERGY_PENALTY);
    }
  });

  it("드러내지 않고 값만 키우는 리치 증강은 오른다", () => {
    // ⚠ `no_retreat`은 2026-08-23부터 여기 없다 — 스텔스와 **같은 riichi_declare 축**
    //   (전용 리치 선언 버튼)이라 서로를 밀어낸다. 둘을 함께 들면 국당 한 번뿐인
    //   리치를 두고 버튼이 나란히 뜨고 하나는 늘 논다(QA synergy3 riichi 확정 9,
    //   build 확정 1은 그 상태에서 봇이 뒤엣것을 영영 안 쓰는 것까지 보였다).
    for (const id of ["late_double", "ura_peek", "free_riichi_discard"]) {
      expect(bias[id], `${id}이 오르지 않았다`).toBeGreaterThan(1);
    }
  });

  it("관계는 대칭이다 — 반대로 집어도 스텔스가 눌린다", () => {
    expect(synergyBias(["open_riichi_reveal"])["stealth_riichi"]).toBe(
      SYNERGY_PENALTY,
    );
    expect(synergyBias(["riichi_seal"])["stealth_riichi"]).toBe(SYNERGY_PENALTY);
  });

  it("역시너지는 보너스를 이긴다 (축이 겹쳐도 눌린다)", () => {
    // soul_strike는 riichi·riichi_value를 스텔스와 공유하지만 riichi_open이라 눌린다
    expect(AUGMENT_SYNERGY["soul_strike"]?.tags).toContain("riichi_value");
    expect(bias["soul_strike"]).toBe(SYNERGY_PENALTY);
  });
});

describe("역시너지 — 문서화된 나머지 관계 (docs/21)", () => {
  it("죽기살기 × 수비 증강 (C-3)", () => {
    const bias = synergyBias(["die_hard"]);
    for (const id of ["invincible", "no_ron_pact", "yakuman_shield", "always_tenpai"]) {
      expect(bias[id], id).toBe(SYNERGY_PENALTY);
    }
  });

  it("완전 중복 쌍 (C-4)", () => {
    expect(synergyBias(["hidden_blade"])["soul_hunt"]).toBe(SYNERGY_PENALTY);
    expect(synergyBias(["invincible"])["no_ron_pact"]).toBe(SYNERGY_PENALTY);
    expect(synergyBias(["hidden_river"])["brief_fog"]).toBe(SYNERGY_PENALTY);
    expect(synergyBias(["rinshan_preview"])["dead_wall_master"]).toBe(SYNERGY_PENALTY);
    expect(synergyBias(["riichi_seal"])["riichi_upgrade"]).toBe(SYNERGY_PENALTY);
  });

  it("리치 봉인 × 상대 리치를 먹는 증강 (C-2)", () => {
    const bias = synergyBias(["riichi_seal"]);
    for (const id of ["counter", "push_riichi", "soul_hunt", "peek_riichi_waits"]) {
      expect(bias[id], id).toBe(SYNERGY_PENALTY);
    }
  });

  it("판수 폭발 조합은 함께 뜨지 않게 눌린다 (B-1 · B-2)", () => {
    const aotenjou = synergyBias(["aotenjou_ceiling"]);
    for (const id of ["ankan_dora", "north_trader", "no_retreat", "true_dragon"]) {
      expect(aotenjou[id], id).toBe(SYNERGY_PENALTY);
    }
    const unify = synergyBias(["unification"]);
    for (const id of ["aotenjou_ceiling", "jackpot", "big_hand", "devils_advance"]) {
      expect(unify[id], id).toBe(SYNERGY_PENALTY);
    }
  });
});

describe("최신성 — 가장 최근에 집은 것이 가장 세게 끈다", () => {
  it("두 빌드를 하나씩 들면 나중에 집은 쪽이 더 크게 오른다", () => {
    // 먼저 깡·도라 → 나중에 리치. 세 번째 제시는 리치 쪽으로 더 기울어야 한다.
    const bias = synergyBias(["ankan_dora", "late_double"]);
    expect(bias["ura_peek"]).toBeGreaterThan(bias["snake_kan"] as number); // 리치 > 깡
    // 순서를 뒤집으면 결과도 뒤집힌다 — 이게 "가장 최근"의 정의다.
    const flipped = synergyBias(["late_double", "ankan_dora"]);
    expect(flipped["snake_kan"]).toBeGreaterThan(flipped["ura_peek"] as number);
  });

  it("예전 픽도 계속 영향을 준다 (덮어쓰기가 아니라 감쇠다)", () => {
    const bias = synergyBias(["ankan_dora", "late_double"]);
    expect(bias["snake_kan"]).toBeGreaterThan(1); // 깡 축은 살아 있다
  });

  it("같은 축을 거듭 집으면 그 축이 더 세게 끌린다", () => {
    // ⚠ 표본을 `cliff_bloom`에서 `void_kan`으로 옮겼다 — 2026-08-23부터 만개는
    //   `snake_kan`을 antiIds로 들고 있어(둘이 함께 서면 배패에서 화료가 확정된다)
    //   깡 축을 두 번 집어도 만개만은 눌린다. 축 누적 자체는 그대로다.
    const once = synergyBias(["ankan_dora"]);
    const twice = synergyBias(["ankan_dora", "snake_kan"]);
    expect(twice["void_kan"]).toBeGreaterThan(once["void_kan"] as number);
    // 역시너지는 보너스를 이긴다 — 만개는 오히려 눌린다
    expect(twice["cliff_bloom"]).toBe(SYNERGY_PENALTY);
  });

  it("상한이 있다 — 아무리 겹쳐도 확정이 되지 않는다", () => {
    const bias = synergyBias(["ankan_dora", "snake_kan", "mirror_dora", "red_five_touch"]);
    for (const v of Object.values(bias)) expect(v).toBeLessThanOrEqual(4);
  });

  it("역시너지는 감쇠하지 않는다 (오래된 픽이 건 anti도 그대로 눌린다)", () => {
    // 스텔스 리치를 맨 처음 집어도, 은닉을 깨는 증강은 계속 최저 배수다.
    const bias = synergyBias(["stealth_riichi", "ankan_dora", "snake_kan"]);
    expect(bias["riichi_upgrade"]).toBe(SYNERGY_PENALTY);
  });
});

describe("여러 개를 보유했을 때", () => {
  it("축이 합쳐진다 — 두 빌드 양쪽의 시너지를 모두 본다", () => {
    const bias = synergyBias(["ankan_dora", "royal_kokushi"]);
    expect(bias["snake_kan"]).toBeGreaterThan(1); // kan
    expect(bias["giant_god"]).toBeGreaterThan(1); // kokushi
  });

  it("한 장이라도 역시너지를 걸면 눌린다", () => {
    // palm_flip은 리치 축이라 원래 오르지만, 은닉을 깨므로 스텔스 리치가 눌러야 한다
    expect(synergyBias(["late_double"])["palm_flip"]).toBeGreaterThan(1);
    expect(synergyBias(["late_double", "stealth_riichi"])["palm_flip"]).toBe(
      SYNERGY_PENALTY,
    );
  });
});
