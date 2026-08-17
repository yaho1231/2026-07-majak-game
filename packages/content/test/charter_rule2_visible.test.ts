/**
 * 가드 ③ — Charter Rule #2: "발동이 테이블에서 보이지 않는 증강은 증강이 아니다".
 *
 * 2026-08-07 감사에서 불가침 조약·천하무적·붉은 손길·영상 정찰이 **아무 표시도 없이**
 * 작동하고 있었다. 특히 불가침 조약은 보유자조차 조약이 살아 있는지 화면에서 확인할
 * 길이 없었다. 넷 다 그 커밋에서 공개 채널을 냈지만, 다음 증강이 또 조용히 들어오는
 * 것을 막는 장치는 없었다. 이 가드가 그 자리다.
 *
 * ## 무엇을 "보이는 것"으로 세는가
 *
 * 소스 스캔이라 **등록의 종류**로 판정한다. 아래 다섯 중 하나라도 있으면 통과다.
 *
 *  A. 공개 뷰 채널 — `viewKey("*", …)` / `roundViewKey("*", …)`. 전원 화면에 값이 뜬다.
 *  B. 액션 — `holderTurnOptions` / `holderReactionOptions`. 표준 액션이 아닌 제출은
 *     `HanchanController`가 `actionFx`로 전원에게 방송한다(비밀 발동 목록은 그쪽 예외).
 *  C. 커스텀 역 — `yaku.register` / `addYakuHolder`. 역 이름이 결과창 역 목록에 뜬다.
 *  D. 정산 기여 표기 — `withAugPoint`와 그 래퍼. 결과창에 "이 증강이 점수를 이만큼
 *     움직였다" 한 줄이 남는다(docs/25 P9).
 *  E. `PUBLIC_RULE_TELLS`에 실린 규칙 — 규칙이 풀리는 순간 **그 결과물 자체가 공개**인
 *     것들. 무늬 섞인 슌쯔를 치로 부르거나 눕히면 테이블이 그대로 본다.
 *
 * ## 못 잡는 것 (정직하게)
 *
 *  - **채널을 냈는데 클라이언트가 안 그리는 것.** 등록만 보므로 렌더링 누락은 통과한다.
 *    `ankan_dora`·`no_retreat`·`riichi_upgrade`·`let_it_ride`가 지금 그 상태다 —
 *    채널·정산 표기는 있고 인게임 표시가 얇다.
 *  - **채널은 있는데 내용이 무의미한 것.** 값이 늘 같거나 비어 있어도 통과한다.
 *  - E 목록의 판단은 사람이 한 것이다. 규칙 이름이 늘면 여기 사유와 함께 추가해야 한다.
 */

import { describe, expect, it } from "vitest";
import { ALL_AUGMENTS, sourceOf } from "./catalogSource.js";

/**
 * E — **규칙이 풀리는 순간 결과물이 공개되는** 규칙들.
 *
 * 이 규칙들은 별도 채널이 없어도 테이블에서 보인다. 근거를 규칙마다 적어 둔다 —
 * "보일 것 같다"로 늘리지 말 것.
 */
const PUBLIC_RULE_TELLS: Readonly<Record<string, string>> = {
  // 화료형 확장 — 성립한 몸통은 치·펑·깡으로 눕거나 화료 시 손패로 공개된다.
  "scoring.mixedRuns": "무늬 섞인 슌쯔가 치로 눕고 화료형으로 공개된다",
  "scoring.mixedTriplets": "무늬 섞인 커쯔가 펑·깡으로 눕는다",
  "scoring.polarEnds": "1·9 혼합 몸통으로 퐁이 서고, 화료형이 공개된다",
  "scoring.chiitoiMixedPairs": "무늬 다른 쌍으로 완성된 치또이가 화료 시 공개된다",
  "scoring.kokushiDupes": "중복 요구패로 성립한 국사가 화료 시 공개된다",
  "scoring.honorRuns": "자패 슌쯔가 치로 눕고 동남서북 깡이 공개된다",
  "scoring.wrapRuns": "8-9-1·9-1-2 슌쯔가 치로 눕고 화료형으로 공개된다",
  // 후로·리치의 가능 범위 자체가 바뀌는 것 — 남들이 못 하는 콜이 눈앞에서 나온다.
  "call.chi.fromAnyone": "상가가 아닌 사람의 버림패를 치하는 것이 그대로 보인다",
  "call.snakeKan": "연속 4장 깡이 눕는다",
  "riichi.requiresTenpai": "노텐 리치도 리치 선언 그 자체가 공개다",
  // 손패 장수 — 16장 손은 배패부터 전원에게 보인다.
  "deal.handSize": "손패 장수가 표준과 다른 것이 배패부터 보인다",
  "scoring.totalSets": "5멘쯔 화료형이 화료 시 공개된다",
  // 가리는 능력 — 가려졌다는 사실 자체가 상대 화면에 뜬다.
  "visibility.doraIndicators.hidden": "도라 표시패가 뒷면으로 덮인 것이 상대에게 보인다",
};

/**
 * 위 다섯 중 어디에도 안 걸리지만 **정당한** 예외. 사유를 반드시 적는다.
 * 새 증강이 여기 오려면 "왜 보일 수 없는가"를 설명해야 한다 — 그냥 추가는 금지.
 */
const SILENT_ALLOWED: Readonly<Record<string, string>> = {
  unification:
    "발동이 곧 매치 종료다 — 45000점에 닿는 순간 남은 국을 무시하고 게임이 끝나는 것보다 더 크게 보이는 표식은 없다. 문턱은 고정 수치라 카드 문구가 곧 목표이고, 점수봉은 원래 전원에게 보인다",
  late_double:
    "7순 이내 리치가 결과창 역 목록에 '더블리치'로 뜬다. 리치 선언 자체는 이미 공개이고 승격은 정산에서 밝혀진다",
};

/** 그 증강 소스에 이 등록이 있는가 */
function tellsOf(id: string): string[] {
  const src = sourceOf(id);
  const found: string[] = [];
  if (/(?:round)?[Vv]iewKey\(\s*"\*"/.test(src)) found.push("A:공개채널");
  if (/holderTurnOptions|holderReactionOptions/.test(src)) found.push("B:액션");
  if (/yaku\.register|addYakuHolder/.test(src)) found.push("C:커스텀역");
  // 호출부만 센다 — 이름 뒤에 `(`를 요구하지 않으면 **주석에 적힌 이름**까지 표식으로
  // 잡힌다(실제로 그랬다: "withAugPoint에는 남길 것이 없다"는 설명이 표식이 됐다).
  if (
    /\b(?:withAugPoint|withAugNoteFor|addWinPointBonus|addWinPointTransfer|addWinHanBonus)\(/.test(
      src,
    )
  ) {
    found.push("D:정산표기");
  }
  for (const rule of Object.keys(PUBLIC_RULE_TELLS)) {
    if (src.includes(`"${rule}"`)) found.push(`E:${rule}`);
  }
  return found;
}

describe("Charter Rule #2 — 발동이 테이블에서 보인다", () => {
  it("모든 증강이 테이블에서 보이는 표식을 하나는 낸다", () => {
    const silent = ALL_AUGMENTS.filter((a) => tellsOf(a.id).length === 0)
      .map((a) => a.id)
      .filter((id) => !(id in SILENT_ALLOWED));
    expect(silent, "발동이 테이블에서 안 보이는 증강").toEqual([]);
  });

  it("예외 목록이 낡지 않았다 (표식이 생겼거나 증강이 사라진 항목)", () => {
    const ids = new Set(ALL_AUGMENTS.map((a) => a.id));
    const gone = Object.keys(SILENT_ALLOWED).filter((id) => !ids.has(id));
    expect(gone, "카탈로그에 없는 예외 항목").toEqual([]);
    const nowVisible = Object.keys(SILENT_ALLOWED).filter(
      (id) => ids.has(id) && tellsOf(id).length > 0,
    );
    expect(nowVisible, "이제 표식이 있으니 예외에서 뺄 것").toEqual([]);
  });

  it("예외에는 사유가 적혀 있다", () => {
    const empty = Object.entries(SILENT_ALLOWED)
      .filter(([, why]) => why.trim().length < 20)
      .map(([id]) => id);
    expect(empty, "사유가 비었거나 너무 짧은 예외").toEqual([]);
  });

  it("PUBLIC_RULE_TELLS의 규칙이 실제로 쓰이고 있다", () => {
    const used = new Set<string>();
    for (const a of ALL_AUGMENTS) {
      const src = sourceOf(a.id);
      for (const rule of Object.keys(PUBLIC_RULE_TELLS)) {
        if (src.includes(`"${rule}"`)) used.add(rule);
      }
    }
    const dead = Object.keys(PUBLIC_RULE_TELLS).filter((r) => !used.has(r));
    expect(dead, "아무도 안 쓰는 규칙이 목록에 남아 있다").toEqual([]);
  });
});
