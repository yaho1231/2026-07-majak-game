/**
 * 지금 서빙하는 클라이언트 빌드의 이름표 — index.html 이 부르는 진입 번들 파일명.
 *
 * **왜 필요한가** (2026-09-24): 배포(`serve.sh restart`)로 서버가 갈리면 열려 있던 탭은
 * **새로고침 없이** 자동 재접속해 새 서버에 붙는다. 서버는 새 증강(`yggdrasil_call` 등)을
 * 보내는데 탭은 옛 번들이라 그 액션의 한글 이름을 몰라 **내부 id 가 버튼에 그대로**
 * 찍혔다. 서버가 이 값을 `serverInfo.clientBuild` 로 알려 주고, 클라이언트는 자기
 * 번들과 다르면 새로고침한다.
 *
 * vite 는 진입 번들 이름에 내용 해시를 붙인다(`/assets/index-DBQqZbdu.js`) — 코드가
 * 바뀌면 이름도 바뀐다. 파일명만 쓰는 이유: 클라이언트가 같은 값을 자기 `<script>`
 * 태그에서 그대로 읽어 비교한다(`packages/client/src/buildId.ts`).
 */
export function clientBuildOf(indexHtml: string): string | null {
  for (const tag of indexHtml.match(/<script\b[^>]*>/g) ?? []) {
    if (!/\btype="module"/.test(tag)) continue;
    const src = /\bsrc="([^"]+)"/.exec(tag)?.[1];
    if (src === undefined || !src.endsWith(".js")) continue;
    const name = src.slice(src.lastIndexOf("/") + 1);
    if (name !== "") return name;
  }
  return null;
}
