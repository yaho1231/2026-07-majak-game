# 서버 · 관리자 · 관전/중계 — 수정 보고 (QA 2차)

담당 범위: `qa-lab/round2/server.md`(확정 3 + 의심 1) · `admin.md`(확정 5) · `spectate.md`(확정 7)
\+ 이어받은 것: `rules.md` 확정 3 · `onboard.md` 확정 2·4 · `lobby.md` 확정 1·2·3·4.

**총 22건 수정.** 손댄 곳은 전부 서버·코어(`packages/server/src/**`,
`packages/core/src/match/HanchanController.ts`, `.../network/protocol.ts`,
`.../information/PlayerView.ts`, `scripts/**`) + 그 회귀 테스트다.

---

## 대회에 관전 기능을 쓸 수 있는가 — **갱신된 판정: 예. 쓸 수 있다.**

`spectate.md`의 원래 판정은 **「조건부 아니오 — 확정 1을 고치기 전에는 쓰면 안 된다」**
였다. 그 확정 1(🔴 완전정보 부정행위)을 포함해 **확정 7건 전부를 고쳤고, 재현 스크립트로
사라진 것을 확인했다.**

| spectate 확정 | 원래 판정에서의 위치 | 지금 |
|---|---|---|
| 1 🔴 완전정보 부정행위 | **막는 것** | 고침 (두 겹으로) · `s04`·`s05` OK |
| 4 🟠 정지 중 재접속 → 결과 화면 소멸 | 대회를 망칠 것 | 고침 · `s15` 대조군/재접속 **양쪽 OK** |
| 6 🟠 재시작이 정지·공지를 지운다 | 대회를 망칠 것 | 고침 · `s18a/b` **7/7 OK** |
| 2 🟠 중계 샹텐 34% 오표기 | 대회를 망칠 것 | 고침 · 실서버 **372건 대조 0 어긋남** |
| 3 🟠 증강 좌석의 두 숫자 | 대회를 망칠 것 | 고침 (좌석별 옵션을 관전 뷰에 실었다) |
| 5 🟠 지연 관전석이 마지막 N초를 잃음 | 감수 가능 | 고침 · `s02` 종료 뒤 대기분 6→26장 도착 |
| 7 🟡 결과 화면 도중 합류 | 감수 가능 | 고침 · `s11` OK |

### 그래도 남는 것 — **코드로는 못 막는 운영 조건**
원 보고서의 「남은 위험 목록」은 대부분 그대로다. 대회 전에 **운영 수칙으로** 정해야 한다.

1. **관리자 권한이 곧 완전정보 열쇠다.** 확정 1을 고쳐도 «관리자 = 전 손패 열람» 구조는
   그대로다. 이번에 «한 소켓은 좌석이거나 관전석이거나, 둘 다는 아니다»를 불변식으로
   못 박았지만, **탭을 하나 더 열면** 그 소켓은 별개다. 대회 운영자 계정과 선수 계정을
   **물리적으로 분리**하고, 관전 감사 로그(C3)를 대회 후 대조해야 한다.
   — 다만 그 감사 로그는 이번에 **실제로 완전해졌다**(admin 확정 4: 종료가 없는 시작만
   쌓이던 문제). 이제 「누가 그 판을 얼마나 봤나」에 답할 수 있다.
2. **딜레이는 부정행위를 늦출 뿐 막지 못한다.** 중계를 보는 사람이 선수에게 전달하면 그만이다.
3. **이어하기는 6시간(`RESUME_MAX_AGE_MS`)까지다.** 대회가 밤을 넘기면 이어하기 자체가 없다.
   (정지·공지가 재시작을 넘는 것은 이번에 고쳤지만, 그 위의 시한은 그대로다.)
4. **«관전 N명»은 사람 수가 아니라 연결 수다.** 대회 화면에 띄운다면 오해를 부른다.
5. **중계 보조값은 추정이다.** 예상 타점은 `plan: null`로 계산한다 — 이제 좌석별 증강
   규칙은 반영하지만(확정 3), 화면의 «추정» 표기는 남아 있어야 한다.
6. **4탁 동시 렌더는 없다**(D4 ◐). 여러 탁을 번갈아 볼 수는 있어도 동시에는 못 본다.

### 클라이언트에 남은 한 건 (내 범위 밖 — 이미 다른 담당자가 처리)
admin 확정 2의 클라 절반(`onSwitchTable`에서 `setPause(null)`·`setRoomNotice(null)`)과
확정 3(대국 화면의 전역 공지 띠)은 **클라이언트 담당자가 이미 고쳐 커밋했다** —
`07-static.ts`가 `GameNoticeBanner:9972`와 `onSwitchTable` 본문을 확인해 준다.

---

# 1. server.md — 확정 3건 + 의심 1건

## 확정 1 🔴 끝난 판이 `live_games`에 되살아나 재시작 후 다시 서고 전적이 두 배가 된다
- **고침**: `Room.finished` 깃발. `onGameOver` **맨 앞**에서 세우고 `resetRoomAfterGame`이
  내린다. `rememberLiveGame`과 `sweepIdleRooms`가 함께 본다. `startGame`에서도 내려 둔다.
  (`resetRoomAfterGame`을 앞당기지 않았다 — `finishStats`가 `room.agents`를 훑어야 한다.)
- **회귀**: `packages/server/test/LiveGameResurrect.test.ts` — `statsStore.record`를 손으로
  붙들어 «정산 중» 창에 정확히 세운 뒤 청소를 돌린다. 확률에 기대지 않는다.

## 확정 2 🟠 다른 탭으로 재접속하면 옛 탭이 아무 통보 없이 좀비가 된다
- **고침**: `detachStaleConns`가 옛 연결에 `SESSION_REPLACED`를 보낸다. `:action` 게이트의
  `conn.agent?.` 옵셔널 체이닝을 풀고 `NOT_IN_ROOM`으로 답한다.
- **소켓은 닫지 않았다.** `evictOtherSessions`와 다른 점을 주석에 적었다: 여기서 무효가 된
  것은 좌석 하나뿐이고 계정은 멀쩡하다. 닫으면 클라이언트가 `activeRoomRef`로 자동
  재입장을 시도해 **두 탭이 서로를 끊는 핑퐁**이 된다.
- **회귀**: `packages/server/test/DualTab.test.ts`

## 확정 3 🟠 감시자가 «살아 있지만 응답 없는 서버»를 복구하지 못하면서 «다시 세움 완료»라고 보고한다
- **고침**: `scripts/watchdog.sh`의 복구를 `serve.sh start` → **`serve.sh restart`**.
  (`restart`는 빌드가 성공했을 때만 교체하므로 «빌드 깨진 커밋에 서버가 내려간 채로 남는»
  옛 함정은 그대로 피한다.)
- **회귀**: `packages/server/test/WatchdogRecovery.test.ts`

## 의심 1 🟡 `adminExtendTime`이 남은 시간을 누적해 무한이 된다 → **확정으로 올려 고침**
- **고침**: `HumanAgent.EXTEND_LEFT_MAX_MS`(= 기본 30초 + 한 번 상한 120초 = 150초) 천장.
  결정·드래프트 양쪽에 같은 천장. 이미 천장 위면 **줄이지 않는다**(연장이 단축이 되면 더 나쁘다).
  `adminExtendTime` 로그가 요청한 초가 아니라 **결과**를 적는다.
- **회귀**: `PauseGame.test.ts` — 40번 연타해도 천장을 안 넘고, 천장을 지나면 판이 다시 흐른다.

---

# 2. admin.md — 확정 5건

## 확정 1 🔴 결과 화면 중에 누른 «이 국을 물린다»가 다음 국을 물린다
- **고침**: `HanchanController.inRound` — `runRound()`가 껍데기가 되어 국 경계에서 켜고
  끄면서 `roundVoid`를 **비운다**(늦게 온 요청은 다음 국에 떠넘기지 않고 버린다).
  `requestRoundVoid()`가 `boolean`을 돌려주고, `adminVoidRound`가 `NOT_IN_ROUND`로
  「이미 끝난 국은 물릴 수 없다」를 관리자에게 되돌린다.
- **재현 확인**: `admin/04-voidround.ts` **0/1 → 1/1 pass**
- **회귀**: `packages/core/test/HanchanPause.test.ts` 2건(국 안에서 건 요청은 받아들여진다 /
  국 사이 요청은 거절되고 다음 국을 안 물린다)

## 확정 2 🟠 관전 탁자를 옮기면 앞 탁자의 «정지 중»·«방 공지»가 새 탁자에 붙고 «재개»가 안 먹는다
- **고침(서버 몫 셋)**: ① `sendPauseState`가 «서 있을 때만»이 아니라 **언제나 사실**을
  보낸다. ② `spectate` 진입 시 `sendPauseState` + `sendRoomNotice(clearIfNone=true)`로
  두 값을 확정해 덮어쓴다. ③ `adminPauseGame`의 같은-상태 조기 return을 **현재 상태
  재전송**으로 바꿔, 조용한 무시가 관리자 화면을 «▶ 재개»에 가두지 않게 했다.
- **재현 확인**: `admin/03-spectate.ts` **7/10 → 9/10**
  - 남은 1건 「동시 재개 두 번이 이벤트 하나로 접힌다」는 **이 수정의 의도된 결과**다.
    보고서의 제안 (c)가 정확히 「조용한 무시를 현재 상태 재전송으로 바꾼다」였고, 그래서
    두 번째 호출자도 확인 응답(`gamePaused`)을 받는다. 판의 상태 변화는 여전히 한 번뿐이고
    (`setPaused` 1회 · 로그 1줄), 브로드캐스트에는 `by`가 붙고 확인 응답에는 안 붙어
    구분된다. **그 스크립트 줄의 기대값이 낡았다.**
- **회귀**: `packages/server/test/AdminSpectateState.test.ts`

## 확정 3 🟠 전역 공지가 게임 중인 사람에게 화면으로 닿지 않는다
- **클라이언트 담당자가 이미 고쳤다** (`GameNoticeBanner`). 서버는 원래 정상이었다.

## 확정 4 🟡 판이 끝나서 관전이 끊기는 길에는 «관전 종료» 감사 로그가 없다
- **고침**: `releaseSpectator(conn, room, flushDelayed)` 하나로 두 길을 모았다 —
  `stopSpectating`(사람이 접는다)과 `endSpectating`(판이 끝난다)이 같은 함수를 탄다.
  감사 로그 · `spectateSince` · `spectateTimers` · `spectateDelayMs` 정리가 전부 한자리다.
- **재현 확인**: `admin/12-spectate-end.ts` **1/4 → 4/4 pass**
- 참고: `admin/07-static.ts`의 같은 항목은 여전히 FAIL이지만 **정적 grep의 한계**다 —
  `endSpectating()` 본문에 `log` 호출이 있는지를 문자열로 찾는데, 로그는 그 함수가 부르는
  `releaseSpectator` 안에 있다. 동작은 12번 스크립트가 확인한다(로그·본 시간·타이머 전부).

## 확정 5 🟡 `AdminSetNoticeMessage`가 재전송 정책 두 목록 어디에도 없다
- **고침**: `protocol.ts`에서 정의를 **클라이언트→서버 구간**으로 옮겼다(`AdminRoomNoticeMessage` 옆).
  경고 주석에 함정 하나를 적어 뒀다 — 구간 경계 문자열을 주석에 그대로 다시 쓰면 그 문자열로
  구간을 자르는 검사가 **여기서 잘려** 아래 메시지를 통째로 못 보게 된다(막으려던 구멍을 다른
  모양으로 다시 뚫는 셈). `VOLATILE_MESSAGES` 등재는 클라이언트 쪽에서 이미 됐다.

## 의심 1 🟡 `liveGames`가 연습·체험 방을 안 보여 준다 → **손대지 않았다**
목록에서 빼는 것은 의도된 동작이고(주석이 있다), 「체험 판이 굳는 경로」가 재현되지 않았다.
지금 고치면 근거 없이 관전 목록에 체험 판을 노출하는 쪽이 된다. 다음 라운드로 남긴다.

---

# 3. spectate.md — 확정 7건

## 확정 1 🔴 관전 중인 연결이 그대로 좌석에 앉는다 (완전정보 부정행위)
**세 겹으로 막았다.** 지키는 불변식 한 줄: **한 소켓은 좌석이거나 관전석이거나, 둘 다는 아니다.**

1. **앉는 문을 하나로 모았다** — `RoomManager.sitDown(conn, room, agent)`. 방에 앉는 세 길
   (게임 중 재접속 · 대기실 재착석 `reseat` · 새 착석 `seat`)이 전부 여기를 지나고,
   그 안에서 `stopSpectating(conn)`을 부른다. `detachSeat`(일어날 때)의 대칭이 없던 것이
   원인이었다.
2. **관전 입구의 «내 방» 판정을 넓혔다** — `isActiveHuman`(= `!isAbandoned`)만 보던 것을
   «`canRejoin`인 내 좌석이 있는가»까지. 60초 끊겨 `abandoned`가 돼도 그 자리는
   «비어 있는 자리»가 아니라 «내가 언제든 돌아갈 내 자리»다.
3. **좌석을 든 연결은 관전을 시작할 수 없다** (원 보고서의 (b), `s05`) — 앉는 쪽만 막으면
   순서를 바꿔 같은 곳에 도착한다(대국 중에 다른 방 관전을 켜면 한 소켓에 두 뷰가 섞인다).
- **재현 확인**: `s04-self-spectate.ts` **OK**(이탈 확정 뒤에도 거절) ·
  `s05-crossroom.ts` **FAIL 2건 → OK**
- **회귀**: `packages/server/test/SpectateBroadcast.test.ts` 2건

## 확정 2 🟠 중계 샹텐이 «한 장 버린 뒤의 최선»이 아니다 (34% 오표기)
- **고침**: `spectateInsight.ts`에 `bestShanten()` — 클라이언트 좌석 뱃지와 **같은 셈**
  (모든 버림 후보의 최소값). 같은 종류는 한 번만 재는 최적화를 넣어 `s12`가 잰 비용 예산
  (1회 0.44ms) 안에 남는다.
- **재현 확인**: 새로 만든 `s06b-insight-verify.ts` — **실서버가 보낸 `spectateInsight`**
  372건을 좌석 뱃지 셈과 대조해 **어긋남 0건**.
  (기존 `s06`/`s10`은 서버 메시지를 읽지 않고 로컬에서 두 공식을 비교하는 **계측**이라
   서버를 고쳐도 숫자가 그대로다 — 그래서 검증용 스크립트를 하나 더 만들었다.)
- **회귀**: `packages/server/test/SpectateInsight.test.ts` (실측에서 어긋났던 손 그대로 사용)

## 확정 3 🟠 중계 패널이 증강의 화료형 규칙을 무시한다
- **고침**: `PlayerView`에 `seatScoringOptions?: Record<PlayerId, DecomposeOptions>`를
  **관전 뷰에만** 싣는다(대국자 뷰에는 `undefined` — 남의 화료형은 남의 손 정보다).
  `spectateInsight`가 좌석마다 그 옵션으로 샹텐과 **예상 타점**(`estimateHandValue.opts`)을 잰다.
  보유 증강은 관전자에게 이미 전부 공개된 정보라 새로 여는 것은 없다.
- **회귀**: `SpectateInsight.test.ts` — 5멘쯔 좌석은 자기 규칙으로, 옆 좌석은 표준으로.

## 확정 4 🟠 정지 중 재접속이 결과 화면 대기를 먹는다
**두 자리였다.** `reconnect`만 고쳤을 때 실서버에서 여전히 샜다.
- `HumanAgent.reconnect()` — 국간 대기 재무장에 `paused` 검사가 없었다. → 정지 중이면
  표식(`pausedContinue`)만 세우고 `setPaused(false)`가 다시 걸게 한다.
- `HumanAgent.noticeDisconnect()` — **진짜 경로**. 「화면 뒤에 아무도 없는데 기다릴 이유가
  없다」며 국간 대기를 **즉시** 해소한다(2026-08-08 QA 2-6에서 일부러 넣은 것). 그 근거가
  정지 중에는 성립하지 않는다 — 결과 화면을 띄워 놓고 **해설하려고** 운영자가 세운 것이고
  보고 있는 사람은 좌석이 아니라 중계석이다.
- **재현 확인**: `s15-pause-consumes-wait.ts`
  - 재접속: `재개 후 첫 새 뷰까지 35ms → 20035ms` (**FAIL → OK**)
  - 대조군: `20013ms` (그대로 OK)
  - 단위: `s03-pause-continue.ts` `정지 중인데 국간 대기가 스스로 풀렸는가: true → false`
- **회귀**: `PauseGame.test.ts` 4건(정지 중 재접속 / 정지 중 끊김 + 각 대조군)

## 확정 5 🟠 지연 관전석이 게임 종료 시 마지막 N초를 잃는다
- **고침**: `Conn.spectateTimers`를 `Set<Timeout>` → `Map<Timeout, ServerMessage>`
  (삽입 순서가 곧 송출 순서다). `releaseSpectator(…, flushDelayed)`가 길을 가른다 —
  **운영자가 접으면 버리고**(C1의 원래 뜻: 창을 닫은 뒤에도 남의 손패가 날아가면 안 된다),
  **판이 끝나면 원래 순서대로 흘려보낸다**. `endSpectating`은 순서를 «밀린 프레임 →
  마지막 사건 → 끝났다는 말»로 맞춘다.
- **재현 확인**: `s02-delay-end.ts` — 종료 뒤 도착 프레임 `before=5 after=5`(전부 폐기)
  → **`before=6 after=26`**(대기분 도착), 순서도 `view … gameAborted spectateEnded`.
- **회귀**: `SpectateBroadcast.test.ts` 2건(끝나면 흘린다 / 접으면 버린다)

## 확정 6 🟠 서버 재시작이 «정지»와 «방 공지»를 지운다
- **고침**: `live_games`에 `paused` · `pause_reason` · `notice` · `notice_expires_at`
  네 열을 ALTER로 붙였다(이 저장소가 이미 쓰는 방식 — `share_token`과 같은 자리).
  `adminPauseGame`·`adminRoomNotice`가 `rememberLiveGame`을 부르고, `restoreLiveGame`이
  방 값을 채운 뒤 컨트롤러에 `setPaused(true)`를 건다(같은 문을 쓴다).
  - **공지 시한은 절대 시각으로 적는다.** 남은 시간(상대값)을 적으면 되살아난 공지가
    재시작마다 그만큼 더 살아 있게 된다 — 「5분 뒤 재개」가 재시작 한 번에 다시 5분이 되면
    예고가 아니다. 이미 지난 공지는 복원 쪽이 버린다.
  - 열이 붙기 전에 쓰인 행(NULL)은 «세워 두지 않았다»로 읽는다 — 모르는 것을 정지로
    해석하면 되살아난 판이 이유 없이 굳는다.
- **재현 확인**: `s18a`(정지 + 1시간 공지) → 프로세스 종료 → 재기동 → `s18b`
  **3 FAIL → 7/7 OK**. 공지의 남은 시한도 `ttlMs=3576150`으로 **줄어든 채** 살아 있다.
- **회귀**: `SpectateBroadcast.test.ts` 3건(정지·공지 복원 / 시한부 공지 / 안 세운 판)

## 확정 7 🟡 결과 화면 도중에 붙은 관전자가 결과를 못 본다
- **고침**: `HanchanController`가 `lastRoundOverMsg`·`lastRoundUra`를 결과 화면 구간
  동안만 들고 있다가 `addSpectator`에서 뷰 **다음에** 다시 보낸다. 다음 국이 `runRound()`
  들머리에서 비운다. `catalogMsg`를 들고 있다가 합류할 때 보내는 것과 **같은 방식**이다 —
  새 메시지 타입도 새 경로도 없다. 합류 뷰에 그때의 뒷도라도 함께 싣는다.
- **재현 확인**: `s11-join-midresult.ts` **FAIL → OK** (`… view, spectateInsight, roundOver`)
- **회귀**: `packages/core/test/HanchanSpectateJoin.test.ts` 2건
  (결과 화면 합류는 받는다 / 국 중간 합류는 지난 국 결과를 안 받는다)

## 의심 1·2 — 손대지 않았다
- 의심 1(지연 관전석에서 운영 메시지가 뷰보다 앞선다): 「즉시가 옳다」는 반대 설계도
  성립하고, 실제 운영에서 무효를 얼마나 쓸지 모른다. 운영 수칙 사안으로 남긴다.
- 의심 2(관전석이 보낸 대국 메시지가 조용히 버려진다): server 확정 2를 고치면서 좌석 없는
  연결의 `action`류는 이제 `NOT_IN_ROOM`을 받는다 — 그 절반은 자연히 닫혔다.
  `chat`이 조용히 사라지는 것은 그대로다(`roomNotice`로 대체된다).

---

# 4. rules.md 확정 3 🟠 — 오라스 도중유국이 아가리야메로 취급돼 게임이 끝난다

- **고침**: `agariYameTriggers`의 `played`에 `outcome`을 넣고, `abort`면 렌짱으로 읽지
  않는다. `runLoop`이 이미 들고 있던 `outcome`을 `endReason` → `isAgariYame`로 흘려보낸다.
  선택 인자로 두지 않고 **필수 필드**로 만들었다 — 「결과를 안 보고 렌짱을 판정한다」가
  결함의 정체였으므로, 새 호출부가 그 값을 빠뜨릴 수 있는 자리를 남기지 않는다.
- **왜 이것이 맞나**: 도중유국(구종구패·사풍연타·사가리치·삼가화·사깡산료)은 «연장»이
  아니라 **같은 국을 다시 치는 것**이다(`sysSettleAbort`가 그 주석을 직접 적어 두었다).
  다시 치니 장풍·국번이 유지되고, 그것만 보던 검사가 렌짱으로 읽었다. 최악은 **1위 오야가
  배패에 요구패 9종이 오면 스스로 구종구패를 선언해 한 순도 두지 않고 우승을 확정**할 수
  있었다는 것이다.
- **재현 확인**: `qa-lab/round2/rules/endgame.ts`
  ```
  OK  도중유국(구종구패)로 게임이 끝나지 않는다 — reason=null 시작된국=2      (A: FAIL → OK)
  OK  대조군: 오야 화료 → 아가리야메 종국 — reason=agariYame                  (B: 그대로)
  OK  도중유국 + 오야가 1위 아님 → 게임 계속                                   (C: 그대로)
  OK  1위 오야가 구종구패로 게임을 끝낼 수 없다 — reason=null                  (D: FAIL → OK)
  OK  E1 도비 / OK  E2 (대조) 도비 아님                                        (E: 그대로)
  ```
  **F(서입)은 이 스크립트에서 `No pending decision for p0`로 터진다** — 대본 수가 모자라
  나는 하네스 예외이고, 내 변경과 무관하다(F의 국은 `outcome === "win"`이라 이 분기를
  아예 안 탄다). 확인 방법: 이 한 줄을 꺼도 F는 같은 자리에서 같은 예외를 낸다.
- **회귀**: `packages/core/test/Hanchan.test.ts`의 `agariYameTriggers` 스위트에 3건 추가 —
  **win / draw / abort가 나머지 조건이 완전히 같은 세 줄**로 나란히 선다(win·draw는 종국,
  abort만 계속). 그 대조가 없던 것이 결함이 오래 산 이유였다. 기존 10개 호출부에는
  `outcome: "win"`을 명시했다.

---

# 5. onboard.md 확정 2·4

## 확정 2 🟠 `tutorialHold`가 봇의 «이번 한 순»을 못 막는다 (기준선 문서의 그 플레이크)
**원인은 부하도 네트워크도 아니라 «검사 지점의 순서»였다.**
`BotAgent.decide()`가 홀드를 생각 시간(1000ms) **앞에서만** 검사했고, 클라이언트는 view를
받아 렌더한 **뒤에야** 홀드를 보낸다 — 구조적으로 항상 늦고, 늦게 온 홀드는 이미 잠든 봇을
못 붙든다. 지연을 **0ms**(도달 불가능한 이상적 클라이언트)로 낮춰도 9구간 중 5개가 샜다.

- **고침 ①**: `decide()`의 `waitWhileHeld()`를 생각 시간 **뒤로 옮겼다**(앞뒤 두 번이 아니다).
  두 번 물으면 아래 ②의 유예가 생각 시간에 **더해져** 봇의 한 순이 그만큼 길어진다 —
  실제로 그 형태에서 `Tutorial.test.ts`가 시간 예산을 넘겼다. 뒤에서 한 번만 물으면 유예가
  생각 시간과 **겹쳐** 흐르므로 운영 기본값(생각 1000ms > 유예 700ms)에서 추가 비용이 0이다.
- **고침 ②(담당 권장안)**: 튜토리얼 좌석에 **새 화면이 실제로 나갈 때마다** 서버가 스스로
  `TUTORIAL_HOLD_GRACE_MS`(700ms) 유예를 건다(`HumanAgent.setViewSentListener` — 무변경
  스킵(§7-6)에 걸린 프레임은 화면을 안 바꾸므로 부르지 않는다). 클라이언트의 `hold:true`는
  종전대로 3분으로 **연장**하고, `hold:false`는 0으로 지우는 대신 **유예 끝까지로 깎는다** —
  늦게 온 `false`가 방금 나간 화면의 유예까지 걷어 버리면 구멍이 그대로 다시 열린다.
  프로토콜·클라이언트 무변경.
- **③(seq + ack)은 넣지 않았다.** ①+②로 계측이 0이 됐고, ③은 프로토콜에 `seq`와 새 ack를
  들이는 변경이다. 지금 값어치보다 비용이 크다 — 필요해지면 그때 ②의 유예를 걷고 올린다.
- **재현 확인**: `onboard/holdRace.ts`
  ```
  고치기 전:  0ms 9구간 중 5개 샘 · 60ms 14구간 중 7개 샘
  고친 뒤:    0ms 18구간 중 0개 · 60ms 17구간 중 0개 (초기 측정 46구간 0개 포함)
  ```
- **기준선 문서 갱신**: `docs/23_TEST_BASELINE.md`의 `Tutorial.test.ts` 플레이크 항목을
  «원인을 찾아 고쳤다 — 더 이상 플레이크가 아니다»로 바꾸고, 원인·고침·근거 수치를 적었다.
  **단독 16회 연속 21/21 통과**(고치기 전 master 1/8 · 작업 브랜치 1/5 실패).
- **회귀**: 같은 파일의 「말풍선이 떠 있으면 국 사이도 붙든다」 테스트를 새 계약에 맞췄다 —
  새 화면 직후에는 유예로 **이미 붙들려 있는 것이 정상**이고, `hold:false`는 유예 끝까지로
  깎이며, 유예가 지나면 스스로 풀린다(판이 굳지 않는다).

## 확정 4 🟡 「그만 보기」가 남기는 판은 대국이 아니다
- **고른 길: (a) 접는다 도, (b) 배지 도 아닌 «진짜 판으로 바꾼다».** 「그만 보기」의 뜻은
  «안내만 그만»이지 «그만 두겠다»가 아니다 — 배우다 만 사람이 이어서 둘 수 있는 것이 맞고,
  다만 그 판이 **정말로 대국이어야** 한다. 그리고 **말한다**(요구사항).
- **고침**:
  - `HanchanConfig.presetHandsFirstRoundOnly` (코어) — 고정 배패 모디파이어가 국 경계에서
    **스스로 비켜선다**. 규칙 합성에서 무언가를 빼는 것은 리플레이 재구성과 어긋날 위험이
    있어, 모디파이어를 떼는 대신 플래그를 보게 했다(국 경계에서만 움직이므로 재구성도 같은
    자리에서 같은 값을 본다). 샌드박스는 종전대로 매 국 고정이다 — 거기서는 그게 맞다.
  - `RoomManager.graduateTutorial(room)` — 첫 국이 끝나면 봇 제약(`noWin`·`noRiichi`)과
    배급(`TUTORIAL_FEED_NOTE`)을 풀고, **이미 있는 `roomNotice`로** 「튜토리얼 안내는
    여기까지입니다 — 지금부터는 평범한 연습 대국입니다. 손패 고정이 풀리고, 봇도 리치와
    화료를 합니다.」를 보낸다. 새 메시지 타입을 만들지 않았다.
- **재현 확인**: `onboard/afterQuit.ts`
  ```
  1국 배패: man2 man3 man4 man5 man6 man7 pin4 pin5 pin6 pin7 sou1 sou2 sou2 sou9
  [room …] 튜토리얼 졸업 — 고정 배패·봇 제약·배급을 풀고 연습 대국으로 넘긴다
  2국 배패: man4 man4 man6 man7 man9 pin2 pin6 sou5 sou5 sou7 sou9 wind2 wind4   ← 달라졌다
  ```
- **회귀**: `Tutorial.test.ts`에 「튜토리얼 졸업」 3건(졸업 + 공지 / 고정이 국 경계에서 풀린다 /
  체험판은 이 경로를 안 탄다).

---

# 6. lobby.md 확정 1·2·3·4

## 확정 2 🟠 친구 100명 상한이 수락 경로에서 통째로 우회된다 (재현 130명)
- **고침(두 군데)**:
  - `respondFriendRequest`가 **보낸 쪽**의 친구 수도 본다(`requestFriend`와 대칭).
    문구를 «상대가 가득 찼다»로 갈라 적었다 — 내가 정리하면 되는 일과 아닌 일은 다르다.
  - 보낸-요청 상한을 **이미 맺은 친구와 합쳐** 센다. 보류분만 세면 수락된 만큼 자리가 비어
    «100건 보내고 → 수락되기를 기다렸다가 → 또 100건»이 무한히 반복된다. 상한의 뜻은
    「보류함의 크기」가 아니라 「이 사람이 벌일 수 있는 관계의 총량」이다.
- **재현 확인**: `lobby/t2-friend.ts` **FAIL → 12 ok / 0 FAIL**

## 확정 3 🟡 정원이 찬 방에서도 `friendInvite`가 성공한다
- **고침**: `inviteFriend`에 좌석 검사를 **쿨다운을 태우기 전에** 넣었다(실패한 초대가
  20초를 먹어, 봇을 빼고 곧바로 다시 불러도 「방금 보냈습니다」로 막히던 것까지 함께 고쳐진다).
  봇이 차 있으면 안내를 «봇을 하나 빼고 부르세요»로 갈라 적는다.
- **재현 확인**: `lobby/t5-misc.ts` **FAIL → 8 ok / 0 FAIL**

## 확정 4 🟡 친구 «접속 중» 표시가 어떤 경우에도 push되지 않는다
- **고침**: `notifyPresenceChanged(username)`을 **네 지점**에서 부른다 — 인증 성공 ·
  연결 종료(`conns`에서 뺀 **뒤**에: `onlineMap`이 남은 연결을 훑으므로 순서가 중요하다) ·
  게임 시작(`phase`를 바꾼 뒤) · 판 종료(`resetRoomAfterGame` — 시작과 짝을 안 맞추면
  «대국 중»이 끝난 뒤에도 남는다). 새 메시지 타입도 주기 폴링도 없다 — 이미 있는
  `friendList`를 **지금 접속해 있는 친구에게만** 한 번 더 민다.
- **재현 확인**: `lobby/t8-online.ts` **2 FAIL → 2 ok / 0 FAIL**
  - ⚠ 그 스크립트에 있던 **오탐 하나를 고쳤다**: `b.close()` **뒤에** `a.clear()`를 해서
    같은 틱에 도착한 갱신을 스스로 지우고 «안 왔다»고 읽고 있었다. 순서를 뒤집었고 그
    사연을 주석으로 남겼다.

## 확정 1 🟡 `kickPlayer`로 봇을 지우면 `removeBot`과 다르다
- **고침**: 봇 분기에 `botArchetypes.delete` + `seatBotProfiles(room)`를 더해 정말로
  같은 처리로 만들었다.
- **재현 확인**: `lobby/t1-room.ts` **FAIL → 8 ok / 0 FAIL**
  - ⚠ 여기도 **검사 자체를 고쳤다**: 「재추가한 봇이 attacker 가 아니다」는 오탐이 난다 —
    성향은 (방 코드, 세대)로 결정되는 값이라 지정을 지운 뒤에도 우연히 같은 것이 앉을 수
    있다. 「지정이 없던 때와 **같은** 성향으로 돌아오는가」가 정확한 물음이라 그렇게 바꿨다.
    실측: 자연 성향 `valueHunter` → attacker 지정 → kick → 재추가 `valueHunter`.

## 의심 2건 — 손대지 않았다
- 「관리자 답변이 작성자에게 통보되지 않음」: 알림 채널을 새로 만드는 설계 결정이고
  클라이언트가 함께 움직여야 한다. 서버 한쪽만 고칠 수 있는 일이 아니다.
- 「비방장의 대기실 명령이 무응답으로 버려짐」: server 확정 2와 결이 같지만
  («조용히 버리지 않고 알린다»), 대기실 명령은 클라이언트가 **비방장에게 버튼 자체를
  안 그린다** — 지금 무응답이 되는 것은 위조된 메시지뿐이고, 거기에 답하는 것은 오히려
  방 상태를 훑는 창구가 된다. 근거를 적어 남긴다.

---

# 검증

## 게이트
```
npm run typecheck        → 통과 (0 에러)
npm run typecheck:server → 통과 (0 에러)
npx vitest run packages/server → 71 파일 / 823 테스트 전부 통과
npx vitest run packages/core   → 42 파일 / 537 중 536 통과 · 1 실패
```

### 코어의 실패 1건은 **내 것이 아니다** — 원인을 특정했다
`Hanchan.test.ts > 이벤트 콜백 > 리플레이 라운드트립: 이벤트 로그만으로 최종 점수를
재구성한다 (드래프트 포함)` — `expected 27000 to be 28000`.

**커밋 `617050e fix(draft): 좌석 칸 폴백에서도 같은 증강을 둘이 갖지 않는다`가 들여왔다.**
격리 워크트리를 브랜치의 커밋마다 세워 대조했다:

| 커밋 | 이 테스트 |
|---|---|
| `449d163` | 통과 |
| `fee2f5c` | 통과 |
| `617050e` | **실패** |
| 현재 HEAD | 실패 |

`HanchanController.ts`만 HEAD 판으로 되돌려도 **똑같이 실패한다**(두 번 확인). 즉 내
미커밋 변경과 무관하다. 드래프트 담당자가 「DraftController.ts만 되돌려 봤는데 같더라」고
한 것은 **되돌리는 범위가 좁았기 때문**이다 — `617050e`는 그 파일 하나가 아니다.
라이브 진행과 이벤트 로그 재구성이 갈리는 것이라 그냥 두면 안 되는 종류가 맞다(리플레이·
관전·재개가 전부 이 경로를 쓴다). **드래프트 담당자에게 돌려보낸다.**

### 알려진 플레이크 (기준선 문서 기준)
- `Sandbox.test.ts > 지정한 손패로 배패되고…` — 전체 실행 1회에서 실패, **단독 23/23 통과**.
  기준선 문서에 등재된 그 플레이크(부하가 걸리면 마지막 view 시점에 이미 한 순 지나가 있다).
- `Tutorial.test.ts` 플레이크는 **없어졌다**(위 onboard 확정 2 — 문서도 갱신했다).

## 재현 스크립트 (전부 다시 돌렸다)

### admin (14종)
```
01-perms      61/61   02-pause      22/23*  03-spectate    9/10*  04-voidround   1/1 ✅
05-sandbox    12/12   06-cleanup     3/3    07-static      3/4*   08-users     13/13
11-extend      2/2    12-spectate-end 4/4 ✅ 13-sandbox-deep 7/7   14-concurrent  4/4
```
- `02-pause`의 1건은 보고서가 이미 **오탐으로 정리한 것**(낡은 프롬프트 좌석 → `NOT_WAITING`).
  바로잡은 `11-extend`가 2/2다.
- `03-spectate`·`07-static`의 각 1건은 **기대값이 낡은 것**이다 — 위 admin 확정 2·4에 사유를 적었다.
- `09-resume` 2/3 · `10-resume-deep` 0/2는 보고서가 오탐으로 확인한 하네스 속도 문제다
  (10번이 **대조군도 같은 자리에서 진다**는 것을 보여 준다).

### lobby (7종) — **전부 0 FAIL**
```
t1-room 8/8 ✅  t2-friend 12/12 ✅  t5-misc 8/8 ✅  t6-room2 14/14
t7-replayperm 11/11  t8-online 2/2 ✅   (t3-stats는 예산 초과로 이번엔 안 돌렸다)
```

### spectate (전용 서버 **포트 3931** · 임시 DB · 임시 replays)
```
s03-pause-continue     정지 중 국간 대기 자동 해소: true → false ✅
s04-self-spectate      이탈 확정된 좌석의 계정도 자기 판 관전 불가 ✅
s05-crossroom          FAIL 2건 → OK ✅
s06b-insight-verify    (신규) 실서버 spectateInsight 372건 대조 · 어긋남 0 ✅
s02-delay-end          종료 뒤 대기분 도착 before=6 after=26 ✅
s11-join-midresult     합류 관전석이 roundOver 수신 ✅
s15-…-wait --reconnect 재개 후 첫 뷰 35ms → 20035ms ✅  (대조군 20013ms 유지)
s18a → 재시작 → s18b   3 FAIL → 7/7 ✅ (공지 시한 ttlMs=3576150 로 줄어든 채 생존)
```
> `s06`/`s10`은 로컬에서 두 공식을 비교하는 **계측**이라 서버를 고쳐도 숫자가 그대로다
> (서버 메시지를 읽지 않는다). 그래서 `s06b-insight-verify.ts`를 새로 만들었다.

### onboard / rules
```
holdRace 0ms   18구간 0개 샘 ✅   holdRace 60ms  17구간 0개 샘 ✅
afterQuit      2국 배패가 1국과 달라졌다 + 졸업 공지 ✅
rules/endgame  6/7 (A·D FAIL → OK · B·C·E 유지 · F는 하네스 예외, 무관)
```

## 운영 안전
- 테스트 서버는 **포트 3931**만 썼고, 끌 때 `lsof -ti:3931 -sTCP:LISTEN`으로 **그 PID만**
  죽였다(`pkill -f "src/index.ts"` 같은 넓은 패턴은 쓰지 않았다).
- 마친 뒤 확인: `lsof -i:3931` **0건** / 운영 `lsof -i:3011` **살아 있음**.
- 임시 DB·리플레이 디렉터리는 `mktemp -d`로 만들고 지웠다. 운영 DB와
  `~/majak` 메인 체크아웃은 읽기만 했다(격리 워크트리 대조 목적).

---

# 손댄 파일

**코어**
- `packages/core/src/match/HanchanController.ts` — `inRound`/`runRound` 껍데기 ·
  `requestRoundVoid(): boolean` · `lastRoundOverMsg`/`lastRoundUra` + `addSpectator` ·
  `agariYameTriggers`의 `outcome` · `presetHandsFirstRoundOnly`/`presetHandsActive`
- `packages/core/src/network/protocol.ts` — `AdminSetNoticeMessage`를 클라이언트 구간으로
- `packages/core/src/information/PlayerView.ts` — `seatScoringOptions` (관전 뷰 전용)

**서버**
- `packages/server/src/RoomManager.ts` — `Room.finished` · `sitDown` · `spectate` 입구 두 검사 ·
  `sendPauseState`/`sendRoomNotice` · `adminPauseGame` 확인 응답 · `adminVoidRound` ·
  `releaseSpectator`/`endSpectating` 플러시 · `spectateTimers` Map · `live_games` 정지·공지 ·
  `TUTORIAL_HOLD_GRACE_MS` + `graduateTutorial` · `inviteFriend` 좌석 검사 ·
  `kickPlayer` 봇 분기 · `notifyPresenceChanged`
- `packages/server/src/HumanAgent.ts` — `EXTEND_LEFT_MAX_MS` · `reconnect`/`noticeDisconnect`의
  `paused` 검사 · `setViewSentListener` · `INVALID_DRAFT_PICK` 문구
- `packages/server/src/BotAgent.ts` — `waitWhileHeld`를 생각 시간 뒤로
- `packages/server/src/SiteDb.ts` — `live_games` 4열 ALTER · 친구 상한 양방향/합산
- `scripts/watchdog.sh` — 복구를 `restart`로

**테스트 (신규 6 · 수정 3)**
- 신규: `server/test/{LiveGameResurrect,DualTab,WatchdogRecovery,AdminSpectateState,SpectateBroadcast,SpectateInsight,LobbyFriends}.test.ts`,
  `core/test/HanchanSpectateJoin.test.ts`
- 수정: `server/test/{PauseGame,Tutorial}.test.ts`, `core/test/{HanchanPause,Hanchan}.test.ts`

**문서·스크립트**
- `docs/23_TEST_BASELINE.md` — `Tutorial.test.ts` 플레이크 항목을 «고쳤다»로 갱신
- `qa-lab/round2/spectate/s06b-insight-verify.ts` (신규 검증 스크립트)
- `qa-lab/round2/lobby/{t1-room,t8-online}.ts` — 오탐 두 건 교정 (사유를 주석으로)
