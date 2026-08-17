# PROJECT_STATUS
Version : 0.4
Status : Active

Last Updated : 2026-07-29 (봇 재작성)

---

# 프로젝트 진행률

Overall Progress

███████████████████░ 95%

※ 진행률은 코드 구현뿐 아니라 설계 문서까지 포함한다.

---

# 현재 목표(Current Milestone)

현재 목표

- **증강 도파민 리디자인 — 52차 계획 전 단계 완료** (54차, 2026-07-22).
  ①등급 폐기 ②사운드 ③연출 톤 ④패 선택형 모달 소급 ⑤기존 증강 버프 22종 ⑥신규 16종까지 전부 반영.
  콘텐츠 카탈로그 **65종**(+표준 4 = 69종), 테스트 602개 통과.
- **다음**: 16_AUGMENT_REDESIGN §2 백로그 — 2026-07-23 사용자 전수 판정으로 **92종 → 대기 30종**
  (69종 폐기 + 사용자 발안 신규 7종 추가). 밸런스 수치는 **docs/17_AUGMENT_BALANCE.md**가 단일 진실.
  **신규 증강 제안은 전부 Prism급 기준, 등급 하향은 사용자 조정.** 반려 기록·설계 교훈 4칙은 16 §3.
- **증강 파워 티어 + 드롭 확률 (2026-07-26)**: 108종 전수 파워 평가(타점·속도·무대응·빈도) →
  **`packages/core/src/augment/powerTier.ts`가 단일 진실**, 사람이 읽는 사본은 **docs/20_AUGMENT_POWER_TIER.md**.
  관리자 홈에 **실시간 티어표**(카탈로그 × 티어 조인, 미분류 노출) 추가.
  같은 패스에서 밸런스 8종 하향·용어 2건 정리. **파워 티어 기반 가중 추출은 적용됐다**
  (2026-08-18 확인) — `AugmentRegistry.rollFrom`이 `POWER_TIER_WEIGHT`(SS+ ×0.15 … D ×1.20)로
  비복원 가중 추출을 한다. 코드 주석에 "예전에는 정의만 돼 있고 드래프트 어디에서도
  읽히지 않았다(docs/25 최우선#10)"는 해소 경위까지 남아 있다.
- **드래프트 다양성 (2026-07-26)**: 좌석별 서로 소인 후보 칸 + 게임 내 중복 금지 →
  같은 스테이지에 남과 겹치는 제시 **38.2% → 0%**(108종·500게임 실측). 설계는 docs/10 §3.
- **증강 2종 조합 감사 + 1차 수정 (2026-07-27, 60차)**: 104종 전 쌍(5,350) 자동 대국으로
  크래시·소프트락 0건을 확인하고, 수동 실측으로 하드락·과시너지·역시너지 18건을 찾았다.
  보고서는 **docs/21_AUGMENT_PAIR_AUDIT.md**, 엔진 계약은 **docs/10 §7**이 단일 진실.
  고친 것: ①**정산 단계**(`settleStages.ts`) 도입 — 정산 인터셉터 순서가 tier·드래프트 픽
  순서에 끌려가던 문제 해소(역만 방어술이 한 번도 발동 안 하던 버그 포함)
  ②**무장해제가 진짜 무효화**로 승격(액티브 버튼 + 물리 상태 복구, `AugmentDisarmed`)
  ③진짜 용 × 절벽 위에 피어난 꽃/밑장빼기 공존(`PlayerView.scoringOptions` 신설)
  ④리치 봉인 우회 2건 차단 ⑤스텔스 리치 ↔ 리치 봉인 배제
  ⑥무너진 국경(슌쯔)/동수의 결속(커쯔) 역할 분리 ⑦일확천금 = 국 첫 순 한정 + 확률 재조정
  ⑧**리치 봉인 = 리치를 지고 있는 동안만 유효**(풀면 해제 — 공성계+손바닥 뒤집기 무비용 조합 차단).
  회귀 `packages/content/test/pair_fixes_60.test.ts`(28개).
  **남은 것**: ~~뚫린 천장 × 판수 증강의 지수 폭발~~ → **원인 오지목이었고 지수 폭발은 이미 해소**
  (`aotenjou_ceiling.ts:55-59`가 만관 위로 선형. 890판 실측 기여 +15~17%). 다만 **"첫 국에 게임 종료"
  증상은 남아 있으며 주 동력은 `jackpot` ×3의 뱅크 발행이다** — 측정 최대 한 방 126,000점(시작 25,000).
  이건 밸런스 판정 대기 항목이지 버그가 아니다. 상세는 docs/24 §기존 미해결.
  리치 봉인 완화안 판정.
- 리플레이 뷰어 UI / Save(이어하기)

완료

- ✅ 플레이어 대기실(방장·준비·봇 채우기) — 2026-07-16 (18차)
- ✅ 플레이어 통계 시스템(리치율·후로율·방총률·화료율·평균순위 등) — 2026-07-16 (18차)
- ✅ 관리자 증강 테스트(샌드박스) 게임 — 2026-07-22 (49차, docs/15 §5c)

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

- 패 분해(표준형/치또이/국사) + 텐파이·대기 계산 ✅
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
| PROJECT_CHARTER | ✅ (1.2 — 도파민 우선 원칙·노잼 금지 조항, 48차) |
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
| 10_AUGMENT_SYSTEM | ✅ (1.2 — §0 리트머스 · §2 등급 폐기 완료 · §6 52차 신규 훅 7종) |
| 11_GAME_FLOW | ✅ (깡·도중유국·일시/리치 후리텐 구현 반영) |
| 12_NETWORK_REPLAY | ✅ (대기실·통계 + 증강 테스트 메시지 반영, 49차) |
| 13_CONTENT_PIPELINE | ✅ (기본 작성 완료, 확장 예시 보강 여지) |
| 14_LOBBY_STATS | ✅ (대기실 + 통계 시스템 — 18차 신규) |
| 15_ACCOUNTS_SITE | ✅ (계정·방코드·리플레이·관전 — 20차 신규 · 보안 리뷰 §8 · 증강 테스트 §5c 49차) |
| 16_AUGMENT_REDESIGN | ✅ (도파민 리디자인 — 판정·백로그 **대기 30종**(56차 69종 폐기+신규 7종) · §1d 52차 ④⑤⑥ 반영) |
| 17_AUGMENT_BALANCE | ✅ (**56차 신규** — 증강 99종 난이도·사기성·도파민·신박함·추가 점수 수치화 + 전수 점검) |
| 17_DESIGN_ASSETS | ✅ (외주 디자이너 발주 명세 — 전 화면 에셋 물량·규격) |
| 18_UI_REDESIGN_BRIEF | ✅ (이원 연출 브리프 + **§10 방향별 두께 패 4종** — 원근/틸트 폐기, 문서만·미구현) |
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
- `packages/core/src/engine/state/GameState.ts` — 상태 구조·초기화·국 준비(배패). **버그 수정(2026-07-20): `setupRound`가 국마다 `state.tiles`를 표준 세트로 재생성 — 지난 국 증강의 패 변형(단색 세계 색통일·conjured 보라 이펙트·붉은 손길 적도라 등)이 다음 국으로 새던 문제. 패 id는 게임 내 0~135 재사용이라 리셋 안 하면 능력 미사용 국에도 변형 잔류. `GameState.redFivesPerSuit`(생성 시 고정)로 원본 재생성 → 리플레이 결정성 유지.**
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
- `packages/core/src/mahjong/scoring/decompose.ts` — 분해 전체 열거 (슌쯔 suit 파라미터화)
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
- `packages/core/src/mahjong/flow/FlowController.ts` — 프롬프트 유도·후로 우선순위·정산
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

✅ 70종 (2026-07-22, 48차 도파민 리디자인에서 패시브 보너스 28종 삭제)

- 콘텐츠 70종 (Silver 12 / Gold 28 / Prism 30, 동풍전 템포 변형 2종 포함) + 표준 4 = 카탈로그 74종
- **48차(2026-07-22) 삭제 31종** — 순수 패시브 점수/판 보너스. 콘텐츠 28종(현상금 6·미식가·
  극악무도·리치봉 수집가·노텐 보험·본장 수집가·이번 국의 주인·후발 주자·흐름·붉은 손·욕심·
  도라 헌터·편식·강심장·부수 장인·침착함·부르는 게 값·천천히 꾸준히·역전극·선봉2종·
  일촉즉발·심판) + 표준 3종(가벼운 선언·쯔모의 기쁨·설욕). `yakuBountyBonus` 헬퍼도 제거.
  판정·근거는 docs/16_AUGMENT_REDESIGN.md §1. 과거 리플레이 호환은 사용자 결정으로 포기.
- 35차 신규 5종: (Gold) 일촉즉발(imminent — 리치 후 3순 이내 화료 +2판)·심판(judgment —
  유국 텐파이료 2배)·천하무적(invincible — 게임 내내 방총 0이면 최종 정산 반장 +8000/동풍 +4000,
  첫 드래프트 한정) / (Prism) 카르마(karma — 방총으로 잃은 점수를 최종국 화료 시 전액 회수)·
  시간 정지(time_stop — 2국당 1회 쯔모+버림 추가 턴).
  **시간 정지는 코어 수정 없이** TURN_PASSED 인터셉터로 다음 자리를 보유자로 되돌려 추가 턴을
  구현한다(리액션에서 armed 해제로 무한루프 방지, 남이 울면 armed 유지→다음 자기 버림에 발동).
  회귀: `packages/content/test/new_batch_0719_sweep.test.ts`(5종 크래시 스위프 + 추가 턴 실증).
- 29차 신규 27종: (Silver) 강심장·부수 장인·곁불·미식가·네 개의 기둥·번개손·출사표·
  레이즈 선언·이면투시·무르기 / (Gold) 숨은 칼날·염색·지뢰 매설·덤터기·도라 옹립·
  번개 계약·모방범·외길 계약·판돈 굴리기 / (Prism) 연금술사·핏빛 계약·뚫린 천장·
  가불 인생·모 아니면 도·만년 오야·금단의 족보·날치기.
  코어 신규 훅 1종(`score.finalAdjust` — 게임 종료 정산 보정). ※ 48차 무페널티 스윕으로
  위약금·상환이 전부 삭제돼 현재 이 훅을 쓰는 증강은 없다(훅 자체는 유지).
  보류 2종(후속): 천라지망(sky_net — 상대 쯔모를 로브하는 프롬프트)·그림자 선언
  (shadow_riichi — PlayerView 리치 은닉)은 코어 흐름/정보 계층 확장이 필요해 미구현.
- cliff_bloom(절벽 위에 피어난 꽃): 안깡만 → 안깡·가깡·대명깡 전 종류 지원으로 확장.
  대명깡은 리액션 커스텀 콜인데 코어 FlowController가 `minkan`만 영상패를 뽑아, 리액션
  커스텀 콜이 `KAN_DECLARED(kan_open)`를 내면 영상패를 뽑도록 일반화(sys.drawRinshan).
- 모든 증강은 **본인에게만 이점** 원칙 — 전원 영향 증강(reverse_world) 제거,
  riichi_market은 본인 전용 리치봉 보너스로 개편 (21차)
- 판·점수 보너스 증강은 `util.ts`의 addHanBonus/addWinPointBonus/yakuBountyBonus 헬퍼 기반

- `packages/content/src/augments/*.ts` — 증강 1종 = 파일 1개, 코어 등록 API만 사용
- Silver: yaku_bounty(현상금)·gokuakumudo(극악무도)·riichi_market(리치봉 시세, 본인 전용)·
  noten_insurance·honba_collector·red_five_touch(아카도라)
  + **현상금 사냥꾼 계열 6종**(탕야오·리치·역패·삼색·혼일색·또이또이 — 특정 역 화료 시 상금)
- Gold: slow_steady(6순마다 +1판)·furo_master(후로 +1판)·promise_next(기약 스택)·
  riichi_upgrade(더블/트리플)·free_riichi_discard(리치 후 자유 버림 3회)·
  peek_riichi_waits(오름패 간파)·xray_hand(투시 무작위 3장)·rinshan_preview(영상 정찰)·
  hidden_river(안개 바닥)·yakuman_shield(역만 방어)·omni_chi(사방치기)·pseudo_dealer(오야 찬탈)
- Prism: suit_unify(수패 통일)·hand_swap3(등가교환 — 내가 고른 3장↔상대 무작위 3장)·full_hand_swap(손패 통교환)·
  discard_lock(봉인술사)·tanyao_break(탕야오 해방)·open_kokushi(우는 국사)·
  broken_wall(순환 슌쯔)·seat_swap(자리 바꿈)·future_sight(미래 보기)·
  rinshan_gamble(도박사의 손)·true_dragon(5멘쯔 17장, +3판)·
  **jackpot(일확천금 — 정산 ±2배)·big_hand(큰손 — 화료 만관 보장)·
  late_bloomer(대기만성 — 남4국부터 획득 3배, gameStart 드래프트 전용)·
  parasite(기생충 — 숙주 이득의 절반 강탈, 국마다 새로 지정)**
- Gold 신규(22차): **die_hard(죽기살기 — 게임당 1회 0 미만 피해를 0에서 버팀, 도비 방지)**
- 신규(28차):
  - **vanguard(선봉, Gold — 동장 화료 1.5배 / 타장 0.75배, ROUND_SETTLED 인터셉터)**
  - **nagashi_yakuman(유국역만, Prism — 유국 시 버림 전부 요구패+미콜이면 유국만관을 역만으로 지불)**
  - **cliff_bloom(절벽 위에 피어난 꽃, Prism — 2국당 1회 액티브: 안깡 후 영상패를 대기패로 치환해 영상개화 확정)**
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
- `packages/core/src/augment/standardAugments.ts` — 표준 4종 (48차에 패시브 3종 삭제)
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
- 본인 뷰 봉인 패 노출: `PlayerRoundView.sealedKinds` — discard.blockedKinds 규칙 해석
  결과(kindKey 목록)를 본인(관전자는 전원)에게 포함 (28차, 클라 🔒 표시·봉인 배너용)
- 증강 연동: RuleRegistry Modifier 하나로 가시성 변경 (엔진 수정 불필요)
- 미정의 Zone kind → hidden 폴백 (커스텀 Zone 안전 기본값)
- 공개된 패에 한해 tile kind/attrs metadata 제공
- 테스트 25개 (PlayerView.test.ts)

## AI

상태

✅ 규칙 기반 봇 — 샹텐·수비·성격까지 (2026-07-29 재작성)

- `packages/core/match/PlayerAgent.ts` — PlayerAgent 인터페이스 (사람/봇 공통)
- `packages/server/src/BotAgent.ts` — 화료 → 액티브 증강 → 깡 → 후로 → 리치 → 버림 순으로 판단.
  각 판단은 `packages/server/src/bot/`에 분리돼 있고, 매 결정마다 만드는 판 읽기 스냅샷
  (`read.ts`: 샹텐·대기·도라·잔여 장수·상대 위협)을 공유한다.
  - `discard.ts` — 버린 뒤의 샹텐/우케이레 + 도라 손실 + 노리는 역 + 안전도를 **밀기/접기**
    비율로 합성. 리치는 죽은 대기·후리텐·패산 고갈·고타점 다마텐일 때 참는다.
  - `call.ts` — 샹텐이 실제로 줄고 화료할 역이 있을 때만(역패 펑 예외). 종반엔 형식텐파이.
  - `kan.ts` — 손이 상하지 않을 때만. 남이 리치 중이면 새 도라를 열어 주지 않는다.
  - `danger.ts` — 현물·스지·노찬스·자패 잔여 장수로 안전도 0~1 (공개 정보만).
  - `profile.ts` — 시드에서 뽑는 공격성·후로 문턱·리치 성향·생각 시간(봇마다 다르게).
- 샹텐·우케이레 계산기는 코어(`mahjong/scoring/shanten.ts`) — 증강 봇 정책도 함께 쓴다.
- 회귀 테스트: `server/test/BotAgent.test.ts`(실게임 리치·화료·후로 발생),
  `BotPlay.test.ts`(판단 경계), `BotAgentKan.test.ts`, `core/test/Shanten.test.ts`.
- `packages/server/src/HumanAgent.ts` — WebSocket 클라이언트 연결, 30초 타임아웃 처리

## Client

상태

✅ 대기실 + 게임 연출 + QoL + 리플레이 뷰어 + WS 자동 재연결 완비 (2026-07-16)
   + 타격감(Juice) 강화 — 화면 흔들림·임팩트 플래시·파티클·리치 풀연출·레이어드 효과음 (2026-07-19, 32차)

- **QoL(19차)**: 설정 패널(자동정렬·자동화료·후로없음, localStorage), 손패 드래그 정렬,
  리치 후 잠긴 패 딤 처리 + 리치 대기패 hover 미리보기, 액티브 증강 전용 버튼,
  상대 증강 hover 툴팁, 개막 연출 한글화, 전체 UI 확대
- **대기실(WaitingRoom)·게임 종료 통계 탭** (18차)
- 개막 연출·컷인(론/쯔모/역만)·국 결과 화면·효과음·증강 정보 패널 (17차)
- 증강 이름·등급은 서버 catalog 메시지에서 수신 (하드코딩 제거)

- `packages/client` — React + Vite 패키지 추가
- WebSocket join/reconnect token 저장, `view`/`prompt`/`draftOffer`/`gameOver` 수신
- PlayerView 기반 손패·버림패·후로·플레이어·라운드 상태 표시
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

증강 도파민 리디자인 (16_AUGMENT_REDESIGN §4) — 개편 21종 종결(잔여 `aotenjou_ceiling` 1종),
다음은 백로그 대기 30종. 착수 순서·조정 대상은 17_AUGMENT_BALANCE §3.

Priority 3

Save/이어하기(서버 재시작 후 진행 게임 복구) — 코어 resume/reconstructGame은 구현·테스트됨
(Resume.test.ts). 서버 자동 저장·복구 배선만 남음(설계 결정 필요, 15 §11).
※ 세션 만료·게임 포기(20d차)·WS 자동 재연결(20e차) 완료

Priority 4

~~reaction 페이즈 프롬프트 확장 훅~~ ✅ 완료(24차 — registerReactionOptions).
App.tsx 파일 분리 리팩토링(~3,000줄)만 여지로 남음.

---

# 최근 변경사항

## 2026-07-29 (봇 재작성 — 샹텐·수비·성격, 그리고 폴드 계열 증강 해금)

봇이 "규칙은 아는데 마작은 모르는" 상태였다. 버림은 이웃 유무만 보는 한 줄짜리 휴리스틱
(`keepValue`)이었고 **수비 개념이 아예 없어서**, 남이 리치를 걸어도 자기 효율만 보고 위험패를
던졌다. 후로는 손이 한 발짝도 나아가지 않아도 불렀고, 리치는 대기가 죽었든 후리텐이든 무조건
걸었다. 사람 눈에 가장 크게 걸리던 그 셋을 판단 구조부터 새로 짰다.

**① 판 읽기 분리** — `packages/server/src/bot/`. 매 결정마다 뷰 하나로 판을 한 번 읽고
(`read.ts`: 샹텐·대기·도라·잔여 장수·상대 위협) 네 판단이 나눠 쓴다. 예전엔 판단마다 텐파이를
다시 계산해 같은 일을 서너 번 했다 — 실측으로 **봇 10판이 98.6초 → 45.7초**로 줄었다.

**② 샹텐·우케이레 계산기를 코어에** — `core/mahjong/scoring/shanten.ts`(표준형·치또이·국사,
무늬 그룹별 메모이제이션). 봇의 타패·후로·깡 판단과 증강 정책이 함께 쓴다.

**③ 수비(베타오리)** — `bot/danger.ts`. **현물·스지·노찬스·자패 잔여 장수**로 안전도 0~1을 내고,
위협도 × 내 손의 완성도·값어치·성격으로 **밀기/접기 비율**을 정해 효율 점수와 섞는다.
공개 정보(버림패·후로·도라 표시패)만 쓴다 — 정보 비대칭을 깨지 않는다.

**④ 후로·리치·깡 판단 교체** — 후로는 **샹텐이 실제로 줄고 화료할 역이 있을 때만**(역패 펑만 예외,
종반엔 형식텐파이). 멘젠 텐파이를 스스로 열지 않는다. 리치는 기본이 "건다"이되 죽은 대기·후리텐·
패산 고갈·고타점 다마텐·남의 리치에 맞선 싸구려 나쁜 대기는 참고, 선언패는 **가장 넓은 대기**를
남기는 쪽으로 고른다. 깡은 남이 리치 중이면 새 도라를 열어 주지 않는다.

**⑤ 성격** — `bot/profile.ts`. 시드에서 공격성·후로 문턱·리치 성향·생각 시간 배율을 뽑아
봇마다 다르게 둔다(결정론 유지). 생각 시간도 매번 흔들리고 후로·리치는 조금 더 끈다.

**⑥ 증강 사용** — `BotDecisionContext`에 판 읽기(shanten·waits·turn·wallLeft·threat·remaining·
safety)를 실었다. 그 덕에 오래 `BOT_UNUSABLE_AUGMENTS`에 묶여 있던 **폴드 계열 4종**
(자유 선언·승부수·손바닥 뒤집기·장사진)에 정책이 붙어 예외가 9종 → 5종으로 줄었다.
손 재구성 증강 4종(밥상 뒤엎기·개벽·짝수의 세계·통째로 바꾸기)의 게이트도 고립패 근사에서
샹텐(`handIsPoor`)으로 바꿨다 — 예전엔 **국사 텐파이 배패마저 "고립패 13장"으로 읽혀 엎었다.**

**실측**(봇 4명 반장전 10시드, 증강 미발동 기준): 방총 0.70 → **0.61**/국, 유국 0.18 → **0.16**,
화료 0.82 → **0.84**, 후로 1.77 → **1.61**(선별적), 리치 1.17 → **1.26**.

**테스트** — 전체 **981개 통과**. 신규: `core/test/Shanten.test.ts`(샹텐·우케이레 정답),
`server/test/BotPlay.test.ts`(타패·수비·리치·후로 경계 19개, 장면 조립기 `botTestView.ts`),
`content/test/bot_policy_defense.test.ts`(해금된 4종의 발동 경계).
문서: docs/00 §5.4(봇 판단 구조 표), docs/08 §1(shanten.ts), docs/10 §6(4차 폴드 계열 해금).

## 2026-07-27 (동수의 결속 — 혼색 커쯔 후로 채점 버그 2건)

**계기** — 사용자 제보: "동수의 결속으로 혼색 커쯔 또이또이를 노렸는데 역없음이 뜬다."
원인은 분해가 아니라 **후로 → 채점 몸통 변환**(`WinContext.meldToSet`)에 있었다.

- **① 혼색 깡이 슌쯔로 오분류** — 바람의 계보(동남서북 깡)·장사진(4연속 깡)을 커쯔로
  세지 않으려는 가드가 `kindKey` 비교라, **랭크는 같고 무늬만 섞인 깡**(동수의 결속의
  4만4통4삭4만)까지 슌쯔성 몸통으로 내보냈다 → 또이또이·산안커가 통째로 증발,
  다른 역이 없으면 **역없음**. 판정 기준을 kind → **랭크**로 바꿨다.
- **② 혼색 펑이 대표 3장으로 뭉개짐** — `tiles: [first, first, first]`가 2만2통2삭 펑을
  2만2만2만으로 복제해 **청일색·혼일색·삼색동각이 헛성립**했다(실측: 손패 전부 만수 +
  1만1통1삭 펑 → 청일색). `tripletRepr`로 서로 다른 kind를 보존한다(순수 커쯔는 종전과 동일).
- **③ 양극의 1·9 혼합 깡도 커쯔로** (사용자 판단) — 양극은 펑 한정 규칙이지만 **가깡**으로
  1만1만9만9만이 나온다. 랭크가 섞였다는 이유로 슌쯔성 몸통이 되어 같은 증상(또이또이·산안커
  증발)을 냈다. `isPolarBody`(같은 수패 무늬 + 전 패가 1 또는 9)로 예외 처리 — 장사진(1234)·
  바람의 계보(동남서북)는 노두 아닌 랭크나 자패가 끼어 이 조건에 걸리지 않는다.
- **④ 핑후 헛성립** (③을 보다 발견) — `pinfu`가 `sets.every(type === "run")`만 봐서, 슌쯔성
  몸통으로 나가는 **깡**(바람의 계보 동남서북 안깡, 장사진 4연속 안깡)이 든 멘젠 손에
  핑후가 붙었다. `s.isKan !== true`를 함께 건다 — 깡은 어떤 경우에도 슌쯔가 아니다.
- 회귀 6개: `packages/core/test/BacklogDecompose56.test.ts`("동수의 결속 — 혼색 커쯔 후로가
  커쯔로 채점된다" 3개 + "양극 — 1·9 혼합 깡도 커쯔로 채점된다" 3개).

## 2026-07-26 (도박사의 손 폐기 → 밑장빼기 신설: 왕패/패산 무대 분리)

**계기** — 사용자 지적("왕패의 주인의 상위호환이 도박사의 손 아닌가")을 코드로 검증한 결과
**방향은 반대이고, 애초에 상하위 관계가 아니었다.** 두 증강은 `visibility.deadWall` 상시 14장
열람이 **완전히 같은 코드**였고, 도박사의 손이 이길 수 있는 축은 "왕패의 주인이 손댈 수 없는
턴들" 하나뿐이었다. 즉 **왕패의 주인이 발동할 수 있는 순간에는 도박사의 손을 완전히 포함**했다.

| 축 | 왕패의 주인 | (구) 도박사의 손 |
|---|---|---|
| 열람 | 왕패 14장 상시 | **완전 동일** |
| 교환 횟수 | 국당 2회(본장마다 리셋) → 반장 20~24회 | 게임 3회 고정 |
| 내보내는 패 | 손패 아무 장 | 쯔모패 고정 |
| 도라 조작 | 표시패 자리에 원하는 패를 밀어넣어 **지정** | 쯔모패 우연 의존 |
| 발동 창 | 자기 첫 순만 | 아무 턴 (유일한 우위) |

docs/17 §개편 후보에 "둘 중 하나를 열람 없는 교환 전용으로 차별화"가 백로그로 남아 있었는데,
열람 축소가 아니라 **무대 교체**로 해결했다 — 왕패는 `dead_wall_master`, **패산**은 신설
`bottom_deal`이 담당한다.

**밑장빼기 (`bottom_deal`, prism, hand, 파워 S/37점)**
- **상시**: 패산 **맨 밑 3장**이 보유자에게만 보인다. 오른쪽 끝이 다음에 빼올 밑장.
- **액티브(매 순 1회)**: 선언하면 **다음 쯔모를 패산 위가 아니라 맨 밑에서** 빼온다.
  3장 중 고르는 게 아니다 — 늘 맨 아래 한 장이고, 열람 3장은 "세 번 빼면 무엇이 순서대로
  나오는가"라는 예고편이다. 그래서 미리 대기를 설계할 수 있다.
- **왜 강한가**: 패산 맨 밑은 유국 직전까지 아무도 손대지 않는 자리다. 국 시작에 본 3장이
  그대로 있으니 그중 하나를 오름패로 만들어 두면 **확정 화료**다. 왕패는 깡으로 앞이 빠지고
  표시패가 열려 계속 변하는데 패산 밑은 **불변** — 왕패의 주인에 없는 성질이다.
- **리치 중에도 쓸 수 있다.** 뽑는 자리만 바꾸므로 손이 잠긴 것과 충돌하지 않는다
  (인위적 금지는 무페널티 원칙이 막는다, docs/10 §0).

**구현**
- `ctx.interceptor(TILE_DRAWN)`가 예약된 **일반 쯔모**의 `payload.tileId`를 패산 최후미로
  갈아 끼운다. `moveTiles`가 tileId로 지우므로 패산이 **밑에서** 한 장 줄고, 위에서 뽑는 것과
  장수 변화가 같아 **유국 타이밍이 바뀌지 않는다**. 영상패 쯔모(rinshan)는 건드리지 않아
  예약이 그대로 남는다. 소비는 reaction이 한다(인터셉터는 emit 불가).
- **`PeekVisibility`에 `pick:"back"` 추가**(`information/PlayerView.ts`) — 기존 peek는
  `tileIds.slice(0, count)`로 **앞에서만** 잘랐다. 패산은 양쪽 끝의 의미가 달라(0=다음 쯔모,
  최후미=맨 밑) 뒤에서 자르는 모드가 필요했다. 엔진(`engine/`·`mahjong/`)은 무수정 — 설계
  리트머스 유지.
- **스냅샷을 쓰지 않는다**(사용자 확정). 뷰가 매번 상태에서 계산되므로 미래를 보는 자처럼
  패산 밑으로 패를 밀어 넣는 증강이 끼어들면 창이 그대로 따라 밀린다 — 밑이 ABC였다가 D가
  들어오면 BCD, 밑장을 빼서 D가 나가면 다시 ABC. (삼세 예지는 반대로 의도적 스냅샷이다.)
- 클라: 손패 위 `.bottom-deal-strip`에 **실물 tileId 3장**(kind 스냅샷이 아니다. peek된 패는
  `collectVisibleTileIds`가 `view.tiles`에 kind까지 실어 준다). 예약 시 테두리 점화.
  고를 payload가 없으므로 **모달을 쓰지 않는다**(`MODAL_PICK_TYPES` 미등록). 발동 입구는
  **액티브 증강 버튼** — `AUGMENT_ACTION_TYPES`에 등록해야 `ActionBar`(치·펑·깡 줄)에서 빠지고
  액티브 버튼의 `augOptions`로 들어간다. ⚠ 폐기한 `take_rinshan`을 이 집합에서 지우면서
  `bottom_deal` 추가를 빠뜨려, 처음엔 밑장빼기가 **후로 버튼과 같은 줄**에 떴다(사용자 지적으로 수정).

**함께 정리한 것**
- `.rinshan-pick-overlay` 모달이 절벽 위 꽃 **전용**으로 축소되면서 `DeadWallGrid`·
  `deadWallCells`·`DeadWallCell`이 도달 불가 코드가 돼 **139줄 삭제**. 고아 CSS 31블록(약 3.9KB)
  — `.hand-gamble*`·`.gamble-hint*`·`.rinshan-legend*`·`.dw-*` — 도 제거.
- ⚠ 그 과정에서 **살아 있는** `.rinshan-reopen`이 폐기 대상과 `gamble-lock-glow` 키프레임을
  공유하던 것을 발견 — 지우면 애니메이션이 조용히 죽으므로 `rinshan-reopen-glow`로 분리했다.
- `rinshan_preview.ts` 헤더의 낡은 서술 수정: "영상패를 뽑으면 패산 맨 뒤에서 보충한다"고
  돼 있었으나 현재 구현은 **보충하지 않는다**(2026-07-26 확정, flowEvents TILE_DRAWN).
- docs/20 티어 섹션 종수(S 13→14, A 36→35)를 `powerTier.ts` 실측과 재대조.

**테스트** — `wall_tricks.test.ts`의 도박사의 손 블록을 밑장빼기 27개로 교체, 전체 **887개 통과**.
- 실시간 열람(ABC→BCD→ABC) · 밑에서 한 장 줄고 장수 불변 · 예약 없으면 위에서 뽑는 대조군 ·
  영상패는 예약 유지 · 매 순 1회 · 국 넘어가면 예약 해제 · 리치 중 사용.
- **재예약 스위프 8시드**: 일반 스위프(`backlog_*_sweep`)는 증강 액션을 국당 한 번만 써서
  재예약 경로가 안 돌아간다 → 제시될 때마다 매번 예약하는 전용 스위프를 추가.
  ⚠ `installAugment`만으로는 `player.augments`에 id가 안 들어가(그건 드래프트 리듀서의 몫)
  validate가 후보를 전부 걸러낸다 — `withAugments`로 실제 보유 상태를 만들어야 한다.
- **봇 정책을 합성 뷰가 아니라 실게임 뷰로** 검증(`bot_policy_behavior`는 합성 뷰라 
  `view.zones[WALL]` 열람을 태울 수 없다): 텐파이+밑장이 오름패면 예약, 쓸모없으면 아낌.

## 2026-07-25 (증강 테스트 시점 전환 + 봇 액티브 증강 전수 정책)

**① 증강 테스트 시점 전환** — 관리자가 샌드박스에서 다른 좌석(또는 전체 공개) 시점으로
뷰를 갈아 보며 "내 능력이 상대에게 어떻게 보이는지"를 그 좌석의 가시성 필터 그대로 확인한다.
- 코어: `PlayerAgent.viewSeatOverride?()` 추가 → `HanchanController.broadcastViews`/신설 `resendViewTo`가
  `buildPlayerView`의 viewerId를 갈아 끼운다(엔진·규칙 무변경). 프로토콜 `sandboxViewAs { seat }`,
  `SandboxMessage`에 `seat`(내 좌석)·`viewAs`(관찰 중) 추가.
- 서버: `HumanAgent.setViewSeat`/`viewSeatId`, `RoomManager.sandboxViewAs`(샌드박스 전용·좌석 검증·즉시 재전송).
  재접속 시 sandbox 상태를 뷰/프롬프트 **복원 전에** 보내도록 `reconnect(ws, afterAttach)` 훅 추가
  (sandbox 메시지가 프롬프트를 초기화하므로 순서 교정).
- 클라: `SandboxPanel`에 "시점" 선택기(각 좌석 + 전체공개), 관찰 배너·"내 시점으로" 복귀 버튼.
  자기 판별을 `view.playerId`가 아니라 `sandbox.seat`으로 교정(관찰 중엔 view.playerId가 상대이므로).
  관찰 중엔 조작 UI가 자연히 숨겨지고(프롬프트는 본인 좌석 기준), 내 차례가 오면 배너로 안내.
- 문서: docs/09 §6.1.

**② 봇 액티브 증강 전수 정책** — 액티브 50종 중 `bot` 정책이 없던 것을 전부 채웠다. 봇이 이제
큰손·오픈 리치·연금술사·무장해제·자리 바꿈(오야 강탈)·핏빛 계약 등 거의 모든 액티브를 상황에 맞게 발동.
- 공용 헬퍼 `packages/content/src/augments/botHelpers.ts`(손패 kind·짝/이웃·손 약함 근사·개선 판정·고립패 버림).
- 의도적 예외 8종(폴드·무르기·블라인드 교환류 — 봇이 이득 계산 불가): `take_back`·`last_stand`·
  `free_riichi_discard`·`meld_dissolve`·`foresight`·`future_sight`·`silent_swap`·`hand_swap3`.
  각 파일 "봇 정책 없음" 주석 + 커버리지 테스트 `BOT_SKIP` 등재.
- 회귀: `content/test/bot_policy_coverage.test.ts`(전수 커버리지 — 새 액티브가 정책 없이 추가되면 실패),
  `bot_policy_behavior.test.ts`(대표 정책 발동/절제). 문서: docs/10 "봇의 액티브 증강 사용" 2차 적용.

## 2026-07-26 (60차 — 판수 실측 재조정 + 보상 표기 규약 + 용어 정리)

**59차 환산을 실측(`calculateScore`)으로 검증해 과했던 것을 내리고, 표기까지 규약화했다.**

- **환산 근거 오류**: 1차 환산은 "3판30부 자 론 = 5800"을 전제로 잡았으나 실제는 **3900**.
  실측 결과 전 항목이 구 정액의 **1.5~3배**(오야는 추가 1.5배)였다.
- **재조정**: 예지·정적의 손 3→**2판** · 철벽 4→**3판** · 미래를 보는 자 스택당 1판→**2스택당 1판**
  (스택당 1판은 5스택에 하네만급이 얹혀 구조가 깨져 있었다) · 탕야오 해방은
  "1판 역 + 화료 +2판" → **탕야오를 2판으로 취급**(별도 보너스 폐기) ·
  개문선언은 **리치를 2판으로 취급**(= +1판). 해저의 지배자(3판)·카운터(4판)는 유지.
- **표기 규약 (사용자 확정)**: "N판이 붙는다/얹힌다/추가된다" 금지.
  관련 역이 있으면 **"〈그 역〉을 N판으로 취급한다"**, 1판 그대로면 **"〈그 역〉으로 취급한다"**,
  역이 없으면 **"+N판을 얻는다"**. 구현도 `OPEN_RIICHI_HAN`/`STANDARD_RIICHI_HAN`처럼
  취급 판수와 표준 판수를 따로 두고 차이만 얹는다. 규약은 docs/10 §0.
- **알려진 동작 변화**: 역만·셈수역만 화료에는 판 보너스가 **얹히지 않는다**
  (`calculateScore`가 판수를 무시 → 환산 차액 0). 정액 시절엔 얹혔다.
- **용어**: 팟 → **공탁**, 멜드 → **후로** (코드 주석·설명문·문서 전수).
- 테스트 883개 통과.

## 2026-07-26 (59차 — 증강 확정 보상 단위를 판수로 통일)

**증강이 얹어 주는 확정 보상에서 정액 점수를 전부 없애고 판수로 통일했다** (사용자 확정).
"화료 시 +2000점" → **"화료 시 2판 추가"**. 신규 증강도 예외 없이 판수로 설계한다.

- **환산**: +2000 → **2판** · +4500 → **3판** · +6000 → **4판** · 스택 1000점당 → **스택당 1판**.
  (3판30부 기준 증가폭이 구 정액과 맞는 구간으로 잡았다.)
- **대상 10종**: `tanyao_break`·`yakuless_win`·`open_riichi`(2판) · `foresight`·`haitei_lord`·
  `silent_swap`(3판) · `counter`·`iron_wall`(4판) · `future_sight`(스택당 1판) ·
  `cliff_bloom`은 **만개 국의 영상개화를 4판으로 취급**(표준 1판 → +3판, 같은 날 사용자 확정).
- **구현**: `content/util.ts`의 **`addWinHanBonus`** 하나로 통일(core 표준 증강은 `standardAugments.ts`의
  동명 로컬 헬퍼). 내부는 `winPointsWithExtraHan` 환산 **뱅크 점수**라 판이 올라도
  **상대가 더 내지 않는다** — 무페널티 원칙 유지. `future_sight`의 `scoreChanged` 직접 발행은 폐기.
- **제외**: 화료 보너스가 아닌 정액 — `always_tenpai`(유국 노텐당 2000) · `honba_hunter`(본장) ·
  `devils_advance`(선지급·강탈) · `all_or_nothing`(판돈) · `die_hard` · `unification` · 리치 공탁 1000 ·
  `aotenjou_ceiling`/`big_hand`(차액 보정).
- ⚠ **합산 비선형**: 판수는 만관/하네만 상한에서 꺾여 중복 보너스가 정액 시절보다 세진다.
  유일한 중복이던 `cliff_bloom`(3+4=7판)은 **"영상개화 4판 취급"** 한 줄로 정리했다 —
  앞으로도 확정 보상은 증강당 한 줄, 겹칠 것 같으면 기존 역의 판수를 올려 표현한다.
  적용은 **만개 국 + 실제로 영상개화가 붙은 화료** 한정(`info.yaku`로 확인).
- 문서: 규약 **docs/10 §0 "확정 보상 단위"**(단일 진실) · 분포 docs/17 §3.4 · docs/16 상단 배너 ·
  docs/20·17_DESIGN_ASSETS·`powerTier.ts` 노트 동기화. 테스트 879개 통과(테스트 헬퍼 `hanBonusPoints` 신설).

## 2026-07-26 (58차 — 증강 계열 전수 분류 + 봇 증강 사용 실측 보정)

**(A) 증강 계열(카테고리)을 증강 정의로 이관 — 108종 전수 분류.**
- 문제: 계열은 클라이언트의 명시 맵(69종) + **id 관례 휴리스틱**으로 정해지고 있어서,
  신규 증강 **39종이 조용히 `etc`(기타)** 또는 엉뚱한 계열로 새고 있었다(docs/19 §4.1이 이미 지적).
- 해결: `AugmentDef.category`를 **필수 필드**로 신설(core `AugmentCategory`) → 108종 전부 선언 →
  카탈로그(`AugmentCatalogEntry.category`)로 클라이언트 전달. 클라의 `AUGMENT_CATEGORY` 맵과
  `inferCategory` 휴리스틱은 삭제, 계열 룩업은 카탈로그가 채운다.
- **계열 9종**(신설 `shape` 화료형 🧩): 손패23 · 점수18 · 화료형17 · 교란14 · 리치12 · 정보9 ·
  후로8 · 수비6 · 기타1(재장전). 화료형 = 분해 규칙·화료 조건을 넓히는 계열(동수의 결속·양극·
  비대칭 치또이·왕의 징표·바람의 계보·무너진 국경·진짜 용·철벽·무형화료 등)로, 여태 etc·교란·
  손패에 흩어져 있었다. 재분류 12종(철벽·무형화료·복수자·탕야오 해방·끝없는 윤회·진짜 용·
  대기만성2·무너진 국경·뒤섞인 아홉 개의 연꽃·해저의 지배자·밀실의 도라).
- `.aug-cat-*` CSS 정의(드래프트 칩·pill 아이콘이 계열 색을 입는다 — docs/19 §0.4-5 개발 선행 해소).
  컷인과 칩이 **같은 팔레트**를 공유하도록 셀렉터를 묶었다.
- 가드: `content/test/augment_category.test.ts` — 계열 누락·오타·나태한 `etc`·클라 표시 메타 누락을 막는다.

**(B) 봇이 증강을 안 쓰던 문제 — 40판 실측으로 원인 3종 확인·수정.**
측정 방법: 4봇 게임을 돌려 **액션 타입별 "제시 대비 발동"**을 집계(scratch 스크립트).
- **깡을 한 번도 안 쳤다**(안깡 166/0 · 대명깡 46/0 · 가깡 40/0) — `decideNow`에 깡 분기 자체가
  없었다. 그래서 절벽 위에 피어난 꽃(SS)·밀실의 도라·영상 정찰·장사진·바람의 계보가 봇 손에서
  통째로 사문화. → `BotAgent.chooseKan` 신설(텐파이면 깡 뒤 텐파이 유지 + 죽은 대기 금지,
  노텐이면 자패·이웃 1장 이하, 가깡은 대기 안 깨면 항상, 역패는 펑 대신 대명깡).
  서로 다른 패의 깡은 증강 몫 — 바람의 계보에 "네 바람이 전부 고립이면 동남서북 깡" 정책 신설.
- **커스텀 리액션 콜은 커버리지 사각지대였다** — 전수 커버리지 테스트가 `holderTurnOptions`만
  스캔해, `registerReactionOptions`로 콜을 내는 묵계·허장성세·우는 국사 3종이 정책 없이 통과.
  → 스캔에 두 번째 경로 추가 + 세 정책 신설. 코어 표준 증강(회수)도 스캔·정책 대상에 포함.
- **정책이 지나치게 엄격했다** — 제시는 쌓이는데 발동 0: 무르기 184/0 · 정적의 손 120/0 ·
  도박사의 손 151/0 · 천리안 31/0 · 예지 30/0 · 회수 28/0. → 정책 신설·완화(무르기=쯔모패 고립,
  정적의 손=바닥에 쓸모 패, 도박사의 손=대기 일치 외에 손 개선 교환도, 천리안=중반 이후,
  예지=공개까지만).
- **드래프트 전략**: 봇이 판단 못 하는 액티브(`BOT_UNUSABLE_AUGMENTS` 9종)는 3택에 다른 후보가
  있으면 피한다. 목록은 콘텐츠 소스가 단일 진실(커버리지 테스트와 BotAgent가 같은 목록을 읽는다).
- 결과(같은 40판 시드 기준): 증강 발동 **303 → 459회**, 깡 **0회 → 안깡20·대명깡25·가깡24**,
  "보유하고도 한 번도 발동 못 한 액티브" **25종 → 12종**(남은 12종은 전부 정책이 있고 조건이
  실제로 희소한 것 — 우는 국사·절벽 위의 꽃·삼원의 의지 등).
- 회귀: `server/test/BotAgentKan.test.ts`(4) · `content/test/bot_policy_new.test.ts`(8) 신설.
  전체 **847개 통과**(835 → 847), 4패키지 타입체크 클린.

## 2026-07-25 (57차 — 5차 사용자 발안 14종 등재 + 배치 1~7 구현 32종 + ankan 개편)

**배치 6~7 (2026-07-25) — 백로그 잔여 소탕**: 6종 완료. 콘텐츠 99→**104종**, 전체 **830개 통과**.
- **삼원의 의지**(`three_dragons_will`) — 7장 대삼원. 코어 무변경: 원안의 decompose 전처리를
  **재료 소모형 생성**(가장 고립된 잡패 N장 → 부족한 삼원패, conjured)으로 실현. 세 커쯔가 실제로
  서므로 대삼원·부수가 표준 채점으로 자연 성립(evaluateWin으로 역만 검증). 손패 장수 불변.
- ⚠ **코어 채점 홀 수정 (선행)**: `WinContext.meldToSet`이 모든 깡을 `[first,first,first]` 커쯔로
  환산해, 병행 세션이 추가한 **동남서북 깡이 東東東 커쯔로 채점**되던 버그(역패 헛성립·또이또이/
  산안커/사희 오판·안깡 부수 부당 적용)를 실측 확인 후 수정 — **서로 다른 패로 이루어진 깡은
  슌쯔성 몸통**(대표 3장, isKan 유지)으로 내보낸다. 이 수정이 장사진 구현의 전제였다.
- **장사진**(`snake_kan`) — 같은 무늬 연속 4장 = 깡. 규칙 `call.snakeKan` + `isRunQuad` +
  FlowController 후보 생성(동남서북 깡과 같은 확장 지점). 영상패·신도라·깡 카운트 표준 경로.
- **손바닥 뒤집기**(`palm_flip`) — 리치 해제 + **재리치 무료**. 원안의 "공탁 몰수"(§0 무페널티 위반)를
  **"이미 낸 공탁의 재사용"**으로 뒤집었다. 승부수(`last_stand`)=봉 환급·폴드용 / 이쪽=봉 유지·공격용.
- **북풍 상인**(`north_trader`) — 북빼기 + 개인 도라. **신규 패 불필요**(北은 표준 136장에 존재 —
  "전용 신규 패" 분류는 착오). 北을 바닥에 내려놓고 패산에서 보충(장수 불변), 버림이 아니라
  후리텐·론 대상 아님. 발동 상한은 **北이 4장뿐**인 것 자체.
- **뒤집힌 모래시계**(`hourglass`) — 유국 거부 솔로 쯔모. `ROUND_SETTLED`(draw) 인터셉터가 텐파이면
  정산을 커스텀 이벤트로 **대체**해 왕패 4장을 패산으로 옮기고 turnSeat을 홀더로, `TURN_PASSED`
  인터셉터가 연장 중 턴을 홀더에 고정(솔로). 두 번째 유국은 플래그로 통과 — 무한 연장 없음.
- **고요** ⛔ **폐기 권고** — `stealth_riichi`(은닉+공탁면제)·`free_riichi_discard`(손 자유)·
  `hidden_blade`(다마 보상)의 조합 공간에 완전히 흡수. 남는 차이인 "공탁 후불"은 홀더 손해라
  §0상 면제가 상위 호환 → 만들면 열화판. 사유는 docs/16 §2 고요 항목에 기록, 최종 판단 대기.
- **남은 2종(삼광·영의 패)**: 신규 패 **종류 자체**가 필요 — 코어 타일셋 확장 + **패 그림 에셋**
  (화투 광 5장 / 0만·0통·0삭)이 있어야 완성된다. 코드만으로 끝나지 않아 사용자 결정 대기.

**배치 5 (§2b 완결 + 백로그 계속)**: 4종 완료. 콘텐츠 96→99종.

**배치 5 (2026-07-25, §2b 완결 + 백로그 계속)**: 4종 완료. 콘텐츠 96→**99종**, 전체 **808개 통과**.
- **귀환**(`honor_return`) — §2b **마지막 1종 → §2b 14종 전량 구현 완료**. 발동 시 바닥의 자패를 최근순
  최대 4장 기록, 다음 ROUND_STARTED에 배패 앞자리를 그 kind로 덮는다(미련과 같은 크로스국 주입, 장수 불변).
- **분열**(`tile_split`) — 수패 1장을 합이 같은 두 숫자로(9통→4통+5통). 허장성세식 생성 기법으로 두 번째
  조각은 가장 고립된 잡패를 재료로 물질화 → 원안의 "직후 1장 버림" 불필요(손패 불변). a ≤ r/2만 제시.
- **누명**(`frame_up`) — 내 버림을 상대 명의로 심는다. **코어 `TileDiscardedPayload.creditTo` 선택 필드 신설**:
  바닥·후리텐 이력만 대상 명의, 손패 출처·방총 책임·턴 진행은 실제 버린 사람. 미지정 시 완전 동일(회귀 0).
  내 후리텐 회피가 자연히 따라온다.
- (배치 4에서 이어진) 등 떠밀기·재장전 포함, 클라 배선·크래시 스위프·docs 16/17 전부 동기화.
- **§0 티어표 ○(미구현) 표기 정리** — 구현 완료된 11종의 스테일 ○를 제거해 실제 미구현만 남겼다.

**배치 4 (2026-07-25, 실플레이 후 병행 밸런스 세션과 동시 진행)**: 2종 완료.
- **등 떠밀기**(`push_riichi`) — 낙인 대상 강제 리치. 순수 콘텐츠. `TILE_DISCARDED` Interceptor가 낙인 대상의
  버림이 리치 성립(멘젠+버린 뒤 텐파이+공탁+벽+미봉쇄)이면 `riichi:true` 강제, Reaction이 낙인 소멸.
  matchUses. 봇=선두 견제.
- **재장전**(`reload`) — 소진 증강 1회 복구. 순수 콘텐츠. 대상 `<id>:uses:<holder>` 카운터 1 감소로
  재사용 개방. `:uses:` 규약(0725 표준화) 준수 증강만 대상. matchUses.
- 콘텐츠 94→**96종**. 전체 **788개 통과**. ⚠ 병행 세션이 기존 증강을 matchUses 규약으로 전환 + xray 등
  추가 중 — 공유 파일(App.tsx·docs·test) 동시 편집이라 앵커 재확인 후 additive 편집으로 회피.

**배치 3 (코어확장)**: 4종 완료.
- **바람의 계보**(`wind_lineage`) — 자패 슌쯔(동남서·남서북·백발중). `DecomposeOptions.honorRuns` + 규칙
  `scoring.honorRuns`(extractSets가 자패 suit 내 (r,r+1,r+2) 슌쯔 열거). 삼색동순·일기통관은 NUMBER_SUITS
  게이트라 헛성립 없음. 클라 `waitDecompOptions` 미러.
- **묵계**(`silent_pact`) — 멘젠 유지 퐁. `Meld/MeldInfo/CallMadePayload.silent` 플래그 신설, 멘젠 판정 4곳
  (openMeldCountOf·buildVariants isClosed·유요구 텐파이 isOpen·meldInfosOf)이 안깡처럼 취급. reaction 페이즈
  `registerReactionOptions`로 silent_pon 커스텀 콜. 국당 1회. 핑후는 미복구(커쯔 존재). 채점 핫패스 변경이나
  비-silent 후로엔 no-op이라 회귀 0.
- **미련**(`regret`) — 유국 멘젠 텐파이 손을 다음 국 배패로. 코어 무변경(기존훅). ROUND_SETTLED(draw) 리액션이
  멘젠 텐파이면 손패 kind 보존(전원 공개), 다음 ROUND_STARTED(배패 후) 리액션이 갓 받은 13장을 보존 kind로
  tileKindChanged(conjured) 덮고 비운다. setupRound의 tiles 원본 재생성 덕에 안 쓴 국엔 안 샘.
- **무장해제**(`disarm`) — 상대 증강 1국 무효. **코어 source 게이트 신설**: `RuleRegistry.setSourceGate`(resolve에서
  비활성 source Modifier 스킵) + `EventProcessor.isSourceEnabled`(Interceptor·Reaction 스킵). GameEngine이
  `state.augmentData[DISARMED_SOURCES_KEY]`를 읽어 배선 — **목록 비면 완전 no-op(회귀 0)**. 게임당 1회, ROUND_SETTLED
  복구. ⚠ 액션(액티브 버튼)은 미게이트(규칙·효과만 무효), 지목 UI 후속.

콘텐츠 90→**94종**. 코어 핫패스 게이트 변경에도 회귀 0. **남은 백로그(최난도)**: 누명(타인 바닥 심기+후리텐)·
장사진(4연속=깡 새 후로 타입)·분열(1→2장 일시 14장)·삼원의 의지(7장 대삼원 conjured 보충)·뒤집힌 모래시계
(유국 거부 솔로 쯔모 커스텀 페이즈) — 전부 새 서브시스템. 판단 대기: 고요·손바닥 뒤집기(중복). 맨 마지막: 삼광·영의 패·북풍(신규 패).



사용자가 한 번에 던진 증강 아이디어 14개를 정식 등재하고, "쉬운 것(코어·클라 배선 적음)부터
최대한 많이" 지시로 배치 1을 구현했다. 신규 패 서브시스템(삼광·영의 패·북풍 상인)은 맨 마지막으로 미룸.

- **설계 등재 (Phase A)** — 신규 14종을 **docs/16 §2b**(부수는 상식/도파민 순간/대응/구현)와
  **docs/17 §2b**(난이도·사기성·도파민·신박함·추가점수)에 정식 백로그로 승격. 중복 3종 정리:
  가려진 도라(`dora_conceal`)=백로그 "왕패의 주인 — 도라 은닉" 정식 대체(이름 충돌 해소) ·
  밀실의 도라=기존 `ankan_dora` 개편 예정 · 박무(`brief_fog`)=`hidden_river` 6순 형제.
- **구현 배치 1 완료 (11종)** — §2b 9: 책임전가(`blame_shift`, 론 지불 3분할)·승승장구
  (`always_tenpai`, 유국 항상 텐파이)·가려진 도라(`dora_conceal`, 상대에게 도라 표시패 은닉)·
  뒤늦은 출진(`late_double`, 7순까지 더블리치)·함구령(`call_seal`, 6순 상대 후로 봉인)·짝수의 세계
  (`even_world`, 손패 홀수→짝수)·박무(`brief_fog`, 6순 안개)·마작의 거신병(`giant_god`, 손패↔바닥
  국사 13장 교환)·소환(`conjure_draw`, 지목 손패를 다음 쯔모로). §2 백로그 2: 불가침 조약
  (`no_ron_pact`, 첫 6순 론 면역)·바닥의 족보(`bottom_yaku`, 내 바닥이 역을 만든다 — 2 서브역).
- **신설 범용 코어 훅 3종** (증강 하드코딩 없음): `draw.treatAsTenpai`(sysSettleDraw 텐파이 집합) ·
  `visibility.doraIndicators.hidden`(PlayerView buildRoundView, defineVisibilityRules에 정의) ·
  `call.blocked`(pon·chi·minkan validate — FlowController가 validateOk로 후보를 걸러 자동 반영).
  불가침 조약·뒤늦은 출진은 코어 변경 없이 기존 훅(`win.ronImmune`·TILE_DISCARDED 인터셉터) 재사용.
- **클라 배선** — 액티브 선언형 4종(even_world_flip·declare_brief_fog·giant_god·call_seal_use)을
  App.tsx의 ACTION_LABEL·ACTION_AUGMENT·AUGMENT_ACTION_TYPES·ACTIVE_AUGMENT_IDS에 추가. 나머지 5종은 패시브.
- **구현 배치 2 완료 (4 + 개편 1)** — 정보형 3: 천리안(`tenpai_scan`, 텐파이 상대 감지)·지뢰 탐지
  (`danger_sense`, 내 손패의 방총패에 (!))·삼세 예지(`triple_peek`, 다음 쯔모 3장) — 전부 보유자 전용
  뷰 채널 + `AugmentInfoPanel` 전용 렌더 케이스 신설. §2 백로그 파혼(`meld_dissolve`, 후로 해체→멘젠 복구,
  CALL_MADE 역연산 리듀서). **밀실의 도라 개편**: 기존 `ankan_dora`(리치 중 안깡당 +4판, §17 3.2 노잼)을
  **깡친 패=개인 신도라**로 교체 — `score.extraHan`이 정산 시점 안깡 종류를 손패+후로에서 세어 매칭 장수×1판,
  리치 조건 제거, KAN_DECLARED 리액션은 공개 연출만. new_52_b 테스트 개정.
- **클라 배선** — 배치 1·2 액티브 8종(선언형 7 + 손패 지목형 소환) App.tsx 4맵 배선. 정보형 3종 렌더 케이스.
- **테스트** — 단위 15종 + 실게임 크래시 스위프 2개(`backlog_5th_batch1_sweep` 11종·`backlog_5th_batch2_sweep` 4종,
  각 8시드 완주). 콘텐츠 75→**90종**(+표준 4=94). 4패키지 타입체크 클린 · 전체 **742개 통과**.
- **대기(다음 배치)** — §2b 1종: 귀환(`honor_return`, 크로스국 배패 주입). §2 백로그 코어확장 다수
  (미련·누명·장사진·바람의 계보·분열·묵계·삼원의 의지·뒤집힌 모래시계·등 떠밀기·무장해제·재장전).
  컨셉 중복 대기(고요·손바닥 뒤집기)는 사용자 판단. 신규 패 서브시스템(삼광·영의 패·북풍)은 맨 마지막.

## 2026-07-23 (56차 — 백로그 전수 정리 + 밸런스 지표 문서 신설)

문서 작업만 있고 코드 변경은 없다.

- **백로그 69종 폐기** (사용자 전수 판정, 사유 = 특색·실용성 부족). 92종 중 23종만 존치.
  폐기 목록은 16 §3 말미에 기록(재제안 금지).
- **신규 7종 추가** (사용자 발안, 16 §2): 동수의 결속 · 삼원의 의지 · 왕의 징표 · 개벽 ·
  양극 · 비대칭 치또이 · 묵계. 5종이 **decompose 확장 계열**이라 묶어서 구현할 것.
- **docs/17_AUGMENT_BALANCE.md 신설** — 구현 69종 + 대기 30종을 난이도·사기성·도파민·신박함
  4지표(1~10)와 추가 점수로 수치화. §3에 전수 점검(사기성 과잉 6종 · 노잼 위험군 7종 ·
  존재감 미달 8종 · 추가 점수 단위 분포 · 착수 권고).
- **§0 종합 티어(SS>S>A>B>C>D>E)** — "플레이어가 집고 싶은 순위"(사기 잠재력+색다름+도파민 가중).
  SS 8 · S 14 · A 18 · B 18 · C 17 · D 13 · E 11. 사용자가 실테스트로 직접 조정.
- **백로그 구현 배치 1 완료 (3종)** — 동수의 결속(`mixed_triplet`, 혼색 커쯔)·왕의 징표
  (`royal_kokushi`, 국사 중복 허용)·공성계(`siege_riichi`, 노텐 리치). 코어 3훅 추가:
  `DecomposeOptions.kokushiDupes` · `scoring.kokushiDupes` · `riichi.requiresTenpai`.
  콘텐츠 65→**68종**(+표준 4=72). 4패키지 타입체크 클린 · 테스트 640→**650**.
  회귀: `packages/core/test/BacklogDecompose56.test.ts`, content 스위프.
  밸런스는 사용자가 실테스트로 조정 — 수치는 docs/17에만 기록.
- **백로그 구현 배치 2 완료 (2종)** — 양극(`polar_ends`, 1·9 혼합 커쯔 몸통)·비대칭 치또이
  (`async_chiitoi`, 무늬 무관 rank 머리). 코어: `DecomposeOptions.polarEnds`·`chiitoiMixedPairs`,
  규칙 2개, standardYaku `isSameRankTriplet` 가드(삼색동각 오판 차단), WinContext 치또이
  `handKinds` 적재(혼일색 오판 차단). 콘텐츠 68→**70종**(+표준 4=74). 테스트 650→**661**.
  삼원의 의지는 손패 장수 불변식 문제로 별도 배치(conjured 보충 선행).
- **백로그 구현 배치 3 완료 (2종)** — 개벽(`genesis`, 손패 자↔수 무작위 전환)·천하통일
  (`unification`, 60000점 즉시 우승). 코어: `match.instantWinScore` 규칙 신설 + HanchanController.
  shouldEnd 조기 종료 훅(제네릭, 증강 하드코딩 없음). 개벽은 statePrng+tileKindChanged로
  결정적 무작위. 콘텐츠 70→**72종**(+표준 4=76). 테스트 661→**666**.
  ⚠ 미구현 중 **고요~`stealth_riichi`, 손바닥 뒤집기~`last_stand`** 컨셉 중복 — 사용자 판단 대기.
- **백로그 구현 배치 B 완료 (3종)** — 밥상 뒤엎기(`table_flip`, 배패 반납·재드로우)·혼 사냥
  (`soul_hunt`, 리치자 론 시 리치 강탈+우라)·허장성세(`bluff_pretense`, 1장 펑+생성패).
  혼 사냥은 hidden_blade+open_riichi_reveal 결합(커스텀 역+uraWithoutRiichi Modifier),
  허장성세는 잡패를 conjured 변환 후 표준 펑(무에서 tileId 생성 불가 → 유일 해).
  콘텐츠 72→**75종**(+표준 4=79). 테스트 666→**675**. 배치 B는 중복 2종 제외 전량 완료.
- **문서 상태 정정**: 16 §1 "개편 21종 5종 대기"는 스테일이었다 — 52차 §1b 버프로 대부분 처리돼
  실제 잔여는 `aotenjou_ceiling` 1종.

## 2026-07-22 (55차 — 플레이 피드백 11건: 역없음 표시 · 모달 잘림 · 증강 사양 조정)

실제 플레이에서 나온 피드백을 전부 반영했다. 테스트 602 → **640개(52파일)** 전부 통과.

### ⚠ 모달이 화면 아래에 잘리던 원인 — 조상의 transform

붉은 손길·단색 세계·예지·왕패의 주인 네 모달이 "아래에 있어서 잘린다"는 피드백의 원인은
**`.own-area`의 `transform: translateX(-50%)`** 였다. 조상에 transform이 있으면 자식의
`position: fixed`가 뷰포트가 아니라 **그 요소를 기준**으로 잡힌다.
OwnArea의 기존 모달들은 `.own-area` **바깥 형제**로 렌더돼 우연히 이 함정을 피해 갔고,
`ActiveAugmentControl` 안에 새로 넣은 모달들만 걸렸다.
→ 해당 모달 7종을 **`createPortal(…, document.body)`** 로 내보내 해결했다.
**앞으로 `.own-area` 안에서 전면 오버레이를 띄우면 반드시 포탈을 써야 한다.**

### 역없음 대기 표시 (코어)

"오름패라도 역없으면 역없음 표시" — 오름패 표시가 "기다리면 먹을 수 있다"로 읽히던 오해를 막았다.
- 코어 `yakulessWaits(state, id, rules, yaku)` 신설 → `PlayerRoundView.noYakuWaits`(본인 뷰 전용).
  대기패마다 가상 론을 평가해 역이 없는 종류만 골라낸다. 리치 중이면 리치가 역이 되어 자연히 빈 목록.
- 클라 `WaitsBadge`·`WaitTip`이 해당 패를 회색으로 죽이고 "역없음" 꼬리표를 붙인다.
- 부수 수정: `tenpaiNoYaku`가 가상 화료패를 **손패 안에서** 고를 수 있던 잠재버그를
  `outsideHandTileFinder`로 바로잡았다(51차 함정 ② 재발 지점).

### 무너진 국경 — 혼색 **커쯔·후로**까지 확장 (코어)

"만통삭이 섞인 치퐁깡도 가능하게" — 슌쯔만 열려 있던 것을 멘쯔 전체로 넓혔다.
- `DecomposeOptions.mixedTriplets` + 규칙 `scoring.mixedTriplets` 신설. `extractSets`가
  같은 랭크의 혼색 커쯔 후보를 열거한다(자패는 무늬 개념이 없어 제외).
- **후로 판정도 함께**: `sameCallKind`/`mixedTripletsFor` 헬퍼로 치·펑·대명깡·안깡·가깡의
  validate와 **FlowController의 후보 생성**이 무늬를 안 가린다(후보를 안 고치면 규칙만 열리고 못 친다).
- ⚠ 무늬 요구 역 가드: 슌쯔의 `isPureRun`에 이어 커쯔용 **`isPureTriplet`** 을 추가해
  삼색동각이 혼색 커쯔로 헛성립하지 않게 했다.
- ⚠ **부작용(의도된 것)**: 삼색동순 손은 랭크가 세 무늬에 다 있으므로 혼색 커쯔 3개로도 읽힌다 →
  채점 엔진이 더 비싼 해석을 고른다. 손해가 아니라 이득이며, 문서의 "혼색 멘쯔는 삼색을 스스로 깬다"가 이것이다.
- 클라 `waitDecompOptions`도 함께 갱신(51차 교훈 ③ — 분해 규칙 바꾸면 클라 대기 계산 필수 동반).

### 적도라 소유권 (코어)

"증강으로 생성한 도라는 나만 사용가능하게" — `TileAttrs.redFor` 신설.
`buildWinContext`의 redCount가 `redFor`가 있으면 **그 사람이 화료할 때만** 센다.
붉은 손길로 물들인 5를 버려 상대가 울어 가도 상대에게는 이득이 되지 않는다.
패산에서 나온 진짜 적도라는 `redFor`가 없어 종래대로 누구에게나 적용된다.

### 증강 사양 조정 6종

| 증강 | 변경 |
|------|------|
| 안개 덮인 바닥 | 상시 패시브 → **게임당 1회 선언하는 액티브**(`declare_fog`). 안개 속에서도 **각자의 마지막 버림패는 보인다**(`hidden_river:last:*` + `revealTiles:fog`) |
| 등가교환 | **교환을 쓴 국에는 재사용 불가**(국 단위 플래그, 진행 중이던 다단계는 끝까지 진행) |
| 미래를 보는 자 | 턴 시작 시 자동 제시되던 것을 **액티브 버튼 2단계**로(`future_arm` → `future_exchange`). **가져온 3장을 전원 공개**로 표시 |
| 일확천금 | 룰렛에 **0.5배** 추가(0.5·2·3·4) — 사용자 지시 밸런스 조정, §0 무페널티의 명시적 예외 |
| 선언 간파 위조 | 전용 모달 → **실제 내 손패 클릭**(`ARM_MODE: "hand"`), 한 패에 후보가 여럿이면 전→후 모달 |
| 예지 | 모달 자리 라벨을 실제 쯔모 순서(**하가 · 대면 · 상가 · 나**)로 수정 |

⚠ `jackpot`의 0.5배 인터셉터는 조기 반환 조건을 `mult <= 1`로 두면 **0.5가 통째로 무시된다** —
`mult <= 0 || mult === 1`로 걸러야 한다.

## 2026-07-22 (54차 — 52차 잔여 3단계 완결: ④모달 소급 · ⑤기존 증강 버프 22종 · ⑥신규 16종)

52차의 남은 세 단계를 전부 반영했다. 콘텐츠 카탈로그 **53 → 65종**(+표준 4 = 69종),
테스트 **435 → 602개**(50파일) 전부 통과, 4개 패키지 타입체크·클라이언트 빌드 모두 클린.

### 신설한 코어 훅 7종

증강별 하드코딩 없이 §1b·§1c를 구현하기 위한 확장 지점. 전문은 docs/10 §6,
회귀 테스트 `packages/core/test/RuleHooks52.test.ts`(14건).

`riichi.blocked`(리치 봉인) · `win.minHan`(최소 판 게이트) · `riichi.hidden`(리치 은닉) ·
`win.closedKanRobbable`(안깡 챤깡) · `score.honbaPerStick`(본장 단가) ·
`scoring.seatWind`(자풍 고정) · `round.keepDealer`(연장)

- **`riichi.hidden`이 가리는 것은 세 필드뿐**(`riichiDeclared`·`doubleRiichi`·`riichiTileIndex`).
  공탁 1000점 차감이 별개 신호이므로 **은닉형 리치는 공탁을 면제**해야 완전해진다.
- **`round.keepDealer`는 무한 국 위험**이 있다(연장이 반복되면 국번이 안 오른다) →
  쓰는 증강은 반드시 발동 횟수를 제한할 것(만년 오야는 게임당 3회).

### ④ 패 선택형 모달 소급 (docs/10 §2a-1)

- **염색·연금술**: 손패 클릭 후 뜨던 `.arm-sub` 인라인 후보 버튼 바 → **전용 모달에 전→후 실물 패**.
- **단색 세계**: 드롭다운 텍스트 후보 → **무늬별로 내 손패가 물든 모습을 통째 미리보기**.
- 새 상수 `MODAL_PICK_TYPES`(버튼이 드롭다운 대신 전용 모달을 여는 액션 목록).
- 버튼 유지 예외: 무장(`ARM_MODE`)형은 실물을 직접 클릭하므로 이미 규약 충족,
  `{}` 단일 선언형은 고를 것이 없음, **핏빛 계약**은 고르는 대상이 패가 아니라 역.

### ⑥ 신규 12종 + 재조정 4종

신규: 리치 봉인 · 뒤섞인 아홉 개의 연꽃 · 해저의 지배자 · 한 끗 차이 · 정적의 손 · 봉인된 보물 ·
예지 · 격(格) · 왕패의 주인 · 스텔스 리치 · 성립하지 않는 깡 · 본장 사냥꾼.
재조정: 절벽 위에 피어난 꽃 +6000 · 탕야오 해방 +2000 · 무형화료 +2000 · 카운터 직격 론 +6000.

- **`silent_swap`은 손패를 늘리지 않는다** — 원안대로 14장을 만들면 버린 뒤 영구히 14장이 되어
  13장 전제의 화료 분해가 통째로 실패한다. 날치기·무덤 도굴처럼 **쯔모패를 패산 맨 밑으로 돌리고
  바닥 패가 새 쯔모패가 되는** 형태로 구현했다(도박성은 그대로, 국이 1쯔모 길어진다).
- **`void_kan`은 상대 후로를 건드리지 않는다** — 대신 내 손패 1장의 kind를 바꿔 깡패를 오름패로 만든다.
  대명깡은 코어상 `chankan`이 서지 않아 원래 대상이 아니다(안깡·가깡만).
- **`ankan_dora`** 해석은 **안깡 묶음당 +4판**으로 확정(사용자 지시).
- `mixed_nine_gates`는 화료형일 때만 판정되므로 111·999가 각각 한 무늬로 모이는 배열에서 성립한다.

### ⑤ 기존 증강 버프 (§1b B~F) 22종

- **B 순수 배율(7)**: 일확천금=국당 1회 룰렛(2~4배) / 대기만성(±동풍)=배율 대신 **후리텐 무시+무역 화료** /
  만년 오야=자풍 동 고정+연장(3회) / 가불 인생=만관 화료 시 각 3000 강탈 /
  카르마=업보 게이지 즉시 강탈 / 이중 선언=하가 리치 봉인 / 붉은 손길=**1~9 지정**(payload `{rank}`)
- **C 정보형(3)**: 영상 정찰=영상패 끌어오기 / 선언 간파=대기패 위조 / 이면투시=뒷도라 바꿔치기
- **D 드문 조건(4)**: 역만 방어술=**하네만 이상**(게임 2회) / 유국역만=**무울림 조건 삭제** /
  철벽=후리텐 론 +6000 / 승부수=**패산 조건 삭제**
- **E 규칙 완화(4)**: 무형화료·탕야오 해방 +2000, 절벽 꽃 +6000, **개문선언 +2000**(미정이던 수치 확정)
- **F 체감(2)**: 자리 바꿈=**즉시 적용**(내 첫 순) / 판돈 굴리기=**연승 배수**(2→3→4배, 방총·유국 시 리셋)

**⚠ `seat_swap` 발동 창 함정**: "아무도 안 버렸을 때"로 잠그면 논리적으로 오야의 첫 액션에서만 참이 되어
**오야를 훔치는 게 아니라 넘겨주는** 물건이 된다 → "**내가** 아직 안 버렸을 때"로 완화했다.
리듀서는 `turnSeat`를 "턴을 쥔 사람"을 따라 옮겨야 한다(안 그러면 13장짜리 손이 턴을 잡아 장수가 깨진다).

### 클라이언트

- 배선 5맵에 신규 10액션 추가, **`let_it_ride_toggle`은 액션 소멸로 5맵에서 제거**.
- 전용 모달 **6종** 신설(정적의 손·예지·왕패의 주인·붉은 손길·간파 위조·뒷도라 바꿔치기).
- 지목형 연출: **격(格)** 피격자 전면 컷인 + 양쪽 상시 뱃지 + 제3자용 관계 행.
  **성립하지 않는 깡**은 깡 선언 순간 전원 컷인.
- 상시 뱃지 10종 신설(일확천금 배수·업보 게이지·만개·가불·연장 잔여·리치 봉인·방패 잔여·
  왕패 교환 잔여·본장 가치·연승 배수). **본장 사냥꾼은 이 시각화가 없으면 순수 점수 배율로 전락**한다(§0).

### 갱신한 기존 테스트 (사양 변경 반영)

`late_bloomer`(배율→규칙) · `tonpuu_augments`(동풍판 동일) · `score_bonus`(잭팟 룰렛) ·
`hand_manip`(붉은 손길 `{rank}`) · `schemers`(자리 바꿈 즉시 적용) · `combat_augments`(유국역만 무울림 삭제).

## 2026-07-22 (53차 — 타패음 = 유저 녹음 "탁" 하나 · 효과음 지연 원인 규명)

유저 피드백: **"타패 한 번에 탁 소리가 딱 한 번만. 이상한 소리들이 섞여 여러 번 나면 안 된다"**
+ "효과음이 전체적으로 늦게 나온다". 기존 타패음 자산·코드·문서를 전부 걷어내고 새로 만들었다.

### ✅ 타패음 — 녹음 1개를 그대로

- **선정 기준은 "단일 타격"**. 유저 녹음(35s)에서 타격 19개를 검출해 정량 비교했다. 밝은
  "탁" 계열(스펙트럼 중심 ~3kHz)은 **예외 없이 전부 76~106ms에 2차 타격**(패가 튀며 다시
  닿는 소리, −16~−29dB)이 붙어 있다 — 이걸 물고 자르면 "탁-탁"이 된다.
- 2차 타격이 없는 후보 6개를 같은 체인으로 만들어 **어택 경도·몸통·대역 분포**로 비교
  (`t20`=피크에서 20dB 떨어지기까지, `body`=8~45ms 에너지 / 첫 8ms 에너지):

  | 후보 | 원본 | 길이 | t20 | body | 중심 | 저110-400 / 중400-2.5k / 고2.5k+ |
  |---|---|---|---|---|---|---|
  | **A(채택)** | 27.22s | 83ms | 9ms | −13.4dB | 3148Hz | 22% / 65% / 12% |
  | C | 23.25s | 103ms | 29ms | −7.5dB | 1080Hz | 48% / 50% / 0.2% |
  | B | 21.30s | 91ms | 23ms | −7.4dB | 1725Hz | 71% / 27% / 0.7% |

  후보 4종을 들을 수 있는 페이지를 만들어 **유저가 직접 듣고 A를 선택**했다.
  A는 가장 밝고 빠르다(어택 후 9ms에 20dB 감쇠, 몸통 −13.4dB) — 측정만 보면 "몸통이 없다"
  였지만, 실제로 들었을 때 게임에 맞는 건 A였다. **소리 선택은 측정으로 대신할 수 없다**는
  게 이번 교훈. B/C(저역 우세)는 탈락.
  - **⚠ 후보 페이지 함정**: 아티팩트 CSP가 `data:` URI에 대한 `fetch()`도 막는다. 음원을
    `fetch(dataUri)`로 읽으면 조용히 실패한다 → `atob()`로 직접 디코드해야 한다.
    실패를 화면에 표시하지 않으면 "클릭해도 아무 일이 없다"로만 보인다.

- **후처리는 잡음 제거만**(유저 요구: "그대로 써"). 럼블 HPF 110Hz + afftdn nr=12 → 1.5ms
  리드인 트림 → 감쇠가 −45dB에 닿는 지점에서 컷 + 28ms 코사인 페이드 → 피크 −1.5dBFS.
  EQ 셰이핑·컴프·트랜지언트 셰이핑·피치 변경 **전부 없음**.
- **⚠ afftdn 지연 함정**: FFT 디노이저는 신호를 윈도 크기(~26ms)만큼 뒤로 민다. onset 기준
  트림을 하려면 **ffmpeg 패스 뒤 onset을 재검출**해야 한다 — 안 하면 앞무음이 붙어 반응이 늦다.
- **⚠ 원본 m4a는 저장소에 넣지 않는다** — 가공된 wav 2개(`discard.wav` 8.0KB · `call.wav` 9.9KB)만.

### ✅ 평상시 대국 BGM 추가 (유저 제공 `BackgroundBGM.mp3`)

리치가 안 걸린 평상시에 흐르는 배경음. **리치 BGM과 배타적**으로 동작한다.
- **자산**: `public/BackgroundBGM.mp3` (345초 루프, 8.7MB). 지연 생성 —
  `bgm.start()`가 처음 불릴 때 Audio 엘리먼트를 만든다(로비에서 8.7MB를 미리 받지 않게).
- **덕킹(크로스페이드)**: `riichiBgm.start()`가 `bgmSetDucked(true)`를,
  `riichiBgm.fadeOut()`/`stop()`이 `bgmSetDucked(false)`를 부른다. 리치가 들어올 때 700ms로
  빠지고, 리치가 빠질 때 1400ms로 돌아온다(리치 페이드아웃과 겹쳐 크로스페이드가 된다).
- **수명**: `view !== null && rankings === null`(대국 화면에 있는 동안)일 때만.
  effect cleanup에서도 정지해 언마운트·화면 전환에 새지 않는다.
- **볼륨 0 = 정지, 되감기 아님** — 다시 올리면 이어서 흐른다(리치 BGM과 같은 규약).
  실측 확인: 일시정지 0.72s → 재개 1.01s로 위치가 보존된다.
- **설정**: `Settings.bgmVolume`(기본 0.35) + 설정 패널에 "배경음악 음량" 슬라이더.
  `loadSettings`가 기본값과 병합하므로 기존 저장값이 있는 유저도 기본값을 받는다.
- **⚠ 미검증**: 로컬은 `ALLOWED_ORIGINS`(공개 도메인만 허용) 때문에 WS가 막혀 실제 대국에서
  덕킹 전환을 눈으로 보진 못했다. 오디오 엘리먼트 동작(루프·페이드·일시정지 위치 보존)과
  상태 기계는 검증했지만, **첫 실플레이에서 리치 진입/이탈 전환을 한 번 확인할 것**.
- **⚠ 용량**: 8.7MB라 대국 시작 시 다운로드가 붙는다(리치 BGM 4곡도 각 5~9MB로 같은 방식).
  느린 회선에서 BGM이 늦게 시작될 수 있다 — 필요하면 128kbps 재인코딩으로 ~5.5MB.

### ✅ 치·펑·깡·리치 선언도 실물 녹음으로 (C = 묵직한 쪽)

유저 요청 "C가 좀 묵직하니까 치퐁깡에 넣어볼래?". 후보 C를 `public/sfx/call.wav`로 채택 —
**타패는 A(밝고 빠름), 후로는 C(묵직함)** 로 역할을 갈랐다. 같은 녹음의 다른 타격이라
재질은 같으면서 무게만 다르다.
- **합성 패 타격(noiseBurst 클랙 + tileBody 공명)은 전부 삭제**. 진짜 패 소리 위에 가짜
  패 소리를 겹치면 그게 "여러 소리가 섞인" 느낌의 출처가 된다.
- **남긴 합성은 녹음에 없는 대역만** 담당한다:
  · `thump` — 녹음은 럼블 제거로 140Hz 아래가 없다. 판이 받는 초저역은 여기서 나온다.
  · 치의 "스윽"(noiseBurst 650→2900Hz) — 패를 끌어오는 마찰음. 타격이 아니라 성격이 다르다.
  · 깡 3타의 저역 붐 + 서브 사인(54→34Hz) — 네 장의 무게.
- **리치 선언(`riichi`)도 같은 처리**: 패를 눕히는 임팩트를 call.wav로 교체(게인 0.62),
  금속 링(1245Hz 비조화 배음)·반짝임은 패 소리가 아니므로 그대로 뒀다. 실측 +1.1dB,
  최대점 90ms(기존 95ms)로 배너 슬램(`BANNER_IMPACT_MS`=180ms) 동기 유지.
  - **참고**: 리치 선언은 이제 **패 소리가 두 번** 난다 — 클릭 순간 타패음(A), 그 뒤 배너가
    뜰 때 리치 임팩트(C). 리치는 패를 옆으로 눕혀 강조하는 별개 동작이라 물리적으로는
    맞고 시간도 충분히 떨어져 있지만, 하나로 줄이려면 `riichi()`의 tileShot을 빼면 된다.
- **타이밍(`at`)은 손대지 않았다** — 마지막 타가 컷인 글자 슬램(`CUTIN_IMPACT_MS`=230ms)에
  맞춰져 있다. 실측 타격 위치: 치 170ms / 펑 70·200ms / 깡 50·140·250ms / 리치 90ms.
- **레벨은 기존 합성판에 맞췄다**(실측, 마스터 버스 통과 후). 음색만 바뀌고 믹스 밸런스는
  그대로다:

  | | 훑기 | 타패 | 치 | 리치 | 펑 | 깡 |
  |---|---|---|---|---|---|---|
  | 현재 | −31.8 | −14.4 | −6.0 | −5.4 | −4.1 | −3.0 dBFS |
  | 기존 합성 | — | — | −7.1 | −6.6 | −5.4 | −3.7 dBFS |

  - **⚠ 함정**: 샘플 게인을 그대로 두면 후로가 기존보다 2~3dB 커진다(녹음 피크가 −1.5dBFS라
    합성 레이어 합보다 세다). 후로가 타패보다 10dB 이상 큰 건 **원래 설계**(컷인 순간)이니
    타패 기준으로 맞추면 안 되고, **기존 합성판 피크**를 기준으로 맞춰야 한다.

### ✅ 손패 훑기음(hoverTile)도 같은 녹음으로

유저 요청 "A랑 비슷한 느낌으로 손패 스크롤 소리도". **별도 파일을 만들지 않고 타패 샘플의
앞머리 50ms만 작게 재생**한다(`src.start(t, 0, HOVER_LEN)` + 게인 엔벨로프).
- 같은 소스라 재질이 정확히 일치하고, **타패음을 교체하면 훑기음도 자동으로 따라간다**.
- 잘린 자리는 마지막 14ms를 눕혀(HOVER_FADE) 클릭을 없앴다 — 실측 최대 샘플 점프 0.0004.
- 레벨(실측, 마스터 버스 통과 후): 타패 −14.4dBFS / 훑기 1회 −31.8dBFS(**17.4dB 아래**) /
  32ms 간격 8연속 훑기 −17.9dBFS(타패보다 3.5dB 아래, 클리핑 없음).
- 기존 합성 호버(noiseBurst 3.6kHz + tileBody 900Hz)는 삭제. 드래그 재정렬의 `slide()`
  "칙"은 **그대로 둔다** — 그건 타격이 아니라 마찰음이라 성격이 다르다.

### ✅ 한 번의 타패 = 한 번의 "탁" (섞여 들리던 원인 5가지)

1. **샘플 자체의 2차 타격** — 위 참조. 2차 타격 없는 타격만 후보로 삼아 해결.
2. **합성 폴백 4겹** — 샘플 미로드 시 클랙+tileBody×2+thump를 쌓아 전혀 다른 소리가 났다.
   **폴백 삭제** — 다른 소리가 나느니 무음이 낫다. 변주 3종 로테이션도 삭제, 파일 1개 고정.
3. **호버음이 뒤에 붙음** — 타패하면 손패가 재배열돼 커서가 가만히 있어도 다른 패 위로
   올라가고, 브라우저가 mouseenter를 쏴 "톡"이 났다. `hoverTile`에 **타패 후 250ms 억제**.
4. **에코 중복** — 내 타패는 클릭 즉시 + 서버 에코 뷰에서 또 감지된다. 옛 억제는 **600ms
   벽시계**라 회선이 느리거나 탭이 백그라운드였거나 재접속 리플레이면 창을 넘겨 두 번 났다.
   → **패 id 대조**(`pendingOwnDiscards`)로 교체. 국 넘어갈 때 clear.
   - **리치 선언도 타패다** — `DISCARD_LIKE`(discard·free_discard·riichi)로 통일. 빠져 있어서
     리치는 클릭에 무음, 에코로 뒤늦게 소리가 났다.
5. **⚠⚠ 봇 연타 = "타타타타"의 진범**. `BotAgent.decide`에 think-time이 **0**이고
   `HanchanController` 턴 루프는 **결정마다 `broadcastViews`**를 쏜다(:537). 그래서 내가 한 번
   버리면 **봇 3명의 타패가 수 ms 안에 연달아 도착**해 클릭 한 번에 "탁"이 4번 난다.
   - **처음 시도한 오답(기록용)**: AudioContext 시간축에 130ms 간격 스케줄러를 넣어 겹침만
     풀었다 → 뭉갠 덩어리가 **균등한 기관총 연타**로 바뀌어 오히려 더 나빠졌다("타타타타").
     겹침이 아니라 **개수**가 문제였다.
   - **채택**: 타패음을 낸 뒤 `OTHERS_MUTE_MS`(260ms) 안에 오는 **남의 타패는 버린다**.
     내 타패는 언제나 즉시 울린다 → **클릭 한 번 = "탁" 한 번**이 보장된다.
   - 봇에 think-time이 생기면 각 타패가 이 창 밖으로 벌어져 자연히 하나씩 다 울린다.
     **근본 해결은 봇 think-time(300~700ms)** — 게임 페이싱 문제라 별도 판단으로 남겼다.

### ✅ 효과음 지연 — 원인 3가지 규명, 1가지만 수정

28개 에이전트 교차검증으로 17건 중 3건만 진짜 원인으로 확정(14건 반증).

1. **[수정함] 마스터 버스의 DynamicsCompressor 2단 직렬 → 12ms**. 브라우저의
   DynamicsCompressorNode는 룩어헤드용 고정 프리딜레이(`kParamPreDelay=6ms`, Blink/WebKit/
   Gecko 공통)를 신호 경로에 물고 있어 **노드마다 6ms**가 붙는다. 컴프+리미터 2단이라 모든
   효과음이 12ms 늦었고 보상 코드는 전무(`latencyHint`/`baseLatency` 미사용).
   브릭월 리미터를 `softClipCurve()` WaveShaper로 교체 — **OfflineAudioContext 실측으로
   12.00ms → 6.00ms 확인**(소프트클리퍼 단독 0ms). 커브는 |x|<0.7 완전 선형(0.5→0.5000),
   그 위만 tanh로 눕혀 −0.64dBFS 브릭월.
   - **⚠ 남은 6ms = 글루 컴프. 안 뺐다**: 실측상 컴프가 타패음 하나를 **9.49dB**나 누르고
     있어(−4.91 → −14.4 dBFS) 빼면 모든 소리가 최대 3배 커진다 = 전 효과음 게인 재조정 필요.
     6ms는 지각 한계(~20ms) 아래.
2. **[의도된 동작. 되돌림] 연출 큐 직렬화**. 컷인/배너 계열 소리는 `productionQueue`에서만
   난다: 서버 에코 → enqueue → 리렌더 2회 → passive effect. 큐가 비어도 2커밋이 들고, 앞
   연출 재생 중이면 그 ttl(1050~2600ms)까지 밀린다.
   - enqueue 시점으로 앞당기는 수정을 넣었다가 **되돌렸다** — **"연출이 나오고 소리가 나는
     순서가 의도"**(유저 확정). 소리가 그림보다 먼저 나오면 연출이 어긋난다.
     `enqueueProduction`에 이 규약을 주석으로 못박아 뒀다.
3. **[되돌림] 후로 낙관적 재생**. 펑/치/깡을 클릭 즉시 울리게 했다가 같은 이유로 되돌렸다
   (컷인보다 소리가 먼저 나온다). 론·쯔모는 애초에 손대지 않았다 — 그 소리들은 컷인 글자가
   꽂히는 순간(230ms)에 피크가 오도록 내부 프리롤이 짜여 있다.
- **반증돼 손대지 않은 것들**: `latencyHint` 미지정(기본값이 이미 interactive라 정상),
  play()의 6ms 페이드인, thump 8ms 어택, noiseBuffer 생성 비용, onClick vs pointerdown,
  send() 순서, readyAudio 드롭, 레이트리밋.
- **⚠ 코드 밖 변수**: 블루투스 출력은 100~200ms를 얹는다 — 코드로 못 줄인다.

## 2026-07-22 (52차 — 등급 폐기 방침 + 전역 UX/연출 규약 + 신규 16종 설계)

설계 확정 + **1~3단계 구현 완료**(등급 폐기 · 사운드 · 증강 연출 톤). 4~6단계(모달 소급 ·
기존 22종 버프 · 신규 16종)는 다음 차수.

### ✅ 1단계 — 등급 폐기 (구현 완료)

- `AugmentRegistry`: `rollChoices`/`rollFromTier`/`TierWeights` 삭제 → **`rollUniform`**
  (카탈로그 전체 균등·비복원) 하나로. `DraftController`의 `tierForStage`·`weights`·
  등급 고갈 폴백·`grantChain`도 함께 제거.
- 규칙 `augment.draft.weight.{silver,gold,prism}` 삭제, `AugmentOfferedPayload.tier` 삭제.
  `PlayerStatsRaw.augmentTierPicks`는 저장된 통계 호환을 위해 필드만 남기고 누적 중단.
- **`gambler`(전환 : 골드)·`gambler_pro`(전환 : 프리즘) 삭제** + `AugmentDef.grantsRandomTier`
  개념 제거(core/protocol/server/client 전부).
- 클라: 등급 칩·등급 분포 그래프·도감 등급 필터/그룹·샌드박스 등급 그룹 제거 →
  **이름 가나다순 한 덩어리**. 드래프트 카드·이름표 알약은 전부 prism 톤으로 통일.
- 카탈로그 **55 → 53종**(+표준 4 = 57종).
- **⚠ 축소된 풀이 드러낸 잠재버그 2건**(둘 다 같은 뿌리): 균등 추첨으로 `discard_recall`·
  `counter` 같은 "자기 이벤트 타입을 만드는" 증강이 자주 뽑히자, 이벤트 로그만 리듀서로
  재적용하던 두 경로가 죽었다("No reducer registered for …"). 51차에 고친
  `reconstructGame`에 이어 **`Hanchan.test`의 리플레이 라운드트립**도 같은 규약
  (AUGMENT_DRAFTED에서 즉시 install)을 따르도록 수정.

### ✅ 2단계 — 효과음 (구현 완료)

"턱턱 퍽퍽"의 원인은 **어택 0 + 급정거 릴리스**였다.
- 프리미티브 3종(`play`/`thump`/`noiseBurst`) 전부 **최소 어택 `MIN_ATTACK`(6~8ms)
  선형 페이드인** + `release()` 헬퍼(`setTargetAtTime` 지수 감쇠, τ=dur×0.42)로 교체.
  기존 `exponentialRampToValueAtTime(0.0001, at+dur)`은 목표 시점에 딱 끊겨 딱딱했다.
- **증강 전용 음색 계열 신설**: `augmentTone`(비조화 배음 1:2.02:3.01 벨) ·
  `augmentSwell`(역재생형 필터 스윕) · `augmentGlitch`(고음 파편). 이를 묶은
  `sfx.augment(weight)` / `sfx.augmentSoft()`가 **후로음(`sfx.call`) 자리를 전부 대체** —
  증강 발동·봉인·스파이 적발·무덤 도굴이 이제 타악이 아니라 "번개 스침" 소리를 낸다.

### ✅ 2c단계 — 사운드 3차 (유저 피드백: "에코 금지 · 사이버네틱 금지 · 바둑돌")

방향이 두 번 뒤집혔다 — **최종 확정 방향: 실물 타악, 잔향 없음, 신스 어휘 금지.**
- **리버브 전면 철거**: 2b에서 넣은 Convolver 센드/리턴·`wet` 파라미터 전부 삭제
  ("에코같은 느낌이 있으면 안돼"). 릴리스도 τ=dur×0.3·3τ 컷으로 조여 꼬리를 없앴다.
- **신스 어휘 금지 규약**: 필터 스윕 라이저·벨 배음(augmentTone)·글리치·triangle 장음이
  "사이버네틱"의 주범 — 전부 삭제. sfx.ts 헤더에 금지 규약으로 명문화.
- **돌 음역 통일**: `tileBody`를 사인 2부분음(×1.62)·50ms 감쇠·±1.5% 디튠의 돌 노크로
  재작성. 치·펑·깡·리치 임팩트의 노크 주파수도 돌 음역(560~780Hz)으로 상향.
- **증강음 = 큰 북 "둥"**: 깊은 피치드랍(96→38Hz) + 가죽 질감(저역 노이즈) + 낮은 테두리
  노크. 0.4s 안에 끝나고 저역 위주라 밝은 돌 클랙(후로)과 음역대로 구분된다.
- **신규 사운드 2종**: `sfx.hoverTile()` — 손패 호버 시 아주 작은 돌 "톡"(28ms 레이트리밋,
  빠르게 쓸면 "타라라락"), OwnArea onMouseEnter에 배선. `sfx.callPrompt()` — 치·펑·깡·론
  버튼이 뜨는 순간의 은은한 "삑"(pass 옵션이 있는 내 리액션 프롬프트에만).
- **부수 수정**: 외부에서 진행 중이던 mono_world 전용 모달(pickModal)의 누락 상수
  `MODAL_PICK_TYPES` 정의 위치 확인 — 중복 정의 제거로 빌드 복구.

### ✅ 2b단계 — 사운드 재작업 (플레이 피드백: "싼맛·귀에 거슬림·미니게임 같음")

1차 사운드 패스가 여전히 가벼웠던 원인 3가지를 갈아엎었다.
- **룸 리버브 신설** — 건조함("미니게임 소리")의 주범. 합성 임펄스(1.5s, 지수감쇠 노이즈에
  1차 로우패스로 어둡게) → ConvolverNode 센드/리턴 버스. 프리미티브 전부에 `wet` 파라미터
  (기본 0.12~0.18, 소리별 조절)가 생겨 "탁자 위·방 안에서 난 소리"가 된다.
- **패 타격 = 3겹** — 로우패스 노이즈 하나로 뭉갠 "챱"에는 패의 실체가 없었다.
  실물 패 소리의 세 겹(①매트 클랙 3kHz ②`tileBody` 목질 공명 — 비조화 부분음
  1:1.74:2.61 ③상판 저역 thump)을 신설 `tileBody()`로 쌓았다. 치·펑·깡·리치 임팩트를
  전부 이 3겹으로 통일하고 무게(2타·3타의 저역)를 키웠다.
- **증강음 = 초능력의 무게** — 고음 스웰(→6.8kHz)+높은 벨+글리치가 "삥" 하는 싸구려
  알림음이었다. 글리치 삭제, 스웰을 저역(220→2.4kHz)으로, **서브베이스 드랍**(~34Hz) 추가,
  벨은 **서브 기음 포함 저음 벨**(기본 620Hz↓)로 교체 — 잔향을 가장 깊게(wet 0.4~0.5) 준다.

### ✅ 도박사의 손 UX (플레이 피드백)

- **왕패 자리 설명**: 모달에 자리별 라벨+색 구분(영상패 초록 / 도라 표시 금색·공개분은
  강조 / 뒷도라 보라) + 범례. `deadWallSlotInfo(idx, flipped)` 헬퍼 — 코어 규약
  ([0..3]=영상패, 4+짝수=도라 표시, 그 옆 홀수=뒷도라)을 화면 언어로 옮겼다.
  증강 description/detail에도 같은 설명 추가.
- **매 턴 자동 개방 제거**: 선택창은 "🎲 도박사의 손 — 왕패 교환" 버튼을 눌렀을 때만
  열린다(절벽 위 꽃은 깡 직후의 강제 선택이라 자동 개방 유지). `rinshanDismissed` 초기값을
  source==="gamble"이면 true로.

### ✅ 3단계 — 증강 연출 톤 (구현 완료)

- `AUGMENT_CUTIN_TONES`(augment·grave·spy)에 `.cutin-aug` 모디파이어 →
  **대각 섬광 2줄(`.cutin-bolt`, 200~260ms)** + **스캔라인(`.cutin-scan`)** 이 스치고,
  밴드 슬램이 얇고 빠른 `cutin-band-fast`로 바뀐다. 흔들림은 뺐다(후로의 어휘).
- **증강마다 전용 연출**은 카테고리(8종)로 스케일 가능하게 구현 — `Production.augId`를
  실어 `data-aug-cat`으로 내보내고, CSS가 계열별 `--fx-color`/`--fx-glow`(점수 금색 ·
  정보 청록 · 손패 보라 · 후로 초록 · 리치 주황 · 수비 파랑 · 교란 분홍 · 기타 라벤더)와
  밴드·글자 색을 갈라 준다. 컷인 좌측에 계열 아이콘이 튀어나온다(`.cutin-aug-icon`).
- `prefers-reduced-motion`에서 섬광·스캔라인은 꺼진다.

### 사용자 확정 3가지 (docs/10 §2a·§2b)

1. **등급(Silver/Gold/Prism) 폐기 예정.** 모든 증강이 같은 프리즘급 도파민을 줘야 한다.
   등급 가중치·등급 통일·고갈 폴백도 함께 걷어내고 균등 비복원 3지선다로 단순화.
   **`gambler`·`gambler_pro`(전환 : 골드/프리즘)는 개념째 성립하지 않아 삭제 대상.**
   코드의 `tier`/`RuleLayer`는 합성 우선순위로만 남긴다.
2. **패를 고르는 증강은 전부 "새 탭"(모달).** 액티브 버튼 자리에 후보 버튼을 늘어놓지 않고
   실제 패를 보고 고르게 한다 — `.rinshan-pick-overlay` 패턴을 **기존 구현까지 소급 적용**.
   플레이어 지목은 기존 실제 지목 연출(`ARM_MODE: "opp"` + 피격자 전면 컷인) 유지.
3. **증강 연출은 치·펑·깡과 확실히 달라야 한다.** 후로가 "쿵" 하는 타격 톤이라면 증강은
   **번개가 스치듯 짧게 번쩍이는 초자연 톤**. 증강마다 전용 연출 필수(기본 컷인 금지).
   **효과음도 손본다** — 지금은 "턱턱 퍽퍽"으로 딱딱하다: 어택에 3~8ms 페이드인(클릭
   노이즈 제거), 릴리스 1.5~2배로 꼬리 남기기, 사각/톱니 배음 축소, 증강음은 후로음과
   음색 계열 자체를 분리(후로=타악 / 증강=벨·글리치·swell).

### 기존 59종 재판정 (docs/16 §1b) — 삭제가 아니라 **버프 대상**

- **A 등급 폐기로 소멸(2)**: 전환 : 골드 · 전환 : 프리즘
- **B 발동 순간 없는 순수 배율/패시브(7)**: 일확천금 · 대기만성(±동풍) · 만년 오야 ·
  가불 인생 · 카르마 · 이중 선언 · 붉은 손길
- **C 정보만 주고 끝/상위호환에 밀림(3)**: 영상 정찰 · 선언 간파 · 이면투시
- **D 조건이 너무 드묾(4)**: 역만 방어술 · 유국역만 · 철벽 · 승부수
- **E 조용한 규칙 완화(4)**: 무형화료 · 탕야오 해방 · 절벽 위에 피어난 꽃 · 개문선언
- **F 체감이 느리거나 경제형(2)**: 자리 바꿈 · 판돈 굴리기
- 나머지 41종은 프리즘급으로 판단해 유지

### 신규·재조정 16종 설계 (docs/16 §1c)

리치 봉인 · 뒤섞인 아홉 개의 연꽃 · 해저의 지배자 · 한 끗 차이 · 정적의 손 ·
봉인된 보물 · 예지 · 격(格) · 왕패의 주인 · 스텔스 리치 · 성립하지 않는 깡 · 본장 사냥꾼
\+ 기존 재조정 4종(절벽 위에 피어난 꽃 +6000 · 탕야오 해방 +2000 · 무형화료 +2000 ·
카운터 직격 론 +6000).

- **스텔스 리치**는 29차에 `shadow_riichi`로 보류했던 안건 — PlayerView의 리치 은닉
  (정보 계층 확장)이 전제다.
- **정적의 손**은 "고른 패가 타가의 화료패면 방총"이라는 **무페널티 원칙의 명시적 예외**
  (사용자 지정). 문서에 예외로 못박았다.
- **봉인된 보물**은 "안깡패 하나당"의 해석이 갈린다 — 4장 전부 도라(+4판) vs 묶음당 +1판.
  구현 전 사용자 확정 필요.

## 2026-07-22 (51차 — 용어 통일 + 플레이 버그 7건 + 실버/골드 프리즘화 9종)

신규 증강 추가 전 정리 라운드. 사용자 지시 4묶음(용어·버그·버프·노잼 삭제)을 전부 반영했다.
콘텐츠 카탈로그 72 → **55종 (Silver 6 / Gold 17 / Prism 32) + 표준 4 = 59종**.

### 용어 통일 (전 소스·문서 일괄 치환)

`순자 → 슌쯔` / `강 → 바닥` / `단기(탄키) → 단기` / `명깡 → 대명깡` / `멘츠 → 멘쯔`.
**⚠ `강` 치환은 조사 화이트리스트 정규식으로만 안전하다** — `증강·강화·강제·강한·강도`가
전부 오탐이라 `(?<![가-힣])강(?=(에|의|은|이|을|…)?(?![가-힣]))` 형태로 걸렀고,
"강도(intensity)"만 수동 검토했다. 증강 표시명 `안개 덮인 강 → 안개 덮인 바닥`.

### 버그픽스 7건

- **도박사의 손** — 왕패 도라 표시패 자리를 집어 가면 표시패가 손패로 따라가 도라가
  갱신되지 않았다. `doraIndicators`는 tileId 추적이라 교환 리듀서에서 **밀어 넣은
  쯔모패로 갈아 끼운다**(뒷도라는 '표시패 다음 자리'를 positional하게 읽어 자동 정합).
- **우는 국사무쌍** — `kokushi_pon` 후로 뒤 남은 손패가 **표준형으로도 텐파이로 잡혀**
  "69삭 양면"이 오름패가 됐다. `DecomposeOptions.kokushiOnly` 신설 → `scoringOptionsOf`가
  국사 후로가 하나라도 있으면 켠다. 분해 한 곳을 막으니 화료·텐파이·대기·후리텐이 전부 정합.
  **클라 `waitDecompOptions`도 같이 고쳐야 한다**(46차 교훈의 재발).
- **이면투시** — 발동 후 깡으로 뒤집힌 새 뒷도라가 안 보였다. `DORA_FLIPPED` 리액션으로
  발동 플래그가 있으면 뷰 채널을 최신 우라 목록으로 재발행.
- **안개 덮인 바닥** — "내 바닥만 은닉" → **테이블 전체 은닉, 보유자만 네 바닥을 전부 열람**.
  `visibility.discards` Modifier를 zoneOwner 기준에서 viewer 기준으로 뒤집었다.
- **등가교환** — 1:1 교환 3회(선택창 6번)를 **내 3장 일괄 → 상대 3장 일괄** 2단계로.
  `swap3_give{gives[3]}` → `swap3_take{takes[3]}`. **옵션 폭발 회피가 설계 제약**:
  C(14,3)=364 · C(13,3)=286은 되지만 곱(10만)은 불가(FlowController.submit JSON 완전일치).
  배열은 **오름차순 고정**이어야 제시 옵션과 일치한다.
- **미래를 보는 자** — 드롭다운 메뉴 → 전용 모달(뽑힌 3장을 실제 패로 보여주고 버릴 1장 선택).
- **금단의 족보** — 로컬 역 3종 해금은 확률도 낮고 재미도 없어 **파일째 삭제**,
  **무너진 국경(broken_border, Prism)**으로 대체.

### 무너진 국경 (broken_border) — 신규 Prism

무늬 상관없이 슌쯔를 만든다(2만·3통·4삭도 몸통). 코어 규칙 `scoring.mixedRuns` 하나로
`decompose.extractSets`가 후보 슌쯔의 **무늬 조합까지** 시도한다(wrapRuns와 동형 확장 —
firstKey가 슌쯔의 어느 위치든 될 수 있어 pos 0~2 × 무늬 27조합, firstKey 미소비 후보는 컷).
**⚠ 무늬를 요구하는 역은 반드시 `isPureRun` 가드**를 걸어야 한다(삼색동순·일기통관·이페코) —
안 걸면 2만3통4삭이 `first(s).suit`로 '만 슌쯔'로 오인돼 역이 헛성립한다.

### 실버/골드 프리즘화 9종

| 증강 | 이전 | 지금 |
| --- | --- | --- |
| 투시 | 상대 손패 무작위 3장 | **상대 3명 손패 전체 상시 공개**(`visibility.hand` → public) |
| 천하무적 | 무방총 완주 시 최종 +8000 | **액티브 · 2국당 1회 · 그 국 동안 타가 론 불가**(코어 규칙 `win.ronImmune` 신설) |
| 죽기살기 | 마이너스를 0에서 멈춤 | **내려간 만큼 부호가 뒤집힌다**(−8000 → +8000) |
| 찬탈자 | 점수 계산만 오야 취급 | **`round.dealerSeat`를 실제로 빼앗는다** → 자풍 재산정·진짜 렌짱·오야 로테이션 이동 |
| 무르기 | 국당 1회 | **매 턴 1회**(alchemist와 같은 `(roundKey, 내 버림 수)` 턴 서명) |
| 카운터 | 공탁 대납 + 일발 소멸 | 위 둘 + **먼저 화료 시 선리치자의 손 가치를 뱅크에서 통째로 수령** |
| 숨은 칼날 | 다마텐 론 +2판 | +2판 + **리치 없이도 뒷도라 적용**(코어 규칙 `scoring.uraWithoutRiichi` → `WinContext.uraAlways`) |
| 오픈 리치 | +2판 / 비리치 론 +2판 더 | **비리치자가 공개된 오름패를 버려 론당하면 역만**(정석 하우스룰) |
| 선언 간파 | — | 이미 48차에서 무료화 완료(변경 없음) |

- **코어 신설 훅 5개**: `RuleContext.winType`·`isClosed`(화료 문맥 규칙용) /
  `WinContext.fromPlayerId`·`fromRiichi`(론의 쏜 사람 — `sys.settleWin`이 `w.from`을
  `buildWinContext`에 직접 넘긴다) / `WinContext.uraAlways` / 규칙 `win.ronImmune` ·
  `scoring.uraWithoutRiichi` · `scoring.mixedRuns`.
- **⚠ 커스텀 역 check는 state를 못 본다** → "이번 국에 오픈 리치를 선언했는가" 같은 상태
  조건은 `win.blockedYaku` Modifier로 게이팅한다(미선언이면 역을 금지 목록에 넣는다).
  보유자가 여럿일 수 있으므로 Modifier는 **자기 holder의 판정에만 관여**하고, 비보유자는
  `yakuHolders` 검사로 거른다(둘 중 하나만 있으면 새거나 서로 덮어쓴다).
- **⚠ 가상 화료 평가 시 화료패는 손패 밖의 tileId**여야 한다 — 손에 있는 같은 종류를 집으면
  `buildWinContext`가 그 패를 빼고 다시 붙여 13장이 되어 분해가 통째로 실패한다(카운터에서 발현).
- **부수 수정**: 클라 `waitDecompOptions`에 `broken_wall`(순환 슌쯔) 누락분도 함께 보강.
- **검증**: 4패키지 타입체크 클린, 클라 빌드 통과.

### 노잼 증강 17종 삭제 (사용자 판정)

"특별히 바뀌는 것 없이 추가 점수만 주는" 실버/골드를 전부 제거했다. 목록·사유는 docs/16 §1a.
- **A. 순수 조건부 +판/+점수 10종**: 연장전·네 개의 기둥·번개손·다음을 위한 기약·노련함·
  대기의 미학·기세(반장/동풍)·비움의 미학·모방범
- **B. 선언은 있으나 결과가 점수뿐인 7종**: 출사표·레이즈 선언·곁불·번개 계약·외길 계약·
  도라 옹립·지뢰 매설
- 함께 정리: `wait_art_*` 역 이름, `.rt-mine` CSS, 클라 5맵의 6개 액션, `useDoraFx`의
  개인 도라 채널(곁불·도라 옹립), 정보 패널 행 3종, 테스트 6파일(빈 파일이 된
  `new_augments.test.ts`는 삭제).
- **⚠ 삭제가 드러낸 잠재버그**: 실버 풀이 12→6으로 줄며 `counter`가 자주 뽑히자
  `reconstructGame`(이어하기 1차 패스)이 **AUGMENT_DRAFTED에서 증강을 설치하지 않아**
  "No reducer registered for event type: CounterStruck"로 재구성이 죽었다. `readReplay`엔
  있던 처리가 resume 경로에만 빠져 있었다 — 증강이 자기 이벤트 타입의 Reducer를 install에서
  등록하므로 **두 경로 모두 드래프트 시점에 설치**해야 한다. 수정 완료.
- **검증**: 4패키지 타입체크 클린, 전체 **439개 통과**(44파일), 클라 빌드 통과,
  사람1+봇3 반장전 완주 테스트로 축소된 드래프트 풀(Silver 6)도 정상 확인.

## 2026-07-22 (50차 — 신규 백로그 구현 착수: 무덤 도굴 · 스파이)

16 §2 백로그를 score 높은 순으로 구현 시작. **2종 완료(무덤 도굴 grave_rob · 스파이 spy, 둘 다 Prism)**.
콘텐츠 카탈로그 70 → **72종**(Silver 12 / Gold 28 / Prism 32).

### 스파이 (spy)

- 게임당 1회, 자기 턴에 손패 1종을 **비밀 지정** → 이후 상대가 그 종류로 화료하면
  그 화료의 **이득이 통째로 홀더에게** 온다. 화료 자체는 성립하고 지불자들이 내는
  액수도 그대로 — 돈의 도착지만 바뀐다(총액 불변).
- **구현**: `ROUND_SETTLED` 인터셉터에서 `deltas[winner]`(양수)를 `deltas[holder]`로 이전.
  덤터기(scapegoat)의 지불 재배선과 같은 계열. `winInfos[].winningTileId`의 kind를
  지정 kind와 비교해 판정한다.
- **정보 계층**: 지정 내용은 `view:{holder}:spy:mark`(본인 전용)라 상대는 "무언가 찍혔다"만
  안다. 적발 순간에만 `view:*:spy:caught:{holder}`로 전원 공개 — 이 비대칭이 증강의 본체.
- **연출**: 본인 뱃지 🕵️(찍은 패 종류 표시, ActiveInfoBadges) + 적발 시 전용 컷인 톤 `spy`
  (청록 형광, `spy-scan` 스캔라인이 정체를 훑고 지나감, 파티클 16·shake 3, 2200ms).
  `bannerShown.spyCaught` Set으로 홀더별 1회만 알림(멱등 규약 준수).

- **무덤 도굴**: 게임당 1회, 자기 턴에 **상대 바닥의 아무 과거 버림패**를 파내 그대로 화료.
  지불은 쯔모 취급(전원 분담) — 한참 전에 버린 사람에게 방총 책임을 묻지 않는다.
  자기 바닥은 도굴 불가(후리텐 존중).
- **⚠ 핵심 함정**: `FlowController.resolve`는 **`win` 액션 타입에서만 `sys.settleWin`을
  호출**한다. 커스텀 액션이 `WIN_DECLARED`를 직접 방출하면 이벤트는 남지만 국이 정산되지
  않고 `awaiting`에 머문다. → 도굴은 **패 교체만** 하고(쯔모패→패산, 무덤패→손·lastDrawnTile),
  버림을 소비하지 않아 같은 턴 프롬프트가 다시 열리며 그때 **표준 쯔모 옵션**이 떠 있다.
  화면에서는 "도굴 → 쯔모" 두 박자. 신규 화료형 증강은 이 경로를 따를 것.
- **막힌 상태 방지**: `holderTurnOptions`가 `evaluateWin`+`win.requiresYaku`로 **실제 화료가
  성립하는 무덤 패만** 후보로 낸다(kind 단위 메모로 평가 비용 절감). 그래서 '두 번째 날치기'가
  아니라 확정 화료 버튼이 된다.
- **연출**: 전용 컷인 톤 `grave` 신설(흙빛 금 밴드 + `grave-rise` 관이 열리듯 솟는 빛,
  파티클 18·스피드라인·충격파 링, shake 3, 2000ms) + 상대 바닥 클릭 발동(`ARM_MODE: opp-river`).
  `riverOptionFor`의 `opp-river` 분기를 **최근 1장(snatchId) 외에 바닥 전체(graveId)**도
  매칭하도록 확장. 발동 시 전원 공개 채널로 파낸 패 종류 노출.
- **부수 수정**: `ACTION_LABEL`에 `time_stop_use`("시간 정지") 누락 보강 — 없으면 컷인에
  원시 액션 문자열이 노출됐다.
- **검증**: 4패키지 타입체크 클린, 전체 **446개 통과**(43파일, +13), 클라 빌드 통과,
  두 증강 모두 크래시 스위프 8시드 완주.

## 2026-07-22 (48차 후속 — 무페널티 전면 스윕 + 등급 재정의)

사용자 지시: **"전부 리스크 제거해 모든 증강이 프리즘답게. Silver=약한 프리즘,
Gold=애매한 프리즘, Prism=확실한 프리즘."**
- **PROJECT_CHARTER 1.3**: 등급을 **프리즘의 세기**로 재정의(안전도가 아니다) +
  **무페널티 원칙** 신설 — 위약금·상환·벌점·역 봉인·행동 금지·내 점수를 거는 도박·
  상대를 이롭게 하는 구조 전부 금지. **도박형도 예외 아님**("빗나가면 잃는다"를 빼고
  "걸면 크게 딴다"만). 전원 공개는 Rule #4의 전제라 페널티가 아니며 유지.
- **10_AUGMENT_SYSTEM §0/§2** 갱신(무페널티 원칙·등급 표 재작성).
- **코드 스윕 18종**: 선언 간파(상대에게 1000점 지불)·출사표(-1000)·번개 계약(-2000)·
  외길 계약(-8000)·만년 오야(타가 쯔모마다 오야 몫 지불)·기생충(숙주 손실 분담)·
  물러설 수 없는 선언(전 역 봉인)·오픈 리치(손패 전체 공개)·큰손(방총 시 만관 지불)·
  핏빛 계약(0.5배)·일확천금(손해도 2배)·가불 인생(-15000 상환)·모 아니면 도(점수 절반 차감)·
  레이즈 선언(공탁 2000)·뚫린 천장(보전 캡 32000)·판돈 굴리기(예치분 회수)·
  우는 국사무쌍(4판 강등 → **진짜 역만**)·연금술사/염색(리치 중 금지). 상세 표는 16 §1.
- **⚠ 스윕 중 자체 발생 버그 2건 발견·수정**: (1) 리치 금지 해제를
  `if (riichi != null) return null;`로 구현하면 **뒤따르는 검증이 전부 건너뛰어진다**
  (연금술 5회 한도·턴당 1회·손패 보유, 염색 국당 1회 등) → 검사 자체를 삭제.
  (2) 선언 간파 봇 정책이 사라진 비용을 여전히 게이팅 → 제거(+서버 테스트 갱신).
- **검증**: 4패키지 타입체크 클린, 전체 **427개 통과**(41파일). 페널티를 단언하던 테스트
  8건은 새 계약으로 뒤집었다(no_retreat 봉인·오픈리치 손패공개·기생충 손실분담 2건·
  간파 지불 2건·우는 국사 4판·큰손 다운사이드).
- **무작위 → 선택 전환 (후속, 사용자 확정)**:
  - **단색 세계(suit_unify)**: 통일 색 무작위 → **만·통·삭 직접 선택**(payload `{}`→`{suit}`,
    PRNG 미소비). 클라 `ActionTiles`에 "무늬만 지정" 분기 추가(후보 버튼에 그 색 대표 패).
  - **미래를 보는 자(future_sight)**: 무작위 3장 선정은 **유지**(운의 폭발), 그중
    **바닥에 버릴 1장을 선택**으로. 무작위 3장이 `prngState`에서 결정적이라
    `holderTurnOptions`와 `toEvents`가 같은 3장을 봐 2단계 프롬프트가 필요 없다(`pickThree`).
  - **통째로 바꾸기(full_hand_swap)**: 맞교환 → **강탈**. 상대 손패를 통째로 가져오고
    **내 손패는 상대가 아니라 패산 맨 밑**으로, 상대는 패산 위에서 새로 받는다
    (내 패가 상대를 강화하던 경로 제거). 패산 총량 불변, 빼앗긴 패를 되받는 일도 없다.
  - **등가교환(hand_swap3)**: 무작위 수령 → 대상 손패를 **나에게만 공개**(`revealTiles:*`)하고
    **1:1 교환 3회**. **⚠ `FlowController.submit`은 제시 옵션과 JSON 완전일치를 요구**하므로
    "내 3장+상대 3장" 단일 액션은 10만 조합이 되어 불가능 — 1:1 3회(182개)로 쪼갰다.
  - **도박사의 손(rinshan_gamble)**: 페널티가 정체성이라 능력 자체를 교체 —
    **왕패 14장 상시 열람 + 게임 3회 왕패 임의 패와 쯔모패 교환**(깡 불필요).
    절벽 위에 피어난 꽃("깡할 때만")과 역할이 겹치지 않는다. `gamble_start`·무작위 타패
    인터셉터·쿨다운 전부 삭제, `take_rinshan` index 0~13으로 확장, 봇 정책 신설
    (텐파이 + 왕패에 오름패가 보이면 집어 즉시 쯔모).
- **클라 배선**: `swap3_take` 액션 등록 + **1:1 교환 전용 모달**(넘길 내 패 → 가져올 상대 패
  2단계 클릭, `(give,take)` 쌍 인덱스로 offered 완전일치 제출. 액티브 버튼 목록에서는 제외 —
  182개 옵션이 메뉴에 쏟아지지 않게). 등가교환 ARM_MODE `swap3`→`opp`(대상 지정만 클릭),
  옛 3장 조합 경로(`swap3.byKey`·`pickSwapTile`)는 payload에 `give`가 없어 자연 비활성 —
  레거시 주석만 남김. `gamble_start` 제거, 왕패 선택 모달을 앞 4칸 고정에서 **제시된 옵션
  전체**로 일반화, 도박사의 손 **손패 잠금 UI 삭제**(무작위 타패가 없어져 정반대 의미가 됐다).
- **검증(최종)**: 4패키지 타입체크 클린, 전체 테스트 **433개 통과**(41파일), 클라 빌드 통과.


## 2026-07-22 (49차 — 관리자 증강 테스트(샌드박스) 게임)

증강 구현을 직접 눌러 보며 확인할 수단이 없어(정상 드래프트로만 획득 가능) 개발·검증이
느렸다. **관리자 전용 1인 시험 게임**을 붙였다 — 구현된 증강 전부를 목록에서 골라 즉시
획득하고, 언제든 초기화한다.
- **서버**: `sandboxStart{mode?}`(관리자 1 + 봇 3, 드래프트 없이 즉시 시작) ·
  `sandboxGrant{augmentId,target?}`(진행 중 즉시 지급, 봇 대상도 가능) ·
  `sandboxReset{augments?,mode?}`(좌석별 사전 지급 목록으로 새 판 / 빈 목록이면 백지 초기화).
  전부 isAdmin 게이트. 서버→클라 `sandbox{code,mode,augments}`.
- **코어**: `HanchanConfig.presetAugments`(첫 국 **배패 전** 좌석별 사전 설치) +
  `HanchanController.grantAugment()`(진행 중 설치) — 둘 다 드래프트와 같은 경로
  (draftPick → AugmentDrafted → installAugment), 스테이지 완료 플래그만 남기지 않는다.
  게임 중 `catalog` 메시지에 detail·draftStages·modes·grantsRandomTier를 포함하도록 보강
  (인증 시 카탈로그보다 빈약해 게임 중에는 도감 상세가 사라지던 불일치도 함께 해소).
- **초기화 = 판 교체**: install은 rules/effects/actions/turnOptions 등록이라 완전한 되돌리기가
  없다 → `requestAbort()` → `onGameAborted`(sandboxRestarting 분기) → `restartSandbox`로
  엔진째 새로 만든다. 이 경로는 `gameAborted`를 보내지 않아 홈으로 튕기지 않고,
  봇은 새 인스턴스로 교체 + `HumanAgent.resetForNewGame()`으로 지난 판 대기 결정을 버린다.
- **기록 오염 방지**: 샌드박스 판은 리플레이 파일·게임 인덱스(recordGame)·누적 통계
  (finishStats)를 전부 남기지 않는다(도감·리더보드 근거 데이터 보호). `liveGames` 목록에서
  제외하고, 방 주인 재접속 외의 `joinRoom`은 `ROOM_NOT_FOUND`로 존재를 감춘다.
- **클라**: 홈 "🧪 증강 테스트" 카드(모드 선택 + 시작, 관리자 전용) → 게임 좌상단 `🧪 증강`
  버튼 → `SandboxPanel`(전 카탈로그 목록·등급 필터·검색·대상 좌석·＋ 즉시 획득·도감 상세·
  새 판/초기화). 관리자 홈은 왼쪽 열 높이 잠금(`home-top-left-admin`)을 풀어 카드 잘림 방지.
- 회귀 테스트 `packages/server/test/Sandbox.test.ts` 15건 신설(권한·시작·지급·초기화·기록 없음),
  전체 426건 통과. 문서: 15 §5c(주 문서) · 12 §2 · 10 §4.

## 2026-07-22 (48차 — 증강 도파민 리디자인: 철학 개정 + 카탈로그 전수 판정 + 삭제 31종 반영)

"증강이 수비적이라 도파민이 부족하다"는 사용자 방향 전환에 따라 설계 문서를 전면 개정하고,
**삭제 31종을 코드에 반영**했다. 개편 21종·신규 백로그 59종은 미착수(16 §4).
- **PROJECT_CHARTER 1.2**: 디자인 규칙 개정 — "증강은 순간을 만든다"·"증강은 상식을 부순다"·
  "패배는 다음 판의 연료다"("너 그래 이겨라, 다음 판엔 내가") 신설. 구 Rule #3(운보다 선택)·
  #5(실력 장기 승률)는 참고 원칙으로 강등. 도파민 우선 원칙 + **노잼 금지 조항**(역 현상금·
  조건부 패시브 점수/판 보너스·정산 로그 전용 효과·무선택 상시 보정 금지) 신설.
- **10_AUGMENT_SYSTEM 1.1**: §0 도파민 리트머스 4문항(보이는가/부수는가/이야기가 되는가/
  대응이 되는가) + 금지 패턴·허용 방향. addHanBonus/addWinPointBonus/yakuBountyBonus 헬퍼만
  쓰는 증강은 자동 탈락으로 규정.
- **16_AUGMENT_REDESIGN 신규**: 카탈로그 105종 전수 판정 — **삭제 31**(bounty_* 6종 전부,
  표준 3종 cheap_riichi·tsumo_bonus·vengeance 포함 / Silver 22·Gold 9·Prism 0) /
  **개편 21**(컨셉 유지, 보상을 점수→규칙 파괴로 교체하는 방향 명시 — 지뢰 매설=밟은 패 강탈,
  기세=연승 특권 사다리, 찬탈자=진짜 오야 찬탈 등) / **유지 53**. 브레인스토밍 120건 →
  심사 통과 **신규 백로그 59종**(카테고리 10종·score 랭킹, 상위: 무덤 도굴·파죽지세·백지수표·
  시간 도둑·찰나의 손·승부 매입·일도류·언령) + 탈락 61건 사유 기록(재발명 방지).
- **삭제 31종 코드 반영** — 사용자 결정으로 **과거 리플레이 호환 포기, 파일 완전 삭제**
  (삭제 증강이 든 옛 리플레이는 rebuildAugments에서 unknown augment로 실패한다).
  콘텐츠 28파일 삭제 + 표준 3종 제거 → **카탈로그 105 → 74종**(콘텐츠 70 = Silver 12·
  Gold 28·Prism 30 / 표준 4). index.ts·standardAugments.ts·클라 AUGMENT_CATEGORY(28항목)·
  테스트 7파일 정리. `content/util.ts`의 **`yakuBountyBonus` 헬퍼도 삭제**(현상금 패턴
  재발명 방지 — 주석으로 금지 사유를 남김).
- **부수 효과로 드러난 엔진 버그 수정**: 표준 카탈로그의 Silver가 0개가 되자
  `DraftController.roll`이 **빈 드래프트**(choices=[])를 반환해 동풍전 완주 테스트가 깨졌다.
  뽑힌 등급이 그 플레이어에게 고갈되면 다른 등급에서 같은 PRNG로 이어 보충하도록 수정 —
  등급 통일은 카탈로그가 넉넉할 때의 규칙이고 빈 드래프트 금지가 우선이다(10 §3 반영,
  회귀 테스트 `core/test/Augment.test.ts` 2건: 등급 통일은 filler 카탈로그로, 폴백은 표준 4종으로).
- **개편 착수 — 3종 완료** (18종 대기, 16 §1 개편 표에 ✅ 표시):
  - **복수자(avenger)**: "원수에게 되갚으면 +2판" → 론당하면 그 상대가 **원수로 전원 공개**되고,
    그때부터 **원수의 버림패에 한해 후리텐도·역 없음도 무시하고 론**할 수 있다(복수 성공 시 해제).
    "쟤한테는 안전패가 없다"는 공포가 곧 보상.
  - **카운터(counter)**: "추격 리치 +1판" → 추격 리치를 거는 순간 **내 공탁 1000을 선리치자가 대납**
    (1000점이 눈앞에서 이동)하고 **그 상대의 일발이 즉시 소멸**. 국당 1회. 전용 이벤트
    `CounterStruck` + 리듀서(점수 이동·일발 해제를 한 번에 확정).
  - **곁불(near_dora)**: "도라 양옆 1장당 +400점" → **도라의 양옆이 나에게는 진짜 도라**(장당 +1판)이고,
    확장 도라 종류가 국 시작·신도라 공개마다 `view:*` 채널로 **전원에게 공개**되어 모두가 위험패를
    다시 계산해야 한다.
- **코어 일반화 1건(증강별 하드코딩 없음)**: `standardActions`가 `win.requiresYaku`·
  `win.furiten.enabled`를 resolve할 때 `{playerId, state}`를 넘긴다(이미 `win.blockedYaku`·
  `riichi.cost`가 쓰던 방식). 이제 "누구의 버림패인가·어느 국인가"에 따라 달라지는 **조건부 규칙**을
  증강이 표현할 수 있다 — 복수자가 첫 사용처.
- **페널티 제거 개편 2종** (사용자 지시: "증강 리스크가 크지 않아도 된다" — 리미트는 횟수로만):
  - **단색 세계(suit_unify)**: **청일색 봉인 삭제**. 게임당 1회라는 제한이 이미 리미트인데
    수패를 한 색으로 통일해 주면서 청일색을 막는 것은 준 것을 도로 빼앗는 설계였다.
    `win.blockedYaku` 모디파이어 제거 → 통일된 색으로 청일색까지 그대로 노린다.
  - **절벽 위에 피어난 꽃(cliff_bloom)**: 전면 재설계. 전용 깡 액션(`bloom_kan`)·2국당 1회 충전·
    "깡 후 텐파이" 게이트를 전부 폐기하고 **표준 깡 흐름에 얹는 구조**로 바꿨다(안깡·가깡·대명깡
    자동 지원). ① 깡마다 왕패 앞 4장에서 **영상패 직접 선택**(`bloom_pick` + 왕패 peek 4,
    도박사의 손 모달을 공용화) ② 같은 국 **깡 2회 → 만개**: 손패 kind를 완성형으로 통째로
    덮어써(conjured) **패와 무관하게 즉시 영상개화 화료**(+3판, 정산 보정).
    **함정**: 선택 플래그를 boolean으로 두면 깡을 연달아 할 때 지난 깡의 선택권이 남는다 →
    `pickKey`에 **대상 쯔모패 id(+1)** 를 저장해 "지금 쯔모패가 그 패일 때만 유효"로 자동 만료시킨다.
- **10_AUGMENT_SYSTEM §0에 "리미트는 횟수로 준다" 원칙 추가**: 능력에 붙는 상시 페널티
  (역 봉인·조건 게이트)는 금지, 억제는 발동 횟수로만. 도박형 증강의 "실패 시 손해"는 예외
  (리스크 자체가 콘텐츠이고 걸지 말지를 플레이어가 고른다).
- **검증**: 4패키지 타입체크 클린, 전체 테스트 **411개 통과**(40파일 — 신규
  `packages/content/test/rework_48.test.ts` 9건 포함, cliff_bloom 재설계 3건·suit_unify 2건 갱신).

## 2026-07-21 (47차 — 전체 플레이어 통계 관리자 전용)

닉네임별 누적 성적(리더보드)을 **관리자만** 볼 수 있게 제한. 사용자 확정: 증강 메타·도감
전체 통계는 그대로 공개 유지.
- **서버 `sendLeaderboard`**: 비관리자 요청에는 각 항목의 `nickname`을 `""`로 지워 보낸다
  (요청 자체를 FORBIDDEN으로 막지 않는다 — 증강 메타·도감 "전체 통계"가 이 데이터의
  익명 집계라 막으면 같이 죽는다. 신원만 제거하는 게 최소 변경).
- **클라 홈**: "전체 플레이어 통계" 카드는 `auth.isAdmin`일 때만 렌더(제목에 관리자 배지).
  `aggregateAugments`는 `nickname === ""`이면 '증강 장인' 후보에서 제외 → 비관리자에겐
  증강 메타의 픽률·평균순위는 그대로, 장인 닉네임만 안 뜬다.
- **검증**: RoomManager 32개 테스트 통과(리더보드 테스트를 비관리자 익명 + 관리자 실명
  두 갈래로 확장), 서버·클라 typecheck 클린. 문서 14 §2·15 §4 갱신.

## 2026-07-21 (46차 — 플레이 피드백 4건: 진짜 용 대기/크기 · 안개 바닥 마지막패 · 단색 세계 발동창 · 관전 우측 정렬)

사용자 피드백 4건 수정. (1)~(3)은 클라 렌더/코어 규칙, (4)는 증강 발동 조건.
- **진짜 용(true_dragon) — 텐파이 대기 미표시 + 손패 과소**: 클라 대기 계산(`winningKinds`)이
  기본 4멘쯔로만 분해해 5멘쯔·17장 손은 텐파이/대기가 전혀 안 잡혔다. 보유 증강에서 유도하는
  `waitDecompOptions(player)`(진짜 용이면 `{ totalSets: 5 }`) 신설 → myWaits·hoverWaits·specWaits
  세 곳이 이 옵션을 넘긴다(`winningKinds(kinds, meld, undefined, opts)`; 기본 universe는 undefined로
  트리거). 손패 폭도 15장 초과 시 `--hand-w` 클램프를 `clamp(30,5vw,52)` → `clamp(40,5.4vw,64)`로 키움.
- **안개 덮인 바닥(hidden_river) — 마지막 버림패 미노출**: 바닥이 count_only라 전패가 뒷면인데,
  현재 `round.lastDiscard`(론·후로 판정용 예외 공개)는 뒷면 열의 맨 끝 한 장을 실제 패로 그리도록
  River 수정(`last.player === playerId`이고 `view.tiles[last.tileId]` 존재 시). 코어는 이미
  collectVisibleTileIds가 lastDiscard.tileId 메타를 뷰에 포함해 클라에서 그릴 수 있었음.
- **단색 세계(suit_unify) — 동1국 첫 순만 → 각 국 첫 순(게임당 1회)**: `atFirstHand`에서
  `prevalentWind/roundNumber/honba` 게이트 제거 → 어느 국이든 자기 첫 타패 전에 발동 버튼이 뜬다.
  **게임당 1회 제한(usedKey)은 유지** — 어느 국의 첫 순에 쓸지 스스로 고른다. 또한 청일색 봉인
  modifier가 install 시 무조건 걸려 "발동 전에는 아무 규칙도 안 바뀐다"는 자체 계약을 어기던 잠재
  버그도 수정 — `flagOf(rctx.state, usedKey)`로 **발동한 뒤에만** chinitsu 봉인(rctx.state는 helpers가
  win.blockedYaku resolve 시 넘김). 설명/detail 텍스트도 갱신.
- **관전 우측 상대 손패 역순**: 오른쪽 자리는 실제 탁자처럼 플레이어가 왼쪽을 바라봐 손패가
  아래→위로 흐른다 → 정렬(만→통→삭→자패)이 그대로 읽히도록 OpponentStrip에서 `side === "right"`만
  표시 순서를 뒤집는다(`[...sorted].reverse()`). 좌측·상단은 그대로.
- **검증**: client/content 타입체크 클린, true_dragon·information·new_batch_sweep 테스트 통과.

## 2026-07-21 (45차 — 봉인술사 실패 공개 + 연금술사 프리뷰/턴제한 + 오픈리치 클릭 발동)

사용자 요청 증강 UX 3건.
- **봉인술사(discard_lock) — 봉인된 '실제' 상대 손패 노출**: 보유자에게 봉인 종류(kindKey)만
  보여주던 것을, 봉인된 상대의 실제 손패 패를 진짜 패 그대로 보여준다. 코어에 **범용
  `revealTiles:*` 채널 신설**(buildPlayerView) — augmentView의 `revealTiles:{tag}` = TileId[] 항목의
  그 tile id만 뷰어 `tiles`에 메타데이터로 포함(상대 손패 Zone 전체가 새지 않는 특정-패 공개
  프리미티브, 재사용 가능). discard_lock은 봉인 시 각 상대의 봉인 종류에 해당하는 실제 hand
  tile id를 캡처해 `view:{holder}:revealTiles:{target}`에 저장(기존 `sealed:` 종류 키는
  discard.blockedKinds 소스로 유지). 클라 AugmentInfoPanel이 `revealTiles`를 진짜 패로 렌더하고,
  중복 방지로 `sealed` 종류 행은 revealTiles 존재 시 생략.
- **연금술사(alchemist) — ±값 프리뷰 + 한 턴 1회**: (1) 클라 ActionTiles가 `delta` payload를
  전→후(무늬 유지 rank±1, conjured)로 그려, 8통 -/+ 가 둘 다 8통으로 보이던 것을 7통/9통으로
  정확히 미리 보여준다(염색 프리뷰와 동일 메커니즘). (2) 한 턴 여러 번 쓰던 것을 **자기 턴 1회**로
  제한 — 턴은 정확히 버림 1회로 끝나므로 `(roundKey, discardedKinds.length)` 서명으로 턴을 식별,
  발동 시 기록하고 validate·holderTurnOptions가 같은 턴 재사용을 차단(버림으로 턴 넘어가면 자동 해제).
  게임 전체 5회 총량은 유지.
- **오픈 리치(open_riichi_reveal) — 손패 클릭 발동**: ARM_MODE에 `open_riichi: "hand"` 추가 —
  버튼 목록 대신 실제 손패를 클릭해 리치 선언. holderTurnOptions를 **버려도 텐파이가 유지되는
  패만** 제시하도록 필터링해, 그 패만 무장 대상(강조·클릭 가능)으로 뜨고 나머지는 흐려진다.
- **검증**: 4패키지 타입체크 클린, 관련 테스트(open_riichi·PlayerView·schemers·combat_augments·
  hand_manip·riichi_family·new_batch_sweep) 통과.

## 2026-07-20 (44차 — 봇의 액티브 증강 사용: 콜로케이트 정책 훅 + 저위험 유익 7종 적용)

봇이 증강을 **드래프트에서 뽑기만 하고 게임 중 한 번도 발동하지 않던** 문제를 해결. 증강별
발동 판단을 **증강 파일에 콜로케이트**(`AugmentDef.bot` 정책, 중앙 테이블 없음 — 자기완결 원칙 유지).
- **코어**(Augment.ts): `AugmentBotPolicy`/`BotDecisionContext`/`BotRng`/`BotAugmentOption` 타입 +
  `AugmentDef.bot?` 선택 필드. `import type PlayerView`(런타임 순환 없음). index에서 재노출.
- **BotAgent**: 생성자 4번째 인자로 증강 정의 카탈로그(Map) 주입. `decide`는 화료 다음·콜/리치/버림
  앞에서 `chooseAugment` 호출 — 보유 증강 정책을 순회해 발동 옵션을 고르고, **제시된 옵션인지 재확인**
  후 제출. `isTenpai`(대기형 13장 직접 / 쯔모 후 14장은 한 장씩 빼 판정)로 `ctx.tenpai` 계산.
  카탈로그 미주입(구 테스트)이면 증강 미발동 = 종전 동작(회귀 없음).
- **RoomManager**: `ALL_AUGMENT_DEFS = [...standardAugments, ...contentAugments]`(원본 정의, 카탈로그
  엔트리와 별개)를 `new BotAgent(..., ALL_AUGMENT_DEFS)`로 주입.
- **1차 적용(저위험 유익 7종)**: 텐파이 게이트 — 출사표·이면투시·붉은 손길·찬탈자·시간 정지;
  최다 중복 종류 선택 — 도라 옹립; 상대 리치+점수 여유 게이트 — 선언 간파. 계약·올인·도박 등
  자해 위험 큰 증강은 `bot` 미정의(봇 미사용, 후속 과제).
- **검증**: `BotAgentAugment.test.ts` 신설(정책 단위 6 + 드래프트·발동 완주 통합 1). 전체 430개
  테스트·4패키지 타입체크 클린. 무한 루프 없음(발동 후 validate가 옵션 재제시 차단).

## 2026-07-20 (43차 — 큰손 액티브화: 상시 → 첫 턴 선언, 2국 쿨다운 + 리스크 설명 보강)

`big_hand`(큰손, prism)을 **상시 발동(항상 최소 만관) → 액티브 선언형**으로 전환. 언제 판돈을
걸지 고르는 판단과 재사용 타이밍을 부여했다. `no_retreat`(불퇴 선언) 액티브 패턴과 동형 —
콘텐츠 1파일 + 클라 1파일 수정, 코어 무변경.
- **발동 방식**: 자기 턴의 **국 첫 행동(아직 버리지도 울지도 않은 첫 턴)** 에만 액티브 버튼
  (`declare_big_hand`)이 활성화. 누르면 그 국 동안 당신이 얽힌 손이 최소 만관(오야 12000·자 8000)이
  된다 — 업사이드(화료 시 차액 뱅크 보전)·다운사이드(론 방총 시 지불도 만관까지 상승, 화료자에게
  이전)는 종전 로직 유지하되 **`declaredThisRound`(=선언 roundKey일 때만)로 게이팅**.
- **쿨다운(2국에 한 번)**: 선언 국을 `big_hand:round:{holder}`에 기록, `absRoundOf` 차이가 2 이상일
  때만 재선언(선언한 국·바로 다음 국은 쿨다운). `holderTurnOptions`가 쿨다운 중이면 버튼을 숨김.
- **리스크 설명 보강**: 선언은 국 시작 첫 턴에 미리, 그 국 내내 되돌릴 수 없이 걸어야 함을 명시 —
  화료 전 방총하면 값싼 손에도 만관을 물고, 화료·방총 둘 다 없이 국이 끝나면 이득 없이 쿨다운만
  소모된다는 점을 description/detail에 추가.
- **클라**(App.tsx): `declare_big_hand`를 AUGMENT_ACTION_TYPES·ACTION_AUGMENT·ACTION_LABEL("큰손 선언")에,
  `big_hand`를 ACTIVE_AUGMENT_IDS에 추가. 대상 없는 선언형이라 ARM_MODE 미등록 → 버튼 발동. 컷인 톤
  `scoring` 유지.
- **검증**: score_bonus.test 큰손 5종(업/다운사이드·미선언 무효과·선언 버튼 노출+플래그) 통과, 전체
  423개 테스트·4패키지 타입체크 클린.

## 2026-07-20 (42차 — 봉인술사 액티브화: 자동 → 국 시작 액티브 버튼, 2국 쿨다운)

`discard_lock`(봉인술사, prism)을 **첫 국 자동 발동 → 액티브 버튼**으로 전환. 언제 잠글지
고르는 판단과 재사용 타이밍을 부여했다. 콘텐츠 1파일 + 클라 1파일 수정, 코어 무변경.
- **발동 방식**: 자기 턴의 **국 첫 행동(아직 아무 패도 버리지 않은 순간 = "첫 시작")** 에만
  액티브 버튼(`seal_hands`)이 활성화. 누르면 그 시점 상대 손패를 읽어 각자 무작위 수패 2종을
  봉인. 봉인·정보 공개(보유자 전용 목록·상대 자물쇠 표시)·`discard.blockedKinds` 로직은 종전 유지.
- **쿨다운(2국에 한 번)**: `ROUND_STARTED`마다 `discard_lock:seq:{holder}` +1, 발동 국을
  `discard_lock:used:{holder}`에 기록 → `seq-used>=2` 일 때만 재발동(예: 1국에 쓰면 3국에 가능).
  재발동은 상대별 봉인 목록을 새로 덮어씀. `discard_lock:done:{holder}`(게임당 1회 플래그) 제거.
- **구현**: 자동 `ROUND_STARTED` 봉인 반응을 액티브 `ActionDef`(validate=턴·페이즈·첫시작·쿨다운,
  toEvents=`DiscardLockSealed`)로 이전, `holderTurnOptions`로 조건 충족 시에만 버튼 노출.
  `last_stand`(승부수) 액티브 패턴과 동형. **주의: `installAugment`는 `player.augments`에
  추가하지 않으므로**(validate가 보유 검사) 테스트는 `withAugments`로 보유 주입 필요.
- **클라**(App.tsx): `seal_hands`를 AUGMENT_ACTION_TYPES·ACTION_AUGMENT·ACTION_LABEL("봉인")에,
  `discard_lock`을 ACTIVE_AUGMENT_IDS에 추가. 대상 없는 선언형이라 ARM_MODE 미등록 → 버튼 발동.
- **검증**: schemers.test 10종(액티브 발동·자동X+seq증가·2국 쿨다운·조건 가드) 통과, content
  177종·타입체크(core/content/client) 클린.

## 2026-07-20 (41차 — 오픈 리치 개편: 손패 전체 공개(정석 오픈리치) + 화료 보너스 +2/+2판)

`open_riichi_reveal`(오픈 리치, gold)를 정석 オープンリーチ에 맞춰 개편. 기존엔 "대기패만
공개"였는데, 이름·룰대로 **손패 전체를 앞면으로 전원에게 공개**하도록 바꾸고, 그만큼
커진 리스크에 맞춰 화료 보너스도 상향.
- **손패 전체 공개**(open_riichi_reveal.ts install): `visibility.hand` 규칙에 Modifier를
  얹어, "손 주인이 보유자 & 이번 국 오픈 리치 선언"일 때만 `public`을 돌려준다. xray_hand와
  동일한 표준 가시성 메커니즘 — 코어·클라 무변경(클라는 public 손패를 이미 앞면 렌더).
  roundKey 스코프라 국이 바뀌면 자동으로 owner 가시성 복귀. 기존 대기패 뷰(금색 배지)는
  강조용으로 유지.
- **점수 로직**: 기본 보너스 `extraHan = 1 → 2`, 비(非)리치 상대 론 추가분 `+1 → +2`.
  즉 오픈 리치 화료 시 리치 자체 1판과 별개로 **+2판**, 리치 안 건 상대에게 론이면
  **+2판 더(합 +4판)**. `winPointsWithExtraHan`이 실제 화료 판수(리치 1판 포함)에 얹어
  차액을 주므로 "(리치 1판 미포함)"이 정확히 성립 — 만관/하네만 상한도 그대로 반영.
- **설명 갱신**: description·detail·JSDoc을 손패 전체 공개 + +2/+2(총 +4판) 기준으로 수정.
- **검증**: open_riichi.test에 손패 전체 public 공개 검증 추가(5종), content 타입체크 클린,
  전체 432 테스트 통과(크래시 스위프 open_riichi_reveal 포함).

## 2026-07-20 (40차 — 증강 도감(Codex) 전체화면: 98종 상세 설명 + 서버 전체 증강 통계)

증강별 상세 설명을 하나하나 볼 수 있는 **증강 도감** 전용 페이지와, 내 통계뿐 아니라
**서버 전체 증강 통계**를 추가. 콘텐츠 팩 98종 전부에 도감용 `detail` 상세 설명을 집필.
엔진/드래프트 로직은 무변경(순수 표시용 필드) — 카탈로그를 통해 클라이언트에만 전달.
4패키지 타입체크 클린, 클라 프로덕션 빌드 통과, 419 테스트 통과, 실서버+브라우저 렌더 확인.

**코어/서버 (표시용 필드 추가)**
- `AugmentDef.detail?: string`(Augment.ts) — 여러 문단 상세 설명. 엔진은 읽지 않는다.
- `AugmentCatalogEntry`(protocol.ts)에 `detail·draftStages·modes·grantsRandomTier` 추가 →
  도감이 상세 설명과 "등장 시점·모드 전용·연쇄 지급" 배지를 그린다.
- `buildAugmentCatalog`(RoomManager.ts)가 위 필드를 있는 것만 실어 보낸다. 서버 증강 집계
  엔드포인트는 새로 만들지 않았다 — 도감 통계는 기존 career + leaderboard에서 클라 파생.

**콘텐츠 (98종 상세 설명 전량 집필)**
- 각 증강에 `detail`(작동 원리 / 전략·활용 / 주의점·한계 3문단)을 `description`·JSDoc·install
  로직에 근거해 작성. 표준 증강은 미보유(도감은 `description`으로 대체 표시).

**클라이언트 (App.tsx `CodexScreen` + styles.css)**
- 라우팅 ternary에 `codexOpen` 분기 추가(홈에서만 진입). 홈 "내 증강 통계" 카드에
  "📖 증강 도감" 진입 버튼·CTA.
- **도감 탭**: 등급별(실버/골드/프리즘) 그리드, 수집✓/미수집 흐림, 카드 클릭 → 상세 오버레이
  (상세 설명 문단 + 제한 배지 + **내 통계 · 서버 전체** 나란히 + 증강 장인).
- **전체 통계 탭**: 105종 전체를 내 판·평균순위 / 서버 표본·픽률·평균순위·1위율로 헤더 클릭
  정렬 + 등급 필터 + 검색. 행 클릭도 상세 오버레이를 연다.
- 도감 데이터는 `catalog`(id→detail/tier/name/description) + `toAugRows`·`aggregateAugments`
  재사용. 진입 시 `refreshHome`으로 최신 통계 당김.

**문서**: 10_AUGMENT_SYSTEM(detail 필드)·14_LOBBY_STATS(도감 페이지·CodexScreen)·
15_ACCOUNTS_SITE(도감 페이지) 갱신.

## 2026-07-20 (39차 — 액티브 증강 클릭 발동: 버튼 → 실제 손패·상대·바닥 클릭)

대상을 추가로 고르는 액티브 증강을, 버튼 목록이 아니라 **실제 게임 오브젝트를 클릭**해
발동하도록 클라이언트를 개편. 액티브 버튼으로 무장한 뒤 (1) 내 손패, (2) 상대 위치,
(3) 내 바닥의 버림패, (4) 상대 바닥의 버림패를 직접 클릭한다. 선언형(클릭 대상 없음)·영상패
모달은 그대로. 클라 1파일(App.tsx)+styles.css만 변경, 서버/코어 무변경. 4패키지 타입체크
클린, 클라 프로덕션 빌드 통과.

**핵심 설계(클라 App.tsx)**
- **무장 상태를 게임판 전역으로 승격** — 기존엔 손패 클릭(염색 등)만 OwnArea 국지 상태였다.
  액티브 버튼(내 영역)에서 무장하면 상대(OpponentStrip)·바닥(River)까지 반응해야 하므로,
  무장 상태를 GameTable이 소유하는 `SelectionContext`로 올리고 OwnArea·OpponentStrip·River가
  공유한다(`useSelection` 훅이 값 생성). 관전/리플레이는 무장이 없어 아무 것도 클릭되지 않는다.
- **`ARM_MODE` 매핑**(액션 타입→클릭 대상): `hand`(내 손패)·`opp`(상대)·`own-river`(내 바닥)·
  `opp-river`(상대 바닥)·`swap3`(상대→내 손패 3장). 여기 없는 액티브 액션은 선언형이라 버튼 유지.
  - opp: 통째로 바꾸기·덤터기·기생·자리 바꿈·선언 간파(payload `{target}`)
  - own-river: 회수(`{recallTileId}`)·지뢰 매설(`{kind}` → 클릭 패의 kindKey로 매칭)
  - opp-river: 날치기(`{snatchId,fromPlayer}` — 상대 최근 버림패만 후보)
  - hand: 염색·연금술·도라 옹립(기존) / swap3: 상대 클릭 후 내 3장 클릭(등가교환)
- 옵션 매칭은 `submit`이 offered와 완전일치를 요구하므로, 클릭 대상(상대 id·tileId·kind)으로
  현재 프롬프트의 armed 옵션을 찾아 제출한다(`oppOptionFor`/`riverOptionFor`).
- **빈 곳-취소 함정**: 무장 중 document `pointerdown` 취소가 클릭보다 먼저 발동 → 대상 클릭까지
  씹힌다. 클릭 대상 요소(무장된 상대·바닥 패·내 영역)에 `data-arm-zone`을 붙이고, 취소 핸들러가
  `closest("[data-arm-zone]")`이면 취소를 건너뛴다. 비대상 영역 클릭만 무장 해제.
- 강조: 상대는 `.opp-armable`(전체 글로우+"✦ 여기 클릭" 태그), 바닥 패는 `.rt-armable`, 손패는
  기존 `.hand-armable`. 무장 안내 문구는 `armPromptText(armMode)`로 대상별 분기.
- 버튼 유지(클릭 대상 없음): 붉은 손길(모든 5)·미래 보기(무작위3)·오야 찬탈·불퇴/출사표/레이즈/
  이면투시/무르기/번개·핏빛·외길 계약/올인/예치/오픈 리치/시간 정지/단색 세계 등 선언형,
  절벽 위 꽃(깡 — 표준 깡과 동일하게 버튼), 도박사의 손 영상패(전용 모달).

## 2026-07-20 (38차 — 등가교환: 무작위 강탈 → 내가 지정하는 3장 교환)

hand_swap3(등가교환)에서 넘길 내 3장을 보유자가 직접 고르게 개편. take(상대 3장)는 무작위 유지.
콘텐츠 1종·클라 1파일·문서 갱신. 4패키지 타입체크 클린, 전체 419 테스트 통과.

**서버(@majak/content · hand_swap3.ts)**
- 액션 payload `{target}` → **`{target, give: TileId[]}`**. validate에 give 검증 추가
  (정확히 3장·중복 없음·모두 내 손패 소속). toEvents는 give를 지정값(오름차순 정규화)으로,
  take만 prng 셔플 무작위 → 난수 소비 1회로 감소(리듀서·이벤트 payload 구조 불변 → 기존 리플레이 안전).
- **핵심 함정**: `FlowController.submit`은 제출 옵션이 offered와 **JSON 완전일치**해야 통과.
  그래서 give를 자유 선택하려면 `holderTurnOptions`가 (유효 상대 × 내 손패 3장 조합) 전부를
  후보로 열거해야 한다(최대 C(14,3)×3 ≈ 1092). 조합·give는 오름차순 정규화해 클라 제출과 매칭.
  사용 소진(≥2회)·손패<3·유효 상대 0이면 빈 배열로 조기 반환해 조합 폭발을 막음.

**클라(App.tsx)** — 액티브 버튼 → 상대 선택 → 내 패 3장 클릭 → 자동 제출
- swap3를 `armType`(TILE_SELECT_ACTIONS와 동급 arming)으로 처리. armedAug==="swap3"에서
  `swapTarget`/`swapGive` 상태로 2단계(상대 지정 → 3장 토글) 진행, 3장째에 `${target}|정렬give`
  키로 offered 옵션을 찾아 `onSubmit`. arm-hint에 상대 버튼·(n/3) 안내, 고른 패는 금색 강조
  (`.hand-swap-picked`). 버튼 옆 개수는 조합 수 대신 **유효 상대 수**로 표기. ACTION_LABEL swap3
  "3장 강탈"→"등가교환". 봇은 swap3 옵션을 무시(타패 선택)하므로 변경 불필요.
- 회귀: hand_manip.test.ts swap3 4케이스(지정 교환·비보유패 거부·쯔모패 대체·리치 상대 제외).

## 2026-07-20 (37차 — 플레이 피드백 4건: 단색 세계 액티브화·스택형 2번째-픽 보강·번개 계약·리치 브금 순서)

플레이 중 나온 4건 일괄 처리. 코어(스테이지 추적 훅)·콘텐츠 6종·클라 1파일 갱신.
4패키지 타입체크 클린, core 200·content 174 테스트 통과, 클라 프로덕션 빌드 통과.

**1. 단색 세계(suit_unify) — 패시브 → 액티브 버튼 + 봉인 뒤집기**
- 기존: 첫 국 시작 시 자동 발동(ROUND_STARTED 리액션)·혼일색 봉인(청일색만 허용).
- 변경: **게임당 1회, 첫 패를 받은 자기 턴(동1국·본장0·첫 타패 전)에만 뜨는 액티브 버튼**
  (`mono_world` 액션, lightning_contract 패턴). 발동 전엔 규칙 불변. 봉인도 뒤집어
  **청일색 봉인·혼일색만 인정**(win.blockedYaku에 "chinitsu"). 클라 ACTION_LABEL/
  ACTION_AUGMENT/AUGMENT_ACTION_TYPES/ACTIVE_AUGMENT_IDS 4곳에 등록. 테스트 3건 재작성.

**2. 스택형 증강 — 두 번째 드래프트(남장/동장 진입)로 늦게 들어오면 보강**
- 총 2개 획득 체계라 두 번째 픽은 남은 국이 절반뿐 → 국을 거듭해 쌓는 스택형이 제 값을 못 냄.
- **코어 신규**: 정식 픽이 `augmentStageKey(player,id)`로 획득 스테이지를 augmentData에 남긴다
  (draftPickAction.toEvents). install 시점 클로저가 아니라 **상태에서 읽어** 리플레이·재개
  (rebuildAugments)에서 결정적. 콘텐츠 헬퍼 `draftedLate(state,holder,id)`(southEntry/eastThird).
- 보강 적용 5종: 극악무도(장당 300→**500**)·다음을 위한 기약(스택 **+1 선행**)·기세/기세(동풍)
  (연승 **+1 선행**, 상한 유지)·흐름(필요 실패 2→**1**)·카르마(환급 **×1.5**). 회귀 테스트
  1건 추가(극악무도 남장 픽 = 6장 3000점).

**3. 번개 계약(lightning_contract) — 6순 → 8순**
- "6순 이내 화료 +2판" 창이 빡빡하다는 피드백. LIMIT 6→**8**(설명·주석 동기화). 실패 시
  -2000·전원 공개는 유지.

**4. 리치 브금이 연출보다 먼저 나오던 순서 수정(클라)**
- 기존: 리치 감지 시점(상태 전이)에서 `riichiBgm.start()` 즉시 호출 → 배너 애니메이션이
  연출 큐에 밀려 있어 브금이 먼저 남. 변경: 감지 시엔 `riichiBgmArmed` 플래그만 세우고,
  **리치 배너가 실제로 뜨는 순간(showBanner onShow)에 start()** → 연출 → 브금 순서.
  빠른 론 등으로 배너 전에 국이 끝나면 fadeOut/stop 지점에서 무장을 풀어(4곳) 뒤늦게
  브금이 켜졌다 안 꺼지는 일 방지(기존 안전장치 대체).

## 2026-07-20 (37차 — 우마·오카·결과창 색 + 증강 통계)

사용자 요청 3건.

- **결과창 색 버그**: 대국 종료(gameover) 최종점수 칸 `.rank-final`이 부호 무관 초록 하드코딩 →
  JSX에서 `rank-final-plus/minus/zero` 부호 클래스 부여, CSS 분리(양수 초록·음수 빨강·0 회색).
- **우마 [5,15]·오카 제거**: 우마 1위+15/2위+5/3위-5/4위-15, 순수 제로섬. **함정**: `returnScore`(30000)는
  서입(西入) 종국 판정(shouldEnd)에도 쓰여 25000으로 낮추면 서입이 영영 안 걸림(top은 항상 평균≥25000).
  → 서입 기준점은 30000 유지, 제로섬 기준점만 원점(startScore)으로: `calcRankings` score=`raw−startScore+uma+oka`,
  oka=0. 공식 단언 테스트 2곳(Resume/RoomManager) `−25000`으로 갱신. docs/01_GAME_RULES.md 표 갱신.
- **증강 통계 전면 추가**: `AUGMENT_OFFERED`(상태 불변 이벤트, `draftOffer` 액션) — DraftController.recordOffer가
  픽 전 고정 순서로 오퍼를 로그에 남김(사후 재계산 불가 — roll의 exclude가 보유분만큼 커짐). PlayerStatsRaw에
  `augments`(id별 offered/picked/games/placements)·`augmentTierPicks` 추가, StatsTracker가 OFFERED/DRAFTED
  소비+종료 시 보유 증강에 순위 귀속(지급분은 픽 아님·보유엔 포함). 서버는 인증 직후 정적 카탈로그 전송(홈에서
  이름·등급 사용). 클라 홈: **내 증강 통계**(시그니처·등급분포·성적표·함정 경고·도감 수집률) + **증강 메타**
  (전체 픽률·평균순위 티어 + 증강 장인). 신규 유닛테스트 3케이스. 전체 418테스트·타입체크·클라 빌드 클린.

## 2026-07-19 (36차 — 인게임 빠른 토글 바)

사용자 요청: 자동정렬·자동화료·후로없음·자동버림을 설정창까지 들어가지 않고 게임 화면에서 글자를
클릭해 바로 온/오프. 신규 `QuickToggles`(App.tsx) — 게임 화면 좌하단 세로 스트립, 각 항목이
`onSetting`(=updateSetting, localStorage 저장)을 그대로 호출한다. 켜짐=앰버 하이라이트+점, 꺼짐=회색.
관전/리플레이는 렌더 안 함(조작 불가). 이미 떠 있는 프롬프트에도 소급 적용은 기존 `[settings,prompt]`
useEffect(tryAutoRespond)로 자동 처리 — 별도 배선 불필요. CSS `.quick-toggles/.qt-item/.qt-dot`
(styles.css), 좌우 상대 스트립은 세로 중앙·본인 영역은 하단 중앙이라 좌하단은 충돌 없음. 설정창의
기존 토글은 그대로 유지(상세 설명·기타 설정 접근용). 클라 빌드·타입체크 클린.

## 2026-07-19 (35차 — 신규 증강 5종)

사용자 요청으로 증강 5종 추가. 콘텐츠 카탈로그 93→98(Gold +3, Prism +2). 콘텐츠 타입체크 클린,
content 전체 170개 테스트 통과(신규 6: 0719 스위프 5종·시간 정지 추가 턴 실증).

- **일촉즉발(imminent, Gold)** — 리치 선언 후 3순 이내(선언패 이후 버림 ≤2)에 화료하면 +2판.
  별도 이벤트 추적 없이 `RiichiState.discardIndex`와 버림 수 차이만으로 판정(addHanBonus).
- **심판(judgment, Gold)** — 유국 텐파이료(받는 노텐 벌부) 2배. ROUND_SETTLED 인터셉터로
  유국 정산에서 delta[holder]>0일 때만 2배(late_bloomer 계열, 뱅크 보너스).
- **천하무적(invincible, Gold)** — 게임 내내 방총(론으로 쏘임) 0이면 최종 정산 보너스(반장 +8000·
  동풍 +4000, mode별). 첫 드래프트 한정(draftStages:["gameStart"]). ROUND_SETTLED 리액션으로
  방총 감지 플래그 + score.finalAdjust 가산(single_path_contract 위약금과 대칭).
- **카르마(karma, Prism)** — 방총으로 잃은 점수를 누적해 최종국(오라스) 화료 시 전액 회수.
  누적은 리액션(payload winInfo.from===holder&&ron), 환급은 addWinPointBonus(ic.state=정산 국으로
  오라스 판정), 중복 환급 방지는 인터셉터→리액션 순차 실행 신호로 부채 0 청산.
- **시간 정지(time_stop, Prism)** — 2국당 1회, 자기 턴 선언 시 쯔모+버림 추가 턴. **코어 수정 없이**
  TURN_PASSED 인터셉터로 nextSeat를 보유자 자리로 되돌려 구현. 리액션에서 armed 해제(무한루프
  방지), 남이 울면 armed 유지→다음 자기 버림에 발동. charge 창=(장-1)*n+(국번-1)의 floor(/2),
  미사용 sentinel과 구분해 window+1 저장. 액션은 전원 공용(single_path 패턴, 다인 보유 안전).

## 2026-07-19 (34차 — 플레이테스트 피드백 7건: 규칙·UX·증강)

플레이 중 나온 7건 일괄 처리. 코어·콘텐츠·클라·문서 함께 갱신. 4패키지 타입체크 클린,
전체 403개 테스트 통과(+9: 아가리야메 8·투시 무작위 안정성 1), 클라 프로덕션 빌드 통과.

**1. 아가리야메(+텐파이야메) — 코어 규칙 신설**
- 최종 국(오라스 — 반장=남4·동풍=동4, maxWind의 마지막 국)에서 **오야가 연장(렌짱)하고
  단독 1위이면 그대로 종국**. 연장은 오야 화료(아가리야메)·유국 오야 텐파이(텐파이야메)
  모두 포함. 오야 특권으로 무한 연장·불필요한 서입을 막는다. 반장·동풍 양 모드 적용.
- 렌짱은 정산 후 장풍·국번이 그대로인 것으로 판정(오야 유지 시 국이 안 넘어감).
  runLoop가 정산 전 국의 (장풍·국번·오야자리)를 기억했다가 정산 후 판정. 순수 함수
  `agariYameTriggers`로 분리(단위테스트 8건). `HanchanConfig.agariYame`(생략=on).

**2. 염색 증강 미리보기 — '바꾼 뒤' 패 표시(클라)**
- "어떻게 바꿀까요?" 메뉴가 바꾸기 '전' 패만 보여 헷갈리던 것을, ActionTiles가
  payload에 `suit`+`tileId`가 있으면 **전→후**(원본 → 목표 무늬, conjured 글로우)로
  화살표와 함께 표시. tile_dye 전용(유일하게 {tileId,suit} 페이로드).

**3·4. 자동화료·후로없음 소급 적용(클라)**
- 자동화료/후로없음 설정이 프롬프트 '도착' 시에만 적용돼, **론/후로 버튼이 뜬 뒤**
  토글하면 안 먹던 문제. `tryAutoRespond` 헬퍼로 추출하고, `[settings, prompt]`를 보는
  useEffect가 이미 떠 있는 프롬프트에도 소급 적용. 도착 경로와 토글 경로 공용(이중 전송 없음).

**5. 후리텐·역없음 표시(코어+클라)**
- 형식텐파이(역없음) 판정 `tenpaiNoYaku`(helpers) 신설 — 열린 손 전용(멘젠은 리치·멘젠
  쯔모로 역 가능). 각 대기패로 론 화료를 가상 평가해 전부 역이 없으면 true. `buildPlayerView`
  options에 `yaku` 추가 → 본인 뷰 `PlayerRoundView.noYaku`. 이름표에 후리텐 옆 **역없음** 뱃지.

**6. 투시 — 무작위 3장으로 변경(코어+콘텐츠)**
- `PeekVisibility`에 `pick?: "front"|"random"` 추가. random은 손패 tile id 집합을 시드로
  결정적 선택(손패 불변 시 고정 → 리렌더로 더 안 샘, 쯔모·버림 시 재선택). xray_hand가
  앞 3장 → **무작위 3장**.

**7. 버리기 드롭존 위치(클라)**
- `bar-in` 애니메이션이 transform을 translateY로 덮어써 `translateX(-50%)` 중앙정렬이
  풀렸다가 끝에서 돌아오던("가운데 아닌 곳에 떴다 이동") 버그. 중앙정렬을 유지하는
  전용 `dropzone-in` 키프레임으로 교체.

## 2026-07-19 (33차 — 증강 밸런스 조정: 오버밸런스 너프 + 사장 픽 버프)

96종 전수 점검 후, 난이도 대비 과보상·리스크 없는 고성능·대처 불가 증강을 손봤다.
콘텐츠 16파일 + 클라 1파일(App.tsx, buried_mine 공개 표시) 수정. 코어 무변경.

**1순위 — 대처 불가급 오버밸런스 (5종)**
- **봉인술사(discard_lock)**: 상대당 봉인 3종 → **2종**. 게임 내내 3~5장을 잠그던 전원
  영구 디버프의 잠금 압박을 줄이되 프리즘다운 방해 정체성은 남겼다.
- **지뢰 매설(buried_mine)**: 지뢰를 **전원 공개**(viewKey "*")로 바꿔 카운터플레이를 열고,
  보상 1000 → **500**. 클라 River가 보유자 바닥의 지뢰 종류를 모두에게 글로우로 표시(공개
  뷰 키 `buried_mine:{holder}`). 정보 패널에선 생략.
- **부르는 게 값(furo_master)**: 무제한·안깡 포함 → **열린 후로당 +1판, 최대 +2판, 안깡 제외**.
  노련함(veteran)의 상위호환이던 것을 해소.
- **큰손(big_hand)**: 다운사이드 추가 — 보유자가 **론당하면 지불도 만관 하한**까지 올라
  화료자에게 이전(ROUND_SETTLED 인터셉터). "제일 빠른 손=제일 비싼 손"에 대칭 리스크.
- **뚫린 천장(aotenjou_ceiling)**: 화료당 보전액 **상한 32000**(역만 지불 상당) 추가. ※48차에 삭제(무페널티).
  8판+ 한 방 12만점으로 게임을 끝내던 무한 꼬리를 배만~역만 구간으로 제한.

**2순위 — 난이도 대비 과보상**
- **흐름(flow)**: +2판 → **+1판**. **모방범(copycat)**: +2판 → **+1판**(리치/역패가 금방
  기록돼 사실상 상시 발동이라).

**현상금 계열** — 실전에서 쉽게 만들어지는 두 역만 하향:
- 혼일색 전문가 4500 → **3000**, 또이또이 전문가 4000 → **3000**. (리치·역패·탕야오·삼색은 유지)

**정보 은폐 승급**
- **안개 바닥(hidden_river)**: Gold → **Prism**. 현물 수비를 지우는 강한 정보 은폐라 희소화.
  카탈로그 Gold 34→33 / Prism 27→28(총 89 불변).

**쿨다운·버프**
- **물러설 수 없는 선언(no_retreat)**: 매 국 1회 → **2국에 1회**(선언 국·바로 다음 국은
  쿨다운). 절대 국 인덱스(`(pw-1)*4+rn`) 차이 ≥2로 게이팅.
- **노련함(veteran)**: 12순 → **10순**부터 발동(상한 없음 유지 → 후로 많은 손은 furo_master
  상한을 넘어 더 크게). **본장 수집가(honba_collector)**: 본장당 300 → **500**.
  **극악무도(gokuakumudo)**: 후로 패당 200 → **300**.
- **역만 방어술(yakuman_shield)**: 부분 환급 → **손실 전액 환급(완전 면역)**. 환급분은
  화료자 이득 한도까지 차감·부족분 뱅크 발행. **유국역만 포함** — nagashi_yakuman이
  방어막 보유자에게 지불을 부과하지 않도록 연동(draw는 인터셉터가 못 잡으므로 지급 측에서 면제).

**검증**: 4패키지 타입체크 클린, 전체 386개 테스트 통과(+2 회귀: big_hand 방총 만관 하한,
yakuman_shield×유국역만 면제). 관련 테스트 수치 갱신(극악무도 1800·본장 1500·봉인 1종·no_retreat 쿨다운).

## 2026-07-19 (33b차 — 버그 수정: 증강 선택창 잔류 · 삭제 계정 리더보드 유령)

플레이테스트 리포트 2건.

**① 증강 선택창(드래프트 오버레이)이 안 닫힘 (App.tsx)**
- 증상: 증강을 고른 뒤에도 "선택 완료 — 다른 플레이어 대기 중" 오버레이가 게임 보드
  위에 계속 떠 있음(특히 자기 차례가 아직 안 온 비-딜러).
- 원인: `pickDraft` 주석은 "전원 선택 후 프롬프트/뷰로 닫힌다"였지만 실제로
  `setDraft(null)`은 **prompt 핸들러에서만** 호출됐다. 자기 차례가 안 오는 플레이어는
  게임 시작 후 prompt 없이 view만 받으므로 오버레이가 영영 안 닫혔다.
- 수정: `draftPickedRef`(스테일 클로저 대응 ref) 추가 → **view 핸들러가 "이미 고른 뒤
  새 뷰가 오면"** 오버레이를 닫는다(드래프트 중엔 게임 루프가 멈춰 뷰가 안 오므로,
  픽 이후 첫 뷰 = 드래프트 종료 신호). prompt 핸들러도 자동응답 분기 전에 닫도록 이동.

**② 삭제한 계정이 전체 플레이어 통계에서 안 사라짐 (RoomManager.ts)**
- 증상: 관리자가 계정을 삭제하고 새로고침해도 "전체 플레이어 통계"에 그대로 남음.
- 원인: stats.json은 닉네임 키라 계정을 지워도 누적 통계가 파일에 남는다(과거 삭제분
  Skull·Player·tester1·livegamer·Rage 등 유령 5건 실측). `sendLeaderboard`가 파일의
  모든 닉네임을 그대로 내보내 유령이 리더보드에 계속 표시됐다. (플레이어 관리 *목록*은
  users 테이블 직접 조회라 정상 갱신 — 그래서 "전체 통계"만 문제였음)
- 수정: `sendLeaderboard`가 `db.listUsers()`의 현재 계정 닉네임 집합으로 필터 →
  **존재하는 계정만** 리더보드에 포함. stats 파일 정리 타이밍과 무관하게 삭제 즉시 반영.
  (기존 `StatsStore.remove`는 파일 정리용으로 유지.) 유령 통계 필터 회귀 테스트 추가.

**검증**: RoomManager 32개 테스트 통과(리더보드 유령 제외 케이스 보강), 클라 vite 빌드 클린.
※ 운영 주의: 서버는 `node --import tsx`(watch 아님)라 **재시작해야** 서버측 수정이 반영된다.

## 2026-07-19 (33차 — 전체 플레이어 통계 · 관리자 계정 관리 · 관리자 전체 리플레이)

메인 화면에 **전체 플레이어 통계(리더보드)** 를 추가하고 관리자 기능(계정 목록·삭제·
전체 리플레이 열람)을 확장. protocol → SiteDb/StatsStore → RoomManager → App.tsx/styles.css
관통. 신규 프로토콜: 클라 `leaderboard`/`adminUsers`/`adminDeleteUser`, 서버 `leaderboard`
(`LeaderboardEntry[]`)/`adminUsers`(`AdminUserEntry[]`).

**전체 플레이어 통계 (누구나)**
- `RoomManager.sendLeaderboard`: `StatsStore.all()` 전체 닉네임을 deriveStats 후 게임 수
  내림차순(동률 시 평균순위 오름차순) 정렬해 전송. **관리자 게이트 없음** — 로그인한 누구나.
- 홈 "전체 플레이어 통계" 카드: 표(#·플레이어·판수·평균순위·1위율·화료율·방총률), 본인 행
  하이라이트(`.lb-me`), 카드가 그리드 전폭(`grid-column: 1/-1`). authOk·refreshHome·새로고침에서 요청.

**관리자 계정 관리**
- `SiteDb.listUsers`(가입순+참가 게임 수)·`deleteUser`(트랜잭션: 세션 삭제→game_players.user_id
  NULL로 익명화→users 삭제, 삭제 username 반환). 삭제 시 RoomManager가 `StatsStore.remove`로
  누적 통계도 정리(비동기 완료 후 목록·리더보드 재전송). **본인 계정 삭제 불가**(CANNOT_DELETE_SELF).
- 홈 "플레이어 관리" 카드(관리자 전용): 목록+삭제 버튼(본인 행 비활성), confirm 재확인.

**관리자 전체 리플레이**
- `sendReplayList`: 관리자면 `listAllGames`(최신순 전체), 일반 사용자는 기존 `listGamesFor`(본인).
  `replayGet`은 이미 관리자 우회 존재(변경 없음). 홈 카드 제목 관리자 시 "모든 리플레이"로.

**검증**: RoomManager.test.ts에 5개 테스트 추가(리더보드 정렬·adminUsers 권한·삭제 후 목록/통계/
로그인 소멸·본인삭제 거부·관리자 전체 리플레이) 전부 통과. 클라 vite 빌드 클린. 수정 파일 타입체크
클린(기존 helpers.ts 리팩터링 중 타입에러 3건은 무관, 본 작업 전부터 존재).

## 2026-07-19 (32차 — 타격감(Juice) 전면 강화: 연출·효과음·화면 흔들림)

"타패·리치·론·쯔모·후로의 타격감이 부족하다" 피드백에 대응. 클라이언트 3파일만 수정
(sfx.ts 전면 재설계 / App.tsx / styles.css) — 서버·코어 무변경, 에셋 없이 합성/CSS만.

**효과음(sfx.ts 재설계)**
- 마스터 버스(Gain→DynamicsCompressor, threshold -16/ratio 4) — 레이어 합산 클리핑 방지,
  효과음 토글도 이 게인 하나로. 공유 노이즈버퍼(연타 GC 방지).
- 빌딩블록: thump(킥드럼식 사인 피치드랍 = 타격의 몸통)·noiseBurst(필터형 노이즈,
  랜덤 오프셋)·sparkle(고음 사인 무리). 사운드 피크를 컷인 글자 슬램(~230ms)에 동기.
- own 인자 규약 신설 — 타인이 낸 소리는 살짝 작게 낸다.
- 치(스와이프+노크)/펑(이중 노크)/깡(하강 삼중 임팩트+서브붐) 구분음. 론(라이저→슬램+
  서브베이스 드랍→팡파르)/쯔모(픽업→밝은 슬램) 분리. 만관~삼배만 등급별 팡파르
  (음 4→7개·간격 조임)+코인 캐스케이드. 역만: 라이저 0.45s→대형 슬램→공(gong) 비조화
  배음→시머 (~2s).
- 결과창: 역 스탬프 펜타토닉 계단(yakuSteps)·점수 카운트업 틱(피치 상승)·종지음.
- suspended 컨텍스트엔 스케줄 안 함(readyAudio 가드) — 재접속 중 쌓인 소리가 첫 클릭에
  한꺼번에 터지는 폭발 방지.

**화면 연출(App.tsx + styles.css)**
- Production.impact(shake 1~4 + delayMs) — 연출 큐 활성화 effect에서 글자 슬램 시점에
  발동. game-root[data-shake] 속성만 토글, CSS가 .table(월드)만 흔든다(컷인 글자는 고정).
  prodFiredKey 가드로 effect 재실행(HMR) 시 사운드 이중 재생 방지.
- 컷인 강화: 톤 컬러 임팩트 플래시·충격파 링·방사형 스피드라인(150vmax conic, 모바일
  off)·파티클 버스트(mulberry32 시드 고정, 화료 전용 — 후로의 상대 가치 유지).
- 리치 배너 → **풀 연출 격상**(riichi-stage): 비네트 암전+붉은 밴드+CSS 천점봉
  슬라이드인+금속 그라디언트 텍스트+샤인 스윕+shake2.
- 역만: 밴드 슬로우 오픈(0.5s 예열)→슬램 450ms 동기 shake4, 무지개 시머 텍스트
  (그라디언트 클립), 낙하 컨페티 40개, 이중 충격파·이중 플래시, ttl 2600ms.
- 타패: tile-in을 착지 스쿼시&스트레치(1.08,0.9) 슬램으로, 최신 타패에 화이트 플래시+
  더스트 링(의사요소 — 리치 눕힘패는 제외). 컷인·리치 연출은 ttl 끝 0.16s 페이드(prod-out).
- 결과창: 역 리스트 스탬프 스태거(0.15s+i*0.09s, 사운드 동기), 화료 손패 스태거 공개
  (i*35ms), 점수 로그 스케일 카운트업(CountUpPoints, rAF)+완주 팝.
- 강도 예산 원칙: 타패(매초)는 미묘하게·화료에 몰아주기. 치=무진동, 펑=1, 깡·리치·쯔모=2,
  론·만관=3, 배만+·역만=4. 유국은 의도적 정적.

**설정/접근성**
- Settings 2키 추가: screenFx(화면 흔들림·플래시·파티클, 기본 ON — 멀미·광과민 대응),
  sfxOn(효과음, 기본 ON — 마스터 게인 뮤트라 호출부 무수정). prefers-reduced-motion CSS
  전면 대응(흔들림·파티클·플래시 차단, 무한 시머 정지, 인라인 스태거 딜레이 !important 리셋).

**검증**: 클라 타입체크·전체 테스트·프로덕션 빌드 통과. dev 서버(3001/5173, 라이브 3011
비접촉)로 봇 게임 실플레이 — MutationObserver 로그로 펑 컷인+234ms shake1, 리치
풀연출+180ms shake2, 론 shake3, 만관 shake3, 치·유국 무진동 확인, 콘솔 에러 0.
연출 비주얼(리치/론/역만)은 일시정지 정적 마운트로 검수. 적대적 리뷰 발견 반영:
역만 밴드 duration 죽은 규칙(선언 순서)·reduced-motion 특이성 역전(역만 body·증강 shimmer)·
리치 하드컷·setSfxEnabled 램프 앵커·컴프레서 완화(threshold -16/ratio 4/release 0.25).
※ 기존 armable-pulse 죽은 애니메이션(액티브 증강 손패 강조)은 별도 태스크로 분리.
※ 검증용 테스트 계정(fx테스트)·봇 게임 기록이 replays/ 공유 저장소에 남아 있음.

## 2026-07-19 (31차 — 동풍전 모드 + 템포 증강 모드 분리)

반장전에 더해 **동풍전(tonpuu)** 게임 모드 추가. 대기실에서 방장이 선택. 코드·테스트·문서 함께 갱신.

**게임 모드 인프라**
- `GameConfig.mode?: GameMode("hanchan"|"tonpuu")` 신설(GameState.ts, 생략=hanchan 폴백).
  `StandardGameOptions.mode` → `createStandardGame` → `createInitialGameState`로 관통(config 통째 전달이라 리플레이 `__init__`에 자동 지속).
- `DraftStage`에 **`eastThird`(동3국 진입)** 추가 — 3곳(protocol·DraftController·AugmentDef inline) 동시 갱신.
- `HanchanConfig.mode` + **`hanchanConfigForMode(mode)` 헬퍼**: 모드별 진행 설정 한 벌 반환.
  - hanchan: maxWind=2·westEntry=true·drafts[gameStart,southEntry]
  - tonpuu: **maxWind=1·westEntry=true·drafts[gameStart,eastThird]** (동4국까지, 미달 시 남장 서든데스=남입).
- runLoop 중반 드래프트 트리거를 데이터화(`MID_DRAFT_TRIGGER`): southEntry=(장2·국1), eastThird=(장1·국3).
  `draftedStages` 가드로 연장·본장 재추첨 방지. resume의 완료 스테이지 복원도 `config.draftSchedules` 기반으로 일반화.

**증강 모드 필터**
- `AugmentDef.modes?: GameMode[]`(생략=양 모드). `DraftController.offerable`이 스테이지+모드로 필터(roll·grantChain 공용). 판정은 `state.config.mode ?? "hanchan"`.
- **게임 길이(장 수)에 의존하는 템포 증강 3종만** 반장/동풍 분리(나머지 국내 템포 증강은 공용):
  - 대기만성: `late_bloomer`(남4국↑ 3배, modes hanchan) / **`late_bloomer_east`(동4국↑ 및 남입 연장 3배, tonpuu)**
  - 선봉: `vanguard`(동장 1.5×/타장 0.75×, hanchan) / **`vanguard_east`(동1~2국 1.5×/그 외·남입 연장 0.75×, tonpuu)** — early는 prevalentWind===1로 못박아 남입 연장 오판 방지
  - 기세: `momentum`(연승 상한 3, hanchan) / **`momentum_east`(연승 상한 2, tonpuu)**. *_east는 같은 이름·다른 id, momentum_east는 streak/view 키를 원본과 공유(모드당 한쪽만 등장하므로 충돌 없음).
- 콘텐츠 카탈로그 Gold 34 / Prism 27로 증가.

**서버·클라**
- 서버: `Room.gameMode`(기본 hanchan), `setGameMode` 메시지(방장·대기 중만), `LobbyMessage.gameMode` 브로드캐스트, startGame이 `hanchanConfigForMode(room.gameMode)` 스프레드.
- 클라: 대기실 `.mode-select` 토글(반장전/동풍전) — 방장만 조작, 비방장은 현재 모드 표시. `setGameMode` 전송.

**테스트**(+10): `content/test/tonpuu_augments.test.ts`(모드 필터 양방향·3종 변형 동작), `core/test/Hanchan.test.ts`에 동풍전 완주(드래프트 gameStart·eastThird 2회)·결정론 2건. 전체 383통과, 4개 프로젝트 typecheck·클라 빌드 클린.

---

## 2026-07-19 (30차 — 플레이테스트 피드백 10건: 밸런스·UX·버그)

플레이 중 나온 이슈 10건 일괄 처리. 콘텐츠·클라·서버·문서 함께 갱신.

**증강 밸런스/버그**
- **물러설 수 없는 선언(no_retreat)**: "게임당 1회" → **"매 국 1회"**로 변경. 게임 단위
  `used:{h}` 플래그 제거, 국 단위 `round:{h}`(roundKey)만으로 게이팅 → 국이 바뀌면 자동으로
  다시 선언 가능. validate/holderTurnOptions 모두 `declaredThisRound` 기준. 회귀 테스트 +2
  (같은 국 재선언 불가·다음 국 재선언 가능).
- **no_retreat 첫시작 활성화 꼬임(#1)**: 東1국 첫 턴에만 뜨는 인트로 스플래시(z=70)가
  보드를 가려 액티브 증강 메뉴(z=30)가 뒤에 깔려 안 보였다. prompt에 액티브 증강 옵션이
  있으면(내 프롬프트) 인트로를 즉시 닫도록 처리(App.tsx prompt 핸들러).
- **탕야오 전문가(bounty_tanyao)**: +2500 → **+2000점** (설명·테스트 동반 수정).

**영상 정찰(rinshan_preview) 정확성(#7)**
- 기존 "왕패 앞 4장 공개"는 거짓 정보였다: 이 엔진은 영상패 쯔모마다 패산 마지막 패를 왕패
  '앞'에 보충(도라 인덱스 고정)하므로 실제로 뽑히는 건 `deadWall[0]` 하나뿐이고 2~4번째는
  절대 안 뽑힌다. → **peek count 4 → 1**로 축소해 "다음 깡에서 가져올 1장"만 공개(항상 정확).
  테스트도 1장/hiddenCount 13으로 수정.

**클라이언트 UX/버그**
- **자동 버림(쯔모기리) 설정 추가(#3)**: Settings.autoDiscard. 내 턴에 쯔모한 패
  (`myDrawnTile`)를 자동으로 버린다. 구조는 "화료부터 체크 → 가능하면 화료, 아니면 쯔모기리" —
  화료 가능 시엔 자동 화료 토글과 무관하게 먼저 화료해 화료패를 흘리지 않는다(리치 후 자동 진행).
- **관전 모드(#4)**: 상대 손패 정렬(OpponentStrip이 `open`을 sortTileIds) + 오름패(대기) 표시
  (관전 시 각 플레이어 winningKinds 계산 → WaitsBadge). 하단 시점 플레이어도 관전 시 오름패 표시.
- **대면 이름/증강 칸(#5)**: `.nameplate` flex-wrap+max-width(min(94vw,520px)), `.np-augs`
  wrap, `.aug-pill` inline-flex+overflow-wrap로 긴 닉네임·증강명이 밖으로 튀지 않게. np-name에
  title(전체 이름 툴팁).
- **증강 드래프트 타이머+대기(#6)**: DraftOfferMessage에 `deadlineMs`(서버 DECISION_TIMEOUT_MS
  30s) 추가 → 클라 카운트다운(5초 이하 강조). 선택 후 오버레이를 닫지 않고 "다른 플레이어
  대기 중"으로 전환(draftPicked 상태), 전원 선택 완료 시 서버가 다음 프롬프트로 진행.
- **방 코드 복사(#8)**: 평문 HTTP 배포는 `navigator.clipboard`가 undefined라 무반응이었다 →
  `legacyCopy`(textarea+execCommand) 폴백 추가.
- **가깡 알림(#9)**: 가깡은 기존 펑 묶음을 제자리 승격(`kan_added`)해 melds 길이가 안 늘어
  컷인 트리거(길이 증가 게이트)를 놓쳤다. bannerShown에 `kanAdded` Set(키 `pid:kindKey`)
  추가해 최초 1회만 "깡" 컷인. 첫 뷰 시드·새 국 초기화 포함.

**검증**: 4패키지 타입체크 통과, 전체 테스트 368개 통과, 클라 프로덕션 빌드 성공.

## 2026-07-18 (29차 — 증강 신규 27종 + cliff_bloom 전깡 지원 + finalAdjust 훅)

브레인스토밍(6관점 생성 → 등급별 심사)으로 뽑은 증강을 사용자 승인 후 구현.

- **cliff_bloom(절벽 위에 피어난 꽃) 전 종류 깡 지원**: 안깡만 → 안깡·가깡·대명깡.
  코어 FlowController가 리액션에서 `minkan`만 영상패를 뽑던 것을, `KAN_DECLARED(kan_open)`을
  내는 커스텀 콜도 `sys.drawRinshan`을 돌려주도록 일반화(엔진 특정 액션명 비의존).
  회귀 테스트 +2(가깡·대명깡 영상개화 화료).
- **신규 증강 27종** (Silver 10 / Gold 9 / Prism 8, 파일 1개=증강 1개, 코어 등록 API만 사용):
  - Silver: nerves_of_steel·fu_artisan·near_dora·yaku_gourmet·four_pillars·lightning_hands·
    victory_pledge·raise_declaration·ura_peek·take_back
  - Gold: hidden_blade·tile_dyeing·buried_mine·scapegoat·dora_coronation·lightning_contract·
    copycat·single_path_contract·let_it_ride
  - Prism: alchemist·blood_contract·aotenjou_ceiling·devils_advance·all_or_nothing·
    eternal_dealer·forbidden_yaku_book·pond_snatch
- **코어 신규 훅**: `score.finalAdjust`(게임 종료 시 최종 점수 보정 — calcRankings가 정산 직전
  playerId·state로 resolve). 외길 계약(위약금 -8000)·가불 인생(상환 -15000)이 사용. ※둘 다 48차에 삭제.
  content util에 `winPointsWithExtraHan`(상태 조건부 "+N판"을 정산 점수로 환산) 추가.
- **보류 2종**(코어 흐름 확장 필요): sky_net(천라지망 — 쯔모 로브 프롬프트), shadow_riichi
  (그림자 선언 — PlayerView 리치 은닉). ※ prophetic_dream(예지몽, Gold)은 사용자 요청으로 제외.
- **검증**: 4패키지 타입체크 통과, 전체 테스트 366개 통과. 신규 27종 강제설치 실게임 한 국
  8시드 크래시 스위프(216회) 무크래시, 점수 계산 값 검증 5종(강심장 +1500/네 개의 기둥 +1500/
  덤터기 제로섬 전가/뚫린 천장 보전≥0) 통과.

## 2026-07-18 (28차 — 봉인 패 가시화 + "부로"→"후로" 용어 통일)

"9만·6삭 같은 패가 상호작용도 안 되고 안 버려진다" 문의의 원인은 버그가 아니라
봉인술사(discard_lock)였다 — 봉인 패는 서버 turnPrompt에서 discard 후보에서 빠지고,
클라 `hand-locked`는 cursor 외 아무 표시가 없어(딤은 리치 전용) 멀쩡해 보이는 패가
소리 없이 무반응이었다. 당하는 쪽에 봉인을 가시화:

- **core**: `PlayerRoundView.sealedKinds?: string[]` — buildRoundView가
  `discard.blockedKinds` 규칙을 본인(관전자·리플레이는 전원) 시점으로 해석해 kindKey
  목록을 뷰에 포함(중복 제거, 비면 생략). 봉인 여부는 클릭하면 어차피 드러나는 정보라
  본인에게 숨길 이유가 없음 — 전체 봉인 목록(타인 것)은 여전히 보유자 전용 augmentView.
- **클라 표시**: 봉인 패에 🔒 뱃지+보라 테두리(`hand-sealed`, conjured 보라 계열).
  버림 차례(discard/riichi/free_discard 옵션 존재)에 봉인 패를 클릭하면 토스트
  "🔒 봉인된 패 — 이 게임 동안 버릴 수 없습니다" (리치 모드 제외).
- **클라 배너**: detectTransitions에 봉인 감지 — 내 sealedKinds 수가 이전 알림보다
  늘면 "봉 인" 배너(신설 seal 톤, 보라)+안내 문구. bannerShown.sealed 카운터는 봉인이
  게임 내내 유지되므로 국 전환에 리셋하지 않고, 첫 뷰(재접속)는 시드만 해 헛알림 방지.
- **봉인술사 설명 갱신**: "상대는 자기 봉인 패에 자물쇠 표시만 보고, 전체 봉인 목록은
  나만 볼 수 있다"로 (기존 "봉인 목록은 나만"은 무반응 클릭으로 사실상 새는 정보였음).
- **용어 통일**: "부로" → **"후로"** 전 소스·문서·테스트 일괄 치환(136곳, UI 라벨
  "후로"·자동 패스 설정 문구 포함). 로직이 문자열 "부로"에 의존하는 곳 없음 확인.
- **검증**: 테스트 332개 통과(sealedKinds 뷰 노출 회귀 추가 — 본인/타인/보유자/관전자),
  3패키지 타입체크·클라 빌드 통과.

## 2026-07-18 (27차 — 안깡/이름/동시드래프트/현상금 개편/무효투표 + 국전환 순서)

사용자 요청 8종을 조사(6-way)→구현→적대적 리뷰(3-way)로 마무리.

- **국 전환 연출 순서(핵심)**: `ROUND_SETTLED`가 정산 시점에 다음 국 번호를 미리 올려, 정산 직후(round.over) 뷰가 이미 "동3국"으로 보였다 → detectTransitions가 이 뷰를 새 국으로 오인해 론·점수표보다 먼저 새 국 배너를 띄우고 지난 국 리치·후로를 재발동했다. 새 국 감지를 `next.round.phase !== "round.over"`로 게이트해 진짜 다음 국 뷰에서만 처리 → 리치→론→점수표→(닫기)→동N국 순서 보장.
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
- (28차) 당하는 쪽 UX 추가: 봉인 패가 소리 없이 클릭만 안 되던 것을 — 자기 봉인 종류는
  `PlayerRoundView.sealedKinds`로 받아 🔒 뱃지+보라 테두리로 표시하고, 버림 차례에 클릭하면
  토스트 안내, 봉인 발동 시 "봉 인" 배너(seal 톤). 클릭해 보면 어차피 드러나는 정보라 정보
  비대칭 손실은 없다. 전체 봉인 목록(누가 뭐가 봉인됐는지)은 여전히 보유자 전용.

### 우는 국사무쌍 (open_kokushi) — 특수 퐁 재설계 + 3판

- **서로 다른 요구패 3장 특수 퐁(kokushi_pon)**: 1만1통1삭 / 9만9통9삭 / 백발중 /
  동남서북 중 3패. 이 퐁을 하면 국사 외 형태로 화료 불가(분해상 자연 배타), 머리는
  울지 않은 손패, 퐁 개수 제한 없음, 8판 역만 → **3판**.
- **코어 리액션 확장 훅 신설**: `GameEngine.registerReactionOptions` + FlowController가
  리액션 프롬프트에 주입하고, resolve가 표준 타입이 아닌 콜을 **커스텀 콜**로 펑과 치
  사이 우선순위 처리(엔진은 특정 액션명 하드코딩 없음). `Meld.kind`/`CallMadePayload.meldKind`/
  `MeldInfo.kind`에 `kokushi_pon` 추가. decompose의 국사-후로 분기를 M개 후로(3M종)로 일반화.
  helpers.scoringOptionsOf가 kokushi_pon 후로의 3종을 국사 덮개로 넘긴다.

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
- **해결(멱등 + effect 클리어)**: `bannerShown` ref로 국(roundKey)·리치·후로를
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
- **수정**: 후로 전면 금지(패스, 멘젠 유지) + 버림을 뷰 기반 고립도 휴리스틱으로
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
- **기생충(parasite, prism)**: 자기 턴에 숙주 지정(국마다 1회) → 그 국 정산에서
  숙주 이득의 절반(100점 단위)을 대신 받음(제로섬 보존 — 숙주에서 뺀 만큼 이전).
  숙주가 잃는 국에는 영향 없음. 지정은 국 단위로 만료되어 매 국 새로 고른다
  (2026-08-04: 게임당 1회 지정 + 화료/방총 시 자동 이동을 폐기 — 보유자가 통제할 수
  없어 "랜덤으로 돌아간다"는 체감이었다). parasite_attach 능동 액션 + ROUND_SETTLED 인터셉터.
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
  손패·바닥·정보 패널 완전 복원(부재 중 진행분 ×69→×66 반영) 확인.

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
- **주요**: 버림패가 후로로 바닥에서 사라지면 후리텐 소실 →
  PlayerRoundState.discardedKinds 이력 신설(판정·표시 모두 이력 기준).
  역 없음으로 론 못 하는 대기패 통과 시 일시 후리텐 미마킹 → 전면 마킹.
  창깡(가깡 론) 시 일발 소멸 → 일발 소멸을 깡 완성(영상 쯔모) 시점으로 이동.
  리치 선언패 론 시 공탁 미반환 → 반환. 반장 종료 잔여 공탁 소멸 → 1위 지급.
  최종 순위 점수 반환점 미차감(제로섬 깨짐) → (raw−30000)+우마+오카.
  타임아웃 폴백이 자동 론/펑 → 패스>쯔모기리 우선(safeFallbackOption).
  하저 후로 허용·패산 0 깡 허용 → 금지. 깡 4회 상한 없음 → 상한.
  구종구패를 아무 순에나 선언 가능(firstTurn 미해제) → 첫 쯔모 한정.
- **보완**: 도비 0점 '이하'→'미만'(문서 기준), 영상개화+해저 중복 가산 제거,
  치·펑에서 적5 사용 여부 선택지 제공, 후로 시 일시 후리텐 해소(EMA),
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

## 2026-07-19 (증강 밸런스 패스 + 오픈 리치 추가)

프리즘 중심 밸런스 조정과 신규 증강 1종. 드래프트 확률이 Silver60/Gold30/Prism10이라
프리즘은 게임당 2번의 증강턴에서만 드물게 보이므로, 보수적으로 짜여 약했던 것들을 버프.
"대처 불가능한 사기"(cliff_bloom=2국당1회 깡 후 텐파이면 무조건 영상개화 등)는 손대지 않음.

- **프리즘 버프**: suit_unify(청일색 허용 — 혼일색만 봉인), tanyao_break(1→2판),
  open_kokushi(3→4판), future_sight(스택당 500→1000점), rinshan_gamble(강제 대체 타패
  5→3회), pond_snatch(2→3회), hand_swap3·full_hand_swap(게임당 1→2회, 불리언→카운터).
- **실버 소폭 상향**: gokuakumudo(후로패당 100→200점), honba_collector(본장당 200→300점).
- **신규 증강 — 오픈 리치 (open_riichi_reveal, gold)**: 멘젠·텐파이에서 액티브 버튼으로
  선언(공탁 1000점). 오름패(대기)를 view:*: 채널로 전원 공개하고, 화료 시 +1판, 그중
  '리치 아닌 상대' 론이면 +1판 더(winPointsWithExtraHan 점수 환산). 코어 표준 open_riichi
  (개문선언=후로 손 리치 허용)와 별개라 id를 open_riichi_reveal로 분리. 클라이언트는 공개
  대기패를 상대 손패 위 WaitsBadge(`waits-badge-open`, 금색 펄스)로 크게 표시.
- **검증**: 전체 테스트 통과, 4패키지 타입체크 통과. 신규 open_riichi.test(선언 4종)·
  변경분 테스트값 갱신(swap 카운터·suit_unify 봉인·tanyao/kokushi 판수·future 스택·
  rinshan 카운터·gokuakumudo/honba 점수)·크래시 스위프에 open_riichi_reveal 추가.

## 2026-07-16 (19b차 — QoL 후속 보완)

19차 실플레이 피드백 반영

- **증강 툴팁 잘림 수정**: 좌·우 자리 플레이어의 증강 툴팁이 화면 밖으로 잘리던 문제 —
  자리별로 툴팁을 중앙 쪽으로 펴도록 정렬(`tipAlign`: 좌=오른쪽으로, 우=왼쪽으로).
- **손패 hover → 공개패 강조 (신규)**: 내 손패에 마우스를 올리면 같은 종류의 버림패·후로가
  청록으로 반짝여 어디에 몇 장 나왔는지 보인다. `HighlightContext`로 River/Meld/공개패에 전파.
- **화료패 미리보기 수정**: (1) `.hand-tile`에 `position:relative`가 없어 툴팁이 타일에
  고정되지 않던 문제 수정. (2) 리치 모드뿐 아니라 텐파이면 어느 패든 hover 시 대기패를 표시.
- **후로없음 깜빡임 제거**: 후로 프롬프트가 떴다가 자동 패스로 지워지던 것을, 프롬프트 수신
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
  후로없음 ON → 치·펑·깡만 있는 후로 프롬프트 자동 패스(론이 섞이면 사람이 판단).
  자동 액션은 세대 카운터로 수동 조작·새 프롬프트 시 무효화.
- **리치 UX**: (1) 리치 선언 후 버릴 수 없는 손패를 어둡게 처리(자유버림 증강 보유 시 예외).
  (2) 리치 모드에서 패에 마우스를 올리면 그 패로 리치했을 때의 화료패(대기)를 미리 표시 —
  `winningKinds`를 클라이언트에서 계산.
- **액티브 증강 버튼**: 회수·강탈·간파 등 버튼형 발동 증강 전용 버튼(좌하단). 지금 쓸 수 있으면
  활성(여럿이면 목록), 보유했지만 못 쓰면 비활성, 미보유면 숨김. 액션 바에서 증강 액션 분리.
- **상대 증강 툴팁**: 이름표의 증강 pill에 마우스를 올리면 이름·등급·상세 설명 커스텀 툴팁.
- **개막 연출 한글화**: `對局開始`·자풍 표기를 `대 국 시 작`·`동/남/서/북`으로.
- **UI 확대**: 중앙 보드·손패·후로·이름표·플레이트·액션 버튼 크기 상향(vw 기반이라 좁은 화면 무넘침).
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
- **버그 수정 (기존)**: 리치 validate가 후로 수를 무시하던 문제 (open_riichi 조합 시
  텐파이 판정 불가) — meldCountOf 반영
- **@majak/content 신설**: 증강 30종 + 테스트 68개 (병렬 에이전트 8조 구현).
  총 카탈로그 37종. 서버 extraAugments 주입, 리플레이 CLI 동일 카탈로그 사용
- **프로토콜 확장**: catalog(증강 id→이름·등급 — 클라 하드코딩 제거),
  roundOver(정산 상세 + 우라도라 + 화료자 공개 손패), PlayerAgent.notify? 추가
- **클라이언트 게임 연출 대개편**: 개막 연출, 론/쯔모/역만 컷인(밴드+슬램),
  국 결과 화면(화료 손패 공개·역 목록 순차 등장·판부·점수·우라도라·점수 변동표),
  WebAudio 합성 효과음 8종(에셋 불필요), 점수 플로팅, 배패 애니메이션,
  증강 정보 패널(봉인·현상금·간파 오름패를 패 이미지로), 17장 손패 대응,
  안개 바닥(가려진 버림패 뒷면), 등급색 증강 pill, 새 증강 액션 버튼(대상 표시)
- **검증**: 테스트 240개 통과 (코어 172 + 콘텐츠 68), 4패키지 타입체크·클라 빌드 통과,
  봇 반장전 40시드 스위프 실패 0·리플레이 라운드트립 40/40 일치·36종 실전 발동,
  브라우저 실플레이 확인 (입장→드래프트 순서·치 후로·프롬프트·바닥·정보 패널)
- 문서: 04/09/10/12 갱신 (새 규칙 표·peek/augmentView·프로토콜·확장 지점)

## 2026-07-15 (16차 — Game Table UI Overhaul)

작혼 스타일 게임 테이블 UI 전면 개편 (App.tsx·styles.css 재작성)

- **테이블 레이아웃**: 4방 배치(나=하단, 하가=우, 대면=상, 상가=좌), 중앙 인포 패널
  (장·국, 남은 패산, 본장, 공탁, 도라/우라 표시패), 상대 손패 뒷면 렌더
- **플레이어 배지**: 자풍(東 강조)·점수·리치봉·증강 pill(한글명, 전원 공개), 턴 골드 펄스
- **바닥(버림패)**: 각자 앞 6열 그리드, 새 패 등장 애니메이션, 최신 버림 글로우
- **액션 바**: 쯔모/론/펑/치/깡/패스 버튼(대상 패 미니 이미지 포함), 리치 모드
  (버튼 → 리치 가능 패만 글로우 → 클릭 선언), 등장 애니메이션
- **연출**: 리치 선언 배너(뷰 전이 감지), 화료/유국 배너, 게임 종료 랭킹 모달,
  드래프트 풀스크린 오버레이(등급색 카드·순차 등장)
- **로비**: 게임풍 조인 화면
- 브라우저 실플레이 검증: 드래프트 → 테이블 → 버림 → 후로 액션 바(치+패 이미지)까지 확인
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
- 스안커 쯔모 vs 론(산안커+또이또이) 구분, 량페코>치또이 해석 선택, 셈수 역만까지 검증
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
