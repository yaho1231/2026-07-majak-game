# 문구 전수 대조 (증강 117종) — "카드 문구를 그대로 믿는 사람"

## 요약

- **대상**: `packages/content/src/augments/*.ts` 113종 + 코어 표준 4종
  (`standardAugments.ts`) = **117종 전수**. 빠뜨린 종 없음.
- **방법**: `name`·`description`·`detail`에서 검사 가능한 주장(수치·횟수·조건·범위·
  정보 공개·부수 약속)을 전부 뽑아 훅 구현과 한 종씩 대조. 카테고리 6묶음으로 나눠
  훑고, 그 위에 문구 전체를 가로지르는 전역 스캔 5종을 얹었다.
- **확정은 실제로 돌려서 확인한 것만.** 코드 판독만으로 끝난 것은 전부 '의심'이다.
  재현 스크립트는 `qa-lab/text/{b1..b6}/` 에 남겼다.
- 이미 다른 도메인 보고서 11종(`qa-lab/findings/*.md`)에 오른 문구 결함
  (three_dragons_will 설명 · riichi_seal/all_or_nothing의 palm_flip 문구 ·
  silent_swap 후리텐 문구 · jackpot 공탁 · discard_lock 채널 등)은 **전부 제외**했다.
- `packages/content/test/description_numbers.test.ts`가 이미 자동 검사하는 범위
  (숫자 실재 + 머리말 한도 3형태)도 제외했다 — 그 검사는 "숫자에 근거가 있는가"만
  보지 이 보고서가 보는 "그 숫자가 문구의 뜻대로 동작하는가"는 보지 않는다.

**확정 35건 · 의심 2건.** 117종 전부 훑었다.

문구 결함은 다섯 모양으로 갈렸다. 어느 하나도 "숫자를 잘못 적었다"가 아니다 —
전부 **문장이 약속한 범위와 코드가 지키는 범위가 다른 것**이다.

| 모양 | 건수 | 대표 |
| --- | --- | --- |
| ① **다른 증강이 끼면 약속이 깨진다** (문구는 조건 없는 단언) | 11 | `danger_sense`×`iron_wall` · `hidden_river`×`hidden_river` · `late_double`×깡 · `no_ron_pact`×`last_stand`/`soul_strike` · `counter`×`no_retreat` · `big_hand`×`parasite` · `scapegoat`×천장/가불 · `disarm`×`three_dragons_will` · `reload`×`discard_lock` |
| ② **문구가 세는 목록·범위가 실제와 다르다** | 9 | `open_riichi_reveal`(배타) · `blood_contract`("등") · `honor_return`(울린 자패) · `foresight`(몇 번째가 내 쯔모) · `seat_swap` · `grave_rob`/`silent_pact`(description↔detail 자체 모순) · `karma`(적립원) · `north_trader`(피해 범위) |
| ③ **약속한 보호·되돌림이 없다** | 5 | `tile_split` `bluff_pretense`(잡패라며 적도라를 태운다) · `regret`("그대로"인데 적도라 소멸) · `frame_up`(첫 바퀴) · `giant_god`(후리텐 해제) |
| ④ **제약이 있다고 적었는데 없다 / 없다고 적었는데 있다** | 6 | `void_kan`(리치 중 발동) · `discard_recall`(리치 금지 미기재) · `haitei_lord`·`cliff_bloom`(역만 미적용 미기재) · `polar_ends`(가깡 반쪽) · `snake_kan`(4장째 소실) |
| ⑤ **취소·정산 뒤 표식/정보가 어긋난다** | 4 | `stealth_riichi`×`last_stand` · `riichi_upgrade`(봉인 표시) · `rank_gate`(지목 배지) · `eternal_dealer`(공개 약속 미이행) · `time_pressure`("무작위"가 결정적) |

**옛 동작이 문구에 남은 것**(`palm_flip` 유형)은 셋 잡혔다 —
`time_pressure`의 "무작위"(코드가 결정성을 위해 일부러 걷어냈고 주석에 경위까지 적혀 있다),
`open_riichi_reveal`의 배타 목록(2026-08-17에 고치면서 반만 셌다),
`silent_pact`의 description(옛 "깡" 표기가 detail의 "대명깡"과 갈라진 채 남았다).

---

# 확정

## 확정 1. 🟠 danger_sense × iron_wall — 후리텐이면서 론할 수 있는 상대를 "안전"이라고 칠해 준다

- 위치: [packages/content/src/augments/danger_sense.ts:68-74](../../packages/content/src/augments/danger_sense.ts#L68)
  ```ts
  // 후리텐인 상대는 그 대기로 **론할 수 없다**. … 오탐은 곧 능력값의 손실이다
  if (isFuriten(state, p.id, opts, rules)) continue;
  ```
- 기대: description — **"내 손패 중 지금 버리면 상대에게 쏘이는 패가 어느 것인지 나에게만 밝혀진다"**,
  detail — **"상대의 특수 화료형까지 반영된다"**. 단언문이다.
- 실제: 후리텐 상대를 통째로 건너뛴다. 그런데 **철벽(iron_wall)은 "후리텐을 무시하고 론할 수
  있다"**가 능력의 전부다. 철벽을 든 후리텐 상대는 탐지에서 완전히 사라지고, 화면은
  "위험패 없음"을 보여 준다. 오탐을 없애려고 넣은 필터가 정반대의 **거짓 안전**을 만들었다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b1/repro_danger_iron.ts`
  ```
  A 후리텐X · 철벽X: kinds=["man3"]  3m위험표시=true
  B 후리텐O · 철벽X (표시 안 되는 게 맞음): kinds=[]  3m위험표시=false
  C 후리텐O · 철벽O (론 가능한데?): kinds=[]  3m위험표시=false
  D 3m 버린 뒤 p1 옵션: [ 'win', 'pon', 'chi', 'chi', 'chi', 'pass' ]   ← 실제로 론이 열려 있다
  ```
- 영향: **설명과 다름 + 그 반대로 손해.** 수비 정보 증강이 정확히 그 정보를 믿은
  플레이어를 쏘게 만든다. 게임이 죽거나 점수 총합이 틀리지는 않는다.

## 확정 2. 🟡 danger_sense — 역이 없어 **론 자체가 불가능한** 상대의 대기까지 위험으로 칠한다

- 위치: 같은 파일 `:73-80` — 대기(`winningKinds`)만 보고 역 성립 여부를 보지 않는다.
- 기대: description — **"지금 버리면 상대에게 쏘이는 패"**. 같은 파일이 후리텐 상대를
  뺀 근거로 "오탐은 곧 능력값의 손실"이라고 적어 두었으니, 기준은 **실제로 쏘이는가**다.
- 실제: 후로해서 역이 하나도 없는 텐파이 상대(론 불가)의 대기가 그대로 위험패로 뜬다.
  후리텐은 빼고 무역은 안 빼는 **반쪽 기준**이다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b1/repro_danger_noyaku.ts`
  ```
  지뢰 탐지 결과 = ["man1","man9","sou2"]  → 2s를 위험으로 표시? true
  2s를 버린 뒤 p1 옵션 = ["chi","pass"] → 실제 론 가능=false
  ```
- 영향: 설명과 다름(과잉 경고). 확정 1과 방향만 반대인 같은 뿌리다.

## 확정 3. 🟠 discard_recall — "내 바닥으로 내보낸" 패가 후리텐 이력에 안 남는다 (내 바닥에 뻔히 놓인 패로 내가 론한다)

- 위치: 코어 표준 증강 [packages/core/src/augment/standardAugments.ts](../../packages/core/src/augment/standardAugments.ts) `discard_recall` 리듀서
  — 존(바닥)에는 넣지만 `byPlayer.discardedKinds`에는 넣지 않는다. 후리텐은
  `discardedKinds`로 판정된다.
- 기대: description — **"자기 순에 쯔모한 패를 내 바닥으로 내보내고"**. '내 바닥으로
  내보낸다'는 곧 버림이고, 버림은 후리텐을 만든다.
- 실제: 화면상 그 패는 내 바닥에 놓여 있는데 후리텐이 걸리지 않아, **자기 바닥에 놓인
  바로 그 패로 론한다.**
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b1/repro_recall.ts`
  ```
  쯔모패=pin3  p1 바닥=wind1
  회수 후: p1 손패 14장, 바닥=pin3, discardedKinds=["wind1"]     ← pin3이 이력에 없다
  p0가 3p 버림. p1 바닥=pin3,wind1 (3p가 내 바닥에 있다)
  p1 옵션=["win","chi","pass"] → 론 가능=true
  ```
- 곁가지(같은 스크립트): 문구에 없는 제약이 하나 더 있다 — **리치 중에는 회수가 아예
  불가능**하다(`리치=true → 후보 0`). description·detail 어디에도 없다.
- 영향: 규칙이 틀린다(후리텐 회피). 표준 증강이라 드래프트 초반부터 널리 깔린다.

## 확정 4. 🟠 foresight — "네 번째가 내 쯔모"가 후로 한 번에 깨진다 (재배열을 그 전제로 설계한다)

- 위치: [packages/content/src/augments/foresight.ts:224](../../packages/content/src/augments/foresight.ts#L224) (detail) ·
  `:157-220` (공개·재배열 리듀서 — 패산 앞 4장을 좌석 배정과 무관하게 그대로 연다)
- 기대: detail — **"이 4장은 하가·대면·상가·나의 다음 쯔모이며 네 번째가 내 쯔모다."**
  이 증강의 값은 "드래그로 순서를 바꿔 다음 한 바퀴를 설계한다"이므로, **몇 번째가
  내 것인지**가 능력 전체의 전제다.
- 실제: 중간에 퐁·치가 한 번이라도 끼면 차례가 건너뛰어 내 쯔모는 **세 번째**가 된다.
  문구를 믿고 4번째 자리에 오름패를 놓아 둔 플레이어는 그 패를 남에게 넘긴다.
  (같은 계열인 `triple_peek`은 detail에 "차례가 밀려도 지금 기준으로 다시 계산된다"고
  적고 실제로 다시 계산한다 — 예지에는 그 문장도 그 계산도 없다.)
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b1/repro_foresight_seat.ts`
  ```
  [퐁 없음] 발동 후 p0 채널 = ["pin6","pin6","pin7","pin7"]
    p0가 실제로 쯔모한 패 = pin7 → 예고 4장 중 **4번째**   일치=true
  [퐁 있음] 발동 후 p0 채널 = ["pin6","pin6","pin7","pin7"]
    p0가 실제로 쯔모한 패 = pin7 → 예고 4장 중 **3번째**   일치=false
  ```
- 영향: 설명과 다름. 능력의 핵심(설계)이 조용히 빗나간다.

## 확정 5. 🟠 hidden_river — 둘이 각자 안개를 걸면 **선언한 보유자마저 남의 안개에 갇힌다**

- 위치: [packages/content/src/augments/hidden_river.ts:131-140](../../packages/content/src/augments/hidden_river.ts#L131)
  ```ts
  if (!fogDeclared(state, holder)) return cur;
  if (rctx.playerId === holder) return cur;   // ← 면제는 '이 인스턴스의 보유자'뿐
  ```
- 기대: description — **"보유자는 모든 플레이어의 버림패를 정상적으로 확인할 수 있다"**,
  detail — **"보유자만 네 개의 바닥을 그대로 읽는다."** 조건 없는 단언이다.
- 실제: `visibility.discards` 모디파이어는 **자기 보유자만** 면제한다. 다른 사람이 건
  안개의 모디파이어는 나를 면제하지 않으므로, 안개 둘이 겹치면 **양쪽 보유자가 모두**
  최근 6장만 보게 된다. 횟수를 태워 시야를 얻는 증강이 시야를 잃는 결과가 된다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b1/repro_fog_two.ts`
  (표기: 각 관전자가 보는 **p2의 바닥**)
  ```
  보유=p0     선언=p0     → p0: "public"                              ← 정상
  보유=p0+p1  선언=p0+p1  → p0: {"mode":"peek","count":6,...}          ← 보유자인데 가려졌다

  (augmentData를 직접 안 만지고 실제 선언으로도 재현)
  p0 실제 선언 → p0가 보는 p2 바닥: "public"
  p1 실제 선언 → p0가 보는 p2 바닥: {"mode":"peek","count":6,"pick":"back"}
  ```
- 영향: 설명과 정반대. 같은 증강을 둘이 뽑는 일은 드물지 않다(수상한 주사위 포함).

## 확정 6. 🟡 counter — 공탁을 안 내는 리치로 추격하면 **대납이 0원**이 된다 (문구는 1000점을 단언)

- 위치: [packages/content/src/augments/counter.ts:202-224](../../packages/content/src/augments/counter.ts#L202)
  — 대납액을 내가 실제로 낸 공탁에서 끌어온다.
- 기대: description — **"내 공탁 1000점을 그 상대가 대납하고"**, detail —
  **"내 리치 공탁 1000점을 그 상대가 대신 낸다."** 금액이 박혀 있다.
- 실제: `no_retreat`(공탁 1000점을 내지 않는 리치)·`stealth_riichi`처럼 **공탁 면제 리치로
  추격하면 대납할 원금이 없어 0원**이 된다. 일발 소멸과 손 가치 강탈은 그대로라
  발동은 "성공"으로 보이는데, 문구가 약속한 1000점만 조용히 사라진다.
  (detail은 예외를 하나만 적어 두었다 — "상대가 1000점 미만이면 그만큼만". 이 경우는 없다.)
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_counter.ts`
  ```
  A 추격리치=riichi             p0공탁=1000 p1점수 24000→23000 (대납 1000) 일발=false struck=true
  A 추격리치=no_retreat_riichi  p0공탁=0    p1점수 24000→24000 (대납 0)    일발=false struck=true
  ```
- 영향: 설명과 다름(점수). 커스텀 리치 계열과 같이 뽑으면 능력의 한 축이 죽는다.

## 확정 7. 🟠 counter — 추격 대상 공개 채널이 **스텔스 리치의 은닉을 깬다**

- 위치: [packages/content/src/augments/counter.ts:224](../../packages/content/src/augments/counter.ts#L224)
  — `augmentDataSet(viewKey("*", \`counter:${holder}\`), target)`
- 기대: `stealth_riichi` detail — **"리치 선언 표시도 리치봉도 타가의 화면에 나타나지 않으며"**.
  은닉이 깨지는 경로는 그 카드가 직접 셋만 열거한다(통째로 바꾸기·손패 3장 교환·자리 바꿈).
  카운터는 그 목록에 없다.
- 실제: 카운터의 대상은 "그 국에 **가장 먼저 리치를 건 한 사람**"이고, 그 대상 id가
  전원 공개 채널에 실린다. 숨은 리치자가 첫 리치였다면 **"저 사람이 리치다"가 그대로
  공개**된다. 리치 표시 자체는 여전히 false라, 화면 두 곳이 서로 다른 말을 한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_counter.ts`
  ```
  B 스텔스선언ok=true 추격리치ok=true
    p2가 보는 p1의 리치표시 = false            ← 은닉은 유지되는 척
    전원 공개 채널 view:*:counter:p0 = "p1"    ← p1이 리치라는 사실이 여기서 샌다
    p1 점수 25000→24000 (숨은 리치자가 남의 공탁을 대납)
  ```
- 영향: 정보 유출. 스텔스 리치의 능력 전부가 상대 증강 하나로 무효가 되는데 어느 쪽
  카드에도 그 말이 없다.

## 확정 8. 🟠 late_double — 안깡을 한 번 치면 **7순 리치 승격이 사라진다** (영상 쯔모가 순으로 세어진다)

- 위치: [packages/content/src/augments/late_double.ts](../../packages/content/src/augments/late_double.ts)
  — 승격 판정이 `turnCount <= 7`인데, 코어의 `turnCount`는 깡의 **영상 쯔모까지** 1순으로 센다.
- 기대: detail — **"7순 안에 선언한 리치는 모두 더블리치 2판으로 값하고 … 앞서 몇 장을
  버렸거나 후로로 순서가 흐트러졌어도 상관없다."** 방해에 강하다고 명시한 카드다.
- 실제: 안깡 한 번이 `turnCount`를 7→8로 밀어, **플레이어가 세기에 7순째인 리치**가
  승격에서 빠진다. 리치 2판 + 보너스 1판, 합 3판이 통째로 증발한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_latedouble_kan.ts`
  ```
  ① 오야 7순 · 깡 없음   riichi.ok=true turnCount=7 double=true
  ② 안깡 후 turnCount 7 → 8 (영상 쯔모가 오야 쯔모로 세어졌다) rinshan=true
     같은 7순 리치        riichi.ok=true double=false  ← 승격이 사라졌다
  ```
- 영향: 설명과 다름(점수). 문구가 "흐트러져도 상관없다"고 못 박은 바로 그 상황에서 깨진다.

## 확정 9. 🟠 no_ron_pact — **파기된 조약이 되살아난다** (리치를 물리면 무론 면역이 돌아온다)

- 위치: [packages/content/src/augments/no_ron_pact.ts:61-67](../../packages/content/src/augments/no_ron_pact.ts#L61)
  ```ts
  if (rs.riichi !== null && rs.riichi !== undefined) return false;
  if (rs.melds.length > 0) return false;
  ```
  파기를 **지금 상태**로만 판정한다 — "한 번 깨졌다"는 사실을 어디에도 기록하지 않는다.
- 기대: detail — **"파기되면 그 뒤로는 평범하게 론당한다."** 파기는 되돌릴 수 없는 사건이다.
- 실제: 리치로 조약을 깬 뒤 `last_stand`(승부수)로 리치를 취소하면 `rs.riichi`가 다시
  `null`이 되어 **면역이 그대로 돌아온다.** 배너도 "조약 유효 — 6순까지 론 불가"로 되돌아간다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_noronpact.ts`
  ```
  ① 3순, 리치 전         ronImmune=true  배너=undefined
  ② 리치 선언 직후        ronImmune=false 배너="조약 파기 — 론 가능"
  ③ 승부수로 리치 취소     ok=true → ronImmune=true   ← 문구에 어긋난다
  ④ 취소 뒤 첫 버림 후     ronImmune=true  배너="조약 유효 — 6순까지 론 불가"
  ```
- 영향: 규칙이 틀린다. 리치로 압박한 뒤 물러나 다시 무적이 되는 무한 방패가 된다.

## 확정 10. 🟡 no_ron_pact — 남의 `soul_strike` 연속 6쯔모가 **내 조약을 6순 만료시킨다**

- 위치: 같은 파일의 만료 판정(`turnCount`) · [packages/content/src/augments/soul_strike.ts](../../packages/content/src/augments/soul_strike.ts)
  의 연속 6쯔모가 `turnCount`를 6 올린다.
- 기대: description — **"매 국 첫 6순은 론당하지 않는다."** 플레이어가 세는 '순'은
  자기 차례가 도는 횟수다.
- 실제: 다른 사람이 영혼의 일격으로 혼자 6번 뽑는 동안 `turnCount`가 1→7이 되어,
  **내가 한 번도 더 버리지 않았는데** 조약이 만료된다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_soulstrike_turncount.ts`
  ```
  시작: turnCount=1 p1(불가침) ronImmune=true
  영혼의 일격 6쯔모 뒤: turnCount=7 p1(불가침) ronImmune=false
    p1 배너=[["view:*:no_ron_pact:p1#round","조약 만료 — 론 가능"]]
  ```
- 영향: 설명과 다름. disrupt-b가 함구령·박무의 '순' 계수를 의심으로 올렸는데, 이쪽은
  같은 뿌리를 **확정**으로 잡은 것이다(증강 하나가 남의 순 계수를 6 밀어 버린다).

## 확정 11. 🟡 silent_pact — description과 detail이 **서로 다른 말**을 한다 (안깡이 손을 여는가)

- 위치: [packages/content/src/augments/silent_pact.ts](../../packages/content/src/augments/silent_pact.ts) description ↔ detail
  - description: "같은 국에 평범한 퐁·치·**깡**을 하나라도 더 하면 그 순간 손이 열려 전부 잃는다."
  - detail: "같은 국에 평범한 퐁·치·**대명깡**을 하나라도 더 하면 …"
- 기대: 둘 중 하나가 맞아야 한다. 카드 앞면(description)은 **모든 깡**이 파기라고 읽힌다.
- 실제: 구현은 detail 쪽이다 — **안깡은 손을 열지 않는다.** 묵계 퐁 + 안깡 손은 그대로
  멘젠이라 리치가 열리고 멘젠쯔모가 붙는다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_silentpact_ankan.ts`
  ```
  묵계퐁 + none : openMeldCount=0 표준riichi=null                              yaku=menzen_tsumo,yakuhai_haku
  묵계퐁 + ankan: openMeldCount=0 표준riichi=null                              yaku=menzen_tsumo,yakuhai_haku
  묵계퐁 + pon  : openMeldCount=1 표준riichi="riichi requires a closed hand"   yaku=yakuhai_haku
  ```
  (`표준riichi=null` = 거부 사유 없음 = 리치 가능)
- 영향: 설명과 다름. 한 줄 요약만 읽는 플레이어는 **쳐도 되는 안깡을 스스로 포기한다** —
  능력을 손해 보는 방향의 오독이라 끝까지 들키지 않는다.

## 확정 12. 🟠 stealth_riichi × last_stand — 리치를 물려도 은닉 표식이 남아, **같은 국에 두 번째 리치**가 서고 그 리치까지 숨는다

- 위치: [packages/content/src/augments/stealth_riichi.ts](../../packages/content/src/augments/stealth_riichi.ts)
  — 취소 경로(`last_stand`)가 `stealth_riichi:active:{roundKey}:{holder}` 표식을 지우지 않는다.
- 기대: description — **"(매 국 1회 — 리치는 국당 한 번)"**.
- 실제: 승부수로 리치를 취소하면 `riichi=null`이 되는데 은닉 표식은 `true`로 남는다.
  그 결과 ① 같은 국에 스텔스 리치를 **한 번 더** 걸 수 있고(후보 2개, 제출 성공),
  ② 그 뒤 **공탁 1000점을 낸 평범한 표준 리치까지 `hidden=true`가 되어 숨는다.**
  공탁은 냈는데 남들 화면에는 리치가 없다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_stealth_laststand.ts`
  ```
  ① stealth_riichi ok=true riichi={"double":true,"ippatsu":true,…,"cost":0} hidden=true
  ② cancel_riichi ok=true riichi=null
     남아 있는 은닉 표식: [["stealth_riichi:active:1-1-0:p0",true]]
  ③-a 같은 국 2번째 stealth_riichi: 후보=2 submit.ok=true riichi=true
  ③-b p1이 보는 p0 리치=false / p0 본인이 보는 자기 리치=true
  ③-b 표준 riichi ok=true 공탁지불=1000 pot=1000 → riichi.hidden=true
  ```
- 영향: 횟수 규약 파괴 + 정보 유출(반대 방향). "국당 한 번"이 두 번이 되고,
  은닉 대가 없이(공탁을 내고도) 은닉을 얻는다.

## 확정 13. 🟡 riichi_upgrade — 리치를 물려도 **"봉인 대상" 공개 표시가 남는다** (실제 봉인은 이미 풀렸다)

- 위치: [packages/content/src/augments/riichi_upgrade.ts](../../packages/content/src/augments/riichi_upgrade.ts)
  — 봉인 판정은 리치 유무를 실시간으로 보는데, 공개 채널은 선언 때 쓰고 취소 때 안 지운다.
- 기대: detail — **"자신의 하가의 리치가 내가 그 리치를 지고 있는 동안 봉인되어 … 봉인
  대상은 전원에게 공개된다."** 공개 표시는 봉인과 같이 살고 같이 죽어야 한다.
- 실제: 승부수로 리치를 취소하면 봉인은 즉시 풀리는데(`p1봉인=false`) 공개 채널은
  여전히 `"p1"`이다. **하가는 리치를 걸 수 있는데 화면은 "너는 봉인됐다"고 말한다.**
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b2/repro_upgrade_seal.ts`
  ```
  ① 선언 전            p1봉인=false
  ② 이중 선언 리치 후    p1봉인=true  공개채널="p1"
  ③ 승부수로 리치 취소   p1봉인=false 공개채널="p1"   ← 채널은 아직 "p1"
  ```
- 영향: 정보가 틀린다. 봉인당한 쪽이 리치를 포기한다 — 손해를 보는 사람이 피해자다.

## 확정 14. 🟠 tile_split — "가장 고립된 **잡패**"가 실제로는 **도라·적도라를 태운다**

- 위치: [packages/content/src/augments/tile_split.ts:70](../../packages/content/src/augments/tile_split.ts#L70)
  → `botHelpers.isolatedIndex` — 이웃 패 수만 본다. **도라·적도라 가드가 없다.**
- 기대: detail — **"두 번째 조각은 손패에서 가장 고립된 **잡패** 하나가 그 조각으로 바뀌어
  채우므로 손패 장수는 변하지 않는다."** '잡패'는 값이 없는 패라는 뜻이다.
  같은 팩의 `even_world`는 이 문제를 알고 도라·적도라를 명시적으로 지킨다
  ([even_world.ts:77-78](../../packages/content/src/augments/even_world.ts#L77)) —
  기준은 이미 저장소 안에 있다.
- 실제: 고립도만 보므로 **그 국의 도라이면서 적도라이기도 한 패**가 재료로 뽑혀 사라진다.
  경고 문구도 없다(`alchemist`·`tile_dyeing`은 둘 다 ⚠로 적도라 소멸을 경고한다).
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b3/probe.ts`
  ```
  ##### 1. tile_split
    도라 표시패: pin4 → 도라는 pin5
    발동 전 손패: man1 … man9 pin5(적) sou2 sou2
    발동 후 손패: man1 … man8 man4 man5 sou2 sou2
    ⇒ 재료로 쓰인 패 = man5 (원래 pin5(적)·도라)  red 유지=false
  ```
  (도라 1판 + 적도라 1판이 한 번에 증발한다)
- 영향: 설명과 다름(점수). 플레이어는 "잡패를 쓴다"는 말을 믿고 발동한다.

## 확정 15. 🟠 bluff_pretense — 같은 문제: "가장 고립된 잡패"가 **적도라를 태운다**

- 위치: [packages/content/src/augments/bluff_pretense.ts:56](../../packages/content/src/augments/bluff_pretense.ts#L56)
  — 확정 14와 같은 `isolatedIndex`, 같은 결함.
- 기대: detail — **"부족한 세 번째 장은 손패에서 가장 고립된 **잡패** 하나가 그 패로
  변신(생성패)해 채우며"**. 이 카드도 적도라 경고가 없다.
- 실제: 적5가 재료로 뽑혀 다른 패로 덮어써지고 빨간색이 사라진다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b3/probe.ts`
  ```
  ##### 3. bluff_pretense
    발동 전 손패: man1 … man9 pin5(적) wind1
    발동 후 손패: man1 man2 man3 man4 man5(적) man6 man7 man8 man9
    멘쯔: wind1wind1wind1
    ⇒ 재료 pin5(적) 의 지금 kind = wind1, red=false
  ```
- 영향: 설명과 다름(점수). 14와 묶어 한 곳(`isolatedIndex`)을 고치면 둘 다 닫힌다.

## 확정 16. 🟡 regret — "그 손패 13장이 **그대로**"인데 적도라만 빠진 채 돌아온다

- 위치: [packages/content/src/augments/regret.ts:116-137](../../packages/content/src/augments/regret.ts#L116)
  — 보존하는 값이 `kind`(suit·rank)뿐이고, 주입할 때 주석대로 `red`를 끈다.
- 기대: description — **"그 손패 13장이 그대로 다음 국의 배패가 된다"**, detail —
  **"보존되는 손과 대기는 유국 시 전원에게 공개된다."** '그대로'라고 적혀 있다.
- 실제: 진짜 적5(적도라)도, 붉은 손길이 각인한 적도라도 **평범한 패로 돌아온다.**
  코드에는 "보존하는 것은 kind뿐이므로 적도라 표식은 따라오지 않는 게 맞다"는 의도 주석이
  달려 있다 — 구현은 의도대로지만 **문구가 그 의도를 한 글자도 안 적었다.**
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b3/repro_regret_red.ts`
  ```
  유국 직전 p0 손패(13장): man1 … man5(적)[p0] … pin4 pin5(적)
  보존된 값(regret:keep:p0): [{"suit":"man","rank":1}, … ]
    ⇒ 보존 값에 red/redFor 필드가 있는가: false
  다음 국 p0 배패: man1 man2 … pin4 pin5
    ⇒ 되받은 손의 적도라 장수 = 0 (유국 직전엔 2장)
  ```
- 영향: 설명과 다름(점수). 텐파이를 넘긴다는 카드의 값이 도라 2판만큼 조용히 깎인다.

## 확정 17. 🟠 honor_return — **남이 울어 간 자패**를 "내가 버린 자패"에서 빼먹는다

- 위치: [packages/content/src/augments/honor_return.ts:64](../../packages/content/src/augments/honor_return.ts#L64)
  ```ts
  const ids = state.zones[discardsZone(holder)]?.tileIds ?? [];
  ```
  **바닥 존(실물)** 을 읽는다 — 울려 나간 패는 존에서 빠져 있다.
- 기대: description — **"이번 국에 **내가 버린** 자패를 가장 최근 것부터 최대 4장까지
  기억해"**. 기준은 '내가 버렸는가'지 '아직 내 바닥에 남아 있는가'가 아니다.
  같은 상태의 후리텐 이력(`discardedKinds`)은 울려 나간 패도 그대로 센다.
- 실제: 東·南·白·白 넉 장을 버렸는데 그중 白 한 장이 퐁당하면 **세 장만** 기억된다.
  자패를 흘려 두는 것이 이 카드의 플레이인데, 그 자패를 상대가 울어 가면 손해가 두 번 난다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b3/repro_honor_return_called.ts`
  ```
  p0가 白 버림 → p0 바닥: wind1 wind2 dragon1 dragon1
  p1 퐁 후 p0 바닥: wind1 wind2 dragon1
  p0 discardedKinds(후리텐 이력): wind1 wind2 dragon1 dragon1     ← 이력에는 4장 다 있다
  honor_recall ok = true / 기억된 자패: dragon1 wind2 wind1
    ⇒ 실제로 버린 자패 = 東·南·白·白 4장 / 기억된 것 = 3장
  ```
- 영향: 설명과 다름. 같은 상태 안에 정답(`discardedKinds`)이 있는데 다른 곳을 읽는다.

## 확정 18. 🟠 seat_swap — 후로 직후의 '쯔모패 없는 순'에 열려, 문구의 두 약속이 동시에 깨진다

- 위치: [packages/content/src/augments/seat_swap.ts](../../packages/content/src/augments/seat_swap.ts)
  — 발동 창이 "아직 한 장도 버리지 않은 내 순"이라 **퐁 직후의 순도 통과**하고,
  대상 조건은 `sameHandSize`(손패 장수 + 후로 개수 일치)라 **후로 개수가 같기만 하면 뜬다.**
- 기대: detail 두 문장 —
  ① **"내가 방금 뽑은 쯔모패 한 장만 내게 남아 그대로 버림을 이어 간다."**
  ② **"손패 장수와 후로 개수가 나와 같은 상대만 대상이 된다 — 이미 울어 둔 상대는
  목록에 뜨지 않는다."**
- 실제: 내가 퐁을 한 직후에 발동하면 —
  ① 쯔모패가 아예 없어서(`lastDrawnTile=null`) 남는 한 장이 **내 옛 손패 중 아무 패**가 된다.
  ② 나도 울었으므로 `sameHandSize`가 **"이미 울어 둔 상대"를 후보로 올린다** —
     문구는 조건 없이 "뜨지 않는다"고 적었다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b3/repro_seat_swap_postcall.ts`
  ```
  === B) p0가 펑한 직후 (p0 멘쯔 1, 상대는 전부 멘쯔 0)
    seat_swap 후보 대상 = []
  === C) p0 펑 직후 · p1도 이미 펑해 둠
    seat_swap 후보 대상 = [p1]      ← 문구대로면 '이미 울어 둔 p1'은 안 떠야 한다
    lastDrawnTile=null
    내게 남은 옛 손패 = [pin1#37]  / 발동 직전 쯔모패 = 없음(null)
    ⇒ 남은 패가 '방금 뽑은 쯔모패'인가: false
  ```
- 영향: 설명과 다름 두 곳. B와 C를 비교하면 규칙이 "울었는가"가 아니라 "**서로 같은 만큼
  울었는가**"임이 드러나는데, 문구는 그 말을 하지 않는다.

## 확정 19. 🟡 open_riichi_reveal — detail이 세는 배타 목록에 **스텔스 리치가 빠져 있다** (docs/30에서 고친다던 항목이 반만 고쳐졌다)

- 위치:
  - 문구: [packages/content/src/augments/open_riichi_reveal.ts](../../packages/content/src/augments/open_riichi_reveal.ts) `detail` 마지막 문장
  - 실제 잠금: `stealth_riichi.conflicts`에 `open_riichi_reveal`이 들어 있다 (2026-08-05 `8ae3040`)
  - 판정: [packages/core/src/augment/Augment.ts:528-529](../../packages/core/src/augment/Augment.ts#L528)
    — 후보 필터는 **양방향**을 본다
    (`d.conflicts.includes(a) || catalog.get(a).conflicts.includes(d.id)`)
- 기대: detail — **"승부수·손바닥 뒤집기·염색과는 함께 가질 수 없다."**
  플레이어에게 배타 관계를 알려 주는 창구는 이 문장뿐이다 — 클라이언트에 conflicts를
  그리는 UI가 없다(`grep -rn "conflicts" packages/client/src/` → 0건).
- 실제: 실제로 잠기는 것은 **네 종**. 문구가 세는 3종에 더해 **스텔스 리치**가 후보에서
  사라진다. `open_riichi_reveal.conflicts` 배열 자체는 3개지만 코어가 반대편 선언까지 본다.
- 경위: docs/30 §357이 "`conflicts` 3종도 미기재"를 지적했고 2026-08-17 `1afddb4`가 문장을
  넣어 고쳤는데, 그때 센 것은 **자기 파일의 배열 3개뿐**이라 2026-08-05에 반대편에서 걸어 둔
  네 번째 배제가 빠졌다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/repro_open_riichi_conflicts.ts`
  ```
  DETAIL 끝문장: 승부수·손바닥 뒤집기·염색과는 함께 가질 수 없다.
  실제 conflicts: [ 'last_stand(승부수)', 'palm_flip(손바닥 뒤집기)', 'tile_dyeing(염색)' ]
  대칭 배타 전체: [ …3종…, 'stealth_riichi(스텔스 리치)' ]
  문구에 없는데 실제로 잠기는 것: [ 'stealth_riichi(스텔스 리치)' ]
  ```
- 영향: 설명과 다름. "오픈 리치 + 스텔스 리치" 빌드를 짠 플레이어는 그 픽이 **후보에
  아예 안 뜨는 이유를 알 방법이 없다.**

## 확정 20. 🟡 haitei_lord · cliff_bloom — "+3판 / 4판" 보상이 **역만 화료에는 한 푼도 안 붙는데** 문구에 그 말이 없다

- 위치: [packages/content/src/augments/haitei_lord.ts:19](../../packages/content/src/augments/haitei_lord.ts#L19) (`addWinHanBonus`) ·
  [packages/content/src/augments/cliff_bloom.ts:440](../../packages/content/src/augments/cliff_bloom.ts#L440) (`score.extraHan`)
  — 두 경로 모두 역만 화료에서 추가 판을 버린다.
- 기대: `haitei_lord` detail — **"그대로 해저로월 쯔모로 화료할 수 있고 +3판을 얻는다."**
  `cliff_bloom` detail — **"만개한 국의 화료에서는 영상개화가 1판이 아니라 4판으로 계산된다."**
  둘 다 예외 문구가 없다. 반면 같은 보상을 주는 `avenger`·`true_dragon`·`ankan_dora`·
  `no_retreat`는 전부 **"(역만에는 미적용)"**을 명시한다 — 저장소의 표기 관례가 이미 있다.
- 실제: 역만이 뜨는 순간 보너스가 0이 된다. 하필 이 둘은 역만과 겹치기 쉬운 카드다 —
  해저의 지배자는 해저 쯔모를 확정시켜 스안커·사암각 같은 손에 얹히고,
  절벽 위에 피어난 꽃은 깡 두 번(=산깡쯔·스깡쯔 사정권)을 조건으로 만개한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b4/han_bonus_yakuman.ts`
  ```
  평범한 손 (3판 40부 자 쯔모)   기본 5200점 → +3판 보너스 = 6800점
  만관 직전 (4판 40부)           기본 8000점 → +3판 보너스 = 4000점
  역만 1 (스안커 등, 해저로월 동반) 기본 32000점 → +3판 보너스 = 0점   ← 한 푼도 안 붙는다
  더블 역만                      기본 64000점 → +3판 보너스 = 0점

  === score.extraHan 경로(cliff_bloom·avenger·true_dragon)도 같은가 ===
    yakumanCount=0: han 3 → 5200점 / han 6 → 12000점  (차이 6800)
    yakumanCount=1: han 3 → 32000점 / han 6 → 32000점  (차이 0)
  ```
- 영향: 설명과 다름. 구현은 관례대로 맞고 **문구만 빠졌다** — 고칠 곳은 텍스트 두 줄이다.

## 확정 21. 🟡 polar_ends — "1·9 섞은 몸통 위에 가깡"이 **한쪽 방향으로만** 된다

- 위치: [packages/content/src/augments/polar_ends.ts:47](../../packages/content/src/augments/polar_ends.ts#L47) (detail) ·
  `:49` `ctx.setHolderRule("scoring.polarEnds", true)` — 이 규칙은 **채점(decompose)** 에만 걸리고,
  가깡 validate는 여전히 "얹는 패가 멘쯔 대표 kind와 같은가"를 표준 규칙으로 본다.
- 기대: detail — **"1과 9를 섞어 퐁한 몸통 위로는 가깡을 얹을 수 있다(1만1만9만 + 1만).
  안깡·대명깡만 대상이 아니다."** 카드의 대전제는 "같은 무늬의 1과 9가 한 패로 통한다"다.
- 실제: 얹을 수 있는 것은 **그 멘쯔의 대표 패와 같은 랭크뿐**이다. 문구가 든 예시
  (대표 1m에 1m)는 되지만, 같은 몸통에 9m를 얹는 것은 거부된다. 퐁한 순서에 따라
  대표가 9m이 되면 반대로 9m만 되고 1m이 막힌다 — 플레이어에게는 **같은 몸통인데 어떤 날은
  되고 어떤 날은 안 되는** 것으로 보인다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b4/polar_kakan.ts`
  ```
  === detail의 예시 그대로: 퐁 1m1m9m 위에 1m 가깡
    퐁 몸통=[1m,1m,9m] 대표=1m / 얹는 패=1m   submit(shouminkan) -> ok=true
  === 같은 몸통 위에 9m 가깡 (1·9는 한 패로 통해야 한다)
    퐁 몸통=[1m,1m,9m] 대표=1m / 얹는 패=9m   submit -> ok=false  "tile does not match the meld"
  === 실제 퐁 순서: 9m9m를 들고 1m를 퐁 → 대표가 9m
    퐁 몸통=[9m,9m,1m] 대표=9m / 얹는 패=1m   submit -> ok=false  "tile does not match the meld"
    같은 몸통에 9m 가깡                        submit -> ok=true
  ```
- 영향: 설명과 다름. 문구가 예시로 든 한 경우만 우연히 통과해 결함이 눈에 안 띈다.

## 확정 22. 🟠 snake_kan — 장사진을 슌쯔로 셀 때 **네 번째 패가 손에서 사라져** 탕야오·찬타가 부당하게 붙는다

- 위치: 채점 경로 `packages/core/src/mahjong/scoring/WinContext.ts`의 `buildVariants`/`allKinds`
  — 4연속 깡을 `run:6m7m8m`으로 해석한 변형에서 **9m이 `allKinds`에 실리지 않는다.**
- 기대: detail — **"채점에서는 슌쯔로도 커쯔(깡)로도 셀 수 있어 … 둘 중 비싼 쪽이 자동으로
  잡힌다."** 어느 쪽으로 세든 **네 장 다 손에 있는 패**다. 문구 어디에도 한 장이 판정에서
  빠진다는 말은 없다.
- 실제: 슌쯔 해석에서 남는 한 장이 역 판정용 패 목록에서 통째로 빠진다. 그래서 —
  - **9m이 든 장사진(6-7-8-9m)으로 탕야오가 성립한다.** 같은 손을 표준 789m 슌쯔 + 9m으로
    들면 당연히 탕야오가 안 붙는다.
  - **찬타·준찬타도 같은 구멍**이다 — 1-2-3-4m 장사진이 `run:123m`으로 잡히면 요구패가
    아닌 4m이 사라져 찬타가 붙는다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b4/snake.ts`
  ```
  === ⚠ 4번째 패가 allKinds에서 사라지는가 (탕야오·찬타)
    kan6789m(9m 포함!) + 234p567p345s22s → 탕야오가 붙나?
      -> [menzen_tsumo:1 tanyao:1] han=2 fu=40
      allKinds: 2p,3p,4p,5p,6p,7p,3s,4s,5s,6m,7m,8m,2s,2s     ← 9m이 없다
    (대조) 789m + 234p567p345s22s (일반 슌쯔, 9m 있음)
      -> [menzen_tsumo:1] han=1 fu=30                          ← 탕야오 없음(정상)

  === ⚠ 찬타/준찬타도 같은 구멍인가
    kan1234m + 123p 789s 111z + 99m  -> [… chanta:2] han=5 fu=50
    kan1234m + 123p 789s 789p + 99m  -> [… junchan:3] han=4 fu=40
  ```
- 영향: **규칙이 틀린다(점수).** 문구가 광고하는 "비싼 쪽이 자동으로 잡힌다"가, 실제로는
  존재하지 않는 손을 만들어 비싸게 잡는 데까지 간다.

## 확정 23. 🟡 blood_contract — "치또이 **등**"이라 적었지만 계약 목록은 **정확히 8종에서 닫혀 있다**

- 위치: [packages/content/src/augments/blood_contract.ts:39-48](../../packages/content/src/augments/blood_contract.ts#L39)
  ```ts
  const CONTRACT_YAKU = ["tanyao","pinfu","toitoi","honitsu","chinitsu","sanshoku","ittsuu","chiitoitsu"] as const;
  ```
  `:73-74` — 목록 밖은 `"not a contractable yaku"`로 거부.
- 기대: detail — **"지정 역 목록(탕야오·핑후·또이또이·혼일색·청일색·삼색·일기통관·치또이 **등**) 중
  하나를 골라"**. '등'은 더 있다는 뜻이다.
- 실제: 그 여덟이 **전부**다. 산안커·찬타·준찬타·량페코·혼노두·삼색동각·소삼원은 전부 거부된다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/probe_contract_yaku.ts`
  ```
    sanankou         → 불가(not a contractable yaku)
    chanta           → 불가(not a contractable yaku)
    junchan          → 불가(not a contractable yaku)
    ryanpeiko        → 불가(not a contractable yaku)
    honroutou        → 불가(not a contractable yaku)
    sanshoku_doukou  → 불가(not a contractable yaku)
    shousangen       → 불가(not a contractable yaku)
  ```
- 영향: 설명과 다름. 또이또이+산안커를 노리며 "산안커를 계약하겠다"고 계획한 플레이어가
  버튼 앞에서야 없는 걸 안다. '등' 한 글자만 빼면 닫힌다.

## 확정 24. 🟡 karma — "점수를 잃을 때마다" 쌓인다는데 **정산 델타로 잃은 것만** 쌓인다

- 위치: [packages/content/src/augments/karma.ts](../../packages/content/src/augments/karma.ts)
  — 적립을 `ROUND_SETTLED`의 `payload.deltas`에서만 읽는다.
- 기대: description — **"점수를 잃을 때마다 그 손실이 '업보' 게이지로 쌓이고(전원 공개)"**.
  조건이 붙어 있지 않다.
- 실제: 국 정산 밖에서 빠져나가는 점수는 하나도 안 쌓인다. 확인한 두 경로 —
  ① **남의 카르마에 뜯긴 점수**(4,000점을 뜯겨도 게이지 0), ② **리치 공탁 1,000점**.
  ①은 특히 고약하다 — 카르마끼리 만나면 먼저 태운 쪽만 계속 이득을 본다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_karma_and_bighand.ts`
  ```
  ===== ① 카르마 게이지 적립원
    소각 전 점수  p0:25000 p1:25000 p2:25000 p3:25000
    소각 후 점수  p0:37000 p1:21000 p2:21000 p3:21000
    ★ p1은 4000점을 잃었는데 p1 게이지 = 0
  ===== ①-b 카르마 — 리치 공탁 1000점
    ★ 1000점을 잃었는데 p0 게이지 = 0
  ```
- 영향: 설명과 다름. detail은 "국 정산에서 점수를 잃으면"이라 좁게 적었지만 카드 앞면은
  넓게 단언한다 — 두 줄이 서로 다른 약속을 한다.

## 확정 25. 🟠 big_hand — "내가 받는 총액이 최소 만관"이 **기생충 한 장에 절반으로 깎인다**

- 위치: [packages/content/src/augments/big_hand.ts](../../packages/content/src/augments/big_hand.ts)
  (하한 채우기 단계) ↔ [packages/content/src/augments/parasite.ts](../../packages/content/src/augments/parasite.ts)
  (그 뒤 단계에서 획득의 절반을 가져간다)
- 기대: description — **"선언하면 그 국에 화료했을 때 내가 받는 총액이 최소 만관
  (오야 12000 · 자 8000)이 된다"**, detail의 ⚠ — **"하한이 걸리는 것은 손의 값이 아니라
  그 국에 내가 받는 총액이다."** 총액에 대한 무조건적 하한이다.
- 실제: 큰손이 12,000까지 채워 넣은 **뒤에** 기생충이 그 획득의 절반을 떼 간다.
  최종 수령액은 6,000 — 약속한 하한의 절반이다. 큰손의 표시(`points: 8100`)는
  여전히 "8,100을 채웠다"고 말한다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_karma_and_bighand.ts`
  ```
  ===== ④ 큰손 × 기생충 — '내가 받는 총액이 최소 만관' 이 지켜지는가
    큰손만           : 손=3900 → deltas={"p0":12000,…} aug=[{big_hand, points:8100}]
    큰손 + 상대 기생충: 손=3900 → deltas={"p0":6000,"p1":2100,…}
                        aug=[{big_hand, points:8100},{parasite, points:6000}]
  ```
  (같은 스크립트 ②③에서 **공탁·본장이 총액에 제대로 들어가는 것은 확인했다** —
  공탁 2000이면 채움이 8100→6100, 본장 900이면 7200으로 줄어 총액 12000을 맞춘다.
  깨지는 것은 오직 뒤 단계에서 획득을 가져가는 증강이 낄 때다.)
- 영향: 설명과 다름(점수). 2국 쿨다운을 태우고 선언한 보증이 조용히 반값이 된다.

## 확정 26. 🟠 north_trader — "**내** 천화·지화는 깨진다"인데 **상대 셋의 지화·구종구패까지** 깬다

- 위치: [packages/content/src/augments/north_trader.ts](../../packages/content/src/augments/north_trader.ts)
  — 북빼기가 전역 플래그 `goAroundBroken`을 세우고 `firstTurn`을 내린다(테이블 공용 상태).
- 기대: detail — **"뺄 때마다 패산이 한 장 줄어 그 국은 모두에게 그만큼 빨리 끝나고,
  첫 순에 빼면 **내** 천화·지화는 깨진다."** 남에게 가는 피해로는 "국이 빨리 끝난다"만
  적어 두었다.
- 실제: 첫 순 북빼기 한 번에 **아직 한 번도 순이 오지 않은 상대들의** 지화 전제가 무너지고,
  구종구패(아홉 종류 요구패 유국) 선언까지 막힌다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_north_firstturn.ts`
  ```
  [초기]      firstTurn=true  goAroundBroken=false
  [초기]      p1 구종구패 = 가능
  [북빼기 후]  firstTurn=false goAroundBroken=true
  [북빼기 후]  p1 구종구패 = 불가(not the first turn)
  [북빼기 후]  p1 지화 전제(firstTurn && !goAroundBroken) = false
  ```
- 영향: 설명과 다름. 남의 역만 기회를 지우는 능력인데 그 말이 카드에 없다.

## 확정 27. 🟡 rank_gate — "국이 끝나면 풀린다"는 지목 배지가 **정산 화면 내내 남는다**

- 위치: [packages/content/src/augments/rank_gate.ts:78-80](../../packages/content/src/augments/rank_gate.ts#L78)
  (공개 채널 `viewKey("*")` — 국 스코프가 아니다) ·
  `:128-129` (지우는 곳은 **다음 국의** `ROUND_STARTED` 리액션 하나뿐)
- 기대: detail — **"지목은 전원에게 공개되고 **국이 끝나면 풀린다**."**
- 실제: 국이 끝나 정산이 다 돌아간 뒤에도 배지가 `{target:"p1", minHan:5}` 그대로 살아 있다.
  다음 국이 시작될 때까지, 즉 **정산 화면과 증강 드래프트 내내** 지목이 걸려 있는 것처럼
  보인다. 실제 제한은 이미 끝났다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_rank_gate_and_scapegoat.ts`
  ```
  [지목 직후] view:*:rank_gate:p0 = {"round":"1-1-0","by":"p0","target":"p1","minHan":5}
  화료=roundOver
  [정산 직후] view:*:rank_gate:p0 = {"round":"1-1-0","by":"p0","target":"p1","minHan":5}
  ```
- 영향: 정보가 틀린다. (disrupt-b가 등 떠밀기 낙인으로 같은 모양을 '의심'에 올렸는데,
  이쪽은 문구가 "국이 끝나면 풀린다"고 명시해 확정으로 잡힌다.)

## 확정 28. 🟠 scapegoat — "**나머지 두 명은 한 푼도 내지 않는다**"가 다른 증강이 끼면 깨진다

- 위치: [packages/content/src/augments/scapegoat.ts](../../packages/content/src/augments/scapegoat.ts)
  — 지불 재배선이 **쯔모 기본 분담분만** 지목 대상에게 몰고, 그 뒤 단계에서 다른 증강이
  새로 얹는 부담은 손대지 않는다.
- 기대: detail — **"지목이 걸려 있으면 그 셋 몫을 지목당한 한 사람이 혼자 전부 낸다.
  나머지 두 명은 한 푼도 내지 않는다."** 굵게 강조된 단언이다.
- 실제: 내가 `aotenjou_ceiling`(뚫린 천장)으로 늘린 초과분, `devils_advance`(가불 인생)의
  상환 3,000점은 **재배선 밖**이라 나머지 둘에게 그대로 청구된다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_rank_gate_and_scapegoat.ts`
  ```
  덤터기만            : deltas={"p0":48000,"p1":0,"p2":-48000,"p3":0}
     나머지 둘이 무는가 = 아니오                       ← 문구대로
  덤터기 + 뚫린 천장  : deltas={"p0":60000,"p1":-4000,"p2":-52000,"p3":-4000}
     나머지 둘이 무는가 = ★ 예 (p1:-4000, p3:-4000)
  덤터기 + 가불 인생  : deltas={"p0":48000,"p1":-3000,"p2":-51000,"p3":-3000}
     나머지 둘이 무는가 = ★ 예 (p1:-3000, p3:-3000)
  ```
- 영향: 설명과 다름(점수). "누가 내느냐만 바뀐다"는 카드의 정체성이 무너진다.

## 확정 29. 🟡 eternal_dealer — "남은 횟수는 **전원에게** 보인다"인데 보유자 전용 채널이다

- 위치: [packages/content/src/augments/eternal_dealer.ts](../../packages/content/src/augments/eternal_dealer.ts)
  — `publishUsesLeft`가 `viewKey(holder, …)`(보유자 전용)로만 싣는다.
- 기대: detail — **"③은 게임 내 3회까지만 발동하고, 남은 횟수는 전원에게 보인다."**
- 실제: 공개 채널이 하나도 없다. 상대는 만년 오야의 연장이 앞으로 몇 번 남았는지 알 수 없다 —
  이 정보는 "지금 이 사람을 떨어뜨려야 하는가"를 가르는 판단 재료다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_conflicts_and_uses.ts`
  ```
  ===== eternal_dealer 남은 연장 횟수 채널
    view:p2:uses:eternal_dealer = {"left":3,"total":3,"scope":"match"}  ← 보유자 전용
    전원 공개 채널(view:*:...eternal_dealer...) 개수 = 0
  ```
- 영향: 정보가 없다. 문구가 약속한 공개가 통째로 빠졌다.

## 확정 30. 🟠 void_kan — **"리치 중에는 발동하지 않는다"가 거짓이다** (한 문단을 통째로 그 제약에 쓴 카드다)

- 위치: [packages/content/src/augments/void_kan.ts:107](../../packages/content/src/augments/void_kan.ts#L107)
  ```ts
  ctx.setHolderRule("win.closedKanRobbable", true);   // 조건 없이 항상 켜진다
  ```
  `:119`의 리치 가드(`if (state.round.byPlayer[holder]?.riichi != null) return;`)는
  **손패를 바꾸는 리액션에만** 걸려 있고, 창깡 론을 여는 규칙 자체는 막지 않는다.
- 기대: description 머리말 — **"(상시 · 리치 중에는 발동하지 않는다)"**. detail은 한 문단을
  더 쓴다 — **"내가 리치를 걸고 있으면 발동하지 않는다 … 텐파이를 리치로 굳히면 이 증강은
  그 국 내내 잠들어 있으니, 둘 중 하나를 골라야 한다."**
- 실제: 리치 중에도 **안깡 창깡 론이 그대로 성립한다.** 손패가 안 바뀔 뿐 능력의 본체
  (국사무쌍만 안깡을 창깡할 수 있다는 표준 예외의 무력화)는 살아 있다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_void_kan_riichi.ts`
  ```
  void_kan=false  안깡:true  p0 리치 중 안깡 창깡 론: false  거부(closed kan can only be robbed by kokushi)
                  win.closedKanRobbable(p0) = false
  void_kan=true   안깡:true  p0 리치 중 안깡 창깡 론: true  성립 ← 리치 중인데 능력이 살아 있다
                  win.closedKanRobbable(p0) = true
  ```
- 영향: 설명과 다름 — 그것도 **플레이어에게 손해를 강요하는 방향**이다. 카드가 "둘 중
  하나를 골라야 한다"고 못 박아 두니, 문구를 믿은 사람은 실제로는 공짜인 리치를 포기한다.

## 확정 31. 🟠 disarm — "이미 바꿔 놓은 것은 원래대로 되돌아간다"가 **진짜 용 하나에만** 구현돼 있다

- 위치: [packages/content/src/augments/disarm.ts](../../packages/content/src/augments/disarm.ts)
  — 되돌림 처리가 `true_dragon` 전용 분기 하나뿐이다.
- 기대: detail — **"손패 장수처럼 그 증강이 이미 바꿔 놓은 것이 있으면 잠기는 순간
  원래대로 되돌아간다 — 진짜 용을 잠그면 필요 없는 패 3장이 패산으로 돌아가며 평범한
  손패로 복귀한다."** 앞 문장이 일반 규칙이고 뒷문장은 그 예시다.
- 실제: 예시 하나만 동작한다. `three_dragons_will`(삼원의 의지)이 잡패 2장을 물질화해
  세운 대삼원은 그 증강을 잠가도 **그대로 남는다.** 무장해제를 대삼원 대응 카드로 쥔
  플레이어는 잠그고도 역만을 맞는다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_disarm_no_revert.ts`
  ```
  발동 전 p0 손의 삼원패: dragon1 ×3 dragon2 ×3 dragon3 ×1
  삼원의 의지 발동: true
  발동 후 p0 손의 삼원패: dragon1 ×3 dragon2 ×3 dragon3 ×3   ← 대삼원 성립
  무장해제(p0의 three_dragons_will): true  목록: ["aug:p0:three_dragons_will"]
  잠근 뒤 p0 손의 삼원패: dragon1 ×3 dragon2 ×3 dragon3 ×3
    → 기대(문구): 잡패 2장으로 되돌아가 대삼원이 무너진다 / 실제: 그대로 남는다
  ```
- 영향: 설명과 다름. 문구가 일반 규칙으로 적어 둔 것이 사실은 하드코딩된 한 건이다.

## 확정 32. 🟠 frame_up — "국의 첫 바퀴에는 쓸 수 없다"가 **퐁 한 번에 열린다** (아무도 아직 안 버렸는데)

- 위치: [packages/content/src/augments/frame_up.ts](../../packages/content/src/augments/frame_up.ts)
  — 첫 바퀴 판정을 코어의 `firstTurn` 플래그로 하는데, 그 플래그는 **후로가 일어나면
  즉시 내려간다**(원래 천화·지화용 플래그다).
- 기대: detail — **"심긴 패는 전원에게 공개되며, 리치 중이거나 국의 첫 바퀴에는 쓸 수 없다."**
  '첫 바퀴'는 네 사람이 한 번씩 버리기 전을 뜻한다.
- 실제: 누군가 퐁을 하면 `firstTurn=false`가 되어, **네 사람의 버림 수가 전부 0인 상태에서**
  누명 후보가 0개에서 30개로 열린다. 첫 바퀴에 심는 것을 막아 둔 이유(아직 아무 정보도
  없는 상대에게 후리텐을 걸어 버리는 것)가 그대로 뚫린다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_frameup_first_goaround.ts`
  ```
  첫 바퀴인가: true  각자 버림 수: 0/0/0/0
  퐁 전 p1의 누명 후보: 0 (문구대로 0)
  p1 퐁: true → firstTurn: false
    각자 버림 수: 0/0/0/0 ← 아직 첫 바퀴도 안 돌았다
  퐁 직후 p1의 누명 후보: 30 ← 첫 바퀴인데 열렸다
  실제로 p2 바닥에 심기: true   p2 버림 이력: man1 / p2 바닥 장수: 1
  ```
- 영향: 설명과 다름. 문구가 약속한 보호창이 사라진다.

## 확정 33. 🟠 giant_god — "되가져온 요구패는 **후리텐도 풀린다**"가 같은 요구패를 두 번 버렸으면 거짓

- 위치: [packages/content/src/augments/giant_god.ts](../../packages/content/src/augments/giant_god.ts)
  — 바닥의 13장을 손으로 올리면서 버림 이력에서 **한 장씩만** 뺀다. 같은 종류를 두 번
  버렸다면 두 번째 기록이 이력에 남는다.
- 기대: detail — **"되가져온 요구패는 후리텐도 풀리므로 그 전에 상대가 요구패를 버리면
  론으로 먼저 끝낼 수도 있다."** 국사 13면 대기의 값은 대부분 이 론에 있다.
- 실제: 요구패 하나를 국 중에 두 번 흘렸다면 **13면 대기 전체가 후리텐**이 되어 론이
  통째로 막힌다. 거신병은 "요구패 13종을 내가 손수 버려 모아야" 발동하는 카드라
  같은 요구패를 두 번 버리는 것은 흔한 진행이다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_giant_god_furiten.ts`
  ```
  [중복 없음]  발동:true
    발동 후 내 버림 이력: man2 man3 … sou2 sou2      → 후리텐: false (론 가능)
  [1m 두 번 버림]  발동:true
    발동 후 내 버림 이력: man1 man2 man3 …           → 후리텐: true ← 13면 대기 전체가 막혔다
  ```
- 영향: 설명과 다름. 어렵게 세운 역만이 론으로 끝나지 못하고 쯔모만 기다리게 된다.

## 확정 34. 🟠 reload — "국 단위 쿨다운 증강은 후보에 뜨지 않는다"인데 **봉인술사가 뜨고, 쿨다운이 그 자리에서 풀린다**

- 위치: [packages/content/src/augments/reload.ts:58-70](../../packages/content/src/augments/reload.ts#L58)
  ```ts
  targetUsesKeys(augId, holder).find((k) => counterOf(state, k) > 0 || flagOf(state, k))
  ```
  후보 판정이 `<id>:uses:` · `<id>:used:` 키를 훑는데, `discard_lock`은 쿨다운 기준점을
  `discard_lock:used:{holder}`(국 순번 숫자)에 담는다 — 이름이 겹쳐 **소진 카운터로 오인된다.**
- 기대: detail의 ⚠ — **"그 밖에 복구할 수 있는 것은 게임 단위 사용 횟수를 쓰는 증강뿐이다.
  국 단위 쿨다운으로 도는 증강은 눈에 띄게 소진돼 보여도 후보에 뜨지 않는다."**
- 실제: `discard_lock`(2국에 1회)이 후보로 뜨고, 재장전하면 기준점이 3→2로 **되감겨
  쿨다운이 즉시 풀린다.** 같은 국에 봉인을 두 번 건다. 대조군인 `hourglass`·`frame_up`은
  문구대로 거부된다("that augment has no spent use to restore") — 즉 규칙은 맞게 짰는데
  키 이름이 겹친 한 종만 새는 것이다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_reload_discard_lock.ts`
  ```
  재장전 후보(= '복구 가능'이라고 화면에 뜨는 것): [ 'discard_lock' ]
    기대: 국 단위 쿨다운 증강(discard_lock/hourglass/frame_up)은 하나도 없어야 한다
  봉인술사 버튼(쿨다운 중이므로 없어야 정상): false   discard_lock:used:p0 = 3
  재장전 → discard_lock 제출: true                  discard_lock:used:p0 = 2
  재장전 직후 봉인술사 버튼: true  ← 쿨다운이 그 자리에서 풀렸다
  실제로 다시 봉인 발동: true
  대조군 재장전 → hourglass: false  that augment has no spent use to restore
  대조군 재장전 → frame_up : false  that augment has no spent use to restore
  ```
- 영향: 설명과 다름 + 횟수 규약 파괴. (disrupt-b가 잡은 재장전 결함 둘과는 다른 경로다 —
  그쪽은 지속 효과 소등과 불리언 플래그였다.)

## 확정 35. 🟡 time_pressure — "남은 후보 중 하나가 **무작위로** 선택된다"가 실제로는 결정적이다 (코드가 일부러 무작위를 걷어냈다)

- 위치: [packages/server/src/HumanAgent.ts:143-153](../../packages/server/src/HumanAgent.ts#L143)
  ```ts
  // ⚠ 예전에는 `Math.random()`이었다. … 지금은 후보 목록 자체를 해시해 고른다
  return forced[hashOptions(forced) % forced.length]!;
  ```
- 기대: detail — **"되돌릴 수 없는 발동의 마무리 단계에서는 남은 후보 중 하나가 무작위로
  선택된다."**
- 실제: 후보 목록의 해시로 고른다 — 같은 상황이면 **언제나 같은 선택**이다. 리플레이·재개
  결정성을 위해 의도적으로 바꾼 것이고(docs/25 시스템 횡단 #14), 코드 주석이 그 경위를
  적어 두었다. **문구만 옛 동작에 남았다.**
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b6/repro_time_pressure_random.ts`
  ```
  후보 5개 × 200회 호출 → 서로 다른 결과 수: 1
    나온 것: [ '{"tileId":102}' ]
    기대(문구 '무작위'): 여러 후보가 고루 나온다 / 실제: 항상 같은 하나
    후보 2개 → 결정적으로 index 0 / 3개 → index 1 / 4개 → index 1 / 5개 → index 2 / 6개 → index 2

  타패 폴백: {"tileId":9} ← 마지막 = 쯔모패 (쯔모기리, 문구대로)
  반응 폴백: pass ← 패스 (문구대로)
  ```
- 영향: 설명과 다름. 초읽기는 상대에게도 걸리는 증강이라, 시간을 흘렸을 때 무엇이 골라질지
  **미리 계산할 수 있다**는 것은 문구가 감춘 전략 정보다.


---

# 의심 (재현 못 했거나 결함 여부 미확정)

## 의심 1. picky_eater — 리치 중에도 손패 전체를 물들인다 (형제 증강 suit_unify는 막는다)

- 위치: [packages/content/src/augments/picky_eater.ts](../../packages/content/src/augments/picky_eater.ts) — validate에 리치 가드가 없다.
- 근거: 하는 일이 같은 `suit_unify`는 detail에 **"리치 중에는 발동할 수 없다"**를 적고
  실제로 막는다. `void_kan`은 그 규약을 "손패 변형 증강의 공통 규약"이라고 부른다.
  편식의 문구에는 그 문장이 **없고** 코드에도 가드가 없다.
- 관측: `tsx qa-lab/text/b3/probe.ts` → `리치 중 p0 옵션: discard,picky_unify` / `제시 = true`
- **왜 의심인가**: 문구가 "리치 중에도 쓸 수 있다"고 약속한 것도, "쓸 수 없다"고 약속한
  것도 아니다(침묵). 규약 위반이자 문구 결손으로 보이지만, 의도된 차별화일 가능성을
  배제하지 못했다. 리치 중 발동이 실제로 대기를 갈아치워 점수까지 틀어지는지는
  끝까지 몰지 않았다.

## 의심 2. suit_unify — 적도라 처리에 대한 문구가 아예 없다

- 관측: `tsx qa-lab/text/b3/probe2.ts` — 발동 전 `man5(적) … pin5(적)`, pin 통일 후
  `pin5 … pin5(적) pin5`. 무늬가 바뀐 쪽의 빨간색은 사라지는 것으로 보인다.
- **왜 의심인가**: 스크립트의 적도라 집계와 손패 출력이 서로 맞지 않아(집계 1 vs 출력 2)
  숫자를 신뢰할 수 없었다. 형제 증강 `tile_dyeing`은 같은 상황을 ⚠로 명시하는데
  `suit_unify`에는 그 문장이 없다 — 문구 결손이 유력하나 **집계를 다시 짜서 확정해야 한다.**

---

# 검사했으나 이상 없던 것

## 전역 스캔 (117종 전체를 한 번에)

| 스캔 | 스크립트 | 결과 |
| --- | --- | --- |
| **숨은 한도** — `(상시)`로 시작하는 39종에 사용 횟수·쿨다운 배관이 숨어 있는가 | `qa-lab/text/always.ts` | 걸린 2종(`rinshan_preview` `eternal_dealer`)은 머리말이 한도를 **이미 밝히고 있다**. 진짜 숨은 한도 **0건** |
| **공개 약속** — "전원에게 공개된다"고 적은 49종에 공개 채널이 실재하는가 | `qa-lab/text/pub.ts` | `dora_conceal` 하나만 채널이 없는데, 그 문장은 "**증강 자체**는 전원에게 공개된다"라 증강 목록 공개(전역 규칙)를 가리킨다 — 결함 아님 |
| **비밀 약속** — "나만 안다 / 공개되지 않는다"고 적은 종의 `"*"` 채널이 그 비밀을 싣고 있는가 | `qa-lab/text/secret.ts` | 공개 채널에 실린 값은 전부 문구가 공개라고 밝힌 것(발동 사실·적발 결과·지목 대상)이었다. **정적 유출 0건** — 다만 확정 7(counter)처럼 **다른 증강의 채널**로 새는 경로는 이 스캔이 못 잡는다 |
| **머리말 한도 표기** — 기존 테스트가 검사하지 않는 8형태 | `qa-lab/text/heads.ts` | `매 국 1회` 18종 전부 국 스코프 배관 보유. 배관이 안 보이던 `counter`·`last_stand`도 `ROUND_STARTED`에서 플래그를 지운다(`counter.ts:176-184`, `last_stand.ts:119-121`). `seat_swap`의 `동풍전 2회 · 반장전 3회`는 `matchUses(state)+1`(`seat_swap.ts:73`)로 정확 |
| **배타 문구 ↔ `conflicts`** | `qa-lab/text/conflicts.ts` | 배타를 문장으로 **열거하는** 카드는 둘뿐. `true_dragon`의 "국사·치또이·구련류 + 성립하지 않는 깡"은 실제 6종과 정확히 대응. `open_riichi_reveal`만 어긋났다 → 확정 19 |

## 증강끼리 서로를 이름으로 부르는 문장

`qa-lab/text/xref.ts`로 25건을 뽑아, 담당 묶음이 갈려 아무도 안 볼 4건을 직접 확인했다.

| 문장 | 판정 |
| --- | --- |
| `no_ron_pact` — "멘젠이 유지되는 **묵계 퐁**도 마찬가지다"(조약 파기) | 정상. 파기 판정이 `rs.melds.length > 0`이라 묵계 퐁도 걸린다(`no_ron_pact.ts:67`) |
| `bluff_pretense` — "후로가 봉인된 동안(**함구령**) … 발동하지 않는다" | 정상. validate가 `call.blocked`를 직접 조회(`bluff_pretense.ts:109`), 함구령이 거는 규칙과 같은 이름(`call_seal.ts:101`) |
| `reload` — 되살릴 선발동형으로 "**눈먼 총알·초읽기·반전**" 셋을 든다 | 정상. 후보 판정이 `preArmSpent`(=`armOnNextRound` 표식)를 보는데, 같은 즉발형인 `cornucopia`는 `install`에서 바로 지급하고 `armOnNextRound`를 안 써서 후보에 안 든다. 목록이 정확하다 |
| `ankan_dora` — "랭크가 섞인 깡(**장사진**의 3-4-5-6, **바람의 계보**의 동남서북)도 네 장 전부 도라" | 성립. 판 계산이 `kan_closed` 멘쯔의 `tiles.length` 합이라 랭크를 안 본다(`ankan_dora.ts:60-61`), 장사진도 표준 `ankan` 경로로 눕는다(`snake_kan.ts:57`) |

## 개별로 돌려 확인했고 문구대로였던 것

`iron_wall`(후리텐 론에만 +3판, 평범한 론엔 0 — 네 경우 전부 확인) ·
`bottom_deal`(밑 3장 열람은 보유자 전용, 예약한 밑장이 그대로 다음 쯔모, 밑장이 빠지면 옆이 새 밑장) ·
`rinshan_preview`(왕패 장수 불변, 내가 넣은 패가 새 영상패, 교환만 전원 공개·넣은 패는 비공개) ·
`even_world`(도라·적도라를 실제로 지킨다 — 확정 14·15의 대조군) ·
`table_flip`(패산 총량 불변, 후로 직후 후보 0) ·
`genesis`(패산 실물 교환, 같은 순 재발동 차단) ·
`tile_dyeing`·`alchemist`("한 순에 한 번" 지켜짐) ·
`red_five_touch`(각인 공개, 게임 내 1회 두 번째 발동 차단) ·
`full_hand_swap`(내 옛 손패가 패산 맨 밑, 상대는 자기 옛 손패를 안 돌려받음, 총량 불변) ·
`conjure_draw`(부른 패가 다음 쯔모로 옴, 전원 공개) ·
`future_sight`(3 나가고 3 들어옴, 가져온 3장 전원 공개, `lastDiscard` 안 건드림) ·
`meld_dissolve`(유일 후로 해체 후 멘젠 복구 → 리치 제시됨) ·
`joker`(조커 화료 **35,621건**을 전수 채점해 "가장 높은 점수가 나오는 형태가 자동 채택"을 검증 — 위반 0건) ·
`open_kokushi`(특수 퐁 "횟수 제한이 없다" — 1·2·3·4묶음 전부 역만 성립) ·
`snake_kan`×`broken_wall`(8-9-1-2 장사진 성립) · `snake_kan`(깡 4개 → 스깡쯔 포함) ·
`aotenjou_ceiling`(detail의 예시 숫자 전부 실측 일치 — 8판 만관 2.5개 · 11판 4개 · 13판 5개, 4판40부 상한 해제 10300) ·
`jackpot`(룰렛 실측 20만 회: 0.5배 30.14% · 1배 29.90% · 2배 29.86% · 3배 10.10%) ·
`blind_ron`(51.2만 회: 네 사람 각 ~25%, 쏜 사람 자신 24.92%) ·
`karma`(1인당 몫 = 게이지÷3 100점 내림 — 8000→2600 · 12000→4000) ·
`devils_advance`(만관 판정: 4판30부 7700 미폭발 / 3판70부·4판40부·5판30부 폭발) ·
`big_hand`(공탁·본장이 총액에 제대로 포함된다 — 확정 25는 그 뒤 단계 문제다) ·
`let_it_ride`(4배가 손의 화료점에만 걸린다 — 본장 900·공탁 3000은 배수 없이 그대로) ·
`pseudo_dealer`(오야 자리 이전·자풍 재계산·이미 오야면 재선언 차단) ·
`late_bloomer`/`late_bloomer_east`(만개 시점 — 남4국·서입 / 동4국·남입 정확) ·
`omni_chi`(`call.chi.fromAnyone`이 보유자에게만) ·
`call_seal`(보유자는 안 막히고 상대 셋만 막힌다 · 안깡·가깡은 안 막는다) ·
`hourglass`(동풍전 40매치 — 연장 중 '남의 순'이 끼어드는 사고 0건) ·
`time_pressure`의 타패·반응 폴백(쯔모기리 / 패스 — 문구대로).
