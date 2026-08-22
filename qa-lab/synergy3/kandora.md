# 깡 · 도라 (kan / dora / wall_info) — kandora

## 요약

검증한 조합 **41개** (4칸 대조군 12표 · 실흐름 재현 29장면) /
**확정 4건 · 의심 3건 / 음성 확인 24건**

담당 17종 전부 소스를 읽었고, 그중 `conflicts`가 걸린 쌍은 **하나도 없다** —
아래 조합은 전부 실제 드래프트에서 함께 뜰 수 있다(`packages/core/src/augment/synergy.ts:180-310`,
`rinshan_preview × dead_wall_master`만 `antiIds`로 확률이 눌려 있을 뿐 잠기지 않는다).

| # | 심각도 | 조합 | 한 줄 |
|---|---|---|---|
| 확정 1 | 🟠 | `dora_conceal` × `mirror_dora` | 가린 도라를 **거울의 전원 공개 채널이 산수로 되돌려 준다** |
| 확정 2 | 🟠 | `haitei_lord` × `conjure_draw` | 같은 해저패를 둘이 덮어써, **나중에 뽑은 증강이 이기고 다른 쪽은 조용히 죽는다** |
| 확정 3 | 🟠 | `triple_peek` × `bottom_deal` | "어긋나지 않는다"고 적힌 실시간 예고가 밑장빼기 한 번에 **4/4 전부 틀린다** |
| 확정 4 | 🟠 | `ura_peek` × `dead_wall_master` | 왕패의 주인이 뒷도라 표시패를 갈아 끼워도 이면투시 화면은 **낡은 패를 계속 보여 준다** |
| 의심 1 | 🟡 | `foresight` × `bottom_deal` | 밑장 쯔모가 예언 창을 한 칸 잘못 깎아, 아직 패산에 있는 예언패가 화면에서 사라진다 |
| 의심 2 | 🟡 | `snake_kan` × `cliff_bloom` | 연속 4장 **두 벌**만으로 만개 = 확정 화료. 5/5 성공, 그중 1건은 스안커 역만 |
| 의심 3 | 🟡 | `red_five_touch` × `cliff_bloom` | 만개가 만든 **생성패**에도 각인이 자동으로 붙어 4장 한도를 넘는 적도라가 선다 |

---

## 확정 1. 🟠 `dora_conceal` × `mirror_dora` — 가려진 도라가 거울의 전원 공개 채널로 새어 나간다

- 위치: [`packages/content/src/augments/mirror_dora.ts:99-121`](../../packages/content/src/augments/mirror_dora.ts#L99)
  (`publicKey = roundViewKey("*", ...)` · `announce`) ×
  [`dora_conceal.ts:36-48`](../../packages/content/src/augments/dora_conceal.ts#L36)

- 설명이 약속한 것:
  - `dora_conceal` — "(상시) 도라 표시패가 상대에게는 가려진다 — **도라는 나만 알 수 있다**",
    detail "국이 시작되는 순간부터 도라 표시패가 **나에게만 보이고 세 상대에게는 뒷면으로 덮인다**.
    다른 증강으로 도라를 들여다보는 것까지 막지는 못한다."
  - `mirror_dora` — "무엇이 도라가 됐는지는 **전원에게 공개된다**."

- 기대: 거울 보유자 본인은 (detail의 면책대로) 알 수 있다. 하지만 **증강이 하나도 없는 좌석**은
  이번 국의 도라를 알 수 없어야 한다.

- 실제: 거울의 공개 채널은 **앞도라 종류**를 그대로 싣는다. 앞도라는 표시패의 정확한 역함수라
  `표시패 = 앞도라 + 1`, `도라 = 앞도라 + 2`로 **되돌릴 수 있다.** 아래는 표시패 4m(=도라 5m)일 때
  p1(비보유자) 뷰:

  | 조합 | p1의 `round.doraIndicators` | p1이 받는 증강 채널 | p1이 도라를 아는가 |
  |---|---|---|---|
  | 없음 | 1장(공개) | — | ○ (정상) |
  | `dora_conceal`(p0) | **0장** | — | ✕ (의도대로) |
  | `mirror_dora`(p0) | 1장(공개) | `mirror_dora:p0 = ["man3"]` | ○ (정상) |
  | **`dora_conceal`+`mirror_dora`(p0)** | **0장** | **`mirror_dora:p0 = ["man3"]`** | **○ — man3+2 = man5** |
  | `dora_conceal`(p0) · `mirror_dora`(**p1**) · 관찰자 **p2** | **0장** | **`mirror_dora:p1 = ["man3"]`** | **○** |

  마지막 줄이 특히 나쁘다 — 은닉자도 거울 보유자도 아닌 **p2·p3까지** 도라를 알게 된다.
  `dora_conceal`의 면책 문구("다른 증강으로 들여다보는 것")는 *그 증강을 가진 사람*에 대한 말이지,
  그 사람이 테이블 전체에 방송하는 것까지 허락하지 않는다. 프리즘 은닉 카드의 유일한 능력이
  같은 테이블의 다른 프리즘 하나로 **전원에게** 무효화된다.

- 재현: `tsx qa-lab/synergy3/kandora/repro_conceal_leak.ts`
- 영향: 두 카드 다 prism이라 동시 등장이 드물지 않다. 은닉자는 자기 카드가 죽은 줄도 모른다.
- 제안 수정: `announce`가 `visibility.doraIndicators.hidden`을 해석해 **가려진 표시패에서 온 앞도라는
  공개 채널에 싣지 않고 보유자 전용 채널(`viewKey(holder, …)`)로만** 내보낸다.
  (깡도라가 섞이면 가려진 것만 골라 빼야 한다.)

---

## 확정 2. 🟠 `haitei_lord` × `conjure_draw` — 같은 해저패를 둘이 덮어쓴다. 이기는 쪽은 **드래프트 순서**가 정한다

- 위치: [`haitei_lord.ts:70-110`](../../packages/content/src/augments/haitei_lord.ts#L70) (`TILE_DRAWN` 리액션 → `tileKindChanged`) ×
  [`conjure_draw.ts:142-160`](../../packages/content/src/augments/conjure_draw.ts#L142) (같은 이벤트 → 같은 tileId에 `tileKindChanged`)

- 설명이 약속한 것:
  - `haitei_lord` — "텐파이 상태로 해저패를 쯔모하면 **그 패가 오름패로 바뀐다** … 해저로월 쯔모로 화료하고 +3판"
  - `conjure_draw` — "손패 1장을 지목하면 **다음 내 쯔모가 그 패의 복제로 바뀐다**"
  - 어느 쪽 카드에도 "다른 증강이 같은 쯔모를 만지면"이라는 말이 없다.

- 기대: 둘 중 하나는 반드시 진다 — 그렇다면 **어느 쪽이 이기는지가 카드에 적혀 있어야** 하고,
  진 쪽의 1회 사용권은 소모되지 않아야 한다.

- 실제: 대조군(패산 1장 · p0는 5s 단기 텐파이 · 소환 목표 1m):

  | 조합 | 패산 마지막패 | 손에 들어온 패 | haitei 발동 플래그 | 소환 1회 |
  |---|---|---|---|---|
  | 없음 | dragon3 | dragon3 | false | — |
  | `haitei_lord`만 | dragon3 | **sou5(오름패)** | true | — |
  | `conjure_draw`만 | dragon3 | **man1** | false | 소진 |
  | **A+B (haitei 먼저 설치)** | dragon3 | **man1 — 화료 불가** | **true** | 소진 |
  | **B+A (conjure 먼저 설치)** | dragon3 | **sou5** | true | **소진(효과 없음)** |

  - **나중에 설치된 쪽이 이긴다.** 설치 순서 = `p.augments` 순서 = **드래프트 픽 순서**다
    (`DraftController.ts:658-668`, `HanchanController.ts:1135`).
  - 진 쪽은 **조용히 죽는다**: `haitei_lord`는 `fired` 플래그까지 세우고(그 국의 +3판 예약) 아무 일도 못 하고,
    `conjure_draw`는 "매 국 1회"를 소진한 채 아무 패도 못 부른다.
  - 국의 마지막 한 장, 즉 승패가 걸린 장면에서 결과가 갈린다.

- 재현: `tsx qa-lab/synergy3/kandora/repro_haitei.ts`
- 영향: 두 카드가 같은 좌석에 모이면 매 국 마지막 순마다 발생. 순서가 화면 어디에도 없다.
- 제안 수정: 우선순위를 정해 문서화한다. 예: `haitei_lord`가 이기고(해저패는 지배자의 것),
  이 경우 `conjure_draw`의 예약은 **소모하지 않고 다음 쯔모로 미룬다**. 최소한
  `conjure_draw`의 리액션이 "이미 이번 쯔모를 다른 증강이 바꿨으면 미룬다"를 보게 한다.

---

## 확정 3. 🟠 `triple_peek` × `bottom_deal` — "어긋나지 않는다"가 4/4 어긋난다

- 위치: [`triple_peek.ts:112-129`](../../packages/content/src/augments/triple_peek.ts#L112) (`peekMyDrawKinds` — 패산 **앞**을 좌석 순서로 배정) ×
  [`bottom_deal.ts`](../../packages/content/src/augments/bottom_deal.ts) (쯔모를 패산 **최후미**로 갈아 끼우는 인터셉터)

- 설명이 약속한 것: `triple_peek` detail — "누가 퐁·치·깡을 해 차례가 밀려도 **지금 기준으로 다시
  계산돼 어긋나지 않는다**." (`bottom_deal`은 매 순 쓸 수 있고 선언 사실은 전원 공개다.)

- 기대: 밑장빼기도 "판이 움직이는 사건"이므로 실시간 재계산에 반영되어 예고가 맞아야 한다.

- 실제: 각 쯔모 **직전**의 채널 첫 항목과 실제로 뽑힌 패를 4회 대조(패산은 결정론 셔플):

  | 조합 | 검사 | 불일치 | 사례 |
  |---|---|---|---|
  | `triple_peek`만 | 4 | **0** | — |
  | + p0 자신이 밑장빼기 | 4 | **4** | 예고 sou1→실제 sou3 / wind2→dragon1 / dragon2→sou5 / dragon3→sou2 |
  | + p1(하가)이 밑장빼기 | 4 | **3** | sou3→wind2 / sou3→dragon2 / wind4→dragon3 |
  | + p2(대면)가 밑장빼기 | 4 | **3** | 위와 동일 |

  `peekMyDrawKinds`는 "패산 index 0부터 좌석이 한 칸씩 돌며 뽑는다"를 전제한다. 밑장빼기는
  **앞을 소모하지 않고 뒤를 뽑으므로** ① 내 몫이 뒤로 한 칸씩 밀리고 ② 내가 선언했을 때는
  다음 패 자체가 예고 목록에 없는 패다. **남의 좌석이 써도 내 예고가 깨진다.**

- 재현: `tsx qa-lab/synergy3/kandora/repro_peek_live.ts` (스냅샷 비교판: `repro_peek_mismatch.ts`)
- 영향: 정보형 증강이 **틀린 정보를 확신 있게** 준다. `triple_peek`은 2국 1회 자원이라 손해가 크다.
- 제안 수정: `peekMyDrawKinds`가 각 좌석의 `bottom_deal:armed` 예약을 읽어 그 좌석의 몫을
  패산 최후미로 배정한다(예약은 전원 공개 정보라 정보 누설이 아니다).

---

## 확정 4. 🟠 `ura_peek` × `dead_wall_master` — 갈아 끼운 뒷도라를 이면투시가 낡은 값으로 계속 보여 준다

- 위치: [`ura_peek.ts:270-284`](../../packages/content/src/augments/ura_peek.ts#L270)
  (갱신 리액션이 `DORA_FLIPPED` **하나뿐**) ×
  [`dead_wall_master.ts:230-250`](../../packages/content/src/augments/dead_wall_master.ts#L230)
  (`DeadWallMasterSwapped` — 왕패 아무 자리나 손패와 맞바꾼다. 뒷도라 표시패 자리 포함)

- 설명이 약속한 것: `ura_peek` detail — "한 번 열면 **그 국 동안 유지되어**, 깡으로 뒷도라가 늘면
  새 표시패도 자동으로 보인다." / `dead_wall_master` detail — "왕패 14장에는 **도라·뒷도라 표시패도
  들어 있어 표시패까지 바꿀 수 있고**".

- 기대: 뒷도라가 바뀌었으면 이면투시 화면도 따라 바뀐다(또는 최소한 "바뀌었다"를 알린다).

- 실제:

  ```
  확인 시점 표시   = pin6
  지금 p0 화면     = pin6      ← 갱신되지 않음
  실제 뒷도라 표시패 = man1      → **어긋남**
  ```

  `uraIndicatorIds`는 자리(=표도라 표시패의 +1)로 계산되므로 왕패의 주인이 그 자리를 갈아 끼우면
  **실제 뒷도라가 바뀐다.** 그런데 이면투시의 갱신은 `DORA_FLIPPED`에만 걸려 있어 그 사건을 못 듣는다.
  같은 부류가 `mirror_dora`에서 이미 잡혀 `ctx.reaction("*")`로 고쳐졌는데
  (`mirror_dora.ts:99-121` 주석, qa-lab score-b 확정 4) 이면투시만 남아 있다.

- 대조군(같은 장면, 왕패의 주인이 도라 표시패를 갈았을 때):

  | 증강 | 표시패 변화 | 화면 |
  |---|---|---|
  | `mirror_dora` + `dead_wall_master` | man4 → man1 | 채널 `["man9"]` = man1의 앞 → **정상 추종** |
  | `ura_peek` + `dead_wall_master` | 뒷도라 pin6 → man1 | 화면 `pin6` → **낡은 값** |

- 재현: `tsx qa-lab/synergy3/kandora/repro_deadwall_cross.ts` (G2 · G3)
- 영향: 이면투시의 전부는 "리치를 걸지 다마로 갈지"를 뒷도라로 판단하는 것이다. 그 판단이 거짓 정보로 선다.
- 제안 수정: `ura_peek`의 갱신 리액션을 `ctx.reaction("*")` + 값 비교로 바꾼다(거울과 같은 방식).

---

## 의심 1. 🟡 `foresight` × `bottom_deal` — 밑장 쯔모가 예언 창을 한 칸 잘못 깎는다

- 위치: [`foresight.ts:318-325`](../../packages/content/src/augments/foresight.ts#L318) —
  `TILE_DRAWN`이면 `rinshan`만 빼고 **무조건** `peekLeft`를 1 줄인다.
- 설명: "공개된 4장은 지금 차례 기준으로 하가·대면·상가·나에게 차례로 배정된다.
  중간에 누가 **퐁·치**를 하면 배정이 한 칸씩 당겨진다."
- 기대: 밑장빼기는 패산 **앞**을 소모하지 않으므로 예언 4장은 그대로 남고, 배정만 밀려야 한다.
- 실제:

  ```
  발동 직후 채널   = dragon3 sou2 sou1 sou1
  발동 직후 패산앞 = dragon3 sou2 sou1 sou1
  (남 셋이 앞 3장을 뽑고, 나는 밑장빼기로 최후미를 뽑았다)
  밑장 쯔모 뒤 채널   = (빔)          ← 네 번째 예언패가 아직 패산에 있는데 창이 닫혔다
  밑장 쯔모 뒤 패산앞 = sou1 sou8 …    ← 그 sou1이 여기 그대로 있다
  ```
  그리고 배정도 깨진다 — 예언 4장 `dragon3 sou2 sou1 sou1` 중 **네 번째(내 몫)가 오지 않고**
  나는 최후미 `wind4`를 뽑았다.
- 재현: `tsx qa-lab/synergy3/kandora/repro_foresight.ts` (F2 · F2b)
- 왜 의심인가: 배정이 밀리는 것 자체는 카드가 "퐁·치"로 예고한 부류의 확장이라 문구 문제로 볼 수 있다.
  다만 **`peekLeft` 과다 차감**은 명백한 구현 실수다(패산 앞이 안 줄었는데 창이 줄었다).
- 제안 수정: `peekLeft` 차감을 "그 쯔모가 실제로 패산 **앞**에서 나왔을 때"로 좁힌다
  (그 tileId가 직전 `frontIds`에 있었는지로 판정). detail의 "퐁·치" 열거에 밑장빼기·북빼기도 넣는다.

---

## 의심 2. 🟡 `snake_kan` × `cliff_bloom` — 연속 4장 **두 벌**이면 확정 화료(때로 역만)

- 설명: `cliff_bloom` — "한 국에 **깡을 두 번** 하면 텐파이가 아니어도 손이 만개해 즉시 영상개화로 화료";
  `snake_kan` — "같은 무늬 **연속 4장**을 깡으로 낼 수 있다 … 산안커·스깡쯔에도 포함된다".
  두 카드 어디에도 서로에 대한 말이 없다.
- 기대: 만개 조건은 "같은 패 4장 × 2벌"이라 자연 발생이 매우 드물다. 장사진이 붙으면 **연속 4장 × 2벌**로
  내려가는데, 이건 배패에서 흔하다.
- 실제(같은 손을 `snake_kan`만 / `snake_kan+cliff_bloom`으로, 봇 개입 없이 안깡만 눌러 진행):

  | 손패(14장) | snake만 화료 | snake+bloom 만개 | snake+bloom 화료 | 역 |
  |---|---|---|---|---|
  | 3456m3456p1199s55s | ✕ | ○ | ○ | **suuankou 역만** |
  | 2345m4567p123s999s | ✕ | ○ | ○ | menzen_tsumo·rinshan |
  | 3456m2345s123p999s | ○ | ○ | ○ | +sanankou |
  | 1234m6789p258s777z | ✕ | ○ | ○ | +yakuhai·sanankou |
  | 4567m4567s123p111z | ○ | ○ | ○ | +yakuhai·sanankou |

  **5/5 만개 → 5/5 화료.** 장사진 깡이 커쯔로도 세어지므로(카드가 그렇게 약속한다) 만개 손이
  스안커까지 닿는다.
- 재현: `tsx qa-lab/synergy3/kandora/repro_snake_bloom.ts`
- 왜 의심인가: 두 카드의 문구를 곧이곧대로 합치면 **논리적으로는 도출된다**(장사진 깡도 깡이다).
  버그가 아니라 밸런스·가독성 문제로 본다. 다만 프리즘 둘이 만나 "배패에서 확정 화료"가 되는 것은
  드래프트 가중치(`synergy.ts`)에서 눌러 둘 값어치가 있다 — 지금 둘은 `kan` 축을 공유해
  **오히려 함께 뜰 확률이 올라간다**(`snake_kan: e(["kan","dora"])` · `cliff_bloom: e(["kan","wall_info"])`).
- 제안 수정: `cliff_bloom`의 `antiIds`에 `snake_kan` 추가, 또는 만개 조건을 "같은 패 4장의 깡 2회"로 좁힌다.

---

## 의심 3. 🟡 `red_five_touch` × `cliff_bloom` — 만개가 만든 **생성패**에도 각인이 자동으로 붙는다

- 위치: [`red_five_touch.ts:236-247`](../../packages/content/src/augments/red_five_touch.ts#L236) —
  각인 리액션이 `ctx.reaction("*")`라 만개 직후의 손패 전체를 다시 훑는다.
- 설명: "그 뒤로 **내 손에 들어오는** 그 숫자가 게임이 끝날 때까지 전부 적도라가 된다."
- 실제: 5를 각인한 상태에서 만개하면, 만개가 새로 **만들어 낸**(`conjured`) 5까지 `red+redFor:p0`가 붙는다.

  | 손패 | conjured | red | redFor |
  |---|---|---|---|
  | pin5 ×3 | false | true | p0 |
  | **pin5** | **true** | **true** | **p0** |
  | pin5(자연 적5) | false | true | — |

  결과: `redHan = 5` — 실제 세상에 없는 5번째 pin5가 적도라 한 판을 더 얹었다.
- 재현: `tsx qa-lab/synergy3/kandora/repro_red.ts` (B3)
- 왜 의심인가: 만개가 4장 한도를 넘는 생성패를 만드는 것은 **이미 사용자 확정된 동작**이고
  (docs/25 P8), "손에 들어온 그 숫자"라는 문구도 문자 그대로는 맞다. 다만 "손에 **들어오는**"이
  *뽑은 패*를 뜻한다고 읽히므로, 자기 증강이 만들어 낸 패에도 붙는 것은 문구에 없다.
- 제안 수정: 판정이 필요하다면 `attrs.conjured === true`인 패는 각인 대상에서 뺀다. 아니면 detail에
  "증강이 만들어 낸 패에도 붙는다"를 한 줄 적는다.

---

## 음성 확인 (돌려 봤고 깨끗했다)

도라 판수 표기: `doraHan` = 표·개인 도라 합, `extraHan` = `score.extraHan` 원값
(역만 화료에서는 정산이 이 값을 0으로 만든다 — `standardActions.ts:927`, 확인함).

| # | 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | `mirror_dora` × `dora_afterimage` (잔상=7m, 무관한 종류) | 1 / 2 / 2 / **3** | 1 / 2 / 2 / **3** | ○ 완전 가산 |
| 2 | 〃 (잔상 = 이번 국 도라와 같은 5m) | 카드대로 **중첩**(같은 패가 두 번) | 1 / 2 / 2 / **3** | ○ 의도대로 |
| 3 | 〃 (잔상 = 거울 앞도라와 같은 3m) | 중첩 | 1 / 2 / 2 / **3** | ○ 이중 계산 아님 |
| 4 | `ankan_dora` × `mirror_dora`, 표시패가 깡과 무관(9p) | +4 / +0 / **+4** | 동일 | ○ |
| 5 | 〃 표시패 4p (거울 앞도라 3p = 깡 4장) | +4 / +4도라 / **+8** | 동일 | ○ |
| 6 | 〃 표시패 2p (표준 도라 3p = 깡 4장) | 표준 4도라 + ankan 4판 | 동일 | ○ 표준 도라와 안 겹침 |
| 7 | `ankan_dora` × `snake_kan` (안깡 3456p, 랭크 섞임) | 네 장 전부 = **+4** | +4 | ○ 카드대로 |
| 8 | `north_trader` × `ankan_dora` × `mirror_dora` × `dora_afterimage` 4종 | 각각 +2 / +4 / +1 / +1, 합 8 | doraHan 3 · extraHan 6 · 총 13 (기저 5) | ○ 정확히 합 |
| 9 | `red_five_touch` × `mirror_dora` | red 3→8, dora 3→4, 서로 독립 | 동일 | ○ |
| 10 | 각인된 적도라를 상대가 후로로 가져감 | 상대 `redHan`에 안 들어감 | 표시없음 1 · 자연적5 2 · **redFor:p0 1** · redFor:p1 2 | ○ 소유권 정확 |
| 11 | `mirror_dora` 뒷도라(앞뒷도라) × 리치 + 안깡 | ura 1 → **2** | 1 → 2 | ○ 표도라와 별개로 뒷도라 표시패를 읽는다 |
| 12 | `ura_peek`가 뒷도라 **판수**에 영향 | 없음(정보형) | ura 1 그대로 | ○ |
| 13 | 안깡 3연발 · 증강 7종류 조합 | 왕패 14→11 · 영상패 4→1 · 표시패 1→4 | 전 조합 동일 | ○ 왕패 회계 불변 |
| 14 | 안깡 **4회** (`ankan_dora`+`cliff_bloom`) | 왕패 10 · 영상패 0 · 표시패 5 · +16판 | 동일 | ○ (단 4안깡은 역만이라 +16은 실제로 안 붙는다) |
| 15 | `north_trader` 북빼기 ×2 → 안깡 → 북빼기 ×2 | 왕패·영상패 불변, 패산만 −1씩 | 14/4 유지 → 깡 뒤 13/3 유지, 패산 70→66 | ○ 카드대로 |
| 16 | `north_trader` 깡 뒤 영상패 0에서 | 북빼기 막힘 | 후보 안 뜸 | ○ |
| 17 | `rinshan_preview` 교환 + `dead_wall_master` 교환 2회 (같은 순, antiIds 쌍) | 손패·왕패·영상패 전부 불변 | 14/14/4 유지 | ○ 함께 들어도 안 깨진다 |
| 18 | `dead_wall_master`가 도라 표시패 교체 → `mirror_dora` 공개 채널 | 새 앞도라로 갱신 | man4→man1 시 채널 `["man9"]` | ○ (score-b 확정 4 수정이 유지된다) |
| 19 | `dora_conceal`(p1) × `dead_wall_master`(p0) 왕패 열람 | 표시패 종류가 안 새야 | `tiles`에 없음, 자리표로 대체 | ○ (docs/25 정보 #3 수정 유지) |
| 20 | `void_kan`(p0) × 상대 표준 안깡 | 손패 1장이 깡패의 오름패로, 론 후보 | sou5→wind1, 론 후보 ○ | ○ |
| 21 | `void_kan` × `snake_kan`(연속 4장 안깡) | 깡패 = `handTileIds[0]`(2m)로 창깡 성립 | man2→sou5로 위조, 론 후보 ○ | ○ (연속깡의 "깡패"는 최저 랭크 1장으로 결정 — 자의적이지만 결정론) |
| 22 | `void_kan` × `cliff_bloom`(2번째 깡) / × `ankan_dora` | 상대 증강과 무관하게 동작 | 동일 | ○ |
| 23 | 창깡 론 성립 뒤 왕패·도라 회계 | 강탈된 깡의 깡도라는 뒤집히지 않아야 | 왕패 14 · 영상패 4 · 표시패 1 · pendingDora 1(미해소) | ○ 표준대로 |
| 24 | `north_trader`가 패산 **최후미**를 가져간다 (= `bottom_deal`의 밑장 · `haitei_lord`의 해저패) | 밑장 창이 한 칸 밀리고, 그 패가 다음 영상패가 된다 | 밑3 `sou5 sou6 sou5` → `sou4 sou5 sou6`, 왕패[0] = sou5 | ○ 카드("밀어 넣으면 밀린다")의 반대 방향도 성립 |
| 25 | 패산 1장에서 북빼기 → 유국 | 크래시 없이 국 종료, 해저패 소멸 | `roundOver` | ○ (해저의 지배자가 그 국에 발동 못 하는 것은 카드가 예고한 "국이 빨리 끝난다") |

**부수 관찰(보고 대상 아님, 다음 라운드용 메모)**
- 안깡 4회는 언제나 스안커+스깡쯔 역만이라 `ankan_dora`의 +16판은 **원리적으로 실현되지 않는다**
  (역만에는 `score.extraHan`이 0). 카드의 "묶음마다 +4판"이 실제로 값하는 상한은 3묶음 = +12판이다.
- `cliff_bloom`의 만개 +3판은 `lastDrawRinshan`만 보므로, 같은 국에 `north_trader` 북빼기로
  화료하면(북빼기도 `lastDrawRinshan=true`) 깡이 아닌 화료에도 붙는다. 만개한 국 한정이라
  카드 문구와 정면으로 어긋나지는 않아 확정으로 올리지 않았다.

## 재현 스크립트

| 파일 | 다루는 것 |
|---|---|
| `qa-lab/synergy3/kandora/lib.ts` | 공용 도구(표시패 지정·패산 확보·왕패 절단·채점) |
| `repro_dora_stack.ts` | 음성 1~3 (거울 × 잔상 4칸 표 3벌) |
| `repro_ankan_dora.ts` | 음성 4~7 (밀실의 도라 × 거울 × 장사진) |
| `repro_conceal_leak.ts` | **확정 1** |
| `repro_haitei.ts` | **확정 2** |
| `repro_peek_live.ts` · `repro_peek_mismatch.ts` | **확정 3** |
| `repro_deadwall_cross.ts` | **확정 4** · 음성 17~19 |
| `repro_foresight.ts` | 의심 1 |
| `repro_snake_bloom.ts` | 의심 2 |
| `repro_red.ts` | 의심 3 · 음성 9~10 |
| `repro_deadwall.ts` | 음성 13 |
| `repro_north.ts` | 음성 8·15·16·24·25 |
| `repro_ura.ts` | 음성 11~12·14 |
