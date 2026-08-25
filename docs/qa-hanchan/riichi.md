# 반장전 밸런스 QA — GROUP `riichi`

대상 12종. 12개 파일 전부 정독. **매치 스코프 자원(게임당 N회)을 쓰는 것은 이 그룹에 하나도 없다** —
전부 국 스코프(`roundScopedKey`) 또는 국 기준 쿨다운(`trackRoundSeq`/`cooldownReady`)이다.
`modes` 잠금·`draftStages` 제한을 쓰는 것도 **하나도 없다**(전부 4회 드래프트 어느 단계에서나 뽑힌다).
장(prevalentWind)·오라스·서입·30000점 같은 **모드 의존 시점/임계값을 읽는 코드는 이 그룹에 없다**.

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| all_or_nothing | 모 아니면 도 | 강화 | P1 | all_or_nothing.ts:47-58(USES_PER_ROUND=1, 국 스코프), :74-76(판돈=현 점수 절반) | 판돈 상한(예: 8,000) 또는 매치 스코프 N회로 전환 |
| open_riichi_reveal | 오픈 리치 | 강화 | P1 | open_riichi_reveal.ts:63-65(declaredKey 국 스코프), :199-230(직격 역만 STRIKE_YAKU) | 역만 직격을 매치 1회로 제한하거나 반장전용 완화(배만) 분리 |
| soul_strike | 영혼의 일격 | OK | — | soul_strike.ts:95(COOLDOWN_ROUNDS=2), :129, :238 | 없음 |
| palm_flip | 손바닥 뒤집기 | OK | — | palm_flip.ts:87(COOLDOWN_ROUNDS=2), :199 | 없음 |
| no_retreat | 물러설 수 없는 선언 | OK | — | no_retreat.ts:63(COOLDOWN_ROUNDS=2), :85 | 없음 |
| free_riichi_discard | 자유 선언 | 강화 | P2 | free_riichi_discard.ts:46-48(국 스코프 스냅샷), :133-140(상시) | 없음(그룹 공통 밀도 이슈) |
| riichi_upgrade | 이중 선언 | 강화 | P2 | riichi_upgrade.ts:58-60(sealKey 국 스코프), :62-89(상시 더블 승격+하가 봉인) | 없음 |
| late_double | 뒤늦은 출진 | 강화 | P2 | late_double.ts:43(DOUBLE_UNTIL_TURN=7), :46-48(discardCount, 국 내부 '순') | 없음 |
| off_by_one | 한 끗 차이 | 강화 | P2 | off_by_one.ts:52-60(상시, 횟수 제한 없음) | 없음 |
| siege_riichi | 공성계 | 강화 | P2 | siege_riichi.ts:50-52(setHolderRule riichi.requiresTenpai=false, 상시) | 없음 |
| riichi_seal | 리치 봉인 | 강화 | P2 | riichi_seal.ts:57-59(sealKey 국 스코프), :86-92 | 없음 |
| stealth_riichi | 스텔스 리치 | 강화 | P2 | stealth_riichi.ts:54-57(activeKey 국 스코프), :232-236 | 없음 |

## P1

### all_or_nothing — 국 1회 + 「현 점수의 절반」이라 반장전에서 복리로 터진다
판돈이 고정값이 아니라 **현재 점수의 절반**(`all_or_nothing.ts:74-76`)이고, 이기면 같은 금액을
뱅크에서 추가로 받는다(`:186-200` BankTopUp). 즉 성공 1회당 점수 ×1.5, 실패는 판돈의 **절반**만
잃어 ×0.75 — 기대값이 대칭이 아니고 **곱셈으로 누적**된다. 사용 기회가 국 수에 정비례하므로
동풍전 최대 4회 vs 반장전 최대 8회(본장 재배패마다 키가 새로 나므로 실제로는 더 많다,
`util.ts:78-81` roundKey에 honba 포함)에서 상한 없는 지수 성장이 된다. 브리프 1번의 "누적/성장형이
반장전에서 상한 없이 폭주하는가"에 정확히 해당한다.

### open_riichi_reveal — 「매 국 1회」의 상품이 역만이라, 반장전에서 역만 시행 횟수가 2배
직격 역만(`open_riichi_reveal.ts:199-230`, closedHan 13 / isYakuman)이 국 스코프 게이트 하나로만
묶여 있다(`:63-65`). 다른 「매 국 1회」 카드는 국당 기대값이 작아 국 수가 2배여도 선형 증가로
끝나지만, 이쪽은 **한 번 터지면 판이 끝나는** 결과라 시행 횟수 2배가 곧 "반장전에서 역만이 한 번은
난다"에 가까워진다. 봇/사람 모두 오픈 리치를 매 국 반복해 태울 수 있고 비용은 리치 공탁뿐이다.

## 총평
- 이 그룹은 **시점 하드코딩·모드 의존 임계값이 하나도 없다** — `late_double`의 "7순"도 국 내부
  `discardCount` 기준이라 두 모드에서 의미가 완전히 같다. 「오라스/서입」류 오작동(깨짐) 없음.
- 쿨다운형 3종(soul_strike·palm_flip·no_retreat, 전부 2국에 1회)은 **국당 밀도가 모드와 무관**해
  이 감사에서 가장 모범적인 형태다. 다른 그룹의 「게임당 N회」를 이 꼴로 옮기는 선례로 쓸 만하다.
- 나머지 9종은 상시형/매국 1회라 반장전에서 **발동 절대 횟수가 그대로 2배**다. 대부분은 국당
  기대값이 선형이라 P2지만, 곱셈 성장(all_or_nothing)과 역만 시행(open_riichi_reveal) 둘만은
  선형을 벗어난다.
- 사용자 주장("증강 대부분이 동풍전 기준")은 이 그룹에는 **부분적으로만** 맞다 — 동풍전 기준의
  매치 자원이 아니라, 애초에 국 기준으로만 짜여 모드 길이를 전혀 고려하지 않은 쪽이다.
- 코드 수정 없음(읽기 전용 감사).
