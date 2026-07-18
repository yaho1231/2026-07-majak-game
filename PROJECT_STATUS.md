# PROJECT_STATUS
Version : 0.4
Status : Active

Last Updated : 2026-07-18

---

# 프로젝트 진행률

Overall Progress

███████████████████░ 95%

※ 진행률은 코드 구현뿐 아니라 설계 문서까지 포함한다.

---

# 현재 목표(Current Milestone)

현재 목표

- 콘텐츠 팩(@majak/content) 37종 카탈로그 밸런스 관찰
- 리플레이 뷰어 UI / Save(이어하기)

완료

- ✅ 플레이어 대기실(방장·준비·봇 채우기) — 2026-07-16 (18차)
- ✅ 플레이어 통계 시스템(리치율·후로율·방총률·화료율·평균순위 등) — 2026-07-16 (18차)

---

# 프로젝트 상태

## Phase 1

Architecture

Status : 🟡 In Progress

목표

- 전체 엔진 구조 확정 → ✅ 00_MASTER_ARCHITECTURE 작성 완료
- 데이터 흐름 정의 → ✅ Action→Event→Effect→GameState 파이프라인 확정
- 세부 시스템 문서 작성 → 🟡 진행 중

---

## Phase 2

Core Engine

Status : ✅ Complete (2026-07-15)

- RuleRegistry (증강 우선순위 합성) ✅
- Prng (결정론적 난수) ✅
- GameEvent 타입 ✅
- Tile / Zone / moveTiles (패·공간·이동 원시 연산) ✅
- GameState + createInitialGameState + setupRound (배패까지) ✅
- Effect System (Interceptor/Reaction, 연쇄 한도) ✅
- GameEngine (submit 트랜잭션) + ActionRegistry + ReducerRegistry ✅

---

## Phase 3

Mahjong Engine

Status : ✅ Complete (2026-07-15)

- 패 분해(표준형/치토이/국사) + 텐파이·대기 계산 ✅
- 채점 변형(대기 형태·암각/명각 판정) ✅
- YakuRegistry(등록형) + 표준 역 41개 ✅
- 부·점수 계산(지불 분배 포함) + 도라 ✅
- 후리텐·유국 판정은 Game Flow(11)에서

---

## Phase 4

Network

Status : ✅ Complete (2026-07-15)

- 프로토콜(protocol.ts) + WebSocket 서버(index.ts) + RoomManager ✅
- HumanAgent/BotAgent(PlayerAgent 공용 인터페이스) ✅
- HanchanController 반장전 루프 + 리플레이 기록·재생 ✅ (12차에서 스트리밍 버그 수정)
- 런타임 검증: WS 사람+봇3 반장전 완주, 리플레이 라운드트립 일치

---

## Phase 5

Augment System

Status : ✅ Core Complete (2026-07-15)

- defineAugment 스키마 + install 문맥(setHolderRule/reaction/interceptor/engine) ✅
- AugmentRegistry 가중 드래프트(고정 60/30/10, 비복원, 결정적) ✅
- DraftController(개인별 3지선다, 파생 PRNG) + rebuildAugments ✅
- 표준 증강 6종 (Silver/Gold/Prism 각 2) — 등록 지점 4종 실증 ✅
- 프롬프트되는 새 Action·임시데이터·커스텀Zone 증강은 후속(10 §6)

---

## Phase 6

Content Pack

Status : ✅ Complete (2026-07-16)

- `@majak/content` 패키지 신설 — 증강 30종 추가 (총 카탈로그 37종: Silver 8 / Gold 14 / Prism 15)
- 코어 확장 훅 14종 추가 (scoring.*·score.extraHan·winInfos·deal.handSize·turn.direction·
  peek 가시성·augmentView 채널·TileKindChanged·ctx.yaku 등) — 04/09/10/12 문서 반영
- 봇 반장전 40시드 스위프: 실패 0, 리플레이 라운드트립 40/40 일치, 36종 실전 발동 확인

---

# 문서 상태

| 문서 | 상태 |
|------|------|
| PROJECT_CHARTER | ✅ (1.1 — 증강 획득 시점 수정 반영) |
| 00_MASTER_ARCHITECTURE | ✅ |
| 01_GAME_RULES | ✅ |
| 02_CORE_ENGINE | ✅ |
| 03_GAME_STATE | ✅ |
| 04_RULE_SYSTEM | ✅ |
| 05_EFFECT_SYSTEM | ✅ |
| 06_ACTION_SYSTEM | ✅ |
| 07_TILE_SYSTEM | ✅ |
| 08_MAHJONG_ENGINE | ✅ |
| 09_INFORMATION_SYSTEM | ✅ |
| 10_AUGMENT_SYSTEM | ✅ |
| 11_GAME_FLOW | ✅ (깡·도중유국·일시/리치 후리텐 구현 반영) |
| 12_NETWORK_REPLAY | ✅ (대기실·통계 메시지 반영) |
| 13_CONTENT_PIPELINE | ✅ (기본 작성 완료, 확장 예시 보강 여지) |
| 14_LOBBY_STATS | ✅ (대기실 + 통계 시스템 — 18차 신규) |
| 15_ACCOUNTS_SITE | ✅ (계정·방코드·리플레이·관전 — 20차 신규 · 보안 리뷰 §8 반영) |
| 99_IMPLEMENTATION_GUIDE | ✅ |

상태

⬜ 미작성

🟡 작성 중

✅ 완료

♻ 수정 필요

---

# 구현 상태

## Engine

상태

✅ 완료 (2026-07-15)

- `packages/core/src/engine/rules/RuleRegistry.ts` — 규칙 정의·Modifier 합성
- `packages/core/src/engine/random/Prng.ts` — 시드 기반 결정론적 난수
- `packages/core/src/engine/events/GameEvent.ts` — 이벤트 기본 타입
- `packages/core/src/engine/zones/Zone.ts` — Zone·moveTiles (이동 원시 연산)
- `packages/core/src/engine/state/GameState.ts` — 상태 구조·초기화·국 준비(배패)
- `packages/core/src/engine/effects/EffectRegistry.ts` — Interceptor/Reaction 등록·순서
- `packages/core/src/engine/effects/EventProcessor.ts` — 이벤트 큐 처리·연쇄 한도
- `packages/core/src/engine/actions/ActionRegistry.ts` — 행동 정의·검증
- `packages/core/src/engine/reducers/ReducerRegistry.ts` — 이벤트→상태 변경 등록
- `packages/core/src/engine/GameEngine.ts` — submit 트랜잭션, Event Log
- `packages/core/src/engine/events/TilesMoved.ts` — 표준 이벤트 1호
- 테스트 64개 통과

## Mahjong

상태

✅ 채점 엔진 완료 (2026-07-15)

- `packages/core/src/mahjong/tiles/Tile.ts` — 패 정의(id/kind/attrs 분리), 표준 136장+적도라
- `packages/core/src/mahjong/scoring/decompose.ts` — 분해 전체 열거 (순자 suit 파라미터화)
- `packages/core/src/mahjong/scoring/waits.ts` — 대기·텐파이 (universe 파라미터화)
- `packages/core/src/mahjong/scoring/WinContext.ts` — 채점 변형 (론 커쯔=명각, 대기 형태)
- `packages/core/src/mahjong/scoring/YakuRegistry.ts` + `standardYaku.ts` — 등록형 역 41개
- `packages/core/src/mahjong/scoring/fu.ts` / `score.ts` / `dora.ts` / `evaluate.ts`
- 테스트 95개 통과 (마작 채점 31개 포함)

## Lobby / Network

상태

✅ 대기실 + 서버 엔진 완료 + 통합 테스트 (2026-07-16)

- `@majak/core/network/protocol.ts` — 클라이언트↔서버 JSON 메시지 스펙 (대기실·통계 포함)
- `@majak/server` 패키지 구성 (Node.js + ws)
- `RoomManager.ts` — 방 생성·참가, **대기실 상태 기계**(방장·준비·봇 채우기·startGame),
  재접속 뷰/로비 복원, 통계 배선. 4명이 모여도 자동 시작하지 않고 방장이 시작한다.
- `index.ts` — WebSocket 서버 진입점 (StatsStore 로드, "bot" 방은 봇 자동 채움·시작은 방장)
- `test/RoomManager.test.ts` — FakeSocket 기반 통합 테스트 21개
  (인증 6+레이트리밋 1·세션만료 2·방코드 5·완주기록 2+포기 1·관리자 관전 1·
  입력검증/견고성 3)

## Waiting Room / Stats (14)

상태

✅ 완료 (2026-07-16, 18차)

- `packages/core/src/stats/PlayerStats.ts` — StatsTracker(확정 이벤트 소비 집계),
  deriveStats(파생 비율), mergeStats(career 누적). 이벤트 로그만으로 재구성 가능.
- `packages/server/src/StatsStore.ts` — 닉네임 키 JSON 영속화(`replays/stats.json`),
  임시파일→rename 원자적 저장·직렬 큐, 사람만 저장
- 대기실: 방장(첫 사람)·준비(방장 외)·봇 add/remove·canStart(4인+전원 준비)
- 통계 지표: 화료율·방총률·리치율·후로율·쯔모율·평균화료/방총점·평균순위·1위율·연대율
  (후로는 안깡 제외, 방총은 국당 1회·더블론 점수 합산)
- 클라이언트: WaitingRoom(👑 방장·BOT·준비 배지·상대 전적 칩), 게임 종료 통계 탭
  (이번 판/누적 그리드), 대기실에서 상대 누적 전적 미리보기
- 테스트: core 11개(PlayerStats) + server 8개(대기실 6·통계 2)

## Match (국 진행)

상태

✅ 한 국 완주 가능 (2026-07-15)

- `packages/core/src/mahjong/flow/flowEvents.ts` — 진행 이벤트 10종 + Reducer (페이즈 전이 = 데이터)
- `packages/core/src/mahjong/flow/standardActions.ts` — discard/riichi/win/pon/chi/kan/abort + sys 액션
- `packages/core/src/mahjong/flow/FlowController.ts` — 프롬프트 유도·부로 우선순위·정산
- `packages/core/src/mahjong/flow/standardGame.ts` — 게임 조립 팩토리
- 깡: 안깡/대명깡/가깡, 리치 중 대기 불변 안깡, 신도라, 영상쯔모, 영상개화·창깡 플래그 지원
- 깡 도라 타이밍: `beforeRinshan` / `afterDiscard` 룰 옵션 지원
- 도중유국: 구종구패, 사풍연타, 사깡유국, 사인리치, 트리플론 처리
- 후리텐: 기본 후리텐, 일시 후리텐, 리치 후리텐 처리
- 봇 4명 반장전 완주·드래프트·도비·우마 정산 검증 완료

## Replay

상태

✅ 기록·재생 라운드트립 검증 완료 (2026-07-15)

- `packages/server/src/ReplayWriter.ts` — append-only JSONL 파일 저장기
- `packages/server/src/ReplayReader.ts` — 순수 Reducer 재적용으로 상태 재구성
- **버그 수정**: HanchanController가 `__init__`만 방출하고 진행 이벤트를 흘리지
  않던 문제를 발견·수정 (eventLog 커서로 확정 이벤트 전량 스트리밍)
- 검증: 봇/사람 실게임 이벤트 로그(1900+ 이벤트)만으로 최종 점수 완전 재구성
  (core 라운드트립 테스트 + 서버 디스크 라운드트립 + WS 사람 플레이 런타임 확인)

## Save

상태

미구현

## Content (@majak/content)

상태

✅ 62종 구현 (2026-07-18, 28차에서 선봉·유국역만·절벽 위에 피어난 꽃·물러설 수 없는 선언 추가)

- 콘텐츠 62종 (Silver 22 / Gold 22 / Prism 18) + 표준 7 = 카탈로그 69종
- 모든 증강은 **본인에게만 이점** 원칙 — 전원 영향 증강(reverse_world) 제거,
  riichi_market은 본인 전용 리치봉 보너스로 개편 (21차)
- 판·점수 보너스 증강은 `util.ts`의 addHanBonus/addWinPointBonus/yakuBountyBonus 헬퍼 기반

- `packages/content/src/augments/*.ts` — 증강 1종 = 파일 1개, 코어 등록 API만 사용
- Silver: yaku_bounty(현상금)·gokuakumudo(극악무도)·riichi_market(리치봉 시세, 본인 전용)·
  noten_insurance·honba_collector·red_five_touch(아카도라)
  + **현상금 사냥꾼 계열 6종**(탕야오·리치·역패·삼색·혼일색·또이또이 — 특정 역 화료 시 상금)
- Gold: slow_steady(6순마다 +1판)·furo_master(후로 +1판)·promise_next(기약 스택)·
  riichi_upgrade(더블/트리플)·free_riichi_discard(리치 후 자유 버림 3회)·
  peek_riichi_waits(오름패 간파)·xray_hand(투시 3장)·rinshan_preview(영상 정찰)·
  hidden_river(안개 강)·yakuman_shield(역만 방어)·omni_chi(사방치기)·pseudo_dealer(오야 찬탈)
- Prism: suit_unify(수패 통일)·hand_swap3(3장 강탈)·full_hand_swap(손패 통교환)·
  discard_lock(봉인술사)·tanyao_break(탕야오 해방)·open_kokushi(우는 국사)·
  broken_wall(순환 순자)·seat_swap(자리 바꿈)·future_sight(미래 보기)·
  rinshan_gamble(도박사의 손)·true_dragon(5멘쯔 17장, +3판)·
  **jackpot(일확천금 — 정산 ±2배)·big_hand(큰손 — 화료 만관 보장)·
  late_bloomer(대기만성 — 남4국부터 획득 3배, gameStart 드래프트 전용)·
  parasite(기생충 — 숙주 증감 절반 공유, 숙주 화료/방총 시 다음 차례로 이동)**
- Gold 신규(22차): **die_hard(죽기살기 — 게임당 1회 0 미만 피해를 0에서 버팀, 도비 방지)**
- 신규(28차):
  - **vanguard(선봉, Gold — 동장 화료 1.5배 / 타장 0.75배, ROUND_SETTLED 인터셉터)**
  - **nagashi_yakuman(유국역만, Prism — 유국 시 버림 전부 요구패+미콜이면 유국만관을 역만으로 지불)**
  - **cliff_bloom(절벽 위에 피어난 꽃, Prism — 게임당 1회 액티브: 안깡 후 영상패를 대기패로 치환해 영상개화 확정)**
  - **no_retreat(물러설 수 없는 선언, Prism — 첫 턴 선언, 그 국은 리치 포함 화료만·공탁 면제·리치/일발/뒷도라 2판)**
- 액티브 증강(버튼 발동): 클라이언트 `ACTIVE_AUGMENT_IDS`/`AUGMENT_ACTION_TYPES`에 등록,
  여러 개 동시 보유 시 액티브 버튼 → 증강 이름이 붙은 선택 메뉴로 원하는 증강을 골라 발동
- 코어: AugmentDef.draftStages로 제시 스테이지 제한 (대기만성이 첫 사용처)
- 서버가 extraAugments로 주입, 리플레이 CLI도 동일 카탈로그로 재구성
- 주의: 뱅크식 보너스가 발동하면 최종 총점이 100000에서 벗어난다(제로섬은 불변식 아님)

## Augment

상태

✅ 코어 완료 + 확장 지점 실증 (2026-07-15)

- `packages/core/src/augment/Augment.ts` — defineAugment·install 문맥·installAugment·holderTurnOptions
- `packages/core/src/augment/AugmentRegistry.ts` — 카탈로그·가중 rollChoices
- `packages/core/src/augment/DraftController.ts` — 개인별 드래프트·rebuildAugments
- `packages/core/src/augment/events.ts` — ScoreChanged·AugmentDrafted·AugmentDataSet·지원 등록
- `packages/core/src/augment/standardAugments.ts` — 표준 7종
- **확장 지점 실증**: 새 프롬프트 액션 훅(GameEngine.registerTurnOptions + FlowController 연동),
  증강 전용 데이터(GameState.augmentData) — discard_recall(회수, 차터 예시)이 둘 다 사용
- ReplayReader가 AugmentDrafted 시 installAugment → 새 이벤트 타입도 재구성 가능
- 엔진 신규 규칙 3개(win.requiresYaku/win.furiten.enabled/riichi.requiresClosed)만 추가
- 테스트 19개 (Augment.test.ts)

## Information System

상태

✅ 완료 (2026-07-15)

- `packages/core/src/information/PlayerView.ts` — PlayerView·ZoneView·RoundView 타입 정의
- `defineVisibilityRules()` — 표준 5종 가시성 규칙 등록 (hand/discards/melds/wall/deadWall)
- `buildPlayerView(state, viewerId, rules, options?)` — GameState → PlayerView 필터링
- `SPECTATOR_ID` — 관전자 전용 playerId (모든 Zone이 public으로 처리)
- 본인 뷰 후리텐 사유 세분화 (`discard`/`temporary`/`riichi`)
- 증강 연동: RuleRegistry Modifier 하나로 가시성 변경 (엔진 수정 불필요)
- 미정의 Zone kind → hidden 폴백 (커스텀 Zone 안전 기본값)
- 공개된 패에 한해 tile kind/attrs metadata 제공
- 테스트 25개 (PlayerView.test.ts)

## AI

상태

✅ 휴리스틱 봇 (2026-07-17, 22차에서 "리치·화료 안 함" 버그 수정)

- `packages/core/match/PlayerAgent.ts` — PlayerAgent 인터페이스 (사람/봇 공통)
- `packages/server/src/BotAgent.ts` — win > riichi 무조건, **역이 나올 때만 후로**
  (역패 펑·혼일색·탕야오 지향; plan 기억해 목표 역에 맞게 버림), 버림은 뷰 기반
  고립도 휴리스틱(keepValue: 복수 장 +6/이웃 ±1 +3/±2 +1/끝패 −1/적도라 +4)
- 이전 버그(22차 수정): 버림이 항상 쯔모기리(손 정체) + 무조건 부로(역 없는 열린 손) →
  리치·화료가 전혀 없었음. 23차: 역-인지 후로 추가. 회귀 테스트 `server/test/BotAgent.test.ts`.
- `packages/server/src/HumanAgent.ts` — WebSocket 클라이언트 연결, 30초 타임아웃 처리

## Client

상태

✅ 대기실 + 게임 연출 + QoL + 리플레이 뷰어 + WS 자동 재연결 완비 (2026-07-16)

- **QoL(19차)**: 설정 패널(자동정렬·자동화료·후로없음, localStorage), 손패 드래그 정렬,
  리치 후 잠긴 패 딤 처리 + 리치 대기패 hover 미리보기, 액티브 증강 전용 버튼,
  상대 증강 hover 툴팁, 개막 연출 한글화, 전체 UI 확대
- **대기실(WaitingRoom)·게임 종료 통계 탭** (18차)
- 개막 연출·컷인(론/쯔모/역만)·국 결과 화면·효과음·증강 정보 패널 (17차)
- 증강 이름·등급은 서버 catalog 메시지에서 수신 (하드코딩 제거)

- `packages/client` — React + Vite 패키지 추가
- WebSocket join/reconnect token 저장, `view`/`prompt`/`draftOffer`/`gameOver` 수신
- PlayerView 기반 손패·버림패·멜드·플레이어·라운드 상태 표시
- 손패 클릭으로 discard, 리치 보조 버튼으로 riichi 전송
- 기타 Prompt 선택과 Draft pick을 서버 프로토콜로 전송
- **패 이미지 렌더링**: `public/tiles/` 로컬 37장(표준 34종+적도라 3종, majsoul-graph에서
  다운로드), TileFace 컴포넌트 — 커스텀 suit는 텍스트 폴백, 도라·우라 표시패 표시
- 스테일 드래프트 패널 수정 (prompt 수신 시 드래프트 패널 자동 닫힘)
- `npm run build -w @majak/client` 통과, 브라우저 실플레이 확인 (사람+봇3)

---

# 확정된 설계

아래 설계는 변경하지 않는 것을 원칙으로 한다.

## 게임

- 웹 기반
- 실시간 멀티플레이
- 4인 일본식 리치마작
- 증강 기반 게임

## 서버

- Server Authority
- Event Driven
- Single Source of Truth

## 엔진

- Action Pipeline
- Rule Registry (Layer 우선순위: Base < Silver < Gold < Prism < System)
- Effect System
- Tile Operation (모든 패 이동은 Zone 간 이동)
- Information Layer (가시성도 Rule)
- 결정론: 모든 난수는 시드 PRNG, Event Log + 시드 = 리플레이

## 증강

등급

- Silver
- Gold
- Prism

드래프트 (2026-07-15 확정, 같은 날 수정)

- 게임 시작 시 1회 + 남장 진입 시 1회 — 게임 전체 총 2개
- 각 플레이어에게 개인별 랜덤 3개 제시 → 1개 선택
- 스케줄·드래프트 로직은 Rule/교체 가능한 모듈로 구현

## 기본 룰 (2026-07-15 확정 — 상세는 01_GAME_RULES)

- 반장전 (동+남 8국, 서입 연장, 도비 종료)
- 25000 시작 / 30000 반환 / 우마 10-20 / 오카 1위
- 적도라 3장, 쿠이탄 허용, 더블역만 없음

목표

Prism은 기존 리치마작의 상식을 깨는 규칙을 허용한다.

## 플레이어 (2026-07-15 확정)

- 사람과 봇은 같은 PlayerAgent 인터페이스
- AI 봇은 MVP부터 포함 (규칙 기반 단순 봇)
- 선택한 증강은 **전원 공개** (Rule #4 대응 플레이의 전제)

---

# 현재 결정된 기술 스택

※ 필요 시 변경 가능

Frontend

- React
- TypeScript
- Vite

Backend (2026-07-15 확정)

- Node.js 22 + TypeScript
- ws (WebSocket)

Database

- MVP: 없음 (인메모리 + JSONL 리플레이 파일)
- 이후: SQLite → 필요 시 PostgreSQL

Realtime

- WebSocket

Deploy

- macOS Server

Repo

- `/Users/skul/Documents/newMajak` (npm workspaces 모노레포, git 초기화 완료)
- 패키지: `@majak/core` / `@majak/content` / `@majak/server` / `@majak/client`

---

# 현재 논의 중인 내용

아직 확정되지 않은 설계

- 증강 등급별 등장 확률·밸런스 (총 2개 획득 체계라 증강 하나의 무게가 큼)
- 증강 전용 임시 데이터의 저장 위치 (후보: RoundState.augmentData — 10에서 설계)
- 커스텀 Zone의 국 경계 유지 여부 (10에서 설계)
- 랭크 시스템 (MVP 이후)
- 관전자 시스템 (MVP 이후, Information Layer가 자연 지원)
- 계정/DB 구조 (MVP 이후)

---

# 현재 알려진 설계 이슈

Issue 001

증강이 Rule을 동시에 변경할 경우 우선순위 시스템 필요

상태

✅ Resolved (2026-07-15)

해결

RuleRegistry의 (Layer, priority, 등록 순서) 결정적 합성으로 해결.
Base(0) < Silver(100) < Gold(200) < Prism(300) < System(1000).
구현·테스트 완료.

---

Issue 002

패 변환과 역 계산의 충돌

상태

✅ Resolved (2026-07-15)

해결

Tile을 불변 정체성(id)과 가변 속성(kind·attrs)으로 분리.
역·점수 계산은 오직 현재 kind·attrs만 참조한다 (07_TILE_SYSTEM §1).
8의 역 계산 구현 시 이 원칙을 따르면 충돌 없음.

---

Issue 003

Prism 증강이 기본 룰을 크게 변경할 경우 엔진 수정 없이 지원 가능한지 검토

상태

✅ Resolved (2026-07-15)

해결

페이즈 전이는 전부 이벤트 Reducer의 데이터다 (11 §1). 새 페이즈 = 새 이벤트 등록 +
그 페이즈의 ActionDef 등록. FlowController·엔진 수정 불필요. 구현·테스트 완료.
→ 초기 설계 이슈 4건 전부 해결.

---

Issue 004

Effect 연쇄 폭주 (증강 A의 Event가 증강 B를 발동시키는 무한 루프)

상태

✅ Resolved (2026-07-15)

해결

maxChainDepth(16) + maxEventsPerRoot(128) 이중 한도. 초과 시 예외 →
Action 전체 거부, 순수 Reducer 덕에 상태는 원본 유지 (05_EFFECT_SYSTEM §4).
"재진입 금지" 대신 depth 한도를 채택 — 정당한 콤보는 허용하되 폭주만 차단.
구현·테스트 완료.

---

# 다음 우선순위

Priority 1

실배포 (TLS 리버스 프록시 + 포트포워딩) 후 실플레이 피드백 수집.
코드는 배포 준비 완료(단일 포트 프로덕션 부팅·정적 서빙·WS 확인). 배포 절차는 DEPLOYMENT.md.

Priority 2

증강 밸런스 관찰·조정 (58종 콘텐츠 + 표준 7 = 65종 — 실플레이 데이터 기반)

Priority 3

Save/이어하기(서버 재시작 후 진행 게임 복구) — 코어 resume/reconstructGame은 구현·테스트됨
(Resume.test.ts). 서버 자동 저장·복구 배선만 남음(설계 결정 필요, 15 §11).
※ 세션 만료·게임 포기(20d차)·WS 자동 재연결(20e차) 완료

Priority 4

~~reaction 페이즈 프롬프트 확장 훅~~ ✅ 완료(24차 — registerReactionOptions).
App.tsx 파일 분리 리팩토링(~3,000줄)만 여지로 남음.

---

# 최근 변경사항

## 2026-07-18 (27차 — 안깡/이름/동시드래프트/현상금 개편/무효투표 + 국전환 순서)

사용자 요청 8종을 조사(6-way)→구현→적대적 리뷰(3-way)로 마무리.

- **국 전환 연출 순서(핵심)**: `ROUND_SETTLED`가 정산 시점에 다음 국 번호를 미리 올려, 정산 직후(round.over) 뷰가 이미 "동3국"으로 보였다 → detectTransitions가 이 뷰를 새 국으로 오인해 론·점수표보다 먼저 새 국 배너를 띄우고 지난 국 리치·부로를 재발동했다. 새 국 감지를 `next.round.phase !== "round.over"`로 게이트해 진짜 다음 국 뷰에서만 처리 → 리치→론→점수표→(닫기)→동N국 순서 보장.
- **안깡 용어·중복(A/B)**: 표기를 안깡으로 통일(전 소스/문서 일괄). "안깡 버튼 4개" 버그는 FlowController.turnPrompt가 같은 4장을 손패 순회하며 옵션을 4번 넣던 것 — `ankanKindsSeen`로 종류당 1개만 제시(서로 다른 안깡 2종은 각각 유지).
- **실제 이름·봇 표기(D)**: `GameConfig.playerMeta`(닉네임·isBot)를 GameState.players→PlayerInfo→PlayerView로 관통(리플레이 __init__로 자동 지속, 구 리플레이는 id 폴백). `PlayerAgent.isBot`·`RankingEntry.isBot` 추가. 클라 `playerName`/`botLabel`/`playerNameById`로 인게임 전역(이름표·컷인·결과·랭킹)에서 유저명 표시, 봇은 봇1/봇2/봇3.
- **동시 드래프트(E)**: runDraft를 순차 await → 전원 동시 오퍼+병렬 대기(Promise.race(abortSignal))로. 픽은 고정 에이전트 순서로 적용해 리플레이 결정성 유지. 드래프트 중 무효 투표가 와도 30초 타임아웃까지 멈추던 행(hang)도 해소(+runLoop 남입 후 abort 체크).
- **현상금 사냥꾼 개편(G)**: 전원 공개 랜덤역 `yaku_bounty` 삭제. 특정 역 6종은 "역명 전문가"로 개명(탕야오/리치/역패/삼색/혼일색/또이또이 전문가). 콘텐츠 59→**58종**(Silver 22).
- **게임 무효 투표 전면 노출(H)**: 설정 안에만 있던 프롬프트를 상단 전면 배너(AbortVoteBanner)로 — 투표 진행 중(votes>0) 전원에게 동의/반대 노출. `voteAbort`를 3-state(agree/withdraw/reject)로 확장, reject는 만장일치 불가한 투표를 즉시 취소.
- **액티브 표기(F)**: 드래프트 카드에 "⚡ 액티브" 뱃지 + 설명 줄, 이름표 툴팁에도 액티브 안내(기존 뱃지 강화).
- **검증**: 전체 318개 테스트 통과(안깡 중복 방지 회귀 추가), 4패키지 타입체크·클라 빌드 통과, 실서버로 봇1/2/3 이름·등급 통일 드래프트·전문가 개명·무효 배너 확인.

## 2026-07-18 (26차 — 드래프트 등급 통일·도박사·연출 큐 + 렌더 버그 9종)

사용자 요청 9종을 조사(6-way 병렬)→구현→적대적 리뷰(5-way)로 마무리.

- **매 게임 새 시드(#4, 핵심 버그)**: `DEFAULT_HANCHAN_CONFIG.seed = Date.now()`가 모듈
  로드 시 1회만 평가되고 `RoomManager.startGame`이 시드를 안 넘겨, 프로세스 내 모든
  게임이 같은 시드 → 배패·증강 선택지가 매번 동일("증강 초기화 안 됨"의 정체). startGame이
  `seed: randomInt(0x1_0000_0000)`를 주입해 게임마다 재추첨(리플레이 __init__로 결정성 유지).
- **증강턴 등급 통일(#6)**: 매 증강턴 확률(60/30/10)로 등급 하나를 전원 공통으로 뽑고
  그 등급 안에서만 제시. `AugmentRegistry.rollFromTier`, `DraftController.tierForStage`
  (player 무관 시드 → 전원 동일·리플레이 재현), `roll`이 이를 사용.
- **도박사 계열(#7)**: `AugmentDef.grantsRandomTier` 필드 신설. 도박사(gambler, 실버→랜덤
  골드) 추가, 전문 도박사(gambler_pro, 승부사→개편, 골드→랜덤 프리즘). 지급은
  `DraftController.pick`의 grantChain(결정적 시드·스테이지 인지·연쇄·풀고갈 가드)에서 처리 →
  state.augments에 기록되어 리플레이 안전. 도박사가 한 턴에 2개를 줘 깨지던 카운트 기반
  스테이지 추적을 `draft:done:{stage}:{pid}` 플래그(augmentData)로 교체(runDraft·resume).
- **연출 큐(#2 배너 잔류·#9 국 전환 순서)**: 단일 banner/cutIn 슬롯을 순차 재생 큐
  (productionQueue + activeProd, pump/drain 이펙트)로 교체 — 여러 알림이 몰려도 덮어써
  사라지거나 다음 국까지 남지 않음. 국 결과창은 큐가 다 빈 뒤 열림(pendingResult 드레인
  게이트)이라 "이전 국 정리 후 다음 국" 순서 보장. sfx는 활성화 시점에 재생.
- **만관 이상 컷인(#8)**: 만관/하네만/배만/삼배만에 등급별(data-tier) 별도 컷인 연출 +
  sfx.mangan. 역만/일반과 구분.
- **렌더/입력(#1,#3,#5)**: 진짜 용(16장) 손패 타일 세로 늘어짐 수정(`.tile-hand` 높이를
  --hand-w에서 직접 계산). 자동정렬 OFF 드래그에 커서 추종 고스트(setDragImage)+원본
  디밍, 포인터 좌/우 절반 기준 삽입(오른쪽 끝 도달 가능). 액티브 증강을 드래프트 카드·
  툴팁에 "⚡ 액티브" 뱃지로 표기(`isActiveAugment`).
- **리뷰 반영**: 더블론+역만 시 헤드라인이 실제 역만자를 지목(infos[0] 고정 X), 새 국 진입
  시 미개봉 pendingResult 정리, manualOrder를 국마다 초기화(패 id는 게임 내 재사용됨).
- **검증**: 전체 321개 테스트 통과(도박사 지급·등급 통일 회귀 테스트 추가), 4패키지
  타입체크·클라 빌드 통과, 실서버+브라우저로 등급 통일 드래프트·만관 컷인·액티브 뱃지 확인.

## 2026-07-18 (25차 — 배포 준비 + 가입 게이트)

기존 배포 환경(맥·Cloudflare cloudflared·DuckDNS·도메인 gol.n-e.kr) 재활용해
포트포워딩 방식(A)으로 공개하기로 함. 코드 배포 준비 + 평문 HTTP에서의 최소 보안.

### 배포 준비

- **footgun 수정**: `@majak/server`의 `tsx`가 런타임 필수인데 devDependency였음 →
  dependencies로 이동(`--omit=dev` 설치 대비). `start` 스크립트가 없는 `dist/index.js`를
  가리키던 것을 실동작 tsx 커맨드로 수정.
- **DEPLOYMENT.md**·**deploy/Caddyfile.example** 신설. 프로덕션 부팅 검증(SPA·자산·
  SPA 폴백·WS·경로탈출 차단). 클라는 same-origin(`loc.host` 포트 포함)으로 ws 자동 연결
  → 다른 포트·평문 HTTP에서도 그대로 동작 확인.
- **전용 실행 스크립트**: `deploy/serve.sh`(+`deploy/majak.env.example` 설정 템플릿,
  npm `serve`/`serve:stop`/`serve:status`/`serve:logs`). majak.env(gitignore)의 PORT·
  SIGNUP_CODE·PUBLIC_HOST 등을 env로 주입해 기존 majak.sh에 위임, 시작 시 공개 URL 안내.
  래퍼→majak.sh→node 환경 상속으로 SIGNUP_CODE 전달까지 실서버 로그로 확인.

### 가입 게이트 (SIGNUP_CODE) — 평문 HTTP 배포의 1차 방어

- `SIGNUP_CODE` 환경변수 설정 시, 코드를 아는 사람만 회원가입 가능(무단 가입·계정 탐색
  차단). 미설정이면 개방(로컬·개발 기본). 프로토콜 `RegisterMessage.signupCode`,
  RoomManager 게이트 검사(SIGNUP_CODE_REQUIRED), index.ts env 배선, 클라 가입 폼에
  "가입 코드" 필드 추가, 부팅 로그에 게이트 on/off 표시.
- 기존 보호와 함께: scrypt+salt·인증 레이트리밋·세션 토큰(비번 재전송 없음)·세션 TTL.
- **검증**: 서버 테스트 +2(코드 없음/틀림→거부, 정확→가입; 미설정 시 개방), 전체 318개
  통과, 4패키지 타입체크·빌드 통과, 실서버+브라우저 WS로 게이트 동작(틀린 코드 거부·
  정확한 코드 가입) 확인.

## 2026-07-17 (24차 — 증강 4종 개편 + 생성 패 이펙트 + 리액션 확장 훅)

사용자 요청 증강 조정 4건. 마지막 항목에서 코어 리액션 프롬프트 확장 훅을 신설(10 §6 숙제 해소).

### 회수 (discard_recall) — 게임당 1회 → 매 국 1회

- 사용 플래그 키에 roundKey를 넣어 국이 바뀌면 자동 초기화. 버림패 중 골라 가져오는
  스왑 메커니즘·손패 수 보존은 유지.

### 봉인술사 (discard_lock) — 봉인 목록 전체 공개 → 본인만 확인

- 봉인 목록 키를 `view:*:sealed:{pid}`(전원) → `view:{holder}:sealed:{pid}`(보유자 전용)로
  변경. buildPlayerView가 보유자에게만 augmentView로 노출하고, discard.blockedKinds 규칙은
  보유자별 키를 읽는다(여러 보유자 누적). 상대는 목록을 못 봐도 봉인 패는 버림 후보에서 빠진다.

### 우는 국사무쌍 (open_kokushi) — 특수 퐁 재설계 + 3판

- **서로 다른 요구패 3장 특수 퐁(kokushi_pon)**: 1만1통1삭 / 9만9통9삭 / 백발중 /
  동남서북 중 3패. 이 퐁을 하면 국사 외 형태로 화료 불가(분해상 자연 배타), 머리는
  울지 않은 손패, 퐁 개수 제한 없음, 8판 역만 → **3판**.
- **코어 리액션 확장 훅 신설**: `GameEngine.registerReactionOptions` + FlowController가
  리액션 프롬프트에 주입하고, resolve가 표준 타입이 아닌 콜을 **커스텀 콜**로 펑과 치
  사이 우선순위 처리(엔진은 특정 액션명 하드코딩 없음). `Meld.kind`/`CallMadePayload.meldKind`/
  `MeldInfo.kind`에 `kokushi_pon` 추가. decompose의 국사-부로 분기를 M개 부로(3M종)로 일반화.
  helpers.scoringOptionsOf가 kokushi_pon 부로의 3종을 국사 덮개로 넘긴다.

### 생성된 패 이펙트 (conjured)

- `TileAttrs.conjured` 신설. 패산의 실제 패가 아니라 증강이 **새로 만들어낸** 패
  (색을 바꿔 4장 한도를 넘길 수 있는 suit_unify 등)를 표시한다. suit_unify가 변환 패에
  `conjured:true`를 부여하고, 클라이언트 TileImg가 `.tile-conjured`(프리즘 보라 글로우+반짝임)로
  원본과 구분해 그린다.

### 검증

- 전체 316개 테스트 통과(신규: kokushi_pon 콜 흐름·3판 채점·conjured·봉인 본인전용·회수 국단위).
- 4패키지 타입체크·클라 빌드 통과. 수정 증강 강제 픽 봇 반장전 20시드(+kokushi_pon 실호출)
  크래시 0. 브라우저에서 conjured 글로우 렌더 확인.

## 2026-07-17 (23차 — 배너 stuck 수정 + 게임 무효 투표 + 봇 역-인지 후로)

실플레이 피드백 3건. 실서버+브라우저 E2E로 세 기능 모두 확인.

### 국 시작 배너가 안 사라지는 버그 수정 (client)

- **원인**: `detectTransitions`가 국 전환(장풍·국수·본장 변화)마다 배너를 띄웠는데,
  중복·스테일 뷰(재접속 복원 등)로 같은 전환이 다시 들어오면 배너가 재발동했다.
  재발동이 쌓이면 각 배너의 fire-and-forget `setTimeout` 클리어가 매번 더 새 key를
  보고 실패해 배너가 화면에 영구히 남았다(관찰: 리치 배너 최대 3599ms).
- **해결(멱등 + effect 클리어)**: `bannerShown` ref로 국(roundKey)·리치·부로를
  "이미 알림했는지" 추적해 전환당 정확히 한 번만 배너를 띄운다(첫 뷰·재접속은
  현재 상태를 시드만 하고 헛알림 안 함). 배너·컷인 클리어도 showBanner마다 타이머를
  거는 방식에서 상태값에 ttl을 싣고 **useEffect가 값이 바뀔 때 타이머 하나만
  걸어 정리**하는 방식으로 교체(스테일 클로저·중복 타이머 제거).
- **검증**: 브라우저 봇 반장전 완주 동안 stuck(>3.5s) 0, 배너는 ttl(펑 1400·리치
  1800·국 1600ms)에 정확히 사라짐. 재접속 후에도 배너 정상.

### 게임 무효(중단) 투표 — 전원 동의 시 게임 종료 (신규 기능)

- 게임 중 설정 패널에 **"무효에 동의" 버튼** 추가. 방의 사람 전원이 동의하면
  (봇·이탈 좌석은 자동 동의) 게임을 **정산·순위·기록 없이 무효 종료**하고 홈으로.
- **구현**: 프로토콜 `voteAbort`(요청)·`abortVote`(현황 votes/needed)·`gameAborted`.
  `HanchanController.requestAbort()` — 진행 중 결정 대기와 국 사이 대기를 abortSignal과
  race해 즉시 깨우고 `onGameAborted`로 종료(정산 안 함). `RoomManager.handleVoteAbort`가
  사람 표를 세어 전원 동의 시 requestAbort. 무효 게임은 recordGame/finishStats 안 함.
- **검증**: 서버 통합 테스트(사람1+봇3, 1표로 무효→gameAborted·gameOver 없음),
  브라우저에서 실클릭→게임 무효→홈 복귀·통계 미기록 확인.

### 봇이 역을 만들 수 있을 때 후로한다 (BotAgent 개선)

- 22차에서 봇은 멘젠 유지를 위해 후로를 전면 금지했었다. 이제 **역이 나올 때만**
  펑·치를 한다: 역패 펑(백·발·중·자풍·장풍 — 커쯔 자체가 역이라 항상 안전),
  혼일색 지향(수패가 거의 한 색이면 그 색·자패), 탕야오 지향(손패가 전부 심플).
  후로 시 그 국의 목표 역(plan)을 기억하고 이후 버림을 목표 역에 맞게 고른다
  (혼일색이면 딴 색부터, 탕야오면 1·9·자패부터 버림).
- **검증**: 회귀 테스트 +1(봇이 CALL_MADE로 후로하고 열린 손으로 WIN_DECLARED까지
  성사), 브라우저에서 봇들이 펑·치로 손을 열고 화료하는 것 확인.

### 검증 총괄

- 전체 315개 테스트 통과(서버 +2: 무효 투표·봇 후로), 4패키지 타입체크·클라 빌드 통과.
- 실서버+브라우저 E2E: 배너 정상·봇 후로·무효 투표 전부 확인.

## 2026-07-17 (22차 — 봇 AI 수정 + 신규 증강 3종)

실플레이 피드백("AI가 리치·론·쯔모를 안 한다") + 사용자 요청 증강 3종.

### 봇 AI 버그 수정 (BotAgent)

- **원인 2중**: (1) 버림이 항상 마지막 옵션 = 쯔모기리 → 손이 영원히 안 변해
  텐파이 불가, (2) 펑·치를 무조건 불러 멘젠 파괴 → 역 없음 → win이 validate에서
  안 나옴. 합쳐서 리치·화료가 0이었다.
- **수정**: 부로 전면 금지(패스, 멘젠 유지) + 버림을 뷰 기반 고립도 휴리스틱으로
  (또이쯔/이웃 보존, 외톨이 자패부터, 적도라 보존). 리치·화료 무조건.
- **회귀 테스트**: `server/test/BotAgent.test.ts` — 실게임 3시드에서 리치 선언·
  화료 정산이 실제 발생함을 이벤트 로그로 검증 + keepValue 단위 2건.
- **파급**: 봇이 실제로 이기면서 뱅크식 보너스 증강이 발동 → 최종 총점 제로섬
  단언(RoomManager·Resume 테스트)이 깨짐을 발견. 제로섬은 뱅크 설계상 불변식이
  아니므로 순위 1~4 유일성 + 점수 공식 일관성 검증으로 교체.

### 신규 증강 3종 (멀티에이전트 워크플로 구현 + 적대적 검증)

- **대기만성(late_bloomer, prism)**: 남4국부터(서입 포함) 정산 획득 점수 3배
  (잃는 점수는 그대로). **게임 시작 드래프트에서만 등장** — 이를 위해 코어에
  `AugmentDef.draftStages` 제시 스테이지 제한 신설(DraftController.roll이 필터).
- **죽기살기(die_hard, gold)**: 게임당 1회, 정산으로 점수가 0 미만이 될 때
  부족분을 환급받아 정확히 0에서 버틴다(도비는 0 '미만'이므로 생존).
  ROUND_SETTLED reaction + scoreChanged 환급 + used 플래그.
- **기생충(parasite, prism)**: 자기 턴에 숙주 지정(게임당 1회) → 숙주 정산 증감의
  절반(100점 단위)을 대신 받거나 잃음(제로섬 보존 — 숙주에서 뺀 만큼 이전).
  숙주가 화료하거나 론을 맞으면 다음 자리 플레이어로 자동 이동(보유자는 건너뜀).
  parasite_attach 능동 액션 + ROUND_SETTLED 인터셉터/리액션.
- **검증**: 증강별 테스트 14건 신규(대기만성 5·죽기살기 4·기생충 5), 전체
  313개 테스트 통과, 4패키지 타입체크·클라 빌드 통과, 신규 3종 강제 픽 봇
  반장전 24시드 스위프 크래시 0(기생 액션 실발동 포함). 적대적 리뷰에서
  카탈로그 미등록(치명) 2건 발견·수정 — 등록 없이는 드래프트 미등장 +
  리플레이 재구성 크래시였음.

## 2026-07-17 (21차 — 결과 화면 닫기 게이트 + 증강 밸런스 개편)

실플레이 피드백(론당 결과 화면이 다음 국까지 남음) + 증강 "본인 전용" 원칙 정리.

### 국 결과 화면 자동 닫기 + 전원 닫기 시 다음 국 진행 (버그 수정)

- **원인**: RoundSettled 리듀서가 정산 직후 **다음 국의 장풍/국수/본장**을 이미
  적용해, 국 종료 view가 다음 국 정보를 담는다. 그래서 클라이언트의 "새 국 시작"
  감지가 결과 패널이 뜨기 전에 발동하고, 정작 실제 다음 국 view는 round 정보가
  같아 클리어가 안 돼 패널이 자기 9초 타이머까지 화면에 남았다.
- **해결(ack 게이트)**: 결과 화면은 5초 후 자동으로 닫히고(수동 "닫기 (다음 국)"
  버튼도), 닫힐 때 `roundContinue`를 서버로 보낸다. 서버는 **사람 전원이 닫으면**
  즉시 다음 국을 시작하고, 아무도 안 닫아도 상한(`interRoundDelayMs`, 기본 7초)에서
  진행한다. `PlayerAgent.awaitContinue?()` 신설, 봇·미구현 에이전트는 즉시 통과.
- **구현**: 프로토콜 `RoundContinueMessage`, `HumanAgent.awaitContinue`(신호/타임아웃/
  포기 시 해소), `HanchanController.pauseBetweenRounds`가 전원 ack를 대기,
  `RoomManager`가 roundContinue 라우팅, 클라 `closeRoundResult`(국당 1회 전송·관전 제외).
- **테스트**: HumanAgent ack 4개, RoomManager 통합 1개(대기 상한 30초를 둬도 ack로
  20초 안에 완주 → 배선 검증).

### 증강 개편 — "본인에게만 이점" 원칙 + 도파민 계열 확장

- **전원 영향 증강 정리**: `reverse_world`(전역 진행방향 역전 — 종국 판정과도 취약)
  삭제, `riichi_market`을 전역 리치 비용 변동 → **본인 전용**(화료 시 회수하는
  리치봉 1개당 +1000점)으로 개편.
- **현상금 사냥꾼 계열 6종 신규(Silver)**: 탕야오·리치·역패·삼색·혼일색·또이또이 —
  지정 역을 포함해 화료하면 본인만 상금(+2500~4500). `util.ts` `yakuBountyBonus` 헬퍼.
- **도파민 Prism 2종 신규**: `jackpot`(일확천금 — 정산에서 본인 점수 증감 항상 ±2배),
  `big_hand`(큰손 — 모든 화료가 최소 만관 보장). `true_dragon` +2→+3판 소폭 강화.
- **감사 결과**: 드래프트가 보유 증강을 제외(비복원)해 같은 증강 중복 불가 → 한 명당
  증강 2개로 시너지 유계. `RuleRegistry.resolve`는 modifier를 (layer·priority·seq)
  순서로 누적(extraHan 스택은 의도된 동작, 역만은 엔진이 상한). 크래시 유발 우선순위
  버그 미발견.
- **검증**: 전체 296개 테스트 통과, 4패키지 타입체크·클라 빌드 통과, 콘텐츠 전체
  카탈로그(신규 강제 픽 포함) 봇 반장전 40+24시드 스위프 크래시 0.

## 2026-07-16 (20e차 — 클라이언트 WS 자동 재연결)

Priority 3 마지막 항목. 상세는 docs/15 §10.

- **자동 재연결**(App.tsx): 예기치 않은 소켓 close 시 지수 백오프(0.5s→최대 10s,
  무한)로 재접속, "⟳ 서버와 재연결 중…" 상단 인디케이터. 상태 기계는 전부 live
  ref(소켓 콜백이 마운트 클로저라 state 값은 스테일).
- **토큰 재인증 + 활성 방/관전 자동 복귀**: 재연결 시 저장 토큰으로 tokenLogin,
  `activeRoomRef`/`activeSpectateRef`로 끊기기 전 방에 joinRoom/spectate 자동 전송
  → 서버 신원 재접속이 뷰·프롬프트 복원. 토큰 만료 시 로그인 화면 정리.
- **게임 소멸 시 graceful 홈**: 자동 재입장한 방이 사라졌으면 ROOM_NOT_FOUND로
  조용히 홈 복귀(토스트). 판정은 activeRoomRef 생존으로(스테일 state 미사용).
- **버그**: 초안에서 소켓 콜백이 state(view/auth)를 직접 읽어(마운트 클로저라
  스테일) graceful-홈이 안 뜨던 문제를 실브라우저에서 발견·수정 — live ref 기준으로.
- **검증**: 서버·코어 테스트 285개 유지(클라 변경만), 4패키지 타입체크·클라 빌드
  통과, **실서버+브라우저 E2E**: 서버 강제 종료→재연결 배너·백오프, 서버 복구→
  토큰 재인증(재로그인 없이 홈)·게임 소멸 시 graceful 홈, 진행 게임 재접속 시
  손패·강·정보 패널 완전 복원(부재 중 진행분 ×69→×66 반영) 확인.

## 2026-07-16 (20d차 — 세션 만료 + 게임 중 포기 처리)

Priority 3 한계 중 서버측 두 건 마무리 (WS 자동 재연결만 남음). 상세는 docs/15 §9.

- **세션 토큰 만료(TTL)**: `SiteDb`에 `sessionTtlMs`(기본 30일, 환경변수
  `SESSION_TTL_MS`) 추가. `loginByToken`이 `sessions.created_at` 기준으로 만료를
  검사·지연 삭제 → 로그아웃 없이도 오래된 토큰이 무효화된다.
- **게임 중 포기(중도 이탈)**: 게임 중 `leaveRoom` → `HumanAgent.abandon()`으로
  좌석이 봇처럼 즉시 자동 진행(대기 결정/드래프트는 안전 폴백으로 해소). 남은
  사람들이 30초 타임아웃마다 멈추지 않고 완주. 포기 좌석은 `isAbandoned`로
  membershipOf·재접속 대상에서 제외.
- **검증**: 전체 285개 테스트 통과(서버 +3: 세션 만료 2·포기 1), 4패키지
  타입체크 통과, **실서버 런타임**(TTL 1.5s로 만료 전 유효→만료 후 TOKEN_INVALID
  확인; 포기 후 프롬프트 무응답으로도 gameOver 2.5s 완주 확인).

## 2026-07-16 (20c차 — 인증 하드닝: 비동기 scrypt + 레이트리밋)

20b차에서 미조치로 남긴 인증 DoS를 마무리.

- **이벤트 루프 블로킹 제거**: `SiteDb.register/login`을 동기 `scryptSync`에서
  비동기 `scrypt`(libuv 스레드풀)로 전환 → 인증 요청이 더 이상 공유 이벤트
  루프를 막지 않는다. **실서버 실측: 8건 동시 scrypt 진행 중 ping RTT ≈0 ms**
  (이전이라면 직렬화되어 수백 ms 지연).
- **연결당 인증 레이트리밋**: 60초 창 최대 12회, 초과 시 `RATE_LIMITED`
  (`RoomManager.rateLimited`). 한 연결이 스레드풀 CPU를 독점하지 못하게 함.
- **배선**: register/login이 async가 되어 `doAuth` 헬퍼에서 floating `.catch`로
  처리(거부가 프로세스를 죽이지 않음). SiteDb API 변경 파급은 서버 라우터와
  테스트 헬퍼(`connectAndRegister`/신규 `connectAndLogin`)에 한정.
- **검증**: 전체 282개 테스트 통과(서버 +1: 레이트리밋 #13 정확 발동), 4패키지
  타입체크 통과, **실서버 런타임**(가입·로그인·오답·이벤트루프 반응성·레이트리밋
  #13·생존 전부 확인).

## 2026-07-16 (20b차 — 신규 사이트 계층 보안 리뷰 + 결함 수정)

20차 신규 코드(계정·방코드·리플레이·관전)를 인증·접근제어·경로탈출·인젝션·
입력검증/DoS 5관점으로 리뷰. 상세는 docs/15 §8.

- **치명 결함 수정**: `replayGet`의 `gameId`가 없거나 비정수면 node:sqlite 바인딩
  예외 → `void` floating Promise의 처리되지 않은 거부 → **서버 프로세스 전체
  크래시**(Node 22 기본). 라우터 `Number.isInteger` 검증 + `getGame` null 반환 +
  floating 호출 `.catch` 3중 방어로 수정. `register/login/tokenLogin/joinRoom/
  spectate` 문자열 필드 타입 가드 추가.
- **프로세스 안전망**: `index.ts`에 `unhandledRejection`·`uncaughtException`
  핸들러(로그 후 생존) + `finishStats` floating `.catch` + `ReplayWriter` 스트림
  `error` 핸들러. 떠 있는 Promise 거부 하나가 전체 서버를 죽이지 못하게 함.
- **DoS 하드닝**: `WebSocketServer maxPayload 512KB`(ws 기본 100 MiB 프레임 차단).
- **이상 없음 확인**: scrypt+salt·timingSafeEqual, 256비트 세션 토큰, SQL 전부
  파라미터 바인딩, 정적 서버 경로탈출 차단, 리플레이/관전 접근제어 게이트, 좌석
  탈취 불가(계정명 기준 재접속).
- **남은 권장**: 동기 scryptSync가 이벤트 루프 블록 → 비동기 scrypt +
  로그인 레이트리밋 (**20c차에서 완료**).
- **검증**: 전체 281개 테스트 통과(서버 +3: 잘못된 gameId·미존재 gameId·필드 누락
  인증), 4패키지 타입체크 통과, **실서버 런타임 확인**(3199 포트에 crash vector
  4종 주입 → 전부 BAD_REQUEST, ping→pong으로 프로세스 생존 확인).

## 2026-07-16 (20차 — 게임 사이트화: 계정·방코드·리플레이·관전 + 로직 대감사)

"진짜 게임 사이트" 회차 — 배포 가능한 완성도를 목표로 한 대개편

### 게임 로직 감사 (멀티에이전트 워크플로 + 수동 검증) — 규칙 버그 17건 수정

- **치명**: 서입(西入)이 절대 발생 안 함(wind>=3 조기 종료) → 수정, 봇 80판 중
  55판에서 서입 실제 발생 확인. 사깡·사풍연타 유국이 round.over에서 재발동해
  **무한 루프** 가능 → turn.draw 페이즈 가드(표준 판정 시점도 이걸로 해결).
  영상패 쯔모가 왕패 앞을 빼가 2번째 깡부터 **도라 표시패 인덱스 붕괴** +
  4번째 깡에서 flipDora 크래시 → 영상 쯔모 시 패산 마지막 패를 왕패 '앞'에
  보충(왕패 14장 유지·인덱스 불변·쯔모 총량 70 고정).
- **주요**: 버림패가 부로로 강에서 사라지면 후리텐 소실 →
  PlayerRoundState.discardedKinds 이력 신설(판정·표시 모두 이력 기준).
  역 없음으로 론 못 하는 대기패 통과 시 일시 후리텐 미마킹 → 전면 마킹.
  창깡(가깡 론) 시 일발 소멸 → 일발 소멸을 깡 완성(영상 쯔모) 시점으로 이동.
  리치 선언패 론 시 공탁 미반환 → 반환. 반장 종료 잔여 공탁 소멸 → 1위 지급.
  최종 순위 점수 반환점 미차감(제로섬 깨짐) → (raw−30000)+우마+오카.
  타임아웃 폴백이 자동 론/펑 → 패스>쯔모기리 우선(safeFallbackOption).
  하저 부로 허용·패산 0 깡 허용 → 금지. 깡 4회 상한 없음 → 상한.
  구종구패를 아무 순에나 선언 가능(firstTurn 미해제) → 첫 쯔모 한정.
- **보완**: 도비 0점 '이하'→'미만'(문서 기준), 영상개화+해저 중복 가산 제거,
  치·펑에서 적5 사용 여부 선택지 제공, 부로 시 일시 후리텐 해소(EMA),
  천화·지화 플래그 배선(기존에 죽어 있던 역 활성화).
- 회귀 테스트 `core/test/RuleFixes.test.ts` 8개 신설.

### 계정·사이트 (docs/15_ACCOUNTS_SITE.md 신설)

- **SiteDb** (`server/src/SiteDb.ts`): node:sqlite(내장) — users(scrypt+salt)·
  sessions(토큰)·games·game_players. 관리자 코드는 첫 부팅 시 생성·콘솔 출력,
  가입 시 입력하면 관리자 계정.
- **RoomManager 전면 개편**: 모든 연결은 register/login/tokenLogin 인증 필수 →
  방 만들기 버튼 = 랜덤 6자 코드 발급 → 코드로 참가. 게임 중 재접속은 같은
  계정으로 joinRoom만 하면 됨(신원 기준). 게임 종료 시 games 기록.
  대기실 이탈 정리·방장 승계·중복 참가 거부. 관리자 liveGames/spectate.
- **단일 포트 배포**: index.ts가 client/dist 정적 서빙 + WS upgrade
  (경로 탈출 방어, SPA 폴백, 자산 캐싱). PORT/DB_PATH/CLIENT_DIST 환경변수.
- **관전(코어)**: HanchanController.addSpectator — SPECTATOR_ID 뷰 스트림,
  중도 합류 즉시 뷰 전송, actionFx(비표준 액션 연출 브로드캐스트) 신설.

### 클라이언트 — 게임 사이트 UI

- **로그인/회원가입** 화면(탭·관리자 코드·고급 서버 설정), 세션 자동 로그인.
- **홈**: 네비(닉네임·관리자 배지·로그아웃), 방 만들기·코드 참가·진행하던
  방 재접속, 내 통계 카드, 내 리플레이 목록, (관리자) 진행 중 게임+관전.
- **대기실**: 방 코드 크게 표시 + 클릭 복사.
- **리플레이 뷰어**: 서버가 JSONL 라인 전송 → 클라이언트가 Reducer로 재구성
  (`replayRebuild.ts`), 관전자 시점 테이블 + 재생/스크럽/국 점프/배속.
- **관리자 관전 화면**: 실시간 뷰 스트림, 전 손패 공개 표시, 종료 시 정리.
- **액티브 증강 발동 컷인**: actionFx 수신 시 보라 밴드 컷인+효과음.
- GameTable 관전 모드(spectator prop), 토스트 알림, 에러 표준 표시.

### 검증

- 테스트 278개 전부 통과 (서버 14개는 신 API로 재작성 — 인증 6·방코드 5·
  완주/기록 2·관리자 관전 1). 봇 스위프 80판 완주(서입 55판·크래시 0).
- **실브라우저 E2E**: 프로덕션 서버(정적+WS 단일 포트 3002)에서 가입→로그인→
  방 생성(코드)→타 계정 코드 참가→준비→방장 승계→게임 완주(WS 드라이버)→
  홈 통계/리플레이 반영→리플레이 뷰어 2,719이벤트 재구성·스크럽→관리자 가입
  (콘솔 코드)→진행 중 게임 목록→실시간 관전(치 배너·국 배너 스트림)→관전 중
  게임 종료 처리까지 전부 확인.
- wait_art(대기의 미학)는 보조 역(auxiliary) 개념 신설로 "다른 역이 있을 때만
  +판"으로 수정 (코어 YakuDef.auxiliary — 단독 화료 불가).

### 신규 코드 보안 리뷰 (멀티에이전트, 5관점) — 확인 결함 전건 수정

- 프로토타입 오염 닉네임(`__proto__`/`toString` 등)으로 로비 크래시 → StatsStore
  null-proto 맵 + 예약 닉네임 차단. 게임 크래시 시 플레이어 미통지(무한 대기) →
  error{GAME_CRASHED} 전송 + 클라 홈 복귀. 정적 스트림 error 핸들러 부재 →
  res.destroy. logout 소프트락 → 방·관전 정리. (unhandledRejection 안전망·
  maxPayload·비동기 scrypt·인증 레이트리밋·세션 TTL은 앞선 후속 회차에서 반영됨.)
- 실서버 프로브: 예약 닉네임 5종 거부·정상 가입 성공·경로탈출 4종 폴백(유출 0)·
  악성 가입 후 서버 생존 확인. 서버 테스트 +2(프로토타입 안전·예약 닉네임).
- 전체 테스트 288개 통과, 4패키지 타입체크·클라 빌드 통과.

## 2026-07-16 (19c차 — 증강 18종 추가 + 밸런스·카드 UI)

콘텐츠 대폭 확장 — 새 증강 18종(총 카탈로그 37→55종), 상세 설명, 화려한 드래프트 카드

- **새 증강 18종** (`packages/content/src/augments/`, 1종=1파일):
  - Silver 10: 오야 근성·막판 스퍼트·흐름·연장전·카운터·복수자·붉은 손·욕심·도라 헌터·편식
  - Gold 8: 노련함·침착함·승부사·역전극·대기의 미학·기세·청빈·승부수(능동)
  - 사용자 요청 14종 + 재미 확장 4종(오야 근성·역전극·막판 스퍼트·청빈)
- **공통 헬퍼** (`content/src/util.ts`): `addHanBonus`(score.extraHan 모디파이어),
  `addWinPointBonus`(ROUND_SETTLED 인터셉터로 보너스 점수), `stringOf`. 대부분의
  "+N판 / +N점" 증강이 이 둘로 10줄 이내로 구현된다.
- **패턴별 구현**: 판 보너스는 정산 시 state로 계산(노련함·승부사·역전극 등),
  점수 보너스는 winInfo로 계산(붉은 손·욕심·청빈), 국 경계 카운터는 augmentData
  (기세·흐름·연장전·카운터·복수자), 대기 형태는 커스텀 역 2종(대기의 미학),
  능동 리치 취소는 커스텀 이벤트+리듀서+액션(승부수 — seat_swap 패턴).
- **상세 설명**: 모든 새 증강에 발동 시점·매 국 초기화·본인 턴 조건을 명시.
- **드래프트 카드 개편**(client): 카드 크게(clamp 240~290px), 등급 pill 배지 + 상단
  등급 액센트 바 + 등급색 글로우 + hover 광택 sweep, 제목 글로우 펄스. 액티브 증강
  버튼에 승부수(cancel_riichi) 연동, 결과 화면에 대기의 미학 역 한글명 추가.
- **검증**: 봇 스위프 크래시 0(전체 카탈로그 랜덤 60판 + 새 증강별 강제 6판×18),
  신규 정확성 테스트 7개(dealer_grit·gambler_pro·picky_eater·final_spurt), 전체
  테스트 268개 통과, 4패키지 타입체크·클라 빌드 통과, 브라우저에서 새 카드·새 증강
  드래프트·게임 진행 확인.

## 2026-07-16 (19b차 — QoL 후속 보완)

19차 실플레이 피드백 반영

- **증강 툴팁 잘림 수정**: 좌·우 자리 플레이어의 증강 툴팁이 화면 밖으로 잘리던 문제 —
  자리별로 툴팁을 중앙 쪽으로 펴도록 정렬(`tipAlign`: 좌=오른쪽으로, 우=왼쪽으로).
- **손패 hover → 공개패 강조 (신규)**: 내 손패에 마우스를 올리면 같은 종류의 버림패·부로가
  청록으로 반짝여 어디에 몇 장 나왔는지 보인다. `HighlightContext`로 River/Meld/공개패에 전파.
- **화료패 미리보기 수정**: (1) `.hand-tile`에 `position:relative`가 없어 툴팁이 타일에
  고정되지 않던 문제 수정. (2) 리치 모드뿐 아니라 텐파이면 어느 패든 hover 시 대기패를 표시.
- **후로없음 깜빡임 제거**: 부로 프롬프트가 떴다가 자동 패스로 지워지던 것을, 프롬프트 수신
  즉시(렌더 전) 패스하도록 변경. 자동화료도 동일하게 즉시 처리. 소켓 콜백은 `settingsRef`로
  최신 설정을 읽는다. 손패는 상대 턴에도 hover되도록 `disabled` 대신 클릭 가드 사용.
- **검증**: 4패키지 타입체크·클라 빌드 통과, 브라우저 실플레이로 툴팁 잘림 해소·손패 hover
  강조(8삭 3장 점등)·화료패 미리보기(9통↔4삭 대기)·액티브 증강 버튼 확인.

## 2026-07-16 (19차 — QoL 개편: 설정·리치 UX·재입장·버그 수정)

실플레이 피드백 반영 — 버그 3건 수정 + 편의 기능·UI 개편

- **버그: 남1국 연장 시 증강 재추첨** (`HanchanController`): southEntry 드래프트가 국 종료마다
  `prevalentWind===2 && roundNumber===1`을 검사해, 남1국 연장(렌짱/본장)으로 라운드 번호가
  유지되면 재추첨되던 문제. `draftedStages` Set으로 스테이지당 정확히 1회만 실행하도록 수정.
- **버그: 대기실 재입장 실패** (`RoomManager`·`HumanAgent`): 대기실에서 나가도(소켓 close)
  유령 에이전트가 슬롯·방장을 붙잡아 재입장/시작이 막히던 문제. `ws.on("close")`에서
  대기 중이면 자리·준비·토큰을 정리하고 방장을 승계(없으면 방 삭제)한다. 게임 중 close는
  기존 재접속 대기 유지(오래된 소켓은 `HumanAgent.isSocket`으로 무시). 서버 테스트 +2.
- **버그: 결과보다 다음 국이 먼저 시작** (`HanchanController`·`RoomManager`·`index`):
  국 종료 후 즉시 다음 국을 시작하던 것을 `interRoundDelayMs`(서버 기본 6000ms,
  `INTER_ROUND_DELAY_MS` 조정 가능) 대기로 완화. DEFAULT는 0이라 테스트·봇 게임은 지연 없음.
- **설정 (자동정렬·자동화료·후로없음)**: 게임 화면 우상단 ⚙ 토글 패널(localStorage 영속).
  자동정렬 OFF → 손패 드래그로 순서 변경(HTML5 DnD). 자동화료 ON → 화료 가능 시 자동 론·쯔모.
  후로없음 ON → 치·펑·깡만 있는 부로 프롬프트 자동 패스(론이 섞이면 사람이 판단).
  자동 액션은 세대 카운터로 수동 조작·새 프롬프트 시 무효화.
- **리치 UX**: (1) 리치 선언 후 버릴 수 없는 손패를 어둡게 처리(자유버림 증강 보유 시 예외).
  (2) 리치 모드에서 패에 마우스를 올리면 그 패로 리치했을 때의 화료패(대기)를 미리 표시 —
  `winningKinds`를 클라이언트에서 계산.
- **액티브 증강 버튼**: 회수·강탈·간파 등 버튼형 발동 증강 전용 버튼(좌하단). 지금 쓸 수 있으면
  활성(여럿이면 목록), 보유했지만 못 쓰면 비활성, 미보유면 숨김. 액션 바에서 증강 액션 분리.
- **상대 증강 툴팁**: 이름표의 증강 pill에 마우스를 올리면 이름·등급·상세 설명 커스텀 툴팁.
- **개막 연출 한글화**: `對局開始`·자풍 표기를 `대 국 시 작`·`동/남/서/북`으로.
- **UI 확대**: 중앙 보드·손패·멜드·이름표·플레이트·액션 버튼 크기 상향(vw 기반이라 좁은 화면 무넘침).
- **검증**: 테스트 261개 통과(서버 +2), 4패키지 타입체크·클라 빌드 통과, 브라우저 실플레이로
  설정 패널·상대 증강 툴팁·대기실 재입장(유령 정리)·UI 확대 확인.

## 2026-07-16 (18차 — 플레이어 대기실 + 통계 시스템)

"진짜 얼마 안 남은" 회차 — 게임 입장 전 대기실과 리치마작 통계 수집을 끝까지 구현

- **플레이어 대기실**: 4명이 모여도 자동 시작하던 흐름을 폐기하고, 첫 사람이 방장이 되어
  방장 외 전원이 준비하면 방장이 게임을 시작하는 상태 기계로 교체. 방장은 빈 자리에
  봇을 넣거나 뺄 수 있다(add/removeBot). canStart = 4인 + 방장 외 전원 준비.
  프로토콜에 `ready·addBot·removeBot·startGame` + `lobby` 메시지 추가,
  `RoomManager.setupWsHandlers`가 대기실/게임 메시지를 라우팅.
- **플레이어 통계 시스템** (`@majak/core/stats/PlayerStats.ts`): GameState를 뒤지지 않고
  **확정 이벤트 스트림만 소비**해 집계(SSOT·리플레이 호환). StatsTracker가
  ROUND_STARTED/TILE_DISCARDED/CALL_MADE/KAN_DECLARED/ROUND_SETTLED를 소비.
  지표: 화료율·방총률·리치율·후로율·쯔모율·평균화료/방총점·평균순위·1위율·연대율.
  후로는 안깡 제외(멘젠 유지), 방총은 국당 1회·더블론이면 잃은 점수 합산.
- **통계 영속화** (`StatsStore.ts`): 계정/DB 없으므로 **닉네임 키** JSON(`replays/stats.json`)에
  누적. 임시파일→rename 원자적 저장 + 직렬 큐(경쟁 방지), 사람만 저장(봇 제외).
  게임 종료 시 이번 판(봇 포함)+누적(사람) 통계를 `stats` 메시지로 전송.
- **클라이언트**: WaitingRoom(동·남·서·북 4자리, 👑 방장·BOT 태그·준비 배지·상대 누적
  전적 칩, 방장은 봇 추가/제거·게임 시작, 그 외는 준비 토글), GameOverModal에 "순위/통계"
  탭 추가(플레이어별 이번 판/누적 통계 그리드), styles.css 대기실·통계 스타일.
- **검증**: 테스트 259개 통과(코어 183 + 콘텐츠 68 + 서버 12 — 신규 19: 통계 core 11·
  대기실/통계 server 8), 4패키지 타입체크·클라 빌드 통과, 브라우저 실플레이로
  대기실(방장·봇3·전적 칩·게임 시작)→개막→테이블→드래프트 흐름 확인.
- 문서: 14_LOBBY_STATS 신규, 12_NETWORK_REPLAY 프로토콜 갱신.

## 2026-07-16 (17차 — Content Pack 30종 + 게임 연출 대개편)

"남은 부분 전부" 회차 — 엔진 확장 훅, 콘텐츠 팩, 게임다운 연출, 시작 플로우 수정

- **게임 시작 버그 수정**: 게임창(테이블 뷰) 전에 증강 드래프트가 뜨던 문제 —
  HanchanController가 gameStart 드래프트 **전에** 첫 뷰를 브로드캐스트하도록 수정 +
  클라이언트도 뷰 없이는 드래프트 오버레이를 그리지 않게 이중 방어.
  입장 → 개막 연출(對局開始) → 테이블 위 드래프트 순서 확립
- **코어 확장 훅** (전부 범용 — 증강별 하드코딩 없음):
  scoring.wrapRuns/totalSets/kokushiMeldAssist (decompose 옵션화),
  win.blockedYaku·win.treatAsDealer·score.extraHan·discard.blockedKinds·
  call.chi.fromAnyone·draw.notenExempt·deal.handSize·turn.direction,
  ROUND_SETTLED.winInfos (역·판·부·점수 상세 — 결과 화면·Interceptor 공용),
  TileKindChanged 이벤트, peek 가시성 + zoneOwner 문맥, PlayerView.augmentView 채널,
  AugmentContext.yaku (커스텀 역 등록), TileDiscarded.riichiDouble 오버라이드
- **버그 수정 (기존)**: 리치 validate가 부로 수를 무시하던 문제 (open_riichi 조합 시
  텐파이 판정 불가) — meldCountOf 반영
- **@majak/content 신설**: 증강 30종 + 테스트 68개 (병렬 에이전트 8조 구현).
  총 카탈로그 37종. 서버 extraAugments 주입, 리플레이 CLI 동일 카탈로그 사용
- **프로토콜 확장**: catalog(증강 id→이름·등급 — 클라 하드코딩 제거),
  roundOver(정산 상세 + 우라도라 + 화료자 공개 손패), PlayerAgent.notify? 추가
- **클라이언트 게임 연출 대개편**: 개막 연출, 론/쯔모/역만 컷인(밴드+슬램),
  국 결과 화면(화료 손패 공개·역 목록 순차 등장·판부·점수·우라도라·점수 변동표),
  WebAudio 합성 효과음 8종(에셋 불필요), 점수 플로팅, 배패 애니메이션,
  증강 정보 패널(봉인·현상금·간파 오름패를 패 이미지로), 17장 손패 대응,
  안개 강(가려진 버림패 뒷면), 등급색 증강 pill, 새 증강 액션 버튼(대상 표시)
- **검증**: 테스트 240개 통과 (코어 172 + 콘텐츠 68), 4패키지 타입체크·클라 빌드 통과,
  봇 반장전 40시드 스위프 실패 0·리플레이 라운드트립 40/40 일치·36종 실전 발동,
  브라우저 실플레이 확인 (입장→드래프트 순서·치 부로·프롬프트·강·정보 패널)
- 문서: 04/09/10/12 갱신 (새 규칙 표·peek/augmentView·프로토콜·확장 지점)

## 2026-07-15 (16차 — Game Table UI Overhaul)

작혼 스타일 게임 테이블 UI 전면 개편 (App.tsx·styles.css 재작성)

- **테이블 레이아웃**: 4방 배치(나=하단, 하가=우, 대면=상, 상가=좌), 중앙 인포 패널
  (장·국, 남은 패산, 본장, 공탁, 도라/우라 표시패), 상대 손패 뒷면 렌더
- **플레이어 배지**: 자풍(東 강조)·점수·리치봉·증강 pill(한글명, 전원 공개), 턴 골드 펄스
- **강(버림패)**: 각자 앞 6열 그리드, 새 패 등장 애니메이션, 최신 버림 글로우
- **액션 바**: 쯔모/론/펑/치/깡/패스 버튼(대상 패 미니 이미지 포함), 리치 모드
  (버튼 → 리치 가능 패만 글로우 → 클릭 선언), 등장 애니메이션
- **연출**: 리치 선언 배너(뷰 전이 감지), 화료/유국 배너, 게임 종료 랭킹 모달,
  드래프트 풀스크린 오버레이(등급색 카드·순차 등장)
- **로비**: 게임풍 조인 화면
- 브라우저 실플레이 검증: 드래프트 → 테이블 → 버림 → 부로 액션 바(치+패 이미지)까지 확인
- client 빌드 통과 (CSS 10.5kB)

## 2026-07-15 (15차 — Tile Images & Visibility Bug Fix)

패 이미지 + 실플레이 중 발견한 심각 버그 2건 수정

- **패 이미지 37장 로컬 저장** (`packages/client/public/tiles/`, majsoul-graph 출처):
  TileFace 이미지 렌더링, 도라·우라 표시패 표시, 커스텀 suit 텍스트 폴백, CSS 비율 80:129
- **버그 1 (심각): 가시성 규칙 프로덕션 미등록** — defineVisibilityRules가 테스트에서만
  호출되어 실게임에서 본인 손패·버림패까지 전부 hidden 폴백. createStandardGame에 등록
  + 실게임 경로 회귀 테스트 추가 (테스트가 자체 등록해서 통과하는 바람에 숨어 있던 버그)
- **버그 2: 뷰 브로드캐스트 주기** — 국 시작/종료에만 전송되어 게임 중 화면이 배패 전
  스테일 상태. runRound에서 배패 직후 + 매 결정 후 브로드캐스트로 수정
- 클라 스테일 드래프트 패널 수정 (prompt 도착 시 자동 닫힘)
- 브라우저 실플레이 검증: 내 손패 14장 이미지+클릭, 상대 hidden, 버림 공개, 도라 표시
- 테스트 169개 통과 (가시성 회귀 1개 추가), core/server TC·client 빌드 통과

## 2026-07-15 (14차 — Promptable Augment Actions & Augment Data)

증강 확장 지점 실증 — "엔진 수정 없이 새 액션" 완성

- **새 프롬프트 액션 훅**: GameEngine.registerTurnOptions + AugmentContext.holderTurnOptions,
  FlowController.turnPrompt가 증강 후보를 validate로 걸러 제시 (프롬프트 진실 = validate)
- **증강 전용 데이터**: GameState.augmentData + AugmentDataSet 이벤트/Reducer (SSOT 유지)
- **discard_recall (회수)**: 차터 대표 예시 구현 — 쯔모패↔자기 버림패 스왑(손패 수 보존),
  게임당 1회. 새 이벤트 RecallPerformed·새 액션 recall을 install에서 등록 (has() 가드)
- **리플레이 보강**: ReplayReader가 AugmentDrafted 시 installAugment → 증강이 추가한
  새 이벤트 타입도 순수 재구성 가능. 봇 게임(922이벤트·4드래프트) 디스크 라운드트립 확인
- 표준 증강 6→7종, 전체 테스트 168개 통과 (Augment 15→19), 타입체크·서버 부팅 확인
- **10 §6의 "프롬프트되는 새 Action" 한계 해소** — 차터 핵심(엔진 수정 없이 확장) 완전 실증

## 2026-07-15 (13차 — Reconnect Restore & Server Tests)

재접속 뷰 복원 + 서버 자동 테스트

- **재접속 뷰 복원**: HumanAgent가 마지막 PlayerView와 대기 중 프롬프트/드래프트를
  캐시했다가 재접속(reconnect) 시 새 소켓으로 즉시 재전송 (기존 MVP 스텁 해소)
- **서버 통합 테스트 신설**: `packages/server/test/RoomManager.test.ts` — FakeSocket으로
  참가·자리배정·봇게임 완주(gameOver 4인 순위)·재접속 복원을 자동 검증 (4개)
- **정리**: RoomManager gameOver의 죽은 코드(ServerMessage를 handleMessage에 전달)·이중
  전송 제거, HumanAgent.notify() 공개 API로 대체
- **빌드 인프라**: @majak/core exports에 `"./*.js"` 패턴 추가 — vitest(vite)가 서버의
  `@majak/core/…js` 서브패스를 해석하도록 (tsx는 되지만 vite는 실패하던 문제)
- 전체 테스트 164개 통과 (서버 4개 신규), 타입체크·빌드·서버 부팅 확인

## 2026-07-15 (12차 — Replay Streaming Fix & Runtime Verify)

리플레이 실질 동작 복구 + 서버 스택 런타임 검증

- **버그 수정**: HanchanController가 리플레이 로그에 `__init__`만 남기고 실제
  진행 이벤트를 방출하지 않던 문제 발견·수정 (eventLog 커서 스트리밍). 리플레이
  기능이 껍데기였음이 라운드트립 테스트로 드러남
- **테스트 추가**: 이벤트 로그만으로 최종 점수·드래프트 재구성하는 라운드트립
  테스트(Hanchan.test.ts) — seq 연속성·이벤트 다수 존재까지 검증
- **런타임 검증**: 실제 서버 클래스로 (1) 봇 게임→디스크 리플레이→되읽기 일치,
  (2) WS 서버 부팅→사람 클라이언트가 봇 3명과 반장전 완주→순위 수신,
  (3) 서버가 쓴 1946-이벤트 리플레이를 CLI로 재구성해 점수 일치
- **결정론 보강**: BotAgent 드래프트 픽을 Math.random→시드 PRNG로 교체
- 전체 테스트 160개 통과, core/server 타입체크·client 빌드 통과

## 2026-07-15 (11차 — Client Interaction UX)

클라이언트 조작 UX 개선

- **손패 액션**: discard/riichi Prompt를 손패 타일 클릭 UI로 연결
- **액션 패널**: 비타일 액션만 별도 버튼으로 유지해 선택 노이즈 감소
- **반응형 확인**: desktop 3열, mobile 1열 레이아웃 수평 오버플로 없음
- **검증**: client typecheck 통과, client production build 통과, 전체 테스트 159개 통과

## 2026-07-15 (10차 — Public Tile Metadata)

PlayerView 공개 패 메타데이터 추가

- **Information**: `PlayerView.tiles`에 공개된 tile id의 `kind`/`attrs` 제공
- **보안**: 숨겨진 손패의 tile metadata가 타인 뷰에 포함되지 않도록 테스트 추가
- **Client**: TileId 대신 `5m`, `E`, `赤5p` 같은 패 이름 표시
- **검증**: client production build 통과, core typecheck 통과, 전체 테스트 159개 통과

## 2026-07-15 (9차 — Server Smoke Docs)

서버 smoke test와 로컬 실행 문서

- **검증**: `PORT=3101 npm run dev -w @majak/server` 실행 후 WebSocket join smoke 확인
- **Smoke 결과**: `joined`와 `draftOffer` 수신 확인 (`smoke-bot` 방)
- **문서**: 12_NETWORK_REPLAY에 로컬 실행 명령과 smoke 절차 추가
- **검증**: server typecheck 통과, client production build 통과, core typecheck 통과, 전체 테스트 158개 통과

## 2026-07-15 (8차 — Client MVP Scaffold)

클라이언트 MVP 스캐폴딩

- **@majak/client**: React + Vite 패키지, 첫 화면, WebSocket 연결, PlayerView/Prompt/Draft UI 추가
- **프로토콜 연동**: 서버 `join`, `action`, `draftPick` 메시지 송신과 주요 ServerMessage 수신
- **루트 스크립트**: `dev:client`, `dev:server` 추가
- **검증**: client production build 통과, core typecheck 통과, 전체 테스트 158개 통과

## 2026-07-15 (7차 — Implementation Guide)

구현 가이드 작성

- **99_IMPLEMENTATION_GUIDE**: 빠른 시작, 수정 위치 지도, Rule/Action/Event/Augment/Information 체크리스트 작성
- **검증 기준**: 변경 규모별 테스트 기준과 현재 남은 큰 작업 정리
- **상태 갱신**: 99_IMPLEMENTATION_GUIDE 완료 처리

## 2026-07-15 (6차 — Rule System Docs)

Rule System 문서 정리

- **04_RULE_SYSTEM**: 실제 구현 기준으로 RuleRegistry 동작, Layer, Context, 표준 Rule 목록 정리
- **확장 절차**: 새 Rule 추가 절차와 테스트 기준 추가
- **상태 갱신**: 04_RULE_SYSTEM 완료 처리

## 2026-07-15 (5차 — Content Pipeline)

콘텐츠 제작 가이드 보강

- **13_CONTENT_PIPELINE**: Rule 추가, Prompt 필요 콘텐츠, 테스트 기준, Public API 체크리스트 추가
- **문서 동기화**: 드래프트 공개 방식, 깡 도라 타이밍 룰, PlayerView 후리텐 사유 반영
- **검증**: core typecheck 통과, 전체 테스트 158개 통과

## 2026-07-15 (4차 — Kan & Abortive Draw)

깡 + 도중유국 콘텐츠 안정화

- **깡 흐름**: 안깡/대명깡/가깡, 신도라, 영상쯔모, 가깡 창깡 reaction 연결
- **깡 도라 타이밍**: `dora.kanTiming`으로 즉시 공개/깡 후 버림 뒤 공개 선택 가능
- **리치 중 안깡**: 마지막 쯔모패 포함 + 대기 불변 조건이면 허용
- **안깡 창깡**: 국사무쌍에 한해 론 프롬프트 제공
- **후리텐**: 기본/일시/리치 후리텐 판정 반영
- **PlayerView**: 본인 뷰에 후리텐 사유(`discard`/`temporary`/`riichi`) 세분화
- **채점 플래그**: 영상개화(`rinshan`)와 창깡(`chankan`)이 WinContext로 전달됨
- **도중유국**: 구종구패, 사풍연타, 사깡유국, 사인리치, 트리플론 처리 반영
- **문서**: 11_GAME_FLOW와 PROJECT_STATUS를 구현 상태에 맞게 갱신
- **검증**: core typecheck 통과, 전체 테스트 158개 통과

## 2026-07-15 (3차 — Network & Replay)

12_NETWORK_REPLAY 구현 완료

- **설계**: `docs/12_NETWORK_REPLAY.md` 작성 (메시지 스펙, PlayerAgent 분리, 반장전 루프 로직)
- **공유 스펙**: `@majak/core/network/protocol.ts`
- **매치 엔진**: `@majak/core/match/HanchanController.ts` — 남장 4국, 서입, 우마/오카 정산 루프
- **서버 패키지 스캐폴딩**: `@majak/server` 생성 (TypeScript + ws)
- **에이전트**: `BotAgent` (규칙 기반 단순 봇), `HumanAgent` (WebSocket 래퍼, 30초 타임아웃)
- **룸/서버 관리**: `RoomManager` (연결/재접속, 봇 채우기), `ReplayWriter` (JSONL 기록)

## 2026-07-15 (2차 — Information System)

프로젝트 부트스트랩

- 4개 미정 사항 확정: 백엔드(Node.js+TS), 코드 위치(newMajak), 드래프트(개인별 3지선다), 봇(MVP 포함)
- 00_MASTER_ARCHITECTURE 작성 (패키지 구조, 파이프라인, Rule Layer, Zone, Information Layer, PlayerAgent)
- npm workspaces 모노레포 스캐폴드 + git 초기화
- @majak/core 구현 시작: RuleRegistry, Prng, GameEvent (테스트 13개 통과)
- Issue 001 해결, Issue 004 신규 등록

기본 룰 확정 (같은 날)

- 01_GAME_RULES 작성: 반장전, 적도라 3, 쿠이탄 허용, 25000/30000 우마 10-20, 역 목록·점수표
- **차터 1.1 수정**: 증강 획득 "매 국 2회" → "게임 시작 + 남장 진입, 총 2개" (사용자 결정)

Tile/Zone/GameState 설계·구현 (같은 날)

- 증강 공개 방식 확정: 전원 공개 (사용자 결정)
- 07_TILE_SYSTEM 작성: id/kind 분리(Issue 002 해결), Zone 일반화, moveTiles 단일 원시 연산
- 03_GAME_STATE 작성: 게임/국 단위 상태 분리, JSON 직렬화 원칙, 스냅샷=리플레이
- 구현: Tile(표준 136장+적도라), Zone·moveTiles, GameState·setupRound(배패) — 테스트 38개

Effect System 설계·구현 (같은 날)

- 05_EFFECT_SYSTEM 작성: Interceptor(수정/취소/대체) + Reaction(방출) 2훅 구조
- Issue 004 해결: maxChainDepth+maxEventsPerRoot 이중 한도, 예외 시 Action 거부·상태 원복
- 구현: EffectRegistry, EventProcessor — 테스트 53개 (15개 추가)

Core Engine + Action System 완성 (같은 날) — **Phase 2 완료**

- 02_CORE_ENGINE·06_ACTION_SYSTEM 작성: submit 트랜잭션, 거부/예외 이중 실패 의미론,
  콘텐츠 등록 지점 4종(rules/effects/actions/reducers), DecisionPrompt는 11과 함께
- 구현: GameEngine, ActionRegistry, ReducerRegistry, TilesMoved(표준 이벤트 1호)
- 통합 테스트: 실제 배패 상태에서 discard 액션 + 증강 4종(봉인·취소·콤보·폭주) 관통 — 테스트 64개

Mahjong 채점 엔진 완성 (같은 날) — **Phase 3 완료**

- 08_MAHJONG_ENGINE 작성: 채점 변형(분해×화료패 위치), 역 등록형 원칙
- 구현: decompose/waits/WinContext/YakuRegistry/standardYaku(역 41개)/fu/score/dora/evaluate
- 스안커 쯔모 vs 론(산안커+또이또이) 구분, 량페코>치토이 해석 선택, 셈수 역만까지 검증
- 테스트 95개 통과 (31개 추가)

Game Flow 완성 (같은 날) — **Issue 003 해결, 설계 이슈 전건 종결**

- 11_GAME_FLOW 작성: 페이즈 전이도(데이터), FlowController 프롬프트 유도 원칙
- 구현: 진행 이벤트 10종, 표준 액션(discard/riichi/win/call/kan/abort)+시스템 액션, FlowController, createStandardGame
- 봇 4명이 한 국을 자동 완주 (화료·유국 모두), 리치/론/후리텐/펑/깡 시나리오 검증
- 상태 추가: lastDiscard·lastDrawnTile·lastDrawRinshan·chankan·후리텐 상태·goAroundBroken
- 테스트 105개 통과 (10개 추가)

Information System 구현 (같은 날) — **09_INFORMATION_SYSTEM 완료**

- 09_INFORMATION_SYSTEM 작성: VisibilityRule 4종, PlayerView 구조, buildPlayerView 설계, 증강 결합 방식, 관전자 지원, 우라도라 처리
- 구현: `packages/core/src/information/PlayerView.ts`
  - `VisibilityRule`: public/owner/hidden/count_only
  - `defineVisibilityRules()`: 표준 5종 등록 (hand→owner, discards/melds→public, wall/deadWall→hidden)
  - `buildPlayerView(state, viewerId, rules, options?)`: GameState → PlayerView 필터링
  - `SPECTATOR_ID("__spectator")`: 모든 Zone이 public으로 처리되는 관전자 뷰
  - 미정의 Zone kind → hidden 폴백 (안전 기본값)
  - byPlayer: 본인=전체 공개, 타인=리치/더블리치 여부만
  - 우라도라는 options.uraDoraIndicators로 화료 정산 후 전달
- 증강 연동: `setHolderRule("visibility.hand", "public")` 패턴으로 엔진 수정 없이 가시성 변경
- 기존 120개 + 신규 23개 = **테스트 143개 통과**

## (초기)

초기 프로젝트 생성

- PROJECT_CHARTER 작성
- 프로젝트 방향성 확정
- 증강 등급 정의
- 문서 구조 설계

---

# AI 작업 규칙

새로운 AI는 항상 아래 순서로 작업한다.

1.

PROJECT_CHARTER를 읽는다.

2.

PROJECT_STATUS를 읽는다.

3.

현재 진행 중인 작업을 확인한다.

4.

관련 설계 문서를 읽는다.

5.

새로운 설계를 제안한다.

6.

구현한다.

7.

관련 문서를 수정한다.

8.

PROJECT_STATUS를 업데이트한다.

---

# 문서 수정 규칙

새로운 기능이 추가되면

반드시

아래 항목을 함께 수정한다.

- 구현 상태

- 문서 상태

- 최근 변경사항

- 현재 우선순위

- 알려진 이슈

즉

PROJECT_STATUS는

항상 프로젝트의 최신 상태를 반영해야 한다.

---

# 장기 목표

최종적으로

이 프로젝트는

"증강을 자유롭게 추가할 수 있는 웹 기반 리치마작 엔진"

을 완성하는 것을 목표로 한다.

새로운 증강은

엔진 수정 없이

데이터 등록만으로 추가 가능한 구조를 지향한다.
