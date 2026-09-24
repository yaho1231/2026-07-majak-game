/**
 * 이 탭이 들고 있는 번들과 서버가 지금 서빙하는 번들이 같은가.
 *
 * 배포로 서버가 갈리면 열린 탭은 새로고침 없이 재접속한다. 옛 번들은 새 증강의 액션
 * 이름표(`ACTION_LABEL`)를 몰라 `yggdrasil_call` 같은 내부 id 를 버튼에 찍었다
 * (2026-09-24). 서버가 `serverInfo.clientBuild` 로 진입 번들 파일명을 알려 주면, 같은
 * 값을 이 탭의 `<script type="module">` 에서 읽어 비교한다
 * (서버 쪽: `packages/server/src/clientBuild.ts`).
 */

/** 이 탭의 진입 번들 파일명. vite dev(해시 없는 소스 직행)면 null — 비교하지 않는다. */
export function ownClientBuild(doc: Pick<Document, "querySelectorAll"> = document): string | null {
  if (import.meta.env.DEV) return null;
  for (const el of Array.from(doc.querySelectorAll('script[type="module"][src]'))) {
    const src = el.getAttribute("src") ?? "";
    if (!src.endsWith(".js")) continue;
    const name = src.slice(src.lastIndexOf("/") + 1);
    if (name !== "") return name;
  }
  return null;
}

/** 둘 다 알 때만, 다르면 낡은 탭이다. 한쪽이라도 모르면(개발·테스트 서버) 건드리지 않는다. */
export function isStaleClientBuild(own: string | null, served: string | undefined): boolean {
  return own !== null && served !== undefined && own !== served;
}

/**
 * 같은 서버 빌드로 두 번 새로고침하지 않게 하는 표식 — 캐시 탓에 새로고침해도 옛 번들이
 * 다시 뜨면 무한 새로고침이 된다. 한 번 해 봤는데 그대로면 띠만 남긴다.
 *
 * **탭마다** 따로 둔다(sessionStorage). localStorage 면 먼저 새로고침한 다른 탭의 표식을
 * 보고 이 탭이 새로고침을 건너뛴다. 저장소가 막혀 있으면(사생활 모드 등) 표식 없이
 * 새로고침한다 — 새로 뜬 번들은 서버와 같으므로 보통은 거기서 끝난다.
 */
const STALE_RELOAD_KEY = "majak.staleReloadFor";

export function staleReloadTried(served: string): boolean {
  try {
    return window.sessionStorage.getItem(STALE_RELOAD_KEY) === served;
  } catch {
    return false;
  }
}

export function markStaleReload(served: string): void {
  try {
    window.sessionStorage.setItem(STALE_RELOAD_KEY, served);
  } catch {
    /* 표식 없이 새로고침한다 */
  }
}
