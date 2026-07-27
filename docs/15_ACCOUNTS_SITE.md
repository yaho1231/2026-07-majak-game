# 15. ACCOUNTS & SITE — 계정·방코드·리플레이·관전

Version: 1.0 (2026-07-16, 20차)

게임 엔진 위에 "진짜 게임 사이트"를 얹는 계층. 회원가입/로그인, 방 코드
매치메이킹, 개인 통계/리플레이, 관리자 실시간 관전을 다룬다.

---

## §1 아키텍처

```
브라우저 (React SPA)
   │  HTTP GET /            ← 정적 서빙 (client/dist)
   │  WS (같은 포트 upgrade)
   ▼
@majak/server index.ts ──► RoomManager.handleConnection(ws)
   │                          │ 인증 → 방(코드) → 게임 → 기록
   ├─ SiteDb (SQLite)         │
   │   users/sessions/        ├─ HanchanController (게임)
   │   games/game_players     │    └ SpectatorSink (관전 스트림)
   ├─ StatsStore (stats.json) └─ ReplayWriter (JSONL)
   └─ replays/*.jsonl
```

- **단일 포트**: HTTP(정적 파일) + WebSocket을 한 포트에서 서빙 → 포트포워딩 1개로 배포.
- **모든 통신은 WS 메시지** (`protocol.ts`). HTTP는 정적 파일 전용.
- DB는 `node:sqlite` (Node 22 내장, 의존성 0). vite(테스트)에서는
  `createRequire`로 로드한다 (SiteDb.ts 상단 주석 참고).

## §2 계정·세션

- 가입: `register{username, password, adminCode?}` — 닉네임 2~12자
  (한글·영문·숫자·_-), 비밀번호 4자+.
- 저장: scrypt(salt 16B, 64B key) — 평문 저장 금지. 로그인 비교는
  `timingSafeEqual`.
- 세션: 로그인 성공 시 랜덤 토큰 발급(`sessions` 테이블), 클라이언트
  localStorage(`majak.sessionToken`)에 저장 → 재방문 시 `tokenLogin`.
- **닉네임 = 게임 내 표시 이름 = 통계 키**. 계정마다 유일(NOCASE).
- 관리자: 서버 첫 부팅 시 관리자 코드를 생성해 콘솔에 출력 + DB(config)에
  저장. 가입 시 그 코드를 입력한 계정만 `is_admin=1`. 콘솔 접근 = 서버
  소유자만 관리자가 될 수 있다.

## §3 방 코드 매치메이킹

- `createRoom` → 6자 코드(혼동 문자 O/0/I/1 제외, 32^6 ≈ 10억 조합) 발급,
  생성자가 방장으로 착석.
- `joinRoom{code}` → 대기실 참가. 이후 준비/봇/시작은 14차 대기실 규칙 그대로.
- **게임 중 재접속은 신원 기준**: 같은 계정으로 `joinRoom{code}`만 하면
  HumanAgent 소켓이 교체되고 뷰·프롬프트가 즉시 복원된다 (별도 토큰 불필요).
- 클라이언트는 마지막 방 코드를 저장해 홈에 "재접속" 버튼을 노출한다.
- 대기실 이탈(소켓 close/leaveRoom)은 자리 반환·방장 승계·빈 방 삭제.
- 한 계정은 동시에 한 방에만 참가 가능 (중복 참가 거부).

## §4 리플레이·통계

- 게임 종료 시 `games`/`game_players`에 코드·리플레이 경로·참가자·순위 기록.
- `replayList` → 목록 전송. **일반 사용자는 본인 참가 게임만**(`listGamesFor`),
  **관리자는 모든 게임**(`listAllGames`, 최신순) 을 받는다(32차). `replayGet{gameId}`
  → JSONL 라인 전체 전송, **본인 참가 게임 또는 관리자만** 열람 가능.
  홈 화면은 관리자에게 이 카드를 "모든 리플레이"로 표기한다.
- 클라이언트 재구성: 서버 ReplayReader와 동일 절차를
  `client/src/replayRebuild.ts`가 수행 (createInitialGameState → Reducer
  순차 적용, AugmentDrafted 시 install). 관전자 시점 뷰 + 스크럽/재생/국 점프.
- 통계는 기존 StatsStore(닉네임 키 = 계정) 유지. `statsRequest`는 본인 것만.
- **전체 플레이어 통계(리더보드, 32차)**: `leaderboard` → StatsStore.all()을
  deriveStats 후 게임 수 내림차순(동률 시 평균 순위 오름차순)으로 전송.
  **닉네임별 성적은 관리자 전용(47차)** — 비관리자에게는 서버가 각 항목의
  `nickname`을 빈 문자열로 지워(익명 집계) 보내고, 클라도 "전체 플레이어 통계"
  카드를 관리자에게만 렌더한다. 요청 자체를 막지 않는 이유는 **증강 메타·도감
  전체 통계가 이 데이터의 익명 집계**이기 때문(누구나 계속 볼 수 있어야 함) —
  신원만 제거한다. 클라 `aggregateAugments`는 `nickname === ""`을 익명으로 보고
  '증강 장인' 후보에서 제외한다. 관리자 화면은 표(판수·평균순위·1위율·화료율·
  방총률, 본인 행 하이라이트)로 렌더한다. authOk·refreshHome·새로고침에서 요청.
- **증강 도감(Codex) 페이지**: 홈 "📖 증강 도감" 버튼 → 전체화면 도감(App.tsx `CodexScreen`).
  카탈로그 전체(표준+콘텐츠 74종)를 등급별 그리드로 브라우징하고, 카드/행 클릭 시 상세
  오버레이(증강별 `detail` 상세 설명 + 등장 시점·모드·연쇄 지급 배지 + **내 통계 · 서버 전체
  통계** 나란히)를 연다. "전체 통계" 탭은 모든 증강을 내 판·평균순위 / 서버 표본·픽률·평균순위·
  1위율로 정렬·필터할 수 있는 표다. 카탈로그(`AugmentCatalogEntry`)에 `detail`·`draftStages`·
  `modes`·`grantsRandomTier`를 실어 전달하며, 통계는 career + leaderboard에서 클라이언트가
  파생한다(서버 증강 집계 엔드포인트 없음 — 14 §2). 로그인한 누구나 열람 가능.
- **유령 통계 필터(33b)**: stats.json은 닉네임 키라 계정을 삭제해도 예전 통계가
  파일에 남을 수 있다(과거 삭제분·통계 미정리). `sendLeaderboard`는 `db.listUsers()`의
  현재 계정 닉네임 집합으로 필터해 **존재하는 계정만** 리더보드에 넣는다 → 삭제가
  stats 파일 정리 타이밍과 무관하게 즉시 반영된다(계정 삭제 후에도 리더보드에서
  안 사라지던 버그 수정).

## §5 관리자 관전

- `liveGames` → 진행 중 방 목록(코드·참가자). `spectate{code}` → 관전 시작.
- HanchanController.addSpectator(SpectatorSink): 매 브로드캐스트마다
  SPECTATOR_ID 뷰(전 손패 공개)를 전송, catalog/roundOver/actionFx/gameOver도
  수신. 중도 합류 시 현재 뷰 즉시 전송.
- 게임 종료·크래시 시 `spectateEnded` 전송 + 관전 상태 정리.
- 전부 관리자 전용 (isAdmin 게이트).

## §5b 관리자 계정 관리 (32차)

- `adminUsers` → 전체 계정 목록(`SiteDb.listUsers`): id·username·isAdmin·가입시각·
  참가 게임 수. `adminDeleteUser{userId}` → 계정 삭제. 둘 다 **관리자 전용**(FORBIDDEN 게이트).
- 삭제(`SiteDb.deleteUser`)는 한 트랜잭션(BEGIN/COMMIT, 실패 시 ROLLBACK)에서
  세션 삭제 → `game_players.user_id`를 NULL로(게임 기록·다른 참가자 리플레이는 보존)
  → users 삭제. 삭제된 username을 반환해 RoomManager가 **StatsStore.remove**로
  누적 통계(닉네임 키)까지 정리한다(비동기 remove 완료 후 리더보드 재전송).
- **본인 계정은 삭제 불가**(`CANNOT_DELETE_SELF`) — 마지막 관리자 자물쇠·실수 방지.
  클라이언트도 본인 행의 삭제 버튼을 비활성화하고, 삭제 전 confirm으로 재확인한다.
- 삭제 성공 시 서버가 갱신된 `adminUsers` + `leaderboard`를 되돌려준다.
- 홈 화면 "플레이어 관리" 카드(관리자 전용)가 목록·삭제 버튼을 렌더한다.

## §5b2 관리자 증강 파워 티어표 (2026-07-26)

홈의 **"📊 증강 파워 티어표"** 카드(관리자 전용) → 전체화면 `TierScreen`.
드롭 확률 조정을 위한 **순수 파워 티어**(타점·속도·무대응·빈도)를 본다 — 도감의 재미 등급과 별개다.

- 프로토콜: `adminAugmentTiers` → `adminAugmentTiers{entries, order, labels, weights}`
  (**관리자 전용**, FORBIDDEN 게이트).
- **실시간의 뜻**: 서버가 매 요청마다 **살아 있는 카탈로그(`buildAugmentCatalog`) × `powerTier.ts`** 를
  조인한다. 티어를 안 매긴 신규 증강은 `tier: null`로 내려가 화면에 **"미분류"** 로 붉게 뜨고,
  카탈로그에서 사라진 id는 애초에 전송되지 않는다 → 표가 코드보다 뒤처지지 않는다.
- 정렬은 티어 내림차순 → 같은 티어면 총점 내림차순, 미분류는 맨 뒤.
- 데이터 원본은 `packages/core/src/augment/powerTier.ts`(단일 진실), 사람이 읽는 사본은
  `docs/20_AUGMENT_POWER_TIER.md`.
- 클라이언트: 티어별 그룹 / 전체 표 두 가지 보기 + 이름·id·사유 검색. 각 행에 축 점수·총점·
  드롭 가중치·한 줄 사유.
- 회귀 테스트: `packages/server/test/AugmentTiers.test.ts`(권한·전량 조인·미분류 0·정렬·수치 일치).

## §5c 증강 테스트 — 샌드박스 (49차)

관리자가 구현된 증강을 직접 골라 즉시 획득하고 시험하는 1인 전용 게임.

- 프로토콜(전부 **관리자 전용**, FORBIDDEN 게이트):
  - `sandboxStart{mode?}` → 관리자 1 + 봇 3의 방을 만들고 **드래프트 없이**
    (`draftSchedules: []`) 즉시 시작. 응답으로 `sandbox{code, mode, augments}` +
    `catalog` + `view`가 온다.
  - `sandboxGrant{augmentId, target?}` → 진행 중인 판에서 그 자리에 증강 설치
    (`HanchanController.grantAugment`). target 생략 시 본인, 지정하면 봇에게도 준다.
  - `sandboxReset{augments?, mode?}` → 지금 판을 버리고 **좌석별 사전 지급 목록**으로
    새 판을 시작한다. `augments` 생략·`{}` = 증강 없는 백지 초기화.
- 초기화가 "증강 개별 제거"가 아니라 **판 교체**인 이유: install은 rules/effects/
  actions/turnOptions에 등록하는 부수효과라 완전한 되돌리기가 없다. 엔진을 새로 만드는
  쪽이 잔재 없는 초기화다. 교체는 `controller.requestAbort()` →
  `onGameAborted`(sandboxRestarting 분기) → `restartSandbox` 순으로 일어나며,
  이 경로는 `gameAborted`를 보내지 않아 클라이언트가 홈으로 튕기지 않는다.
  봇은 새 인스턴스로 교체하고 사람 좌석은 `HumanAgent.resetForNewGame()`으로
  지난 판의 대기 결정·타이머를 버린다.
- 사전 지급(`HanchanConfig.presetAugments`)은 **첫 국 배패 전**에 드래프트와 같은
  경로(draftPick 액션 + installAugment)로 설치된다 → 배패·국 시작에 개입하는 증강도
  1국부터 온전히 작동한다. 국 도중 `sandboxGrant`는 이번 국의 지난 시점을 되돌리지
  못하므로, 패널이 "새 판"으로 처음부터 확인하도록 안내한다.
- **기록을 남기지 않는다**: 리플레이 파일(writer 자체를 안 만듦)·게임 인덱스
  (`recordGame`)·누적 통계(`finishStats`) 모두 건너뛴다. 시험용 판이 도감·리더보드의
  근거 데이터를 오염시키지 않게 하기 위함이다. 방은 `liveGames` 목록에서도 빠지고,
  방 주인의 재접속 외의 `joinRoom`은 `ROOM_NOT_FOUND`(존재 자체를 감춤)로 응답한다.
- 클라이언트: 홈의 "🧪 증강 테스트" 카드(관리자 전용, 모드 선택 + 시작) → 게임 화면
  좌상단 `🧪 증강` 버튼 → `SandboxPanel`(카탈로그 전량 목록·등급 필터·검색·대상 좌석
  선택·＋로 즉시 획득·도감 상세·새 판/초기화). `sandbox` 메시지를 받으면 이전 판의
  프롬프트·결과창·순위·연출을 모두 정리한다.
- 회귀 테스트: `packages/server/test/Sandbox.test.ts` (권한·시작·지급·초기화·기록 없음).

## §6 연출 (actionFx)

표준 액션(discard/riichi/win/pon/chi/kan/pass/kyushu) 이외의 액션이 실행되면
서버가 `actionFx{player, actionType}`를 전원+관전자에게 브로드캐스트한다.
클라이언트는 보라색 컷인(증강 발동)과 효과음으로 표현한다. 비표준 액션은
턴 프롬프트에서만 나오므로 "결정 = 실행"이 보장된다 (HanchanController 주석).

## §7 배포

```bash
npm run build:client                 # client/dist 생성
PORT=3001 npm run dev -w @majak/server   # 개발: tsx로 실행
# 프로덕션도 동일 (tsx 로더). 환경변수:
#   PORT / DB_PATH / CLIENT_DIST / INTER_ROUND_DELAY_MS / SESSION_TTL_MS / SIGNUP_CODE
```

- `SIGNUP_CODE`: 가입 게이트. 설정하면 이 코드를 아는 사람만 회원가입할 수 있다.
  공개 배포(특히 TLS 없는 포트 노출)에서 무단 가입·계정 탐색을 막는 1차 방어.
- 공개 배포 시 리버스 프록시(캐디/nginx)로 TLS 종단(wss) 권장.
  클라이언트는 same-origin(wss://host)으로 자동 접속한다.
- vite dev(517x 포트)에서는 ws://localhost:3001로 자동 접속.
  로그인 화면 "고급 설정"에서 서버 주소 수동 지정 가능.
- 관리자 코드는 서버 콘솔 로그에서 확인.

## §8 보안 견고성 (20차 리뷰 반영)

신규 계층(계정·방코드·리플레이·관전)을 인증·접근제어·경로탈출·인젝션·
입력검증/DoS 5관점으로 리뷰했다. 확인된 결함과 조치:

- **입력 검증 / 프로세스 크래시 (치명 → 수정)**: `replayGet`의 `gameId`가 없거나
  정수가 아니면 `SiteDb.getGame` 안의 node:sqlite 파라미터 바인딩이 예외를
  던졌고, 이 호출이 `void`로 떠 있는(floating) Promise였던 탓에 처리되지 않은
  거부(unhandled rejection)가 되어 **서버 프로세스 전체(=모든 진행 게임)가
  죽었다**(Node 22 기본 동작). 3중 방어로 수정: (1) 라우터에서
  `Number.isInteger` 검증 후 BAD_REQUEST, (2) `getGame`이 비정수 입력에 null
  반환, (3) floating 호출에 `.catch`. `register/login/tokenLogin/joinRoom/
  spectate`의 문자열 필드도 타입 가드를 추가했다.
- **프로세스 안전망 (defense-in-depth)**: `index.ts`에
  `process.on("unhandledRejection")`·`uncaughtException` 핸들러를 두어, 떠 있는
  Promise 거부나 예외 하나가 전체 서버를 종료시키지 못하게 한다(연결·이벤트
  단위 격리 + 순수 리듀서라 로그 후 생존이 안전). `ReplayWriter` 스트림에도
  `error` 핸들러를 붙였다.
- **프레임 크기 상한**: `WebSocketServer({ maxPayload: 512KB })` — ws 기본 100 MiB
  프레임으로 `JSON.parse`가 이벤트 루프를 마비시키지 못하게 한다.
- **프로토타입 오염 닉네임 (치명 → 수정)**: 닉네임 정규식이 밑줄을 허용해
  `__proto__`/`toString`/`constructor` 같은 Object.prototype 키로 가입할 수 있었고,
  `StatsStore.get(nickname)`이 일반 객체를 맵처럼 인덱싱해 그런 키에 대해 null이
  아니라 프로토타입 값(함수 등)을 반환 → 로비 브로드캐스트가 던져 방 소프트락.
  이중 방어: (1) `StatsStore`의 players 맵을 `Object.create(null)`(프로토타입 없음)로,
  (2) 가입 시 예약 닉네임(프로토타입 키·`Bot_`·`admin`·시스템 id) 차단.
- **게임 크래시 시 플레이어 미통지 (주요 → 수정)**: 컨트롤러 `run().catch` 경로가
  관전자만 정리하고 실제 플레이어에겐 아무것도 안 보내 클라이언트가 무한 대기했다.
  크래시 시 전 HumanAgent에게 `error{GAME_CRASHED}`를 보내고, 클라이언트는 이를
  받으면 홈으로 정리한다.
- **정적 파일 스트림 error 핸들러 (주요 → 수정)**: `createReadStream(...).pipe(res)`에
  `error` 리스너가 없어 EMFILE/EACCES/TOCTOU 시 uncaught로 프로세스가 죽을 수
  있었다(uncaughtException 안전망이 있어도 응답은 hang). `stream.on("error",
  () => res.destroy())`로 요청만 실패시키고 서버는 유지.
- **logout 정리 (경미 → 수정)**: 로그아웃 시 방 좌석·관전 상태를 정리하지 않아
  유령이 남을 수 있었다 → `leaveWaiting`+관전 정리 후 conn 상태 초기화.
- **인증·접근제어·경로탈출·인젝션 검토 결과 이상 없음**: 비밀번호는 scrypt+개별
  salt·`timingSafeEqual`, 세션 토큰은 256비트. SQL은 전부 파라미터 바인딩(인젝션
  불가). 정적 파일 서버는 `normalize`+선행 `../` 제거+`startsWith(CLIENT_DIST)`로
  경로 탈출 차단(형제 디렉터리 프리픽스 우회도 불가 — 실측: `../../package.json`·
  `%2e%2e`·`..%2f` 전부 index.html 폴백, 파일 유출 없음).
  `replayGet`/`replayList`는 본인 참가 게임 또는 관리자만, `liveGames`/`spectate`는
  관리자만 접근(게이트 확인). 게임 재접속은 인증된 계정명 기준이라 좌석 탈취 불가.
- **이벤트 루프 블로킹 / 인증 DoS (수정, 20b차 후속)**: `SiteDb.login/register`가
  동기 `scryptSync`로 공유 이벤트 루프를 블록해, 인증 요청 하나가 모든 진행
  게임을 수십 ms씩 멈추고 대량 요청 시 서버가 마비될 수 있었다. **비동기
  `scrypt`(libuv 스레드풀)** 로 전환해(`SiteDb.register/login`이 `Promise` 반환)
  이벤트 루프가 인증 중에도 반응하도록 했다(실측: 8건 동시 scrypt 중 ping RTT
  ≈0 ms). 더해 **연결당 인증 레이트리밋**(`AUTH_WINDOW_MS` 60초 창에서 최대
  `AUTH_MAX_ATTEMPTS`=12회, 초과 시 `RATE_LIMITED`)으로 한 연결이 스레드풀 CPU를
  독점하지 못하게 했다. `RoomManager`의 register/login은 이제 async라 floating
  `.catch`로 처리된다.
- **남은 하드닝 (권장, 미조치)**: 관리자 코드 비교는 `===`(비 상수시간)이나 48비트
  서버 비밀이라 네트워크 지터상 실효 위험 낮음. (사용자 열거 타이밍 오라클은 8b차에서
  더미 scrypt로 균일화함.)

## §8b 공개 배포 하드닝 (21차 — 평문 포트포워딩 노출 재검토)

TLS 없는 포트포워딩 공개 배포를 전제로 다중 관점(인증·접근제어·전송·DoS·클라이언트)
재감사 후 아래를 반영했다. 인젝션은 재확인 결과 이상 없음(SQL 전부 파라미터 바인딩).

- **온라인 무차별 대입 (인증 레이트리밋 우회 → 수정)**: 기존 `authAttempts`는
  **연결 단위**라 공격자가 매 시도마다 새 WS 연결을 열면 무제한 시도할 수 있었다.
  **IP 기준 슬라이딩 윈도우**(`AUTH_IP_WINDOW_MS` 60초 창 `AUTH_IP_MAX_ATTEMPTS`=30회)를
  추가하고 `tokenLogin`도 레이트리밋을 통과하게 했다. IP는 핸드셰이크의
  `req.socket.remoteAddress`에서 얻으며 **X-Forwarded-For는 신뢰하지 않는다**(신뢰 프록시
  부재 시 스푸핑 가능). 루프백/로컬(테스트 포함)은 스로틀 예외.
- **비밀번호 정책 (약함 → 강화)**: 최소 길이 4→8자, 숫자 전용(PIN)·닉네임 포함 비밀번호
  거부(`SiteDb.register`). 로그인은 기존 계정 호환을 위해 길이 미검사 유지.
- **사용자 열거 타이밍 (완화)**: 존재하지 않는 계정 로그인도 더미 salt로 scrypt를 수행해
  응답 시간을 균일화(`SiteDb.login`).
- **연결·자원 상한 (DoS → 수정)**: 전체 동시 연결(`MAX_CONNECTIONS`=300)·IP당 동시
  연결(`MAX_CONNECTIONS_PER_IP`=16) 상한, **연결당 메시지 토큰 버킷**(용량 80·40/s)으로
  leaderboard/replay/action 폭주가 이벤트 루프를 마비시키지 못하게 함. **동시 scrypt 상한**
  (`MAX_SCRYPT_CONCURRENCY`=4)으로 인증 폭주가 libuv 스레드풀을 독점해 진행 중 게임의
  리플레이 fs I/O를 굶기지 못하게 함. 세션은 사용자당 최신 10개만 유지(무한 증식 방지).
- **삭제 계정 권한 잔존 (→ 수정)**: `conn.user`는 인증 시 1회 캐시되어 재검증되지 않으므로,
  관리자가 계정을 삭제하면 그 사용자의 열린 소켓을 `evictUser`로 강제 로그아웃(대기실/관전
  정리 후 소켓 close)한다.
- **정적 서버 보안 헤더 (→ 추가)**: `Content-Security-Policy`(React 인라인 스타일 때문에
  `style-src 'unsafe-inline'` 포함), `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`. 경로 검증도 `startsWith(CLIENT_DIST + sep)`로
  형제 디렉터리 프리픽스 우회까지 차단.
- **전송 보안 (여전히 미해결 — 배포 조치 필요)**: 평문 http/ws는 비밀번호·세션 토큰·관리자
  코드가 도청·능동 주입에 노출된다. **가장 중요한 잔여 위험**. 리버스 프록시(캐디/Cloudflare
  Tunnel)로 TLS(wss) 종단 + Node를 `HOST=127.0.0.1`로 바인드 + 443만 포워딩해야 근본 해결.
  클라이언트는 https 오리진이면 자동으로 wss를 쓴다(코드 변경 불필요). 전환 후 세션 토큰·
  관리자 코드 재발급 권장. `SIGNUP_CODE`는 사용자 결정으로 "majak" 유지(추측 쉬운 게이트지만
  친구 그룹 용도 + IP 레이트리밋으로 무단 대량가입은 완화됨) — 강한 랜덤값 권장은 유효.

## §9 세션 만료 · 게임 포기 (20c차 반영)

- **세션 토큰 만료**: `SiteDb`가 `sessionTtlMs`(기본 30일, 환경변수
  `SESSION_TTL_MS`로 조정)를 갖는다. `loginByToken`이 `sessions.created_at`
  기준으로 TTL을 검사해, 지난 토큰은 무효화(`null`)하고 지연 삭제한다.
  로그아웃뿐 아니라 시간 경과로도 세션이 만료된다.
- **게임 중 포기(중도 이탈)**: 게임 중 `leaveRoom`을 보내면
  `HumanAgent.abandon()`으로 좌석이 봇처럼 즉시 자동 진행된다(대기 중이던
  결정/드래프트는 안전 폴백으로 해소). 남은 사람들의 게임이 30초 타임아웃마다
  멈추지 않고 완주된다. 포기한 좌석은 `isAbandoned`로 표시되어 다른 방 참가
  판정(`membershipOf`)과 재접속 대상에서 제외된다(그 게임엔 재접속 불가).

## §10 WS 자동 재연결 (20e차 반영)

클라이언트(App.tsx)가 소켓 끊김을 자동 복구한다.

- **자동 재연결**: 예기치 않은 `close`(의도적 종료 제외) 시 지수 백오프
  (0.5s→…→최대 10s, 무한 재시도)로 재접속을 예약한다. 상단에 "⟳ 서버와
  재연결 중…" 인디케이터를 띄운다. 상태 기계·타이머·시도 횟수는 모두 live
  ref로 관리(소켓 콜백이 마운트 클로저라 state 값은 스테일 — ref/setter만 사용).
- **토큰 재인증**: 재연결 `open` 시 저장된 세션 토큰으로 `tokenLogin`을 보내
  자동 재로그인한다(재입력 불필요). 토큰이 만료(`TOKEN_INVALID`)면 세션을
  비우고 로그인 화면으로 정리한다.
- **활성 방/관전 자동 복귀**: 끊기기 전 참가/관전 중이던 방을 `activeRoomRef`/
  `activeSpectateRef`로 기억해, 재인증 직후 `joinRoom`/`spectate`를 자동 전송한다.
  서버의 신원 기준 재접속(§3)이 좌석 소켓을 교체하고 뷰·프롬프트를 즉시 복원한다.
- **게임 소멸 시 graceful 홈**: 자동 재입장했는데 그 방이 사라졌으면(서버 재시작
  등으로 인메모리 게임 소멸) `ROOM_NOT_FOUND`를 받아 조용히 홈으로 돌아가고
  토스트로 알린다(재입장 시도였는지는 `activeRoomRef` 생존으로 판정).
- 검증: 실서버+브라우저 — 서버 강제 종료 시 재연결 배너 표시·백오프 재시도,
  서버 복구 시 토큰 재인증(재로그인 없이 홈 복귀)·게임 소멸 시 graceful 홈,
  진행 중 게임에 재접속 시 손패·바닥·정보 패널 완전 복원(×69→×66, 부재 중 진행분
  반영)을 확인.

## §11 남은 일 (알려진 한계)

- Save/이어하기(서버 재시작 후 진행 중 게임 복구) 미구현 — HanchanController가
  라운드 중간 재개를 지원하지 않아 설계 결정 필요.
- App.tsx 단일 파일(~2,900줄) — 화면별 파일 분리 리팩토링 여지.
