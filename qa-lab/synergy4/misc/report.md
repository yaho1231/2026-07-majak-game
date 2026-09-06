# synergy4 — 후로·친·손익 축 (call / menzen / dealer / loss_gain + 나머지)

작성 2026-08-31. 소스는 **한 줄도 고치지 않았다** — 조사·증거·재현 스크립트만.
모든 스크립트는 `qa-lab/synergy4/misc/` 아래, 실행은 워크트리 루트에서
`~/majak/node_modules/.bin/tsx qa-lab/synergy4/misc/<파일>.ts`.

## 담당 카드 (카탈로그 전수)

| 축 | 카드 |
|---|---|
| call | omni_chi(사방치기) · open_kokushi(우는 국사무쌍) · broken_border(무너진 국경) · mixed_triplet(동수의 결속) · bluff_pretense(허장성세) · silent_pact(묵계) · meld_dissolve(파혼) |
| menzen | silent_pact · meld_dissolve · pond_snatch(날치기) · hidden_blade(숨은 칼날) · no_ron_pact(불가침 조약) · async_chiitoi(비대칭) · regret(미련) · ankan_dora·stealth_riichi·late_double·free_riichi_discard(※ 깡/리치 축과 공유) |
| dealer | pseudo_dealer(찬탈자) · seat_swap(자리 바꿈) · eternal_dealer(만년 오야) · honba_hunter(본장 사냥꾼) |
| loss_gain | die_hard(죽기살기) · sign_flip(반전) · karma(카르마) · avenger(복수자) |
| 태그 없음 | reload(재장전) · cornucopia(수상한 주사위) |

## 검사한 조합 (전부)

**후로 넓히기끼리**
1. omni_chi × broken_border — 치 후보 (`call_chi.ts`)
2. omni_chi × broken_border, 상가/대면 4가지 교차 — 위 스크립트
3. mixed_triplet × bluff_pretense — 1장 퐁 (`call_pon.ts`)
4. mixed_triplet × silent_pact — 혼색 묵계 퐁 (`call_pon.ts`)
5. mixed_triplet × bluff_pretense × silent_pact — 세 후보 동시 (`call_pon.ts`)
6. mixed_triplet × broken_border × async_chiitoi — 같은 첫 순 3연속 선언 (`shape_declares.ts`)
7. open_kokushi × silent_pact / × bluff_pretense — 국사 커밋 뒤 콜 버튼 (`kokushi_calls.ts`)
8. open_kokushi × mixed_triplet — `hasNonKokushiMeld`가 kind로 판정(소스 확인, 이미 감사됨)

**멘젠 유지·회복 × 후로**
9. silent_pact × hidden_blade (`menzen_pact.ts`)
10. silent_pact × meld_dissolve (`menzen_pact.ts` + 소스)
11. 표준 펑 × meld_dissolve × hidden_blade (`menzen_pact.ts`)
12. no_ron_pact × meld_dissolve (`pact_dissolve.ts`)
13. no_ron_pact × pond_snatch (`menzen_keepers.ts`)
14. no_ron_pact × silent_pact (소스 — 묵계 퐁도 파기, 설명과 일치)
15. regret × silent_pact / × ankan (소스 — `meldCountOf`가 전부 센다)
16. **seat_swap × silent_pact** (`seat_swap_silent.ts`) → 결함 3

**친 카드끼리**
17. eternal_dealer × honba_hunter (`dealer_stack.ts`)
18. eternal_dealer × pseudo_dealer(강탈 상태) (`dealer_stack.ts`)
19. honba_hunter × pseudo_dealer, 셋 다 (`dealer_stack.ts`)
20. **pseudo_dealer × seat_swap (순서별)** (`dealer_seat_order.ts`) → 결함 4
21. eternal_dealer × seat_swap (좌석 이전 = 강탈과 같은 경로, 20과 동형)

**잃을수록 이득 계열끼리**
22. die_hard × sign_flip (잃는 국) (`loss_gain_settle.ts`)
23. **die_hard × sign_flip (버는 국 / 역만 화료)** (`loss_gain_win.ts`, `loss_gain_yakuman.ts`) → 결함 1
24. karma × die_hard / × sign_flip (게이지 적립) (`loss_gain_settle.ts`) → 결함 2
25. die_hard × sign_flip × karma (3장) (`loss_gain_settle.ts`)
26. **sign_flip × scapegoat(손실 몰아주기)** (`signflip_scapegoat.ts`) → 결함 5
27. die_hard × scapegoat (상한 비교) (`signflip_scapegoat.ts`)
28. avenger × die_hard / × karma (소스 — avenger는 winInfos만 읽어 delta 조작과 무관)
29. karma × sign_flip (게이지 태우기) — 소스에 «karma+sign_flip» 서명이 명시돼 있다

**나머지(재장전·수상한 주사위)**
30. reload × die_hard / karma / seat_swap / pond_snatch / sign_flip (`reload_restore.ts`)
31. **reload × eternal_dealer** (`reload_targets.ts`) → 결함 6
32. reload × pseudo_dealer (쿨다운형 — 대상 아님이 정상)
33. cornucopia — 후보 선정은 코어 `grantAugments`가 conflicts·모드를 거른다(소스)

**전수 스위프** — 위 목록 23종에서 conflicts를 뺀 **짝 252개 × 시드 2개**를 동풍전으로
완주시켜 크래시·훅 예외·상태 불변식 위반·설명 없는 점수 발행을 훑었다 (`sweep.ts`).

---

## 확정 결함

### 1. sign_flip + die_hard — **버는 국에** 죽기살기가 터지고 «게임 내 1회»가 소진된다
- 조합: `sign_flip` + `die_hard` (한 사람)
- 기대(설명 근거): die_hard detail —
  «점수가 늘어나는 국에는 발동하지 않고 **횟수도 줄지 않는다**».
- 실측 (`loss_gain_win.ts`, p0 점수 10,000에서 24,000 화료):
  | 조건 | p0 delta | die_hard 소모 |
  |---|---|---|
  | 없음 | +24,000 | 0 |
  | die_hard 단독 | +24,000 | 0 |
  | sign_flip 단독 | −24,000 | 0 |
  | **die_hard + sign_flip** | **+24,000** | **1** |
- 원인: `sign_flip`은 `SETTLE_STAGE.SignFlip`(550), `die_hard`는 `Shield`(600)
  (`packages/core/src/augment/settleStages.ts:88-100`). 죽기살기는 «최종 손실»을 보는데,
  그 «최종»에는 반전이 이미 부호를 뒤집어 놓은 값이 들어온다 —
  `packages/content/src/augments/die_hard.ts:127-128` (`const loss = p.deltas[holder]; if (loss >= 0) return event;`).
  버는 국이 반전 뒤에는 잃는 국으로 보인다.
- 부수 효과 ①: 반전의 유일한 대가(«벌면 빼앗긴다»)가 통째로 지워진다. 두 카드가 서로를
  키우는 것이 아니라 **한쪽이 다른 쪽의 비용을 무료로 없애면서 자기 자원을 태운다.**
- 부수 효과 ② — **큰 손에서는 죽기살기가 보유자에게 손해를 입힌다.** 되돌리는 폭은
  `REVIVE_CAP = 25,000`(`die_hard.ts:145`)이라, 반전이 만든 «가짜 손실»이 그보다 크면
  잘린다. 실측(`loss_gain_yakuman.ts`, p0 오야 국사무쌍 쯔모):
  | 조건 | p0 delta | die_hard 소모 |
  |---|---|---|
  | 없음 | **+96,000** | 0 |
  | sign_flip 단독 | −96,000 | 0 |
  | **sign_flip + die_hard** | **+25,000** | **1** |
  죽기살기를 «함께 들었기 때문에» 화료 수익이 96,000 → 25,000으로 줄고(−71,000),
  게임 내 1회 자원까지 탄다. 단독으로 들었을 때보다 **명백히 나쁘다.**
- 재현: `qa-lab/synergy4/misc/loss_gain_win.ts`, `qa-lab/synergy4/misc/loss_gain_yakuman.ts`
- 심각도: **높음** (게임 내 1회 자원 오소모 + 프리즘 카드의 설계 비용 무효화 + 큰 손 −71,000)

### 2. karma + (die_hard | sign_flip) — 업보 게이지가 통째로 0이 된다
- 기대: karma description — «**국 정산에서** 잃은 점수가 업보 게이지로 상시 쌓인다».
  손실을 이득으로 뒤집는 카드와 같은 «잃을수록 이득» 계열이므로 함께 들면 서로를
  키울 것으로 읽힌다.
- 실측 (`loss_gain_settle.ts`, p0 점수 10,000에서 16,000 방총):
  | 조건 | p0 delta | karma 게이지 |
  |---|---|---|
  | karma 단독 | −16,000 | **16,000** |
  | karma + die_hard | +16,000 | **0** |
  | karma + sign_flip | +16,000 | **0** |
  | karma + die_hard + sign_flip | +16,000 | **0** |
- 원인: karma의 적립은 `ROUND_SETTLED` **리액션**이라 인터셉터가 전부 끝난 payload를
  본다 — `packages/content/src/augments/karma.ts:172-183`
  (`const loss = Math.max(0, -(p.deltas[holder] ?? 0)); if (loss <= 0) return;`).
  Shield/SignFlip 단계가 이미 부호를 뒤집어 두어 손실이 «0»으로 보인다.
- 결과: 같은 계열 두 장을 함께 들면 카르마는 **한 국도 충전되지 않는** 죽은 픽이 된다
  (프리즘 등급 카드가 매치 내내 아무 일도 하지 않는다).
- 재현: `qa-lab/synergy4/misc/loss_gain_settle.ts`
- 심각도: **높음** (선례 «동수의 결속 + 양극»과 정확히 같은 모양 — 효과가 겹쳐 한쪽이 0)

### 3. seat_swap이 묵계(silent_pact)의 «멘젠 유지» 몸통을 **비보유자에게 넘긴다**
- 조합: `seat_swap` 보유자 × `silent_pact` 보유자(상대)
- 기대: 묵계의 «멘젠이 유지되는 퐁»은 묵계 **보유자**의 능력이다. 자리 바꿈은
  스텔스 리치를 «맞바꾸는 순간 해제»하는 선례(`seat_swap.ts:156`,
  `breakStealthRiichiEvents`)를 이미 가지고 있다 — 보유자에 묶인 상태는 넘기지 않는다.
- 실측 (`seat_swap_silent.ts`): p1이 묵계 퐁(silent)을 깐 상태에서 p0(seat_swap 보유,
  평범한 펑 1개)가 p1을 지목:
  ```
  자리 바꿈 전 : p0 후로=1 노출후로=1 (멘젠=false) | p1 후로=1 노출후로=0 (멘젠=true)
  자리 바꿈 후 : p0 후로=1 노출후로=0 (멘젠=true)  | p1 후로=1 노출후로=1 (멘젠=false)
  p0 리치 후보: true / p0 보유증강: seat_swap
  ```
  **묵계를 가지고 있지 않은 p0가**, 눈에 보이는 퐁을 깔아 둔 채 멘젠이 되어 리치가 열린다.
- 원인: 자리 바꿈 리듀서가 `byPlayer[].melds`를 통째로 맞바꾸면서 `silent` 표식을
  그대로 옮긴다 — `packages/content/src/augments/seat_swap.ts:219-236`
  (`swapCalledFrom`은 `calledFrom`만 손보고 `silent`는 건드리지 않는다).
  멘젠 판정 `openMeldCountOf`는 `m.silent !== true`만 보므로
  (`packages/core/src/mahjong/flow/helpers.ts:162-166`) 소유자를 묻지 않는다.
- 확대: 받는 쪽이 `hidden_blade`를 들고 있으면 «보이는 퐁 + 뒷도라 + 2판»이 묵계 없이
  성립한다(9번 조합의 실측 5,800 → 18,000이 그대로 남에게 간다).
- 재현: `qa-lab/synergy4/misc/seat_swap_silent.ts`
- 심각도: **높음** (증강 효과가 비보유자에게 샌다 + 화면이 거짓말을 한다)

### 4. pseudo_dealer → seat_swap 순서면 **빼앗은 오야를 상대에게 넘겨준다**
- 조합: `pseudo_dealer` + `seat_swap` (한 사람, 같은 순)
- 기대: 둘 다 «오야가 나에게 온다»를 약속하는 친 카드다(찬탈자: «오야 자리가 나에게
  넘어오고», 자리 바꿈: «자풍·오야까지 넘어온다»). 함께 들면 서로를 키워야 한다.
- 실측 (`dealer_seat_order.ts`, 오야=seat0=p0, 보유자=p2):
  ```
  claim → swap : claim_dealer 후 dealerSeat=2(p2) → seat_swap(p3) 후 dealerSeat=2 = **p3**
  swap  → claim: seat_swap 후 dealerSeat=0 → claim_dealer 후 dealerSeat=3 = p2  (정상)
  ```
  즉 강탈 뒤 자리를 바꾸면 **방금 빼앗은 오야가 지목한 상대의 것이 된다.**
  그 대가로 찬탈자의 2국 쿨다운과 자리 바꿈의 매치 횟수가 **둘 다** 소모된다.
- 원인: 오야는 «자리»에 붙는 값(`round.dealerSeat`)이고 찬탈자는 그것을 보유자 자리로
  옮긴다(`pseudo_dealer.ts:107-114`). 자리 바꿈은 **플레이어의 seat만** 맞바꾸고
  `dealerSeat`는 손대지 않는다(`seat_swap.ts:246-260`) — 그래서 오야 표식이 자리에
  남아 상대에게 딸려 간다.
- 심각도: **중간** (순서를 바꾸면 피할 수 있지만 화면 어디에도 경고가 없고,
  두 카드 모두 «오야가 나에게 온다»고 적혀 있다)
- 재현: `qa-lab/synergy4/misc/dealer_seat_order.ts`

### 5. sign_flip에는 뱅크 발행 상한이 없다 — 손실 몰아주기와 겹치면 무제한
- 조합: `sign_flip` × 손실을 한 사람에게 모으는 카드(`scapegoat` 실측, `blame_shift`·
  `blind_ron`도 같은 구조)
- 기대: 같은 «잃을수록 이득»인 `die_hard`는 **정확히 이 조합 때문에** 되돌아오는 폭을
  판의 시작 점수 25,000으로 잘랐다 — `die_hard.ts:129-145`
  («덤터기·눈먼 총알과 겹치면 깊이에 상한이 없어서 … 뱅크에서 226,000점을 받고
  그 자리에서 매치 1위가 됐다», REVIVE_CAP).
- 실측 (`signflip_scapegoat.ts`, 전원 25,000, p1 오야가 덤터기로 p0를 지목한 채 쯔모):
  | 조건 | deltas | 테이블 합 | 뱅크 발행 |
  |---|---|---|---|
  | 덤터기만 | p0=−24,000 p1=+36,000 | +12,000 | 덤터기 +2판분 |
  | sign_flip만 | p0=+8,000 … | +16,000 | 16,000 |
  | **sign_flip + 덤터기** | **p0=+24,000** p1=+36,000 p2=p3=0 | **+60,000** | **48,000** |
  | die_hard + 덤터기 | p0=−24,000 (문턱 미달로 미발동) | +12,000 | — |
- 원인: `sign_flip.ts:112-127`의 인터셉터는 `deltas[holder] = -before`를 **무조건**
  적용한다. 상한이 없다. 손실을 한 사람에게 모으는 카드가 앞 단계(Redistribute 100 /
  Reassert 450)에 있어 반전(550)이 보는 `before`가 세 사람 몫이 된다.
  뚫린 천장(`aotenjou_ceiling`)이 끼면 상한이 아예 없다.
- 심각도: **높음** (die_hard에서 이미 결함으로 판정돼 고쳐진 것과 **같은 구멍**이
  형제 카드에 그대로 남아 있다)
- 재현: `qa-lab/synergy4/misc/signflip_scapegoat.ts`

### 6. reload가 eternal_dealer의 «연장»을 영영 복구하지 못한다 (잔량 pill은 뜬다)
- 조합: `reload` + `eternal_dealer`
- 기대: 재장전은 «사용 횟수를 쓴 내 다른 증강 하나를 지목해 1회 복구»한다.
  만년 오야는 잔량 pill(`view:{보유자}:uses:eternal_dealer` = `{left:4,total:5}`)을
  상시 내보내므로 화면상 명백한 «횟수형»이고, 재장전의 **드래프트 게이트**
  (`restorableType` → `hasRestorableAugment`, `reload.ts:139-152`)도 그 pill 하나로
  «되살릴 것이 있다»고 통과시킨다.
- 실측 (`reload_targets.ts`, 각 카드를 1회 소진시킨 뒤 `reload_use` 후보):
  ```
  die_hard       (uses 규약)  | reload 후보: die_hard
  karma          (uses 규약)  | reload 후보: karma
  seat_swap      (uses 규약)  | reload 후보: seat_swap
  pond_snatch    (used 규약)  | reload 후보: pond_snatch
  eternal_dealer (keeps)      | reload 후보: (없음)
  pseudo_dealer  (쿨다운형)    | reload 후보: (없음)   ← 정상
  ```
  잔량 pill 확인: `view:p0:uses:eternal_dealer = {"left":4,"total":5,"scope":"match"}`.
- 원인: 재장전은 `<id>:uses:` / `<id>:used:` 두 이름만 소진 카운터로 본다
  (`reload.ts:41-72` `targetUsesKeys`·`spentKeyOf`). 만년 오야의 카운터는
  `eternal_dealer:keeps:{holder}`다(`eternal_dealer.ts:80`) — 규약 밖이라 잡히지 않는다.
- 결과: 재장전을 만년 오야와 함께 뽑으면 «되살릴 것이 있다»고 3지선다에 떠 놓고
  정작 그 카드는 영영 후보에 없다. 재장전이 방지하려던 «죽은 칸»이 그대로 난다.
- 심각도: **중간**
- 재현: `qa-lab/synergy4/misc/reload_targets.ts`

---

## 의심 (확정 못 한 것)

- **regret이 묵계 퐁·안깡 손을 «멘젠 텐파이»로 보지 않는다.** `meldCountOf`(모든 멘쯔)를
  쓴다(`regret.ts:77`). 손패 13장을 넘긴다는 구현 제약상 옳지만, 묵계가 «멘젠이 유지된다»고
  약속하는 것과 표면상 어긋난다. 설계 판단이 필요해 결함으로 올리지 않았다.
- **karma × sign_flip의 «태우기»**: 게이지를 태우면 상대 셋은 정상적으로 잃고 보유자의
  수령만 부호가 뒤집혀 사라진다. 소스에 «karma+sign_flip» 서명이 명시돼 있어
  (`sign_flip.ts:98-107`) 의도된 동작으로 읽히지만, 카르마 매치 예산 1~2회가 그대로
  타 버린다. 밸런스 판단 영역.
- **regret × async_chiitoi**: 비대칭이 켜진 국에만 텐파이인 손을 보존해도 다음 국은
  비대칭이 쿨다운(동풍전 2국)이라 그 손이 텐파이가 아니다. 함정 조합으로 보이나,
  두 카드 모두 각자 설명대로 동작한다.

## 이상 없음으로 판정한 조합 (한 줄씩)

- **omni_chi × broken_border** — 대면 버림에 혼색 치 후보 4개가 정상적으로 열린다. 겹침이 곱해진다.
- **mixed_triplet × bluff_pretense** — 1만 한 장으로 1삭 버림에 `bluff_pon`이 뜬다(2026-08-23 수정분 유효).
- **mixed_triplet × silent_pact** — 혼색 몸통으로도 `silent_pon`이 뜬다.
- **mixed_triplet × bluff_pretense × silent_pact** — 손패 조건에 따라 세 후보가 배타적으로 갈릴 뿐 서로를 지우지 않는다.
- **mixed_triplet × broken_border × async_chiitoi** — 같은 국 첫 순에 셋 다 선언되고 규칙 셋이 함께 켜진다.
- **open_kokushi × silent_pact / × bluff_pretense** — 국사 커밋 뒤 두 커스텀 콜의 **버튼 자체가 사라진다**(눌러도 반려되는 버튼이 남지 않는다).
- **silent_pact × hidden_blade** — 5,800 → 18,000(+2판·우라 2). 카드 문구대로 의도된 상승이다.
- **silent_pact × meld_dissolve** — 평범한 후로가 하나라도 있었으면 파혼이 남은 묵계 표식을 떼어 낸다(`meld_dissolve.ts:241-256`).
- **no_ron_pact × meld_dissolve** — 실제 콜 경로로 퐁→파혼해도 `melded` 표식이 남아 조약이 되살아나지 않는다.
- **no_ron_pact × pond_snatch** — 날치기는 멘쯔를 만들지 않아 조약이 유효하게 유지된다(설명대로).
- **no_ron_pact × silent_pact** — 묵계 퐁도 «멘쯔»라 조약이 파기된다(detail이 명시).
- **eternal_dealer × honba_hunter** — 오야 배율(16,000→24,000)과 본장 1,500(3본장 +4,500)이 **둘 다** 실린다. 연장으로 본장이 계속 오르는 설계 시너지도 실측 확인(다음 국 honba=4).
- **eternal_dealer × pseudo_dealer** — 강탈로 진짜 오야가 된 국의 화료는 만년 오야의 연장 횟수를 **소모하지 않는다**(예산 절약 = 의도된 시너지).
- **honba_hunter × pseudo_dealer** — 오야 배율과 본장 단가가 독립적으로 함께 적용된다.
- **avenger × die_hard / karma / sign_flip** — 복수자는 `winInfos`만 읽어 delta 조작과 간섭하지 않는다.
- **reload × die_hard / karma / seat_swap / pond_snatch** — 소진 카운터가 1 되감기고 다시 쓸 수 있게 된다.
- **reload × sign_flip** — 선발동형 복구 경로가 `armedRound` 표식을 지워 다음 국에 다시 켜진다.
- **reload × pseudo_dealer** — 쿨다운형이라 후보에 뜨지 않는다(`isCooldownReference` 규약대로, 정상).
- **짝 전수 스위프(252쌍 × 2시드, 동풍전)** — 아래 「스위프 결과」 참조.

## 스위프 결과

`sweep.ts` — 담당 23종에서 conflicts를 뺀 **짝 252개 × 시드 2개 = 504판**을 동풍전으로
완주(페르소나: 증강광 p0 / 울보 p1 / 리치돌격 p2 / 혼돈 p3, 타임아웃 90초).

```
# 짝 63 / 전체 252   ×4 청크
# 끝 — 문제 있는 조합 0   ×4
```

- 크래시 0 · 훅 예외(`onEffectError`) 0 · 상태 불변식 위반 0 · 소프트락(타임아웃) 0
- `SCORE_DRIFT_UNEXPLAINED`(근거 없는 뱅크 발행) 0.
  `SCORE_DRIFT_ATTRIBUTED`(augPoints·ScoreChanged.reason로 설명되는 발행)는 설계이므로 집계에서 뺐다 —
  **결함 5의 48,000점 발행도 이 «설명되는» 쪽에 들어간다.** 스위프는 «출처가 있는가»만 보고
  «금액이 타당한가»는 못 본다. 그래서 상한 문제는 전용 스크립트로만 잡힌다.

재실행: `tsx qa-lab/synergy4/misc/sweep.ts <시작index> <개수>` (인자 없으면 전체).

## 하네스 주의 (다음 사람에게)

`craft`로 미리 박아 둔 후로는 «후로가 생기는 이벤트»를 내지 않는다. 그래서
`no_ron_pact`의 `melded` 표식처럼 **이벤트 관측으로 굳는 국 스코프 표식**은 서지 않는다
(`menzen_keepers.ts` ②가 그 함정에 빠져 조약이 되살아난 것처럼 보였다). 그런 판정은
`pact_dissolve.ts`처럼 **실제 콜 액션을 태워서** 확인해야 한다.
