# 실전 빌드 완주 — synergy4 / build

## 요약

**24개 빌드**(각 3장, 축을 가로지르는 조합 · `conflicts` 전부 무충돌)를 조건 8개
(3장 · 2장 3가지 · 1장 3가지 · 미보유)로 갈라 **같은 시드**로 반장전을 완주시켰다.
시드 1~30 × 24빌드 × 8조건 = **5,768판 / 60,389국** (봇 좌석 4개, 원형 balanced).

- 구조: **크래시 0 · 훅 예외 0 · content 정책 예외 0 · 상태 불변식 위반 0 · 소프트락 0** (5,768판 전부).
  점수 드리프트는 러너가 판정하지 않으므로 같은 24빌드를 `harness.runMatch`로 96판 더 돌려
  보강했다 — **설명되지 않는 드리프트 0**(아래 «한계» 참고).
- 사다리(같은 시드 짝지음, n=720): 3장−평균2장 **+3,339점(t=5.14)**, 평균2장−평균1장
  **+3,325점(t=6.55)**, 3장−미보유 **+8,602점(t=9.29)**. 평균적으로는 **장수가 늘수록 세진다.**
- 그 평균 아래에 **세 종류의 구멍**이 있었다:
  1. 들면 **오히려 크게 나빠지는** 카드 1장 (확정 1 — 누명, −17,483점 / t=−10.6)
  2. 수백 번 발동하면서 **판을 한 톨도 바꾸지 않는** 카드들 (확정 2·3)
  3. 조건이 좁아 실전에서 거의 켜지지 않는 카드들 (의심 1~4)

측정·재현 코드는 전부 `qa-lab/synergy4/build/` 안에 있다. 소스는 한 줄도 고치지 않았다.

### 실행 방법

```
tsx qa-lab/synergy4/build/check.ts                 # 빌드 24개 conflicts 검증
bash qa-lab/synergy4/build/all.sh 1 30             # 본 스위프 (out/*.jsonl)
tsx qa-lab/synergy4/build/analyze.ts [빌드키]      # 조건별 표
tsx qa-lab/synergy4/build/effect.ts                # 카드 한 장의 한계 기여(4쌍 짝지음)
tsx qa-lab/synergy4/build/ladder.ts                # 3장 vs 2장 vs 1장 사다리
tsx qa-lab/synergy4/build/interact.ts              # 혼자일 때 기여 vs 둘과 함께일 때 기여
tsx qa-lab/synergy4/build/inert.ts                 # «완전 동일 판» 집계
```

---

## 확정 1. 🔴 누명(`frame_up`)의 봇 정책이 **자기 액션이 아닌 표준 선택지를 돌려준다** — 들기만 해도 −17,483점

- 위치: `packages/content/src/augments/frame_up.ts:264`
  ```ts
  return preferred ?? sameTile[0] ?? options[0] ?? null;
  ```
  `sameTile`은 `pickIsolatedDiscard(...)`가 `null`일 때 **프롬프트 전체**(`options`)다(:249-253).
  받는 쪽: `packages/server/src/BotAgent.ts:749-753` — 정책이 돌려준 옵션이 제시된 목록에
  있으면 **정상 입찰로 받는다**(경고도 없다). 그 입찰이 1층에서 이기면
  `BotAgent.ts:604-622`가 그대로 반환하므로 **2층(후로·리치·버림 평가)이 통째로 건너뛰어진다.**
- 설명이 약속한 것: "(2국에 1회) 자기 순에 **내가 버릴 패**를 지목한 상대의 바닥에 놓는다."
  — 즉 2국에 한 번, 내 버림 한 장의 명의만 바뀐다. 손해는 어디에도 적혀 있지 않다.
- 기대: 보유 자체는 중립. 발동해도 "어차피 버릴 패"라 손해 없음(파일 머리 주석의 설계 의도).
- 실측(시드 1~30, 4쌍 짝지음 n=120 · `effect.ts`):

  | | 점수차 | 평균순위차 | 화료차 |
  |---|---|---|---|
  | 누명을 한 장 더 든 효과 | **−17,483 ± 1,654 (t=−10.57)** | +1.10 | **−1.57회/판** |

  단독 보유 vs 미보유(같은 시드 30판 · `analyze.ts river_info`):

  | | 평균점수 | 평균순위 | p0 화료/판 | p0 리치/판 | 방총/판 |
  |---|---|---|---|---|---|
  | 미보유 | 25,677 | 2.43 | 2.07 | 2.8 | 1.23 |
  | 누명 1장 | **9,317** | **3.63** | **0.30** | **0.2** | 2.10 |

- 원인 확정(3단계로 갈랐다):
  1. **발동이 아니라 보유가 원인이다.** 프롬프트에서 `frame_discard` 후보를 지워
     한 번도 못 쓰게 해도 결과는 같다 — 오히려 더 나쁘다
     (`repro`: `probe_frame_hold.ts`, 시드 1~12):
     `보유+발동 9,375 / 보유+발동봉인 7,350 / 미보유 24,875`, 치 수락 `102/166 · 108/175 · 10/278`.
  2. **봇의 뷰에서 그 id만 지우면 정상으로 돌아온다.** `players[p0].augments`에서
     `frame_up`을 빼거나 더미 문자열로 바꾸면 미보유와 **점수·행동이 완전히 동일**해진다
     (`probe_frame_view.ts`: 보유 6,625 / id만 바꿔 보여주기 21,450 / 미보유 21,450).
     → 원인은 «봇이 자기 보유 목록에서 그 id를 보고 정책을 돌리는 것» 하나로 좁혀진다.
  3. **정책이 무엇을 돌려주는지 직접 셌다** (`repro_frame_up_pick.ts`, 반장 6판):
     정책 반환 `{discard:442, chi:53, pon:31, frame_discard:20}` —
     그중 **누명과 무관한 표준 선택지가 그 순의 최종 선택과 일치한 횟수 `{discard:440, chi:47, pon:29}`**.
     즉 반장 6판 동안 **버림 440번과 울기 76번을 누명의 정책이 대신 골랐다** — 그것도
     `options[0]`(프롬프트의 첫 후보)로. 그래서 치 수락률이 4% → 60%로 튀고 손이 열려
     리치·멘젠 타점이 사라진다.
- 재현: `tsx qa-lab/synergy4/build/repro_frame_up_pick.ts 6` ·
  `tsx qa-lab/synergy4/build/probe_frame_hold.ts 12` · `tsx qa-lab/synergy4/build/probe_frame_view.ts 8`
- 같은 결함의 선례: `hand_swap3.ts:563-569`에 **같은 실수를 고친 기록**이 남아 있다 —
  "⚠ `options`는 이번 순 전체 후보다 … 필터 없이 `options[0]`을 그대로 돌려주면 대개 그냥
  버림이 뽑혀 지정이 영영 발동하지 않는다(2026-08-28 실전 검증에서 발견)". 누명은 그때
  함께 고쳐지지 않았다. 카탈로그 전체에서 `options[0]`을 그대로 돌려주는 정책은 지금
  **누명 하나뿐**이다(`grep -rn 'options\[0\]' packages/content/src/augments`).
- 심각도: 🔴. 봇 좌석은 이 카드를 뽑는 순간 사실상 무작위로 버리고 아무 울기나 받는다.
  아레나·티어 측정도 이 값 위에서 돈다(누명 티어 `p2 s3 u5 f4`).
- 제안 수정: `pick`의 마지막 줄을 자기 타입으로 좁힌다 —
  `return preferred ?? sameTile.find(o => o.type === ACTION) ?? null;`
  (덤으로 `BotAgent`가 «정책이 자기 액션이 아닌 표준 옵션을 돌려줬다»를 경고하도록 하면
  같은 부류가 다시 생겨도 조용히 지나가지 않는다.)

---

## 확정 2. 🟠 정보 축(상대 손패·텐파이·위험패 공개)은 봇 좌석에서 **기여가 정확히 0**이다 — 554회 발동, 30/30판 결과 완전 동일

- 위치: `packages/server/src/bot/danger.ts:141-143`
  ```ts
  if (view.playerId === SPECTATOR_ID) { for (const p of view.players) countZone(handZone(p.id)); }
  else { countZone(handZone(view.playerId)); }   // 대국자는 자기 손패만 센다
  ```
  그리고 `bot/*.ts` 어디에도 `augmentData`(증강이 공개한 정보)를 읽는 코드가 없다
  (`grep -rn 'augmentData' packages/server/src/bot packages/server/src/BotAgent.ts` → 0건).
- 설명이 약속한 것: 투시 "상대 세 명의 손패가 전부 나에게만 보인다" · 천리안 "텐파이인
  상대가 누구인지 … 밝혀진다" · 지뢰 탐지 "지금 버리면 쏘이는 패가 표시된다".
- 기대: 정보를 얻은 만큼 수비·밀기 판단이 달라져 방총이 줄거나 화료가 는다.
- 실측(같은 시드 30판, 단독 보유 vs 미보유 · `inert.ts`):

  | 카드 | 발동 횟수(30판) | 점수·국수·화료·방총·리치가 **전부 같은 판** |
  |---|---|---|
  | `xray_hand` 투시 | 60 | **30/30** |
  | `tenpai_scan` 천리안 | 258 | **30/30** |
  | `danger_sense` 지뢰 탐지 | 296 | **30/30** |

  `hand_steal` 빌드에서 투시의 한계 기여는 4쌍 120표본에서 `−128 ± 128`,
  120쌍 중 **119쌍이 완전 동일**했다. `defense_info` 빌드에서는 천리안 단독·지뢰 탐지 단독이
  미보유와 **모든 열이 한 자리도 다르지 않다**(25,677 / 순위 2.43 / 화료 2.07 / 리치 2.8).
- 재현: `tsx qa-lab/synergy4/build/analyze.ts defense_info` · `tsx qa-lab/synergy4/build/inert.ts`
- 성격: 손패를 세지 않는 것은 **의도된 치트 방지**다(위 주석). 다만 그 결과로
  **정보 축 전체가 봇에게 값 0**이고, 티어·아레나가 그 0 위에서 이 카드들을 잰다.
  사람이 들면 값이 있으므로 «숫자가 실제보다 낮게 나온다»는 방향의 왜곡이다.
  선례와 같은 부류다(3라운드 확정 2: `ura_swap`을 봇이 한 번도 고르지 않는다).
- 제안: ① 증강이 공개한 정보를 봇이 읽을 통로를 하나 만든다(예: `augmentView`의
  공개 채널만 읽어 `readThreats`의 `level`을 보정) ② 또는 티어표에서 정보 축은
  봇 측정값을 쓰지 않는다고 못 박는다.

---

## 확정 3. 🟡 «판을 한 톨도 바꾸지 않는» 카드 목록 — 30/30판 완전 동일

`inert.ts`가 같은 시드에서 **단독 보유 vs 미보유**를 1:1로 대조한 결과(점수·국수·화료·방총·리치
다섯 열이 전부 같아야 «동일»):

| 카드 | 동일 판 | 발동 | 해석 |
|---|---|---|---|
| `xray_hand` · `tenpai_scan` · `danger_sense` | 30/30 | 60·258·296 | 확정 2 (정보를 읽는 쪽이 없다) |
| `time_pressure` 초읽기 | 30/30 | 30 | **하네스에 실시간 시계가 없다** — 5초 제한이 봇에게 무의미. 측정 한계이지 결함이 아니다 |
| `void_kan` 성립하지 않는 깡 | 30/30 | 0 | 의심 1 |
| `unification` 천하통일 | 30/30 | 0 | 의심 2 |

`time_pressure`를 뺀 나머지는 「들어도 아무 일이 없다」가 **게임 안에서** 참이다.

---

## 의심 1. `void_kan`(성립하지 않는 깡) — 반장 30판 전부 무변화, 기회 자체가 거의 없다

- 실측: 30/30판 완전 동일, 한계 기여 `+0`(120쌍 전부 동일, `effect.ts`).
- 기회 계측(`repro_void_kan.ts`, 반장 20판 218국): 깡 27회 중 **상대의 깡 17회**,
  그중 창깡 대상이 아닌 대명깡 7회 → 대상이 되는 상대 안깡·가깡은 **10회/218국**.
  그 10번에 내가 «리치 없는 텐파이»여야 하므로 실제 발동 기대치는 0에 가깝다.
  p0의 창깡 화료 **0회**.
- 왜 확정이 아닌가: 구현이 틀렸다는 증거가 없다. 조건(상대 안깡 × 내 리치 없는 텐파이)이
  드물어 «값이 0에 수렴»하는 것으로 보인다 — 유닛 레벨에서 발동 경로가 사는지는
  이 라운드에서 확인하지 않았다.
- 재현: `tsx qa-lab/synergy4/build/repro_void_kan.ts 20`

## 의심 2. `unification`(천하통일) — 단독으로는 30/30판 무변화, 뱅크 카드와 함께여야만 산다

- 실측: 단독 보유 30/30판 동일(문턱 55,000점에 도달한 판이 없다). 4쌍 120표본에서
  `−132 ± 495`, **111/120쌍이 완전 동일**.
- 다만 `jackpot`과 함께 들면 살아난다: `bank_han` 빌드의 3장 조건에서 표준편차가
  31,601까지 벌어지고(다른 조건 16,000~20,000) 국 수가 줄어든 판이 나온다 —
  조기 종료가 실제로 걸린 판들이다.
- 왜 확정이 아닌가: 「문턱이 높아 혼자서는 못 켠다」는 설계일 수 있다. 다만 드래프트에서
  이 카드 한 장만 집은 사람에게는 **게임 내내 아무 일도 일어나지 않는다**.

## 의심 3. 조건이 좁아 절반 이상의 판에서 무변화인 카드들

| 카드 | 단독 30판 중 완전 동일 | 30판 발동 | 비고 |
|---|---|---|---|
| `hourglass` 뒤집힌 모래시계 | 24/30 | 0 | 유국 + 텐파이가 겹쳐야 한다 |
| `die_hard` 죽기살기 | 23/30 | 0 | 12,500점 이하로 떨어져야 한다 |
| `siege_riichi` 공성계 | 23/30 | 0 | 봇이 노텐 리치를 거의 안 건다 |
| `grave_rob` 무덤 도굴 | 22/30 | 2 | 「최근 6장 중 오름패」가 드물다 |
| `push_riichi` 등 떠밀기 | 17/30 | **173** | 낙인은 매 국 찍히는데 터지는 국이 드물다 |
| `omni_chi` 사방치기 | 11/30 | 0 | 봇의 치 수락 자체가 드물다(4%) |

`push_riichi`만 성격이 다르다 — **173번 발동해 놓고 절반 이상의 판에서 결과가 한 톨도
바뀌지 않는다.** 낙인 대상이 「멘젠 + 버린 뒤 텐파이 + 공탁 여유」를 만족하는 순이 거의
오지 않는 것으로 보이나, 이 라운드에서 그 조건별 도달률까지는 재지 않았다.

## 의심 4. 「국의 첫 순」 셰이프 선언 셋은 같은 국에 겹칠 수 있으나, 실전에서는 거의 안 겹친다

- 동수의 결속·무너진 국경·비대칭은 전부 `atHolderFirstTurn`(= `discardCount === 0`)에서만
  발동한다(`shapeDeclare.ts:127-136, 195-201`). 선언은 버림이 아니므로 **한 순에 둘을 연달아
  켤 수 있다** — 구조적으로 막혀 있지 않다.
- 실측(`repro_shape_firstturn.ts`, 반장 8판):
  셋을 다 들었을 때 85국 중 발동국 25 · **같은 국에 2개 이상 켜진 국 3** ·
  내역 `broken_border 15 · async_chiitoi 12 · mixed_triplet 4`.
  둘만 들면 63국 중 발동 13 · 겹친 국 2.
- 즉 «켤 수 없다»가 아니라 «봇의 문턱(샹텐 2 이상 이득)이 두 번 연속 만족되는 일이 드물다»다.
  설명에는 겹치기에 대한 언급이 없으므로 결함으로 보지 않는다. 다만 `call_shape` 빌드에서
  동수의 결속의 한계 기여는 `+2,023 ± 1,613`으로 무너진 국경(`+12,626 ± 1,713`)의 1/6이다.

---

## 사다리 — 장수를 늘리면 실제로 세지는가

같은 시드 짝지음(`ladder.ts`, 빌드당 n=30):

| | 평균차 | t |
|---|---|---|
| 3장 − 2장 평균 | **+3,339** | 5.14 |
| 2장 평균 − 1장 평균 | **+3,325** | 6.55 |
| 3장 − 미보유 | **+8,602** | 9.29 |

빌드별 «3장 − 2장 평균»이 음수인 곳은 `river_info`(−1,850), `riichi_open`(−5,934),
`dora_riichi`(−5,207), `dora_menzen`(−799), `altwin`(−48) 다섯이고, 이 중
표본이 그 부호를 뒷받침할 만큼 벌어진 것은 **하나도 없다**(전부 |t| < 2).
`river_info`가 미보유보다 나쁜 것(−13,497, t=−4.76)은 통째로 확정 1(누명) 탓이다.

`interact.ts`가 잰 «혼자일 때의 기여 vs 나머지 둘과 함께일 때의 기여»에서 **양의 시너지가
표본으로 확인된 것**은 넷이다:

| 조합 | 카드 | 혼자 | 둘과 함께 | 차 | t |
|---|---|---|---|---|---|
| `call_menzen` | `bluff_pretense` | +447 | +14,260 | **+13,813** | 3.02 |
| `suit_edit` | `tile_dyeing` | +3,307 | +24,010 | **+20,703** | 3.34 |
| `call_shape` | `broken_border` | +9,397 | +17,137 | **+7,740** | 2.02 |
| `call_shape` | `mixed_triplet` | −1,753 | +7,080 | **+8,833** | 2.06 |

**음의 시너지**로 표본이 뒷받침된 것은 `loss_gain`의 `die_hard`(−1,353, t=−2.18) 하나뿐인데,
그 크기가 작고(카드 자체 기여가 +1,280 → −73) 원인이 명확하다 — 같이 든 `karma`·`sign_flip`이
실점을 먼저 회수해 죽기살기가 발동할 «바닥»이 오지 않는다. 이건 `die_hard`의 `conflicts`
주석(`die_hard.ts:82-104`)이 이미 같은 이유로 네 장을 배제해 둔 것과 **정확히 같은 축**이라,
설계가 아는 역시너지다. 다만 `karma`·`sign_flip`은 그 배제 목록에 없다.

## 확정 4에 이르지 못한 관찰 — `let_it_ride` × `blood_contract` × `jackpot`의 배수는 «곱»이 아니다

- `blood_contract.ts:103`의 주석은 "다른 배수 증강과 같은 단계라 **서로 곱해진다**"고 적혀 있는데,
  같은 파일 :134-141은 정확히 그 반대를 한다 — 밑값을 `winInfos[].points`(원래 화료점)로
  고정해 **앞 단계가 얹은 몫에는 배수를 걸지 않는다**(`let_it_ride.ts:93-99`도 같은 규약).
  반면 `jackpot.ts:259-270`은 `deltas` 현재값(공탁만 제외)을 밑값으로 삼아 곱한다.
  같은 `Multiply` 단계 안에서 **두 규약이 섞여 있고**, 셋의 앞뒤는 id 해시가 정한다
  (`settleStages.ts:110-152` — "소수는 순서를 결정론적으로 만들 뿐 의미를 주지는 않는다").
- `han_stack` 빌드의 3장 조건에서 이상 정산·드리프트는 한 건도 없었고, 점수차도
  잡음 범위였다(3장−2장평균 +2,490, t=0.82). **금액 단위로 «곱이어야 할 것이 합이 됐다»를
  이번 라운드에서 잡아내지 못했으므로 확정으로 올리지 않는다.** 주석과 구현이 어긋나 있다는
  것만 기록한다(문서 결함).

---

## 검사한 빌드 24개 — 전부 나열

3장 조건(ABC) 평균 점수/순위 vs 미보유(25,677 / 2.43), 시드 1~30.

| 키 | 구성 | 3장 결과 | 판정 |
|---|---|---|---|
| dora_menzen | mirror_dora / dora_afterimage / hidden_blade | 27,142 · 2.32 | 이상 없음 (기여는 셋 다 잡음 범위) |
| dora_riichi | soul_hunt / ura_peek / mirror_dora | 27,337 · 2.50 | 이상 없음 |
| kan_dora | ankan_dora / snake_kan / cliff_bloom | 28,547 · 2.37 | 이상 없음 (snake_kan은 표준 `ankan` 옵션이라 발동 계측 불가 — 측정 한계) |
| han_stack | let_it_ride / blood_contract / aotenjou_ceiling | 30,163 · 2.27 | 이상 없음 · 위 «확정 4에 이르지 못한 관찰» |
| bank_han | jackpot / unification / let_it_ride | 36,617 · 2.33 | 의심 2 (unification) |
| payout | blame_shift / scapegoat / blind_ron | 38,923 · 1.80 | 이상 없음 (blame_shift +6,823 t=3.59, scapegoat +4,398 t=3.16) |
| loss_gain | die_hard / sign_flip / karma | 32,540 · 1.80 | 약한 음의 시너지(die_hard) — 설계가 아는 축 |
| river_yaku | bottom_yaku / grave_rob / pond_snatch | 30,650 · 2.13 | 의심 3 (grave_rob 22/30 무변화) |
| river_info | hidden_river / brief_fog / frame_up | **12,180 · 3.27** | **확정 1** |
| terminal | polar_ends / broken_wall / royal_kokushi | 28,680 · 2.20 | 이상 없음 (국사와 몸통 손이 서로 못 돕는 것은 예상대로 — 셋 다 잡음 범위) |
| honor_shape | wind_lineage / joker / honor_return | 56,253 · 1.10 | 이상 없음 (joker 단독 +27,835 t=13.8 — 이 라운드 최강 단일 카드) |
| suit_edit | tile_dyeing / suit_unify / picky_eater | 60,997 · 1.33 | 이상 없음 · picky_eater는 suit_unify가 있으면 기여가 사라진다(+1,543, 중복) |
| hand_steal | hand_swap3 / full_hand_swap / xray_hand | 42,927 · 1.87 | **확정 2**(xray_hand) |
| wall_edit | future_sight / conjure_draw / dead_wall_master | 37,733 · 1.87 | 이상 없음 |
| tempo | take_back / time_stop / hourglass | 36,693 · 1.77 | 의심 3 (hourglass 24/30 무변화) |
| call_menzen | silent_pact / meld_dissolve / bluff_pretense | 33,953 · 1.90 | 이상 없음 · 아래 «메모 1» |
| call_shape | mixed_triplet / broken_border / omni_chi | 39,853 · 1.73 | 의심 3·4 (omni_chi 11/30 무변화) |
| riichi_open | open_riichi_reveal / off_by_one / all_or_nothing | 33,587 · 2.20 | 이상 없음 (동점 입찰은 이미 무작위로 갈린다 — `BotAgent.ts:787-801`) |
| riichi_deny | riichi_upgrade / siege_riichi / free_riichi_discard | 34,043 · 2.07 | 의심 3 (siege_riichi 23/30 무변화) |
| opp_riichi | counter / soul_hunt / push_riichi | 30,193 · 2.20 | 의심 3 (push_riichi) |
| disrupt | discard_lock / rank_gate / time_pressure | 31,657 · 2.00 | 확정 3의 측정 한계(time_pressure) |
| defense_info | tenpai_scan / danger_sense / no_ron_pact | 28,567 · 2.30 | **확정 2** |
| dealer | eternal_dealer / honba_hunter / pseudo_dealer | 36,613 · 1.80 | 이상 없음 (honba_hunter는 혼자서는 −4,947 → 오야 유지와 함께여야 산다, t=1.22) |
| altwin | void_kan / haitei_lord / grave_rob | 26,530 · 2.57 | 의심 1 (void_kan) |

### 메모 1 — 허장성세 × 묵계는 **구조적으로 겹칠 수 없다**

`bluff_pretense`는 「손에 그 패가 **정확히 1장**일 때」만 후보를 내고(`bluff_pretense.ts:255`),
`silent_pact`는 「몸통이 되는 **2장**이 있어야」 후보를 낸다(`silent_pact.ts:62-81, 193-199`).
두 조건은 서로 배타적이라 **"1장 퐁을 멘젠으로 유지"는 어떤 상황에서도 성립하지 않는다.**
설명 어디에도 그 말이 없고 두 카드가 서로를 가리키지도 않으므로 «못 겹친다»가 결함은 아니지만,
같은 축(call|menzen)에서 가장 자연스러워 보이는 콤보가 실제로는 존재하지 않는다는 점은
기록해 둔다. (빌드 자체의 값은 정상이다 — `bluff_pretense`의 시너지 +13,813, t=3.02.)

---

## 이 라운드가 재지 못한 것 (한계)

- **점수 드리프트 판정**: 본 스위프의 러너(`synergy3/build/run.ts`)에는 뱅크 발행 대조가 없다
  (그 로직은 `harness.runMatch`에만 있다). 그래서 같은 24빌드를 `runMatch`(PersonaAgent)로
  한 번 더 돌려 보강했다 — `tsx qa-lab/synergy4/build/drift.ts 4` (24빌드 × 시드 4 = **96판**).
  결과(`out/drift.txt`): **크래시 0 · 훅 예외 0 · 불변식 위반 0 · 설명되지 않는 드리프트 0**
  (`SCORE_DRIFT_ATTRIBUTED` 9건은 전부 augPoints·ScoreChanged 근거의 부분합과 맞는 정상 발행이다).
- **`snake_kan`·`cliff_bloom` 등 표준 액션(`ankan`)으로 발동하는 증강**은 발동 횟수를
  계측하지 못한다(계측기가 커스텀 액션 타입만 센다). 표의 `0/0`은 «안 켜졌다»가 아니다.
- **사람 좌석**은 재지 않았다. 확정 2는 «봇 좌석에서 0»이라는 뜻이고, 사람에게는 값이 있다.
- 빌드는 3장 고정이다. 4장 빌드는 조건이 16개로 늘어 같은 시드 수를 유지할 수 없었다.
