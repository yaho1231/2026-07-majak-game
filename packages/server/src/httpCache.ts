/**
 * 정적 파일 캐시 정책 (감사 2026-08-17 §7-11).
 *
 * 진입점(index.ts)에서 갈라 낸 이유는 **테스트 때문**이다 — index.ts 를 import 하면
 * DB·통계 저장소·서버가 통째로 뜬다. 이 판단은 경로 문자열 하나만 보는 순수 함수라
 * 그 비용을 치를 이유가 없고, 서비스워커(client/public/sw.js)와 **같은 말을 하는지**
 * 확인하는 가드가 이걸 직접 부른다.
 */

/**
 * 해시가 붙지 않은 정적 파일을 **재검증만 하고 재다운로드는 안 하게** 만든다
 * (감사 2026-08-17 §7-11).
 *
 * 예전에는 `/assets/`(빌드 해시 있음)만 1년 immutable이고 나머지는 전부
 * `no-cache`였다. 그런데 나머지에 **타일 PNG 37장과 효과음**이 들어 있다 —
 * 매 방문마다 조건부 요청 37개가 나갔고, 모바일 회선에서는 그 왕복이 곧
 * 첫 화면 지연이다.
 *
 * 셋으로 가른다.
 *
 * | 무엇 | 정책 | 왜 |
 * |---|---|---|
 * | `/assets/` | 1년 immutable | 파일 이름에 내용 해시가 있다. 바뀌면 이름이 바뀐다 |
 * | 타일·효과음·아이콘 | 1일 + `stale-while-revalidate` | 이름이 고정이라 immutable은 못 쓴다. 바뀌어도 하루면 퍼지고, 그 사이에도 화면은 뜬다 |
 * | 나머지(html·manifest·robots) | `no-cache` | 배포 즉시 바뀌어야 하는 것들 |
 *
 * ⚠ **immutable을 주면 안 된다.** 이 파일들은 이름이 고정이라, 한 번 잘못 준
 * 1년짜리 캐시는 그 브라우저에서 되돌릴 방법이 없다. 실제로 이 저장소는
 * `public/` 손수 작성 파일이 Cloudflare 캐시에 4시간 갇히는 문제를 이미 겪었다.
 */
const LONG_CACHE_DIRS = ["/tiles/", "/sfx/", "/icons/", "/brand/"] as const;
export function cacheControlFor(filePath: string): string {
  if (filePath.includes("/assets/")) return "public, max-age=31536000, immutable";
  if (LONG_CACHE_DIRS.some((d) => filePath.includes(d))) {
    // 하루가 지나면 백그라운드에서 다시 받아 오되, 그동안 화면은 옛것으로 즉시 뜬다.
    return "public, max-age=86400, stale-while-revalidate=604800";
  }
  return "no-cache";
}
