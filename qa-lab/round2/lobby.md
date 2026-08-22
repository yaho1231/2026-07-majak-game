# 대국 바깥(방·친구·전적·리플레이·제보·공지) — lobby

## 요약
실제 판 **4판** 완주(동풍전 3 + 체험 1, 사람 1 + 봇 3) + 판을 돌리지 않는 경로
훑기 5종. 커버리지: 방·대기실 / 친구 / 전적·통계·리더보드·증강 메타 / 리플레이
(목록·권한·공유 토큰·**재생 정확성**) / 제보 / 공지.
**확정 6건 · 의심 2건.** (🟠 1 · 🟡 5)

| # | 심각도 | 한 줄 |
|---|---|---|
| 1 | 🟡 | `kickPlayer` 로 지운 봇의 성향 지정이 남아 다음 봇이 물려받는다 (지금 UI 로는 닿지 않는 프로토콜 버그) |
| 2 | 🟠 | 친구 100명 상한이 **수락 경로에서 우회**된다 — 사실상 무제한 |
| 3 | 🟡 | 정원이 찬 방에서도 친구 초대장이 나간다 (받는 쪽은 눌러야 `ROOM_FULL`) |
| 4 | 🟡 | 친구 «접속 중» 표시가 아무 때도 갱신되지 않는다 (push 없음 · 폴링 없음) |
| 5 | 🟡 | 리플레이 결과 패널이 **뒷도라 표시패를 안 보여 준다** — 「뒷도라 2판」의 근거가 빈다 |
| 6 | 🟡 | 제보 «제출»이 한 번 실패하면 «올리는 중…»에 영구 고착 + 연타 방지도 실제로는 안 걸린다 |

재현 스크립트: `qa-lab/round2/lobby/`
(`/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/lobby/<파일>.ts`)
`t1-room` 방·대기실 / `t2-friend` 친구 / `t3-stats` 전적·통계(판 3개, ~15분) /
`t4b-replay` 리플레이 재구성 대조(판 1개, ~5분) / `t5-misc` 초대·제보·공지 /
`t6-room2` 대기실 나머지 / `t7-replayperm` 리플레이 권한·공유 / `t8-online` 온라인 표시.
(`t4-replay.ts` 는 `fillWithBots` 를 쓰던 첫 판 — `t4b` 가 대체한다.)

---

## 확정 1. 🟡 방장이 봇을 «강퇴»로 지우면 그 자리의 성향 지정이 남아, 다음에 넣는 봇이 지운 봇의 성향을 물려받는다

- 위치: `packages/server/src/RoomManager.ts` — `handleLobbyMessage` 의 `case "kickPlayer"`
  중 봇 분기 (`// 봇을 지정했으면 removeBot과 같은 처리`)
- 기대: 주석 그대로 `removeBot` 과 같아야 한다. `removeBot` 은 좌석을 지운 뒤
  `room.botArchetypes.delete(msg.playerId)` 와 `this.seatBotProfiles(room)` 을 함께 한다
  (removeBot 쪽 주석이 직접 경고한다: "안 그러면 나중에 그 좌석 id로 들어온 봇이
  지운 봇의 성향을 물려받는다").
- 실제: `kickPlayer` 의 봇 분기는 `room.agents.splice(...)` + `broadcastLobby(room)` 만 한다.
  `botArchetypes` 지정도, 남은 봇 재배치(`seatBotProfiles`)도 하지 않는다.
- 재현: `tsx qa-lab/round2/lobby/t1-room.ts`
  ```
  archetype set: [ [ 'p1', 'attacker' ] ]
  after kickPlayer, botArchetypes: [ [ 'p1', 'attacker' ] ]
    FAIL kickPlayer(봇)이 botArchetypes 지정을 지운다 — 남음: [["p1","attacker"]]
  new bot after re-add: p1 attacker
    FAIL 새 봇이 지운 봇의 성향을 물려받지 않는다 — p1 archetype=attacker
  ```
  ⚠ **지금 클라이언트에서는 이 경로가 닿지 않는다** (2026-08-22 재확인): 대기실
  좌석의 ✕ 는 `isHost && p.isBot` 이면 `onRemoveBot`(=`removeBot`)을 보내고
  `kickPlayer` 는 사람 좌석에만 쓴다(`App.tsx` — `seat-kick` 두 분기). 즉 프로토콜
  수준의 잠재 버그다 — 다른 클라이언트·구버전·직접 보낸 메시지에서만 터진다.
  그래서 심각도를 🟡로 둔다.
- 영향: 방장이 "이 성향 말고 다른 걸로" 하려고 봇을 빼고 다시 넣었는데 같은 성향이
  돌아온다. 또 `seatBotProfiles` 를 안 부르므로 남은 봇들의 원형 중복 회피도 낡은
  채로 남는다(같은 원형 둘이 앉을 수 있다).
- 제안 수정: 봇 분기를 `removeBot` 본문과 동일하게 — `botArchetypes.delete` +
  `seatBotProfiles(room)` 추가.

---

## 확정 2. 🟠 친구 상한 100명이 **수락 경로에서 통째로 우회된다** — 사실상 무제한

- 위치: `packages/server/src/SiteDb.ts` — `respondFriendRequest()`
  (`if (this.friendCount(userId) >= MAX_FRIENDS)` 한 줄만 있다)
- 기대: `requestFriend()` 는 **양쪽**을 본다 — `friendCount(userId)` 와
  `friendCount(row.id)` 둘 다 100 미만이어야 요청이 나간다. 즉 설계 의도는
  "누구도 친구 100명을 넘지 않는다"이다.
- 실제: `respondFriendRequest()` 는 **수락하는 쪽(userId)** 의 친구 수만 본다.
  요청을 **보낸 쪽**의 친구 수는 보지 않는다. 그래서 보낸 요청이 보류로 쌓여 있는
  동안 친구가 늘어나면, 그 보류분이 나중에 수락될 때 상한을 그냥 넘어선다.
  게다가 보낸-요청 상한(`sent >= MAX_FRIENDS`)은 **보류 중인 것만** 센다 —
  수락되어 빠져나간 만큼 자리가 비므로 계속 새로 보낼 수 있다. 반복하면 무제한이다.
- 재현: `tsx qa-lab/round2/lobby/t2-friend.ts`
  ```
  1단계 보낸요청 성공: 100 | 101번째: {"ok":false,"error":"보낸 요청은 100건까지입니다"}
  2단계 Cap 친구 수: 60
  3단계 추가로 보낸 요청: 30
  4단계 Cap 최종 친구 수: 130 (상한 100)
    FAIL MAX_FRIENDS(100) 상한이 지켜진다 — 실제 130명
  ```
  (2·3단계를 더 돌리면 계속 늘어난다 — 130은 이 스크립트가 만든 계정 수의 한계일 뿐이다.)
- 영향: 친구 목록은 `friendList` 로 **통째로** 나가고, 갱신될 때마다 `pushFriends`
  가 전 목록을 다시 만다. 상한이 없으면 목록 하나가 수천 줄이 되고, 관계가 바뀔
  때마다 그 크기의 프레임이 오간다. 자원 상한이 조용히 사라지는 부류(서버 부하)라
  🟠 로 둔다.
- 제안 수정: `respondFriendRequest` 의 accept 분기에 `friendCount(row.id) >= MAX_FRIENDS`
  검사를 추가한다(= `requestFriend` 와 대칭). 겸사겸사 `requestFriend` 의 보낸-요청
  상한을 `friendCount + pending sent` 합으로 세면 누적 우회도 막힌다.

---

## 확정 3. 🟡 정원이 **이미 찬** 방에서도 친구 초대장이 나간다 — 받는 쪽은 눌러야 «방이 가득 찼습니다»를 본다

- 위치: `packages/server/src/RoomManager.ts` — `private inviteFriend(...)`
  (조건 검사 목록: `NOT_IN_ROOM` → `ROOM_PLAYING` → 계정 존재 → `areFriends` →
  `room.kicked` → 쿨다운. **좌석이 남았는지는 어디서도 보지 않는다.**)
- 기대: 주석이 직접 «조건은 셋: 내가 대기실에 있을 것, 쌍방 친구일 것, 상대가
  접속해 있을 것»이라고 적었지만, 초대의 뜻은 "와서 앉아라"다. 앉을 자리가 없으면
  초대가 아니다 — `joinRoom` 이 `room.agents.length >= MAX_PLAYERS` 에서 그냥 거절한다.
- 실제: 방장 + 봇 3 = 4/4 인 방에서 `friendInvite` 가 성공하고(`FRIEND_INVITED`
  «InvB 님을 불렀습니다»), 상대 화면에는 초대 카드가 뜬다. 그 카드를 누르면
  `ROOM_FULL` 이다.
- 재현: `tsx qa-lab/round2/lobby/t5-misc.ts`
  ```
  방 인원: 4
  초대장: {"type":"friendInviteFrom","from":"InvA","code":"HGJ2CY",...} | 보낸 쪽 응답: {"code":"FRIEND_INVITED","message":"InvB 님을 불렀습니다"}
    FAIL 정원이 찬 방으로는 초대장이 안 간다 — 초대장 도착 code=HGJ2CY
  초대를 눌렀을 때: {"code":"ROOM_FULL","message":"방이 가득 찼습니다"}
  ```
- 영향: 흔한 순서가 정확히 이 순서다 — 방을 만들고 «봇 채우기»로 4자리를 채워
  둔 뒤 친구를 부른다. 부른 쪽은 «불렀습니다»를 보고 기다리고, 받은 쪽은 눌렀다가
  거절당한다. 게다가 초대는 **성공으로 쳐서 20초 쿨다운(`INVITE_COOLDOWN_MS`)을
  소모**하므로, 방장이 봇을 하나 빼고 곧바로 다시 불러도 «방금 보냈습니다»로 막힌다.
- 제안 수정: `inviteFriend` 의 쿨다운 검사 앞에
  `if (room.agents.length >= MAX_PLAYERS) return this.fail(conn, "FRIEND_INVITE_FAILED", "방에 빈 자리가 없습니다");`
  를 넣는다. (봇이 차 있는 것뿐이라면 «봇을 하나 빼고 부르세요»가 정확한 안내다.)

---

## 확정 4. 🟡 친구의 «접속 중» 표시가 **아무 때도 갱신되지 않는다** — 홈에 앉아 있는 동안은 들어온 순간의 사진 한 장

- 위치: 서버 `packages/server/src/RoomManager.ts` — `pushFriends()` 를 부르는 자리는
  **친구 관계가 바뀔 때뿐**이다(`friendRequest` · `friendRespond` · `friendRemove` ·
  `friendCancel`). 접속(`login`/`register`)·이탈(`close`)·대국 시작 어디에도 없다.
  클라이언트 `packages/client/src/App.tsx` — `friendList` 를 보내는 자리는
  ① 인증 직후 ② `refreshHome()`(홈으로 돌아올 때) ③ 대기실 진입 ④ 카드의 «↻» 단추.
  **주기 갱신도, 서버 push 도 없다.**
- 기대: 이 카드의 존재 이유가 코드 주석에 그대로 적혀 있다 —
  «친구는 **방을 만들기 직전에** 보는 것이다 … "지금 있나?"를 확인하고 방을 만들지
  말지를 정하는 자리». 대기실 쪽 주석은 한술 더 뜬다: «여기서 보는 것은 "지금 부를
  수 있는 사람"이라 낡은 목록은 그냥 틀린 목록이다».
- 실제: 홈 화면에 머무는 동안 친구가 접속하든 나가든 A의 화면은 그대로다.
  ```
  $ tsx qa-lab/round2/lobby/t8-online.ts
  B 이탈 후 A 가 받은 메시지: []
    FAIL 친구가 나가면 내 친구 목록이 갱신된다 — 아무 push 도 오지 않았다
  B 재접속 후 A 가 받은 메시지: []
    FAIL 친구가 접속하면 내 친구 목록이 갱신된다 — 아무 push 도 오지 않았다
  직접 물었을 때: [{"nickname":"OnB","online":true,"playing":false}]
  B 가 방을 만든 뒤 A 가 받은 것: []
  ```
  (`friendList` 를 **직접 물으면** 값은 정확하다 — 틀린 것은 계산이 아니라 «언제
  다시 계산되는가»다.)
- 영향: 홈에 5분 앉아 있다가 «접속 중»인 친구를 부르면 `친구 님은 지금 부를 수
  없습니다`(초대는 접속한 연결이 하나도 없으면 실패한다)가 돌아온다. 반대로
  방금 들어온 친구는 «오프라인»으로 보여 아예 부르지 않는다. 카드에 «↻» 단추가
  있어 완전히 막히지는 않으므로 🟡.
- 제안 수정: `onlineMap` 이 바뀌는 세 지점(인증 성공 · 연결 종료 · 방 입·퇴장)에서
  그 사람의 친구들에게 `pushFriends` 를 돌린다. 친구 수는 상한이 있으므로 비용은
  작다(단, 확정 2의 상한 우회를 먼저 막아야 한다). 정 부담되면 홈에서 30초 주기
  폴링만 붙여도 «틀린 목록»은 사라진다.

---

## 확정 5. 🟡 리플레이의 국 결과 패널이 **뒷도라 표시패를 절대 안 보여 준다** — 「뒷도라 2판」이라 써 놓고 근거가 없다

- 위치: `packages/client/src/replayRebuild.ts` — `replaySettlements()` 가
  `uraDoraIndicators: []` 를 **고정으로** 넣는다. (같은 함수가 표도라는
  `before.round.doraIndicators` 에서 제대로 꺼낸다.)
- 기대: 생방 결과 화면은 `HanchanController`가 화료 때
  `uraIndicatorIds(game.engine.state)` 로 뽑은 뒷도라를 실어 보내고, 결과 화면
  (`App.tsx` — `result.uraDoraIndicators.length > 0 ? …「뒷도라」…`)이 그 패를
  그린다. 역 목록에도 `w.uraHan > 0` 이면 「뒷도라 N판」 줄이 뜬다.
  바로 위 표도라 블록의 주석이 이유를 직접 적어 뒀다: «뒷도라만 실물로 뜨던 탓에,
  표시패 1장으로 설명되지 않는 판수가 나와도 **근거를 찾을 데가 없었다**».
  리플레이는 지금 그 반대쪽(표도라만 뜨고 뒷도라가 없는 상태)이 됐다.
- 실제: 실제 반장… 동풍전 한 판(5국)을 돌려 리플레이를 재구성했더니, 뒷도라 판수가
  붙은 화료가 2건인데 그중 표시패가 실린 것은 0건이었다.
  ```
  $ tsx qa-lab/round2/lobby/t4b-replay.ts
  리플레이 줄 수: 937
  재구성 이벤트 수: 936 | 국 수: 5
    ok   모든 줄이 재적용된다
  정산 건수: 5 | 국 수: 5 | 동1국 / 동2국 / 동2국 1본장 / 동3국 / 동4국
  뒷도라 판수가 붙은 화료: 2 | 그중 표시패가 실린 것: 0
    FAIL 뒷도라 판수가 있으면 표시패도 실린다 — 2건 중 0건만 표시패 있음
  정산 패널에 뒷도라가 하나라도 실린 국: false
  ```
- 영향: 리치로 화료한 국을 다시 볼 때 「뒷도라 2판」이 점수의 절반을 설명하는데
  화면에는 그 두 장이 없다. "왜 이 점수인가"를 되짚는 것이 리플레이의 요점이라
  정확히 그 자리에서 근거가 빈다.
- 제안 수정: `replaySettlements` 는 정산 **직전** 상태(`before`)를 이미 들고 있으므로
  코어의 `uraIndicatorIds(before)` 를 그대로 부르면 된다(생방과 같은 함수 · 같은 입력
  → 같은 답). 뽑은 id들을 `add(id)` 로 `tiles` 에도 넣어 줘야 그림이 뜬다.
  화료가 아닌 국(`outcome !== "win"`)은 지금처럼 빈 배열로 둔다.

### 겸사겸사 — 리플레이 **재생 정확성 자체는 통과**했다 (음성 결과, 재보고 방지용)
같은 판에서 `rebuildReplay` 가 937줄을 하나도 빠뜨리지 않고 재적용했고, 재구성 최종
점수가 서버 최종 점수와 **완전히 일치**했다(p0 4100 / p1 24000 / p2 20200 / p3 60300).
국 수(5)와 정산 건수(5)도 맞고, 드래프트된 증강이 전부 재구성 카탈로그에 있었다.
(위 출력의 «재구성 점수» FAIL 한 줄은 첫 판 스크립트가 `players` 를 배열 인덱스
키(`0..3`)로 읽어 `p0..p3` 와 대조하지 못한 **스크립트 쪽 실수**였다 — 값은 자리별로
정확히 같다. 스크립트는 고쳐 두었다.)

---

## 확정 6. 🟡 제보 «제출»이 **한 번 실패하면 그 자리에서 영구히 잠긴다** («올리는 중…» 고착) — 그리고 연타 방지 자체는 애초에 안 걸린다

- 위치: `packages/client/src/App.tsx` — `FeedbackBoard` 의 `submittedRef` / `sending`
  ```
  const submittedRef = useRef<string | null>(null);
  useEffect(() => {                       // 목록에 내 글이 뜨면 = 성공 → 비운다
    if (submittedRef.current === null) return;
    if (props.entries?.some((e) => e.title === submittedRef.current && e.mine)) { submittedRef.current = null; … }
  }, [props.entries]);
  const sending = submittedRef.current !== null;
  const canSubmit = title.trim() !== "" && body.trim() !== "" && !sending;
  function submit(): void { if (!canSubmit) return; submittedRef.current = title.trim(); props.onSubmit(…); }
  ```
- 기대: 주석이 두 가지를 약속한다 — ① «제출 중에는 다시 눌리지 않는다 (감사
  2026-08-17 §5-7)» ② «실패 시에는 error 토스트만 오므로 쓴 글이 날아가지 않는다».
- 실제: **둘 다 어긋난다.**
  1. **잠금이 안 풀린다.** `submittedRef` 를 비우는 유일한 길이 «목록에 그 제목의
     내 글이 나타나는 것»뿐이다. 실패하면 목록이 오지 않으므로 ref 는 영원히
     남고, 그 뒤 **모든 렌더에서 `sending === true`** 라 단추는 `disabled`
     «올리는 중…» 에 굳는다. 제목·본문을 바꿔도 그대로다.
     실패는 실제로 일어난다 — 시간당 상한(`FEEDBACK_PER_HOUR = 10`)이 있다:
     ```
     $ tsx qa-lab/round2/lobby/t5-misc.ts
     제보 성공/차단: 10 2
       ok   시간당 상한이 있다
     ```
     11번째 제보가 `FEEDBACK_FAILED` 로 떨어지고, 그 error 는 클라이언트에서
     `showToast(msg.message)`(=상태 변경 → 리렌더)를 부른다. 그 리렌더가 잠긴
     `sending` 을 화면에 못 박는다. (탭을 다른 곳으로 옮겼다 돌아오면
     `FeedbackBoard` 가 언마운트·재마운트되며 풀린다 — 그래서 🟡.)
  2. **연타는 여전히 막히지 않는다.** `submit()` 이 바꾸는 것은 **ref** 뿐이라
     리렌더가 일어나지 않는다. 응답이 오기 전까지 화면의 단추는 여전히
     `disabled=false` 이고 문구도 «제출» 그대로다 — §5-7 이 고치려던
     «느린 회선에서 같은 제보가 두 번 올라갔다»가 그대로 남아 있다.
     (`canSubmit` 은 렌더 시점의 값이라 두 번째 클릭도 `submit()` 에 들어간다.)
- 영향: 버그를 몰아서 적어 보내던 사람이 11번째에서 막히면 그 뒤로는 홈 탭을
  갈아 끼우기 전까지 아무것도 못 올린다. 반대쪽으로는 같은 제보가 두 벌 올라간다.
- 제안 수정: `submittedRef` 대신 `useState` 로 잠금을 들고(그래야 클릭 즉시
  리렌더돼 실제로 잠긴다), 성공(`entries` 갱신)뿐 아니라 **실패에서도 푼다** —
  `usernameCheck` 가 이미 쓰는 방식과 같다(«어떤 오류든 왔으면 기다림은 끝난
  것이므로 여기서 푼다», QA 2차 auth 확정 4의 수정). 부모에서 error 를 받을 때
  제보 잠금도 함께 풀어 주면 된다.

---

## 검증했고 **문제 없었다** (배포 판단용 · 재보고 방지용 음성 결과)

실제 판 4개(동풍전 3 + 체험 1, 사람 1 + 봇 3)를 완주시키고 결과를 직접 세어 대조했다.

### 전적·통계·리더보드 — `tsx qa-lab/round2/lobby/t3-stats.ts` (8 ok / 0 FAIL)
- 두 판을 끝낸 뒤 `listGamesFor` 판 수 = 2, `StatsStore.games` = 2, `periodStats(7일)` = 2.
- 착순 분포가 **실제 순위와 정확히 일치**(4위·3위 → `[0,0,1,1]`).
- 리더보드에 내 판 수가 그대로 잡히고, **비관리자에게는 닉네임이 지워져** 나간다.
- **연습(`practicePlay`) 판은 전적 목록에도 누적 통계에도 섞이지 않는다** (판 수 2 유지).
  게스트·샌드박스도 코드상 `recordGame`·`finishStats(persist)` 를 아예 타지 않는다.
- `augmentTierPicks` 가 늘 `[0,0,0]` 인 것은 버그가 아니다 — `PlayerStats.ts` 에
  `@deprecated 2026-07-22 등급 폐기` 로 명시돼 있다.

### 리플레이 재생 정확성 — `tsx qa-lab/round2/lobby/t4b-replay.ts`
- 937줄을 하나도 빠뜨리지 않고 재적용, **재구성 최종 점수 == 서버 최종 점수**,
  국 수(5) == 정산 건수(5), 드래프트 증강이 전부 재구성 카탈로그에 존재.
  (유일한 어긋남이 확정 5의 뒷도라다.)

### 리플레이 권한·공유 토큰 — `tsx qa-lab/round2/lobby/t7-replayperm.ts` (11 ok / 0 FAIL)
남의 판 열람 거부 · 남의 판 공유 링크 발급 거부 · 참가자 본인 열람 · 128비트 토큰
발급(22자) · **비로그인도 링크만으로 열람** · 해제하면 그 링크가 즉시 죽음 ·
재공유는 **새 토큰**(옛 링크가 되살아나지 않는다) · 없는 판 `REPLAY_NOT_FOUND` ·
파일 유실 `REPLAY_FILE_MISSING` · 관리자는 남의 판 열람 가능.
«없다»와 «권한 없다»를 같은 코드로 합치는 것도 그대로 지켜진다.

### 대기실 나머지 — `tsx qa-lab/round2/lobby/t6-room2.ts` (14 ok / 0 FAIL)
봇은 4자리를 못 넘음 · 3인 이하 시작 거부 · 미준비자 있으면 시작 거부 ·
방장 본인 `ready` 는 무시 · 비방장의 `addBot`/`shuffleSeats`/`setGameMode`/
`startGame`/방장 강퇴 전부 무시 · 소문자·공백 섞인 코드도 정상 참가 ·
같은 이름 재가입 차단 · 이미 방에 있는데 `createRoom` 하면 앞 방을 접고 새 방 ·
**남의 게스트/체험 방은 코드를 알아도 `ROOM_NOT_FOUND`**.
(t1: 없는 코드 · 정원 초과 · 방장 이탈 승계 · 강퇴 통보 · 강퇴자 재입장 거부도 통과.)

### 제보 — `tsx qa-lab/round2/lobby/t5-misc.ts`
공백 제목 거부 · 모르는 종류 거부 · 시간당 10건 상한 동작 · **남의 제보 안 보임** ·
남의 제보 삭제 거부 · 비관리자 수정 거부 · 비관리자 `adminSetNotice` 거부.
서버·클라이언트 길이 상한도 일치한다(제목 80 / 본문 4000, 서버 입구 8000 컷).
비로그인·게스트는 제보 화면 자체에 닿지 못한다(홈 안쪽 · `GUEST_ALLOWED_MESSAGES` 밖).

### 공지
`setNotice("")` → `serverInfo` 를 통째로 다시 보내고 클라는 메시지를 **교체**하므로
공지가 정확히 내려간다(병합이 아니라 교체라 잔상이 없다). 제목·본문은 JSX 텍스트로
그려지므로 **HTML 삽입은 통하지 않는다**. 길이는 서버가 `slice`(120/2000)하고
클라 입력도 같은 상수로 `maxLength` 를 건다.
※ «게임 중인 사람에게는 전역 공지가 화면에 안 뜬다»는 이미 admin 확정 3.

### 친구
자기 자신 요청 거부 · 없는 닉네임 거부 · 대소문자 무시 검색 · 중복 요청 거부 ·
수락 시 양쪽 즉시 갱신 · 초대 20초 쿨다운 · 친구 아닌 사람 초대 거부 ·
진행 중인 방으로는 초대 불가 · 계정 삭제 시 친구/요청 완전 삭제(재가입자가 남의
친구 자리를 물려받지 않는다). `username` 컬럼이 `UNIQUE COLLATE NOCASE` 라
대소문자만 다른 계정이 갈라져 전적이 엇갈릴 여지도 없다.

---

## 의심 1. 🟡 관리자가 제보에 답변을 달아도 **작성자는 알 길이 없다**
`updateFeedback` 은 `sendFeedback(conn, user)` 로 **관리자 자신에게만** 갱신된 목록을
보낸다. 작성자에게 가는 push 가 없어서, 답변을 받았는지는 홈 제보 탭을 다시 열어
봐야만 안다. (확정 4와 같은 «push 가 없는 화면» 부류다. 알림 체계가 아예 없는
것이라 기능 요구에 가까워 의심으로 둔다.)

## 의심 2. 🟡 비방장이 `startGame`·`addBot` 을 보내면 **아무 응답도 없다**
`handleLobbyMessage` 의 방장 전용 분기들은 전부 `return` 으로 조용히 버린다
(t6에서 확인). 지금 클라이언트는 단추를 감추므로 사람이 겪지는 않지만, 낡은 탭·
경합 상황에서 «눌렀는데 아무 일도 안 일어난다»가 된다. `startGame` 만은
`NOT_READY` 를 돌려주는 자리가 이미 있으므로 권한 실패도 같은 자리에서 말해 주는
편이 낫다.

---

## 덜 본 범위 (예산 안에서 못 본 것)
- **초대 링크 `?room=` 의 클라이언트 흐름**(로그인 전 링크 → 인증 후 자동 참가,
  `LAST_ROOM_KEY` 와의 상호작용)은 코드만 읽었고 브라우저로 돌려 보지 않았다.
- 리플레이 목록 상한(일반 50 / 관리자 200)을 실제로 넘겨 보지 않았다 — 51판째부터
  옛 판이 목록에서 사라지는데, 화면에 «더 보기»가 없다(코드 확인, 미검증).
- `pruneReplays` / 보존 기간(365일) 만료 뒤 목록에 남은 행 ↔ 사라진 파일의 조합은
  `REPLAY_FILE_MISSING` 만 확인했고 배치 자체는 안 돌려 봤다.
- 친구 100명 상한을 고친 뒤의 `friendList` 프레임 크기(확정 2의 영향 쪽)는 측정하지 않았다.
