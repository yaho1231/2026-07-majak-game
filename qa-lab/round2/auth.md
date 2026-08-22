# 계정 (가입·로그인·세션·비밀번호·게스트) — auth

## 요약

- 코드 정독: `packages/server/src/SiteDb.ts`(전체), `RoomManager.ts` 인증·게스트·레이트리밋 경로,
  `packages/client/src/App.tsx` 로그인/가입 화면·계정 카드·재전송 큐, `resendPolicy.ts`,
  `docs/15_ACCOUNTS_SITE.md`, `docs/29`, `docs/31`, `docs/33`.
- 실측: FakeSocket + 실제 `RoomManager`/`SiteDb`(임시 DB·임시 리플레이 디렉터리)로 7종 스크립트.
  **운영 체크아웃·운영 DB·운영 서버는 건드리지 않았다.** 브라우저 자동화 미사용.
- 스크립트: `qa-lab/round2/auth/harness.ts`, `probe1.ts` ~ `probe7.ts`
  (`/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/auth/probeN.ts`)
- 커버리지: 가입 규칙 18종 · 비밀번호 규칙 6종 · 세션(발급·TTL·로그아웃·재사용·상한 10)
  · 비밀번호 변경 · 다른 기기 로그아웃 · 게스트(시작·이어하기·전환·방 예산) · 레이트리밋
  · DB 평문 검사 · 클라이언트 폼.
- **확정 7건 · 의심 3건**

기존 테스트(`LoginAndAdmin` · `PasswordChangeLogin` · `Security` · `Guest` · `AnonConnections`)와
`docs/29 M-3`, `docs/31 10-2`, `docs/33 §10-2` 를 대조해 중복은 제외했다.

---

## 확정 1. 🔴 비밀번호 변경·«다른 기기에서 로그아웃»이 **열려 있는 소켓을 끊지 못한다** — 침입자의 탭이 그대로 산다

- 위치: `packages/server/src/RoomManager.ts:1741-1789` (`changePassword` / `logoutOthers` 처리),
  `packages/server/src/SiteDb.ts:729-790`
- 기대: `SiteDb.changePassword` 주석 — *"비밀번호를 바꾸는 이유는 대개 '누가 내 계정을 봤을지도
  모른다'이고, 그때 필요한 것은 새 비밀번호가 아니라 **남의 손에 있는 세션이 죽는 것**"*.
  홈 계정 카드도 그대로 적는다 — *"비밀번호를 바꾸면 **다른 기기의 로그인이 전부 끊깁니다**"*
  (`App.tsx:10103`). `logoutOthers`도 *"다른 기기 N곳의 로그인을 끊었습니다"* 라고 답한다.
- 실제: 끊기는 것은 **DB의 `sessions` 행뿐**이다. `conn.user`는 인증할 때 한 번 캐시되고 다시
  검증되지 않으므로(같은 파일 `evictUser` 주석이 바로 그 사실을 적고 있다), **이미 열려 있는
  WebSocket은 아무 일도 겪지 않는다.** 침입자의 탭은 방 만들기·대국·리플레이 열람·제보·친구
  관리를 계속할 수 있고, 계정이 관리자라면 관리자 권한(전 계정 조회·삭제, 전 리플레이,
  완전정보 관전)도 그대로 유지된다. 소켓을 닫을 때까지 무기한이다.
- 재현: `tsx qa-lab/round2/auth/probe1.ts` (③④), `probe4.ts` (⑬')
  ```
  === ③ 비밀번호 변경 뒤에도 침입자의 열린 소켓이 그대로 산다 ===
  침입자 로그인: true
  [srv] 피해자 비밀번호 변경 — 다른 세션을 전부 끊었다
  침입자 소켓 닫힘?: false
  침입자가 계속 쓸 수 있는가: ["roomCreated","joined","lobby","replayList"]

  === ④ logoutOthers — 열린 소켓은 안 끊긴다 ===
  logoutOthers: {"code":"SESSIONS_CLEARED","message":"다른 기기 1곳의 로그인을 끊었습니다"}
  다른 기기 소켓 닫힘?: false
  다른 기기 여전히 사용 가능: {"type":"roomCreated","code":"TVDLPK"}
  ```
- 경계(확인함): 침입자가 **옛 비밀번호로 다시 바꾸는 것**은 막힌다
  (`probe4.ts` ⑬' → `PASSWORD_CHANGE_FAILED "지금 비밀번호가 올바르지 않습니다"`).
  즉 계정을 영구 탈취당하지는 않지만, **회수가 목적인 두 기능이 목적을 달성하지 못한다.**
- 영향: 공용 PC에 로그인한 채 두고 온 사람이 «다른 기기에서 로그아웃»을 눌러도 그 PC의
  탭이 살아 있는 한 아무 소용이 없다. 비밀번호 유출을 눈치채고 바꾼 사람도 마찬가지다.
  화면이 "끊었습니다"라고 단언하기 때문에, **회수했다고 믿게 만드는 것**이 더 나쁘다.
- 제안 수정: 이미 있는 도구를 쓰면 된다 — `evictUser`(`RoomManager.ts:3706`)와 같은 방식으로
  해당 `user.id`의 연결을 훑어, `changePassword`는 **지금 이 연결만 남기고** 나머지를,
  `logoutOthers`도 같은 기준으로 끊는다(`c.user = null; c.sessionToken = null;`
  + `SESSION_REVOKED` + `ws.close()`). `logoutOthers`의 반환값(`removed`)도 DB 행 수가 아니라
  실제로 끊은 세션 수로 세는 편이 문구와 맞는다.

---

## 확정 2. 🟠 `guestPlay` 뒤에 `login`/`register`가 오면 `conn.guest`가 안 풀린다 — 로그인은 됐는데 홈이 전부 거부당하는 «게스트 감옥»

- 위치: `packages/server/src/RoomManager.ts:2405-2429` (`applyAuth` — `conn.guest`를 손대지 않는다)
- 기대: 인증이 성공하면 그 연결은 그 계정의 연결이다. 게스트 화이트리스트
  (`GUEST_ALLOWED_MESSAGES`)는 계정 없는 연결에만 걸려야 한다.
- 실제: `applyAuth`는 `conn.user`/`conn.sessionToken`만 갈아 끼우고 `conn.guest`를 `false`로
  되돌리지 않는다. 그래서 게스트였던 연결이 `login`·`register`·`tokenLogin`으로 진짜 계정에
  인증돼도 `conn.guest === true`가 남고, 라우터의 게스트 게이트(`:1849`)가 그대로 걸린다.
  클라이언트는 `authOk`에 `guest` 필드가 없으므로 **정상 로그인으로 판단해 홈을 그린다** —
  그 홈의 모든 카드가 `GUEST_FORBIDDEN`으로 거절된다. 비밀번호 변경은 `AUTH_REQUIRED`다.
  덤으로 `onlineMap`·`pushFriends`·`inviteFriend`가 `c.guest`를 건너뛰므로 이 사람은
  **친구 목록에서 오프라인으로 보이고 초대도 받지 못한다.**
- 재현 (**실제 클라이언트로 도달 가능한 순서**): `resendPolicy.RESENDABLE_MESSAGES`에
  `guestPlay`와 `login`·`register`가 **둘 다** 있다(`resendPolicy.ts:77`). 연결이 끊긴
  사이 «바로 한 판»을 누르고 이어서 «로그인»을 누르면, 재연결 때 `flushPendingSends`가
  이 순서 그대로 내보낸다.
  `tsx qa-lab/round2/auth/probe6.ts`
  ```
  최종 authOk: {"type":"authOk","username":"미리가입","isAdmin":false,"sessionToken":"3b91…"}
  로그인했는데 홈 기능 전부: ["GUEST_FORBIDDEN","GUEST_FORBIDDEN","GUEST_FORBIDDEN","GUEST_FORBIDDEN","AUTH_REQUIRED"]
  성공 응답: []
  유령 체험 방: 1 개 (phase: playing)
  ```
  `tsx qa-lab/round2/auth/probe1.ts` (①②) 는 `guestPlay → register` 와 `guestPlay → tokenLogin`
  두 경로가 모두 같은 상태에 빠지는 것을 보인다.
- 영향: 이름은 제 계정으로 뜨는데 통계·리플레이·리더보드·제보·친구·방 만들기가 전부
  거절 토스트만 뱉는다. 새로고침(=새 연결) 전에는 풀 길이 없고, 사용자에게는 "로그인은
  됐는데 아무것도 안 된다"로 보인다.
- 제안 수정: `applyAuth` 첫머리에 `conn.guest = false;` 와 (게스트 방을 붙들고 있었다면)
  `this.dropGuestRoom(conn)`. 함께 `guestPlay`/`guestResume`가 이미 인증된 연결을 막듯,
  `login`/`register`/`tokenLogin`도 게스트 상태를 명시적으로 정리하고 지나가야 한다.

---

## 확정 3. 🟠 체험 방이 유령으로 남아 `MAX_GUEST_ROOMS` 예산을 영구히 문다

- 위치: `RoomManager.ts:2405`(`applyAuth`→`detachSeat`, 게스트 방을 접지 않는다),
  `RoomManager.ts:4380-4425`(`guestResume`, 이 연결이 붙들고 있던 앞 방을 접지 않는다),
  청소 경로 `RoomManager.ts:1150-1181`
- 기대: 손님 방은 언제나 그 방을 연 연결 하나가 붙들고 있고, 그 연결이 놓으면 사라진다
  (`dropGuestRoom` 주석·`docs/15 §2b` — *"연결당 게스트 방은 하나지만(새 `guestPlay`는 앞 판을 접는다)"*).
- 실제: 그 규칙을 지키는 곳은 `logout`과 `guestPlay`뿐이다. 연결이 **끊기지 않은 채**
  신원만 바뀌면(확정 2의 경로) 방은 `phase: "playing"` + `controller !== null` + `holdUntil === null`
  로 남는다. 유휴 청소는 이 조합을 **의도적으로 건너뛴다**(진행 중인 판은 손대지 않는다) —
  즉 봇 셋이 사람 자리의 90초 타임아웃을 매 결정마다 소모하며 판이 끝날 때까지 방 예산을 문다.
  `guestResume`으로 다른 방에 갈아탈 때도 같다.
- 재현: `tsx qa-lab/round2/auth/probe4.ts` (⑯)
  ```
  === ⑯ 게스트→가입 반복으로 체험 방 예산이 새는가 ===
  남은 방 수: 5 그중 guest: 5
  phase: playing,playing,playing,playing,playing
  ```
  `probe3.ts` (⑫): `guestResume`으로 갈아탄 뒤에도 앞 방이 그대로 남는다 (방 수 2 → 2).
- 영향: `MAX_GUEST_ROOMS = 16`. 유령 방 16개면 **랜딩의 «바로 한 판»·«튜토리얼»이 전부
  "체험 게임이 가득 찼습니다"로 막힌다** — 계정 없는 방문자가 이 게임을 보는 유일한 문이다.
  각 방은 봇 3명이 계속 도는 CPU도 함께 먹는다(`docs/15 §2b`: 게스트 판 하나 ≈ 코어 1.5%).
- 제안 수정: `applyAuth`/`guestResume`에서 이 연결이 붙들고 있던 게스트 방을 `dropGuestRoom`
  한다(확정 2의 수정과 같은 자리). 보수적으로는 유휴 청소에서 "사람 좌석의 소켓이 이 방을
  더는 가리키지 않는 게스트 방"에 `holdUntil`을 세우는 길도 있다.

---

## 확정 4. 🟡 중복 확인이 레이트리밋에 걸리면 **답이 아예 없다** — 버튼이 «확인 중…»에 영구 고착

- 위치: `RoomManager.ts:1676-1697` (`checkUsername` — `rateLimited`면 `return`, `usernameCheck`를
  보내지 않는다), `packages/client/src/App.tsx:5631` (`setNameCheck({username, state:"checking"})`),
  `App.tsx:7288`(그 상태에서 버튼 `disabled`)
- 기대: 눌렀으면 답이 오거나, 답이 못 오면 버튼이 풀려야 한다(로그인 버튼에는 12초 그물이 있다).
- 실제: `RATE_LIMITED`(또는 `NO_DB`·`INTERNAL`)일 때 `usernameCheck`가 오지 않는다. 클라이언트에는
  `nameCheck`를 되돌리는 코드가 한 줄도 없다 — 그 닉네임에 대해 «중복 확인»은 영영 `disabled`
  «확인 중…»이다. 닉네임을 고쳤다가 되돌려도 같은 문자열이라 그대로 갇힌다. 새로고침만이 답이다.
- 재현: `tsx qa-lab/round2/auth/probe5.ts` (⑱)
  ```
  usernameCheck 응답: 12 RATE_LIMITED: 4
  중복확인 12회 뒤 로그인: {"code":"RATE_LIMITED","message":"인증 시도가 너무 많습니다…"}
  ```
- 영향: 중복 확인은 인증과 **같은 창**(연결 12회/분)을 태운다 — 설계 의도이고 그 자체는 문제가
  아니지만, 그 문턱을 넘는 순간 화면이 고장 난 것처럼 보인다. 위 출력의 둘째 줄대로
  **중복 확인을 12번 누르면 그 사람은 1분간 로그인도 못 한다**(그 거절은 폼에 뜨긴 한다).
- 제안 수정: 클라이언트의 `error` 처리에서 `nameCheck?.state === "checking"`이면 `setNameCheck(null)`
  로 풀어 준다. 또는 로그인 버튼과 같은 12초 그물을 `nameCheck`에도 건다.

---

## 확정 5. 🟡 로그인·가입 폼에 `autoComplete`도 `<form>`도 없다 — 비밀번호 관리자가 저장·자동입력을 못 한다

- 위치: `packages/client/src/App.tsx:7270-7350` (닉네임·비밀번호·비밀번호 확인 `<input>`)
- 기대: 계정 카드의 비밀번호 변경 칸은 이미 제대로 하고 있다 —
  `autoComplete="current-password"` / `"new-password"` (`App.tsx:10110,10118,10126`).
- 실제: 정작 **로그인·가입 폼**에는 `autoComplete`가 하나도 없고 `<form>`도 아니다
  (파일 전체에서 `autoComplete`는 3건, 전부 계정 카드). 브라우저·1Password류는 제출을
  감지하지 못해 "이 비밀번호를 저장할까요?"를 띄우지 않고, 자동입력 대상으로도 잡기 어렵다.
- 재현: `grep -n "autoComplete\|<form" packages/client/src/App.tsx` → 10110 / 10118 / 10126 뿐.
- 영향: 이 서버의 비밀번호 정책은 8자 이상·PIN 금지다. 저장이 안 되면 사람은 **기억할 수 있는
  약한 비밀번호**를 고르고, 잊으면 되찾을 길이 없다(비밀번호 재설정 경로가 없는 제품이다).
- 제안 수정: 닉네임 칸에 `autoComplete="username"`, 로그인 비밀번호에 `"current-password"`,
  가입 비밀번호/확인에 `"new-password"`. 가능하면 `<form onSubmit>`으로 감싸면 엔터 처리도
  덤으로 정리된다.

---

## 확정 6. 🟡 공백만으로 이루어진 비밀번호가 통과한다

- 위치: `packages/server/src/SiteDb.ts:704-716` (`passwordProblem` — 길이·숫자전용·닉네임포함만 본다)
- 기대: `docs/15 §2` — "비밀번호 8자 이상 + 숫자 전용 금지 + 닉네임 포함 금지". PIN을 막은
  이유(온라인 무차별 대입 완화)가 그대로 적용되는 값이다.
- 실제: `"        "`(스페이스 8개)가 가입·로그인 모두 통과한다. 클라이언트 규칙 셋도 같이 통과시킨다.
- 재현: `tsx qa-lab/round2/auth/probe5.ts` (⑲)
  ```
  가입: {"type":"authOk","username":"공백맨",…}
  로그인: true
  ```
- 영향: 낮다(스스로 고르는 값이다). 다만 붙여넣기 사고로 만들어지기 쉽고, 그 계정은
  사실상 비밀번호가 없는 것과 같다.
- 제안 수정: `passwordProblem`에 `password.trim() === ""` 거부 한 줄. (비밀번호 자체를 trim하지는
  않는다 — 그건 기존 계정을 깨뜨린다.)

---

## 확정 7. 🟡 `changePassword`·`logoutOthers`의 입력 검증·레이트리밋 구멍

- 위치: `RoomManager.ts:1741-1789`
- (a) `changePassword`는 `msg.currentPassword`/`msg.newPassword`의 **타입도 길이도 보지 않는다**
  (`register`/`login`은 `withinAuthFieldLimit`으로 본다). 비문자열을 보내면 `node:crypto`의
  `scrypt`가 `ERR_INVALID_ARG_TYPE`으로 던지고, `INTERNAL`로 응답하면서 **스택 트레이스가
  서버 로그에 찍힌다** — 로그인한 연결이면 누구나 로그를 오염시킬 수 있다.
- (b) `logoutOthers`에는 `rateLimited(conn)`가 없다(같은 자리의 `changePassword`에는 있다).
  요청 하나가 `sessions` COUNT 2회 + DELETE 1회다.
- 재현: `tsx qa-lab/round2/auth/probe7.ts`
  ```
  currentPassword = {"a":1} → {"code":"INTERNAL","message":"비밀번호를 바꾸지 못했습니다"}   (+ 서버 로그에 스택)
  currentPassword 60KB     → {"code":"PASSWORD_CHANGE_FAILED","message":"지금 비밀번호가 올바르지 않습니다"}
  ```
  `tsx qa-lab/round2/auth/probe5.ts` / `probe3.ts` (⑮): `logoutOthers` 200회 중 `RATE_LIMITED` **0건**.
- 영향: 낮다(메시지 토큰버킷과 64KB 프레임 상한이 최악을 막는다). 그래도 인증 계열 메시지가
  검증·레이트리밋의 예외로 남아 있는 것은 다음 사람이 그대로 베낄 자리다.
- 제안 수정: `changePassword`에 `typeof` + `withinAuthFieldLimit` 검사, `logoutOthers`에 `rateLimited`.

---

## 의심 1. #358의 잔여 구멍 — 늦게 온 답이 «최신 제출의 탭»에 앉는다

`AuthScreen`은 실패 사유의 임자를 `sentFrom`(ref) 하나로 판정하고, 그 값은 **제출할 때** 덮인다
(`App.tsx:6963-6975`). 그래서 «가입 제출 → (답 오기 전) 연결 끊김으로 `sending` 해제
(`App.tsx:7003`) → 로그인 탭으로 이동 → 재연결로 큐의 `register`가 다시 나감(`resendPolicy` ②)
→ 로그인 제출(`sentFrom = "login"`) → 뒤늦은 `REGISTER_FAILED` 도착» 이면 «가입 코드가
필요합니다»가 다시 로그인 탭 아래에 선다. 코드 주석이 정확히 이 시나리오를 걱정하고 있는데,
ref 한 칸으로는 **여러 요청이 겹칠 때**를 못 가린다. 서버 스크립트로는 클라이언트 상태를
못 만들어 확정하지 못했다 — 제출마다 시퀀스를 붙여 응답과 짝지어야 완전히 닫힌다.

## 의심 2. 계정 카드의 비밀번호 칸에 엔터가 없다

`App.tsx:10106-10130` 세 칸 모두 `onKeyDown` 없음. 로그인·가입 폼은 엔터로 제출된다
(`App.tsx:7277` 등). 같은 제품 안에서 갈리는 것이라 「엔터를 쳤는데 아무 일도 없다」가 된다.
사소하지만 확정 5의 `<form>` 도입으로 함께 해결된다.

## 의심 3. `checkUsername`은 계정 존재를 **즉답**한다

`usernameProblem`은 `register`가 열거 오라클을 막으려 scrypt 뒤로 미룬 판정을 그대로 즉시
돌려준다(`SiteDb.ts:790-812`의 ⚠ 주석이 이미 인정하고, 대책은 "같은 레이트리밋 창"이다).
IP당 30회/분이면 하루 4만 개 이름을 훑을 수 있다. 닉네임은 리더보드에도 뜨는 공개값이라
새 정보는 아니지만, 「가입 코드가 필요한 초대제 서버」에서도 이 창구는 계속 열려 있다.
설계 판정 사항으로 남긴다.

---

## 확인했고 **문제 없음** (재보고 방지용 기록)

- 닉네임 규칙 18종 스윕(`probe2.ts` ⑦): 1자·13자·앞뒤공백·자모(`ㅋㅋ`)·결합문자·내부공백·
  개행·제로폭공백·전각·수학기호·이모지 전부 거절. `bot_*`·예약어(`admin`,`__proto__`…) 거절.
  대소문자 중복 가입 차단(`COLLATE NOCASE`), 대소문자 로그인은 통과하고 **정본 닉네임**이 돌아온다.
- 비밀번호 규칙: 7자·숫자전용·닉네임포함 거절, 73자는 길이 상한(72)에 걸린다.
- 세션: TTL 만료 후 `loginByToken` 거부 + 행 삭제, 로그아웃 뒤 토큰 재사용 불가(`TOKEN_INVALID`),
  사용자당 12회 로그인 후 살아 있는 토큰 정확히 10개(`MAX_SESSIONS_PER_USER`).
- 로그인 실패 문구는 계정 존재를 흘리지 않는다("닉네임 또는 비밀번호가…"), 없는 계정에도
  더미 scrypt 비용을 치른다.
- 레이트리밋: 연결당 로그인 시도 12회에서 정확히 차단(`probe3.ts` ⑮).
- 저장: DB 파일·WAL에 **비밀번호 평문 없음**, 파일 권한 0600. (세션 토큰은 평문이지만
  `SiteDb.ts` 주석·`docs/15`가 이미 알고 감수한 설계다.)
- 대국 중 비밀번호 변경: 좌석·방·재접속이 그대로 유지되고 `authOk`에 `resumeRoom`을 싣지 않아
  클라이언트가 방 기억을 지우지 않는다(`probe4.ts` ⑰).
- 대기실에 앉은 채 다른 계정으로 갈아타면 앞 좌석은 정상적으로 정리된다(`probe5.ts` ⑳).
