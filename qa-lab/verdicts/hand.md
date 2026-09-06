# 손패 계열 — 의심 재검증 판정 (2026-08-20)

기준 커밋: `e3e53b5` (89건 수정 이후 소스). 모든 판정은 **실행 출력**으로 뒷받침한다.
재현 스크립트는 `qa-lab/verify-hand/` 아래에 있고, 실행은 워크트리 루트에서
`~/majak/node_modules/.bin/tsx qa-lab/verify-hand/<파일>` 이다.

**결과: 확정 5건 · 기각 2건 · 보류 0건.**

| # | 원 출처 | 대상 | 판정 |
|---|---|---|---|
| 1 | hand-a 의심 1 | `pond_snatch` 패산 +1 | **기각** |
| 2 | hand-a 의심 2 | `future_sight` 후로 직후 발동 | **확정 🟠** |
| 3 | hand-b 의심 1 | `conjure_draw` 리치 중 발동 | **기각** |
| 4 | hand-b 의심 2 | 손패 변형 액티브 → 천화 | **확정 🟠** |
| 5 | text 의심 1 | `picky_eater` 리치 중 발동 | **확정 🔴** |
| 6 | text 의심 2 | `suit_unify` 적도라 문구 결손 | **확정 🟡** |
| 7 | info 의심 1 | `pond_snatch` `lastDiscard` 잔류 | **확정 🟡** |

---

## 1. 기각 — `pond_snatch` 가 패산을 1장 늘리는 것

- **재현**: `qa-lab/verify-hand/v1_pond_snatch_wall.ts`

```
발동 전  패산=62  lastDiscard=p3/60(pin7)
발동 후  패산=63  (Δ=1)
[문구] pond_snatch  "패산 맨 밑"=true  "국이 길어진다"=false
[문구] silent_swap  "패산 맨 밑"=true  "국이 길어진다"=true
[문구] grave_rob    "패산 맨 밑"=true  "국이 길어진다"=false
```

현상 자체는 성립한다(패산 +1 = 그 국이 1쯔모 길어진다). 그러나 **결함이 아니다**:

- 같은 성질의 `grave_rob` +1 은 [docs/25 §확신도 '확실'](../../docs/25_AUGMENT_QA_AUDIT_2026-08.md#L150)에서
  이미 **"의도된 설계로 확정"** 으로 종결됐고, 그 판정문이 *"날치기·정적의 손과 같은 계열의 대가다"*
  라며 날치기를 명시적으로 같은 묶음에 넣었다. 즉 이 건은 **이미 판정된 항목의 재발견**이다.
- 그 판정의 근거("detail에 쯔모패가 패산으로 돌아간다고 명시돼 있다")도 날치기에 그대로 성립한다 —
  `pond_snatch.ts:143` detail: *"그 순의 쯔모패를 패산 맨 밑으로 되돌리고"*.
- `silent_swap` 만 한 문장을 더 적었을 뿐이고, 그 문장이 없다고 다른 두 장이 거짓말을 하지는 않는다.

(선택 사항: 형제 세 장의 문구를 맞추고 싶다면 `pond_snatch.ts:143`·`grave_rob` detail 끝에
`silent_swap.ts:157` 과 같은 한 문장을 붙이면 된다. 결함 수정이 아니라 문구 정렬이다.)

---

## 2. 확정 🟠 — `future_sight` 가 후로 직후의 '쯔모패 없는 순'에도 발동해 **쯔모 화료 창을 연다**

- **위치**: `packages/content/src/augments/future_sight.ts:138-160` (`commonReject` — `lastDrawnTile` 미검사)
- **대조군**: `pond_snatch.ts:113` · `take_back` · `silent_swap` 은 전부 `if (state.round.lastDrawnTile == null) return "no drawn tile"`.
  `full_hand_swap.ts:95-99` 는 이 창(후로 직후)에서 사고가 나 **명시적으로 막았다**(docs/25 #1).
- **기대**: 후로한 순은 쯔모를 포기한 순이다. 그 순에는 쯔모 화료 창이 열리지 않아야 한다.
- **실제**: 펑 직후(`lastDrawnTile === null`)에 `future_arm` 후보가 뜨고, 교환이 끝나면
  `lastDrawnTile` 이 **새로 생겨** 그 자리에서 `win`(쯔모)이 제시된다.
- **재현**: `qa-lab/verify-hand/v2_future_sight_after_call.ts`
  (p0 = 222m 펑 + 손패 11장 345m/678m/55m/234p, 탄야오 완성형. 교환으로 들어오는 3장을
  나가는 3장과 같은 종류로 맞춰 완성형을 유지시켰다.)

```
[전제] lastDrawnTile = null  (펑 직후 = 쯔모패 없음)
후로 직후 p0 옵션: discard,future_arm
무작위로 뽑힌 3장 = pin3,pin2,man8
교환 후: lastDrawnTile = 29 (man8)  · rinshan=false
손패(11장) = man3 man4 man5 man6 man7 man5 man5 pin4 pin3 pin2 man8  + 펑 222m
교환 직후 옵션: discard,win
→ 후로 직후(쯔모 없는 순)에 발동 → 쯔모 화료 창이 열렸다
```

- **영향**:
  1. **규칙**: 울고 나서 같은 순에 쯔모로 난다. 표준 마작에 없는 화료다.
  2. **비용**: 정상 순의 발동은 패산을 2장(쯔모 1 + 교환 1) 태우는데, 후로 직후 발동은 1장만
     태운다 — 울기가 **자기 쯔모를 포기하는 대가**라는 전제가 통째로 환급된다.
  3. 손패 장수·패 총량은 깨지지 않는다(교환이 3 나가고 3 들어온다). 그래서 기존 스윕의
     불변식에 걸리지 않았다.
- **문구**: detail은 "자기 순에 버튼을 누르면"이라고만 적어 쯔모패를 요구하지 않는다 —
  **설명 위반은 아니고 규약·규칙 위반이다.**
- **최소 수정 위치**: `future_sight.ts` 의 `commonReject`(:138-160)에 형제들과 같은 한 줄을 넣는다 —
  `if (state.round.lastDrawnTile == null) return "no drawn tile";`.
  (의도된 사양이라면 반대로 detail에 "후로한 순에도 쓸 수 있다"를 적어야 한다.)

---

## 3. 기각 — `conjure_draw` 에 리치 가드가 없는 것

- **재현**: `qa-lab/verify-hand/v6_conjure_riichi.ts`

```
리치 중 = true
발동 전 손패: 0:man1 4:man2 … 88:sou5 104:sou9
발동 후 손패: 0:man1 4:man2 … 88:sou5 104:sou9
손패 동일 = true  · 존 수 동일 = true
→ 손패를 한 장도 건드리지 않는다
```

- 계열 규약의 문장 자체가 **"리치 중에는 손패를 건드리는 액티브를 막는다"**(`honor_return.ts:91-96`)이다.
  소환은 발동해도 손패의 tileId·kind·장수가 **하나도 바뀌지 않는다**(위 출력) — 예약 키
  (`conjure_draw:pending:*`)만 남기고, 실제 변화는 **다음 정상 쯔모 한 장의 kind**다.
  리치가 동결하는 것은 손패이지 패산이 아니다.
- 게다가 문제로 지목된 장면이 이 증강의 **명시된 설계 의도**다 — `conjure_draw.ts:11-13`:
  *"대기가 한 장에 걸린 홀더가 그 한 장을 손에서 지목하면, 다음 턴 쯔모가 정확히 그 패로
  물질화된다 — 단기 대기가 확정 쯔모로 바뀌는 장면."* 리치·단기는 그 문장이 그리는 바로 그 그림이다.
- 문구가 "리치 중 불가"를 약속하지도 않는다 → 설명 위반도 아니다.

남는 것은 "형제 카드들과 가드 유무가 다르다"는 **일관성 취향**뿐이고, 이는 밸런스 판단이지 결함이 아니다.

---

## 4. 확정 🟠 — 손패 변형 액티브가 완성한 손에 **천화(天和)** 가 붙는다

- **위치**: `packages/core/src/mahjong/flow/helpers.ts:765-772` (천화·지화 게이트)
- **기대**: 천화는 *"오야의 배패가 첫 쯔모 시점에 이미 완성돼 있었다"* 는 사실에 붙는 역만이다.
  증강이 첫 순에 손을 **고쳐서** 완성시킨 손은 배패가 아니다.
- **실제**: 게이트는 `firstTurn && !goAroundBroken && discardedKinds.length === 0` 만 본다.
  손패 변형 액티브 6종(`dead_wall_master` `table_flip` `even_world` `tile_split`
  `three_dragons_will` `genesis`) 중 **어느 것도 `firstTurn`을 내리거나 `goAroundBroken`을 세우지 않는다**:

```
dead_wall_master     firstTurn=1 goAroundBroken=0   ← 자기 발동 조건으로 읽기만 한다
table_flip           firstTurn=0 goAroundBroken=0
even_world           firstTurn=0 goAroundBroken=0
tile_split           firstTurn=0 goAroundBroken=0
three_dragons_will   firstTurn=0 goAroundBroken=0
genesis              firstTurn=0 goAroundBroken=0
```

- **재현**: `qa-lab/verify-hand/v5_tenhou_active.ts` — 대표로 `dead_wall_master`.
  이 증강의 detail 자체가 발동 창을 *"아직 아무것도 버리지 않은 국의 첫 순"* 으로 못박아
  **천화 창과 정확히 겹치고**, 왕패 14장을 전부 보여 주며 국당 2번 맞바꾼다.

```
오야 = seat0 · firstTurn=true · p0 버림수=0
발동 전 손패: man1..man9 man2 man2 pin5 pin5 wind1     (1z 하나만 남은 1샹텐)
dw_swap 후보 총 196개 · 1z↔pin5 후보 = true
교환 후 손패: man1..man9 man2 man2 pin5 pin5 pin5
화료 판정: ok=true 역만=1 역=tenhou
win 제시 = true
→ 증강이 완성한 손에 천화(天和)가 붙었다
```

- **영향**: **점수가 틀린다.** 오야 역만 48,000점이 "배패가 완성돼 있었다"는 거짓 근거로 지급된다.
  자연 발생이 극히 드문 역이라 스윕으로는 안 잡히지만, 왕패 전체 열람 + 첫 순 2회 교환은
  "왕패에 있는 두 장으로 완성되는 손"을 **골라서** 만들 수 있게 한다 — 확률 사건이 아니라 **선택**이다.
  (오야가 아니면 같은 경로로 지화가 선다 — 게이트 조건이 좌석만 다르다.)
- **최소 수정 위치**: 한 곳으로 끝난다 — `core/src/mahjong/flow/helpers.ts:765-772`.
  국 스코프 플래그(예 `round.handAlteredByAugment`) 하나를 두고 천화·지화 조건에 `&& !그 플래그`를
  넣은 뒤, 손패를 바꾸는 리듀서들이 그 플래그를 세우게 한다. (증강마다 `firstTurn`을 직접
  내리는 방식은 일발·사풍연타 등 다른 첫 순 판정까지 함께 무너뜨리므로 쓰지 않는 게 좋다.)

---

## 5. 확정 🔴 — `picky_eater` 가 **리치 중에 손패를 통째로 물들여 대기를 갈아치운다**

- **위치**: `packages/content/src/augments/picky_eater.ts:150-171` (validate — 리치 검사 없음)
- **대조군**: 완전히 같은 일을 하는 `suit_unify` 는 `canUnify`(`suit_unify.ts:77`)에서 리치를 반려하고
  detail에도 *"리치 중에는 발동할 수 없다"* 를 적는다. 두 증강은 실물 교환 구현
  (`suitUnifyCore.ts`)까지 공유한다 — **효과가 같은데 가드만 한쪽에 없다.**
- **기대**: 리치 선언 뒤 손패는 동결된다(docs/21 D-2 · docs/22 §14 · hand-a 스윕의 3번 불변식).
- **실제**: 리치 중에 `picky_unify` 가 제시되고, 발동하면 손패의 수패가 전부 다른 무늬가 되며
  **대기가 바뀐다.**
- **재현**: `qa-lab/verify-hand/v3_picky_riichi.ts`

```
[대조군] suit_unify · 리치 중 옵션: discard
[본건]  picky_eater · 리치 중 옵션: discard,picky_unify
  리치 선언됨 = true
  발동 전 손패: … 36:pin1 40:pin2 124:dragon1
  발동 전 대기: pin3
  발동 후 손패: … 36:man1 40:man2 124:dragon1
  발동 후 대기: man1,man3,man4,man7
  리치 손 동결 위반: kind가 바뀐 패 2장 [36:pin1→man1 40:pin2→man2] · 손에서 빠진 패 0장 []
```

- **영향**: 마작의 가장 기본 규칙(리치 = 손 동결)이 깨진다. 대기가 1종에서 4종으로 갈아 끼워지고,
  리치봉을 낸 채 **상대가 읽어 둔 대기가 통째로 무효**가 된다. 리치 관련 파생 판정
  (선언 간파 `peek_riichi_waits`가 공개한 대기, 상대의 안전패 계산, 후리텐 근거)이 전부
  낡은 값을 가리키게 된다. hand-a가 210매치에서 "리치 손 동결 위반 0건"을 보고한 것은
  편식이 그 스윕의 담당 12종에 없었기 때문이다.
- **문구**: detail(`picky_eater.ts:189`)에는 리치가 **한 글자도 없다** — 형제 카드가 명시하는
  제약이 이쪽에는 코드에도 문구에도 없다.
- **최소 수정 위치**: `picky_eater.ts` 의 `pickyAction.validate`(:150-171)에 형제와 같은 한 줄 —
  `if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: hand is frozen";`
  (그리고 detail에 `suit_unify` 와 같은 "리치 중에는 발동할 수 없다" 한 문장.)
  `holderTurnOptions`(:249-253)에도 같은 조건을 넣어 버튼 자체가 뜨지 않게 하는 편이 낫다.

---

## 6. 확정 🟡 — `suit_unify`·`picky_eater` 가 **적도라를 지우는데 문구에 한 줄도 없다**

- **위치**: 문구 `suit_unify.ts:124` · `picky_eater.ts:189` / 동작 `suitUnifyCore.ts:12`
  (*"적도라(red)는 새 종류로 이어지지 않는다"* — 코드 주석에만 있다)
- **대조군**: 같은 일을 한 장 단위로 하는 `tile_dyeing` 은 detail 끝에 ⚠ 로 명시한다
  (`tile_dyeing.ts:127`): *"적도라(빨간 5)를 물들이면 그 빨간색은 사라진다"*.
- **재현**: `qa-lab/verify-hand/v4_suit_unify_red.ts` — 이전 스크립트의 집계·출력 불일치를
  없애려고 **tileId 단위**로 다시 셌다.

```
발동 전 손패: man1 man2 man3 man4 man5(적) man5 sou5(적) sou6 sou7 sou8 wind2 wind2
발동 전 손패 적도라 = 2장
발동 후 손패: pin1 pin2 pin3 pin4 pin5 pin5 pin5 wind2 wind2 pin6 pin7 pin8
발동 후 손패 적도라 = 0장
판 전체 적5 실물 수: 발동 전 3 → 발동 후 1
[문구] suit_unify   적도라 언급=false  리치 언급=true
[문구] picky_eater  적도라 언급=false  리치 언급=false
[문구] tile_dyeing  적도라 언급=true  리치 언급=true
```

- **영향**: **문구와 다르다 + 점수가 조용히 준다.** 적도라 2장(= 2판)을 들고 통일을 누르면
  청일색을 얻는 대신 그 2판이 소리 없이 사라진다. 카드에는 "숫자는 그대로 둔 채" 라고만
  적혀 있어 홀더가 알 방법이 없다.
- **한 가지 더 (수정 시 함께 볼 것)**: 패산에 목표 색·같은 숫자가 없어 `mutations` 경로를 타면
  적5의 `red` 속성이 **판 전체에서 영구히 사라진다**(위 출력 `3 → 1`). 교환(`swaps`) 경로로
  나간 적5는 패산으로 돌아가 살아남는다. 즉 손해 크기가 패산 사정에 따라 달라진다.
- **최소 수정 위치**: `suit_unify.ts:124` 와 `picky_eater.ts:189` 의 detail에
  `tile_dyeing.ts:127` 과 같은 ⚠ 한 문장을 넣는다. (동작은 `suitUnifyCore.ts` 주석이 밝힌 의도대로다 —
  고칠 것은 문구다.)

---

## 7. 확정 🟡 — `pond_snatch` 가 주워 간 패가 `round.lastDiscard` 에 그대로 남는다

- **위치**: `packages/content/src/augments/pond_snatch.ts:153-177` (리듀서 — `round.lastDiscard` 미처리)
- **기대**: 코어가 명시하는 불변식이 있다 — `HanchanController.ts:1375-1376`:
  *"낡은 표식은 buildPlayerView가 `round.lastDiscard`와 대조해 걸러내므로 — **후로가 그 패를
  가져가면 CALL_MADE가 lastDiscard를 비운다** — 여기서는 안전하다."*
  실제로 `flowEvents.ts:553`(CALL_MADE)·`:623`(KAN_DECLARED)은 `lastDiscard: null` 로 지운다.
  날치기는 **후로가 아닌 방식으로 같은 일**(바닥의 패를 손으로)을 하면서 그 처리를 빠뜨렸다.
- **재현**: `qa-lab/verify-hand/v1_pond_snatch_wall.ts`

```
발동 전  패산=62  lastDiscard=p3/60(pin7)
주운 패 60: p0 손패에 있는가=true / p3 바닥에 남아 있는가=false
lastDiscard = p3/60  ← 주운 패와 같은가: true
  p1 뷰: tiles[60]=pin7 · 보이는 존=(없음) · lastDiscard=p3/60
  p2 뷰: tiles[60]=pin7 · 보이는 존=(없음) · lastDiscard=p3/60
  p3 뷰: tiles[60]=pin7 · 보이는 존=(없음) · lastDiscard=p3/60
```

- **영향**: **정보가 틀린다**(비밀이 새지는 않는다 — 그 패의 종류는 공개적으로 버려졌다).
  - 세 좌석 전부의 뷰에서 tile 60 이 **어느 가시 존에도 없는데 `tiles` 맵에 정체가 실린다** —
    실물은 p0의 비공개 손패 안이다.
  - `round.lastDiscard` 로 "지금 바닥에 있는 마지막 버림패"를 그리는 클라 경로가 유령 패를 그린다.
    구체적으로 `client/src/App.tsx:13817-13830` 은 바닥이 통째로 가려진 국(박무 `count_only`)에서
    `last.player === playerId` 이면 그 한 장을 **실물로 뒤집어 보여 준다** — 이미 바닥에 없는 패다.
  - `lastDiscardFrom` 표식은 `buildPlayerView`(`PlayerView.ts:967-972`)가 `lastDiscard` 와 대조해
    걸러내게 돼 있는데, 낡은 값이 그대로 남아 **일치해 버려서 걸러지지 않는다**.
  - 엔진의 론·펑·치는 전부 `phase === "reaction"` 게이트 뒤에 있고 발동 시점은 `turn.act`라
    **오화료·오후로로는 이어지지 않는다**(확인함). 게임이 죽지는 않는다.
- **범위**: 같은 구조의 `silent_swap`·`grave_rob` 도 `lastDiscard` 를 한 번도 참조하지 않는다
  (`grep -c lastDiscard` = 0). 셋 다 같은 자리에서 함께 고치는 것이 맞다.
- **최소 수정 위치**: `pond_snatch.ts` 리듀서(:165-176)의 반환 `round` 에 한 줄 —
  주운 패가 곧 마지막 버림패였다면 CALL_MADE 와 같게 비운다:
  `lastDiscard: state.round.lastDiscard?.tileId === p.snatchId ? null : state.round.lastDiscard`.
  `silent_swap`·`grave_rob` 리듀서에도 같은 줄.

---

## 파일

```
qa-lab/verify-hand/v1_pond_snatch_wall.ts        판정 1(기각) · 판정 7(확정)
qa-lab/verify-hand/v2_future_sight_after_call.ts 판정 2(확정)
qa-lab/verify-hand/v3_picky_riichi.ts            판정 5(확정) — suit_unify 대조군 포함
qa-lab/verify-hand/v4_suit_unify_red.ts          판정 6(확정) — tile_dyeing 문구 대조 포함
qa-lab/verify-hand/v5_tenhou_active.ts           판정 4(확정)
qa-lab/verify-hand/v6_conjure_riichi.ts          판정 3(기각)
```
