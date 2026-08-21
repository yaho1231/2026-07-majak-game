/**
 * `styles.css` 문법 가드 — **빌드가 깨지는 것을 테스트가 잡게 한다.**
 *
 * 2026-08-22, 흔들림 CSS 를 지우면서 `@keyframes shake-4` 를 닫던 `}` 하나가 최상위에
 * 남았다. 결과:
 *  - `vite build` 가 `Invalid empty selector` 로 **실패**했다 → 배포 경로가 통째로 막힌다.
 *  - dev 서버는 minify 를 안 타서 통과했고, `npm test` 도 타입체크도 CSS 를 안 본다.
 *    **그래서 아무 검사에도 안 걸렸다.**
 *  - 브라우저는 최상위 `}` 를 다음 규칙의 셀렉터 시작으로 먹는다 → 그 다음 규칙이
 *    통째로 죽는다(당시 판 위 다섯 단추 `.icon-btn` 이 맨몸으로 겹쳐 보였다).
 *
 * 이 저장소의 게이트는 `npm test` + 타입체크뿐이라(CLAUDE.md), CSS 문법은 여기서 지킨다.
 * 대량 치환을 할 일이 계속 생기는 파일이라 가드가 값을 한다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** 주석과 문자열을 걷어낸 CSS — 그 안의 중괄호는 문법이 아니다 */
function stripped(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

describe("styles.css 문법", () => {
  it("중괄호가 짝이 맞고, 최상위에 고아 `}` 가 없다", () => {
    const src = stripped(CSS);
    let depth = 0;
    let line = 1;
    const orphans: number[] = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === "\n") line++;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth < 0) {
          orphans.push(line);
          depth = 0; // 이어서 세어 뒤쪽 고아도 함께 찾는다
        }
      }
    }
    expect(orphans, `고아 '}' (주석 제외한 줄 번호 근사): ${orphans.join(", ")}`).toEqual([]);
    expect(depth, "닫히지 않은 '{' 가 남았다").toBe(0);
  });

  it("빈 셀렉터를 만들 수 있는 `}` 연속이 없다", () => {
    // `}` 바로 뒤에 `{` 가 오면 셀렉터가 비어 있다는 뜻이다 (lightningcss 가 거부한다)
    const src = stripped(CSS).replace(/\s+/g, " ");
    expect(src).not.toMatch(/\}\s*\{/);
  });

  it("모션 토큰이 전부 리터럴이다 (순환 참조 금지)", () => {
    for (const name of ["ease", "ease-quart", "ease-in", "ease-pop"]) {
      const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS);
      expect(m, `--${name} 정의가 있어야 한다`).not.toBeNull();
      const value = m?.[1]?.trim() ?? "";
      expect(value, `--${name} 가 자기 자신을 참조한다`).not.toContain(`var(--${name})`);
      expect(value).toMatch(/^cubic-bezier\(/);
    }
  });

  it("transition·animation 에 브라우저 기본 `ease` 를 쓰지 않는다", () => {
    // `ease` 는 아무도 고르지 않은 곡선이다 — 토큰이 있는데 안 쓰는 상태로 돌아가지 않게 한다.
    const decls = stripped(CSS).match(/(?:transition|animation):[^;}]*/g) ?? [];
    const plain = decls.filter((d) => /(?<![-\w])ease(?![-\w])/.test(d));
    expect(plain, `기본 ease 를 쓰는 선언: ${plain.slice(0, 5).join(" | ")}`).toEqual([]);
  });
});
