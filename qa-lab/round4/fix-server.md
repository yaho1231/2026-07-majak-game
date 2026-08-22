# QA 4라운드 수정 로그 — server-fix

담당 파일: `packages/server/src/{index.ts, ogCard.ts, analytics.ts, RoomManager.ts}` · `packages/server/test/`
(봇 관련 파일과 클라이언트는 손대지 않았다.)

| 항목 | 고친 방법 | 근거/테스트 |
| --- | --- | --- |
| **[P0] 초대 카드 라우트로 이벤트 루프 정지** (`ops.md`) | ① `ogCard.ts`의 `deflateSync(raw, { level: 9 })` → `level: 1`. ② `index.ts` HTTP 핸들러 맨 앞에 IP 레이트리밋을 걸고, `/og/room/*`에는 **비싼 창**(기본 20회/10초)을 따로 건다. 기존 `clientIpOf` + `abuseKeyOf`를 그대로 재사용한다. | 실측(아래 §측정) 85 ms/장 → **1.6 ms/장**, 8연결 flood 중 `/healthz` 최대 **915 ms → 40 ms**. 테스트: `test/OgCard.test.ts` «압축 레벨» (zlib FLEVEL 비트로 되읽어 level 9 복귀를 잡는다), `test/HttpRateLimit.test.ts` (실서버 기동 후 429 확인) |
| **[P1] HTTP 요청 전반 IP 레이트리밋 부재** | 같은 자리에 두 창을 뒀다. 일반(정적·문서) `HTTP_RATE_MAX` 기본 **300회/10초**, 비싼 것(`/og/room/*`, `?room=` 초대 문서 — 요청마다 index.html 재압축) `HTTP_COSTLY_RATE_MAX` 기본 **20회/10초**. 넘으면 `429 + Retry-After: 10`, 로그는 1분에 한 줄로 접는다. `connRateHits`와 같은 규약으로 4096 항목 상한 정리. **`/healthz`는 제외**(감시자가 1분마다 부른다), 진짜 루프백은 기존대로 면제. | 한계값 근거: 첫 로드에 정적 자산 수십 개가 필요하므로 300/10초면 사람은 닿지 않는다(실측 정상 로드 ≪ 100). 크롤러의 공유 카드 미리보기는 링크당 1~수 회라 20/10초 안에 든다. 테스트: `test/HttpRateLimit.test.ts` — 카드 창 초과 시 429, 정적도 결국 429, `/healthz`는 120회에도 429 0건 |
| **[P2] 방문자 `seen` 집합 무한 증가** (`analytics.ts`) | 집합에 상한(기본 200,000, `ANALYTICS_SEEN_LIMIT`로 조절)을 두고, 넘으면 그 뒤로는 `views`만 센다(경고는 하루 한 줄). 날짜가 바뀌면 상한 표식도 함께 초기화. 방문자 수는 문서에 이미 «하한»이라고 적혀 있어 성질이 유지된다. | 테스트: `test/AnalyticsSeenCap.test.ts` — UA를 바꿔 가며 100회 호출 시 `views` 100 / `visitors` 10(상한) / `seen.size` 10 |
| **[netfail P2] 재연결 중 「나가기」가 서버에 닿지 않는다** (`RoomManager.ts`) | `leaveRoom`에서 `conn.room`이 null이면 **신원으로** 돌아갈 방을 찾아(`resumableRoomFor`) 그 좌석을 정리한다 — 대기실이면 `leaveWaiting`, 진행 중이면 `abandon("left")` + `refreshSeatStatus` + `abortIfNoHumansLeft`. 찾지 못하면 조용히 지나간다. **좌석의 소켓이 살아 있으면 건드리지 않는다**(다른 탭이 정상적으로 앉아 있는 경우 — `ServerHardening`의 «예전 탭이 남의 자리를 포기시킬 수 없다» 회귀를 지킨다). | 테스트: `test/IdleAndLeave.test.ts` — 판 진행 중 소켓을 끊고 **새 연결**로 `leaveRoom`을 보내면 좌석이 정리되고 `resumableRoomFor`가 null이 된다. 이 분기를 죽이면 실제로 실패하는 것을 확인했다. 「돌아갈 방 없음」은 오류를 만들지 않는 것도 함께 고정 |
| **[loop P2] 기다리는 방이 30분 뒤 예고 없이 닫힌다** | `sweepIdleRooms`가 닫히기 `ROOM_IDLE_WARN_MS`(기본 5분) 전에 방에 남은 사람에게 한 번 알린다 — 「이 방은 약 N분 뒤 자동으로 닫힙니다 — 아무 버튼이나 누르면 시간이 다시 늘어납니다」. 대기실에서 무엇이든 누르면(`touch`) 예고 표식이 시계와 함께 되돌아간다. 실제로 닫을 때의 문구에도 사유를 담았다: 「… 초대 링크도 함께 만료됩니다. 홈에서 새로 만들어 주세요」. **새 메시지 타입을 만들지 않았다** — 클라이언트가 모르는 `error` 코드를 그대로 토스트로 띄우므로(App.tsx의 마지막 분기) `ROOM_IDLE_WARNING` 한 줄이면 화면에 닿는다(클라이언트는 담당 밖이라 손대지 않았다). | 테스트: `test/IdleAndLeave.test.ts` — 예고는 정확히 한 번, 조작하면 시계가 되돌아가 다시 한 번, 닫힘 문구에 「초대 링크」 포함 |

## 고치지 않은 것 (이유)

- **[P2] 서버·감시자·백업 로그가 실행 중에는 회전하지 않는다** — 위치가 `scripts/majak.sh`·
  `scripts/watchdog.sh`·`scripts/backup.sh`로 **담당 파일 밖**이다(배정: server/src + server/test).
  오케스트레이터가 스크립트 담당에게 넘기거나 별건으로 다뤄야 한다.
- **[P3] 리플레이 1년 보존·백업 미러 누적** — 지침대로 P3는 건너뛴다(보고서도 «기록용»).
- **netfail의 나머지 P2·P3 6건** — 전부 `packages/client/*` 파일이라 담당 밖이다.

## 측정 (P0 재측정)

별도 포트(`PORT=3199`)로 워크트리 코드를 띄워 측정하고 **그 PID만** 종료했다.
운영 서버(`~/majak`)에는 손대지 않았다.

| 지표 | 보고서(수정 전) | 재측정(수정 후) |
| --- | --- | --- |
| `/og/room/*` 순차 30장 | 85 ms/장 | **1.6 ms/장** (약 50배) |
| 카드 파일 크기 | 4.8 KB | 14.6 KB (공유 카드로 무의미한 차이) |
| `/healthz` 평시 | 18.8 ms | 0.3 ms |
| 8연결 6초 flood 중 `/healthz` | max 915 ms · avg 702 ms | **max 40 ms · avg 10 ms** |

레이트리밋 실측(프록시 헤더로 원격 IP를 흉내, 같은 IP):
`/og/room/*` 40회 → 200 20회 + 429 15회(+404 5회), 정적 400회 → 429 100회,
`/healthz` 400회 → 429 **0회**.

## 검증

- `npx vitest run packages/server` → **74 파일 · 830건 전부 통과**
- `npm run typecheck:server` → 에러 0
