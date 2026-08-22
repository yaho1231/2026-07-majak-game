# 손패 조작 · 강 (hand_edit / river / tempo) — handedit

## 요약

검증한 조합 **47** (유닛 32 조합 + 실게임 15 조합 × 시드 2 = 반장전 30판)
/ 확정 **8건** · 의심 **2건** / 음성 확인 **28건**

재현 스크립트는 전부 `qa-lab/synergy3/handedit/` 안에 있다. 공통 하네스는 `lib.ts`.
`packages/**` 는 한 줄도 고치지 않았다.

> ⚠ 담당 목록의 `discard_recall` 은 **존재하지 않는 증강 id** 다
> (`packages/content/src/augments/` 에도 `qa-lab/synergy3/catalog.tsv` 에도 없다).
> 강에서 패를 회수하는 것은 `pond_snatch` · `grave_rob` · `silent_swap` 셋뿐이라
> 그 셋으로 대체해 검증했다.

| # | 심각도 | 조합 | 한 줄 |
|---|---|---|---|
| 확정 1 | 🔴 | `alchemist` × 천화 게이트 (형제 `tile_dyeing` 대조) | 연금술로 첫 순에 완성한 손에 **천화 역만**이 붙는다 |
| 확정 2 | 🔴 | `frame_up` × `grave_rob`/`silent_swap`/`pond_snatch` | "내 바닥은 대상이 아니다" 가드를 누명 한 장으로 우회 — 내가 버린 패를 도로 집어 화료 |
| 확정 3 | 🟠 | `frame_up` × `bottom_yaku` | 심긴 패가 **피해자**의 역류 통관을 완성시킨다 (3판 → 5판) |
| 확정 4 | 🟠 | `frame_up` × `honor_return` | 보유자의 기억은 사라지고, 피해자는 버리지도 않은 자패를 되받는다 |
| 확정 5 | 🟠 | `hourglass` × `pond_snatch`/`silent_swap` | 연장 솔로 쯔모가 4회 → **7회** (설명은 "최대 4장") |
| 확정 6 | 🟠 | `take_back` × `silent_swap`/`pond_snatch` | 강에서 집어 온 패를 "무르기"로 패산에 묻는다 (+2판은 그대로) |
| 확정 7 | 🟡 | `full_hand_swap` × `suit_unify` (형제 공개 채널 전부) | 손은 강탈자에게 갔는데 "누가 물들였다" 표식은 원주인에게 남는다 |
| 확정 8 | 🟡 | `frame_up` conflicts `["picky_eater"]` | 그 conflicts 의 **근거가 이미 사라졌고**, 애초에 서술된 피해를 막지도 못한다 |
| 의심 1 | 🟡 | `joker` × `suit_unify`/`picky_eater` | 백(白)을 손에 든 채 **청일색**이 붙는다 (4판 → 12판) |
| 의심 2 | 🟡 | `conjure_draw` × `take_back` | 5번째 장(생성패)이 패산으로 들어가 아무나 뽑게 된다 |

---

## 확정 1. 🔴 `alchemist` × 천화 게이트 — 형제 카드와 비대칭이라 **가짜 천화 48,000점**

- **위치**: `packages/content/src/augments/alchemist.ts:90-114` (`toEvents` 에 `handAlteredKey` 가 없다).
  대조: `tile_dyeing.ts:192` · `tile_split.ts:144` · `even_world.ts:118` · `joker.ts:122` 는 전부 찍는다.
  게이트: `packages/core/src/mahjong/flow/helpers.ts:884-897`.
- **설명이 약속한 것**: 코어 규약은 "증강이 이 국에 손패를 고쳤으면 그 손은 **배패가 아니다**"
  (`packages/content/src/augments/handAltered.ts` 머리말). 연금술사와 염색은 같은 기법
  (`TileKindChanged`)으로 손패의 종류를 갈아 끼운다 — 같은 대우를 받아야 한다.
- **기대**: 첫 순에 손을 고쳐 완성시킨 오야의 손에는 천화가 붙지 않는다(염색과 동일).
- **실제** — 대조군 3칸:

| 장면 (오야 p0, `firstTurn`, 버림 0장) | 결과 |
|---|---|
| 배패가 이미 완성형 (아무 증강도 안 씀) | **천화** (정상) |
| `123m456m789m123p3m3s` → 염색으로 3삭→3만 | 4판 · 멘젠쯔모+일기통관 (천화 없음 ✅) |
| `123m456m789m123p3m4m` → 연금술로 4만→3만 | **0판 · 천화 · yakumanCount=1** ❌ |

- **재현**: `tsx qa-lab/synergy3/handedit/repro_alchemist_tenhou.ts`
- **영향**: 오야 천화 = 48,000점. 연금술사는 **게임 내 5회**·리치 중에도 쓸 수 있어 발동 기회가
  흔하고, "첫 순에 한 장만 옮기면 완성"인 배패는 드물지만 5회 × 여러 국이면 실제로 나온다.
  `qa-lab/round2/aug-4-FIXED.md:214` 가 "담당 밖이라 손대지 않았다"며 **곁가지로만** 적어 둔 것을
  이번에 실측했다 — 아직 고쳐지지 않았다.
- **제안 수정**: `alchemist.ts` 의 `toEvents` 에
  `augmentDataSet(handAlteredKey(state, req.player), true)` 한 줄 추가 (염색과 같은 자리).

---

## 확정 2. 🔴 `frame_up` × `grave_rob` / `silent_swap` / `pond_snatch` — 내가 버린 패를 도로 집어 화료

- **위치**: `silent_swap.ts:93-104` (`pondOwnerOf` — **바닥의 물리적 주인**으로 판정) ·
  `pond_snatch.ts:116` (`fromPlayer === req.player`) · `grave_rob.ts:245` (`fromPlayer === req.player`).
  `frame_up.ts:139-148` 은 `TileDiscardedPayload.creditTo` 로 **실물을 남의 바닥에 놓는다**.
- **설명이 약속한 것**:
  - 정적의 손: "**내 바닥은 대상이 아니고**, 원래 주인의 후리텐은 그대로 남는다"
  - 날치기: `cannot snatch your own pond` · 무덤 도굴: "**내 바닥의 패는 파낼 수 없다**"
  - 누명이 약속하는 것은 "후리텐 이력 오염 + 내 후리텐 회피" **둘뿐**이다.
- **기대**: 내가 버린 패는 어디에 놓였든 내가 도로 집을 수 없다 (세 가드의 취지).
- **실제** — 같은 3만, 같은 손, 놓인 자리만 다르게:

| 3만이 놓인 곳 | `silent_take` | `pond_snatch` | `grave_rob` |
|---|---|---|---|
| 표준 버림 → **내 바닥** | `cannot take from your own pond` | `cannot snatch your own pond` | `cannot rob your own pond` |
| 누명으로 → **p1 바닥** | **null (허용)** | **null (허용)** | **null (허용 = 즉시 화료)** |

  가져온 뒤 `win` validate 도 **null** — `frame_up` 이 내 `discardedKinds` 를 비워 뒀으므로
  세 카드가 각각 걸어 둔 `win.tsumoFuriten` 모디파이어도 걸리지 않는다.
  무덤 도굴은 지불이 **쯔모 취급**이라 세 명이 분담한다.
- **재현**: `tsx qa-lab/synergy3/handedit/repro_frameup_silentswap.ts`
  (①은 누명이 실제로 그 상태를 만드는지까지 실행해 확인한다)
- **영향**: 손을 고치려고 오름패를 흘려야 하는 국면에서, 누명으로 흘리면 후리텐도 안 걸리고
  그 패를 **다시 집어 화료까지** 할 수 있다. 도굴은 최근 10장, 날치기는 최근 3장 창이라
  1~3순 안에 회수 가능하고, 넷 다 conflicts 가 없어 같은 드래프트에서 함께 뜬다.
- **제안 수정**: 세 가드의 판정을 "바닥 zone 의 주인"이 아니라
  **"그 패를 실제로 버린 사람"**으로 바꾼다. 코어가 이미 `lastDiscard.player` 를 실제 버린 사람으로
  두고 있으므로, 심긴 패의 원 소유자를 국 스코프로 기록해 두고(누명 쪽에서 한 줄) 세 가드가 함께 읽는다.

---

## 확정 3. 🟠 `frame_up` × `bottom_yaku` — 심긴 패가 **피해자**의 판수를 올린다

- **위치**: `bottom_yaku.ts:73-75` (`discardedKinds` 를 읽는다) ×
  `packages/core/src/mahjong/flow/flowEvents.ts:472-477` (누명은 그 이력을 **피해자**에게 쓴다).
- **설명이 약속한 것**: 바닥의 족보 — "(상시) 화료할 때 **내** 버림패가 판을 얹어 준다 —
  한 무늬의 1~9를 모두 버렸으면 2판". 누명 — 심는 것은 "후리텐" 용도라고만 적혀 있다.
- **기대**: p1 이 실제로 버린 것은 1만~8만뿐이므로 역류 통관은 성립하지 않는다. 남이 9만을
  p1 바닥에 심어도 **p1 의 판수는 변하지 않아야 한다**.
- **실제** — 대조군 4칸 (p1: `234m456m789p234s55s` 쯔모 화료, 바닥에 1~8만):

| | 누명 없음 | 누명으로 9만을 p1 바닥에 심음 |
|---|---|---|
| p1 이 `bottom_yaku` 없음 | 3판 | 3판 |
| p1 이 `bottom_yaku` 보유 | **3판** | **5판** (+2판 = 역류 통관) |

  p1 의 `discardedKinds` = `man1…man8,man9` — 버리지도 않은 9만이 들어가 완주가 성립한다.
  반대 방향도 같은 뿌리다: 보유자가 **자기** `bottom_yaku` 를 들고 누명으로 9만을 흘리면
  자기 이력에는 `man1…man8` 만 남아 역류 통관이 **조용히 무산**된다(같은 스크립트 §2).
- **재현**: `tsx qa-lab/synergy3/handedit/repro_frameup_bottomyaku.ts`
- **영향**: 3판 → 5판은 만관 문턱(5판)을 넘는 자리라 점수가 2배 가까이 뛴다. 누명 보유자는
  자기가 상대에게 판을 선물하는 줄 모르고, 상대는 자기가 안 버린 패로 판을 받는다.
- **제안 수정**: 후리텐 이력(`discardedKinds`)과 "**내가 버린 패**"를 분리한다.
  코어가 이미 `discardCount` 를 실제 버린 사람에게만 올리므로(같은 리듀서), 판정용 이력도
  같은 규약의 별도 필드를 쓰거나, `bottom_yaku` 가 `picky_eater` 처럼
  `TILE_DISCARDED.player === holder` 만 세는 자기 목록을 쌓게 한다.

---

## 확정 4. 🟠 `frame_up` × `honor_return` — 기억은 사라지고, 피해자는 공짜 자패를 받는다

- **위치**: `honor_return.ts:82-91` (`recallableHonors` 가 `round.byPlayer[holder].discardedKinds` **하나만** 읽는다).
- **설명이 약속한 것**: 귀환 — "발동 시점까지 이번 국에 **내가 버린 자패**를 … 최대 4장 기억한다".
  누명 — 바꾸는 것은 "바닥"과 "후리텐"뿐이라고 적혀 있다.
- **기대**: 누명으로 흘린 東도 **내가 버린 것**이므로 귀환의 재료로 남아야 하고,
  피해자의 재료가 되어서는 안 된다.
- **실제**:

| | p0(보유자) 이력 | p1(피해자) 이력 |
|---|---|---|
| 표준으로 東을 버림 | `man1,man2,**wind1**` | `man9` |
| 누명으로 東을 p1 에 심음 | `man1,man2` (東 소실) | `man9,**wind1**` |

  → 보유자의 귀환은 그 東을 **기억하지 못하고**, 귀환을 든 피해자는 자기가 버리지도 않은
  東을 다음 국 배패로 되받는다.
- **재현**: `tsx qa-lab/synergy3/handedit/repro_frameup_honorreturn.ts`
- **영향**: 확정 3과 같은 뿌리(“`discardedKinds` 를 ‘내가 버린 패’의 근거로 쓰는 증강”)다.
  같은 뿌리를 공유하는 것은 지금 `bottom_yaku` · `honor_return` 둘이고,
  `picky_eater`(확정 8)와 `nagashi`(이미 별도 가드가 있다)는 이미 갈라져 나갔다.
- **제안 수정**: 확정 3과 동일 — 근거를 하나로 통일한다.

---

## 확정 5. 🟠 `hourglass` × `pond_snatch`/`silent_swap` — 연장이 "최대 4장"을 넘는다

- **위치**: `hourglass.ts:170-172` (연장 종료 판정이 **패산이 마르는 것**) ×
  `pond_snatch.ts:160` · `silent_swap.ts:180` (쯔모패를 `WALL` 로 되돌려 **패산을 1장 늘린다**).
- **설명이 약속한 것**: 모래시계 — "남은 **영상패(최대 4장)** 를 나 혼자 연속으로 쯔모한다."
- **기대**: 연장 중 보유자의 쯔모는 어떤 조합에서도 **4회 이하**.
- **실제** — 같은 장면(패산 1장, p0 텐파이), 연장 중 강 조작을 쓸 수 있으면 쓴다:

| 조합 | 연장 중 p0 쯔모 |
|---|---|
| 모래시계만 | **4회** |
| 모래시계 + 정적의 손 (1회 사용) | **5회** |
| 모래시계 + 날치기 (3회 사용) | **7회** |

  정확히 "강에서 가져온 장수만큼" 늘어난다. 늘어난 순은 전부 보유자 혼자 도는 솔로 쯔모다.
- **재현**: `tsx qa-lab/synergy3/handedit/repro_hourglass_river.ts`
- **영향**: 유국 직전 텐파이에서 실질 화료 기회가 4번 → 7번으로 75% 늘어난다.
  둘 다 prism 이고 conflicts 가 없다. (연장 중 버림이 론 대상인 것은 detail 에 적혀 있으니
  대가가 아주 없지는 않다.)
- **제안 수정**: 연장 종료를 "패산이 마르면"이 아니라 **넘겨받은 장수 카운터**로 센다
  (`HourglassPayload.tiles.length` 를 국 스코프로 남기고 그만큼만 돌린다).

---

## 확정 6. 🟠 `take_back` × `silent_swap`/`pond_snatch` — 남의 버림패를 패산에 묻는다

- **위치**: `take_back.ts:104-107` — validate 는 `lastDrawnTile` 이 손에 있는지만 본다.
  강 조작 셋은 전부 `replaceDrawnTile(round, 집어온패)` 로 **집어 온 패를 쯔모패 자리에 세운다**.
- **설명이 약속한 것**: 무르기 — "**쯔모한 패**를 전원에게 공개하고 패산 맨 밑에 되돌린 뒤
  새로 1장을 뽑는다."
- **기대**: 바닥에서 집어 온 패는 쯔모패가 아니므로 무르기의 대상이 아니다.
- **실제**:

| 순서 | `take_back` validate | 결과 |
|---|---|---|
| 표준 쯔모 → 무르기 | null | 정상 |
| 정적의 손으로 p1 바닥의 北 획득 → 무르기 | **null** | 北이 패산 맨 밑으로, p1 바닥 3장 → **2장** |
| 날치기로 p1 바닥의 北 획득 → 무르기 | **null** | 같음 |

  정적의 손의 **+2판(발동 국 화료 시)** 은 `usedKey` 가 서 있는 한 그대로 남는다 —
  즉 "상대 바닥에서 아무 패나 한 장 지워 패산에 묻고 그 국 +2판" 이 3순마다 성립한다.
  (패 총량 136·존 중복 0 은 유지된다 — 구조는 안 깨진다.)
- **재현**: `tsx qa-lab/synergy3/handedit/repro_river_misc.ts` (§G3)
- **영향**: 상대의 안전패 정보를 지우고 후리텐 판정의 근거 실물을 없앤다
  (`discardedKinds` 는 남으니 후리텐 자체는 유지된다). 정적의 손 쪽은 +2판이 공짜다.
- **제안 수정**: `take_back` validate 에 "이 쯔모패가 패산에서 온 것인가"를 추가한다 —
  강 조작 셋이 이미 `takenKey`/`robbedKey` 를 국 스코프로 남기고 있으므로 그 값과
  `lastDrawnTile` 이 같으면 거절하면 된다(세 카드가 `win.tsumoFuriten` 에서 쓰는 것과 같은 판정).

---

## 확정 7. 🟡 `full_hand_swap` × `suit_unify` — 손은 강탈자에게, 공개 표식은 원주인에게

- **위치**: `suit_unify.ts:96` (`roundViewKey("*", "suit_unify:<holder>")`) ×
  `full_hand_swap.ts:160-166` (손패 실물만 옮기고 공개 채널은 건드리지 않는다).
- **설명이 약속한 것**: 단색 세계 — "**어느 색인지는 전원에게 공개된다**".
  통째로 바꾸기 — "상대는 패산에서 새로 받는다".
- **기대**: 손이 통째로 넘어갔으면 "누가 무슨 색 손을 들고 있다"는 정보도 그 손을 따라가거나,
  최소한 **거짓말로 남지는 않아야** 한다.
- **실제**:

| | p0(강탈자) 손 | p1(피해자) 손 | 전원 공개 채널 |
|---|---|---|---|
| 강탈 전 | 잡패 | `sou2…sou9` (삭으로 통일) | `view:*:suit_unify:p1 = "sou"` |
| 강탈 후 | **`sou2…sou9`** (통일된 손 그대로) | `pin4…pin8` (패산에서 새로) | `view:*:suit_unify:p1 = "sou"` (그대로) |

  A(실물 흔적이 따라간다)는 정상 — 생성패·`conjured` 표식·적도라 표식 전부 따라간다
  (`repro_traces_follow.ts` §C·§E 로 확인). 문제는 **표식만 남는 것**이다.
- **재현**: `tsx qa-lab/synergy3/handedit/repro_traces_follow.ts` (§A/B)
- **영향**: 화면은 "p1 이 청일색을 노린다"고 말하는데 실제 청일색 손은 p0 이 쥐고 있다 —
  세 좌석이 전부 잘못된 대상에게 베타오리한다. 같은 구조의 국 스코프 공개 채널이
  `alchemist` · `tile_dyeing` · `tile_split` · `conjure_draw` · `even_world` · `picky_eater` 에 전부 있다
  (전부 `roundViewKey("*", "<id>:<holder>")`).
- **제안 수정**: `full_hand_swap`(및 `hand_swap3`·`seat_swap`)의 리듀서에서
  손패 가공 계열의 `roundViewKey("*", ...)` 채널을 비우거나 새 보유자로 옮긴다.
  (최소 수정: 강탈 시 대상의 그 채널들을 `null` 로 덮는다.)

---

## 확정 8. 🟡 `frame_up` 의 `conflicts: ["picky_eater"]` — 근거가 이미 사라졌다

- **위치**: `frame_up.ts:176-182` 주석 — "편식은 … 자기 바닥에서 세는데, 누명은 남의 바닥에
  실물을 심는다(flowEvents.ts:329) — **심긴 패 한 장이 퀘스트를 통째로 깨고**, 피해자는 자기가
  버리지도 않은 패 때문에 그 국 능력을 잃는다."
- **설명이 약속한 것**: conflicts 는 드래프트에서 **같은 사람이 둘 다 드는 것**을 막는 장치다.
  그런데 위 주석이 말하는 피해는 **상대편** 편식 보유자에게 간다 — conflicts 로는 막을 수 없다.
- **기대**: ① 지금의 편식은 `TILE_DISCARDED.player === holder` 만 세므로(`picky_eater.ts:229-241`)
  심긴 패로 깨지지 않는다. ② 따라서 그 conflicts 는 근거 없이 후보 하나를 뺏는다.
- **실제**:

| | p1(편식) 퀘스트 |
|---|---|
| 심기 전 (만수 5장 버림) | `{suit:"man", count:5, failed:false}` |
| p0 이 **1통**을 p1 바닥에 심음 | `{suit:"man", count:5, failed:false}` — **안 깨진다** |
| (p1 후리텐 이력) | `pin1` 이 들어간다 = 누명 본래 효과는 유효 |

- **재현**: `tsx qa-lab/synergy3/handedit/repro_river_misc.ts` (§G1)
- **영향**: 낮다(드래프트 후보가 하나 줄 뿐). 다만 **주석이 사실과 다르다** — 같은 근거로
  다른 conflicts 가 추가되면 같은 오해가 번진다.
  ※ 부가 발견: `picky_eater.myDiscardKinds` 의 폴백(`tracked.length !== discardCount` 이면
  `discardedKinds` 로 되돌아감)이 도는 상황에서는 **여전히 깨진다**. 국 도중에 편식을
  받은 좌석처럼 목록이 비어 있는 경우가 여기에 해당할 수 있다 — 확인하지 못했다(아래 의심 아님, 참고).
- **제안 수정**: `conflicts` 를 지우고 주석을 사실에 맞게 고치거나,
  근거를 지키려면 conflicts 가 아니라 **편식 쪽 가드**(이미 있다)로 명시한다.

---

## 의심 1. 🟡 `joker` × `suit_unify`/`picky_eater` — 백을 손에 든 채 청일색

- **위치**: `joker.ts:166-179` (`scoring.wildKinds` 에 白 추가) × `suit_unify` 의 청일색.
- **설명이 약속한 것**: 조커 — "손을 **가장 비싸게** 만드는 패로 알아서 변한다 …
  ⚠ **도라는 백 그대로 센다**". 단색 세계 — "통일된 색으로 청일색이 인정되고".
  둘 다 "백이 청일색을 깨는가/안 깨는가"에 대해 **한 줄도 없다**.
- **기대**: 백은 실물로 손에 남아 있으므로 청일색(수패 한 색만)은 깨지고 혼일색이 되거나,
  최소한 설명 어딘가에 예외가 적혀 있어야 한다.
- **실제** — 손 `234p 567p 234s 78s 99p + 白`(쯔모 白), 대조군 4칸:

| | 판수 · 역 |
|---|---|
| 없음 | 화료형 아님 |
| A: 조커만 | **4판** · 멘젠쯔모+핑후 (白 → 9삭) |
| B: 단색만 | 화료형 아님 |
| A+B: 조커+단색 | **12판** · 멘젠쯔모+핑후+이페코+**청일색** |

- **재현**: `tsx qa-lab/synergy3/handedit/repro_joker_unify.ts`
- **왜 의심인가**: "가장 비싸게 만드는 패로 변한다"를 문자 그대로 읽으면 청일색이 붙는 것이
  일관된 해석이다(그리고 도라만 예외라고 명시했다). 다만 **4판 → 12판**(만관 → 삼배만 문턱)은
  설명만 읽고는 절대 예측할 수 없는 크기다. 버그인지 미기재인지는 설계 판단이라 확정하지 않는다.
- **제안**: 어느 쪽이든 조커 detail 에 한 줄 — "청일색·혼일색 판정에서도 조커는 변한 패로 센다
  (도라만 백 그대로)".

## 의심 2. 🟡 `conjure_draw` × `take_back` — 5번째 장이 패산으로 들어간다

- **위치**: `conjure_draw.ts:149-158` (뽑은 패를 목표 kind 로 변환, `conjured`) ×
  `take_back.ts:163-166` (쯔모패를 `WALL` 맨 밑으로).
- **설명**: 소환 — "패산도 손패 장수도 그대로다". 무르기 — "되돌린 패는 패산 맨 밑으로".
- **기대**: 두 문구의 곱은 "소환 1회를 헛되이 태우고 새 패를 뽑는다" 다. 그것 자체는 정상.
- **실제**: 소환 목표 `man2` → 다음 쯔모가 `man2` 로 바뀐다(게임 내 `man2` **5장**) →
  같은 순에 무르기 → **그 5번째 `man2` 가 패산 맨 밑으로 들어간다**.
  이후 누구든 뽑을 수 있고, 무르기는 그 패를 전원에게 공개까지 한다.
  (손패 14장·왕패 14장·총 136장·존 중복 0 은 전부 정상 — 구조는 안 깨진다.
  무른 뒤의 새 쯔모에 소환이 **다시 걸리지는 않는다**.)
- **재현**: `tsx qa-lab/synergy3/handedit/repro_conjure_takeback.ts` (§①)
- **왜 의심인가**: `conjured` 가 4장 한도를 넘는 것은 이미 전역 규약으로 **허용**돼 있다
  (`qa-lab/round2/aug-1.md:331-335` 에서 기각됨). 다만 그 규약은 "보유자 손 안의 생성패"를
  전제로 논의됐고, **생성패가 공용 패산으로 되돌아가는 경로**는 그때 다뤄지지 않았다.
  같은 경로가 `suit_unify`·`table_flip`·`full_hand_swap`(전부 손패를 패산 맨 밑으로 반납)에도 있다.
- **제안**: 규약을 문서화하거나(“생성패는 패산으로 되돌아갈 수 있다”),
  되돌릴 때 `conjured` 를 벗기고 원래 kind 로 복원한다.

---

## 음성 확인 (돌려 봤고 깨끗했다)

### 손패 장수·패 총량 불변식 — `repro_counts.ts` / `repro_wall_ops.ts`

기대는 전부 동일: 보유자 손패 14장 · 상대 13장 · 왕패 14장 · 존 중복 0 · 총 136장.

| 조합 (같은 순에 연달아) | 기대 | 실제 | 판정 |
|---|---|---|---|
| 분열 → 연금술 / 연금술 → 분열 | 14/13/14/0/136 | 동일 | ✅ |
| 연금술 → 염색 (턴 가드가 서로 다른 키) | 둘 다 발동 | 둘 다 null | ✅ |
| 연금술 ×2 (같은 순) | 두 번째 거절 | `already used this turn` | ✅ |
| 분열 ↔ 짝수의 세계 (양 순서) | 불변 | 동일 | ✅ |
| 단색 세계 ↔ 분열 (양 순서) | 불변 | 동일 | ✅ |
| 단색 세계 → 염색 → 연금술 (3중) | 불변 | 동일 | ✅ |
| 왕패의 주인 ×2 → 밥상 뒤엎기 | 왕패 14 유지 | 유지 | ✅ |
| 밥상 뒤엎기 → 왕패의 주인 ×2 | 둘 다 발동 | 둘 다 null | ✅ |
| 밥상 뒤엎기 ↔ 통째로 바꾸기 (양 순서) | 14/13 | 동일 | ✅ |
| 왕패의 주인(도라 표시패 자리) → 통째로 바꾸기 | 불변 | 동일 | ✅ |
| 조커 → 분열 | 불변 | 동일 | ✅ |
| 소환 → 무르기 | 불변 | 동일 (의심 2 참고) | ✅ |
| 시간 정지 → 분열 | 불변 | 동일 | ✅ |
| 미래를 보는 자 (무장→교환) | 손 14·왕패 14 | 동일 (패산은 −1 — 아래 ※) | ✅ |
| 왕패의 주인 ×2 ↔ 미래를 보는 자 (양 순서) | 왕패 14 | 유지 | ✅ |
| 왕패의 주인(표시패) → 밥상 뒤엎기 → 무르기 | 불변 | 동일 | ✅ |
| 소환 → 미래를 보는 자 | 불변 | 동일 | ✅ |

※ 미래를 보는 자는 3장 중 1장이 **바닥으로 나가므로** 패산이 발동당 1장 줄어든다.
  내가 처음 적은 기대("패산+왕패 합 보존")가 틀렸다 — 설명("나머지 2장은 패산 맨 밑으로")과 일치한다.

### 의미 대조

| 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 모래시계 × 미련 (같은 사람) | 첫 유국은 모래시계가 삼키고, **연장 뒤** 손을 미련이 보존 | 정확히 그렇다 (미련만 든 대조군과 보존 내용 동일, 이중 발동 없음) | ✅ |
| 미련 단독 vs 모래시계+미련 | `regret:keep` 내용 동일 | 동일 (적도라 표식 포함) | ✅ |
| 누명 × 제3자 론 | 심긴 패로 제3자는 론 가능, 방총 책임은 실제 버린 사람 | p3 에게 `win` 제시, `lastDiscard.player = p0` | ✅ |
| 누명 × 피해자 론 | 피해자는 자기 버림패 취급이라 론 불가 (역은 있는 손으로 검증) | `win` 미제시 | ✅ |
| 날치기 → 무덤 도굴 (같은 패) | 두 번 못 가져간다 | `tile is not in that pond` | ✅ |
| 날치기 후 원주인 후리텐 | 유지된다 | `discardedKinds` 에 그대로 | ✅ |
| 단색 세계 × 편식 (같은 순 두 번 통일) | 서로 다른 증강이라 각 1회씩 = 2번 가능 | 2번 가능, 손패 14장·136장 정상 | ✅ |
| 등가교환으로 적도라 넘기기 | `red` 표식이 실물 따라 간다 | `{"red":true}` 그대로 | ✅ |
| 등가교환으로 분열 조각 넘기기 | kind·`conjured` 그대로 | 그대로 | ✅ |
| 조커 켠 사람이 백을 넘기면 | 받은 쪽에서는 평범한 백 | p1 `wildKinds = []` | ✅ |
| 통째로 바꾸기 — 가공된 실물 흔적 | 강탈자에게 따라온다 | 따라온다 (표식만 안 따라옴 → 확정 7) | ✅ |
| 무르기 후 새 쯔모에 소환 재적용 | 안 걸린다 | 안 걸린다 | ✅ |
| 염색으로 첫 순에 완성 → 천화 | 안 붙는다 | 안 붙는다 | ✅ |

### 실게임 소크 — `soak.ts` (동풍전, 시드 11·23, 15 조합 × 2 = 30판)

좌석 3곳에 조합을 심고(`p0=A+B, p1=A, p2=B`) 페르소나 4인으로 완주.
하네스 기본 불변식(패 중복·유실·왕패 크기·손패 장수·점수 NaN/드리프트·훅 예외·소프트락)
**전 30판 clean**. 각 조합의 액티브가 실제로 발동했음을 액션 카운트로 확인했다.

| 조합 | 발동 확인 | 판정 |
|---|---|---|
| frame_up + silent_swap | `frame_discard:4 silent_take:8` | ✅ clean |
| frame_up + grave_rob | `frame_discard:4` | ✅ clean |
| frame_up + bottom_yaku | `frame_discard:4` | ✅ clean |
| hourglass + pond_snatch | `pond_snatch:6` | ✅ clean |
| hourglass + regret | (조건 미충족 국) | ✅ clean |
| take_back + silent_swap | `take_back:51 silent_take:8` | ✅ clean |
| take_back + conjure_draw | `conjure_tsumo:8 take_back:51` | ✅ clean |
| tile_split + alchemist | `split_tile:8 alchemy:10` | ✅ clean |
| suit_unify + picky_eater | `mono_world:2` | ✅ clean |
| joker + suit_unify | `joker_call:6 mono_world:2` | ✅ clean |
| table_flip + dead_wall_master | `dw_swap:10 table_flip_do:8` | ✅ clean |
| full_hand_swap + hand_swap3 | `hand_swap:5 swap3:4` | ✅ clean |
| even_world + tile_dyeing | `tile_dye:10 even_world_flip:4` | ✅ clean |
| time_stop + future_sight | `time_stop_use:8 future_arm:39 future_exchange:33` | ✅ clean |
| dead_wall_master + hourglass | `dw_swap:16` | ✅ clean |

---

## 재현 스크립트 목록

| 파일 | 다루는 것 |
|---|---|
| `qa-lab/synergy3/handedit/lib.ts` | 공용 하네스 (craft + 다중 installAugment + 불변식 계량) |
| `repro_alchemist_tenhou.ts` | 확정 1 — 연금술사 × 천화 게이트 (염색 대조) |
| `repro_frameup_silentswap.ts` | 확정 2 — 누명 × 강 회수 3종 (내 바닥 가드 우회) |
| `repro_frameup_bottomyaku.ts` | 확정 3 — 누명 × 바닥의 족보 (양방향) |
| `repro_frameup_honorreturn.ts` | 확정 4 — 누명 × 귀환 (양방향) |
| `repro_hourglass_river.ts` | 확정 5 — 모래시계 연장 길이 × 날치기·정적의 손 |
| `repro_river_misc.ts` | 확정 6(§G3) · 확정 8(§G1) · 음성(§G2·§G4) |
| `repro_traces_follow.ts` | 확정 7 · 가공 흔적 추적(적도라·분열 조각·조커) |
| `repro_joker_unify.ts` | 의심 1 — 조커 × 단색 세계 4칸 대조 |
| `repro_conjure_takeback.ts` | 의심 2 — 소환 × 무르기 · 시간 정지 × 무르기 쿨다운 |
| `repro_counts.ts` | 손패 장수 불변식 17 조합 |
| `repro_wall_ops.ts` | 패산·왕패 불변식 5 조합 |
| `repro_hourglass_regret.ts` | 모래시계 × 미련 정산 순서 |
| `repro_frameup_ron.ts` | 심긴 패의 론·후리텐 창 |
| `soak.ts` | 실게임 15 조합 × 시드 2 |
