# synergy4 — 방해·수비·강(disrupt / defense / river / steal) 축 보고서

작업 워크트리: `~/majak/.claude/worktrees/augment-synergy-qa-test-ef77c4`
스크립트: `qa-lab/synergy4/disrupt/*.ts` (실행 `node_modules/.bin/tsx qa-lab/synergy4/disrupt/<파일>.ts`, 워크트리 루트에서)
**소스는 한 줄도 고치지 않았다.**

---

## 0. 담당 축의 증강 (33장)

`catalog.tsv` 에서 `disrupt|defense|river|steal` 태그가 붙은 전부:

counter(카운터) · yakuman_shield(역만 방어술) · pseudo_dealer(찬탈자) · last_stand(승부수) ·
scapegoat(덤터기) · invincible(천하무적) · hidden_river(안개 덮인 바닥) · discard_lock(봉인술사) ·
seat_swap(자리 바꿈) · parasite(기생충) · nagashi_yakuman(유국역만) · pond_snatch(날치기) ·
grave_rob(무덤 도굴) · spy(스파이) · karma(카르마) · silent_swap(정적의 손) · rank_gate(격) ·
void_kan(성립하지 않는 깡) · siege_riichi(공성계) · no_ron_pact(불가침 조약) · always_tenpai(승승장구) ·
call_seal(함구령) · brief_fog(박무) · bottom_yaku(바닥의 족보) · tenpai_scan(천리안) ·
danger_sense(지뢰 탐지) · disarm(무장해제) · push_riichi(등 떠밀기) · honor_return(귀환) ·
frame_up(누명) · time_pressure(초읽기) · blind_ron(눈먼 총알) · picky_eater(편식)

`conflicts` 로 잠긴 짝(제외): `invincible+no_ron_pact`, `siege_riichi+always_tenpai`.
(`die_hard` 는 이 축 밖이지만 `yakuman_shield`·`invincible`·`no_ron_pact`·`always_tenpai` 와 상호 배제라 함께 제외된다.)

축 안의 2장 조합은 **526개**(conflicts 제외, 전체 528개 중) — 목록 생성기는
`qa-lab/synergy4/disrupt/pairs.ts`.

---

## 1. «서로를 키워 줄 법한» 조합 — 클러스터별 전수 열거 (88짝)

`pairs.ts` 출력. `~~..~~` 는 conflicts 로 잠긴 것.

| 클러스터 | 짝 |
|---|---|
| 강 회수(버림패를 손·화료로 되살린다) | pond_snatch+grave_rob, pond_snatch+silent_swap, pond_snatch+frame_up, grave_rob+silent_swap, grave_rob+frame_up, silent_swap+frame_up |
| 강 이력으로 값을 만든다 | bottom_yaku+nagashi_yakuman, bottom_yaku+picky_eater, bottom_yaku+honor_return, bottom_yaku+frame_up, nagashi_yakuman+picky_eater, nagashi_yakuman+honor_return, nagashi_yakuman+frame_up, picky_eater+honor_return, picky_eater+frame_up, honor_return+frame_up |
| 강을 가린다(정보) | hidden_river+brief_fog, hidden_river+tenpai_scan, hidden_river+danger_sense, brief_fog+tenpai_scan, brief_fog+danger_sense, tenpai_scan+danger_sense |
| 방총·실점을 줄인다 | yakuman_shield+invincible, yakuman_shield+no_ron_pact, yakuman_shield+always_tenpai, yakuman_shield+karma, ~~invincible+no_ron_pact~~, invincible+always_tenpai, invincible+karma, no_ron_pact+always_tenpai, no_ron_pact+karma, always_tenpai+karma |
| 지불자를 재배선한다 | scapegoat+blind_ron, scapegoat+parasite, scapegoat+spy, blind_ron+parasite, blind_ron+spy, parasite+spy |
| 상대 화료에 +판/강탈 | counter+push_riichi, counter+scapegoat, counter+spy, counter+parasite, counter+karma, push_riichi+scapegoat, push_riichi+spy, push_riichi+parasite, push_riichi+karma, scapegoat+spy, scapegoat+parasite, scapegoat+karma, spy+parasite, spy+karma, parasite+karma |
| 상대 행동을 막는다 | discard_lock+call_seal, discard_lock+rank_gate, discard_lock+disarm, discard_lock+invincible, discard_lock+no_ron_pact, discard_lock+time_pressure, discard_lock+blind_ron, call_seal+rank_gate, call_seal+disarm, call_seal+invincible, call_seal+no_ron_pact, call_seal+time_pressure, call_seal+blind_ron, rank_gate+disarm, rank_gate+invincible, rank_gate+no_ron_pact, rank_gate+time_pressure, rank_gate+blind_ron, disarm+invincible, disarm+no_ron_pact, disarm+time_pressure, disarm+blind_ron, ~~invincible+no_ron_pact~~, invincible+time_pressure, invincible+blind_ron, no_ron_pact+time_pressure, no_ron_pact+blind_ron, time_pressure+blind_ron |
| 상대를 리치로 민다/리치를 판다 | counter+push_riichi, counter+siege_riichi, counter+last_stand, push_riichi+siege_riichi, push_riichi+last_stand, siege_riichi+last_stand |
| 자리·오야를 흔든다 | seat_swap+pseudo_dealer |

---

## 2. 확정 결함

### 확정 1 — 카운터 × 등 떠밀기: «+3판»과 «+2판»이 합쳐지지 않는다 (일부 손에서는 +2판이 **통째로 사라진다**)

- **조합**: `counter`(카운터) + `push_riichi`(등 떠밀기), 같은 사람. 같은 상대가 «그 국에 먼저 리치를 건 사람»이자 «내가 떠밀어 리치를 걸게 만든 사람»일 때(등 떠밀기로 강제된 리치가 그 국 최초 리치면 자연히 그렇게 된다), 그 상대에게 **직격 론**.
- **기대(설명 근거)**: 카운터 「그 상대를 직격 론으로 잡으면 **+3판**」, 등 떠밀기 「그렇게 떠민 사람을 직격 론으로 잡으면 **+2판**」.
  저장소 자신의 규약(`packages/content/src/util.ts:799-839` `addWinPointBonus` 의 `hanSoFar` 주석)이
  «"+N판" 계열이 겹칠 때 각자 원본 `info.han` 을 밑값으로 삼으면 합이 +(N+M)판이 되지 않는다»고
  못 박고 그 문제를 `hanSoFar` 로 이미 고쳐 두었다. 즉 기대값은 **+5판 한 번**이다.
- **실측** (`p1e_scan.ts`, 표준 정산 · 「+3판/+2판/합」은 counter 의 «선리치자 손 가치 강탈» 성분을 별도 대조군(론을 제3자에게서)으로 빼낸 순수 판수 성분):

  | 판 | 손 | han/fu | +3판 | +2판 | 실측 합 | 정답(+5판) | 어긋남 |
  |---|---|---|---|---|---|---|---|
  | 자 | 탕야오핑후 | 5/30 | 8000 | 4000 | 12000 | 8000 | **+4000** |
  | 자 | 삼색 | 2/40 | 5400 | 5400 | 10800 | 9400 | +1400 |
  | 자 | 청일색 | 8/40 | 8000 | **0** | 8000 | 16000 | **−8000** |
  | 오야 | 탕야오핑후 | 5/30 | 12000 | 6000 | 18000 | 12000 | +6000 |
  | 오야 | 삼색 | 2/40 | 8100 | 8100 | 16200 | 14100 | +2100 |
  | 오야 | 청일색 | 8/40 | 12000 | **0** | 12000 | 24000 | **−12000** |

  8판 손에서는 **등 떠밀기의 +2판이 0원**이다(8판→10판이 여전히 배만이라). 규약대로
  `hanSoFar=3` 을 밑값에 얹었다면 11판→13판(계수역만)이 되어 **12,000(자)·24,000(오야)** 이 붙어야 했다.
  즉 «둘 다 들면 카드 한 장이 조용히 사라지는» 선례(동수의 결속+양극)와 같은 모양이다.
  상한이 없는 판(뚫린 천장)에서는 선형 구간이라 −300~−500 로 줄지만 여전히 정확하지 않다.
- **원인**: `packages/content/src/augments/counter.ts:368-374` —
  `winPointsWithExtraHan(ic.state, holder, mine, DIRECT_HIT_BONUS_HAN, ctx.engine.rules)`
  로 **`hanSoFar` 를 넘기지 않는다**(기본값 0). 게다가 같은 인터셉터가
  `withAugPoint(p, ctx, bonus)` 로 **`han` 을 적지 않아**(counter.ts:381),
  뒤에 도는 `addWinPointBonus`(push_riichi)의 `hanSoFar` 집계
  (`util.ts:820-822`, `augPoints` 중 `han` 이 있는 줄만 더한다)에도 0으로 잡힌다.
  카탈로그 전체에서 `addWinHanBonus`/`addWinPointBonus` 를 거치지 않고
  `winPointsWithExtraHan` 을 직접 부르는 곳은 counter 하나뿐이다.
- **재현**: `qa-lab/synergy4/disrupt/p1_counter_push.ts`, `p1b_counter_push.ts`, `p1c_isolate.ts`, `p1e_scan.ts`
- **심각도**: **높음** — 조합의 값이 최대 24,000점(오야 청일색) 틀리고, 방향이 손에 따라 뒤집힌다(과지급/미지급 둘 다).
  counter 는 다른 축의 "+N판" 카드(해저의 지배자·예지·미래시·개전 리치·대기만성·혼 일격 …)와도 같은 문제를 낸다.

### 확정 2 — 격(rank_gate) × 무덤 도굴(grave_rob): 화료할 수 없는 패를 후보로 내고 게임 1회뿐인 사용 횟수를 태운다

- **조합**: `grave_rob` 보유자가 `rank_gate`(격, 「이번 국에 4판 이하로는 화료할 수 없다」)에 지목당한 국.
- **기대**: `grave_rob.ts:196` 의 주석이 스스로 못 박은 규약 —
  「화료가 성립하는 무덤 패만 후보로 제시한다 … 후보 단계에서 미리 거르지 않으면
  "화료되는 패만 제시한다"는 약속이 깨지고, **게임 1회뿐인 사용 횟수를 화료하지 못하는 도굴에 태우게 된다**」.
- **실측** (`p3_grave_rankgate.ts`, p0 3판 20부 손, 오름패 4p 가 p1 바닥에):

  ```
  ## rank_gate 없음        후보 1개 · win.minHan(p0)=0 → 제출 결과 roundOver, p0 +3900
  ## rank_gate 걸림(5판)   후보 1개 · win.minHan(p0)=5 → 제출 결과 awaiting(버림 프롬프트)
                            손패 14 → 14 · grave_rob:uses:p0 = 1  (화료 없음, 횟수만 소진)
  ```
  즉 «파낼 수 있다»는 버튼이 그대로 뜨고, 누르면 무덤 패가 손에 들어오고 쯔모패는 패산으로 가고
  사용 횟수가 1 올라간 뒤 **화료가 일어나지 않는다**. 국은 그대로 계속된다.
- **원인**: `packages/content/src/augments/grave_rob.ts:196-228` `robWins()` 가
  역(`win.requiresYaku`)과 후리텐만 확인하고 **`win.minHan` 게이트를 보지 않는다.**
  실제 자동 화료는 `packages/core/src/mahjong/flow/FlowController.ts:286-293` 에서
  `validateOk(actor,"win")` 을 통과해야 성립하는데, 그 경로의
  `packages/core/src/mahjong/flow/standardActions.ts:304` `belowMinHan()` 이 막는다.
  (같은 함수는 `score.extraHan` 만 세므로, 카운터·덤터기·등 떠밀기가 주는 정산 시점 "+N판"으로는
  이 문턱을 넘을 수 없다 — `spectateScore.ts:315` 가 그 경계를 명시해 둔다.)
- **재현**: `qa-lab/synergy4/disrupt/p3_grave_rankgate.ts`
- **심각도**: **중간** — 크래시는 없지만 매치 1~2회뿐인 자원이 조용히 증발하고, 화면의 약속과 결과가 어긋난다.

### 확정 3 — 무장해제(disarm)를 둘 이상이 들면 국 경계에서 잠금이 하나 남는다

- **조합**: `disarm` × `disarm` (서로 다른 두 사람이 같은 국에 각자 하나씩 잠갔을 때).
- **기대**: description 「**이번 국 동안** 완전히 무효화한다 … 국이 끝나면 증강도 돌아온다」 →
  정산이 끝나면 `engine:disarmed#round` 목록은 비어야 한다.
- **실측** (`p7_disarm.ts`):

  ```
  disarm 1명(p0)                       시작 ["aug:p1:counter"]                       → 정산 후 []
  disarm 2명(p0·p2)                    시작 ["aug:p1:counter","aug:p3:parasite"]      → 정산 후 ["aug:p1:counter"]
  disarm 3명(p0·p2·p3)                 시작 [counter, spy, karma]                     → 정산 후 [counter, spy]
  실제 동풍전(seed 4242, p0·p2 가 disarm)  1국 정산 후 ["aug:p1:spy"] 가 남았다
  ```
  즉 **마지막에 도는 보유자의 리액션만 반영되고 앞선 보유자의 해제 취소가 되살아난다.**
- **원인**: `packages/content/src/augments/disarm.ts:161-167` — 보유자마다 등록된 `ROUND_SETTLED` 리액션이
  `disarmedList(rc.state).filter(내 것 제외)` 로 **목록 전체를 다시 쓴다**. 리액션은 보유자 수만큼 돌고
  각자 자기 시점의 목록을 통째로 덮으므로 마지막 쓰기가 이긴다(눈먼 총알이 `blindRonApplied`
  표식으로, 죽기살기가 `ReviveMark` 로 해결해 둔 것과 같은 «보유자 수만큼 도는 인터셉터» 문제).
  같은 리액션이 `lockedKey`(국 스코프)도 비우므로 **다음 국에는 다시 지울 기회조차 없다.**
- **범위**: `DISARMED_SOURCES_KEY = "engine:disarmed#round"` 는 국 스코프 표식이 붙어 있어
  다음 국 `setupRound` 에서 엔진이 통째로 지운다. 그래서 잔재가 사는 구간은
  **정산 화면 ~ 증강 드래프트 ~ 다음 국 시작 직전**이다(실측 (d) 에서 확인). 매치 끝까지 남지는 않는다.
- **재현**: `qa-lab/synergy4/disrupt/p7_disarm.ts`
- **심각도**: **낮음** — 그 구간의 뷰(결과 화면·드래프트에서 잠긴 것으로 보이는 증강)와
  그 구간에 `isSourceDisarmed` 를 읽는 코드가 잘못된 답을 받는다. 다음 국 판정에는 새지 않는다.

---

## 3. 의심 (확정 못 한 것)

### 의심 1 — 기생충은 «뱅크 발행분»까지 절반을 가져간다 (스파이는 그러지 않는다)

`p4_steal.ts` P4d · `p10_payout.ts` P10a 실측:

| 장면 | 결과 |
|---|---|
| counter(p0, 3900 손 → 뱅크 24,100 발행) · parasite(p3→p0) | p0 +14,000, **p3 +14,000** (뱅크 발행분의 절반을 그대로 빨아먹는다) |
| scapegoat(p0, +2판 뱅크 6,000) · parasite(p3→p0) | p0 +6,000, **p3 +6,000** |

`spy` 는 2026-08-23(QA synergy3 score 확정 2·5) 에 정확히 이 경로를 막았다 —
「`deltas[winner]` 를 통째로 가져가면 뱅크가 화료자에게 따로 발행한 몫까지 섞인다」며
훔치는 상한을 `hit.points + honba + pot` 으로 잘랐다(`spy.ts:157-166`).
`parasite` 에는 그 상한이 없다(`parasite.ts:105-124`, 최종 `deltas[host]` 의 절반).

**확정으로 올리지 못한 이유**: parasite 의 detail 은 「숙주가 얻는 점수의 절반」이라 문언상
최종 증감을 가리키는 것으로도 읽히고, 인터셉터 주석도 「Transfer — 숙주 획득의 절반 강탈 —
**최종 획득 기준**」이라고 의도를 적어 두었다. 두 강탈 카드의 기준이 서로 다른 것이
설계인지 누락인지는 사용자 판단이 필요하다.

### 의심 2 — 역만 방어술이 여럿이면 화료자의 수령이 0까지 깎인다 (유국역만 경로와 정책이 반대다)

`p6_shield.ts` P6 실측: 스안커단기 쯔모 96,000 에 상대 셋이 전부 `yakuman_shield` →
**p0 수령 0**, 셋 다 손실 0.

`nagashi_yakuman.ts:141-150` 은 같은 상황에서 정확히 반대 정책을 택하고 그 이유를 적어 두었다 —
「내 손과 무관한 남의 드래프트 결과가 내 타점을 33% 깎는 것이라 무페널티 원칙(PROJECT_CHARTER)에
어긋난다 … **면제분은 뱅크가 낸다**」. 화료 경로(`yakuman_shield` 인터셉터)는
「환급된 만큼 화료자의 획득이 줄고 모자란 몫은 뱅크가 낸다」로 detail 에 명시돼 있어
**문서와는 일치**하지만, 같은 게임의 같은 상황(유국역만 vs 역만 화료)에서 정책이 갈린다.

**확정 못 한 이유**: detail 이 현재 동작을 그대로 적고 있다. 규칙 위반이 아니라 정책 불일치다.

### 의심 3 — 날치기는 한 턴에 여러 번 눌러 «강 다시 뽑기» 가 된다

`p8_chain.ts`: 날치기로 5p 를 주운 뒤에도 같은 턴에 날치기 후보 5개가 그대로 뜨고,
이어서 무덤 도굴까지 연결된다(실측: 연쇄 후에도 패 배치 136/136 · 중복 없음 · 정상 화료).
매 사용이 횟수를 1 소모하고 직전에 주운 패는 패산 맨 밑으로 돌아가므로 패가 늘지는 않지만,
설명(「자기 순에 쯔모하는 대신 … 1장을 주워」)은 «순당 한 번»으로 읽힌다.
또 그렇게 되돌린 패는 원래 주인의 바닥이 아니라 **패산**으로 가므로 상대 바닥이 영구히 한 장 줄어든다
(후리텐·유국역만·바닥의 족보 판정은 전부 이력을 보므로 영향 없음 — 실측·소스 확인).
**확정 못 한 이유**: 어떤 불변식도 깨지지 않고 이득도 없다(횟수만 소모). 의도 확인이 필요하다.

---

## 4. 이상 없음으로 판정한 조합 (한 줄 요약)

측정으로 확인한 것:

- `pond_snatch+silent_swap`, `grave_rob+silent_swap`, `pond_snatch+grave_rob`, 셋 다 (`p5_furiten.ts`) — 후리텐 약속이 서로를 침범하지 않는다. 정적의 손은 셋을 다 들어도 후리텐 쯔모 화료가 열리고(`win.tsumoFuriten=false`, `win.validate=null`), 날치기로 집은 패는 셋 다 들어도 막힌다(`=true`, `furiten`), 도굴은 후리텐이면 후보 자체가 0개다.
- `pond_snatch+grave_rob` 연쇄 (`p8_chain.ts`) — 패 중복·유실 없음(136/136), 정상 정산.
- `nagashi_yakuman+always_tenpai` (같은 사람, 둘 다 DrawPatch) (`p2_draw.ts`) — 역만 32,000 과 노텐당 2,000 이 **둘 다** 선다(A 31,000 / B 13,500 / A+B 37,500 = 정확히 가산).
- `nagashi_yakuman+yakuman_shield`(상대) — 방어막 보유자만 면제되고 화료자 수령 32,000 은 그대로, 면제분은 뱅크.
- `always_tenpai` × `always_tenpai`(둘이 보유) — `tenpaiPlayers` 로 판정해 서로를 노텐으로 세지 않는다.
- `yakuman_shield` 1~3장 겹침, `yakuman_shield+scapegoat`(전액 몰아준 96,000 역만 쯔모 → 96,000 전액 환급) (`p6_shield.ts`) — 이중 감면 없음, 배만 절반 감면도 각자 자기 몫만.
- `parasite+spy`(같은 사람·같은 대상) (`p4_steal.ts`) — 이동 총액이 숙주가 받은 것을 넘지 않고 순서에 따라 갈리지 않는다.
- `parasite`×`parasite`(같은 숙주), `spy`×`spy`(같은 패) — 순차 반감/두 번째는 0. 이중 강탈 없음.
- `scapegoat+parasite`, `scapegoat+blind_ron`, `blind_ron+spy`, `blind_ron`×`blind_ron` (`p10_payout.ts`) — 덤터기의 「나머지 둘은 한 푼도 내지 않는다」가 유지되고, 눈먼 총알은 보유자가 둘이어도 국당 한 번만 쏜다.
- `counter+last_stand` (`p9_counter_laststand.ts`) — 리치 취소로 대납 1,000 이 되돌아가고 `counter:struck` 이 내려간다.
- `hidden_river+brief_fog`(같은 사람) (`p11_fog.ts`) — 보유자는 네 바닥을 전부 보고(8/8), 상대에게는 더 센 쪽(박무)만 적용된다. 두 겹으로 더 가려지지 않는다.
- 축 전체 짝 스윕(`sweep.ts`, 한 사람에게 2장씩 몰아 동풍전 완주 · 페르소나 4종) — 크래시 0 · 훅 예외 0 · 불변식 위반 0 (아래 §5).

소스 확인만으로 «이미 고쳐져 있다»를 확인한 것(과거 라운드의 회귀 방지 주석이 근거를 달고 있고, 위 측정과 모순되지 않는다):

- `frame_up` × {`bottom_yaku`, `nagashi_yakuman`, `picky_eater`, `pond_snatch`, `grave_rob`, `silent_swap`, `honor_return`, `discard_lock`, `push_riichi`} — 누명의 `creditTo` 가 만드는 «내 바닥/남의 바닥» 갈라짐은 각 카드가 `ownDiscards`(실제로 내가 버린 것)·`discardedByPlayer`·`brokeNagashi` 표식·`lockedDiscardIds` 로 이미 막아 두었다.
- `discard_lock` × `call_seal` × `rank_gate` — 각각 `discard.blockedTileIds`(합집합) · `call.blocked`(OR) · `win.minHan`(max) 라 서로를 덮지 않는다. 보유자가 여럿이어도 누적된다.
- `invincible` × `void_kan` — 무적은 `chankan.player === holder` 를 예외로 두어 창깡을 막지 않는다.
- `disarm` × `bottom_yaku`(다른 사람이 같은 역을 등록) — `evaluate.ts:216-228 isYakuDisarmed` 가 소스를 화료자 기준으로 되짚어, 한 사람의 무장해제가 다른 보유자의 역까지 끄지 않는다.
- `discard_lock` × `seat_swap` — 봉인은 tileId 를 따라가고 보유자의 세 대상 키를 합집합으로 읽는다.

---

## 5. 스윕 (자동 그물)

`qa-lab/synergy4/disrupt/sweep.ts` — 축 526짝을 «한 사람이 2장 다 든다» 로 강제하고
(같은 2장을 p0·p1 둘에게 줘 보유자 중복 경로도 함께 태운다) 페르소나 4종으로 완주,
매 뷰마다 패 중복·왕패·손패 장수·점수 불변식을 검사한다.

- `START=0 END=60` 샤드 완주 — **60판 중 이상 0건**.
- 나머지 구간을 4개 샤드(60~200 / 200~300 / 300~400 / 400~463 / 463~526)로 병렬 실행,
  보고서 작성 시점까지 **355짝**을 돌았고 **크래시·훅 예외·불변식 위반·설명 불가 점수 드리프트가 한 건도 없다.**
  (로그: `/tmp/sw2.log`, `/tmp/swA..D.log` — 임시 파일이라 재실행이 필요하면 위 명령을 그대로 쓴다.
   남은 ~170짝은 같은 명령의 `START`/`END` 만 바꿔 이어 돌리면 된다.)
- 즉 **이 축의 결함은 "깨진다"가 아니라 "숫자·약속이 어긋난다" 쪽에만 있다** — §2 의 셋은 전부
  불변식을 통과하면서 값만 틀리는 종류라 이 그물로는 잡히지 않고, 대조군 측정으로만 보인다.

---

## 6. 파일 목록

| 파일 | 하는 일 |
|---|---|
| `lib.ts` / `scenes_local.ts` | synergy3 정산 하네스 재수출 + 이 축에서 쓰는 augmentData 키 |
| `drawlib.ts` | **유국** 정산 하네스(패산을 비워 황패유국까지 몬다) — 이 라운드에서 새로 만들었다 |
| `pairs.ts` | 축 내부 조합 열거 |
| `p1_counter_push.ts` / `p1b` / `p1c_isolate` / `p1d_probe` / `p1e_scan` | 확정 1 |
| `p2_draw.ts` | 유국역만 × 승승장구 × 역만 방어술 |
| `p3_grave_rankgate.ts` | 확정 2 |
| `p4_steal.ts` | 기생충 × 스파이 × 카운터 |
| `p5_furiten.ts` | 강 회수 3종의 후리텐 정합성 |
| `p6_shield.ts` | 역만 방어술 겹침 · 덤터기 연동 |
| `p7_disarm.ts` | 확정 3 |
| `p8_chain.ts` | 강 회수 연쇄 · 패 무결성 |
| `p9_counter_laststand.ts` | 카운터 × 승부수 |
| `p10_payout.ts` | 지불 재배선 클러스터 |
| `p11_fog.ts` | 안개 두 장 |
| `sweep.ts` | 축 전체 짝 완주 스윕 |
