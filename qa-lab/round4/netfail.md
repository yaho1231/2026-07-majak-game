# QA 4라운드 — netfail (끊기고·느리고·실패할 때)

관점: 정상 경로가 아니라 **실패 경로**만 본다. 소켓 끊김/재연결, 중복·순서, 서버 재시작,
이탈/AFK, 실패 메시지 품질, ErrorBoundary 이후의 탈출구, 느린 회선.

읽은 것: `packages/client/src/{App.tsx, resendPolicy.ts, productionQueue.ts, ErrorBoundary.tsx,
storage.ts, replayRebuild.ts, main.tsx}`, `packages/client/public/sw.js`,
`packages/server/src/{index.ts, RoomManager.ts, HumanAgent.ts}`.

---

### [P2] 재연결 중에 누른 「나가기」는 서버에 영영 닿지 않는다
- 위치: packages/client/src/App.tsx:3828 (`returnHome`) · packages/client/src/resendPolicy.ts:118 (`leaveRoom`이 재전송 대상) · packages/server/src/RoomManager.ts:1979
- 증상: 회선이 끊겨 「서버와 재연결 중…」 띠가 떠 있는 동안(마지막 뷰는 그대로 렌더된다) 「나가기」를 누르면 화면은 홈으로 정리된다. 그런데 서버에는 그 좌석이 그대로 남는다. 다시 붙고 나면 홈에 **「진행하던 방으로 재접속」 버튼이 도로 떠서**, 방금 나간 판이 안 나간 것처럼 보인다. 남은 사람들 쪽에서는 그 자리가 «접속 끊김»으로 남아 결정마다 5초씩 유예를 먹고, 이탈 확정까지 8번을 더 흘려야 한다.
- 재현/근거: `returnHome()`이 `send({ type: "leaveRoom" })`을 부르는데, 소켓이 닫혀 있으면 `send`는 이 타입을 **재전송 큐에 담는다**(`RESENDABLE_MESSAGES`에 `leaveRoom`이 있다). 재연결 후 `authOk`에서 `flushPendingSends()`가 그걸 보내지만, 그때는 **새 연결**이라 서버의 핸들러가 보는 값이 다르다:
  ```ts
  case "leaveRoom": {
    const room = conn.room;              // 새 연결 → null
    ...
    if (room !== null && conn.agent !== null) { ... }   // 통째로 건너뛴다
    return;                              // 오류도 응답도 없다
  }
  ```
  `conn.room`은 `joinRoom`으로만 채워지므로, 재입장하지 않은 새 연결의 `leaveRoom`은 **아무 일도 하지 않고 아무 말도 남기지 않는다.**
- 판정: 확정
- 제안: (a) 서버에서 `leaveRoom`을 신원 기준으로도 받게 한다 — `conn.room`이 null이면 `resumableRoomFor(user)`로 방을 찾아 그 좌석을 `abandon`시킨다(찾지 못하면 그때만 조용히 무시). (b) 그게 부담이면 클라이언트에서 끊긴 상태의 「나가기」를 볼라틸로 취급해 "지금은 나갈 수 없습니다 — 다시 연결되면 눌러 주세요"라고 말하고 화면을 정리하지 않는 편이 정직하다. 지금은 «화면만 나가고 서버는 안 나간 상태»가 조용히 만들어진다.

### [P2] 서버가 꺼져 있으면 「재연결 중…」만 영원히 — 진단 문구도, 수동 재시도 버튼도 도달할 수 없다
- 위치: packages/client/src/App.tsx:3598-3603, 3648-3657, 7182, 7589-7593
- 증상: 서버가 내려가 있거나 배포 중이면 화면 맨 위에 「⟳ 서버와 재연결 중…」이 무한히 돈다. 10초마다 재시도하지만 **몇 번째인지, 왜 안 되는지, 얼마나 더 기다려야 하는지 한 마디도 없다.** 로그인 화면의 버튼은 「재연결 중…」이라고 적힌 채 계속 비활성이다. 사람은 그 상태를 «내 인터넷 문제»와 구별할 수 없다.
- 재현/근거: 오류 상태 `"closed"`로 가는 길이 하나뿐이고, 그게 **언마운트 정리 경로**다:
  ```ts
  if (intentionalCloseRef.current) { setConnection("closed"); return; }
  ```
  `intentionalCloseRef.current = true`는 App.tsx:3700 — 마운트 이펙트의 cleanup에서만 세운다. 즉 살아 있는 화면에서 `connection === "closed"`는 **절대 나오지 않는다.** 그래서 그 값에 매달린 두 UI가 전부 죽은 코드다:
  ```ts
  const disconnected = props.connection === "closed";   // 7182 — 언제나 false
  {disconnected ? <button …>서버에 다시 연결</button> : <button disabled …>재연결 중…</button>}
  ```
  상태 줄의 「연결 끊김」 라벨(7305 부근)도 같은 이유로 뜨지 않는다.
- 판정: 확정
- 제안: 재시도 횟수(`reconnectAttemptsRef`)를 화면에 흘린다. 예: 3회를 넘으면 띠 문구를 「서버에 닿지 않습니다 (N번째 시도) — 점검 중일 수 있습니다」로 바꾸고, 그 자리에 **지금 다시 시도** 버튼(`connect`)을 붙인다. 이미 만들어 둔 「서버에 다시 연결」 버튼을 `closed`가 아니라 «시도 횟수 임계»에 매다는 것으로 충분하다.

### [P2] 리플레이 청크를 한 번 못 받으면 그 탭에서는 리플레이가 영영 안 열린다
- 위치: packages/client/src/App.tsx:21674-21678
- 증상: 회선이 잠깐 끊긴 상태에서(또는 배포 직후 옛 탭에서 해시가 바뀐 자산을 청하다가) 리플레이를 열면 재구성 화면에 영문 원문 「Failed to fetch dynamically imported module: …/assets/replayRebuild-XXXX.js」만 뜨고 버튼은 「돌아가기」뿐이다. **회선이 돌아온 뒤 다른 리플레이를 눌러도 같은 오류가 계속 난다** — 새로고침해야 풀린다.
- 재현/근거:
  ```ts
  let replayModulePromise: Promise<ReplayRebuildModule> | null = null;
  function loadReplayModule(): Promise<ReplayRebuildModule> {
    replayModulePromise ??= import("./replayRebuild.js");
    return replayModulePromise;
  }
  ```
  `??=`는 **거절된 프로미스도 그대로 캐시한다.** 이후 모든 호출이 같은 rejected 프로미스를 돌려받으므로 재시도 경로가 없다. `ReplayViewer`는 그 거절을 `setError(e.message)`로 그대로 화면에 옮긴다(App.tsx:21695-21703, 21823). 배포 시 자산 해시가 바뀌고 없는 `/assets/*.js`는 404 HTML을 돌려주므로(server/index.ts:552 `sendNotFound`) 이 경로는 **배포 때마다 열려 있는 탭에서 실제로 밟힌다.**
- 판정: 확정
- 제안: 실패한 프로미스를 캐시에서 지운다 — `replayModulePromise = import(...).catch(e => { replayModulePromise = null; throw e; })`. 그리고 오류 화면에 「다시 시도」 버튼을 두고, 문구는 영문 원문 대신 「리플레이 모듈을 받지 못했습니다 — 연결을 확인하고 다시 시도해 주세요(새 버전이 배포된 경우 새로고침)」로 바꾼다.

### [P2] 서버 메시지 처리 중 예외는 ErrorBoundary 밖이다 — 콘솔에만 남고 화면은 그 자리에 멎는다
- 위치: packages/client/src/App.tsx:3570-3585 · packages/client/src/main.tsx:22-27
- 증상: 서버가 예상 밖의 값을 실은 프레임을 보내면(콘텐츠 버전 어긋남, 미지의 증강 id, 프록시가 건드린 프레임 등) `handleServerMessage` 안에서 예외가 나고 **그 메시지의 나머지 처리가 통째로 건너뛰어진다.** 사용자에게는 토스트도, 크래시 화면도, 아무 표시도 없다 — 화면이 갱신되지 않은 채로 남고, 다음 프레임이 오면 반쯤 어긋난 상태로 이어진다. 「눌렀는데 아무 일도 안 일어난다」의 또 다른 정체다.
- 재현/근거: 파싱만 감싸져 있고 처리는 맨몸이다.
  ```ts
  let msg: ServerMessage;
  try { msg = JSON.parse(event.data as string) as ServerMessage; }
  catch { console.warn("서버 메시지를 해석하지 못했습니다 — 이 프레임은 버립니다"); return; }
  handleServerMessage(msg);   // ← try 밖
  ```
  ErrorBoundary는 **렌더 중** 예외만 잡는다(ErrorBoundary.tsx 주석이 스스로 그렇게 적어 두었다). 이벤트 리스너 예외는 `main.tsx`의 `window.addEventListener("error", …)`로 가는데, 거기서 하는 일은 `console.error` 하나뿐이다.
- 판정: 확정
- 제안: `handleServerMessage(msg)`를 try/catch로 감싸고, 잡히면 (1) 콘솔에 스택, (2) 사용자에게 「방금 받은 정보를 처리하지 못했습니다 — 화면이 어긋나면 새로고침해 주세요」 토스트를 낸다. 전역 `error`/`unhandledrejection` 핸들러도 최소한 같은 토스트를 띄우게 한다(지금은 사용자에게 완전히 침묵한다).

### [P2] 재접속하면 프롬프트는 비우는데 **연출 큐와 대기 중인 결과창**은 그대로 남는다
- 위치: packages/client/src/App.tsx:4416-4440 (`joined` 처리) · 3123-3167 (연출 펌프/`pendingResult`)
- 증상: 판 도중 끊겼다 붙으면, 끊기기 전에 줄 서 있던 컷인·배너가 **복원된 새 판 위에서 뒤늦게 재생된다**(이미 지나간 리치 배너·증강 컷인). 더 나쁜 경우: 끊길 때 `pendingResult`에 국 결과가 담겨 있었으면 재접속 뒤에 **지난 국의 결과창**이 열리고, 그 창을 닫으면서 나가는 `roundContinue`가 서버 쪽에서는 «지금 기다리는 대기»를 해소한다 — `resendPolicy.ts`가 `roundContinue`를 볼라틸로 둔 이유로 적어 둔 「늦게 가면 다음 국 결과창을 건너뛴다」가 로컬 상태 경로로 그대로 일어난다.
- 재현/근거: `joined` 처리는 "지금 화면에 떠 있는 선택지는 전부 낡았다"는 판단을 하고도 프롬프트·드래프트만 비운다:
  ```ts
  setPrompts({});
  setDraft(null);
  setDraftPicked(false);
  draftPickedRef.current = false;
  ```
  `clearProductions()`·`pendingResult.current = null`은 여기 없다 — 그 둘은 `resetGameState()`(3730 부근)와 `continueInRoom()`에만 있고, 재접속은 두 경로 어디도 지나지 않는다. 서버는 재접속 때 `lastView`와 «지금 실제로 기다리는 것»만 복원하고 `roundOver`를 다시 보내지 않으므로(HumanAgent `reconnect`), 남아 있는 큐는 전부 낡은 것이다.
- 판정: 확정
- 제안: `joined` 처리에 `clearProductions()`와 `pendingResult.current = null`(및 `setRoundResult(null)`, `bannerShown`/`resetFxSeen` 초기화)을 더한다. 프롬프트를 비우는 것과 같은 근거다 — 낡은 연출을 버려서 잃는 것은 «이미 지나간 컷인» 하나뿐이다.

### [P2] 세션이 만료되면 큐가 남아, 15초 안에 다시 로그인한 사람이 누른 적 없는 방에 들어간다
- 위치: packages/client/src/App.tsx:4100-4110 (`TOKEN_INVALID`) · 3433-3441 (`flushPendingSends`) · resendPolicy.ts:150 (`RESEND_TTL_MS = 15_000`)
- 증상: 끊긴 사이에 「방 만들기」나 「코드로 참가」를 눌렀는데 재연결 후 세션이 만료돼 로그인 화면으로 돌아갔다. 거기서 비밀번호를 다시 넣고 들어오면, **누른 지 십몇 초 지난 그 조작이 로그인 직후 저절로 실행된다** — 홈을 보려던 사람이 갑자기 새 방 대기실에 앉아 있다.
- 재현/근거: `TOKEN_INVALID` 분기는 저장소·인증 상태를 정리하고 `return` 한다. `pendingSends.current`는 **비우지도 흘리지도 않는다**(같은 파일의 `GUEST_SESSION_GONE` 분기는 바로 옆에서 `flushPendingSends()`를 부른다 — 이 자리만 빠졌다). 그 큐는 다음 `authOk`에서 `flushPendingSends()`가 그대로 태우고, 걸러 내는 기준은 `RESEND_TTL_MS`(15초)뿐이다. 반대로 15초를 넘겼으면 **아무 말 없이 사라진다** — 눌렀던 것이 왜 안 됐는지 알 길이 없다.
- 판정: 확정
- 제안: `TOKEN_INVALID`에서 `pendingSends.current = []`로 큐를 버린다(로그인이 갈렸으면 그 조작들의 전제도 사라졌다). 겸해서 `dueForResend`가 TTL로 버린 건이 있으면 「연결이 끊긴 사이 누른 조작 N건은 취소됐습니다 — 다시 눌러 주세요」를 한 번 알리는 편이 좋다.

### [P3] 끊긴 동안 누른 «상태 요청»은 아무 표시도 남기지 않는다
- 위치: packages/client/src/App.tsx:3399-3415 (`send`) · 9788-9816 (`RefreshButton`)
- 증상: 볼라틸 메시지(타패·드래프트 픽 등)는 실패하면 「서버와 연결이 끊겼습니다 — 다시 연결되면 눌러 주세요」 토스트가 뜬다. 그런데 재전송 대상(새로 고침·목록 조회·준비·봇 추가…)은 **조용히 큐로 들어간다**. 새로 고침 버튼은 0.9초 돌고 멈추는데 목록은 계속 「불러오는 중…」이고, 사람은 버튼이 고장 난 것으로 읽는다.
- 재현/근거: `send`는 `isResendable(msg.type)`이면 토스트 없이 `enqueueSend`만 하고 `false`를 돌려준다. `RefreshButton`의 회전은 스스로 주석대로 「완료가 아니라 접수의 표시」라 서버 왕복과 무관하게 멈춘다.
- 판정: 확정
- 제안: 큐에 담겼을 때도 한 번은 말한다 — 「연결이 돌아오면 처리합니다」 정도의 조용한 토스트(볼라틸과 같이 끊김당 1회 제한). 재연결 띠가 떠 있는 동안은 새로 고침 버튼을 비활성으로 두는 것도 같은 값을 한다.

### [P3] ErrorBoundary의 «반복» 판정이 리셋되지 않는다
- 위치: packages/client/src/ErrorBoundary.tsx:44-46, 96-101
- 증상: 한 번 터지고 「다시 그리기」로 정상 복귀한 뒤, 한참 뒤에 **전혀 다른 원인**으로 한 번 더 터지면 곧바로 「같은 문제가 반복됩니다. 지금 있는 방이 원인일 수 있으니 …」가 뜬다. 방과 무관한 오류에 방을 버리라고 권하는 것이라, 사용자가 멀쩡한 대국에서 나가게 만든다.
- 재현/근거: `retry()`는 `{ error: null, detailOpen: false, copied: false }`만 세우고 `count`는 두므로, `repeated = count >= 2`가 세션 내내 누적된다.
- 판정: 확정
- 제안: `retry()`에서 `count`도 0으로 되돌린다. «반복»의 뜻을 지키려면 「마지막 오류 이후 N초 안의 재발」로 좁히는 편이 더 정확하다.

---

## 이상 없음이라고 적어 두는 것 (실패 경로를 따라가 확인한 것)

억지로 채우지 않기 위해, 이번 관점에서 **확인했고 문제를 못 찾은** 것을 남긴다.

- **중복 전송.** `resendPolicy.ts`의 주장(«큐에 담기는 것은 전송에 실패한 것뿐 → 이미 나간 메시지가 다시 나갈 길이 없다»)은 `send`의 구현과 일치한다(소켓이 OPEN이면 그 자리에서 보내고 큐를 거치지 않는다). 늦게 도착한 액션은 서버 쪽에서도 `HumanAgent.handleMessage`가 «지금 대기 중인 프롬프트의 옵션과 정확히 일치»할 때만 받으므로(옵션 payload 문자열 대조) 두 번 반영되지 않고, 지나간 것은 「이미 지나간 선택입니다」로 되돌아온다.
- **순서 뒤바뀜.** 재전송은 담긴 순서를 그대로 지키고(`dueForResend`), `handOrder`만 마지막 것으로 접힌다. 연출 큐의 우선순위 삽입(`insertByPriority`)은 같은 등급 안에서 순서를 보존하고, 📜 기록은 재생 시점이 아니라 enqueue 시점에 쌓이므로 순서가 왜곡되지 않는다.
- **서버 재시작.** `gracefulShutdown` → `RoomManager.shutdown()`이 진행 중인 방에 `gameAborted`(「서버가 재시작합니다 — 잠시 후 다시 접속해 주세요」)를 먼저 보내고 리플레이를 디스크까지 flush한 뒤 소켓을 닫는다. 부팅 시 `restoreLiveGames()`가 6시간 이내의 판을 좌석·통계·운영자 정지/공지까지 복원하고, 로그인의 `authOk.resumeRoom`이 홈의 재접속 버튼을 실제 상태에 맞춰 준다. 한 명이 돌아오면 나머지 좌석의 3분 보류가 평소 유예(5초)로 줄어드는 처리(RoomManager.ts:2969)도 들어 있다.
- **이탈/AFK.** 끊긴 좌석은 결정마다 5초 유예, 연속 8회면 이탈 확정(그래도 좌석은 남아 `reinstate`로 돌아올 수 있다). 중단 투표 정족수에서 빠지고, 남은 사람의 판은 계속 간다. 1인 방(체험·연습)은 3분간 판을 세워 두고 기다린다.
- **느린/악의적 소비자.** `HumanAgent.sendRaw`와 `RoomManager.send` 양쪽에 4MB 백프레셔 상한이 있고, 클라이언트도 10초 ping / 8초 무응답이면 스스로 끊고 백오프 재연결로 넘어간다.
- **저장소 실패.** `safeStorage`가 `localStorage` 접근 자체의 예외(차단·프라이빗·용량 초과)를 흡수하고 세션 메모리로 대체한다.
- **HTTP 실패 문구.** 가입·로그인·전적·리플레이 로드는 전부 WebSocket으로 오간다(클라이언트에 `fetch`는 효과음 샘플 한 곳뿐이다). 그 실패 문구들은 이미 폼/카드 안에 남고(«비밀번호는 8자 이상…», «이미 지나간 증강 후보입니다…») 사유별로 갈라져 있어, 「실패했습니다」로 끝나는 자리는 이번에 못 찾았다. 남은 실패 문구 문제는 위 P2 세 건(리플레이 청크 영문 원문 · 재연결 진단 없음 · 메시지 처리 예외 침묵)이다.

---

## 확정건 요약

| 심각도 | 제목 | 위치 |
|---|---|---|
| P2 | 재연결 중 「나가기」가 서버에 닿지 않는다 | App.tsx:3828 · RoomManager.ts:1979 |
| P2 | 서버가 꺼져 있으면 「재연결 중…」만 무한 — 진단·수동 재시도 도달 불가 | App.tsx:3598, 7182, 7589 |
| P2 | 리플레이 청크 로드 실패가 세션 내내 굳는다(거절된 프로미스 캐시) | App.tsx:21674 |
| P2 | 서버 메시지 처리 예외가 ErrorBoundary 밖 — 사용자에게 완전 침묵 | App.tsx:3584 · main.tsx:22 |
| P2 | 재접속이 연출 큐·대기 중 결과창을 비우지 않는다 | App.tsx:4416, 3123 |
| P2 | 세션 만료 시 재전송 큐가 남아 로그인 직후 저절로 실행된다 | App.tsx:4100 |
| P3 | 끊긴 동안 누른 «상태 요청»은 아무 표시도 남기지 않는다 | App.tsx:3399, 9788 |
| P3 | ErrorBoundary의 «반복» 판정이 리셋되지 않는다 | ErrorBoundary.tsx:44 |

P0 없음. P1 없음 — 위 P2 중 가장 아픈 것은 「나가기가 안 먹는다」와 「연출/결과창 잔상」이지만,
둘 다 판을 못 하게 만들지는 않는다.
