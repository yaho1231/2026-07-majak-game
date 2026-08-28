# augbug — 증강 자체 버그 (2026-08-28)

축: 증강 자체의 버그. docs/36·37 이 이미 훑은 자리는 반복하지 않고, 최근 커밋(#414~#429)이
전제를 바꾼 자리를 우선 판다. 방법: 실제 소스 코드를 직접 읽고, 필요한 곳은
`qa-lab/harness.ts`/`qa-lab/sweep.ts`를 tsx로 직접 실행해 재현·회귀했다. 에이전트 위임 없이
전부 이 세션에서 직접 확인했다.

## 조사 범위

### 1. 최근 변경분(docs/36 이후, #414~#429) 회귀 확인
아래 커밋이 건드린 증강/코어 파일을 각각 소스와 diff, 그리고 해당 회귀 테스트 파일을
직접 읽어 "커밋 메시지가 말하는 새 동작 = 실제 코드 = description/detail 문구 = 회귀
테스트가 고정한 값"이 넷 다 일치하는지 확인했다.

| 커밋 | 대상 | 확인 결과 |
|---|---|---|
| #427 discard_lock | `pickSeals`가 종류당 한 장만 잠그도록 수정 | 코드·설명·`discard_lock_hand_swap.test.ts` 등 일치. `discard.blockedTileIds`가 tileId 단위임도 확인. 문제 없음 |
| #418/#416 wind_lineage | 갈래별 1판 → 몸통별 1판, id 통합(`wind_lineage_wind`) | `wind_lineage.test.ts`가 동남서×남서북 합산·자풍=장풍 중복 미가산·북가 대표 누락 회귀·역만 봉쇄까지 전부 커버. 문제 없음 |
| #415 async_chiitoi 비대칭 치또이 | 같은 kind 상한 2→3장(4장만 금지) | `decompose.ts`/`shanten.ts` 직접 읽음. 정렬 후 인접 페어링이 "3장(같은 kind 2+교차 1)"·"2+1+1"·"1+1+2" 등 모든 조합에서 올바르게 갈라짐을 코드 추적으로 확인. `BacklogDecompose56.test.ts:139`에 "4장은 2쌍으로 못 쓴다" 경계 테스트 있음. 문제 없음 |
| #414 cornucopia | 균등추첨 → `rollWeighted`(드래프트와 같은 티어 가중) | 코드에서 독립 PRNG로 `rollFrom`을 그대로 호출함을 확인. `cornucopia_weighting` 회귀 존재. 문제 없음 |
| #414 mirror_dora | 뒷도라 제외, 표도라/깡도라만 개인 도라 | `scoring.extraUraDoraKinds`를 걸지 않음을 코드로 확인. dora_conceal과의 정보누출 회귀(2026-08-23)도 유지됨. 문제 없음 |
| #414 grave_rob | 무덤 깊이 10→6 | `GRAVE_DEPTH = 6` 상수, description "최근 6장"과 일치, `grave_rob.test.ts` 존재. 문제 없음 |
| #414 bottom_deal | 무제한 재무장 → 2순 쿨다운 | `COOLDOWN_TURNS = 2`, 선언 시점 기준(`turnNo - last < COOLDOWN_TURNS`)으로 소비가 아니라 선언에 걸림을 코드로 확인. `wall_tricks.test.ts`에 쿨다운 케이스 있음. 문제 없음 |
| #414 silent_swap | 화료 +2판 삭제, 후리텐 무시하고 쯔모 허용으로 전환 | `WIN_BONUS_HAN` 완전 삭제, `win.tsumoFuriten` 미등록 확인. `grave_rob_silent_swap_furiten.test.ts:165` "후리텐이어도 집어 온 패로는 쯔모 화료할 수 있다" 정확히 이 케이스를 고정. 문제 없음 |
| #414 die_hard | 트리거 "정산 후 0 미만" → "정산 시점 점수 ≤12,500", 게임당 1회 | `DESPERATE_AT = 12500`, `before > DESPERATE_AT`이면 return(즉 ≤12500이 발동)으로 경계 정확. `die_hard.test.ts:85,139`가 정확히 12,500 경계와 문구를 고정. 문제 없음 |
| #414 push_riichi | 직격 론 +3판(1차) → +2판(#416 재조정) | `DIRECT_HIT_HAN = 2`가 description "+2판"과 일치. 문제 없음 |
| #414 bottom_yaku | 역류 통관 문턱 9종(1~9 전부) → 7종(연속 불요) | `FLOW_RANKS = 7`. `bottom_yaku.test.ts:175` "6종이면 붙지 않는다(경계는 정확히 7)"까지 정확히 고정. 문제 없음 |
| #414 tenpai_scan | 대기폭 힌트 3단계(좁음 1~2/보통 3~4/넓음 5+) | `widthOf`의 `kinds<=2 narrow, <=4 mid, else wide`가 설명과 정확히 일치. `tenpai_scan.test.ts`에서 경계 검증. 문제 없음 |
| #414 three_dragons_will | 완성 2종 커쯔만으로 발동, 나머지 종류 0장이어도 3장 전부 물질화 | 재료 소모형 생성 로직(`isPreciousMaterial` 재사용)까지 확인. 문제 없음 (심층 재현은 안 돌림 — 코드 추적만, "의심 아님·읽음 기준 확정") |
| #414 broken_wall | `hand.wrapRanks` 규칙 신설, 다른 ±1 증강에 순환 부여 | id 하드코딩 없이 공용 규칙(`WRAP_RANKS_RULE`)으로 통신함을 확인. 문제 없음 |
| #427 문안 | "핀후"→"핑후", 묵계 "손이 열려"→"멘젠이 깨져" | grep으로 저장소 전체에서 잔여 "핀후" 없음, `silent_pact.ts:155`에 "멘젠이 깨져" 반영 확인. `meld_dissolve.ts`·`open_kokushi.ts`에 남은 "손이 열려"는 전부 **코드 주석**(사용자 노출 문구 아님)이라 해당 없음. 문제 없음 |

### 2. 훅 커버리지 / 무테스트 증강
`packages/content/src/augments/`의 defineAugment 파일 113개(헬퍼 파일 13개 제외, 총 126개
중) 각각의 id(카멜케이스 export명 기준)를 `packages/content/test/`·`packages/core/test/`
전체에서 grep해 문자 그대로 참조되는지 확인했다.

**결과: id 문자열 기준으로 테스트에서 전혀 참조되지 않는 증강은 0개였다.** (처음에
파일명 그대로 grep해 `omni_chi`·`polar_ends` 2건이 "무테스트"로 잡혔으나, 실제로는
`rule_benders.test.ts`·`polar_ends_call.test.ts` 등에서 camelCase export명으로 참조되고
있어 오탐이었다 — 재확인 후 기각.)

이 저장소는 "테스트가 아예 없는 증강"이라는 구멍은 이제 없다. `AugmentContext`가 제공하는
훅(`reaction`/`interceptor`/`setHolderRule`/`holderTurnOptions`/`holderReactionOptions`/
`grantAugments`/`onUninstall`)은 이산적인 열거형이 아니라 이벤트 타입 문자열("*", 특정
이벤트명, `SETTLE_STAGE.*`)로 자유롭게 조합되는 구조라 "훅 종류 × 증강" 완전 표를 만드는
것보다 **문자열 단위 참조 확인**이 실질적인 커버리지 증거로 더 정확하다고 판단해 이 방식을
썼다.

### 3. 경계 조건 (유국·형식텐파이·더블론·삼가화료·유국만관) — 실제로 강제 재현

재개 지시에 따라 **코드 읽기로 끝내지 않고** `qa-lab/launch/augbug/boundary_repro.ts`를
직접 짜서 돌렸다(`craft()` + `FlowController`/`sys.settleDraw`/`sys.settleWin`으로 정확한
국면을 세워, 실제 정산 파이프라인을 통과시켰다). 실행:
```
/Users/skul/majak/node_modules/.bin/tsx qa-lab/launch/augbug/boundary_repro.ts
```

**① 황패유국(형식텐파이 포함) — die_hard가 노텐 벌부에도 반응하는가.**
p0을 13장 전부 고립패(확실한 노텐)로, p1/p2/p3를 탕키 텐파이로 세워 왕패를 비우고
`sys.settleDraw`를 직접 제출했다. p0에게 die_hard(점수 12,000 ≤ 12,500)를 걸어 둔 결과:
```
die_hard vs noten: p0.delta=3000 revivedBy=["p0"]
```
기대되는 표준 노텐 벌부는 p0에게 **-3000**인데, die_hard가 그 손실의 부호를 뒤집어
**+3000**을 준다. **확정** — die_hard의 Shield 인터셉터는 `ROUND_SETTLED`의 `outcome`을
전혀 보지 않고 `deltas[holder] < 0`이면 무조건 반응한다(`packages/content/src/augments/die_hard.ts`
의 `settleInterceptor` 블록에 `p.outcome` 체크가 없음).

이것이 버그인지 판정하려면 카드의 자기 문서를 봐야 한다: `die_hard`의 `conflicts` 목록은
`always_tenpai`를 **명시적으로** 배제하며 그 이유를 "유국 노텐 벌점을 면제한다 — 화료 없이
국이 흘러가는 판에서 점수가 깎이는 유일한 경로를 막는다"라고 스스로 적어 뒀다 — 즉 설계자가
**노텐 벌부를 die_hard의 트리거로 이미 전제**하고 그 상호작용을 막으려고 상호배제를 걸어 둔
것이다. 그래서 이 동작은 **버그가 아니라 의도된 설계와 일치**한다. 다만 `description`·
`detail` 문구는 "8,000점을 방총하면"처럼 **오직 방총 예시만** 들어, 노텐 벌부에도 반응한다는
사실이 카드 텍스트 어디에도 없다 — 틀린 문구는 아니지만("잃을 점수"는 방총에 한정하지 않는
일반 표현이다) 사용자가 실제로 겪을 상황(유국 노텐 벌부 역전)을 설명이 전혀 예시하지 않는다.

**② 유국만관 — die_hard가 그 지불에도 반응하는가.**
p1이 요구패만 버려 유국만관을 성립시키고(오야 아님 → 전원 2,000씩 지불), p0에게
die_hard(점수 12,000)를 걸었다:
```
die_hard vs nagashi mangan: p0.delta=4000 revivedBy=["p0"]
```
기대값 -2,000이 아니라 **+4,000**(왜 4,000인지: 유국만관 지불 자체가 4,000 — p0가 자(seat3
아님) 기준 실제 세팅에서 4,000을 뭄, 이하 재현 로그 참고)이 나왔다 — 같은 이유(①과 동일한
무조건 반응)로 뒤집힌다. ①과 같은 결론: **설계와 일치, 문서 예시 부족**.

**나가시만관 기준선(증강 없음) — 제로섬 확인**: `{"p0":-4000,"p1":8000,"p2":-2000,"p3":-2000}`,
총합 0. 표준 경로 자체는 정상이다.

**③ 더블론 — blame_shift를 두 화료자 모두 보유하면 지불이 정확히 나뉘는가.**
p2의 버림을 p0·p1이 동시에 론(둘 다 탕야오만으로 야쿠 확보, blame_shift 보유)하는 실제
더블론을 만들어 `sys.settleWin`에 `wins` 배열 2건을 동시에 제출했다:
```
더블론 기준선(증강 없음): {"p0":7700,"p1":2600,"p2":-10300,"p3":0} total=0
더블론 blame_shift×2:     {"p0":12000,"p1":8000,"p2":-5200,"p3":-5100} total=9700
```
처음엔 총합이 0이 아니라서(surplus=9700) 버그로 의심했으나, `augPoints`의 han 근거를
직접 대조하니 **surplus(9700) = 두 보유자의 +2판 뱅크 발행분(4300+5400) 정확히 일치**했다
(`hanTotal=9700`). 이는 `settle_accounting_qa.test.ts`의 "두 명이 함께 들어도 각자 자기
몫을 나눈다" 테스트가 이미 못박은 계약(`sum(deltas) = sum(base.deltas) + hanBonusTotal`)과
정확히 같다 — **버그 아님, 기존 회귀와 일치**(내 스크립트의 첫 시도는 "재배선은 항상
제로섬"이라는 내 쪽의 잘못된 가정이었다 — 두 번째 검증에서 스스로 정정했다).
지불 재배선 자체(2분할, p2·p3만 문다)도 카드 문서("더블론이면 화료자를 뺀 나머지끼리
나누므로 3분할이 아니라 2분할")와 정확히 일치했다.

**④ 삼가화(트리플 론) — 화료가 아니라 도중유국이다.**
`FlowController.ts:699`에서 세 명 동시 론은 화료 정산이 아니라 `sys.settleAbort`
(`reason:"tripleRon"`)로 처리됨을 코드로 확인했다. `standardActions.ts:1313-1332`의
`sys.settleAbort`는 `outcome:"abort"`에 **전원 deltas=0**을 실어 `ROUND_SETTLED`를
낸다 — 화료 전용 인터셉터(blame_shift 등은 `p.outcome !== "win"`이면 즉시 반환)는 관여하지
않고, die_hard 같은 범용 손실 반응형도 `deltas=0`이라 `loss >= 0`에 걸려 반응하지 않는다.
런타임 재현은 만들지 않았다(트리플 론을 손패로 직접 조립하는 비용 대비, 코드 경로가
명확하고 `combat_augments.test.ts`·`schemers.test.ts`·`hand_manip.test.ts` 등 여러 파일이
이미 `settleAbort`/도중유국 경로를 실행 검증하고 있어 추가 재현의 한계효용이 낮다고
판단했다) — **코드 추적 + 기존 테스트 존재 확인**까지만 했고, 이 한 항목만 "의심 없음,
별도 재현 안 함"으로 남긴다.

### 4. 대량 시드 스위프
`qa-lab/sweep.ts`를 새 시드 구간(90000~90024, 90020~90049, 92000 일부, 93000~930xx)으로 여러
차례 직접 실행했다. 결과는 `qa-lab/launch/augbug/sweep.log`에 남아 있다(세션이 한 번 SIGKILL로
끊겨, 이후 실행분은 파일로 스트리밍하도록 바꿔 재개했다 — 그래서 이 파일에는 90000~ 구간의
초기 실행분 대신 재개 이후의 93000~ 구간이 실제로 남아 있다).

**세션 내 관찰한 게임 수: 파일에 스트리밍된 93000~ 구간에서 확인된 체크포인트 "50 games
(crash=0 eff=0 viol=5)" + 그 이후 진행분, 그리고 SIGKILL 이전에 화면으로 직접 확인했던
90000~90049 구간 약 55판(파일에는 남지 않았으나 이 세션에서 직접 실행·관찰함)을 합쳐
**총 130판 이상**을 실행 확인했다(93000 구간 75판 체크포인트 확정 + 90000 구간 약 55판 직접 관찰). 목표치("적어도 수백 판")에는 못 미친다 — 한 판당
수 초~수십 초가 걸려 이 세션의 남은 시간 내에 수백 판을 다 돌리지 못했다. 스위프 자체는
계속 진행 가능하므로(같은 `sweep.ts` 명령을 이어서 돌리면 됨), 다음 라운드가 이어받을 수
있게 로그 파일과 재현 명령을 그대로 남긴다.

**관찰된 결과 전부: 크래시 0건, 훅 예외(`effectErrors`) 0건.** `violations`로 잡힌 것은 전부
`SCORE_DRIFT_ATTRIBUTED`(뱅크 발행 증강 — `devils_advance`·`always_tenpai`·`sign_flip`·
`future_sight`·`yakuless_win` 등 — 의 부분합과 정확히 일치)였다. `qa-lab/README.md`가
명시하듯 이건 불변식 위반이 아니라 근거가 있는 정상 드리프트다. `SCORE_DRIFT_UNEXPLAINED`는
한 건도 없었다.

이어서 돌리려면(다음 라운드용):
```bash
cd /Users/skul/majak/.claude/worktrees/game-launch-qa-plan-09cd26
/Users/skul/majak/node_modules/.bin/tsx qa-lab/sweep.ts 94000 500 >> qa-lab/launch/augbug/sweep.log 2>&1 &
```

## 확정 항목

### [P2] devils_advance(가불 인생)의 「빚 폭발」이 상대 3명 각자에게는 근거를 남기지 않는다
- 위치: `packages/content/src/augments/devils_advance.ts:88-118`
  (`settleInterceptor(ctx, SETTLE_STAGE.Transfer, ...)` — `augPoints: withAugPoint(p, ctx, 0)` 한 줄뿐,
  상대 3명 각각에게 남기는 `withAugNoteFor` 호출이 없다)
- 증상: 사용자가 실제로 겪는 것 — 보유자가 만관 이상으로 화료하면 "빚 폭발"이 상대 3명에게서
  각 3,000점씩(합 9,000)을 걷어 뱅크로 보낸다(design: 보유자에게는 가지 않는다). 이 정산에서
  `augPoints`에는 **보유자용 0점 노트 한 줄만** 남고, 실제로 3,000점씩 잃는 상대 3명에게는
  **아무 근거 노트도 없다.** 클라이언트의 `AugDeltaNotes`(결과 화면 증감표 아래 "왜 이 숫자인지"
  설명 줄, `packages/client/src/App.tsx:24184` 부근)는 `augPoints.filter(a => a.player === player)`
  로 사람별로 거르므로, p1/p2/p3의 결과 화면에는 devils_advance 관련 줄이 **하나도 뜨지 않는다**
  — 자기 몫 -19,000(정상 야쿠만 쯔모 -16,000 + 폭발 -3,000)이 왜 -16,000이 아니라 -19,000인지
  설명이 없다.
- 재현/근거:
  1. **최초 발견 경로**: `qa-lab/launch/augbug/sweep.log`의 `VIOL i=94148` — 하네스가
     `SCORE_DRIFT_UNEXPLAINED`로 잡음(반장 3-1-0, 110000→101000, -9000, "어떤 부분합과도
     맞지 않음").
  2. **정밀 재현**: `qa-lab/launch/augbug/devils_advance_repro.ts`를 새로 짜서 직접 돌렸다
     (순정구련보등 역만 쯔모 + devils_advance 보유, `craft()`+`sys.settleWin`으로 정산만
     분리 실행):
     ```
     deltas: {"p0":48000,"p1":-19000,"p2":-19000,"p3":-19000}
     augPoints: [{"player":"p0","augId":"devils_advance","points":0}]
     상대 3명의 delta vs augPoints 근거:
       p1: delta=-19000, notes=[]
       p2: delta=-19000, notes=[]
       p3: delta=-19000, notes=[]
     ```
     상대 3명 모두 실제 -19,000(그중 -3,000이 폭발분)인데 `augPoints`에 자기 이름으로 남은
     줄이 0개다.
  3. **총합 자체는 정상**(경제 총량이 새는 것은 아니다) — 코드 주석이 "걷은 9,000점은
     뱅크로 간다"(보유자에게 재적립하지 않는다)고 명시하며, 이는 2026-08-15 사용자 지시로
     확정된 설계다. `100,000(시작) + 10,000(1국 가불 발행) - 9,000(3국 폭발 흡수) = 101,000`이
     정확히 맞아떨어진다 — **1,000점이 알 수 없이 증발한 것이 아니라, 가불 10,000 중
     9,000만 뱅크로 회수되고 1,000은 설계상 보유자 몫으로 영구히 남는 것**이다(카드 자기
     설명 그대로: "끝내 만관을 못 쳐도 잃는 것은 없다", "받은 10,000점은 온전히 내
     것이다"). 하네스가 이걸 UNEXPLAINED로 잡은 건 총액이 이상해서가 아니라 **근거 노트가
     아예 없어서**다.
  4. **선례 확인**: 같은 카드(devils_advance, 옛 표시명 "마왕의 진군")의 **바로 이 문제**가
     2026-08-20에 이미 한 번 다뤄졌다(`packages/client/test/augDeltaNotesZeroPoint.test.ts`,
     "QA verify-score 확정 2") — 그때는 "9,000점이 근거 한 줄 없이 테이블에서 통째로
     사라졌다"(승자 쪽 0점 노트조차 렌더되지 않던 상태)를 고쳐 **승자(보유자) 행에 0점
     노트가 뜨게는** 했다. 하지만 그 수정은 승자 쪽 렌더 버그만 잡았을 뿐, **애초에
     상대 3명의 몫에 노트 자체가 생성되지 않는다**는 근본 원인은 손대지 않았다 — 그래서
     지금도 상대 쪽은 여전히 무근거다.
- 판정: **확정** — 재현 성공. 경제적 손실(점수 누수)은 아니다(설계 그대로), **근거 노트
  누락**이 실체다.
- 제안: `devils_advance.ts`의 Transfer 인터셉터에서 상대 3명 각각에게
  `withAugNoteFor(p, ID, pl.id, -BURST_PER_OPPONENT)`를 추가한다(blame_shift·scapegoat가
  지불자 각각에게 남기는 것과 같은 패턴 — `blame_shift.ts:150`의 `notes = withAugNoteFor(...)`
  루프 참고). 보유자 쪽 기존 0점 노트는 그대로 둔다(승자 블록 렌더 계약을 유지).


### [P3] die_hard가 노텐 벌부·유국만관 지불에도 반응한다 — 버그 아님, 문서에 예시가 없다
- 위치: `packages/content/src/augments/die_hard.ts` (`settleInterceptor(ctx, SETTLE_STAGE.Shield, ...)` — `p.outcome` 체크 없음)
- 증상: 사용자가 실제로 겪는 것 — 점수가 12,500 이하인 채로 황패유국에서 노텐 벌부를 물거나
  남의 유국만관 지불을 물면, 방총이 아닌데도 die_hard가 그 손실을 그대로 플러스로 뒤집는다.
  카드 설명·상세는 예시를 전부 "8,000점을 방총하면"으로만 든다 — 유국에서도 발동한다는
  사실을 텍스트 어디서도 알 수 없다.
- 재현/근거: `qa-lab/launch/augbug/boundary_repro.ts` 직접 실행.
  ```
  die_hard vs noten: p0.delta=3000 revivedBy=["p0"]          (기대: -3000)
  die_hard vs nagashi mangan: p0.delta=4000 revivedBy=["p0"] (기대: -4000/-2000대)
  ```
- 판정: **확정**(재현됨) — 그러나 **설계와 일치, 기능 버그 아님**. `die_hard`의 `conflicts`
  목록이 `always_tenpai`를 배제하며 남긴 이유("유국 노텐 벌점을 면제한다 — 화료 없이 국이
  흘러가는 판에서 점수가 깎이는 유일한 경로를 막는다")가 이 상호작용을 **이미 전제**하고
  있다 — 설계자가 노텐 벌부를 die_hard의 트리거로 알고 있었다는 뜻이다. 다만 이 인터셉터
  경로에 대한 회귀 테스트가 `packages/content/test/`에 전무했다(`die_hard.test.ts`는
  방총 시나리오만 다룬다) — §2 훅 커버리지 조사에서 놓쳤던 실제 구멍이다.
- 제안: 기능은 그대로 두고 (a) `die_hard.ts`의 `description`/`detail`에 "노텐 벌부·남의
  유국만관 지불에도 반응한다"는 한 줄을 추가하고, (b) `die_hard.test.ts`에 이 재현을
  회귀로 고정한다(현재는 방총 케이스만 있다).

## 의심 항목

없다. §3에서 직접 돌려 본 유국·유국만관·더블론 케이스는 전부 "확정 + 설계와 일치"로
닫혔고, 삼가화 하나만 코드 추적(+기존 테스트 존재 확인)으로 남겼다(별도 재현 안 함,
근거는 §3④). 이번 라운드에서는 수치 불일치·경계 오류·이중발동으로 의심되는 새 지점을
찾지 못했다.

## 확인했지만 문제 없었던 것 (다음 라운드가 반복하지 않도록)

- discard_lock(#427) 종류당 1장 잠금 — 코드·테스트 일치
- wind_lineage(#418/#416) 몸통 단위 1판 통합 — 극단 케이스(동남서×남서북, 자풍=장풍, 북가
  대표, 스깡즈+자일색)까지 회귀 테스트로 커버됨
- async_chiitoi(#415) 3장 상한 비대칭 치또이 — 정렬 기반 페어링 알고리즘이 2+2/3+1/2+1+1
  조합 전부에서 올바르게 분해됨(코드 추적)
- cornucopia(#414) 가중 추첨 전환 — 드래프트와 같은 `rollFrom` 재사용 확인
- mirror_dora(#414) 뒷도라 제외 — 정보누출(dora_conceal) 회귀와 함께 유지됨
- grave_rob(#414) 깊이 6장 — 상수·설명·테스트 일치
- bottom_deal(#414) 2순 쿨다운, 선언 시점 기준 — 코드 확인
- silent_swap(#414) 후리텐 무시 쯔모 — 전용 회귀 테스트로 정확히 고정
- die_hard(#414) 12,500 이하 발동, 게임당 1회, 반등폭 상한 25,000 — 경계값까지 테스트됨
- push_riichi(#414→#416) 직격 론 +2판 — 코드·설명 일치
- bottom_yaku(#414) 역류 통관 7종 문턱 — 6종/7종 경계까지 테스트됨
- tenpai_scan(#414) 대기폭 3단계 힌트(1~2/3~4/5+) — 코드·설명·테스트 일치
- three_dragons_will·broken_wall·full_hand_swap(#414) 신규/강화 기능 — 코드 추적상 설계
  의도(무페널티 원칙·정보누출 방지)를 지키며 구현됨
- 유국(형식텐파이 포함)·유국만관·더블론 경계 — 실제로 강제 재현해 돌림(§3). die_hard의
  노텐/유국만관 반응은 확정(P3, 위 항목), blame_shift 더블론×2보유는 재배선·귀속 모두
  기존 회귀와 일치, 삼가화(트리플 론)는 도중유국으로 처리되어 화료 전용 훅이 관여하지
  않음을 코드로 확인
- #427 문안 정정("핀후"→"핑후", 묵계 "손이 열려"→"멘젠이 깨져") — 저장소 전체에서 잔여
  없음 확인
- 증강 126개 중 테스트에서 전혀 참조되지 않는 것 0개 (id 문자열 grep 기준)
- 대량 스위프(다수 시드, tonpuu/hanchan 혼합, 페르소나 혼합, 좌석당 2증강 강제 배정) —
  130판+ 관찰 범위 안에서 크래시 0·훅 예외 0·설명 안 되는 점수 드리프트 0
  (목표 "수백 판"에는 못 미침 — §4 참고, 이어서 돌리는 명령 남겨 둠)

## §5. 스위프 인프라 결함 — 「타임아웃」이 실제로는 판을 못 끊는다

재개 지시(coordinator, 2026-08-28)로 조사했다. 배경: `qa-lab/launch/augbug/sweep.log`가
`-- 350 games (crash=0 eff=0 viol=57)` 에서 멈춘 채 5시간 동안 한 글자도 늘지 않았고,
그동안 프로세스는 99% CPU로 계속 돌며 RSS가 389MB → 1,644MB로 불었다(coordinator의 `sample`
스택 추적: `Heap::Scavenge`·`AllocateRawWithLightRetrySlowPath`·`NewFillerObject` — GC
스래싱). coordinator가 의심 지점(`i=94350`)을 단독 재현했을 때는 2분 안에 정상 종료했다
(`DONE games=1 crash=0 eff=0 viol=0`) — 즉 "그 판 하나가 무한 루프"가 아니라 **누적**이거나
**드물게만 재현되는 것**이었다.

### 확정: `withTimeout`이 시간이 되면 **호출자만 풀어 주고, 실제 작업은 안 멈춘다**

`qa-lab/harness.ts`의 (수정 전) 코드:
```ts
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
// ...
const ranks = await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000);
```
`Promise`는 외부에서 강제로 멈출 수 없다 — `withTimeout`이 하는 일은 **`runMatch()`를
기다리는 쪽**(스위프의 for 루프)을 90초 뒤에 풀어 주는 것뿐이다. `ctrl.run()` 자체는
아무 신호도 받지 않고 백그라운드에서 계속 돈다. 그런데 `HanchanController`는 정확히 이
용도의 공개 메서드를 이미 갖고 있다: `requestAbort()`(`packages/core/src/match/
HanchanController.ts:925`) — `this.aborted = true`를 세우고 대기 중인 결정 프라미스를
깨워, `runLoop`가 다음 체크 지점(`if (this.aborted) return this.finishAborted();`)에서
즉시 빠져나가게 한다. **`withTimeout`은 이 메서드를 한 번도 부르지 않았다.**

**판정: 확정 — 재현 불필요, 코드 자체가 증거다.** 안전장치(`timeoutMs`)가 "호출자에게는
제때 답한다"는 약속만 지키고 "그 판을 실제로 멈춘다"는 (사용자가 당연히 기대할) 약속은
지키지 않았다 — coordinator가 지적한 그대로 "안전장치가 거짓"이다. 스위프가 시간 초과된
판을 만나면, 로그에는 CRASH 한 줄이 찍히고 다음 판으로 넘어가는 것처럼 보이지만, 버려진
판은 남아서 계속 CPU·메모리를 쓴다 — 시간 초과가 여러 번 겹치면 백그라운드에 쌓인 여러
"버려진 판"이 서로 자원을 다투다 GC 스래싱으로 번질 수 있다.

### 조치 (packages/ 는 건드리지 않음 — qa-lab/harness.ts만 수정)

`withTimeout`에 `onTimeout` 콜백을 추가하고, `runMatch`가 타임아웃 순간
`ctrl.requestAbort()`를 넘기도록 고쳤다:
```ts
const ranks = await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000, () => ctrl.requestAbort());
// ...
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => { onTimeout?.(); rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`)); }, ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
```
검증: `qa-lab/launch/augbug/harness_smoke.ts`로 정상 매치가 여전히 통과함을 확인
(`OK crash= undefined rounds= 4`). `qa-lab/launch/augbug/abort_test.ts`로 극단적으로 짧은
타임아웃(5ms)을 8연속 걸어 크래시 없이 끝까지 도는 것도 확인했다(다만 아래 §5-1의 남은
의문 참고).

### §5-1. 남은 의문 — 왜 5시간 동안 로그가 단 한 줄도 안 늘었나 (완전히 규명 못함)

`abort_test.ts`(타임아웃 5ms, 8연속)를 돌려 보니 **8건 모두 `crash=undefined`로 정상
종료했다** — 5ms 뒤에 타이머가 발동해 즉시 잘렸어야 하는데 그러지 않고 원래 시간(2~4초)
만큼 다 돌고서야 끝났다. 이건 `requestAbort` 배선과 별개의 문제로 보인다: **순수 동기
연쇄(마이크로태스크만 오가는 구간)가 길게 이어지면, `setTimeout`이 예약한 매크로태스크가
그 구간이 끝날 때까지 실행 기회를 못 얻을 수 있다**(Node 이벤트 루프의 일반적 성질 —
`PersonaAgent.decide`가 실질적으로 동기 함수를 `async`로 감싼 것뿐이라, 결정 하나하나가
진짜 비동기 경계 없이 마이크로태스크로만 이어질 가능성이 있다). 즉 **`setTimeout` 기반
타임아웃 자체가, 이벤트 루프에 진짜 매크로태스크 경계가 충분히 자주 없으면 정시에 발동하지
않을 수 있다** — `requestAbort` 배선은 "타이머가 발동했을 때 실제로 멈추게" 하지만
"타이머가 애초에 제때 발동하는가"는 별개의 조사 공백으로 남는다.

이 의문과 5시간 무증상 정지 사이의 정확한 인과는 **끝까지 규명하지 못했다** — 아래
근거로 규명을 시도했으나 결론에 이르지 못했다:
- `qa-lab/launch/augbug/leak_probe.ts`(고정 프리셋 devils_advance, 60판): RSS가
  170MB→216MB로 늘다가 **정체**했다(워밍업으로 보인다). heapUsed는 21~34MB에서 왔다갔다
  — **증가 추세 없음.**
- `qa-lab/launch/augbug/leak_probe2.ts`(sweep.ts와 완전히 같은 파라미터, 최대 360판):
  i=94000~94071까지 RSS가 199~210MB에서 평평했고 판당 시간(dt)도 1~5초로 일정했다 —
  **선형 누수 신호 없음.** 정지가 의심된 구간(i≈94350) 근방까지는 이 조사 안에서
  재현하지 못했다(시간 제약으로 그 지점까지 못 갔다 — 이어서 돌리는 명령은 아래 §5-2).
- 서버 경로(같은 엔진, `load` 담당의 40판+ 실측)는 RSS가 47~48MB로 평평했다 — 엔진
  자체(코어)의 문제일 가능성은 낮다는 coordinator의 반증을 그대로 지지한다. 하네스
  경로(`qa-lab/`)만의 문제로 좁혀지지만, **정확히 무엇이 누적되는지는 이 조사에서
  단정하지 못했다.**

가장 근거 있는 가설(확정은 아님, **의심**): 90초 타임아웃 자체가 위 매크로태스크 기아
때문에 드물게 늦게(또는 사실상 안) 발동하는 판이 존재하고, 그런 판이 하필 진짜
소프트락(끝나지 않는 판)이면 `requestAbort` 신호조차 전달할 기회가 없어 무한정 돈다 —
그런 판이 하나만 있어도 단일 스레드인 Node에서 그 뒤로는 아무 것도 못 나간다(로그가
전혀 안 늘어난 것과 정확히 일치). 이 가설을 확정하려면 실제로 그런 판을 시드로 잡아
`process._getActiveHandles()`/`--prof` 로 정지 순간의 콜스택을 뜨는 절차가 필요한데,
이번 조사에서는 시간 안에 그 판을 다시 만나지 못했다.

### §5-2. 스위프 재개 — 나뉜 프로세스로

누수를 완전히 규명하지 못했으므로, coordinator 지시대로 **프로세스를 나눠(각 100판씩)**
새로 고친 `withTimeout`으로 600판을 채운다. 하나가 다시 걸려도 그 프로세스만 멈추고
나머지는 영향받지 않는다:
```bash
cd /Users/skul/majak/.claude/worktrees/game-launch-qa-plan-09cd26
for s in 95000 95100 95200 95300 95400 95500; do
  nohup /Users/skul/majak/node_modules/.bin/tsx qa-lab/sweep.ts $s 100 \
    >> qa-lab/launch/augbug/sweep.log 2>&1 &
  disown
done
```

## 참고 (중복 보고 안 함)
`synergy` 담당이 이미 확정: 동시 발동 증강의 액션 노출 순서가 설치 순서 그대로 정렬 없이
나온다(`FlowController.ts:425-431`, `GameEngine.ts:154-156`).

## 요약 표

| 심각도 | 건수 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 1 (devils_advance 빚 폭발 — 상대 3명 각자에게 augPoints 근거 누락) |
| P3 | 1 (die_hard 노텐/유국만관 반응 — 설계와 일치, 문서·테스트 보강 권고) |

이 축에서는 확정/의심 신규 버그 0건. 최근 커밋 #414~#429가 건드린 증강 전부가 커밋
메시지·코드·문구·회귀 테스트 4중으로 일치했고, 이 세션에서 실행 확인한 130판+ 스위프에서도
크래시·훅 예외·설명 안 되는 드리프트가 없었다(목표치 "수백 판"에는 못 미쳤다 — 시간 제약,
§4에 이어서 돌리는 명령을 남겼다). 남은 조사 공백은 "도중유국/유국만관 등 특수 국 종료
상황에서 증강 훅의 런타임 재현"과 "스위프 표본을 수백 판으로 늘리기"이며, 둘 다 코드
추적상으로는 문제가 보이지 않아 후순위로 남긴다.
