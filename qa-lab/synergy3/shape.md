# 화료형 확장 · 역만 — shape

담당 축: `broken_border` `mixed_triplet` `broken_wall` `polar_ends` `wind_lineage` `joker`
`async_chiitoi` `true_dragon` `tanyao_break` `even_world` `royal_kokushi` `open_kokushi`
`giant_god` `mixed_nine_gates` `three_dragons_will` `genesis` `nagashi_yakuman`
`yakuman_shield` `suit_unify` `tile_dyeing` `iron_wall` `yakuless_win` `late_bloomer(_east)`

## 요약

검증한 조합 **56쌍/삼중** (채점 42 · 후로 validate 8 · 정산 6) / **확정 4건 · 의심 5건 · 음성 확인 24건**

| # | 심각도 | 조합 | 한 줄 |
|---|---|---|---|
| 확정 1 | 🟠 | `open_kokushi` × `royal_kokushi` | 특수 퐁을 한 순간 왕의 징표가 **완전히 죽는다** — 조커는 통하는데 중복만 안 통한다 |
| 확정 2 | 🟠 | `polar_ends` × `mixed_triplet` | 어느 카드로도 몸통이 아닌 **잡종 펑 {1만,9만,1통}** 이 열리고 몸통으로 채점된다 |
| 확정 3 | 🟠 | `giant_god` × `nagashi_yakuman` | 각성이 버림 이력을 갈아 끼워 **유국역만 48,000이 0**이 된다 |
| 확정 4 | 🟠 | `joker` × `royal_kokushi` | 조커가 요구패 **3종**까지 메우고 **국사13면 = 더블 역만(96,000)** 으로 승격. 같은 일을 하는 왕의 징표는 1종·1역만이고, 함께 들면 왕의 징표는 무효 |

> ⚠ 해제 3종(`iron_wall`·`yakuless_win`·`late_bloomer`)의 **+판 보너스 중복 지급/합산 오차**는
> 내가 독립적으로 재현했지만 **이미 `qa-lab/synergy3/relax.md` 확정 1이 같은 것을 보고했다.**
> 여기서는 다시 세지 않는다. 내 재현본은 `qa-lab/synergy3/shape/repro_release.ts` 이고
> 숫자는 relax 쪽과 일치한다(오야 역 0개 론: 3,900 → 무형만 12,000 / 무형+대기만성 20,100 /
> 무형+철벽+대기만성 **28,200**, 정상적인 +8판이면 24,000).

---

## 확정 1. 🟠 open_kokushi × royal_kokushi — 특수 퐁을 부르는 순간 왕의 징표가 아무 일도 안 한다

- **위치**: `packages/core/src/mahjong/scoring/decompose.ts:734` (`meldKokushiPairOf`) ·
  `:955-968` (울어 국사 분기). 닫힌 국사 분기(`:934-937`)는 `kokushiPairOf(filled, kokushiDupes)`
  로 **중복 허용치를 읽는데**, 울어 국사 분기는 `meldKokushiPairOf(...)` 만 부르고
  `kokushiDupes` 를 **전달하지 않는다** — 그 안의 판정은 `handDistinct.size + meldSet.size === 13`
  으로 13종 전부를 강제한다.
- **설명이 약속한 것**:
  - 왕의 징표: "(상시) 국사무쌍은 요구패 13종을 **모두 갖추지 않아도** 성립한다."
    (조건도 예외도 붙어 있지 않다.)
  - 우는 국사: "서로 다른 요구패 3장을 퐁해 국사를 완성할 수 있다 … 완성 시 **정식 역만 13판**."
  - 둘 다 `conflicts` 가 **없고**(`open_kokushi.conflicts === undefined`,
    `royal_kokushi.conflicts === undefined`), `packages/core/src/augment/synergy.ts:241-242`
    는 둘을 같은 `kokushi` 축으로 묶어 **드래프트가 함께 밀어 준다**.
- **기대**(미리 적음): 퐁 3종 + 손패 9종 + 중복 머리(= 한 종류가 빠진 손)도 역만 13판.
- **실제**: 화료형 자체가 성립하지 않는다.

| 장면 (퐁 `1m1p1s`, 손패 11장) | 없음 | 우는 국사 | 왕의 징표 | 우는 국사+왕의 징표 |
|---|---|---|---|---|
| 13종 전부 (`9m9p9s 東南西北 白發中` + 9m 중복) | 화료형 아님 | **48,000** `kokushi_open(13)` | 화료형 아님 | 48,000 (변화 없음) |
| 北이 빠지고 9m·9p 중복으로 메움 | 화료형 아님 | 화료형 아님 | 화료형 아님 | **화료형 아님** ← 여기 |
| (대조) 후로 없는 14장, 北 빠짐 + 중복 | 화료형 아님 | — | **48,000** `kokushi(13)` | — |
| (대조) 우는 국사 + 조커 — 白 2장이 北·白을 메움 | 화료형 아님 | 화료형 아님 | — | **48,000** `kokushi_open(13)` |

  마지막 줄이 핵심이다 — **울어 국사 분기는 조커(`forEachOrphanFill`)는 받는데
  중복(`kokushiDupes`)만 안 받는다.** 즉 "빠진 자리를 메운다"는 같은 개념 중
  한쪽만 배관이 이어져 있다.
- **재현**: `tsx qa-lab/synergy3/shape/repro_kokushi.ts`
- **영향**: 두 증강은 같은 `kokushi` 시너지 축이라 드래프트에서 자주 함께 뜬다.
  보유자는 "13종을 다 안 모아도 된다"고 읽고 12종에서 퐁을 부르는데, 그 순간
  `kokushiOnly` 가 표준형·치또이까지 닫으므로 **그 국은 화료가 원리적으로 불가능한 벽돌**이 된다
  (우는 국사 단독의 벽돌 함정과 같은 형태 — `relax.md` 확정 3의 이웃 사례).
- **제안 수정**: `scoringOptionsOf` 가 이미 `kokushiDupes` 를 옵션에 싣고 있으므로
  `meldKokushiPairOf` 에 `kokushiDupes` 를 넘겨 `handDistinct.size + meldSet.size >= 13 - dupes`
  로 완화한다(머리 판정은 그대로). 그게 부담되면 `royal_kokushi.conflicts` 에
  `open_kokushi` 를 넣고 카드에 "울어 국사와는 함께 가질 수 없다"를 적는다.

---

## 확정 2. 🟠 polar_ends × mixed_triplet — 어느 쪽 규칙으로도 몸통이 아닌 펑이 열린다

- **위치**: `packages/core/src/mahjong/flow/standardActions.ts:400-409` (`ponAction.validate`) ·
  `packages/core/src/mahjong/flow/helpers.ts:259-283` (`sameCallKind`).
  validate 가 보는 것은 **버려진 패에 대한 두 번의 1:1 비교**뿐이다:
  `sameCallKind(a, target) && sameCallKind(b, target)`. 두 증강을 함께 들면
  `sameCallKind` 안에서 서로 다른 두 규칙이 OR 로 묶이므로, `a` 는 양극 규칙으로
  `b` 는 결속 규칙으로 각각 통과해 **세 장이 한 규칙 안에서 닫히지 않는다.**
- **설명이 약속한 것**:
  - 양극: "같은 무늬의 199·911도 한 커쯔다 … 같은 무늬의 노두패 두 장을 들고 있으면
    상대가 버린 1이나 9를 퐁할 수도 있다." (**같은 무늬** 한정)
  - 동수의 결속: "1만·1통·1삭도 하나의 커쯔다 … 퐁·깡에 모두 반영된다." (**같은 랭크** 한정)
- **기대**(미리 적음): `{1만, 9만, 1통}` 은 랭크도(1·9·1) 무늬도(만·만·통) 안 맞으므로 **거부**.
- **실제**: 허용된다.

| 1만 버림 / 손패 두 장 | 없음 | 양극 | 결속 | **양극+결속** |
|---|---|---|---|---|
| 9만·9만 (양극 정상) | 거부 | **허용** | 거부 | 허용 |
| 1통·1삭 (결속 정상) | 거부 | 거부 | **허용** | 허용 |
| **9만·1통 (잡종)** | 거부 | 거부 | 거부 | **허용** ← |
| **9만·1삭 (잡종2)** | 거부 | 거부 | 거부 | **허용** ← |

  그 잡종 펑을 들고 화료하면 **몸통으로 그대로 채점된다**
  (`{1m,9m,1p}` 펑 + `777z` 펑 + `234m 567m 99p` → `han=3 fu=40 :: yakuhai_chun(1)`,
  정상 양극 펑 `{1m,9m,9m}` 과 결과가 동일).
- **재현**: `tsx qa-lab/synergy3/shape/repro_pon.ts` · `tsx qa-lab/synergy3/shape/repro_pon2.ts`
- **영향**: 두 증강 모두 prism·`shape` 축이고 `conflicts` 가 없다. 함께 들면 버려진 노두패에 대해
  "같은 무늬 노두 한 장 + 같은 랭크 아무 무늬 한 장" 이라는, 어느 카드에도 없는 넓은 퐁이
  상시 열린다. 상대는 두 카드를 다 읽어도 이 퐁을 예측할 수 없다(정보 비대칭).
- **제안 수정**: `ponAction.validate` 가 세 장(`target`,`a`,`b`)을 **하나의 규칙으로** 검사하도록
  바꾼다 — 예: `isPolarBody([t,a,b]) || isMixedRankBody([t,a,b]) || isPureTriplet([t,a,b])`.
  `FlowController` 의 후보 생성(`:494`)도 같은 함수를 봐야 한다.

---

## 확정 3. 🟠 giant_god × nagashi_yakuman — 각성이 유국역만을 스스로 지운다

- **위치**: `packages/content/src/augments/giant_god.ts:250-276` (각성 리듀서 ③ — 버림 이력 재작성):
  요구패 이력을 **전부 지우고**, 바닥으로 내려보내는 손패 13장 중 **요구패가 아닌 것만** 이력에 넣는다.
  `packages/content/src/augments/nagashi_yakuman.ts:75-79` (`nagashiValid`) 는 바닥이 아니라
  그 `discardedKinds` 이력을 본다.
- **설명이 약속한 것**:
  - 거신병: "조건: **국사무쌍 13종을 내가 직접 전부 버려 둬야 한다.**" (13종은 전부 요구패다)
  - 유국역만: "유국까지 요구패(1·9)와 자패만 버렸다면 유국만관이 역만이 된다."
  → 두 조건은 **포함 관계**다. 거신병을 켤 수 있는 판은 곧 유국역만이 서 있는 판이다.
    각성이 그것을 없앤다는 말은 **어느 카드에도 없다.**
- **기대**(미리 적음): 각성해도 "내가 버린 패는 전부 요구패였다"는 사실은 변하지 않으므로
  유국이 오면 유국역만이 그대로 성립한다.
- **실제**:

| 장면 (p0 = 오야, 바닥 = 국사 13종, 손패 = 요구패 없는 13장) | deltas | 유국 특수 |
|---|---|---|
| 각성 **전** 유국 | `p0 +48,000 / 나머지 각 −16,000` | 유국역만 |
| 각성 **후** 유국 | `전원 0` | 없음 |

  각성 후 `discardedKinds` = `man2 man3 man4 man5 man6 man7 pin2 … sou4`
  (요구패 이력은 통째로 삭제되고, 내려보낸 손패의 중장패가 들어왔다).
- **재현**: `tsx qa-lab/synergy3/shape/repro_god_nagashi.ts`
- **영향**: 거신병은 요구패를 12순 넘게 흘려야 켜지므로 **각성 시점이 국의 끝자락**이다 —
  각성 다음 순의 쯔모가 오기 전에 패산이 마르거나 남이 화료하는 구간이 실전에서 좁지 않다.
  그때 48,000(오야 기준)이 통째로 사라지고, 플레이어에게는 아무 설명도 남지 않는다.
  (요구패 이력 삭제 자체는 "13면 후리텐을 푼다"는 정당한 목적이 있으므로 되돌리면 안 된다.)
- **제안 수정**: 각성 시 `nagashi_yakuman` 판정용 스냅샷을 따로 남긴다 —
  예: `augmentDataSet(giant_god:pondWasAllOrphans:<국>:<holder>, true)` 를 각성 이벤트에 함께 내고,
  `nagashiValid` 가 `이력 전부 요구패 || 그 표식` 으로 읽는다. 최소 변경은 카드에
  "각성하면 유국역만은 성립하지 않는다"를 명시하는 것.

---

## 확정 4. 🟠 joker × royal_kokushi — 조커는 3종을 메우고 더블 역만까지 주는데, 왕의 징표는 1종·1역만이고 겹치면 죽는다

- **위치**: `packages/core/src/mahjong/scoring/decompose.ts:709-722` (`forEachOrphanFill`) ·
  `:725-731` (`kokushiPairOf`) · `:930-940` (닫힌 국사 분기).
  조커는 `real` 에서 빠져 **장수로만** 남고, 국사 분기가 그 장수만큼 요구패 13종을 자유롭게 채운다.
  채운 결과가 "13종 + 한 종류 2장" 이면 표준 국사가 되고, 대기 판정이 그 손을 **13면 대기**로 보아
  `kokushi_13`(**26판 = 더블 역만**)이 붙는다.
- **설명이 약속한 것**:
  - 조커: "손을 가장 비싸게 만드는 패로 알아서 변한다."(무엇이 되는지에만 자유를 준다)
  - 왕의 징표: "**없는 한 종류**의 요구패는 다른 요구패의 중복으로 대신할 수 있다."(1종)
- **기대**(미리 적음): 조커가 메운 국사는 표준 국사(1역만)여야 한다 — 조커는 **빈자리를 메우는**
  물건이지 "13종을 다 모으고 13면으로 기다렸다"는 사실을 만들어 주는 물건이 아니다.
  왕의 징표가 12종+중복에서 `kokushi(13)` 에 머무는 것이 이 게임의 이미 확인된 기준선이다
  (`qa-lab/findings/shape.md:167`).
- **실제**:

| 손패 14장 | 없음 | 조커(발동) | 왕의 징표 | 조커+왕의 징표 |
|---|---|---|---|---|
| 요구패 12종 + 9m 중복 (北 없음) | 화료형 아님 | 화료형 아님 | **48,000** `kokushi(13)` | 48,000 |
| 실물 11종 + 白 3장 (北·白 결손) | 화료형 아님 | **96,000** `kokushi_13(26)` | 48,000 `kokushi(13)` | **96,000** |
| 실물 **10종** + 白 4장 (3종 결손) | 화료형 아님 | **96,000** `kokushi_13(26)` | — | **96,000** |
| (대조) 진짜 13종 + 中 중복 | 96,000 `kokushi_13(26)` | 96,000 | 96,000 | 96,000 |

  · 조커는 **요구패 3종까지** 메운다(왕의 징표는 1종).
  · 조커가 메운 국사는 **항상 13면(더블)** 로 승격된다(왕의 징표는 승격되지 않는다).
  · 그래서 둘을 함께 들면 왕의 징표는 **한 번도 결과를 바꾸지 못한다**(조용한 삼킴).
- **재현**: `tsx qa-lab/synergy3/shape/repro_joker_kokushi.ts` (표 그대로) ·
  `tsx qa-lab/synergy3/shape/repro_joker.ts` A2
- **영향**: 白 4장을 모으는 것이 조건이라 빈도는 낮지만, 조커는 "백을 모으는" 것이 정상 플레이라
  도달 불가능하지 않다. 한 번 터지면 48,000이 아니라 96,000이고, 같은 축의 왕의 징표는
  뽑아도 죽은 픽이 된다.
- **제안 수정**: `kokushi_13` 판정에서 **조커가 메운 종류를 대기 계산에 넣지 않는다**
  (조커 fill 로 완성된 국사는 `kokushi`(단일 역만)로 고정). 왕의 징표와 같은 기준선이 된다.

---

## 의심

### 의심 1. 🟡 broken_border × broken_wall — 카드 어디에도 없는 "혼색 순환 슌쯔"가 생긴다
`decompose.ts:530-560` 의 슌쯔 후보 생성에서 `wrap`(랭크 순환)과 `mixed`(무늬 무시)가
**독립 축으로 곱해진다**. 그래서 `9만·1통·2삭` 이 한 몸통이 된다.
대조군: 없음/국경/윤회 전부 화료형 아님 → **A+B만 3,000점 화료**
(`repro_pairs1.ts` #2). 자연스러운 합성이지만 두 카드 어느 쪽도 "무늬가 섞인 순환"을
말하지 않는다(국경은 "숫자만 연속", 윤회는 "슌쯔가 원을 그린다"). 문구 보강 대상.
**확정으로 올리지 않은 이유**: 규칙 합성으로서 모순이 없고 값도 크지 않다.

### 의심 2. 🟡 mixed_nine_gates × broken_border/broken_wall/wind_lineage — 뼈대 구간에 후로가 통째로 닫힌다
연꽃은 손이 구련 뼈대(±1장) 위에 있는 동안 보유자의 `call.pon/chi/kan` 을 전부 끈다
(`mixed_nine_gates.ts:150-175`). 함께 든 국경(치)·계보(치·안깡)는 그 구간에서
**혼색 치뿐 아니라 동색 치까지** 잃는다.

| 4s/7s/1s 버림 | 국경만 | 연꽃만 | 국경+연꽃 |
|---|---|---|---|
| 뼈대 위 · 혼색 치(3m+4p) | 허용 | `chi is disabled` | `chi is disabled` |
| 뼈대 위 · **동색 치(8s+9s)** | 허용 | `chi is disabled` | **`chi is disabled`** |
| 평범한 손 · 혼색 치 | 허용 | 거부 | 허용 |

연꽃 카드는 그 차단을 적어 두었지만 국경·계보 카드는 "치 전부에 적용된다"고 적는다.
재현: `tsx qa-lab/synergy3/shape/repro_ng_calls.ts`.
**의심으로 둔 이유**: 한쪽 카드에는 명시돼 있어 "설명 없음"이라 단정하기 어렵다.

### 의심 3. 🟡 joker × mixed_triplet / polar_ends — 백 한 장이 더블 역만을 만든다
조커는 화료 순간 가장 비싼 변형을 채택하는데, 혼색 커쯔(결속)·노두 커쯔(양극)가
열려 있으면 조커가 그 몸통의 빈자리를 메워 **스안커단기(26판)** 가 된다.

| 손 | 없음 | 조커 | 결속 | 조커+결속 |
|---|---|---|---|---|
| `1m1p白 2m2p2s 3m3p3s 444m 99m` | 화료형 아님 | 6,000 (`sanshoku`) | 화료형 아님 | **96,000** `suuankou_tanki(26)` |
| `199m199p 1s9s白 111z 22z` (양극) | 화료형 아님 | 화료형 아님 | 화료형 아님(양극만도) | **96,000** |

각 카드 단독으로는 전부 "의도된 설계"로 문서화돼 있다(양극 헤더의 2026-08-03 확정,
결속 헤더의 또이또이·산안커 유지). 겹쳤을 때의 도달 난이도만 급락한다 — 밸런스 판단 필요.
재현: `tsx qa-lab/synergy3/shape/repro_joker.ts` D·D2.

### 의심 4. 🟡 joker × mixed_nine_gates — 조커는 연꽃의 뼈대를 못 메운다 (반대 방향의 조용한 삼킴)
연꽃의 `onNineGatesPath` 는 `winHandKindsOf` 의 **물리적 손패**가 전부 수패일 것을 요구한다
(`mixed_nine_gates.ts:107-124`). 손에 白(조커)이 한 장이라도 있으면 그 게이트가 닫혀
무늬 무시 규칙 자체가 안 켜지고, 화료형조차 서지 않는다.

| `11m1p2s3m4p5s6m7p8s9m9p白 + 5m` | 없음 | 조커 | 연꽃 | 조커+연꽃 |
|---|---|---|---|---|
| 결과 | 화료형 아님 | 화료형 아님 | 화료형 아님 | **화료형 아님** |
| (대조) 白 대신 진짜 9s | — | — | 48,000 `mixed_nine_gates(13)` | — |

조커 카드("손을 가장 비싸게 만드는 패로 알아서 변한다")만 읽으면 예측할 수 없다.
카드 문구("화료형 14장이 모두 수패여야")로 방어할 수는 있으나, 조커가 이미 수패로 **변한**
손이라 해석이 갈린다. 재현: `tsx qa-lab/synergy3/shape/repro_joker.ts` C.

### 의심 5. 🟡 nagashi_yakuman 두 명 — 결과 화면 부제가 한 명만 남는다
두 좌석이 동시에 유국역만이면 지불은 양쪽 다 정상 적용되는데
(`p0 +33,000 / p1 +17,000 / p2 −27,000 / p3 −23,000`, 합 0),
`drawSpecial` 은 나중에 도는 인터셉터가 **덮어써서 p1 하나만** 남는다
(`nagashi_yakuman.ts:150-157`). 화면에는 32,000이 두 번 오간 근거가 한 줄만 뜬다.
재현: `tsx qa-lab/synergy3/shape/repro_nagashi.ts` ③.

---

## 음성 확인 (돌려 봤고 깨끗했다)

| 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|
| `broken_border` × `mixed_triplet` | 슌쯔/커쯔로 담당이 갈려 합집합. 판 이중 없음 | A+B만 화료형 성립(7,800), 역은 한 번씩만 | ✅ |
| `broken_wall` 단독 (891 슌쯔 3벌) | 삼색동순·일기통관이 헛성립하지 않는다 | `menzen_tsumo` 만. 헛성립 없음 | ✅ |
| `polar_ends` × `mixed_triplet` (**채점**) | 1만9만1통 같은 잡종 몸통은 분해에 없다 | 없다(분해는 규칙별로 닫혀 있다) — 문제는 **펑 validate** 뿐(확정 2) | ✅ |
| `polar_ends` × `tanyao_break` (청노두) | 역만이면 탕야오해방 판수는 무시 | `suuankou+chinroutou` 96,000, extraHan 0 | ✅ |
| `polar_ends` × `tanyao_break` (비역만) | 준찬타와 탕야오해방이 **동시에** 붙는다(소스가 의도 명시) | `junchan(3)+tanyao_break(2)` 24,000 | ✅ 의도대로 |
| `broken_wall` × `tanyao_break` | 891 슌쯔 손에도 같은 규칙 | `junchan(3)+tanyao_break(2)` 18,000 | ✅ |
| `async_chiitoi` × `mixed_triplet` | 같은 패 3장이면 치또이가 아니라 일반 손 | 치또이 불성립, 표준형도 안 서면 화료형 아님 | ✅ |
| `async_chiitoi` × `polar_ends` | 1만+9만은 치또이 짝이 아니다 | 아니다 | ✅ |
| `async_chiitoi` × `broken_border`/`broken_wall` | 치또이와 표준형이 겹치면 비싼 쪽만 채택 | 겹쳐도 판이 더해지지 않는다 | ✅ |
| `wind_lineage` × `async_chiitoi` | 자패 슌쯔 손과 치또이 중 비싼 쪽 | 계보 쪽 24,000 채택, 치또이 2판이 얹히지 않음 | ✅ |
| `wind_lineage` × `broken_border` | 자패 슌쯔 + 수패 혼색 슌쯔는 독립 | 독립. 역패 3종 각 1판만 | ✅ |
| `wind_lineage` × `broken_wall` | 북동남(4-1-2) 순환 바람 슌쯔는 서지 않는다 | 서지 않는다 | ✅ |
| `wind_lineage` × `mixed_triplet` | 자패에는 무늬가 없으므로 결속이 관여하지 않는다 | 관여 안 함 | ✅ |
| `wind_lineage` (대삼원 손) | 백발중 슌쯔 1판이 역만에 덧붙지 않는다 | `daisangen(13)` 단독 채택 | ✅ |
| `royal_kokushi` × `async_chiitoi` | 노두 7쌍은 치또이일 뿐 국사가 아니다 | 치또이+혼노두 12,000 | ✅ |
| `royal_kokushi` × `polar_ends` | 국사 분해에 양극이 끼지 않는다 | 안 낀다 | ✅ |
| `mixed_nine_gates` × `broken_border`/`mixed_triplet`/`async_chiitoi`/`tanyao_break` | 역만은 **1개**, 판이 겹치지 않는다 | 전부 `mixed_nine_gates(13)` 48,000 고정 | ✅ |
| `mixed_nine_gates` × `wind_lineage` | 자패가 한 장이라도 있으면 연꽃 불성립 | 불성립 | ✅ |
| `true_dragon` × `broken_border`/`mixed_triplet`/`polar_ends`/`broken_wall`/`wind_lineage`/`tanyao_break`/`joker` | 17장 5멘쯔에도 그대로 얹히고 +3판 | 전부 정상(예: 혼색 5멘쯔 24,000, 조커 5멘쯔 24,000) | ✅ |
| `true_dragon` × `late_bloomer` (정산) | `score.extraHan(+3)` 과 뱅크 보너스(+3)가 **이중 계산되지 않는다** | 24,000(9판) → +12,000(뱅크) = 36,000. 한계 판수 기준 정확 | ✅ |
| `true_dragon` 역만 손 | 역만이면 +3판 무시 | `extraHan` 0 적용 | ✅ |
| `yakuman_shield` × `polar_ends`/`mixed_nine_gates`/`royal_kokushi` (다른 좌석) | 낸 몫 전액 환급 · 본장·공탁 부담은 남는다 | 쯔모 −32,000→0, 론 직격 −48,000→0, 1본장이면 −100 잔존 | ✅ |
| `yakuman_shield` × `nagashi_yakuman` | 방어자는 면제되고 **화료자 수령은 줄지 않는다**(뱅크) | p0 +48,000 유지, 합계 드리프트 +16,000/+32,000/+48,000 | ✅ 설계대로 |
| `suit_unify` × `mixed_nine_gates` | 통일하면 무늬 1종 → 연꽃(2종 요구)이 죽고 표준 구련이 대신 | `chuuren_junsei(26)` 96,000. 역만 중복 없음 | ✅ |
| `suit_unify` × `tile_dyeing` (같은 국 연속) | 손패 장수 불변, 국당 1회 제한은 각자 | 14→14장, 단색 2회차 거부, 염색은 별도 카운터 | ✅ |
| `suit_unify` × `async_chiitoi` | 랭크 짝이 진짜 짝이 되며 판이 정상 재계산 | `ryanpeiko+chinitsu` 12판 | ✅ |
| `even_world` × `tanyao_break` | 1·9가 사라지면 해방 탕야오가 아니라 표준 탕야오 (카드에 명시) | 명시대로. 손 자체가 깨지는 것은 발동자 책임 | ✅ 문서대로 |
| `three_dragons_will` × `genesis` × `even_world` (같은 국 연쇄) | 손패 장수 불변 | 14장 유지 (셋 다 발동해도) | ✅ |
| `giant_god` × `three_dragons_will` | 각성 뒤에는 잡패가 없어 의지가 재발동되지 않는다 | 재발동 거부, 국사 13면 유지 | ✅ |
| `joker` 쿨다운 × `even_world` 쿨다운 | "2국에 1회" 키를 공유하지 않는다 | `cooldownUsedKey(augmentId, holder)` 로 분리됨 | ✅ |
| `suit_unify` / `genesis` / `three_dragons_will` 매치 횟수 | `<id>:uses:<holder>` 로 분리 | 분리됨 | ✅ |

### 곁가지 (확정도 의심도 아님, 기록만)

- `iron_wall` · `yakuless_win` 은 `packages/core/src/augment/standardAugments.ts` 에 있고
  **`qa-lab/synergy3/catalog.tsv`(113종)에는 없다.** 카탈로그가 content 전용이라 core 표준
  증강 3종(철벽·개문선언·무형화료)이 빠져 있다 — 다음 라운드의 자료 정비 대상.
- `standardAugments.ts` 의 증강들은 **`conflicts` 를 하나도 선언하지 않는다.**
  `avenger` 가 "둘 다 후리텐·무역 해제를 열어 통째로 중복된다"는 이유로
  `late_bloomer`(+동풍전판)와 conflicts 로 묶여 있는데, **똑같은 것을 하는 `iron_wall`·
  `yakuless_win` 에는 그 선언이 없다.** (수치 피해는 `relax.md` 확정 1이 이미 보고했다.)
- `three_dragons_will`·`even_world` 는 손패 kind 를 제자리에서 덮어써 **같은 종류가 게임에
  5~7장** 존재하게 만든다(실측: 의지 1회 → 中 6장, 여기에 짝수의 세계까지 쓰면 5종이 4장 초과).
  단독 증강의 `conjured` 규약이라 이 라운드의 시너지 결함으로 세지 않았지만,
  상대의 잔여 장수 계산·안전패 읽기가 그만큼 틀어진다.

## 재현 스크립트

| 파일 | 내용 |
|---|---|
| `qa-lab/synergy3/shape/lib.ts` | 공용 — `measure`(채점 4칸 표) · `settle`(sys.settleWin 정산) · `waitsOf` · `jokerOnData` |
| `repro_pairs1.ts` · `repro_pairs2.ts` | 모양 확장 쌍/삼중 32건 대조군 표 |
| `repro_joker.ts` · `repro_joker_kokushi.ts` | 조커 × 국사·치또이·연꽃·양극·결속·계보 (확정 4 · 의심 3·4) |
| `repro_kokushi.ts` | 우는 국사 × 왕의 징표 × 조커 (**확정 1**) |
| `repro_pon.ts` · `repro_pon2.ts` | 양극 × 결속 펑 validate (**확정 2**) |
| `repro_god_nagashi.ts` | 거신병 × 유국역만 (**확정 3**) |
| `repro_nagashi.ts` | 유국역만 × 역만 방어술 · 유국역만 2인 (의심 5) |
| `repro_settle.ts` | 역만 방어술 × 역만 증강 정산 · +판 재원 비교 |
| `repro_dragon.ts` | 진짜 용 × 6종 + 대기만성 extraHan 합산 |
| `repro_color.ts` | 단색 세계 · 염색 × 연꽃/국경/비대칭 |
| `repro_handbuild.ts` | 삼원의 의지 · 개벽 · 짝수의 세계 · 거신병 연쇄 (손패 장수) |
| `repro_ng_calls.ts` | 연꽃의 후로 차단 × 국경/윤회 (의심 2) |
| `repro_release.ts` | 해제 3종 +판 중복 — **relax.md 확정 1과 중복**, 교차 검증용 |
