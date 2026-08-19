# hand 계열 (12종) — 손을 못 참는 사람 (hand-a)

담당: `red_five_touch` `take_back` `tile_dyeing` `suit_unify` `hand_swap3` `full_hand_swap`
`future_sight` `bottom_deal` `alchemist` `pond_snatch` `grave_rob` `silent_swap`

## 요약

- **돌린 판**: **149 매치 / 1,105 국** (동풍전·반장전) + 결정적 최소 재현 매치 8회
  - `sweep2.ts` 36매치 — 12종을 **네 좌석 전원에게 단독 강제**(드래프트 off), 페르소나 3조합, 반장전
  - `sweep_pairs.ts` 52/66쌍 — 담당 12종의 **2종 조합**을 네 좌석 전원이 동시 보유, 동풍전
  - `sweep_random.ts` 61매치 — 좌석마다 2~3종 무작위, masher/folder/caller/riichiRusher/stall 혼합
  - (남은 pairs 14쌍·random 74매치는 같은 머신에서 다른 QA 스윕이 동시에 돌아 CPU가 포화돼 중단했다.
     같은 스크립트에 인자만 주면 이어서 돌릴 수 있다.)
- **커버리지**: 담당 12종 전부 실제 발동 확인(`aug-actions` 로그). `bottom_deal`은 매 순 발동이라
  한 매치에 100회 이상 밟았다.
- **추가한 불변식**(`qa-lab/hand-a/checks.ts`): ① 패 총량 보존(존 합 = tiles 레지스트리),
  ② 손패 장수 **엄밀** 검사(후로·깡 환산 후 정확히 13/14), ③ 리치 선언 후 손패 동결(멘쯔 변화 제외),
  ④ 붉은 손길 각인 불변식(각인 숫자는 손에 있는 동안 항상 적도라).
  ①②③은 149매치에서 **한 번도 깨지지 않았다** — 패 유실·복제·장수 붕괴·크래시·훅 예외 0건.
  ④는 여러 조합에서 깨졌다(확정 5).
- **확정 5건 · 의심 2건.**

---

## 확정 1. 🔴 grave_rob — 후리텐인데 화료한다 (날치기에서 고친 구멍이 그대로 남아 있다)

- **위치**: `packages/content/src/augments/grave_rob.ts:179-253`(액션 validate)·`:255-270`(리듀서) — `win.tsumoFuriten` 모디파이어가 없다.
  대조군 `packages/content/src/augments/pond_snatch.ts:186-199` (`win.tsumoFuriten` 모디파이어)
- **기대**: 파낸 패로 나는 것은 **남이 버린 패로 나는 것**이다. 같은 계열인 날치기는
  docs/28 §2-9 지적 이후 "주운 패가 지금의 쯔모패인 동안 `win.tsumoFuriten`을 켠다"로 고쳤고,
  코어도 그 규칙이 켜졌을 때만 쯔모에 후리텐을 태운다(`standardActions.ts:267-286`).
  무덤 도굴에는 그 모디파이어가 **없다** → `win.tsumoFuriten` 기본값 `false`(:1451)로 통과한다.
- **실제**: 리치 후리텐(론을 넘겨 영구 후리텐이 된 상태)인 플레이어가 상대 바닥에서 자기
  오름패를 파내 **쯔모 화료**한다. 지불도 쯔모 취급이라 상대 셋이 전원 지불한다.
- **재현**: `tsx qa-lab/hand-a/repro_grave_rob_furiten.ts grave_rob` — seed=4242, 동풍전,
  preset `p0:["grave_rob"]`, presetHands p0 = 산색동순 텐파이(sou7 단기)

  ```
  p0: 리치 선언
  p0: RON 넘김 (후리텐 성립)
  [1-1-0] p0: grave_rob 발동 → {"fromPlayer":"p1","graveId":123} | 내 후리텐=true 사유=["riichi"]
  [1-1-0] p0: win 선택
  도굴 직전 점수: {"p0":24000,"p1":25000,"p2":25000,"p3":25000}
  그 국 정산 후 점수: {"p0":43000,"p1":19000,"p2":19000,"p3":19000}   ← 셋이 6000씩 지불
  ```

  대조군: 같은 스크립트를 `pond_snatch`로 돌리면 후보가 뜨지 않아(또는 화료가 거부되어)
  국이 그대로 흐른다 — `tsx qa-lab/hand-a/repro_grave_rob_furiten.ts pond_snatch`
- **영향**: 점수가 틀린다. 후리텐 플레이어가 "상대가 흘린 내 오름패"를 10장 창 안에서
  골라 확정 화료하는 것이 이 증강의 정상 동작인데, 후리텐 벌칙만 통째로 빠져 있어
  **후리텐일수록 이 증강이 강해진다**(내 오름패가 이미 남의 바닥에 깔려 있다는 뜻이므로).

## 확정 2. 🔴 silent_swap — 내 바닥에서 내가 버린 오름패를 집어 후리텐 쯔모 화료

- **위치**: `packages/content/src/augments/silent_swap.ts:103-141`(validate)·`:160-190`(리듀서) — `win.tsumoFuriten` 모디파이어가 없다
- **기대**: detail이 "**내 바닥에서 가져와도 내 후리텐은 풀리지 않는다**"라고 명시한다.
  즉 후리텐 상태는 유지되어야 하고, 집은 패로 나는 것은 날치기와 같은 판정을 받아야 한다.
- **실제**: 상태는 그대로지만 **아무 데서도 쓰이지 않는다.** 집은 패가 `lastDrawnTile`이 되고
  코어의 쯔모 분기는 `win.tsumoFuriten`이 꺼져 있으면 후리텐을 보지 않으므로 그대로 화료된다.
  자기 바닥이 대상에 포함되므로 **자기가 방금 버린 오름패를 도로 집어 나는 것**이 가장 쉬운 사용법이 된다.
- **재현**: `tsx qa-lab/hand-a/repro_silent_swap_furiten.ts 11` — seed=11, 동풍전,
  preset `p0:["silent_swap"]`, presetHands p0 = 핑후 텐파이(sou6/sou9 량면)

  ```
  [1-2-1] p0: 대기패 sou9 쯔모 → 화료를 안 누르고 버린다 (후리텐 만들기)
  [1-2-1] p0: silent_take 발동 → {"tileId":107}
  [1-2-1] p0: win 선택 → 수리됨(국이 1-3-0으로 넘어간다)
  증거(집은 직후 상태): {"집은패":"sou9","대기":["sou6","sou9"],"내바닥":[...,"sou9"],"후리텐":true}
  ```
  seed 3·11·21 **3/3 재현**(집은 패 sou6/sou9, 대기 [sou6,sou9], 내 바닥에 그 패 있음, 화료 성립).
- **영향**: 점수가 틀리고 설명과 정반대다. 확정 1과 **같은 뿌리**(주운 패의 쯔모 화료에
  후리텐을 안 태운다)이므로 두 건은 한 번에 고칠 수 있다 — 날치기의 모디파이어를
  공용 헬퍼로 빼서 `grave_rob`·`silent_swap`에 같이 걸면 된다.

## 확정 3. 🟠 future_sight — "한 번 누르면 취소할 수 없다"가 지켜지지 않는다 (공짜 무장·공짜 취소)

- **위치**: `packages/content/src/augments/future_sight.ts:158-171`(`future_arm`),
  `:337-347`(TILE_DISCARDED에서 무장 해제), `:372-379`(holderTurnOptions)
- **기대**: detail — "자기 순에 버튼을 누르면 손패에서 뽑힌 무작위 3장이 제시된다. …
  **한 번 누르면 취소할 수 없고, 고르지 않으면 무작위로 한 장이 버려진다.**"
  2026-08-18 사양 복귀의 명분 자체가 "리스크가 사라져 누르면 무조건 이득인 버튼이 됐다"였다.
- **실제**: `future_arm`은 플래그만 세우고 패·순·쿨다운을 하나도 소비하지 않는다. 무장 뒤에도
  **표준 discard 후보가 그대로 남아 있어** 뽑힌 3장을 확인만 하고 그냥 버리면 리액션이 무장을
  조용히 내린다. 쿨다운 기준점(`lastUsedKey`)과 스택은 교환 리듀서에서만 갱신되므로 **대가가 0**이고,
  다음 순에 다시 무장할 수 있다. 즉 "무작위 3장이 무엇인지 보고 나서 발동 여부를 정한다".
- **재현**: `tsx qa-lab/hand-a/repro_future_sight_peek.ts 5` — seed=5, 동풍전, preset `p0:["future_sight"]`

  ```
  [순 1] future_arm — 무장 (쿨다운 소모 없음)
     뽑힌 3장을 확인: pin2#43, sou1#74, sou7#97 → 교환하지 않고 그냥 버린다(취소)
  ... 무장 횟수=67 확인 후 취소=67 실제 교환=0
  3회 무장 시점의 future_sight 상태: {"future_sight:armed:1-1-0:p0":true,"future_sight:turns:1-1-0:p0":2}
      ← lastUsedKey(쿨다운 기준점)·stacks 키가 아예 없다 = 아무것도 소모되지 않았다
  ```
- **영향**: 설명과 다르고 밸런스 의도가 무력화된다. 3순 쿨다운은 **교환할 때만** 붙으므로
  "무장→확인→취소"는 매 순 무제한이며, 손이 좋은 3장이 뽑힌 순에는 물러나고 버려도 되는
  3장이 뽑힌 순에만 태울 수 있다 — 되돌리려 했던 "무조건 이득" 상태가 그대로 복원된다.
  (부수 관측: `pickThree`는 `state.prngState`의 순수 함수라 쯔모기리만 하는 동안에는 매 순
   **같은 3장**이 제시됐다. 버림패를 바꾸면 조합도 바뀐다 — 예측 가능성은 위 문제의 결과다.)

## 확정 4. 🟠 hand_swap3 — 넘길 3장을 고른 뒤 그중 하나를 버리면 그 국의 교환이 죽는다 (횟수는 이미 소모)

- **위치**: `packages/content/src/augments/hand_swap3.ts:271-291`(give — `:277` "gives already chosen"),
  `:293-320`(take — `:306` `gives.every(id => myHand.includes(id))`), `:436-460`(holderTurnOptions)
- **기대**: detail — "이어서 넘길 내 3장과 가져올 상대 3장을 각각 한 번에 골라 맞바꾸며".
  중간 단계는 패를 움직이지 않는다고 명시돼 있으므로, 고르는 도중에 마음이 바뀌어도
  **최소한 다시 고를 수는 있어야** 한다.
- **실제**: `swap3_give`는 tileId 3장을 키에 적어 둘 뿐이고 그 패들은 손패에 그대로 남아
  **평범하게 버릴 수 있다.** 한 장이라도 버리면
  ① `swap3_take`는 영구히 반려되고(그 패가 손에 없다),
  ② `swap3_give`는 `pendingGives.length > 0`이라 다시 고를 수 없고,
  ③ 게임 2회 중 1회는 이미 소모됐고,
  ④ 상대 손패 13장 공개(`view:p0:revealTiles:p1#round`)와 지목 표식은 국 끝까지 남는다.
  화면에는 아무 안내도 없다 — `FlowController.ts:389-396`이 증강 후보를 **validate로 다시 거르므로**
  버튼 자체가 조용히 사라진다.
  (같은 덫의 다른 입구 — 코드 판독: 고른 3장 중 하나로 **안깡**을 치거나, give 뒤에 **리치**를 걸어도
   `commonReject`가 막아 그 국의 교환이 같은 방식으로 죽는다.)
- **재현**: `tsx qa-lab/hand-a/repro_swap3_stuck.ts 31` — seed=31, 동풍전, preset `p0:["hand_swap3"]`

  ```
  1) swap3 지정 → {"target":"p1"}
  2) swap3_give 선택 → [16,17,21]
  3) 넘기기로 한 16 을(를) 그냥 버린다
     턴 옵션: discard (손패 14)      ← 이후 모든 순에서 swap3_* 후보가 사라진다
  교환 성사=false
  버린 직후 augmentData: {"view:p0:uses:hand_swap3":{"left":1,"total":2},"hand_swap3:used:p0":1,
    "hand_swap3:target:1-1-0:p0":"p1","hand_swap3:left:1-1-0:p0":1,"hand_swap3:give:1-1-0:p0":"3장",
    "view:p0:revealTiles:p1#round":"13장","view:*:hand_swap3:p0#round":"p1"}
  ```
- **영향**: 소프트락은 아니다(버림 후보는 남는다). 다만 프리즘 티어 액티브의 절반이
  **사용자 조작 한 번으로 조용히 증발**하고, 그 대가인 상대 손패 X-ray만 국 내내 남는다.
  give를 다시 고를 수 있게 하거나, give 시점에 그 3장을 잠그면(`lockedDiscardIds`) 사라진다.

## 확정 5. 🟡 red_five_touch — 각인이 "증강으로 손에 들어온 패"를 전부 놓친다

> ⚠ 뿌리는 docs/28 §2-9(“각인 훅이 ROUND_STARTED/TILE_DRAWN/CALL_MADE 뿐”)에 이미 적혀 있다.
> 거기 적힌 경로는 **론 화료·펑**이고, 아래는 **문서에 없는 경로 목록**이다.

- **위치**: `packages/content/src/augments/red_five_touch.ts:240-247` (리액션 3개: ROUND_STARTED·TILE_DRAWN·CALL_MADE)
- **기대**: description — "그 뒤로 내 손에 들어오는 그 숫자가 **게임이 끝날 때까지 전부** 적도라".
- **실제**: 패가 `TILE_DRAWN` 없이 손으로 들어오는 모든 경로에서 각인이 붙지 않는다.
  담당 12종 중 실측으로 걸린 것: `take_back`(교체 쯔모), `future_sight`(패산 3장),
  `full_hand_swap`(강탈한 13장), `hand_swap3`(받아온 3장), `suit_unify`(맞바꿔 온 실물),
  `alchemist`·`tile_dyeing`(kind가 각인 숫자로 **바뀐** 패 — `TileKindChanged`가 red를 떼고
  다시 새기는 훅이 없다). 다음 쯔모가 오면 손 전체를 다시 훑어 각인되므로 **그 순 동안만** 비지만,
  하필 그 순이 "방금 받은 패로 쯔모 화료하는" 순이다 → 도라 1개가 조용히 사라진다.
- **재현**: `tsx qa-lab/hand-a/repro_red_engrave.ts 7000` — preset `p0:["red_five_touch","take_back"]`.
  p0 자신의 뷰(리액션이 전부 적용된 시점)만 본다.

  ```
  p0: 숫자 6 각인 (손에 2장)
  p0 뷰: 각인 숫자 6 인데 적도라가 아닌 손패 1장 → sou6#92 attrs={} (직전 액션=take_back)
  p0 뷰: 각인 숫자 6 인데 적도라가 아닌 손패 1장 → man6#23 attrs={} (직전 액션=take_back)
  p0 뷰: 각인 숫자 6 인데 적도라가 아닌 손패 1장 → pin6#59 attrs={} (직전 액션=take_back)
  ```
  스윕 집계(`sweep_pairs.ts`, tonpuu 4국): `+take_back` 45회, `+future_sight` 66회,
  `+full_hand_swap` 46회, `+suit_unify` 17회, `+tile_dyeing` 15회, `+alchemist` 9회,
  `+hand_swap3` 6회의 미각인 관측. **단독 보유(sweep2)에서는 0회** — 조합에서만 생긴다.
- **영향**: 판수가 틀린다(설명이 약속한 도라가 안 붙는다). 각인 훅을 이벤트 목록이 아니라
  "손패가 바뀌면 다시 새긴다"(`*` 리액션 + 값 비교)로 바꾸면 이 경로들이 한꺼번에 닫힌다.

---

## 의심 1. pond_snatch — 패산이 1장 늘어 국이 길어지는데 설명에 없다 (재현은 되지만 '결함'인지 미확정)

`pond_snatch.ts:150-165`(리듀서)은 쯔모패를 패산으로 되돌리고 바닥의 패를 손으로 가져오므로 **패산이 +1** 된다
(= 그 국이 모두에게 1쯔모 길어지고 해저/유국 타이밍이 밀린다). 정적의 손은 detail에 이 대가를
명시하지만("그 국은 모두에게 1쯔모만큼 길어진다") 날치기의 description·detail에는 한 줄도 없다.
같은 성질의 `grave_rob` +1은 docs/25 #3에 이미 적혀 있어 **중복 가능성**이 있고, 설계상 의도된
대가일 수도 있어 확정으로 올리지 않는다.

## 의심 2. future_sight — 후로(펑·치) 직후의 '쯔모패 없는 순'에도 발동된다

`commonReject`(`future_sight.ts:139-156`, `lastDrawnTile` 미검사)는 `lastDrawnTile`을 보지 않는다. 같은 계열의
`take_back`·`pond_snatch`·`silent_swap`은 전부 "쯔모패가 있어야 한다"를 요구하고,
`full_hand_swap`은 이 창(후로 직후)에서 손패가 1장 모자라는 사고가 나서 명시적으로 막았다
(`full_hand_swap.ts:95-99`, docs/25 #1). future_sight는 3장을 내고 3장을 받으므로 **장수는 보존**되고
(210매치의 손패 엄밀 검사에서 위반 0), 다만 ① 쯔모가 없는 순에 `lastDrawnTile`이 새로 생겨
**후로 직후에 쯔모 화료 창이 열리고**, ② 그 순에 패산이 1장 더 줄어든다.
규칙상 문제인지 의도인지 판단할 근거를 찾지 못했고, **후로 직후 발동을 실제 판에서 잡아 두지도
못했다**(코드 판독만 했다) — 그래서 의심으로 둔다.

---

## 깨지지 않은 것 (같은 자리를 다시 파지 않도록)

- 패 총량·중복·유실: 210매치 0건. 손패 장수(후로·깡 환산 후 13/14) 위반 0건 —
  `full_hand_swap`이 후로한 상대를 털어 16장이 되던 docs/22 §7은 `util.sameHandSize`가
  `meldCountOf`까지 보게 되어 **재현되지 않는다**(안깡 1개 vs 펑 1개로 멘쯔 수를 맞춰도 정상).
- 리치 손 동결: 210매치에서 리치 선언 뒤 손패(tileId 기준, 멘쯔 변화 제외)가 바뀐 관측 **0건**.
  `red_five_touch`·`hand_swap3`(보유자 자신)·`suit_unify`·`take_back`·`pond_snatch`·`future_sight`는
  코드에도 `riichi: hand is frozen` 계열 가드가 있다(docs/21 D-2, docs/22 §14의 해소와 일치).
  `alchemist`·`tile_dyeing`·`bottom_deal`은 설계상 리치 중 허용(48차)이라 위반으로 세지 않았다.
- 사용 횟수: 좌석별 액션 카운터로 감시(게임당 `red_touch`≤1, `hand_swap`≤2, `swap3`≤2,
  `mono_world`≤1/2, `grave_rob`≤1/2, `pond_snatch`≤3, `alchemy`≤5, `tile_dye`≤5) — **초과 0건**.
  국·장을 넘겨도 초기화되지 않는다(게임 스코프 키가 정확하다). 반대로 국 스코프여야 하는
  `take_back`·`future_sight` 쿨다운, `silent_swap`·`hand_swap3`의 국당 1회는 국이 바뀌면
  정확히 풀린다.
- 크래시·훅 예외(`effectErrors`) 0건, 소프트락(타임아웃) 0건.

## 이 보고서의 결함이 **아닌** 것 (혼동 방지)

무작위 스윕 3건에서 공용 하네스의 `SCORE_DRIFT_UNEXPLAINED`(점수 총합 증가)가 떴다
(`seed=50104/50143/50169`, delta 2900·4000·3900). 셋 다 **silent_swap 보유자가 낀 정산**이고,
`silent_swap`(+2판)·`future_sight`(스택당 +1판)의 화료 보너스는 코드 주석이 명시하는 **뱅크 지급**
(상대가 더 내지 않고 총합이 늘어난다)이다. 스윕 도중 공용 `harness.ts`가 갱신되면서 이 판정이
인라인 → 매치 종료 후 대조로 바뀌었고, 위 3건은 **갱신 전 프로세스**가 남긴 것이다.
회계 규약 자체는 내 도메인(hand)이 아니라 점수/뱅크 쪽 판단이라 결함으로 올리지 않는다.

## 파일

```
qa-lab/hand-a/checks.ts                    도메인 불변식 (패 총량·손패 장수 엄밀·리치 동결)
qa-lab/hand-a/run.ts                       드래프트 off + 스크립트 에이전트를 받는 러너
qa-lab/hand-a/agent.ts                     결정적 스크립트 에이전트
qa-lab/hand-a/sweep2.ts                    12종 단독 강제 스윕 (+사용 횟수 감시)
qa-lab/hand-a/sweep_pairs.ts               66쌍 조합 스윕 (+각인 불변식)
qa-lab/hand-a/sweep_random.ts              무작위 2~3종 대량 스윕
qa-lab/hand-a/repro_grave_rob_furiten.ts   확정 1 (인자로 pond_snatch 대조군)
qa-lab/hand-a/repro_silent_swap_furiten.ts 확정 2
qa-lab/hand-a/repro_future_sight_peek.ts   확정 3
qa-lab/hand-a/repro_swap3_stuck.ts         확정 4
qa-lab/hand-a/repro_red_engrave.ts         확정 5
```
