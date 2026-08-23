/**
 * 가드 ④ — 설명이 말하는 수치가 코드에 실재하는가.
 *
 * `ae87e47`에서 고친 "설명 ↔ 코드 불일치" 6건은 전부 같은 모양이었다 —
 * **글이 약속한 수치·한도를 코드가 안 지킨다.** 그리고 같은 커밋에서 발견된 "숨은 한도"
 * 16건은 그 거울상이다 — **코드에는 한도가 있는데 글에 없다.**
 *
 * 완전한 검사기는 만들 수 없다(설명은 자연어이고 코드는 파생값을 쓴다). 그래서 실용적인
 * 두 겹만 세운다.
 *
 * ## ① 숫자 실재 검사 — 넓고 얕다
 *
 * 플레이어에게 보이는 글(`description` + `detail`)의 숫자를 전부 뽑아, **그 증강 모듈
 * 어딘가에 같은 숫자가 있는지** 본다. 카탈로그 326개 숫자 중 3개만 걸린다(전부 허용 목록).
 *
 * 잡는 것: 코드 어디에도 근거가 없는 수치. 삭제된 한도, 붙여 넣다 만 숫자.
 * **못 잡는 것(측정값)**: 통과한 323개 중 **72%는 ±1로 틀려도 그대로 통과한다** —
 * 모듈 안에 이웃 숫자가 이미 있기 때문이다. 즉 이 검사는 "값이 맞는가"가 아니라
 * "근거가 있기는 한가"를 본다. 주석까지 포함해 스캔하는 것도 의도된 것이다(주석의
 * 숫자를 빼면 예시·랭크 표기 때문에 157개가 거짓 양성으로 터진다 — 실측).
 *
 * ## ② 한도 표기 검사 — 좁고 깊다
 *
 * 설명 첫머리 괄호는 이 저장소의 관례로 **사용 한도**를 적는 자리다("(2국에 1회)",
 * "(게임 내 5회)", "(동풍전 1회 · 반장전 2회)"). 여기만은 코드와 정확히 맞춘다 —
 * 주석·문자열을 걷어낸 **실행되는 코드**에서 그 숫자와 해당 배관을 찾는다.
 * 숨은 한도가 실제로 숨었던 자리가 여기다.
 */

import { describe, expect, it } from "vitest";
import { ALL_AUGMENTS, playerFacingText, sourceOf } from "./catalogSource.js";

/**
 * ① 검사에서 빼는 숫자 — 모듈에 그대로 있을 수 없는 **파생값·산문**.
 * 새로 추가할 때는 왜 코드에 없는지를 함께 적는다.
 */
const DERIVED_NUMBERS: Readonly<Record<string, readonly [number, string][]>> = {
  // devils_advance 9000·karma 12000은 예전에 여기 있었다. 자릿점을 지우고 나서
  // (`flattenCommas`) 같은 파일 안에서 근거가 잡혀 아래 "낡지 않았다" 검사가
  // 뺄 것을 요구했다 — 2026-08-22 QA round2 확정 13④의 부수 효과다.
  karma: [[3200, "12000에서 사라지는 몫 — 설명 안의 예시 계산"]],
};

/** 주석·문자열 리터럴을 걷어낸 "실행되는 코드" */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * 자릿점을 지운다 — 글은 `45,000점`, 코드는 `45000`이라 그대로 두면 서로를 못 찾는다.
 * 그룹이 여럿이어도(1,112,345,678,999) 다 붙을 때까지 돌린다.
 * (2026-08-22 QA round2 확정 13④로 4자리 이상을 전부 콤마 표기로 통일하면서 추가.)
 */
function flattenCommas(text: string): string {
  let out = text;
  for (;;) {
    const next = out.replace(/(\d),(\d{3})/g, "$1$2");
    if (next === out) return out;
    out = next;
  }
}

/** 글에서 숫자를 뽑는다 (10,000 같은 자릿점은 붙여 읽는다) */
function numbersIn(text: string): string[] {
  return [...new Set(flattenCommas(text).match(/\d+(?:\.\d+)?/g) ?? [])];
}

/** 그 숫자가 **딱 그 숫자로** 나오는가 (12가 1·2에 걸리지 않게) */
function hasNumber(src: string, n: string): boolean {
  return new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d.])`).test(
    flattenCommas(src),
  );
}

describe("설명 ↔ 구현 수치 대조 ① 숫자 실재", () => {
  it("설명이 말하는 숫자는 그 증강 모듈 안에 근거가 있다", () => {
    const offenders: string[] = [];
    for (const def of ALL_AUGMENTS) {
      const src = sourceOf(def.id);
      const allowed = new Set(
        (DERIVED_NUMBERS[def.id] ?? []).map(([n]) => String(n)),
      );
      const missing = numbersIn(playerFacingText(def)).filter(
        (n) => !allowed.has(n) && !hasNumber(src, n),
      );
      if (missing.length > 0) offenders.push(`${def.id}: ${missing.join(", ")}`);
    }
    expect(offenders, "코드에 근거가 없는 설명 수치").toEqual([]);
  });

  it("허용 목록이 낡지 않았다 (이제 코드에 있는 숫자는 뺀다)", () => {
    const stale: string[] = [];
    for (const [id, pairs] of Object.entries(DERIVED_NUMBERS)) {
      const src = sourceOf(id);
      for (const [n] of pairs) {
        if (hasNumber(src, String(n))) stale.push(`${id}:${n}`);
      }
    }
    expect(stale, "코드에 생겼으니 허용 목록에서 뺄 것").toEqual([]);
  });
});

/**
 * ② 한도 표기 — 설명 첫머리 괄호와 코드가 맞는가.
 *
 * `devils_advance`의 "게임 내 1회"는 숫자가 아니라 **한 번 쓰면 굳는 플래그**로 구현돼
 * 있어 코드에 `1`이 없다. 배관이 다른 것이지 한도가 없는 게 아니다.
 * (`hidden_river`는 2026-08-15부터 matchUses 쪽으로 옮겨 갔다.)
 */
const ONE_SHOT_FLAG = new Set(["devils_advance"]);

describe("설명 ↔ 구현 수치 대조 ② 한도 표기", () => {
  it("'N국에 1회'는 쿨다운 배관과 같은 N을 쓴다", () => {
    const offenders: string[] = [];
    for (const def of ALL_AUGMENTS) {
      const head = /^\(([^)]*)\)/.exec(def.description)?.[1];
      const m = head === undefined ? null : /(\d+)국에 1회/.exec(head);
      if (m === null) continue;
      const code = codeOnly(sourceOf(def.id));
      if (!/cooldownReady|cooldownUse|COOLDOWN_ROUNDS/.test(code)) {
        offenders.push(`${def.id}: 쿨다운 배관 없음`);
      } else if (!hasNumber(code, m[1] as string)) {
        offenders.push(`${def.id}: 설명은 ${m[1]}국인데 코드에 그 값이 없다`);
      }
    }
    expect(offenders, "쿨다운 표기가 코드와 안 맞는 증강").toEqual([]);
  });

  it("'게임 내 N회'의 N이 코드에 있다", () => {
    const offenders: string[] = [];
    for (const def of ALL_AUGMENTS) {
      const head = /^\(([^)]*)\)/.exec(def.description)?.[1];
      const m = head === undefined ? null : /게임 내 (\d+)회/.exec(head);
      if (m === null || ONE_SHOT_FLAG.has(def.id)) continue;
      if (!hasNumber(codeOnly(sourceOf(def.id)), m[1] as string)) {
        offenders.push(`${def.id}: 설명은 ${m[1]}회인데 코드에 그 값이 없다`);
      }
    }
    expect(offenders, "게임 내 횟수가 코드와 안 맞는 증강").toEqual([]);
  });

  it("'동풍전 N회 · 반장전 M회'는 matchUses·scaledUses에서 나온다", () => {
    // 숫자를 손으로 박으면 모드 정의가 바뀔 때 한쪽만 남는다 — util의 두 함수가 단일 진실.
    const offenders = ALL_AUGMENTS.filter((def) =>
      /^\([^)]*동풍전 \d+회 · 반장전 \d+회/.test(def.description),
    )
      .filter((def) => !/matchUses|scaledUses/.test(codeOnly(sourceOf(def.id))))
      .map((def) => def.id);
    expect(offenders, "매치 예산 헬퍼를 안 쓰고 모드별 횟수를 적은 증강").toEqual([]);
  });

  /*
   * 반장전 몫은 **동풍전의 1.5배(올림)** 다 (2026-08-23 사용자 지시).
   * 매치 예산은 원래 전부 동풍전(4국) 기준이라, 국이 두 배 도는 반장전에서 같은 카드가
   * 국당 절반 값이었다. 새 증강이 임의의 조합(3·4처럼)을 적는 것을 여기서 막는다.
   */
  it("두 모드의 횟수는 1.5배(올림) 관계다", () => {
    const offenders: string[] = [];
    for (const def of ALL_AUGMENTS) {
      for (const m of `${def.description}\n${def.detail ?? ""}`.matchAll(
        /동풍전 (\d+)회 · 반장전 (\d+)회/g,
      )) {
        const tonpuu = Number(m[1]);
        const hanchan = Number(m[2]);
        if (hanchan !== Math.ceil(tonpuu * 1.5)) {
          offenders.push(`${def.id}: 동풍전 ${tonpuu} → 반장전 ${hanchan}`);
        }
      }
    }
    expect(offenders, "1.5배(올림)가 아닌 모드별 횟수").toEqual([]);
  });
});
