# ops 담당 — 출시일 QA (2026-08-28)

축: 출시일에 서버가 살아 있는가, 사고가 나면 되돌릴 수 있는가.
환경: 포트 3110, DB/리플레이 `/tmp/qa-launch-ops/`. 공개 서버(3011)·메인 체크아웃은 건드리지 않았다.

---

### [P1] 배포 실패 시 롤백 절차가 문서 어디에도 없다
- 위치: `DEPLOYMENT.md`, `CLAUDE.md`, `deploy/serve.sh`, `docs/16_UNITY_MIGRATION.md:360`
- 증상: `deploy/serve.sh restart`는 "빌드 먼저, 성공했을 때만 교체"까지만 보장한다(빌드
  실패는 막는다). 하지만 **빌드는 성공했는데 런타임에 새 코드가 깨진 경우**(예: 새 커밋의
  타입체크는 통과했지만 런타임 예외를 던지는 로직, 또는 의도된 동작 변경이 실제로는 버그인
  경우)를 되돌리는 절차가 문서에 없다. `docs/16_UNITY_MIGRATION.md:360`에 "롤백 플랜"이라는
  문구가 있으나 실제 항목이 아니라 체크리스트 표제어일 뿐, 구체적 명령이 없다.
  git으로 이전 커밋을 체크아웃해 재배포한다는 발상 자체가, CLAUDE.md의 "메인 체크아웃은
  master 고정" 규칙과 곧바로 충돌한다 — master에서 되돌리려면 `git revert` 후 다시
  `git pull`을 해야 하는데, 이 절차·순서가 문서 어디에도 적혀 있지 않다.
- 재현/근거: `grep -rniE "rollback|롤백"` 을 `DEPLOYMENT.md`·`CLAUDE.md`·`docs/*.md`에
  돌린 결과 실행 가능한 절차는 없었다(트랜잭션 롤백 설명 두 건과 체크리스트 표제어
  한 건뿐).
- 판정: 확정
- 제안: `DEPLOYMENT.md`에 "6-3. 배포 후 문제 발견 시 되돌리기" 절을 추가한다. 최소한
  `git revert <나쁜 커밋> → git push → (메인 체크아웃에서) git pull → bash deploy/serve.sh restart`
  순서와, "새 배포가 DB 스키마를 바꿨다면 되돌리기 전에 확인할 것"이라는 경고를 명시한다.

### [P2] `REPLAY_DIR` 환경변수가 서버에서 전혀 읽히지 않는다 — 문서·백업 스크립트와 불일치
- 위치: `packages/server/src/index.ts:64` (`const REPLAY_DIR = resolve(process.cwd(), "../../replays");`)
- 증상: `scripts/backup.sh`와 `qa-lab/launch/BRIEF.md`는 `REPLAY_DIR` 환경변수로 리플레이
  경로를 격리할 수 있다고 전제하지만, 서버 본체(`index.ts`)는 이 값을 전혀 읽지 않고
  **항상 `process.cwd()/../../replays`로 고정**돼 있다. `DB_PATH`는 env로 오버라이드
  가능하지만(`index.ts:66`) `REPLAY_DIR`은 아니다.
- 재현/근거: 워크트리 루트(`~/majak/.claude/worktrees/game-launch-qa-plan-09cd26`)에서
  `PORT=3110 DB_PATH=/tmp/qa-launch-ops/replays/majak.db REPLAY_DIR=/tmp/qa-launch-ops/replays`로
  기동했더니, 부팅 로그가 `Replays     : ~/majak/.claude/replays`를 찍었다 —
  지정한 `/tmp/qa-launch-ops/replays`가 아니라 **워크트리 두 단계 위, `.claude` 바로
  아래의 공유 경로**로 실제 리플레이·통계 파일이 쓰였다(`stats.analytics.json` 생성 확인,
  정리 후 삭제함). 프로덕션은 `scripts/majak.sh:88`이 항상 `cd "$ROOT/packages/server"` 뒤에
  띄우므로 실제 배포 경로 자체는 문서와 일치해 안전하지만, **여러 워크트리에서 동시에 QA
  서버를 격리 없이 띄우면 `.claude/replays`라는 공용 위치에서 서로의 리플레이/통계 파일이
  충돌**할 수 있다.
- 판정: 확정
- 제안: `index.ts:64`를 `process.env.REPLAY_DIR ?? resolve(process.cwd(), "../../replays")`로
  바꿔 문서·백업 스크립트와 실제 동작을 일치시킨다. 최소한 `BRIEF.md`/`DEPLOYMENT.md`에
  "REPLAY_DIR은 현재 서버가 읽지 않는다"는 경고를 남긴다.

### [P2] 정적 자산(`packages/client/dist`) 3.7 MB, 소스맵 없음, 해시 재현 확인
- 위치: `packages/client/dist/assets/*`, `vite.config.ts`
- 증상/근거: `npm run build:client`를 두 번 연속 실행해 산출물을 비교했다. `.map` 파일은
  0개(`find packages/client/dist -name "*.map"` 결과 없음) — 프로덕션에 소스가 노출되지
  않는다. 자산 해시(`index-48CQBoC9.css`, `index-CAUjVM45.js`,
  `replayRebuild-ByCrEKRr.js`)는 두 빌드에서 동일하게 나와, 소스가 그대로면 해시도
  그대로 재현된다. 캐시 정책(`packages/server/src/httpCache.ts`)은 `/assets/`만
  1년 immutable, 그 외 정적 파일은 1일+SWR, HTML은 no-cache로 설계돼 있어 배포 시
  자산 해시가 바뀌면 브라우저가 새 파일을 받고, index.html은 매번 재검증된다 — 캐시
  무효화 경로는 설계대로 동작한다. 번들 경고("711.79 kB, 500kB 초과")는 출시 자체를
  막을 이슈는 아니다(gzip 223 KB).
- 판정: 확정 (문제 없음 — 기록만)

---

## 백업 · 복구 리허설 (핵심 산출물)

절차: 격리 DB(`/tmp/qa-launch-ops/replays/majak.db`)에 계정 1개(`qaops1`, is_admin=1)를
만든 뒤 `scripts/backup.sh`를 격리 `BACKUP_DIR`로 실행 → `--verify` → 별도 경로
(`/tmp/qa-launch-ops/restored/`)에 DEPLOYMENT.md §6의 복구 절차를 **문서 그대로** 따라
적용 → 계정·통계가 살아 돌아오는지 확인.

```
✓ 백업 완료 — DB 90112 bytes → majak-20260828-100105.db.gz · 통계 2종
✓ majak-20260828-100105.db.gz — 무결성 ok (90112 bytes)
✓ stats-20260828-100105.json — JSON ok
✓ stats.augments-20260828-100105.json — JSON ok
gunzip → sqlite3 PRAGMA integrity_check → ok
SELECT id,username,is_admin FROM users;  → 1|qaops1|1   (복구 후에도 동일)
stats.json 복구 후 내용 그대로: {"players":{"qaops1":{"rounds":1}}}
```

### [해당 없음 — 확인 결과 정상] DEPLOYMENT.md §6 복구 절차는 문서 그대로 동작한다
- 판정: 확정
- 근거: 위 산출물. `gunzip -c → integrity_check → cp → -wal/-shm 삭제 → 계정 확인` 순서를
  그대로 밟아 격리 경로에서 계정·`stats.json`·`stats.augments.json`이 정확히 복구됐다.
  문서와 실제가 어긋나는 곳은 찾지 못했다.
- 확인된 세부: `backup.sh`는 실행 중인 서버가 있어도(`sqlite3 .backup`) 손상 없이 스냅샷을
  뜨고, 빈 스냅샷(테이블 0개)·JSON 파싱 실패를 자체 검사해 실패시 백업 자체를 남기지 않는다
  (`fail()` 경로 코드 확인, `verify_db`의 "테이블 0개" 가드 — 실측하지는 않았으나 코드
  경로는 명확함, 판정: 의심 없음/코드로 확정).
- 확인하지 못한 것: **디스크 통짜 장애(원본·백업이 물리적으로 같은 디스크)** 시나리오는
  스크립트 자체가 매 실행마다 경고를 출력한다("백업이 원본과 같은 디스크에 있습니다") —
  실제 운영 `BACKUP_DIR` 설정이 외장/NAS를 가리키는지는 `deploy/majak.env`가 이 워크트리에
  없어 **확인 불가**(gitignore 대상, 메인 체크아웃 전용). 서버 담당 또는 운영자 확인 필요.

---

## 감시자(watchdog) — 실패 시나리오 서면 추적

`scripts/watchdog.sh` 코드를 근거로 세 시나리오를 짚었다(직접 launchd에 등록해 재현하지는
않았다 — 브리핑 지시대로 launchd 에이전트 등록/해제는 하지 않음).

### [해당 없음 — 확인 결과 정상] 응답만 느릴 때(헬스체크 실패)와 재시작 판단 근거
- 판정: 확정 (코드 인용)
- 근거: `healthy()`는 `deploy/serve.sh health`(`curl -fsS .../healthz`)를 부르고, 실패 시
  `HEALTH_TRIES`(기본 3회) × `HEALTH_GAP_SEC`(기본 5초) 간격으로 재확인한 뒤에야 "응답
  없음"으로 판단한다(`watchdog.sh:87-91`) — 일시적 지연을 죽음으로 오판할 여지가 작다.
  단, `/healthz`가 예외 누적으로 `ok:false`+HTTP 500을 주는 경우(`index.ts` faults 로직)도
  `curl -fsS`는 HTTP 500을 실패로 처리하므로 `healthy()`가 false를 반환한다 — "응답은 오는데
  정상 아님" 상태도 재시작 트리거로 정확히 이어진다. 복구는 `start`가 아니라 `restart`를
  쓰는 이유가 주석(watchdog.sh:113-124)에 명확히 남아 있고, 이는 실제로 "프로세스는 살아
  있는데 서비스가 멎은 상태"를 다루기 위한 설계다.

### [P2] 포트가 다른 프로세스에 이미 점유돼 있을 때의 동작이 문서/주석에 없다
- 위치: `scripts/majak.sh` (start/restart 경로), `deploy/serve.sh`
- 증상: `watchdog.sh`는 `serve.sh restart`의 종료 코드만 보고 성공/실패를 가른다
  (`if bash ".../serve.sh" restart ...; then ... else ...`, watchdog.sh:117-135). 만약
  3011 포트를 다른 프로세스(예: 좀비 프로세스, 수동 디버깅 세션)가 점유해 `node`가
  `EADDRINUSE`로 즉시 죽는다면, `majak.sh`가 이를 감지해 0이 아닌 종료 코드를 내는지
  코드를 확인하지 못했다(`majak.sh` 실행부는 `exec node ... &`로 백그라운드 기동 후 PID
  파일만 남기고 셸 자체는 바로 0을 반환할 가능성 — `scripts/majak.sh:88` 참고). 이 경우
  `restart`가 "성공"으로 보고돼 `watchdog.gaveup` 파일 없이 알림 없이 넘어가고, 다음 60초
  헬스체크에서 다시 실패해야 재시도가 걸린다 — 최초 실패 원인(포트 점유)에 대한 알림 문구가
  없다.
- 재현/근거: `majak.sh` 시작부(`ROOT="$(cd ...)"`)와 88행의 `exec` 백그라운드 패턴을
  코드로 확인. 실제 포트 충돌을 인위로 재현하지는 않았다(공개 서버 포트 3011을 건드릴 수
  없어 검증 범위 밖).
- 판정: 의심
- 제안: `majak.sh start`에 `EADDRINUSE`를 명시적으로 감지해 0이 아닌 종료 코드 + 원인
  로그를 남기도록 보강하고, `watchdog.sh`의 실패 알림 문구에 "포트 점유 가능성"을 넣는다.

### [해당 없음 — 확인 결과 정상] 15분 3회 상한 이후 사람이 없을 때 알림 경로
- 판정: 확정
- 근거: `watchdog.sh:104-112`, 임계 도달 시 `notify()`(→ `.majak/alerts.log` + macOS 알림
  센터 + 설정 시 웹훅)를 호출하고, 같은 창 안에서는 `watchdog.gaveup` 파일로 중복 알림을
  막는다. `scripts/notify.sh`를 확인해 실제 알림 경로가 코드로 존재함을 확인했다(직접
  webhook 발신까지 재현하지는 않음 — `NOTIFY_WEBHOOK_URL`이 이 워크트리 환경에 없음).

### [해당 없음 — 확인 결과 정상] `AbandonProcessGroup`
- 판정: 확정
- 근거: `deploy/launchd.sh:77`에 `<key>AbandonProcessGroup</key><true/>`가 현재 플리스트
  템플릿에 존재한다. `deploy/launchd.sh:134-135`가 설치 시점에 낡은 플리스트(이 키 없음)를
  자동 감지해 경고까지 출력한다. `watchdog.sh` 자신도 재시작 직전마다 같은 검사
  (`warn_if_self_killing`)를 한다 — 이중 방어가 실제로 코드에 있다.

---

## 관측성

### [해당 없음 — 확인 결과 정상] `/healthz`는 포트만 열려 있으면 200을 주는 얕은 체크가 아니다
- 위치: `packages/server/src/index.ts:518-556`
- 판정: 확정
- 근거: 최근 창(`HEALTH_FAULT_WINDOW_MS`) 안에 uncaught exception·rejection이
  `HEALTH_FAULT_LIMIT`(주석상 5회) 이상 쌓이면 `ok:false`+HTTP 500을 반환한다. 연결 수·방
  수·진행 중 게임 수(`roomManager.healthSnapshot()`)도 함께 실어, 감시자뿐 아니라 사람이
  직접 봐도 "프로세스는 있는데 게임 루프가 죽었는지"를 구분할 근거가 된다. 또한 이
  엔드포인트는 기본적으로 루프백(`who.direct`)에만 열려 외부에 자원 상태를 노출하지
  않는다(감사 2026-08-12 §L-1 반영).

### [P3] 로그에 비밀번호/세션 토큰/가입 코드 평문 노출 — grep 결과 깨끗함 (기록만)
- 위치: `/tmp/qa-launch-ops/server.log` 전체, `packages/server/src/RoomManager.ts`의
  `this.log`/`this.logError` 호출부
- 증상/근거: 격리 서버로 회원가입·로그인 시도를 실제로 실행한 뒤 서버 로그를
  `grep -inE "password|sessiontoken|signupcode|admincode"`로 훑었다 — 매치 없음.
  소스 코드에서도 `this.log`/`console.log`가 `msg`(수신 원본, 비밀번호 포함 가능)를 통째로
  찍는 자리를 찾지 못했다(`ws.send(JSON.stringify(msg))`만 나오며 이는 송신 응답이지
  요청 로그가 아니다). 유일하게 매 부팅 로그에 찍히는 민감값은 이미 docs/46 M-1로 추적
  중인 관리자 가입 코드뿐이다(아래 참고).
- 판정: 확정 (문제 없음)

---

## docs/46·docs/29 미완 보안 항목 — 현재 코드 상태 확정

### [P1] L-1 — 404 응답에 `Strict-Transport-Security` 헤더 여전히 누락 (열림, 미해결)
- 위치: `packages/server/src/index.ts:328-344` (`sendNotFound`)
- 증상: `res.writeHead(404, {...})`에 `X-Content-Type-Options`·`X-Frame-Options`·
  `Referrer-Policy`·`Content-Security-Policy` 네 헤더는 있지만 `Strict-Transport-Security`가
  없다. 같은 파일의 다른 정적 응답(`index.ts:671-678` 근방)은 HSTS를 포함한다.
- 재현/근거: 코드 직접 인용(위). docs/46 감사 당시와 동일 상태 — 이번 라운드에서 수정된
  흔적 없음.
- 판정: 확정
- 제안: docs/46의 제안과 동일 — `sendNotFound`의 헤더 객체에
  `"Strict-Transport-Security": "max-age=31536000; includeSubDomains"` 추가. 다섯 헤더를
  공통 헬퍼로 뽑아 재발을 막는다. **이번 라운드에서 코드는 고치지 않음(브리핑 규칙)** —
  P1으로 올린 이유는 이미 두 차례 감사에서 지적됐고 수정 비용이 한 줄인데도 아직 열려
  있기 때문.

### [P2] M-1 — 관리자 가입 코드 매 부팅 로그 평문 노출 (열림, 운영자 보류 결정 유지)
- 위치: `packages/server/src/index.ts:937`
- 증상/근거: 격리 서버를 3110 포트로 세 번 재기동하며 매번 로그를 확인했다 — 관리자 계정이
  이미 만들어진 뒤에도(`qaops1`을 is_admin=1로 만든 뒤 재기동) 부팅 로그에
  `관리자 가입 코드: <값>`이 계속 찍혔다. `hasAdmin()` 게이트가 없다는 docs/46의 서술과
  코드가 일치한다.
- 판정: 확정 (회귀 아님 — docs/46이 이미 "운영자의 의도적 결정"으로 분류)
- 제안: docs/46과 동일. 이 라운드에서 새로 추가할 내용 없음. P2로 유지하는 이유는 이미
  운영 결정이 내려진 항목이라 출시를 막을 이유는 아니지만, 배포 체크리스트에
  `ADMIN_CODE` 고정 + `.majak/server.log` 접근 제한이 실제로 실행됐는지는 이 워크트리에서
  확인할 수 없었다(운영자 확인 필요).

### [해당 없음 — 확인 결과 정상] docs/29 M-3 — 비밀번호 변경 시 세션 일괄 무효화, 이미 구현·동작
- 위치: `packages/server/src/SiteDb.ts:821-859` (`changePassword`),
  `packages/server/src/RoomManager.ts:1938-1980`
- 판정: 확정 — **닫힘.** docs/46이 "이번 라운드 검증 대상에서 빠져 상태 미갱신"이라 보류로
  남겨 뒀지만, 코드를 직접 읽은 결과 이미 해결돼 있다.
- 근거: `SiteDb.changePassword`가 트랜잭션 안에서 비밀번호 해시 갱신과 동시에
  `DELETE FROM sessions WHERE user_id = ?`로 그 계정의 모든 세션 행을 지우고, 현재 연결에는
  새 세션 토큰을 즉시 발급한다(자기 자신 로그아웃 방지). `RoomManager.ts:1963-1969`가 이어서
  `evictOtherSessions`를 호출해 **열려 있는 다른 소켓까지 강제 종료**한다 — DB 세션 삭제만으로는
  이미 열린 탭이 안 끊긴다는 것을 코드 주석이 명시하고 그에 맞게 구현돼 있다. `logoutOthers`
  메시지 타입도 같은 메커니즘으로 별도 제공된다. 다음 라운드 보고서에 "M-3 닫힘"으로
  반영할 것을 제안한다.

---

## 확정 심각도순 요약

| 심각도 | 제목 | 위치 |
|---|---|---|
| P1 | 배포 실패 시 롤백 절차 문서 부재 | DEPLOYMENT.md 전체 |
| P1 | L-1 HSTS 헤더 404 응답 누락, 여전히 열림 | packages/server/src/index.ts:328-344 |
| P2 | `REPLAY_DIR` env var가 서버에서 안 읽힘 (문서·백업 스크립트와 불일치) | packages/server/src/index.ts:64 |
| P2 | 포트 점유 시 watchdog 재시작 성공/실패 판정 근거 불명확 (의심) | scripts/majak.sh, scripts/watchdog.sh |
| P2 | M-1 관리자 코드 로그 노출, 운영자 보류 유지 | packages/server/src/index.ts:937 |
| P3 | 로그 평문 비밀번호/토큰 노출 없음 (문제 없음, 기록) | 서버 로그 실측 |

## 봤는데 문제 없었던 것 (다음 라운드가 다시 파지 않게)

- 백업 스크립트(`scripts/backup.sh`)와 DEPLOYMENT.md §6 복구 절차는 **실제로 격리 환경에서
  끝까지 검증했고 문서-실제 어긋남 없음**. DB 무결성 검사, JSON 파싱 검사, 빈 스냅샷 방지
  로직 모두 코드에 존재.
- `/healthz`는 포트만 살아 있으면 200을 주는 얕은 체크가 아니다 — 예외 누적 감지 포함.
- `AbandonProcessGroup`은 현재 플리스트 템플릿(`deploy/launchd.sh:77`)에 있고, 낡은
  플리스트 자동 감지 로직도 이중으로 존재.
- 감시자의 헬스체크 재시도(3회×5초)는 일시적 응답 지연을 죽음으로 오판하지 않는다.
- 프로덕션 빌드: 소스맵 없음, 자산 해시 재현 가능, 캐시 정책(해시 자산 immutable / 나머지
  no-cache·SWR) 설계·구현 일치.
- docs/29 M-3(비밀번호 변경 시 세션 무효화) — 코드로 확정, 닫힘.
- 서버 로그에 비밀번호·세션 토큰·가입 코드 평문 노출 없음(관리자 코드 M-1 제외).
