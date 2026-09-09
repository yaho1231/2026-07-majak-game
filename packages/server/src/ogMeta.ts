/**
 * ogMeta.ts — 초대 링크로 들어온 요청에만 공유 카드 메타를 갈아 끼운다.
 *
 * `index.html` 은 빌드 산출물이라 방 코드를 알 수 없다. 그런데 크롤러(카톡·디스코드·
 * 슬랙)는 자바스크립트를 돌리지 않으므로, 클라이언트가 나중에 `<meta>` 를 고쳐 봐야
 * 카드에는 반영되지 않는다. 그래서 **서버가 내주는 순간** 문자열을 갈아 준다.
 *
 * 갈아 끼우는 것은 셋뿐이다.
 *
 *   · og:image / twitter:image → `/og/room/<코드>.png` (그 자리에서 그리는 카드)
 *   · og:image:alt            → 그림에 실제로 적힌 것
 *   · og:url                  → `?room=<코드>` 를 붙인 주소
 *
 * og:url 을 같이 바꾸는 게 중요하다 — 카톡은 og:url 로 카드를 캐시한다. 그대로 두면
 * 먼저 공유된 방의 코드가 다른 방 링크에도 그려진다.
 *
 * canonical 은 **건드리지 않는다**. 초대 주소가 따로 색인될 이유가 없다.
 *
 * 이 함수는 못 찾은 자리는 조용히 넘어간다. 메타 한 줄이 안 바뀌는 것보다 페이지가
 * 안 뜨는 게 훨씬 나쁘다 — 대신 실제 index.html 로 세 자리가 모두 바뀌는지는
 * 테스트가 지킨다.
 */

/** 그 자리에서 그리는 카드의 경로 */
export function ogCardPath(code: string): string {
  return `/og/room/${code}.png`;
}

export function injectInviteMeta(html: string, code: string): string {
  return (
    html
      // 정적 카드(`/og.png?v=2`)가 박힌 자리를 전부 코드 카드로 돌린다.
      .replace(/\/og\.png(\?[^"']*)?/g, ogCardPath(code))
      .replace(
        /(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/,
        `$1이능마작 초대 카드 (방 코드 ${code})$2`,
      )
      .replace(/(<meta\s+property="og:url"\s+content="[^"?#]*)(")/, `$1?room=${code}$2`)
  );
}
