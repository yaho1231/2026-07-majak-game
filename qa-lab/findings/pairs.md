# 교차 카테고리 짝 — 조합을 찾는 사람 (pairs)

담당: 개별 증강이 아니라 **두 증강이 한 사람 손에 동시에 들렸을 때** 무너지는 자리.
1차 웨이브가 카테고리 안쪽을 팠으므로 여기서는 **카테고리를 가로지르는 짝**만 팠다
(같은 category끼리는 제외, `conflicts`로 이미 금지된 짝도 제외).

## 요약

- 돌린 판: **게임 959판 / 7,004국** (반장전 5웨이브 + 동풍전 1웨이브, 페르소나 3믹스)
- 짝 커버리지: **고유 교차 카테고리 짝 695쌍**, 113종 중 **108종**이 짝의 당사자로 등장
  (나머지 5종 `late_bloomer`·`broken_border`·`royal_kokushi`·`danger_sense`·`mirror_dora`도
  다른 자리의 무작위 증강으로는 계속 섞였다)
- 실제 발동 근거: **짝의 두 증강이 모두 상태를 남긴 게임 68~75%**, 최소 하나가 남긴 게임 90%+
  (`COVER a=… b=… both=…` 로그 — restrict 156/229, state 120/160. `augmentData` 키 prefix 계측)
- 결과: **게임 쪽 확정 0건**. 크래시 0, 훅 예외(`effectErrors`) 0, 타임아웃/소프트락 0,
  패 중복·유실 0, 패 총량(136장) 깨짐 0, 손패 장수 이상 0, 사용 횟수 상한 초과 0,
  증강 목록 중복·유실 0, 상태 키 폭주 0.
- **도구 쪽 확정 1건** — `qa-lab/harness.ts`의 점수 드리프트 판정이 오탐을 낸다.
  이번 7,004국에서 나온 드리프트 신호 **16건 전부**가 오탐이거나 설계된 뱅크 발행이었다(아래 확정 1).
- 부수 확인 3건: 다른 도메인 보고서의 **의심 하나를 해소**했고(`score-b.md` 의심 2 — devils_advance),
  나머지는 설계대로임을 소스로 확인했다.
- 양성 대조 1건: 예전에 하드락을 냈던 `disarm × true_dragon`이 지금은 손패·패 총량 모두
  정확히 복구된다는 것을 실측으로 확인했다(아래 "확정하지 못한 신호" 마지막 항목).

## 방법

`qa-lab/pairs/` (소스는 읽기만 했다)

- `gen.ts` — `category` 필드로 교차 카테고리 짝을 전수 열거하고 우선순위 버킷으로 나눈다.
  버킷 크기(반장전): `state` 2,728 · `misc` 1,915 · `tilesWin` 551 · `deltas` 99 · `usesCtl` 81.
  - `state` 상태 키를 쓰는 것(`augmentDataSet`) × 같은 것
  - `deltas` 정산 개입 × 정산 개입 (`grep -l deltas`)
  - `tilesWin` 손패/패산을 물리적으로 옮기는 것 × 화료 판정을 바꾸는 것
  - `usesCtl` 사용 횟수를 쓰는 것 × `reload`/`disarm`
- `run2.ts` / `run3.ts` — 버킷별 스윕. **dual 모드**: 같은 짝을 p0·p2 **두 사람이 동시에**
  들게 해서 (ⓐ 한 사람 안에서의 충돌과 (ⓑ 두 사람 사이의 충돌을 한 판에 같이 밟는다.
  나머지 두 자리는 무작위 2개씩(conflicts 회피). 페르소나 믹스 3종을 번갈아 쓴다
  (전원 masher / masher+caller+riichiRusher+folder / masher+stall+chaos+stall).
- `run3.ts` — 손으로 고른 두 무리의 곱: **버림·선언 경로에 제약을 거는 것**(봉인술사·초읽기·
  울기봉인·리치봉인·불가침·함구령·박무·누명·자리바꿈·판뒤집기·파혼·삼원패의 의지·편식)
  × **버림·선언 경로를 바꾸는 것**(물러설수없는선언·스텔스리치·자유버림·오픈리치·농성리치·
  등떠밀기·손바닥뒤집기·무르기·후회·조용한교환·거신·패쪼개기·자패반납·북풍상인·통째교환·
  3장교환·도굴·연못강탈) + **강(버림패)을 물리적으로 되감는 것들끼리의 조합**.
  소프트락(빈 선택지)과 강제 버림 충돌을 정면으로 노렸다.
- 짝 전용 불변식 (`lib.ts` `pairInvariants`) — harness 기본 검사에 더해 5종을 얹었다.
  1. `USES_OVER_CAP` — `<id>:uses:<seat>` 는 matchUses(동풍1·반장2)를 넘을 수 없다
     (`seat_swap`만 설계상 +1: [seat_swap.ts:73](../../packages/content/src/augments/seat_swap.ts#L73))
  2. `RIICHI_HAND_MUTATED` — 리치 선언자의 13장 손패는 깡·리치해제가 없는 한 그대로다
  3. `HAND_SIZE_STRICT` — `turn.act`에서 차례인 사람 14장, 나머지 13장
     (멜드는 3장 환산, `true_dragon` 보유자는 16/17)
  4. `TILE_TOTAL` — 모든 존의 tileId 합은 언제나 136장
  5. `AUG_DUP`/`AUG_LOST`/`AUGDATA_EXPLOSION` — 증강 보유 목록 변형·상태 키 폭주
- `analyze2.ts` — 결과 집계. 드리프트는 **근거 금액의 부분합**으로 다시 판정한다(확정 1).
- `probe_settle.ts` — 의심 국을 그대로 재현해 `RoundSettled.deltas`·`augPoints`·
  `ScoreChanged`를 전부 찍어 점수의 출처를 특정한다.

실행 예: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/pairs/run3.ts 0 3 hanchan 9000`

---

## 확정 1. 🟠 (도구) `harness.ts`의 점수 드리프트 판정이 오탐을 낸다 — 근거를 **한 건만** 맞춰 본다

- 위치: [qa-lab/harness.ts](../harness.ts) — `runMatch` 끝의 드리프트 대조 루프
  ```ts
  for (const d of seen.drifts) {
    let hit = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      if (pool[i]!.amount === d.delta) { hit = i; break; }   // ← 1:1 금액 일치만 본다
    }
    ...SCORE_DRIFT_UNEXPLAINED...
  }
  ```
- 기대: "뱅크 발행은 `augPoints`·`ScoreChanged.reason`으로 근거가 남으므로, 근거가 없는
  총합 변동만 위반으로 잡는다."
- 실제: 판정이 **근거 하나와 금액이 정확히 같을 때만** 설명된 것으로 친다. 한 번의 뷰
  브로드캐스트 사이에 뱅크 발행이 **둘 이상** 겹치면(정산 한 번에 여러 증강이 개입하거나,
  같은 증강을 두 사람이 들고 있으면 흔하다) 합계는 부분합이므로 매칭에 실패해
  `SCORE_DRIFT_UNEXPLAINED`가 뜬다.
- 관측: 7,004국에서 나온 드리프트 신호 **16건 전부**가 이 오탐이었다. 예:
  - `deltas` 웨이브 `parasite×devils_advance` seed=9829 — `+20000`,
    근거는 `ScoreChanged(devils_advance 10000)` **두 건**(두 사람이 같은 증강 보유)
  - `usesCtl` 웨이브 `grave_rob×reload` seed=5437 — `+5000` = `jackpot 3000` + `sign_flip 2000`
  - wave1 `regret×frame_up` seed=2242 — `+11900` = `foresight 5900` + `haitei_lord 6000`
- 재현/판정: `tsx qa-lab/pairs/analyze2.ts` — 같은 데이터를 **부분합**으로 다시 판정하면
  16건 중 14건이 `DRIFT_FP(부분합 일치)`로 떨어진다. 남은 2건도 `probe_settle.ts`로 뜯어 보면
  둘 다 **설계된 뱅크 발행**이었다 —
  `hand_swap3×all_or_nothing` seed=2293 `-14500` = `devils_advance` 9,000 + `all_or_nothing` 5,500,
  `always_tenpai×sign_flip` seed=11007 `-22000` = 두 사람의 `sign_flip` 11,000씩(부수 확인 1·2).
  즉 **설명되지 않는 점수 창조·소멸은 0건**이다.
- 영향: 게임 자체에는 영향이 없다. 다만 **다른 QA 보고서가 이 신호를 근거로 쓴 항목은
  다시 봐야 한다** — 오탐률이 이번 표본에서 100%였다. 고치려면 위 루프를 부분합
  (또는 "그 국의 근거 총합"과의 대조)으로 바꾸면 된다.

---

## 부수 확인 (짝 감사 중 소스로 결론 낸 것 — 새 버그 아님)

1. **`devils_advance`의 9,000점 소멸은 설계다** — `score-b.md` 의심 2 해소.
   [devils_advance.ts:114](../../packages/content/src/augments/devils_advance.ts#L114) 가
   `withAugPoint(p, ctx, 0)`으로 **일부러 0점을 기록**한다. 헤더 주석이 근거다:
   "걷은 9,000점은 보유자에게 가지 않는다 … 그대로 뱅크로 들어간다(2026-08-15 사용자 지시)".
   그래서 테이블 합계는 3,000×3 만큼 줄고, 정산 메모에는 0이 남는다 — 하네스가
   드리프트를 설명하지 못하는 것도 이 때문이다(확정 1과 같은 뿌리).
   재현: `tsx qa-lab/pairs/probe_settle.ts hand_swap3 all_or_nothing 2293 tonpuu 1`
2. **`sign_flip`이 테이블 합계를 깨는 것도 설계다.** `always_tenpai×sign_flip` seed=11007에서
   한 국에 **-22,000**이 사라진다(두 사람이 각각 ±5,500을 뒤집어 11,000씩). 헤더 주석에
   "그 국만 테이블 합계가 맞지 않는다(사용자 확정)"라고 못 박혀 있고, `augPoints`에도
   `sign_flip -11000`이 사람별로 남는다. 재현:
   `tsx qa-lab/pairs/probe_settle.ts always_tenpai sign_flip 11007 hanchan 0 dual`
3. **`conflicts` 선언 30건이 비대칭이지만 드래프트는 대칭으로 막는다.**
   `tsx qa-lab/pairs/conflicts_audit.ts` — 예: `avenger→late_bloomer`는 있는데 역방향이 없다.
   그런데 [DraftController.ts:192-196](../../packages/core/src/augment/DraftController.ts#L192)이
   양방향을 모두 본다(`H.conflicts ∋ def` 또는 `def.conflicts ∩ 보유`). 그래서 뽑기 경로에서는
   순서에 상관없이 막힌다 — **선언만 지저분하고 동작은 정상**이다.
   (사전 지급 `presetAugments` 경로가 이 게이트를 통과하지 않는 것은 이미 `hand-b.md`
   확정 4에 있다 — 중복 보고하지 않는다.)

---

## 확정하지 못한 신호 (전부 원인까지 추적해 기각)

QA 신호를 그냥 지우지 않고 왜 기각했는지 남긴다.

- `RIICHI_HAND_MUTATED` 13건 → **하네스 관측 경계 문제**였다. `round.over` 단계에서
  `state.round`의 국 키(`prevalentWind-roundNumber-honba`)가 **다음 국 값으로 먼저 바뀌고**
  그 뒤에 `onRoundStart`가 온다(`tsx qa-lab/pairs/probe_rounds.ts` 로 확인:
  `key 1-4-3 -> 2-1-4 (idx #4) phase=round.over` 다음 줄이 `ROUNDSTART #5`).
  그래서 국 키로만 스냅샷을 묶으면 **지난 국의 손패와 새 국의 배패**를 비교하게 된다.
  리치가 풀린 순간 스냅샷을 버리도록 고친 뒤로는 이후 5,000여 국에서 0건이다.
  → 국 경계를 관측하는 다른 검사도 같은 함정을 조심해야 한다.
- `USES_OVER_CAP` 2건 → `seat_swap:uses:pN = 3`. 자리 바꿈만 설계상 `matchUses+1`이다
  ([seat_swap.ts:73](../../packages/content/src/augments/seat_swap.ts#L73)). 예외 처리 후 0건.
- `SCORE_DRIFT_UNEXPLAINED` 16건 → 확정 1.
- `HAND_SIZE_STRICT` 6건(전부 같은 게임 `xray_hand×time_stop` seed=20220 mix=1의 연속 상태) →
  **무장해제된 `true_dragon`**이었다. p3의 `disarm`이 p1의 진짜 용을 잠그자
  ([true_dragon.ts:12](../../packages/content/src/augments/true_dragon.ts#L12) `EXTRA_TILES=3`)
  손패가 16/17 → 13/14로 정확히 되돌아갔고, 내 검사가 "이 사람은 진짜 용 보유자니까 16/17"이라고
  기대해 어긋난 것이다. 재현: `tsx qa-lab/pairs/probe_td3.ts` —
  `engine:disarmed#round=["aug:p1:true_dragon"]`이 함께 찍힌다.
  → 뒤집어 말하면 이건 **양성 대조**다. 예전에 하드락을 냈던
  `disarm × true_dragon`(손패 17장이 남아 국이 죽던 조합)이 지금은 장수·패 총량 모두 정확히
  복구된다는 것을 7,004국 중 이 한 게임이 실측으로 보여 준다.

## 걸어 두고 **안 걸린** 것 (음성 결과 — 다음 사람이 같은 곳을 다시 파지 않도록)

같은 사람이 두 개를 동시에 들고(대부분 웨이브에서는 같은 짝을 두 사람이 마주 들게 해서) 돌린 7,004국에서
아래 조합군은 전부 무사했다.

| 조합군 | 게임/국 | 결과 |
| --- | --- | --- |
| 사용 횟수형 × `reload`/`disarm` (81쌍 전수) | 81 / 694 | 이상 없음 |
| 정산 개입 × 정산 개입 (99쌍 전수) | 99 / 784 | 드리프트 신호 9건 전부 오탐 |
| 물리 이동 × 화료 판정 (120쌍) | 120 / 1,022 | 드리프트 신호 1건, 오탐 |
| 제약 × 버림·선언 경로 변경 + 강 되감기끼리 (229쌍 전수) | 229 / 1,940 | 이상 없음 (신호 0건) |
| 상태 키 × 상태 키 (160쌍 표본) | 160 / 1,352 | 드리프트 신호 4건 전부 오탐/설계 |
| 무작위 교차 카테고리 (270쌍 표본, 동풍전) | 270 / 1,212 | 드리프트 신호 2건 전부 오탐 |

특히 노렸다가 **안 나온** 가설들:

- `discard_lock`(봉인) × `no_retreat`/`free_riichi_discard`/`push_riichi` — 버릴 패가
  전부 잠긴 리치 선언 → 빈 선택지 소프트락. 엔진이 막아 준다(봉인술사 헤더 주석대로).
- `disarm` × 물리 상태를 만든 증강 — 잠기는 순간 손패 장수가 어긋나 하드락.
  `AUGMENT_DISARMED` 복구 훅이 있는 `true_dragon`·`picky_eater` 포함해 이상 없음.
  (`DISARMED_SOURCES_KEY`가 국 스코프라 잠금이 다음 국으로 새지도 않는다.)
- `meld_dissolve`(파혼) × `north_trader`(북빼기) — 북빼기의 北은 melds **Zone**에는 있지만
  `byPlayer.melds` 항목이 아니고, 파혼은 후자만 본다. 그래서 北을 해체 대상으로 잡지 않는다.
- `score.extraHan`을 함께 얹는 6종(`ankan_dora`·`cliff_bloom`·`no_retreat`·`north_trader`·
  `riichi_upgrade`·`true_dragon`) — 전부 `cur + N` 꼴이라 서로를 덮어쓰지 않는다.
  `riichi.blocked`·`win.ronImmune`도 단조(true로만 밀어 올림)라 순서에 안 흔들린다.
- 정산 단계표([settleStages.ts:78](../../packages/core/src/augment/settleStages.ts#L78))가
  `Multiply(200) → BankTopUp(300) → Transfer(400)` 순서라, 배수 증강이 뒤에 오는
  정액 뱅크 금액을 곱하는 일은 구조적으로 일어나지 않는다.
