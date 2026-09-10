# 점수·정산 (scoring 11종) — "점수 계산기"

담당: counter · hidden_blade · let_it_ride · jackpot · big_hand · nagashi_yakuman ·
blood_contract · aotenjou_ceiling · devils_advance · eternal_dealer · spy

## 요약

- 돌린 판: 실경기 소크(`qa-lab/score-a/soak.ts`) 다중 샤드 — **완료 60매치 457국**
  (`seed 2000/3000/4000` 각 20매치: 151·154·152국, crash 0 · effectError 0) +
  진행 중 샤드 2개(추가 500국 이상) + 표적 리그(`settleRig.ts`) 검증.
  증강 커버리지 11/11 — 모든 좌석에 담당 11종만 강제 지급했다.
- 확정 **5건** · 의심 **2건**.
- 검산 방법: 하네스의 상태 불변식 위에 **정산 단위 검산**을 얹었다 —
  (a) 델타·소지점 100점 격자, (b) `payload.riichiPot` 계약, (c) 회수 공탁 이중 지급,
  (d) 본장 증분, (e) 마이너스 점수, (f) augPoints 표시값, (g) 정산 단위 뱅크 발행
  (`sum(deltas) − (공탁 전 − 공탁 후)`이 0이 아닌데 근거 메모가 하나도 없는 경우),
  (h) spy 잔여 델타, (i) 유국역만 성립/미성립, (j) 만년 오야 연장 한도.

---

## 확정 1. 🟠 jackpot — **회수한 리치봉(공탁)까지 배수에 태운다** (공탁 제외 코드가 죽어 있다)

- 위치: `packages/content/src/augments/jackpot.ts:242`
  ```ts
  const pot = (p.winInfos ?? [])[0]?.winner === holder ? p.riichiPot : 0;
  ```
- 기대(detail): "**회수하는 리치봉(공탁)은 배수에서 빠지고**, 본장 보너스는 … 함께 곱해진다."
- 실제: 화료 정산 payload의 `riichiPot`은 **다음 국으로 넘길 값이라 언제나 0**이다
  (`packages/core/src/mahjong/flow/standardActions.ts:1113` — `riichiPot: 0`).
  회수액은 `winInfos[0].riichiPotGain`에만 실린다
  (`standardActions.ts:1087-1094`). 따라서 `pot`은 **항상 0**이고 공탁이 그대로 곱해진다.
- 재현: `tsx qa-lab/score-a/repro_pot_multiplied.ts`
  ```
  jackpot 2배 · 손 8000 · 공탁 3000
    기대 p0 = 19000   실제 p0 = 22000   차이 = 3000
    뱅크 발행 = 11000 (기대 8000)
  jackpot 3배 · 손 8000 · 공탁 3000
    기대 p0 = 27000   실제 p0 = 33000   차이 = 6000
  jackpot 0.5배 · 손 8000 · 공탁 3000
    기대 p0 = 7000 (공탁 3000은 그대로)  실제 p0 = 5500
    방총자 p2: 기대 -4000  실제 -2500   ← 공탁까지 깎아 그 몫을 방총자에게 돌려줬다
  ```
- 영향: 점수가 틀린다. 리치봉이 쌓인 국일수록 뱅크 발행이 커진다(공탁 3000·3배면 +6000 과다).
  0.5배일 때는 반대로 **화료자가 회수해야 할 공탁의 절반이 방총자에게 흘러간다** —
  "지불자는 표준보다 더 내지 않는다"를 넘어 **덜** 내게 되고, 남이 낸 리치봉이 방총자에게 간다.
- 참고: 회귀 테스트 `packages/content/test/jackpot_conservation.test.ts`는
  픽스처가 `riichiPot: pot`(엔진과 다른 모양)이라 이 결함을 통과시킨다 —
  테스트가 있는데도 살아 있는 이유다.

## 확정 2. 🟠 blood_contract — 같은 원인으로 **공탁**이 1.5배가 되고, **쯔모 본장**도 1.5배가 된다

- 위치: `packages/content/src/augments/blood_contract.ts:141`(공탁) / `:135-139`(본장)
- 기대(detail): "배수가 걸리는 것은 **손의 화료점뿐**이다 — 회수하는 리치봉과 본장 수령분은
  그대로 더해진다."
- 실제:
  - 공탁: 확정 1과 같은 이유(`p.riichiPot`이 화료 정산에서 항상 0)로 제외가 무효다.
  - 본장: `info.winType === "ron"` 일 때만 본장을 떼어 낸다. 쯔모 화료도 본장을 받는데
    (`standardActions.ts:989-1007`, 각 300/3씩) 그 몫이 배수에 포함된다.
- 재현:
  - `tsx qa-lab/score-a/repro_pot_multiplied.ts`
    → `blood_contract 1.5배 · 손 8000 · 공탁 3000 : 기대 15000, 실제 16500 (차 1500)`
  - `tsx qa-lab/score-a/repro_honba_and_draw.ts`
    ```
    ① blood_contract 쯔모 3본장: 기대 p0 = 12900, 실제 = 13400   (본장 900 → 1350)
       대조군(론 3본장):        기대 12900, 실제 12900          ← 론만 제대로 뺀다
    ```
- 영향: 점수가 틀린다(설명과 다른 금액). 늘어난 몫은 전부 뱅크 발행이다.

## 확정 3. 🟡 jackpot — **유국(황패)의 노텐 벌부에도 배수가 걸린다.** 0.5배면 노텐이 벌부를 덜 낸다

- 위치: `packages/content/src/augments/jackpot.ts:230-238` — 인터셉터에
  `if (p.outcome !== "win") return event;` 가드가 없다.
  (같은 Multiply 단계의 `blood_contract.ts:117`·`let_it_ride.ts:124`는 둘 다 화료만 가드한다.)
- 기대: 노텐 벌부는 규칙이 정한 정액이다. 남의 룰렛 결과로 **내가 무는 벌부가 달라져서는 안 된다.**
- 실제: 보유자가 텐파이라 벌부를 받는 국에서 그 수령액에 배수가 곱해진다.
  0.5배면 보유자의 수령이 깎이고, 깎인 몫이 **노텐 지불자들에게 환급**된다.
- 재현: `tsx qa-lab/score-a/repro_honba_and_draw.ts`
  ```
  ② 유국(p0만 텐파이, 노텐벌부 3000) · jackpot 3배   → p0=9000  p1..p3=-1000  | 뱅크 발행 6000
  ② 유국(p0만 텐파이, 노텐벌부 3000) · jackpot 0.5배 → p0=1500  p1..p3=-500   | ← 노텐이 절반만 낸다
  ```
- 영향: 점수가 틀린다 + 규칙 파괴(노텐 벌부 정액이 흔들린다). 3배는 뱅크에서 +6000을 공짜로 뽑는다.

## 확정 4. 🟡 eternal_dealer — 더블론에 **진짜 오야가 함께 화료하면** 오야 자리는 가져가면서 연장 횟수를 쓰지 않는다 (게임 3회 한도 우회)

- 위치: `packages/content/src/augments/eternal_dealer.ts:171-176`
  ```ts
  // 더블론 등으로 진짜 오야도 함께 화료했다면 그것도 원래 연장이다
  if (infos.some((w) => playerOf(ic.state, w.winner).seat === dealerSeat)) return event;
  ```
  와 `packages/core/src/mahjong/flow/standardActions.ts:876-895, 1096-1100`
- 기대(detail): "③은 게임 내 3회까지만 발동" · "내가 진짜 오야인 국에 화료한 것은 원래 규칙대로의
  연장이므로 횟수를 쓰지 않는다".
- 실제: 보유자가 **자(子)** 로서 더블론의 한쪽이면 `keepDealerSeat = 보유자 자리`가 박히고,
  뒤이어 진짜 오야가 화료해도 그 값은 덮이지 않는다 → 다음 국 오야는 **보유자 자리**로 옮겨 온다.
  그런데 위 가드가 "오야도 같이 올랐다"를 보고 빠져나가 **`extendedBy` 표식이 남지 않고
  `eternal_dealer:keeps` 카운터가 오르지 않는다.** 능력을 쓰고도 횟수를 안 쓴다.
  (보유자가 진짜 오야였던 국이 아니다 — 그 예외 문구는 이 경우를 가리키지 않는다.)
- 재현: `tsx qa-lab/score-a/repro_eternal_dealer_doubleron.ts`
  ```
  단독 화료(보유자만)            다음 국 오야 자리=2(보유자)  extendedBy=["p2"] → 횟수 소모
  더블론(보유자 + 진짜 오야)     다음 국 오야 자리=2(보유자)  extendedBy=[]     → ★ 횟수 미소모
  ```
  (스크립트는 `sysSettleWin`의 좌석 결정 로직을 같은 순서로 재현한 뒤, 그 payload를
   실제 정산 인터셉터 체인에 흘려 `extendedBy`가 붙지 않음을 보인다.)
- 영향: 설명과 다르다 + 무한 국 방지 안전장치가 뚫린다. 남은 횟수 pill 표시도 실제와 어긋난다.

## 확정 5. 🟡 aotenjou_ceiling × eternal_dealer — 쯔모 초과분만 "친 2배" 비율로 걷는다 (기본분은 균등인데)

- 위치: `packages/content/src/util.ts:747-757` (`addWinPointTransfer`의 쯔모 분담)
- 기대(aotenjou detail): "쯔모면 나머지 셋이 **평소 비율대로** 나눠 낸다."
- 실제: `sysSettleWin`은 `win.treatAsDealer`가 켜진 화료(만년 오야·찬탈자)에서 세 사람이
  **똑같이** `score.payments.others`를 낸다(`standardActions.ts:996-1004`). 그런데
  `addWinPointTransfer`는 보유자가 **진짜 오야 자리인지만** 보고 진짜 오야에게 weight 2를 준다 —
  오야 취급 여부를 보지 않는다. 같은 화료 안에서 기본분과 상한 해제분의 비율이 어긋난다.
  (`aotenjou_ceiling.ts`·`big_hand.ts`는 각자 `win.treatAsDealer` 예외를 갖고 있는데,
   공용 헬퍼의 **지불자 분담 계산**만 그 예외에서 빠져 있다.)
- 재현: `tsx qa-lab/score-a/repro_aotenjou_dealer_split.ts`
  ```
  표준 8판 30부 오야취급 쯔모: 총 24000 — 셋이 각 8000 (똑같이)
  정산 후 델타: {"p0":-11000,"p1":-9500,"p2":30000,"p3":-9500}  합계변화=0
  → ★ 진짜 오야 p0만 1500점 더 낸다 (초과분만 2배 비율)
  ```
- 영향: 총합은 보존되지만 **누가 얼마를 내는지가 설명과 다르다.** 같은 헬퍼를 쓰는
  다른 Transfer형 증강 전부에 같은 어긋남이 있다.

---

## 의심 1. let_it_ride × jackpot × blood_contract 동시 보유 시 배수가 **델타 전체에 연쇄로** 곱해진다

- 관측: `tsx qa-lab/score-a/combo.ts`
  `4판 40부 오야 론(표준 12000)` 한 손에서 `jackpot 3배 + 연승 4배 + 계약 적중`이면
  최종 수령 **147,400점**(뱅크 발행 136,000). jackpot·blood_contract는 **그 시점의 델타 전체**에
  배수를 걸고, let_it_ride는 원래 화료점에 (배수−1)을 더한다 — 세 배수가 서로를 다시 곱한다.
- 재현 실패 사유: `settleStages.ts`가 "같은 Multiply 단계라 서로 곱해진다"를 **명시**하고 있어
  설계 의도일 수 있다. 다만 세 증강의 detail 어디에도 "다른 배수와 곱해진다"는 말이 없고,
  세 개가 동시에 뽑힐 확률이 낮지 않은 프리즘 티어라 밸런스 확인이 필요하다. 버그로 확정하지 않는다.

## 의심 2. devils_advance 폭발분 9,000점이 테이블에서 **영구 소멸**한다

- 관측: `tsx qa-lab/score-a/combo.ts`
  `devils_advance 폭발 → {p0:8000, p1:-3000, p2:-11000, p3:-3000} 합계변화 -9000`,
  augPoints는 `points: 0` 한 줄뿐이라 **결과 화면에는 숫자가 뜨지 않는다**(0점 노트는 걸러진다).
- 소스 주석은 "걷은 돈은 뱅크로 간다(2026-08-15 사용자 지시)"라고 명시하므로 의도된 소멸이다.
  다만 ① 시작 시 +10,000은 `ScoreChanged`로 들어오는데 그 회수는 정산 델타로 나가고
  ② 상대 셋의 −3,000에 대한 **근거 줄이 화면에 없다**(보유자 노트만 0점으로 남는다) —
  "무슨 일이 일어났는지는 전원이 본다"는 주석과 어긋난다. 표시 결함으로 의심에 남긴다.

---

## 검산했으나 문제를 찾지 못한 것 (기록)

- 100점 격자(`DELTA_NOT_100`/`SCORE_NOT_100`): 457국 위반 0.
- 정산 단위 뱅크 발행에 근거 메모가 없는 경우(`SETTLE_BANK_UNEXPLAINED`): 0건.
- 회수 공탁 이중 지급(`Σ riichiPotGain > 정산 전 공탁`): 0건.
- 본장 증분(화료=연장이면 +1/아니면 0, 유국·도중유국은 +1): 위반 0건.
- spy 잔여 델타(지정 패 화료자의 델타가 남는가): 0건 — 더블론 양쪽 모두 정확히 회수한다
  (`combo.ts`의 더블론 검증에서도 합계 변화 0).
- 마이너스 점수 방치: 관측 8건 전부 토비 종국으로 이어졌다(속행 없음).
- 크래시·훅 예외: 0건.
- `aotenjou_ceiling`: 만관 미만 상한 해제(3판 70부·4판 40부)·역만 환산·오야 취급 연동 모두 기대대로.
- `nagashi_yakuman`: 도중유국(`outcome: "abort"`)에는 발동하지 않는다(올바름).
- `hidden_blade`: 리치 선언 이력으로 게이팅되어 "리치→취소→멘젠 론"에 붙지 않는다.
- `big_hand`: 하한이 배수·가산 뒤(`BankFloor`)에 걸려 0.5배·3배와 겹쳐도 만관이 무너지지 않는다.

## 스크립트

| 파일 | 용도 |
|---|---|
| `qa-lab/score-a/vendor.ts` | 공용 하네스의 고정 사본(동시 수정 방지) |
| `qa-lab/score-a/lib.ts` | 정산 payload를 관찰하는 러너(`onSettle`) |
| `qa-lab/score-a/soak.ts` | 실경기 소크 + 정산 단위 검산 12종 |
| `qa-lab/score-a/settleRig.ts` | **엔진과 같은 모양**의 ROUND_SETTLED를 인터셉터 체인에 흘리는 리그 |
| `qa-lab/score-a/repro_pot_multiplied.ts` | 확정 1·2 (공탁 배수) |
| `qa-lab/score-a/repro_honba_and_draw.ts` | 확정 2(쯔모 본장) · 확정 3(유국 벌부) |
| `qa-lab/score-a/repro_eternal_dealer_doubleron.ts` | 확정 4 |
| `qa-lab/score-a/repro_aotenjou_dealer_split.ts` | 확정 5 |
| `qa-lab/score-a/combo.ts` | 배수·상한·하한 동시 보유 스택 검산 |
| `qa-lab/score-a/live_pot_hunt.ts` | 실경기에서 공탁×배수 동시 발생 실측 |

---

## 하네스 쪽 참고 (버그 아님)

공용 하네스의 `SCORE_DRIFT_UNEXPLAINED`는 **가불 인생의 첫 국 +10,000에 대해 반드시 오탐한다.**
`ScoreChanged(devils_advance)` 이벤트는 `HanchanController.flushEvents`가 **국이 끝난 뒤**에야
`onEvent`로 흘려 보내는데(`HanchanController.ts:897`), 총합 드리프트는 그보다 훨씬 이른
국 시작 브로드캐스트에서 잡힌다 — 원장에 근거가 아직 안 실린 시점이다.
소크 60매치에서 이 한 종류가 57건 전부였다(`100000 -> 110000 (delta 10000) @1-1-0`).
드리프트 원장을 쓰는 다른 에이전트도 같은 오탐을 볼 것이다.
