# "실제 빌드" 완주 검증 — build

## 요약

검증한 빌드 **17종**(각 3~4증강, 전부 `conflicts` 무충돌) / 실게임 완주 **170판**
(동풍전, 시드 1~8 · 일부 빌드는 101~108 8판 추가) / **확정 4건 · 의심 3건 · 음성 확인 12건**.

- 좌석 넷 모두 **실제 `BotAgent`**(원형 `balanced`)로 앉혔다. `harness.PersonaAgent`는
  버림을 무작위로 고르기 때문에 5국 내내 텐파이가 서지 않아(리치 0·화료 0) 빌드 검증에
  쓸 수 없었다 — 그래서 러너를 새로 만들었다(`build/run.ts`).
- **드래프트를 껐다**(`draftSchedules: []`). 그래야 p0가 든 것이 preset 3~4개뿐이고
  대조군(preset 전부 비움)과 같은 시드에서 1:1로 비교된다.
- 증강 발동은 소스를 고치지 않고 `install`의 `ctx`를 프록시해서 셌다
  (`build/instrument.ts`) — 규칙 세팅·리액션 emit·인터셉터 변경·옵션 제시·액션 발동.
  봇 쪽 계측은 기존 `qa-lab/bot/instrument.ts`를 겹쳐 썼다(기회/제안/발동/짐).
- **크래시 0 · 훅 예외 0 · 상태 불변식 위반 0 · 점수 드리프트 신호 0** (170판 전부).
  구조 쪽은 앞 라운드들이 이미 훑은 그대로 깨끗했다.
- ⚠ **측정 중 이 워크트리의 `packages/` 가 다른 세션에 의해 계속 고쳐졌다**(2026-08-23 01:20~01:40,
  21개 파일 — 오케스트레이터의 수정으로 보인다). 위 확정 1·2의 코드는 보고 시점(01:41)에도
  그대로였음을 다시 확인했다(`BotAgent.ts:771` · `ura_peek.ts:173-178`). 다만 8판 배치와
  재현 스크립트가 **완전히 같은 소스 위에서 돈 것은 아니므로**, 수치를 다시 쓸 일이 있으면
  같은 스크립트로 한 번에 다시 재는 것이 안전하다.

---

## 확정 1. 🔴 `no_retreat` × `stealth_riichi` — 보유 순서 하나로 한쪽이 **영구히** 굶는다 (같은 시드 5판에서 66,400점 차)

- 위치: `packages/server/src/BotAgent.ts:771` (`// 동점은 먼저 본 쪽(보유 순서)이 이긴다`) ·
  `packages/content/src/augments/no_retreat.ts:273` · `stealth_riichi.ts:238` ·
  `packages/content/src/augments/botPlan.ts:378` (`plan()`의 `weight` 계산)
- 설명이 약속한 것:
  - 물러설 수 없는 선언 — "(2국에 1회) 텐파이에서 버릴 패를 골라 리치를 건다. 공탁이 면제되고
    그 국의 리치·일발이 각각 2판, **뒷도라는 장당 2판**이 된다."
  - 스텔스 리치 — "(매 국 1회) 텐파이에서 보이지 않는 리치를 건다."
  두 카드 어디에도 "함께 들면 하나는 못 쓴다"는 말이 없다. 티어도 둘 다 prism이라
  드래프트에서 나란히 제시된다(`conflicts` 없음 — 확인함).
- 기대: 둘 다 액티브 리치 선언이라 **서로 기회를 나눠 갖되**, 강한 쪽(no_retreat)이
  중요한 국에 쓰이고 나머지 국은 stealth가 메운다.
- 실제: **no_retreat는 단 한 번도 발동하지 않는다.** 두 정책은 `plan({intent:"score", fleeting:true})`
  로 완전히 같고, `pick`이 요구하는 조건(`tenpai`)도 같고, `weight = BASE_WEIGHT.score × (0.55+0.45×fit)`
  의 `fit`도 같은 문맥에서 계산되므로 **입찰가가 항상 정확히 동점**이다. 동점은 `player.augments`
  배열 순서로 끊기고, 진 쪽은 그 순에 리치가 걸려 버려 **그 국의 기회 자체가 사라진다**
  (다음 순엔 이미 리치 중이라 제시되지 않는다).

  같은 시드 5판, 두 증강만 지급, preset 순서만 뒤집은 대조:

  | preset 순서 | stealth 제안→발동 | no_retreat 제안→발동 | p0 화료 | p0 화료점 합 | p0 판 합 | p0 최종 합 |
  |---|---|---|---|---|---|---|
  | `[stealth_riichi, no_retreat]` | 11 → **11** | 11 → **0** | 9 | 64,800 | 32 | 158,100 |
  | `[no_retreat, stealth_riichi]` | 14 → 3 | 11 → **11** | 10 | 103,000 | 50 | **224,500** |

  8판 빌드 전체(4증강)에서도 같다 — `no_retreat` 기회 15 · 제안 15 · **발동 0**,
  짐: `stealth_riichi ×15` (100%).
- 재현: `tsx qa-lab/synergy3/build/repro_riichi_order.ts`
- 영향: 실전에서 보유 순서 = **드래프트 픽 순서**다. 리치 계열을 모으는 사람이 스텔스를
  먼저 집으면, 뒤에 집은 물러설 수 없는 선언은 게임이 끝날 때까지 **버튼이 눌리지 않는다**
  (사람이 직접 누르면 쓸 수 있으므로 봇 좌석·사람의 자동 진행에서 특히 아프다).
  두 카드가 함께 뜨는 빈도는 낮지 않다(둘 다 riichi 계열 prism, 상호 배제 없음).
  손해 폭은 위 표대로 판당 1만 점대다.
- 제안 수정: ① 같은 `intent`·같은 순에 겹치는 "리치를 대신 거는" 액티브끼리는 강도에
  타이브레이커를 둔다(예: 그 국의 실효 판수 기대값이 큰 쪽 — no_retreat는 뒷도라 장당 2판).
  ② 또는 `plan()`이 동점일 때 **보유 순서 대신 결정론 난수**로 끊게 해 최소한 반씩 나눠 갖게 한다.
  ③ 가장 싼 수정은 두 증강 중 하나의 `weight`에 상수 차등을 두는 것.

---

## 확정 2. 🟠 `ura_peek`의 **바꿔치기(`ura_swap`)를 봇 정책이 절대 고르지 않는다** — 16판 33회 발동 전부 '열람'만

- 위치: `packages/content/src/augments/ura_peek.ts:173-178`
  ```ts
  bot: plan({
    intent: "inform",
    oneShot: true,
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,  // ACTION_SWAP는 후보에 없다
  }),
  ```
- 설명이 약속한 것: "(매 국 1회 **+ 바꿔치기 1회**) … 확인한 국에는 1회, 첫 번째 뒷도라
  표시패를 왕패의 다른 패와 바꿔치기할 수 있다."
- 기대: 열람으로 뒷도라가 꽝인 것을 확인했으면, 그 국에 바꿔치기로 내 패를 뒷도라로 만든다
  — 특히 리치 빌드에서는 `no_retreat`가 뒷도라를 **장당 2판**으로 만들므로 이게 이 카드의 본체다.
- 실제: 리치 빌드 8판(18회) + 추가 8판(시드 101~108, 15회) 합쳐 `ura_peek_reveal` **33회**,
  `ura_swap` **0회**. 액션 자체는 정상 등록·정상 제시된다(빌드 로그의
  `augActions: ura_peek → [ura_peek_reveal, ura_swap]`). 정책이 `ACTION`만 찾기 때문이다.
- 재현: `tsx qa-lab/synergy3/build/main.ts riichi 8` → `out/riichi.json`의
  `actionsBySeat.p0` 에 `ura_swap` 키가 없음 / `tsx qa-lab/synergy3/build/report.ts`
- 영향: 봇이 든 이면투시는 **반쪽만 작동한다**. 값을 만드는 쪽(바꿔치기)이 통째로 죽어,
  아레나·티어표가 이 카드를 실제보다 약하게 측정한다. (유닛 레벨에서 바꿔치기 자체가
  정상 동작한다는 것은 riichi 담당이 확인해 뒀다 — `qa-lab/synergy3/riichi/repro_ura_peek_swap.ts`.
  여기서 새로 확인한 것은 **실게임에서 한 번도 그 경로에 도달하지 않는다**는 것이다.)
- 제안 수정: `pick`에서 `ACTION`이 이미 쓰였고(`usedKey`) `ura_swap` 후보가 제시돼 있으면
  뒷도라 표시패 대비 내 손패를 보고 바꿔치기를 고르게 한다.

---

## 확정 3. 🟠 `always_tenpai` × `hourglass`/`regret` — 정산은 12/12 국에서 p0를 텐파이로 세는데, 모래시계는 2번만 열린다

- 위치: `packages/content/src/augments/always_tenpai.ts:46` (`ctx.setHolderRule("draw.treatAsTenpai", true)`) ·
  `hourglass.ts:142-148` (`isTenpai(winHandKindsOf(...))`) · `regret.ts:132` (`menzenTenpai(...)`)
- 설명이 약속한 것:
  - 승승장구 — "황패유국 시 **손패가 어떻든 항상 텐파이로 취급된다**".
  - 뒤집힌 모래시계 — "황패유국이 선언되는 순간 **내가 텐파이라면** 국이 끝나지 않고 …".
  - 미련 — "황패유국 시 **내가 멘젠 텐파이면** 그 손패 13장이 그대로 다음 국 배패가 된다".
- 기대: 셋을 함께 들면 "항상 텐파이"가 뒤 둘의 조건까지 열어 유국마다 연장·손패 계승이 걸린다.
  (설명만 읽으면 이 조합이 이 빌드의 요점이다.)
- 실제: 두 조건이 **서로 다른 텐파이**를 본다. 승승장구는 정산 규칙(`draw.treatAsTenpai`)만
  바꾸고, 모래시계·미련은 손패를 직접 `isTenpai`로 다시 잰다.

  | 구성 | 유국 | 정산이 p0를 텐파이로 센 국 | 모래시계 발동 |
  |---|---|---|---|
  | `always_tenpai + nagashi_yakuman + hourglass + regret` | 12 | **12** | **2** |
  | `hourglass + regret` 만 | 15 | 4 | 4 |

  즉 승승장구 없이는 "진짜 텐파이 4국 → 모래시계 4회"로 100% 붙는데, 승승장구를 얹으면
  게임 자신이 12국 전부를 텐파이로 정산하면서도 모래시계는 그중 2국에서만 열린다.
  `regret`은 두 구성 모두 **0회**였다(멘젠 조건이 더 좁다).
- 재현: `tsx qa-lab/synergy3/build/repro_drawbuild.ts`
- 영향: 유국 빌드는 실제로 존재하는 빌드다(승승장구·유국역만·모래시계·미련이 모두 유국 축).
  플레이어는 "항상 텐파이 취급"을 읽고 셋을 모으는데, 화면에서는 노텐 벌점 면제와 +2,000점만
  들어오고 연장은 안 온다 — **왜 안 왔는지 화면 어디에도 근거가 없다.**
- 제안 수정: 문구를 좁히거나(승승장구: "노텐 벌점 정산에서만 텐파이로 취급된다"),
  모래시계·미련이 `draw.treatAsTenpai`를 함께 보게 한다. 둘 중 어느 쪽이든 좋으나
  지금은 두 카드가 같은 단어를 다른 뜻으로 쓰고 있다.

---

## 확정 4. 🟠 `broken_border` 한 장이 **봇의 판 진행 속도를 3.4배** 떨어뜨린다 (3.7s → 12.7s / 판)

- 위치: `packages/content/src/augments/broken_border.ts`(`opts.mixedRuns`) →
  `packages/server/src/bot/read.ts:237-252` (`shantenOf`·`winningKinds`를 **매 결정마다**
  `view.scoringOptions`로 부른다) → `packages/core/src/mahjong/scoring/` 분해기
- 기대: 슌쯔의 무늬 제한이 사라져 화료율이 오른다 (오른다 — shape 빌드 43% · open 빌드 44%,
  대조군 22%). 성능은 언급된 적 없다.
- 실제: 같은 시드 3판씩, p0 좌석에만 증강을 얹고 잰 판당 평균 시간:

  | p0가 든 것 | 판당 | p0 pass 응답 |
  |---|---|---|
  | (없음) | 3.7s | 53 |
  | `omni_chi` | 3.4s | 107 |
  | `mixed_triplet` | 4.3s | 92 |
  | **`broken_border`** | **12.7s** | 91 |
  | `mixed_triplet + broken_border` | **15.1s** | 116 |
  | `omni_chi + mixed_triplet + broken_border` (open 빌드의 세 장) | 13.7s | 193 |

  8판 배치에서도 그대로다 — open 빌드 52.1s/판 · shape 빌드 47.0s/판 vs 나머지 7~16s.
  **원인은 봇의 손 계산이다**: 같은 장면을 `PersonaAgent`(샹텐 계산을 전혀 하지 않는
  무작위 에이전트)로 돌리면 2.0s → 2.5s(+25%)에 그친다. 즉 엔진 쪽 비용은 작고,
  `broken_border`가 켠 무늬 교차 분해가 **봇의 매 결정 평가**를 3배 이상 비싸게 만든다.
  `omni_chi`는 프롬프트 수를 2배로 늘리지만(pass 53→107) 시간은 늘리지 않는다 —
  느린 것은 후로 후보 수가 아니라 분해다.
- 재현: `tsx qa-lab/synergy3/build/repro_slow.ts` (봇) ·
  `tsx qa-lab/synergy3/build/repro_slow2.ts` (PersonaAgent 대조)
- 영향: 실대국에서 한 사람이 이 카드를 들면 **같은 탁의 봇 셋이 전부 느려진다**
  (봇의 `read`는 자기 손을 자기 `scoringOptions`로 재므로 보유자 좌석만 비싸질 것 같지만,
  측정값은 판 전체가 느려짐을 보인다 — 보유자 좌석의 결정이 판의 직렬 경로에 있다).
  체감은 봇의 착수 지연이고, `agentDecideTimeoutMs`가 짧은 환경에서는 타임아웃 위험이다.
- 제안 수정: `bot/read.ts`가 매 결정마다 전 분해를 다시 도는 대신 결과를 손패 해시로
  캐시하거나, `mixedRuns`가 켜진 손에 한해 후보 생성을 가지치기한다.

---

## 의심 1. 리치 최대화 빌드가 대조군과 **통계적으로 구별되지 않는다** (16판)

`stealth_riichi + late_double + ura_peek + no_retreat`, 시드 1~8 + 101~108:

| | 국 | p0 화료 | 화료율 | 평균 화료점 | 평균 판 | p0 방총 | p0 최종 평균 |
|---|---|---|---|---|---|---|---|
| 대조군 | 87 | 19 | 22% | 6,526 | 3.5 | 12 | 25,956 |
| 리치 빌드 | 82 | 15 | 18% | 6,560 | 3.5 | 13 | 26,156 |

prism 3장 + silver 1장을 몰아준 좌석이 **증강 0장 좌석과 같은 성적**이다. 원인은 위 확정
1·2(빌드의 두 기둥이 죽음)로 상당 부분 설명되지만, 나머지(스텔스의 공탁 면제·late_double의
+1판이 어디로 갔는가)는 16판 표본으로 확정할 수 없어 의심으로 둔다. 확정 1·2를 고친 뒤
같은 스크립트로 다시 재면 그대로 답이 나온다.

## 의심 2. 국사 빌드의 4장은 **서로를 돕지 않는다** — 83국에서 국사 0회 · 역만 0회 · `giant_god` 발동 0

`royal_kokushi + giant_god + polar_ends + broken_wall`. 셋은 규칙만 설치하고(설치 확인됨:
`setHolderRule` 각 8회 = 판마다 1회) 화료 기록에는 흔적이 없다. `giant_god`은 조건
("국사 13종을 내가 직접 전부 버려 둬야 한다")이 실전에서 성립하지 않는다 — 8판 내내
`optionOffer` 0. 성적은 대조군보다 낮다(화료율 17% vs 22%).
`royal_kokushi`(요구패 13종)와 `polar_ends`/`broken_wall`(수패 몸통)이 **같은 손에서 동시에
쓰일 수 없다**는 것이 구조적 원인으로 보이나, 규칙 증강은 "발동"이 없어 계측으로는
"쓸모없었다"까지만 말할 수 있다. 유닛 재현이 필요하다(다른 담당의 영역).

## 의심 3. 론 특화 빌드는 **중반부터 살아 있는 증강이 0장**이 된다

`avenger + blind_ron + off_by_one + frame_up`, 16판 성적은 전 빌드 중 최하(화료점 5,572 ·
최종 22,644 · 대조군 25,956).

| 증강 | 16판에서 실제로 한 일 |
|---|---|
| `blind_ron` | preset 지급이라 **1국만** 살아 있다(`armOnNextRound` — 설계대로). 그 1국에 p0가 −7,700을 물었다 |
| `avenger` | 방총당해야 켜진다 — 8판에서 3회 무장, 그 뒤 원수를 잡은 기록 없음 |
| `off_by_one` | 리치 12회 · 2,227회 리액션 호출 중 실제 밀어넣기 **1회** |
| `frame_up` | `BOT_UNUSABLE_AUGMENTS` 등재 — 483회 제시되고 봇 제안 **0** (이미 알려진 것) |

`off_by_one`의 1회는 기대보다 훨씬 낮아 보이지만(리치 12회 × 리치 후 쯔모 ≈ 70장,
±1 이웃이 잡힐 확률을 생각하면 한 자릿수 후반은 나와야 한다), 소스(`off_by_one.ts:70-104`)의
게이트가 전부 정당해 보여 표본 문제와 구분하지 못했다. 리치를 강제한 유닛 장면이 필요하다.

---

## 빌드별 통계표 (동풍전 8판 · 시드 1~8 · p0만 증강, 나머지 셋은 증강 0)

`win%`는 국당 p0 화료율, `avgPts`는 화료 1회 평균 획득점(본장·공탁·뱅크 가산 제외),
`augPts`는 `RoundSettled.augPoints`로 남은 p0 몫의 합, `ms`는 판당 평균 시간.

| 빌드 | 국 | p0화료 | win% | avgPts | avgHan | maxPts | 방총 | 유국 | p0리치 | 최종평균 | augPts | 위반 | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **대조군** | 50 | 11 | 22% | 7,555 | 3.8 | 24,000 | 8 | 13 | 9 | 26,575 | 0 | 0 | 14.9s |
| riichi | 43 | 8 | 19% | 6,875 | 3.5 | 11,700 | 10 | 9 | 15 | 25,075 | 0 | 0 | 14.5s |
| kandora | 48 | 6 | 13% | 14,000 | 6.5 | 18,000 | 5 | 14 | 11 | 30,913 | 0 | 0 | 15.0s |
| kokushi | 44 | 6 | 14% | 5,183 | 3.0 | 12,000 | 7 | 11 | 7 | 23,650 | 0 | 0 | 14.1s |
| open | 43 | 19 | **44%** | 7,047 | 3.4 | 24,000 | 7 | 6 | 7 | 43,338 | 34,900 | 0 | **52.1s** |
| bank | 45 | 11 | 24% | 6,800 | 3.5 | 12,000 | 8 | 9 | 12 | 42,238 | 27,600 | 0 | 14.0s |
| defense | 53 | 9 | 17% | 7,922 | 3.7 | 24,000 | **3** | 15 | 11 | 38,550 | 48,000 | 0 | 16.2s |
| steal | 49 | 8 | 16% | 7,025 | 3.1 | 18,000 | 6 | 13 | 9 | 34,300 | 76,200 | 0 | 15.1s |
| info | 46 | 12 | 26% | 7,250 | 3.6 | 24,000 | 6 | 12 | 12 | 35,263 | 50,600 | 0 | 14.0s |
| hand | 38 | 20 | **53%** | 13,655 | 5.2 | **36,000** | 2 | 3 | 29 | **54,750** | 0 | 0 | 8.9s |
| draw | 50 | 11 | 22% | 8,164 | 3.9 | 24,000 | 3 | 12 | 17 | 40,863 | 46,000 | 0 | 14.2s |
| dealer | 49 | 11 | 22% | 8,918 | 3.5 | 18,000 | 8 | 12 | 12 | 33,550 | 33,100 | 0 | 14.0s |
| wall | 51 | 14 | 27% | 6,679 | 3.5 | 16,000 | 2 | 13 | 16 | 35,738 | 14,300 | 0 | 13.2s |
| disrupt | 45 | 9 | 20% | 4,011 | 2.3 | 11,700 | 8 | 12 | 14 | 23,950 | 0 | 0 | 11.4s |
| ron | 45 | 8 | 18% | 4,038 | 2.5 | 7,700 | 3 | 9 | 12 | 19,875 | −7,700 | 0 | 11.1s |
| shape | 47 | 20 | **43%** | 4,860 | 2.9 | 12,000 | 4 | 6 | 8 | 34,125 | 0 | 0 | **47.0s** |
| multi | 56 | 11 | 20% | 9,200 | 3.6 | 24,000 | 10 | 21 | 16 | 29,038 | 16,600 | 0 | 9.2s |
| late | 47 | 15 | 32% | 7,227 | 3.7 | 24,000 | 5 | 19 | 16 | 37,938 | 22,700 | 0 | 7.4s |

빌드 구성:

| 키 | 증강 |
|---|---|
| riichi | `stealth_riichi + late_double + ura_peek + no_retreat` |
| kandora | `ankan_dora + snake_kan + mirror_dora + red_five_touch` |
| kokushi | `royal_kokushi + giant_god + polar_ends + broken_wall` |
| open | `omni_chi + mixed_triplet + broken_border + big_hand` |
| bank | `jackpot + big_hand + devils_advance + honba_hunter` |
| defense | `invincible + always_tenpai + danger_sense + tenpai_scan` |
| steal | `spy + parasite + karma + blame_shift` |
| info | `xray_hand + foresight + triple_peek + peek_riichi_waits` |
| hand | `alchemist + tile_split + suit_unify + conjure_draw` |
| draw | `always_tenpai + nagashi_yakuman + hourglass + regret` |
| dealer | `eternal_dealer + pseudo_dealer + honba_hunter + big_hand` |
| wall | `dead_wall_master + bottom_deal + haitei_lord + cliff_bloom` |
| disrupt | `riichi_seal + call_seal + disarm + time_stop` |
| ron | `avenger + blind_ron + off_by_one + frame_up` |
| shape | `async_chiitoi + mixed_triplet + broken_border + polar_ends` |
| multi | `aotenjou_ceiling + eternal_dealer + mirror_dora + ankan_dora` |
| late | `late_bloomer_east + rank_gate + last_stand + cliff_bloom` |

증강별 발동 원표(빌드마다 `rule / react호출·emit / inter호출·변경 / 옵션제시 / 액션발동 /
봇 기회·제안·발동`)는 `qa-lab/synergy3/build/out/report.txt`에 그대로 있다.

### 빌드 안에서 **한 번도 일하지 않은** 증강

| 빌드 | 증강 | 왜 (판정) |
|---|---|---|
| riichi | `no_retreat` | **다른 증강이 조건을 파괴** — 입찰 동점에서 `stealth_riichi`에 15/15 짐 (확정 1) |
| kokushi | `giant_god` | **조건 미충족** — "국사 13종을 내가 전부 버려 둬야" 가 8판 내내 성립 안 함(옵션 제시 0) |
| kokushi | `royal_kokushi`·`polar_ends`·`broken_wall` | 규칙은 설치됐으나(각 8회) 83국에서 국사·역만 0 — 효과 관측 0 |
| ron | `frame_up` | **봇이 못 누른다** — `BOT_UNUSABLE_AUGMENTS` 등재(이미 알려진 것). 483회 제시 / 제안 0 |
| ron | `avenger` | 조건 미충족(먼저 방총당해야 켜짐) — 3회 무장, 회수 0 |
| draw | `regret` | 조건 미충족 — 멘젠 텐파이 유국이 두 구성 모두 0회 (확정 3 참고) |
| draw | `nagashi_yakuman` | 조건 미충족 — 50국에서 요구패·자패만 버린 국 0 (인터셉터 변경 0) |
| bank·dealer | `honba_hunter` | 규칙은 작동(본장 단가 1,500 확인 — 아래 음성 확인) 하지만 동풍전은 본장이 거의 안 쌓여 augPts 0 |
| disrupt | `disarm` | **내 실험 설정 탓** — 상대 셋이 증강 0장이라 지목할 것이 없다. 빌드의 결함이 아니다 |
| kandora | `snake_kan` | **판정 보류** — 표준 `ankan` 액션을 그대로 쓰므로 계측기가 발동을 귀속시키지 못한다. 제안 3회 중 2회는 `ankan`이 선택됐다(= 실제로 눌렸을 가능성이 높다) |

---

## 봇(BotAgent)이 이 빌드들을 다루는가

- **동점 입찰의 보유 순서 타이브레이커가 유일한 치명상이다** (확정 1). 다른 빌드의
  "짐" 기록을 전부 훑었지만 **100% 굶는 사례는 no_retreat 하나뿐**이었다 — 나머지는
  반복 발동형이라 다음 순에 다시 이긴다:
  `bank`: big_hand 48제안→24발동(짐 jackpot_roll×24, 그래도 쿨다운 상한만큼 다 씀) ·
  `defense`: tenpai_scan 77→41 · `hand`: conjure_draw 74→28 · `info`: triple_peek 52→25 ·
  `wall`: bottom_deal 195→158.
- **정책이 자기 액션의 절반만 안다** — `ura_peek`의 바꿔치기(확정 2). 같은 모양의
  다중 액션 증강(`peek_riichi_waits`의 위조, `dead_wall_master`의 교환)도 같은 눈으로
  봤는데, `peek_waits` 28/28 · `dw_swap` 50/50으로 정상이었다.
- **자기 손해로 태우는 경우는 못 찾았다.** `pseudo_dealer`는 이미 오야면 옵션 자체가
  안 뜨고(`pseudo_dealer.ts:136-138`), `jackpot`은 0.5배 위험이 있어도 기댓값이 1.625라
  매 국 굴리는 것이 맞으며, 뱅크 빌드에서는 `big_hand`의 하한이 0.5배 손실을 그대로
  덮는다(아래 음성 확인 참조).
- **깡 빌드는 봇이 깡을 거의 안 해서 자연히 약해진다** — 8판 48국에서 p0 안깡 2회.
  `ankan_dora`(안깡 1묶음 +4판)는 그 2회에만 산다. 그런데도 kandora 빌드의 평균 화료점이
  14,000(대조군 7,555)인 것은 **`red_five_touch`와 `mirror_dora` 덕**이다(아래).

---

## 음성 확인 (돌려 봤고 깨끗했다)

| 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|
| `jackpot`(×0.5) × `big_hand`(최소 만관) | 배수가 먼저, 하한이 나중이어야 약속이 지켜진다 | 시드2: 기본 8,000 → jackpot −5,500 → big_hand +1,500 → **p0 델타 8,000**(공탁 1,000 포함, `detail`이 명시한 대로) | ✅ `settleStages` 의도대로(Multiply 200 → BankFloor 350 → Reassert) |
| `honba_hunter` × 본장 | 본장 1개당 1,500 | 본장가산 1,500·3,000 관측(표준 300·600 아님) | ✅ |
| `riichi_seal` × 상대 리치 | 내가 선제 리치를 건 국엔 상대 리치 0 | 봉인 성립 11국 중 **뚫린 국 0** (대조군은 같은 상황 8국 중 3국에서 상대 후속 리치) | ✅ |
| `eternal_dealer` × `pseudo_dealer` | 오야 배율이 두 번 곱해지면 안 된다 | `win.treatAsDealer`가 불리언 규칙이라 중복 없음 (`eternal_dealer.ts:100`) | ✅ 이중 계산 없음 |
| `mirror_dora` 단독 / multi / kandora | 도라가 상시로 늘어야 한다 | `augDoraHan` 평균 0.38 / 0.36 / 0.17 — 삼켜지지 않으나 **화료의 23%에서만** 판이 붙는다 | ✅ 작동(수확은 낮다) |
| `red_five_touch` × `mirror_dora` | 적도라와 개인도라가 각각 붙는다 | kandora 빌드 화료의 평균 적도라 **2.57판** · 도라 1.71판 · 14화료 중 13화료가 만관 이상(수치역만 2회) | ✅ 이중 계산 아님(각자 몫) |
| `aotenjou_ceiling` × `eternal_dealer` | 상한 해제 + 오야 배율 | augPoints `aotenjou_ceiling:16,600` 정상 기록, 드리프트 미귀속 0건 | ✅ |
| `parasite` × `spy` | 같은 화료를 두 번 나눠 갖는 순서 문제가 날 수 있다 | 49국에서 `spy` 적중 0회라 겹치는 장면 자체가 없었다(`parasite`만 76,200 회수) | ⚪ 미검증(표본) |
| `always_tenpai` 정산 | 노텐 벌점 면제 + 노텐 1인당 2,000 | 12~15유국에서 augPoints 46,000~48,000 (유국당 평균 3,833) | ✅ |
| `invincible` × 방총 | 선언한 국엔 내 버림으로 론당하지 않는다 | defense 빌드 p0 방총 **3**(대조군 8) · invincible 26회 발동 | ✅ |
| `hand` 빌드(연금술사·분열·단색·소환) | 손패를 직접 고치면 화료율이 오른다 | 화료율 **53%**(대조군 22%) · 청일색 4회 · 손패 장수 위반 0 | ✅ 가장 설명대로 작동한 빌드 |
| 구조 불변식 전반 | 패 중복·왕패·손패 장수·점수 NaN·드리프트 | 170판 전부 **위반 0 · 훅 예외 0 · 크래시 0** | ✅ |

---

## 스크립트

| 경로 | 내용 |
|---|---|
| `qa-lab/synergy3/build/run.ts` | 빌드 러너 — 봇 4인·드래프트 OFF·계측 포함 |
| `qa-lab/synergy3/build/instrument.ts` | `install` ctx 프록시 계측기 (packages 무수정) |
| `qa-lab/synergy3/build/builds.ts` | 빌드 17종 정의 + **미리 적어 둔 예측** |
| `qa-lab/synergy3/build/check.ts` | 빌드가 `conflicts`·모드 제한에 걸리지 않는지 사전 확인 |
| `qa-lab/synergy3/build/main.ts` | `main.ts <빌드키|control> [시드수] [시드오프셋]` → `out/<키>.json` |
| `qa-lab/synergy3/build/report.ts` | `out/*.json` → 빌드별 통계표 (`out/report.txt`) |
| `qa-lab/synergy3/build/repro_riichi_order.ts` | **확정 1** 재현 (보유 순서만 뒤집는 대조) |
| `qa-lab/synergy3/build/repro_drawbuild.ts` | **확정 3** 재현 (승승장구 유무로 모래시계 발동 대조) |
| `qa-lab/synergy3/build/repro_seal.ts` | 음성 확인 — 리치 봉인이 실제로 막는가 |
| `qa-lab/synergy3/build/repro_bank.ts` | 음성 확인 — jackpot × big_hand 정산 순서 |
| `qa-lab/synergy3/build/repro_mirror.ts` | 음성 확인 — 거울의 `augDoraHan` 실측 |
| `qa-lab/synergy3/build/repro_slow.ts` · `repro_slow2.ts` | **확정 4** 재현 (증강별 판당 시간 · 봇/무봇 대조) |
