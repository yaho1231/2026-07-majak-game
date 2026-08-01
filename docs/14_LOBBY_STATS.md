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
waiting ──(방장 startGame)──▶ playing ──(gameOver)──▶ waiting (이어하기)
                                                       └─(사람이 다 나가면)─▶ 방 삭제
```

- **방장(host)** : 방에 처음 들어온 사람. `room.hostId`. 방장이 나가면 남은 사람에게 승계된다.
- **준비(ready)** : 방장을 제외한 사람은 준비 완료 버튼을 눌러야 한다. 봇·방장은 항상 준비 상태.
- **봇 채우기** : 방장이 빈 자리에 봇을 넣거나(`addBot`) 뺄 수 있다(`removeBot`).
- **강퇴(kickPlayer)** : 방장이 대기 중에만 사람을 내보낸다. 내보낸 사람은 **그 방이 살아 있는 동안 재입장 불가**(`room.kicked`) — 코드만 알면 곧바로 돌아올 수 있으면 강퇴가 의미가 없다.
- **시작 조건(canStart)** : `4인 && 방장 외 모든 사람이 준비`. 방장만 `startGame` 가능.

자리(playerId `p0`~`p3`)는 항상 최소 빈 슬롯을 채운다. 봇 제거 후 재사용된다.

## 좌석 정리 — 유령 좌석은 만들지 않는다

게임 중 끊긴 좌석은 **재접속용으로 남긴다**(신원=닉네임 기준 재접속). 하지만 판이 끝나면
남겨 둘 근거가 사라지므로, `resetRoomAfterGame`이 대기실로 되돌릴 때 **소켓이 닫혔거나
포기한 사람 좌석을 전부 걷어낸다**(`pruneGhostSeats`). 대기 중에는 재접속 개념이 없어
(끊기면 `handleClose`가 그 자리에서 뺀다) 대기실에 닫힌 소켓의 좌석이 있으면 그건 유령이다.

유령을 방치했을 때 실제로 나던 증상(2026-08-01 수정):

- 게임을 끄고 돌아오지 않은 사람이 **대기실에 앉아 있는 것처럼** 보이고, 준비를 하지 않아
  방장이 다음 판을 시작할 수 없었다.
- 그 사람은 `membershipOf`에 걸려 **새 방을 만들지도 못했다**("이미 방에 참가 중입니다").
  새로고침하면 풀리던 이유는, 소켓이 닫히면서 그제서야 좌석이 정리됐기 때문이다.

방 생성·참가(`createRoom`·`joinRoom`·`sandboxStart`) 직전에도 전체 대기실을 한 번 훑어
치우고(`sweepGhostSeats`), **이 연결이 붙들고 있던 좌석**은 놓아 준다(`releaseOwnStaleSeat`).
홈 화면은 방에 앉아 있는 동안 뜨지 않으므로, 그 연결에서 온 `createRoom`은 곧 "클라이언트는
이미 방을 떠난 것으로 안다"는 신호다. 같은 코드로 다시 들어오면 새 자리를 주는 대신 원래
자리에 도로 앉힌다(`reseat`). 다른 탭·다른 연결이 실제로 쓰는 좌석은 건드리지 않는다.

클라이언트 쪽 짝: 방에 앉아 있었다면 홈으로 나갈 때 **반드시** `leaveRoom`을 보낸다.
결과 화면에서 나갈 때 이걸 빠뜨린 것이 위 증상의 원래 발단이었다.

## 메시지 (프로토콜 §14)

클라이언트 → 서버 (대기실)

| type | 필드 | 설명 | 권한 |
|------|------|------|------|
| `ready` | `ready: boolean` | 준비 토글 | 방장 외 사람 |
| `addBot` | — | 빈 자리에 봇 1명 | 방장 |
| `removeBot` | `playerId` | 봇 제거 | 방장 |
| `kickPlayer` | `playerId` | 플레이어 강퇴 (대기 중만, 방장 자신 불가) | 방장 |
| `startGame` | — | 게임 시작 | 방장 (canStart일 때) |
| `statsRequest` | — | 누적 통계 재전송 요청 | 사람 |

서버 → 클라이언트

- `kicked` : 방장에게 강퇴당했다. `{ roomId }` — 클라이언트는 방 상태를 정리하고 홈으로.
  (재입장하려 하면 `error` `KICKED`로 막힌다.)
- `lobby` : 대기실 스냅샷. 참가·준비·봇 변화마다 브로드캐스트.
  `{ roomId, hostId, youId, canStart, players: LobbyPlayerEntry[] }`
  - `LobbyPlayerEntry = { playerId, nickname, isBot, isHost, ready, stats: PlayerStatsView | null }`
  - `stats`는 그 닉네임의 **누적(career)** 통계 (신규면 null) — 상대 전적을 미리 본다.

## 라우팅

`RoomManager.route`가 소켓 메시지를 받아,
대기실/통계 메시지(`ready·addBot·removeBot·kickPlayer·shuffleSeats·setGameMode·startGame·statsRequest`)는
RoomManager가, 그 외 게임 메시지(`action·draftPick·roundContinue·ping`)는
`HumanAgent.handleMessage`가 처리한다. 인증 이후 라우팅은 이 함수 하나로 통일된다.

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

## 증강 통계 (augment stats)

증강 지표는 `PlayerStatsRaw.augments`(증강 id별 `AugmentStatRaw`)와 `augmentTierPicks`([silver,gold,prism])에 쌓인다.

| 지표 | 소스 이벤트 | 규칙 |
|------|-------------|------|
| augments[id].offered | AUGMENT_OFFERED | 드래프트 3지선다에 제시된 횟수 |
| augments[id].picked | AUGMENT_DRAFTED (직전 오퍼에 포함된 것만) | 선택 횟수 → 픽률=picked/offered. **도박사 지급분 제외** |
| augmentTierPicks | AUGMENT_DRAFTED(오퍼 픽) + 오퍼 tier | 획득 등급 분포 |
| augments[id].games/placements/placementSum | recordGameEnd + 종료 시 보유 증강 | 보유 판 순위 귀속(지급 포함) → 평균순위·1위율 |

- **오퍼는 이벤트다** : `AUGMENT_OFFERED`(상태 불변 no-op reducer)를 `DraftController.recordOffer`가 픽보다 먼저 고정 순서로 로그에 남긴다. 시드에서 결정적이라 리플레이·재개에서 동일. 사후 재계산은 불가(roll의 exclude가 보유분만큼 커져 오퍼가 달라짐)라 **드래프트 시점 캡처가 필수**.
- 홈 화면: **내 증강 통계**(시그니처·등급분포·성적표·함정 경고·도감 수집률)는 career에서, **증강 메타**(전체 픽률·평균순위 티어 + 증강 장인)는 leaderboard 전체에서 클라이언트가 파생.
- **닉네임별 성적은 관리자 전용(47차)**: 서버가 비관리자에게 보내는 leaderboard 항목은 `nickname: ""`(익명). 증강 메타·도감 전체 통계는 익명 집계라 그대로 동작하고, '증강 장인'(닉네임 노출)만 관리자에게 보인다. 상세는 15 §4.
- **증강 도감(Codex) 전체화면**(15 §도감): 홈의 "📖 증강 도감" 버튼으로 진입. 카탈로그 전체(표준+콘텐츠 74종)를 등급별 그리드로 브라우징하고, 카드 클릭 시 상세 오버레이(도감 상세 설명 `detail` + 등장/모드/지급 배지 + **내 통계와 서버 전체 통계 나란히**)를 연다. "전체 통계" 탭은 모든 증강을 내 판·평균순위 / 서버 표본·픽률·평균순위·1위율로 **정렬·필터** 가능한 표로 보여준다. 데이터 소스는 홈과 동일(career + leaderboard 클라이언트 파생) — 서버 집계 엔드포인트를 새로 만들지 않는다.

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
- **CodexScreen** : 증강 도감 전체화면(App.tsx). 홈에서만 진입하는 별도 화면(라우팅 ternary에
  `codexOpen` 분기). 도감 그리드 + 상세 오버레이 + 정렬 가능한 전체 통계표. `catalog`·career·
  leaderboard를 props로 받아 파생하며, 진입 시 `refreshHome`으로 최신 통계를 당겨온다.

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
