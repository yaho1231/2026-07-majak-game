# 리치 12종 — "무조건 리치" (riichiRusher 파생 3종)

## 요약

- **돌린 판**: **1798판** — 1차 1080판(반장전 160 · 동풍전 920) + 검사기를 날카롭게 다듬은
  2차 718판(반장전 178 · 동풍전 540). 4자리 중 2~3자리를 리치형으로 채운
  페르소나 조합 5종을 시드별로 돌려 가며 실행 — `리치돌격`(riichiRusher, augmentBias 0.5) ·
  `리치광`(augmentBias 0.95, 리치 후에도 증강을 계속 누른다) · `리치지연`(alwaysWin=false,
  화료를 미루며 판을 늘린다) + 대조군(울보/베타오리/증강광/혼돈/지연).
- **증강 커버리지**: 담당 12종 전부 12/12. 좌석당 2~3종을 강제 지급하고 나머지는 정상 드래프트.
- **확정 7건 · 의심 3건.**
- **크래시 0 · 훅 예외(effectErrors) 0.**
- **공탁(리치봉) 회계는 깨끗했다** — 선언마다 `riichi.cost`와 `riichiPot` 증가액이 정확히
  일치했고(`RIICHI_POT` 위반 0), 공탁 0원 리치는 전부 `stealth_riichi`/`no_retreat` 보유자였다
  (`RIICHI_FREE` 0). 설명되지 않는 점수 총합 드리프트도 0건이다(아래 "하네스 주의" 참고).
- **2차 718판의 리치 불변식 위반은 3건뿐**이고 전부 위 확정 건이거나 관측 artifact다 —
  `RIICHI_HAND_MOVED` 1국(확정 7, `full_hand_swap`) · `DOUBLE_BAD` 1국(확정 6) ·
  `RIICHI_WALL_LOW` 1국(artifact). 나머지 `RIICHI_RELEASED`는 정상 리치 취소 로그다.
- **리치 후 손 고정**은 확정 7의 `full_hand_swap`/`seat_swap` 경로 하나로만 깨졌다.

### 검사기(qa-lab/riichi/check.ts)가 매 브로드캐스트마다 본 리치 전용 불변식
`RIICHI_POT`(공탁 증가액=cost) · `RIICHI_FREE`(공탁 면제 자격) · `RIICHI_ODD_COST` ·
`RIICHI_REDECLARE`(해제 없이 선언패가 바뀜=이중 납부) · `RIICHI_WALL_LOW`(패산 4장 미만 선언) ·
`DOUBLE_BAD`(더블 승격 증강 없이 첫 버림이 아닌 리치가 double) · `IPPATSU_STALE`(선언 뒤 추가
버림에도 일발 생존) · `IPPATSU_AFTER_CALL`(**남의** 후로 뒤에도 일발 생존) ·
`RIICHI_HAND_MOVED`(선언 시점 13장 중 하나라도 손패∪후로에서 빠져나감 — 남의 차례 기준) ·
`SEAL_BYPASS`/`UPGRADE_SEAL_BYPASS`(봉인 우회) · `RIICHI_RELEASED`(취소 시 환급·공탁 로그).

---

## 확정 1. 🟠 siege_riichi × stealth_riichi / no_retreat / open_riichi_reveal — 노텐 리치가 커스텀 리치 3종에서는 **버튼이 아예 안 뜬다**

- 위치:
  - `packages/content/src/augments/stealth_riichi.ts:250-258` (`holderTurnOptions`의 `tenpaiAfterDiscard` 필터)
  - `packages/content/src/augments/no_retreat.ts:252-262`
  - `packages/content/src/augments/open_riichi_reveal.ts:262-271`
- 기대: 세 파일 모두 validate 안에 **똑같은 주석**을 달아 두었다 —
  "텐파이 요구는 **규칙에서 읽는다**(`riichi.requiresTenpai`) — 하드코딩하면 공성계(siege_riichi)가
  그 규칙을 false로 내려도 커스텀 리치 3종에는 전혀 닿지 않아, '노텐 리치로 블러프한다'는 능력이
  **이 리치들 앞에서만 조용히 사라진다**(docs/25 리치 #11)." 즉 공성계 보유자는 노텐으로도 이 리치들을
  걸 수 있어야 한다.
- 실제: validate는 고쳐졌지만 **후보를 만드는 `holderTurnOptions`가 여전히 `tenpaiAfterDiscard`로
  하드 필터링**한다. 노텐이면 후보가 0개라 프롬프트에 액션이 한 개도 실리지 않는다.
  옵션은 validate로 한 번 더 걸러지므로(리치 봉인 실험으로 확인) 후보 0 = 실행 불가다.
  결과적으로 docs/25 리치 #11의 수정은 **세 증강에서 그대로 무효**다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_siege.ts`
  (p0 = 완전 노텐 `147m147p147s1234z5z`, 증강 = `siege_riichi` + 대상 1종)
  ```
  stealth_riichi       노텐: 표준riichi후보=14 stealth_riichi후보=0    validate=null
  no_retreat           노텐: 표준riichi후보=14 no_retreat_riichi후보=0 validate=null
  open_riichi_reveal   노텐: 표준riichi후보=14 open_riichi후보=0       validate=null
  all_or_nothing       노텐: 표준riichi후보=14 all_in_riichi후보=14    validate=null   ← 정상
  soul_strike          노텐: 표준riichi후보=14 soul_strike후보=0       validate=not tenpai after discard ← 의도된 하드코딩
  ```
  표준 `riichi`는 후보 14개가 뜬다(공성계가 코어에는 제대로 닿는다). `all_or_nothing`만
  후보 필터가 없어 실제로 동작한다.
- 영향: 설명과 다름 + 증강 조합이 죽는다. 공성계(prism)와 이 셋 중 하나를 함께 뽑은 플레이어는
  "노텐 리치 블러프"라는 능력을 잃는다. 게임이 죽거나 점수가 틀리지는 않는다.

## 확정 2. 🟡 riichi_seal · all_or_nothing — 플레이어 노출 문구가 "손바닥 뒤집기로 리치를 풀면"이라고 하지만 palm_flip은 리치를 풀지 않는다

- 위치:
  - `packages/content/src/augments/riichi_seal.ts` `description`·`detail`
    ("**손바닥 뒤집기**나 승부수로 리치를 풀면 봉인도 그 자리에서 풀린다")
  - `packages/content/src/augments/all_or_nothing.ts` `detail`
    ("그 리치가 풀리면(승부수·**손바닥 뒤집기**) 판돈도 함께 사라진다")
  - 실제 동작의 근거: `packages/content/src/augments/palm_flip.ts` — 2026-08-15 개편으로
    리치 해제가 아니라 **대기 교체**가 되었다(리치·공탁 그대로).
- 기대: 문구대로라면 palm_flip 발동 시 봉인이 풀리고 판돈이 사라져야 한다.
- 실제: palm_flip을 써도 리치가 그대로 서 있으므로 봉인도 판돈도 그대로다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_palmflip_texts.ts`
  ```
  [riichi_seal × palm_flip]   flip.ok=true riichi유지=true p1봉인 true -> true
  [all_or_nothing × palm_flip] flip.ok=true riichi유지=true 판돈=12000
  ```
- 영향: 설명과 다름(플레이어가 읽는 카드 문구). 봉인 피격자는 "쟤가 손바닥 뒤집기를 쓰면 내 리치가
  풀린다"는 잘못된 대응 계획을 세운다. 엔진 상태는 정상.
  (같은 문구 잔재가 소스 주석에도 있다: `stealth_riichi.ts` conflicts 주석, `riichi_upgrade.ts`
  `score.extraHan` 주석, `soul_strike.ts` `addWinHanBonus` 주석.)

## 확정 3. 🟡 off_by_one — 오름패 4장이 **이미 다 나온** 죽은 대기에도 화료가 성립하고, 그 종류가 5장이 된다

- 위치: `packages/content/src/augments/off_by_one.ts:74-86` (`tileKindChanged` 발행 지점)
- 기대: detail은 "뽑은 수패가 자신의 오름패와 같은 무늬이고 숫자가 1만큼 어긋나 있으면 그 패가
  그 자리에서 오름패로 바뀐다"고만 말한다. 마작의 물리 법칙(한 종류 4장)은 어디서도 면제하지 않는다.
- 실제: 오름패의 남은 장수를 전혀 보지 않는다. 3통/9삭 샹퐁 대기에서 3통 4장이 이미
  (내 손 2장 + 상대 손 2장) 전부 소진된 상태여도, 4통을 쯔모하면 3통으로 밀려 화료가 뜬다.
  그 순간 게임 안에 **3통이 5장** 존재한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_offbyone_fifth.ts`
  ```
  쯔모 전: pin3=4 pin4=4
  쯔모 후: pin3=5 pin4=3 드로우패종류=pin3
  p0 win 후보=1
  ```
- 영향: 규칙 위반(존재할 수 없는 5번째 패)·정보 오염. 남은 오름패 장수를 세는 쪽
  (`botHelpers.waitTilesLeft`, 대기 잔량 UI)이 0이라고 말하는데 화료가 난다.
  `attrs.conjured=true`가 붙어 화면상 "만들어진 패"로 구분은 되므로 파급은 제한적이다.

## 확정 4. 🟡 공탁 면제 리치 보유자에게 화면이 "리치 불가 — 점수 부족"이라고 거짓말한다

- 위치: `packages/core/src/information/PlayerView.ts:958-982` (`riichiBlockReason`) — `riichi.cost`(=1000)만
  보고 판정하며, 공탁을 내지 않는 커스텀 리치가 열려 있는지는 보지 않는다.
- 기대: `riichiBlocked`는 "지금 리치를 걸 수 없는 이유"다. 스텔스 리치·물러설 수 없는 선언은
  **공탁을 내지 않으므로** 점수가 500점이어도 걸 수 있다(두 액션의 validate에 점수 조건이 없다).
- 실제: 점수 500점인 보유자의 본인 뷰에 `riichiBlocked="notEnoughPoints"`가 실린다 —
  같은 프롬프트에 그 증강의 리치 후보가 14개 떠 있는데도.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_blocked_ui.ts`
  ```
  stealth_riichi   score=500 stealth_riichi후보=14 표준riichi후보=0 view.riichiBlocked=notEnoughPoints
  no_retreat       score=500 no_retreat_riichi후보=14 표준riichi후보=0 view.riichiBlocked=notEnoughPoints
  ```
- 영향: 정보가 틀리다. 점수가 바닥난 플레이어가 "리치를 못 건다"고 읽고 자기 증강의 유일한
  탈출구를 안 쓴다. 엔진 상태·점수는 정상.
  (`no_retreat`은 **선언 전**에만 이 거짓이 뜬다 — 선언 후에는 `riichi.cost` 모디파이어가 0으로 내려간다.)

## 확정 5. 🟡 stealth_riichi — 숨은 리치가 **사가리치(4리치) 유국**에 그대로 카운트되어, 아무도 못 본 4번째 리치로 국이 끝나고 그 자리에서 은닉이 깨진다

- 위치: `packages/core/src/mahjong/flow/FlowController.ts:226-230`
  (`byPlayer[p].riichi != null`를 그대로 세고 `riichi.hidden`을 보지 않는다)
- 기대: 스텔스 리치의 계약은 "타가에게는 리치가 아닌 사람으로 보인다"이다. 타가 셋의 화면에
  리치는 3개뿐이므로 사가리치가 성립할 이유가 없다.
- 실제: 공개 리치 3 + 스텔스 리치 1이면 **그 순간 유국(round.over)** 이 된다. 정산이 열리면서
  숨어 있던 리치가 드러난다(정산은 은닉 대상이 아니다).
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_four_riichi.ts`
  ```
  three          status=awaiting  phase=turn.act   p0가 보는 p3리치=false   ← 3리치는 계속 진행
  three+stealth  status=roundOver phase=round.over p0가 보는 p3리치=true    ← 스텔스가 4번째로 세어져 유국
  ```
- 영향: 정보 누출 + 규칙 놀라움. 상대 셋은 "왜 갑자기 유국인지" 알 수 없고, 스텔스 보유자는
  자기가 숨겼다고 믿은 리치 때문에 국을 스스로 끝낸다. 빈도는 낮다(4명 리치가 필요).

## 확정 6. 🟠 코어 — 더블리치 판정이 **바닥(버림패 존)의 물리 길이**를 본다 · 바닥에서 패가 빠지면 3순째 리치도 더블리치(+이중 선언이면 트리플리치)

- 위치: `packages/core/src/mahjong/flow/flowEvents.ts:411` · `:477`
  ```ts
  const discardsBefore = state.zones[discardsZone(p.player)]?.tileIds.length ?? 0;
  ...
  double: p.riichiDouble ?? (discardsBefore === 0 && !state.round.goAroundBroken),
  ```
- 기대: 더블리치는 "**첫 버림**으로 건 리치"다. `GameState.ts`의 `discardCount` 주석이 바로 이
  함정을 못 박아 두었다 — "`discardedKinds.length`를 턴 카운터로 쓰지 말 것 … 턴 세기에는
  `discardCount`를 쓴다(docs/25 P5)". 그런데 더블리치 판정은 여전히 **바닥 존 길이**를 센다.
- 실제: 바닥에서 패를 빼 가는 증강 — 날치기(`pond_snatch`) · 무덤 도굴(`grave_rob`) ·
  정적의 손(`silent_swap`의 `silent_take`) — 이 내 바닥을 비우면, 이미 두세 장을 버린 뒤의
  리치가 **더블리치(2판)** 로 성립한다. (후로는 `goAroundBroken=true`를 세우므로 막힌다 —
  가드를 통과하는 것은 **바닥만 줄이는** 이 경로다. `pond_snatch.ts:152-175` 리듀서는
  `discardsZone`에서 패를 옮기면서 `goAroundBroken`을 건드리지 않는다.)
- 파급: **이중 선언(riichi_upgrade)의 트리플리치 판정도 같은 값을 본다** —
  `riichi_upgrade.ts:97` `naturalDouble = rs.riichi.discardIndex === 0 && !goAroundBroken`,
  그리고 `discardIndex` 역시 `discardsBefore`다. 그래서 같은 상황에서 리치가 **4판**으로 값한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_double_pond.ts`
  (p0가 이미 2장을 버린 상태 `discards: {p0:"1z2z"}` — 바닥만 비우고 `discardCount`는 2 그대로)
  ```
  바닥비움=false submit.ok=true discardCount(선언전)=2 바닥길이(선언전)=2 → riichi.double=false
  바닥비움=true  submit.ok=true discardCount(선언전)=2 바닥길이(선언전)=0 → riichi.double=true
  바닥비움=false riichi_upgrade: triple플래그=undefined extraHan=0
  바닥비움=true  riichi_upgrade: triple플래그=true      extraHan=2
  ```
- 실전 관측: 대량 플레이에서 `DOUBLE_BAD`(더블 승격 증강이 없는데 첫 버림이 아닌 리치가 `double=true`) **2건**.
  ```
  seed=4032  tonpuu  p3 double=true discardCount=2            augs stealth_riichi+siege_riichi
  seed=40172 hanchan p3 double=true discardCount=2 turnCount=3 augs stealth_riichi+siege_riichi+seat_swap+three_dragons_will
  ```
  둘 다 보유 증강 중 더블리치를 주는 것이 하나도 없다(`riichi_upgrade`·`late_double` 없음).
  두 번째는 **3순째**(turnCount=3)인데도 더블리치다. 바닥과 `discardCount`를 어긋나게 만드는
  경로는 바닥에서 패를 빼 가는 증강만이 아닐 수 있다 — 근본 원인(바닥 길이를 세는 것)은
  위 크래프트 재현이 확정한다.
- 영향: **점수가 틀린다.** 리치 1판이 2판(이중 선언까지 있으면 4판)이 되어 만관 경계를 넘긴다.
  아무도 그 인과를 화면에서 볼 수 없다(바닥에서 패가 사라진 것과 더블리치가 연결되지 않는다).

## 확정 7. 🟠 full_hand_swap · seat_swap — **보유자 자신이 리치 중일 때도** 자기 손패를 통째로 바꿀 수 있다 (리치 손 동결 위반, 호출자 쪽 가드 누락)

- 위치: `packages/content/src/augments/full_hand_swap.ts:92`, `seat_swap.ts:118`
  — 둘 다 `riichiBlocksSwap(rules, state, target.id)`로 **대상**만 본다. 쓰는 사람의 리치는 아무도 보지 않는다.
- 기대: 같은 계열인 `hand_swap3.ts:198-200`은 정확히 이 구멍을 막아 두었다 —
  "보유자 자신이 리치 중이면 손패가 동결된다 — 대상의 리치만 보고 자기 리치를 빠뜨리면
  리치 후 손패 3장을 바꿔치기할 수 있었다(2026-07-29 감사)". docs/22 §14가 기록한
  "**보유자 자신의** 리치를 검사하지 않아 리치 후 손패를 바꾼다" 목록에는
  `hand_swap3`만 있고 **`full_hand_swap`·`seat_swap`은 빠져 있다** — 그 둘은 아직 안 고쳐졌다.
  (docs/24 §1의 알려진 `seat_swap`×리치는 **대상** 쪽 가드 이야기라 다른 건이다.)
- 실제: 리치 중인 보유자가 자기 손 13장을 통째로 남의 손과 맞바꾼다. **리치는 그대로 서 있고
  공탁도 그대로**라, 공개된 리치 선언패와 완전히 무관한 손으로 화료할 수 있다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/riichi/probe_selfswap.ts`
  ```
  full_hand_swap   submit.ok=true  손패바뀜=true  리치유지=true 공탁=1000
  hand_swap3       submit.ok=false 손패바뀜=false 리치유지=true 공탁=1000   ← 가드 있음(정상)
  seat_swap        submit.ok=true  손패바뀜=true  리치유지=true 공탁=1000
  ```
  실전에서도 잡혔다 — `RIICHI_HAND_MOVED`로, `full_hand_swap` 보유자가 리치 중
  자기 손 13장을 통째로 교체한 국이 관측됐다.
- 영향: 리치의 대전제("이 손으로 텐파이 고정")가 무너진다. 상대 셋은 선언패 기준으로 안전패를
  계산하는데 대기가 통째로 바뀐다. `open_riichi_reveal`(공개 대기)과 겹치면 **회피 불가능한
  직격 역만**이 된다 — 저쪽 conflicts는 `palm_flip`·`tile_dyeing`·`last_stand`만 막는다.

---

## 의심

### 의심 1. `open_riichi_reveal` 직격 역만이 **공개 대기와 무관한 패**로도 터질 수 있다 (확정 7과 결합)

`open_riichi_reveal`의 커스텀 역 `open_riichi_strike`는 `winType==="ron" && fromRiichi!==true`와
"이번 국에 선언했는가"만 본다 — **론 패가 공개 목록에 있는지는 검사하지 않는다**. 소스가 스스로
그렇게 적어 두고(`open_riichi_reveal.ts:168-184`) `last_stand`·`palm_flip`·`tile_dyeing` 세 개를
conflicts로 막았다. 그런데 **확정 7의 `full_hand_swap`/`seat_swap`은 그 목록에 없다** — 리치를
유지한 채 손을 통째로 갈아치우므로 같은 "회피 불가능한 역만"이 성립할 수 있다.

**재현 실패 사유**: 두 증강을 한 자리에 몰아넣어도 1798판 안에서 (a) 오픈 리치 선언 →
(b) 같은 국에 자기 손 교환 → (c) 비리치자에게 론, 세 조건이 한 국에 겹치는 장면이 나오지 않았다
(full_hand_swap은 `turnCount <= 1`이라 창이 매우 좁다). 코드상 게이트가 비어 있다는 것까지만 확인했다.

### 의심 2. `siege_riichi` 노텐 리치 중에는 안깡이 **항상** 허용된다

`isRiichiSafeAnkan`(`standardActions.ts:84-107`)은 "깡 전후의 대기 집합이 같으면 허용"이다.
공성계로 노텐 리치를 걸면 대기가 `∅`이라 `before === after === ∅`가 되어 **어떤 안깡이든 통과**한다.
"리치는 손이 잠긴다"는 공성계 자신의 detail("손이 잠기고 쯔모기리가 강제되는 것은 진짜 리치와 같다")과
어긋난다.

**재현 실패 사유**: 조건상 `after`도 공집합이어야 하므로 **노텐 리치가 안깡으로 텐파이가 되지는
못한다** — 실익이 없다. 손해를 만드는 장면(도라 표시패를 추가로 까게 해 상대 손을 키운다 등)까지는
확정하지 못했다.

### 의심 3. `soul_strike` 폭주와 대명깡이 같은 순에 겹칠 때의 일발

폭주 중 보유자의 쯔모마다 일발을 되살리므로(`soul_strike.ts` `IPPATSU_KEPT`), "남의 후로로
폭주가 끝난 뒤에도 일발이 남는가"가 이론상 위험 지점이다. 1798판에서 `IPPATSU_AFTER_CALL`
**0건**이라 실제로는 정상으로 보이지만, 폭주 자체가 2국 1회·텐파이 한정이라 폭주 중 대명깡이
들어간 표본이 매우 적다. **확정하지 못했다.**

---

## 정상 확인 (같은 자리를 봤지만 문제가 없었던 것 — 재검사 낭비를 줄이려 남긴다)

- **리치 봉인(riichi_seal)은 증강 리치 5종을 전부 막는다.** `stealth_riichi` · `no_retreat` ·
  `open_riichi` · `all_in_riichi` · `soul_strike` 모두 validate에서 `riichi.blocked`를 조회하고,
  프롬프트에도 후보가 0개로 뜬다(제출도 거부).
  재현: `tsx qa-lab/riichi/probe_seal.ts` — 5종 전부 `후보=0 submit.ok=false p1리치성립=false`.
- **공탁 회계.** 1798판에서 `riichi.cost`와 `riichiPot` 증가액 불일치 0건, 공탁 0원 리치를 자격
  없는 증강이 쓴 경우 0건, 이상 금액(0/1000 이외) 0건, 해제 없는 재선언(이중 납부) 0건.
  리치 취소(`last_stand`) 시 환급도 정확했다 — 관측 예: `pot 4000 -> 3000, score 21000 -> 22000`.
- **패산 4장 미만 리치.** 리치 액션 6종 전부 `wallLen < riichi.minWallTiles`를 검사한다.
  검사기가 `wall=3`을 2~3건 찍었지만 전부 **관측 시점 artifact**다 — 패산 4장에서 합법적으로
  선언한 뒤 다음 사람이 1장을 뽑은 상태가 그 리치가 보이는 첫 브로드캐스트였다.
- **일발 잔류.** 선언 뒤 추가 버림에도 일발이 남는 경우 0건, **남의** 후로 뒤에 남는 경우 0건.
  (`soul_strike` 보유자가 폭주 중 자기 쯔모마다 일발을 되살리는 것은 설계대로다.)
- **리치 후 손 고정.** 확정 7의 경로를 빼면 위반 0건. 리치 중 안깡(코어가 대기 불변일 때만 허용)은
  손패→후로 존 이동이라 정상이다.
- **크래시·훅 예외 0.** 1798판에서 엔진 throw 0건, `onEffectError` 0건.

---

## 하네스 주의 (내가 쓴 검사기 얘기가 아니라, 공용 harness.ts의 한계)

`SCORE_DRIFT_UNEXPLAINED`가 총 8건 떴는데 **전부 오탐**이다. 하네스의 귀속 로직이 augPoint를
**하나씩만** 대조해서, 같은 국에 뱅크 발행이 두 건 이상이면 "근거 없음"으로 넘어간다.
실제로는 후보들의 **합**이 정확히 드리프트와 일치한다:

```
-3200  = all_or_nothing -6000 + open_riichi_reveal +2800
+5300  = blood_contract +2100 + soul_strike       +3200
-2600  = open_riichi    +1900 + all_or_nothing    -4500
+12000 = jackpot        +6000 + always_tenpai     +6000
+17200 = soul_strike    +8000 + sign_flip         +9200
+600   = soul_strike     +300 + open_riichi        +300
```

→ 귀속을 **부분집합 합**으로 바꾸면 이 오탐이 사라진다. (점수 총합 자체는 깨끗하다.)

---

## 남긴 파일 (`qa-lab/riichi/`)

| 파일 | 용도 |
|---|---|
| `check.ts` | 리치 전용 불변식 검사기 (onState) |
| `run.ts` | 대량 플레이 러너 — `tsx qa-lab/riichi/run.ts <from> <count> [hanchan\|tonpuu]` |
| `probe_siege.ts` | 확정 1 |
| `probe_palmflip_texts.ts` | 확정 2 |
| `probe_offbyone_fifth.ts` | 확정 3 |
| `probe_blocked_ui.ts` | 확정 4 |
| `probe_four_riichi.ts` | 확정 5 |
| `probe_double_pond.ts` | 확정 6 |
| `probe_selfswap.ts` | 확정 7 |
| `probe_seal.ts` | 정상 확인 (리치 봉인) |
| `repro_pay.ts` · `repro_handmove.ts` · `repro_tile7.ts` · `dbg.ts` · `dbg2.ts` | 오탐 추적용 |
