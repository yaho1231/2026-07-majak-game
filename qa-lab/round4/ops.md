# QA 4라운드 — ops (운영·성능·남용·권한)

관점: **공개 첫날 사람이 몰렸을 때, 그리고 악의적인 사람이 왔을 때.**
범위: `packages/server/src` 전체, `deploy/*.sh`, `scripts/*.sh`.
제외: SECURITY.md·docs/26·29 에 이미 "구현된 방어"로 적힌 것(오리진·토큰버킷·연결 상한·
scrypt 큐·세션·가입/관리자 코드·경로 탈출·백프레셔 등)은 재검증만 하고 보고하지 않는다.

**먼저 결론**: WS(게임) 쪽 남용 방어는 실제로 촘촘하다 — 인증·방생성·비싼 조회·정형구·제보·
친구·게스트 방까지 전부 창(window)이 걸려 있고, 관리자 라우트 24종은 하나도 빠짐없이
`if (!user.isAdmin) return FORBIDDEN` 을 지난다(아래 §권한 전수 참고). 구멍은 **HTTP 쪽**이다:
HTTP 요청에는 IP 레이트리밋이 한 줄도 없고, 그 위에 **한 요청당 100ms 가까이 이벤트 루프를
잡아먹는 라우트**가 인증 없이 열려 있다.

---

### [P0] 초대 카드(`/og/room/<코드>.png`) 한 방에 서버 전체가 멎는다 — 인증 없음·레이트리밋 없음·한 장에 85ms 동기 CPU
- 위치: `packages/server/src/index.ts:430-447` (라우트), `packages/server/src/ogCard.ts:200-212` (캐시), `ogCard.ts:186` (`deflateSync(raw, { level: 9 })`)
- 증상: 아무나(로그인·계정·Origin 불필요) `GET /og/room/AAAAAA.png` 를 코드만 바꿔 가며 부르면
  **진행 중인 모든 대국이 함께 멎는다.** 봇 판단·타이머·뷰 브로드캐스트가 전부 같은 이벤트
  루프에 있어서, 이 라우트가 루프를 잡고 있는 동안 판이 한 칸도 못 움직인다. 사람 쪽에서는
  "화면이 몇 초씩 얼었다가 훅 밀린다"로 보이고, 심하면 하트비트·조작이 밀려 끊긴다.
- 재현/근거: 실제 서버를 띄우고(`PORT=3099`) 측정했다.
  - 카드 1장 생성 비용(모듈 직접 호출, 매번 새 코드 = 캐시 미스): **평균 64.7 ms/장**
    (JIT 워밍 전 200장 연속은 115 ms/장).
  - HTTP 실측(순차 클라이언트 1개, 무작위 코드 30장): `30 og cards in 2.6s (85 ms each)`.
  - 같은 동안 `/healthz` 지연: 평시 18.8 ms → 평균 37 ms.
  - **동시 8연결로 6초 flood**: `healthz during 8-way flood: max 915 ms avg 702 ms`
    → 노트북 한 대, 연결 8개로 이벤트 루프를 0.7~0.9초 단위로 굳힌다.
  - 방어가 하나도 안 걸린다: 라우트는 `req.method` 검사 직후, **healthz·정적파일보다 앞**에
    있고 `clientIpOf`/레이트리밋을 부르지 않는다. WS의 `connRateLimited`는 upgrade 경로
    전용이라 HTTP에는 닿지 않는다. HTTP 계층에 있는 제한은 `maxConnections = 512`·
    타임아웃뿐이다(`index.ts:495-503`).
  - 캐시(`CACHE_LIMIT = 256`, FIFO)는 도움이 안 된다 — 코드 공간이 32^6 이라 **매 요청이 미스**다.
    코드 존재 검사를 일부러 안 하는 것(주석 참고)도 여기서는 공격자 편이다.
  - Cloudflare 앞단도 못 막는다: URL 이 매번 달라 전부 캐시 MISS → 오리진 직행.
- 판정: **확정** (실측 재현)
- 제안: 두 가지를 같이.
  1. **압축 레벨을 낮춘다.** `deflateSync(raw, { level: 9 })` → `level: 1`.
     실측: **35 ms → 2.3 ms/장 (약 15~30배)**, 파일은 4.8KB → 9.8KB(공유 카드 크기로 무의미).
     이것만으로 공격 비용이 한 자릿수 ms로 떨어진다.
  2. **HTTP에도 IP 레이트리밋을 건다.** 이미 있는 `connRateLimited`/`abuseKeyOf` 를
     `/og/room/*` (그리고 문서 요청)에 재사용해 버킷당 초당 몇 건으로 접는다.
     크롤러의 정상 사용은 링크 하나당 1~수 회다.
  선택지로 카드 크기를 줄이는 것(1200×630 → 600×315)도 픽셀 수를 4분의 1로 줄인다.

### [P1] HTTP 요청에는 IP 레이트리밋이 전혀 없다 — OG 카드 말고도 문이 남는다
- 위치: `packages/server/src/index.ts:411-490` (핸들러 전체), `index.ts:686-709`(`connRateLimited` — upgrade 전용)
- 증상: WS 쪽은 연결 수립 속도(40/10초)·연결당 토큰버킷(80, 40/s)·인증/방생성/비싼 조회 창이
  전부 있는데, **HTTP 요청 수 자체를 세는 곳이 없다.** 그래서 정적 파일·문서·OG 카드 어느
  것이든 초당 수천 번을 그냥 받는다(소켓 512개 상한 안에서 keep-alive 로 무한 재사용 가능).
  문서 요청 하나마다 `existsSync` + `statSync` ×2 + `realpathSync` + gzip 스트림이 돌고,
  `?room=` 이 붙으면 **요청마다 `gzipSync` 로 index.html 전체를 다시 압축**한다(`index.ts:602-604`).
- 재현/근거: 위 flood 실험에서 OG 라우트가 극단적 사례일 뿐, 같은 경로에 어떤 제한도 없음을
  코드로 확인. `clientIpOf(req)` 는 `/healthz` 판정과 방문 집계에만 쓰이고 제한에는 안 쓰인다.
- 판정: **확정** (코드 인용)
- 제안: 핸들러 맨 앞에 버킷 하나(`abuseKeyOf(clientIpOf(req).ip)`) — 정적 자산은 넉넉히,
  `/og/room/*`·`?room=` 문서는 빡빡하게. 429 로 답하고 로그는 접어서 남긴다.

### [P2] 방문자 집계 `seen` 집합이 하루 동안 무한히 자란다 (UA 만 바꿔도 새 항목)
- 위치: `packages/server/src/analytics.ts:66-69`, `analytics.ts:128-147` (`noteView`)
- 증상: 문서 요청마다 `sha256(salt+IP+UA).slice(0,16)` 을 `this.seen` 에 넣는데 **상한이 없다.**
  날짜가 바뀔 때만 통째로 버린다(`bucket()`). UA 헤더를 매번 바꾸면(또는 IP 가 다양하면)
  요청 하나당 항목 하나가 영구히(그날 하루) 쌓인다. 16자 문자열 + Set 오버헤드를 대략
  100B 로 잡으면 요청 1,000만 건이면 ~1GB — HTTP 레이트리밋이 없으니(위 P1) 도달 가능한 수다.
  터지면 게임 서버 전체가 함께 죽는다.
- 재현/근거: 코드 인용 — `if (!this.seen.has(key)) { this.seen.add(key); day.visitors += 1; }`
  외에 어떤 크기 검사도 없다. 같은 파일의 `days` 맵은 `KEEP_DAYS`로 잘라 두었는데 `seen`만 빠졌다.
- 판정: **확정** (코드 인용 — 실제 1GB 도달은 P1 이 고쳐지면 어려워진다)
- 제안: `if (this.seen.size < 200_000)` 같은 상한을 두고 넘으면 그 뒤로는 `views`만 센다
  (방문자 수는 어차피 "하한"이라고 문서에 적혀 있다). 또는 HyperLogLog 류로 상수 메모리.

### [P2] 서버 로그는 **시작할 때만** 회전한다 — 오래 켜 두면 상한이 없다
- 위치: `scripts/majak.sh:35-46` (`rotate_log`), `majak.sh:76` (start 에서만 호출)
- 증상: `rotate_log` 는 `start()` 안에서 한 번 불린다. 서버가 재시작 없이 계속 도는 동안에는
  `.majak/server.log` 가 **10 MiB 상한과 무관하게 계속 커진다.** 지금은 하루 ~1,600줄
  (실측: 8/20 1517, 8/21 1684, 8/22 1547 ≈ 150KB/일)이라 눈에 안 띄지만, 공개 첫날 트래픽이
  100배면 하루 15MB 로 상한을 하루 만에 넘고, 재시작할 때까지 아무도 자르지 않는다.
  디스크가 차면 리플레이 쓰기·DB·백업이 함께 실패한다.
- 재현/근거: `rotate_log` 호출 지점은 `majak.sh` 전체에서 76행 한 곳뿐(`grep`).
  운영 로그 현재 크기 2,033,377 bytes.
- 판정: **확정**
- 제안: 서버가 스스로 자르거나(로그 라이터에 크기 검사), launchd 백업 작업 옆에 하루 한 번
  도는 회전 작업을 붙인다. `.majak/watchdog.log`·`backup.log`·`alerts.log` 도 같은 상태다
  (`scripts/watchdog.sh:37`, `scripts/backup.sh:29` — 어디에도 회전이 없다). 크기는 작지만
  감시자가 폭주하면(플리스트 사고 사례) 여기부터 부풀었다.

### [P3] 리플레이·백업 미러는 1년치가 누적된다 — 증가율만 기록해 둔다
- 위치: `packages/server/src/index.ts:872` (`GAME_RETENTION_DAYS` 기본 365), `scripts/backup.sh:120-127` (미러는 `--delete` 없음, prune 없음)
- 증상: 리플레이 1판 = 평균 **42.8 KB** (실측: 운영 `replays/` 472판 25MB, DB 192KB).
  하루 2,000판이면 86MB/일 → 1년 보존이면 약 31GB. 백업 미러는 원본이 정리돼도 **영원히 남는다**
  (의도된 설계 — 주석에 근거 있음). 지금 디스크 여유 365GB 라 당장 위험은 아니다.
- 재현/근거: `ls -l replays/*.jsonl | awk` → `avg KB 42.8 n 472`, `du -sh replays` → 25M,
  `df -h /` → 365Gi 여유.
- 판정: **확정 (기록용)**
- 제안: 공개 후 1~2주 실제 판수를 보고 `GAME_RETENTION_DAYS` 를 조정. 백업 미러에도
  보존 정책이 필요해지는 시점을 그때 정한다.

---

## 확인했고 문제 없었던 것 (없으면 없다고 쓴다)

- **관리자 라우트 전수 (24개)**: `adminUsers·adminAugmentTiers·adminAnalytics·adminDeleteUser·
  adminSetNotice·liveGames·adminAbortGame·adminPauseGame·adminRoomNotice·adminExtendTime·
  adminVoidRound·sandbox{Start,Grant,Reset,ViewAs,BotRules,Control}·feedbackUpdate` 는 전부
  `if (!user.isAdmin) return FORBIDDEN`(`RoomManager.ts:2214-2341`), `spectate` 는 함수
  첫 줄에서 검사(`RoomManager.ts:4185`). **인증 없이 닿는 관리자 라우트는 없다.**
  HTTP 쪽에는 관리자 라우트 자체가 없다(`/og/room/*`·`/healthz`·정적 파일이 전부).
- **레이트리밋 커버리지**: 가입·로그인·닉네임중복확인·토큰로그인·게스트시작·게스트복귀·
  비번변경·다른기기로그아웃은 `rateLimited`(연결 12/60s + IP 30/60s), 방생성/연습/게스트는
  `roomCreateLimited`(IP 20/10분), 비싼 조회 9종은 `heavyLimited`(계정 5/10초), 정형구는
  `EMOTE_MAX_IN_WINDOW`(5/10초), 제보는 DB에서 시간당 상한(`SiteDb.ts:1111-1116`),
  친구는 `MAX_FRIENDS`(100) + 초대 쿨다운. **누락된 WS 창을 못 찾았다.**
- **메모리 상한**: `connRateHits`(4096), `heavyHits`(1024), `authIpHits`(2048),
  `roomCreateIpHits`(2048), `inviteSentAt`(쿨다운 지난 것 즉시 정리), OG 캐시(256),
  `analytics.days`(180일) — `analytics.seen`만 빠져 있다(위 P2).
- **타이머·종료된 방 참조**: `sweepIdleRooms` 가 유휴/좀비 방을 회수하고, `closeRoom` →
  `endSpectating` → `releaseSpectator` 가 지연 송출 타이머를 전부 `clearTimeout` 한다
  (`RoomManager.ts:4605-4610`). `detachRoomConns` 가 `conn.room/agent/spectating` 을 끊어
  폐기된 컨트롤러 참조가 남지 않는다. 하트비트·prune·sweep 타이머는 `unref()`.
- **클라이언트 신뢰**: 게임 조작은 `action/draftPick/draftReroll/roundContinue` 만 컨트롤러로
  내려가고, 일시정지 방·좌석 없는 연결은 입구에서 거절(`RoomManager.ts:2034-2066`).
  `handOrder` 는 정수 필터 + 20장 상한, `voteAbort` 는 값 화이트리스트,
  `emote` 는 서버 목록에 있는 id 만 방 안으로. `tutorialHold` 는 튜토리얼 방에서만 듣는다.
  치트가 될 만한 "클라이언트 말을 그대로 믿는" 액션을 못 찾았다.
- **저장 문자열 XSS**: 클라이언트에 `dangerouslySetInnerHTML` 이 한 곳도 없다(`grep`).
  HTML 에 직접 박히는 유일한 사용자 입력은 초대 코드인데 `isRoomCodeShape` 로 꼴 검사 후
  통과분만 들어간다(`index.ts:265-278`).
- **경로 조작**: OG 라우트는 정규식 + 코드 꼴 검사, 정적 파일은 퍼센트 디코드 → NUL 검사 →
  `normalize` → `CLIENT_DIST` 프리픽스 → `realpathSync` 재검사까지 4겹.
  공유 리플레이는 토큰만 받고 파일 경로를 클라이언트에서 받지 않는다.
- **로그 비밀 유출**: 운영 로그(`.majak/server.log`, 10,000줄+) 전수 검색에서 비밀번호·세션
  토큰·이메일이 찍힌 줄 **0건**. `비밀번호 변경` 로그는 닉네임만 남긴다. 관리자 코드는
  관리자 계정이 없을 때만 부팅 로그에 한 번 나온다.
- **백업**: `sqlite3 .backup` + `integrity_check` + 빈 스냅샷 검사 + stats JSON 파싱 검사 +
  0600 권한 + 같은 디스크 경고까지 갖췄다. 지적할 것이 없다.
- **정상 종료·복구**: SIGTERM 에서 리플레이 flush → 소켓 통보 → 통계 flush, 3초 강제 탈출.
  감시자는 `restart`(빌드 성공 시에만 교체)를 쓰고 폭주 상한·알림이 있다.

---

## 요약 표 (확정건, 심각도순)

| 심각도 | 제목 | 위치 |
| --- | --- | --- |
| P0 | 초대 카드 라우트로 이벤트 루프 정지 (85ms/요청·무제한·무인증, 8연결로 0.9초 스톨) | `index.ts:430-447`, `ogCard.ts:186` |
| P1 | HTTP 요청 전반에 IP 레이트리밋 부재 (OG·문서·정적) | `index.ts:411-490` |
| P2 | 방문자 집계 `seen` 집합 무한 증가 (하루 단위, 상한 없음) | `analytics.ts:66,140` |
| P2 | 서버·감시자·백업 로그가 실행 중에는 회전하지 않는다 | `scripts/majak.sh:35-46,76` |
| P3 | 리플레이 1년 보존 + 백업 미러 무기한 누적 (42.8KB/판) | `index.ts:872`, `backup.sh:120` |
