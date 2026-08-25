# 반장전 밸런스 QA — GROUP `hand-b`

대상 11종 (packages/content/src/augments/). 전부 실제 파일 정독. 코드 수정 없음.

기준: `matchUses`/`scaledUses`(packages/content/src/util.ts:110-145)는 「게임당 N회」를
**반장전에서 1.5배(올림)** 로 늘린다. 반면 `roundScopedKey`(매 국 1회)·`trackRoundSeq`
(N국 쿨다운)류는 국 수에 정비례하므로 반장전에서 **2.0배**가 된다. 이 그룹의 판정은
대부분 이 1.5 vs 2.0 격차에서 갈린다.

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| honor_return | 귀환 | OK | — | honor_return.ts:46-48 (`matchUses`), :154-155, 정의 :199-210 (동1/반2 명시) | 없음 |
| suit_unify | 단색 세계 | OK | — | suit_unify.ts:60-62 (`matchUses`) + :70-71 국 스코프 `unifiedKey` + :85-92 첫 순 한정 | 없음 |
| three_dragons_will | 삼원의 의지 | OK | — | three_dragons_will.ts:49-51 (`matchUses`), :192-193 | 없음 |
| pond_snatch | 날치기 | OK | — | pond_snatch.ts:64 `TONPUU_USES=3`, :66 `scaledUses` → 반장 5회, :117 | 없음 |
| red_five_touch | 붉은 손길 | 강화 | P1 | red_five_touch.ts:58 `usedKey`(스케일 없음), :60 `rankKey` 게임 단위, 헤더 :22-30 «게임이 끝날 때까지 상시 각인», 정의 :172-181 | 스케일 금지(현행 유지)가 맞다. 대신 반장전 한정으로 각인 파워를 낮추거나(예: 지정 랭크 1개 유지 + 반장전은 발동 가능 시점을 남입 이후로 제한) 파워 티어 재평가 |
| silent_swap | 정적의 손 | 강화 | P1 | silent_swap.ts:68-69 `roundScopedKey`, :279 `WIN_BONUS_HAN` 화료 시 +2판, 정의 :159-171 | 매치 상한 추가(`scaledUses(state, 2)` 등) 또는 +2판을 매치당 N회로 제한 |
| table_flip | 밥상 뒤엎기 | 강화 | P2 | table_flip.ts:52-53 `roundScopedKey`, :88, :127 (`total:1`, "round") | 매치 상한 없음 — 필요 시 `scaledUses` 상한 병행 |
| tile_split | 분열 | 강화 | P2 | tile_split.ts:47-50 `roundScopedKey`, :176 | 없음(누적 없음, 국당 밀도 불변) |
| take_back | 무르기 | 강화 | P2 | take_back.ts:62 `COOLDOWN_TURNS=3`, :64-65 국 스코프 `lastUsedKey`(국 바뀌면 초기화) | 없음(순 단위 템포, 국당 밀도 불변) |
| picky_eater | 편식 | 강화 | P2 | picky_eater.ts:63 `COOLDOWN_ROUNDS=2`, :66-67 국 스코프 진행도, :216 `trackRoundSeq` | 없음(퀘스트 난도가 실질 상한) |
| regret | 미련 | 강화 | P2 | regret.ts:59 `COOLDOWN_ROUNDS=2`, :61 게임 단위 `keepKey`, :117 `trackRoundSeq`, conflicts :107 | 없음(유국+멘젠텐파이 조건이 실질 상한) |

확인 사항(전 11종 공통): `modes` 잠금 없음, `draftStages` 제한 없음, 특정 장/국·오라스·
서입·30000점 등 **시점/점수 하드코딩 전무**. 따라서 브리프 항목 2·3·4 관련 P0는 없다.
누적·성장형(스택 폭주)도 없다 — 전부 국 단위로 리셋되거나 매치 카운터로 캡된다.

## P1 항목

### red_five_touch (붉은 손길) — 「게임당 1회」인데 실제로는 패시브 구매
`usedKey`는 단순 불리언이고 `matchUses`를 쓰지 않는다(red_five_touch.ts:58). 이건 **의도적으로
옳다** — 1회를 2회로 늘리면 랭크 2개가 통째로 적도라가 되어 과하다. 문제는 반대쪽이다:
2026-07-31 버프로 「발동 시점 스냅샷」이 **게임 끝까지 상시 각인**으로 바뀌면서(헤더 :22-30,
ROUND_STARTED·쯔모마다 재각인), 이 카드의 값어치가 **발동 이후 남은 국 수에 정비례**하게
됐다. 동풍전에서 보통 3국분, 반장전에서 7국분 — 실버 티어가 반장전에서 2배 이상으로 뛴다.
스케일 유틸이 손댈 수 없는 형태의 강화라 눈에 안 띈다.

### silent_swap (정적의 손) — 매치 상한이 없는 +2판 반복기
국 스코프 1회(silent_swap.ts:68-69)이고 매치 카운터가 없다. 발동한 국에 화료하면 무조건
+2판(:279)이므로 **매 국 반복 가능한 타점 증폭기**다. 반장전에서 총 발동 가능 횟수가 4 → 8로
정확히 2배가 되는데, 같은 프리즘 티어의 매치 자원형(귀환·단색 세계·삼원의 의지)은 1→2(2배)가
아니라 `scaledUses` 규칙상 1.5배 궤도에 있다. 이 그룹 안에서 상대 파워가 가장 크게 벌어지는
카드다. 「리치 없는 국」 조건은 모드와 무관하므로 완화 요소가 아니다.

## 총평
- 이 11종에 **P0(로직·시점 오작동)는 없다.** 하드코딩된 국/장/점수 임계값이 전무하고,
  크로스국 주입(귀환·미련)도 게임 단위 키 + ROUND_STARTED 재적용이라 모드 길이에 안전하다.
- 매치 자원형 4종(귀환·단색 세계·삼원의 의지·날치기)은 이미 `matchUses`/`scaledUses`로
  모드 보정을 받고 있어 **사용자 주장(동풍전 기준 밸런싱)의 예외**다 — 이쪽은 OK.
- 실제 어긋남은 **국 스코프형이 2.0배로 늘어나는데 매치 자원형은 1.5배에 묶여 있는 격차**다.
  반장전에서 국 스코프 7종이 매치 자원형 4종보다 상대적으로 약 33% 유리해진다.
- 가장 눈에 띄는 두 장은 red_five_touch(1회 지정이 사실상 패시브라 남은 국 수에 정비례)와
  silent_swap(매치 상한 없는 +2판)이다. 나머지 국 스코프 5종은 국당 밀도가 불변이라 P2다.
