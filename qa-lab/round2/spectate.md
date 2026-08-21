# 관전/중계 — spectate

## 요약

- 전용 서버(포트 3931, 임시 DB)를 띄우고 실제 WS 클라이언트로 구동. 운영(3001)은 건드리지 않았다.
- 재현 스크립트 13종: `qa-lab/round2/spectate/s01`~`s13`. 실행은 `qa-lab/round2/spectate/run.sh <파일>`
  (`QA_WS/QA_HTTP=…:3931` 을 붙여 준다). 서버 기동:
  `cd packages/server && PORT=3931 DB_PATH=<tmp>/qa.db ADMIN_CODE=qaspectateadmin1234 node --import tsx/esm src/index.ts`
- 완주 대국 다수 + 60초 관전 스트림 표본 다수(뷰 350장 이상 대조).
- 판정과 남은 위험 목록은 **맨 아래**.
- ⚠ 이 워크트리에는 다른 QA 담당자들의 **미커밋 수정**이 들어 있다(`RoomManager.ts`·`HanchanController.ts`
  — 종국 정리 중 `live_games` 재기록, 국 무효 `inRound` 경계). 그 hunk 들을 확인했고 이 보고서의
  어떤 발견과도 겹치지 않는다(`spectate`/`joinRoom`/`stopSpectating`/`HumanAgent.reconnect`/
  `spectateInsight`/`PlayerView`/`live_games` 스키마는 손대지 않았다). `packages/**` 는 나는 한 줄도
  고치지 않았다.

---

## 확정 1. 🔴 관전 중인 연결이 그대로 좌석에 앉는다 — 대국자가 전원 손패를 계속 받는다

- 위치: `packages/server/src/RoomManager.ts:3893` (`spectate`), `joinRoom` 경로 전체.
  `stopSpectating` 은 소켓 종료(1545)·`detachSeat`(2429)·계정 삭제(3761)·`spectate` 재시작(3913)·
  `spectateStop`(2208) 에서만 불린다. **방에 들어가는 경로에서는 한 번도 불리지 않는다.**
- 기대: 코드 주석이 직접 약속한다 — "대국 중인 참가자(관리자여도)가 자기 방을 관전하면 완전정보
  치트가 된다". `docs/26_SECURITY_AUDIT_2026-08.md:208`, `docs/28:294`, `docs/29:252` 모두
  "본인이 참가 중인 방은 관전이 거부된다"고 적는다.
- 실제: 검사는 `spectate` 호출 **시점에만**, 그리고 `isActiveHuman`(= `!agent.isAbandoned`) 으로만
  한다. 두 가지 우회가 성립한다.
  - (a) **자기 방 완전정보 치트** — 관리자 계정이 대국 중 소켓을 끊고 60초를 기다리면 좌석이
    `abandoned` 로 확정된다 → 그 순간부터 `spectate <자기 방 코드>` 가 **허용된다** →
    이어서 `joinRoom` 으로 그 좌석에 **복귀**한다. 복귀해도 관전 스트림은 끊기지 않는다.
    한 소켓이 자기 뷰와 `__spectator` 전체공개 뷰를 동시에 받는다.
  - (b) 대국 중인 연결이 **다른 방** 관전을 새로 시작하는 것도 막히지 않는다(`s05`).
- 재현:
  ```
  ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s04-self-spectate.ts
  ```
  ```
    57초: 아직 거절 — FORBIDDEN 본인이 참가 중인 게임은 관전할 수 없습니다
    60초: 자기 방 관전이 **허용**됐다 {"code":"S3U27Y",...}
    관전 뷰 playerId: __spectator p1 손패: 14 장 hidden 0
    joinRoom → joined
    복귀 후 6초: 관전(전체공개) 뷰 6장 · 본인 뷰 8장 · spectateInsight 6건
    → 확정: 대국 중인 연결이 전 좌석 손패를 계속 받는다:
       hand:p0=13장 hand:p1=13장 hand:p2=7장 hand:p3=14장
  ```
  (b) 는 `s05-crossroom.ts` — "8초 동안 한 소켓에 내 뷰 14장 + 남의 판 전체공개 뷰 10장이 섞여 왔다".
- 영향: 대회 운영자가 곧 선수이기도 한 구성(이 프로젝트의 현실적 운영 형태)에서 **완전정보 치트**가
  성립한다. 상대 손패·패산·도라·우라가 전부 보이는 채로 자기 판을 둔다. 문서가 방어된다고 적은
  바로 그 시나리오다. 관리자 권한이 전제이긴 하나, 대회 관리자는 여러 명이고 선수를 겸한다.
- 제안 수정: ① `joinRoom` 성공 직전에 `this.stopSpectating(conn)` 을 부른다(방에 앉는 순간 관전을
  접는다 — `detachSeat` 과 대칭). ② `spectate` 의 자기 방 검사를 `isActiveHuman` 이 아니라
  "이 방에 내 닉네임의 좌석이 존재하는가(포기했더라도 `canRejoin` 이면)" 로 넓힌다.

## 확정 2. 🟠 중계 패널의 샹텐이 「한 장 버린 뒤의 최선」이 아니다 (14장 시점의 34%가 틀린다)

- 위치: `packages/server/src/spectateInsight.ts:95`
  `shanten: shantenOf(hand.length % 3 === 2 ? hand.slice(0, -1) : hand, meldCount)`
- 기대: `docs/36_BROADCAST_SPECTATOR.md:101` — "샹텐 뱃지 — 텐파이가 아닌 좌석에 `N샹텐`.
  **14장이면 한 장 버린 뒤의 최선**." 클라이언트 좌석 뱃지는 실제로 그렇게 한다
  (`packages/client/src/App.tsx:14745-14751` — 모든 버림 후보를 돌려 최소값).
- 실제: 서버는 **배열의 마지막 한 장**을 그냥 잘라 낸다. 손패 배치(`handOrder`)에 따라 마지막
  장은 아무 패나 될 수 있고, 최선의 버림도 아니다. 같은 화면의 두 숫자(중계 패널 vs 좌석 뱃지)가
  서로 다른 값을 말한다.
- 재현: `./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s06-insight-shanten.ts`
  ```
  14장 시점 64건 검사 · 어긋남 22건 (34.4%)
    p0 손 man4 man4 pin3 pin4 pin6 pin6 sou2 sou4 sou6 sou6 sou8 wind4 dragon3 sou8
       → 패널 3샹텐 / 실제 최선 2샹텐
    p2 손 man1 man7 man8 man9 pin3 pin4 pin6 pin8 pin9 sou3 sou7 wind4 dragon1 sou7
       → 패널 4샹텐 / 실제 최선 3샹텐
  ```
- 영향: 해설이 읽는 숫자가 세 번에 한 번 한 단계 나쁘게 나온다. 텐파이 직전(1샹텐↔텐파이)
  구간에서 특히 위험하다 — "아직 1샹텐"이라고 말한 좌석이 실은 텐파이일 수 있다.
- 제안 수정: 클라이언트와 같은 셈을 쓴다 — `hand.length % 3 === 2` 면 모든 i 에 대해
  `shantenOf(hand.filter((_,j)=>j!==i), meldCount)` 의 최소값.

## 확정 3. 🟠 중계 패널이 증강의 화료형 변형을 무시한다 — 같은 좌석에 숫자가 둘

- 위치: `packages/server/src/spectateInsight.ts:95` (옵션 인자를 아예 넘기지 않는다),
  `packages/core/src/information/PlayerView.ts:678`
  (`scoringOptions: viewerId === SPECTATOR_ID ? {} : scoringOptionsOf(...)`).
- 기대: 이 게임의 고유 요소가 증강이고, `docs/36` A5 는 증강 패널을 ✅ 로 적는다. 좌석 뱃지는
  `waitDecompOptions()` 로 **그 좌석의 증강**(공개 정보)을 반영해 대기·샹텐을 잰다.
- 실제: 서버 중계 패널은 표준 규칙으로만 잰다. `shantenOf` 가 실제로 반영하는 옵션
  (`totalSets` · `wildKinds` · `kokushiOnly`)을 켜는 증강을 든 좌석에서 두 숫자가 갈린다.
  `scoringOptions` 자체가 관전 뷰에서 `{}` 라, 관전 화면이 이 정보를 되찾을 방법도 없다.
- 재현: `./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s10-insight-options.ts`
  ```
  true_dragon (진짜 용 · 5멘쯔)       패널 텐파이   / 뱃지 2샹텐   ← 어긋남
  joker (조커 · 백이 만능패)          패널 1샹텐    / 뱃지 텐파이  ← 어긋남
  open_kokushi (우는 국사무쌍)        패널 텐파이   / 뱃지 텐파이
  ```
- 영향: 증강 대회에서 가장 극적인 좌석(5멘쯔·만능패)의 숫자가 정확히 그 좌석에서 틀린다.
  예상 타점(`estimateHandValue`)도 같은 자리에서 표준 규칙으로 잰다.
- 제안 수정: `scoringOptions` 를 관전 뷰에도 **좌석별 맵**으로 실어 주고
  (`Record<PlayerId, ScoringOptions>`), `spectateInsight` 가 좌석마다 그 옵션을 넘긴다.

## 확정 4. 🟠 정지 중 대국자가 재접속하면 「결과 화면 대기」가 정지 중에 소모된다 — 재개하는 순간 화면이 사라진다

- 위치: `packages/server/src/HumanAgent.ts:349-352` (`reconnect`)
  ```ts
  if (this.pendingContinue !== null && this.continueTimeout === null) {
    this.continueTimeout = setTimeout(() => this.resolveContinue(), this.continueMaxWaitMs);
  }
  ```
- 기대: `docs/36` B1(✅)은 일시정지가 얼릴 곳으로 "좌석별 결정·드래프트 타이머, 컨트롤러 안전망,
  **국간 대기**, 봇의 생각 시간"을 명시한다. 실제로 `armDecision`(:866)·`armDraft`(:1048)·
  `awaitContinue`(:1100) 는 전부 `this.paused` 를 먼저 본다 — `awaitContinue` 의 주석은
  "정지 중에는 결과 화면도 그대로 세워 둔다"라고 못 박는다.
- 실제: `reconnect()` 의 국간 대기 재무장만 `paused` 검사가 없다(`isHeld`=1인 방 세워 둠
  경로와 `paused` 를 구분하지 않는다). 정지 중 대국자의 소켓이 한 번 끊겼다 붙으면
  결과 화면 대기가 **정지 중에** 정상 상한으로 다시 걸려 그대로 만료된다. 다음 국 시작 자체는
  컨트롤러의 `gatePaused()`(`HanchanController.ts:1147`)가 따로 막아 주므로 정지 중에 판이
  넘어가지는 **않는다**. 대신 **재개하는 순간** 결과 화면이 0초 만에 사라지고 다음 국이 시작된다.
- 재현 (A/B 대조, 실서버):
  ```
  ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s15-pause-consumes-wait.ts              # 대조군
  ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s15-pause-consumes-wait.ts --reconnect  # 재접속
  ```
  ```
  [대조군]   정지 — 결과 화면 뜬 지 29ms · 정지 유지 25002ms
             재개 후 첫 새 뷰까지: 20027ms   → OK (남은 20초를 지킨다)
  [재접속]   정지 — 결과 화면 뜬 지 463ms · 정지 유지 26069ms · 복귀했다
             재개 후 첫 새 뷰까지: 1ms       → FAIL (대기가 통째로 사라졌다)
  ```
  단위 재현(서버 불필요): `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/spectate/s03-pause-continue.ts`
  → `정지 중인데 국간 대기가 스스로 풀렸는가: true` / 대조군 `결정은 정지 중 재접속에도 서 있는가: true`
- 영향: 대회에서 정지를 거는 이유의 절반이 "결과 화면을 띄워 놓고 해설한다"이다. 그 사이 선수 한
  명의 네트워크가 한 번만 끊겼다 붙어도(대회장 와이파이에서 흔하다), 재개 버튼을 누르는 순간
  결과 화면이 사라지고 다음 국 배패가 시작된다 — 중계가 결과를 못 보여 준 채 넘어간다.
  정지가 길수록(해설이 길수록) 반드시 만료되므로 사실상 100% 재현된다.
- 제안 수정: `if (!this.paused && this.pendingContinue !== null && this.continueTimeout === null)`,
  그리고 `paused` 일 때는 `this.pausedContinue = true` 만 세운다(재개가 `setPaused(false)`
  :565 에서 다시 건다).

## 확정 5. 🟠 지연(딜레이) 관전석은 게임이 끝나는 순간 마지막 N초를 영영 못 본다

- 위치: `packages/server/src/RoomManager.ts:3928-3937`(예약된 프레임은 `conn.spectating === room`
  일 때만 흘린다) + `:5561-5566`(게임 종료 시 `spectateEnded` 를 보내고 즉시 `conn.spectating = null`,
  `room.spectators.clear()`).
- 기대: 송출 딜레이(C1)는 «부정행위 방지를 위해 N초 늦게 본다»는 것이지 «마지막 N초를 안 본다»가
  아니다. 대회 중계에서 그 N초에는 **마지막 국의 화료·정산·최종 순위**가 들어 있다.
- 실제: 종료 시 대기 큐가 통째로 폐기된다. 15초 딜레이면 화면이 종료 15초 전에서 멈춘 채
  `spectateEnded` 만 도착한다.
- 재현: `./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s02-delay-end.ts`
  ```
  spectateStarted {"code":"6N7TH8","delaySeconds":15}
  관전석 view 5장, 관전석 turnCount=1 / 대국자 turnCount=5
  spectateEnded 도착 (요청 직후): 0 ms 이내
  종료 뒤 추가 도착 프레임: before=5 after=5  → 대기 중이던 15초 분량 전부 폐기
  ```
- 참고: 문서(`docs/36:110-113`)는 «관전을 **접으면** 대기 프레임을 흘리지 않는다»를 의도로 적는다.
  그 의도는 옳다(운영자가 창을 닫은 뒤 손패가 계속 날아가면 안 된다). 하지만 **게임 종료**는
  운영자가 접은 것이 아니다 — 같은 코드 경로를 타는 바람에 중계가 결말을 잃는다.
- 제안 수정: 종료 사유를 갈라 `spectateStop`(운영자가 접음)은 지금처럼 폐기하고,
  게임 종료·`gameAborted` 는 남은 큐를 다 흘린 **뒤** `spectateEnded` 를 보낸다.

## 확정 6. 🟠 서버 재시작이 «정지»와 «방 공지»를 지운다 — 판은 되살아나는데 세워 둔 것은 안 세워진다

- 위치: `packages/server/src/SiteDb.ts:353-362` — `live_games` 표에 `paused`·`notice` 열이 없다.
  이어하기 복원 경로는 좌석·리플레이만 되살린다(`RoomManager.ts:623` 이하).
  `room.paused`/`room.notice` 는 새 방의 기본값(false/null)으로 시작한다.
- 기대: 「심판 판정 중」이라고 세워 놓은 탁자는 배포 재시작을 넘겨도 세워져 있어야 한다.
  이어하기 기능 자체가 "배포 중 재시작"을 살리려고 만든 것이라고 문서가 적는다(`RoomManager.ts:623`).
- 실제: 방은 정확히 되살아나고 관전도 다시 붙는데, **정지 상태와 공지만 사라진다**.
- 재현:
  ```
  OUT=/tmp/s18.json ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s18a-pause-then-kill.ts
    → PAUSED 8VYJ4K …            (공지 「재개 대기 중 — 심판 판정」 + 정지 「심판 판정 중」)
  kill $(lsof -ti:3931); <서버 재기동>
    → [srv] 끊긴 대국 4건 — 이어하기를 시도한다 / [room 8VYJ4K] 이어하기 — 32개 이벤트에서 재개
  OUT=/tmp/s18.json ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s18b-after-restart.ts
  ```
  ```
  liveGames 행: {"code":"8VYJ4K",...,"roundLabel":"동1국","turnCount":4}   ← paused 키가 없다
    OK   재시작 뒤에도 판이 목록에 있다
    FAIL 재시작 뒤에도 «정지» 표식이 남아 있다
    FAIL 복귀한 대국자에게 «정지 중»이 복원된다
    FAIL 재시작 뒤에도 방 공지가 남아 있다
    OK   재시작 뒤에도 관전을 붙일 수 있다
    FAIL 합류한 관전석에 «정지 중»이 복원된다
  ```
  (대조: 재시작이 없으면 `sendPauseState`·`sendRoomNotice` 가 재접속·관전 합류 모두에 복원해 준다.)
- 영향: 대회 중 판정 시비로 탁자를 세워 놓고 서버를 재시작하면(배포·감시자 복구 모두 해당),
  선수들이 돌아오는 순간 판이 **그냥 진행된다**. 운영자는 정지 버튼을 다시 눌러야 한다는 것을
  알 방법이 없다 — 목록에도 정지 표식이 없기 때문이다.
- 제안 수정: `live_games` 에 `paused INTEGER` · `pause_reason TEXT` · `notice TEXT` 를 ALTER 로
  붙이고(이 저장소는 이미 그 방식을 쓴다), 이어하기 복원 때 `room.paused`/`room.notice` 를 채운 뒤
  컨트롤러에 `setPaused(true)` 를 건다.

## 확정 7. 🟡 결과 화면 도중 합류한 관전석은 그 국의 결과를 못 본다 (탁자 전환기의 정면 사각)

- 위치: `packages/core/src/match/HanchanController.ts:1565-1580` (`addSpectator`) —
  합류 시 뷰 한 장만 보낸다. `roundOver`(:1587)는 그 시점에 이미 지나간
  일회성 메시지라 다시 가지 않고, 합류 뷰는 `uraDoraIndicators` 를 **넘기지 않는다**
  (`PlayerView.ts:576` → `null`).
- 기대: D4 탁자 전환기(✅ ◐)는 "리치 걸린 탁자로 옮긴다"가 실제 용도다. 옮긴 탁자가
  마침 결과 화면이면 그 국의 화료·역·점수 이동·뒷도라가 중계에 보여야 한다.
- 실제: 합류 직후 관전석이 받는 것은 `spectateStarted, catalog, view, spectateInsight` 뿐이다.
  뷰의 `phase` 는 `round.over` 인데 `roundOver` 페이로드(역·판·부·`revealedHands`·`settle`)가 없고
  우라도라도 `null` 이다. 즉 «결과 화면인 것은 아는데 결과는 모르는» 화면이 뜬다.
- 재현: `./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s11-join-midresult.ts`
  ```
  roundOver 도착 — {"outcome":"draw","settle":{...}}       ← 기존 관전석/대국자는 받았다
  합류 직후 5초 동안 관전석이 받은 것: serverInfo,authOk,catalog,spectateStarted,catalog,view,spectateInsight
  FAIL 합류한 관전석도 지금 떠 있는 국 결과를 받는다
  관전 뷰 phase: round.over · 우라도라: null
  ```
- 영향: 대회에서 탁자를 옮긴 직후가 정확히 「방금 큰 판이 났다」는 순간이다. 그 순간의 결과를
  못 본다. 다음 국이 시작될 때까지 빈 결과 화면을 보게 된다.
- 제안 수정: `HanchanController` 가 마지막 `roundOver` 메시지와 그때의 `ura` 를 들고 있다가
  (`catalogMsg` 를 들고 있는 것과 같은 방식) 결과 화면 구간에 합류한 관전석에 다시 보낸다.

---

## 의심 1. 🟡 지연 관전석에서 운영 메시지가 뷰보다 15초 앞선다 (스포일러)

`roomNotice`·`gamePaused`·`spectateEnded`·「국 무효」 공지는 지연 큐를 타지 않고 즉시 나간다
(`RoomManager.ts:4067`·`4141`·`5563`). 문서는 "조작 응답은 즉시"를 의도로 적고, 그 판단 자체는 옳다.
다만 **국 무효 공지**(「관리자가 이 국을 물렸습니다 — 다음 국으로 넘어갑니다」)는 판의 사건이라,
15초 지연 중계에서는 아직 그 국을 보고 있는 화면 위에 결말이 먼저 뜬다.
확정으로 올리지 않은 이유: 실제 운영에서 무효를 얼마나 쓸지 모르고, "즉시가 옳다"는 반대 설계도
성립한다. 재현은 `s16-ops.ts` 의 공지 구간(`지연 관전석에도 간다 (2ms 뒤)`)이 같은 경로를 보여 준다.

## 의심 2. 🟡 관전석이 보낸 대국 메시지가 **아무 응답 없이** 조용히 버려진다

`s16-ops.ts` 에서 관전 중인 관리자가 `action`·`roundContinue`·`draftPick`·`leaveRoom`·`chat` 을
보냈을 때 판은 전혀 움직이지 않았지만(**안전은 확인됨**) 에러도 오지 않았다:
`관전자 입력 응답: (없음) · 전체: view,spectateInsight`.
관전 중이 아닌 관리자는 같은 입력에 `NOT_IN_ROOM` 을 받는다(`s01-expose.ts`). 관전석에서 실수로
누른 것이 성공한 것처럼 보이는 UX 문제이지 보안 문제는 아니다. 특히 `chat` 이 조용히 사라지는 것은
운영자가 탁자에 말을 걸 수 없다는 뜻이기도 하다(`roomNotice` 로 대체는 된다).

---

## 검증했고 **문제 없었던** 것 (문서 ✅ 항목 실사)

| 항목 | 결과 | 근거 |
|---|---|---|
| 관전 뷰 전원 손패·패산·도라 공개 | ✅ | `s01` — 네 좌석 hidden=0, wall 68장 공개, 도라 표시패 있음 |
| 관전 전용 정보가 대국자에게 새지 않음 | ✅ | `s01` — 대국자 `spectateInsight` 수신 0건 |
| C4 대국자 고지 | ✅ | `s01`·`s09` — `spectated {count}` 가 붙고 떨어질 때마다 정확 |
| C1 송출 딜레이 정확도 | ✅ | `s02b` — 설정 10초 대비 중앙값 10000ms |
| C3 감사 로그 | ✅ | 서버 로그에 `관전 시작 <코드> — <계정> (지연 N초)` |
| D5 관전석 다수 | ✅ | `s09` — 관전석 3개 동시, 대국자가 보는 수 = 3 |
| D4 탁자 전환 | ✅ | `s09` — 30회 전환 뒤 옛 탁자 스트림 0, 관전자 수 정확히 이동 |
| B1 정지 — 봇 포함 정지 | ✅ | `s07` — 정지 9초간 뷰 0장(봇 포함), 조작은 `GAME_PAUSED` 로 거절 |
| B1 정지 — 재개 후 진행 | ✅ | `s07`·`s15` 대조군 — 남은 대기 20027ms 정확히 이어짐 |
| B1 정지 — `liveGames` 표식 | ✅ | `s07` — `paused:true` |
| B1 정지 — 정지한 관전자 이탈 | ✅ | `s07` — 관전자가 사라져도 판은 세워진 채 유지(설계대로) |
| B2 방 공지 | ✅ | `s16` — 대국자·관전석·지연 관전석 모두 도달, TTL 반영 |
| B3 시간 연장 | ✅ | `s17` — `promptExtended deadlineMs=58944`(30초 + 잔여), 봇/없는 좌석은 `BAD_REQUEST` |
| 관전 대상 방 강제 종료 | ✅ | `s16` — 즉시 `spectateEnded`, 이후 뷰 0장, 재관전은 `NOT_PLAYING` |
| 관전 중 게임 종료 · 다음 국 진입 | ✅ | `s08` — 동풍전 완주, `roundOver` 4건, 관전 뷰 358장 |
| 리플레이 재구성 = 관전 기록 | ✅ | `s08` — 4국 전부 점수 이동 일치, 마지막 시점 네 좌석 손패 일치, 필드 집합 동일 |
| 관전자 끊김 | ✅ | `s09` — 끊긴 관전석이 목록에서 정확히 빠짐 |
| 대국자 입력 무시(관전자) | ✅ | `s01`·`s16` — 판이 움직이지 않음 |
| `buildSpectateInsight` 비용 | ✅ | `s12` — 1회 0.44ms(최악 1.00ms), 관전석 6개 × 뷰 1장 = 2.7ms |
| 서버 재시작 후 판 이어하기 자체 | ✅ | `s18b` — 방·좌석·리플레이 복원, 관전 재부착 성공 |

## 덜 본 범위 (예산 안에서 못 본 것)

1. **클라이언트 관전 화면의 실제 렌더링** — 코드(`App.tsx`)를 읽어 좌석 뱃지 계산식은 대조했지만
   (확정 2·3), 화면을 띄워 본 것은 아니다. 오버레이 모드(D2)·즉시 리플레이(D3)는 **미검증**.
2. **좌석별 오름패·남은 장수·후리텐 표시의 수치 정확도** — 관전 뷰에 네 좌석의 `furiten`·
   `furitenReasons`·`yaku` 가 실려 오는 것까지는 확인했으나(`s08`), 값 자체를 직접 계산해
   대조하지는 못했다. 샹텐만 대조했다(확정 2·3).
3. **수십 국 장시간 관전 누수** — 최대 동풍전 1판(4국) 완주 + 60초 스트림 표본까지만 봤다.
   `conn.spectateTimers` 는 발화 시 스스로 지워지므로 구조상 누수는 안 보이나 실측은 아니다.
4. **관리자 여러 명이 같은 방을 볼 때** 관전석 3개까지만 봤다(`s09`). 10석 이상은 미검증.
5. **증강 연출(비밀 증강)의 관전 노출** — `augmentView` 가 관전 뷰에 실리는 것은 확인했으나
   비밀 증강이 관전석에만 열리고 대국자에게는 닫히는지는 미검증.

---

# 대회에 쓸 수 있는가 — 판정

## **조건부 아니오.** 확정 1을 고치기 전에는 쓰면 안 된다. 나머지 셋(2·4·6)을 고치면 쓸 수 있다.

관전·중계의 **뼈대는 실제로 동작한다.** 문서가 ✅로 적은 항목 중 19개를 실사해 그대로 돌아가는
것을 확인했다(위 표). 정지·공지·시간 연장·딜레이·감사 로그·탁자 전환·다중 관전석·강제 종료·
리플레이 일치는 대회에 바로 쓸 수 있는 수준이다. 문제는 뼈대가 아니라 **가장자리 네 곳**이다.

### 막는 것 (고치기 전엔 대회 불가)

- **확정 1 (🔴 완전정보 치트)** — 선수를 겸하는 관리자가 60초 끊김 한 번으로 자기 판의 전 손패를
  띄운 채 둘 수 있다. 대회의 정당성 자체가 무너진다. 한 줄(`joinRoom` 에 `stopSpectating`)이면
  대부분 막힌다.

### 실제로 대회를 망칠 것 (고치기를 강력 권고)

- **확정 4 (정지 중 재접속 → 재개 즉시 결과 화면 소멸)** — 대회장 회선에서 100% 가까이 터진다.
  세 줄 수정.
- **확정 6 (재시작이 정지·공지를 지운다)** — 배포·감시자 복구가 판정 대기 중인 탁자를 그냥 굴린다.
- **확정 2 (샹텐 34% 오표기)** — 해설이 읽는 숫자가 틀린다. 대회 자체는 굴러가지만 중계가 거짓말을
  한다. 확정 3(증강 좌석)은 이 게임의 간판 요소에서 같은 일이 난다.

### 감수하고 갈 수 있는 것

- 확정 5(지연 관전석이 마지막 N초를 잃음) — 딜레이 0으로 운영하면 회피된다.
- 확정 7(결과 화면 도중 합류) — 전환을 국 중간에만 하면 회피된다.
- 의심 1·2 — 운영 수칙으로 덮인다.

## 남은 위험 목록 (고친 뒤에도 지켜볼 것)

1. **관리자 권한이 곧 완전정보 열쇠다.** 확정 1을 고쳐도 «관리자 = 전 손패 열람» 구조는 그대로다.
   대회 운영자 계정과 선수 계정을 **물리적으로 분리**하고, 관전 감사 로그(C3)를 대회 후 반드시
   대조하는 운영 수칙이 필요하다. 코드로는 못 막는다.
2. **딜레이는 부정행위를 늦출 뿐 막지 못한다.** 15초 딜레이여도 중계를 보는 사람이 선수에게
   전달하면 그만이다. 딜레이 값보다 «누가 관전석에 앉았는가»가 실제 방어선이다.
3. **정지·공지가 메모리에만 산다.** 확정 6을 고치더라도 `live_games` 는 6시간(`RESUME_MAX_AGE_MS`)
   이 지나면 판을 포기한다. 대회가 그보다 길거나 밤을 넘기면 이어하기 자체가 없다.
4. **관전은 연결 단위다.** 한 사람이 탭을 여러 개 열면 관전석 수가 그만큼 늘고, 대국자가 보는
   「관전 N명」이 실제 사람 수가 아니다(`s09` 에서 확인). 대회 화면에 그 숫자를 띄운다면 오해를 부른다.
5. **중계 보조값은 근사치다.** `buildSpectateInsight` 의 예상 타점은 `plan: null` 로 계산한다
   (`spectateInsight.ts:86`) — 실제 화료 시 점수와 다를 수 있다. 확정 3을 고쳐도 «추정»이라는
   표기는 화면에 남아 있어야 한다.
6. **4탁 동시 렌더는 없다**(D4 ◐). 여러 탁자를 «번갈아» 볼 수는 있어도 «동시에» 볼 수는 없다.
   대회 편성이 4탁 동시 진행이면 관리자 인원 × 브라우저 탭으로 때워야 한다.

---

보고서 경로: `qa-lab/round2/spectate.md`
