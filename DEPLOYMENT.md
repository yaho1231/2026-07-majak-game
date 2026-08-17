# 이능마작 배포 가이드

이능마작은 **단일 포트**에서 HTTP(빌드된 SPA 정적 서빙) + WebSocket(실시간 게임)을
함께 서빙한다. 따라서 포트포워딩 1개 + 리버스 프록시(TLS) 1개면 공개 배포가 된다.

- 코드 상태: **배포 준비 완료** (프로덕션 부팅·정적 서빙·SPA 폴백·WS·경로탈출 차단 확인,
  테스트 316개 통과, 4패키지 타입체크·클라 빌드 통과).
- 서버는 `tsx` 로더로 TypeScript를 런타임 실행한다(별도 컴파일 산출물 없음).
  → 프로덕션에서도 `tsx`가 필요하므로 `--omit=dev`로 설치하지 말 것(현재 tsx는 dependencies).

---

## 0. 현재 프로덕션 배포 — Cloudflare Tunnel (2026-07-21~)

실서비스는 **Cloudflare Tunnel**로 운영한다. `https://majak.yaho1231.com` → 터널 →
`http://127.0.0.1:3011`. TLS(wss)는 Cloudflare 엣지가 종단하므로 **포트포워딩·인증서
관리가 필요 없고**, 홈 IP도 노출되지 않는다. 하나의 터널(`yaho1231`)이 마작(majak.)과
대시보드(gol.)를 함께 서빙한다.

```
브라우저 ──HTTPS/WSS──▶ Cloudflare ──Tunnel──▶ 맥미니 127.0.0.1
                         ├─ gol.yaho1231.com   → :8501 (deeplolDiscord 대시보드)
                         └─ majak.yaho1231.com → :3011 (이 서버)
```

**구성 요소**
- ingress: `~/.cloudflared/config.yml` (호스트명 → 로컬 포트 매핑, 매칭 안 되면 404)
- 자동 시작: LaunchAgent `~/Library/LaunchAgents/com.yaho1231.cloudflared.plist`
  (`KeepAlive`로 죽으면 재시작, 로그인 시 시작). 로그: `~/Library/Logs/cloudflared-yaho1231.log`
- 서버 설정: `deploy/majak.env`에 `HOST=127.0.0.1`, `TRUST_PROXY=cloudflare`,
  `ALLOWED_ORIGINS=https://majak.yaho1231.com`, `PUBLIC_HOST=majak.yaho1231.com`

**⚠️ 필수 — `TRUST_PROXY=cloudflare`**: 터널이 127.0.0.1로 포워딩하므로 서버가 보는
소켓 주소는 **모든 접속자에게 127.0.0.1**이다. 이 값이 없으면 IP 기반 방어(연결 상한·
요청 제한·인증 무차별대입 차단·방 생성 제한)가 **전원에게 무력화**된다. 서버는
`CF-Connecting-IP`로 실제 IP를 복원하되, 소켓이 루프백일 때만 헤더를 신뢰해 위조를 막는다.
검증: 부팅 로그에 `신뢰 프록시 : cloudflare` 확인. 보안 상세는 `SECURITY.md`.

**Cloudflare 대시보드 설정 (SSL/TLS → Edge Certificates, 2026-07-21 적용·검증)**
- `Always Use HTTPS` **ON** — 없으면 `http://majak.yaho1231.com`이 리다이렉트 없이 평문 200을
  준다. 평문 페이지는 MITM이 JS를 바꿔치기할 수 있고 CSP `connect-src`가 `ws: wss:`로 열려 있어
  WS를 임의 호스트로 돌릴 수 있다(단 `ALLOWED_ORIGINS`가 https만 허용해 로그인 자체는 막힌다).
- `HSTS` **ON**, max-age 6개월. `includeSubDomains`·`Preload`는 **끔** — 전자는 존의 다른
  서브도메인이 HTTP면 6개월간 접속 불가, 후자는 되돌리는 데 수개월 걸려 실수 복구가 안 된다.
- `No-Sniff Header` ON (서버도 보내지만 CF 자체 응답에도 붙는다).

**검증 명령** (배포·설정 변경 후 이걸로 확인한다):
```bash
curl -sSI http://majak.yaho1231.com/  | head -3          # 301 → https 여야 함
curl -sSI https://majak.yaho1231.com/ | grep -i strict-  # strict-transport-security: max-age=15552000
# WS 오리진 게이트: 정상 101 / 위조·평문 오리진 403
curl -sSi -N --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  -H "Origin: https://majak.yaho1231.com" https://majak.yaho1231.com/ | head -1
```

**터널 재구성이 필요할 때**(도메인 변경 등):
```bash
cloudflared tunnel login                              # 브라우저 인증(존 선택)
cloudflared tunnel create <이름>                      # 터널 + 자격증명 생성
# ~/.cloudflared/config.yml 에 ingress 작성 후:
cloudflared tunnel route dns <이름> majak.<도메인>    # CNAME 생성
cloudflared tunnel ingress validate                   # 설정 검증
launchctl kickstart -k gui/$(id -u)/com.yaho1231.cloudflared
```

> 아래 1~7절은 **대안(직접 포트포워딩 + Caddy/nginx)** 참고용이다. 현재 운영에는 쓰지 않는다.

---

## 1. 사전 준비 (대안: 직접 포트포워딩 방식)

- **Node.js 22+** (내장 `node:sqlite` 사용).
- 서버로 향하는 **도메인** (DuckDNS 등 동적 DNS 가능).
- 라우터에서 **80·443 → 서버**로 포트포워딩 (리버스 프록시가 받는다).
- (내부 전용/테스트면 리버스 프록시 없이 `http://<서버IP>:3001`로도 접속 가능하나,
  공개 시 WSS를 위해 TLS 종단을 반드시 둔다.)

## 2. 빌드 & 실행 — 전용 실행 스크립트(권장)

공개 배포는 **설정 파일 + 전용 래퍼**로 한다. 포트·가입코드 등을 매번 타이핑하지 않아도 된다.

```bash
cd /path/to/newMajak
npm install                                   # 워크스페이스 전체(서버 런타임 tsx 포함) 설치
cp deploy/majak.env.example deploy/majak.env  # 설정 복사 후 값 채우기(PORT·SIGNUP_CODE 등)
npm run serve                                 # 클라 빌드 → 서버 시작 (majak.env 설정 주입)
```

`deploy/majak.env`(gitignore됨 — 비밀 보관)에 `PORT`·`SIGNUP_CODE`·`INTER_ROUND_DELAY_MS`·
`PUBLIC_HOST` 등을 적으면, 래퍼(`deploy/serve.sh`)가 이를 환경변수로 주입해 서버를 띄운다.
시작 시 공개 주소(`http://PUBLIC_HOST:PORT`)와 포트포워딩 안내를 출력한다.

운영 명령:

```bash
npm run serve:status    # 실행 상태·포트
npm run serve:logs      # 서버 로그 (관리자 코드·가입 게이트 상태도 여기)
npm run serve:restart
npm run serve:stop
```

> 설정 파일 없이 즉석 실행하려면 환경변수를 직접 줘도 된다:
> `PORT=3011 SIGNUP_CODE=코드 npm start` (= `scripts/majak.sh`, 순수 실행/로컬용).
> `npm start`/`npm stop`은 설정 파일을 읽지 않는 순수 실행이다(로컬·개발).

### 환경변수 (그대로 서버로 전달)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3001` | HTTP+WS 포트 |
| `DB_PATH` | `replays/majak.db` | 계정·세션·게임 인덱스(SQLite) |
| `CLIENT_DIST` | `../client/dist` | 정적 SPA 경로 |
| `SESSION_TTL_MS` | 30일 | 세션 토큰 수명 |
| `INTER_ROUND_DELAY_MS` | `7000` | 국 사이 결과 화면 대기 상한(사람 전원이 닫으면 그전에 진행) |
| `SIGNUP_CODE` | (없음) | **가입 게이트** — 설정하면 이 코드를 아는 사람만 회원가입 가능 |

예: `PORT=3011 SIGNUP_CODE=친구들만아는코드 npm start`

## 2-1. 보안 (평문 HTTP 포트 방식에서 챙기기)

포트 방식은 대시보드처럼 **평문 HTTP**라 TLS(wss)가 없다. 로그인 비밀번호가 전송 중
암호화되지 않으므로, 아래로 위험을 크게 줄인다.

1. **가입 게이트(`SIGNUP_CODE`) 켜기 — 가장 중요.** 코드를 아는 사람만 계정을 만들 수
   있어 무단 가입·계정 탐색·자동 봇 가입을 막는다. (부팅 로그에 `가입 게이트 : 켜짐` 확인)
   - 이미 있는 보호: scrypt+salt 비밀번호 저장, 연결당 인증 레이트리밋(60초 12회),
     256비트 세션 토큰(로그인 후 비밀번호 재전송 없음), 세션 TTL.
2. **이능마작 전용 비밀번호 사용 권장.** 평문 구간이 있으니 다른 서비스와 같은 비밀번호 금지.
   (공지해 두면 됨.)
3. **포트는 눈에 안 띄는 번호로**(예: 8501 옆 흔한 번호 대신). 약한 방어지만 스캔 노이즈를 줄인다.
4. **(선택) 공유기 방화벽 IP 허용목록.** 친구들 IP가 고정이면 그 IP만 3011 포트에 접근
   허용하면 사실상 사설망 수준이 된다.
5. **더 챙기려면 → B(cloudflared 터널)로 언제든 무중단 전환 가능** — 포워딩 없이 자동
   HTTPS/WSS. (도메인을 Cloudflare에 올려야 하거나, 임시 `trycloudflare.com` URL 사용.)

## 3. 리버스 프록시로 TLS(wss) 종단 — Caddy 권장(자동 TLS)

가장 간단한 방법은 Caddy다. 인증서 자동 발급/갱신 + WS 업그레이드 프록시를 알아서 한다.

```bash
# deploy/Caddyfile.example의 your-domain.example을 실제 도메인으로 바꾼 뒤
caddy run --config deploy/Caddyfile.example
```

`deploy/Caddyfile.example` 핵심은 단 한 줄이다:

```
your-domain.example {
    reverse_proxy localhost:3001
}
```

> nginx를 쓰면 `location / { proxy_pass http://localhost:3001; proxy_http_version 1.1;
> proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }`로
> WebSocket 업그레이드 헤더를 반드시 전달해야 한다.

클라이언트는 same-origin으로 접속하므로(`wss://도메인`) 별도 클라 설정이 필요 없다.

## 4. 첫 관리자 계정

서버 첫 부팅 시 콘솔에 **관리자 가입 코드**가 출력된다(`npm run logs`로 확인).
회원가입 시 그 코드를 입력하면 관리자 계정이 되어 진행 중 게임 관전 등이 가능하다.

## 5. 배포 확인

1. `https://도메인` 접속 → 로그인/회원가입 화면.
2. 회원가입(관리자 코드 선택) → 방 만들기 → 봇 3 추가 → 게임 시작.
3. 개발자 도구 네트워크에서 WebSocket이 `wss://도메인`(same-origin)으로 연결되는지 확인.

## 6. 데이터 & 백업

- 계정/게임 인덱스: `DB_PATH`(기본 `replays/majak.db`). 서버가 부팅할 때 이 파일과
  `-wal`/`-shm` 곁파일을 **0600으로 조인다** — 세션 토큰이 평문으로 들어 있다.
- 리플레이 JSONL·통계: `replays/`.

### 백업 — 자동

```
npm run agents:install     # 감시자 + 매일 04:30 백업 등록
npm run backup             # 지금 한 번
npm run backup:verify      # 마지막 백업이 진짜 열리는지 검사
```

### 무엇을 담는가 (2026-08-18 실측)

| 대상 | 크기 | 내용 | 보관 |
|---|---|---|---|
| `majak.db` | 144 KB (gzip 48 KB) | 계정·세션·게임 인덱스·제보 | 14 세대 |
| `stats.json` | 256 KB | **플레이어 34명의 누적 전적** — 화료율·방총률·평균순위·판수 | 14 세대 |
| `stats.augments.json` | 12 KB | 증강별 실전 성적 + 티어 오프셋 (20판마다 도는 밸런스 자동 조정의 기억 전체) | 14 세대 |
| `replays/*.jsonl` | 21 MB (462판) | 판별 전체 이벤트 로그 — 리플레이 재생의 원본 | 누적 |

**총 ~21 MB.** 대부분이 리플레이고, 판마다 파일 하나씩 늘어난다(한 판 ≈ 46 KB).

⚠ **누적 전적은 SQLite가 아니라 JSON 파일에 있다.** 처음 이 스크립트를 쓸 때 이 둘을
빠뜨렸고, DB 스냅샷만 보고 "백업이 있다"고 믿을 뻔했다 — DB만 복구해도 전적은 0이 된다.
`packages/server/test/BackupCoverage.test.ts` 가 이 누락을 막는다.

`scripts/backup.sh` 가 하는 일:

1. `sqlite3 .backup` 으로 **일관된** DB 스냅샷을 뜬다. 서버가 돌고 있어도 안전하다.
   ⚠ `cp majak.db` 는 쓰지 마라 — WAL 모드라 최근 커밋이 `-wal` 에만 있어 **손상된
   스냅샷**이 만들어지고, 복구하려는 날에야 그걸 알게 된다.
2. 스냅샷을 열어 `PRAGMA integrity_check` + 테이블 개수를 확인한다. 검사하지 않은
   백업은 백업이 아니다.
3. 저널 모드를 DELETE로 바꾸고 gzip 한다(보관본은 곁파일 없이 혼자 완결되게).
4. `replays/*.jsonl` 을 증분 미러한다. `--delete` 는 **쓰지 않는다** — 원본에서
   사라진 것이 사본에서도 사라지면 백업의 의미가 없다.
5. `stats.json`·`stats.augments.json` 은 JSON 파싱을 확인한 뒤 날짜를 붙여 복사한다.
   이 둘은 **덮어쓰기로 갱신**되므로(리플레이와 달리 불변이 아니다) 세대를 남긴다 —
   마지막 하나만 두면 손상된 저장이 그대로 유일본이 된다.
6. DB·통계 스냅샷은 `BACKUP_KEEP`(기본 14) 세대만 남긴다.

설정은 `deploy/majak.env` 의 `BACKUP_DIR`·`BACKUP_KEEP`.
★ `BACKUP_DIR` 은 되도록 **다른 물리 디스크**(외장/NAS)를 가리켜라. 같은 디스크 안의
사본은 실수 삭제만 막고 디스크 고장은 막지 못한다. 같은 디스크면 백업할 때마다 경고한다.

### 복구

```
gunzip -c ~/majak-backups/db/majak-<날짜>.db.gz > /tmp/restore.db
sqlite3 /tmp/restore.db 'PRAGMA integrity_check;'      # ok 확인
npm stop                                                # 서버 정지
cp /tmp/restore.db replays/majak.db                     # 곁파일은 지운다
rm -f replays/majak.db-wal replays/majak.db-shm
npm start
```

리플레이는 `~/majak-backups/replays/` 에서 `replays/` 로 복사하면 된다(파일명이 곧 키다).
**누적 전적도 잊지 마라** — 이걸 빼면 계정은 살아 있는데 전적만 0이 된다:

```
cp ~/majak-backups/stats/stats-<날짜>.json           replays/stats.json
cp ~/majak-backups/stats/stats.augments-<날짜>.json  replays/stats.augments.json
```

## 6-1. 자동으로 도는 것들

```
npm run agents:install     # 감시자 + 백업 한 번에 등록
npm run agents             # 등록 여부 + **실제로 도는지** + 마지막 백업 시각
npm run agents:uninstall
```

| 에이전트 | 주기 | 하는 일 |
|---|---|---|
| `watchdog` | 로그인 시 + 60초 | `/healthz` 점검, 응답 없으면 서버를 세운다. **RunAtLoad 라 이것이 재부팅 후 자동 기동 경로다** |
| `backup` | 매일 04:30 | DB 스냅샷 + 리플레이 미러 |

- **등록됐다 ≠ 돈다.** `agents:install` 은 등록 직후 한 번 강제 실행해 **종료코드까지**
  확인한다. 2026-08-17 감사에서 감시자가 "설치돼 있다"고 문서에 적혀 있는데 실제로는
  한 번도 돈 적이 없었다(TCC 차단, 로그 파일 자체가 없었다). `npm run agents` 도 등록
  여부가 아니라 마지막 실행의 종료코드를 본다.
- **TCC 함정**: 저장소가 `~/Documents`·`~/Desktop`·`~/Downloads` 아래면 launchd로 뜬
  프로세스의 파일 접근이 막혀 에이전트가 exit 126으로 죽는다. 해결:
  ```
  bash deploy/relocate.sh ~/majak     # 권장 — 원인 자체를 없앤다
  ```
  또는 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에 `/bin/bash` 추가
  (이 권한은 launchd·cron으로 도는 **모든** 셸 스크립트에 적용된다는 점을 알고 켤 것).
- **LaunchAgent는 로그인 세션에서만 돈다.** 재부팅 후 자동 로그인이 꺼져 있으면 로그인
  전까지 서버도 없다. 무인 운용을 원하면 시스템 설정 → 사용자 및 그룹 → 자동 로그인.

## 6-2. 알림 — 조용한 실패를 없앤다

감시자가 재시작을 포기했거나, 다시 세우기에 실패했거나, 백업이 실패하면 알린다.

- 항상: `.majak/alerts.log` + macOS 알림 센터
- 선택: `deploy/majak.env` 에 `NOTIFY_WEBHOOK_URL`(Discord/Slack) — 맥 앞에 없을 때
  이게 유일한 통로다.

`/healthz` 는 예외 발생 횟수를 함께 낸다. 5분 안에 예외가 5번을 넘으면 `ok:false` + HTTP 500이라
감시자가 "응답은 오는데 정상이 아니다"를 구분한다 — 예전에는 예외를 삼키고도 계속
`ok:true` 를 내서 좀비 상태를 아무도 몰랐다.

## 7. 알려진 한계 (배포에 지장 없음)

- **서버 재시작 시 진행 중 게임 복구 미배선**: 코어 `reconstructGame`/`HanchanController.resume`은
  구현·테스트됨(리플레이 기반). 서버 자동 저장·복구 배선만 남음(설계 결정 필요). 재시작하면
  진행 중이던 게임은 사라지고 완료된 리플레이/통계만 남는다.
- 밸런스는 실플레이 데이터로 계속 조정 예정(증강 65종).
