# MAJAK 배포 가이드

MAJAK은 **단일 포트**에서 HTTP(빌드된 SPA 정적 서빙) + WebSocket(실시간 게임)을
함께 서빙한다. 따라서 포트포워딩 1개 + 리버스 프록시(TLS) 1개면 공개 배포가 된다.

- 코드 상태: **배포 준비 완료** (프로덕션 부팅·정적 서빙·SPA 폴백·WS·경로탈출 차단 확인,
  테스트 316개 통과, 4패키지 타입체크·클라 빌드 통과).
- 서버는 `tsx` 로더로 TypeScript를 런타임 실행한다(별도 컴파일 산출물 없음).
  → 프로덕션에서도 `tsx`가 필요하므로 `--omit=dev`로 설치하지 말 것(현재 tsx는 dependencies).

---

## 1. 사전 준비

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
2. **MAJAK 전용 비밀번호 사용 권장.** 평문 구간이 있으니 다른 서비스와 같은 비밀번호 금지.
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

- 계정/게임 인덱스: `DB_PATH`(기본 `replays/majak.db`).
- 리플레이 JSONL·통계: `replays/`.
- 백업은 `replays/` 디렉터리(+DB)만 보관하면 된다.

## 7. 알려진 한계 (배포에 지장 없음)

- **서버 재시작 시 진행 중 게임 복구 미배선**: 코어 `reconstructGame`/`HanchanController.resume`은
  구현·테스트됨(리플레이 기반). 서버 자동 저장·복구 배선만 남음(설계 결정 필요). 재시작하면
  진행 중이던 게임은 사라지고 완료된 리플레이/통계만 남는다.
- 밸런스는 실플레이 데이터로 계속 조정 예정(증강 65종).
