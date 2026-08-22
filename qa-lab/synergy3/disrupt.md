# 방해 · 수비 · 좌석 (disrupt / defense / steal / dealer / tempo) — disrupt

담당: `disarm` `call_seal` `discard_lock` `rank_gate` `frame_up` `seat_swap` `time_pressure`
`time_stop` `void_kan` `siege_riichi` `push_riichi` `scapegoat` `blind_ron` `parasite` `spy`
`invincible` `no_ron_pact` `yakuman_shield` `tenpai_scan` `danger_sense` `xray_hand`
`hidden_river` `brief_fog` `dora_conceal` `always_tenpai` `last_stand` `pseudo_dealer`

## 요약

- 소스 27종 전부 정독 → 조합 후보를 직접 골라 **41조합**을 유닛으로 강제 재현했다
  (대조군 4칸 표 8개 포함). 도구는 `craft` + `installAugment` + `FlowController`.
- **확정 5건 (🔴 1 · 🟠 3 · 🟡 1) · 의심 1건 · 음성 확인 20건.**
- 스크립트: `qa-lab/synergy3/disrupt/*.ts` (전부 tsx로 바로 돈다).

| # | 조합 | 한 줄 |
|---|---|---|
| 확정 1 | 🔴 `yakuman_shield` × `scapegoat` | 덤터기가 몰아준 역만 쯔모 지불에는 방어가 **1/3만** 듣는다 — 64,000점이 남는다 |
| 확정 2 | 🟠 `hidden_river` × `brief_fog` | 두 안개를 동시에 걸면 **양쪽 보유자 모두** 자기 카드가 약속한 «그대로 읽기»를 잃는다 |
| 확정 3 | 🟠 `brief_fog` × `brief_fog` | 같은 증강 둘이 서로를 눈멀게 한다 (hidden_river 쪽만 고쳐졌고 박무는 안 고쳐졌다) |
| 확정 4 | 🟠 `disarm` × 선언 상태 증강 7종 | 효과는 꺼지는데 **전원 공개 «효과 진행 중» 배너가 그대로** 남는다 |
| 확정 5 | 🟠 `siege_riichi` × `always_tenpai` | 공성계가 명시한 **유일한 대가(노텐 벌부)** 가 조용히 사라지고 노텐 리치가 흑자가 된다 |
| 의심 1 | 🟡 `push_riichi` × `last_stand` | 밀어 넣은 리치를 그 자리에서 **무료로** 물릴 수 있다 — "숨을 수 없다"가 거짓 |

---

## 확정 1. 🔴 `yakuman_shield` × `scapegoat` — 덤터기로 몰린 역만 쯔모 지불은 **1/3만** 환급된다

- 위치: [`packages/content/src/augments/yakuman_shield.ts:130-146`](../../packages/content/src/augments/yakuman_shield.ts#L130)
  — `paidFor()` 의 쯔모 분기. 상한을 `w.payments.others`(표준 분담)로 잡는다.
  `scapegoat` 의 재배선은 [`scapegoat.ts:112-140`](../../packages/content/src/augments/scapegoat.ts#L112)
  (`SETTLE_STAGE.Redistribute` + `Reassert`).

- 설명이 약속한 것
  - 역만 방어술 description: **"역만(유국역만 포함) 피해를 막는다 — 내가 낸 몫을 전액 돌려받는다."**
    detail: "직격(론)이면 내가 문 화료점 전액, **쯔모면 내 분담분이 돌아온다**."
  - 덤터기 detail: "**지목당한 사람이 전액을 혼자 내고** 나머지 두 명은 한 푼도 내지 않는다 —
    그 국 정산에서 다른 증강이 새로 부과하는 지불까지 그 사람에게 몰린다."
  - 코드 주석도 **론 경로에서는 같은 상황을 명시적으로 처리**한다:
    *"누가 무는지는 보지 않는다: 책임전가·눈먼 총알이 그 지불을 나에게 돌렸어도 역만 피해인 것은 같다."*

- 기대 (미리 적었다): 덤터기가 p1 에게 몰아준 96,000 은 «p1 이 그 역만에 낸 몫» 이므로
  전액 환급 → **p1 최종 증감 0**, p0 수령 0.

- 실제: p1 은 **−64,000** 을 문다. 방어막은 표준 분담분 32,000 만 돌려준다.

  ```
  ### 역만 쯔모(사암각 96,000) × 덤터기(p0→p1) × 역만 방어술(p1)
  ┌─────────────────────┬────────┬───────┬────────────┬────────┬────────┬──────┐
  │ 조합                │ 화료점 │ p0    │ p1(방어막) │ p2     │ p3     │ 총합 │
  ├─────────────────────┼────────┼───────┼────────────┼────────┼────────┼──────┤
  │ 없음                │ 96000  │ 96000 │ -32000     │ -32000 │ -32000 │ 0    │
  │ A=덤터기(p0→p1)     │ 96000  │ 96000 │ -96000     │      0 │      0 │ 0    │
  │ B=역만 방어술(p1)   │ 96000  │ 64000 │      0     │ -32000 │ -32000 │ 0    │
  │ A+B                 │ 96000  │ 64000 │ **-64000** │      0 │      0 │ 0    │  ← 기대 0
  └─────────────────────┴────────┴───────┴────────────┴────────┴────────┴──────┘
  ```
  대조군(론 경로)은 **깨끗하다** — 같은 96,000 역만을 론으로 맞으면 방어막 보유자는 0이 된다
  (상한이 `payments.discarder` = 화료점 전액이라). 즉 **쯔모 경로에만** 뚫려 있다.

- 재현: `tsx qa-lab/synergy3/disrupt/repro_shield_scapegoat.ts`

- 영향: 크기가 그대로 파괴적이다. **64,000점**이면 25,000 시작 판에서 즉사(탈락)다.
  카드가 "횟수 제한 없는 완전 면역"이라고 단언한 gold 증강이, prism이 아니라 gold 한 장
  (덤터기)에 무력화된다. 그리고 화면에는 방어가 **발동한 것으로 표시된다**(카운터 +1,
  환급 32,000이 증감표에 찍힌다) — "막았는데 64,000을 물었다"라 원인을 읽을 수 없다.
  두 증강 모두 `conflicts`도 `antiIds`도 없어 같은 판에 얼마든지 함께 뜬다.

- 제안 수정 (한 줄): `paidFor()` 의 쯔모 분기를 **"내가 그 국에 실제로 문 최종 손실"** 로 바꾸거나,
  더 좁게는 덤터기 표식이 나를 가리킬 때 상한을 `w.points`(화료 총액)로 올린다.
  일반해는 "`Redistribute`/`Reassert` 로 나에게 몰린 몫도 그 역만 때문에 낸 돈"이라는
  주석의 원칙을 쯔모 분기에도 그대로 적용하는 것이다.

---

## 확정 2. 🟠 `hidden_river` × `brief_fog` — 안개 둘을 겹치면 **두 보유자 모두** 눈이 먼다

- 위치
  - [`brief_fog.ts:189-201`](../../packages/content/src/augments/brief_fog.ts#L189)
    — `visibility.discards` 모디파이어가 `rctx.playerId === holder` **자기 보유자 하나만** 면제한다.
  - [`hidden_river.ts:145-163`](../../packages/content/src/augments/hidden_river.ts#L145)
    — 이쪽은 «이번 국에 **안개를 선언한 사람**이면 누구든» 면제한다. 단 그 판정은
    `fogDeclared`(= hidden_river 의 플래그)뿐이라 **박무 선언자는 못 알아본다.**
  - 관계: `AUGMENT_SYNERGY.hidden_river.antiIds = ["brief_fog"]` — **antiIds일 뿐 conflicts가 아니다.**
    같은 판에 함께 뜬다.

- 설명이 약속한 것
  - 안개 덮인 바닥: "…네 사람 모두의 바닥에서 최근 6장만 공개되고 … **보유자만 네 바닥을 그대로 읽는다**."
  - 박무: "…6순 동안 네 사람의 버림패가 가려지고, **나만 네 개의 바닥을 그대로 본다**."

- 기대: 각자 자기 약속대로 **네 바닥을 그대로**(10/10장) 읽는다. 비보유자만 가려진다.

- 실제 (대조군 4칸 — 각 바닥 10장, `p2` 바닥을 몇 장 보는가):

  | 조합 | p0(안개 덮인 바닥) | p1(박무) | p2(비보유) | 규칙 p0→p2 | 규칙 p1→p2 |
  |---|---|---|---|---|---|
  | 없음 | 10장 | 10장 | 10장 | public | public |
  | A=hidden_river만 | **10장** ✅ | 6장 | 6장 | public | peek6 |
  | B=brief_fog만 | 0장 | **10장** ✅ | 0장 | count_only | public |
  | **A+B** | **0장** ❌ | **6장** ❌ | 0장 | count_only | peek6 |

- 재현: `tsx qa-lab/synergy3/disrupt/repro_fog_cross.ts`

- 영향: prism 티어 정보 증강 **둘이 서로를 정확히 죽인다.** 각자 매치당 1~2회뿐인 횟수를
  태우고도 얻는 것이 없고, 오히려 `hidden_river` 보유자는 **아무것도 안 든 것보다 못한**
  상태(0장)가 된다. 화면에는 두 배너("안개", "안개 (N순 남음)")가 나란히 서 있어
  보유자는 자기가 그대로 읽고 있다고 믿는다.
  이건 이미 한 번 고친 결함의 **재발**이다 — hidden_river 는 같은 증상을
  `qa-lab text 확정 5` 로 고치면서 "이번 국에 안개를 선언한 사람이면 누구든 면제"로 넓혔는데,
  그 «누구든»이 자기 증강 안에서만 성립한다.

- 제안 수정: 두 파일의 면제 판정을 **"이번 국에 안개 계열을 선언한 사람"** 공통 술어 하나로
  올린다(`fogDeclared(hidden_river) || fogActive(brief_fog)`). hidden_river 쪽 주석이
  이미 그 의도를 적어 두었다.

---

## 확정 3. 🟠 `brief_fog` × `brief_fog` — 같은 증강 둘이 서로를 눈멀게 한다

같은 뿌리(위 §확정 2)의 좌석 교차판이고, **hidden_river 는 깨끗한데 brief_fog 만 깨진다**는
점에서 별건으로 적는다.

- 기대: 둘 다 "나만 네 개의 바닥을 그대로 본다" → 두 보유자 모두 10장.
- 실제:

  | 조합 | p0 보유자 | p1 보유자 | 비보유자 |
  |---|---|---|---|
  | `hidden_river` × `hidden_river` | **10장** ✅ | **10장** ✅ | 6장 |
  | `brief_fog` × `brief_fog` | **0장** ❌ | **0장** ❌ | 0장 |

- 재현: `tsx qa-lab/synergy3/disrupt/repro_fog_cross.ts` (두 번째 표)
- 영향: 두 사람이 같은 증강을 들면 **양쪽이 동시에 횟수를 버린다.** 드래프트에서 같은
  증강이 두 좌석에 가는 것은 흔하다(중복 방지는 한 사람 안에서만 작동한다).
- 제안 수정: `brief_fog.ts:198` 의 `rctx.playerId === holder` 를 hidden_river 와 같은
  «지금 안개를 선언한 뷰어» 판정으로 바꾼다(한 줄).

---

## 확정 4. 🟠 `disarm` × 선언 상태 증강 — 효과는 꺼지는데 **«효과 진행 중» 배너가 그대로 남는다**

- 위치
  - 잠금: [`GameEngine.ts:91`](../../packages/core/src/engine/GameEngine.ts#L91) `isSourceDisarmed`
    — Modifier·Interceptor·Reaction·액티브 버튼을 건너뛴다. **augmentData 에 이미 실린 값은 못 건드린다.**
  - 스스로 배너를 내리는 증강은 **셋뿐**이다: `blind_ron.ts:145` · `time_pressure.ts:88` · (`true_dragon`·`picky_eater` 는 물리 되감기).
  - 배너를 안 내리는 것들: `invincible.ts:70` · `call_seal.ts:76` · `hidden_river.ts:118` ·
    `brief_fog.ts:142` · `push_riichi.ts:125` · `parasite.ts:74` · `scapegoat.ts:60` ·
    `xray_hand.ts:66` · `no_ron_pact.ts:170`.
  - 화면: [`App.tsx:15495 augmentPillStatus`](../../packages/client/src/App.tsx#L15495) —
    이 함수는 **무장해제를 전혀 보지 않는다.** 바로 위에 같은 취지의 선례가 있다
    (`spent:` 분기 — *"끝난 증강에 살아 있는 상태를 붙일 이유가 없다"*).

- 설명이 약속한 것: 무장해제 description — "…이번 국 동안 **완전히 무효화**한다 — 규칙도,
  발동 효과도, 액티브 버튼도 전부 잠긴다." 대상 카드들의 배너는 "지금 이 효과가 살아 있다"를
  **전원에게** 알리려고 만든 채널이다(각 파일 주석: *"발동이 테이블에서 안 보이면 증강이 아니다"*).

- 기대: 잠기는 순간 효과와 배너가 함께 꺼진다(blind_ron·time_pressure 가 이미 그렇게 한다).

- 실제 (p1 이 선언 → p0 이 그 증강을 무장해제 · 제3자 p2 의 뷰):

  | 증강 | 효과(선언만) | 효과(무장해제 뒤) | 제3자에게 보이는 배너 |
  |---|---|---|---|
  | `invincible` | `ronImmune=true` | **false** | `"이번 국 론 불가"` **그대로** |
  | `no_ron_pact` | `ronImmune=true` | **false** | `active:true` + `"조약 유효 — 6순까지 론 불가"` **그대로** |
  | `call_seal` | `call.blocked=true` | **false** | `{turnCount:0, until:6}` **그대로** |
  | `hidden_river` | `peek6` | **public** | `"안개"` **그대로** |
  | `brief_fog` | `count_only` | **public** | `"안개 (6순 남음)"` + 마지막 버림 공개 **그대로** |
  | `xray_hand` | `visibility.hand=public` | **owner** | `true` **그대로** |
  | `push_riichi` | (강제 리치 인터셉터 꺼짐) | — | 낙인 관계선 `p1→p2` **그대로** |
  | `parasite` / `scapegoat` | (정산 인터셉터 꺼짐) | — | 기생·지목 관계선 **그대로** |
  | `blind_ron` · `time_pressure` | — | — | **정리됨** (대조군 ✅) |

- 재현: `tsx qa-lab/synergy3/disrupt/repro_disarm_banner.ts`
  (조약 배너가 «그 뒤에도 계속 유효로 갱신된다»는 별도 확인: `tsx qa-lab/synergy3/disrupt/repro_battery2.ts` §12)

- 영향: **거짓 정보가 정확히 반대 방향으로 작동한다.**
  - `invincible` · `no_ron_pact`: 화면이 "이 사람에게는 론이 안 된다"(🛡/🤝 guard 톤 뱃지)라고
    말하는데 실제로는 론이 열려 있다 → 진짜 화료 기회를 **안 잡는다.**
  - `call_seal`: "6순 동안 못 운다"가 떠 있는데 실제로는 울 수 있다 → 후로를 포기한다.
  - `xray_hand` · 안개: 이미 죽은 효과를 피해 계속 수비한다.
  - 화면에는 pill 에 **쇠사슬(잠김)과 guard 배너가 동시에** 뜬다 — 어느 쪽이 참인지 알 수 없다.
  - 봇은 영향을 받지 않는다 — 서버 봇은 `effectiveAugmentsOf`
    ([`packages/server/src/bot/collect.ts:150`](../../packages/server/src/bot/collect.ts#L150))
    로 무장해제된 증강을 먼저 걸러낸다. **사람만 속는다.**

- 제안 수정 (두 갈래 중 하나)
  - (A) 화면 한 곳: `augmentPillStatus` 가 `disarmedAugmentsOf(view, playerId)` 를 먼저 보고
    잠긴 증강이면 `null`(또는 "잠김") 을 돌려준다. 서버 쪽 파일을 하나도 안 건드린다.
  - (B) 증강별: `blind_ron`·`time_pressure` 처럼 각 파일에 `AUGMENT_DISARMED` 리액션을 단다
    (9개 파일 × 5줄). 규약이 이미 서 있어 안전하지만 손이 많이 간다.

---

## 확정 5. 🟠 `siege_riichi` × `always_tenpai` — 공성계가 명시한 **유일한 대가**가 사라진다

- 위치: [`siege_riichi.ts:33`](../../packages/content/src/augments/siege_riichi.ts#L33)
  (`riichi.requiresTenpai=false`) × [`always_tenpai.ts:52`](../../packages/content/src/augments/always_tenpai.ts#L52)
  (`draw.treatAsTenpai=true` + `DrawPatch` 인터셉터). `conflicts`·`antiIds` **둘 다 없다.**

- 설명이 약속한 것 (정면 충돌하는데 어느 쪽이 이기는지 카드에 한 글자도 없다)
  - 공성계 detail: "손이 잠기고 쯔모기리가 강제되는 것은 진짜 리치와 같다.
    리치봉 1,000점과 **유국 시 노텐 벌부도 그대로 걸린다.**"
  - 승승장구: "황패유국 시 손패가 어떻든 항상 텐파이로 취급된다 — **노텐 벌점을 내지 않고**,
    노텐인 상대 한 명당 2,000점을 추가로 받는다."

- 기대(미리 적었다): 승승장구가 이긴다 → 공성계의 대가가 리치봉 1,000점 하나로 줄고,
  노텐 리치가 **순이익**이 된다.

- 실제 (넷 다 노텐인 황패유국, p0 이 노텐 리치를 걸었다):

  | 조합 | 텐파이 집계 | p0 | p1 | p2 | p3 | p0 최종점(시작 25,000) |
  |---|---|---|---|---|---|---|
  | 리치 없음·증강 없음 | p1,p2 | −1500 | +1500 | +1500 | −1500 | 23,500 |
  | **공성계만 + 노텐 리치** | p1,p2 | −1500 | +1500 | +1500 | −1500 | **22,500** (벌부+리치봉) |
  | 승승장구만 (리치 불가) | p0,p1,p2 | +3000 | +1000 | +1000 | −5000 | 28,000 |
  | **공성계 + 승승장구 + 노텐 리치** | **p0**,p1,p2 | **+3000** | +1000 | +1000 | −5000 | **27,000** |

- 재현: `tsx qa-lab/synergy3/disrupt/repro_siege_alwaystenpai.ts`

- 영향: 공성계의 **모든** 페널티 서술이 거짓이 된다. 노텐 리치는
  ① 리치봉 1,000 만 내고 ② 노텐 벌부를 안 내고 ③ 노텐 상대에게서 2,000씩 더 걷어
  **기대값 +1,500(대조군 대비 +4,500)** 이 되며, 그 위에 "셋이 전부 접는" 심리 효과가 공짜로 얹힌다.
  「자해가 억제 장치」인 설계가 통째로 무력화된다.

- 제안 수정 (설계 판단이 필요하다 — 둘 중 하나)
  - (A) 규칙: `always_tenpai` 의 `draw.treatAsTenpai` 를 **실제 노텐 리치에는 걸지 않는다**
    (= 텐파이가 아닌 리치 선언자는 면제 대상에서 뺀다).
  - (B) 문구: 공성계 detail 의 "노텐 벌부도 그대로 걸린다"에 예외를 명시하고,
    두 증강을 `antiIds`(또는 conflicts)로 묶는다.

---

## 의심 1. 🟡 `push_riichi` × `last_stand` — 밀어 넣은 리치를 **무료로** 그 자리에서 물린다

- 위치: [`push_riichi.ts:170-195`](../../packages/content/src/augments/push_riichi.ts#L170) 인터셉터 ·
  [`last_stand.ts:60-95`](../../packages/content/src/augments/last_stand.ts#L60) 취소 액션.
- 설명이 약속한 것: 등 떠밀기 detail — "**다마텐으로 숨을 수 없다.**
  … 낙인은 강제든 스스로 건 것이든 리치가 성립하거나 국이 끝나면 소멸한다."
- 기대: 낙인 대상은 그 국에 리치를 짊어진다.
- 실제:

  | 조합 | 강제 리치 | 리치봉 공탁 | 승부수 취소 | 취소 후 리치 | p1 점수 | 낙인 재사용 |
  |---|---|---|---|---|---|---|
  | 낙인만 | true | 1,000 | — | true | 24,000 | 불가(소진) |
  | **낙인 + 승부수** | true | **0** | 성공 | **false** | **25,000** | 불가(소진) |

  낙인 대상은 **점수도 그대로**, 리치도 없이 원위치한다. 대가로 잃는 것은 last_stand 의
  "취소한 국에는 리치를 다시 걸 수 없다" 뿐인데, 애초에 걸 생각이 없던 다마텐 플레이어에게는
  **아무 대가가 아니다.** 반대로 등 떠밀기(prism·매 국 1회)는 그 국의 발동을 통째로 잃는다.
- 재현: `tsx qa-lab/synergy3/disrupt/repro_battery2.ts` (§9)
- **의심으로 두는 이유**: 산술은 각 카드가 적은 그대로다(버그가 아니라 상호작용).
  다만 등 떠밀기가 굵게 단언한 "숨을 수 없다"가 매 국 무료로 거짓이 되고, 그 사실이
  **어느 카드에도 없다.** 밸런스 판단이 필요하다 — 문구를 고칠지, `last_stand` 취소를
  «강제 리치에는 안 통한다»로 좁힐지.

---

## 음성 확인 (돌려 봤고 깨끗했다)

| 조합 | 기대 | 실제 | 판정 |
|---|---|---|---|
| `discard_lock`+`rank_gate`+`call_seal`(+`push_riichi`) 를 한 사람에게 | 선택지 0(소프트락) 이 나면 안 된다 | 13→11개, 잠긴 패가 있어도 항상 버릴 패가 남는다 (`lockedDiscardIds` 의 «전부 잠기면 전부 허용» 예외) | ✅ |
| `disarm` × `disarm` (서로 잠금) | 영구 무장해제·자기 잠금 사고가 없어야 | `engine:disarmed#round` 가 국 스코프라 국 경계에서 엔진이 지운다. p0 버튼 0개, uses 소모 없음 | ✅ |
| `disarm` — 선언 **전에** 잠긴 증강의 잔량 | 소모되면 안 된다 | invincible/xray/hidden_river/call_seal/brief_fog/pseudo_dealer 6종 전부 카운터 미설정, 버튼 0개 | ✅ |
| `disarm` — 선언 **뒤에** 잠긴 증강의 잔량·pill | 잔량은 소모된 채, **표시가 실제와 일치** | 6종 전부 카운터·pill 이 대조군과 동일(`left:1/total:2`) | ✅ |
| `disarm` × `yakuman_shield` | 방어가 실제로 꺼져야 | 96,000 역만이 그대로 관통, 방어 카운터도 안 오른다 | ✅ |
| `parasite` × `parasite` (p0↔p1 상호 기생) | 무한 이전·총합 깨짐 없어야 | 한쪽만 발동(상대 delta 음수), 총합 0, 순환 없음 | ✅ |
| `spy` × `parasite` (다른 좌석) | 총합 보존 | 7,700 이 스파이에게 통째로, 총합 0. 순서 의존은 `settleStages` 가 이미 문서화한 기지 사항 | ✅ |
| `scapegoat` × `parasite` | "나머지 둘은 한 푼도 내지 않는다"가 `Transfer` 뒤에도 유지 | p2 는 −4,000 → 0 → (기생으로) **+6,000**. 무는 쪽으로는 안 돌아간다 | ✅ |
| `always_tenpai` × `always_tenpai` (두 좌석) | 노텐 상대가 두 번 뜯기면 안 됨 | 넷 다 텐파이 취급 → 전원 0, 총합 0 | ✅ |
| `danger_sense` × `invincible` (같은 좌석) | 위험패가 0이어야 | `kinds: []` (대조군은 7종) | ✅ |
| `danger_sense` × `no_ron_pact` (같은 좌석) | 위험패가 0이어야 | `kinds: []` | ✅ |
| `danger_sense` × `rank_gate`(상대에게 걸린 격) | 격에 막힌 싼 손은 위험이 아니어야 | `belowMinHan` 을 그대로 복제해 계산한다 (코드 확인) | ✅ |
| `tenpai_scan` × `siege_riichi` | 노텐 리치는 텐파이로 안 잡혀야 · 결과는 나만 봐야 | 결과 `["p2","p3"]` (노텐 리치 p1 제외), 채널이 p0 뷰에만 실린다 | ✅ |
| `dora_conceal` × `xray_hand` | 투시로 남의 손은 보되 도라는 여전히 가려져야 | p0: 손패 13장 보임 · 도라 표시패 0개 | ✅ |
| `frame_up` × `invincible` (같은 좌석) | 심은 패도 «내 버림»이라 면역이 서야 | `lastDiscard.player=p0`, `ronImmune(p0)=true` | ✅ |
| `frame_up` × `no_ron_pact` (피해자) | 심은 패의 «쏜 사람»은 심은 쪽이어야 | 책임은 p0 고정, 피해자 후리텐 이력에만 종류가 새겨진다 | ✅ |
| `frame_up` × `discard_lock` | "봉인된 패는 심을 수 없다" | 봉인 2장이 누명 후보에서 정확히 빠진다 (13종→11종) | ✅ |
| `void_kan` × `invincible` / `no_ron_pact` | 창깡은 깡 선언자를 대상으로 판정되어야 | `KAN_DECLARED` 리듀서가 `lastDiscard:null` + `chankan:{player}` 로 갈아 끼운다 — 엉뚱한 사람의 면역이 끼어들 여지 없음 | ✅ |
| `yakuman_shield` × `yakuman_shield` (두 좌석) | 이중 환급·총합 깨짐 없어야 | 맞은 쪽만 0, 총합 0 | ✅ |
| `seat_swap` × `invincible`(선언 상태) | 면역이 **사람**을 따라야 | 자리를 바꿔도 `ronImmune(p0)=true`, 배너도 p0 에 붙어 있다 | ✅ |
| `seat_swap` × `rank_gate` | 격이 **사람**을 따라야 | 자리를 바꿔도 minHan=5 는 p1 그대로 | ✅ |
| `seat_swap` × `pseudo_dealer` | 오야가 **자리**를 따라간다 | 찬탈자 p3 와 자리를 바꾸면 오야가 p1 에게 넘어간다. `seat_swap` description 이 "오야까지 넘어온다"고 명시하므로 **문구대로**다(단 찬탈자는 2국 쿨다운만 버린다 — 밸런스 메모) | ✅(문구 일치) |
| `time_stop`(오야) × `call_seal` 6순 창 | 창이 짧아질 수 있다 | 같은 6 turnCount 를 27수(대조군 29수)에 소진 — `turnCount`가 오야 쯔모에만 오르는 기지 설계의 귀결(`qa-lab/findings/text.md` §216 soul_strike 와 같은 부류)이라 **재보고하지 않는다** | ➖ 기지 |
| `blind_ron` — 크래프트 상태에서의 재배선 | — | `armOnNextRound` 라 `ROUND_STARTED` 없이는 무장되지 않는다. 유닛 크래프트로는 재배선 경로를 못 태웠다 — 역만 방어술의 론 경로 검증은 방어막 단독 대조군으로 대체했다 | ⚠ 미검증 |

## 재현 스크립트

| 파일 | 다루는 것 |
|---|---|
| `qa-lab/synergy3/disrupt/lib.ts` | 공용 도구 (`setup`/`submit`/`turnOptions`/`view`/`startFlow2`/`lastSettled`) |
| `repro_shield_scapegoat.ts` | 확정 1 (+ 론 경로 대조군) |
| `repro_fog_cross.ts` | 확정 2 · 3 |
| `repro_disarm_banner.ts` | 확정 4 (11종 배너 표) |
| `repro_disarm_uses.ts` | 확정 4 보강 (잔량·쿨다운·상호 무장해제 — 전부 음성) |
| `repro_siege_alwaystenpai.ts` | 확정 5 |
| `repro_battery.ts` | 소프트락 · 좌석 이동 · 기생 순환 · 승승장구 중복 · 지뢰 탐지 · 천리안 · 도라 은닉 |
| `repro_battery2.ts` | 의심 1 · 누명 × 면역 · 스파이 × 기생 · 무장해제 × 조약 배너 |
| `repro_battery3.ts` | 창깡 면역 · 6순 창 · 무장해제 × 방어막 · 자리 바꿈 × 천하무적 |
| `repro_battery4.ts` | 덤터기 × 기생충 · 봉인 × 누명 · 방어막 중복 |
| `probe_conflicts.ts` | 담당 27종의 conflicts / antiIds 관계표 |
