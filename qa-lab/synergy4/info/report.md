# synergy4 — 정보 축 (wall_info · opp_info · 도라 정보 · 안개) 보고서

작성 2026-08-31. 소스는 **한 줄도 고치지 않았다.** 스크립트는 전부 `qa-lab/synergy4/info/` 아래.

## 0. 축의 증강 (21장)

| 분류 | 증강 |
|---|---|
| wall_info (9) | `ura_peek` 이면투시 · `rinshan_preview` 영상 정찰 · `future_sight` 미래를 보는 자 · `bottom_deal` 밑장빼기 · `cliff_bloom` 절벽 위에 피어난 꽃 · `foresight` 예지 · `dead_wall_master` 왕패의 주인 · `conjure_draw` 소환 · `triple_peek` 삼세 예지 |
| opp_info (9) | `peek_riichi_waits` 선언 간파 · `xray_hand` 투시 · `hidden_river` 안개 덮인 바닥 · `hand_swap3` 등가교환 · `full_hand_swap` 통째로 바꾸기 · `dora_conceal` 가려진 도라 · `brief_fog` 박무 · `tenpai_scan` 천리안 · `danger_sense` 지뢰 탐지 |
| 도라 정보 (+3) | `red_five_touch` 붉은 손길 · `mirror_dora` 거울 · `dora_afterimage` 잔상 |

**2장 조합은 210개이고 `conflicts`로 잠긴 쌍은 하나도 없다** (`out/combos.txt`에 전부 나열).
3~4장은 전수(1330+)가 불가능해, ① 2장 전수 스위프 + ② 정보를 여는/가리는 카드를 한 탁자에
세운 **3~4장 스택 3종 × 반장전 3시드**로 덮었다(`t7_stacks.ts`).

## 1. 방법

**(a) 뷰 직렬화 직접 측정** — `lib.ts`가 `craft`로 상태를 만들고 증강을 설치한 뒤
`buildPlayerView`를 **좌석마다 + 관전자(`__spectator`)** 로 직접 만든다. 서버가 실제로
내보내는 그 함수다. 단독 A / 단독 B / A+B 를 **같은 상태**에서 재고 비교한다.

**(b) 실제 판 스위프** — `sweep.ts`. `HanchanController`를 돌리며 `PersonaAgent.sendView`
(= 서버가 그 좌석에 보내는 뷰)를 **매 브로드캐스트마다** 검사한다. 불변식:

| 코드 | 뜻 |
|---|---|
| H / W / D | 남의 손패 · 패산 · 왕패가 그것을 여는 증강 없이 보인다 |
| CX | 남이 «가려진 도라»를 들었는데 내 뷰에 도라 표시패가 실렸다 |
| CB | 내가 «가려진 도라» 보유자인데 내 뷰에 도라 표시패가 없다 |
| P | 관전 뷰의 `seat:{owner}:{ch}` 사본으로 판정한 남의 전용 채널이 내 뷰에 실렸다 |
| S | `tiles` 맵에 어느 존에서도 안 보이는 패가 실렸다 (`revealTiles:*` 누출 후보) |

---

## 2. 확정 결함

### 확정 1 — «가려진 도라»를 둘이 들면 **둘 다 자기 도라를 잃는다** (심각도: 중)

* 조합: `dora_conceal` × `dora_conceal` (좌석 2개). 드래프트 풀에 제한이 없어 실제 판에서 그냥 난다.
* 기대(카드 문구): "(상시) 도라 표시패가 **상대에게는** 가려진다 — **도라는 나만 알 수 있다.**"
  → 보유자 둘은 각자 자기 도라를 그대로 봐야 한다.
* 실측:

  ```
  A) dora_conceal 단독 (p0)      p0=["pin6"]  p1=[]  관전자=["pin6"]   ← 설명대로
  B) dora_conceal 둘 (p0 + p1)   p0=[]        p1=[]  p2=[]             ← 둘 다 실명
  ```

  실제 판(`sweep.ts singles`, `t7_stacks.ts` 스택 1 · 3시드 전부)에서도 매 국 재현:
  `CB p0 보유자인데 도라 표시패가 하나도 안 보임 (은폐자 p0,p1)` + 같은 줄의 p1.
* 원인: `packages/content/src/augments/dora_conceal.ts:32-45` —
  모디파이어가 `if (rctx.playerId === holder) return cur;` 로 **자기 인스턴스의 보유자 하나만**
  면제한다. 둘이 들면 서로의 모디파이어에 걸려 둘 다 `true`가 된다.
  코어는 `packages/core/src/information/PlayerView.ts:524-531`에서 그 값을 그대로 써
  `round.doraIndicators`를 비우고 왕패의 그 자리를 자리표로 바꾼다.
* **이 결함은 이미 한 번 고쳐진 적이 있는 «모양»이다.** 안개 둘이 서로를 가리던 같은 버그를
  `augments/fogScope.ts`(`fogCasterNow`)가 «지금 안개를 건 사람이면 누구든 면제»로 올려 고쳤다
  (파일 첫 주석이 그 사고를 그대로 적어 뒀다). 가려진 도라에는 그 교훈이 옮겨지지 않았다.
* 파급:
  - 점수 계산은 상태를 보므로 정확하다. **화면과 봇 판단만** 틀린다(봇은 뷰를 읽는다).
  - 클라이언트가 `packages/client/src/App.tsx:22409`에서 `doraIndicators.length === 0`을 보고
    «가려진 도라» 뱃지를 그리는데, 보유자 둘 중 한쪽에게 **다른 한쪽을 지목한 뱃지**가 뜬다
    (`holder = players.find(...dora_conceal)` — 자기 자신이 먼저 잡히면 뱃지가 안 뜨고,
    상대가 먼저 잡히면 "그 사람만 안다"고 거짓말한다. 실제로는 아무도 모른다).
* 재현: `qa-lab/synergy4/info/t1_conceal.ts` (B절) · `qa-lab/synergy4/info/t7_stacks.ts` (스택 1)

### 확정 2 — 소환이 예약되면 «삼세 예지»가 **오지 않을 패를 예고한다** (심각도: 중)

* 조합: `triple_peek` + `conjure_draw` (같은 좌석).
* 기대(카드 문구): 삼세 예지 = "그 국이 끝날 때까지 **내 다음 쯔모 세 장의 종류**가
  나에게만 **실시간으로** 보인다". 소환 = "다음 내 쯔모가 그 패의 복제로 **바뀐다**".
  → 소환을 예약한 순간 예고의 첫 장은 소환패로 바뀌어야 한다.
* 실측 (`t8_conjure.ts`):

  ```
  예고(소환 전) = ["pin9","sou1","sou2"]
  소환 목표     = man1   (전원 공개 채널로 이미 공개돼 있다)
  예고(소환 후) = ["pin9","sou1","sou2"]   ← 그대로
  → 예고 첫 장 = pin9, 실제로 들어올 패 = man1
  ```
* 원인: `augments/triple_peek.ts`의 예고는 `WALL` 존의 kind에서 파생되는데,
  `augments/conjure_draw.ts:152-186`의 변환은 **뽑힌 뒤에**(`TILE_DRAWN` 리액션에서
  `tileKindChanged`) 일어난다. 예고 계산은 `conjure_draw:pending:*` 예약을 보지 않는다.
* 같은 파일이 밑장빼기에 대해서는 이 문제를 이미 한 번 고쳤다
  (`triple_peek.ts` — `bottomDealArmed`를 읽어 앞뒤로 헤아린다). 소환은 그 목록에 없다.
* 재현: `qa-lab/synergy4/info/t8_conjure.ts`

### 확정 3 — «거울»이 «가려진 도라»를 산수로 뚫는다 (심각도: 하 — 설계 의도일 수 있으나 카드 문구와 어긋남)

* 조합: `dora_conceal`(p0) + `mirror_dora`(p1).
* 기대(카드 문구): 가려진 도라 = "도라는 **나만** 알 수 있다". 면책 문구는 카드 어디에도 없다
  (`dora_conceal.ts`의 `description`/`detail` 전문 확인).
* 실측 (`t2_dora_pairs.ts` A절):

  ```
  표시패 = pin6 (실제 도라 = pin7)
  p0(은폐자): mirror_dora:p1 = ["pin5"]
  p1(거울)  : mirror_dora:p1 = ["pin5"]      ← p1은 표시패를 못 보지만 앞도라를 받는다
  p2, p3    : {}                              ← 제3자에게는 안 샌다 (2026-08-23 수정이 살아 있다)
  ```

  앞도라는 표시패의 **정확한 역함수**라 `pin5 → 표시패 pin6 → 도라 pin7`이 그 자리에서 나온다.
* 원인: `augments/mirror_dora.ts:120-160` `announce()` — 표시패가 가려진 국에는 공개 채널을
  끄고 «표시패를 볼 수 있는 좌석 **+ 보유자 본인**»에게만 좌석 채널로 보낸다.
  `visible = id === holder || !indicatorsHiddenFor(...)`. 코드 주석은 이 예외의 근거로
  가려진 도라의 «면책 문구»를 인용하는데, **그 문구는 실제 카드에 없다.**
* 판단이 필요하다: (a) 거울 보유자가 자기 도라를 못 세면 카드가 죽고, (b) 지금대로면
  가려진 도라의 문구가 거짓이다. 어느 쪽이든 **한쪽 카드 텍스트를 고쳐야** 맞는다.
* 재현: `qa-lab/synergy4/info/t2_dora_pairs.ts`

### 확정 4 — 은폐 중에는 «왕패의 주인» 모달이 표시패 자리를 **«아직 안 열림»으로 잘못 적는다** (심각도: 하 · 표시)

* 조합: `dora_conceal`(상대) + `dead_wall_master`(나).
* 실측: 은폐 중 왕패의 주인 보유자의 뷰에서 `round.doraIndicators = []`
  (`t1_conceal.ts` C절 · `t5_swap_conceal.ts` B절 — 왕패 자리 수 14는 보존되고 index 4가 자리표).
* 클라이언트 `packages/client/src/App.tsx:23430`이 그 길이를 그대로
  `deadWallSlotInfo(idx, view.round.doraIndicators.length, …)`의 `flipped`로 넘긴다
  (`App.tsx:2410-2427`). `flipped = 0`이므로 **이미 뒤집힌 표시패 자리**가
  «도라 표시 1 (깡 0회 시)»로 그려진다 — 공개된 자리를 미공개로 적는다.
  순수 함수 + 실측 입력(0)이라 결과가 결정적이다.
* 참고: 자리 정합성 자체는 멀쩡하다. 은폐 중에 index 4를 지목해 교환하면 실제 표시패가
  교환되고 `doraIndicators`가 내 손패로 갈아 끼워지며 왕패는 14장을 유지한다
  (`t5_swap_conceal.ts` — 대조군 A와 은폐군 B가 완전히 같은 결과). 2026-08 감사가 고친
  자리표(`concealedTileIdAt`) 설계가 그대로 살아 있다.

---

## 3. 의심 (확정으로 올리지 못한 것)

1. **`foresight`(예지) × 남의 좌석 `conjure_draw`** — 예지는 "공개된 4장이 하가·대면·상가·나에게
   차례로 배정된다"고 적는데, 그중 한 자리의 주인이 소환을 예약해 두면 그 사람은 다른 종류를
   받는다. 확정 2와 **같은 기전**이고 예지 채널이 패산 kind 그대로임은 확인했으나
   (`t8_conjure.ts` 하단), 한 판에서 «예지 발동 → 남의 소환 → 실제 쯔모»를 끝까지 몰아 본
   재현은 못 만들었다(자기 순 제약 때문에 크래프트 상태로는 순서를 못 돌린다).
2. **`hand_swap3` 지정 후 교환을 완결하지 않으면 상대 손패가 그 국 내내 열려 있는가** —
   `hand_swap3.ts:288`이 지정 시점에 `revealTiles:{target}`을 채우고, 지우는 곳은
   교환 완결(`:434`)과 `ROUND_STARTED`(`:455`) 둘뿐이다. 지정만 하고 빠져나가는 경로가
   실제로 있는지(프롬프트가 3+3 선택을 강제하는지) 확인하지 못했다. 있다면 «등가교환»이
   투시의 상위 호환이 된다.
3. **`future_sight`의 `revealTiles:future`가 보유자별로 갈라져 있지 않다**
   (`future_sight.ts:116` — `roundViewKey("*", "revealTiles:future")` 고정 1개).
   박무가 같은 함정을 밟고 «보유자별로 갈라야 한다»로 고친 전례가 파일 주석에 있다.
   실측상 값이 **합집합으로 누적**되고 국 시작에 양쪽이 함께 비우므로 지금은 실해가 없다
   (스위프의 S 히트가 그 합집합이다). 세 번째 사용처가 생기면 덮어쓰기가 난다.
4. **`foresight`의 `peekLeft` 카운터** — `TILE_DRAWN`으로만 줄어들어, 패산 앞을 그 이벤트
   없이 가져가는 경로(`future_sight` 앞 3장 교환, `full_hand_swap` 13장 refill)에서는
   창이 예정보다 오래 열려 있는다. 화면 값 자체는 매 이벤트 재계산이라 거짓이 아니어서
   «버프»인지 «버그»인지 판단을 보류한다.

---

## 4. 이상 없음으로 판정한 것 (한 줄 요약)

**정보를 여는 카드 vs 가리는 카드 — 누가 이기는가**

* 도라: **가리는 쪽이 이긴다.** 왕패를 여는 네 장(`dead_wall_master` 14장 · `ura_peek` 발동 후
  전체 · `rinshan_preview` 남은 영상패 · `cliff_bloom`) 전부에서 표시패 자리가 자리표로 가려지고,
  왕패 자리 수(14)와 인덱스 정합성이 보존된다. 관전자에게는 정상 공개된다. (`t1_conceal.ts`)
  유일한 우회는 확정 3(거울).
* 바닥: **가리는 쪽만 있다** — `visibility.discards`를 건드리는 증강은 안개 둘뿐이고 여는 카드는 없다.
  두 안개가 겹쳐도 **선언한 사람은 전원 면제**되고 비선언자는 좁은 쪽(박무 `count_only`)이 이긴다.
  `hidden_river×2`, `brief_fog×2`, `hidden_river+brief_fog` 세 경우 모두 통과 (`t3_fog.ts` C·D1·D2).
  2026-08-23에 `fogScope.ts`로 올린 수정이 그대로 살아 있다.
* 손패: 여는 카드는 `xray_hand` 하나뿐이고 가리는 카드가 없다. 안개와 서로 간섭하지 않는다
  (`t3_fog.ts` E — 투시 보유자는 손패 3×13을 보면서 바닥은 안개대로 가려진다).

**정보 카드 둘을 겹치면 더 보이는가** (`t4_stack.ts`, 16쌍 · 단독A/단독B/A+B 동일 상태 비교)

깎이는 조합이 하나도 없었다. 왕패 열람 셋은 `widenPeek`으로 «넓은 쪽»이 이기고
(`dead_wall_master`+`rinshan_preview` = 14, `rinshan_preview`+`ura_peek` = 14),
서로 다른 존은 그대로 더해진다(`bottom_deal`+`dead_wall_master` = 패산 3 + 왕패 14,
`xray_hand`+`bottom_deal` = tiles 53→56). 채널형(`foresight`·`triple_peek`·`tenpai_scan`·
`danger_sense`)은 키가 달라 한 채널도 사라지지 않는다.
`visibility.wall`을 건드리는 증강은 `bottom_deal` 하나뿐이라 `widenPeek`이 `pick` 방향
(`front`/`back`)을 무시하는 문제는 **지금은 발현하지 않는다** — 패산을 여는 두 번째 증강이
생기는 날 열릴 구멍이다(각 파일 주석도 그 위험을 적어 두었다).

**정보 누출 (상대·관전자 뷰 직렬화)**

* 전용 채널 격리는 정확하다. 같은 정보 카드를 둘이 들고 한쪽만 발동해도 다른 쪽 뷰에
  내용이 실리지 않는다 (`t9_ura_iso.ts` — `ura_peek`·`tenpai_scan`).
* `tiles` 맵에 «존 밖 패»가 실리는 건은 전부 **설계된 공개 채널**이었다:
  `revealTiles:fog:{holder}`(박무의 마지막 버림 1장 — detail에 명시),
  `revealTiles:future`(미래를 보는 자가 가져온 3장 — detail에 명시),
  `revealTiles:{target}`(등가교환 — `roundViewKey(holder, …)`라 **보유자 전용**이며 남에게 안 간다).
* 스위프의 `P` 히트는 검출기 오탐이다: 관전 뷰의 소유 사본은 에이전트 뷰보다 **한 브로드캐스트
  늦게** 도착해, 두 좌석이 같은 채널 이름을 쓸 때 소유 집합이 잠깐 한 명으로 보인다.
  `t9_ura_iso.ts`로 직접 재서 누출이 아님을 확인했다.
  `bottom_deal:armed:*`와 `mirror_dora:*`는 **같은 이름을 공개/전용 두 채널로 함께 쓰는** 설계라
  검출기에서 제외했다(값이 항상 함께 갱신되어 어긋나지 않는다 — `bottom_deal.ts:249-256, 296-306`).

**그 밖에 정상 확인**

* `dora_afterimage`의 공개 채널은 **직전 국** 도라만 싣는다 — 은폐 중인 이번 국 표시패를 새게
  하지 않는다 (`t2_dora_pairs.ts` D).
* `dora_conceal`+`mirror_dora`를 **같은 사람**이 들면 남에게 한 글자도 안 나간다 (같은 파일 B).
* `danger_sense`는 안개 속에서도 정상 동작하고 결과가 남에게 안 샌다 (`t3_fog.ts` F).
* `peek_riichi_waits`는 스텔스 리치를 «리치 아님»으로 처리한다(`peek_riichi_waits.ts:124, 316`).
* 각 좌석은 자기 바닥은 안개 속에서도 그대로 본다(안개는 남의 시야만 가린다).

**2장 전수 스위프** — `out/pairs_0..3.txt` (210쌍 전부 × 1시드, 동풍전, 4샤드 완주).
좌석 배치는 `p0 = [A, B]` · `p1 = [A]` · `p2 = [B]` 라서 **같은 카드 둘**과 **A vs B 대치**를
한 판에 함께 본다. 결과:

```
크래시 0 · 훅 예외(EFFECT) 0 · H 0 · W 0 · D 0 · CX 0
CB 40건 — 은폐자 목록이 «p0,p2» 28건 / «p0,p1» 12건 = 전부 두 명일 때만 (확정 1)
          은폐자가 한 명인 CB는 210쌍 전체에서 0건 (단독 은폐는 정상)
P 186건 · S 1681건 — 위에 적은 검출기 오탐 / 설계된 공개 채널
```

`t7_stacks.ts`(반장전 8국)에서 은폐자 한 명인데 뜬 `CB`는 국 경계 오탐이다 — 관전 스냅샷이
직전 국의 표시패 수를 들고 있는 사이 새 국의 표시패가 아직 안 뒤집힌 순간. 동풍전 스위프에서는
한 건도 나오지 않았고, `t1_conceal.ts` A절이 단독 은폐의 정상 동작을 직접 확인한다.

---

## 5. 스크립트

| 파일 | 무엇 |
|---|---|
| `lib.ts` | 상태 조립 + `buildPlayerView` 좌석별 직접 생성 · 액션 제출 · 누출 헬퍼 |
| `combos.ts` | 축 21장의 2장 조합 210개 전부 나열 (`out/combos.txt`) |
| `t1_conceal.ts` | 가려진 도라 단독/둘/왕패 열람 카드와의 대결 → **확정 1** |
| `t2_dora_pairs.ts` | 가려진 도라 × 거울/잔상 → **확정 3** |
| `t3_fog.ts` | 안개 단독/겹침/투시·지뢰 탐지와의 간섭 |
| `t4_stack.ts` | 16쌍의 단독A/단독B/A+B 열람량 비교 |
| `t5_swap_conceal.ts` | 은폐 중 왕패의 주인 교환 정합성 → **확정 4**의 입력 |
| `t6_leak.ts` | 3~4장 스택 채널 격리 (크래프트 상태) |
| `t7_stacks.ts` | 3~4장 스택 3종 × 반장전 3시드 실판 (`out/t7b.txt`) |
| `t8_conjure.ts` | 소환 × 삼세 예지/예지 → **확정 2** |
| `t9_ura_iso.ts` | 같은 카드를 둘이 들었을 때의 채널 격리 |
| `sweep.ts` | 조합 스위프 + 매 브로드캐스트 뷰 불변식 (`pairs`/`singles`/`triples`) |
