# 증강 연계/상호작용 · 드래프트 — synergy

> 담당 id: `synergy` · 2026-08-22.
> 재현 스크립트는 전부 `qa-lab/round2/synergy/` 에 있다.

## 요약

- **돌린 판**
  | 스위프 | 규모 | 결과 |
  |---|---|---|
  | 같은 계열 짝 **전수** (`samecat.ts` ×6샤드, tonpuu) | **813쌍 / 3,514국** | crash 0 · effectError 0 · 위반 1(기지의 `devils_advance` 드리프트) |
  | 무작위 2~3개 조합 스위프 (`triples.ts` ×4샤드) | **400게임 / 3,602국** · 조합 1,278종 · 증강 113종 | crash 0 · effectError 0 · 위반 4(전부 오탐 또는 기지) · shard0(네 좌석 같은 조합)에서 **의심 3** |
  | cornucopia 강제 실게임 (`conf_hold.ts`) | 80게임 | `conflicts` 동시 보유 0 · 게임 내 중복 보유 0 |
  | 드래프트 드라이런 (`drycell.ts`, 전 카탈로그, 칸을 말리는 픽) | 300게임 | 오퍼 겹침 0 · 중복 0 · 폴백 0 · 빈 오퍼 0 |
  | 결정성 (`cross/determinism.ts`) | 6쌍 = 12판 | mismatch **0** |
  | 카탈로그 축소 드래프트 (`shrink.ts`) | 7단계 × 120게임 | **확정 1** |
  | 정적 감사 8종 (`static_audit`·`tag_audit`·`tier_mono`·`play_audit`·`keycollide`·`penalty_breadth`·`bias_measure`·`pool_by_stage`) | 카탈로그 117종 전수 | **확정 3** |
  | 정산 순서 재구성 (`seatswap_rebuild`·`seatswap_score_delta`) | 60게임 + 단위 재현 | **확정 2** |
- **확정 3건**(🟠 2 · 🟡 1) · **의심 3건**(전부 🟡) · 음성 확인 12항목
- 실제로 돌린 국 수는 **7,100국이 넘고** **크래시·훅 예외(effectError)는 한 건도 없었다.**
  내 도메인에서 나온 것은 전부 **정적 모순**과 **재구성 경로**다 — 실행 중 폭발하는
  조합은 이미 앞선 라운드들이 훑어 낸 것으로 보인다.
- 아직 못 본 범위는 맨 아래에 적었다.
- ⚠ 작업 중 이 워크트리에서 **다른 담당자들이 `packages/**` 를 동시에 고치고 있었다**
  (문구·서버 쪽 81파일). 다만 내 도메인 파일(`core/src/augment/**`, `core/src/engine/**`,
  `content/src/util.ts`)은 `git diff` 상 **한 줄도 바뀌지 않았다** — 위 결과는 그대로 유효하다.
  나는 `packages/**` 를 건드리지 않았다.

---

## 확정 1. 🟠 좌석 칸 폴백에서 **게임 내 중복 보유가 그대로 뚫린다** — 경고 문구·주석이 약속한 것과 반대

- 위치: `packages/core/src/augment/DraftController.ts:396-402`(폴백 `draw`) ·
  `:216-227`(`warnCellFallback` 문구) · `:105-115`(`heldAtStageStart` 주석)
- 기대: 2026-08-20 QA disrupt 확정 5의 수정이 못 박은 것 —
  > "이제 폴백에서도 금지 목록을 유지한다 — 포기하는 것은 **좌석 간 오퍼 겹침**뿐이고,
  > **게임 내 중복 보유는 살아남는다**."
  경고 문구도 화면에 그대로 그렇게 찍는다:
  `게임 내 중복 보유는 계속 막지만 좌석 간 오퍼 겹침은 보장하지 못한다.`
- 실제: **막지 못한다.** 폴백이 걸리는 순간 120게임 중 **59~82%**가 중복 보유로 끝난다.
  ```
  카탈로그 content=20종: DUP_GAME 게임수=99/120 · 오퍼겹침=1667 · 폴백경고=480
  카탈로그 content=30종: DUP_GAME 게임수=77/120 · 오퍼겹침=1037 · 폴백경고=480
  카탈로그 content=40종: DUP_GAME 게임수=71/120 · 오퍼겹침= 793 · 폴백경고=480
  카탈로그 content=54종: DUP_GAME 게임수= 0/120 · 오퍼겹침=   0 · 폴백경고=  0   ← 폴백 미발동
  ```
- 원인(재현 로그로 확정): `heldByOthers`는 **스테이지 시작 시점 스냅샷**이라
  "**같은 스테이지에 두 사람이 동시에 같은 것을 고르는 것**"을 막지 못한다.
  칸(`cellFor`)이 있을 때는 칸이 서로 소라 그 경우가 아예 생기지 않지만,
  폴백에는 칸이 없어 **같은 카드가 두 좌석에 동시에 제시되고 둘 다 집는다.**
  `heldAtStageStart` 주석도 이 한계를 알고 있다("이번 스테이지에 **동시에** 고른
  것까지 막지는 못하지만, 그건 애초에 칸이 막던 일") — 그런데 폴백은 칸이 없는 자리다.
  곧 **폴백에서 그 예외가 곧바로 규칙이 된다.**
- 재현:
  ```
  tsx qa-lab/round2/synergy/shrink.ts 40 120       # 집계
  tsx qa-lab/round2/synergy/shrink_find.ts 40 40   # 픽 로그까지
  ```
  발췌 (`seed=3300000`, 네 스테이지 모두 폴백 경고가 먼저 찍힌다):
  ```
  gameStart p2 offer6=[tile_dyeing,invincible,jackpot,ura_peek,discard_lock,omni_chi] pick=omni_chi
  gameStart p3 offer6=[iron_wall,tile_dyeing,broken_wall,omni_chi,...]                pick=omni_chi
     held: … p2:[omni_chi] p3:[omni_chi]
  southEntry p2 … pick=yakuman_shield / southEntry p3 … pick=yakuman_shield
  southThird p0 … pick=nagashi_yakuman / southThird p1 … pick=nagashi_yakuman
  → seed=3300000 DUP nagashi_yakuman: p0+p1  omni_chi: p2+p3  jackpot: p0+p3  yakuman_shield: p2+p3
  ```
- 영향: **오늘 배포되는 카탈로그(제시 가능 114~115종)로는 도달하지 않는다** — 폴백 임계는
  제시 가능 풀 < 54(= 좌석 4 × 최소 칸 12 + 보충 6)이고 지금 여유가 60종 넘는다
  (`pool_by_stage.ts`). 위험은 **미래**다: 증강을 60종 이상 정리하거나 `modes`/`draftStages`
  제한을 크게 늘리거나 3인 마작·좌석 수 변경을 도입하는 순간, 절벽처럼
  "같은 증강을 둘이 보유"가 **게임의 과반**에서 성립한다. 그리고 그때 로그에 찍히는 문구는
  *"게임 내 중복 보유는 계속 막지만"* 이라 원인 추적을 정확히 반대 방향으로 보낸다.
  중복 보유는 보유자 전용 채널(잔량·쿨다운)이 좌석을 구분하지 못하게 만든다는 것이
  원래 이 불변식이 있는 이유다(`Augment.grantAugments` 주석).
- 제안 수정: 둘 중 하나.
  ① 폴백일 때만 `heldByOthers`를 스냅샷이 아니라 **라이브**로 읽고, 픽 적용 루프가
     "이미 남이 가져간 카드"를 거절하는 대신 그 좌석에 대체 카드를 준다
     (`pick` 재계산 검증이 흔들리므로 검증도 함께 완화해야 한다 — 주석이 경고하는 그 함정).
  ② 더 싸고 안전한 쪽: `HanchanController.runDraft`의 픽 적용 루프에서
     **이미 같은 스테이지에 다른 좌석이 집은 id면 그 좌석의 오퍼 중 다음 것으로 대체**한다
     (폴백일 때만). 최소한 `warnCellFallback` 문구에서 거짓말("중복 보유는 계속 막지만")을
     지우고 실제로 포기하는 것을 적어야 한다.
- 참고: 크래시·소프트락은 없다 — `PICK_THROW=0`, `SHORT_OFFER=0`(전 구간).

---

## 확정 2. 🟠 `seat_swap` 뒤에는 **이어하기·리플레이가 원본과 다른 순서로 정산한다** (정산 우선순위가 install 시점 좌석 번호에 굳어 있다)

- 위치: `packages/content/src/util.ts:645` (`settleInterceptor` — `const seat = … ?? 0` 를
  **install 시점에 한 번** 읽어 `settlePriority(stage, seat, id)` 로 굳힌다) ×
  `packages/content/src/augments/seat_swap.ts:245-252` (`players[].seat` 를 **영구히** 맞바꾼다) ×
  `packages/core/src/augment/DraftController.ts:rebuildAugments`
- 기대: `packages/core/src/augment/settleStages.ts` 머리말이 명시적으로 약속한다 —
  > "priority는 `settlePriority(stage, seat, augmentId)`가 만든다 … 셋 다 **게임 상태에서만
  > 나오므로 드래프트 픽 순서·설치 순서·재구성(이어하기·리플레이)과 무관하다.**"
  같은 파일이 전제로 깐 것: 정산 인터셉터는 "지금 deltas를 읽어 고쳐 쓴다 —
  즉 **교환법칙이 성립하지 않는다**." 곧 순서가 갈리면 **점수가 갈린다.**
- 실제: `seat` 는 상태에서 나오지만 **읽는 시점이 install 순간**이다. 자리 바꿈은 그
  뒤에 자리를 영구히 바꾸므로, 원본 게임의 인터셉터는 **옛 좌석 번호**로 정렬돼 있고
  재구성(`rebuildAugments`)은 **새 좌석 번호**로 다시 정렬한다.
- 재현 ①(메커니즘): `tsx qa-lab/round2/synergy/seatswap_settle_order.ts`
  ```
  원본 정산 순서:   … aug:p0:parasite -> aug:p2:spy …
  자리 교환: p0 0->2, p2 2->0
  재구성 정산 순서: … aug:p2:spy -> aug:p0:parasite …
  !! 다르다 !!
  ```
- 재현 ②(실제 재구성 경로 `createStandardGameFromState` + `rebuildAugments`, 대조군 포함):
  `tsx qa-lab/round2/synergy/seatswap_rebuild.ts 60`
  ```
  60 게임: 자리 그대로 재구성 불일치 0 / p0↔p2 교환 후 재구성 불일치 17   (28.3%)

  seed=900007
     원본:   aug:p0:jackpot aug:p2:let_it_ride aug:p2:iron_wall aug:p3:yakuless_win
     교환후: aug:p2:let_it_ride aug:p0:jackpot aug:p2:iron_wall aug:p3:yakuless_win
  seed=900000
     원본:   … aug:p1:parasite aug:p2:spy …
     교환후: … aug:p2:spy aug:p1:parasite …
  ```
  **대조군이 0** 이라는 것이 핵심이다 — 자리를 안 바꾸면 재구성 순서가 원본과 정확히 같다.
  깨지는 것은 오직 좌석이 바뀌었을 때다.
- 영향: 자리 바꿈은 반장전 3회 · 동풍전 2회짜리 흔한 프리즘 증강이고, 정산 인터셉터를
  쓰는 증강은 20종이 넘는다. 위 예시의 `jackpot`(Multiply) × `let_it_ride`(Multiply)는
  이미 "서로를 다시 곱한다"로 판정된 쌍이다(`qa-lab/verdicts/score.md`) — 두 사람의
  Multiply 순서가 뒤집히면 **최종 점수가 달라진다.** 곧
  **리플레이가 원본과 다른 점수를 재생하고, 서버 재시작 후 이어하기가 다른 결과로 이어진다.**
  docs/25 P6가 같은 종류(설치 순서 seq)를 이미 한 번 고쳤는데, 좌석 축으로 같은 구멍이
  남아 있다.
- 참고: 한도로 중단된 1차 시도가 남긴 `qa-lab/round2/synergy/repro_seatswap_settle.ts` 가
  **같은 결론에 독립적으로 도달해 있었다**(보고서는 못 쓰고 끊겼다). 이번에는 대조군과
  점수 차이까지 붙였다.
- 제안 수정: `settleInterceptor` 가 좌석을 **install 시점에 굳히지 말고 인터셉터가 도는
  순간 상태에서 읽게** 한다. priority 는 등록 시 고정값이어야 하므로 실제로는
  ① 좌석 대신 **`PlayerId` 문자열 순서**(자리 바꿈과 무관한 불변 축)를 쓰거나,
  ② `seat_swap` 의 리듀서가 자리를 바꾼 뒤 두 사람의 정산 인터셉터를 재등록하게 한다.
  ①이 훨씬 싸고, `settleStages.ts` 주석이 "자리" 항에 요구하는 성질(결정적·픽 순서 무관)을
  그대로 만족한다. 회귀 테스트: `seatswap_rebuild.ts` 의 대조군/실험군 두 줄.
- 재현 ③(**점수까지 실제로 갈린다**): `tsx qa-lab/round2/synergy/seatswap_score_delta.ts`
  `parasite`(p1, Transfer: 숙주 획득의 절반) × `spy`(p2, Transfer: 지정패 화료 획득 전액),
  같은 정산 이벤트를 순서만 바꿔 태운다.
  ```
  엔진이 준 순서: aug:p1:parasite -> aug:p2:spy
    deltas = {"p0":0,"p1":4000,"p2":4000,"p3":-8000}
  뒤집은 순서:   aug:p2:spy -> aug:p1:parasite
    deltas = {"p0":0,"p1":0,   "p2":8000,"p3":-8000}
  ```
  **p1이 4,000점을 통째로 잃거나 얻는다.** 곧 자리 바꿈이 있었던 판을 이어하기·리플레이하면
  같은 국이 다른 점수로 재생될 수 있다.

---

## 확정 3. 🟡 `conflicts`로 **절대 같이 못 드는 쌍**을 `synergy` 표는 오히려 **끌어당긴다** (10쌍)

- 위치: `packages/core/src/augment/synergy.ts`(`AUGMENT_SYNERGY` 표) ×
  각 증강의 `conflicts` 선언 (`packages/content/src/augments/*.ts`)
- 기대: `synergy.ts` 머리말이 못 박은 설계 —
  "진짜로 같이 들면 안 되는 것은 `AugmentDef.conflicts`로 잠근다 … `antiIds`는
  **함께 뜨면 게임이 부서지는 짝**". 곧 `conflicts` 쌍은 최소한 시너지 보너스를
  받으면 안 된다(이상적으로는 `antiIds`에 함께 적혀 있어야 한다).
- 실제: 10쌍이 **보너스 ×2~×3**을 받는다. `DraftController.excludeFor`가 어차피
  제외하므로 그 배수는 **한 장도 뽑히지 않는 카드에 실린 죽은 가중치**다 —
  의도한 시너지 축으로 가야 할 편향 질량이 그만큼 새어 나간다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/synergy/static_audit.ts`
  ```
  CONFLICT_BUT_SYNERGY_PULL avenger + late_bloomer = x2
  CONFLICT_BUT_SYNERGY_PULL avenger + late_bloomer_east = x2
  CONFLICT_BUT_SYNERGY_PULL free_riichi_discard + last_stand = x2
  CONFLICT_BUT_SYNERGY_PULL free_riichi_discard + palm_flip = x2
  CONFLICT_BUT_SYNERGY_PULL open_riichi_reveal + last_stand = x2
  CONFLICT_BUT_SYNERGY_PULL open_riichi_reveal + palm_flip = x3
  CONFLICT_BUT_SYNERGY_PULL true_dragon + royal_kokushi = x2
  CONFLICT_BUT_SYNERGY_PULL true_dragon + async_chiitoi = x2
  CONFLICT_BUT_SYNERGY_PULL true_dragon + mixed_nine_gates = x2
  CONFLICT_BUT_SYNERGY_PULL frame_up + picky_eater = x2
  conflict-pull pairs: 10
  ```
- 영향: 플레이어가 직접 겪는 오작동은 없다(제외가 먼저 걸린다). 두 표가
  서로 반대를 말하고 있다는 것이 문제 — 나중에 `conflicts` 한 줄만 풀면 그 순간
  "게임이 부서지는 짝"이 **평소보다 2~3배 자주** 함께 뜬다. 편향 질량 누수도 있다.
- 제안 수정: `conflicts` 쌍은 자동으로 `antiIds`로 취급하거나
  (`synergyBias`에서 `catalog`의 conflicts를 함께 읽는다), 최소한
  `core/test/Synergy.test.ts`에 "conflicts 쌍은 bias > 1 이면 안 된다" 회귀를 추가한다.

---

## 음성 확인 (돌려 봤고 깨끗했다 — 재보고 금지 목록)

| 항목 | 방법 | 결과 |
|---|---|---|
| 결정성(같은 시드·preset 2회) | `qa-lab/cross/determinism.ts 6 990000` | 6쌍 전부 로그 다이제스트·최종점수·보유증강 일치. **0 mismatch** |
| 드래프트 좌석 간 오퍼 겹침 / 게임 내 중복 보유 | `qa-lab/round2/synergy/drycell.ts 300 hanchan` (conflicts-탐욕 픽으로 칸을 일부러 말린다) | `오퍼겹침6=0 겹침3=0 DUP=0 폴백경고=0 SHORT=0` |
| 「좌석 칸 없이 전역 추첨으로 강등」 경고 | `qa-lab/round2/synergy/pool_by_stage.ts` | **실서비스 카탈로그에서는 절대 안 난다.** 모드·스테이지 7종 전부 `offerable=114~115`, `fit=27` → `cellSize=24 ≥ 12`. 강등은 **작은 테스트 카탈로그 전용** 경로다(테스트 로그의 그 경고는 프로덕션 신호가 아니다) |
| 후보 풀 고갈(제시 3장 미만·빈 오퍼) | 위 drycell 300게임 | `SHORT=0`. gameStart의 complexity≥3 배제(41종)를 감안해도 칸 24장 중 6장을 못 채우는 일이 없다 |
| 시너지 표 ↔ 카탈로그 정합 | `static_audit.ts` | 117종 전부 synergy·powerTier 행 존재. 유령 행 0, 미지의 `antiIds`/`conflicts` 대상 0 |
| 시너지 편향이 실제로 먹히는가 | `bias_measure.ts` (n=4800) | 스텔스 보유 시 공개형 제시율 6.0% → **0.0%**, 스텔스풀 3.7% → 8.7%. `SYNERGY_PENALTY=0.25`가 `pickWeighted`의 ×100 눈금에서 살아남는다(바닥 1 tick = 0.01) |
| 역시너지 페널티의 과잉 확산 | `penalty_breadth.ts` | 최악이 `no_ron_pact` 24/117(20.5%), 3개 보유 최악도 24/117. 다양성이 죽는 수준 아님 |
| `conflicts` 쌍 동시 보유 · 지급(cornucopia) 경로 중복 | `conf_hold.ts 80` (실제 완주 게임, p0에 cornucopia 강제) | 80게임 전부 0/0 |
| 같은 계열 짝 전수 완주 | `samecat.ts` ×6샤드 813쌍 / 3,514국 | crash 0 · effectError 0 |
| `AUGMENT_PLAY`(봇 메타) 정합 | `play_audit.ts` | 유령 행 0 · 3개 조합 16,215건에서 value 배수 캡(3.0) 도달 0 |
| `powerTier` 표 내부 정합 | `tier_mono.ts` | 설명 안 되는 티어 역전 0쌍 · `rare`인데 shift≥0 인 행 0 |
| `augmentData` 키 충돌·증식 | `keycollide.ts` · `qa-lab/cross/keygrowth.ts 4242 hanchan` | 서로 다른 증강이 공유하는 키 접두사 2건뿐이며 둘 다 의도(`reload`가 `discard_lock` 쿨다운을 건드린다 / `roundScope` 헬퍼). 9국 완주 후 키 38개, `#round` 마크 잔존 0 |

## 오탐으로 판명된 것 (다른 담당자가 같은 신호를 보면 참고)

- `HAND_SIZE_STRICT` (`qa-lab/pairs/lib.ts:147`)가 `true_dragon` 보유자에게 뜨는 것 —
  전부 **`disarm`이 그 국에 진짜 용을 잠근 상태**다. 잠기면 진짜 용이 3장을 패산에
  반납해 13/14장으로 **정상 복귀**한 것이 맞다. 검사식이 무장해제를 안 본다.
  재현: `qa-lab/round2/synergy/repro_dragon_size.ts`(seed 770026, p1의 disarm) ·
  `repro_dragon_size2.ts`(seed 773874, p2의 disarm) — 둘 다
  `engine:disarmed#round=["aug:pX:true_dragon"]`이 함께 찍힌다.
- `SCORE_DRIFT_UNEXPLAINED -9000` + `devils_advance` — 이미 판정 끝난 설계
  (`qa-lab/verdicts/score.md` 2번, `qa-lab/findings/pairs.md` 99번).
- 배율 연쇄(`let_it_ride × jackpot × blood_contract`) — `qa-lab/findings/score-a.md` 의심 1 ·
  `qa-lab/verdicts/score.md`에 이미 있다. 재확인만 했다
  (`repro_mult_stack.ts`: 8000 → 100000, 뱅크 발행 92000).

---

## 의심 1. 🟡 `settlePriority`의 "자리" 축은 **절대 좌석 번호**라 p0가 항상 먼저 정산한다

- 위치: `packages/core/src/augment/settleStages.ts:settlePriority` (`stage + seat + idFraction`)
- 관측: 같은 단계 안에서 플레이어 간 순서는 **좌석 번호 오름차순**으로 고정된다.
  확정 2의 재현 ③이 보여 주듯 그 순서가 4,000점을 가른다. 좌석은 반장전 내내 고정이므로
  (자리 바꿈이 없는 한) **p0가 매 국 유리한 쪽/불리한 쪽에 고정 배치**된다.
  오야는 국마다 돌지만 이 축은 돌지 않는다.
- 왜 의심에 두는가: 이것이 "버그"인지 "선택"인지는 설계 판단이다. 주석은 결정성만
  요구하고("게임 상태에서만 나온다") 공정성은 말하지 않는다. 다만 확정 2를 고치면서
  좌석 축을 손볼 것이라면, 그때 **오야 기준 상대 순번**처럼 국마다 도는 축으로 바꾸는
  편이 자연스럽다.
- 측정하지 않았다: 좌석별 승률 차이가 통계적으로 유의한지는 수천 판이 필요해 이번엔 안 쟀다.

## 의심 2. 🟡 `powerTier` 라벨과 **실제 파괴력**의 대조는 이번에 못 했다

- 표 자체는 **내부적으로 완전히 일관됐다**: `tier_mono.ts` — 설명 안 되는 티어 역전 0쌍/117종,
  `rare: true`인데 shift가 음수가 아닌 행 0개(주석이 금지한 조합).
- 남은 것은 "점수 산식이 매긴 등급 = 실전 파괴력인가"인데, 이건 증강별 수천 판 승률이
  있어야 답할 수 있다. 눈에 띄는 큰 이탈은 `aotenjou_ceiling(shift=+2)` ·
  `three_dragons_will(shift=-2)` · `mixed_nine_gates(shift=-3)` 세 개다.

---

## 의심 3. 🟡 **같은 조합을 여러 좌석이 들면 반장전이 끝나지 않는다** (평균 8국 → 71국)

- 관측: 조합 스위프의 shard 0은 `i%4===0` 이라 **네 좌석 전부에 같은 2~3개 조합**을 준다.
  그 샤드만 100게임에 **1,423국**이 나왔다 — 나머지 세 샤드는 100게임에 717~731국이다.
  격리해서 재보면 차이가 더 크다:
  ```
  tsx qa-lab/round2/synergy/samecombo_time.ts
    sameForAll=true : 6게임 535s (89.3s/게임) 총 424국   ← 70.7국/판
    sameForAll=false: 6게임 101s (17.0s/게임) 총  50국   ←  8.3국/판
  ```
  반장전은 정상적으로 8국 + 연장이다. **70국짜리 반장전**은 연장(렌짱)·유국 고리가
  계속 도는 것이고, 사람이 앉아 있었다면 사실상 끝나지 않는 판이다.
  crash·effectError·불변식 위반은 **0** 이라 엔진이 깨지는 것은 아니다 — 안 끝날 뿐이다.
- 왜 의심에 두는가(중요): **현재 규칙에서는 네 좌석이 같은 증강을 들 수 없다.**
  드래프트가 게임 내 중복 보유를 막기 때문이다 — 곧 이 상태는 프리셋으로 강제해야만
  만들어진다. 다만 **확정 1의 폴백 경로가 열리면 두 좌석까지는 실제로 같은 증강을
  보유한다.** 2좌석 중복에서도 국 수가 늘어나는지는 이번에 안 쟀다.
- 다음 단계: `qa-lab/round2/synergy/samecombo_rounds.ts` 가 조합별 국 수를 찍는다 —
  어떤 증강이 고리를 만드는지(렌짱 유발·유국 유발 계열로 의심된다) 좁히는 데 쓴다.
  **이번 예산 안에 못 끝냈다** — 한 판이 300초를 넘는 케이스가 있어 6판을 다 못 돌았다.

## 덜 본 범위 (다음 담당자에게)

1. **리치 제약을 서로 뒤집는 조합** — `qa-lab/riichi/`·`qa-lab/findings/riichi.md`가 이미
   담당 도메인이라 중복을 피해 손대지 않았다.
2. **티어 ↔ 실전 파괴력**(의심 2) — 승률 시뮬이 필요하다.
3. **좌석 편향 통계**(의심 1) — 수천 판.
4. **드래프트 타이머·재접속 경로의 동시성** — 코드 정독으로는 구멍을 못 찾았다
   (`HumanAgent.armDraft`는 새로고침 후 화면 배열을 읽고, `handleDraftReroll`·`draftPick`은
   화면 배열로만 검증하며, 튜토리얼 30분 타임아웃보다 컨트롤러 가드가 60초 길게 잡혀 있다).
   실제 소켓을 붙여 흔드는 통합 테스트는 못 돌렸다.
5. **설치 순서 의존 자체의 정량화** — `order_dep.ts`(같은 짝을 `[a,b]`/`[b,a]`로 심어
   완주 결과 비교)는 **측정 도구로서 무의미**했다. 배패를 건드리는 증강 하나만 순서가
   바뀌어도 그 뒤 PRNG 소비가 통째로 갈려(국 수까지 4→8) 나비효과와 진짜 순서 의존을
   구분할 수 없다. 순서 의존은 확정 2처럼 **훅 등록 순서만 바꿔 같은 이벤트를 태우는**
   방식으로 재야 한다(`seatswap_score_delta.ts`가 그 본보기).
6. **의심 3의 조합 특정** — `samecombo_rounds.ts`를 만들어 뒀지만 한 판이 300초 넘게
   가는 케이스가 있어 예산 안에 못 끝냈다.
7. **3인 마작/좌석 수 변경** — 존재하지 않아 확정 1의 폴백 경로를 실제 설정으로는
   재현하지 못했다(카탈로그 축소로만 재현했다).
