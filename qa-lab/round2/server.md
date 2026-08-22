# 서버 구조·안정성 — 담당 id `server`

## 요약
확정 **3건** (🔴 1 · 🟠 2) · 의심 1건 · 검증하고 **문제 없음으로 닫은 것 5건**.
임시 서버(PORT 3922 · 임시 DB · 임시 replays)를 워크트리에서 구동해 실제 WS 프로토콜로
검사했다. 돌린 판: 완주 12판 + 재시작 이어하기 3회 + 프로토콜 퍼징 1330 메시지 +
연결/방 생성·파괴 60 사이클. **운영 체크아웃(`/Users/skul/majak`)·운영 DB·포트 3001 은
건드리지 않았다.**

임시 서버(PORT=3921/3922, 별도 임시 DB)를 워크트리에서 띄워 실제 WS 프로토콜로 구동.
운영 체크아웃(`/Users/skul/majak`)·운영 DB·포트 3001 은 건드리지 않았다.
하네스: `qa-lab/round2/server/lib.ts` (FakeSocket 대신 실 WS 클라이언트 — 재접속·소켓 강제
절단(`terminate`)·2중 접속을 실제로 재현해야 해서다).

---

## 확정 1. 🔴 끝난 판이 `live_games` 에 되살아나 서버 재시작 후 **다시 서고, `games`·전적이 두 번 기록된다**

- 위치: `packages/server/src/RoomManager.ts:5356`(`forgetLiveGame`) ↔ `:5402`(`finishStats` 후
  `.finally` 의 `resetRoomAfterGame`) ↔ `:1171`(`sweepIdleRooms` → `rememberLiveGame`)
- 기대: 한 판이 끝나면 `live_games` 에서 영구히 빠진다. 재시작해도 되살아나지 않고,
  `games` 에는 판당 정확히 한 행이 남는다.
- 실제: `onGameOver` 는 순서가 이렇다.
  1. `this.forgetLiveGame(room)` — `live_games` 행 삭제
  2. `this.recordGame(room, rankings)` — `games` 에 결과 기록
  3. `void this.finishStats(...).finally(() => this.resetRoomAfterGame(room))` — **비동기**

  2~3 사이(그리고 `finishStats` 가 `await this.statsStore.record()` 로 파일 저장 체인을 기다리는
  동안) 방은 아직 `phase==="playing" && controller!==null && writer!==null` 이다.
  `resetRoomAfterGame`(`:4832`)이 이 세 값을 비우는 유일한 지점인데 그게 `.finally` 라서다.
  그 창에 `sweepIdleRooms()`(`:1147`)가 한 번이라도 돌면 `room.phase==="playing" &&
  room.controller!==null` 가드를 통과해 **`rememberLiveGame(room)` 이 방금 지운 행을 다시 넣는다**
  (`:1171`). `rememberLiveGame` 은 `room.writer===null` 만 보고 걸러내는데 그때는 아직 non-null 이다.

  `StatsStore.save()` 는 프로세스 전역 `saveChain` 에 직렬화되므로(`StatsStore.ts:127`),
  여러 판이 비슷한 시각에 끝나면 이 창이 ms 가 아니라 **초 단위**로 벌어진다.
- 재현(실제 관측된 산출물, 임시 DB 두 개에 남아 있다):

  a) 되살아난 행 — 임시 DB `qadb3/majak.db`
  ```
  $ sqlite3 qadb3/majak.db "select id,code,ended_at from games where code='3VYWVE';"
  3|3VYWVE|2026-08-21T18:29:38.919Z          ← 이미 끝나서 games 에 기록됨
  $ sqlite3 -line qadb3/majak.db "select * from live_games;"
            code = 3VYWVE
     replay_path = .../replays/3VYWVE_2026-08-21T18-21-36-847Z.jsonl
      updated_at = 2026-08-21T18:29:38.920Z   ← games 기록 1ms 뒤에 다시 써 넣었다
  ```
  b) 그 결과 — 임시 DB `qadb/majak.db` 에는 **같은 리플레이 파일이 `games` 에 두 행**
  ```
  $ sqlite3 -line qadb/majak.db "select * from games where code='6AHHMD';"
   id = 8  code = 6AHHMD  replay_path = .../6AHHMD_2026-08-21T18-03-09-905Z.jsonl
           started_at = 18:03:09.905  ended_at = 18:12:53.746
   id = 9  code = 6AHHMD  replay_path = .../6AHHMD_2026-08-21T18-03-09-905Z.jsonl   ← 동일 파일
           started_at = 18:03:09.905  ended_at = 18:16:58.762   ← 재시작 뒤 다시 끝났다
  ```
  c) **결정적 재현 — 재시작으로 끝을 확인했다** (현재 워킹트리 소스, 2026-08-21 22:57)
  ```
  # 위 a) 의 DB(3VYWVE 가 live_games 에 남아 있는 상태)로 서버를 다시 띄운다
  $ PORT=3922 DB_PATH=<qadb3>/majak.db node --import tsx/esm src/index.ts
  [22:57:22.606] [room 3VYWVE] 게임 시작 (tonpuu) — p0:R21zd p1:Bot_p1 p2:Bot_p2 p3:Bot_p3
  [22:57:22.617] [room 3VYWVE] 이어하기 — 1304개 이벤트에서 재개 (R21zd)
  [22:57:22.650] [room 3VYWVE] 게임 종료 — 1위 Bot_p3(39100) ... 4위 R21zd(6000)
  [22:57:22.654] [room 3VYWVE] R21zd 퇴장 — 사람이 없어 방을 닫는다
  $ sqlite3 <qadb3>/majak.db "select id,code,ended_at from games where code='3VYWVE';"
  3 |3VYWVE|2026-08-21T18:29:38.919Z
  10|3VYWVE|2026-08-21T22:57:22.650Z      ← 44ms 만에 리플레이를 다 소진하고 두 번째 기록
  ```
  누적 전적도 그대로 두 배가 됐다 (`replays/stats.json`, R21zd 는 **한 판만** 쳤다):
  ```
  {"roundsPlayed":16, "games":2, "placements":[0,0,0,2], "dealIns":2, "dealInPointsTotal":36000, ...}
                ↑ 8이어야 함        ↑ 1        ↑ 4위 두 번
  ```
  스크립트: `tsx qa-lab/round2/server/t07-resurrect.ts` (단판, 창을 노림),
  `QA_N=6 tsx qa-lab/round2/server/t10-resurrect-load.ts` (동시 6판 — `saveChain` 직렬화로
  창을 넓혀 안정적으로 재현). 둘 다 `QA_DB=<임시DB>` 와 임시 서버(PORT 3922) 필요.
- 영향:
  - **리플레이 목록·리더보드에 같은 판이 두 번** 뜬다(같은 `replay_path`, 다른 `id`).
  - 두 번째 완주에서 `finishStats` → `StatsStore.record` 와 `recordAugmentResults` 가 다시
    돌아 **누적 전적·증강 통계가 이중 계상**된다. 도감 티어의 근거가 오염된다.
  - 재시작 직후 홈에 "진행하던 방으로 재접속"이 뜨는데, 들어가면 **이미 끝난 판**이다.
    아무도 안 들어오면 `holdUntil` 만료까지(기본 40분) 방 예산을 물고 있는다.
  - 운영 기본값 `ROOM_SWEEP_INTERVAL_MS=60000` 에서는 창이 좁아 보이지만, 위 b)는
    **판이 몰릴 때 실제로 터진 것**이고 손실이 조용하다(로그에 아무 것도 안 남는다).
- 발생 빈도(정직하게): **창의 존재와 결과 사슬은 현재 소스에서 확정**이다(위 c 는 기본값
  코드로 돌린 결정적 재현이다). 다만 a) 의 «되살아나는 순간» 자체를 관측한 서버는
  `ROOM_SWEEP_INTERVAL_MS=1000` 으로 창을 넓혀 놓은 것이었다. 운영 기본값 60000 에서는
  판당 확률이 `finishStats` 소요시간/60초(수 ms/60s) 수준으로 낮다 — 대신 **한 번 걸리면
  조용하고 영구적**이고(로그 한 줄 없다), 판이 몰릴수록 `StatsStore.saveChain` 직렬화로
  창이 커진다. 리플레이 466판 규모라면 언젠가는 맞는 종류의 결함이다.
- 제안 수정: `rememberLiveGame` 이 "이미 끝난 판"을 되쓰지 않게 한다. 가장 작은 수정은
  `Room` 에 `gameOverAt`/`finished` 플래그를 세우고(`onGameOver` 맨 앞에서),
  `rememberLiveGame` 과 `sweepIdleRooms` 의 `phase==="playing"` 가드가 그 플래그를 함께 보는 것.
  (`resetRoomAfterGame` 을 앞당기면 안 된다 — `:5399` 주석대로 `finishStats` 가 `room.agents` 를
  훑어야 한다.) 겸사겸사 `games` 에 `replay_path` UNIQUE 인덱스를 두면 이중 기록이 DB 층에서 막힌다.

---

## 확정 2. 🟠 다른 탭으로 재접속하면 **옛 탭이 아무 통보 없이 좀비가 된다** — 버튼이 조용히 안 먹는다

- 위치: `packages/server/src/RoomManager.ts:2594`(`detachStaleConns`) · `:1975`(`conn.agent?.handleMessage(msg)`)
- 기대: 좌석이 새 탭으로 옮겨 갔으면 옛 탭에도 그 사실이 간다("다른 곳에서 접속되어
  이 창의 연결이 끊겼습니다"). 최소한 그 탭에서 누른 것에 **오류라도** 돌아와야 한다.
  바로 위 `:1969` 주석 자체가 그렇게 못 박고 있다 — *"조용히 버리지 않고 사실을 알린다 —
  화면에 이유 없이 안 먹히는 버튼이 남으면 그게 곧 «게임이 멈췄다»는 제보가 된다."*
- 실제: `detachStaleConns` 는 옛 연결의 `room`·`agent` 를 **null 로만 만들고** 아무 것도
  보내지 않으며 소켓도 닫지 않는다. 그 뒤 옛 탭이 보내는 `action`/`draftPick`/
  `roundContinue` 는 `conn.agent?.handleMessage(msg)` 의 **옵셔널 체이닝에 걸려 통째로
  사라진다** — `fail()` 도 타지 않아 오류 한 줄조차 안 간다.
  (`changePassword` 경로에는 `evictOtherSessions` 로 소켓까지 끊는 처리가 이미 있다.
  같은 상황인데 이쪽만 빠져 있다.)
- 재현: `tsx qa-lab/round2/server/t12-dualtab.ts` (임시 서버 3922)
  ```
  탭1 첫 prompt: 옵션 15
  탭2 joinRoom → joined p0
  탭1 closed? false                    ← 소켓이 그대로 열려 있다
  탭2가 prompt 를 받았나? true
  옛 소켓(탭1)이 액션을 보낸 뒤 — 탭1 수신: 없음      ← 오류조차 없다
                                    탭2 수신: 없음
    옛 소켓의 액션은 무시됐다
  ```
- 영향: 폰과 PC를 오가거나 탭을 하나 더 연 사람이 흔히 겪는다. 옛 탭에는 **마지막 뷰가
  그대로 남고 초읽기도 계속 돌아간다.** 누르는 대로 아무 반응이 없으니 "서버가 죽었다"로
  읽히고, 그러는 사이 진짜 결정은 새 탭에서 시간이 흘러 자동 진행된다.
  (좌석 탈취·중단 투표 오염 같은 옛 결함은 `detachStaleConns` 가 이미 막았다 — 이건 그
  수정이 남긴 «알리지 않음» 쪽이다. docs/28 §398 은 떼어내는 것까지만 다룬다.)
- 제안 수정: `detachStaleConns` 에서 옛 연결에 `{type:"error", code:"SESSION_REPLACED", ...}`
  를 보내고 소켓을 닫는다(`evictOtherSessions` 와 같은 처리). 겸해서 `:1975` 의 `?.` 를
  풀어 `conn.agent === null` 이면 `fail(conn,"NOT_IN_ROOM",...)` 을 돌려준다.

---

## 확정 3. 🟠 감시자가 **살아 있지만 응답하지 않는 서버를 절대 복구하지 못한다** — 그러면서 "다시 세움 완료"라고 보고한다

- 위치: `scripts/watchdog.sh:110`(`bash deploy/serve.sh start`) → `scripts/majak.sh:74`
  (`start()` 첫 줄의 `if is_running; then ... exit 0`)
- 기대: 감시자의 판단 기준은 스스로 적어 둔 대로 *"프로세스가 있느냐가 아니라 /healthz
  응답"* 이다(`scripts/watchdog.sh:25`). 그렇다면 **프로세스는 살아 있는데 응답이 없는**
  상태도 복구 대상이어야 한다 — 그게 이 감시자를 만든 이유("아무도 없는 동안 서버만
  조용히 꺼져 있었다")와 정확히 같은 부류의 고장이다.
- 실제: 감시자는 복구를 `serve.sh start` 로만 한다. 그런데 `majak.sh start` 는 첫 줄에서
  `is_running`(PID 파일 + `kill -0`)을 보고 **"이미 실행 중입니다"를 찍고 `exit 0`** 한다.
  종료코드가 0이라 감시자는 성공 분기로 들어가 `다시 세움 완료` 를 남기고
  `watchdog.gaveup` 를 지우고 *"서버가 누워 있어 다시 세웠습니다(자동 복구는 성공)"*
  알림까지 보낸다. **실제로는 아무 것도 하지 않았고 서버는 계속 죽어 있다.**
  `restart`(= kill 후 재기동)는 어느 경로에서도 부르지 않는다.
- 재현: 서버 프로세스만 살아 있고 포트는 아무도 안 듣는 상태를 만든다.
  ```
  # scratchpad 안에 scripts/·deploy/ 사본과 .majak/ 만 둔 격리 ROOT
  $ echo PORT=3987 > $R/deploy/majak.env
  $ sleep 600 & echo $! > $R/.majak/server.pid    # 살아 있지만 3987 은 아무도 안 듣는다
  $ WATCHDOG_HEALTH_TRIES=2 bash $R/scripts/watchdog.sh
  [23:10:58Z] 응답 없음 — 서버를 다시 세운다 (최근 0회)
  이미 실행 중입니다 (pid 14922) — http://localhost:3987     ← majak.sh 가 즉시 반환
  [23:10:58Z] 다시 세움 완료                                  ← 거짓 보고 + 성공 알림
  $ lsof -i:3987 -sTCP:LISTEN → 없음 — 여전히 죽어 있다
  ```
- 영향: **자동 복구의 유일한 수단**이 가장 흔한 운영 고장(프로세스는 살아 있는데 서비스가
  멎음 — 이벤트 루프 점유, HTTP 서버만 닫힌 상태, 반쯤 끝난 종료)을 못 고친다. 15분에 3회를
  채우면 *"부팅 자체가 깨진 상황"* 이라는 **틀린 진단**과 함께 아예 포기하는데, 정작
  `serve.sh restart` 한 번이면 살아났을 상황이다. 그 사이 사용자에게는 사이트가 죽은 채다.
  (CI가 꺼져 있어 로컬 게이트와 이 감시자가 배포 안전망의 전부다 — CLAUDE.md 참고.)
- **더 나쁜 것 — `/healthz` 의 «degraded» 신호가 통째로 무용지물이다.**
  `packages/server/src/index.ts:181` 은 `uncaughtException` 을 **삼키고 프로세스를 살려 둔다**.
  5분 창에서 예외가 5회를 넘으면(`:169-170`, `:473`) `/healthz` 가 `ok:false` + **HTTP 500**
  을 준다. 그 자리의 주석은 이렇게 적혀 있다 — *"감시자는 이 값을 보고 «응답은 오는데
  정상이 아니다»를 구분할 수 있다."* 그런데 `serve.sh health` 는 `curl -fsS` 라 500에서
  실패하고(→ 감시자의 `healthy()` false), 감시자가 할 수 있는 일은 위의 no-op `start`
  뿐이다. **즉 서버가 스스로 "나를 다시 세워 달라"고 말하는 유일한 경로가 설계돼 있는데
  받는 쪽이 그걸 실행할 수단이 없다.** 3회를 채우면 포기하고 그대로 방치된다.
- 제안 수정: 감시자의 복구를 `serve.sh start` 가 아니라 `serve.sh restart` 로 바꾼다
  (`restart` 는 빌드를 먼저 하고 성공했을 때만 교체하므로 «빌드 깨진 커밋에 서버가 내려간
  채로 남는» 예전 함정도 그대로 피한다). 최소한 `majak.sh start` 가 «이미 실행 중»으로
  빠질 때 0이 아닌 코드를 돌려주게 해서 감시자가 성공으로 착각하지 않게 한다.

---

## 의심 1. 🟡 관리자 `adminExtendTime` 이 남은 시간을 **누적**해 줄 수 있다

- 위치: `packages/server/src/HumanAgent.ts:595-613`(`extendTime`) · `RoomManager.ts:4100`
- `extendTime` 은 `leftMs = 남은 시간 + extraMs` 로 타이머를 **다시 건다**. 상한
  (`EXTEND_SECONDS_MAX`)은 «한 번에 주는 초»에만 걸려 있고 누적에는 없어 보인다 —
  관리자가 연타하면 한 좌석의 결정 시한이 사실상 무한이 된다(그 판 전체가 멈춘다).
- 관리자 전용 손잡이라 심각도는 낮게 잡았고, **재현은 하지 않았다**(관리자 계정으로
  진행 중인 판에 붙는 시나리오까지 못 갔다). 코드 읽기 기반의 의심이다.

---

## 검증했고 문제를 못 찾은 것 (배포 판단용 — 여기는 걱정하지 않아도 된다)

1. **재시작 한가운데의 대국 복구가 정확하다.** 반장전 2국을 끝내고 3국 도중에 SIGTERM
   → 재기동 → 같은 계정으로 `joinRoom`. 점수 `[13000,40000,31000,16000]`, 좌석, 증강
   (`dora_conceal`), 도라 표시패, 국수·본장이 **전부 일치**했고 프롬프트도 복원돼 계속
   둘 수 있었다. `tsx qa-lab/round2/server/t13-restart-resume.ts` (before/after 2단계).
   차이로 찍힌 `turnCount 2→3` 은 종료 직전 내 좌석이 자동 폴백으로 한 수 둔 것이라
   기대된 값이다.
2. **프로토콜 퍼징에서 서버가 죽지 않는다.** 54종 메시지 × 18가지 악성 값 = 1330 메시지
   (미인증·인증·관리자 모두). `uncaught 0 / rejection 0`, 소켓 강제 종료 없음, 좌석 위조
   불가(`HumanAgent.handleMessage:1148` 이 `msg.seat` 을 **자기 pending 에 있는 좌석**으로만
   받는다). `tsx qa-lab/round2/server/t08-fuzz.ts`
   *(퍼징 중 나온 `changePassword` INTERNAL 5건은 **이미 고쳐진 것**이었다 — 6시간 전
   소스로 떠 있던 서버라서 재현됐고, 현재 워킹트리에는 `RoomManager.ts:1749` 에
   타입 가드가 들어 있다. 새 발견이 아니다.)*
3. **리소스 누수 없음.** 가입→방 생성→봇 3→소켓 파괴(절반은 `close`, 절반은 `terminate`)
   를 60사이클. `rooms`·`connections`·`wsClients` 가 매번 기준선으로 돌아왔고 RSS 는
   152MB→153MB 로 평평했다. `authIpHits`·`roomCreateIpHits`·`inviteSentAt`·`heavyHits`
   전부 상한/정리 경로가 있다. `QA_CYCLES=60 tsx qa-lab/round2/server/t14-leak.ts`
4. **백업이 실제로 복구 가능한 스냅샷을 만든다.** `scripts/backup.sh` → `--verify` 가
   gzip 을 풀어 `integrity_check` + 테이블 수 + stats/stats.augments JSON 파싱까지 통과.
   WAL 함정(`.backup` 사용, 스냅샷을 DELETE 저널로 전환, 곁파일 삭제)이 제대로 처리돼 있다.
5. **재접속·이탈 경로가 대체로 정확하다.** 드래프트 오퍼 중 소켓 강제 절단 → 재접속 시
   카드 3장이 그대로 복원되고 이미 쓴 새로고침 슬롯이 잠긴 채(`rerollable [false,true,true]`)
   돌아왔다. 대기실 방장 이탈 → 승계 정상. 강퇴 후 재입장 → `KICKED` 로 차단.
   같은 계정 2중 접속에서 **옛 소켓의 액션은 좌석에 먹히지 않는다**(확정 2는 그 사실을
   옛 탭에 알려 주지 않는다는 별개의 문제다). `tsx qa-lab/round2/server/t09-reconnect2.ts`
6. **동시 입장 경합 없음.** 5명이 같은 tick 에 3자리 남은 방으로 `joinRoom` → joined 3 /
   error 2. 정원 초과·좌석 중복 없음. `tsx qa-lab/round2/server/t11-concurrency.ts`
   *(t11 이 «좌석 id 중복»·«액션 연타 소프트락»을 찍은 것은 둘 다 스크립트 쪽 오탐이다 —
   전자는 lobby 의 필드명을 잘못 읽었고, 후자는 판이 240초보다 오래 걸렸을 뿐 서버 로그상
   `게임 종료` 로 정상 완주했다.)*

## 덜 본 범위 (다음 라운드용)

- `analytics.ts` · `httpCache.ts` · `trustProxy.ts` · `ogCard.ts` — 코드만 훑었고 실행 검증 없음.
- 관전(`spectate`) 경로의 재접속·지연 관전, 관리자 일시정지/무효/시간연장의 경합
  (`adminPauseGame` 과 타이머 만료가 겹치는 순간). 의심 1이 여기 걸려 있다.
- `AugmentStatsStore` 의 20판 주기 티어 자동조정이 확정 1의 이중 기록으로 얼마나 틀어지는지
  정량화하지 않았다.
- `deploy/agents.sh` · `launchd.sh` 의 등록/해제 실패 경로(TCC 진단 분기)는 launchd 를
  실제로 건드려야 해서 손대지 않았다.
