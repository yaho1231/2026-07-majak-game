# 화료 제약 해제 · 유국 · 후로 — relax

담당 축: `relax_win` / `draw` / `call` / `menzen`
도구: 유닛 재현(craft + createStandardGameFromState + installAugment). 스크립트는
`qa-lab/synergy3/relax/*.ts`, 전부 `tsx`로 단독 실행된다. `packages/**` 는 읽기만 했다.

## 요약

검증한 조합 **27** / 확정 **6건** · 의심 **2건** / 음성 확인 **11건**

| # | 심각도 | 조합 | 한 줄 |
|---|--------|------|-------|
| 1 | 🟠 | "+N판" 증강 아무 둘 | +3판과 +3판을 겹쳐도 +6판이 아니다 (초과·부족 양쪽) |
| 2 | 🔴 | hourglass × nagashi_yakuman | 거절할 수 없는 자동 연장이 유국역만 48,000을 스스로 지운다 |
| 3 | 🔴 | open_kokushi × mixed_triplet | 두 콜을 순서대로 부르면 그 국이 벽돌(화료·텐파이 불가)이 된다 |
| 4 | 🟠 | silent_pact × meld_dissolve | "전부 잃는다"던 묵계 멘젠이 파혼 한 번에 되살아난다 |
| 5 | 🟡 | mixed_triplet × silent_pact/bluff_pretense | 혼색 커쯔는 묵계·허장성세로 부를 수 없다 (조용한 삼킴) |
| 6 | 🟡 | hourglass × haitei_lord | 유국 시 텐파이면 **100% 화료**가 된다 — 설명 어디에도 없다 |

---

## 확정 1. 🟠 "+N판" 증강 둘 — 합이 +(N+M)판이 아니다

**대상 쌍(전부 함께 뽑을 수 있다)**: `late_bloomer`×`haitei_lord` · `yakuless_win`×`late_bloomer`
· `iron_wall`×`yakuless_win` · `late_bloomer`×`iron_wall` · `open_riichi`×`open_riichi_reveal`
· `avenger`×`iron_wall` …
(`iron_wall`·`yakuless_win`·`late_bloomer`·`avenger` 는 전부 `relax_win` 축이라
docs/26 기준 **함께 뜨도록 설계된 조합**이다.)

- **위치**: `packages/content/src/util.ts:950` (`addWinHanBonus`) →
  `:692` (`addWinPointBonus`, SETTLE_STAGE.BankTopUp) → `:903` (`winPointsWithExtraHan`)
  각 증강은 `late_bloomer.ts:75` · `haitei_lord.ts:67` · `open_riichi_reveal.ts:237` ·
  `standardAugments.ts:160,212` 에서 이걸 호출한다.
  ⚠ 표준 증강 3종(철벽·개문선언·무형화료)은 **core 안의 같은 이름 사본**
  (`packages/core/src/augment/standardAugments.ts:63` `addWinHanBonus`)을 쓴다 — 구현이 두 벌인데
  둘 다 같은 방식(원본 `info.han` 기준 차액)이라 결함도 같다.
- **설명이 약속한 것**: 대기만성 "화료에 **+3판**이 붙는다" · 해저의 지배자 "**+3판**이
  붙는다" · 무형화료 "그 화료를 **2판으로 취급**" · 오픈 리치 "그 리치를 **3판으로 취급**".
- **원인**: 인터셉터가 **각자 원본 `info.han` 을 밑값으로** `S(han+N) − S(han)` 을 계산해
  더한다. 서로의 결과를 못 보므로 합이 `S(han+N+M) − S(han)` 이 되지 않는다.
  (`info` 는 두 인터셉터 모두에게 원본 그대로 전달된다 — 순서 무관.)

### 대조군 ① 만개 + 해저 (오야 쯔모 · 기본 6판 30부 = 18,000)
`tsx qa-lab/synergy3/relax/repro_han_stack.ts`

| 셀 | 증강 보너스 | p0 수령 | 약속대로라면 |
|----|------------|---------|-------------|
| 없음 | — | 18,000 | 18,000 |
| 대기만성만 (+3판) | +6,000 | 24,000 | 24,000 ✓ |
| 해저만 (+3판) | +6,000 | 24,000 | 24,000 ✓ |
| **둘 다 (+6판이어야)** | +6,000 +6,000 | **30,000** | **36,000** (12판=오야 삼배만) |

→ **6,000점 부족**.

### 대조군 ② 역 0개 손 론 (오야 · 기본 2판 40부 = 3,900)
`tsx qa-lab/synergy3/relax/repro_yakuless.ts`

| 셀 | p0 수령 | 약속대로라면 |
|----|---------|-------------|
| 없음 | 화료 거부 | 거부 ✓ |
| 무형화료만 (+2판) | 12,000 | 12,000 ✓ |
| 대기만성만 (+3판) | 12,000 | 12,000 ✓ |
| **무형화료+대기만성 (+5판)** | **20,100** | **18,000** (7판=오야 배만) |
| 철벽+무형화료 (후리텐+무역, +5판) | **20,100** | 18,000 |
| 대기만성+철벽 (+6판) | **20,100** | 24,000 (8판) |

→ 같은 메커니즘이 한 줄에서는 **2,100점 초과**, 다른 줄에서는 **3,900점 부족**.
20,100 은 만관표에 존재하지 않는 금액이다(오야 론: 12,000/18,000/24,000/36,000/48,000).

### 대조군 ③ 개문선언 × 오픈 리치 (오야 쯔모 · 기본 4판 30부 = 11,700)
`tsx qa-lab/synergy3/relax/repro_openriichi.ts`

| 셀 | 증강 보너스 | p0 수령 | 약속("리치 3판 취급") |
|----|------------|---------|----------------------|
| 개문선언만 (리치 2판 취급) | +300 | 12,000 | 12,000 ✓ |
| 오픈 리치만 (+2판) | +6,300 | 18,000 | 18,000 ✓ |
| **개문선언 + 오픈 리치** | +300 +300 | **12,300** | **18,000** |

`open_riichi_reveal.ts:249` 은 개문선언과 겹칠 때 "3판 취급이 4판이 되지 않게" +2 대신 **+1**을
얹는다 — 저자가 **덧셈을 의도**했다는 증거다. 그런데 두 +1이 각자 4판을 밑값으로 계산되어
`+300 +300 = 600` 이 되고, 의도한 `+2판 = 6,300` 의 **1/10** 이 된다.

- **재현**: `tsx qa-lab/synergy3/relax/repro_han_stack.ts` ·
  `repro_yakuless.ts` · `repro_openriichi.ts`
- **영향**: 같은 축(relax_win / riichi)에 모아 둔 증강이라 함께 뜨는 빈도가 높다.
  플레이어가 정산창에서 보는 것은 "+3판 / +3판" 두 줄인데 실제 지급은 그 합이 아니다.
- **제안 수정**: `addWinPointBonus` 를 "각자 얹는다"에서 **판수 합산 → 마지막에 한 번 환산**으로
  바꾼다(예: `score.extraHan` 처럼 판수를 모으는 규칙 채널을 두고 BankTopUp 단계에서
  `S(han+Σ) − S(han)` 을 한 번만 지급). 그러면 순서·개수와 무관하게 덧셈이 성립한다.

---

## 확정 2. 🔴 hourglass × nagashi_yakuman — 거절할 수 없는 연장이 역만을 지운다

- **위치**: `packages/content/src/augments/hourglass.ts:134` (SETTLE_STAGE.Replace 인터셉터,
  **자동 발동 · 액티브 버튼도 봇 정책도 없다**) / `nagashi_yakuman.ts` 의 판정은
  `round.byPlayer[holder].discardedKinds` 전체다.
- **설명이 약속한 것**: 모래시계 — "황패유국이 선언되는 순간 내가 텐파이라면 국이 끝나지 않고
  … 나 혼자 연속으로 쯔모한다." 유국역만 — "유국까지 요구패와 자패만 버렸다면 … 역만."
  모래시계의 detail 이 경고하는 위험은 **론뿐**이다("연장 중 자신이 버리는 패는 평소대로 론 대상").
- **기대**: 연장으로 4장을 더 버리므로 요구패가 아닌 패를 버리면 유국역만이 깨질 수 있다 —
  다만 **보유자가 그 위험을 감수할지 고를 수 있어야** 한다.
- **실제**: 조건(유국 순간 텐파이)만 맞으면 무조건 발동한다. 텐파이 손에 버릴 요구패가 없으면
  회피 경로가 **아예 없다**.

`tsx qa-lab/synergy3/relax/repro_hourglass_nagashi.ts` (p0=오야·텐파이·버림 전부 요구패, seed 1/7/42 동일)

| 셀 | 연장에서 버린 패 | p0 델타 | 결과 |
|----|------------------|---------|------|
| 없음 | 연장 없음 | **+15,000** | 유국만관(표준) + 텐파이료 |
| 유국역만만 | 연장 없음 | **+51,000** | 유국역만 48,000 + 텐파이료 3,000 |
| 모래시계만 | 1만,2만,2만,2만 | **+3,000** | 유국만관 소멸 |
| **둘 다** | 1만,2만,2만,2만 | **+3,000** | **유국역만 소멸 — 48,000 증발** |

- **재현**: `tsx qa-lab/synergy3/relax/repro_hourglass_nagashi.ts`
- **영향**: 두 증강 모두 prism·`draw` 축이라 같은 축 시너지로 제시된다. 유국역만은 이 게임에서
  가장 큰 유국 보상이고, 모래시계는 그걸 **보유자 의사와 무관하게** 0으로 만든다.
  표준 유국만관(증강 없이도 성립)도 같은 방식으로 12,000이 사라진다(위 표 3행).
- **제안 수정**: 둘 중 하나.
  (a) 모래시계 발동을 액티브(수락/거절)로 바꾼다 — §0 무페널티에도 맞는다.
  (b) 유국만관·유국역만이 성립 중인 국에는 Replace 인터셉터가 통과한다(연장하지 않는다).

---

## 확정 3. 🔴 open_kokushi × mixed_triplet — 그 국이 통째로 벽돌이 된다

- **위치**: 판정 `packages/content/src/augments/open_kokushi.ts:123` (`hasNonKokushiMeld` 이
  후로의 **모양**만 본다) ↔ 덮개 `packages/core/src/mahjong/flow/helpers.ts:243`
  (`kokushiMeldKinds` 는 `m.kind === "kokushi_pon"` 만 센다) ↔ `helpers.ts:247`
  (`kokushiOnly = true` 로 표준형·치또이를 통째로 막는다).
  진입로는 `helpers.ts:259` `sameCallKind` — 동수의 결속이면 1만·1통·1삭이 표준 **펑**이 된다.
- **설명이 약속한 것**: 동수의 결속 — "커쯔의 무늬 제한이 사라진다 … **퐁·깡에 모두 반영된다**".
  우는 국사 — "한 번 부르면 평범한 치·퐁·깡이 전부 막힌다. 반대로 **평범한 치·퐁·깡을 이미 한
  뒤에는 이 퐁을 부를 수 없다**."
- **기대**: 혼색 퐁(1만1통1삭)은 '평범한 퐁'이므로 그 뒤 kokushi_pon 은 **막혀야** 한다.
- **실제**: 혼색 퐁은 모양이 "서로 다른 요구패 3장"이라 `hasNonKokushiMeld` 를 통과한다 →
  kokushi_pon 이 계속 제시된다. 그런데 국사 덮개는 그 퐁을 세지 않으므로 1만·1통·1삭 3종이
  국사에서 영영 빠지고, `kokushiOnly` 가 다른 화료형까지 막는다.

`tsx qa-lab/synergy3/relax/repro_kokushi_mixed.ts` — 손패 7장(동남서북백발중) + 후로 2개

| 셀 | 후로 | kokushiOnly | 텐파이? | 대기 |
|----|------|-------------|---------|------|
| 없음 | pon(1m1p1s) + kokushi_pon(9m9p9s) | false | false | — |
| open_kokushi 만 | 〃 | **true** | **false** | **없음** |
| mixed_triplet 만 | 〃 | false | false | — |
| **둘 다** | 〃 | **true** | **false** | **없음 = 벽돌** |
| (대조) 둘 다 kokushi_pon | kokushi_pon ×2 | true | **true** | 자패 7종 ✓ |

도달 가능성도 실제 액션으로 확인했다 —
`tsx qa-lab/synergy3/relax/repro_kokushi_mixed_path.ts`:

```
① 1삭 버림 → p0 후보: ["pon","kokushi_pon","pass"]   ← 혼색 퐁이 실제로 제시된다
② 혼색 퐁 성립 → melds: ["pon[man1,pin1,sou1]"]
③ 9만 버림 → p0 후보: ["pon","kokushi_pon","pass"]   ← 평범한 퐁 뒤에도 국사 퐁이 뜬다
④ 두 후로 공존 → melds: ["pon","kokushi_pon"]        ← 위 표의 벽돌 상태
```

- **재현**: `tsx qa-lab/synergy3/relax/repro_kokushi_mixed.ts` ·
  `tsx qa-lab/synergy3/relax/repro_kokushi_mixed_path.ts`
- **영향**: 화료·텐파이 모두 불가 + 노텐 벌점 확정. `open_kokushi.ts:104-122` 주석이
  "요구패 중복"과 "평범한 후로"에 대해 **이미 두 번 막아 둔 그 함정**이 세 번째 문으로
  열려 있다. 봇은 커밋 상태면 조건 없이 콜하므로 반드시 밟는다.
- **제안 수정**: `hasNonKokushiMeld` 를 모양이 아니라 `m.kind !== "kokushi_pon"` 으로 판정한다
  (모양이 우연히 국사 묶음인 평범한 퐁도 '평범한 후로'다). 또는 `open_kokushi` 의
  conflicts 에 `mixed_triplet` 을 넣는다.

---

## 확정 4. 🟠 silent_pact × meld_dissolve — "전부 잃는다"던 멘젠이 되살아난다

- **위치**: 멘젠 판정이 전부 **현재 melds 파생**이다 —
  `packages/core/src/mahjong/flow/helpers.ts:162` (`openMeldCountOf`) ·
  `helpers.ts:691` · `packages/core/src/mahjong/scoring/WinContext.ts:272`.
  파혼은 `meld_dissolve.ts` 리듀서 ③에서 melds 배열에서 원소를 지운다.
- **설명이 약속한 것**: 묵계 — "⚠ **이 증강으로 부른 퐁 1회만** 멘젠이 유지된다. 같은 국에
  평범한 퐁·치·대명깡을 하나라도 더 하면 손이 열려 **전부 잃는다**."
- **기대**: 한 번 잃으면 그 국에는 돌아오지 않는다(불가침 조약이 리치·멘쯔 이력을 국 스코프로
  굳혀 두는 것과 같은 취급이어야 한다 — `no_ron_pact.ts` (declaredKey·meldedKey 이력) 가 정확히 그 이유로 이력을 쓴다).
- **실제**: 파혼으로 평범한 퐁을 해체하면 남은 것이 묵계 퐁뿐이라 **그 자리에서 다시 멘젠**이 된다.

`tsx qa-lab/synergy3/relax/repro_menzen.ts`

| 단계 | melds | openMeldCount | 손패 | 판정 |
|------|-------|---------------|------|------|
| 묵계 퐁 + 평범한 퐁 | pon(silent), pon | **1** | 8 | 열린 손 (설명대로) |
| → 파혼으로 평범한 퐁 해체 | pon(silent) | **0** | 11 | **멘젠 — 리치 가능** |

같은 스크립트의 화료 대조군(쯔모):

| 셀 | 역 | 손 점수 |
|----|-----|---------|
| 후로 1개·평범 | 야쿠하이 | 3,000 |
| 후로 1개·묵계 | **멘젠쯔모** + 야쿠하이 | 6,000 |
| 후로 2개·묵계+평범 | 야쿠하이 | 7,800 |

즉 위 표의 마지막 상태(묵계 퐁만 남음)는 **멘젠쯔모가 붙는 손**이다.
부수 효과로 파혼 후보에는 **묵계 퐁도 뜬다**(`meldIndex 0,1` 둘 다) — 묵계로 부른 몸통을
스스로 무를 수 있다. 손패 장수는 8 → 11 로 정확하다(복귀 2 + 패산 보충 1).

- **재현**: `tsx qa-lab/synergy3/relax/repro_menzen.ts`
- **영향**: 두 증강 모두 prism이고 synergy 축이 `call`·`menzen`·`riichi` 로 **완전히 겹친다**
  (`packages/core/src/augment/synergy.ts:206-207`) — 시너지 표가 적극적으로 함께 밀어 준다.
  실전 가치는 "묵계 퐁 + 평범한 퐁으로 두 몸통을 속공으로 세우고, 파혼으로 멘젠 리치 복귀"다.
  묵계의 ⚠ 경고가 이 조합에서는 거짓이 된다.
- **제안 수정**: 묵계 소실을 **이력**으로 굳힌다(국 스코프 플래그 `silent_pact:broken`).
  플래그가 서면 그 국에는 `silent` 표식을 멘젠 판정에서 무시한다. 아니면 설명에
  "파혼으로 되돌리면 멘젠도 함께 돌아온다"를 명시한다.

---

## 확정 5. 🟡 mixed_triplet × silent_pact / bluff_pretense — 혼색 커쯔는 두 커스텀 콜이 못 본다

- **위치**: `silent_pact.ts:49` · `bluff_pretense.ts:73` 의 `matchingIds` 가 `kindKey` **완전
  일치**로만 손패를 센다. 표준 퐁은 `packages/core/src/mahjong/flow/helpers.ts:259`
  `sameCallKind` 를 타서 `scoring.mixedTriplets` 를 존중한다.
- **설명이 약속한 것**: 동수의 결속 — "화료·텐파이·대기 판정과 **퐁·깡에 모두 반영된다**".
  묵계 — "이 증강으로 부른 퐁 1회만 멘젠이 유지된다". 허장성세 — "같은 패가 1장뿐이어도 퐁".
- **기대**: 동수의 결속을 들면 '같은 패'의 정의가 랭크로 바뀌므로,
  1만+1통을 들고 1삭 버림에 **묵계 퐁**이 되어야 하고, 1만 1장만 들고도 **허장성세 퐁**이 되어야 한다.
- **실제**: `tsx qa-lab/synergy3/relax/repro_misc.ts` (S4·S5)

| 손 | 버림 | 증강 | 제시된 후보 |
|----|------|------|-------------|
| 1삭 2장 | 1삭 | 묵계 | `pon`, **`silent_pon`**, pass |
| 1만+1통 | 1삭 | 묵계 | (없음) |
| 1만+1통 | 1삭 | 동수의 결속 | `pon`, pass |
| 1만+1통 | 1삭 | **묵계 + 동수의 결속** | `pon`, pass — **묵계 퐁 없음** |
| 1삭 1장 | 1삭 | 허장성세 | **`bluff_pon`**, pass |
| 1만 1장 | 1삭 | **허장성세 + 동수의 결속** | (없음) |

- **영향**: 동수의 결속이 열어 준 **바로 그 퐁**에서만 묵계가 사라진다 — 홀더는 "혼색 커쯔를
  부르면 손이 열린다"는 것을 설명 어디서도 알 수 없다. 셋 다 `call` 축이다.
- **제안 수정**: 두 `matchingIds` 를 `sameCallKind(state, rules, holder, …)` 기반으로 바꾼다.

---

## 확정 6. 🟡 hourglass × haitei_lord — "유국 시 텐파이면 100% 화료"

- **위치**: `hourglass.ts:134,151` (왕패→패산 이동) × `haitei_lord.ts:71` (TILE_DRAWN 리액션이
  "이 쯔모로 패산이 비었는가"만 본다 — 그 4장은 패산에서 나오므로 영상 쯔모가 아니다).
- **설명**: 어느 쪽 설명에도 상대 증강 이야기가 없다.
- **기대**: 모래시계는 텐파이일 때만 열리고, 해저의 지배자도 텐파이일 때만 터진다 →
  **모래시계가 열리면 그 국은 반드시 해저 화료로 끝난다.**
- **실제**: `tsx qa-lab/synergy3/relax/repro_hourglass_haitei.ts`

| 셀 | 결과 |
|----|------|
| 없음 | 유국 (p0 +15,000, 유국만관) |
| 모래시계만 | 연장 4장 → 화료 못 함, 유국 (p0 +3,000) |
| 해저만 | 유국 (연장이 없으니 해저패가 남의 것) |
| **둘 다** | **p0 화료** — 멘젠쯔모·탕야오·**해저로월** 6판30부 + 해저 +3판 → **+24,000** |

- **영향**: 버그라기보다 **설명에 없는 강력 조합**이다(브리핑의 그 항목). 둘 다 prism·`draw` 축.
  "유국 순간 텐파이"라는 한 조건이 두 증강의 공통 전제라 조합 확률이 사실상 100%다.
- **제안**: 밸런스 판단은 오케스트레이터 몫이지만, 최소한 문구/티어 평가에 반영할 것.

---

## 의심 1. 🟡 always_tenpai 의 "항상 텐파이"가 다른 유국 증강의 조건에는 통하지 않는다

- 승승장구는 `draw.treatAsTenpai` 규칙을 켠다(`always_tenpai.ts:46`) — 표준 정산은 이걸 읽지만
  (`standardActions.ts:1196`), 모래시계(`hourglass.ts:142` `isTenpai(...)`)와
  미련(`regret.ts` `menzenTenpai`)은 **실제 손**만 본다.
- 실측(`tsx qa-lab/synergy3/relax/repro_draw.ts` ⑥⑦⑨): p0 노텐 + 승승장구 →
  `tenpaiPlayers: ["p0"]` · 연장(오야 렌짱) 적용 · 그런데 모래시계는 발동하지 않고 미련도
  손을 보존하지 않는다.
- 어느 쪽이 옳은지는 설계 판단이다("항상 텐파이로 **취급**"의 범위). 다만 같은 축(`draw`)에
  모아 둔 넷 사이에서 취급이 갈리므로 문구에 한 줄이 필요하다. **확정으로 올리지 않는다.**

## 의심 2. 🟡 avenger 의 "+2판"만 상대가 실제로 더 낸다

- `avenger.ts:72` 는 `addHanBonus`(= `score.extraHan`) 를 쓴다 — 이 값은
  `standardActions.ts:929` 에서 `totalHan` 에 들어가 **손 점수 자체**를 올린다.
  같은 문구를 쓰는 나머지 셋(`iron_wall`·`yakuless_win`·`late_bloomer`·`haitei_lord`·
  `open_riichi_reveal`)은 전부 뱅크 발행이라 상대 부담이 늘지 않는다
  (`util.ts:937` 주석: "판을 올렸지만 **상대가 더 내지는 않는다**(§0 무페널티)").
- 실측(`repro_yakuless.ts` ③): 원수 p1 에게 역 0개 론 —
  복수자만: p0 +12,000 / **p1 −12,000** (기본 손 2판40부 3,900 → 4판40부 12,000).
  철벽만(같은 +3판): p0 +12,000 / p1 **−3,900** (차액 8,100 은 뱅크).
- 즉 같은 "+N판" 표기로 방총자 부담이 **8,100점** 갈린다. 의도적 예외일 수 있어 의심으로 둔다.

---

## 음성 확인 (돌려 봤고 깨끗했다)

| 조합 | 기대 | 실제 | 판정 |
|------|------|------|------|
| always_tenpai × nagashi_yakuman | 두 유국 정산이 **더해진다** (홀더 +9,000+48,000, 상대 각 −19,000, 합 0) | p0 +57,000 / 각 −19,000 / 합 0 | ✅ `repro_draw.ts` ④ |
| always_tenpai × nagashi (불성립 국) | 유국역만만 빠지고 승승장구는 그대로 | p0 +9,000 / 각 −3,000 | ✅ ⑤ |
| always_tenpai 오야 연장 | 텐파이 취급이면 렌짱 | `dealerContinues: true` | ✅ ② |
| always_tenpai 노텐 판정 | `tenpaiPlayers` 기준이라 텐파이 상대에게서 2,000을 뜯지 않는다 | 노텐 3인에게서만 6,000 | ✅ ② |
| hourglass + always_tenpai + nagashi (3중) | 연장 후 2차 유국에서 나머지 둘이 정상 정산 | 2차 유국 p0 +57,000 / 합 0 · 무한 연장 없음 | ✅ `repro_draw.ts` ⑩ |
| regret × always_tenpai (실제 노텐) | 손 보존 안 됨 | 보존 없음 | ✅ ⑨ |
| omni_chi × broken_border | 둘 다 있어야 대면의 3통을 2만+4삭으로 치할 수 있다 | 없음/각각=후보 0, 둘 다=`chi` 2종(man2+sou4 · sou4+pin5) | ✅ `repro_misc.ts` S3 |
| no_ron_pact × silent_pact | 묵계 퐁도 조약 파기 | `win.ronImmune` true → **false** | ✅ S2 |
| reload × 이 축 전부 | 국 스코프·쿨다운형은 후보에 안 뜬다 | 묵계·파혼·허장성세·모래시계·핏빛계약 전부 소진시켜도 `reload_use` 후보 **0개** | ✅ S1 |
| cornucopia 지급 (120시드 ×3 스테이지) | 보유 conflicts·테이블 중복·모드·스테이지 전부 걸러진다 | 위반 0. avenger 보유 시 late_bloomer 0회, reload 는 southThird 에서만 4회, 스테이지 표식 없으면 0회 | ✅ `repro_cornucopia.ts` |
| silent_pact × open_riichi_reveal (+ open_riichi) | 묵계로 멘젠이 유지되니 오픈 리치는 선언 가능하고, 개문선언 몫은 0이어야 | ⑥ 5판+2판=18,000 / ⑦ 개문선언을 더 들어도 18,000 그대로 | ✅ `repro_openriichi.ts` |
| late_bloomer ↔ avenger conflicts | 같이 못 든다 | 카탈로그 양쪽에 ⚠ 표기 · `avenger.ts:66` conflicts | ✅ 코드 확인 |
| "+N판은 역만에 미적용" | 역만 화료엔 0판 | `winPointsWithExtraHan` 이 `yakumanCount` 를 그대로 넘겨 차액 0 | ✅ 코드 확인(측정 안 함) |

## 스크립트

전부 `/Users/skul/majak/.claude/worktrees/augment-qa-testing-550e60/qa-lab/synergy3/relax/` 아래.

- `lib.ts` — 공용 하네스(craft 래핑 · 다중 증강 설치 · 화료/유국 정산 실행)
- `repro_han_stack.ts` · `repro_yakuless.ts` · `repro_openriichi.ts` — 확정 1
- `repro_hourglass_nagashi.ts` — 확정 2
- `repro_kokushi_mixed.ts` · `repro_kokushi_mixed_path.ts` — 확정 3
- `repro_menzen.ts` — 확정 4
- `repro_misc.ts` — 확정 5 + 음성(S1 reload · S2 조약 · S3 치)
- `repro_hourglass_haitei.ts` — 확정 6
- `repro_draw.ts` · `repro_cornucopia.ts` — 유국 축·지급 음성 확인
