# 14_LOBBY_STATS
Version : 1.0
Status : Active
Last Updated : 2026-07-16

플레이어 대기실(방장·준비·봇 채우기)과 리치마작 플레이어 통계 시스템.

구현:
- `packages/core/src/stats/PlayerStats.ts` — StatsTracker (이벤트 소비 집계), 파생·병합
- `packages/core/src/network/protocol.ts` — 대기실/통계 메시지 타입
- `packages/server/src/RoomManager.ts` — 대기실 상태 기계 + 통계 배선
- `packages/server/src/StatsStore.ts` — 닉네임 키 JSON 영속화
- `packages/client/src/App.tsx` — WaitingRoom·통계 UI

**설계 리트머스**: 통계는 GameState를 뒤지지 않고 **확정 이벤트 스트림만** 소비해 만든다.
같은 이벤트 로그(리플레이 파일)만으로 동일한 통계를 재구성할 수 있어야 한다.

---

# 1. 대기실 (Waiting Room)

## 상태 기계

방(Room)은 두 페이즈를 가진다.

```
waiting ──(방장 startGame)──▶ playing ──(gameOver)──▶ 방 삭제
```

- **방장(host)** : 방에 처음 들어온 사람. `room.hostId`.
- **준비(ready)** : 방장을 제외한 사람은 준비 완료 버튼을 눌러야 한다. 봇·방장은 항상 준비 상태.
- **봇 채우기** : 방장이 빈 자리에 봇을 넣거나(`addBot`) 뺄 수 있다(`removeBot`).
- **시작 조건(canStart)** : `4인 && 방장 외 모든 사람이 준비`. 방장만 `startGame` 가능.

자리(playerId `p0`~`p3`)는 항상 최소 빈 슬롯을 채운다. 봇 제거 후 재사용된다.

## 메시지 (프로토콜 §14)

클라이언트 → 서버 (대기실)

| type | 필드 | 설명 | 권한 |
|------|------|------|------|
| `ready` | `ready: boolean` | 준비 토글 | 방장 외 사람 |
| `addBot` | — | 빈 자리에 봇 1명 | 방장 |
| `removeBot` | `playerId` | 봇 제거 | 방장 |
| `startGame` | — | 게임 시작 | 방장 (canStart일 때) |
| `statsRequest` | — | 누적 통계 재전송 요청 | 사람 |

서버 → 클라이언트

- `lobby` : 대기실 스냅샷. 참가·준비·봇 변화마다 브로드캐스트.
  `{ roomId, hostId, youId, canStart, players: LobbyPlayerEntry[] }`
  - `LobbyPlayerEntry = { playerId, nickname, isBot, isHost, ready, stats: PlayerStatsView | null }`
  - `stats`는 그 닉네임의 **누적(career)** 통계 (신규면 null) — 상대 전적을 미리 본다.

## 라우팅

`RoomManager.setupWsHandlers`가 소켓 메시지를 받아,
대기실/통계 메시지(`ready·addBot·removeBot·startGame·statsRequest`)는 RoomManager가,
그 외 게임 메시지(`action·draftPick·ping`)는 `HumanAgent.handleMessage`가 처리한다.
`index.ts`의 join 이후 라우팅은 이 리스너 하나로 통일된다.

## 편의 경로

방 이름이 `bot`으로 끝나면 join 직후 봇 3명을 자동으로 채운다(**시작은 안 함** — 방장이
대기실에서 "게임 시작"을 눌러야 시작). 테스트용 `fillWithBots`는 봇을 채우고 즉시 시작한다.

---

# 2. 플레이어 통계 (StatsTracker)

`@majak/core`의 순수 클래스. 한 판(반장전)의 확정 이벤트를 `consume()`으로 순서대로 먹는다.

## 수집 지표 (국 단위)

국 진행 이벤트는 "이번 국" 플래그로만 표시하고, `ROUND_SETTLED` 시점에 국 카운터로 확정한다
(국당 최대 1회 계상 — 더블리치를 두 번 선언해도 리치 국은 1).

| 지표 | 소스 이벤트 | 규칙 |
|------|-------------|------|
| roundsPlayed | ROUND_SETTLED | 유국·도중유국 포함 모든 국 |
| riichiRounds | TILE_DISCARDED(`riichi=true`) | 리치 선언 국 |
| callRounds | CALL_MADE, KAN_DECLARED(open/added) | 후로 국 (**안깡 제외** — 멘젠 유지) |
| wins / tsumoWins / ronWins | ROUND_SETTLED.winInfos | 화료 |
| winPointsTotal | winInfos.points | 본장·공탁 제외 획득점 |
| dealIns | winInfos(`ron`).from | 방총 국 (더블론이면 1회, 점수는 합산) |
| dealInPointsTotal | winInfos.points | 방총으로 잃은 점수 |

게임 종료 시 `recordGameEnd(rankings)`로 순위(games·placements·placementSum)를 누적한다.

## 파생 비율 (deriveStats)

`winRate·dealInRate·riichiRate·callRate·tsumoRate·avgWinPoints·avgDealInPoints·
avgPlacement·topRate·rentaiRate`. 분모 0이면 0 (NaN 방지).

## 왜 이벤트 소비인가

- **SSOT 유지** : 통계 전용 상태를 GameState에 추가하지 않는다. 엔진은 통계를 모른다.
- **리플레이 호환** : JSONL 이벤트 로그를 그대로 `consume()`하면 과거 판 통계도 재구성 가능.
- **확장성** : 새 지표는 StatsTracker에 case를 추가할 뿐, 엔진/증강 수정 불필요.

---

# 3. 영속화 (StatsStore)

MVP엔 계정/DB가 없으므로 통계는 **닉네임을 키**로 JSON 파일에 누적한다
(`replays/stats.json`, gitignore됨). core는 I/O가 없으므로 저장은 서버가 담당한다.

- `load()` : 파일 로드 (없으면 빈 상태). 누락 필드는 `mergeStats(empty, …)`로 보정.
- `record(entries)` : 한 판의 원시 통계를 닉네임별로 `mergeStats` 후 저장.
  동시 저장 경쟁을 막기 위해 임시 파일 → rename, 저장은 직렬 큐로 순차 처리.
- **사람만 영속화** (봇 `Bot_*`는 제외). 이번 판 통계 메시지엔 봇 포함.

## 게임 종료 흐름 (RoomManager.finishStats)

```
onGameOver(rankings)
  → tracker.recordGameEnd(rankings)
  → snapshot = tracker.snapshot()
  → statsStore.record(사람들의 {nickname, raw})      # 영속화
  → stats 메시지 전송 { game: 4인 이번 판, career: 사람 누적 }
```

서버 → 클라이언트 `stats` 메시지 : `{ game?: StatsEntry[], career: StatsEntry[] }`
- `StatsEntry = { playerId?, nickname, isBot, stats: PlayerStatsView }`
- 게임 종료 시 `game`(이번 판·봇 포함)과 `career`(사람 누적)를 함께 보낸다.

---

# 4. 클라이언트 UI

- **WaitingRoom** : join 후 첫 뷰 전(대기실)에 표시. 4자리(동·남·서·북) 목록,
  방장 👑·BOT 태그·준비 배지·상대 누적 전적 칩. 방장은 봇 추가/제거·게임 시작,
  그 외는 준비 완료/취소 토글.
- **GameOverModal** : "순위 / 통계" 탭. 통계 탭은 플레이어별 "이번 판 / 누적"
  통계 그리드(국수·화료율·방총률·리치율·후로율·쯔모율·평균화료·평균방총·평균순위·1위율).

---

# 5. 확장 시나리오 점검

| 미래 요구 | 지금 구조에서 |
|-----------|---------------|
| 계정/DB 도입 | StatsStore의 키를 nickname → userId로 교체. StatsTracker·프로토콜 불변 |
| 새 통계 지표 | StatsTracker에 case + PlayerStatsRaw 필드 + deriveStats 한 줄. 하위호환은 mergeStats(empty,…)가 보정 |
| 관전자 대기실 입장 | LobbyPlayerEntry에 role 추가, canStart는 사람 플레이어만 계산 |
| 레이팅/랭크 | career 통계 위에 별도 레이팅 계산기 (placements·avgPlacement 이미 수집) |
| 방 목록/매치메이킹 | RoomManager에 방 나열 API + lobbyList 메시지 추가 (Room 상태는 이미 존재) |

## 알려진 한계 (MVP)

- 대기실에서 사람이 나가면(소켓 close) 자동 자리 회수는 하지 않는다(재접속 토큰으로 복구).
  방장이 나가면 방장 이양도 아직 없다 — 계정/방 관리 도입 시 함께 처리.
- 통계 키가 닉네임이라 동명이인은 통계를 공유한다 (계정 도입 전까지의 제약).
