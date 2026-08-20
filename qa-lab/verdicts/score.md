# 의심 건 재검증 — 점수·정산·방어 계열 (2026-08-20)

대상: `qa-lab/findings/score-a.md` 의심 1·2 / `score-b.md` 의심 1 /
`defcall.md` 의심 1·2·3 / `riichi.md` 의심 1·2·3 — **총 9건**.

**결과: 확정 4 · 기각 5 · 보류 0.**

> ⚠ 검증 시점의 소스: `HEAD = e3e53b5`(claude/augment-fixes-0820 머지) +
> **워킹트리에 미커밋 수정 87개 파일**(다른 에이전트가 동시 작업 중, 2026-08-20 12:00 KST).
> 옛 QA 스크립트 일부(`qa-lab/score-a/combo.ts` 등)는 그 사이 `roundScopedKey`로 바뀐
> augmentData 키를 아직 옛 형식(`jackpot:mult:1-1-0:p0`)으로 쓰고 있어 **증강이 조용히
> 발동하지 않는다**. 내 스크립트는 전부 `roundScopedKey`로 키를 만든다.

내 스크립트는 `qa-lab/verify-score/` 아래에만 있다. 실행:
`/Users/skul/majak/node_modules/.bin/tsx qa-lab/verify-score/<파일>`

| # | 원 의심 | 판정 |
|---|---|---|
| 1 | score-a 의심 1 — 배수 연쇄 | **확정**(blood_contract 한정) · 연쇄 자체는 기각 |
| 2 | score-a 의심 2 — devils_advance 9,000 소멸 | **확정**(표시 결함) · 소멸 자체는 기각 |
| 3 | score-b 의심 1 — sign_flip 근거 없음 | **확정**(오귀속까지) |
| 4 | defcall 의심 1 — bluff_pretense 5번째 장 | **기각** |
| 5 | defcall 의심 2 — meld_dissolve discardCount | **기각**(하네스 픽스처 오탐) |
| 6 | defcall 의심 3 — always_tenpai × notenExempt | **기각**(도달 불가 · 잠재 구멍은 기록) |
| 7 | riichi 의심 1 — open_riichi × 손 교환 | **기각**(이미 수정됨) |
| 8 | riichi 의심 2 — siege 노텐 리치 안깡 | **확정**(사깡산료로 노텐 벌부 회피) |
| 9 | riichi 의심 3 — soul_strike × 대명깡 일발 | **기각** |

---

## 확정 1. 🟡 blood_contract — "손의 화료점뿐"이라고 적어 놓고 **앞 배수가 부풀린 델타 전체**에 1.5배를 건다

- 위치: `packages/content/src/augments/blood_contract.ts:129-130`
  ```ts
  const base = Math.max(0, d - pot - honba);   // d = 앞 단계가 이미 불려 놓은 델타 전체
  const after = round100(base * mult) + pot + honba;
  ```
  문구: 같은 파일 `:95` — "배수가 걸리는 것은 **손의 화료점뿐**이다"
- 기대: 손 8,000 · 계약 적중이면 blood_contract가 얹는 몫은 **+4,000**(8,000 × 0.5).
- 실제: 같은 `Multiply` 단계의 `let_it_ride`(`let_it_ride.ts:80`)·`jackpot`(`jackpot.ts:237`)이
  먼저 돌아 델타를 부풀려 놓으면 blood_contract는 **그 결과 전체**에 1.5를 건다.
- 재현: `tsx qa-lab/verify-score/c1_multiply_chain.ts`
  ```
  A. 단독
     jackpot 3배만        8000 -> 24000  (jackpot +16000)
     let_it_ride 4배만    8000 -> 32000  (let_it_ride +24000)
     blood_contract만     8000 -> 12000  (blood_contract +4000)   ← detail대로
  B. 조합
     ride(4배)+계약(1.5배)  8000 -> 48000  notes=[ride +24000, 계약 +16000]
        기대 36000 / 실제 48000  차 +12000   ← 계약이 +4000이 아니라 +16000
     jackpot(3배)+계약      8000 -> 36000  notes=[jackpot +16000, 계약 +12000]
        기대 28000 / 실제 36000  차 +8000
  C. 셋 다 + 공탁 3000 + 3본장 900
     11900 -> 150600 (뱅크 발행 138700)  notes=[ride +24000, jackpot +65800, 계약 +48900]
  ```
- **연쇄 자체는 기각이다.** `packages/core/src/augment/settleStages.ts:29`가 세 증강을 같은
  `Multiply` 단계로 명시하고, `blood_contract.ts:103` 주석이 "다른 배수 증강과 같은 단계라
  **서로 곱해진다**"라고 스스로 적어 둔다. `jackpot`의 detail도 "자신의 **획득 점수**가
  양수이면 배수만큼 곱해진다"라 델타 전체가 맞고, `let_it_ride`는 실제로
  `winInfos[].points`만 곱해 detail을 지킨다(`let_it_ride.ts:96-99`).
  → 어긋난 것은 **blood_contract 한 장뿐**이다. 같은 단계의 세 증강 중 하나만 규약이 다르다.
- 최소 수정 위치(고치지 않음): 둘 중 하나.
  ① `blood_contract.ts:126-130` — `let_it_ride.ts:96-99`처럼 `winInfos[].points`를 밑값으로
     삼아 `bonus = min(winPoints, d) * 0.5`만 얹는다.
  ② 구현을 유지한다면 `:95`의 "손의 화료점뿐"을 jackpot 문구처럼 "그 시점의 획득 점수"로 고친다.
- 영향: 점수가 설명과 다르다(위 예에서 12,000점). 늘어난 몫은 전부 뱅크 발행이라 총합은 늘 뜬다.

## 확정 2. 🟡 devils_advance — 폭발 9,000점 소멸은 설계지만, **결과 화면에 근거 줄이 한 줄도 안 뜬다**

- 소멸 자체는 **기각**: `devils_advance.ts:105-108` 주석이 "걷은 돈은 **뱅크로 간다** —
  보유자의 deltas는 손대지 않는다"라고 명시하고(2026-08-15 사용자 지시),
  `:114`의 `withAugPoint(p, ctx, 0)`은 **일부러 0을 기록**한 것이다. 짝 감사의 반론이 맞다.
- 그러나 그 주석이 이어서 약속하는 "무슨 일이 일어났는지는 전원이 본다"가 **거짓**이다.
  클라이언트의 두 렌더 경로가 이 노트를 양쪽에서 걸러 낸다.
  - `packages/client/src/App.tsx:19441` — 화료자 블록: `.filter(a => … && a.points !== 0)`
  - `packages/client/src/App.tsx:19730` — 증감표: `<AugDeltaNotes … skipWinners={winnerIds} />`
    → `App.tsx:19134` `if (skipWinners?.has(player)) return null;`
  `AugDeltaNotes`의 주석(`App.tsx:19112-19114`)은 "`points === 0`인 노트도 싣는다 —
  **마왕의 진군처럼** 총액이 0이어도 재배선 자체가 설명인 경우가 있다"라고 적혀 있지만,
  폭발은 **화료 정산에서만** 일어나고 보유자는 언제나 `winnerIds`에 들어가므로 그 경로에
  절대 닿지 않는다. 상대 셋에게는 애초에 노트가 만들어지지 않는다.
- 재현: `tsx qa-lab/verify-score/c2_devils_advance.ts`
  ```
  deltas = {"p0":8000,"p1":-3000,"p2":-11000,"p3":-3000}   합계변화 = -9000
  augPoints = [{"player":"p0","augId":"devils_advance","points":0}]
  ① 화료자 블록에 뜨는 증강 줄 = []
  ② 증감표:
     p0 +8000   근거=(없음)
     p1 -3000   근거=(없음)      ← 왜 3000을 내는지 화면 어디에도 없다
     p2 -11000  근거=(없음)
     p3 -3000   근거=(없음)
  ```
- 최소 수정 위치(고치지 않음): 셋 중 하나.
  ① `App.tsx:19730` — `skipWinners`를 "점수 노트가 있는 승자"에만 적용한다(0점 노트는 남긴다).
  ② `App.tsx:19441`의 `a.points !== 0` 필터를 화료자 블록에서도 완화한다.
  ③ 또는 `devils_advance.ts:96-101`에서 상대 셋에게도 `-3000` 근거 노트를 남긴다
     (증감표는 비승자 노트를 이미 그린다 — 이 편이 "누가 왜 내는지"를 직접 말한다).
- 영향: 정보가 안 보인다. 9,000점이 근거 없이 테이블에서 사라진다.

## 확정 3. 🟡 sign_flip — 국 중 부호 반전이 근거를 안 남길 뿐 아니라 **원인 증강에 오귀속**된다

- 위치: `packages/content/src/augments/sign_flip.ts:78-83`
  ```ts
  ctx.interceptor(SCORE_CHANGED, (event, ic) => {
    const p = event.payload as ScoreChangedPayload;
    if (p.player !== holder || p.reason === ID) return event;
    if (!armedNow(ic.state, ID, holder)) return event;
    return { type: event.type, payload: { ...p, delta: -p.delta } };   // reason 그대로
  });
  ```
- 원 의심은 "근거(augPoints)가 안 남는다"였는데, 실행해 보니 한 걸음 더 나쁘다 —
  **`reason`이 원래 증강 그대로 남아 원장이 거짓말을 한다.**
- 재현: `tsx qa-lab/verify-score/c3_signflip_record.ts` (엔진 `eventLog`의 SCORE_CHANGED 원문)
  ```
  A. karma만 (반전 없음)        총합 100000 -> 100000 (Δ0)
     [{p1,-4000,karma},{p2,-4000,karma},{p3,-4000,karma},{p0,+12000,karma}]
  B. 피해자 p1이 sign_flip        총합 100000 -> 108000 (Δ+8000)
     [{p1,"delta":4000,"reason":"karma"}, …]     ← ★ 카르마가 피해자에게 +4000을 준 것으로 기록된다
  C. 피해자 셋 전부 sign_flip      총합 100000 -> 124000 (Δ+24000)
     [{p1,+4000,karma},{p2,+4000,karma},{p3,+4000,karma},{p0,+12000,karma}]
  ```
  대조: 정산 경로(`sign_flip.ts:85-101`)는 `withAugPoint(p, ctx, -before*2)`로 제대로 서명하고,
  리치 공탁 보정(`sign_flip.ts:68-74`)도 `reason = "sign_flip"`으로 자기 이름을 단다.
  **깨진 것은 SCORE_CHANGED 인터셉터 하나뿐이다.**
- 영향: ① 뱅크 발행 24,000점의 출처를 원장에서 찾을 수 없다(하네스 `SCORE_DRIFT_UNEXPLAINED`).
  ② 결과 화면·기록이 "카르마가 점수를 줬다"고 반대로 말한다. ③ `reason`을 읽는 다른 감사·
  리플레이 도구가 같은 거짓을 그대로 물려받는다.
- 최소 수정 위치(고치지 않음): `sign_flip.ts:82` — 뒤집은 payload에 `reason: ID`(또는
  `reason: \`${p.reason}+${ID}\``)를 실어 발행에 서명한다. `:80`의 `p.reason === ID` 가드가
  자기 보정을 이미 걸러 주므로 재진입은 생기지 않는다.

## 확정 4. 🟡 siege_riichi — 노텐 리치 중에는 **어떤 안깡도 통과**하고, 그걸로 사깡산료를 만들어 **노텐 벌부를 회피**할 수 있다

- 위치: `packages/core/src/mahjong/flow/standardActions.ts:84-107` (`isRiichiSafeAnkan`)
  — "깡 전후의 대기 집합이 같으면 허용". 노텐 리치는 `before = after = ∅`라 **항상** 통과한다.
- 기대(`siege_riichi.ts:31`): "손이 잠기고 쯔모기리가 강제되는 것은 진짜 리치와 같다" ·
  "리치봉 1000점과 **유국 시 노텐 벌부도 그대로 걸린다**".
- 실제 ①: `tsx qa-lab/verify-score/c7b_siege_ankan.ts`
  ```
  A. 노텐 리치(공성계)  wind1:허용
  B. 대조군 텐파이 리치  man1:거부(riichi: kan changes waits)   ← 같은 규칙이 진짜 리치는 막는다
  ```
- 실제 ②(실익): `tsx qa-lab/verify-score/c7b2_siege_fourkan.ts`
  ```
  kanCount(전) = 3  kanCallers = ["p1"]   p0는 노텐 리치(대기 ∅)
  ankan.ok = true → kanCount(후) = 4  kanCallers = ["p1","p0"]
  최종: phase = round.over
  정산 = {"outcome":"abort", "deltas":{p0:0,p1:0,p2:0,p3:0}, "abortReason":"fourKan", …}
  ```
  → 남이 깡 3개를 만들어 둔 국에서, 공성계 보유자는 **대기와 무관한 아무 안깡 하나**로
  사깡산료(`FlowController.ts:212-218`, 서로 다른 두 사람 이상 + kanCount 4)를 성립시켜
  국을 통째로 무효화한다. 델타 전원 0 — 카드가 약속한 노텐 벌부(3,000)를 내지 않는다.
  진짜 리치를 건 사람은 대기가 바뀌는 깡을 칠 수 없으므로 이 버튼이 없다.
- 안전 확인(같이 봤다): 안깡으로 **텐파이가 되지는 않는다** — `before(∅) ≠ after(≠∅)`라
  `sameKindSet`이 거부한다. "화료 불가"는 지켜진다.
- 최소 수정 위치(고치지 않음): `standardActions.ts:106` — `sameKindSet(before, after)` 앞에
  `if (before.length === 0) return false;`를 둔다(지킬 대기가 없는 리치는 손이 완전히 잠긴다).
  공성계 쪽에서 막으려면 `riichi.requiresTenpai`와 짝이 되는 규칙(예: `kan.riichiAnkan`)이
  필요하므로 코어 한 줄이 최소다.
- 영향: 규칙 파괴(도중유국을 임의로 만든다) + 카드 문구 위반(노텐 벌부 회피). 조건이
  좁아(다른 사람 깡 3개 + 보유자 손의 4장 짝) 🔴은 아니다.

---

## 기각 1. bluff_pretense 5번째 장 — **확립된 `conjured` 규약**이다 (defcall 의심 1)

- 재현: `tsx qa-lab/verify-score/c4_bluff_conjured.ts`
  ```
  bluff_pon ok = true
  dragon3 총 장수 = 5
    44  conjured=true      ← 생성패
    132 conjured=false
    133 conjured=false
    134 conjured=false
    135 conjured=false
  → 진짜 장수 4 / 생성패 1
  ```
- 왜 기각인가:
  ① 생성패에 `attrs.conjured`가 정확히 붙는다(`bluff_pretense.ts:164-166`). 4장 한도를
     넘긴 것은 **표식이 붙은 1장뿐**이고 진짜 장수는 정확히 4장이다.
  ② 이 표식은 시스템 전체의 규약이다 — 화면은 보라로 구분해 그리고
     (`packages/client/src/styles.css:3240`), 봇은 위험도·스지 계산에서 **세지 않는다**
     (`packages/server/src/bot/danger.ts:122`, `suji.ts:171`).
  ③ 같은 메커니즘의 `cliff_bloom`은 4장 초과를 **2026-08-04 사용자 확정으로 유지**한다고
     소스에 못박혀 있다(`cliff_bloom.ts:24-28`, docs/25 P8 종결). 그리고 `cliff_bloom`의
     description/detail에도 그 말은 **없다** — 즉 "허장성세만 설명이 빠졌다"가 아니라
     생성패 전반의 공통 규약이고, 설명은 `conjured` 시각 표식이 대신한다.
  ④ 설계 문서에 이 증강의 원안이 그대로 적혀 있다(`docs/16_AUGMENT_REDESIGN.md:795-797` —
     "`tileKindChanged`(conjured) 변환해 커쯔를 채운다. 세 삼원 커쯔가 **실제로** 서므로 …").
  ⑤ 정합은 깨지지 않는다(타일 총량·손패 산술·커쯔 판정 정상 — defcall 감사도 같은 결론).

## 기각 2. meld_dissolve × `discardCount` — **하네스 픽스처 오탐**이다 (defcall 의심 2)

- 원 관측은 "파혼 뒤 `p1 강=11장 / discardCount=10`". 실행해 보니 그 어긋남은
  **파혼 전부터, 퐁 전부터 이미 있었다** — `craft({ discards: … })`가 강에 패를 심으면서
  `discardCount`를 올리지 않는 픽스처 특성이다.
- 재현: `tsx qa-lab/verify-score/c5_dissolve_counts.ts`
  ```
  [픽스처 기반 — 원 관측과 같은 장면]
    ① 퐁 전    강=11 discardCount=10 버림이력=11     ← ★ 이미 어긋나 있다
    ② 퐁 후    강=10 discardCount=10 버림이력=11
    ③ 파혼 후  강=11 discardCount=10 버림이력=11     ← ①과 완전히 동일

  [대조군 — p1이 엔진 액션으로 실제로 버린 강]
    ① 버리기 전 강=0 discardCount=0 버림이력=0
    ② 버린 뒤   강=1 discardCount=1 버림이력=1
    ③ 퐁 후     강=0 discardCount=1 버림이력=1
    ④ 파혼 후   강=1 discardCount=1 버림이력=1       ← ②로 정확히 복원
  ```
- 실제 게임 경로에서는 세 값이 모든 단계에서 일치하고, 파혼은 퐁 직전 상태로 **정확히**
  되돌린다. 강 길이를 세는 판정 중 실제로 어긋나는 것은 유국만관 하나뿐인데
  (`standardActions.ts:1172`) 그건 defcall **확정 1**로 이미 별건이다(그 건은 이 시점 워킹트리에서
  아직 살아 있다 — `tsx qa-lab/defcall/repro_dissolve_nagashi.ts`로 재확인했다).
  더블리치 판정은 이미 물리 길이를 버리고 `discardCount`로 옮겨 갔다(`flowEvents.ts:409-420`).

## 기각 3. always_tenpai × `draw.notenExempt` — **도달 불가** (defcall 의심 3)

- 재현: `tsx qa-lab/verify-score/c6_alwaystenpai_exempt.ts`
  ```
  ① 카탈로그 증강 수 = 113
     'draw.notenExempt'를 켜는 증강 = 0건
     (packages 전체 grep: core의 정의 1줄 + 소비 1줄 + 주석 1줄이 전부)
  ② 규칙을 강제 주입했을 때
     exempt(p1)=false  tenpai=["p0","p3"]  deltas={p0:5500,p1:-3500,p2:-3500,p3:1500}
     exempt(p1)=true   tenpai=["p0","p3"]  deltas={p0:5500,p1:-2000,p2:-5000,p3:1500}
                                              ↑ 표준 벌부는 면제되는데 승승장구 2000은 그대로 나간다
  ```
- 즉 **주장 자체는 참**이다(`always_tenpai.ts:65-72`가 `tenpaiPlayers`만 보고
  `draw.notenExempt`를 보지 않는다). 그러나 그 규칙을 켜는 증강이 113종 중 **하나도 없어**
  게임에서 도달할 수 없다 → 결함으로 확정하지 않는다.
- 잠재 구멍으로만 기록: 앞으로 노텐 면제 증강을 추가한다면 `always_tenpai.ts:65`의
  `noten` 필터에 `rules.resolve("draw.notenExempt", …)` 제외를 함께 넣어야 한다.
  (`nagashi_yakuman`·`hourglass` 같은 다른 `DrawPatch` 증강도 같은 점검 대상이다.)

## 기각 4. open_riichi_reveal × 손 교환 — **이미 수정됐다** (riichi 의심 1)

- `conflicts`에는 여전히 둘이 없다: `openRiichiReveal.conflicts = ["last_stand","palm_flip","tile_dyeing"]`
  (`open_riichi_reveal.ts:185`). 그러나 **경로 자체가 막혔다** — `full_hand_swap.ts:85`와
  `seat_swap.ts:105`에 `if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: hand is frozen";`
  가 들어갔다(2026-08-20 QA riichi 확정 7의 수정).
- 재현: `tsx qa-lab/verify-score/c7a_openriichi_swap.ts`
  ```
  conflicts(open_riichi_reveal) = ["last_stand","palm_flip","tile_dyeing"]
  [리치 유지 상태의 자기 순]
    full_hand_swap   hand_swap.ok=false   손패바뀜=false   reason=riichi: hand is frozen
    seat_swap        seat_swap.ok=false   손패바뀜=false   reason=riichi: hand is frozen
    hand_swap3       swap3.ok=false       손패바뀜=false   reason=riichi: hand is frozen
  ```
  (대상이 되는 쪽도 `riichiBlocksSwap`로 이미 막혀 있었다.)
- 오픈 리치 선언 자체가 표준 `byPlayer.riichi`를 세운다는 것도 같은 스크립트가 확인한다
  (`open_riichi.ok=true riichi세팅=true`). → 회피 불가능한 역만 경로는 성립하지 않는다.

## 기각 5. soul_strike 폭주 × 대명깡 일발 — **정상** (riichi 의심 3)

- 재현: `tsx qa-lab/verify-score/c7c_soulstrike_ippatsu.ts`
  ```
  폭주=true   discard.ok=true  버림직후 일발=false  대명깡.ok=true  대명깡 후 일발=false  폭주active=false
  폭주=false  (대조군)          버림직후 일발=false  대명깡.ok=true  대명깡 후 일발=false  폭주active=false

  [순서 검증 — 대명깡 뒤 보유자가 다시 쯔모할 때까지 흐름을 돌린다]
    대명깡=false  폭주active=true   phase=turn.act 턴자리=0  쯔모 후 일발=true    ← 설계대로 부활
    대명깡=true   폭주active=false  phase=turn.act 턴자리=2  쯔모 후 일발=false   ← 남지 않는다
  ```
- `soul_strike.ts:284-289`의 `KAN_DECLARED` 리액션이 `kanKind === "kan_open"`에서 폭주를
  즉시 끝내고, `IPPATSU_KEPT`는 `TILE_DRAWN` + `isActive`로만 발동하므로(`:249-259`)
  폭주가 꺼진 뒤의 쯔모에는 붙지 않는다. 턴 고정도 함께 풀려 후로한 사람(p2)에게 넘어간다.
- 안깡·가깡이 폭주를 끝내지 않는 것은 의도대로다(순서를 뺏지 않는다) — 그리고 폭주 중에는
  턴이 보유자에게 고정돼 있어 **타가가 안깡·가깡을 칠 기회 자체가 없다.**

---

## 스크립트

| 파일 | 다루는 건 |
|---|---|
| `qa-lab/verify-score/c1_multiply_chain.ts` | 확정 1 (Multiply 연쇄 · 세 증강 detail 대조) |
| `qa-lab/verify-score/c2_devils_advance.ts` | 확정 2 (폭발 소멸 + 클라 렌더 두 경로 재현) |
| `qa-lab/verify-score/c3_signflip_record.ts` | 확정 3 (SCORE_CHANGED 원장 오귀속) |
| `qa-lab/verify-score/c4_bluff_conjured.ts` | 기각 1 (conjured 표식) |
| `qa-lab/verify-score/c5_dissolve_counts.ts` | 기각 2 (픽스처 오탐 + 실동작 대조군) |
| `qa-lab/verify-score/c6_alwaystenpai_exempt.ts` | 기각 3 (도달 불가 + 규칙 강제 주입) |
| `qa-lab/verify-score/c7a_openriichi_swap.ts` | 기각 4 (리치 손 동결) |
| `qa-lab/verify-score/c7b_siege_ankan.ts` | 확정 4-① (노텐 리치 안깡 허용 vs 대조군 거부) |
| `qa-lab/verify-score/c7b2_siege_fourkan.ts` | 확정 4-② (사깡산료로 노텐 벌부 회피) |
| `qa-lab/verify-score/c7c_soulstrike_ippatsu.ts` | 기각 5 (폭주 × 대명깡 일발) |

`packages/` 는 한 줄도 고치지 않았다.
