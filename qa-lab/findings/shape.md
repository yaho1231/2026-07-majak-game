# shape (화료형 16종) — "역 수집가"

담당: avenger, tanyao_break, broken_wall, true_dragon, late_bloomer, late_bloomer_east,
broken_border, mixed_nine_gates, haitei_lord, mixed_triplet, royal_kokushi, polar_ends,
async_chiitoi, bottom_yaku, wind_lineage, joker

## 요약

- **실전판**: 반장전·동풍전 합계 **239판 완주** (하네스 `qa-lab/shape/{soak,focus}.ts`).
  전 구간에서 **크래시 0 · 훅 예외(`effectErrors`) 0 · 패 중복/왕패/손패 장수 위반 0**.
  - 반장전 광역 소크 70판(시드 101–170, 좌석당 shape 2종, 드래프트 off) — 화료 529건,
    자동 이상탐지(무역 화료·보조역 단독 화료·역 누수·형태 모순·판수 합 불일치·탕야오 중복) **0건**
  - 동풍전 광역 소크 70판(시드 201–270, 같은 구성) — 화료 138건, 이상탐지 0건
  - 동풍전 광역 소크 30판(시드 401–430, 같은 구성) — 화료 25건, 이상탐지 0건
  - 반장전 광역 소크 13판(시드 1–8 드래프트 off + 5판 드래프트 on)
  - 증강별 집중 소크(전 좌석 같은 증강) 47판 — joker·avenger·haitei_lord(반장 각 4),
    tanyao_break·broken_wall·true_dragon·late_bloomer_east·broken_border·mixed_nine_gates·
    mixed_triplet(동풍 각 5)
  - 대조군 9판(증강 없음 / tanyao_break / spy) — "특정 시드·페르소나 조합에서 화료가 0건"이
    증강 탓이 아님을 확인하는 용도
  - 페르소나: masher / riichiRusher / caller / chaos / folder / stall 조합을 돌려 가며 사용
  - 커스텀 역 실전 성립 확인: tanyao_break 34회, wind_lineage_prevalent 20회 / _seat 11회 /
    _dragon 9회, bottom_letgo 11회 (bottom_flow는 끝내 한 번도 성립하지 않았다 — 의심 2 참고)
- **조립 케이스**: `decompose`/`winningKinds`/`evaluateWin` 직접 호출 검사.
  옵션 조합 14종으로 화료형을 직접 조립해 **173,338건 중 화료 149,143건**을 채점하고
  무늬 요구 역의 전제를 몸통 단위로 역검증(`fuzz_yaku2.ts`) — 진짜 위반 **0건**
  (보고된 2건은 검사기 쪽 오탐: 같은 슌쯔 4벌은 정당한 량페코다).
  그 밖에 경계 케이스 수십 건(`pure*.ts`, `yaku*.ts`, `waittype.ts`).
- **확정 3건 · 의심 3건.**

크래시·훅 예외(`effectErrors`)·패 중복·손패 장수 위반은 **한 건도 관측되지 않았다.**
점수 총합 드리프트는 239판 중 8건 관측됐으나 전부 `addWinHanBonus`(late_bloomer·
late_bloomer_east·haitei_lord)의 **설계된 뱅크 발행**으로 설명되는 자리(만개 구간·해저 발동
국)라 결함으로 세지 않았다.

---

## 확정 1. 🟠 joker — 조커를 켠 순간 샹텐 계산이 치또이·국사를 통째로 잃는다 (봇이 국사 텐파이를 노텐으로 읽는다)

- **위치**: `packages/core/src/mahjong/scoring/shanten.ts:305-312` (와일드 근사) +
  `:318` (`kinds.length >= 13` 게이트).
  소비자: `packages/server/src/bot/read.ts:238-241`, `packages/content/src/augments/joker.ts:115-116`
- **기대**: 조커는 손을 **전진**시키는 물건이다(detail: "백이 만능패가 된다", 봇 정책 주석:
  "조커를 버리면 손이 나빠진다가 여기서 보여야 한다"). 최소한 `조커 샹텐 ≤ 표준 샹텐`이어야 하고,
  13장 손에서 -1(=완성)은 나올 수 없다.
- **실제**: `shantenUncached`가 와일드를 만나면 **조커 패를 손에서 빼고**
  `shantenOf(rest) - wilds` 로 근사한다. 그 `rest`는 12장 이하가 되는데, 바로 아래의
  치또이·국사 분기는 `kinds.length >= 13`을 요구한다 → **특수형 샹텐이 아예 계산되지 않고**
  표준형(4멘쯔) 값만 남는다.

  ```
  19m19p19s1234567z  (국사 13면 텐파이, 백 포함)
      표준 샹텐 0  →  조커 샹텐 7   (실제 대기 13종)
  19m19p19s1234z56z1z (국사 텐파이)
      표준 샹텐 0  →  조커 샹텐 6   (실제 대기 2종)
  112233445566m5z    (치또이 텐파이)
      표준 샹텐 0  →  조커 샹텐 -1  (13장인데 "완성")
  123m456p789s11z55z
      표준 샹텐 0  →  조커 샹텐 -1
  ```
- **재현**: `tsx qa-lab/shape/repro_joker_shanten.ts` → `BUG=5/6`
- **영향**: `bot/read.ts`가 `if (shanten <= 0)` 일 때만 텐파이·대기를 계산한다. 조커를 켠 봇이
  **국사·치또이 텐파이인데 노텐으로 읽혀** 리치·푸시·버림 선택·유국 판단이 전부 어긋난다
  (그 손에 조커가 붙어 있으니 하필 가장 값나가는 손에서 그렇다). 반대 방향(-1)에서는
  `value.ts`의 EV·`discard.ts`의 우케이레 비교가 "이미 완성"을 전제로 어긋난다.
  화료·대기 판정 자체(`isWinningShape`/`winningKinds`)는 정확하므로 게임이 죽지는 않는다 —
  **조용히 나쁘게 두는** 결함이다.
- **주의**: 파일 주석은 "블록 모형이 장수를 세지 않아 1 낙관적으로 나올 수 있다"까지만 인정한다.
  7 비관은 인정 범위 밖이다.

## 확정 2. 🟡 mixed_triplet · polar_ends — 스안커가 **항상** 스안커단기(더블 역만)로 격상된다

- **위치**: `packages/core/src/mahjong/scoring/decompose.ts:492-508` (혼색 커쯔 후보:
  `for i / for j=i / for k=j` — 같은 무늬 중복 허용, "무늬 2종 이상"만 요구),
  `:511-525` (양극 커쯔 199·191·911)
- **기대**: 동수의 결속 detail은 커쯔의 **무늬 제한**만 없앤다고 말하고, 양극 detail은
  "머리(작두)는 표준대로 같은 패 2장"이라고 못 박는다. 어느 쪽도 **역만 배수를 올린다**고
  하지 않는다.
- **실제**: 두 옵션 모두 "같은 랭크 3장"의 정의를 느슨하게 만들어, 같은 랭크가 4장 있는 손이
  항상 **`혼합 커쯔 + 같은 랭크 머리`** 로 다시 분해된다. 그러면 오름패가 머리를 메운 꼴이 되어
  대기가 샹퐁 → **단기**로 바뀌고, `evaluateWin`이 더 비싼 변형을 고르므로 스안커(역만 1)가
  스안커단기(역만 2)가 된다.

  ```
  222m222p222s111m11p +1m(쯔모)
     표준        [suuankou]        역만1  wait=shanpon
     동수의 결속 [suuankou_tanki]  역만2  wait=tanki   (근거 변형: 1m1p1p / 2m2m2m / 2p2p2p / 2s2s2s, 머리 1m1m)
  111m111p111s999m99p +9m
     표준        [suuankou chinroutou]       역만2
     동수의 결속 [suuankou_tanki chinroutou] 역만3
  111m99m111p111s222s +1m
     표준        [suuankou]        역만1
     양극        [suuankou_tanki]  역만2
  ```
- **재현**: `tsx qa-lab/shape/repro_mixed_triplet_suuankou.ts`
- **영향**: 점수. 역만 1개가 통째로 더 붙는다(친 48000 → 96000). 발생 조건이
  "같은 랭크 4장 + 스안커"라 잦지는 않지만, 두 증강 다 **같은 랭크를 모으는 것이 본체**라
  보유자에게는 표준보다 훨씬 자주 걸린다. 설명에 없는 값이므로 의도라면 문서에 적어야 한다.

## 확정 3. 🟡 wind_lineage — 동남서북 안깡을 해도 **북(北)이 자풍/장풍인 사람만** 계보 역패를 못 받는다

- **위치**: `packages/content/src/augments/wind_lineage.ts` `windRunHas()` (51행) ×
  `packages/core/src/mahjong/scoring/WinContext.ts:178` (`runQuadRepr` — 4연속 깡의 **대표 3장**)
- **기대**: detail — "동·남·서·북 네 바람을 각각 한 장씩 모으면 그 넷을 하나의 안깡으로
  선언할 수 있고 … 바람 슌쯔 안의 자풍·장풍은 커쯔 역패와 똑같이 **각각 1판**이 붙는다."
  깡에 네 바람이 다 들어 있으므로 어느 자리든 1판이 붙어야 한다.
- **실제**: 동남서북 깡의 채점 대표 3장은 `runQuadRepr` 때문에 **동·남·서**다. `windRunHas`는
  그 대표 3장만 훑으므로 북(rank 4)은 존재하지 않는 것이 된다.

  ```
  동남서북 안깡의 채점 대표 몸통: run(1m2m3m) run(4p5p6p) run(7s8s9s) run(1w2w3w)
    자풍/장풍이 동(1): true    남(2): true    서(3): true    북(4): false   ← 북만 누락
  (참고) 손 안의 남서북 슌쯔(2w3w4w)는 북을 정상적으로 센다 → true
  ```
- **재현**: `tsx qa-lab/shape/repro_wind_kan.ts`
- **영향**: 자리에 따라 값이 갈린다 — 북가(또는 북장, 서입 이후)만 같은 깡을 하고도 1판 손해.
  설명과 다르고, 무엇보다 "네 바람을 모았다"는 구경거리의 보상이 자리로 갈린다.

---

## 의심 1. true_dragon — 5멘쯔라서 표준에선 불가능한 역 조합이 같은 몸통을 두 번 센다 (누계 역만 상시화)

`totalSets=5`에서는 몸통이 5개라 **일기통관 + 량페코**, **삼색동순 + 일기통관** 이 함께 선다.
표준 4멘쯔에서는 슌쯔가 모자라 원리상 불가능한 조합이다.

```
123m123m456m456m789m + 11m  (17장, totalSets=5)
  → [menzen_tsumo pinfu ittsuu:2 ryanpeiko:3 chinitsu:6] han=13  (= kazoe_yakuman)
     여기에 true_dragon의 +3판이 또 얹힌다
123m123p123s456m789m + 11m
  → [menzen_tsumo pinfu sanshoku:2 ittsuu:2] han=6
```

각 역의 전제는 채택된 5개 몸통 위에서 **실제로 참**이므로 "헛성립"은 아니다. 다만 표준에서는
성립할 수 없는 중복 계상이고 결과가 누계 역만이라, 밸런스 의도인지 확인이 필요하다.
확정으로 올리지 않은 이유: 설명("5멘쯔 1작두로 화료한다")이 역 조합에 대해 아무 말도 하지 않아
"약속을 어겼다"고 단정할 수 없다.
재현: `tsx qa-lab/shape/yaku2.ts` 마지막 절.

## 의심 2. bottom_yaku — 남이 울어 간 버림패는 '바닥'에서 사라진다

`hasFullSuitRun`/`hasTripleDiscard`가 채점 시점의 `discardsZone(winner)`을 읽는다. 내가 버린
패를 누가 퐁·치·깡으로 가져가면 그 패는 존에서 빠지므로, 이미 채워 둔 "한 무늬 1~9"가
**상대의 울기 한 번으로 무효화**된다. 유국역만(nagashi)과 같은 성질이라 의도일 수 있고
detail의 "내 바닥에 있으면"과도 모순되지 않아 확정으로 올리지 않았다.
실전 소크에서 `bottom_letgo`는 여러 번 붙었으나 `bottom_flow`(한 무늬 1~9)는 한 번도
성립하지 않아 이 경로를 실제로 밟지 못했다 — **재현 실패**.

## 의심 3. mixed_nine_gates — 구련 뼈대 위에서는 치·펑 판정에도 무늬가 사라진다

`onNineGatesPath`가 참인 동안 `scoring.mixedRuns`/`mixedTriplets`/`mixedPairs`가 켜지고,
이 규칙들은 `scoringOptionsOf`를 통해 **치 후보 생성·펑 판정**까지 흘러간다. 즉 뼈대를 쥔
보유자는 그 순간 무너진 국경처럼 혼색 치를 할 수 있다(치하는 순간 멘젠이 깨져 역은 날아가므로
이득은 없다). 설명에는 "멘젠 전용"만 있고 후로 판정에 대한 언급이 없다.
실전 소크에서 구련 뼈대 자체가 한 번도 나오지 않아 **재현 실패** — 코드 경로 추론이다.

---

## 확인했으나 정상이었던 것 (음성 결과)

경계 케이스 조립 검사에서 **기대대로 동작**한 항목들 — 재검사 비용을 아끼기 위해 남긴다.

| 증강 | 검사 | 결과 |
| --- | --- | --- |
| async_chiitoi | 같은 패 4장을 2쌍으로 / 같은 패 3장 / 자패 이종 쌍(동+백) / 수패1+풍패1 | 전부 **불성립** (설명대로) |
| async_chiitoi | 혼합 7쌍의 채점 | 치또이 2판 · 25부 · 량페코 헛성립 없음 |
| royal_kokushi | 11종(2종 빠짐) / 요구패 외 혼입 | 불성립. 12종+중복은 **국사(역만1)**, 13면(더블)로 승격되지 않음 |
| polar_ends | 1·9 혼합 **머리** | 불성립 (머리는 표준대로) |
| polar_ends | 다른 무늬 1·9 혼합 커쯔(1m9p9s) | 불성립 |
| wind_lineage | 4z5z6z(북→백) · 6z7z1z(중→동) 넘김, wrapRuns 병행 | 전부 불성립 (계열 상한 지킴) |
| wind_lineage | 자패 슌쯔로 삼색동순·일기통관 | 헛성립 없음. 자일색·찬타·혼일색은 정상 성립 |
| broken_border | 혼색 슌쯔로 삼색동순·일기통관·이페코·청일색 | 전부 헛성립 없음 |
| mixed_triplet | 혼색 커쯔로 삼색동각 | 헛성립 없음 |
| broken_wall | 순환 슌쯔로 일기통관·삼색·이페코 | 헛성립 없음 (준찬타는 정당하게 성립) |
| joker | 국사·치또이 형태에 조커 적용 / 후리텐 제외 | **정상** (화료·대기 경로는 정확하다 — 확정 1은 샹텐만의 문제) |
| mixed_nine_gates | 무늬 흩뿌린 뼈대(1m1p1s 234p 567s 89m9p9s)의 대기·역 조건 | 27종 대기 정상(표준 옵션에선 0종), 자패 1장이 섞이면 화료형·역 둘 다 불성립 |
| tanyao_break | 백 퐁이 있는 손(`allKinds`가 후로 멘쯔까지 보는가) | 불성립 (수패 퐁이면 정상 성립) |
| joker | 클라 `waitDecompOptions` 미러링 | 16종 중 옵션형 전부 미러됨 (desync 없음) |
| 조합 퍼즈 | mixedRuns×wrap×honor×polar×mixedTri×totalSets5 조합 14종 × 조립 화료형 다수 | 무늬 요구 역(청일·혼일·삼색·일기·이페코·량페코·삼색동각)·탕야오·청노두·자일색·준찬타 전제 위반 **0건** |
