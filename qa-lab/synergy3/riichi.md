# 리치 빌드 (riichi / riichi_value / riichi_open / riichi_deny / opp_riichi / menzen) — riichi

## 요약

검증한 조합 **31개** (2·3중 포함) / **확정 10건 · 의심 2건 · 음성 확인 14건**

한 줄 결론 셋:
1. **판수 스택은 깨끗하다** — no_retreat × late_double × riichi_upgrade는 전부 덧셈이고
   카드 문구와 숫자가 맞는다(뒷도라 2배, 트리플 4판, 승격 +1판). 여기서는 버그가 없다.
2. **깨지는 곳은 "조건"이다** — 한 카드가 다른 카드의 **전제 조건을 만들거나 없애는** 조합에서
   설명이 통째로 거짓이 된다. 오픈 리치의 역만 탈출구를 리치 봉인이 없애고(확정 1),
   카운터가 못 만드는 "먼저 리치 건 상대"를 등 떠밀기가 만든다(확정 2).
3. **"N판"이 두 가지 뜻으로 쓰인다** — `score.extraHan`(진짜 판수)과 `addWinHanBonus`
   (점수 환산)가 섞여 있어, 같은 "+2판"이 어떤 조합에서는 판수로 보이고 어떤 조합에서는
   0점으로 사라진다(확정 10).

측정은 전부 유닛 재현이다(`craft` + `mkGame` + `FlowController`). 공용 도구는
[qa-lab/synergy3/riichi/lib.ts](riichi/lib.ts).

---

# 확정

## 확정 1. 🔴 open_riichi_reveal × riichi_seal — 오픈 리치 직격 역만의 **유일한 탈출구를 내가 봉인한다** (회피 불가능한 48,000점)

- 위치: [packages/content/src/augments/open_riichi_reveal.ts:216](../../packages/content/src/augments/open_riichi_reveal.ts#L216)
  (`wctx.fromRiichi !== true` — 역만 게이트) ·
  [packages/content/src/augments/riichi_seal.ts:149](../../packages/content/src/augments/riichi_seal.ts#L149)
  (`riichi.blocked`)
- 설명이 약속한 것:
  - 오픈 리치 — *"**리치를 걸지 않은 사람**에게서 론으로 화료하면 그 화료는 역만이 된다."*
    → 상대에게 남은 대응은 **자기도 리치를 거는 것**(그러면 3판 화료로 끝난다).
  - 리치 봉인 — *"내가 그 리치를 지고 있는 동안 다른 셋은 리치를 걸 수 없다.
    **추가 점수는 붙지 않는다.**"*
- 기대(미리 적음): 봉인은 점수에 관여하지 않는다고 못 박았으니, 오픈 리치의 값은
  그대로 3판 취급(24,000)이고 상대는 추격 리치로 역만을 피할 수 있어야 한다.
- 실제: 봉인이 서면 **상대는 리치 버튼 자체가 사라지므로** `fromRiichi`가 영영 false다 —
  누가 쏘든 무조건 역만이다. "추가 점수는 붙지 않는다"고 적은 카드가 24,000 → 48,000을 만든다.

  | 조합 | p1 추격 리치 | p0 화료 | 점수 |
  |---|---|---|---|
  | 없음(표준 리치) | 가능 | riichi·ippatsu·ittsuu 8판 | 24,000 |
  | A open_riichi_reveal 단독 | **가능** | 8판 (역만 아님) | 24,000 |
  | B riichi_seal 단독 | 불가 | 8판 | 24,000 |
  | **A+B** | **불가** | **open_riichi_strike(역만)** | **48,000** |
  | A+riichi_upgrade(하가만 봉인) | 불가(하가) | **역만** | **48,000** |

- 재현: `tsx qa-lab/synergy3/riichi/repro_open_riichi.ts`
- 영향: 두 장 다 `conflicts`가 아니고, 시너지 표에서 **`riichi`+`riichi_open` 두 축을
  공유해 드래프트가 서로를 끌어당긴다**([synergy.ts:188,193](../../packages/core/src/augment/synergy.ts#L188)).
  `riichi_upgrade`(하가 1좌석만 봉인)로도 같은 일이 일어나므로 실제 발생 빈도가 낮지 않다.
  피격자는 "리치를 걸 수 없다"는 화면을 보면서 대응 불가능한 역만을 맞는다.
- 제안 수정: 역만 게이트를 "쏜 사람이 **리치를 걸 수 있었는데** 안 걸었다"로 좁힌다 —
  `riichi.blocked`가 그 사람에게 true면 역만 대신 3판 취급으로 떨어뜨린다.
  (같은 파일이 이미 `rules.resolve("riichi.blocked")`를 선언 검증에서 쓰고 있다.)

## 확정 2. 🟠 push_riichi × counter — 카운터가 **스스로 만들 수 없는 전제**를 낙인이 만들어 준다 (한 국 +22,000, 피해자는 마이너스)

- 위치: [packages/content/src/augments/push_riichi.ts:182](../../packages/content/src/augments/push_riichi.ts#L182)
  (강제 리치 인터셉터) · [packages/content/src/augments/counter.ts:254](../../packages/content/src/augments/counter.ts#L254)
- 설명이 약속한 것: 카운터 — *"(매 국 1회) **나보다 먼저 리치를 건 상대**에게 추격 리치로
  반격한다."* 이 조건은 원래 **상대가 선택해야** 성립한다(상대가 다마텐으로 가면 카드가 죽는다).
  등 떠밀기 — *"그가 리치 가능한 상태에서 패를 버리는 순간 그 버림이 강제 리치가 된다."*
- 기대: 낙인은 상대를 리치시키는 방해 카드, 카운터는 상대 리치를 먹는 카드. 각각 따로 굴러야 한다.
- 실제: 낙인 → 강제 리치 → 그 자리에서 카운터의 대상이 **확정 생성**된다. 대응이 없다
  (다마텐으로 숨는 것이 카운터의 정면 카운터인데, 그 선택지를 낙인이 지운다).

  | 조합 | p1 강제 리치 | 최종 점수 (p0 / p1) | 카운터 뱅크 |
  |---|---|---|---|
  | 없음 | - | 49,000 / 1,000 | - |
  | A push_riichi 단독 | true | 50,000 / 0 | - |
  | B counter 단독 | false | 49,000 / 1,000 | 발동 못 함 |
  | **A+B** | true | **71,000 / −1,000** | **+20,000** |
  | A+B+no_retreat | true | **83,000 / −25,000** | +8,000 |
  | A+B+all_or_nothing | true | 83,000 / −1,000 | +20,000(+판돈 12,000) |

- 재현: `tsx qa-lab/synergy3/riichi/repro_push_counter.ts`
- 영향: 시너지 표에서 두 장이 `opp_riichi`·`disrupt` **두 축을 공유**해 드래프트가 함께
  띄운다([synergy.ts:200-201](../../packages/core/src/augment/synergy.ts#L200)).
  실버(counter)+프리즘(push_riichi)이라 조합 난도도 낮다. 피해자는 자기 의사 없이
  리치봉 1,000 + 대납 1,000 + 직격 +4판을 한 번에 맞는다.
- 제안 수정: 카운터의 대상에서 **`riichiForced`가 붙은 리치를 제외**한다(payload에 이미 있다).
  "스스로 건 리치"만 사냥감으로 삼는 것이 카드의 뜻이다.

## 확정 3. 🟠 push_riichi × no_ron_pact — 조약을 **남이 깬다** (피해자는 아무 선택도 하지 않았다)

- 위치: [packages/content/src/augments/no_ron_pact.ts:148](../../packages/content/src/augments/no_ron_pact.ts#L148)
  (리치 선언 → `declaredKey` = 파기) · push_riichi의 강제 리치 인터셉터
- 설명이 약속한 것: 불가침 조약 — *"단 **리치·후로(안깡 포함)를 하면** 조약이 사라진다."*
  파기 사유는 전부 **보유자 자신의 행동**으로 적혀 있다.
- 기대: 낙인을 맞아도 "내가 건 리치"가 아니므로 조약은 살아 있거나, 최소한 카드 어딘가에
  그런 말이 있어야 한다.
- 실제: 낙인자가 멘젠 텐파이로 아무 패나 버리는 순간 강제 리치가 서고, 그 리치가 그대로
  조약 파기로 계산된다.

  ```
  [대조군(낙인 없음)] p1 타패 후: 리치=false 론면역=true  배너="조약 유효 — 6순까지 론 불가"
  [낙인 있음]        p1 타패 후: 리치=true  론면역=false 배너="조약 파기 — 론 가능"
  ```
- 재현: `tsx qa-lab/synergy3/riichi/repro_pact.ts`
- 영향: 프리즘 방어 카드가 프리즘 방해 카드 한 장에 **무조건** 무력화된다. 조약은 "첫 6순
  론 면역"이 전부라, 6순 안에 낙인을 맞으면 카드값이 통째로 0이 된다. 대응 수단이 없다
  (후로해서 멘젠을 깨면 조약도 함께 깨진다).
- 제안 수정: 최소한 문구에 "**남이 강제한 리치로도 파기된다**"를 적는다. 설계 의도가
  "스스로 건 리치만"이라면 `riichiForced`가 붙은 리치를 파기 사유에서 뺀다.

## 확정 4. 🟠 stealth_riichi × no_ron_pact — 조약 배너가 **은닉 리치를 그 자리에서 폭로한다**

- 위치: [no_ron_pact.ts:113·167](../../packages/content/src/augments/no_ron_pact.ts#L113)
  (`pactLabel` → `view:*:no_ron_pact:<holder>`)
- 설명이 약속한 것: 스텔스 리치 — *"리치 표시도 리치봉도 상대 화면에 뜨지 않고, 정산
  화면에서 공개된다."* 은닉이 깨지는 경로는 카드가 직접 열거하고, `conflicts`로 8종을
  잠가 두었다(riichi_seal·open_riichi_reveal·all_or_nothing·soul_strike·off_by_one·
  palm_flip·riichi_upgrade·silent_swap). **no_ron_pact는 그 목록에 없다.**
  반대쪽 카드는 *"조약이 유효한지, 파기·만료됐는지는 국 내내 **전원에게 공개**된다"* 다.
- 기대: 은닉 리치를 걸어도 전원 공개 채널에는 아무것도 새지 않아야 한다.
- 실제: 스텔스 선언 **직후** 전원 공개 배너가 뒤집힌다. 다른 14종과 함께 돌린 대조 결과:

  ```
  stealth_riichi                    p1이 보는 p0 리치=false 새 공개채널=[]
  stealth_riichi+no_ron_pact        p1이 보는 p0 리치=false
                                    새 공개채널=[view:*:no_ron_pact:p0#round="조약 파기 — 론 가능"]
  stealth_riichi+free_riichi_discard / late_double / no_retreat / siege_riichi /
  hidden_blade / ura_peek / last_stand / push_riichi / peek_riichi_waits /
  silent_pact / meld_dissolve / regret / counter   → 새 공개채널=[]
  ```
  파기 사유는 리치 아니면 몸통(후로)뿐이고 **후로는 눈에 보인다** — 후로가 없는데
  "파기"가 뜨면 리치임이 확정된다. 화면 두 곳이 서로 다른 말을 한다(리치 표시 false).
- 재현: `tsx qa-lab/synergy3/riichi/repro_stealth_leak.ts`
- 영향: 스텔스의 존재 이유가 통째로 죽는다. 그리고 손해 보는 쪽이 그 사실을 모른다.
- 제안 수정: `riichi.hidden`이 켜져 있으면 배너를 "조약 만료" 표기로 두거나 홀더 채널로
  내린다(카운터가 `riichiHidden`으로 채널을 가르는 것과 같은 패턴이 이미 있다:
  [counter.ts](../../packages/content/src/augments/counter.ts)). 아니면
  `stealth_riichi.conflicts`에 `no_ron_pact`를 추가한다.

## 확정 5. 🟠 hidden_blade × silent_pact — **눈에 보이는 퐁이 깔린 손**에 "후로 화료엔 안 붙는다"던 +2판·뒷도라가 붙는다 (2,900 → 18,000)

- 위치: [packages/content/src/augments/hidden_blade.ts:111](../../packages/content/src/augments/hidden_blade.ts#L111)
  (`variant.isClosed`) — 코어 `openMeldCountOf`가 `silent` 후로를 빼므로 멘젠으로 센다.
- 설명이 약속한 것: 숨은 칼날 — *"쯔모 화료·**후로 화료**, 실제로 리치를 건 손에는
  붙지 않는다."* 묵계 — *"몸통은 **눈에 보이게 눕지만** 그 뒤로도 리치를 걸 수 있고
  멘젠쯔모·멘젠 론 부수가 그대로 붙는다."*
- 기대: 두 문구가 정면으로 부딪친다. 먼저 적어 둔 예상은 "숨은 칼날 쪽이 '후로 화료'를
  명시적으로 배제했으니 안 붙는다"였다.
- 실제: **붙는다.** 통제 4칸:

  | 손 모양 | 증강 | han | ura | 점수 |
  |---|---|---|---|---|
  | 멘젠 | 없음 | 3 | 0 | 7,700 |
  | 멘젠 | hidden_blade | 8 | 3 | 24,000 |
  | 일반 퐁 | 없음 | 2 | 0 | 2,900 |
  | 일반 퐁 | hidden_blade | 2 | 0 | 2,900 (붙지 않음 ✓) |
  | **묵계 퐁** | 없음 | 2 | 0 | 3,900 |
  | **묵계 퐁** | **hidden_blade** | **7** | **3** | **18,000** |

- 재현: `tsx qa-lab/synergy3/riichi/repro_hidden_blade_menzen.ts`
- 영향: 두 카드가 시너지 표에서 `menzen` 축을 공유해 함께 뜬다
  ([synergy.ts:182·206](../../packages/core/src/augment/synergy.ts#L182)). 상대는
  깔린 커쯔를 보고 "저 손은 후로 손"이라 판단하는데, 정산에서 리치도 안 건 손 밑에서
  뒷도라가 뒤집힌다. 어느 쪽이 옳든 **카드 한 장은 반드시 거짓말**이다.
- 제안 수정: 숨은 칼날 detail의 "후로 화료"를 "**드러난** 후로 화료"로 고치고
  묵계 퐁이 예외임을 한 줄 적는다(구현이 의도라면). 의도가 아니라면
  `hidden_blade`가 `meldCountOf`(안깡·묵계 포함)를 보게 바꾼다.

## 확정 6. 🟠 open_riichi_reveal × late_double — 카드 둘이 각각 "3판"을 약속하는데 결과는 **5판**

- 위치: [open_riichi_reveal.ts:61·252](../../packages/content/src/augments/open_riichi_reveal.ts#L61)
  (`RIICHI_UPGRADE_HAN = 2`를 **무조건** 얹는다) ·
  [late_double.ts](../../packages/content/src/augments/late_double.ts) (`addHanBonus +1`)
- 설명이 약속한 것: 오픈 리치 — *"그 리치를 **3판으로 취급**한다."*
  뒤늦은 출진 — *"승격된 리치는 화료 시 **합계 3판**이 된다."*
- 기대: 둘 다 "그 리치의 값을 3판으로 정한다"는 **덮어쓰기** 문장이다. 함께 들면 3판이거나,
  많아야 한쪽이 무시돼야 한다.
- 실제: 차액 +2판이 조건 없이 더해져 **더블리치 2 + 뒤늦은 출진 1 + 오픈 리치 2 = 5판**이 된다.

  | 조합 | han | extra | augPoints | 점수 |
  |---|---|---|---|---|
  | late_double 단독 | 10 | 1 | – | 24,000 |
  | open_riichi_reveal 단독(리치자에게서 론) | 8 | 0 | (밴드 안이라 0점 — 확정 10) | 24,000 |
  | **open + late_double** | 10 | 1 | **open_riichi_reveal +2판 = 12,000** | **36,000** |
  | riichi_upgrade + late_double(대조) | 12 | 3 | – | 36,000 |

- 재현: `tsx qa-lab/synergy3/riichi/repro_open_riichi.ts`
- 영향: `riichi_upgrade`(트리플 4판)와 겹치면 6판이 된다. 두 카드 모두 `riichi` 축이라
  같이 뜬다. 숫자를 미리 셀 수 없다.
- 제안 수정: 차액 계산을 "현재 리치 판수 → 3판"의 **차이**로 만든다. 이미 개문선언
  (`open_riichi`)에 대해서만 `RIICHI_UPGRADE_HAN - 1` 예외를 두고 있는데, 그 자리에서
  더블/트리플/뒤늦은 출진 승격분도 같이 빼면 된다.

## 확정 7. 🟡 counter × 공탁 면제 리치(no_retreat·stealth_riichi) — **대납할 공탁이 없는데** 상대가 내 주머니로 1,000점을 낸다

- 위치: [counter.ts:254](../../packages/content/src/augments/counter.ts#L254)
  — `const due = Math.max(p.riichiCost ?? 0, standardCost);`
- 설명이 약속한 것: *"**내 공탁 1,000점을 그 상대가 대납하고**"* — 대납은 내가 낼 것을
  대신 내 준다는 뜻이다.
- 기대: 공탁이 0인 리치로 추격하면 대납할 원금이 없다 → 0원(과거 QA
  [findings/text.md 확정 6](../findings/text.md)이 그렇게 보고했다).
- 실제: 지금 코드는 `max(실제 낸 값, 규칙값)`이라 **항상 1,000점**을 걷는다. 그런데
  그 1,000점은 공탁(판 위)이 아니라 **내 점수로 직행**한다. 추격 리치 직후 스냅샷:

  ```
  표준 리치 추격        : p0=25,000 (1,000 내고 1,000 받음) p1=23,000 pot=2,000
  no_retreat/stealth 추격: p0=26,000 (한 푼도 안 내고 1,000 받음) p1=23,000 pot=1,000
  ```
  누가 화료하든 이 1,000점은 내 것이다(공탁이면 화료자에게 간다). "대납"이 아니라
  **무조건 징수**다.
- 재현: `tsx qa-lab/synergy3/riichi/repro_push_counter.ts` (A+B+공탁0 행) ·
  `tsx qa-lab/synergy3/riichi/repro_cost_refund.ts`
- 영향: 옛 보고(대납 0원)를 고치면서 반대쪽으로 넘어갔다. 액수는 1,000점이라 작지만
  **점수 이동 방향이 카드와 다르다.**
- 제안 수정: 걷은 금액을 내 점수가 아니라 `riichiPot`에 넣거나(그게 "대납"이다),
  실제 낸 공탁이 0이면 걷지 않는다. 어느 쪽이든 문구를 그에 맞춘다.

## 확정 8. 🟡 siege_riichi × peek_riichi_waits — 노텐 리치를 간파하면 **빈 대기를 받고 국당 1회가 소모**된다 (위조까지 함께 죽는다)

- 위치: [peek_riichi_waits.ts:151](../../packages/content/src/augments/peek_riichi_waits.ts#L151)
  (`waits` 계산에 노텐 방어가 없다) · 같은 파일의 `usedKey` 기록
- 설명이 약속한 것: *"(매 국 1회 + 위조 1회) 리치 중인 상대 하나를 골라 **그 오름패를**
  공짜로 확인한다. 간파한 국에 한해 1회, 내 손패 1장을 **간파한 오름패로** 바꿔 만들 수 있다."*
- 기대: 노텐 리치(공성계)는 오름패가 없다. 최소한 사용 횟수는 안 깎이거나, 후보에서 빠져야 한다.
- 실제: `대기=[] 소모=true` — 국당 1회가 그대로 날아가고, 위조는 "간파한 오름패"가 하나도
  없어 함께 죽는다. 봉인(riichi_seal)이 겹치면 다른 대상도 없다.
  ```
  p0=[siege_riichi]             p1=[peek_riichi_waits] → 간파=대기=[] 소모=true
  p0=[siege_riichi+riichi_seal] p1=[peek_riichi_waits] → 간파=대기=[] 소모=true (p1 리치버튼도 잠김)
  ```
- 재현: `tsx qa-lab/synergy3/riichi/repro_seal_siege.ts`
- 영향: 골드 카드 한 장이 프리즘 카드 한 장에 통째로 무효화된다. **docs/25 §13과 같은
  코드 자리인데 방향이 반대다** — 그쪽은 "간파가 공성계 블러프를 무비용으로 폭로한다"고
  적었다. 실제로는 폭로(대기 0종 = 노텐)와 소모가 동시에 일어나므로 두 기술이 다 맞다.
- 제안 수정: 대기가 0종이면 "노텐 확정"만 알리고 `usedKey`를 세우지 않는다.

## 확정 9. 🟡 리치 선언 버튼 5종이 **같은 순에 한꺼번에 제시되는데** 쓸 수 있는 것은 하나뿐

- 위치: 각 커스텀 리치의 `holderTurnOptions` (no_retreat · all_or_nothing ·
  open_riichi_reveal · soul_strike · stealth_riichi)
- 설명이 약속한 것: 어느 카드도 "다른 리치 선언 증강과 함께 쓰면 하나만 산다"고 적지 않는다.
  `conflicts`도 걸려 있지 않다(스텔스 리치의 목록만 예외).
- 기대: 적어도 카드 하나는 이 사실을 말하거나, 드래프트가 서로를 밀어내야 한다.
- 실제: 넷을 함께 들면 텐파이 순간 **버튼 5개**(표준 포함)가 같은 손패 위에 뜨고,
  하나를 쓰면 나머지는 그 국 내내 사라진다. 남은 것들의 사용 횟수는 소모되지 않지만
  (다음 국에 다시 뜬다) `2국에 1회`짜리끼리 겹치면 절반은 늘 놀고 있다.
  ```
  선언=no_retreat_riichi  선언 전 버튼=[riichi,no_retreat_riichi,all_in_riichi,open_riichi,soul_strike]
                          → 선언 후=[]  소모기록=[no_retreat:usedSeq=0]
  ```
- 재현: `tsx qa-lab/synergy3/riichi/repro_button_clash.ts`
- 영향: 시너지 표가 다섯 장 전부에 `riichi` 태그를 달아 **서로를 끌어당긴다**
  ([synergy.ts:176-192](../../packages/core/src/augment/synergy.ts#L176)).
  "리치 빌드를 완성한다"는 감각을 만들려는 장치가 실제로는 **중복 카드를 몰아 주는** 셈이다.
- 제안 수정: `SynergyEntry`에 "리치 선언 액션은 국당 하나" 축(`riichi_declare`)을 만들어
  서로 `anti`로 걸거나, 카드마다 "리치는 국당 한 번" 머리말을 붙인다(스텔스·오픈 리치에는
  이미 있다 — 나머지 셋에는 없다).

## 확정 10. 🟡 같은 "+N판"이 두 가지다 — soul_strike·open_riichi_reveal의 판수는 **점수 밴드 안에서 통째로 사라진다**

- 위치: [util.ts `addWinHanBonus`](../../packages/content/src/util.ts) (점수 환산) ↔
  `score.extraHan`(진짜 판수: no_retreat · late_double · riichi_upgrade)
- 설명이 약속한 것: 영혼의 일격 — *"그 리치는 **2판**(더블리치는 3판)으로 값하고"*.
  오픈 리치 — *"그 리치를 **3판으로 취급**한다"*.
- 기대: 정산 화면의 판수가 각각 1판·2판 늘어난다.
- 실제: `addWinHanBonus`는 "판을 올려 다시 계산한 점수의 **차이**"라, 만관/하네만 밴드
  안이면 차이가 0이 되어 **판수도 점수도 아무 흔적이 없다**.

  | 조합 | han | augPoints | 점수 |
  |---|---|---|---|
  | soul_strike 단독 (오야 8판) | 8 | **(없음)** | 24,000 |
  | soul_strike + late_double (10판) | 10 | **soul_strike +1판 = 12,000** | 24,000(+12,000) |
  | open_riichi_reveal 단독(리치자 론, 8판) | 8 | **(없음)** | 24,000 |
  | open_riichi_reveal + late_double (10판) | 10 | **+2판 = 12,000** | 24,000(+12,000) |

- 재현: `tsx qa-lab/synergy3/riichi/repro_han_stack.ts` ·
  `tsx qa-lab/synergy3/riichi/repro_open_riichi.ts`
- 영향: 같은 카드가 다른 카드와 겹칠 때만 보상이 나타난다 — 플레이어는 "왜 어떤 판에는
  +2판이 붙고 어떤 판에는 안 붙지?"를 알 방법이 없다. 반대로 `score.extraHan` 계열
  (no_retreat·late_double·riichi_upgrade)은 늘 판수로 보인다. 표기 단위는 같은데
  동작이 다르다.
- 제안 수정: 문구를 "**정산 점수가 N판만큼 오른다(상한 안에서는 오르지 않을 수 있다)**"로
  고치거나, 두 계열을 `score.extraHan` 하나로 통일한다.

---

# 의심

## 의심 1. 🟡 siege_riichi × riichi_seal — 노텐 손 1,000점으로 **국 내내 셋 전부의 리치를 잠근다**

- 동작은 확인했다(`repro_seal_siege.ts`): 텐파이가 아닌 손으로 리치를 걸어도 봉인이 서고,
  `p1 riichi.blocked=true`가 된다. 두 카드 다 프리즘이고 `riichi` 축을 공유한다.
- 카드 어느 쪽도 거짓말은 아니다(공성계는 "화료할 수 없다"만 대가로 적었고, 봉인은
  "그 국의 첫 리치를 내가 선언할 때"만 요구한다). 그래서 **버그가 아니라 밸런스 의심**으로 남긴다 —
  1,000점 + 노텐 벌부만 내고 상대 셋의 리치·일발·뒷도라를 통째로 지운다.
- 확정하지 못한 것: 반장전 전체에서 이 조합의 실제 승률 기여. 하네스로 재지 않았다.

## 의심 2. 🟡 regret × free_riichi_discard — "보존되는 손"이 **텐파이 판정과 다른 손**일 수 있다

- 코드만 읽었다. `regret`의 텐파이 판정은
  [regret.ts `menzenTenpai`](../../packages/content/src/augments/regret.ts)가
  `winHandKindsOf`(= 규칙 `hand.winTileIds`)를 쓰는데, 자유 선언은 그 규칙을
  **리치 선언 시점의 스냅샷**으로 덮는다. 반면 실제로 다음 국에 넘기는 패는
  `handIdsOf`(**물리 손패**)다.
- 자유 선언으로 물리 손패를 마음대로 버려 놓으면 "스냅샷은 텐파이 → 보존 발동",
  "넘어가는 13장은 텐파이가 아님"이 성립할 수 있다. 카드는 *"내가 멘젠 텐파이면
  **그 손패 13장**이 그대로 다음 국의 배패가 된다"*, *"보존되는 손과 대기는 유국 시
  전원에게 공개된다"*고 적었다.
- **미검증** — 황패유국까지 가는 장면을 유닛으로 조립하지 못했다. 다음 담당자가
  `WALL`을 비운 상태에서 `ROUND_SETTLED{outcome:"draw"}`를 태워 확인하면 된다.

---

# 음성 확인 (돌려 봤고 깨끗했다)

| 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|
| no_retreat × late_double | 뒷도라 2배 + 더블리치 2 + 승격 1. no_retreat의 "리치 2판"은 더블에 흡수 | han 7→12, extra 4 (ura×2 3 + late 1) | ✅ 카드대로 (흡수는 detail에 명시돼 있다) |
| no_retreat × riichi_upgrade | 더블 2판 + 뒷도라 2배 | han 8→13, extra 4 | ✅ |
| late_double × riichi_upgrade | 트리플 4판 + 승격 1판 = 리치 5판 | han 9→12, extra 3 | ✅ 두 카드 문구와 일치 |
| no_retreat × late_double × riichi_upgrade | ura×2 + late 1 + triple 2 = extra 6 | extra 6, han 14 | ✅ 3중도 덧셈 |
| no_retreat × 일발 | 일발 2판 | extra에 +1 (일발 1→2) 확인 | ✅ |
| soul_hunt × 내 리치 | 리치를 걸었으면 혼 사냥 +1판은 안 붙는다 | 역 목록에 `soul_hunt` 없음 | ✅ (과거 수정이 살아 있다) |
| soul_hunt × hidden_blade | conflicts — 함께 못 든다 | 강제 설치 시 뒷도라는 한 번만, 판수는 1+2 | ✅ conflicts가 옳다 |
| ura_peek(바꿔치기) × hidden_blade | 뒷도라 표시패를 골라 심는다 | ura 1 → 3 (18,000 → 24,000) | ✅ 두 카드 문구대로 |
| ura_peek × soul_hunt | 같음 | ura 1 → 3 (12,000 → 18,000) | ✅ |
| ura_peek × no_retreat | 심은 뒷도라가 2배 | ura 1→3, extra 3→5 (24,000 → 48,000) | ✅ 예측 가능 |
| free_riichi_discard × off_by_one | 스냅샷 오름패 기준으로 ±1 밀기가 살아야 한다 | 2s 쯔모 → 1s로 밀림 → 쯔모 화료 성립 | ✅ 둘 다 산다 |
| last_stand × stealth_riichi / no_retreat (공탁 0) | 낸 만큼만 환급 = 0 | 취소 후 p0 점수·pot 변화 없음 | ✅ (공탁 이중 환급 없음) |
| last_stand × all_or_nothing | 리치가 풀리면 판돈도 사라지고 리치봉 1,000 환급 | p0 24,000→25,000, pot 2,000→1,000 | ✅ |
| counter × all_or_nothing | 뱅크 보너스 둘이 각각 더해진다 | `counter=20,000` + `all_or_nothing=12,000` 별도 기재 | ✅ 간섭 없음 |
| stealth_riichi × 14종(위 확정 4 표) | 전원 공개 채널에 아무것도 새지 않는다 | no_ron_pact 하나만 샜다 | ✅ 나머지 13종 깨끗 |
| riichi_seal × counter / peek (같은 좌석) | 내가 첫 리치여야 봉인이 서므로 "먼저 리치 건 상대"가 존재할 수 없다 = 상호 파괴 | 그대로 확인 | ⚠ 이미 `synergy.ts`가 `anti: ["opp_riichi"]`로 처리 중 — 재보고 아님 |

---

## 남긴 파일 (`qa-lab/synergy3/riichi/`)

| 파일 | 무엇을 재는가 |
|---|---|
| `lib.ts` | 공용 도구 — `mkGame`(좌석별 증강 설치) · `setIndicators`(도라/뒷도라 지정) · `stackWall`(쯔모 순서 지정) · `winRow`/`table`(대조군 표) · `drive`(자동 진행) |
| `repro_han_stack.ts` | 리치 판수 스택 15칸 (no_retreat × late_double × riichi_upgrade × open_riichi × soul_strike) |
| `repro_ura_ippatsu.ts` | 뒷도라·일발 스택 16칸 + soul_hunt/hidden_blade 다마텐 |
| `repro_open_riichi.ts` | 확정 1·6 — 오픈 리치 역만 게이트 × 봉인 / 판수 덮어쓰기 |
| `repro_push_counter.ts` | 확정 2·7 — 낙인으로 카운터 전제 만들기, 공탁 0 리치의 대납 |
| `repro_pact.ts` | 확정 3 — 강제 리치가 불가침 조약을 깬다 |
| `repro_stealth_leak.ts` | 확정 4 — 스텔스 리치 × 15종의 전원 공개 채널 감사 |
| `repro_hidden_blade_menzen.ts` | 확정 5 — 묵계 퐁 손에 숨은 칼날이 붙는다 |
| `repro_seal_siege.ts` | 확정 8 · 의심 1 — 노텐 리치 × 봉인 / 간파 |
| `repro_button_clash.ts` | 확정 9 — 리치 선언 버튼 5종 동시 제시 |
| `repro_cost_refund.ts` | 음성 — 공탁 면제 리치 × 승부수 환급·pot 산술 |
