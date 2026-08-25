# QA 반장전 밸런스 — GROUP: system (시스템 층)

개별 증강이 아니라 **드래프트 컨트롤러 · 매치 컨트롤러 · 봇 · 밸런스 문서**를 본다.
(읽기 전용 감사. 코드 수정 없음.)

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|----|------|------|--------|----------------|------|
| `sys/tier-stats` | 티어 자동 조정 통계가 모드를 안 나눈다 | 깨짐 | **P1** | `packages/core/src/augment/tierAdjust.ts` 전체(파일에 `mode`·`tonpuu` 문자열 0건) · `packages/server/src/AugmentStatsStore.ts`(동일하게 0건) · `packages/core/src/augment/AugmentRegistry.ts:24~28,130` | 집계 키에 모드를 넣고 모드별 가중치를 따로 저장 → `setWeightOverrides`를 모드별로 주입 |
| `sys/scaled-uses` | 매치 예산 1.5배 vs 국 수 2배 | 약화 | **P1** | `packages/content/src/util.ts:120~145`(`scaledUses` = 동풍전×1.5 올림) · `HanchanController.ts:213~226`(4국 vs 8국) | 의도적 절충임이 주석에 명시 — 남기려면 문서에 «반장전 자원형은 국당 25% 희석이 설계» 라고 못 박고, 자원형/상시형 사이 격차를 티어 가중치로 상쇄 |
| `sys/passive-2x` | 상시·매국형은 스케일링 대상이 아니다 | 강화 | **P1** | `matchUses` 사용 14파일 / `scaledUses` 7파일 vs `packages/content/src/augments/` 124파일 → **약 100종이 국 단위**로 무보정 | 국 단위 증강도 «게임당 총 기대값»으로 재평가. 폭주형(누적·스택)은 상한 도입 검토 |
| `sys/fixed-thresholds` | 고정 점수 임계값이 모드 불변 | 강화/약화 혼재 | **P1** | `HanchanController.ts:183~194`(`returnScore:30000`, `uma:[5,15]`, `oka:0`, `startScore:25000`) · `hanchanConfigForMode`는 `mode/maxWind/westEntry/draftSchedules` **4개만** 갈아 끼운다(:210~227) · `shouldEnd`의 `instantWinScore`(:1950~1956, 천하통일 45000) | 반환점·즉시우승 문턱을 모드별로 분리하거나(동풍전 반환점 하향 / 45000은 반장전 전용) 최소한 문서에 비대칭을 명시 |
| `sys/draft-stages` | `draftStages`·`modes` 제한의 모드 정합성 | OK | — | 전수: `late_bloomer.ts:44,46`(hanchan) · `late_bloomer_east.ts:43,44`(tonpuu) · `devils_advance.ts:63`(`gameStart` — 양 모드 공통 스테이지) · `reload.ts:187`(`eastThird·eastFourth·southEntry·southThird` = **양 모드의 중반 스테이지를 모두** 포함) | 없음 — **어느 한 모드에서만 열리는 스테이지에 잠긴 증강은 0건**. 사고 없음 |
| `sys/stage-value` | 마지막 픽의 남은 수명이 비대칭 | 약화(동풍전 쪽) | P2 | `HanchanController.ts:341~355`(`eastFourth`=동4국 진입 = **정규 마지막 국**, `southThird`=남3국 = 남은 2국) | 동풍전 3번째 픽은 사실상 1국짜리 — 동풍전 스케줄을 `eastSecond`쯤으로 당기거나 그 스테이지의 즉효성 증강 가중치 상향 |
| `sys/cell-size` | 좌석 칸 분할이 4스테이지를 견디는가 | OK | — | `DraftController.ts:284~330` — 칸 크기 계산 주석이 «스테이지 4회(반장전)»와 «남 보유 최대 3×3=9 + 내 3 + 새로고침 6 = 18»을 명시하고 24로 잡음. 풀 부족 시 칸을 좁혀 분할 자체는 보존 | 없음 |
| `sys/draft-rng` | 티어 확률·중복/충돌 배제가 모드에 의존하는가 | OK | — | `DraftController.ts:140~148`(`offerable` = `draftStages` ∩ `modes`만 봄) · `:164~205`(`tooHardForFirstDraft`는 `gameStart` 한정, 양 모드 동일) · `:340~342`(`count`는 룰 값, 모드 무관) | 없음 — 모드가 바꾸는 것은 **스테이지 수뿐**이다 |
| `sys/config-plumbing` | 모드 설정이 모든 경로에서 일관되는가 | OK | — | `RoomManager.ts:5897` · `ReplayReader.ts:189` · `bot/arena.ts:259` 전부 `hanchanConfigForMode` 경유. `resumableHanchanConfig`(:249~263)가 `draftSchedules`를 리플레이에 실어 재개도 일치 | 없음 |
| `sys/should-end` | 서든데스·아가리야메·토비 | OK | — | `shouldEnd`(:1943~1975)는 `maxWind`·`maxWind+1`로만 판정 — 모드 하드코딩 없음. `agariYameTriggers`(:277~300)도 `maxWind` 인자 · 도중유국 제외까지 처리. 토비는 `:1235~1241` | 없음 |
| `sys/honba` | 연장(본장)·친 연장이 드래프트를 재발동시키는가 | OK | — | `HanchanController.ts:1247~1250` — `draftedStages` 가드로 스테이지당 1회. 주석이 «남1국 연장으로 southEntry 반복»(:515) 버그를 명시적으로 막았다고 기록 | 없음 |
| `sys/bot-length` | 봇이 모드 길이를 아는가 (플레이) | OK | — | `packages/server/src/bot/match.ts:29,66,77~80`(`TOTAL_ROUNDS {hanchan:8,tonpuu:4}` → `roundsLeft`·`lateness`·`riskAppetite`) · `packages/content/src/augments/botPlan.ts:206,214~226`(`view.round.mode` 사용, `PlayerView.ts:287,997`에 실려 있음) | 없음 |
| `sys/bot-draft` | 봇이 모드 길이를 아는가 (드래프트) | 약화 | P2 | `packages/server/src/bot/draft.ts` 전체 — `mode`·`stage`·`roundsLeft` 어느 것도 입력에 없다(`DraftContext`는 profile·held뿐, :57~) | 드래프트 점수에 «남은 국 수» 축을 넣어 자원형(반장전에서 총량↑)과 즉효형(마지막 스테이지)의 값을 갈라 준다 |
| `sys/bot-mode-source` | 봇 모드가 push 주입이라 누락 위험 | OK(잠재) | P2 | `BotAgent.ts:232`(기본 `"hanchan"`) · `setGameMode` 호출은 `RoomManager.ts:5852`와 `bot/arena.ts:246` **두 곳뿐** | `view.round.mode`(이미 뷰에 있다)를 읽게 바꿔 단일 출처로 |
| `docs/17` | 밸런스 지표 문서의 기준 모드 | 깨짐(기준 미기재) | **P1** | `docs/17_AUGMENT_BALANCE.md` — 「동풍전」 등장 **0회**, 「반장전」도 0회. 사기성/도파민/신박함 1~10이 어느 판 길이 기준인지 어디에도 없다 | 문서 머리에 «이 표의 사기성은 **반장전 8국** 기준» 같은 한 줄을 못 박고, 모드 편차가 큰 증강에 비고 열 추가 |
| `docs/20` | 파워 티어 문서의 기준 모드 | OK(반장전 기준) | — | `docs/20_AUGMENT_POWER_TIER.md:100` 「반장전은 드래프트 4회 × 3지선다 = **12장 제시**」 — 티어 확률 설계가 반장전 전제. 개별 항목은 `:137,167,171,214,228,240`처럼 「동풍전 3·반장전 5회」로 양쪽 병기 | 없음 |
| `docs/10` | 시스템 문서의 실측 근거 | OK(반장전 기준) | — | `docs/10_AUGMENT_SYSTEM.md:324~325`(스테이지 정의) · `:374~375`(「108종 카탈로그·**반장전** 500게임」 실측) | 없음 |

---

## P0

**없다.** 두 모드 사이에 «한쪽에서 증강이 아예 안 나온다» / «시점 트리거가 오작동한다» 급의
파탄은 시스템 층에서 발견되지 않았다. 브리프가 가장 우려한 항목(`eastFourth` 전용 또는
`southEntry`/`southThird` 전용으로 잠긴 증강)은 **전수 조사 결과 0건**이고,
유일한 중반 스테이지 제한인 `reload.ts:187`은 양 모드의 중반 스테이지를 전부 나열한다.

## P1

### 1. 티어 자동 조정이 두 모드의 성적을 한 통에 섞는다
`tierAdjust.ts`는 승률 0.65 + 픽률 0.35로 「티어별 상위 10% 반 단계 상향」을 하는데,
집계에도(`AugmentStatsStore.ts`) 계산에도 **모드 축이 전혀 없다.** 결과가 두 겹으로 나쁘다.
- 반장전에서만 폭주하는 증강은 동풍전 성적에 희석돼 **하향되지 않는다**(반대도 성립).
- `late_bloomer`(반장전 전용)와 `late_bloomer_east`(동풍전 전용)는 서로 다른 모집단에서
  얻은 승률로 **같은 백분위 줄에 세워진다** — 티어 내 상·하위 10% 판정이 사과와 오렌지 비교다.
그리고 나온 가중치 하나가 `AugmentRegistry.setWeightOverrides`로 **두 모드에 동시에** 걸린다.

### 2. 매치 예산은 1.5배인데 국 수는 2배다 (자원형 상대 약화)
`util.ts:120~145`가 근거를 직접 적어 둔다 — 매치 예산은 원래 **전부 동풍전 4국 기준**이었고,
2026-08-23에 반장전을 `ceil(N×1.5)`로 올렸다. 국 수는 4→8(+서입)로 **2배**이므로
자원형 증강은 반장전에서 여전히 국당 약 **75% 밀도**다. 사용자 주장(「동풍전 기준 밸런싱」)의
가장 직접적인 코드 근거가 이 주석이다.

### 3. 그 보정을 받는 증강이 21종뿐이다 (상시형 상대 강화)
`matchUses` 14파일 + `scaledUses` 7파일 = 21종. 나머지 **약 100종은 국 단위**라
반장전에서 발동 기회가 그대로 2배다. 즉 2번과 3번이 합쳐져
**«반장전에서는 상시·매국형이 자원형보다 구조적으로 세다»** 는 편향이 생긴다.
누적·성장형은 여기에 상한 부재까지 겹치면 폭주 후보다(개별 그룹 감사 결과와 대조 필요).

### 4. 고정 점수 임계값이 모드 불변이다
`hanchanConfigForMode`는 `mode/maxWind/westEntry/draftSchedules` **네 필드만** 바꾼다.
반환점 30000·시작 25000·우마 [5,15]·천하통일 45000이 4국짜리 판과 8국짜리 판에 똑같이 걸린다.
- 동풍전: 4국 안에 +5000을 못 만들어 **서입(남입)이 상시로 열린다** → 실질 국 수가 불안정.
- 반장전: 45000 즉시 우승(`shouldEnd:1950~1956`)이 8국 + 증강 4장이면 훨씬 자주 사정권.

### 5. 밸런스 문서 17이 기준 모드를 명시하지 않는다
`docs/17`에는 모드를 가리키는 단어가 한 번도 없다. 반면 `docs/20`(:100)과 `docs/10`(:374)은
명시적으로 **반장전 기준**이다. 그러면 17의 「사기성 5~8이 정상 구간」이 어느 판 길이의
사기성인지 확정할 수 없고, 위 2·3번의 모드 편향이 표에 반영될 자리도 없다.

---

## 총평

시스템 배관 자체는 튼튼하다 — 모드는 `hanchanConfigForMode` 한 곳에서만 갈라지고
서버·아레나·리플레이 재개가 전부 그 함수를 지나며, 서입·아가리야메·토비·본장 가드는
모드 하드코딩 없이 `maxWind`로만 돈다. 드래프트도 스테이지 수만 달라질 뿐 티어 확률·좌석 칸·
중복 배제 로직은 모드 불변이고, 칸 크기는 이미 4스테이지를 상정해 계산돼 있다.
브리프가 가장 걱정한 «한쪽 모드에서만 열리는 스테이지에 잠긴 증강» 은 **0건**이다.
문제는 배관이 아니라 **눈금**이다: 국 수는 2배인데 자원 예산은 1.5배, 그 보정을 받는 것은
124종 중 21종, 점수 임계값은 그대로, 그 위에 성적 통계까지 두 모드를 섞어 가중치를 움직인다.
사용자 주장 「대부분 동풍전 기준」은 `content/util.ts:122~133`이 스스로 기록하고 있으며,
남은 일은 개별 증강 수치가 아니라 **모드별 축을 통계·문서·문턱값에 도입하는 것**이다.
