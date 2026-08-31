# synergy4 — 리치 축 (riichi / riichi_declare / riichi_value / riichi_open / riichi_deny / opp_riichi / menzen)

측정 2026-08-31 · 워크트리 `augment-synergy-qa-test-ef77c4` · 소스 무수정.
수치는 전부 유닛 재현(`craft` + `mkGame` + `FlowController`)으로 **같은 배패·같은 왕패·같은 진행**에서
단독 A / 단독 B / A+B 를 나란히 잰 것이다. 스크립트는 `qa-lab/synergy4/riichi/` 아래.

## 담당 축의 증강 26종

counter · ura_peek · riichi_upgrade · free_riichi_discard · peek_riichi_waits · last_stand ·
hidden_blade · open_riichi_reveal · no_retreat · all_or_nothing · pond_snatch · riichi_seal ·
off_by_one · ankan_dora · stealth_riichi · siege_riichi · async_chiitoi · soul_hunt ·
no_ron_pact · late_double · meld_dissolve · silent_pact · regret · push_riichi · palm_flip · soul_strike

---

# 확정 결함

## 확정 1. 🔴 counter × 리치 판수 증강 전부 — **판수를 올려도 총 획득이 전혀 늘지 않는다**

- 조합: `counter` + `no_retreat` / `late_double` / `riichi_upgrade` (2·3·4중 전부)
- 기대(미리 적음): 카운터는 «상대 손 가치 강탈 + 직격 +3판»의 뱅크 발행이고 판수 증강은
  내 화료값을 올린다. 서로 다른 주머니이므로 **덧셈**이어야 한다.
- 실측 (`s8_counter_stack.ts`, 저타점판 = 뒷도라 0, p0 오야, p1 자발 리치 → p1 직격 론):

  | 조합 | han | 화료 점수 | counter 뱅크 | **p0 최종** |
  |---|---|---|---|---|
  | 없음 | 5 | 12,000 | – | 38,000 |
  | K counter 단독 | 5 | 12,000 | 17,200 | **56,200** |
  | A no_retreat 단독 | 7 | 18,000 | – | 44,000 |
  | B late_double 단독 | 7 | 18,000 | – | 44,000 |
  | C riichi_upgrade 단독 | 6 | 18,000 | – | 44,000 |
  | **K+A** | 7 | 18,000 | 11,200 | **56,200** |
  | **K+B** | 7 | 18,000 | 11,200 | **56,200** |
  | **K+C** | 6 | 18,000 | 11,200 | **56,200** |

  A·B·C 어느 것을 얹어도 p0 최종이 **56,200으로 완전히 같다** — 카운터가 있으면 판수 증강
  한 장의 기여가 **정확히 0**이다(단독으로는 +6,000인 자리).
  고타점판에서도 `K+A+B` = `K+A+B+C` = 83,000 으로 셋째·넷째 카드가 0이다.
- 원인: `packages/content/src/augments/counter.ts:368` — 직격 보너스를
  `winPointsWithExtraHan(..., DIRECT_HIT_BONUS_HAN=3)`, 즉 **점수 밴드 차액**으로 낸다.
  총액이 `band(han+3)`에 고정되므로 내가 han을 올린 만큼 카운터 뱅크가 줄어 총합이 그대로다
  (뱅크가 17,200 → 11,200으로 실제로 **줄어든다**).
- 재현: `tsx qa-lab/synergy4/riichi/s8_counter_stack.ts`
- 영향: `counter`는 `riichi` 축을 세 카드와 공유해 드래프트가 함께 띄운다. anti·conflicts 없음.
- 심각도: 높음.

## 확정 2. 🔴 open_riichi_reveal × late_double / riichi_upgrade — **오픈 리치가 값 0이 되고 대가만 남는다**

- 기대: detail — *"그 외의 화료(쯔모·리치자에게서 론)에서는 그 리치를 3판으로 취급한다."*
  단독으로는 실제로 +2판(6,000)이 붙는다. 판수 카드와 겹쳐도 최소한 손해는 아니어야 한다.
- 실측 (`s7_open_riichi_dead.ts`, 저타점판, p1이 리치 중 = 역만 경로 아님):

  | 조합 | han | extra | 점수 | augPoints |
  |---|---|---|---|---|
  | 표준 리치 | 5 | 0 | 12,000 | – |
  | **D open_riichi 단독** | 5 | 0 | 12,000 | **open_riichi_reveal+2판=6,000** |
  | B late_double 단독 | 7 | 1 | 18,000 | – |
  | **D+B** | 7 | 1 | 18,000 | **(없음 = 0)** |
  | C riichi_upgrade 단독 | 6 | 0 | 18,000 | – |
  | **D+C** | 6 | 0 | 18,000 | **(없음 = 0)** |
  | B+C | 9 | 3 | 24,000 | – |
  | **D+B+C** | 9 | 3 | 24,000 | **(없음 = 0)** |

  같은 스크립트의 선언 시점 측정: 세 경우 모두 **공탁 1,000점이 나가고**
  `view:*:open_riichi_reveal:p0#round=["sou1"]` 로 내 오름패가 전원에게 공개된다.
  즉 A+B가 B보다 **나쁘다**(대가만 지불).
- 원인: `open_riichi_reveal.ts:287~300` — "3판 취급은 덮어쓰기"라며 `late_double`(+1)·
  `riichi_upgrade`(트리플 +2)의 판수를 세어 빼기 때문에 차액이 0이 된다
  (2026-08-23 synergy3 확정 6 수정의 반대편 구멍).
- 재현: `tsx qa-lab/synergy4/riichi/s7_open_riichi_dead.ts`
- 심각도: 높음.

## 확정 3. 🔴 open_riichi_reveal × riichi_seal / riichi_upgrade — **직격 역만이 영영 성립하지 않는다 (48,000 → 18,000)**

- 배경: synergy3 확정 1의 수정으로 쏜 사람이 `riichi.blocked`면 역만 게이트가 내려간다
  (`open_riichi_reveal.ts:227`). 수정 자체는 옳고 «회피 불가능한 48,000»은 사라졌다.
  문제는 봉인·승격이 **내가 스스로 켜는 것**이라, 같이 들면 내 오픈 리치가 자기 손으로 역만을 지운다.
- 실측 (`s11_open_seal.ts`, 저타점판):

  | 조합 | 역 | 점수 |
  |---|---|---|
  | D open_riichi 단독 (p1 비리치·비봉인) | open_riichi_strike(역만) | **48,000** |
  | **D + riichi_seal** (p1 봉인) | riichi·ippatsu·ittsuu | 12,000 + aug 6,000 = **18,000** |
  | **D + riichi_upgrade** (하가 p1 봉인) | double_riichi·ippatsu·ittsuu | **18,000** (오픈 리치 기여 0) |
  | riichi_seal 단독 | riichi·ippatsu·ittsuu | 12,000 |

  `riichi_seal`은 셋 전부를 잠그므로 **오픈 리치의 역만은 그 국에 물리적으로 불가능**해진다.
  `riichi_upgrade`는 하가 한 자리를 영구히 잠근다.
- 재현: `tsx qa-lab/synergy4/riichi/s11_open_seal.ts` · `s3b_order_deny.ts`
- 영향: `open_riichi_reveal`(riichi·riichi_declare·**riichi_open**)과
  `riichi_seal`(riichi·riichi_deny·**riichi_open**)이 **축을 둘 공유**해 시너지 표가 서로를 끌어당긴다
  (`packages/core/src/augment/synergy.ts:203,212`). anti 없음.
  «리치 봉쇄 + 리치 공개»는 그림상 가장 자연스러운 조합인데 그 조합이 골드 카드의 결정타를 지운다.
- 심각도: 높음. `open_riichi_reveal` ↔ `riichi_deny` 에 anti(또는 antiIds)가 필요하다.

## 확정 4. 🟠 push_riichi × soul_hunt — **강제 리치를 그대로 «강탈»한다** (counter에는 있는 게이트가 soul_hunt에 없다)

- 기대: 혼 사냥은 *"리치 중인 상대를 론하면 그의 리치를 강탈한다"* — 상대가 **스스로** 리치를
  걸어야 성립하고, 정면 카운터는 상대의 다마텐 전환이다. 등 떠밀기는 그 선택지를 지운다.
- 실측 (`s3_push_exploit.ts`, p0 다마텐 론):

  | 조합 | p1 강제 리치 | han | 점수 | augPoints | **p0 최종** |
  |---|---|---|---|---|---|
  | 0 다마텐 | – | 3 | 7,700 | – | 32,700 |
  | A push_riichi 단독 | true | 3 | 7,700 | push_riichi+2판=4,300 | 38,000 |
  | B soul_hunt 단독 (p1 비리치) | false | 3 | 7,700 | – | 32,700 |
  | **A+B** | true | **7** | **18,000** | push_riichi+2판=6,000 | **50,000** (p1 6,000) |

  뒷도라 3장 + 혼 사냥 1판이 통째로 열린다. 피해자는 아무 선택도 하지 않았다.
- 원인: `counter.ts:234` 는 `if (p.riichiForced !== undefined) return;` 로 강제 리치를 대상에서
  제외하고(synergy3 확정 2 수정) `no_ron_pact.ts:165` 도 같은 게이트를 갖는다.
  그런데 `soul_hunt.ts` 는 `state.round.byPlayer[from]?.riichi != null` 만 본다 — 게이트가 없다.
- 재현: `tsx qa-lab/synergy4/riichi/s3_push_exploit.ts`
- 영향: 두 장 다 `opp_riichi` 축이라 시너지 표가 함께 띄운다. conflicts·anti 없음.
- 심각도: 중상. 수정 선례가 같은 저장소 안에 있다.

## 확정 5. 🟠 no_ron_pact × ankan_dora — **한 장의 유일한 발동이 다른 한 장을 그 국 내내 죽인다** (시너지 표가 둘을 묶는다)

- 실측 (`s4_pact_ankan.ts`):

  | 조합 | 안깡 전 `win.ronImmune` | 안깡 후 |
  |---|---|---|
  | no_ron_pact 단독 (안깡 안 함) | **true** | – |
  | no_ron_pact 단독 (안깡) | true | **false** · 배너 `"조약 파기 — 론 가능"` |
  | ankan_dora + no_ron_pact (안깡) | true | **false** (밀실 도라 `["man5"]`는 정상 발동) |

  밀실의 도라를 **쓰는 순간** 조약이 영구 파기되고, 안 쓰면 밀실의 도라가 0이다.
- 원인: 동작 자체는 문서화돼 있다(`no_ron_pact.ts:104`, detail에 "안깡도 파기" 명시).
  **결함은 시너지 표에 있다** — `no_ron_pact: anti ["call","riichi"]` 인데 `ankan_dora`는
  `["kan","dora","menzen"]` 이라 anti에 안 걸리고 오히려 `menzen`을 공유해 **같이 뜬다**
  (`synergy.ts:234,342`). 같은 이유로 `meld_dissolve`·`silent_pact`는 `call` 태그 덕에 정상 처리된다.
- 재현: `tsx qa-lab/synergy4/riichi/s4_pact_ankan.ts`
- 심각도: 중. `no_ron_pact.anti`에 `kan` 추가(또는 `antiIds:["ankan_dora"]`)면 끝난다.

## 확정 6. 🟡 push_riichi × peek_riichi_waits — 간파의 전제도 낙인이 만들어 준다

- 실측 (`s3_push_exploit.ts`):
  - `peek_riichi_waits` 단독(p1 비리치): 자기 순에 `peek_waits` **버튼 자체가 없다**.
  - `push_riichi + peek_riichi_waits`: 낙인 → p1 강제 리치 → 같은 순에 버튼이 생기고 사용 성공
    (`peek_riichi_waits:used=true`, 남은 횟수 1→0).
- 확정 4와 같은 모양이되 정보만 얻는다(점수 변화 없음). 두 장 다 `opp_riichi` 축, anti·conflicts 없음.
- 심각도: 낮음~중.

## 확정 7. 🟡 리치 «선언 버튼» 5종이 여전히 같은 순에 한꺼번에 뜬다 (synergy3 확정 9 미수정)

- 실측 (`s2_declare_clash.ts`): `no_retreat + open_riichi_reveal + all_or_nothing + soul_strike` 를
  함께 들면 한 순에 `riichi, no_retreat_riichi, open_riichi, all_in_riichi, soul_strike` **다섯 개**가 뜬다.
  리치는 국당 한 번이므로 넷은 그 국에 죽는다.
- 소모 검사: 하나를 써도 나머지의 남은 횟수는 줄지 않는다(정상). 다만 표준 `riichi`만 눌러도
  `view:p0:uses:all_or_nothing` 이 `left:0` 으로 떨어져 「쓰지도 않았는데 0」으로 보인다.
- `SELF_ANTI_TAGS = ["riichi_declare"]` 는 확률만 낮출 뿐 막지 않는다.
- 심각도: 낮음(재보고).

## 확정 8. 🟡 soul_strike의 «리치 2판(더블이면 3판)»이 점수 밴드 안에서 사라진다 (synergy3 확정 10 미수정)

- 실측 (`_base_han_stack.ts`): `soul_strike` 단독 = 24,000, `riichi_upgrade + soul_strike` = 24,000
  — 판수가 `han` 열에 나타나지 않고 `addWinHanBonus`의 밴드 차액으로만 나간다.
  `late_double + soul_strike` 에서만 밴드를 넘어 `soul_strike+1판=12,000` 이 붙는다.
- 원인: `soul_strike.ts:325` `addWinHanBonus`. `score.extraHan`(진짜 판수)과
  `addWinHanBonus`(점수 환산)가 섞여 있다 — 확정 1·2와 같은 뿌리다.
- 심각도: 낮음(재보고).

---

# 의심

## 의심 1. 🟠 regret × free_riichi_discard — 보존되는 13장이 **노텐**일 수 있다 (synergy3 의심 2, 이번에 발산을 실측)

- `regret`은 `regret.ts:132` 에서 `menzenTenpai`(= 규칙 `hand.winTileIds`)로 판정하고
  `:133` 에서 `handIdsOf`(**물리 손패**)를 보존한다. `free_riichi_discard`는 그 규칙을
  리치 선언 시점의 스냅샷으로 덮는다(`free_riichi_discard.ts:220`).
- 실측 (`s12_regret_free.ts`) — 자유 선언으로 손을 무너뜨린 뒤 같은 상태에서 두 판정을 나란히:

  ```
  스냅샷 손: 1m2m3m4m5m6m7m8m9m 2p2p2p 1s   → 대기 [sou1]  텐파이=true
  물리   손: 3m4m5m6m7m8m9m 2p2p2p 1s 9p 1s → 대기 []       텐파이=false
  ```

  같은 국의 유국 정산은 `tenpaiPlayers:["p0","p1","p2"]` 로 p0에게 텐파이료 +1,000을 준다
  (이쪽은 free_riichi_discard의 명시적 설계 — 소스 주석에 "유국 텐파이가 옛 손으로"라고 적혀 있다).
- **확정하지 못한 것**: `regret`이 실제로 그 노텐 13장을 다음 국 배패로 넘기는 장면.
  유닛 하네스는 `createStandardGameFromState`로 국 중간부터 시작해 `ROUND_STARTED`가 없어
  `regret`의 쿨다운 카운터(`trackRoundSeq`)가 초기화되지 않고 `offCooldown`이 false로 남는다.
  실전 반장전 스위프(`s13_regret_match.ts`)는 이번 세션 시간 안에 유국 장면을 잡지 못했다.
  다음 담당자는 `s13`의 시드를 늘려 돌리면 된다.

## 의심 2. 🟡 counter 뱅크 숫자가 «내가 강해질수록 줄어든다»

- 확정 1의 부작용. 같은 상황에서 내 손만 커지면 화면에 `카운터 +17,200 → +11,200` 으로 표시된다.
- 표시 자체는 실제 발행액이라 틀린 것이 아니므로 별건으로 분리했다. 확정 1을 고치면 함께 사라진다.

---

# 이상 없음으로 판정한 조합 (한 줄씩)

| 조합 | 잰 것 | 결과 |
|---|---|---|
| no_retreat × late_double × riichi_upgrade (2·3중 전부) | 판수·뒷도라·일발 스택 | extra = 일발1 + 뒷도라×2 + 트리플2 + 승격1 로 **정확히 덧셈**. 더블 흡수도 카드 문구대로 (`s1`,`s1b`) |
| no_retreat × 일발 | 일발 1→2판 | ✅ |
| no_retreat × 뒷도라 3장 | 장당 2판 | ✅ extra +3 |
| stealth_riichi × no_retreat / late_double | 값 중복 적용 | 선언 버튼이 하나뿐이라 **상호 배타** — 이중 적용 없음, 누락도 없음 |
| stealth_riichi × 26종 공개 채널 감사 | 선언 직후 `view:*` 신규 키 | 새는 것은 `riichi_seal`·`riichi_upgrade`·`no_ron_pact` 셋뿐이고 **전부 이미 stealth의 conflicts** (`s6`) |
| soul_hunt × 내 리치(표준·스텔스·no_retreat) | +1판 이중 적용 | 리치를 걸면 soul_hunt 역이 붙지 않는다 ✅ |
| soul_hunt × no_retreat / late_double (다마텐) | 판수 카드가 다마텐에 새는가 | 안 샌다 ✅ |
| hidden_blade × no_retreat / late_double | 같음 | 안 샌다 ✅ |
| hidden_blade × 내 리치 / 스텔스 리치 | 리치 손에 +2판이 붙는가 | 안 붙는다 ✅ (스텔스도 리치로 취급) |
| hidden_blade × silent_pact | 묵계 퐁 손의 +2판·뒷도라 | 붙는다(3,900 → 18,000). **detail에 "묵계 퐁은 채점에서 멘젠이므로 붙는다"고 명시** → 사양 |
| hidden_blade × soul_hunt | conflicts | 함께 못 든다 ✅ |
| last_stand × riichi_seal | "승부수로 리치를 풀면 봉인도 풀린다" | 취소 즉시 p1/p2/p3 `riichi.blocked` 전부 false ✅ (`s5`) |
| last_stand × riichi_upgrade / seal+upgrade | 봉쇄 해제 | ✅ |
| last_stand × no_retreat / stealth_riichi (공탁 0) | 환급 이중 지급 | 낸 만큼만 = 0 환급, pot 산술 정확 ✅ |
| last_stand × soul_strike | 리치 취소 시 판수 보너스 | 리치 소멸 + pot 환급 ✅ |
| last_stand × siege_riichi + riichi_seal | 노텐 리치 취소 | ✅ |
| last_stand × counter | 취소 시 대납·struck 되돌림 | 소스 게이트 확인 ✅ |
| riichi_seal × 전용 선언 6종 | 봉인이 서는가 | `riichi`·`no_retreat_riichi`·`open_riichi`·`all_in_riichi`·`soul_strike`·siege 전부 정상 착탄 (`s10`) |
| push_riichi × riichi_seal | 낙인이 먹히는가 | **순서와 무관하게 p1이 봉인돼 강제 리치 불발** — 상호 파괴지만 `riichi_seal.anti:["opp_riichi"]`가 이미 처리 중 (`s3b`) |
| push_riichi × riichi_upgrade | 하가만 봉쇄 | 하가를 찍으면 불발, 다른 둘은 정상. anti 처리됨 |
| push_riichi × counter | synergy3 확정 2 재확인 | **수정됨** — `riichiForced` 게이트. A+B = A |
| push_riichi × no_ron_pact | synergy3 확정 3 재확인 | **수정됨** — 강제 리치는 조약 파기 사유가 아니다 |
| open_riichi_reveal × riichi_seal (역만 회피) | synergy3 확정 1 재확인 | **수정됨** — 봉인당한 사람이 쏘면 3판 취급(48,000 → 18,000). 단 그 수정이 확정 3을 만들었다 |
| stealth_riichi × no_ron_pact / open / all_in / soul_strike / off_by_one / palm_flip / upgrade / seal / silent_swap | synergy3 확정 4·9 | **conflicts로 전면 차단** — 함께 들 수 없다 |
| free_riichi_discard × off_by_one | 스냅샷 대기 기준 ±1 밀기 | `off_by_one`이 `winHandIdsOf`(덮인 규칙)를 live로 읽어 정상 동작 |
| siege_riichi × off_by_one | 노텐 리치 | `waits.length === 0` 즉시 반환 — no-op ✅ |
| siege_riichi × riichi_seal | 노텐 리치로 셋을 잠근다 | 동작 확인. 두 카드 어느 쪽도 거짓말이 아니라 **밸런스 의심**으로만 남긴다(synergy3 의심 1과 동일) |
| meld_dissolve × 멘젠 계열 | 해체 후 멘젠 복구 | 소스 머리말에 설계로 명시(리치가 열린다). 조약은 복구되지 않는다(명시) ✅ |
| counter × all_or_nothing | 뱅크 이중 발행 | 각각 별도 기재, 간섭 없음 ✅ |
| counter × 공탁 면제 리치(no_retreat·stealth) | 대납액 | 표준 공탁 1,000으로 고정 ✅ |

## 축 전체 쌍 스위프

`s9_sweep.ts` — 축 26종의 conflicts 제외 전 쌍(322쌍)을 실제 반장전으로 돌려
크래시·훅 예외(`onEffectError`)·상태 불변식(패 중복/유실·왕패 크기·손패 장수·점수 총합·리치봉)을 확인한다.
**이번 세션 안에 완주하지 못했다.** conflicts를 뺀 쌍이 311개인데, 호스트가 절전으로
들어가 반장전 한 판이 실시간 수십 분씩 걸렸다(worker의 CPU 시간이 20분 벽시계 동안 5초만 늘었다).
돌린 구간(선두 25쌍 이상, 두 번의 독립 실행에서 모두 `.. 25/N ok`까지 도달)에서는
**크래시 0 · 훅 예외 0 · 불변식 위반 0**이었다(이상이 있으면 `!!` 줄이 찍히는데 하나도 없었다).
다음 담당자는 그대로 다시 돌리면 된다: `tsx qa-lab/synergy4/riichi/s9_sweep.ts [쌍 수]`.
확정 1~8은 전부 유닛 재현으로 독립 확인된 것이라 이 스위프의 결과에 의존하지 않는다.

---

## 남긴 파일 (`qa-lab/synergy4/riichi/`)

| 파일 | 무엇을 재는가 |
|---|---|
| `lib.ts` | synergy3 공용 도구의 사본(경로만 조정) — `mkGame`·`setIndicators`·`stackWall`·`drive`·`winRow`·`table` |
| `s1_value_stack.ts` | 판수·뒷도라·일발 스택 (고타점판, 뒷도라 3) |
| `s1b_lowhan.ts` | 같은 표의 **저타점판**(뒷도라 0) — 점수 밴드에 먹히는 보너스를 드러낸다. `run()`을 다른 스크립트가 재사용 |
| `s2_declare_clash.ts` | 리치 선언 버튼 5종 동시 제시 · 사용 후 남은 횟수 소모 여부 |
| `s3_push_exploit.ts` | 확정 4·6 — 낙인이 soul_hunt·peek의 전제를 만든다 |
| `s3b_order_deny.ts` | 봉쇄 × 이용의 순서 의존 · `riichi.blocked` 실측 |
| `s4_pact_ankan.ts` | 확정 5 — 안깡이 불가침 조약을 깬다 |
| `s5_last_stand.ts` | 승부수로 리치를 무를 때 봉인·승격·공탁이 함께 풀리는가 (8칸) |
| `s6_stealth_leak.ts` | 스텔스 리치 × 26종 전원 공개 채널 감사 |
| `s7_open_riichi_dead.ts` | 확정 2 — 오픈 리치의 «3판 취급»이 0이 되는 자리 + 공탁·오름패 공개 |
| `s8_counter_stack.ts` | 확정 1 — 카운터 × 판수 증강 (저타점·고타점 두 판) |
| `s9_sweep.ts` | 축 26종 전 쌍의 실전 반장전 크래시·불변식 스위프 (미완) |
| `s10_seal_paths.ts` | 리치 봉인이 전용 선언 경로 6종에서 서는가 |
| `s11_open_seal.ts` | 확정 3 — 오픈 리치 × 봉쇄 계열의 역만 소멸 |
| `s12_regret_free.ts` | 의심 1 — 스냅샷 손 vs 물리 손의 발산 실측 |
| `s13_regret_match.ts` | 의심 1을 실전 반장전에서 잡기 위한 스위프 (미완) |
| `_base_*.ts` | synergy3 재현 스크립트의 사본 — 그때의 확정이 지금도 재현되는지 대조용 |
