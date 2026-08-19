# scoring(도라·정산) 10종 — "도라 사냥꾼"

담당: `karma` `ankan_dora` `honba_hunter` `unification` `soul_hunt` `blame_shift`
`north_trader` `mirror_dora` `dora_afterimage` `sign_flip`

## 요약

- **돌린 판**: 매치 220+ (반장전·동풍전, 페르소나 masher/riichiRusher/caller/chaos/folder/stall 무작위 조합).
  - `qa-lab/score-b/fuzz.ts <from> <to> <hanchan|tonpuu> <strict|pure|mixed>` —
    `strict`는 **드래프트를 끄고** 내 10종만 남긴다(교차 잡음 0), `pure`는 preset만 내 10종(드래프트는 돈다),
    `mixed`는 무작위 증강까지 섞는다. 정산 이벤트 900+건 검사.
  - `qa-lab/score-b/t_afterimage.ts`(잔상·카르마 국간 상태, 14매치) ·
    `t_unification.ts`/`t_unif2.ts`(즉시 우승, 26매치).
  - 결정론적 최소 장면: `t_dora.ts`(도라 16장면) · `t_settle.ts`(정산 16장면) ·
    `t_order.ts`(정산 개입 **40조합**) · `t_doubleron.ts` · `t_north.ts` · `t_soulhunt.ts` ·
    `t_karma_signflip.ts` · `t_mirror_view.ts`.
- **증강 커버리지**: 10/10 전부 실제 발동 관측(북빼기·카르마 소각·잔상 되살리기·안깡 도라·
  혼사냥 역 성립·본장 1500·즉시 우승 종료·부호 반전 정산 개입 모두 로그로 확인).
- **확정 4건 · 의심 2건.**

### 내가 추가한 불변식 (`qa-lab/score-b/run.ts` `checkSettle`)

하네스 기본(패 중복·왕패·손패 장수·점수 드리프트) 위에 정산 payload를 직접 읽는 검사를 얹었다.
하네스의 `onRound`는 GameState만 주므로, 러너를 복제해 **엔진 이벤트 로그의 `RoundSettled`** 를 본다.

| 검사 | 내용 |
|---|---|
| `SETTLE_NOT_ZEROSUM` | `Σdeltas − 회수한 공탁 − (sign_flip이 augPoints에 서명한 발행액) == 0`. 뱅크 발행은 sign_flip만 하고 그 액수를 정확히 적으므로, 잔차가 남으면 아무도 서명하지 않은 점수다. |
| **`DORA_HAN_MISMATCH`** | **도라 수 기대값 vs 실제 판수.** 정산 시점 상태에서 손패+후로 종류를 뽑아, 표시패의 표준 도라 + (mirror_dora면 `frontDoraKindFor`) + (dora_afterimage 발동분) 으로 `countDora`를 **독립 재계산**해 `winInfo.doraHan`과 대조. |
| `URA_HAN_MISMATCH` | 같은 방식으로 뒷도라. 세는 조건(내 리치 ∨ soul_hunt의 "방총자 리치 론")까지 재현. |
| `EXTRA_HAN_MISMATCH` | `ankan_dora`(안깡 장수) + `north_trader`(빼놓은 北 실물 수) 의 `score.extraHan` 기여 검산. |
| `HAN_SUM_MISMATCH` | `han == 역 + 도라 + 뒷도라 + 적도라 + extraHan`. |
| `HONBA_BONUS_MISMATCH` | `honbaBonus == 본장 × (보유자 1500 / 아니면 300)`. ⚠ payload의 `honba`는 **다음 국** 값이라 국 시작 때 잡아 둔 roundKey에서 읽는다. |
| `BLAME_SHIFT_UNEVEN` / `_NEG` | 보유자 론에서 지불자들의 부담이 고른가(편차 ≤ 200), 음수(=되레 받는)가 없는가. |
| `VIEW_DESYNC_*` | 전원 공개 채널(mirror 앞도라·北 장수·카르마 게이지·본장 가치)이 실제 상태와 같은가. |
| `KARMA_GAUGE_GRID/NEG` | 게이지가 100점 격자 위에 있고 음수가 아닌가. |

**주의(하네스 사용자에게 유용)**: `RoundSettled` 리듀서는 `round.{roundNumber,honba,prevalentWind,dealerSeat}`
를 **이미 다음 국 값으로** 바꿔 놓는다. 국 스코프 키(`…:{roundKey}:…`)나 `armedNow`를
`onRoundEnd`의 상태로 계산하면 전부 어긋난다 — 국 시작 때 `roundKey`를 잡아 두고 써야 한다.

---

## 확정 1. 🟠 blame_shift — 더블론에서 **다른 화료자의 본장 가산분**까지 자기 지불분으로 흩는다

- 위치: `packages/content/src/augments/blame_shift.ts:78-81`
  ```ts
  const otherWinnersTotal = (p.winInfos ?? [])
    .filter((w) => w.winner !== holder)
    .reduce((sum, w) => sum + w.points, 0);      // ← honbaBonus 를 안 뺀다
  const owed = -(p.deltas[discarder] ?? 0) - otherWinnersTotal;
  ```
- 기대: 소스 주석이 스스로 정한 계약 — "재분배 대상은 **내 화료에 대한 지불분만**이다 …
  쏜 사람의 지불액 = Σ(화료자 points) + 본장이므로, 다른 화료자의 points를 빼면 **내 몫(+본장)만**
  정확히 남는다". 그런데 더블론에서 **본장은 첫 화료자 한 사람만** 받는다
  (`standardActions.ts:966` `const honbaBonus = i === 0 ? … : 0`). 보유자가 두 번째 화료자면
  본장은 내 몫이 아니다.
- 실제: 뺀 것이 `points`뿐이라 **첫 화료자의 본장 가산분이 통째로 `owed`에 섞인다.**
  그만큼을 쏘지도 화료하지도 않은 제3자가 대신 문다(총액은 보존 — 방총자가 덜 내고 무관한 사람이 더 낸다).
- 재현: `tsx qa-lab/score-b/repro_blameshift.ts`
  ```
  [기준] 증강 없음        deltas={"p0":7700,"p1":-16600,"p2":8900,"p3":0}
  [B-1] p0(둘째 화료)만 blame_shift
                          deltas={"p0":7700,"p1":-12300,"p2":8900,"p3":-4300}
        ↳ p0 몫은 7,700 → p3는 3,900 을 물어야 하는데 4,300 을 문다
  [대조] p2(첫 화료)만 blame_shift → 본장이 자기 것이라 정확 (p3 -4,500)
  ```
  본장 사냥꾼과 겹치면 커진다 (5본장 = 7,500):
  ```
  [B-1 확대] p2=honba_hunter(첫 화료·5본장) · p0=blame_shift(둘째)
             deltas={"p0":7700,"p1":-15600,"p2":15500,"p3":-7600}
        ↳ p0 몫 7,700 인데 p2의 본장 7,500 을 합쳐 15,200 을 2분할 → p3가 7,600 (정상 3,900의 약 2배)
  ```
- 영향: 점수가 생기거나 사라지지는 않는다. **지불자 분배가 틀린다** — 방총자가 자기 본장 벌금을
  일부 면제받고, 아무 상관 없는 사람이 남의 본장을 대신 낸다. 카드가 약속한 "지불자만 분산"의
  대상이 잘못 잡혔다.

## 확정 2. 🟠 blame_shift — 두 명이 들고 더블론하면 나중 인터셉터가 **이미 재배선된 deltas**를 읽어 자기 몫을 과소 계산

- 위치: `packages/content/src/augments/blame_shift.ts:81` (`p.deltas[discarder]` 를 원본으로 가정)
- 기대: 두 화료자가 각각 자기 몫을 2분할한다 → 무관한 p3는 `(p2몫 ÷ 2) + (p0몫 ÷ 2)` 를 문다.
- 실제: 인터셉터는 체인이라 두 번째 인스턴스가 보는 `p.deltas[discarder]` 는 **첫 인스턴스가 이미
  환급·재부과한 뒤의 값**이다. 그래서 `owed` 가 자기 화료점이 아니라 "방총자에게 남은 잔액 − 상대 points"
  가 된다.
- 재현: `tsx qa-lab/score-b/repro_blameshift.ts`
  ```
  [B-2] p0·p2 둘 다 blame_shift
        deltas={"p0":7700,"p1":-10000,"p2":8900,"p3":-6600}
        ↳ 기대 p3 ≈ -8,400 (4,500 + 3,900), 실제 -6,600
          두 번째 인터셉터가 owed 를 7,700 이 아니라 4,100 으로 계산했다
  ```
  (추적: A=p2 몫 8,900 → p3 -4,500, 방총자 잔액 -12,100. B=p0 이 `12,100 − 8,000 = 4,100` 을
  자기 몫으로 착각 → p3 -2,100. 합계 -6,600.)
- 영향: 총액은 보존되지만 **방총자가 과부담, 제3자가 과소부담**. 확정 1과 원인이 다르다
  (하나는 `honbaBonus` 누락, 하나는 변형된 deltas 재사용).

## 확정 3. 🟡 soul_hunt — "리치 **대신**" 붙는 +1판이 내 리치에 **덧붙는다**

- 위치: `packages/content/src/augments/soul_hunt.ts:66-77` (커스텀 역 `check`)
  ```ts
  check: (_variant, wctx) =>
    wctx.winnerId !== undefined && yakuHolders(yaku, ID).has(wctx.winnerId) &&
    wctx.winType === "ron" && wctx.fromRiichi === true,     // ← 내 리치 여부를 안 본다
  ```
- 기대: 소스 주석이 "① 강탈한 리치 = 붙는 +1판 (**리치 대신**)" 이라고 못박았고, 카드도
  "리치를 걸지 않았어도 화료가 리치로 취급되어" 라고만 약속한다. 내가 이미 리치라면
  "리치로 취급"은 이미 참이므로 더 붙을 근거가 없다.
- 실제: 내가 리치 + 상대도 리치인 론이면 `riichi:1` 과 `soul_hunt:1` 이 **둘 다** 붙는다.
- 재현: `tsx qa-lab/score-b/t_soulhunt.ts`
  ```
  S3 소울헌트 없음 · 나 리치O · 상대 리치O: han=6 yaku=riichi:1,sanshoku:2 dora=2 ura=1
  S4 소울헌트    · 나 리치O · 상대 리치O: han=7 yaku=riichi:1,sanshoku:2,soul_hunt:1 dora=2 ura=1
  S2 소울헌트    · 나 리치X · 상대 리치O: han=6 (=의도된 동작)
  S5/S6 상대 리치X → 안 붙는다 (정상)
  ```
- 영향: 설명·주석과 다른 타점. 리치를 건 보유자가 리치자를 잡을 때마다 조용히 +1판.
  (리치+소울헌트가 자주 같이 서는 조합이므로 드문 경우가 아니다.)


## 확정 4. 🟡 mirror_dora — 표시패가 **교체**되면 전원 공개 채널이 낡은 앞도라를 계속 광고한다

- 위치: `packages/content/src/augments/mirror_dora.ts:93-99`
  ```ts
  ctx.reaction(ROUND_STARTED, (_event, rc) => announce(rc));
  ctx.reaction(DORA_FLIPPED,  (_event, rc) => announce(rc));   // ← 이 둘뿐이다
  ```
- 기대: 카드 detail — "무엇이 도라가 됐는지는 **전원에게 공개된다**", 소스 주석 —
  "안 보이면 상대가 대응할 수 없고(Rule #4) … 표시패가 뒤집힐 때마다 알린다".
- 실제: 왕패의 주인(`dead_wall_master`)이 **표시패 자리를 자기 손패와 맞바꾸면**
  표시패가 그 자리에서 바뀌지만(`dead_wall_master.ts:209-213`, tileId 를 갈아 끼운다)
  `ROUND_STARTED` 도 `DORA_FLIPPED` 도 나지 않는다. 채널은 배패 때 값 그대로 굳는다.
  **점수 계산은 새 표시패로 정확히 되므로**(모디파이어가 `state.round.doraIndicators` 를 실시간으로 읽는다)
  화면과 실제가 갈린다 — 상대는 있지도 않은 앞도라를 피하고, 진짜 앞도라는 그냥 흘린다.
- 재현: `tsx qa-lab/score-b/repro_mirror_channel.ts`
  ```
  ① 배패 직후          표시패=sou8 → 앞도라(실제)=["sou7"] / 채널=["sou7"] 일치
  왕패 표시패 자리(index=4)를 p1의 5p 와 맞바꾼다
  ② 표시패 교체 직후    표시패=pin5 → 앞도라(실제)=["pin4"] / 채널=["sou7"] ← 어긋남
  ```
  퍼즈에서도 잡혔다: `seed=2259 tonpuu [VIEW_DESYNC_MIRROR] p0 채널=["dragon1"] 실제앞도라=["sou1"]`
  (같은 테이블 p1 = `dead_wall_master`).
- 영향: 정보 오염. 점수는 맞지만 **전원 공개 약속이 거짓**이 된다(Rule #4 대응 불가).
  같은 계기 부족은 표시패 종류 자체를 바꾸는 다른 증강에도 그대로 적용된다
  (`seed=2258 채널=["man3"] 실제=["man4"]` — 그쪽 원인 증강은 특정하지 못했다).

---

## 의심 1. sign_flip — 국 중 `ScoreChanged` 반전에는 **근거(augPoints)가 남지 않는다**

정산 반전은 `withAugPoint(p, ctx, -before*2)` 로 발행액을 정확히 서명하지만, `SCORE_CHANGED`
인터셉터(`sign_flip.ts:78-83`)로 뒤집는 국 중 이동은 아무 기록도 남기지 않는다.
그래서 결과 화면에는 근거 없는 총합 변동만 남는다.

- 관측: `tsx qa-lab/score-b/t_karma_signflip.ts`
  ```
  K1 karma만                       총합 100000 -> 100000 (Δ0)
  K2 karma + 피해자 p1이 sign_flip  총합 100000 -> 108000 (Δ+8000)   ← augPoints 비어 있음
  K4 피해자 셋 전부 sign_flip       총합 100000 -> 124000 (Δ+24000)  ← 같음
  ```
- 왜 의심인가: 부호 반전으로 테이블 합계가 깨지는 것 자체는 **설계**(카드 명시)다. 문제는 그 발행에
  서명이 없어 회계 감사(하네스의 `SCORE_DRIFT_UNEXPLAINED`)와 결과 화면 양쪽에서 출처를 알 수
  없다는 점뿐이라, "버그"로 확정하기에는 사용자 확정이 필요하다.

## 의심 2. dora_afterimage — `dora_afterimage:recalled:{roundKey}:{seat}` 키가 **국 스코프가 아니라 매치 내내 쌓인다**

`dora_afterimage.ts:63` 의 `recalledKey` 는 roundKey를 섞을 뿐 `ROUND_SCOPED_MARK` 가 없어,
발동할 때마다 `augmentData` 에 항목이 하나씩 영구히 남는다(반장전 4회 발동 = 4개).
값 자체는 현재 국 키로만 읽히므로 **점수에는 영향이 없고**, 실제로 되살아난 종류는 언제나
직전 국의 도라와 일치했다(아래 로그). 상태 팽창·리플레이 부피 문제일 뿐이라 의심으로 남긴다.

```
tsx qa-lab/score-b/repro_afterimage.ts 3
[settle of 1-1-0] 표시패=pin9 → 도라=pin1 ; prevDoraKey=["pin1"]
[settle of 1-2-1] 표시패=pin6 → 도라=pin7 ; p0~p3 발동 → recalled=["pin1"]   ← 직전 국과 일치
[settle of 1-4-3] … 발동 → recalled=["pin1"]  (쿨다운 2국 지켜짐: seq 2 → 4 → 6 → 8)
```

---

## 담당 밖 관측 (다른 담당자에게 넘김)

정산 회계 검사가 내 10종이 아닌 조합에서 잔차를 잡았다. 원인 증강이 내 담당이 아니라 확정하지 않는다.

```
seed=2409 hanchan [SETTLE_NOT_ZEROSUM] 2-4-2 잔차=-3800
  Σdeltas=-800 potGain=3000 signFlipBank=0 armed=[] outcome=win
  deltas={"p0":12500,"p1":-9000,"p2":-4300,"p3":0}
  augPoints=[silent_swap p0 +3900(2판), soul_strike p0 +1300(1판), all_or_nothing p1 -9000]
  p0=honba_hunter+soul_hunt+broken_border+silent_swap+soul_strike
  p1=north_trader+sign_flip+ankan_dora+dora_afterimage+discard_lock+all_or_nothing+siege_riichi
  ↳ 같은 국에 SCORE_DRIFT_UNEXPLAINED −3,800 도 같이 떴다. all_or_nothing(−9,000 서명)과
    금액이 안 맞아 하네스 대조에도 안 걸린다.
```

`VIEW_DESYNC_MIRROR` 는 확정 4로 원인을 잡았지만, 원인 증강이 하나 더 남아 있다:
`seed=2258 tonpuu p3 채널=["man3"] 실제앞도라=["man4"]` 자리에는 `dead_wall_master` 가 없었다
(그 테이블: p0 ankan_dora+soul_hunt+counter+silent_swap / p1 north_trader+honba_hunter+blame_shift+future_sight /
p2 dora_afterimage+sign_flip+broken_border+omni_chi / p3 unification+karma+mirror_dora+three_dragons_will
+ 드래프트분). 표시패 **타일의 kind 자체**를 바꾸는 증강이 또 있다는 뜻이다 — 확정 4의 수정
(표시패 변경에도 다시 알리기)이 이쪽까지 덮는지 확인이 필요하다.

---

## 이상 없음으로 확인한 것 (재확인 비용 절약용)

- **도라 판 검산**: pure 스윕 전 구간에서 `DORA_HAN_MISMATCH`/`URA_HAN_MISMATCH`/`EXTRA_HAN_MISMATCH`
  0건. 최소 장면에서도 일치 — mirror 순환 경계(1s→9s, 동→북), mirror×soul_hunt 뒷도라(우라 2),
  ankan_dora 랭크혼합 깡(3456s = +4판)·명깡 제외(0판), north 4장 = +4판.
- **정산 개입 40조합**(`t_order.ts`: blame_shift × honba_hunter × sign_flip × karma, 보유자/방총자 교차):
  회계 잔차 전부 0. 서로 덮어쓰지 않는다(더블론만 예외 — 확정 1·2).
- **karma**: 상대가 800점·음수·전원 0점일 때 상한/거부 모두 정상, 제로섬 유지, 게이지 100점 격자,
  공개 채널 == 게이지, 소각 후 0.
- **honba_hunter**: 5본장 론 7,500 / 쯔모 4,500×3 / 비보유자 화료 1,500 — 전부 정확.
- **north_trader**: 北 4연속 빼기에도 왕패 14·영상패 4·표시패 인덱스(`doraIndicatorIndex`)가
  그대로. 패 중복·유실 0, 표시패가 왕패 밖을 가리키는 일 없음, 실물에서 센 판수와 공개 채널 일치.
- **unification**: 전원 50,000 시작 시 보유자가 있으면 1국 만에 종료, 없으면 4국 완주.
  비보유자만 45,000을 넘은 경우 게임이 끝나지 않음(seed 11·12·14~18에서 확인).
- **sign_flip**: 무장 국이 정확히 "획득 뒤 첫 국" 하나이고, 그 뒤로는 `spent` 로 꺼진다.
  정산 반전 발행액이 augPoints 서명과 1원 단위까지 일치.
- 크래시 0건 · `effectErrors` 0건 (전 스윕).
