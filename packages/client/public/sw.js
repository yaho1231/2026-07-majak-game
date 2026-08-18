/*
 * 서비스워커 (감사 2026-08-17 §8-4).
 *
 * # 무엇을 위해 있는가
 *
 * 안드로이드의 "앱 설치" 배너는 매니페스트만으로는 뜨지 않는다 — fetch 핸들러를
 * 가진 서비스워커가 있어야 설치 가능으로 판정한다. 설치하면 주소창이 사라지는데,
 * 그 몇십 픽셀이 이 게임에서는 판의 세로 폭 그 자체다(고정 배치라 화면이 좁아지면
 * 손패가 먼저 줄어든다).
 *
 * # 무엇을 캐시하지 **않는가** — 이쪽이 더 중요하다
 *
 * 이 앱은 **실시간 WebSocket 게임**이다. 오프라인에서 할 수 있는 일이 하나도 없고,
 * 낡은 자산을 들고 서 있으면 그건 도움이 아니라 거짓말이다. 그래서:
 *
 * - **`/` 문서를 캐시에서 먼저 주지 않는다.** 네트워크 우선이다. 캐시 우선으로
 *   두면 배포 직후에도 옛 화면이 뜨고, 그 화면이 새 서버 프로토콜로 말을 건다.
 * - **WebSocket·API는 손대지 않는다.** `fetch` 핸들러는 GET만 본다.
 * - **캐시하는 것은 "내용이 바뀌면 이름이 바뀌는 것"뿐이다** — 빌드 해시가 붙은
 *   `/assets/`와 패 그림 같은 정적 에셋. 이름이 고정인 파일(`index.html` ·
 *   `manifest.webmanifest` · `robots.txt`)은 넣지 않는다.
 * - 오프라인 폴백 화면을 만들지 않았다. 서버에 못 붙으면 이 앱은 아무것도 아니고,
 *   그 사실을 브라우저의 기본 오류 화면이 이미 정확히 말한다.
 *
 * # 갱신
 *
 * `CACHE`의 이름을 바꾸면 옛 캐시가 통째로 버려진다. 자산 이름에 해시가 붙어 있어
 * 평소에는 손댈 일이 없다 — 캐시 전략 자체를 바꿀 때만 올린다.
 */

const CACHE = "majak-static-v1";

/** 이 접두사로 시작하는 경로만 캐시한다 (내용이 바뀌면 이름이 바뀌는 것들). */
const CACHEABLE = ["/assets/", "/tiles/", "/sfx/", "/icons/"];

self.addEventListener("install", (event) => {
  // 미리 받아 두는 것이 없다 — 첫 방문에서 실제로 쓴 것만 담는다.
  // 프리캐시 목록은 빌드 산출물 이름과 함께 낡고, 낡으면 install이 통째로 실패한다.
  self.skipWaiting();
  void event;
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 이름이 다른 옛 캐시는 버린다.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // 다른 오리진(CDN·외부 이미지)은 손대지 않는다 — 이 앱에는 그런 요청이 없지만,
  // 나중에 생겼을 때 서비스워커가 조용히 끼어들지 않게 한다.
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE.some((p) => url.pathname.startsWith(p))) return;

  /*
   * stale-while-revalidate — 캐시가 있으면 즉시 주고, 그동안 뒤에서 새로 받는다.
   *
   * 이 파일들은 이름이 바뀌면 내용이 바뀌므로(해시 자산) 낡은 것을 주는 위험이
   * 없고, 이름이 고정인 패 그림은 바뀌는 일이 사실상 없다. 서버도 같은 정책을
   * 헤더로 말하고 있다(`cacheControlFor`).
   */
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const fetching = fetch(req)
        .then((res) => {
          // 부분 응답(206)·오류는 담지 않는다 — 담으면 다음 방문이 깨진 파일을 받는다.
          if (res.ok && res.status === 200) void cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? fetching;
    })(),
  );
});
