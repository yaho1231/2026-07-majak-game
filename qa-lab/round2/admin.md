# 관리자 기능 전체 — admin

## 요약
스크립트 14종 · 실대국 30여 판(반장전·동풍전·샌드박스) · **확정 5건 · 의심 1건**.
심각도: 🔴 1 · 🟠 2 · 🟡 2.
**권한 행렬은 전부 통과** — 새 구멍 없음. 발견은 전부 «기능이 약속대로 안 도는 곳»이다.

RoomManager 를 in-process 로 띄우고 FakeSocket 으로 WS 프레임을 주고받는 하네스
(`qa-lab/round2/admin/lab.ts`, SiteDb(":memory:") + mkdtemp 리플레이 디렉터리 —
운영 DB/포트 무접촉) 로 관리자 명령 전 범위를 돌렸다.

### 관리자 명령 전수 목록 (RoomManager.ts 2110–2233 의 case 문에서 추출)
`feedbackUpdate` · `feedbackDelete` · `adminUsers` · `adminAugmentTiers` ·
`adminAnalytics` · `adminDeleteUser` · `adminSetNotice` · `liveGames` ·
`adminAbortGame` · `adminPauseGame` · `adminRoomNotice` · `adminExtendTime` ·
`adminVoidRound` · `spectate` · `spectateStop` · `sandboxStart` · `sandboxGrant` ·
`sandboxReset` · `sandboxViewAs` · `sandboxBotRules` · `sandboxControl`
(+ `replayList`/`replayGet`/`replayShare` 는 관리자면 전 판이 보이는 확장 경로)

## 권한 행렬 — 통과 (버그 없음)
`qa-lab/round2/admin/01-perms.ts` → **61/61 pass**.
19종 관리자 명령 × 3신원(일반 로그인 · 게스트 · 미인증) = 57건 전부 거절되고,
"조용히 무시"가 아니라 명시적 error 가 온다:
- 일반 로그인 → `FORBIDDEN`
- 게스트 → `GUEST_FORBIDDEN` (게이트가 admin 검사보다 앞에 있다)
- 미인증 → `AUTH_REQUIRED`
공격 뒤에도 대상 방은 살아 있고, 서 있지 않고, 전역 공지도 위조되지 않았다.

관리자 플래그 출처: `users.is_admin` (SiteDb). 승급 경로는 **가입 시 adminCode 제출**
하나뿐이다(`SiteDb.register` 848–867). 코드는 128비트 랜덤(`randomBytes(16)`),
비교는 `safeEqual`(타이밍 안전), **성공 시 즉시 회전**(`rotateAdminCode`)해서 유출된
값이 두 번 먹지 않는다. 로그인/토큰 경로에는 승급이 없다. 위조 경로를 찾지 못했다.

## 확정 1. 🔴 결과 화면 중에 누른 «이 국을 물린다»가 **다음 국**을 물린다 (원래 국은 그대로 정산)
- 위치: `packages/core/src/match/HanchanController.ts:695`(요청) / `:1189`(소비) —
  `packages/server/src/RoomManager.ts:4124` `adminVoidRound`
- 기대: 관리자가 «이 국을 물린다»를 누르면 **그 국**이 무효가 된다. 대국자에게
  나가는 안내도 그렇게 말한다 — "관리자가 이 국을 물렸습니다 — 다음 국으로 넘어갑니다".
- 실제: `roundVoid` 플래그는 **`runRound()` 의 awaiting 루프 안에서만** 소비된다
  (`HanchanController.ts:1189`). 국이 이미 끝나 결과 화면이 떠 있는 «국 사이»에는
  루프 밖이라 플래그가 그대로 살아 있고, **다음 국의 첫 결정 지점**에서 소비되어
  다음 국이 시작하자마자 `adminVoid` 도중유국이 된다.
  요청 쪽(`requestRoundVoid`)에도 `room.phase === "playing"` 외의 시점 검사가 없다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/04-voidround.ts`
  ```
  roundOver#0 draw   reason=- round=2 honba=1     ← 물리려던 국. 그대로 정산됐다
  roundOver#1 abort  reason=- round=2 honba=2     ← 엉뚱한 다음 국이 즉시 무효
  roundOver#2 draw   reason=- round=3 honba=3
  FAIL  결과 화면 중에 건 «국 무효»가 다음 국을 즉시 물리지 않는다
  ```
- 영향: 대회 중계에서 오심이 난 국을 물리려고 눌렀는데 **그 국의 점수는 남고**
  **무고한 다음 국이 배패 직후 무효**가 된다(본장만 하나 더 붙는다). 관리자는
  안내 문구를 믿고 "물렸다"고 판단하므로 오심이 그대로 성적에 남는다.
  결과 화면은 사람이 «다음 국» 버튼을 누를 때까지 떠 있어서 노려서 맞히기 쉬운 창이 아니다 —
  오히려 관리자가 «국이 끝난 걸 보고 나서» 누르는 것이 자연스러운 순서다.
- 제안 수정: `runRound()` 가 끝날 때 `this.roundVoid = null` 로 비우고(국 경계에서
  요청을 버린다), `adminVoidRound` 는 결정 루프 밖이면 `NOT_IN_ROUND` 로 거절해
  관리자에게 "이미 끝난 국은 물릴 수 없다"를 알린다.

## 확정 2. 🟠 관전 탁자를 옮기면 앞 탁자의 «정지 중»·«방 공지»가 새 탁자에 그대로 붙는다 — 그리고 «재개» 버튼이 영원히 안 먹는다
- 위치: 클라 `packages/client/src/App.tsx:5739` `onSwitchTable` /
  서버 `packages/server/src/RoomManager.ts:3989` `adminPauseGame`
- 기대: A방을 세워 놓고 멀티테이블 목록에서 B방으로 옮기면, 화면의 «정지 중»
  오버레이와 A방 공지는 사라지고 B방의 실제 상태가 보인다.
- 실제: 두 겹으로 새어 있다.
  1. **클라**: `onSwitchTable` 은 `setRewindAt(null)` 과 `viewBuffer` 만 비우고
     `clearProductions()`(App.tsx:3289 — 여기에 `setPause(null)`·`setRoomNotice(null)` 이 있다)
     를 부르지 않는다. `pause` / `roomNotice` state 가 A방 것 그대로 남는다.
  2. **서버**: 탁자를 옮길 때 앞 방에 대한 `gamePaused(false)` 도 `spectateEnded` 도
     보내지 않는다. 새 방이 안 서 있으면 `gamePaused` 를 아예 안 보내므로
     (`sendPauseState` 는 서 있을 때만 보낸다) 낡은 값을 지울 메시지가 없다.
  3. **못 빠져나온다**: 버튼 라벨은 `spectatePaused={pause !== null}`(App.tsx:5725) 로만
     정해지므로 B방 화면에 «▶ 재개»가 뜨고, 누르면 `adminPauseGame(B, paused:false)` 가
     간다. 서버는 `if (room.paused === paused) return;`(RoomManager.ts:4001)로
     **응답 없이 조용히 무시**한다 → `gamePaused` 가 안 오니 state 가 안 바뀌고
     버튼은 영구히 «재개»에 박힌다. 관전을 완전히 접기 전까지 B방엔 일시정지를 쓸 수 없다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/03-spectate.ts`
  ```
  FAIL  탁자를 옮기면 앞 탁자의 «정지»가 해제되어 전달된다 — gamePaused(false)=false
        spectateEnded=false 받은=["spectateStarted","catalog","view","spectateInsight"]
  FAIL  탁자를 옮기면 앞 탁자의 «방 공지»가 내려간다 — roomNotice("")=false
  FAIL  이미 안 서 있는 방에 재개를 걸면 확인 응답이 온다 (버튼이 복구된다) — 응답=[]
  ```
- 영향: 멀티테이블 중계(D4)에서 한 탁자를 세운 뒤 다른 탁자로 넘어가면 **멀쩡한
  탁자가 정지 오버레이에 덮여 보이고**, A방 공지가 B방 사람들 것처럼 화면에 뜬다.
  관리자 도구가 그 탁자에서 사실상 죽는다.
- 제안 수정: (a) `onSwitchTable` 에서 `setPause(null)`/`setRoomNotice(null)` 을 부른다.
  (b) `spectate` 진입 시 새 방이 안 서 있으면 `gamePaused(false)`·`roomNotice("")` 를
  명시적으로 보내 상태를 확정한다. (c) `adminPauseGame` 의 같은-상태 조기 return 을
  «현재 상태 재전송»으로 바꾼다 — 조용한 무시는 화면을 되돌릴 길이 없다.

## 확정 3. 🟠 전역 공지가 «게임 중인 사람»에게 **화면으로는 절대 닿지 않는다** — 서버만 보내고 클라는 안 그린다
- 위치: `packages/client/src/App.tsx:7146`(AuthScreen) · `:10391`(HomeScreen) —
  `NoticeBanner` 는 이 두 자리에만 있다. 서버 쪽: `RoomManager.ts:2143` `adminSetNotice`
- 기대: `docs/36_BROADCAST_SPECTATOR.md:23` 이 «이미 있는 것»으로 적어 둔 것 —
  "전역 공지 — **게임 중인 사람에게도 상단 띠로 닿는다**". `adminSetNotice` 핸들러의
  주석도 같은 말을 한다: "대기실·게임 중인 사람도 받는다 — `serverInfo`는 화면을
  갈아엎지 않고 상단 띠만 바꾸는 메시지라 판을 방해하지 않는다."
- 실제: 서버는 실제로 전원에게 `serverInfo` 를 민다(테스트로 확인 — 08-users 의
  "게임 중인 사람에게도 serverInfo가 간다" pass). 그런데 **클라이언트가 그리지 않는다**.
  `NoticeBanner` 는 로그인 화면과 홈 화면에만 렌더된다. 대국 화면·대기실에는
  공지를 그리는 자리가 아예 없다. 방 공지(`roomNotice`)는 대국 화면에 자리가 있지만
  (App.tsx:12009) 전역 공지와는 다른 채널이다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/07-static.ts`
  ```
  FAIL  전역 공지 띠가 대국/대기실 화면에도 선다 — 렌더 자리 = AuthScreen:7146, HomeScreen:10391
  ```
  (+ `grep -n "NoticeBanner" packages/client/src/App.tsx` → 7146 / 9723(정의) / 10391 뿐)
- 영향: 전역 공지의 존재 이유가 "점검 5분 전"인데(docs/33:330), 정작 그 5분 동안
  반장전을 두고 있는 사람들에게는 한 글자도 안 보인다. 반장전 한 판이 30~40분이라
  «지금 게임 중인 사람»이 공지가 제일 필요한 집단이다. 관리자는 공지를 세우고
  전달됐다고 믿는다(자기 화면엔 되돌아온다).
- 제안 수정: 대국 화면 상단(관전 띠/방 공지 줄 근처)에 `NoticeBanner` 를 얇게 한 줄
  더 얹거나, `adminSetNotice` 를 게임 중인 좌석에는 `roomNotice` 로도 밀어 준다.

## 확정 4. 🟡 판이 끝나서 관전이 끊기는 길에는 «관전 종료» 감사 로그가 안 남는다 (C3 구멍)
- 위치: `packages/server/src/RoomManager.ts:5560` `endSpectating` (로그·정리 없음) vs
  `:4174` `stopSpectating` (로그 있음 — `:4187`)
- 기대: docs/36 C3 — "관전 시작·**종료(본 시간 포함)**를 서버 로그에 남긴다.
  네 사람의 손패를 전부 내보내는 창을 누가 언제 열었는지가 어디에도 없으면
  나중에 물었을 때 답할 방법이 없다."
- 실제: 관전이 끊기는 길은 둘인데 한쪽만 로그를 남긴다.
  - 사람이 접는다 / 다른 탁자로 옮긴다 → `stopSpectating` → 로그 O
  - **판이 끝난다**(게임 종료 `:5378` · 무효/강제종료 `:5445` · 오류 `:5481` ·
    시작 실패 `:5210`) → `endSpectating` → `conn.spectating = null` 만 하고
    **로그 없음 · `conn.spectateSince` 안 비움 · `conn.spectateTimers` 안 걷음**.
    (`spectating` 이 null 이 됐으므로 뒤이은 `stopSpectating` 도 즉시 return 한다.)
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/12-spectate-end.ts`
  ```
  FAIL  판이 끝나 관전이 끊길 때도 «관전 종료» 감사 로그가 남는다 — (로그에 강제종료만 있다)
  FAIL  ... spectateSince 가 0으로 돌아간다 — spectateSince=1787353470490
  FAIL  ... 지연 송출 대기분(spectateTimers)이 걷힌다 — timers=13
  ```
- 영향: 관전 세션의 **가장 흔한 종료 경로**(판이 끝날 때까지 본다)가 감사 기록에서
  통째로 빠진다. 「누가 그 판을 얼마나 봤나」를 물으면 «시작»만 있고 «종료»가 없어
  본 시간을 답할 수 없다. 남은 지연 타이머 13개는 15초 뒤 스스로 사라지고
  `conn.spectating === room` 검사에 걸려 프레임을 흘리지는 않는다(누수만 있고 유출은 없다).
- 제안 수정: `endSpectating` 안에서 각 conn 에 대해 `stopSpectating` 과 같은 정리
  (로그 + spectateSince/timers/delayMs 비우기)를 한다 — 두 경로가 같은 함수를 타게 한다.

## 확정 5. 🟡 `adminSetNotice` 가 재전송 정책 두 목록 어디에도 없다 — 가드 테스트가 이 메시지를 아예 못 본다
- 위치: `packages/core/src/network/protocol.ts:1214` `AdminSetNoticeMessage` /
  `packages/client/src/resendPolicy.ts` / `packages/client/test/resendPolicy.test.ts:30`
- 기대: resendPolicy.ts 머리말 — "두 목록은 **ClientMessage 전체를 빠짐없이 덮는다**
  (resendPolicy.test.ts가 강제)". protocol.ts 는 같은 실수를 세 군데(`:1140` `:1510`
  `:1524`)에 경고 주석으로 못 박아 두었다.
- 실제: `AdminSetNoticeMessage` 는 **클라이언트 → 서버** 메시지인데 정의가
  `:1214`, 즉 구간 경계 `// ── 서버 → 클라이언트 ──`(`:886`) **뒤**에 있다.
  테스트는 `PROTOCOL.slice(0, end)` 만 훑으므로(`resendPolicy.test.ts:32`) 이 타입을
  보지 못하고, 실제로 `VOLATILE_MESSAGES` 에도 `RESENDABLE_MESSAGES` 에도 없다.
  경고 주석이 가리키는 것과 **정반대 방향**의 같은 실수다.
- 재현: `grep -n "adminSetNotice" packages/client/src/resendPolicy.ts` → 없음.
  `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/07-static.ts` 의
  "adminSetNotice 가 재전송 정책 두 목록 중 하나에 분류돼 있다" FAIL.
- 영향: 런타임 피해는 작다 — `isResendable` 기본값이 false 라 사실상 볼라틸로 동작한다.
  다만 (a) 끊긴 사이 세운 «점검 예고» 공지가 **아무 알림 없이 조용히 사라지고**,
  (b) 이 자리 근처에 새 클라이언트 메시지를 추가하는 사람도 같은 구멍에 빠진다
  — 「전체를 빠짐없이 덮는다」는 불변식이 이미 깨진 채로 통과 중이다.
- 제안 수정: `AdminSetNoticeMessage` 정의를 886 이전(클라이언트 구간)으로 옮기고
  `VOLATILE_MESSAGES` 에 넣는다(전역 공지도 «지금 이 순간»의 조작이다).

## 의심 1. 🟡 `liveGames` 가 연습·체험 방을 아예 안 보여 준다 — 굳은 체험 판을 관리자가 접을 길이 없다
- 위치: `packages/server/src/RoomManager.ts:3659`
  `.filter((r) => r.phase === "playing" && !r.sandbox && !r.guest)`
- 관측: 관전 목록에서 샌드박스·게스트 체험 방을 뺀다(의도된 주석이 붙어 있다).
  그런데 `adminAbortGame`/`adminPauseGame`/`spectate` 는 방 코드만 알면 그 방들에도 닿는다 —
  즉 «조작은 되는데 목록에 안 보이는» 방이 생긴다. 체험 판이 굳으면 관리자는 코드를
  알 길이 없어 손댈 수 없고 유휴 청소만 기다려야 한다.
- 확정 못 한 이유: 체험 판이 실제로 굳는 경로를 이번 라운드에 재현하지 못했다.
  «보이지 않는다»는 사실만 코드로 확인했다.

## 확인했지만 버그가 아니었던 것 (오탐 정리)
- **시간 연장이 안 먹는다** — 오탐. `admin/11-extend.ts` → 2/2 pass.
  정상 진행 중에도, **세워 둔 판에서도** `promptExtended` 가 온다
  (`{"kind":"decision","seat":"p0","deadlineMs":89999}`).
  1차 시도의 02 스크립트가 낡은 프롬프트 좌석을 집어서 `NOT_WAITING` 이 났던 것이다.
- **재개한 판이 국 끝까지 안 간다** — 오탐. `admin/10-resume-deep.ts` 로 **정지 없는 대조군**을
  나란히 돌리니 대조군도 같은 자리에서 40초 타임아웃이 났다(하네스가 느린 것).
  정지→재개 쪽은 오히려 통과했다. 일시정지/재개 자체는 정상이다.
- **샌드박스 누수** — 없다. `admin/13-sandbox-deep.ts` → 7/7 pass. 지정 손패
  (`sandboxReset.hands`)와 지정 증강·`sandboxGrant` 가 실제로 적용되고(손패 11/13 일치,
  나머지 2장은 내 테스트가 잘못된 kindKey `east` 를 보낸 것 — 존댓말 키는 `wind1`),
  샌드박스 판은 전적·리플레이 목록·리플레이 파일·`liveGames` 어디에도 안 남는다.
  실대국 방의 봇 제약은 비어 있고 `SandboxBotAgent` 도 아니다(05 스크립트).
  강제 배패는 표준 34종 kindKey 만 받고 같은 종류 4장·좌석당 상한에서 잘린다
  (`sanitizeSandboxHands`, RoomManager.ts:914).
- **강제 종료 뒷정리** — 깨끗하다(05·06 스크립트 15/15 pass). 리플레이 파일 없음,
  `live_games` 행 없음, 전적 미반영, 참가자는 곧바로 새 방을 만들 수 있다,
  끝난 방·없는 방 재조작은 전부 `ROOM_NOT_FOUND`/`NOT_PLAYING` 로 거절된다.
  세워 둔 판도 강제 종료로 접힌다(`admin/14-concurrent.ts`) — 굳은 방이 남지 않는다.
- **계정 삭제 잔여물** — 깨끗하다(08 스크립트 13/13). 본인 삭제 거절(`CANNOT_DELETE_SELF`),
  세션·친구·친구요청 삭제, 제보는 주인만 끊고 보존, `game_players.user_id` NULL 화,
  열린 연결 강제 축출(`SESSION_REVOKED`), 통계 저장소에서 제거, 남은 판은 계속 굴러간다.
  관리자가 0명이 되는 경로는 없다(자기 자신을 못 지운다).
- **위험 버튼의 확인 절차** — 전부 있다. 강제 종료(App.tsx:5915) · 계정 삭제(:5936) ·
  국 무효(:17955) 모두 `askConfirm({danger:true})` 를 거치고 문구가 결과를 정확히 적는다
  — 단 국 무효의 "지금 국이 도중유국으로 처리되고"는 **확정 1** 상황에서 사실이 아니다.
- **동시 조작** — 두 관리자가 같은 방을 동시에 세워도 이벤트가 하나로 접힌다
  (`14-concurrent.ts`). 관리자가 관전 중 끊겨도 세워 둔 판은 서 있고 남은 관리자가
  풀 수 있다. 정지 중에도 대국자 전원 합의 무효로는 빠져나갈 수 있다(03 스크립트).
- **`feedbackDelete`** — case 문에 admin 게이트가 없어 보이지만 `SiteDb.deleteFeedback`
  (SiteDb.ts:1098) 이 `!user.isAdmin && cur.userId !== user.id` 를 막는다. 정상.

## 덜 본 범위
- `adminAnalytics` 의 **숫자 정확성** — 응답이 온다는 것만 확인했다(하네스에 집계기가 없다).
- 관전 송출 딜레이(C1) 15초를 건 상태에서의 «정지→즉시 재개» 순서 뒤집힘.
- 리플레이 열람의 관리자 확장 경로(`sendReplayList` 의 `user.isAdmin` 분기, :3811)는
  권한만 확인했고 내용(전 판이 실제로 보이는가·공유 토큰)은 안 봤다.
- 오버레이 모드(D2)·즉시 리플레이(D3) 관리자 UI.

## 재현 스크립트
전부 `qa-lab/round2/admin/` 에 있다.
실행: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/admin/<파일>.ts`

| 파일 | 내용 | 결과 |
|---|---|---|
| `01-perms.ts` | 권한 행렬 19명령×3신원 | 61/61 pass |
| `02-pause.ts` | 정지·공지·연장·무효·종료의 경계 | 21/23 (2건은 오탐) |
| `03-spectate.ts` | 탁자 전환·동시 재개·관리자 끊김 | 7/10 → **확정 2** |
| `04-voidround.ts` | 국 무효 타이밍 | 0/1 → **확정 1** |
| `05-sandbox.ts` · `13-sandbox-deep.ts` | 샌드박스 적용·누수 | 19/19 pass |
| `06-cleanup.ts` · `08-users.ts` | 강제종료 뒷정리·계정 삭제 | 16/16 pass |
| `07-static.ts` | 정적 검사(공지 렌더 자리·재전송 정책·감사 로그) | 0/4 → **확정 2·3·4·5** |
| `09-resume.ts` · `10-resume-deep.ts` · `11-extend.ts` | 재개 완주(대조군)·시간 연장 | 오탐 확인용 |
| `12-spectate-end.ts` | endSpectating 뒷정리 | 1/4 → **확정 4** |
| `14-concurrent.ts` | 관리자 2명 경합·정지 중 강제종료 | 3/4 (1건은 무효한 검사) |
