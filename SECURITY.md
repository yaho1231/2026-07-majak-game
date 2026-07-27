# MAJAK 보안 가이드

이 문서는 MAJAK 서버(`@majak/server`)의 위협 모델과 **현재 구현된 방어**, 그리고
**앞으로 필요한 작업**을 구분해 정리한다. 배포 구조는 `DEPLOYMENT.md` 참조.

배포 형태: Cloudflare Tunnel 뒤 `HOST=127.0.0.1` 로컬 바인드, 단일 포트에서
HTTP(정적 SPA) + WebSocket. TLS(wss)는 Cloudflare 엣지가 종단한다.

---

## 0. 신뢰 경계 — 리버스 프록시 뒤에서 반드시 알아야 할 것

**모든 원격 남용 방어는 "실제 클라이언트 IP"를 키로 삼는다.** 그런데 Cloudflare
Tunnel(또는 nginx)이 `127.0.0.1:3011`로 포워딩하므로, 서버가 보는 소켓 주소
(`req.socket.remoteAddress`)는 **모든 접속자에게 127.0.0.1**이 된다.

`isLoopbackIp()`는 루프백을 원격 남용 방어에서 면제하므로(로컬 개발·테스트 편의),
프록시 뒤에서 IP 복원을 하지 않으면 아래 방어가 **전원에게 조용히 꺼진다**:
IP당 동시 연결 상한 · 메시지 토큰버킷 · 인증 무차별대입 IP 제한 · 방 생성 IP 제한.

→ 해결: `TRUST_PROXY=cloudflare`. `index.ts`의 `clientIpOf()`가 `CF-Connecting-IP`로
실제 IP를 복원한다. **스푸핑 방지**: 소켓 상대가 루프백일 때만 헤더를 신뢰하므로,
외부에서 포트에 직접 붙어 헤더를 위조해도 그 연결의 소켓 주소는 루프백이 아니라
헤더가 무시된다. (`xff` 모드도 지원 — X-Forwarded-For 마지막 홉.)

**실측 검증**: 인증 없이 WS를 열고 `{"type":"ping"}` 200개를 즉시 보낸다. `pong`이
정확히 `MSG_BUCKET_CAPACITY`(80)개면 IP 복원·토큰버킷 정상, 200개 전부면 면제 상태다.

---

## 1. 구현된 방어 (Implemented)

### 연결 계층 (`index.ts`)
- **오리진 허용목록** (`ALLOWED_ORIGINS`) — 핸드셰이크(upgrade) 단계에서 목록 밖
  Origin을 `403`으로 거부(101을 내주기 전에 차단, WS 세션 자원 미할당). CSWSH 방어.
  비브라우저 클라이언트는 Origin이 없어 통과하므로 인증 수단이 아니다 — 인증은 토큰이 담당.
- **하트비트** (`HEARTBEAT_INTERVAL_MS`, 기본 30s) — 주기적 ping, 다음 주기까지 pong이
  없으면 `terminate()`. 좀비 소켓이 연결 상한 슬롯을 영구 점유하는 것을 막는다.
- **프레임 크기 상한** — `maxPayload` 512KB (ws 기본 100MiB로 이벤트 루프 마비 방지).
- **정적 응답 보안 헤더** — CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, 경로 탈출 차단(dist 밖 접근 403).

### 세션·연결 상태 (`RoomManager.ts`)
- **동시 연결 상한** — 전체 `MAX_CONNECTIONS`(300), IP당 `MAX_CONNECTIONS_PER_IP`(16).
- **메시지 레이트리밋** — 연결당 토큰버킷(용량 80, 초당 40 리필). 초과분은 조용히 드롭.
- **비정상 패킷 종료** — 기형 JSON·비객체·`type` 없음을 위반으로 계상, `MAX_PROTOCOL_VIOLATIONS`(3)회 시 `1008` 종료.
- **미인증 유예** — `UNAUTH_TIMEOUT_MS`(30s) 안에 로그인 없으면 소켓 회수. 로그아웃 시 재무장.
- **인증 게이트** — `ping`/`register`/`login`/`tokenLogin`/`logout` 외 모든 메시지는 로그인 필요(`AUTH_REQUIRED`).
- **재인증 좌석 정리** (`detachSeat`) — 이미 인증돼 방/좌석을 가진 연결이 다시 로그인하면
  이전 좌석을 분리해 대기실 유령 좌석 누수를 막는다.
- **송신 백프레셔** — `send()`가 `bufferedAmount > MAX_BUFFERED_BYTES`(4MB)면 연결을
  `terminate()`. 응답을 안 읽는 느린/악의적 소비자의 메모리 고갈 방지(예: `replayGet` 반복).

### 인증·계정 (`RoomManager.ts`, `SiteDb.ts`)
- **인증 레이트리밋** — 연결당 `AUTH_MAX_ATTEMPTS`(12/60s) + IP당 `AUTH_IP_MAX_ATTEMPTS`(30/60s,
  연결 재생성 우회 차단). `TRUST_PROXY` 설정 시에만 IP 제한이 실효.
- **인증 필드 길이 상한** (`MAX_AUTH_FIELD_LEN` 256) — 거대 문자열로 scrypt·DB 비용 부풀리기 차단.
- **비밀번호 저장** — scrypt + 사용자별 랜덤 salt(평문 저장 금지), `timingSafeEqual` 비교.
- **로그인 타이밍 균일화** — 계정이 없어도 더미 scrypt를 돌려 응답 시간으로 계정 유무를 구분 못 하게.
- **scrypt 동시성·큐 상한** — 동시 `MAX_SCRYPT_CONCURRENCY`(4) + 대기 큐 `MAX_SCRYPT_QUEUE`(64) 초과 시 거부.
- **세션 토큰** — 256비트(randomUUID + 16B), 로그인 후 비밀번호 재전송 없음, TTL(기본 30일), 사용자당 세션 수 상한.
- **가입 게이트** (`SIGNUP_CODE`) — 설정 시 코드를 아는 사람만 회원가입.
- **계정 삭제 시 소켓 축출** — 열린 세션 강제 종료.

### 방·자원 (`RoomManager.ts`)
- **방 생성 제한** — IP당 `ROOM_CREATE_MAX_PER_IP`(20/10분) + 전체 `MAX_ROOMS`(200) 상한.
- **계정당 동시 1방** — 이미 방/게임 중이면 새 방 생성 거부.
- **관전 권한** — `spectate`/`liveGames`/`adminUsers`/`adminDeleteUser`는 `isAdmin` 확인.
  본인이 참가 중인 방은 관전 불가(전원 손패·산 노출 = 완전정보 치트 방지).

### 게임 무결성 (`core`)
- 게임 진행은 서버 권위(Action→Event→Effect→GameState). 클라이언트가 보낸 `action`은
  서버가 제시한 합법 옵션과 대조해서만 수락(payload는 1회만 stringify — 반복 직렬화 DoS 방지).
- 결정론적 시드 PRNG(core에서 `Math.random` 금지) — 리플레이 재현·검증 가능.
- SQL은 전부 파라미터 바인딩(인젝션 없음).

---

## 2. 앞으로 필요한 작업 (TODO / 권장)

우선순위 순. 다중 에이전트 보안 감사(2026-07-21)에서 도출.

1. **관리자 가입 코드 강화** (MEDIUM) — 현재 코드는 재사용 가능·평문·매 부팅 로그 출력이라,
   한 번 유출되면 누구든 무기한 관리자로 자가 승급할 수 있다. 권장: **첫 관리자 계정 생성 후
   코드 무효화**, 또는 env로 옮기고 로그 미출력 + 회전. (운영 방식 결정 필요.)
2. **회원가입 계정 열거 완화** (MEDIUM) — 회원가입 응답이 닉네임 존재를 오류 메시지·응답
   시간으로 노출. 가입 게이트로 완화되나, 타이밍 균일화(로그인처럼 더미 비용) 권장.
3. **연결 수립 속도 제한** (LOW, `TRUST_PROXY` 적용 시 완화됨) — 동시 개수만 제한하고
   초당 신규 연결 수는 제한하지 않는다. IP당 16 동시 상한으로 단일 IP 영향은 제한되나,
   전역 300 슬롯에 대한 연결/초 제한을 추가하면 더 견고하다.
4. **서버 재시작 시 진행 중 게임 복구** (기능) — core `reconstructGame`/`resume`은 구현·테스트됨.
   서버 자동 저장·복구 배선만 남음. 현재는 재시작 시 진행 중 게임 소실(완료 리플레이만 보존).
5. **`maxPayload` 하향 검토** — 게임 메시지 실사용은 수 KB. 512KB → 32~64KB로 낮추면 공격면 축소.

---

## 3. 운영 체크리스트

- [ ] `deploy/majak.env`에 `TRUST_PROXY=cloudflare`·`HOST=127.0.0.1`·`ALLOWED_ORIGINS` 설정됨
- [ ] 부팅 로그에 `신뢰 프록시 : cloudflare` / `허용 오리진 : …` / `하트비트 …` 출력 확인
- [ ] `SIGNUP_CODE` 설정(가입 게이트 켜짐)
- [ ] 서버가 `127.0.0.1:3011`에만 바인드(외부에 평문 포트 직접 노출 없음)
- [ ] 포트포워딩 제거됨(터널로만 접속)
- [ ] 실측: ping 200개 → pong 80개(IP 방어 작동), 악성 Origin → 403, 기형 패킷 → 1008
