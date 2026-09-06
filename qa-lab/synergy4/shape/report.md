# synergy4 — 화료형·역만 축 (shape / yakuman / kokushi / chiitoi / tanyao / terminal / honor / suit / relax_win)

작성 2026-08-31. 소스는 한 줄도 고치지 않았다. 스크립트는 전부 이 디렉터리 안에 있다.
실행: `~/majak/node_modules/.bin/tsx qa-lab/synergy4/shape/<파일>.ts` (워크트리 루트에서)

## 담당 증강 26장

| id | 이름 | 축 |
|---|---|---|
| avenger | 복수자 | relax_win |
| tile_dyeing | 염색 | suit |
| suit_unify | 단색 세계 | suit |
| tanyao_break | 탕야오 해방 | tanyao |
| open_kokushi | 우는 국사무쌍 | kokushi/yakuman/terminal |
| broken_wall | 끝없는 윤회 | shape/terminal |
| true_dragon | 진짜 용 | shape |
| late_bloomer / late_bloomer_east | 대기만성 | relax_win/shape |
| nagashi_yakuman | 유국역만 | yakuman/terminal |
| broken_border | 무너진 국경 | shape |
| mixed_nine_gates | 뒤섞인 아홉 개의 연꽃 | yakuman/suit/shape |
| off_by_one | 한 끗 차이 | shape |
| mixed_triplet | 동수의 결속 | shape |
| royal_kokushi | 왕의 징표 | kokushi/shape |
| polar_ends | 양극 | shape/terminal |
| async_chiitoi | 비대칭 | chiitoi/shape |
| genesis | 개벽 | honor/yakuman |
| even_world | 짝수의 세계 | tanyao |
| giant_god | 마작의 거신병 | kokushi/yakuman |
| wind_lineage | 바람의 계보 | shape/honor |
| honor_return | 귀환 | honor |
| three_dragons_will | 삼원의 의지 | yakuman/honor |
| north_trader | 북풍 상인 | honor |
| picky_eater | 편식 | suit |
| joker | 조커 | shape/honor |

---

## 확정 결함

### 1. 뒤섞인 아홉 개의 연꽃 — 혼색 머리의 «다른 쪽 무늬»로는 화료가 안 된다 (역만 소실) · 심각

- **조합**: `mixed_nine_gates` 단독으로 이미 난다. 무늬를 흩는 카드(`tile_dyeing`·`joker`·`off_by_one`)와 함께 들면 그 자리에 더 자주 선다.
- **기대**: 카드 설명 — "만·통·삭을 하나로 보고 1,112,345,678,999 + 아무 수패 1장이면 역만이다." 즉 27종(1~9 × 3무늬) 전부가 오름패다. `winningKinds`도 27종을 대기로 내놓는다.
- **실측** (`06_ninegates.ts`, `15_repro_mixedpair.ts`):
  - 뼈대 `1m1p1s2m3p4s5m6p7s8m9p9s9m` → 대기 27종 중 **6종(2p·5p·8p·2s·5s·8s)에서 «화료형 아님»**. 역만 48,000이 통째로 사라진다.
  - 뼈대 `1m1m1p2p3p4m5p6m7p8p9p9s9s` → 27종 중 3종(2s·5s·8s) 불가.
  - `isWinningShape`는 그 손을 **true**로 답한다(대기 표시·후리텐은 오름패로 친다). 화료만 안 된다 — 클라도 27종을 그려 준다(`App.tsx waitDecompOptions`가 서버와 같은 옵션을 미러링).
- **원인**: `packages/core/src/mahjong/scoring/WinContext.ts` `buildVariants` — 표준형 변형을 만들 때 화료패를 머리와 **kindKey 1:1**로만 견준다.
  ```
  if (decomp.pair !== null && kindKey(decomp.pair) === winKey) { ...tanki 변형... }
  ```
  그런데 혼색 머리(`decompose.ts` `mixedPairs` 분기, 파일 끝의 «혼색 머리» 블록)는 **두 kind로 이뤄지는데 `Decomposition.pair`에는 대표 한쪽만** 실린다(`add({ form:"standard", pair: a, ... })`). `counts.order`가 suit 사전순(man<pin<sou)이라 대표는 언제나 앞 무늬다. 그래서 뒤 무늬가 화료패면 tanki 변형이 하나도 안 만들어지고, 몸통에도 없으므로 **변형 0개 → `evaluateWin` null**.
  - 실제로 그 손의 유일한 분해는 `머리=2m | 1m1p1s 3p4s5m 6p7s8m 9m9p9s` 하나이고, 화료패 `2p`는 어디에도 안 들어간다.
- **왜 지금까지 안 걸렸나**: 기존 회귀 테스트 `packages/content/test/mixed_nine_gates.test.ts`는 뼈대 `11m1p2s3m4p5s6m7p8s9m9p9s`에 `5p` 론 하나만 잰다. 그 뼈대는 `11m`이라는 **순수 머리**가 따로 있어 다른 분해가 살아 있고, `5p`는 마침 대표 쪽이다 → 0종 실패로 통과한다.
- **재현**: `qa-lab/synergy4/shape/15_repro_mixedpair.ts`, `06_ninegates.ts`
- **비고**: `mixedPairs`를 켜는 카드는 현재 `mixed_nine_gates` 하나뿐이다(치또이 쪽 혼색 쌍은 `chiitoiMixedPairs`로 분리돼 있고, 치또이 분기는 화료패 대조를 하지 않아 무사하다 — `18_chiitoi.ts`에서 양쪽 무늬 다 화료됨을 확인).

### 2. 봇의 샹텐 계산이 형 완화를 보지 않아 «자기 텐파이»를 못 본다 · 심각(봇 품질)

- **조합**: `polar_ends` / `broken_wall` / `wind_lineage` 단독부터. 이 축 카드를 여러 장 들수록 겹쳐 나빠진다.
- **기대**: 봇도 자기 손이 텐파이면 텐파이로 읽어야 한다. `packages/server/src/bot/read.ts:239-245`
  ```
  const shanten = shantenOf(hand, meldCount, opts);
  if (shanten <= 0 && hand.length > 0) { waits = winningKinds(...); tenpai = true; }
  ```
  정확한 대기 계산(`winningKinds`)은 옵션을 그대로 받지만, **그 앞의 문지기가 `shantenOf`**다.
- **실측** (`19_shanten.ts`, `20_shanten_rate.ts`): 그 옵션에서 화료형인 손을 만들어 한 장을 뺀 «진짜 텐파이» 표본에 대해
  | 옵션 (카드) | 표본 | 봇이 놓친 것 |
  |---|---|---|
  | `polarEnds` (양극) | 4000 | **3622 (90.5%)** |
  | `wrapRuns` (끝없는 윤회) | 4000 | **2313 (57.8%)** |
  | `honorRuns` (바람의 계보) | 4000 | **3962 (99.1%)** |
  | `mixedTriplets` (동수의 결속) | 1200 | 0 (0.0%) — 랭크 병합 모형이 받쳐 준다 |
  | `mixedRuns` (무너진 국경) | 1200 | 0 (0.0%) — 같음 |
  「옵션을 넘긴 값」과 「옵션을 무시한 값」이 위 셋에서 **완전히 같다** = `shantenOf`가 그 옵션을 아예 안 읽는다.
  개별 예시(`19_shanten.ts`): `199m199p199s11m19s`(양극 텐파이) → `isTenpai=true` / `shanten=1`. `891m891p234s567s5z`(윤회) → `isTenpai=true` / `shanten=2`. `123z234m567m11p99s`(계보) → `isTenpai=true` / `shanten=2`. `2m2p2s3m3p3s567m11z99p`(결속) → `isTenpai=true` / `shanten=2`(랭크 병합 모형이 수패 슌쯔와 함께 있으면 뚫린다).
- **원인**: `packages/core/src/mahjong/scoring/shanten.ts` — 머리말이 "totalSets만 반영하고 나머지 변형은 무시한다"고 스스로 적어 둔 그대로다. `mergedRankGroups`(180~270행)는 `mixedRuns`/`mixedTriplets`/`mixedPairs`만 다루고, `polarEnds`·`wrapRuns`·`honorRuns`·`kokushiDupes`에는 모형이 없다.
- **같은 «모양»의 선례**: synergy3 shape 확정 1이 정확히 이것이었다 — `kokushiOnly`(우는 국사)를 안 봐서 봇이 자기 역만 텐파이를 노텐으로 읽었고, 조커도 같은 이유로 고쳐졌다(`shanten.ts` 440~500행의 두 예외). **남은 다섯 옵션에 같은 구멍이 그대로 있다.**
- **재현**: `qa-lab/synergy4/shape/19_shanten.ts`, `qa-lab/synergy4/shape/20_shanten_rate.ts`
- **영향 범위**: 유국 텐파이 판정(`sysSettleDraw`)은 `winningKinds`를 직접 쓰므로 **점수는 안 틀린다**. 사람 플레이어의 화면도 맞다(클라는 `winningKinds`). 틀리는 것은 **봇의 판단**뿐이다 — 리치·푸시/오리·깡·대기 인식이 전부 이 게이트 뒤에 있다.

---

## 이상 없음 — 검사한 조합 (전부 나열)

### 형 완화가 서로 겹치는가 (`01_decompose.ts`) — 겹침 실패 0건
«A 단독으로도 B 단독으로도 안 서고 A+B에서만 서는 손»을 만들어 잰다.

- 양극 × 결속 (1만9통1삭 커쯔) — **A+B에서만 성립. 2026-08-31 커밋 5c0eaf8의 지시대로 열려 있다.** 손 분해·퐁·안깡이 전부 같은 규칙을 본다(`08_calls.ts`, `09_kan.ts`).
- 양극 × 무너진 국경 / 양극 × 끝없는 윤회 / 양극 × 바람의 계보 — 각각 A+B에서만 성립 ✓
- 결속 × 국경 / 결속 × 윤회 / 결속 × 계보 — A+B에서만 성립 ✓
- 국경 × 윤회 (8만9통1삭 혼색 순환 슌쯔) / 국경 × 계보 — A+B에서만 성립 ✓
- 진짜 용(5멘쯔·17장) × 양극 / 결속 / 국경 / 계보 / 윤회 — 전부 A+B에서만 성립 ✓ (`totalSets`가 다른 완화와 독립적으로 곱해진다)
- 비대칭 치또이 × 양극 / 결속 — 형이 달라 서로 죽이지 않는다 ✓
- 왕의 징표 × 양극 — 국사 분해는 양극과 무관(설계) ✓
- **분해 가짓수**도 A+B에서 늘어난다(예: 결속+국경 14가지) — «하나만 적용»이 아니다.

### 후로(퐁·치·깡) 판정이 손 분해와 같은가 (`08_calls.ts`, `09_kan.ts`)
- 퐁: 양극만 / 결속만 → 무늬 다른 1·9 **거부** · 양극+결속 → **허용** · 잡종(1만9만2통) → **거부** ✓
- 안깡: 같은 4칸 결과 ✓ (`sameCallBody`/`sameCallQuad`가 넷을 한꺼번에 본다)
- 치: 국경 단독 / 윤회 단독 / 국경+윤회 전부 허용 ✓ · 계보 단독 동남서 허용 ✓
- 계보+윤회의 «북동남»(자패 순환 슌쯔)은 손에서도 거부, 치에서도 거부 → **반쪽이 아니다** (아래 «의심» 참고)

### «국의 첫 순에만» 카드끼리 (`02_declare.ts`, `17_firstturn4.ts`)
- 동수의 결속 + 무너진 국경 + 비대칭 + 단색 세계 **넷을 한 순에 전부 발동할 수 있다** (선언이 순을 소모하지 않는다). `scoringOptionsOf`가 셋을 전부 싣는다 ✓ 쿨다운도 id별로 따로 돈다.

### 국사 3장 (`07_kokushi.ts`, `13_openkokushi.ts`)
- 왕의 징표 단독: 12종 국사 성립(단일 역만) / 11종은 불성립 ✓ / 13면(더블)으로 잘못 부풀지 않는다 (`isKokushi13`이 `size===13`을 함께 본다) ✓
- 우는 국사 × 왕의 징표: **kokushi_pon 뒤에도 12종 국사가 선다** (synergy3 확정 1의 수정이 유지된다) ✓
- 우는 국사 × 양극 / 결속 / 거신병: 국사 채점 그대로, 서로 죽이지 않는다 ✓
- 거신병 × 왕의 징표: 각성 뒤 13면 국사 26판 ✓ (거신병 자신의 조건은 «내 바닥에 13종 전부»로 남는다 — 왕의 징표가 완화하지 않는다. 카드 문구와 일치하므로 결함으로 보지 않는다.)
- 거신병 × 유국역만: `nagashi_yakuman.nagashiValid`가 `giantGodNagashiBaseKey`를 읽는다 — 증강 쪽 유국역만도 표준 유국만관과 **같은 기준선**을 본다 ✓ (synergy3 확정 3의 수정이 양쪽에 다 걸려 있다)

### 역만 우선순위·중복 (`14_yakuman.ts`, `14b.ts`, `11_suit_honor.ts`)
- 양극 노두 손 → `suuankou + chinroutou` 2역만(96,000). 양극+결속의 «무늬 섞인 노두 몸통»도 같은 2역만 ✓ (문서상 의도된 설계)
- 탕야오 해방은 역만 손에 **안 붙는다** ✓ (카드 문구대로)
- 진짜 용 5커쯔 → `suuankou_tanki`(26) 하나. 청노두형이면 +`chinroutou` = 3역만 ✓
- 계보 × 삼원의 의지 / 계보 × 개벽 / 계보 × 북풍상인 → 대삼원 48,000 그대로 (백발중을 슌쯔로 읽어 역만을 잃지 않는다 — `evaluateWin`이 변형 중 최고를 고른다) ✓
- 계보 × 대사희/소사희 — 그대로 ✓
- 뒤섞인 구련 × 표준 구련: `isMixedNineGates`가 «무늬 2종 이상»을 요구해 배타 ✓ 무늬가 하나면 표준 `chuuren_junsei`(26)로 간다 — 단색 세계·편식이 무늬를 통일해도 역만을 잃지 않는다 ✓

### relax_win × 형 완화 (`10_relaxwin.ts`)
- 형 완화는 «역이 하나도 없는 화료형»을 만든다(국경+결속으로만 서는 손을 론 → 무역).
  - 대기만성: 만개 전 **거부** / 만개(남3국) **허용**, `yakuless:true` ✓
  - 복수자: 원수 미지정 **거부** / 원수 = 방총자 **허용** ✓
- 우는 국사(`kokushiOnly`, 형 지정 계열) × 복수자 / 대기만성: 국사는 언제나 역이 있어 무해 ✓
- (복수자 ↔ 대기만성은 카탈로그 `conflicts`로 같이 들 수 없다 — 제외)

### «+N판» 두 계열의 겹침 (`16_extrahan.ts`)
- 진짜 용 +3판(`score.extraHan`) × 대기만성 +3판(`addWinHanBonus` 뱅크 환산)
  - 7판 30부 쯔모 손: 진짜용만 = 18,000(배만) → 둘 다 = 24,000(삼배만) = **«+6판 한 번»과 같다** ✓
  - `winInfo.han`이 이미 `extraHan`을 포함하고 `winPointsWithExtraHan`이 그 위에서 차분을 내므로 **이중 발행이 없다** ✓ 뱅크 발행분은 `augPoints`에 근거가 남는다.
- 북풍 상인(`score.extraHan`) × 대기만성 — 같은 방식으로 합산 ✓

### 비대칭 치또이 (`18_chiitoi.ts`)
- 혼색 7쌍 손이 `chiitoitsu(2)`로 정상 채점 ✓ 탕야오 해방 +2판이 겹쳐 붙는다 ✓
- **각 쌍의 양쪽 무늬 전부로 론이 된다** ✓ (결함 1의 치또이판은 없다 — 치또이 분기는 화료패를 대조하지 않는다)
- 양극·결속과 함께 들어도 치또이 채점이 흔들리지 않는다 ✓

### tanyao 축 (`21_tanyao.ts`)
- 탕야오 해방 × 양극: 노두 커쯔로 선 «전부 수패 + 1·9» 손에 `tanyao_break(2)`가 정확히 붙는다 ✓
- 자패가 한 장이라도 섞이면 안 붙는다 ✓ / 1·9가 없으면 표준 `tanyao(1)`로 간다 ✓ / 역만 손에는 안 붙는다 ✓
- **역시너지(결함 아님)**: 짝수의 세계를 발동하면 손의 1·9가 사라져 «해방된 탕야오 2판»이 «보통 탕야오 1판»으로 내려간다. 유국역만 × 양극/국사 계열도 같은 성격(버려야 할 패와 모아야 할 패가 정반대)이다. 둘 다 카드 문구대로의 결과이고 발동은 플레이어가 고르므로 결함으로 세지 않는다.

### suit 3장 (`11_suit_honor.ts`)
- 단색 세계 → 염색 이어쓰기 가능(한 장을 다시 다른 색으로) ✓ 편식과 함께 들어도 서로 막지 않는다 ✓

### 클라이언트 대기 표시
- `packages/client/src/App.tsx` `waitDecompOptions`가 **옵션을 조기 반환이 아니라 누적**으로 만들고, 마지막에 서버의 `view.scoringOptions`로 덮는다 → 조합에서도 서버와 같은 규칙을 그린다 ✓

### 실전 스위프 (`12_sweep.ts`)
축 안의 «서로를 키울 법한» 조합 67개(2·3장, `conflicts`로 잠긴 짝은 애초에 넣지 않았다) × 시드 2 × 반장전 완주 = **134판**.
크래시 0 / 훅 예외 0 / 불변식(패 중복·유실·왕패·손패 장수·점수 총합) 위반 0 / 소프트락 0 / 설명 안 되는 점수 드리프트 0 — **신호 0건**.
로그: `qa-lab/synergy4/shape/12_sweep.log`

---

## 의심 (확정 못 한 것)

1. **바람의 계보 × 끝없는 윤회 — 자패 슌쯔는 순환하지 않는다.**
   `4z1z2z`(북동남)는 손 분해에서도 치에서도 거부된다(`01_decompose.ts`, `08_calls.ts`). 손과 후로가 **일치**하므로 반쪽 결함은 아니다. 다만 끝없는 윤회의 문구 "슌쯔가 원을 그리며 순환한다"가 수패 한정인지가 카드 텍스트로는 단정되지 않는다(설명의 예시는 8-9-1·9-1-2로 수패뿐이고, `decompose.ts`의 `honorRuns` 분기에는 wrap 개념이 없다). **사양 확인 필요** — 사양이 «수패 한정»이면 이상 없음.
2. **바람의 계보 × 무너진 국경 — 바람과 삼원을 섞은 슌쯔(동·남·백)는 안 된다.** 위와 같은 성격. 어느 카드도 약속하지 않았으므로 결함으로 보지 않았지만, 「무늬 제한이 사라진다」를 자패까지 읽으면 기대가 갈릴 수 있다.
3. **조커(`wildKinds`) 전용 몸통은 확장 규칙을 열거하지 않는다.**
   `decompose.ts` `freeGroupCandidates`는 34종 커쯔 + 같은 무늬 슌쯔만 만든다 — 조커 3장으로만 이루는 몸통이 순환 슌쯔·자패 슌쯔·혼색 커쯔가 될 수는 없다. 다만 같은 자리에서 **커쯔는 언제나 만들 수 있으므로 화료형 성립 여부는 바뀌지 않고**, 값이 달라질 여지만 남는다(계보 1판 등). 실제로 손해가 나는 손을 만들지 못해 «의심»에 둔다.
4. **`shantenOf`의 `mixedTriplets` 랭크 병합 모형이 수패 슌쯔와 섞이면 뚫린다.**
   무작위 표본에서는 0%였는데(`20_shanten_rate.ts`) 손으로 만든 `2m2p2s3m3p3s567m11z99p`는 텐파이인데 샹텐 2로 읽힌다. 결함 2와 같은 뿌리지만 **비율을 재지 못해** 별건으로 세지 않았다.

---

## 재현 스크립트

| 파일 | 내용 |
|---|---|
| `01_decompose.ts` | 형 완화 옵션끼리의 겹침 (decompose 순수 레벨) |
| `02_declare.ts` | 첫 순 선언 3종 동시 발동 + `scoringOptionsOf` |
| `03_yaku.ts` | 형 완화 × 역 4칸 대조 |
| `04_dig.ts` / `05_variants.ts` | 결함 1 파고들기 (변형이 왜 0개인가) |
| `06_ninegates.ts` | **결함 1** — 구련 대기 27종 중 화료되는 것 세기 |
| `07_kokushi.ts` / `13_openkokushi.ts` | 국사 3장 |
| `08_calls.ts` / `09_kan.ts` | 퐁·치·안깡이 손 분해와 같은 규칙을 보는가 |
| `10_relaxwin.ts` | 역 없이 화료 × 형 완화 (실제 정산) |
| `11_suit_honor.ts` | suit 3장 / honor 축 |
| `12_sweep.ts` | 실전 스위프 70조합 |
| `14_yakuman.ts` / `14b.ts` | 역만 중복·우선순위 |
| `15_repro_mixedpair.ts` | **결함 1** 최소 재현 + 기존 테스트가 왜 놓쳤는가 |
| `16_extrahan.ts` | «+N판» 두 계열의 겹침 (뱅크 이중 발행 검사) |
| `17_firstturn4.ts` | 첫 순 카드 4종 동시 발동 |
| `18_chiitoi.ts` | 비대칭 치또이 |
| `21_tanyao.ts` | 탕야오 해방 축 |
| `19_shanten.ts` / `20_shanten_rate.ts` | **결함 2** — 봇 샹텐이 형 완화를 못 본다 |
