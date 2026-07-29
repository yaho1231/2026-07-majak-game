# 증강 시스템 잠재 오류 감사 (2026-07-29)

> **상태: 전량 수정 완료.** 아래 항목은 전부 고쳐졌고, 크래시 3건과 무장해제 게이트
> 3경로는 회귀 테스트로 고정했다(`packages/content/test/crash_regressions.test.ts`,
> `disarm_gates.test.ts`). 조합 스위프는 상시 테스트로 승격했다(`combo_sweep.test.ts`).
> 문서는 **무엇이 왜 잘못됐었는지**의 기록으로 남긴다 — 같은 실수를 반복하지 않기 위해서다.
> 수정 후 검증: 949개 테스트 통과 · core/content 타입체크 클린 ·
> 조합 스위프 1,248 반장전 + 드래프트 스위프 80게임 **무크래시**(수정 전 각각 5건·3건 사망).

대상: `packages/core/src/augment/**` + `packages/content/src/augments/**` 104종 + 클라이언트·서버 배선.

**기준선**: `tsc --noEmit` 통과, `vitest run` 938개 전부 통과. 아래는 전부 **기존 테스트가 잡지 못하는** 결함이다.

## 감사 방법

| 방법 | 규모 | 성과 |
|---|---|---|
| 정적 감사 (17개 유닛 × 다각 렌즈) | 205건 원시 발견 | 43건 적대적 검증 통과 |
| 경험적 조합 스위프 (4인 × 2증강, preset) | 1,872 반장전 | 크래시 1종 발견 |
| 경험적 드래프트 스위프 (실제 드래프트) | 80 게임 | 반장전 40판 중 **3판 사망** |
| 드래프트 추첨 불변식 | 60시드 × 2모드 × 3스테이지 × 4석 | 이상 없음 |
| 기계적 전수 대조 | conflicts id·카탈로그 등록·전역 상태 | 이상 없음 |

> 기존 크래시 스위프 테스트는 **증강 1개를 1명에게만 설치해 한 국만** 돌린다. 실제 게임은 4인 × 2증강 × 8국이므로, 아래 결함 다수가 구조적으로 테스트 밖에 있었다. 104종 중 **43종은 실게임 스위프 자체가 없다**.

---

## 🔴 크래시 — 매치가 죽는다

### 1. 누명(`frame_up`) — 심은 패를 누가 울면 엔진이 throw

- **위치**: [frame_up.ts:78](../packages/content/src/augments/frame_up.ts) → [flowEvents.ts:245-254, 296-301, 350](../packages/core/src/mahjong/flow/flowEvents.ts)
- **문제**: `TILE_DISCARDED` 리듀서는 패를 `discards:{creditTo}`로 옮기지만 `lastDiscard.player`는 **실제 버린 사람**으로 남긴다. `chi`/`pon`/`minkan`은 `CALL_MADE.from = lastDiscard.player`로 만들고, 리듀서가 `moveTiles(discards:{from} → melds)`를 호출한다. 패가 거기 없으므로 throw. `KAN_DECLARED`(`kan_open`, :350)도 동일.
- **재현**: 결정적 재현 성공 — `Accepted decision failed in engine: pon by p1 — Tile 8 is not in zone discards:p0`
- **실측 영향**: **정상 드래프트 반장전 40판 중 3판(7.5%)이 사망.** 동풍전은 사용 1회라 40판 완주.
- **주의**: [frame_up.ts:10-11](../packages/content/src/augments/frame_up.ts) 주석은 "다른 상대의 론 반응은 정상적으로 열린다"고 명시 — 후로 가능이 **의도된 설계**인데 구현이 못 버틴다. `ron`은 패를 옮기지 않아 정상.
- **수정**: `CALL_MADE`/`KAN_DECLARED` payload에 패가 실제 놓인 존 소유자를 싣거나, `lastDiscard`에 `zoneOwner`를 함께 남긴다.

### 2. 밥상 뒤엎기 × 무르기 — `lastDrawnTile`이 손에 없는 패를 가리킨다

- **위치**: [table_flip.ts:109-125](../packages/content/src/augments/table_flip.ts) × [take_back.ts:85](../packages/content/src/augments/take_back.ts)
- **문제**: `table_flip`이 쯔모패를 포함한 손패 전체를 패산에 반납하면서 `round.lastDrawnTile`을 갱신하지 않는다. `take_back.validate`는 `lastDrawnTile != null`만 보고 **손에 있는지 확인하지 않아** 리듀서의 `moveTiles`가 throw.
- **재현**: 결정적 재현 성공 — `take_back by p0 — Tile 110 is not in zone hand:p0`
- **파급**: stale `lastDrawnTile`은 그 자체로 쯔모기리 표시·리치 시 패 고정·천화/지화 판정을 오염시킨다. `table_flip` 직후에는 완성된 손이어도 쯔모 화료를 선언할 수 없다.
- **수정**: `table_flip` 리듀서에 `lastDrawnTile: p.drawn.at(-1)`(또는 `null`) 추가 + `take_back.validate`에 손패 포함 검사 추가.

### 3. 복수자(`avenger`) — 원수에게 무역 론을 하면 `sys.settleWin`이 throw

- **위치**: [avenger.ts:83](../packages/content/src/augments/avenger.ts)
- **재현**: `avenger` 보유·원수=p1. 멘젠 무역 손으로 p1의 버림을 론 → 크래시. 역이 있는 손은 통과하므로 발견이 늦다.

---

## 🟠 결정론·리플레이 붕괴 (desync)

### 4. 클라이언트 대기 계산이 서버와 다르다 — 무너진 국경

- **위치**: [App.tsx:1058](../packages/client/src/App.tsx)
- **문제**: `broken_border` 분기에서 `opts.mixedTriplets = true`를 켜는데 서버는 켜지 않는다. 화면 오름패 표시와 실제 화료 가능 여부가 어긋난다.

### 5. 같은 정산 단계 동률은 여전히 드래프트 픽 순서로 갈린다 *(미검증)*

- **위치**: [settleStages.ts:60](../packages/core/src/augment/settleStages.ts), [jackpot.ts:185](../packages/content/src/augments/jackpot.ts), [parasite.ts:86](../packages/content/src/augments/parasite.ts)
- **문제**: `settleStages.ts`의 존재 이유가 "픽 순서 의존 제거"인데, **같은 stage를 쓰는 증강끼리는 그 문제가 그대로 남는다.** `Multiply` 3종(일확천금·핏빛 계약·판돈 굴리기), `Transfer` 3종(기생충·스파이·악마의 진군)이 서로 진행 중인 `deltas`를 읽어 고친다.
- **추가**: `rebuildAugments`([DraftController.ts:229](../packages/core/src/augment/DraftController.ts))의 설치 순서는 `state.players` 순회 순서이지 **실제 픽 순서가 아니다** → 재개·리플레이에서 동률 Effect 순서가 뒤집힌다.
- **또한**: 표준 증강 3종이 `settleInterceptor`를 우회해 `ROUND_SETTLED`를 직접 가로챈다([standardAugments.ts:52](../packages/core/src/augment/standardAugments.ts)) — 규약 위반.

### 6. `devils_advance`가 엔진 밖 클로저 변수로 상태를 잇는다 *(미검증)*

- **위치**: [devils_advance.ts:69](../packages/content/src/augments/devils_advance.ts) — `let burst`가 Interceptor→Reaction을 잇는다. 상태에 없으므로 재구성에서 어긋난다.

---

## 🟡 소프트락 — 그 국을 못 싸운다

| # | 증강 | 문제 | 위치 |
|---|---|---|---|
| 7 | 통째로 바꾸기 | `sameHandSize`가 **후로(멘쯔) 수를 보지 않아** 후로한 상대를 털면 손패 16장이 된다 (실측 재현됨) | [full_hand_swap.ts:97](../packages/content/src/augments/full_hand_swap.ts) |
| 8 | 자유 리치 버림 | 리치 후 안깡 시 스냅샷(13장)과 `meldCount`가 어긋나 대기가 통째로 사라진다 (실측 재현됨) | [free_riichi_discard.ts:114](../packages/content/src/augments/free_riichi_discard.ts) |
| 9 | 우는 국사 | `kokushi_pon` 후 일반 펑·치를 하면 그 국 화료·텐파이 영구 불능 *(미검증)* | [open_kokushi.ts:167](../packages/content/src/augments/open_kokushi.ts) |
| 10 | 공허의 깡 | 대명깡에서도 손패를 '절대 못 뽑는 패' 대기로 갈아엎는다 *(미검증)* | [void_kan.ts:109](../packages/content/src/augments/void_kan.ts) |

---

## 🔵 규칙 위반 (검증 완료 13건 중 발췌)

### 11. 국 경계에서 소멸하지 않는 상태 — **9건 이상의 동일 패턴**

`turnCount`는 국마다 0으로 리셋되는데, 만료 판정 키는 **게임 스코프**라 비교가 영구히 참이 된다.

| 증강 | 증상 | 위치 |
|---|---|---|
| 함구령 `call_seal` | 6순 봉인이 **매치 끝까지 영구 봉인** | [call_seal.ts:36](../packages/content/src/augments/call_seal.ts) |
| 박무 `brief_fog` | 6순 안개가 **영구 안개**, 2회째 사용 봉쇄 | [brief_fog.ts:77](../packages/content/src/augments/brief_fog.ts) |
| 소환 `conjure_draw` | 예약이 다음 국 첫 쯔모를 강탈 + 그 국 소환권 1회 추가 | [conjure_draw.ts:54](../packages/content/src/augments/conjure_draw.ts) |
| 절벽꽃 `cliff_bloom` | **깡 없이** 일반 쯔모를 왕패와 맞바꿀 수 있다 | [cliff_bloom.ts:109](../packages/content/src/augments/cliff_bloom.ts) |
| 시간 정지 `time_stop` | 공짜 추가 턴이 다음 국으로 샌다 *(미검증)* | [time_stop.ts:35](../packages/content/src/augments/time_stop.ts) |

### 12. 무장해제(`disarm`)가 광고대로 작동하지 않는다 — **24건의 동일 패턴**

`isSourceDisarmed` 게이트는 `holderTurnOptions`에만 걸려 있다([Augment.ts:277](../packages/core/src/augment/Augment.ts)). 따라서:

- **리액션 콜형 증강**(`kokushi_pon`, `bluff_pon`, `silent_pon`)은 잠가도 버튼이 그대로 뜨고 통과한다 — [disarm.ts:107](../packages/content/src/augments/disarm.ts) (실측 재현됨)
- **커스텀 역**(`mixed_nine_gates` 등)은 `YakuRegistry`에 source 개념이 없어 잠가도 성립한다 — [mixed_nine_gates.ts:81](../packages/content/src/augments/mixed_nine_gates.ts)
- **규칙 모디파이어형**(`tanyao_break`, `soul_hunt` 등)도 반쪽만 잠긴다 *(미검증)*
- `disarm` 자신도 `lockedKey` 슬롯이 1개뿐이라 **한 국에 두 번 쓰면 첫 대상이 영구 무장해제** — [disarm.ts:89](../packages/content/src/augments/disarm.ts)
- `uninstallAugment`는 `turnOptions`·커스텀 역·액션/리듀서를 **전혀 되돌리지 못한다** — [Augment.ts:286](../packages/core/src/augment/Augment.ts)

### 13. 후로 봉인 우회 — `call.blocked` 미검사 *(대부분 미검증)*

`bluff_pretense`([:105](../packages/content/src/augments/bluff_pretense.ts), 검증됨), `silent_pact`([:63](../packages/content/src/augments/silent_pact.ts)), `open_kokushi`([:107](../packages/content/src/augments/open_kokushi.ts))의 커스텀 펑이 `call.blocked`·`call.pon.enabled`를 검사하지 않아 함구령을 통과한다.

### 14. 리치 손 동결(freeze) 위반 *(대부분 미검증)*

`meld_dissolve`([:104](../packages/content/src/augments/meld_dissolve.ts), 검증됨), `hand_swap3`([:130](../packages/content/src/augments/hand_swap3.ts)), `giant_god`([:118](../packages/content/src/augments/giant_god.ts)), `peek_riichi_waits`([:150](../packages/content/src/augments/peek_riichi_waits.ts))가 **보유자 자신의** 리치를 검사하지 않아 리치 후 손패를 바꾼다.

### 15. `lastDrawRinshan` 미갱신 → 영상개화 헛성립 *(일부 검증)*

`meld_dissolve`([:194](../packages/content/src/augments/meld_dissolve.ts), 검증됨), `grave_rob`([:91](../packages/content/src/augments/grave_rob.ts)), `rinshan_preview`([:129](../packages/content/src/augments/rinshan_preview.ts)).

### 16. 그 외 검증 완료 항목

- **책임전가**: 더블론에서 **다른 화료자의 수령액까지** 재분배 — [blame_shift.ts:70](../packages/content/src/augments/blame_shift.ts)
- **모 아니면 도**: 판돈 지급이 **한 번도 실행되지 않는다** (roundKey 비교가 항상 불일치) — [all_or_nothing.ts:139](../packages/content/src/augments/all_or_nothing.ts)
- **복수자**: 설명과 달리 **쯔모**에도 무역 해제가 적용된다 — [avenger.ts:39](../packages/content/src/augments/avenger.ts)
- **예지**: 교환으로 버린 패가 론 대상도 후리텐 근거도 되지 않는다 (detail과 반대) — [future_sight.ts:206](../packages/content/src/augments/future_sight.ts)
- **북풍 상인**: `firstTurn`을 깨지 않아 보충패 화료에 **천화·지화가 붙는다** — [north_trader.ts:176](../packages/content/src/augments/north_trader.ts)
- **누명**: 사풍연타 도중유국 판정을 무력화한다 — [frame_up.ts:69](../packages/content/src/augments/frame_up.ts)

---

## 🟣 정보 누출

| # | 증강 | 문제 | 위치 |
|---|---|---|---|
| 17 | 봉인술사 | `revealTiles` 채널이 국을 넘어 남아 **다음 국의 무관한 패 정체**가 샌다 (적도라 표식 포함, 실측 재현됨) | [discard_lock.ts:187](../packages/content/src/augments/discard_lock.ts) |
| 18 | 밑장빼기 | 예약 공개 표시가 국을 넘어 남아 전원에게 **거짓 정보**를 계속 보여 준다 | [bottom_deal.ts:71](../packages/content/src/augments/bottom_deal.ts) |
| 19 | 박무 × 숨은 강 | 전역 `revealTiles:fog` 키를 공유해 서로 덮어쓴다 *(미검증)* | [brief_fog.ts:66](../packages/content/src/augments/brief_fog.ts) |
| 20 | 봉인술사 × 등가교환 | 같은 `view:{holder}:revealTiles:{target}` 키를 서로 덮어쓴다 *(미검증)* | [discard_lock.ts:67](../packages/content/src/augments/discard_lock.ts) |
| 21 | 스텔스 리치 | `riichi.hidden`이 무조건 켜져 있어 표준 리치도 모순 상태가 된다 *(미검증)* | [stealth_riichi.ts:145](../packages/content/src/augments/stealth_riichi.ts) |

---

## ⚪ 밸런스·표기 불일치 (검증 완료 발췌)

- **뚫린 천장**: 역만에 보너스가 **0**이다 (역만은 `fu=0·han=0`) — [aotenjou_ceiling.ts:20](../packages/content/src/augments/aotenjou_ceiling.ts)
- **연금술사**: 적5의 `red` 속성이 유지된 채 숫자만 바뀌어 **'적4·적6'**이 생긴다 — [alchemist.ts:83](../packages/content/src/augments/alchemist.ts)
- **카운터**: 가상 론 화료패로 항상 최소 tileId를 골라 **결정적으로 적5가 뽑힌다** — [counter.ts:83](../packages/content/src/augments/counter.ts)
- **판돈 굴리기**: 연승 배수가 **리치봉·본장까지** 곱한다 (예: 15,500 → 27,200) — [let_it_ride.ts:87](../packages/content/src/augments/let_it_ride.ts)
- **만년 오야**: 연장이 보유자가 아니라 **그 국의 실제 오야**를 유지시킨다 — [eternal_dealer.ts:70](../packages/content/src/augments/eternal_dealer.ts)
- **재장전**: 광고하는 "1회 한도 파괴"가 **단 하나도 복구하지 못한다** *(미검증)* — [reload.ts:36](../packages/content/src/augments/reload.ts)
- **뒷도라 바꿔치기 UI가 죽어 있다** — 왕패가 hidden이라 버튼이 렌더되지 않는다 *(미검증)* — [ura_peek.ts:235](../packages/content/src/augments/ura_peek.ts)

### 봇 정책 자해

- **북풍 상인**: 봇이 무조건 북을 빼서 **텐파이·北 커쯔·자일색을 스스로 부순다** — [north_trader.ts:219](../packages/content/src/augments/north_trader.ts)
- **개벽**: 봇이 같은 턴에 두 번 눌러 매치 사용 횟수를 **한 턴에 소진** — [genesis.ts:223](../packages/content/src/augments/genesis.ts)
- **지뢰 탐지**: 봇이 국 첫 순에 발동해 **정보가 0인 시점에 소진** — [danger_sense.ts:120](../packages/content/src/augments/danger_sense.ts)
- **공성계**: 봇이 매 국 첫 버림에 **노텐 리치**를 걸고 자멸 *(미검증)* — [siege_riichi.ts:32](../packages/content/src/augments/siege_riichi.ts)

---

## 부록: 구조적 권고 (전부 반영됨)

개별 버그 55건 중 다수가 **5개의 반복 패턴**에서 나왔다. 개별 수정과 함께 아래 방어선을 세웠다.

| 처방 | 반영 |
|---|---|
| 국 스코프 상태 규약 | 8종을 `roundKey` 스코프로 이관 + 국 시작 정리 리액션 추가 |
| 무장해제 게이트 3경로 | `AugmentContext.holderReactionOptions` 신설 · `YakuDef.source` + `WinContext.disarmedSources` · `disarm` 다중 슬롯 |
| 손패 장수 공용 가드 | `sameHandSize`가 후로 멘쯔까지 검사 (손패 이동 증강 전체가 한 번에 보호) |
| 정산 순서 | `standardAugments`의 직접 인터셉터를 `SETTLE_LAYER`+`BankTopUp`으로 편입 · 클로저 신호 2종을 payload 표식으로 교체 |
| 실게임 커버리지 | `combo_sweep.test.ts` 신설 (기본=위험군 27종, `MAJAK_FULL_SWEEP=1`로 전수) |
| 타입 검사 구멍 | `npm run typecheck:content` 추가 — content는 그동안 타입체크가 **아예 없어** 미export 심볼 등이 새고 있었다 |

추가로 코어에 생긴 확장점: `call.kan.enabled` 규칙(손패를 고정하는 증강이 깡을 막는다),
`widenPeek` 헬퍼(열람 범위를 픽 순서가 아니라 "더 넓은 쪽"으로 합친다).

---

### 원래 권고 (기록용)

### A. 국 스코프 상태의 단일 규약 (9건 이상)

`turnCount` 기반 만료가 게임 스코프 키와 비교되는 패턴이 반복된다. `roundScopedKey(state, id, name)` 헬퍼를 `content/util.ts`에 두고, 국 스코프 값은 **반드시** 그것만 쓰게 한다. 커버리지 테스트: "국이 바뀌면 모든 `view:` 키와 만료성 플래그가 비워지는가".

### B. 무장해제 게이트를 3개 경로 전부에 (24건)

현재 `holderTurnOptions`에만 걸려 있다. `AugmentContext`에 다음을 추가한다:
- `holderReactionOptions(build)` — 리액션 콜 버튼용
- `yaku.register`에 `source` 필드 + 평가 시 `isSourceDisarmed` 필터
- `setHolderRule`/`addModifier`가 자동으로 `isSourceDisarmed` 게이트를 감싸도록

그리고 `engine.registerReactionOptions`를 증강이 **직접 부르지 못하게** 한다.

### C. 손패 장수 불변식의 공용 가드 확장 (2건 크래시 + 다수)

`sameHandSize`([util.ts:68](../packages/content/src/util.ts))가 `deal.handSize`만 본다. **후로 멘쯔 수와 실제 손패 길이**를 함께 비교하도록 확장하고, 손패를 이동하는 모든 증강이 이 한 곳만 쓰게 한다. 손패 전체를 옮기는 증강은 `lastDrawnTile` 갱신을 강제하는 헬퍼(`moveWholeHand`)를 경유시킨다.

### D. 정산 동률 순서의 명시화 (desync)

`SETTLE_STAGE`가 픽 순서 의존을 없앤 건 **stage 간**뿐이다. 같은 stage 안에서도 순서를 정하려면 stage 값을 증강별 고유 오프셋으로 쪼개거나, `rebuildAugments`가 실제 픽 순서(`AUGMENT_DRAFTED` 이벤트 로그 순)로 재설치하게 해야 한다.

### E. 실게임 커버리지 확장

- 104종 중 **43종에 실게임 스위프가 없다** (`true_dragon`, `seat_swap`, `full_hand_swap`, `hand_swap3`, `open_kokushi`, `void_kan` 등 위험군 포함).
- 기존 스위프는 **1증강 × 1인 × 1국**이다. 실제 형태(**4인 × 2증강 × 반장전**)로 시드 스위프를 돌리면 이번처럼 크래시가 바로 드러난다. 이 감사에서 쓴 하네스가 `packages/content/test/__tmp_combo_sweep.test.ts`에 있다.
