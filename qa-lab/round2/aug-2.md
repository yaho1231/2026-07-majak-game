# 증강 2군 (eternal_dealer … mixed_triplet) — aug-2

## 요약

담당 28종 전수. **확정 10건**(🔴 5 · 🟠 3 · 🟡 2) · **의심 8건** · 기각 2건.

- 방법: 28개 소스 정독 → 카드 문구를 불변식으로 바꿔 «의심 목록» 작성 →
  의심 지점만 `craft` 크래프트 상태로 단독 재현. 재현 스크립트 9종은
  `qa-lab/round2/aug-2/` 에 있고 전부 `tsx` 로 즉시 돌아간다.
- 광역 스위프(`qa-lab/round2/aug-2/sweep.ts` — 28종 × 좌석1·2·중복보유, 페르소나 혼합)와
  불변식 프로브(`probe1.ts` — 횟수 상한·무적 방총·모래시계 턴·누명 명의·카르마 제로섬·
  잭팟 배수)를 돌렸다. 스위프는 **180판 완주 — crash 0 / effectError 0 / violation 0**.
  이번 라운드의 확정은 **전부 정적 대조 + 조립 상태 재현**에서 나왔다 —
  무작위 대국으로는 이 조건들이 잘 안 겹친다.
- 가장 잘 먹힌 축은 aug-3와 같은 **형제 증강 대조**였다: 10건 중 7건이
  «다른 증강에서 이미 해결해 둔 문제가 이 증강에만 빠져 있는» 형태다.

### 우선순위 (배포 관점)

| # | 증강 | 한 줄 | 급 |
|---|---|---|---|
| 6 | `joker` | 리치 중 발동 → 고정 대기가 2종 → 34종 | 🔴 규칙 붕괴 |
| 8 | `last_stand` | 취소 후 재리치 → 영구 후리텐 세탁 + 일발 재장전, 순비용 0 | 🔴 규칙 붕괴 |
| 7 | `free_riichi_discard` | 숨은 리치가 상대에게 깨지면 그 국이 통째로 벽돌 | 🔴 소프트락급 |
| 1 | `full_hand_swap` | 깡↔퐁 조합에서 손패가 영구히 ±1장 | 🔴 물리 법칙 |
| 2 | `full_hand_swap`·`hand_swap3` | 강탈·교환으로 만든 손에 천화 48,000 | 🔴 점수 |
| 5 | `honor_return` | 배패를 고쳐 놓고 천화 게이트 열림 (`regret` 도 같다) | 🟠 점수 |
| 3·4 | `foresight` | 깡 한 번에 재배열 증발 / 예언이 유령 패를 가리킴 | 🟠 |
| 9·10 | `jackpot`·`giant_god` | 카드 문구 ↔ 동작 불일치 | 🟡 |

### 덜 본 범위 (정직하게)

- 클라이언트 FX·컷인 쪽은 거의 못 봤다. `full_hand_swap` 의 «손패 13장이 통째로
  바뀌는데 컷인이 없다» 는 이미 `docs/30 P1-3` 에 있어 다시 보고하지 않았다.
- 스위프는 augment당 6판(총 180판) **완주했고 전부 무결**이다 — 두 좌석 동시 보유·담당 증강
  2개 조합도 그 안에 들어 있다. 즉 **무작위 대국만으로는 이번 확정 10건이 하나도 안 잡힌다.**
  판 수를 더 늘리는 것보다 형제 대조·조립 상태 재현이 값이 크다는 것이 이번 라운드의 결론이다.
  불변식 프로브(`probe1.ts`)는 보고 시점에 아직 도는 중이고, 완주분(eternal_dealer…karma)까지 findings 0.
- 정산 인터셉터 단계 순서(`SETTLE_STAGE`) 간 상호작용은 `jackpot`·`let_it_ride`·
  `eternal_dealer` 세 개만 대조했다.

---

## 확정 1. 🔴 통째로 바꾸기 — 후로 종류가 다르면 **손패 장수가 영구히 한 장 늘어난다**

- 위치: `packages/content/src/augments/full_hand_swap.ts` (`handSwapAction.validate` 의
  `sameHandSize` 호출) → `packages/content/src/util.ts:227-242` (`sameHandSize`)
- 기대: 손패를 통째로 맞바꾸는 증강이라면 교환 뒤에도 양쪽 손패 장수가 규칙값
  (`14 − 멘쯔수×3`)을 지켜야 한다. 카드도 "손패 장수가 다른 상대는 지정할 수 없다"고
  약속한다.
- 실제: `sameHandSize` 는 `deal.handSize` 와 **멘쯔 개수**만 비교한다.
  그런데 손에서 빠지는 장수는 멘쯔 종류마다 다르다 — 깡은 3장(안깡은 4장), 퐁·치는 2장.
  멘쯔 개수가 1로 같아도 깡 보유자의 손패는 10장, 퐁 보유자는 11장이다.
  보유자가 깡(손패 10 + 영상 쯔모 1 = 11), 대상이 퐁(11)이면
  `toWall`=10(쯔모패 제외한 내 손), `steal`=11(상대 손 전부) 이 되어
  보유자 손패가 **11 + 쯔모 1 = 12장**(정상 11장)이 된다.
  버린 뒤에도 11장이 남아 **그 국 내내 유효 14장**으로 논다.
- 재현: `tsx qa-lab/round2/aug-2/r_fullswap.ts`
  ```
  before: p3 hand= 11 melds= 1 | p1 hand= 11 melds= 1 | turnCount= 0 wall= 67
  submit ok= true err= undefined
  after : p3 hand= 12 melds= 1 → eff= 15
  after : p1 hand= 11 melds= 1 → eff= 14
  BUG: p3 손패 12장 (정상 11장)
  ```
  (p3=깡 1개 보유자, p1=퐁 1개 대상.)
  **첫 바퀴에 충분히 만들어진다.** `turnCount` 는 오야의 쯔모에만 오르므로 첫 바퀴 내내 1이고,
  깡은 영상 쯔모가 붙어 `lastDrawnTile` 도 채워진다("치·퐁 직후" 가드에 걸리지 않는다).
  가장 쉬운 경로는 **자가(오야가 아닌 사람)의 안깡** — 배패에 같은 패 3장 + 첫 쯔모로 안깡을 치면
  손패 10 + 영상 1 = 11장이 되고, `turnCount` 는 오르지 않아 그대로 강탈 창 안이다.
  대상은 첫 바퀴에 퐁을 한 사람이면 된다. 반대 조합(보유자 퐁 11 / 대상 깡 10)이면
  보유자가 **10 + 쯔모 1 = 11장**, 정상 12장보다 한 장 모자란 벽돌 손이 된다.
- 영향: 손패 한 장 초과는 마작에서 즉시 촌보(다마텐 불가·화료 불가) 사유다. 여기서는
  검출도 정정도 없이 **한 장 많은 손으로 화료까지 간다** — 텐파이 속도가 통째로 앞선다.
- 제안 수정: `sameHandSize` 를 멘쯔 개수 대신 **실제 손패 장수**(`handIdsOf(...).length`,
  쯔모패 보정 포함) 비교로 바꾸거나, `full_hand_swap` 쪽에서 교환 후 장수가 규칙값과
  같은지 한 번 더 확인한다.

## 확정 2. 🔴 통째로 바꾸기 · 등가교환 — **강탈·교환으로 완성한 손에 천화(48,000)가 붙는다**

- 위치: `packages/content/src/augments/full_hand_swap.ts`,
  `packages/content/src/augments/hand_swap3.ts` — 둘 다 `handAlteredMark` 를 남기지 않는다.
- 기대: 이미 정해진 규약이다(`docs/37_AUGMENT_FIX_LOG_2026-08-20.md` #22) —
  "천화·지화는 **배패가 첫 쯔모 시점에 이미 완성돼 있었다**는 사실에 붙는 역만"이므로,
  증강이 손패를 고치면 국 스코프 표식 `handAltered:byAugment:…`를 남겨
  코어(`packages/core/src/mahjong/flow/helpers.ts:811,818`)의 게이트를 닫는다.
  형제 증강 8종이 전부 그 한 줄을 갖고 있다 — `table_flip` `silent_swap` `genesis`
  `grave_rob` `future_sight` `dead_wall_master` `pond_snatch` `suitUnifyCore`
  (`even_world` `three_dragons_will` `tile_split` 은 `handAlteredKey` 직접 사용).
- 실제: `grep -rn handAltered packages/content/src/augments/` 에 `full_hand_swap`과
  `hand_swap3` 이 **없다**. 두 증강 다 발동 창이 천화 창과 정확히 겹친다 —
  통째로 바꾸기는 `turnCount<=1`(=국의 첫 순)이 아예 발동 조건이다.
  그래서 "상대 배패가 마침 완성형이면 그것을 강탈해 천화"가 확률이 아니라 **선택**이 된다.
  (#22 수정문이 왕패의 주인을 두고 지적한 바로 그 구조다.)
- 재현:
  - `tsx qa-lab/round2/aug-2/r_tenhou.ts` (통째로 바꾸기)
    ```
    swap ok= true
    p0 hand after swap = 14 drawn= 36
    winner p0 points 48000 yakuman 1 yaku tenhou
    deltas { p0: 48000, p1: -16000, p2: -16000, p3: -16000 }
    ```
  - `tsx qa-lab/round2/aug-2/r_tenhou_swap3.ts` (등가교환 — 3장만 바꿔도 같다)
    ```
    aim ok= true / give ok= true / take ok= true
    p0 hand: man1..man9 pin5 pin5 sou6 sou7 sou8
    winner p0 points 48000 yaku tenhou
    ```
- 영향: 순수 48,000점 오지급. 한 판으로 승부가 끝난다. #22가 "점수가 크게 틀린다"고
  적어 둔 위험이 이 두 증강에서만 그대로 살아 있다.
- 제안 수정: 두 리듀서의 `augmentData` 갱신에 `...handAlteredMark(state, holder)`
  (등가교환은 교환 당사자 **양쪽**) 한 줄을 더한다. 형제 8종과 같은 형태다.

## 확정 3. 🟠 예지 — 오야가 깡을 치면 **방금 연 재배열이 그 자리에서 사라진다** (+쿨다운도 짧아진다)

- 위치: `packages/content/src/augments/foresight.ts` — `cooldownLeft` / `revealedThisTurn`
  이 `state.round.turnCount` 를 기준으로 삼는다.
- 기대: 카드 — "발동하면 그 순간 패산 다음 4장이 공개되고 **드래그로 순서를 바꾼다**.
  바꾸지 않거나 순 시간이 지나면 그대로 확정된다." 즉 발동한 그 턴 안에서는 재배열이
  반드시 열려 있어야 하고, 쿨다운은 "4순"이어야 한다.
  형제 증강이 이 함정을 **이미 문서까지 남기고 피했다** —
  `future_sight.ts:95-100`:
  > ⚠ 순을 `state.round.turnCount`나 버림 이력 길이로 세면 안 된다. 전자는 **오야가
  > 쯔모할 때마다** 올라 깡 한 번에 같은 순이 두 순으로 갈렸고 (2026-08-01 사용자 보고:
  > "깡 치면 한 번 더 사용 가능해지는 듯")
  `take_back` 도 `discardCount` 로 옮겨 갔다(`take_back.ts:58`).
- 실제: `turnCount` 는 `TILE_DRAWN` 리듀서에서 **오야의 쯔모마다** 오르고,
  영상패(`p.rinshan`)를 예외로 두지 않는다
  (`packages/core/src/mahjong/flow/flowEvents.ts:412` — `turnCount + (isDealer ? 1 : 0)`).
  그래서 오야가 예지를 발동한 **바로 그 순**에 깡을 치면 영상 쯔모로 `turnCount` 가 +1 되어
  ① `revealedThisTurn` 이 거짓이 되고 → 재배열 후보 24개(전 순열)가 **0개**로 사라진다.
     `orderUsedKey` 는 세워진 적이 없으니 "국에 1회"를 쓴 것도 아닌데, 이번 발동분은 증발한다.
  ② `cooldownLeft` 가 4 → 3으로 줄어 **깡 한 번당 쿨다운이 1순씩 짧아진다**.
- 재현: `tsx qa-lab/round2/aug-2/r_foresight_kan.ts` (p0=오야, 손패 `1111z…`, 안깡)
  ```
  turnCount = 0
  reveal ok= true
  turnCount = 0 | 재배열 후보 = 24 | 쿨다운 잔량 = 4
  ankan ok= true
  rinshan ok= true
  turnCount = 1 | 재배열 후보 = 0 | 쿨다운 잔량 = 3
  ```
- 영향: 예지는 "발동 = 소진, 취소 불가"인 증강이다. 오야가 깡을 낀 순간
  **소진만 되고 능력은 못 쓴 채** 드래그 모달이 죽는다 — 화면에 이유도 없다
  (`reorderSpent` 는 안 켜져 있으므로 pill도 "소진"이라 말하지 않는다).
  반대로 쿨다운은 깡마다 공짜로 줄어든다.
- 제안 수정: 예지도 `future_sight` 처럼 순 기준을 **보유자의 `discardCount`** 로 옮긴다.
  최소한 `revealTurnKey` 비교만이라도 turnCount 대신 "발동 후 아직 버리지 않았다"로 바꾼다.

## 확정 4. 🟠 예지 — 패산 앞을 **쯔모가 아닌 경로로** 먹으면 예언이 유령 패를 계속 가리킨다

- 위치: `packages/content/src/augments/foresight.ts` — `ctx.reaction(TILE_DRAWN, …)` 하나뿐.
- 기대: 파일 주석이 스스로 약속한다 — "이미 남의 손에 들어간 패를 '다음 4장'으로 국 끝까지
  보여 준다 — 정보 증강이 틀린 정보를 확신 있게 주는 셈이다(docs/25 정보 #5).
  **삼세 예지가 같은 문제로 2026-08-01에 고친 방식을 그대로 쓴다.**"
  그런데 삼세 예지가 실제로 쓴 방식은 TILE_DRAWN 하나가 아니라 **매 이벤트 재계산**이고,
  거기 주석에 이유까지 적혀 있다(`triple_peek.ts:199-215`):
  "증강이 새로 생길 때마다 같은 구멍이 다시 열리므로, **매 이벤트마다** 다시 계산하고…"
- 실제: 예지는 `TILE_DRAWN`(비영상)에서 목록 앞을 한 장 깎을 뿐이다. 패산 앞을
  TILE_DRAWN 없이 가져가는 경로가 여럿 있다 —
  `future_sight`(앞 3장 교환), `full_hand_swap`(앞에서 13장 refill), `meld_dissolve` 등.
  그 뒤 예언 채널은 **이미 남의 손에 있는 패**를 "다음 4장"이라고 계속 보여 준다.
- 재현: `tsx qa-lab/round2/aug-2/r_foresight_stale.ts` (p0이 `foresight`+`future_sight`)
  ```
  wall front  : [ 'pin8', 'pin8', 'pin9', 'pin9' ]
  reveal ok= true
  peek        : [ 'pin8', 'pin8', 'pin9', 'pin9' ]
  arm ok= true / exchange ok= true
  wall front now: [ 'pin9', 'pin9', 'pin9', 'sou1' ]
  peek still    : [ 'pin8', 'pin8', 'pin9', 'pin9' ]   ← 셋이 틀렸다
  ```
- 영향: 정보 증강이 **틀린 정보를 확신 있게** 준다. 게다가 재배열은 그 잘못된 표시 위에서
  확정된다 — 드래그로 옮긴 것은 화면의 pin8이 아니라 실제 패산의 pin9다.
  자기 증강 둘(예지+미래를 보는 자)만 들어도 재현된다.
- 제안 수정: 삼세 예지처럼 `ctx.reaction("*", …)` 에서 `frontIds(state)` 로 다시 계산해
  채널을 덮어쓴다(값이 같으면 emit 생략 — 삼세 예지가 이미 그 형태다).
  "발동 시점 스냅샷"이 아니라 "지금 패산 앞 4장"이 카드가 약속한 것이기도 하다.

---

## 확정 5. 🟠 귀환(honor_return) — **다음 국 배패를 고쳐 놓고** 천화·지화 게이트를 닫지 않는다

- 위치: `packages/content/src/augments/honor_return.ts` — `ctx.reaction(ROUND_STARTED, …)`
  (`tileKindChanged(changes)` 를 내면서 `handAlteredMark` 를 남기지 않는다)
- 기대: 확정 2와 같은 규약(`docs/37` #22). 이 증강은 그중에서도 가장 노골적이다 —
  **배패 자체를 다시 쓴다.**
- 실제: 코어에서 `ROUND_STARTED` 리듀서가 곧 `setupRound`(배패)이고
  (`packages/core/src/mahjong/flow/flowEvents.ts` `registerFlowReducers`),
  증강 리액션은 그 **뒤**, 오야의 첫 쯔모는 그보다 **더 뒤**다.
  즉 주입은 천화·지화 창 한복판에서 일어나는데 게이트가 열린 채로 남는다.
- 재현: `tsx qa-lab/round2/aug-2/r_honor_tenhou.ts`
  ```
  배패 전 손패 : man1 … pin2 pin2
  주입 전 handAlteredByAugment(p0) = false
  sys.startRound ok= true
  주입 후 손패 : dragon1 dragon1 dragon1 wind1 pin8 pin9 wind2 wind2 pin1 sou6 man5 sou7 pin6
  주입 후 handAlteredByAugment(p0) = false      ← 배패 4장을 고쳐 놓고도 게이트가 열려 있다
  BUG: 배패를 고쳐 놓고 천화·지화 게이트가 열려 있다
  ```
- 영향: 확정 2와 같다(천화 48,000 / 지화 32,000 오지급). 확률은 낮지만
  **되받는 자패가 커쯔 하나를 통째로 채워 주므로** 순수 배패보다 완성 확률이 오히려 높다.
- 제안 수정: `rc.emit(augmentDataSet(handAlteredKey(rc.state, holder), true))` 한 줄
  (또는 `handAlteredMark`)을 `tileKindChanged` 옆에 붙인다.
- ⚠ 내 담당은 아니지만 **같은 크로스국 주입 패턴인 `regret`(미련)도 `handAltered` 가 0건**이다
  (`grep -c handAltered packages/content/src/augments/regret.ts` → 0). 함께 고치는 것이 맞다.

## 확정 6. 🔴 조커(joker) — **리치를 걸어 둔 뒤에 켤 수 있다.** 고정돼 있어야 할 대기가 2종 → 34종이 된다

- 위치: `packages/content/src/augments/joker.ts` — `jokerAction.validate`
  (phase·턴·쿨다운·중복만 본다. 리치 검사가 없다)
- 기대: 리치는 "선언 시점의 텐파이·대기로 손이 잠긴다"가 전부인 규칙이다.
  형제 증강이 예외 없이 그 규약을 지키고, `honor_return.ts` 는 그 규약을 문장으로 적어 뒀다:
  > 같은 계열(giant_god·tile_split·genesis·even_world)과 같은 규약 —
  > **리치 중에는 손패를 건드리는 액티브를 막는다**(docs/21 D-2).
  `full_hand_swap` 은 자기 리치를 빠뜨렸다가 QA에서 잡혀 고쳤고
  (`docs/37` #21), `future_sight.commonReject` 에도 같은 한 줄이 있다.
  조커의 카드(description·detail)에는 리치 이야기가 **한 줄도 없다** —
  "리치 중에도 켤 수 있다"는 약속도 없다.
- 실제: 리치 중에 `joker_call` 이 그대로 통과한다. 조커는 `scoring.wildKinds` 를 켜고
  그 규칙은 `scoringOptionsOf` 를 통해 **화료·텐파이·대기·후리텐 전부**에 흘러가므로,
  리치로 잠겨 있어야 할 대기가 그 자리에서 통째로 다시 계산된다.
- 재현: `tsx qa-lab/round2/aug-2/r_joker_riichi.ts`
  (p0 = 리치 중, 손패 `234m 567m 234p 55p 白白`)
  ```
  리치 상태 = true
  발동 전 대기 = pin5,dragon1
  리치 중 joker_call ok = true
  발동 후 대기 = man1..man9, pin1..pin9, sou1..sou9, wind1..wind4, dragon1..dragon3   (34종)
  ```
- 영향: 리치를 걸어 «싼 대기»로 압박해 두고, 상대가 그 두 종만 피해 밀어붙이는 순간
  조커를 켜서 **34종 아무 패로나 론**한다. 상대가 원리적으로 대응할 수 없는 화료다.
  게다가 조커가 넓힌 대기는 후리텐도 만들지 않으므로(카드에 명시된 사양) 부작용도 없다.
- 부수 효과(코드 근거만, 실측 안 함): `FlowController.ts` 의 리치 강제 쯔모기리 자동 진행은
  `options.length === 1` 일 때만 돈다. 조커를 아직 안 켠 보유자는 리치 중 매 순
  `joker_call` 후보가 남아 자동 진행이 사라지고 **매 순 프롬프트가 뜬다**.
- 제안 수정: `jokerAction.validate` 에 형제 증강과 같은 한 줄을 넣는다 —
  `if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: hand is frozen";`
  (`holderTurnOptions` 쪽도 같이 걸러 두면 위 자동 진행 문제도 함께 사라진다.)

## 확정 7. 🔴 자유 선언(free_riichi_discard) — 숨은 리치가 **상대에게** 깨지면 스냅샷만 남아 그 국이 벽돌이 된다

- 위치: `packages/content/src/augments/free_riichi_discard.ts` —
  `snapKey` 스냅샷 + `hand.winTileIds` 모디파이어, 그리고 `conflicts: ["last_stand","palm_flip"]`
- 기대: 이 파일이 위험을 **이미 정확히 알고 있고 문장으로 적어 뒀다**:
  > A급 파괴(docs/25 §conflicts): 리치를 취소해도 선언 시점 손패 스냅샷이 남아
  > `hand.winTileIds`를 그 국 내내 덮는다 → 화료·후리텐·유국 텐파이가 옛 손으로
  > 계산되어 **그 국이 통째로 벽돌**이 된다. 리치를 푸는 두 증강을 배제한다.
- 실제: `conflicts` 는 **같은 사람의 드래프트 안에서만** 작동한다. 리치를 푸는 경로가
  하나 더 있고 그것은 **상대의** 증강이 낸다 —
  `stealthBreak.ts` 의 `STEALTH_RIICHI_BROKEN`(`riichi: null` 로 내린다)이며,
  `full_hand_swap` · `hand_swap3` · `seat_swap` 이 그것을 낸다.
  게다가 `riichiBlocksSwap` 은 **숨은 리치를 일부러 대상으로 허용**하고,
  `stealth_riichi.ts` 의 conflicts 주석은 `free_riichi_discard` 를
  > 반대로 **잠그지 않는 것**: `free_riichi_discard`·`late_double`·…
  이라고 명시해 두어 조합이 열려 있다.
  스냅샷은 `riichi` 필드가 아니라 자기 국 스코프 키에 살아 있으므로 해제와 무관하게 남는다.
- 재현: `tsx qa-lab/round2/aug-2/r_free_snapshot_brick.ts`
  (p0 = `stealth_riichi` + `free_riichi_discard`, p1 = `full_hand_swap`)
  ```
  숨은 리치 ok = true
    riichi = true | 스냅샷 = 13 장   (free_riichi_discard:snap:1-1-0:p0#round)
  p1의 통째로 바꾸기 ok = true
    p0 riichi = null
    스냅샷 남아 있음 = 13 장
    그중 p0 손에 없는 패 = 13 장 (p1 손으로 넘어간 것 = 13 장)   ← 전부 상대 손에 있다
    hand.winTileIds(p0) = 13장 옛 손패
  BUG: 리치는 풀렸는데 스냅샷이 남아, 화료·후리텐·유국 텐파이가 남의 손에 있는 패로 계산된다
  ```
- 영향: 피해자는 리치가 풀린 것만 통보받고(그것도 자기만 안다) 새 손 13장을 받는다.
  그런데 그 국 내내 **화료 판정·후리텐·유국 텐파이가 지금 상대 손에 있는 옛 13장**으로
  돌아간다 — 실제 손이 무엇이 되든 화료가 성립하지 않고, 유국 텐파이도 잡히지 않는다.
  덤으로 `call.kan.enabled` 모디파이어가 "스냅샷이 있으면 깡 불가"라서 리치가 풀렸는데도
  깡만 계속 막힌다. 능력(`free_discard`)은 `riichi != null` 을 요구하므로 이미 죽어 있다.
  즉 **얻는 것 없이 그 국을 통째로 잃는다** — 자기 파일 주석이 "A급 파괴"라 부른 바로 그것이다.
- 제안 수정: `STEALTH_RIICHI_BROKEN` 리액션을 `free_riichi_discard` 에 하나 붙여
  스냅샷 키(와 `free_declare_waits` 뷰)를 함께 지운다. 리치가 사라졌으면 스냅샷도
  살 이유가 없다 — `hand.winTileIds` 가 물리 손패로 돌아가면 그 뒤는 평범한 손이 된다.
  (또는 `hand.winTileIds` 모디파이어가 `riichi != null` 을 함께 확인하게 한다.)

## 확정 8. 🔴 승부수(last_stand) — 리치 취소 뒤 **같은 국에 리치를 다시 걸 수 있다** (순비용 0에 일발 재장전 + 리치 후리텐 세탁)

- 위치: `packages/content/src/augments/last_stand.ts` — `cancelRiichiAction` / `RIICHI_CANCELED` 리듀서
  (`riichi: null`, `riichiFuriten: false` 로 되돌린다)
- 기대: 카드는 이것을 **폴드 수단**으로만 서술한다 —
  "(매 국 1회) … 냈던 리치봉을 돌려받고 리치 후리텐도 풀려 **다시 자유롭게 버릴 수 있다**."
  "다시 리치를 걸 수 있다"는 말은 description·detail 어디에도 없다.
  표준 룰에서 리치는 국당 한 번이고, 리치 중 오름패를 넘겨 걸린 리치 후리텐은
  **그 국이 끝날 때까지 회복 수단이 없다**.
- 실제: 코어의 재리치 가드는 `standardActions.riichiAction.validate` 의
  `if (rs?.riichi != null) return "already riichi"` **하나뿐**이다. 취소로 `riichi` 가
  null이 되는 순간 그 가드가 열린다. `last_stand` 의 "국당 1회" 카운터는 *취소* 횟수만 막는다.
  1,000점을 돌려받고 1,000점을 다시 내므로 **순비용 0**인데,
  ① `ippatsu: true` 로 일발이 새로 장전되고
  ② 취소 때 함께 내려간 `riichiFuriten` 이 그대로 false로 남아 **영구 후리텐이 세탁된다**.
- 재현: `tsx qa-lab/round2/aug-2/r_laststand_rerichi.ts`
  ```
  리치 중 + 후리텐   riichi={"double":false,"ippatsu":false,...,"cost":1000}
                     riichiFuriten=true pot=1000 score=24000
  ① 리치 취소 ok = true
  취소 후            riichi=null  riichiFuriten=false pot=0 score=25000
  ② 같은 국 재리치 ok = true
  재리치 후          riichi={"double":false,"ippatsu":true,"discardIndex":0,...,"cost":1000}
                     riichiFuriten=false pot=1000 score=24000
  BUG: 같은 국에 리치를 다시 걸었다 — 일발이 새로 붙고 리치 후리텐이 세탁됐다 (순비용 0)
  ```
- 영향: 폴드 카드가 **공격 카드**가 된다. 리치를 걸고 → 오름패를 일부러 넘겨(또는 실수로 넘겨)
  영구 후리텐이 걸린 뒤 → 취소 → 재리치 한 번으로 후리텐이 사라지고 일발까지 다시 붙는다.
  마작에서 후리텐은 되돌릴 수 없는 벌인데 그 유일한 우회로가 카드 설명 없이 열려 있다.
  (`qa-lab/findings/defcall.md:159` 는 취소 자체만 확인하고 "정상"으로 닫았다 — 재리치는 안 봤다.)
- 제안 수정: 취소가 남기는 국 스코프 이력(예: `last_stand:canceled:{h}#round`)을 세우고
  `riichi.enabled`(또는 `win.blockedYaku` 와 같은 자리)에서 그 이력이 있으면 재리치를 막는다.
  최소한 재리치에는 `ippatsu: false` 를 강제하고 `riichiFuriten` 을 복원해야 한다.

## 확정 9. 🟡 잭팟(jackpot) — "그 국에 얻는 점수에 배수"라고 적어 놓고 **유국 획득에는 안 붙는다**

- 위치: `packages/content/src/augments/jackpot.ts` — `settleInterceptor(SETTLE_STAGE.Multiply, …)` 의
  `if (p.outcome !== "win") return event;`
- 기대: description — "**그 국에 얻는 점수**(공탁 회수분 제외)에 뽑힌 배수가 곱해지며";
  detail — "그 국의 **정산에서 자신의 획득 점수가 양수이면** 뽑힌 배수만큼 곱해진다".
  어디에도 "화료했을 때만"이라는 말이 없다.
- 실제: 화료 정산(`outcome === "win"`)에만 적용된다. 그래서
  **유국 텐파이 수령(+1,000~3,000) · 유국만관(+8,000) · 유국역만**이 전부 배수 밖이다.
  3배를 뽑은 국이 황패유국으로 끝나면 카드 문구와 달리 아무 일도 일어나지 않는다.
  (거꾸로 0.5배 꽝도 유국에서는 손해가 없어, 도박의 양쪽이 함께 무뎌진다.)
- 근거: 바로 위 주석이 이 컷의 이유를 "유국 노텐 **벌부**가 남의 룰렛으로 달라지면 안 된다"
  (QA score-a 확정 3)라고 적는데, **그 목적은 바로 다음 줄 `if (d <= 0) return event`
  (무페널티)가 이미 완전히 달성한다.** 벌부는 언제나 음수 delta이기 때문이다.
  `outcome` 컷은 벌부뿐 아니라 **양수 획득까지 함께** 밀어냈다.
- 영향: 점수 오지급은 아니고 **문구 ↔ 동작 불일치**다. 다만 "그 국에 얻는 점수"라는
  약속을 믿고 룰렛을 굴린 플레이어가 유국에서 배신당한다.
- 제안 수정: 둘 중 하나. ① `outcome !== "win"` 컷을 지운다(무페널티 가드는 `d <= 0`이 맡는다).
  ② 카드 문구를 "**화료로** 얻는 점수"로 좁힌다.

## 확정 10. 🟡 진짜 신(giant_god) — **후로가 하나라도 있으면 각성이 영영 불가능**한데 카드에 그 말이 없다

- 위치: `packages/content/src/augments/giant_god.ts` — `pickHandOut` / `canAwaken`
  (validate 사유: `"need at least 13 in hand besides the drawn tile"`)
- 기대: 카드가 조건을 딱 하나로 못 박는다 — "13종이 모두 **내 바닥**에 깔린 뒤 내 순이 오면
  버튼이 켜지고". detail은 "남의 바닥은 세지 않는다"까지 세세히 적으면서 **후로·깡 이야기가
  한 줄도 없다**. (형제 `meld_dissolve` 는 "깡은 대상이 아니다"를 명시한다.)
- 실제: `pickHandOut` 이 «쯔모패를 뺀 손패 13장»을 요구한다. 후로가 하나만 있어도 손패는
  10장(+쯔모 1)이라 13장을 못 채우고, `canAwaken` 이 false로 굳는다.
  즉 **한 번이라도 울면 요구패 13종을 다 흘려도 버튼이 나타나지 않는다.**
  결과는 (국사가 멘젠 전용이라) 게임적으로 정당하지만, 카드가 그것을 말하지 않아
  플레이어는 "13종 다 깔았는데 왜 안 되지"만 겪는다.
- 영향: 문구·UX. 요구패를 흘리는 플레이 자체가 이 카드의 전부라, 조건을 모르고 울면
  그 국의 계획이 통째로 무산된다.
- 제안 수정: detail에 "치·퐁·깡을 한 번이라도 하면 그 국에는 각성할 수 없다" 한 줄.
  (`mixed_nine_gates` 가 같은 성질의 제약을 카드에 이미 적어 두었다.)

---

## 의심 (재현 못 했거나 조건이 좁다)

### 의심 1. 🟠 무덤 도굴(grave_rob) — «확정 화료 버튼»인데 화료가 강제되지 않아, 무응답 한 번에 매치 1회가 증발한다
- 위치: `packages/content/src/augments/grave_rob.ts` — `EVENT` 리듀서가 그 자리에서
  `[usesKey(p.holder)]: counterOf(...) + 1` 로 횟수를 태운다.
- 카드: "파내 **그대로 화료한다**", "화료가 되는 패만 후보로 제시 … 막힌 상태가 원천적으로
  생기지 않는다". 파일 머리 주석도 "확정 화료 버튼"이라고 부른다.
- 실제: 도굴과 화료는 **별개의 두 액션**이다. 도굴 뒤 `FlowController.turnPrompt` 가
  다시 열리며 `win` **과 함께 `discard`** 를 제시한다(코드 확인). 그리고 무응답 폴백은
  `HanchanController.safeDecide` 의
  `opts.find(pass) ?? [...opts].reverse().find(o => o.type === "discard") ?? opts[0]`
  — **`win` 보다 `discard` 를 먼저 고른다.** 즉 도굴 직후 시간이 끊기면
  동풍전 1회뿐인 리소스가 화료 없이 타고, 파낸 패는 자기 바닥으로 흘러 그 종류에 후리텐까지 걸린다.
- 미확인: 실제 대국에서 그 타임아웃 구간을 재현하지 않았다(코드 경로만 확인).
- 제안: 도굴 이벤트가 곧바로 `win` 을 함께 내거나, 카운터를 화료 성사 시점으로 옮긴다.

### 의심 2. 🟡 진짜 신(giant_god) — 각성이 `discardedKinds` 를 다시 써서 **유국만관 판정의 길이 등식**을 깬다
- 코어 `standardActions.nagashiManganSeats` 는 `강 장수 === discardedKinds.length` 로
  "울려 나간 적 없음"을 판정한다. 각성 리듀서는 강에서 국사 13장을 빼고 손패 13장을 넣어
  **물리 강 길이는 유지**하면서, 이력은 `기존 이력의 비국사 + handOut 중 비국사` 로 다시 쓴다.
  손패에 요구패가 한 장이라도 있으면 그 장은 강에는 남고 이력에는 안 들어가 **등식이 깨진다** —
  전부 요구패만 흘린 손인데도 유국만관 자격을 잃는다.
- 형제 `meld_dissolve` 는 같은 성질의 부작용을 `nagashiBrokenKey` + `draw.nagashiMangan`
  모디파이어로 **명시적으로 보정**해 두었다. giant_god에는 그 보정이 없다.
- 미확인: 국사를 노리면서 유국만관까지 사정권인 손이 드물어 실제 판을 못 만들었다.

### 의심 3. 🟡 진짜 신(giant_god) — "증강이 요구패를 깔아 주지 않는다"가 참이 아니다
- detail: "**증강이 요구패를 깔아 주지 않는다 — 내가 손수 버려서 모아야 한다.**"
- `pickKokushiIds` 는 `state.zones[discardsZone(holder)]`(물리 강)만 본다. 그런데
  `frame_up`(누명)은 `creditTo` 로 **자기가 버릴 패를 남의 강에 실물로 심는다**.
  상대 누명 보유자가 요구패를 내 강에 심으면 그 한 장이 각성 조건에 그대로 계산된다.
- 미확인: 2국당 1장이라 실전 영향은 작고, 판으로 재현하지 않았다.

### 의심 4. 🟡 파혼(meld_dissolve) — 보충패가 `TILE_DRAWN` 없이 손에 들어온다
- `EVENT` 리듀서가 `zones[WALL].tileIds[0]` 을 직접 손으로 옮기고 `replaceDrawnTile` 로
  `lastDrawnTile` 만 세운다(장 자체는 정상 쯔모와 같은 장이라 순서 정합은 맞다).
  하지만 `TILE_DRAWN` 을 듣는 훅은 그 한 장을 못 본다 — 예: `giant_god` 의
  "다음 정상 쯔모를 오름패로" 예약, `foresight` 의 예언 소모(확정 4와 같은 뿌리),
  `temporaryFuriten` 자동 해제.
- 미확인: 두 증강을 동시에 든 판을 만들지 않았다.

### 의심 5. 🟡 자유 선언(free_riichi_discard) — `free_discard` 가 스냅샷 존재를 확인하지 않는다
- `freeDiscardAction.validate` 는 `riichi != null` 만 본다. 스냅샷(`snapshotOf`)은 안 본다.
  두 조건이 분리돼 있어, `TILE_DISCARDED{riichi:true}` 리액션을 놓친 채 리치 상태만 서는
  경로가 하나라도 있으면 «스냅샷 없이 리치 중 아무 패나 버리기»만 남아 대기가 그대로 깨진다.
- 미확인: 그런 경로를 실제로 찾지 못했다(증강 설치 시점이 국 경계라면 도달 불가).

### 의심 6. 🟡 무덤 도굴(grave_rob) — 파낸 패의 종류를 **전원 공개** 채널로 싣는다
- 후보 생성은 `visibleTileIdsIn(state, rules, holder, …)` 로 **보유자에게 보이는** 바닥만
  쓴다(안개 대응, 주석에 명시). 그런데 결과 공개는 `roundViewKey("*", …)` 다.
  안개 계열(`hidden_river`·`brief_fog`)이 걸린 국에서 "홀더에게는 보였지만 제3자에게는
  가려져 있던 바닥의 패"가 전원에게 종류째 드러날 수 있다.
- 미확인: 각 안개 증강의 뷰 규칙과 대조해 실제 성립하는 조합을 못 만들었다.

### 의심 7. 🟡 승부수(last_stand) — 다섯 중 유일하게 국 스코프 규약(`roundScopedKey`)을 안 쓴다
- `usedKey = \`last_stand:used:${h}\`` (게임 스코프) + `ROUND_STARTED` 수동 리셋.
  같은 계열은 전부 `roundScopedKey` 라 엔진이 자동으로 지운다. 재구성·리플레이·증강 재설치로
  리셋 리액션과 국 전환이 어긋나면 직전 국의 소진 플래그가 살아남을 수 있다.
- 미확인: 그 어긋남을 만드는 경로를 못 찾았다. 규약 위반 자체는 확정.

### 의심 8. 🟡 조커(joker) — 오야 첫 순 발동으로 천화가 붙을 수 있다
- `joker.ts` 는 `handAlteredMark` 를 쓰지 않는다. 조커는 패를 갈아 끼우지 않고 **해석만**
  바꾸므로 규약의 문자적 대상이 아니라고 읽을 수도 있다. 하지만 결과는 게이트가 막으려던
  것과 같다 — 오야가 첫 순에 켜서 미완성 배패가 조커로 완성되면
  `firstTurn` · 버림 0장이 그대로라 천화가 성립할 수 있다.
- 미확인: `buildWinContext` 를 조커 옵션이 켜진 채로 태워 보지 않았다. **설계 의도 확인 필요.**

---

## 기각한 가설 (기록용 — 다음 사람이 같은 길을 다시 파지 않게)

- **«작동하지 않는 버튼»(카르마 `karma_burn` · 미래를 보는 자 `future_arm`)** — 두 증강 모두
  `holderTurnOptions`가 발동 조건을 하나도 보지 않고 후보를 낸다
  (`tsx qa-lab/round2/aug-2/r_karma_deadbtn.ts`, `r_futuresight_deadbtn.ts` — 게이지 0·리치 중·
  쿨다운 중에도 후보가 1개 나온다). **그러나 버그가 아니다** —
  `FlowController.buildTurnPrompt` 가 증강 후보를 프롬프트에 넣기 전에 `validateOk`로 한 번 더
  거른다(`FlowController.ts`, "증강이 등록한 추가 턴 액션 (validate로 다시 걸러 합법인 것만 제시)").
  그래서 플레이어·봇에게는 애초에 뜨지 않는다. `invincible`이 같은 자리에 남긴 주석
  ("작동하지 않는 버튼")은 그 필터가 생기기 전의 이야기로 보인다.
- **커스텀 역의 무장해제 누출** — 같은 증강을 둘이 들면 역은 첫 설치자의 `instanceId`로
  등록되므로, 무장해제가 첫 설치자를 잠글 때 두 번째 보유자의 역까지 사라질 것으로 의심했다.
  `tsx qa-lab/round2/aug-2/r_yaku_disarm.ts` 로 `hidden_blade` 를 재현 시도 →
  **재현되지 않는다**(p1 무장해제 여부와 무관하게 p2의 숨은 칼날 6판 12,000점 유지).
  담당 증강의 커스텀 역 3종(`hidden_blade` `mixed_nine_gates` `eternal_dealer`)이 전부
  `yakuHolders` 집합 패턴을 쓰고 있어 보유자별로 갈린다.
