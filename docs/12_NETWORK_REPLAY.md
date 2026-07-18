# 12_NETWORK_REPLAY
Version : 1.0
Status : Active
Last Updated : 2026-07-15

WebSocket 서버, PlayerAgent 인터페이스, 반장전 루프, 리플레이 저장.
구현:
- `packages/core/src/network/` — 프로토콜 타입 (공유)
- `packages/core/src/match/HanchanController.ts` — 반장전 루프 (core)
- `packages/server/src/` — WebSocket 서버 (Node.js + ws)

**설계 리트머스**: 서버 코드를 수정하지 않고 PlayerAgent(사람/봇)를 교체할 수 있어야 한다.
HanchanController는 PlayerAgent가 사람인지 봇인지 모른다.

---

# 1. 패키지 분리 원칙

```
@majak/core  — 순수 로직 (I/O 없음)
  └── network/protocol.ts     프로토콜 메시지 타입 (공유)
  └── match/HanchanController 반장전 루프 + PlayerAgent 인터페이스

@majak/server — Node.js, ws, 파일시스템 사용
  └── RoomManager            방 생성·관리
  └── HumanAgent             WebSocket 연결된 사람 플레이어
  └── BotAgent               규칙 기반 봇
  └── ReplayWriter           JSONL 이벤트 로그 기록
  └── index.ts               진입점 (WebSocket 서버 시작)
```

---

# 2. 프로토콜 메시지 (WebSocket JSON)

## 클라이언트 → 서버

```ts
type ClientMessage =
  | { type: "join";     roomId: string; nickname: string; token?: string }
  | { type: "action";  payload: ActionRequest }   // discard / riichi / win / pon / chi / pass
  | { type: "draftPick"; augmentId: string; stage: DraftStage }
  | { type: "ping" }
  // ── 대기실·통계 (14) ──
  | { type: "ready";   ready: boolean }            // 준비 토글 (방장 외)
  | { type: "addBot" } | { type: "removeBot"; playerId } // 봇 채우기 (방장)
  | { type: "startGame" }                          // 게임 시작 (방장, canStart)
  | { type: "statsRequest" }                       // 누적 통계 재전송 요청
```

## 서버 → 클라이언트

```ts
type ServerMessage =
  | { type: "joined";      playerId: PlayerId; roomId: string; token: string }
  | { type: "catalog";     augments: AugmentCatalogEntry[] }  // 증강 id→이름·등급·설명 (게임 시작 시 1회)
  | { type: "view";        view: PlayerView }          // 상태 갱신
  | { type: "prompt";      prompt: DecisionPrompt }    // 결정 요청
  | { type: "draftOffer";  stage: DraftStage; choices: AugmentDef[] }
  | { type: "roundOver";   outcome; settle: RoundSettledPayload;   // 역 목록·판부·점수 변동
      uraDoraIndicators: TileId[]; tiles: Record<TileId, PublicTileView>;
      revealedHands: Record<PlayerId, RevealedHand> }  // 화료자 공개 손패 (결과 화면)
  | { type: "gameOver";    rankings: RankingEntry[] }
  | { type: "error";       code: string; message: string }
  | { type: "pong" }
  // ── 대기실·통계 (14, 상세는 docs/14_LOBBY_STATS.md) ──
  | { type: "lobby";  roomId; hostId; youId; canStart; players: LobbyPlayerEntry[] }
  | { type: "stats";  game?: StatsEntry[]; career: StatsEntry[] }
```

> 대기실(방장·준비·봇 채우기)과 통계 수집/영속화 상세는 **docs/14_LOBBY_STATS.md**.
> 게임은 4인이 모여도 자동 시작하지 않고, 방장이 대기실에서 `startGame`을 보내야 시작한다.

**전송 순서 규약 (2026-07-16)**: 게임 시작 시 `catalog` → **첫 `view`** → `draftOffer`.
클라이언트가 게임 테이블에 입장하기 전에 드래프트가 뜨는 일이 없도록,
HanchanController는 gameStart 드래프트 전에 반드시 뷰를 브로드캐스트한다.
클라이언트도 view가 없으면 드래프트 오버레이를 그리지 않는다 (이중 방어).

---

# 3. PlayerAgent 인터페이스

```ts
interface PlayerAgent {
  readonly id: PlayerId;
  /** 상태 갱신 수신. 봇은 무시하거나 다음 결정에 쓴다 */
  sendView(view: PlayerView): void;
  /** 결정 요청. 반드시 offered 중 하나를 반환해야 한다 */
  decide(prompt: DecisionPrompt): Promise<ActionOption>;
  /** 드래프트 제시. 반드시 offered 중 하나의 id를 반환해야 한다 */
  decideDraft(stage: DraftStage, choices: AugmentDef[]): Promise<string>;
}
```

- 사람(HumanAgent): 소켓으로 prompt 전송 → 응답 대기 → Promise resolve.
  타임아웃(기본 30초) 시 자동 선택(첫 번째 옵션).
- 봇(BotAgent): 즉시(또는 짧은 지연 후) 랜덤/규칙 기반 선택.
- `HanchanController`는 `PlayerAgent[]`만 받는다 — 사람/봇 혼용 가능.

---

# 4. 반장전 루프 (HanchanController)

반장전 = 동장(4국) + 남장(4국) + 西入(연장) 조건.

```
초기화
  ↓
드래프트 (gameStart)
  ↓
[국 루프]
  1. setupRound → FlowController.begin()
  2. 플레이어 결정 수집 → flow.submit()
  3. 국 종료 → PlayerView 전송
  4. 도비 체크 → 도비면 즉시 종료
  5. 종료 조건 체크:
     - 남장 4국 후 오야가 트ップ이면 종료
     - 남장 이후 트르 이상이면 종료
     - 서입: 남장 후에도 조건 미충족이면 서장 1국만
  6. 다음 국 → goto 1
  ↓
우마·오카 정산
  ↓
rankings 전송
```

## 종료 조건 (01_GAME_RULES §5)

```ts
interface HanchanConfig {
  startScore: number;      // 25000
  returnScore: number;     // 30000
  dobi: boolean;           // true: 도비(0점 이하) 즉시 종료
  maxWind: number;         // 2 = 반장전 (동+남), 3 = 산장전
  westEntry: boolean;      // true: 서입 허용
  uma: [number, number];   // [10, 20] → 1위 +20, 2위 +10, 3위 -10, 4위 -20 (우마)
  oka: number;             // 20 → 반환점 초과분 1위에게 (오카)
}
```

---

# 5. 리플레이 저장

```
replays/<roomId>_<timestamp>.jsonl
```

각 줄 = Event 하나 (JSON):
```jsonl
{"seq":1,"type":"RoundStarted","payload":{}}
{"seq":2,"type":"TileDrawn","payload":{"player":"p0","tileId":42}}
...
```

초기 상태(시드 포함)는 첫 줄에:
```jsonl
{"type":"__init__","payload":{"config":{"seed":12345,"playerIds":["p0","p1","p2","p3"]},"options":{"startScore":25000,"redFivesPerSuit":1}}}
```

재생: `__init__`로 초기 상태 복원 → Event를 순서대로 replay → 임의 시점 스냅샷 가능.

---

# 6. 재접속

- 방 입장 시 서버가 `token`(UUID) 발급. 클라이언트가 저장.
- 재접속 시 `{ type:"join", token }` → 서버가 세션 복구 → 현재 `PlayerView` 재전송.
- 봇은 재접속 없음 — 봇이 응답해야 할 자리가 비면 서버가 자동 처리.

---

# 7. 확장 시나리오 점검

| 기능 | 구현 방법 | 서버 수정 |
|------|-----------|-----------|
| 봇 → 사람 교체 | PlayerAgent 교체 (인터페이스 동일) | 없음 |
| 관전자 추가 | `SPECTATOR_ID`로 `buildPlayerView` + 소켓 전송 | 없음 |
| 레이팅 갱신 | `gameOver` 이후 DB 저장 훅 (MVP 이후) | 없음 |
| 드래프트 변형 | HanchanConfig.draftSchedule Rule 변경 | 없음 |

---

# 8. 로컬 실행

서버:

```bash
npm run dev:server
```

클라이언트:

```bash
npm run dev:client
```

기본 포트:

| 대상 | 포트 |
|------|------|
| WebSocket server | `3001` |
| Vite client | `5173` |

방 이름이 `bot`으로 끝나면 서버가 빈 자리를 봇으로 채워 즉시 게임을 시작한다.
예: `dev-bot`, `smoke-bot`.

---

# 9. Smoke Test

서버를 임시 포트로 실행:

```bash
PORT=3101 npm run dev -w @majak/server
```

다른 터미널에서 join 확인:

```bash
node --input-type=module -e "import WebSocket from 'ws'; const ws = new WebSocket('ws://127.0.0.1:3101'); ws.on('open',()=>ws.send(JSON.stringify({type:'join',roomId:'smoke-bot',nickname:'Smoke'}))); ws.on('message',(data)=>{ const msg=JSON.parse(data.toString()); console.log(msg.type); if(msg.type==='draftOffer') ws.close(); });"
```

정상 예:

```text
joined
draftOffer
```

Smoke test는 `replays/`에 JSONL 파일을 만들 수 있다. 커밋 전 생성물을 확인한다.
