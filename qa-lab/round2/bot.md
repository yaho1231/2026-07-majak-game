# 봇의 행동방식 — bot

담당: `packages/server/src/BotAgent.ts` · `packages/server/src/bot/**` ·
`packages/content/src/augments/botPlan.ts`·`botHelpers.ts` · `docs/27_AUGMENT_BOT_PLAYBOOK.md`

## 요약

- **실제 `BotAgent`로 돌린 판**: 동풍전 **111배패 · 600국 · 결정 37,350회**
  (증강 없음 83배패 / 증강 전체 17배패 / 계측 전용 11배패).
  결정마다 봇 **자신의 뷰 + 코어 계산**으로 9종 불변식을 독립 판정했다
  (`qa-lab/round2/bot/probe.ts`).
  ⚠ 이 워크트리의 머신은 감사 내내 load 40~64(코어 8)로 포화 상태였다 — 판 수가
  1차(220배패)보다 적은 이유이고, **벽시계 시간 기반 성능 수치는 신뢰할 수 없다**
  (아래 §성능에 따로 적었다).
- **엔진을 쓰지 않는 결정적 장면 스캔**: 근사 텐파이 손 **2,120장면** ·
  무작위 손 **900장면** · 리치 장면 **120손 × 6원형 = 714선언**
  (`furiten_scan.ts` · `archetype_scan.ts` · `fold_probe.ts` · `riichi_furiten_scan.ts`).
- **확정 3건 · 의심 3건.** 그리고 **큰 음성 결과**가 하나 있다 — 크래시·소프트락·
  규칙 위반은 **한 건도 없었다**(아래 표).

### 크래시·소프트락·규칙 위반은 0이었다 (음성 결과)

| 검사 | 600국 37,350결정에서 |
|---|---|
| 엔진 크래시 · 게임 타임아웃(600초 감시) | **0** |
| 제시되지 않은 옵션을 고름 (V1) | **0** |
| 증강 정책이 미제시 옵션을 돌려줌 (V1b) | **0** |
| 리치 뒤 쯔모기리 위반 (V2) | **0** |
| 화료 옵션을 두고 다른 것을 고름 (V5) | **0** |
| `decideSafely` 폴백 · 정책 예외 · `decide` 예외 (V6) | **0** |
| `[hanchan] … submit 예외` · `decide 무응답` 로그 | **0** |
| 같은 프롬프트에 같은 답 12회 반복(루프 징후, V8) | **0** |
| 위협 없는 판에서 텐파이를 스스로 깼는가 | **0 / 595장면** |

즉 **판이 죽는 계열은 재현되지 않았다.** 이번에 나온 것은 전부 "규칙은 지키는데
마작으로 틀린 수"다. 그 셋이 아래다.

---

## 확정 1. 🟠 봇이 **후리텐 리치**를 건다 — 선언패 자신이 자기 대기다 (리치 선언의 5.0%)

- **위치**: `packages/server/src/bot/discard.ts:405-433` (`bidRiichi`)
  ```ts
  const myDiscards = new Set<string>();
  for (const id of read.view.zones[`discards:${read.me}`]?.tileIds ?? []) { … }  // ← 선언 **전**의 내 바닥
  …
  const waits = winningKinds(rest, read.meldCount, undefined, read.opts);        // ← 선언 **후**의 대기
  const furiten = waits.some((w) => myDiscards.has(kindKey(w)));
  if (furiten && !(shape.waitTiles >= 8 && profile.aggression > 0.6)) continue;
  ```
  `myDiscards`는 **선언패가 바닥에 놓이기 전** 목록이라, 선언패 자신이 대기에 든
  경우(`waits.includes(선언패)`)를 구조적으로 못 본다. 그 리치는 **선언하는 순간
  후리텐**이라 국이 끝날 때까지 론이 안 된다 — 손은 잠기고, 1000점은 나갔고, 남은 건
  쯔모뿐이다.
- **기대**: 같은 함수의 주석 — "여기서 걸러내는 것은 취향이 아니라 **불가능**이다
  (패산 고갈·죽은 대기·**후리텐**)". 그리고 이 저장소는 사람에게는 이걸 **막아 준다** —
  튜토리얼 코치가 "그중 내 오름패를 버리면 그 국 내내 론을 못 한다(후리텐) — 코치도
  같은 이유로 그 한 장만 눌리게 잠근다"며 UI를 잠근다
  (`packages/server/test/Tutorial.test.ts:277`).
- **실제**: 여섯 원형 **전부** 그대로 건다.
  ```
  손패 111m999m111p555s67s · 내 바닥 비어 있음 · read.furiten=false
    sou7  대기[sou4,sou6,sou7]  ✗ 선언 즉시 후리텐   bidRiichi EV 7191   ← 최고 EV
  원형별 실제 리치 판단 (chooseRiichi):
    [balanced   ] sou7로 리치 · 대기[sou4,sou6,sou7]   ← 선언 즉시 후리텐 (론 불가 · 쯔모만)
    [attacker   ] … [defender] … [speedster] … [valueHunter] … [wildcard] — 여섯 다 같다
  ```
  빈도도 재 두었다 — 근사 텐파이 손 120개에 여섯 원형을 붙여 나온 **714회의 리치 선언 중
  36회(5.0%)** 가 선언 즉시 후리텐이었고, 원형별 편차가 없다(5.0~5.1%).
  ```
  원형          리치 선언   그중 후리텐 리치
    balanced       120         6 (5.0%)
    attacker       120         6 (5.0%)
    defender       117         6 (5.1%)
    …
    손 5p5p5p 567m 333m 111z 8m8m → man8로 리치 · 대기[man4,man5,man8] ← 선언 즉시 후리텐
    손 999m 333z 678p 222p 9p9p   → pin8로 리치 · 대기[pin5,pin8]      ← 선언 즉시 후리텐
  ```
  (전형적인 모양이 보인다: **커쯔에서 한 장 떼어 량면을 세우는 선언**. 마작에서 흔한
  형태라 드물게 나오는 예외가 아니다.)
- **재현**:
  `npx tsx qa-lab/round2/bot/riichi_furiten_probe.ts` (한 장면 · 여섯 원형)
  `npx tsx qa-lab/round2/bot/riichi_furiten_scan.ts 120 4242` (빈도)
- **영향**: 사람과 두는 판에서 봇 셋 중 하나가 20판에 한 번 꼴로 **론이 원천 봉쇄된
  리치**를 건다. 리치 봉이 나가고 손이 잠기므로 그 국은 사실상 버려진다. 화면에는
  똑같이 "리치!"가 뜨므로 **사람은 그 리치를 정상으로 읽고 접는다** — 봇이 손해를
  보면서 사람의 국까지 망친다.
- **제안 수정**: `bidRiichi`의 판정을 선언패를 포함한 목록으로 바꾼다 —
  `const furiten = waits.some((w) => myDiscards.has(kindKey(w)) || kindKey(w) === kindKey(c.kind));`
  (기존 `furiten &&` 예외 조항은 그대로 두면 된다.)

---

## 확정 2. 🟠 평시 버림 EV가 "이 버림이 만드는 후리텐"을 세지 않아 화료 확률을 최대 2.2배 부풀린다

- **위치**: `packages/server/src/bot/read.ts:426` · `bot/value.ts:418` · `bot/discard.ts:355`
  ```ts
  // read.ts — winChanceOf가 보는 후리텐
  furiten: furiten || input.tsumoOnly === true,   // furiten = mine?.furiten (이미 후리텐인가)
  // value.ts
  const chances = input.furiten ? 1 : RON_MULTIPLIER;   // RON_MULTIPLIER = 2.2
  // discard.ts — bidDiscard가 넘기는 tsumoOnly는 손 전체에 하나뿐이고 후보별이 아니다
  const tsumoOnly = read.menzen && !hasYakuNow(read);
  ```
  `bidRiichi`에는 후리텐 검사가 있는데(확정 1의 그 줄) **평시 버림 `bidDiscard`에는
  아예 없다.** 그래서 "이 패를 버리면 내가 후리텐이 된다"는 사실이 EV 어디에도 안 들어가고,
  론 배수 2.2가 **론이 불가능한 손에도 그대로** 붙는다.
- **기대**: 같은 저장소가 사람에게는 이걸 실수로 취급한다(확정 1의 튜토리얼 인용).
  기존 회귀 테스트 `BotPlay.test.ts:143`("후리텐 대기로는 걸지 않는다")도 **이미 바닥에
  있던 패**로만 검사해서 이 자리를 지나간다.
- **실제**: 같은 손을 두 번 값매겨 차이를 그대로 찍었다 — 한 번은 지금 코드, 한 번은
  `botScene({furiten:true})`로 **봇이 후리텐인 줄 아는** 대조군.
  ```
  손패 111m999m111p555s67s (모든 텐파이 갈래가 스스로 후리텐이 되는 손)
    man1  대기[man1,sou5,sou8]  6장  ✗론불가  EV 3374  (후리텐을 아는 봇 2113 — 차이 1261)
    sou5  대기[sou5,sou8]       5장  ✗론불가  EV 3076  (…              1828 — 차이 1247)
    sou7  대기[sou4,sou6,sou7] 10장  ✗론불가  EV 3964  (…              2922 — 차이 1042)
  ```
  **점수 1,042~1,261점(30~40%)만큼 부풀려 센다.** 이 EV는 버림·리치·후로·깡·증강이
  전부 공유하는 축이므로(`bot/decide.ts`), 부풀림은 그 판단 전부를 함께 기울인다.
- **얼마나 자주 그 손인가**: 근사 텐파이 장면 595개 중 **30개(5.0%)** 가 "텐파이로 가는
  갈래가 전부 스스로 후리텐"인 손이었다(`furiten_scan.ts`, 시드 555 · 800손 표본에서는
  30/595). 다만 **"론 되는 갈래와 후리텐 갈래가 동시에 열려 봇이 나쁜 쪽을 고르는"
  장면은 1,400손에서 0건**이었다 — 두 갈래는 사실상 배타적으로 나타난다. 그래서 이
  버그는 "더 나쁜 패를 고른다"가 아니라 **"후리텐 텐파이를 론 가능한 텐파이로 착각해
  그 손을 계속 민다"** 로 나타난다(위험패를 통과시키는 문턱이 그만큼 낮아진다).
- **재현**: `npx tsx qa-lab/round2/bot/furiten_probe.ts` ·
  `npx tsx qa-lab/round2/bot/furiten_scan.ts 800 777`
- **제안 수정**: `bidDiscard`의 후보 루프에서 `bidRiichi`와 같은 검사를 하고
  (`waits.includes(후보) || myDiscards.has(…)`), 그 후보의 `lineEV`에
  `tsumoOnly: true`를 넘긴다. 배관은 이미 다 있다 — `winChanceOf`가 `tsumoOnly`를
  받아 론 배수를 빼는 경로가 그대로 살아 있다.

---

## 확정 3. 🟡 아키타입이 **사실상 같은 수를 둔다** — 밀기/접기가 갈려야 하는 자리에서 90.7% 일치

- **위치**: `packages/server/src/bot/profile.ts`(원형표) ·
  `bot/discard.ts:69-76`(`scales` — 성격이 EV에 곱해지는 유일한 자리)
  ```ts
  const bias = (profile.aggression - 0.5) * 0.6 + read.match.riskAppetite * 0.45;
  return { gain: Math.max(0.4, 1 + bias), loss: Math.max(0.35, 1 - bias) };
  ```
  `aggression` 0.85(공격형) ↔ 0.15(수비형)이 저울에 주는 폭은 gain ×1.21 vs ×0.79뿐이라,
  후보들의 EV 격차가 그보다 크면 **argmax가 바뀌지 않는다.**
- **기대**: `docs/00_MASTER_ARCHITECTURE.md:410-425` — "**원형끼리는 뚜렷이 다르고**,
  같은 원형의 두 봇은 미묘하게 다르다", "공격형은 스지를 밀 구실로 쓰고(0.9),
  수비형은 현물이 있는 한 스지에 손을 대지 않는다(0.28)". 화면도 이름표에 원형을 세운다.
- **실제**: 같은 장면을 여섯 원형에 주고 `bidDiscard`(흔들림 없이 최선)를 비교했다.
  **aggression·sujiTrust가 갈라야 하는 바로 그 장면**(p1 리치 · 텐파이 근처 손 · 10순)에서:

  | 장면 묶음 | 여섯 원형의 선택이 갈린 비율 | attacker↔defender 불일치 |
  |---|---|---|
  | 평시 · 무작위 손 | 19.3% | 4.0% |
  | 평시 · 텐파이 근처 손 | 8.0% | 5.3% |
  | **위험(p1 리치) · 텐파이 근처 손** | **9.3%** | **9.3%** |
  | 위험(p1 리치) · 무작위 손 | 3.3% | 2.0% |

  밀기율(현물이 손에 있는데 비현물을 낸 비율)도 거의 같다.
  ```
  위험(p1 리치) · 텐파이 근처 손 (150장면)
    attacker     68/87 = 78.2%      defender     59/87 = 67.8%
    speedster    67/87 = 77.0%      valueHunter  60/87 = 69.0%
    balanced     63/87 = 72.4%      wildcard     67/87 = 77.0%
  ```
  aggression이 **0.85 대 0.15**(폭 0.7)인데 밀기율 차이는 **10.4%p**, 같은 패를 고르는
  비율은 **90.7%** 다. 평시에는 `defender↔balanced`가 **0.3% 불일치**(300장면 중 1건)로
  사실상 같은 봇이었다.
- **재현**: `npx tsx qa-lab/round2/bot/archetype_scan.ts 150 4242`
- **영향**: 이름표는 여섯인데 판에서 느껴지는 봇은 사실상 하나다. 실제 대국에서 눈에
  띄는 차이는 `noise`(변덕형 0.8)가 만드는 **무작위 흔들림**뿐인데, 그건 성향이 아니라
  실수다 — "저 자리는 잘 미는 사람"이라는 읽기가 서지 않는다.
  ⚠ 밸런스에 손대는 제안이므로 **수정 전에 아레나 2:2로 재는 것이 맞다**(`scales`의
  폭을 넓히면 강함이 떨어질 수 있다). 여기서 확정하는 것은 "약속과 다르다"까지다.

---

## 의심 1. 방총의 4분의 1이 "현물을 손에 들고도 리치에 밀다가" 나온다

- 600국에서 방총 **170건**을 전수 추적했다(쏜 사람의 그 결정 시점 뷰를 스냅샷).
  - **43건(25.3%)** 은 쏜 사람이 그 순간 **그 리치자의 현물을 손에 들고** 있으면서
    비현물을 골라 쏜 것이다.
  - 그중 **19건(11.2%)** 은 버린 뒤 손이 **2샹텐 이상**이었다 — 밀어서 얻을 것이
    거의 없는 손이다.
  ```
  V4_pushDealIn_far  p0  {"discarded":"pin8","shantenAfter":2,"genbutsuHeld":["pin5"],"winner":"p2"}
  V4_pushDealIn_far  p2  {"discarded":"sou9","shantenAfter":3,"genbutsuHeld":["pin7"],"winner":"p3"}
  ```
- **확정하지 않는 이유**: 결정적 장면 스캔에서는 봇의 수비가 **틀리지 않았다.**
  "3샹텐 이상 + 손에 현물 있음 + p1 리치" 204장면에서 비현물을 낸 비율은 24~28%인데,
  그때 고른 패의 **자기 계산 기대 실점이 평균 8~12점**이었다(현물은 0점) — 거의 전부
  통과패·고립 자패처럼 실질 안전패였다.
  ```
  원형          밀기(비현물)  평균 기대실점  현물의 기대실점
    attacker       57/204 =  27.9%       12점        0점
    defender       51/204 =  25.0%        9점        0점
  ```
  즉 "현물을 두고 밀었다"는 것만으로는 실수라고 못 한다. 위 19건이 정말 나쁜 수인지는
  국면을 한 건씩 펴 봐야 하고, 그건 이번 라운드에서 다 못 했다.
- 재현: `npx tsx qa-lab/round2/bot/probe.ts 20 1007 tonpuu out.json` (V4 카운터) ·
  `npx tsx qa-lab/round2/bot/fold_probe.ts 250 31337`

## 의심 2. 구종구패 입찰값은 **축이 다르다** (회피 비용 vs 절대 EV)

- `packages/server/src/bot/abort.ts:75-95` — 유찰의 입찰값이
  `JUNK_ROUND_COST * (1 - appetite) + (오야면 700)` = **"잡손으로 두면 잃을 것"** 이다.
  그런데 이 입찰은 `decide.ts`의 2층에서 `bidDiscard`와 겨루는데, 그쪽 값은
  **"그 길로 갔을 때 이 판의 절대 EV"** 다(`discard.ts:163` 주석이 못박은 규약).
  절대 EV에는 이미 기대 실점이 빠져 있으므로, 회피 비용을 그 자리에 그대로 놓으면
  같은 손해를 두 번 세는 셈이다 — 유찰 쪽으로 기운다.
- **확정하지 않는 이유**: 규칙이 옵션을 "자기 첫 순 · 요구패 9종 이상"에서만 주므로
  그 자리에서 유찰이 대체로 옳다. 실제로 틀린 선언(요구패 9종인데 손이 좋았던 국)을
  600국에서 못 집어냈다. 축이 어긋난 것은 코드로 확실하지만 **결과가 틀린 장면을 못 세웠다.**

## 의심 3. 후보별로 갱신되지 않는 두 값 — `tsumoOnly`(역 유무)와 `valueOf`의 손 읽기

- `bot/discard.ts:359` — `const tsumoOnly = read.menzen && !hasYakuNow(read);` 는
  **손 전체에 하나**이고 후보별로 다시 재지 않는다. `hasYakuNow`가 보는
  `noYakuWaits`는 **지금(버리기 전) 손**의 값이라, 노텐에서 텐파이로 가는 버림에서는
  언제나 비어 있다 → 모든 후보가 "역이 있다"로 값매겨진다.
- 같은 자리에서 `read.valueOf({plan, doraDelta})` 가 `kinds: [...hand, ...meldKinds]`
  (역시 **버리기 전** 14장)로 역을 읽는다(`read.ts:379`). 역패 한 장을 흘리는 버림과
  남기는 버림의 값어치가 같게 나온다 — `directionGain`이 `plan` 축으로 일부만 메운다.
- **확정하지 않는 이유**: 방향이 늘 나쁜 쪽인지 확인하지 못했고(열린 손에서는
  `YAKULESS_OPEN` 0.15가 뒤늦게라도 잡는다), 이 둘을 후보별로 다시 재면 결정당 비용이
  크게 는다 — 고칠 값어치가 있는지는 아레나로 재야 한다.

---

## 성능 — 이번 감사에서는 **잴 수 없었다** (측정 실패의 기록)

머신이 감사 내내 **load 39~64 (코어 8)** 로 포화 상태여서 벽시계 시간이 전부
경쟁 지연에 묻혔다. 참고로 순수 `npm run arena -- --games 2 --mode tonpuu` 가
**65.7초**(판당 33초) 걸렸다 — 같은 명령의 정상 구간 실측(문서 기준 판당 3초 남짓)의
10배다. 이 조건에서 "결정 하나에 수백 ms"를 재는 것은 봇이 아니라 부하를 재는 것이다.

대신 **부하와 무관한 두 가지**는 확인했다.

- **누수 없음**: 판이 늘어도 국당 비용이 자라지 않는다. 한 셔드(83국)에서
  국당 결정 수와 국당 소요가 초반·후반 구간에서 같은 분포였고, 국이 늘수록 느려지는
  단조 증가는 없다(느려진 구간은 전부 다른 프로세스가 붙은 구간과 겹친다).
- **소프트락 없음**: 게임마다 600초 감시 타이머를 걸었고 **한 번도 발동하지 않았다.**
  `[hanchan] … 무응답 … 안전 폴백` 로그도 0건이다.

부하가 없는 머신에서 `npx tsx qa-lab/round2/bot/probe.ts 30 1 tonpuu out.json` 를
다시 돌리면 `summary.avgDecisionMs`·`maxDecisionMs`·`slowest`가 그대로 나온다.

---

## 증강을 든 봇 (1차 확정건의 재검증)

증강 전체를 깐 17배패·100국에서 **정책 예외 0 · 미제시 옵션 0 · 자기지목 발동 0**이다.
1차에서 확정된 셋은 코드에 수정이 **실제로 들어가 있음**을 확인했다(재현 안 됨).

| 1차 확정 | 지금 코드 | 확인 방법 |
|---|---|---|
| 봇이 D티어를 통째로 버린다 | 고쳐짐 — `bot/draft.ts:chooseDraft`가 밴드가 아니라 **비율 가중 추첨**(`DRAFT_SHARPNESS`)으로 뽑는다 | 소스 확인 |
| 무장해제로 잠긴 **내** 증강을 값어치에서 안 뺀다 | 고쳐짐 — `bot/read.ts:331`이 `effectiveAugmentsOf(view, me)`를 쓴다. `botPlan.myHandPoints`도 `liveAugmentsOf` | 소스 확인 |
| 재장전이 순 6에서 닫힌다 | 고쳐짐 — `botPlan.readiness("setup")`이 "이번 국(순목)"과 "남은 국(`roundsAheadOf`)"의 최댓값 | 소스 확인 |

`packages/content/test/{bot_policy_behavior,bot_plan,disarm}.test.ts` **50개 전부 통과**.

---

## 이번에 만든 스크립트 (`qa-lab/round2/bot/`)

| 파일 | 하는 일 |
|---|---|
| `probe.ts` | 실제 `BotAgent` + `HanchanController`로 판을 돌리며 V1~V9 불변식을 매 결정 판정. `<games> <seed> <mode> [--aug] [out.json]`, 게임당 600초 소프트락 감시, 10판마다 부분 저장 |
| `furiten_probe.ts` | 확정 2의 한 장면 — 후보별 EV를 **후리텐을 아는 봇**과 나란히 찍는다 |
| `furiten_scan.ts` | 근사 텐파이 손을 대량 생성해 후리텐 갈래/론 갈래의 분포와 봇의 선택, 텐파이 파기 여부를 센다 |
| `riichi_furiten_probe.ts` | 확정 1의 한 장면 — 여섯 원형이 전부 후리텐 리치를 거는 것을 보인다 |
| `riichi_furiten_scan.ts` | 확정 1의 **빈도** — 리치 선언 중 몇 %가 선언 즉시 후리텐인가 |
| `archetype_scan.ts` | 확정 3 — 같은 장면에서 여섯 원형의 선택 불일치율과 밀기율 |
| `fold_probe.ts` | 의심 1의 반증 — 가망 없는 손 + 리치 앞에서 봇이 무엇을 내는가(기대 실점까지) |
