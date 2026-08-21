# 증강 3군(nagashi_yakuman … siege_riichi) — aug-3

## 요약

(작성 중 — 스위프 진행 상황에 따라 갱신)

---

## 확정 1. 🟠 선언 간파의 위조(peek_forge)가 **세상에 없는 5번째 장**을 만든다

- 위치: `packages/content/src/augments/peek_riichi_waits.ts:203-233` (`peekForgeAction.validate` / `toEvents`)
- 기대: 같은 형제 증강 `off_by_one`은 바로 이 함정을 명시적으로 막는다 —
  `copiesLeftUndrawn()`으로 "오름패 4장이 이미 전부 나와 버린 죽은 대기에는 밀지 않는다.
  세상에 없는 5번째 장을 만들 수는 없다"(`off_by_one.ts:52-77`, docs 2026-08-20 QA 리치 확정 3).
  카드 문구에도 "내 손패 한 장을 간파한 오름패 중 하나로 바꿔 만들 수 있다"까지만 있고
  물리 법칙(한 종류 4장)을 깨겠다는 말은 없다.
- 실제: `peek_forge`의 validate는 ① 국당 1회 ② 리치 전 ③ 손패에 있는 패 ④ 간파한 대기 종류
  ⑤ kindKey 파싱 — 다섯 가지만 본다. **그 종류가 이미 몇 장 나왔는지는 세지 않는다.**
  그래서 이미 4장이 손·바닥·후로에 다 나와 있는 종류로도 위조가 되고, 그 순간
  테이블 위에 그 종류가 5장 서 있게 된다. 대기 잔량을 세는 쪽(`botHelpers.waitTilesLeft`,
  클라이언트 대기 잔량 표시)은 0이라고 말하는데 그 패로 화료가 난다.
- 재현: `tsx qa-lab/round2/aug-3/t1_forge_fifth.ts`
  (드래프트를 끄고 p0에게만 `peek_riichi_waits`를 지급 — 패를 만들어 내는 다른 증강은 전부 배제)
  ```
  OVERFLOW seed=1 forges=1
    dragon2 x5 @2-1-4 (changes=[{"tileId":7,"kind":{"suit":"dragon","rank":2},"attrs":{"conjured":true}}])
  OVERFLOW seed=3 forges=1
    sou8 x5 @2-2-5 ...
  OVERFLOW seed=4 forges=1  wind2 x5 @2-4-7
  ```
- 영향: 상대가 "이 패는 4장 다 보였으니 절대 안 맞는다"라고 세고 던진 안전패에 맞는다.
  마작에서 장수 세기는 방어의 근간이라 **대응 자체가 불가능한 화료**가 된다.
- 제안 수정: `off_by_one.copiesLeftUndrawn`과 같은 검사를 `peek_forge`에도 건다 —
  위조 대상 kind의 잔량이 0이면 후보에서 빼고 validate에서도 반려한다.
  (위조는 "상대 오름패를 내가 쥔다"는 것이므로, 남은 장이 없으면 애초에 쥘 것이 없다.)

## 확정 2. 🟠 불가침 조약이 **파혼(meld_dissolve)으로 되살아난다** — 게다가 화면은 "론 가능"이라고 말한다

- 위치: `packages/content/src/augments/no_ron_pact.ts:96-116` (`pactActive`)
- 기대: 카드 — "파기 조건은 둘이다 — 리치를 걸거나, 손에 멘쯔가 하나라도 생기는 것.
  **파기되면 그 뒤로는 평범하게 론당한다.**" 리치 쪽은 실제로 되돌릴 수 없게 막아 뒀다:
  `declaredKey` 이력 플래그를 따로 두고 주석에 이유가 적혀 있다 —
  "현재 상태(`rs.riichi`)만 보면 승부수로 리치를 물리는 순간 조약이 되살아나,
  '리치로 압박하고 물러나 다시 무적'이라는 **무한 방패**가 됐다".
- 실제: **멘쯔 쪽은 그 처리가 없다.** `if (rs.melds.length > 0) return false;` 는 살아 있는
  상태에서 파생하는 판정이라, 파혼(`meld_dissolve`)이 후로를 해체해 `melds.length`가 0으로
  돌아가면 조약이 그대로 부활한다. 자리 바꿈(`seat_swap`)·통째로 바꾸기처럼 후로 존을
  통째로 옮기는 증강도 같은 문에 들어간다.
  게다가 부활은 **즉시**인데 공개 채널 갱신은 다음 `TILE_DRAWN`/`TILE_DISCARDED`까지 늦어,
  그 사이 테이블에는 "조약 파기 — 론 가능"이 떠 있는데 실제로는 론이 막혀 있다.
- 재현: `tsx qa-lab/round2/aug-3/t3c_pact_trace.ts`
  (seed 17869, `p0:[no_ron_pact, off_by_one] p2:[no_ron_pact, meld_dissolve]`, 하네스 페르소나)
  ```
  2-2-5 dc=1 melds=0 shown=true  real=true  label=조약 유효 — 6순까지 론 불가
  2-2-5 dc=1 melds=1 shown=false real=false label=조약 파기 — 론 가능      ← 퐁으로 파기
  2-2-5 dc=1 melds=0 shown=false real=true  label=조약 파기 — 론 가능      ← 파혼: 실제로는 부활, 화면은 거짓
  2-2-5 dc=2 melds=0 shown=true  real=true  label=조약 유효 — 6순까지 론 불가 ← 조약이 되살아났다
  ```
  같은 판 1-1-0에서도 dc=6에 같은 부활 구간이 잡힌다.
  (스위프 검출: `tsx qa-lab/round2/aug-3/sweep1.ts` → `PACT_VIEW_STALE`)
- 영향: ① 파기시켰다고 믿은 상대가 위험패를 던졌는데 론이 조용히 무산된다.
  ② 화면이 "론 가능"이라고 확언하는 동안 실제로는 면역 — Rule #4(정보는 맞을 때만 산다)가
  정확히 반대로 작동한다. ③ 퐁 → 파혼으로 "조약을 껐다 켜는" 무비용 루프가 만들어진다
  (리치 쪽에서 이미 막은 것과 같은 구멍).
- 제안 수정: 리치와 같은 방식으로 **파기 이력**을 남긴다 — `CALL_MADE`/`KAN_DECLARED`
  리액션에서 보유자에게 멘쯔가 처음 생길 때 `broken` 플래그(국 스코프)를 세우고
  `pactActive`는 그 플래그를 본다. 그러면 어떤 방식으로 멘쯔가 사라져도 부활하지 않는다.

## 확정 3. 🟠 격(rank_gate)에 잠긴 론에도 **후리텐이 찍힌다**

- 위치: `packages/core/src/mahjong/flow/FlowController.ts:833-846` (`markPassFuriten`),
  `packages/content/src/augments/rank_gate.ts:106-118`
- 기대: 코어는 **규칙이 론을 막았으면 후리텐을 찍지 않는다**는 원칙을 이미 갖고 있다 —
  `win.ronImmune`(천하무적·불가침 조약)일 때 `markPassFuriten`이 통째로 조기 반환하며
  주석에 이유가 적혀 있다: "후리텐은 '화료를 넘겼다'는 사실에 붙는 벌인데,
  규칙이 론 자체를 막았다면 넘긴 것이 없다. … 설명에 없는 '리치자 전원 무력화'가
  숨어 있던 셈이다(docs/25 최우선#4)."
  격의 카드에는 "5판 이상이 아니면 화료할 수 없다"까지만 적혀 있다.
- 실제: 같은 함수에 `win.minHan` 예외가 없다. 격에 지목당한 사람은 4판 이하라 `win`이
  잠긴 채(FlowController.winLock → `reason:"minHan"`) 자기 오름패가 지나가는 것을 보고,
  그 자리에서 일시 후리텐(리치 중이면 **그 국 영구 후리텐**)이 찍힌다.
  즉 격은 "싼 손 봉인"에 더해 **손을 키워 5판을 넘긴 뒤에도 그 대기로는 영영 론할 수 없게
  만드는** 두 번째 벌을 몰래 얹고 있다.
- 재현: `tsx qa-lab/round2/aug-3/t2_rankgate_furiten.ts`
  (p0만 `rank_gate`, 드래프트 없음. 프롬프트의 `locked:[{type:"win",reason:"minHan"}]`을 본
   직후 같은 리액션 창에서 그 사람에게 `FuritenMarked`가 오는지 센다)
- 영향: 지목당한 쪽은 카드 설명대로 "손을 키우는 수밖에" 없는데, 키워 봐야 그 대기는
  이미 죽어 있다. 리치를 걸어 둔 상태라면 국이 끝날 때까지 회복 수단이 없다.
- 제안 수정: `markPassFuriten`의 `ronImmune` 조기 반환 옆에 minHan 게이트를 함께 본다 —
  다만 이쪽은 **사람마다** 다르므로 전체 반환이 아니라 마킹 루프 안에서
  "이 사람의 `win`이 minHan으로 막혀 있었다면 건너뛴다"로 좁혀야 한다.

---

## 의심

(작성 중)
