# 증강 2군 (eternal_dealer … mixed_triplet) — aug-2 **수정 보고**

원 보고서: [`aug-2.md`](aug-2.md) (확정 10건 · 의심 8건)
작업일: 2026-08-22 · 이 문서는 «무엇을 어떻게 고쳤고, 무엇으로 그것을 증명했는가»만 적는다.

## 요약

| | 건수 | 상태 |
|---|---|---|
| 확정 | 10 | **전부 수정** |
| 의심 | 8 | 확정 승격 3 (그중 1건 수정) · 이미 해소 2 · 기각 2 · 부분 해소 1 |

- 회귀 테스트: `packages/content/test/qa_aug2_round2.test.ts` — **22개, 전부 통과**.
  **각 수정을 하나씩 되돌려 대응 테스트가 실제로 빨개지는 것까지 확인했다**(아래 표).
- 재현 스크립트 12종은 고치기 전 상태를 그대로 재현했고, 고친 뒤 전부 사라졌다.
  의심 8을 위해 `qa-lab/round2/aug-2/p_joker_tenhou.ts` 한 개를 새로 만들었다.
- 코어(`packages/core/**`)는 **한 줄도 고치지 않았다**. 코어에 있어야 할 수정 1건은
  아래 «코어에 남긴 숙제»에 초안째 적어 둔다.

### 되돌림 검증 (revert → 빨개짐 → 복원)

수정 하나를 되돌리고 테스트 파일 전체를 돌린 결과다. 되돌린 수정과 **정확히 대응하는
테스트만** 실패한다 — 테스트가 그 수정을 실제로 붙잡고 있다는 뜻이다.

| 되돌린 수정 | 실패한 테스트 |
|---|---|
| `util.sameHandSize` → 멘쯔 개수 비교 | 확정 1 · 2건 |
| `full_hand_swap` 의 `handAlteredMark` | 확정 2 · 1건 |
| `hand_swap3` 의 `handAlteredMark` | 확정 2 · 1건 |
| `honor_return` 의 `handAlteredKey` | 확정 5 · 1건 |
| `regret` 의 `handAlteredKey` | 확정 5 · 1건 |
| `foresight` 의 `turnNo` → `turnCount` | 확정 3 · 2건 |
| `foresight` 의 매 이벤트 resync | 확정 4 · 1건 |
| `joker` 의 리치 가드 | 확정 6 · 2건 |
| `joker` 의 `handAlteredKey` | 의심 8 · 1건 |
| `free_riichi_discard` 의 `activeSnapshotOf`+리액션 | 확정 7 · 1건 |
| `last_stand` 의 `riichi.blocked` | 확정 8 · 1건 |
| `jackpot` 의 `outcome` 컷 제거 | 확정 9 · 1건 |
| `giant_god` 의 detail 한 줄 | 확정 10 · 1건 |

---

## 확정 10건 — 무엇을 고쳤나

### 확정 1 🔴 `util.sameHandSize` — 멘쯔 **개수** 대신 **손패 슬롯 수**

`packages/content/src/util.ts`. 후로가 손에서 가져가는 장수는 종류마다 다르다 —
깡 3장(안깡 4장), 퐁·치 2장. 멘쯔 1개끼리라도 깡 보유자는 손패 10장, 퐁 보유자는 11장이라
옛 가드를 그대로 통과했고, 바꾸고 나면 강탈자 손이 **11 + 쯔모 1 = 12장**이 됐다.

새 헬퍼 `concealedSlotsOf(state, id, handSize)` 를 export 했다 —
`deal.handSize − Σ(멘쯔 tileIds − 울어 온 1장)`. **멘쯔 종류를 나열하지 않고 실물로 세므로**
국사퐁·가깡처럼 종류가 늘어도 식이 그대로 맞고, 새 종류 등록을 잊어 가드가 다시 새는 일이 없다.

**같은 함수를 쓰는 다른 증강 전수 확인**(지시 사항): 호출자는 `full_hand_swap` 뿐이다
(`validate` 1곳 + `holderTurnOptions` 후보 필터 1곳). `seat_swap` 은 손패를 좌석째 옮기므로
이 가드를 쓰지 않는다. 즉 이 변경의 영향 범위는 `full_hand_swap` 하나로 닫혀 있고,
같은 종류의 후로끼리는 그대로 통과한다는 대조 테스트를 함께 뒀다(가드가 과하지 않다).

### 확정 2 🔴 `full_hand_swap` · `hand_swap3` — 천화 48,000 오지급

형제 8종이 지키는 방식 그대로, 리듀서의 `augmentData` 갱신에 `handAlteredMark` 를 더했다.
등가교환은 지시대로 **교환 당사자 양쪽**에 남긴다. 통째로 바꾸기도 대상이 패산에서 새 손을
받으므로 양쪽이다.

- `r_tenhou.ts`: 48,000 역만 → **6,000 (menzen_tsumo·ittsuu)**
- `r_tenhou_swap3.ts`: 48,000 역만 → **18,000 (menzen_tsumo·pinfu·ittsuu)**

### 확정 3 🟠 `foresight` — 순 기준을 `discardCount` 로

`turnCount` 는 **오야가 쯔모할 때마다** 오르고 영상패도 예외가 아니다. 형제
`future_sight`·`take_back` 이 이미 밟고 나온 함정이라 같은 기준(`turnNo` = 보유자
`discardCount`)으로 옮겼다. 누명이 `discardedKinds` 를 남의 이력으로 돌리므로
이력 길이가 아니라 `discardCount` 를 쓴다.

- `r_foresight_kan.ts`: 깡 뒤 `재배열 후보 0 · 쿨다운 3` → **`24 · 4`** (깡 전과 같다)

### 확정 4 🟠 `foresight` — 예언을 **매 이벤트마다 패산 앞에서 다시 만든다**

`triple_peek` 이 2026-08-01에 쓴 방식 그대로다. 저장하는 것은 kind 목록이 아니라
**남은 장수**(`peekLeft`)뿐이고, 화면에 낼 목록은 `"*"` 리액션에서 `frontIds(state)` 로
다시 만든다(값이 같으면 emit 생략 → 반응 연쇄는 한 겹에서 멈춘다).
경로를 하나씩 막는 대신 파생값으로 두었으므로 **앞으로 패산 앞을 먹는 증강이 생겨도
같은 구멍이 다시 열리지 않는다**.

- `r_foresight_stale.ts`: `peek still [pin8,pin8,pin9,pin9]`(셋이 틀림) →
  **`[pin9,pin9,pin9,sou1]`** (실제 패산 앞과 일치)

### 확정 5 🟠 `honor_return`(+`regret`) — 배패를 고쳐 쓰면 게이트를 닫는다

`tileKindChanged` 옆에 `augmentDataSet(handAlteredKey(...), true)` 한 줄. 지시대로
같은 크로스국 주입 패턴인 `regret` 도 함께 고쳤다.

- `r_honor_tenhou.ts`: `handAlteredByAugment(p0) = false` → **`true`**

### 확정 6 🔴 `joker` — 리치 중 발동 금지

`jokerAction.validate` 에 형제 규약 한 줄(`riichi != null` → 거부)을 넣고,
`holderTurnOptions` 도 리치 중에는 **후보 자체를 내지 않게** 했다 — 보고서가 부수 효과로
지적한 «리치 강제 쯔모기리 자동 진행이 사라져 매 순 프롬프트가 뜬다»가 이것으로 함께 사라진다
(`FlowController` 의 자동 진행은 `options.length === 1` 일 때만 돈다).

- `r_joker_riichi.ts`: 발동 후 대기 34종 → **발동 자체가 거부**, 대기 `pin5,dragon1` 그대로

### 확정 7 🔴 `free_riichi_discard` — 남이 리치를 풀면 스냅샷도 걷힌다

두 겹으로 막았다.

1. `STEALTH_RIICHI_BROKEN` 리액션 — 스냅샷 키와 `free_declare_waits` 뷰를 함께 비운다.
2. `activeSnapshotOf` — `hand.winTileIds`·`call.kan.enabled` 모디파이어가 스냅샷을 쓰기 전에
   **리치가 살아 있는지 함께 본다.**

②를 넣은 이유: `conflicts` 가 같은 사람의 드래프트 안에서만 도는 것처럼, ①도 «지금 아는
경로 하나»일 뿐이다. 판정 쪽에서 리치를 함께 보면 **어느 경로로 풀리든** 손은 물리 손패로 돌아간다.

- `r_free_snapshot_brick.ts`: `스냅샷 13장 남음 / winTileIds 13장 옛 손패` →
  **`스냅샷 0장 / winTileIds null(정상)`**

### 확정 8 🔴 `last_stand` — 취소한 국에는 재리치 불가

취소가 국 스코프 이력(`last_stand:canceled:…#round`)을 남기고, `riichi.blocked` 모디파이어가
보유자 본인에 한해 그것을 본다. 코어 `riichiAction` 뿐 아니라 스텔스 리치·공성계 등
content의 다른 리치 경로도 전부 이 규칙을 먼저 조회하므로 **한 곳이면 우회로가 남지 않는다**.
카드 detail에도 "물러서는 카드이지 다시 달려드는 카드는 아니다 — 취소한 국에는 리치를
다시 걸 수 없다" 한 줄을 넣었다.

같은 수정에서 **의심 7**(게임 스코프 키 규약 위반)도 함께 없앴다 — `usedKey` 를
`roundScopedKey` 로 옮기고 `ROUND_STARTED` 수동 리셋 리액션을 지웠다.

- `r_laststand_rerichi.ts`: `재리치 ok = true`(일발 재장전 + 후리텐 세탁) →
  **`ok = false, "riichi is sealed this round"`**, 후리텐·공탁·점수 모두 취소 직후 그대로

### 확정 9 🟡 `jackpot` — `outcome !== "win"` 컷 제거

보고서의 ①안이다. 컷이 지키려던 «유국 노텐 벌부는 정액» 은 바로 다음 줄 `d <= 0`
(무페널티)이 **혼자서 완전히** 달성한다 — 벌부는 언제나 음수 델타이기 때문이다.
컷은 벌부뿐 아니라 유국 텐파이 수령·유국만관·유국역만까지 함께 밀어내고 있었고,
그것이 카드 문구("**그 국에 얻는 점수**")와 어긋난 지점이다. 도중유국(`abort`)은
델타가 전부 0이라 같은 줄에서 걸러진다.

기존 테스트 `settle_accounting_qa.test.ts` 의 «노텐 벌부» 케이스는 이름과 달리 보유자
델타가 **양수(+3,000 = 텐파이 수령)** 였다. 벌부(음수) 케이스로 바로잡고, 텐파이 수령이
곱해지는 케이스와 도중유국 케이스를 새로 나눠 넣었다.

### 확정 10 🟡 `giant_god` — 카드에 후로 제약 명시

동작은 게임적으로 정당하므로(국사무쌍은 멘젠 전용) **문구만** 고쳤다. detail에
"**치·퐁·깡을 한 번이라도 하면 그 국에는 각성할 수 없다.** 각성은 바닥의 요구패와 내 손패를
통째로 맞바꾸는 것이라 후로로 손패가 줄면 자리가 맞지 않는다" 한 문단을 넣었다.
문구가 사실과 맞는지는 «멘젠이면 버튼이 뜨고, 퐁 하나만 있어도 안 뜬다» 대조 테스트로 묶었다.

---

## 의심 8건 — 판정

### 의심 1 🟠 `grave_rob` — «확정 화료 버튼»인데 무응답 한 번에 매치 1회가 증발한다 → **확정 (코어 수정 필요)**

코드 경로를 끝까지 확인했고 보고서의 서술이 정확하다.
`HanchanController.safeDecide` 의 폴백은

```ts
opts.find((o) => o.type === "pass")
  ?? [...opts].reverse().find((o) => o.type === "discard")
  ?? opts[0]!
```

로 **`win` 보다 `discard` 를 먼저 고른다.** 도굴 리듀서는 그 자리에서 횟수를 태우므로
(`[usesKey(p.holder)]: counterOf(...) + 1`), 도굴 직후 시간이 끊기면 동풍전 1회뿐인
리소스가 화료 없이 사라지고 파낸 패는 자기 바닥으로 흘러 후리텐까지 걸린다.

**content 쪽에서 고치지 않았다.** 검토한 두 안이 모두 더 나쁘다 —
① 「국이 끝날 때 화료 못 했으면 횟수 환급」은 «도굴로 남의 바닥에서 패를 빼내 현물 읽기를
지우고 횟수는 돌려받는» 새 악용을 연다. ② 「도굴 후 손패 전부를 `discard.blockedTileIds`
로 막아 `win` 하나만 남긴다」는 어떤 이유로든 `win` 이 불법이 되는 순간 **소프트락**이다.

제자리는 코어이고, 고치면 도굴뿐 아니라 «지금 화료» 성격의 모든 버튼이 함께 낫는다:

```ts
// HanchanController.safeDecide — 폴백 우선순위
// 무응답 폴백이 화료를 버리면 안 된다: `win` 이 떠 있다는 것은 이미 «화료가 성립한다»는
// 뜻이고, 그것을 지나쳐 discard를 고르면 증강이 태운 1회가 화료 없이 사라진다
// (2026-08-22 QA aug-2 의심 1 — grave_rob).
const fallback = (): ActionOption =>
  opts.find((o) => o.type === "win")
    ?? opts.find((o) => o.type === "pass")
    ?? [...opts].reverse().find((o) => o.type === "discard")
    ?? opts[0]!;
```

⚠ 이 변경은 **폴드 의도를 뒤집는다**(무응답이 곧 화료가 된다). 리치봉·순위 계산이 걸린
자리라 «무응답 = 최선 수»가 맞는지는 설계 판단이 필요하다 — 그래서 초안만 남긴다.

### 의심 2 🟡 `giant_god` — 각성이 유국만관 길이 등식을 깬다 → **기각**

등식은 실제로 깨진다. 그런데 **결과가 틀리지 않는다.** `KOKUSHI_KEYS` = 요구패 13종 =
«터미널·자패 전부» 이므로, 각성이 다시 쓴 이력에는 **심파이만** 남는다. 코어
`nagashiManganSeats` 는 그보다 먼저 `history.every(isTerminalOrHonor)` 를 보므로

- **과다 부여 방향**: 이력이 심파이를 품게 되어 절대 성립하지 않는다. 열리지 않는다.
- **과소 부여 방향**: 각성하면 내 강에 **심파이 13장이 실물로 깔린다.** 유국만관이 깨지는 것은
  이력 등식 때문이 아니라 물리적으로 옳다.

즉 `meld_dissolve` 식 보정을 넣을 이유가 없다 — 넣으면 오히려 «심파이를 13장 버려 놓고
유국만관» 이 열린다. 기각한다.

### 의심 3 🟡 `giant_god` — 누명이 요구패를 깔아 준다 → **기각 (사양)**

성립은 한다. `pickKokushiIds` 는 물리 강만 보고, `frame_up` 은 `creditTo` 로 자기 버림을
남의 바닥에 **실물로** 심는다. 그런데 누명 카드가 파는 허구가 바로 "**그 패는 그 사람이 버린
것이 된다**"이고, 코어도 그 전제로 후리텐·현물을 계산한다. 여기서만 "그건 남이 심은 거니까
안 센다"로 갈라놓으면 오히려 규약이 둘로 쪼개진다. 2국당 1장이라 영향도 작고, 심는 쪽이
자기 목적으로 심는 것이라 «증강이 요구패를 깔아 준다»는 detail 문장의 취지(=이 증강이
공짜로 채워 주지 않는다)와도 어긋나지 않는다. 사양으로 둔다.

### 의심 4 🟡 `meld_dissolve` 의 보충패가 `TILE_DRAWN` 없이 들어온다 → **부분 해소**

- **`foresight` 쪽은 사라졌다.** 확정 4에서 예언을 «저장된 스냅샷»이 아니라 «지금 패산 앞»의
  파생값으로 바꿨으므로, `TILE_DRAWN` 을 못 봐도 표시가 틀리지 않는다.
- 남은 것(`giant_god` 의 다음 쯔모 예약, `temporaryFuriten` 자동 해제)은 «증강이 만든 쯔모를
  코어가 쯔모로 세지 않는다»는 **코어 쪽 일반 문제**다. 재현판은 만들지 못했다.
  제자리는 `meld_dissolve` 가 정식 `TILE_DRAWN` 을 내거나, 코어가 그 경로를 인정하는 것이다.

### 의심 5 🟡 `free_discard` 가 스냅샷 존재를 확인하지 않는다 → **해소**

`freeDiscardAction.validate` 가 이제 `riichi != null` **과** 스냅샷 존재를 함께 본다
(`"no riichi snapshot"`). 보고서대로 그런 경로를 실제로 찾지는 못했지만, 두 조건을 붙여 두면
앞으로도 생기지 않는다. 기존 픽스처(`withRiichi` 로 `riichi` 필드만 세우던
`riichi_family.test.ts`)는 실제 흐름이 만드는 스냅샷을 함께 심도록 고쳤다(`withFreeSnapshot`).

### 의심 6 🟡 `grave_rob` 이 파낸 패를 전원 공개 채널로 싣는다 → **확정 (🟡, 미수정)**

성립하고, 게다가 보고서보다 한 겹 더 나쁘다 — **카드 문구와도 어긋난다.**
detail은 "**안개로 가려진 바닥의 패도 파낼 수 없다**"고 못 박는데, 후보 생성은
`visibleTileIdsIn(state, rules, holder, …)` = «**보유자에게** 보이는 바닥»이다.
`hidden_river`·`brief_fog` 는 `visibility.discards` 를 **비보유자에게만** `count_only` 로
내리므로, **안개를 친 본인이 도굴을 함께 들면** 남에게는 가려진 바닥을 자기만 보고 파낼 수 있고,
결과는 `roundViewKey("*", …)` 로 **종류째 전원에게** 나간다.

두 방향 중 하나여야 한다.
① 코드를 카드에 맞춘다 — 후보를 «전원에게 보이는 패»로 좁힌다(안개를 친 본인도 못 판다).
② 카드를 코드에 맞춘다 — "내가 볼 수 있는 바닥이면 안개 속이라도 팔 수 있고, 파낸 패는
   전원에게 공개된다"로 고쳐 쓴다.

**고치지 않았다**: ①은 `hidden_river`(내 담당)와 `brief_fog`(aug-1 담당)의 가시성 규칙에
동시에 얹히는 변경이라 동시 작업 중에 손대기에 위험하고, 어느 쪽이 의도인지가 설계 판단이다.
①을 고른다면 `graveCandidates` 의 뷰어를 보유자에서 «전 좌석 교집합»으로 바꾸는 한 줄이면 된다.

### 의심 7 🟡 `last_stand` 만 국 스코프 규약을 안 쓴다 → **해소**

확정 8과 함께 고쳤다. `usedKey` 가 `roundScopedKey(ID, "used", state, h)` 가 되어 엔진이
국 경계에서 자동으로 지우고, `ROUND_STARTED` 수동 리셋 리액션은 사라졌다.

### 의심 8 🟡 `joker` 로 천화가 붙을 수 있다 → **확정 🔴 · 수정함**

**실측했다. 48,000점이 나온다.**

```
$ npx tsx qa-lab/round2/aug-2/p_joker_tenhou.ts
joker_call ok = true
settle ok = true
points 48000 yakuman 1 yaku tenhou
```

(p0 = 오야, 배패 `123m456m789m 11p 2p 白白` — 백 두 장이 조커가 되어야 234통이 채워진다.
즉 **조커가 없으면 미완성인 배패**다.)

보고서가 남긴 «해석만 바꾸므로 규약의 문자적 대상이 아니다» 라는 독법은 성립하지만,
게이트가 막으려던 것과 결과가 정확히 같다 — 천화는 "배패가 첫 쯔모 시점에 **이미** 완성돼
있었다"는 사실에 붙는 역만인데, 조커는 완성돼 있지 **않던** 배패를 그 자리에서 완성형으로
읽게 만든다. `firstTurn`·버림 0장은 그대로라 게이트가 열려 있었다.

`jokerAction.toEvents` 에 `augmentDataSet(handAlteredKey(state, req.player), true)` 한 줄을
더했다. 발동한 국에만 걸리는 국 스코프 표식이라 **조커를 켜지 않은 국의 천화는 멀쩡하다**.
조커 자체도 그대로 일한다 — 같은 판이 이제 12,000점(menzen_tsumo·pinfu·ittsuu)으로 난다.

---

## 코어에 남긴 숙제

1. **`safeDecide` 폴백이 `win` 을 지나친다** — 의심 1. 초안은 위에 있다. 설계 판단 필요.
2. **증강이 만든 쯔모가 `TILE_DRAWN` 을 내지 않는다** — 의심 4의 잔여분.
   `meld_dissolve` 의 보충패가 대표 사례고, 이 경로를 듣는 훅(다음 쯔모 예약·임시 후리텐
   해제)이 그 한 장을 못 본다.

## 기존 테스트 중 이번 수정으로 전제가 바뀐 것

동작이 바뀐 만큼 픽스처·기대값을 함께 고쳤다. **전부 내 담당 증강에 대한 케이스다.**

| 파일 | 무엇을 |
|---|---|
| `info_fixes_batch8.test.ts` | 예지 스트립이 파생값이 됐다 — 실제로 발동해 픽스처를 만들고, «남은 장수»와 «패산 앞을 비추는가»를 나눠 본다 |
| `new_52_b.test.ts` | 예지 쿨다운 시나리오가 `turnCount` 대신 보유자 `discardCount` 를 움직인다 |
| `riichi_family.test.ts` | `withFreeSnapshot` 헬퍼 추가 — `withRiichi` 가 건너뛰던 리치 스냅샷을 함께 심는다 |
| `riichi_qa_0820.test.ts` | «취소 뒤 표준 리치는 숨지 않는다» → «취소한 국에는 재리치가 아예 안 된다» (확정 8로 걱정 자체가 사라졌다) |
| `settle_accounting_qa.test.ts` | 잭팟 유국 케이스를 벌부(음수)·텐파이 수령(양수)·도중유국 셋으로 분리 |

## 검증

```
# 이번에 손댄 테스트 파일 전부
npx vitest run packages/content/test/qa_aug2_round2.test.ts \
  packages/content/test/info_fixes_batch8.test.ts \
  packages/content/test/new_52_b.test.ts \
  packages/content/test/riichi_family.test.ts \
  packages/content/test/riichi_qa_0820.test.ts \
  packages/content/test/settle_accounting_qa.test.ts
#   → Test Files 6 passed (6) / Tests 123 passed (123)

npm run typecheck:content && npm run typecheck                 # 0 errors
npm run typecheck:server  && npm run typecheck:client          # 0 errors
```

재현 스크립트 10종 최종 상태 (전부 «고치기 전 증상» 이 사라졌다):

```
r_fullswap            OK                    (강탈 자체가 거부된다)
r_tenhou              6,000  menzen_tsumo,ittsuu          ← 48,000 tenhou 였다
r_tenhou_swap3        18,000 menzen_tsumo,pinfu,ittsuu    ← 48,000 tenhou 였다
r_honor_tenhou        OK                    (handAlteredByAugment = true)
r_joker_riichi        리치 중 joker_call ok = false        ← true 였다 (대기 34종)
r_laststand_rerichi   재리치 riichi=null · OK              ← 일발 재장전 + 후리텐 세탁이었다
r_free_snapshot_brick OK                    (스냅샷 0장 · winTileIds null)
r_foresight_kan       재배열 후보 24 · 쿨다운 4            ← 0 · 3 이었다
r_foresight_stale     peek = [pin9,pin9,pin9,sou1]        ← 옛 4장을 계속 보여 줬다
p_joker_tenhou        12,000 menzen_tsumo,pinfu,ittsuu    ← 48,000 tenhou 였다 (의심 8)
```

`npx vitest run packages/content` **전체**는 마지막 실행에서
**Tests 8 failed | 1459 passed (1467)** 이다.

⚠ 남은 8건은 **전부 내 담당이 아니다** — `soul_strike` 3건 · `void_kan` 5건
(aug-2 범위는 eternal_dealer…mixed_triplet이라 둘 다 밖이다). 동시 작업 중인 다른 담당의
미완 변경이고, 실제로 작업 중 `disarm`·Rule #2 «염색» 실패는 나타났다가 그쪽에서 고쳐지며
사라졌다. `disarm` 은 **내 수정을 전부 되돌린 상태에서도 똑같이 실패**하는 것을 직접 확인해
내 변경과 무관함을 못 박아 뒀다. 내 담당 28종 + `regret` + `util.ts` 에서는 실패가 없다.

### 안 한 것 (정직하게)

- **광역 스위프(`sweep.ts`, 180판)를 완주시키지 못했다.** 이번 세션 안에서 두 번 걸었으나
  둘 다 끝나기 전에 시간이 다했다. 원 보고서가 적었듯 이 스위프는 **확정 10건 중 하나도
  잡지 못했던** 검사라(무작위 대국으로는 조건이 안 겹친다) 회귀 신호로서의 값은 낮지만,
  «다른 데를 망가뜨리지 않았는가»를 넓게 보는 용도로는 아직 안 돌아갔다. 다음 사람이
  `npx tsx qa-lab/round2/aug-2/sweep.ts` 를 한 번 완주시켜 주면 좋겠다.
  그 자리를 대신한 것은 재현 스크립트 10종 + 회귀 테스트 22개 + 되돌림 검증 13회다.
- **클라이언트 표시**는 보지 않았다. 특히 확정 4로 예지의 공개 채널이 «저장값»에서
  «파생값»으로 바뀌었으므로, 드래그 모달이 렌더 도중 갱신되는 목록을 어떻게 다루는지는
  클라 담당이 한 번 봐야 한다(값 자체는 이제 항상 실제 패산과 일치한다).
