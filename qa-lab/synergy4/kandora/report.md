# synergy4 «깡·도라·타점» 축 — 시너지 QA 보고서 (2026-08-31)

담당 축: `kan` · `dora` · `han` · `payout` · `bank` 태그가 붙은 증강 **28종**.
방법: 브리핑대로 **예측을 먼저 적고**, 단독 A / 단독 B / A+B 를 **같은 밑값·같은 시드**로 재서 비교했다.
소스는 한 줄도 고치지 않았다. 스크립트는 전부 `qa-lab/synergy4/kandora/` 아래에 있다.

## 축 목록 (28종)

| 태그 | 증강 |
|---|---|
| dora | `red_five_touch` 붉은 손길 · `mirror_dora` 거울 · `dora_afterimage` 잔상 · `dora_conceal` 가려진 도라 · `north_trader` 북풍 상인 · `ankan_dora` 밀실의 도라 · `snake_kan` 장사진 · `hidden_blade` 숨은 칼날 · `ura_peek` 이면투시 · `soul_hunt` 혼 사냥 |
| kan | `ankan_dora` · `snake_kan` · `cliff_bloom` 절벽 위에 피어난 꽃 · `rinshan_preview` 영상 정찰 · `void_kan` 성립하지 않는 깡 |
| han | `let_it_ride` 판돈 굴리기 · `jackpot` 일확천금 · `blood_contract` 핏빛 계약 · `big_hand` 큰손 · `aotenjou_ceiling` 뚫린 천장 · `eternal_dealer` 만년 오야 · `honba_hunter` 본장 사냥꾼 · `unification` 천하통일 · `devils_advance` 가불 인생 |
| payout | `blame_shift` 책임전가 · `scapegoat` 덤터기 · `blind_ron` 눈먼 총알 · `sign_flip` 반전 |
| bank | `counter` 카운터 · `all_or_nothing` 모 아니면 도 · `jackpot` · `big_hand` · `aotenjou_ceiling` · `devils_advance` · `unification` |

## 검사한 조합

- **정산대(설계 실험)**: `m1`(배수 3종 상호 7조건), `m2`(본장 × 배수 3종 12조건), `h1`(판수·상한·하한·재배선 교차 16조건), `h2`·`h3`(+N판 겹침 밑값 1~12판 전 구간 스캔 36조건) — 도합 **70여 조건**.
- **실판(깡·도라)**: `d1`(snake_kan × cliff_bloom × ankan_dora × aotenjou_ceiling, 손패 3종 × 조합 5가지 = 15판).
- **실판(뒷도라)**: `d2`(hidden_blade / soul_hunt × ura_peek 바꿔치기 × mirror_dora, 9조건).
- **실판(순서 의존)**: `s2`(devils_advance × sign_flip, 픽 순서 2가지 × 같은 시드).
- **실판 스위프**: `sweep_live.ts` — 축 28종의 **2장 조합 377개**(conflicts 제외) 동풍전 완주.
  **377/377 완주, 신호 0.**
- **실판 좌석 교차 스위프**: `sweep_cross.ts` — 좌석을 걸쳐야만 보이는 **30조합 × 2시드 = 60판**.
- **실판 관측**: `s3`(잔상의 prevDora 내용, 반장 1판) · `s4`(본장 누적 대조군 3판).

---

# 확정 결함

## 확정 1 — `jackpot` × `let_it_ride`: 배수가 곱셈으로 겹쳐 뱅크 발행이 폭발한다
**심각도: 상**

- **재현**: `qa-lab/synergy4/kandora/m1_multiply_stack.ts`
- **기대(설명·주석 근거)**: 세 배수 카드는 전부 `SETTLE_STAGE.Multiply`다. `let_it_ride.ts:96-99`와
  `blood_contract.ts:129-138`은 **밑값을 `winInfos[].points`(손의 화료점)로 고정**한다고 명시하며,
  그 주석은 "앞 단계가 얹은 몫에는 손대지 않는다 … 델타를 밑값으로 삼는 순간 그 부풀린 몫에까지
  1.5배가 걸려 detail의 «손의 화료점뿐»이 거짓이 된다(QA verify-score 확정 1)"고 적는다.
  그 규약대로면 손 8,000 쯔모에 연승 4배 + 룰렛 3배 = 8,000 + 24,000 + 16,000 = **48,000**.
- **실측**:

  | 조합 | p0 수령 | 뱅크 발행 |
  |---|---|---|
  | 기준 | 8,000 | 0 |
  | let_it_ride 4배 단독 | 32,000 | 24,000 |
  | jackpot 3배 단독 | 24,000 | 16,000 |
  | blood_contract 단독 | 12,000 | 4,000 |
  | let + blood | 36,000 | 28,000 (기대 36,000 = **OK**) |
  | jackpot + blood | 28,000 | 20,000 (기대 28,000 = **OK**) |
  | **let + jackpot** | **96,000** | **88,000** (기대 48,000 — **2.00배**) |
  | **셋 전부** | **100,000** | 92,000 (기대 52,000 — **1.92배**) |

- **원인**: `packages/content/src/augments/jackpot.ts:266-270`
  ```ts
  const pot = riichiPotGainOf(p, holder);
  const base = Math.max(0, d - pot);      // ← d = 지금까지 부풀려진 델타
  const scaled = round100(base * mult);
  ```
  형제 두 장은 `winInfos[].points`를 밑값으로 쓰는데 `jackpot`만 **현재 델타**를 쓴다.
  `settlePriority`의 id소수는 `let_it_ride 0.354 < jackpot 0.463 < blood_contract 0.814`라
  jackpot이 let_it_ride **뒤에** 돌고, let_it_ride가 뱅크에서 발행한 24,000에 다시 3배가 걸린다.
  이는 `settleStages.ts`가 못 박은 규칙 —
  "배수(`Multiply`)는 뱅크 가산(`BankTopUp`)보다 먼저 돈다 — 보전액에 일확천금 3배가 다시 곱해지면
  **지수 폭발이 한 단계 더 겹친다**" — 이 같은 단계 **안에서** 그대로 뚫려 있다는 뜻이다.

## 확정 2 — `jackpot` 0.5배가 앞 카드의 뱅크 발행분을 **지불자에게서** 깎는다
**심각도: 상** (확정 1과 같은 한 줄이 원인이지만 증상과 피해자가 다르다)

- **재현**: `m1_multiply_stack.ts` 「0.5배(축소) 룰렛이 앞 카드의 발행분까지 깎는가」 절
- **기대**: 룰렛 0.5배는 **내 화료점**을 반으로 줄인다(그 깎인 몫을 지불자에게 환급). 연승 4배와
  겹치면 가산 규약상 8,000 + 24,000 − 4,000 = **28,000**, 지불자는 표준 8,000을 그대로 낸다.
- **실측**:

  | 조합 | p0 | p1 | p2 | p3 |
  |---|---|---|---|---|
  | jackpot 0.5배 단독 | 4,000 | −1,000 | −1,000 | −2,000 |
  | **let_it_ride 4배 + jackpot 0.5배** | **24,000** | **0** | **0** | **0** |

  세 지불자가 **한 푼도 내지 않는다.** 밑값이 32,000으로 부푼 탓에 축소액이 16,000이 되었고,
  환급 대상(`refundShares`)이 지불자의 실제 지불액 8,000에서 잘려 **전액이 환급**됐다.
- **원인**: 같은 `jackpot.ts:267`의 `base = d - pot` + `jackpot.ts:307-320`의 환급 경로.

## 확정 3 — `counter`의 직격 +3판이 `hanSoFar`를 받지 않는다 (다른 +N판 카드와 덧셈이 되지 않는다)
**심각도: 상**

- **재현**: `qa-lab/synergy4/kandora/h2_counter_hansofar.ts`, `h3_hansofar_scan.ts`
- **기대(설계 근거)**: `docs/40 §1-3`이 3라운드의 결함으로 명시하고 고친 그 규약이다 —
  "`addWinPointBonus`가 **이 정산에서 다른 증강이 이미 얹은 판수**를 넘겨준다. 밑값에 그것을
  더해 계산하므로 **순서와 무관하게 정확히 덧셈**이 된다"(`util.ts:804-823`).
  그러니 `blame_shift`(론 +2판) + `counter`(직격 +3판)의 뱅크 발행 합은 언제나 `S(밑값+5) − S(밑값)`이어야 한다.
- **실측** (30부 자 론, 밑값 1~12판 스캔. «앞 카드가 +2판을 얹었으므로 counter 몫이 달라져야 하는 양» 대 실측):

  | 밑값 판 | 기대 Δ | 실측 Δ | 오차 |
  |---|---|---|---|
  | 1 | +1,400 | 0 | −1,400 |
  | 2 | −1,700 | 0 | +1,700 |
  | 3 | −100 | 0 | +100 |
  | 4 | −300 | 0 | +300 |
  | 5 | −4,000 | 0 | +4,000 |
  | 6 | +4,000 | 0 | **−4,000** |
  | 7 | +4,000 | 0 | **−4,000** |
  | 8 | +8,000 | 0 | **−8,000** |
  | 9 | 0 | 0 | OK |
  | 10 · 11 · 12 | −8,000 | 0 | **+8,000** |

  **12개 밑값 중 11개에서 어긋나고**, 실측 Δ가 전 구간 0이다 = counter가 앞 카드의 판을 전혀 보지 않는다.
- **원인**: `packages/content/src/augments/counter.ts:368-374`
  ```ts
  bonus += winPointsWithExtraHan(
    ic.state, holder, mine, DIRECT_HIT_BONUS_HAN, ctx.engine.rules,
  );                                    // ← 6번째 인자 hanSoFar 누락
  ```
  `addWinHanBonus`를 쓰는 카드들은 래퍼가 hanSoFar를 흘려 주는데, `counter`만 헬퍼를 직접 부르며
  마지막 인자를 빠뜨렸다. 2026-08-23 수정이 이 한 곳을 지나쳤다.

## 확정 4 — 환산액이 0인 "+N판"은 `augPoint` 줄을 안 남겨, 뒤 카드의 밑값에서 그 판수가 사라진다
**심각도: 중**

- **재현**: `h3_hansofar_scan.ts` 밑값 8판 줄 (`[blame판=없음]`)
- **기대**: 만관 밴드 안에서 "+2판"의 **환산액**이 0원이 되는 것은 알려진 정상 동작이지만
  (`docs/40 §5-1`), 그 국에도 **판수 자체는 얹혔다**. 뒤에 오는 "+N판" 카드는 그 2판 위에서
  자기 몫을 세야 한다.
- **실측**: 밑값 8판(30부 자 론, 16,000)에서 `blame_shift`의 augPoint 줄이 **아예 기록되지 않는다**.
  hanSoFar 합산은 `augPoints`의 `han` 필드를 훑으므로(`util.ts:820-822`), 그 국에는 hanSoFar가
  2판 낮게 잡힌다 — 확정 3을 고쳐도 밑값 8판에서는 여전히 8,000점 어긋난다.
- **원인**: `packages/content/src/util.ts:825-826`
  ```ts
  const bonus = Math.max(0, Math.round(asObj.points));
  if (bonus === 0) return event;        // ← 판수 표식까지 함께 버린다
  ```

## 확정 5 — `devils_advance` × `sign_flip`: 가불금 ±10,000이 **드래프트 픽 순서**로 갈린다
**심각도: 상**

- **재현**: `qa-lab/synergy4/kandora/s2_live_signflip.ts` (실판, 동풍전, seed 7 고정)
- **기대**: `settleStages.ts`가 존재하는 이유 그대로 — "순서는 **의미**로만 결정되며 드래프트
  순서·등급과 완전히 무관해진다(리플레이·재개에서도 동일)". 어느 쪽으로 정하든 **한 값**이어야 한다.
- **실측** (같은 시드, 같은 카드, 픽 순서만 바꿈):

  | p0의 픽 순서 | 첫 국 발행 | 최종 점수 |
  |---|---|---|
  | `devils_advance` → `sign_flip` | `ScoreChanged p0 +10000 reason=devils_advance` | p0 = **32,100** |
  | `sign_flip` → `devils_advance` | `ScoreChanged p0 −10000 reason=devils_advance+sign_flip` | p0 = **12,100** |

  **20,000점 차**가 픽 순서로만 갈린다.
- **원인**: 두 카드가 **같은 `ROUND_STARTED` 리액션**에 걸려 있다.
  `devils_advance.ts:74-78`이 `scoreChanged(holder, +10000)`을 내고, `sign_flip`은
  `armOnNextRound`(`util.ts:627-637`)로 «이번 국» 무장 표식을 쓴다. `sign_flip`의 SCORE_CHANGED
  인터셉터(`sign_flip.ts:106-120`)는 `armedNow(ic.state, …)`로 무장 여부를 보는데, 그 표식이
  **같은 물결 안에서 이미 커밋됐는지**가 두 리액션의 등록 순서 = `installAugment` 호출 순서 =
  **드래프트 픽 순서**로 갈린다. 정산 인터셉터는 `settlePriority`로 이 문제를 없앴지만
  ROUND_STARTED 리액션 경로에는 같은 장치가 없다. `settleSeatAxis` 주석이 경고하는 대로
  **이어하기·리플레이 재구성(`rebuildAugments`)에서도 원본과 갈릴 수 있다.**

## 확정 6 — `blame_shift`의 `Reassert`가 `devils_advance`의 «각 3,000» 상환까지 재분배한다
**심각도: 중**

- **재현**: `qa-lab/synergy4/kandora/h1_han_bank.ts` (D)절
- **기대**: 두 카드 문구가 서로 다른 돈을 말한다. 책임전가 = "**그 지불**이 … 세 명에게 분담된다"
  (= 내 화료에 대한 지불). 가불 인생 = "상대 셋에게서 **각 3,000점**을 걷어". 상환 3,000은
  화료의 지불이 아니므로 셋이 각각 그대로 물어야 한다 → p1 −8,400 / p2 −8,300 / p3 −8,300.
- **실측** (p0 만관 16,000 론, 방총 p1):

  | 조합 | p0 | p1(쏜 사람) | p2 | p3 |
  |---|---|---|---|---|
  | devils_advance 단독 | 16,000 | −19,000 | −3,000 | −3,000 |
  | blame_shift 단독 | 16,000 | −5,400 | −5,300 | −5,300 |
  | **둘 다** | 16,000 | **−6,400** | **−9,300** | **−9,300** |

  상환 9,000이 3,000/3,000/3,000이 아니라 **1,000/4,000/4,000**으로 다시 갈렸다 —
  **쏜 사람이 상환금 2,000을 면제받고 나머지 둘이 대신 문다.**
- **원인**: `packages/content/src/augments/blame_shift.ts:170-200`. `Reassert`는
  "쏜 사람이 지금 무는 것 − 내 몫 − 다른 화료자 몫"을 **전부 «새로 붙은 내 화료의 지불»로 간주**한다.
  `Transfer` 단계에서 **모두에게 균등하게** 부과하는 `devils_advance`를 구분할 수 없다.
  (같은 자리의 `scapegoat`는 «나머지 둘은 한 푼도 내지 않는다»를 명시하므로 상환이 지목자에게
  몰리는 것이 문구와 일치한다 — 실측 p1 −25,000, 문제 없음.)

## 확정 7 — 배수 3종의 «밑값» 규약이 서로 달라 본장이 한 장에서만 배수를 탄다
**심각도: 중**

- **재현**: `qa-lab/synergy4/kandora/m2_honba_multiply.ts`
- **기대**: 본장은 **상대가 실제로 더 내는 돈**이다. `blood_contract.ts:119-124`가 그 이유를
  명시한다 — "본장도 배수 대상이 아니다 … 여기서 1.5배로 불리면 그 차액을 **뱅크가 새로 발행한다**
  (3본장 론 900 → 1,350). … 예전에는 론만 떼어 내 쯔모 본장이 1.5배로 불어났다(QA score-a 확정 2)".
  `let_it_ride`도 `min(winPoints, d)`로 자연히 제외한다. **`jackpot`만 제외하지 않는다.**
- **실측** (5본장 · 손 8,000 론):

  | | 표준 본장(300) 뱅크 발행 | 본장 사냥꾼(1,500) 뱅크 발행 |
  |---|---|---|
  | jackpot 3배 | 19,000 | **31,000** |
  | let_it_ride 4배 | 24,000 | 24,000 |
  | blood_contract 1.5배 | 4,000 | 4,000 |
  | jackpot3 + let4 | 91,000 | **103,000** (p0 수령 **118,500**) |

  `honba_hunter`를 함께 들면 본장분만으로 뱅크 발행이 12,000 늘어난다.
- **원인**: `jackpot.ts:266-267` — `base = d - pot`는 공탁만 뺀다.
  카드 문구는 "(공탁 회수분 제외)"라 **본장 포함이 의도일 수도 있다.** 다만 같은 단계·같은 종류의
  카드 셋이 서로 다른 규약을 쓰는 것 자체가 결함이며, 확정 1의 원인과 같은 한 줄이다.

---

# 의심 (확인 못 한 것)

1. **`sign_flip`이 뒤집는 «정산 밖 뱅크 발행»의 범위.**
   확정 5에서 보듯 `sign_flip`은 SCORE_CHANGED를 통째로 뒤집는다. 정산 밖에서 점수를 옮기는
   증강이 이 축 밖에도 여럿 있어(카르마 등), 픽 순서 의존이 `devils_advance` 하나만의 문제인지
   더 넓은 문제인지는 이 축만으로는 못 정한다.

2. **`soul_hunt`(리치 강탈)의 뒷도라 경로.**
   `soul_hunt`는 «리치 중인 상대를 론»이 전제라 픽스처에서 그 전제를 세우지 못했다
   (`d2_ura_swap.ts` D2b — uraHan 0으로 발동 자체가 없다). `hidden_blade` 쪽은 같은 규칙
   (`scoring.uraWithoutRiichi`)을 쓰고 정상 동작을 확인했으므로 같으리라 보지만 **실측은 못 했다.**

---

# 밸런스 관찰 (결함이 아님 — 판단용)

- **`dora_afterimage` × 깡 카드 — 되살아나는 도라가 한 종류가 아니다.**
  `dora_afterimage.ts:139-146`은 국 끝의 `state.round.doraIndicators`를 **통째로** 적는다.
  실판 실측(`s3_live_probes.ts`, p0 = 잔상 + 장사진 + 절벽의 꽃, seed 55):

  | 국 | 그 국의 표시패 수 | 다음 국에 되살아날 도라 종류 |
  |---|---|---|
  | 남2국 6본장 | **5개** | 中 · 5s · 7p · **5s(중복)** · 남 |
  | 남3국 7본장 | 2개 | 9s · **9s(중복)** |
  | 동4국 3본장 | 3개 | 남 · 1m · 8p |

  깡이 많이 난 국 뒤에는 «2국에 1회» 액티브 한 번이 개인 도라 **5종**(중복 포함, countDora가
  중복을 세므로 실제 판수도 중복만큼 더 붙는다)을 얹는다. 그리고 그 깡을 부르는 카드
  (`snake_kan`·`cliff_bloom`·`ankan_dora`)가 같은 축에 있어 보유자가 **스스로 만들 수 있다**.
  카드 문구("직전 국의 도라가 되살아나")는 복수를 금지하지 않으므로 결함으로 올리지 않는다.

- **`snake_kan` + `cliff_bloom` + `ankan_dora`** — 배패에서 연속 4장 두 벌이면 그 자리에서 확정 화료가 서고
  판수가 `역han 5~7 + extraHan 11`이 된다(실측 총 16~18판, 표준 32,000). `aotenjou_ceiling`을 얹으면
  **52,000~60,000**. 3라운드가 `snake × bloom`을 `antiIds`로만 낮춰 두었는데, `ankan_dora`가
  세 번째 장으로 들어오면 그 완화를 넘어선다(`d1_kan_han_chain.ts`).

---

# 이상 없음으로 판정한 조합 (한 줄 요약)

- `mirror_dora` × `dora_afterimage` — 개인 도라가 **합산**된다(1+1=2판). 되살린 도라가 이번 국 도라나 앞도라와 **같은 종류여도 중첩해서 센다**(`helpers.ts:1053-1058` — countDora가 중복을 센다). 덮어쓰기 없음.
- `ankan_dora` × `snake_kan` × `cliff_bloom` — `score.extraHan`이 정확히 합산된다(만개 3 + 깡 4×2 = **11판**). 역만이 선 손에서 extraHan이 0이 되는 것은 코어의 의도된 동작(`standardActions.ts:936-940`).
- `ankan_dora`·`north_trader`·`cliff_bloom`의 `score.extraHan` 모디파이어 3종 — 전부 `cur + n` 형태라 겹쳐도 덧셈.
- `score.extraHan`(실판) → `WinInfo.han`(`standardActions.ts:1051`, `han: totalHan`) → 상한 해제·"+N판" 환산의 밑값. 실판 계열과 뱅크 환산 계열이 **같은 밑값**을 본다.
- `aotenjou_ceiling` × "+N판"(`blame_shift`) — 상한 해제 곡선 위에서 정확히 이어 붙는다. 실측 uncapped(8판)=20,000 → +blame(+2판)=**28,000** = `unc(10)`. 이중 계산 없음.
- `big_hand` × `aotenjou_ceiling` / `blame_shift` / `jackpot` — 하한(`BankFloor`) + 재확인(`Reassert`)이 **이중으로 발행하지 않는다**(어느 조합이든 p0 수령 정확히 8,000, 발행 7,000).
- `big_hand` × `eternal_dealer` — 오야 취급이 하한에 반영된다(8,000 → **12,000**).
- `let_it_ride` × `blood_contract`, `jackpot` × `blood_contract` — 둘 다 가산 규약대로 정확히 덧셈(36,000 / 28,000).
- `all_or_nothing`(BankTopUp) × `big_hand`(BankFloor) — 판돈이 하한의 밑값에 들어간다. 큰손 detail("배수 증강은 다 적용된 뒤의 값을 본다")과 일치, 이중 발행 없음.
- `scapegoat` × `devils_advance` — 상환 9,000이 지목자 한 명에게 몰린다. 카드 문구("나머지 두 명은 한 푼도 내지 않는다")와 일치(실측 p1 −25,000).
- `blame_shift` × `scapegoat` — 론/쯔모로 조건이 배타적이라 겹치지 않는다.
- `let_it_ride`·`blood_contract` × `honba_hunter` — 본장분이 배수 밖에 정확히 남는다.
- `eternal_dealer` × `honba_hunter` — 만년 오야가 오야를 옮겨도 **본장 처리는 대조군과 한 줄도 다르지 않다**
  (`s4_honba_control.ts`, seed 21: 증강 없음 / eternal_dealer만 = `0,1,2,3,4,5,6,7`로 완전 일치).
  봇 판에서 본장이 계속 쌓이는 것은 매 국이 유국으로 끝나기 때문이지 증강 탓이 아니다.
- **축 28종 2장 조합 377개 전부** 동풍전 완주 스위프 (`sweep_live.ts`) — `완료 — 신호 있는 조합 0 / 377`.
  크래시 0 · 훅 예외 0 · 불변식 위반 0 · 설명 불가 점수 드리프트 0.
  ⚠ 확정 1·2의 폭발은 `augPoints`로 정상 귀속되므로 **드리프트 검사에는 잡히지 않는다** —
  이 라운드가 «의미»를 따로 재야 했던 이유가 이것이다.
- **좌석 교차 30조합 × 2시드 = 60판** (`sweep_cross.ts`) — 크래시 0 · 훅 예외 0 · 불변식 위반 0 · 설명 불가 드리프트 0.
  (`void_kan`×`snake_kan`, `mirror_dora`×`dora_conceal`, `blind_ron`×`blame_shift`/`scapegoat`, `sign_flip`×`aotenjou`/`scapegoat`,
   `counter`×`all_or_nothing`, `unification`×`devils_advance`, `rinshan_preview`×`cliff_bloom` 등)
- `void_kan` × `snake_kan` — 코드 확인. 코어는 깡 선언 시 `chankan.tileId = p.handTileIds[0]`
  (`flowEvents.ts:647-654`)로 **깡의 첫 장 한 장만** 싣는다. 장사진 깡은 네 장의 종류가 다르므로
  창깡이 성립하는 종류도 그 한 장뿐이지만, `void_kan`은 그 한 종류에 맞춰 손을 위조하므로
  카드가 약속하는 «창깡으로 화료할 수 있다»는 그대로 성립한다. 실판 스위프에서도 신호 없음.
- `hidden_blade` × `ura_peek`(뒷도라 표시패 바꿔치기) × `mirror_dora` — `d2_ura_swap.ts` 실측.
  멘젠 다마텐 론 4판 손 기준:

  | 조합 | 뒷도라 표시패 | uraHan | 총 han |
  |---|---|---|---|
  | 없음 | man4 | 0 | 4 |
  | hidden_blade | man4 | **1** | **7** (= +2판 역 + 뒷도라 1) |
  | blade + peek(바꿔치기 X) | man4 | 1 | 7 (간섭 없음) |
  | blade + peek(**바꿔치기 O**) | **pin4** | 0 | 6 |
  | blade + peek + mirror(바꿔치기 O) | pin4 | 0 | 6 |

  바꿔치기가 표시패를 실제로 갈고 **채점이 바꾼 뒤의 표시패를 본다**(낡은 패를 안 본다).
  `mirror_dora`가 뒷도라에는 붙지 않는 것도 카드 문구대로다("**뒷도라에는 적용되지 않는다**").
- `hidden_blade`의 +2판은 `addWinHanBonus`(뱅크)가 아니라 **등록된 역**이라 `info.han`에 들어간다 — 확정 3·4의 hanSoFar 문제와 무관하다.

---

# 부록: 스크립트

| 파일 | 무엇을 재는가 |
|---|---|
| `lib.ts` | 정산 인터셉터 파이프라인 실험대(`packages/content/test/settle_synergy_0823.test.ts` 규약) |
| `m1_multiply_stack.ts` | 확정 1 · 확정 2 — 배수 3종 상호 |
| `m2_honba_multiply.ts` | 확정 7 — 본장 × 배수 3종 |
| `h1_han_bank.ts` | 확정 6 — 판수·상한·하한·재배선 교차 |
| `h2_counter_hansofar.ts` | 확정 3 — counter × blame_shift 단일 밑값 |
| `h3_hansofar_scan.ts` | 확정 3 · 확정 4 — 밑값 1~12판 전 구간 스캔 |
| `d2_ura_swap.ts` | 뒷도라 바꿔치기 × 리치 없는 뒷도라 |
| `d1_kan_han_chain.ts` | 깡 계열 실판 — `score.extraHan` 합산 · 밸런스 관찰 |
| `s1_signflip_bank.ts` | (막다른 접근 기록 — 크래프트 상태로는 ROUND_STARTED가 나지 않는다) |
| `s2_live_signflip.ts` | 확정 5 — 픽 순서 의존 |
| `s3_live_probes.ts` | 잔상의 prevDora 내용 · 본장 누적 실판 관측 |
| `s4_honba_control.ts` | 본장 누적의 대조군(증강 없음 / honba_hunter / eternal_dealer) |
| `sweep_live.ts` | 2장 조합 377개 실판 스위프 |
| `sweep_cross.ts` | 좌석 교차 30조합 × 2시드 실판 스위프 |

실행: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/synergy4/kandora/<파일>.ts` (워크트리 루트에서)

> ⚠ 스위프 두 종은 결과를 표준출력으로만 남긴다. 세션 스크래치패드는 **형제 에이전트와 공유**되므로
> 리다이렉트 경로를 겹치지 않게 잡을 것(이번에 한 번 겹쳐 로그가 섞였다).
