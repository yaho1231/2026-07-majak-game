# 출시일 QA — 신규 방문자 첫 실행 경험 (담당: firstrun)

조사 범위: 프로덕션 빌드(`npm run build:client` → `packages/client/dist`)를 포트 3108에서 직접 서빙,
Playwright로 chromium/webkit/firefox 세 브라우저의 완전히 새 컨텍스트(캐시·스토리지 없음)를 대상으로
콜드 로드, 3G 스로틀(chromium은 CDP `Network.emulateNetworkConditions`, webkit/firefox는 CDP 스로틀
불가 — 콘솔·404·헤더만 확인하고 인위적 지연 라우팅은 적용하지 않음), localStorage 손상, 오프라인,
서버 다운, 딥링크, 새로고침/뒤로가기, 탭 백그라운드 복귀를 점검했다.

빌드 검증: `dist/assets/index-*.js`, `index-*.css` 해시가 서버 응답에 그대로 잡히는 것을 curl로 확인함
(정적 서빙 경로 CLIENT_DIST가 이 워크트리의 `packages/client/dist`를 가리키도록 직접 지정해야 했다 —
서버 기본값은 `../client/dist`라 워크트리 루트가 아니면 "client build not found"가 뜬다. 이건 앱 결함이
아니라 이번 조사 환경 설정 문제였다).

## 확정/의심 항목

### [P2] 로그인 전 홈 화면에서 배경음악(BGM) mp3 리소스 404
- 위치: `packages/client/src/sfx.ts:834` (`const BGM_SRC = "/BackgroundBGM.mp3"`), `packages/client/dist/`
  루트에 `BackgroundBGM.mp3` 파일 자체가 없음(`packages/client/public/`에도 없음).
- 증상: 로그인도 안 하고 방에도 들어가지 않은 순수 홈 화면 상태에서 콘솔에
  `Failed to load resource: 404 (Not Found)` — `http://localhost:3108/BackgroundBGM.mp3` 가
  페이지 로드 후 약 224ms 만에 요청된다. 실제 청취자에게 소리 문제는 없지만(재생 자체가 안 되므로),
  개발자 콘솔을 연 사람·에러 모니터링 도구에는 신규 방문자 전원에게서 노이즈가 쌓인다.
- 재현/근거: 격리된 스크립트로 재확인함(원래 통합 테스트 결과 파일이 같은 워크트리에서 동시에 돌던
  다른 QA 라운드 프로세스에 덮어써져, 별도로 `/tmp/qa-launch-firstrun/mine/bgm_check.js`를 만들어
  단독 재현):
  ```
  BGM requests: [ 224 ]
  bodyText: 이능마작 ... 계정 없이 시작 / 튜토리얼 / 바로 한 판 ... 로그인 / 회원가입
  ```
  즉 화면은 명백히 홈(로비) 상태인데 BGM 요청이 나간다.
  코드상 `packages/client/src/App.tsx:3706` 의 `bgmShouldPlay = view !== null && rankings === null &&
  (joined !== null || spectating !== null)` 조건과 `bgm.start()` 호출부(`App.tsx:3708`)를 보면 방에
  들어가야만(`joined`/`spectating`) BGM이 시작돼야 하는데, 방문 직후 홈 화면에서 이미 요청이 나가는
  정확한 트리거 경로까지는 이번 조사에서 못 찾았다(리치 BGM 프리로드 `App.tsx:3719` 쪽은 이 URL을
  쓰지 않음을 확인함).
- 판정: **증상은 확정**(재현됨, 스크린샷·요청 로그 있음). **정확한 트리거 원인은 의심** — `joined`/
  `spectating`이 마운트 초기 렌더에서 잠깐이라도 non-null이 되는 경로가 있는지, 혹은 다른 호출부가
  더 있는지는 다음 라운드에서 `bgm.start` 호출 스택을 React DevTools Profiler나 `console.trace`로
  잡아 확인 필요.
- 제안: (a) 실제로 사용 중인 mp3 파일을 `packages/client/public/`에 추가하거나, (b) 홈 화면에서
  BGM이 실제로 필요 없다면 `bgm.start()` 호출 경로에 `console.trace` 브레이크포인트를 걸어 어느
  effect가 초기 렌더에 걸리는지 특정한 뒤 조건을 좁힌다.

### [P2] 히어로 로고 PNG 420KB — 느린 회선에서 수 초간 깨진 이미지 아이콘 노출
- 위치: `packages/client/src/App.tsx:8263` (`<img src="/logo.png" ... width={946} height={870} />`),
  실물 파일 `packages/client/dist/logo.png` = 429,589 bytes(≈420KB, 미최적화 PNG).
- 증상: chromium에서 CDP로 "450Kbps 다운로드 / 400ms 레이턴시" 3G 스로틀을 걸고 첫 방문을 재현하면,
  로그인 폼 등 나머지 UI는 8초 시점에 이미 렌더되어 조작 가능한데 히어로 로고 자리에는 브라우저 기본
  깨진 이미지 아이콘 + alt 텍스트("이능마작 — 증강으로 뒤바뀌는 마작")만 남아 있다. `width`/`height`가
  박혀 있어 레이아웃 밀림(CLS)은 없지만, 첫인상이 되는 로고가 가장 늦게(또는 못) 뜬다.
- 재현/근거: `/tmp/qa-launch-firstrun/shots/chromium_throttled_8000ms.png` (8초 시점 스크린샷, 깨진
  이미지 아이콘 확인). 같은 스로틀 조건에서 500ms 시점 스크린샷(`chromium_throttled_500ms.png`)은
  다크 배경의 로딩 플레이스홀더("불러오는 중…")만 보여 **흰 화면은 아니다** — 이 부분은 문제없음.
  파일 크기는 `ls -la packages/client/dist/logo.png` = 429589 bytes로 직접 확인.
- 판정: 확정.
- 제안: `logo.png`를 WebP로 재인코딩하거나 실제 표시 크기(946×870은 데스크톱 히어로 기준으로도 과함)
  에 맞게 리사이즈해 수십 KB 수준으로 낮춘다. 우선순위가 낮은 장식 이미지이므로
  `fetchpriority="low"` 또는 지연 로드도 고려.

### [P2] 초기 번들이 code-split 안 되어 느린 회선에서 로드가 김
- 위치: `packages/client/vite.config.ts` 관련 빌드 산출물 — `npm run build:client` 로그 자체가 이미
  경고함: `dist/assets/index-CiqZnLzm.js 638.23 kB │ gzip: 228.79 kB`,
  `dist/assets/index-DE2kpOX5.css 251.36 kB │ gzip: 50.87 kB` (별도 `replayRebuild` 청크
  306.76kB/gzip 104.86kB는 리플레이 재생 시에만 필요해 초기 로드엔 안 걸림 — 이 부분은 문제없음).
- 증상: gzip 기준 메인 JS+CSS만 약 280KB. 450Kbps(≈56KB/s) 스로틀에서 전송에만 이론상 5초 안팎이
  걸리고, 실측 스로틀 전체 로드 시간(`page.goto` load 이벤트까지)은 약 6.3~8초로 측정됨. 신규 방문자가
  느린 회선(지방 LTE, 공공 와이파이 등)에 있으면 첫 화면이 뜨기까지 체감상 길다.
- 재현/근거: 빌드 로그의 vite 경고 문구, 그리고 스로틀 스크립트 실행 결과 `throttledLoadTimeMs`
  6334~8026ms(같은 조건 두 차례 실행 모두 6초 이상).
- 판정: 확정(수치는 측정), 다만 "출시 불가" 수준은 아니라고 판단해 P2로 뒀다 — 다크 로딩 플레이스홀더가
  있어 흰 화면 없이 대기하는 모양새는 이미 준수함.
- 제안: `manualChunks`로 vendor(React 등)/앱 코드 분리, 라우트·다이얼로그 단위 `import()` 지연 로드
  검토. `vite.config.ts`에 `build.rollupOptions.output.manualChunks` 추가.

### [P2] 깨진 퍼센트 인코딩 URL 접속 시 완전한 흰 화면 — 404 안내 페이지보다 나쁨
- 위치: `packages/server/src/index.ts:561-566`
  ```ts
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    res.writeHead(400).end();
    return;
  }
  ```
- 증상: 잘못된 퍼센트 인코딩이 섞인 주소(예: `/totally/bogus/%%%path` — 붙여넣기 오류, 일부 인앱
  브라우저의 URL 인코딩 손상 등으로 실제로 발생할 수 있는 형태)로 접속하면 `decodeURIComponent`가
  `URIError`를 던지고, 서버는 **본문이 완전히 빈 HTTP 400**을 돌려준다. 브랜딩도, "이 주소는 없습니다"
  안내도 전혀 없이 브라우저가 순백색 빈 화면만 그린다 — 바로 위 §8-2 주석이 의도적으로 설계한
  "정상적인 404에는 최소한 안내가 있다"(`sendNotFound()`, `없는 주소` 타이틀의 다크 테마 안내 페이지,
  `packages/server/src/index.ts:293-332`)는 규칙에서 이 경로만 빠져 있다.
- 재현/근거: 직접 raw HTTP 요청으로 재현.
  ```
  $ printf 'GET /totally/bogus/%%%%%%path HTTP/1.1\r\nHost: localhost:3108\r\nConnection: close\r\n\r\n' | nc localhost 3108
  HTTP/1.1 400 Bad Request
  Date: Fri, 28 Aug 2026 01:03:50 GMT
  Connection: close
  Transfer-Encoding: chunked

  0
  ```
  Playwright(chromium)로 같은 URL에 `page.goto`한 결과 `status 400`, 페이지 `title`/`body.innerText`
  둘 다 빈 문자열 — 스크린샷 `/tmp/qa-launch-firstrun/shots/chromium_bad_url.png` 완전 흰 화면.
  대조로 `/room/NONEXISTENT123`(정상적으로 없는 경로, 퍼센트 인코딩 문제 없음)는 같은 서버에서
  404 + "그 주소에는 아무것도 없습니다" 안내 페이지가 정상적으로 뜸(`sendNotFound()` 경로 확인).
- 판정: 확정.
- 제안: `packages/server/src/index.ts`의 `decodeURIComponent` catch 블록에서 `res.writeHead(400).end()`
  대신 같은 `sendNotFound(req, res)`(또는 그에 준하는 안내 페이지)를 호출하도록 바꾼다. 404든 400이든
  사용자에게는 "이 주소는 못 엽니다 + 처음 화면으로" 안내가 있어야 한다는 §8-2의 원래 취지를 이
  분기에도 적용.

### [P3/의심] 클라이언트 소스에 `visibilitychange` 리스너가 전혀 없음
- 위치: `packages/client/src/` 전체를 `grep -rn "visibilitychange"` 했을 때 매치 0건(재연결 로직은
  `App.tsx`의 WebSocket `close`/`error` 이벤트 기반 재연결 타이머만 있음, 예:
  `App.tsx:3895-4050` 부근 `reconnectTimerRef`).
- 증상(우려): 탭을 오래 백그라운드에 방치했다가 돌아왔을 때, OS/브라우저가 소켓을 끊는 방식이나
  타이밍에 따라 재연결이 늦게 감지될 가능성이 이론상 있다. 다만 서버가 30초 하트비트로 무응답
  연결을 끊으므로(`packages/server/src/index.ts` 시작 로그: "하트비트 30000ms 주기 — 무응답 연결
  자동 종료"), WS `close` 이벤트가 결국은 발생해 기존 재연결 로직이 커버할 가능성이 높다.
- 재현/근거: Playwright로 `visibilitychange`를 인위적으로 dispatch하고 3초 대기 후 확인했을 때는
  webkit에서 `body` 렌더링이 정상 유지됨을 확인(`backgroundReturnBodyText`가 홈 화면 그대로).
  다만 이건 "탭이 실제로 몇 분~몇십 분간 백그라운드에서 스로틀링된" 상황을 재현한 것이 아니라
  이벤트만 흉내 낸 것이라 **한계가 있다** — 실제 장시간 백그라운드 후 소켓이 끊긴 상태에서 재연결
  배너가 뜨는지까지는 확인하지 못했다.
- 판정: 의심. 코드상 재연결 로직 자체는 존재하고 정상 동작 흔적이 있으나, "탭 장시간 방치"라는
  브리핑의 구체 시나리오는 브라우저 자동화로 정밀 재현이 어려워 못 채웠다.
- 제안: 다음 라운드에서 실제 기기로 앱을 켜 두고 화면을 끄거나 다른 탭으로 30분 이상 전환한 뒤
  돌아와 재연결 배너·게임 상태 복구를 수동으로 확인. 필요하면 `visibilitychange`에서 소켓 상태를
  능동적으로 재점검하는 방어 로직 추가를 검토(현재는 소켓이 알아서 끊어지길 기다리는 수동적 방식).

### [P3] 오프라인 첫 방문(캐시 전무) 시 완전한 흰 화면
- 위치: 재현 화면(브라우저 자체 동작), 앱 코드 문제 아님.
- 증상: 한 번도 방문한 적 없는 상태에서 오프라인으로 접속하면(서비스워커 미등록 상태) 완전히
  빈 흰 화면이 뜬다.
- 재현/근거: `/tmp/qa-launch-firstrun/shots/chromium_offline_first_visit.png` — 완전 흰 화면.
  대조로 한 번 방문(캐시 워밍) 후 오프라인 새로고침은 `webkit_offline_after_cache_warm_reload.png`
  에서 정상적으로 홈 화면 전체가 렌더됨(로고·로그인 폼까지 포함) — **이 경우는 문제없음**.
- 판정: 확정(현상), 그러나 "한 번도 못 받아본 페이지를 오프라인으로 열기"는 서비스워커 유무와
  무관하게 모든 웹사이트에 공통인 브라우저의 근본적 한계라 앱이 고칠 수 있는 영역이 아니다.
  기록만 남김 — 출시 판단에 영향 없음.
- 제안: 없음(구조적으로 불가능). 참고로 `sw.js`는 방문 이후에는 정상적으로 오프라인 폴백을 제공하는
  것으로 보인다(위 캐시 워밍 케이스).

## 확인했고 문제 없었던 것 (다음 라운드 재확인 불필요)

- **소스맵 미노출**: `packages/client/dist/assets/*.map` 파일이 빌드에 생성되지 않으며, 서버도
  `.map` 요청에 404를 반환함(`curl -o /dev/null -w %{http_code} .../index-*.js.map` → 404). 프로덕션
  소스 유출 없음.
- **보안 헤더**: `curl -I`로 확인 — CSP(`default-src 'self'; script-src 'self'; ...`),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`,
  `Referrer-Policy: no-referrer` 전부 응답에 포함됨.
- **손상된 localStorage 복원력**: `majak.*` 키 전부를 깨진 JSON(`{garbage!!! not json`)으로 덮어쓴
  뒤 새로고침해도 흰 화면/크래시 없이 홈 화면이 정상적으로(로그인 폼까지) 다시 렌더됨
  (`corruptedStorageIsBlank: false`, 스크린샷 `*_corrupted_localstorage_reload.png`). `storage.ts`의
  안전 파서가 제 역할을 하는 것으로 보인다.
- **존재하지 않는 방 딥링크**: `/room/NONEXISTENT9999` 류 접속 시 크래시나 빈 화면 대신 "그 주소에는
  아무것도 없습니다 / 방 초대와 리플레이 공유는 주소 뒤에 ?room=·?replay=로 붙습니다 / 처음 화면으로"
  안내 화면이 뜸(firefox 재현 확인).
- **서버 다운(포트 3109, 아무것도 안 띄움) 상태에서 접속**: 브라우저 표준 연결 거부 에러로 처리되며
  앱이 무한 로딩이나 이상 동작 없이 즉시 실패로 끝남(수 ms 내).
- **ErrorBoundary 존재 및 설계**: `packages/client/src/ErrorBoundary.tsx`에 "다시 그리기 / 방에서
  나가기 / 처음부터" 3단계 복구 UI, 반복 실패 감지(`count >= 2`), 오류 내용 클립보드 복사 기능이
  모두 구현돼 있음을 코드로 확인. 다만 렌더 예외를 실제로 강제 유발해 화면이 뜨는 것까지는 이번
  조사에서 직접 트리거하지 못했다(간접 확인만 — 다음 라운드에서 `page.evaluate`로 React 컴포넌트에
  직접 예외를 주입하는 방법을 찾아 동적 검증 권장).
- **로드 중 흰 화면 없음**: 콜드 로드·3G 스로틀 로드 모두 200ms~500ms 구간에서 다크 테마 로고+
  "불러오는 중…" 플레이스홀더가 즉시 뜨며, 손패/흰 패 관련 문제는 애초에 홈 화면 단계에서는
  발생 여지가 없음(#429는 대국 화면 진입 이후의 이슈라 이번 첫 화면 로드 조사 범위 밖 — 인게임
  단계까지 3G 스로틀로 들어가 손패 렌더를 확인하는 것은 이번 라운드에서 다루지 못했다. 별도 로그아웃
  범위로 남긴다).
- **정적 자산 해시 일치**: 서버 응답의 `index-*.js`/`index-*.css` 파일명이 방금 빌드한
  `packages/client/dist/assets/`의 실제 파일명과 일치 — 프로덕션 빌드가 제대로 서빙되고 있음을 확인.

## 조사하지 못한 것 (범위 밖/한계, 다음 라운드 후보)

- 인게임 진입 후 3G 스로틀 하에서 손패 타일이 흰 패로 뜨는지(#429 재발 여부) — 홈 화면만 조사했고
  실제 대국 진입까지는 이번 라운드 범위에 못 넣었다.
- ErrorBoundary의 동적(실제 렌더 예외) 트리거 검증.
- 탭 장시간(수십 분) 백그라운드 방치 후 실제 소켓 끊김·재연결 복구 — 자동화로 정밀 재현 어려움.
- webkit/firefox의 네트워크 스로틀링(CDP가 chromium 전용이라 두 브라우저는 콘솔·헤더·기능만 확인,
  인위적 지연 라우팅은 적용하지 않음).

## 요약 표 (확정 항목만, 심각도순)

| 심각도 | 제목 | 위치 |
|---|---|---|
| P2 | 깨진 퍼센트 인코딩 URL → 완전한 흰 화면(빈 400) | `packages/server/src/index.ts:561-566` |
| P2 | 홈 화면 진입 직후 BGM mp3 404 | `packages/client/src/sfx.ts:834` |
| P2 | 히어로 로고 PNG 420KB — 느린 회선에서 깨진 이미지로 노출 | `packages/client/src/App.tsx:8263`, `dist/logo.png` |
| P2 | 초기 JS+CSS 번들 code-split 없음 — 3G에서 로드 6~8초 | `packages/client` 빌드 산출물 |
| P3 | 오프라인 첫 방문 시 흰 화면(구조적 한계, 조치 불가) | 기록만 |

의심(P3, 다음 라운드 검증 필요): `visibilitychange` 미사용 — 장시간 백그라운드 후 재연결 실측 필요.
