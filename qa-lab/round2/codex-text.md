# 증강 도감·설명 문구 — codex-text

## 요약

- **대상**: `packages/content/src/augments/*.ts` 113종 + 코어 표준 4종
  (`packages/core/src/augment/standardAugments.ts`) = **117종 전수**. 빠뜨린 종 없음.
  (지시서의 "104종"은 낡은 수치다 — 실측 117종이고 도감 코드 주석도
  `App.tsx:8213` "104종을 한 화면에서"로 낡아 있다.)
  표시층도 함께: `packages/client/src/augmentBrief.ts`(요약 117개) ·
  `glossary.ts`(용어 사전) · `App.tsx`의 도감(`CodexScreen`)·도움말·결과 화면 ·
  `tutorial.ts` · 서버 안내/오류 문구.
- **커버리지**: 117종 각각을 `name`/`description`/`detail` ↔ `install()` 로 한 줄씩
  대조했고(58종 + 59종을 두 갈래로 나눠 훑은 뒤 합침), 그 위에 문구 전체를 가로지르는
  **전역 스캔 9종**(배타 · 역만 판 보너스 · 횟수 표기 · 인칭 · 용어 · 숫자 표기 ·
  구분자 · 도감 검색 코퍼스 · 용어 사전 오매칭)을 얹었다.
- **1차(`qa-lab/findings/text.md` 확정 35건)와 중복을 피했다.** 1차는 전부
  "설명 ≠ 구현" 한 축이었다. 이번 라운드는 ① 1차가 손대지 않은 축(표기·일관성·표시층·
  도감 UI·용어 사전)을 새로 훑고 ② 설명 ≠ 구현은 **1차 목록에 없는 id만** 담았다.
  1차 항목의 수정 여부는 전부 코드로 재검증했다(§부록 A).

**확정 15건 · 의심 3건.**

| # | 심각도 | 한 줄 | 영향 종수 |
| --- | --- | --- | --- |
| 확정 1 | 🟠 | 배타(`conflicts`)를 문구가 말해 주지 않는다 — 화면에 그 정보가 **어디에도 없다** | 28 |
| 확정 2 | 🟠 | "+N판" 보상이 **역만 화료에는 0원**인데 문구가 그 말을 안 한다 | 12 |
| 확정 3 | 🟠 | `pond_snatch` — 후보를 9장에서 **3장으로 줄여** 적었다(detail과 정면 모순) | 1 |
| 확정 4 | 🟠 | `invincible` — "타가는 론할 수 없다"가 **창깡을 막지 않는다** | 1 |
| 확정 5 | 🟠 | `frame_up` — 문구에 없는 **유국만관 자격 상실** 페널티 | 1 |
| 확정 6 | 🟠 | `bottom_yaku` — "이 두 **역만**으로는"이 용어 사전에서 役滿으로 밑줄+툴팁이 뜬다 | 1 |
| 확정 7 | 🟡 | `stealth_riichi` — "은닉의 **대가**가"가 對面(맞은편 사람)으로 밑줄+툴팁 | 1 |
| 확정 8 | 🟡 | 도감 검색이 **카드에 인쇄된 낱말을 못 찾는다**(요약이 검색 코퍼스에 없다) | 3 확인 |
| 확정 9 | 🟡 | `conjure_draw` — "패산이 아니라 허공에서" 가 사실이 아니다 | 1 |
| 확정 10 | 🟡 | `table_flip` — 이 증강의 **유일한 대가**(손패 전원 공개)가 카드 앞면에 없다 | 1 |
| 확정 11 | 🟡 | `blind_ron` — description ↔ detail 자체 모순(±0점) | 1 |
| 확정 12 | 🟡 | `let_it_ride` — "연속"의 기준이 문구에 없다(남의 쯔모는 안 끊는다) | 1 |
| 확정 13 | 🟡 | 표기 일관성 6종 — 횟수·구분자·숫자·인칭·용어·패 표기가 제각각 | 전역 |
| 확정 14 | 🟡 | 배지 정책이 스스로 정한 규칙("좁은 쪽")을 3종에서 어긴다 | 3 |
| 확정 15 | 🟡 | 계열(태그) 비대칭 — 같은 기계를 쓰는 증강이 다른 계열에 있다 | 4 |
| 의심 1 | 🟠 | `three_dragons_will` — 재료가 도라·적도라를 태운다(1차 14·15의 **세 번째** 사례) | 1 |
| 의심 2 | 🟡 | `ura_peek` — 바꿔치기 대상이 **첫 번째** 뒷도라 표시패뿐 | 1 |
| 의심 3 | 🟡 | `blood_contract` — "치또이 **등**"이 1차 지적 뒤에도 그대로다(재현됨) | 1 |

**길이 문제(지시서 3번)는 없었다** — 실측으로 확인했다. §부록 B 참조.

---

## 재현 스크립트

전부 `~/majak/node_modules/.bin/tsx <경로>` 로 돈다. `packages/` 는 읽기만 했다.

| 스크립트 | 무엇을 보나 |
| --- | --- |
| `qa-lab/round2/text/dump.ts` | 117종 카탈로그 → `catalog.json` (다른 스크립트의 입력) |
| `qa-lab/round2/text/sweep_conflicts.ts` | 양방향 배타 ↔ 문구 언급 대조 (확정 1) |
| `qa-lab/round2/text/sweep_yakuman2.ts` | 판 보너스를 얹는 증강 ↔ "역만 미적용" 문구 대조 (확정 2) |
| `qa-lab/round2/text/B/yakuman_extrahan.ts` | 역만 손에서 추가 판이 실제로 0인지 실측 (확정 2) |
| `qa-lab/round2/text/A/yakuman_han.ts` | 같은 것을 `addWinHanBonus` 경로로 실측 (확정 2) |
| `qa-lab/round2/text/repro_pond_snatch_depth.ts` | 날치기 후보가 실제로 몇 장인가 (확정 3) |
| `qa-lab/round2/text/terms3.ts` | 용어 사전이 엉뚱한 낱말에 밑줄을 긋는가 (확정 6·7) |
| `qa-lab/round2/text/terms4.ts` | 짧은 용어의 오매칭 후보 전수 (확정 6·7) |
| `qa-lab/round2/text/search2.ts` | 카드에 뜨는 낱말로 도감 검색이 되는가 (확정 8) |
| `qa-lab/round2/text/tier.ts` | 카탈로그 ↔ `powerTier.ts` 등재 대조 (§부록 C — 이상 없음) |
| `qa-lab/round2/text/gen_clamp.mjs` → `clamp.html` | 도감 카드에서 요약이 잘리는가 (§부록 B) |

---

# 확정

## 확정 1. 🟠 배타(`conflicts`)를 알려 주는 창구가 화면 어디에도 없다 — 28종이 침묵한다

- 위치: `packages/core/src/augment/Augment.ts:528` — 후보 필터는 배타를 **양방향**으로 본다
  (`d.conflicts.includes(a) || catalog.get(a).conflicts.includes(d.id)`).
  클라이언트에 `conflicts`를 그리는 UI는 없다(`grep -rn "conflicts" packages/client/src/` → 0건).
- 기대: 배타를 아는 유일한 통로는 **문구**다. 저장소에 이미 관례가 있다 —
  `die_hard` "역만 방어술·천하무적·불가침 조약·승승장구와는 함께 가질 수 없다",
  `yakuman_shield` · `open_riichi_reveal` · `true_dragon`(계열로 서술)이 그렇게 적어 두었다.
- 실제: 배타를 가진 **33종 중 29종**이 자기 문구에서 그 사실을 한 글자도 말하지 않는다
  (`true_dragon`은 계열 서술이라 정상 → 실질 **28종**). 최악은 `stealth_riichi`다 —
  **여덟 종**을 후보에서 지우면서 자기 카드에는 배타 문장이 아예 없다.
  비대칭도 눈에 띈다: `open_riichi_reveal`은 "…스텔스 리치와는 함께 가질 수 없다"를
  적어 두었는데 반대편인 `stealth_riichi`·`palm_flip`·`tile_dyeing`·`last_stand`는 침묵한다.
- 재현: `tsx qa-lab/round2/text/sweep_conflicts.ts`
  ```
  stealth_riichi(스텔스 리치) — 문구에 없는 배타: 리치 봉인, 오픈 리치, 모 아니면 도,
                                영혼의 일격, 한 끗 차이, 손바닥 뒤집기, 이중 선언, 정적의 손
  true_dragon(진짜 용)       — (계열로 서술 — 오탐)
  invincible(천하무적)        — 문구에 없는 배타: 불가침 조약, 죽기살기
  …
  배타를 가진 증강 중 문구가 침묵하는 것: 29종 / 다 적어 둔 것: 4종
  ```
  전체 28종: `avenger` `riichi_upgrade` `free_riichi_discard` `last_stand` `hidden_blade`
  `tile_dyeing` `invincible` `open_kokushi` `late_bloomer` `late_bloomer_east`
  `all_or_nothing` `riichi_seal` `mixed_nine_gates` `off_by_one` `stealth_riichi`
  `void_kan` `royal_kokushi` `async_chiitoi` `soul_hunt` `no_ron_pact` `always_tenpai`
  `giant_god` `regret` `honor_return` `frame_up` `palm_flip` `soul_strike` `picky_eater`
- 영향: 리치 빌드를 짠 플레이어가 **그 픽이 후보에 안 뜨는 이유를 알 방법이 없다.**
  1차 확정 19가 `open_riichi_reveal` 한 종에서 잡은 것과 같은 뿌리인데, 전수로 세면 28종이다.
- 제안 수정: 각 `detail` 끝에 `die_hard` 형식으로 한 문장.
  예) 스텔스 리치 — **"리치 봉인·오픈 리치·모 아니면 도·영혼의 일격·한 끗 차이·
  손바닥 뒤집기·이중 선언·정적의 손과는 함께 가질 수 없다 — 전부 '내가 건 리치'의
  모양을 바꾸는 능력이라 은닉과 겹치면 화면 두 곳이 다른 말을 하게 된다."**
  (근본 수정은 드래프트 카드에 배타 배지를 그리는 것이지만, 그건 텍스트 밖의 일이다.)

## 확정 2. 🟠 "+N판" 보상이 역만 화료에서 **한 푼도 안 붙는데** 문구에 그 말이 없다 — 12종

- 위치: 두 경로가 같은 곳에서 잘린다.
  - `score.extraHan` → `packages/core/src/mahjong/flow/standardActions.ts:924-927`
    ```ts
    // 증강이 더하는 추가 판 (score.extraHan) — 역만에는 적용하지 않는다.
    const extraHan = ev.yakumanCount > 0 ? 0 : Math.max(0, extraBreakdown.total);
    ```
  - `addWinHanBonus` → `packages/content/src/util.ts:865-872` → `calculateScore`
    (`packages/core/src/mahjong/scoring/score.ts:48-50`) — `yakumanCount > 0`이면 han을 안 본다.
- 기대: 저장소에 이미 표기 관례가 있다 — `avenger` `haitei_lord` `cliff_bloom`
  `ankan_dora` `no_retreat` `riichi_upgrade` `true_dragon`은 전부 **"(역만에는 미적용)"**
  을 명시한다. 구현은 관례대로 맞고 **문구만 빠졌다.**
- 실제: 판 보너스를 얹는 14종 중 **12종**이 그 예외를 안 적었다.

  | id | 빠진 문장 | 역만과 겹치는 실제 손 |
  | --- | --- | --- |
  | `iron_wall` | "실제로 후리텐인 채 잡아내면 **+3판**" | 후리텐 국사 론 |
  | `open_riichi` | "그 리치를 **2판으로 취급**" | 후로 대삼원 + 개문 리치 |
  | `yakuless_win` | "그 화료를 **2판으로 취급**" | (셈수역만 경로 — 희박) |
  | `late_bloomer` | "만개 후의 화료에는 **+3판**" | 만개 구간 스안커 |
  | `late_bloomer_east` | "**+2판**" | 〃 |
  | `late_double` | "그렇게 취급된 더블리치에는 **+1판**" | 더블리치 + 스안커 |
  | `foresight` | "발동한 국에 화료하면 **+2판**" | 아무 역만 |
  | `future_sight` | "층 하나당 **+1판**" | 〃 |
  | `silent_swap` | "발동한 국에 화료하면 **+2판**" | 〃 |
  | `soul_strike` | "그 리치는 **2판**(더블리치는 3판)" | 폭주 중 스안커·사암각 |
  | `open_riichi_reveal` | "그 외의 화료에서는 그 리치를 **3판으로 취급**" | 오픈 리치 + 역만 쯔모 |
  | `tanyao_break` | "그 탕야오를 **2판으로 취급**" | 탕야오 스안커 |
- 재현: `tsx qa-lab/round2/text/B/yakuman_extrahan.ts` · `tsx qa-lab/round2/text/A/yakuman_han.ts`
  ```
  역만 base= 32000  +2판= 32000  차이= 0   /  비역만 차이= 4000
  역만 그대로: 32000  / +3판 얹었을 때: 32000  → 보너스 0
  오야 역만 +2판 보너스: 0
  ```
  대조 스캔: `tsx qa-lab/round2/text/sweep_yakuman2.ts` → `문구에 '역만 미적용'이 빠진 것: 12종`
- 영향: 설명과 다름(점수). 하필 `soul_strike`(연속 6쯔모)·`late_bloomer`(만개 구간)·
  `cliff_bloom` 계열은 **역만이 뜨기 쉬운 카드**라, 가장 비싼 손에서만 조용히 값이 사라진다.
- 제안 수정: 각 판수 문장 뒤에 **"(역만 손에는 이 추가 판이 붙지 않는다)"**.
  예) 철벽 detail — "…론으로 잡아낸 화료에서는 +3판을 얻는다**(역만에는 미적용)**."

## 확정 3. 🟠 pond_snatch(날치기) — 후보를 **9장에서 3장으로 줄여** 적었다 (detail은 맞고 카드 앞면이 틀렸다)

- 위치: [packages/content/src/augments/pond_snatch.ts:83-96](../../packages/content/src/augments/pond_snatch.ts#L83)
  ```ts
  for (const p of state.players) {          // 상대 세 명 전부
    if (p.id === holder) continue;
    for (const snatchId of ids.slice(-SNATCH_DEPTH)) { … }   // 각자 최근 3장
  }
  ```
- 기대: 같은 카드의 `detail`이 정확히 적어 두었다 —
  **"상대 세 명이 각각 최근에 버린 3장(최대 9장) 중 1장을 골라"**.
- 실제: `description`은 **"상대가 최근에 버린 3장 중 1장"**, 클라이언트 요약
  (`packages/client/src/augmentBrief.ts` `pond_snatch`)도 **"상대가 최근 버린 3장 중 1장"**.
  드래프트 카드와 도감 카드에 뜨는 것은 이 둘뿐이다 — 상세를 펼치기 전까지 이 증강의
  값은 **3분의 1로 보인다.** (같은 계열 `grave_rob`는 "상대**들이** 최근에 버린 10장"이라
  적어 복수 주체를 살렸다 — 표기 기준은 이미 저장소 안에 있다.)
- 재현: `tsx qa-lab/round2/text/repro_pond_snatch_depth.ts`
  ```
  판 수: 4 / 날치기 후보가 뜬 순: 65
  한 순에 뜬 최대 후보 수: 9 · 그 후보가 나온 상대 바닥 수: 3
  후보 목록: p1#85 p1#28 p1#70 p2#119 p2#87 p2#129 p3#135 p3#47 p3#112
  description : "상대가 최근에 버린 3장 중 1장"  → 3장이라 읽힌다
  실측         : 최대 9장 · 3명의 바닥
  ```
- 곁가지(같은 카드): description의 **"후로로 치지 않아 멘젠·리치가 유지되고"** 는
  "리치 중에도 쓸 수 있다"로 읽히는데, `pond_snatch.ts:108` 이 `riichi: cannot snatch`로
  막는다. detail에는 적혀 있다("리치 중이거나 …쓸 수 없다").
- 제안 문구:
  description — **"(게임 내 3회) 자기 순에 쯔모하는 대신 상대 셋이 각각 최근에 버린
  3장(최대 9장) 중 1장을 주워 손에 넣는다. 후로로 치지 않아 멘젠이 유지되지만
  리치 중에는 쓸 수 없다. …"**
  요약(`augmentBrief.ts`) — **"쯔모 대신 상대 셋의 최근 버림패 9장 중 1장을 줍는다."**(28자)

## 확정 4. 🟠 invincible(천하무적) — "타가는 당신을 론할 수 없다"가 **창깡을 막지 않는다**

- 위치: [packages/content/src/augments/invincible.ts:119](../../packages/content/src/augments/invincible.ts#L119)
  ```ts
  if (state.round.chankan?.player === holder) return cur;   // 창깡은 일부러 열어 둔다
  ```
- 기대: description — **"이번 국이 끝날 때까지 타가는 당신을 론할 수 없다. 무엇을
  버려도 방총이 나지 않고"**. 조건 없는 단언이고, detail의 예외 목록도
  "상대의 쯔모 화료나 유국 노텐 벌점" 둘뿐이다.
- 실제: 무적 중에 **가깡을 치면 그 깡패로 창깡당한다.** 창깡은 역만 직전급 실점 경로다.
  "무적이니 가깡해도 안전하다"는 오독이 그대로 방총이 된다.
- 재현: 분기가 명시적이고 주석이 의도까지 적어 두었다(코드 판독 확정). 대국 재현 미실행.
- 제안 문구: description — **"…타가는 내 **버림패**로 론할 수 없다. 무엇을 버려도
  방총이 나지 않지만, **내가 가깡한 패를 창깡당하는 것은 막지 못한다.**"**
  detail 예외 목록에 "내가 가깡한 패를 창깡으로 잡히는 것"을 추가.

## 확정 5. 🟠 frame_up(누명) — 문구에 없는 **유국만관 자격 상실** 페널티

- 위치: [packages/content/src/augments/frame_up.ts:135-137](../../packages/content/src/augments/frame_up.ts#L135)
  (`isTerminalOrHonor`가 아니면 `brokeNagashiKey`를 세운다) +
  `:193-202` (`draw.nagashiMangan` 모디파이어가 보유자에게 false).
- 기대: detail이 세는 대가는 **"그 패로 쏘이면 책임도 내가 진다"** 하나뿐이고,
  제약은 "리치 중이거나 국의 첫 바퀴에는 쓸 수 없다"뿐이다.
- 실제: **중장패(2~8 수패)를 심는 순간 그 국의 유국만관 자격이 사라진다.**
  코드 주석 자체가 "12,000점이 뒤집혔다"고 적을 만큼 큰 값인데 플레이어가 읽는 글에는
  한 글자도 없다. 요구패만 흘려 유국만관을 노리던 사람이 누명 한 번으로 자격을 잃는다.
- 곁가지: 제약이 하나 더 빠졌다 — **봉인술사가 잠근 패는 남의 명의로도 심을 수 없다**
  (`frame_up.ts:127-131`, `"tile is sealed"`). 같은 계열 `bluff_pretense`는 이런 제약을
  detail에 다 적어 두었다("리치 중, 후로가 봉인된 동안(함구령), …").
- 제안 문구: detail 끝에 — **"중장패(2~8 수패)를 남의 바닥에 심으면 그 국의 유국만관
  자격은 잃는다 — 명의만 옮겼을 뿐 실제로 흘린 것은 나이기 때문이다. 요구패를 심는
  것은 자격에 영향이 없다. 봉인술사에게 잠긴 패는 남의 명의로도 심을 수 없다."**

## 확정 6. 🟠 bottom_yaku(바닥의 족보) — "이 두 **역만**으로는"이 화면에서 **役滿**으로 밑줄이 그이고 툴팁이 뜬다

- 위치: description 마지막 문장 —
  **"⚠ 이 두 역만으로는 화료할 수 없다 — 손에 진짜 역이 하나는 있어야 한다."**
  글쓴이의 뜻은 "이 두 **역(役)만**으로는"인데, `packages/client/src/glossary.ts`의
  `yakuman` 항목이 그 자리를 통째로 집어삼킨다.
- 기대: 용어 사전은 초보자를 돕는 장치다. 밑줄이 그인 자리는 그 낱말의 뜻이어야 한다.
- 실제: 화면에는 **"이 두 <u>역만</u>으로는 화료할 수 없다"** 로 뜨고, 올려 두면
  "**역만** — 최고 등급의 손. 32000점(오야는 48000점)으로 한 방에 판이 뒤집힌다."가 뜬다.
  문장이 통째로 다른 뜻이 된다("이 두 역만(yakuman)으로는 화료할 수 없다"?).
- 재현: `tsx qa-lab/round2/text/terms3.ts`
  ```
  "이 두 역만으로는 화료할 수 없다" => 역만→역만, 화료→화료
  ```
- 제안 문구: **"⚠ 이 둘만으로는 화료할 수 없다 — 손에 진짜 역이 하나는 있어야 한다."**
  (또는 "이 두 가지만으로는")

## 확정 7. 🟡 stealth_riichi — "은닉의 **대가**가"가 **對面(맞은편 사람)** 으로 밑줄이 그인다

- 위치: `stealth_riichi.detail` — **"⚠ 은닉의 대가가 하나 있다 — 리치봉을 내지 않으므로
  공탁이 쌓이지 않는다."** 여기 '대가'는 값·비용인데, 사전의 `toimen`(대가 = 내 맞은편 사람)이 걸린다.
- 기대: `client_augment_brief.test.ts`가 이미 이런 오매칭을 막고 있다
  (`pick("그 상대가 버린 패") === []` — '상대가'의 꼬리에 숨은 '대가'를 막는 검사).
  그 방어가 '은닉의 대가가'는 못 잡는다.
- 재현: `tsx qa-lab/round2/text/terms3.ts`
  ```
  "⚠ 은닉의 대가가 하나 있다 …" => 대가→대가, 리치봉→공탁, 공탁→공탁
  ```
- 제안 문구: **"⚠ 은닉에는 값이 하나 있다 — 리치봉을 내지 않으므로 공탁이 쌓이지 않는다."**
  (문구 쪽을 고치는 편이 싸다. 사전 쪽을 고친다면 `toimen`의 `match`를
  `대가(?=[·와과의를은])` 같은 형태로 좁히는 것이지만, '대가의'는 여전히 부딪친다.)
- 곁가지(같은 스캔): `yakuman_shield`의 **"유국역만"** 은 앞 두 글자가 빠지고
  뒤의 "역만"만 밑줄이 그인다 — 유국역만은 이 게임이 만든 말이라 그 자체로 사전에 있어야 한다.

## 확정 8. 🟡 도감 검색이 **카드에 인쇄된 낱말을 못 찾는다** — 검색 코퍼스에 요약이 빠졌다

- 위치: [packages/client/src/App.tsx](../../packages/client/src/App.tsx) `CodexScreen`의 필터
  ```ts
  if (q !== "" && !m.cat.name.toLowerCase().includes(q) && !m.cat.id.includes(q)
    && !(m.cat.detail ?? "").toLowerCase().includes(q)
    && !m.cat.description.toLowerCase().includes(q)) return false;
  ```
  이름 · id · 설명 · 상세 넷을 보는데, **정작 카드에 그려지는 글(요약,
  `AUGMENT_BRIEF[id].text`)이 빠져 있다.** 도감 카드 본문은
  `<AugDesc … variant="codex" expanded={false} />` = 요약 한 줄이다.
- 기대: 검색창 안내가 **"증강 이름·설명 검색"** 이다. 사람은 눈앞에 보이는 낱말을 친다.
- 실제: 카드에 그 낱말이 **인쇄돼 있는데** 검색이 그 증강을 빼놓는다.
- 재현: `tsx qa-lab/round2/text/search2.ts`
  ```
  true_dragon(진짜 용): 카드에 뜨는 용어 [몸통] 로는 검색되지 않는다
  giant_god(마작의 거신병): 카드에 뜨는 용어 [텐파이] 로는 검색되지 않는다
  danger_sense(지뢰 탐지): 카드에 뜨는 용어 [방총] 로는 검색되지 않는다
  ```
  ("텐파이"로 검색하면 텐파이가 걸린 십수 종이 나오는데, 카드에 "13면 **텐파이**"라고
  대놓고 적힌 마작의 거신병만 빠진다. `qa-lab/round2/text/search.ts`로 넓게 세면
  101/117종에서 조사·활용형 차이로 같은 일이 난다.)
- 제안 수정: 필터 술어에 요약을 한 줄 더한다 —
  `&& !briefOf(m.cat.id, m.cat.description).text.toLowerCase().includes(q)`
  (`catCounts` 쪽 술어도 같은 식이라 함께 고쳐야 한다.)

## 확정 9. 🟡 conjure_draw(소환) — "패산이 아니라 **허공에서** 생성되어"가 사실이 아니다

- 위치: [packages/content/src/augments/conjure_draw.ts:143-153](../../packages/content/src/augments/conjure_draw.ts#L143)
  — `TILE_DRAWN` **리액션**이라 쯔모가 이미 끝난 뒤 `tileKindChanged`만 낸다.
  파일 머리 주석(18~20행)도 같은 말을 한다.
- 기대: detail — **"다음 내 쯔모는 패산이 아니라 허공에서 생성되어 그 패의
  복제(생성패)로 손에 들어오며, 손패 장수는 정상 그대로다."**
- 실제: 패산에서 정상적으로 뽑은 실물 한 장의 **종류만 덮어쓴다.** 패산은 평소대로
  한 장 줄고 유국 시점도 그대로다. "패산이 아니라"는 문장은
  **"패산을 소모하지 않는다 = 한 순을 공짜로 번다"** 로 읽히는데 사실이 아니다.
  같은 계열 `bottom_deal`·`silent_swap`은 detail에서 장수 수지를 정확히 적어 두었다
  (`silent_swap`: "쯔모 없이 한 장을 더 얻는 셈이라 그 국은 모두에게 1쯔모만큼 길어진다").
- 제안 문구: **"다음 내 쯔모는 패산에서 뽑히지만 그 자리에서 부른 패로 바뀌어(생성패)
  손에 들어온다 — 패산은 평소대로 한 장 줄고 손패 장수도 그대로다."**

## 확정 10. 🟡 table_flip(밥상 뒤엎기) — 이 증강의 **유일한 대가**가 카드 앞면에 없다

- 위치: [packages/content/src/augments/table_flip.ts:157-158](../../packages/content/src/augments/table_flip.ts#L157)
  — 반납한 13~14장을 `roundViewKey("*", …)` 로 **전원 공개**한다.
- 기대: 파일 머리 주석이 "공개 비용 탓에 남발이 곧 자해다"라고 설계를 못 박았다.
- 실제: description은 **"(매 국 1회) 첫 순에 손패를 전부 반납하고 패산에서 새 손패를
  받는다."** — 이득만 적혀 있고, 요약(`augmentBrief.ts`)도 같은 문장 그대로다.
  드래프트 화면에서는 **무비용 증강**으로 보인다. (detail에만 있다.)
- 제안 문구: description — **"(매 국 1회) 첫 순에 손패를 전부 반납하고 패산에서
  새 손패를 받는다 — 반납한 손패는 전원에게 공개된다."**
  요약 — **"첫 순에 손패를 통째로 갈아 낀다. 버린 손패는 전원에게 공개된다."**(32자)

## 확정 11. 🟡 blind_ron(눈먼 총알) — description ↔ detail 자체 모순

- 위치: [packages/content/src/augments/blind_ron.ts:133-135](../../packages/content/src/augments/blind_ron.ts#L133)
  — 옮기는 것은 `w.points - pao`(손의 지불분)뿐이다.
- 기대: description — **"화료자도 포함될 수 있으며 이 경우 그 화료는 ±0점이 된다."**
- 실제: 같은 카드의 detail이 **"공탁·본장은 원래대로 정산된다"** 라고 적는다. 본장이
  쌓였거나 리치봉을 회수하는 국이면 화료자가 자기 몫을 물어도 델타는
  `본장 + 공탁`만큼 **양수**로 남는다(3본장·공탁 2000이면 +2,900). 두 문장이 서로를 부정한다.
- 제안 문구: **"화료자도 포함될 수 있으며, 그러면 손의 화료점을 자기가 물어 그만큼은
  상쇄된다(본장·공탁 회수분은 그대로 받는다)."**

## 확정 12. 🟡 let_it_ride(판돈 굴리기) — "연속"의 기준이 문구에 없다

- 위치: [packages/content/src/augments/let_it_ride.ts:117-120](../../packages/content/src/augments/let_it_ride.ts#L117)
  — 초기화 조건은 `p.outcome !== "win" || dealtIn` 하나뿐이다.
- 기대: description — **"연속으로 화료할수록 손의 점수에 붙는 배수가 오른다 …
  방총하거나 유국이면 다시 1배부터 시작한다."**
- 실제: 끊기는 것은 **내가 방총했을 때**와 **화료 없이 끝난 국**뿐이다 —
  **상대가 쯔모로 화료해도 내 연승은 그대로 유지된다.** 그런데 "연속으로 화료"라는
  말은 "사이에 남이 한 번 올라가면 끊긴다"로 읽는 것이 자연스럽다. 3연승 상태에서
  남의 쯔모를 맞고 다음 화료가 4배인지 1배인지가 이 카드의 값 전부인데,
  문구만으로는 알 수 없다.
- 제안 문구: detail에 한 문장 — **"내가 방총하거나 화료 없이 국이 끝나면 연승이
  초기화된다. **상대가 쯔모로 화료한 국은 내가 쏜 것이 아니므로 연승이 그대로 이어진다.**"**

## 확정 13. 🟡 표기 일관성 — 같은 개념을 여섯 축에서 제각각 부른다

전부 `tsx qa-lab/round2/text/dump.ts` 로 뽑은 117종 전수 스캔이다.

### ① 횟수 표기가 세 가지 (같은 뜻)

| 표기 | 종수 | 어디에 |
| --- | --- | --- |
| `매 국 1회` | 18(머리말) · 26(배지) | 표준 |
| `국당 1회` | 1(`giant_god`) · 2(배지: `giant_god` `seat_swap`) | |
| `국마다 1회` | 1(`parasite`) | |
| `한 국에 1회` | 3(`suit_unify` `genesis` `hand_swap3` 머리말 안) | |

같은 화면(도감 그리드)에 넷이 나란히 선다. **제안: 전부 `매 국 1회`로 통일**하고,
복합 머리말 안에서는 `· 국당 1회` 대신 `· 매 국 1회`.

### ② 머리말 구분자가 `·` / `,` / `—` 세 가지

```
jackpot            (매 국 1회 · 국의 첫 순)
open_riichi_reveal (매 국 1회 · 리치는 국당 한 번)
stealth_riichi     (매 국 1회 — 리치는 국당 한 번)   ← 똑같은 절인데 부호가 다르다
riichi_seal        (매 국 1회 — 그 국의 첫 리치를 내가 선언할 때)
silent_swap        (매 국 1회 — 그 국에 아무도 리치를 걸지 않았을 때)
seat_swap          (동풍전 2회 · 반장전 3회, 국당 1회)   ← 쉼표는 여기 하나뿐
```
**제안: 전부 `·`.** (`seat_swap` → `(동풍전 2회 · 반장전 3회 · 매 국 1회)`)

### ③ 머리말이 아예 없는 4종

`cornucopia` `time_pressure` `blind_ron` `sign_flip` — 나머지 113종은 전부 `(…)` 머리말로 시작한다.
게다가 같은 "즉발·이번 국만" 개념을 세 문장으로 말한다:
`time_pressure`/`sign_flip` "뽑는 순간 자동 발동." · `blind_ron` "증강을 뽑은 국에만
적용되며," · `cornucopia`(문장 없음). 배지는 앞 셋이 `이번 국만`, `cornucopia`만 `획득 즉시`.
**제안: `(획득 즉시 · 이번 국만)` / `(획득 즉시)` 머리말을 넣고 본문의 중복 문장을 뺀다.**

### ④ 천 단위 콤마가 한 종에만 있다

콤마 있음: `devils_advance`(10,000점 · 3,000점 · 9,000점) · `karma` 머리말(8,000) ·
요약의 `karma`(8,000).
콤마 없음: **20종** — `counter`(1000점) `die_hard`(8000점) `scapegoat`(8000점)
`nagashi_yakuman`(16000점) `unification`(45000점) `honba_hunter`(1500·7500점)
`always_tenpai`(2000점) `sign_flip`(8000·1000점) `big_hand`(12000·8000) …
요약(드래프트 카드)에서도 `devils_advance` "10,000점 … 3,000점"과
`unification` "45000점" · `always_tenpai` "2000점"이 나란히 선다.
**제안: 4자리 이상은 전부 콤마**(`1,000점` `45,000점`) — 또는 전부 뺀다. 하나로.

### ⑤ 인칭이 1인칭·2인칭·3인칭 섞임

- `당신` 6종: `invincible` `no_ron_pact` `dora_conceal` `brief_fog` `tenpai_scan` `regret`
- `본인` 1종: `ura_peek`("뒷도라 표시패를 **본인만** 확인한다")
- `보유자` 7종: `hidden_river` 등
- 나머지 101종은 `나 / 내 / 나에게만`

**같은 카드 안에서도 갈린다** —
`dora_conceal` description "도라는 **나만** 알 수 있다" ↔ detail "**당신에게만** 보이고";
`invincible` 요약 "아무도 **나를** 론할 수 없다" ↔ description "타가는 **당신을** 론할 수 없다".
**제안: 전부 1인칭(`나·내`)으로.** 위 8종의 해당 문장만 고치면 닫힌다.

### ⑥ 마작 용어 표기 혼용

| 개념 | 표기 A | 표기 B | 같은 카드 안에서 섞인 것 |
| --- | --- | --- | --- |
| 남의 패를 가져오기 | `후로`(23종) | `울다/울음`(13종) | `red_five_touch` `seat_swap` `bluff_pretense` `bottom_yaku` |
| 3장 덩어리 | `멘쯔`(8종) | `몸통`(9종) | `yakuless_win` `late_bloomer`(2종) `polar_ends` |
| 상대 | `상대`(45종) | `타가`(6종) | `invincible` `no_ron_pact` |
| 방총 | `방총`(11종) | `쏘이다`(3종) | `sign_flip` |
| 패 표기 | `1만·9통`(전 종) | `1m9m·1p9p·1s9s` | **`giant_god` 하나뿐** |

`giant_god`의 로마자 패 표기는 117종 중 **유일**하다
(`tsx -e` 스캔: `\d[mps]` 매치가 giant_god 한 종). 같은 13종을 세는 `open_kokushi`는
`1만1통1삭 · 9만9통9삭 · 백발중 · 동남서북`이라 적었고, 게임 화면에도 `1m`은 어디에도 없다.
**제안**: `giant_god` — **"국사무쌍 13종(1만9만·1통9통·1삭9삭·동남서북·백발중)"**.

곁가지: 용어 사전(`glossary.ts` `furo`)은 `match: ["후로", "울음"]` 이라 **동사형을 안 잡는다.**
`call_seal` description "상대 셋의 <u>후로</u>(치·퐁·대명깡)가 전부 봉인되어 아무도 울지
못한다"에서 앞은 밑줄이 그이고 뒤는 안 그인다. `match`에 `울[지어린려]|운다`를 더하거나,
문구를 `후로`로 통일한다.

곁가지 2: `yakuless_win` description의 **"역이 없이"** 는 비문이다(2회) — `역 없이`.
같은 카드의 `화료가 가능하다`도 117종 중 유일한 형태다(나머지 24종은 `화료할 수 있다`).

## 확정 14. 🟡 요약 배지가 스스로 정한 규칙("좁은 쪽")을 3종에서 어긴다

- 위치: `packages/content/test/client_augment_brief.test.ts` — 검사 주석이 규칙을 못 박는다.
  > 반대 방향(원문은 매치 단위인데 배지가 국 단위)은 막지 않는다 —
  > **자리 바꿈처럼 두 제약을 함께 지는 증강은 좁은 쪽을 배지로 쓰는 것이 맞다.**
- 실제: 두 제약을 함께 지는 증강 넷 중 `seat_swap`만 그 규칙을 지킨다.

  | id | 머리말(두 제약) | 배지 | 규칙대로인가 |
  | --- | --- | --- | --- |
  | `seat_swap` | 동풍전 2회 · 반장전 3회, **국당 1회** | `국당 1회` | ✔ |
  | `hand_swap3` | 게임 내 2회 · **한 국에 1회** | `게임 2회` | ✘ 넓은 쪽 |
  | `suit_unify` | 동풍전 1회 · 반장전 2회 · **한 국에 1회** | `동풍전1·반장전2` | ✘ |
  | `genesis` | 동풍전 1회 · 반장전 2회 · **한 국에 1회** | `동풍전1·반장전2` | ✘ |
- 영향: 판 중에는 `forMode`가 배지를 "게임 2회"로 줄인다. 등가교환을 든 사람은
  배지만 보고 **한 국에 두 번 쓸 수 있다**고 읽는다. 2026-08-17에 `push_riichi`에서
  고친 것과 정확히 같은 모양의 어긋남인데, 그때 세지 않은 세 종이 남았다.
- 제안 수정: `hand_swap3` 배지 `매 국 1회`, `suit_unify`·`genesis` 배지 `매 국 1회`.
  (검사도 "두 제약을 지는 증강은 좁은 쪽" 방향으로 못을 박을 수 있다.)
- 곁가지: 머리말은 `게임 내 N회`인데 배지는 `게임 N회`다(8종). 드래프트 카드에서
  접으면 "게임 5회", 펼치면 "게임 내 5회"가 같은 자리에 뜬다.

## 확정 15. 🟡 계열(태그) 비대칭 — 같은 기계를 쓰는 증강이 다른 계열에 있다

- 위치: `AugmentDef.category`. 도감의 계열 칩 필터가 이 값 하나로 돈다.
- 실제: **정산 델타를 다시 쓰는(ROUND_SETTLED 인터셉터) 네 종이 둘로 갈려 있다.**

  | id | 하는 일 | 계열 |
  | --- | --- | --- |
  | `blame_shift` 책임전가 | 론 지불을 셋에게 흩는다 | `scoring` |
  | `scapegoat` 덤터기 | 쯔모 지불을 한 명에게 몬다 | **`disrupt`** |
  | `spy` 스파이 | 남의 화료 점수를 통째로 가져온다 | `scoring` |
  | `parasite` 기생충 | 남의 획득 절반을 가져온다 | **`disrupt`** |

  덤터기는 책임전가의 거울상이고, 기생충은 스파이의 절반짜리다. 계열 칩으로
  "점수"를 누른 플레이어는 책임전가·스파이는 찾고 덤터기·기생충은 못 찾는다.
- 영향: 도감 필터의 정확도. 규칙이 틀리지는 않는다.
- 제안 수정: 넷 다 `scoring`으로 모으거나, "남의 지갑에 손대는가"를 기준으로 넷 다
  `disrupt`로. 지금처럼 둘로 갈리는 기준은 코드 어디에도 적혀 있지 않다.

---

# 의심

## 의심 1. 🟠 three_dragons_will(삼원의 의지) — 재료가 도라·적도라를 태운다 (1차 확정 14·15의 **세 번째** 사례)

- 위치: [packages/content/src/augments/three_dragons_will.ts:101-125](../../packages/content/src/augments/three_dragons_will.ts#L101)
  `pickMaterials`가 `!isDragon` 하나만 걸러 내고 유용도(같은 무늬 이웃 수)만 본다.
- 기대: detail — **"부족한 두 장이 손패의 가장 쓸모없는 잡패에서 물질화해 커쯔를 채운다."**
  형제 증강 `tile_split`(`:79-82`)·`bluff_pretense`(`:63`)는 1차 지적을 받고
  공용 가드 `isPreciousMaterial`(도라·적도라 제외)을 끼웠고 detail에도
  "재료는 도라·적도라가 아닌 패 중에서 고른다"를 명시했다. **이 파일만 그 함수를
  import조차 하지 않는다** (`grep -n "isPrecious" …three_dragons_will.ts` → 0건).
- 실제(추정): 그 국의 도라이면서 외톨이인 패, 고립된 적5가 유용도 0으로 1순위 재료가
  되어 삼원패로 덮어써진다 — 도라 1판 + 적도라 1판이 조용히 증발한다.
- 왜 의심인가: `pickMaterials`가 비공개라 대국 재현을 못 돌렸다. 코드 경로는 명확하다.
- 제안 수정: 구현을 `tile_split`과 맞추고(그쪽이 이미 정답이다) detail에도 같은 문장을 넣는다.
- 곁가지(🟡): detail 첫 문장이 "부족한 **두 장**이"라 단정하는데, 세 번째 삼원패를
  2장 쥐면 재료는 1장이다. → **"부족한 만큼(한두 장)이"**.

## 의심 2. 🟡 ura_peek(이면투시) — 바꿔치기 대상이 **첫 번째** 뒷도라 표시패뿐

- 위치: [packages/content/src/augments/ura_peek.ts:136](../../packages/content/src/augments/ura_peek.ts#L136)
  — `uraIndicatorIds(state)[0]` 하나만 바꾼다(파일 머리말도 "(첫 번째 것)"이라 적어 두었다).
- 기대: detail — "깡으로 뒷도라가 늘어나면 새 표시패도 자동으로 보인다" 바로 다음에
  **"뒷도라 표시패를 왕패의 다른 패와 통째로 맞바꿔"** 가 온다. 앞 문장이 표시패가
  여럿인 상황을 세워 놓고, 뒤 문장은 그중 무엇이 바뀌는지 특정하지 않는다.
- 실제(추정): 깡이 난 국에 두 번째·세 번째 뒷도라를 노리고 발동하면 헛다리다.
- 왜 의심인가: 코드 한 줄이 명확하나 깡 2회 국을 실제로 돌리지 않았다.
- 제안 문구: **"…추가로 1회, **첫 번째 뒷도라 표시패**를 왕패의 다른 패와 통째로
  맞바꿔 …(깡으로 늘어난 두 번째 이후의 표시패는 바꿀 수 없다)"**

## 의심 3. 🟡 blood_contract — "치또이 **등**"이 1차 지적 뒤에도 그대로다 (재현됨 · 1차 확정 23)

- 위치: [packages/content/src/augments/blood_contract.ts:42-51](../../packages/content/src/augments/blood_contract.ts#L42)
  — `CONTRACT_YAKU`는 여전히 정확히 8종이고 `:75-77`이 목록 밖을 거부한다.
- 실제: detail이 여전히 **"지정 역 목록(탕야오·핑후·또이또이·혼일색·청일색·삼색·
  일기통관·치또이 **등**)"**. '등'은 더 있다는 뜻인데 그 여덟이 전부다.
- 왜 의심인가: 1차 확정 23과 같은 항목이다(코드·문구 모두 그대로임을 재확인).
- 제안 문구: **'등' 한 글자를 뺀다** — "지정 역 목록(탕야오·핑후·또이또이·혼일색·
  청일색·삼색·일기통관·치또이) 중 하나를".

---

# 전 증강 표

문제가 있는 것만 싣는다. `유형` 약어 — **불일치**(설명≠구현) · **누락**(문구에 없는
제약·대가) · **모호** · **표기**(일관성) · **UI**.

| id | 유형 | 현재 문구 | 무엇이 틀렸나 | 제안 문구 |
| --- | --- | --- | --- | --- |
| `pond_snatch` | 불일치🟠 | "상대가 최근에 버린 **3장** 중 1장" | 실제 최대 **9장**(상대 3인 × 각 3장). detail만 맞다 | "상대 셋이 각각 최근에 버린 3장(최대 9장) 중 1장" |
| `invincible` | 불일치🟠 | "타가는 당신을 론할 수 없다" | 창깡은 막지 않는다(`invincible.ts:119`) | "타가는 내 **버림패로** 론할 수 없다 … 가깡을 창깡당하는 것은 막지 못한다" |
| `frame_up` | 누락🟠 | (대가는 "책임도 내가 진다"뿐) | 중장패를 심으면 **유국만관 자격 상실**. 봉인패는 심을 수 없다 | 확정 5의 두 문장 추가 |
| `bottom_yaku` | UI🟠 | "이 두 **역만**으로는 화료할 수 없다" | 사전이 役滿으로 밑줄+툴팁 | "이 **둘만**으로는 화료할 수 없다" |
| `iron_wall` | 누락🟠 | "+3판을 얻는다" | 역만 화료엔 0 | "…+3판을 얻는다(역만에는 미적용)" |
| `open_riichi` | 누락🟠 | "그 리치를 2판으로 취급한다" | 〃 | "…(역만 손에는 이 추가 판이 붙지 않는다)" |
| `yakuless_win` | 누락🟠 · 표기 | "그 화료를 2판으로 취급한다" / "**역이 없이**" | 역만 예외 미기재 + 비문 | "역 없이 화료하면 …(역만에는 미적용)" |
| `late_bloomer` | 누락🟠 | "만개 후의 화료에는 +3판이 붙는다" | 역만 화료엔 0 | "…+3판이 붙는다(역만에는 미적용)" |
| `late_bloomer_east` | 누락🟠 | "+2판이 붙는다" | 〃 | 〃 |
| `late_double` | 누락🟠 | "그렇게 취급된 더블리치에는 +1판" | 〃 | "…+1판이 붙는다(역만에는 미적용)" |
| `foresight` | 누락🟠 | "발동한 국에 화료하면 +2판" | 〃 | "…+2판을 얻는다(역만에는 미적용)" |
| `future_sight` | 누락🟠 | "층 하나당 +1판을 얻는다" | 〃 | "…층 하나당 +1판(역만에는 미적용)" |
| `silent_swap` | 누락🟠 | "발동한 국에 화료하면 +2판" | 〃 | "…+2판을 얻는다(역만에는 미적용)" |
| `soul_strike` | 누락🟠 | "그 리치는 2판(더블리치는 3판)" | 〃 | "…3판)으로 값한다(역만 손에는 이 추가 판이 붙지 않는다)" |
| `open_riichi_reveal` | 누락🟠 | "그 리치를 3판으로 취급한다" | 〃 | "…3판으로 취급한다(역만에는 미적용)" |
| `tanyao_break` | 누락🟠 | "그 탕야오를 2판으로 취급한다" | 〃(탕야오 스안커) | "…2판으로 취급한다(역만에는 미적용)" |
| `stealth_riichi` | 누락🟠 · UI🟡 | 배타 문장 없음 / "은닉의 **대가**가" | 8종을 잠그는데 침묵 · '대가'가 對面으로 밑줄 | 확정 1의 배타 문장 + "은닉에는 **값**이 하나 있다" |
| `avenger` | 누락🟠 | 배타 문장 없음 | 대기만성 2종을 잠근다 | "대기만성(반장전·동풍전)과는 함께 가질 수 없다" |
| `riichi_upgrade` | 누락🟠 | 배타 문장 없음 | 리치 봉인·스텔스 리치를 잠근다 | 배타 문장 추가 |
| `free_riichi_discard` | 누락🟠 | 배타 문장 없음 | 승부수·손바닥 뒤집기 | 〃 |
| `last_stand` | 누락🟠 | 배타 문장 없음 | 자유 선언·오픈 리치 | 〃 |
| `hidden_blade` | 누락🟠 | 배타 문장 없음 | 혼 사냥 | 〃 |
| `soul_hunt` | 누락🟠 | 배타 문장 없음 | 숨은 칼날 | 〃 |
| `tile_dyeing` | 누락🟠 | 배타 문장 없음 | 오픈 리치 | 〃 |
| `open_kokushi` | 누락🟠 | 배타 문장 없음 | 진짜 용 | 〃 |
| `royal_kokushi` | 누락🟠 | 배타 문장 없음 | 진짜 용 | 〃 |
| `async_chiitoi` | 누락🟠 | 배타 문장 없음 | 진짜 용 | 〃 |
| `mixed_nine_gates` | 누락🟠 | 배타 문장 없음 | 진짜 용 | 〃 |
| `giant_god` | 누락🟠 · 표기🟡 | 배타 문장 없음 / "13종(**1m9m·1p9p·1s9s**…)" | 진짜 용을 잠근다 · 117종 중 유일한 로마자 패 표기 | 배타 문장 + "1만9만·1통9통·1삭9삭·동남서북·백발중" |
| `void_kan` | 누락🟠 | 배타 문장 없음 | 진짜 용 | 〃 |
| `all_or_nothing` | 누락🟠 | 배타 문장 없음 | 스텔스 리치 | 〃 |
| `off_by_one` | 누락🟠 | 배타 문장 없음 | 스텔스 리치 | 〃 |
| `palm_flip` | 누락🟠 | 배타 문장 없음 | 자유 선언·오픈 리치·스텔스 리치 | 〃 |
| `riichi_seal` | 누락🟠 · 표기 | 배타 문장 없음 / 머리말 `—` | 이중 선언·스텔스 리치 | 배타 문장 + 구분자 `·` |
| `no_ron_pact` | 누락🟠 · 표기 | 배타 문장 없음 / "**타가**는 **당신**을" | 죽기살기·천하무적 · 인칭·용어 혼용 | 배타 문장 + "상대는 나를" |
| `always_tenpai` | 누락🟠 | 배타 문장 없음 | 죽기살기 | 배타 문장 |
| `regret` | 누락🟠 · 표기 | 배타 문장 없음 / "**당신**이 멘젠 텐파이면" | 귀환 · 인칭 | 배타 문장 + "내가 멘젠 텐파이면" |
| `honor_return` | 누락🟠 | 배타 문장 없음 | 미련 | 배타 문장 |
| `picky_eater` | 누락🟠 | 배타 문장 없음 | 누명 | 배타 문장 |
| `conjure_draw` | 불일치🟡 | "패산이 아니라 **허공에서** 생성되어" | 패산에서 뽑은 실물의 종류만 덮어쓴다 | "패산에서 뽑히지만 그 자리에서 부른 패로 바뀌어 … 패산은 평소대로 한 장 준다" |
| `table_flip` | 누락🟡 | (앞면에 대가 없음) | 반납 손패가 **전원 공개**된다 | "…새 손패를 받는다 — 반납한 손패는 전원에게 공개된다" |
| `blind_ron` | 불일치🟡 | "이 경우 그 화료는 **±0점**이 된다" | detail은 "공탁·본장은 원래대로" — 자체 모순 | "손의 화료점을 자기가 물어 그만큼은 상쇄된다(본장·공탁은 그대로 받는다)" |
| `let_it_ride` | 모호🟡 | "**연속으로** 화료할수록" | 남의 쯔모는 연승을 안 끊는다 | "상대가 쯔모로 화료한 국은 내가 쏜 것이 아니므로 연승이 이어진다" |
| `three_dragons_will` | 불일치🟠(의심) | "가장 쓸모없는 **잡패**에서 물질화" · "부족한 **두 장**" | 도라·적도라 가드 없음 · 재료가 1장일 수도 | 구현을 `tile_split`과 맞추고 "부족한 만큼(한두 장)이 … 고립된 패에서" |
| `ura_peek` | 모호🟡(의심) | "뒷도라 표시패를 왕패의 다른 패와" · "**본인**만" | **첫 번째** 표시패만 · 인칭 | "**첫 번째** 뒷도라 표시패를 …" / "나만 확인한다" |
| `blood_contract` | 불일치🟡(의심) | "…일기통관·치또이 **등**" | 목록은 정확히 8종에서 닫혀 있다 | '등' 삭제 |
| `parasite` | 표기🟡 | 머리말 "(**국마다** 1회)" | 117종 중 유일 | "(매 국 1회)" |
| `seat_swap` | 표기🟡 | 머리말 "…반장전 3회**,** 국당 1회" | 쉼표 구분자는 여기 하나뿐 | "…반장전 3회 · 매 국 1회" |
| `suit_unify` | 표기🟡 | 배지 `동풍전1·반장전2` | 머리말의 "한 국에 1회"가 배지에서 사라진다 | 배지 `매 국 1회` |
| `genesis` | 표기🟡 | 배지 `동풍전1·반장전2` | 〃 | 배지 `매 국 1회` |
| `hand_swap3` | 표기🟡 | 배지 `게임 2회` | 〃 | 배지 `매 국 1회` |
| `devils_advance` | 표기🟡 | "10,000점 … 3,000점" | 117종 중 유일하게 콤마를 쓴다 | 전역 통일(§확정 13④) |
| `unification` | 표기🟡 | "45000점" | 〃 반대편 | "45,000점" |
| `always_tenpai` | 표기🟡 | "2000점 … (셋 다 노텐이면 **+6000**)" | 콤마 · 단위(점) 누락 | "2,000점 … (+6,000점)" |
| `honba_hunter` | 표기🟡 | "300점 … 1500점 … +7500점" | 콤마 | "1,500점 … +7,500점" |
| `karma` | 표기🟡 | 머리말 "게이지 **8,000** 이상" | 본문 다른 숫자와 표기가 갈린다 | 전역 통일 |
| `invincible` | 표기🟡 | "**타가**는 **당신**을 론할 수 없다" | 인칭·용어 혼용(요약은 "아무도 나를") | "상대는 나를 론할 수 없다" |
| `dora_conceal` | 표기🟡 | detail "**당신**에게만 보이고" | description은 "**나만** 알 수 있다" | "나에게만 보이고" |
| `brief_fog` | 표기🟡 | "오직 **당신만** 모든 바닥을" | 인칭 | "오직 나만" |
| `tenpai_scan` | 표기🟡 | "**당신**에게만 밝혀진다" (2회) | 인칭 | "나에게만" |
| `red_five_touch` | 표기🟡 | 후로/울다 혼용 | 한 카드 안에서 갈린다 | `후로`로 통일 |
| `bluff_pretense` | 표기🟡 | 〃 | 〃 | 〃 |
| `polar_ends` | 표기🟡 | 멘쯔/몸통 혼용 | 〃 | `몸통`으로 통일 |
| `sign_flip` | 표기🟡 | 방총/쏘이다 혼용 · 머리말 없음 · 콤마 없음 | 〃 | 〃 |
| `cornucopia` | 표기🟡 | 머리말 없음 | 113종은 머리말로 시작 | "(획득 즉시)" |
| `time_pressure` | 표기🟡 | 머리말 없음 · "뽑는 순간 자동 발동." | 〃 | "(획득 즉시 · 이번 국만)" |
| `blind_ron` | 표기🟡 | 머리말 없음 · "증강을 뽑은 국에만 적용되며," | 〃 | "(획득 즉시 · 이번 국만)" |
| `scapegoat` | UI🟡 | (계열 `disrupt`) | 거울상인 `blame_shift`는 `scoring` | 계열 통일 |
| `parasite` | UI🟡 | (계열 `disrupt`) | 같은 기계를 쓰는 `spy`는 `scoring` | 계열 통일 |
| `true_dragon` | 표기🟡 | "멘쯔 5개 + 머리 1개" | `yakuless_win`·`late_bloomer`는 "몸통 4개" | "몸통 5개 + 머리 1개" |
| `omni_chi` | 표기🟡 | "치를 할 수 있다" | 나머지 6종은 "치해서/치할" | "치할 수 있다" |
| `giant_god` | UI🟡 | (카드에 "13면 **텐파이**") | 그 낱말로 도감 검색이 안 된다(확정 8) | 검색 코퍼스에 요약 추가 |
| `danger_sense` | UI🟡 | (카드에 "**방총**이 되는 패") | 〃 | 〃 |
| `yakuman_shield` | UI🟡 | "**유국역만** 포함" | 사전이 뒤 두 글자만 밑줄 | `유국역만` 항목 추가 |

**검토했으나 이상 없음: 48종** (아래 51개 중 `*` 셋은 표에도 한 줄 있어 실수(實數)에서 뺀다.
표에 오른 것 69종 + 여기 48종 = **117종**, 빠뜨린 종 없음 — 대조:
`node -e` 로 표의 id와 이 목록을 카탈로그와 맞춰 확인했다.)
`alchemist` `ankan_dora` `aotenjou_ceiling` `big_hand` `blame_shift` `bottom_deal`
`broken_border` `broken_wall` `call_seal` `cliff_bloom` `counter` `dead_wall_master`
`die_hard` `disarm` `discard_lock` `discard_recall` `dora_afterimage` `eternal_dealer`
`even_world` `full_hand_swap` `grave_rob` `haitei_lord` `hidden_river` `hourglass`
`jackpot` `joker` `meld_dissolve` `mirror_dora` `mixed_triplet` `nagashi_yakuman`
`no_retreat` `north_trader` `peek_riichi_waits` `pseudo_dealer` `push_riichi` `rank_gate`
`reload` `rinshan_preview` `siege_riichi` `silent_pact` `snake_kan` `spy` `suit_unify`
`take_back` `time_stop` `triple_peek` `tile_split` `wind_lineage` `xray_hand`
`hand_swap3`\* `foresight`\*
(\* 위 표에는 표기·역만 항목으로만 올랐고, 그 밖에는 문구가 구현과 일치한다.)

---

# 부록

## 부록 A. 1차(`qa-lab/findings/text.md`) 항목의 수정 여부 — 코드로 재검증

**고쳐진 것(재현 안 됨) 24건**:
`danger_sense`(철벽·무역 필터) · `discard_recall`(후리텐 이력 + "리치 중에는 쓸 수 없다" 명시) ·
`foresight` · `hidden_river` · `counter` · `late_double`(`turnCount`→`discardCount`) ·
`no_ron_pact`(파기 이력 `declaredKey`, 순 계수) · `silent_pact`(description이 "대명깡"으로) ·
`stealth_riichi`×`last_stand`(`last_stand.ts:106`이 은닉 표식을 내린다) ·
`riichi_upgrade`(`syncSealView`) · `tile_split`·`bluff_pretense`(`isPreciousMaterial` 가드 +
detail에 "재료는 도라·적도라가 아닌 패") · `regret`(적도라·`redFor`까지 보존) ·
`honor_return`(`discardedKinds` 기준) · `seat_swap`(`lastDrawnTile` 가드 + 문구) ·
`open_riichi_reveal`(detail에 스텔스 리치 추가) · `haitei_lord`·`cliff_bloom`("(역만에는 미적용)") ·
`polar_ends`·`snake_kan` · `karma`(적립원을 detail에 명시) · `scapegoat` ·
`north_trader`("상대의 천화·지화·구종구패에는 영향을 주지 않는다" + 코드도 전역 플래그를 안 건드림) ·
`rank_gate` · `eternal_dealer` · `void_kan` · `disarm` · `frame_up` · `giant_god` ·
`reload` · `time_pressure`("무작위" 삭제 + 결정성 서술) · `picky_eater` · `suit_unify`.

**아직 남은 것 1건**: `blood_contract`의 "등" → 위 의심 3.

## 부록 B. 길이 — 도감 카드에서 잘리는 요약은 **없다** (실측)

지시서 3번(카드 UI에서 잘리는 길이)을 실제 CSS로 재현해 쟀다.
`.codex-card`(`grid-template-columns: repeat(auto-fill, minmax(210px, 1fr))`,
`padding: 11px 13px 12px`, `border-left: 3px`)에 `.codex-card-desc`
(`font-size: 11.8px · line-height: 1.45 · -webkit-line-clamp: 3`)를 그대로 옮기고,
117종의 요약 + 배지를 넣어 브라우저에서 `scrollHeight > clientHeight`를 셌다.

```
qa-lab/round2/text/clamp.html  (생성: node qa-lab/round2/text/gen_clamp.mjs)
total: 117 · clippedCount: 0
가장 긴 것: devils_advance 50자 · all_or_nothing 48자 · giant_god 46자 · tile_dyeing 45자
```

`packages/content/test/client_augment_brief.test.ts`의 `BRIEF_MAX = 60`은 실제 상자보다
넉넉하다(최장 50자). 드래프트 카드·이름표 툴팁은 `-webkit-line-clamp: 5`라 더 여유가 있다.
**길이 결함 0건.** 다만 원문 `description`은 최장 **172자**(`cliff_bloom`)로,
같은 테스트의 머리말 주석("최대 157자")이 낡았다 — 사실 관계만 어긋난 주석이다.

## 부록 C. 이상 없던 전역 스캔

| 스캔 | 스크립트 | 결과 |
| --- | --- | --- |
| 카탈로그 ↔ `powerTier.ts` 등재 | `text/tier.ts` | 미분류 0 · 유령 0. 관리자 티어표는 **서버가 매 요청 조인**하므로 표기 불일치 경로 자체가 없다. `⚠ 재평가 필요` 빚은 `big_hand` 1건(문서화된 빚) |
| 결과 화면 역 이름표 ↔ 코어 역 id | `awk` + `comm` | `YAKU_NAMES` 48개가 코어 역을 전부 덮는다. 콘텐츠가 만든 커스텀 역(`bottom_flow` `bottom_letgo` 등)은 `YAKU_NAMES[y.id] ?? y.name` 폴백으로 등록 이름이 뜬다 — 생 id 노출 0건 |
| `blood_contract` 계약 역 8종 ↔ 이름표 | 수동 | 8종 전부 `YAKU_NAMES`에 있다 |
| 도감 정렬 | 코드 판독 | 표본 없는 값은 항상 뒤, 동점은 이름 가나다순. 이상 없음 |
| 계열 칩 개수 | 코드 판독 | 계열 필터를 뺀 나머지 조건까지 반영해 셈. 빈 칩은 감춘다. 이상 없음 |
| 마침표·존댓말 | `text/dump.ts` | description 117종 전부 마침표로 끝난다. 존댓말 혼입 0건(증강은 평어, 튜토리얼·도움말은 존댓말 — 화자가 달라 의도된 분리다) |

## 부록 D. 증강 밖 — 안내/오류 문구 1건

🟡 `packages/server/src/HumanAgent.ts:1222`
```ts
? "제시되지 않은 증강입니다 — 화면을 새로 받아 주세요."
```
같은 파일 `:1179-1183`의 주석이 바로 이 표현을 못 박아 폐기했다:
> "화면을 새로 받아 주세요"라고 적어 두었었는데, **화면을 새로 받는 방법이
> 프로토콜에 없었다** — 사용자가 할 수 있는 일이 아닌 것을 지시하는 문장이었다(감사 §2-4).

`INVALID_ACTION` 쪽은 고쳤는데 43줄 아래 `INVALID_DRAFT_PICK`에는 그대로 남았다.
`packages/client/src/App.tsx:4302-4303`의 주석도 같은 문장을 문제로 인용한다.
**제안**: "이미 지나간 증강 후보입니다 — 지금 화면에 서 있는 카드 중에서 고르세요."
