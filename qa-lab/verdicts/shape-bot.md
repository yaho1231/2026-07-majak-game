# 의심 건 재검증 — 화료형(shape) · 봇(bot) · 라이브(live)

2026-08-20. 대상은 `qa-lab/findings/shape.md` 의심 1~3, `qa-lab/findings/bot.md` 의심 1~3,
`qa-lab/findings/live.md` 의심 1. 지난 QA의 "확정" 89건이 전부 수정된 **뒤의 코드**에서
다시 재고, 전부 **실행한 출력**으로 끝냈다.

**결과: 확정 3 · 기각 4 · 보류 0.**

| # | 출처 | 대상 | 판정 |
|---:|---|---|---|
| 1 | shape 의심 1 | `true_dragon` 5멘쯔 역 중복 = 누계 역만 상시화 | **기각** |
| 2 | shape 의심 2 | `bottom_yaku` — 울려 나간 버림패가 바닥에서 사라진다 | **확정** 🟡 |
| 3 | shape 의심 3 | `mixed_nine_gates` — 치·펑 판정에도 무늬가 사라진다 | **확정** 🟡 |
| 4 | bot 의심 1 | `bot/abort.ts`의 국사 생존 판정이 와일드에서 깨진다 | **기각** (조커 샹텐 수정으로 함께 닫혔다) |
| 5 | bot 의심 2 | `shantenOf`가 `kokushiOnly`를 보지 않는다 | **확정** 🟠 |
| 6 | bot 의심 3 | 발동률 극저 정책 5종의 문턱 | **기각** (문턱이 조건에 맞다 — 재측정) |
| 7 | live 의심 1 | 정보형 증강 발동 컷인 유무 | **기각** (컷인은 뜬다 — 보유자에게만, 1600ms) |

재현 스크립트는 전부 `qa-lab/verify-shape/` 아래에 있다. 원본 소스는 **한 줄도 고치지 않았다.**

---
## 1. 🚫 기각 — `true_dragon`: 5멘쯔 역 중복이 "누계 역만 상시화"는 아니다

원 의심은 "`totalSets=5`에서 일기통관+량페코 / 삼색+일기통관이 같은 몸통을 두 번 세어
**누계 역만이 상시화**된다"였다. 조합이 실제로 서는 것은 **지금도 그대로**다 —
`npx tsx qa-lab/shape/yaku2.ts` 마지막 절이 여전히 이렇게 찍는다.

```
123m123m456m456m789m11m(17장)+1m
  std : NO WIN
  opt : [menzen_tsumo:1 pinfu:1 ittsuu:2 ryanpeiko:3 chinitsu:6] han=13
```

기각하는 이유는 "안 일어난다"가 아니라 **"상시화"가 사실이 아니기 때문**이다. 두 갈래로 쟀다.

### ① 무작위 화료형 조립 퍼즈 — `npx tsx qa-lab/verify-shape/td_fuzz.ts 60000`

무작위 화료형을 4멘쯔·5멘쯔로 각각 5만여 건 만들어 같은 채점기에 넣었다.

```
=== 4멘쯔 (표준) — 조립 55908 · 화료 55908 ===
  평균 판수 1.72 · 6판 이상 697 (1.2%) · kazoe 0
  4멘쯔 불가 조합: 23건 (0.04%)     ← sanshoku+iipeiko 17 / ittsuu+iipeiko 6

=== 5멘쯔 (true_dragon) — 조립 53346 · 화료 53346 ===
  평균 판수 1.93 · 6판 이상 460 (0.9%) · kazoe 0
  4멘쯔 불가 조합: 144건 (0.27%)
    sanshoku+iipeiko x95   ittsuu+iipeiko x44   sanshoku+ittsuu x3   ittsuu+ryanpeiko x2
```

- **대조군이 의심을 반쯤 부순다.** `sanshoku+iipeiko`·`ittsuu+iipeiko`는 4멘쯔에서도
  정상적으로 선다(대조군에서 23건 관측). 원 보고가 "표준에선 원리상 불가능"이라고 묶은
  조합 중 **진짜로 5멘쯔에서만 서는 것은 `sanshoku+ittsuu`·`ittsuu+ryanpeiko` 둘뿐**이고,
  5만 3천 화료 중 **5건(0.009%)** 이다.
- **누계 역만(kazoe)은 양쪽 다 0건.** 평균 판수는 1.72 → 1.93으로 0.2판 오를 뿐이고,
  **6판 이상 비율은 오히려 내려간다**(1.2% → 0.9%). 17장으로 청일색·혼일색을 맞추기가
  더 어렵기 때문이다. 보고서의 13판 예시는 손으로 고른 청일색 구성물이지 대표값이 아니다.

### ② 실전 소크 — `npx tsx qa-lab/verify-shape/td_soak.ts 30 hanchan`

네 좌석 전원 `true_dragon`, 반장전 30판(페르소나 6종 섞음).

```
판=30 hanchan 화료=2 (true_dragon 화료=2) 셀 수 없는 조합=0 kazoe=0
```

30판에서 화료가 **2건**이다. 17장 손은 완성 자체가 훨씬 어려워, 문제의 조합이 설 무대에
도달하는 일이 거의 없다.

### 결론

각 역의 전제는 채택된 5개 몸통 위에서 실제로 참이고(헛성립 아님), 결과는 "상시 누계 역만"이
아니라 **1만 1천 화료에 한 번 남짓의 코너**다. detail이 역 조합에 대해 아무 약속도 하지
않으므로 위반할 약속도 없다. **기각한다.**

> 남기는 사실: `sanshoku+ittsuu`·`ittsuu+ryanpeiko`가 물리적으로 성립한다는 것 자체는
> 참이다. 밸런스 문서에 한 줄 적어 둘 값은 있으나 결함으로 셀 크기가 아니다.

---

## 2. ✅ 확정 🟡 — `bottom_yaku`: 남이 울어 간 버림패는 '바닥'에서 사라진다

- **위치**: `packages/content/src/augments/bottom_yaku.ts:55-57` (`discardIds` →
  `state.zones[discardsZone(holder)]`), 소비자 `:60`(`hasFullSuitRun`) · `:86`(`hasTripleDiscard`)
- **기대**: 같은 파일이 스스로를 유국역만의 **거울상**이라 부른다(파일 머리말). 그런데 그
  원본인 `nagashi_yakuman.ts`는 정확히 이 함정을 이미 문서화하고 피해 갔다 —
  > `nagashi_yakuman.ts:21-28`: "바닥에 남은 패만 보면 규칙이 거꾸로 선다. …
  > `round.byPlayer[x].discardedKinds`는 버림 시점의 스냅샷이라 울려 나가도 남는다"
  > `:70-71`: "바닥(zones)이 아니라 이력(discardedKinds)을 보는 것이 핵심이다."

  게다가 `bottom_yaku`의 detail은 울기에 대해 **아무 말도 하지 않는다** — "한 무늬의 1~9가
  모두 내 바닥에 있으면", "같은 패를 3장 이상 버렸으면"뿐이다.
- **실제**: 코어는 치·펑·깡이 서면 그 패를 버린 사람의 discards zone에서 **빼서** 운 사람의
  melds zone으로 옮긴다(`core/mahjong/flow/flowEvents.ts:519·574`). `discardedKinds`는
  append-only라 그대로 남는데(`:467`), `bottom_yaku`는 zone만 본다.

  **재현**: `npx tsx qa-lab/verify-shape/repro_bottom_yaku_call.ts`

  ```
  === ① 역류 통관 (한 무늬 1~9) ===
  아무도 울지 않았다      바닥zone=9장  [man1..man9]      버림이력=9장  → 역류통관 2판
  5만을 p1이 퐁해 갔다    바닥zone=8장  [man5 빠짐]        버림이력=9장  → 역류통관 0판

  === ② 미련 없음 (같은 패 3장) ===
  아무도 울지 않았다      바닥zone=3장  [wind1 x3]        버림이력=3장  → 미련없음 1판
  동 1장을 p1이 퐁해 갔다  바닥zone=2장  [wind1 x2]        버림이력=3장  → 미련없음 0판

  === ③ 둘 다 ===
  아무도 울지 않았다      → 2 + 1 = 3판
  5만 + 동 하나를 울려 감  → 0판   (합 3 → 0)
  ```

  같은 줄에 찍히는 `버림이력(discardedKinds)`이 항상 온전하다는 점이 핵심이다 —
  **정답을 알 수 있는 자리에 정답이 이미 있다.**
- **영향**: 이 증강은 "내가 흘려보낸 것이 점수가 된다"가 전부인데, 그 성취가 **상대의 퐁 한
  번에 조용히 지워진다.** 보유자는 이유를 알 수 없다(내 바닥에서 패가 사라진 이유를
  알려 주는 UI가 없다). '미련 없음'(같은 패 3장)은 특히 나쁘다 — 같은 패 3장을 흘렸으니
  누군가 퐁할 확률이 오히려 높아, **조건을 잘 채울수록 더 잘 깨진다.**
  지난 소크 239판에서 `bottom_flow`가 **한 번도 성립하지 않은 것**(findings/shape.md 요약)이
  이 경로의 실제 크기를 보여 준다.
- **최소 수정 위치**: `bottom_yaku.ts:55-57`의 `discardIds`를
  `state.round.byPlayer[holder]?.discardedKinds ?? []`(kindKey 문자열 배열)로 갈아 끼우고,
  `hasFullSuitRun`/`hasTripleDiscard`가 `kindOf(state, id)` 대신 그 문자열을 파싱하게 한다.
  `nagashi_yakuman.ts`가 이미 같은 형태의 헬퍼를 갖고 있어 그대로 본뜨면 된다.
  (설계 의도가 "울리면 무효"라면 그건 detail에 한 줄 적어야 한다 — 지금은 어디에도 없다.)

---

## 3. ✅ 확정 🟡 — `mixed_nine_gates`: 구련 뼈대 위에서는 **치·펑 판정에도** 무늬가 사라진다

- **위치**: `packages/content/src/augments/mixed_nine_gates.ts:110-127`
  (`scoring.mixedRuns`·`mixedTriplets`·`mixedPairs`를 `onNineGatesPath` 조건으로 켠다) ×
  `packages/core/src/mahjong/flow/standardActions.ts:461` (치 — `opts.mixedRuns === true`) ·
  `:396-400` (펑 — `mixedTripletsFor` → `sameCallKind`)
- **기대**: detail은 제약을 둘만 못박는다 — "자패는 한 장도 섞일 수 없다", "**멘젠이어야 한다**
  (치·퐁·대명깡을 한 번이라도 하면 성립하지 않는다)". 후로 **가능 여부**가 넓어진다는 말은
  없다. 파일 주석도 스스로 "조건이 좁은 것이 핵심 — 무너진 국경·동수의 결속처럼 아무 손에나
  무늬를 지워 주는 일은 없다"고 적는다.
- **실제**: 규칙 키가 채점 전용이 아니라 **후로 검증기가 같은 키를 읽는다.**

  **재현**: `npx tsx qa-lab/verify-shape/repro_mng_call.ts`

  ```
  손패 = 11m1p2s3m4p5s6m7p8s9m9p9s  (랭크 1112345678999, 무늬 흩어짐 = 구련 뼈대 13장)

  혼색 치 (3만 + 4통으로 2삭을 친다)   증강OFF → 거부: tiles cannot form a run     증강ON → **허용됨**
  혼색 펑 (1만 + 1통으로 1삭을 편다)   증강OFF → 거부: tiles do not match the discard  증강ON → **허용됨**
  동색 치 (정상 — 대조)              증강OFF → 허용됨                            증강ON → 허용됨

  대조: 뼈대가 아닌 평범한 13장        증강OFF → 거부                              증강ON → 거부
  ```

  후로한 뒤에는 `melds.length > 0`이라 `onNineGatesPath`가 꺼지지만, 만들어 둔 혼색 몸통은
  그대로 남는다. 그 상태로도 화료는 정상적으로 선다(하드락은 아니다) —

  ```
  혼색 치 몸통(2s3m4p)을 든 채 화료: ok=true yaku=["yakuhai_seat:1","yakuhai_prevalent:1"] han=3
  ```
- **영향**: 점수는 틀리지 않는다. 대신 이 증강은 보유자에게 **자기 역만을 파괴하는 것 외에는
  쓸 데가 없는 후로 버튼**을 조용히 열어 준다 — 그것도 하필 뼈대를 완성한 순간, 즉 역만이
  가장 가까운 그 한 순간에만 뜬다. 누르면 멘젠이 깨져 `mixed_nine_gates`는 영구히 날아가고
  ("멘젠 한정"), 뼈대도 함께 무너진다. 후로 후보는 서버가 만들어 그대로 내려보내므로
  (`standardActions.ts`), 이 혼색 후보는 다른 치·펑 후보와 **같은 목록에 같은 모양으로**
  섞여 온다. 설명에 없는 규칙이고, 방향이 **오직 손해**라 함정에 가깝다.
- **최소 수정 위치**: 후로 검증기와 채점기가 같은 규칙 키를 공유하는 것이 뿌리다.
  둘 중 하나 —
  (a) `standardActions.ts:461`의 치가 `opts.mixedRuns` 대신 후로 전용 키
      (`call.mixedRuns`)를 읽게 하고, 펑의 `mixedTripletsFor`도 같은 식으로 가른다.
      `broken_border`·`mixed_triplet`은 그 후로 키를 함께 켜고, `mixed_nine_gates`는 켜지 않는다.
  (b) 더 작게: `mixed_nine_gates.ts:110-127`의 modifier가 **채점 문맥에서만** 참을 돌려주게
      한다 — `rctx`에 후로 판정임을 알리는 표식이 없다면 (a)가 맞다.

---

## 4. 🚫 기각 — `bot/abort.ts`의 국사 생존 판정은 와일드에서 더 이상 깨지지 않는다

의심의 전제였던 "`opts.wildKinds`가 있으면 `shantenOf`가 국사 분기를 건너뛴다"가
**shape 확정 1의 수정으로 사라졌다.** `shanten.ts:305-330`은 이제 조커를 뺀 손 위에서
표준형·치또이·국사를 **각각** 재고, 게이트(`kinds.length >= 13`)는 **원래 손 장수**로 본다.

- 원래 재현 스크립트 그대로: `npx tsx qa-lab/bot/abort_joker_probe.ts`

  ```
  국사 1샹텐 배패 (12종 + 백)   joker=OFF shantenOf=0 → 유찰 보류 (국사 살아 있음)
  국사 1샹텐 배패 (12종 + 백)   joker=ON  shantenOf=0 → 유찰 보류 (국사 살아 있음)   ← 예전엔 ON에서 유찰 입찰
  국사 13면 텐파이 배패         joker=OFF shantenOf=0 → 유찰 보류 (국사 살아 있음)
  국사 13면 텐파이 배패         joker=ON  shantenOf=0 → 유찰 보류 (국사 살아 있음)   ← 예전엔 2289점 입찰
  요구패 9종 잡손 (백 포함)      joker=OFF shantenOf=7 → 유찰 입찰 2289점
  요구패 9종 잡손 (백 포함)      joker=ON  shantenOf=6 → 유찰 입찰 2289점            (정상 — 잡손은 유찰이 맞다)
  ```
- 뿌리 확인: `npx tsx qa-lab/shape/repro_joker_shanten.ts` → **`BUG=0/6`** (예전 `BUG=5/6`).

구종구패는 자기 첫 순에만 나오므로 `meldCount=0`·`totalSets=4`가 보장되고(진짜 용은
`joker`류와 별개로 국사 증강과 상호 배제), 게이트가 닫힐 조합이 남지 않는다. **기각.**

---

## 5. ✅ 확정 🟠 — `shantenOf`가 `kokushiOnly`/`kokushiMeldKinds`를 보지 않는다 (우는 국사 진행 중 자기 손을 못 읽는다)

- **위치**: `packages/core/src/mahjong/scoring/shanten.ts:325`
  ```ts
  if (meldCount === 0 && totalSets === 4 && kinds.length >= 13) { … 치또이·국사 … }
  ```
  게이트에 `kokushiOnly`도 `kokushiMeldKinds`도 없다. 조커는 이번에 고쳐졌지만
  **울어 국사 경로는 그대로 남아 있다.**
  소비자: `packages/server/src/bot/read.ts:239`(`shanten`) → `:243` `if (shanten <= 0)`
  가 텐파이·대기 계산 전체의 문지기다.
- **기대**: `open_kokushi`가 `kokushi_pon`을 한 순간 `core/mahjong/flow/helpers.ts:196-206`이
  `opts.kokushiMeldKinds = [요구패 3종]` · `opts.kokushiOnly = true`를 켠다. 그 손은
  **국사로만** 화료할 수 있고(`decompose.ts:838·910`이 표준형·치또이를 통째로 막는다),
  `decompose.ts:942-968`의 울어 국사 분기가 정답을 알고 있다. 샹텐도 그 답을 따라야 한다.
- **실제**: 표준형 샹텐이 그대로 답이 되고, 울어 국사 샹텐은 **아예 계산되지 않는다.**

  **재현**: `npx tsx qa-lab/verify-shape/repro_kokushi_only_shanten.ts` → `BUG=2/2`

  ```
  우는 국사 텐파이 (kokushi_pon 1m7z9s + 손 9m19p19s123456z)
     shantenOf → 6   진짜(decompose 브루트포스) → 0    **어긋남**
  우는 국사 1샹텐   (kokushi_pon 1m7z9s + 손 9m19p19s12345z5m)
     shantenOf → 6   진짜(decompose 브루트포스) → 1    **어긋남**

  대조: 같은 손을 옵션 없이 표준형으로 재면 6 — shantenOf가 보고 있던 것이 정확히 이것이다.
  ```
  ("진짜"는 추정이 아니라 `isWinningShape`로 브루트포스한 값이다 — 한 장씩 넣고 바꿔 가며
  화료형이 서는 최소 깊이를 잰다.)

  같은 스크립트가 **봇 쪽 발현**까지 이어서 찍는다(`buildRead`에 그 장면을 그대로 넣는다):

  ```
  봇 읽기: 우는 국사 텐파이   read.shanten=6 read.tenpai=false read.waits=0종
  봇 읽기: 우는 국사 1샹텐    read.shanten=6 read.tenpai=false read.waits=0종
  ```
  역만 텐파이가 **노텐·대기 0종**으로 읽힌다.
- **영향**: 조커 건과 **정확히 같은 형태의 결함**이고, 조커 쪽만 고쳐졌다.
  `read.ts:243`의 `if (shanten <= 0)` 때문에 우는 국사를 진행 중인 봇은
  **자기 국사 텐파이를 영영 노텐으로 읽는다** — 대기(`waits`)가 빈 채로 남으니
  버림 선택·리치 판단·푸시/폴드·유국 텐파이 판단이 그 국 내내 어긋난다.
  하필 역만 한 걸음 앞에서 그렇다. `open_kokushi`의 봇 정책(`open_kokushi.ts:224`)은
  `kokushi_pon`을 한 번 하면 **그 뒤로는 무조건 계속 부르므로**, 한 번 들어간 봇은
  그 국이 끝날 때까지 이 상태에 머문다.
- **왜 지난번에 재현 실패였나**: 봇이 `kokushi_pon`을 거의 안 해서 국면을 못 잡았다.
  이번에는 옵션을 직접 세워(`kokushiMeldKinds`+`kokushiOnly`) 코어 계산기 자체를 재
  **대국 없이 결정적으로** 재현했다 — 봇 표본과 무관하게 성립한다.
- **최소 수정 위치**: `shanten.ts:325` 한 곳.
  ```ts
  // 지금
  if (meldCount === 0 && totalSets === 4 && kinds.length >= 13) {
    best = Math.min(best, chiitoiShanten(rest) - wilds, kokushiShanten(rest) - wilds);
  }
  ```
  → `opts.kokushiOnly === true`면 표준형 값을 **채택하지 않고**(`best`를 무한대에서 시작),
  `kokushiMeldKinds`가 있으면 그 3M종을 덮개로 친 국사 샹텐을 계산해 넣는다.
  덮개 판정 로직은 `decompose.ts:942-968`(`meldKokushiPairOf`)에 이미 있으니
  같은 규칙을 샹텐용으로 한 번 더 쓰면 된다.

---

## 6. 🚫 기각 — 저발동 정책 5종: 문턱이 조건과 **정확히** 일치한다 (전부 재측정)

봇 드래프트가 비율 가중 추첨으로 바뀌었으니 기준선부터 다시 깔았다.

- 아레나 재측정: `npx tsx qa-lab/bot/run.ts 110 11 tonpuu out/arena11.json` ·
  같은 것 시드 22 → **220판 · 1,224국 · 결정 78,869회**
  ```
  arena11: 110판 tonpuu · 623국 · 결정 40442 · crash 0 · decideNowThrows 0 · contentFailures [] · unoffered [] · conflicts [] · modeViol []
  arena22: 110판 tonpuu · 601국 · 결정 38427 · (같음, 전부 0)
  ```
- 강제 스위프 재측정: `npx tsx qa-lab/bot/forced.ts 0 1 8 out/forced.json "last_stand,palm_flip,open_kokushi,blood_contract,ura_peek,tenpai_scan,scapegoat,disarm"`
  (증강마다 네 좌석 전원 보유 × 8배패)
  ```
  ura_peek       opp=2348 fired= 72 prop= 72     tenpai_scan opp=1686 fired=115 prop=115
  scapegoat      opp=1865 fired= 78 prop= 78     disarm      opp= 253 fired= 32 prop= 32
  open_kokushi   opp= 265 fired=  4 prop=  4     blood_contract opp=180 fired=3 prop=3
  last_stand     opp= 168 fired=  2 prop=  2     palm_flip   opp= 119 fired=  3 prop=  3
  ```
  **`fired == proposed`가 8종 전부에서 성립한다** — 정책이 제안한 것은 하나도 안 지고 그대로
  실행된다. 즉 낮은 것은 "발동률"이 아니라 **제안률**이고, 배관·가중치 문제가 아니다.

### 게이트 해부 — 조건을 만족했는데 안 켰는가?

발동률만으로는 "문턱이 틀렸다"와 "상황이 안 왔다"를 못 가른다. 그래서 액션이 **실제로
제시된 순간**만 분모로 잡고, 정책 소스의 조건을 하나씩 계측했다.

`npx tsx qa-lab/verify-shape/gate_profile.ts 8` (증강별 강제 지급 8배패 · 네 좌석 전원 보유)

```
last_stand      액션 제시 161회 → 제안 3회 (1.9%)
   threat>=0.9      31회 (19.3%)     대기가 죽음  20회 (12.4%)     전부충족 3회 (1.9%)

palm_flip       액션 제시  92회 → 제안 1회 (1.1%)
   텐파이           92회 (100%)      패산>=12    66회 (71.7%)     텐파이&대기잔량0 1회 → 전부충족 1회

open_kokushi    액션 제시 308회 → 제안 13회 (4.2%)
   요구패 8종 이상 8+6(이미 착수)=14 ≈ 전부충족 13회 (4.2%)
   (분포: 4종 95 · 3종 72 · 5종 62 · 6종 32 · 2종 25 · 7종 14 · 8종 8)

blood_contract  액션 제시 200회 → 제안 6회 (3.0%)
   어느 쪽도 아님 194회 (97.0%)   4짝형 6회 (3.0%)  → 전부충족 6회
   (색이 몰린 정도: off=6이 62%, off≤1인 손은 0회 — 혼일/청일이 애초에 안 선다)
```

**네 정책 모두 `전부충족` 횟수와 `제안` 횟수가 일치한다** (3=3 · 1=1 · 13=13 · 6=6).
조건이 선 순간은 하나도 놓치지 않았고, 조건 밖에서 켠 적도 없다. 낮은 숫자는 문턱이
아니라 **분포**다 —

- `last_stand`: "위협 0.9 이상"과 "대기가 죽었다"가 각각은 19.3%·12.4%인데 **동시에 서는 일이
  1.9%**다. 그런데 이 증강은 리치 취소(`cancel_riichi`)다 — 그 둘이 동시에 서지 않은 자리에서
  리치를 무르는 것은 그냥 손해다. 조건이 맞다.
- `palm_flip`: 액션은 텐파이일 때만 제시되고(100%), 남는 조건은 "대기 잔량이 정확히 0"이다.
  92회 중 1회. 봇의 대기가 완전히 죽는 일 자체가 드물다 — **문턱이 아니라 사건이 드물다.**
- `open_kokushi`: 요구패 종류 분포의 최빈값이 3~5종이고 8종 이상은 2.6%다. 문턱 8종을
  낮추면 국사가 아닌 손으로 손을 열게 된다(그 증강은 `kokushi_pon` 뒤 다른 후로를 전부
  봉인하므로 되돌릴 수 없다 — `open_kokushi.ts:244-256`).
- `blood_contract`: 손이 한 색·탕야오·4짝 중 하나로 몰려야 하는데, 실측 `off`(주 무늬 밖 장수)가
  **6 이상이 62%**다. 배율을 거는 카드라 "몰리지 않은 손에 걸면 그 국을 흘린다"는 판단이 맞다.
- `ura_peek`·`tenpai_scan`·`scapegoat`: 강제 스위프에서 각각 72·115·78회 켠다(발동률 3.1%·6.8%·4.2%).
  기회 자체가 매 순 반복 제시되는 정보형이라 분모가 부풀 뿐, **죽은 카드가 아니다.**
  `disarm`도 253기회 중 32회(12.6%) — 지난 보고의 "아레나 발동 0"은 표본 문제였음이 확인된다.

### 곁가지로 확인된 것 (지난 확정 두 건의 수정 검증)

같은 데이터가 `bot.md` 확정 1·3의 수정을 함께 뒤집어 보여 준다 — 별도 작업 없이 나온 값이라 적어 둔다.

- **확정 1(D티어 전멸)**: 220판에서 "제시 8회 이상인데 픽 0"이 **2종으로 줄었다**
  (`hand_swap3` offered 25/48, `frame_up` offered 29/21 — 둘 다 `BOT_UNUSABLE ×0.25`가 남은 자리).
  지난번의 D티어 7종(disarm·triple_peek·time_pressure·always_tenpai·brief_fog·die_hard·
  yakuman_shield)은 **전부 픽 목록에 들어왔다.** 비율 가중 추첨 전환이 먹혔다.
- **확정 3(reload 문턱)**: 아레나에서 `reload`가 **발동한다** (시드11 1/1 · 시드22 3/4).
  지난번 "기회 37 · 제안 0"이 뒤집혔다.

**결론: 기각.** 다섯 정책 다 "판단"이고, 그 판단이 소스에 적힌 조건과 100% 일치한다.
문턱을 낮추라는 근거는 이 데이터에 없다.

---

## 7. 🚫 기각 — 정보형 증강 발동 컷인은 **뜬다** (보유자에게만, 1600ms)

원 의심은 "천리안을 쓴 직후 판 위에서 그 사실을 찾을 수 없었다 — 컷인 유무 미확증"이었다.
브라우저 없이 **서버가 실제로 보내는 메시지**와 **클라의 렌더 분기**를 각각 확인해 끝냈다.

**재현**: `npx tsx qa-lab/verify-shape/fx_probe.ts 4`
(네 좌석 전원에게 `tenpai_scan`·`danger_sense`·`xray_hand`·`triple_peek`를 강제 지급하고
동풍전 4판을 실제 `HanchanController`로 완주시키며, `PlayerAgent.notify`로 들어오는
`actionFx`를 전수 기록한다.)

```
=== ① 서버가 보낸 actionFx (4판 · 총 512건) ===
  danger_sense_use        256건  수신자=본인+타인
  triple_peek_use         128건  수신자=본인+타인
  xray_reveal              64건  수신자=본인+타인
  tenpai_scan_use          64건  수신자=본인          ← FX_PRIVATE: 보유자·관전자 전용

=== ② 클라 컷인 경로 (App.tsx:4075 actionFx 핸들러) ===
  tenpai_scan_use    silent=false private=true  augId=tenpai_scan   전용컷인=false → showCutIn 1600ms 컷인이 뜬다
  danger_sense_use   silent=false private=false augId=danger_sense  전용컷인=false → showCutIn 1600ms 컷인이 뜬다
  xray_reveal        silent=false private=false augId=xray_hand     전용컷인=false → showCutIn 1600ms 컷인이 뜬다
  triple_peek_use    silent=false private=false augId=triple_peek   전용컷인=false → showCutIn 1600ms 컷인이 뜬다
  free_discard       silent=true  …                                            → 컷인 없음 (서버가 안 보냄, 의도)
  future_arm         silent=true  …                                            → 컷인 없음 (서버가 안 보냄, 의도)
  actionFx → showCutIn 지속: 1600ms
```

세 겹이 전부 통과한다.
1. `tenpai_scan_use`는 `FX_SILENT_ACTION_TYPES`에 **없다**(`HanchanController.ts:386-401`) →
   메시지가 나간다. 실측 64/64.
2. `FX_PRIVATE_ACTION_TYPES`에 **있다**(`:432-455`) → `notifyPrivate`로 보유자 + 관전자에게만
   간다(`:1476-1479`). 실측 수신자가 전부 "본인"이다 — detail의 "발동 사실도 상대에게는
   공개되지 않는다"를 지킨다.
3. 클라의 `actionFx` 핸들러(`App.tsx:4075-4100`)에서 조기 return하는 유일한 길은
   `AUG_EVENT_AUG_IDS`(전용 사건 컷인이 따로 있는 증강)인데 `tenpai_scan`은 그 표에 없다 →
   `showCutIn(label, "augment", …, 1600)`에 도달한다.

즉 **컷인은 실제로 떴고 1.6초 뒤 사라졌다.** 원 보고자의 스크린샷 간격(수 초)이 그보다
길었을 뿐이다 — 보고서 본인이 적어 둔 가설(`App.tsx:2983` 기본 지속 대비 촬영 간격)이 맞다.
`App.tsx:1458`의 주석("기록 패널은 컷인을 놓쳤을 때의 대비")대로 설계된 조합이다. **기각.**

> 다만 함께 관측된 사실 하나는 남긴다 — 원 보고 자체가 "1.6초 컷인 + 접힌 📜 패널" 조합에서
> **사람이 발동을 놓쳤다**는 1인 표본이다. 이건 결함이 아니라 UX 관찰이므로 여기서는 세지
> 않는다(`live.md` 확정 1이 이미 "정산 창에서 📜가 막힌다"를 별건으로 잡아 두었다).

---

## 부록 — 이번에 쓴 스크립트

| 파일 | 하는 일 |
|---|---|
| `qa-lab/verify-shape/td_fuzz.ts` | 무작위 화료형을 4멘쯔/5멘쯔로 5만여 건씩 조립·채점해 역 조합 출현율과 판수 분포를 비교 (의심 1) |
| `qa-lab/verify-shape/td_soak.ts` | 네 좌석 전원 `true_dragon` 실전 소크, "4멘쯔 불가 조합" 자동 탐지 (의심 1) |
| `qa-lab/verify-shape/repro_bottom_yaku_call.ts` | 바닥 완주/3장 버림을 세운 뒤 코어와 같은 방식으로 한 장을 울려 가고 재채점 (의심 2) |
| `qa-lab/verify-shape/repro_mng_call.ts` | 구련 뼈대 손으로 치·펑 `validate`를 증강 ON/OFF 대조, 후로 뒤 채점까지 (의심 3) |
| `qa-lab/verify-shape/repro_kokushi_only_shanten.ts` | `shantenOf` vs `decompose` 브루트포스 대조 + `buildRead` 발현 (bot 의심 2) |
| `qa-lab/verify-shape/gate_profile.ts` | 액션이 **제시된 순간만** 분모로 잡고 정책 게이트 조건을 전수 계측 (bot 의심 3) |
| `qa-lab/verify-shape/fx_probe.ts` | 실제 대국의 `actionFx` 수신자 전수 기록 + 클라 컷인 분기 정적 대조 (live 의심 1) |
| `qa-lab/verify-shape/out/` | 위 실행의 원출력(JSON·로그) |

기존 스크립트 재사용: `qa-lab/shape/yaku2.ts` · `qa-lab/shape/repro_joker_shanten.ts` ·
`qa-lab/bot/abort_joker_probe.ts` · `qa-lab/bot/run.ts` · `qa-lab/bot/forced.ts` · `qa-lab/bot/analyze.ts`.

> ⚠ 측정 환경 메모: 이 워크트리에서는 다른 에이전트가 동시에 `packages/content`를 고치고 있었다.
> 내 측정 대상 4종(`blood_contract`·`scapegoat`·`ura_peek`·`tenpai_scan`)의 동시 변경분은
> `roundScopedKey` 도입(국 스코프 키 치환)뿐이고 **봇 정책·문턱은 한 줄도 바뀌지 않았다** —
> `git diff`로 확인했다. `packages/` 는 이 작업에서 한 줄도 고치지 않았다.
