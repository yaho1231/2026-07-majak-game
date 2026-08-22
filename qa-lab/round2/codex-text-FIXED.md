# codex-text 확정 15 · 의심 3 — 수정 보고

대상 보고서: `qa-lab/round2/codex-text.md`
작업 범위: `packages/content/src/**` · `packages/client/src/glossary.ts` ·
`packages/client/src/augmentBrief.ts` · `packages/server/src/HumanAgent.ts`(문구 한 줄) ·
`packages/content/test/**`. **`App.tsx`·`styles.css`·`core/**`는 손대지 않았다.**

---

## 0. 정본으로 정한 표기 (확정 13)

| 축 | 정본 | 왜 |
| --- | --- | --- |
| 횟수 | **`매 국 1회`** | 117종 중 18(머리말)·26(배지)이 이미 이 표기다. `국당 1회`·`국마다 1회`·`한 국에 1회`를 전부 여기로 모았다 |
| 머리말 구분자 | **`·`** | 같은 절(`리치는 국당 한 번`)을 `·`와 `—`로 갈라 쓰던 것이 문제였다. 다만 **문장 하나가 통째로 들어가는 머리말**(개벽·천하통일·연금술사·염색)은 `—`를 남겼다 — 거기서 `·`는 항목 나열로 오독된다 |
| 머리말 유무 | **전 종이 `(…)`로 시작** | 없던 넷에 `(획득 즉시)` / `(획득 즉시 · 이번 국만)`을 넣고, 본문에 흩어져 있던 "뽑는 순간 자동 발동."·"증강을 뽑은 국에만 적용되며,"를 뺐다(길이 증가 0) |
| 천 단위 | **4자리 이상은 콤마** (`1,000점` `45,000점`) | `devils_advance`·`karma`가 이미 쓰고 있었고, 읽는 쪽 부담이 낮은 쪽이다 |
| 인칭 | **1인칭 `나·내`** | 101종이 이미 1인칭. `당신` 6종·`본인` 1종을 전부 옮겼다. **`보유자`(7종)는 남겼다** — 이유는 §4 |
| 용어 | `후로` / `몸통` / `상대` / `방총` | 각각 다수파다(후로 23:울다 13, 상대 45:타가 6). `멘쯔`는 `몸통 4개(4멘쯔)`처럼 **처음 나올 때의 괄호 주석**으로만 남겼다 |
| 패 표기 | **한글**(`1만9만·1통9통·1삭9삭`) | 로마자는 117종 중 `giant_god` 하나뿐이었고 게임 화면 어디에도 `1m`이 없다 |

---

## 1. 확정 1 — 배타 28종의 침묵 → **데이터에서 생성**한다

문구에 일일이 적으면 `conflicts` 배열이 바뀔 때마다 낡는다(실제로 `die_hard` 넷은
적어 두고 반대편 `always_tenpai`·`no_ron_pact`는 침묵하는 비대칭이 그렇게 생겼다).
그래서 **문구를 고치지 않고 생성기를 넣었다.**

- 새 파일 **`packages/content/src/conflictNotes.ts`** — `withConflictNotes(defs)`가
  `conflicts`를 **양방향으로 펼쳐** `detail` 끝에 한 줄을 붙인다.
  `index.ts`의 `contentAugments`가 이 함수를 통과한 배열이 됐다.
- 손으로 적는 것은 목록이 아니라 **이유**(`CONFLICT_REASON`)뿐이고, 없으면 목록만 뜬다.
- 손으로 적혀 있던 4종(`die_hard`·`yakuman_shield`·`open_riichi_reveal`·`true_dragon`)의
  배타 문장은 **지웠다** — 같은 말이 두 번 나오지 않게. 그 문장의 *이유* 부분은
  `CONFLICT_REASON`으로 옮겼다.
- 결과: 배타를 가진 **33종 전부**가 자기 카드에서 배타를 말한다. 예)
  `stealth_riichi` → `⚠ 함께 가질 수 없다 — 이중 선언 · 오픈 리치 · 모 아니면 도 ·
  리치 봉인 · 한 끗 차이 · 정적의 손 · 손바닥 뒤집기 · 영혼의 일격. 전부 '내가 건
  리치'의 모양을 바꿔 은닉과 화면이 어긋난다.`

### ⚠ App.tsx에 남은 일 (내 담당이 아니라 손대지 않았다)

붙는 자리는 `detail`이라 **도감 상세**에서만 보인다. 드래프트 카드는 요약 +
`description`만 펼치므로(`augmentBrief.ts` 머리말 표 참조) **고르는 순간에는 안 보인다.**
드래프트 카드에도 띄우려면 `App.tsx`에서 배지를 그려야 한다:

- 자리: `AugDesc`(≈`App.tsx:7932~7960`). `variant === "draft"`일 때 `detail`의
  `⚠ 함께 가질 수 없다 —` 줄만 뽑아 한 줄 칩으로 붙이면 된다.
- 초안:
  ```tsx
  // AugDesc 안, paras 계산 뒤
  const conflictLine = (detail ?? "")
    .split("\n\n")
    .find((p) => p.startsWith("⚠ 함께 가질 수 없다"));
  // …variant === "draft" && conflictLine !== undefined 일 때
  <div className="aug-conflicts">{conflictLine}</div>
  ```
  (`styles.css`에 `.aug-conflicts` 한 줄이 필요하다 — 그쪽도 다른 담당자 것이다.)

---

## 2. 확정 2 — "+N판"이 역만에서 0인데 문구에 없다 (12종 중 **9종** 수정)

정본 표기는 저장소에 이미 있던 **`(역만에는 미적용)`**. `detail`의 판수 문장 뒤에만
붙였다 — `haitei_lord`·`cliff_bloom`·`avenger`가 그렇게 하고 있고, `description`은
드래프트 카드에 그대로 뜨는 짧은 층이라 길이를 늘리지 않았다.

고친 것: `late_bloomer` `late_bloomer_east` `late_double` `foresight` `future_sight`
`silent_swap` `soul_strike` `open_riichi_reveal` `tanyao_break`.
덤으로 `riichi_upgrade`의 "(추가 판은 역만에 적용되지 않는다)"를 같은 표기로 맞췄다.

**못 고친 3종 — `iron_wall` · `open_riichi` · `yakuless_win`은 코어에 있다**
(`packages/core/src/augment/standardAugments.ts`). 지시서가 `core/**`를 금지해 손대지
않았다. 넣을 문장은 위와 같다:
`+3판을 얻는다(역만에는 미적용).` / `그 리치를 2판으로 취급한다(역만에는 미적용).` /
`2판으로 취급된다(역만에는 미적용).`
같은 파일의 `yakuless_win` 비문 2건(**"역이 없이"** → `역 없이`, **"화료가 가능하다"** →
`화료할 수 있다`)도 같은 이유로 남았다.

---

## 3. 설명 ≠ 구현 · 누락 · 모호 (확정 3~12)

| # | id | 무엇을 어떻게 |
| --- | --- | --- |
| 3 | `pond_snatch` | description: "상대가 최근에 버린 3장" → **"상대 셋이 각각 최근에 버린 3장(최대 9장)"**. 곁가지도 함께 — "멘쯔·리치가 유지되고"가 리치 중 사용 가능으로 읽혀서 **"멘젠은 유지되지만 리치 중에는 쓸 수 없고"**로. 요약(`augmentBrief`)도 9장으로 |
| 4 | `invincible` | "타가는 당신을 론할 수 없다" → **"상대는 내 버림패로 론할 수 없다 … 내 가깡을 창깡당하는 것은 막지 못한다"**. detail 예외 목록에도 창깡 추가. 요약에 `(창깡은 제외)` |
| 5 | `frame_up` | detail 끝에 **유국만관 자격 상실**과 **봉인패 제약** 두 가지를 한 문장에 넣었다 |
| 6 | `bottom_yaku` | "이 두 **역만**으로는" → **"이 둘만으로는"** (사전이 役滿으로 밑줄 긋던 자리) |
| 7 | `stealth_riichi` | "은닉의 **대가**가" → **"은닉에는 값이 하나 있다"** (+ 사전 쪽도 §5) |
| 9 | `conjure_draw` | "패산이 아니라 허공에서 생성되어" → **"패산에서 뽑히되 그 자리에서 부른 패의 복제(생성패)로 바뀌어 … 패산은 평소대로 한 장 줄고"**. description의 "허공에서 온다"도 함께 |
| 10 | `table_flip` | description·요약에 **"반납한 손패는 전원에게 공개된다"** — 이 증강의 유일한 대가였다 |
| 11 | `blind_ron` | "±0점이 된다" → **"손의 화료점을 자기가 물어 그만큼 상쇄된다(본장·공탁은 그대로 받는다)"** — detail과의 자체 모순 해소 |
| 12 | `let_it_ride` | detail에 **"상대가 쯔모로 화료한 국은 내가 쏜 것이 아니므로 연승이 그대로 이어진다"** |
| 14 | 배지 | `hand_swap3`·`suit_unify`·`genesis` 배지를 **좁은 쪽**(`매 국 1회`)으로. `giant_god`·`seat_swap`·`parasite` 배지도 표기 통일 |
| 15 | 계열 | `scapegoat`·`parasite`를 **`scoring`**으로 옮겼다 — 거울상인 `blame_shift`·`spy`가 거기 있다 |

---

## 4. 의심 3건 — 전부 실재했다

### 의심 1 🟠 `three_dragons_will` 재료가 도라·적도라를 태운다 → **구현 수정 + 회귀 테스트**

형제 둘이 쓰는 공용 가드 `isPreciousMaterial`(`bluff_pretense.ts:63`)을 같은 방식으로
끼웠다(`pickMaterials`). 태울 것이 도라뿐이면 그때만 도라가 재료가 되는 폴백도 형제와 같다.
detail도 맞췄다 — "부족한 **두 장**" → **"부족한 만큼(한두 장)"**, 그리고
"재료는 도라·적도라가 아닌 패 중에서 고른다".

- 테스트: **`packages/content/test/qa_round2_text.test.ts`** (신규, 2건)
  - 고립된 적도라 대신 다른 잡패를 태운다 — **가드를 빼면 실제로 실패한다**(확인함)
  - 태울 것이 도라뿐이어도 발동은 막히지 않는다

### 의심 2 🟡 `ura_peek` — 바꿔치기 대상은 첫 번째 표시패뿐 (`ura_peek.ts:136`)

구현이 맞고 문구가 특정하지 않았다. description·detail 모두 **"첫 번째 뒷도라 표시패"**로.
같은 카드의 `본인만` → `나만`(인칭 통일).

### 의심 3 🟡 `blood_contract` — "치또이 **등**"

`CONTRACT_YAKU`는 정확히 8종에서 닫혀 있다(`:42-51`). **'등' 한 글자를 뺐다.**

---

## 5. 용어 사전 (`glossary.ts`)

- **`toimen`의 `대가` 매치를 아예 뺐다.** 앞이 한글일 때만 막아도 "은닉의 대가가"처럼
  조사 뒤에 서면 그대로 걸린다. 이 게임 텍스트가 對面 뜻으로 쓰는 표기는 `대면`
  하나뿐이라(전수 확인) 잡을 값 없이 위험만 남는 매치였다. `label`도 `대면`으로.
- **`furo`가 동사형을 잡는다** — `울[지어러려린]`·`운다` 추가. 예전에는
  `call_seal`의 "후로가 봉인되어 아무도 울지 못한다"에서 앞만 밑줄이 그였다.
- **`유국역만` 항목 신설** — 이 게임이 만든 말인데 사전에 없어 뒤 두 글자만 밑줄이 그였다.
- `역만` 쪽은 손대지 않았다 — `yakuman_shield`의 "셈수역만으로"는 진짜 役滿이라
  정규식으로 가를 수 없다. 뿌리인 `bottom_yaku` 문구를 고쳤다(§3).

---

## 6. 증강 밖 — 부록 D

`packages/server/src/HumanAgent.ts` `INVALID_DRAFT_PICK` →
**"이미 지나간 증강 후보입니다 — 지금 화면에 서 있는 카드 중에서 고르세요."**
(같은 파일 위쪽 `INVALID_ACTION`의 주석이 폐기한 표현이 43줄 아래에 남아 있었다.)

---

## 7. 안 고친 것과 이유

| 항목 | 이유 |
| --- | --- |
| 확정 2 중 `iron_wall`·`open_riichi`·`yakuless_win` | **코어**(`standardAugments.ts`) — 지시서가 금지. 넣을 문장은 §2에 적어 두었다 |
| 확정 13⑥ `yakuless_win`의 "역이 없이"·"화료가 가능하다" | 〃 |
| 확정 8 (도감 검색이 요약을 안 본다) | **`App.tsx`** `CodexScreen`의 필터. 술어에 한 줄을 더하면 된다: `&& !briefOf(m.cat.id, m.cat.description).text.toLowerCase().includes(q)` — `catCounts` 쪽 술어도 같은 모양이라 함께 고쳐야 한다 |
| 확정 1의 드래프트 카드 노출 | 〃 (§1 끝의 코드 초안) |
| 머리말 `—` 4종(`genesis`·`suit_unify`·`alchemist`·`tile_dyeing`) | 머리말 안이 **문장 하나**라 `·`로 바꾸면 항목 나열로 오독된다. 구분자 통일의 취지(같은 절을 다르게 적지 않기)에는 어긋나지 않는다 |
| 인칭 `보유자` 7종 | QA 제안도 "위 8종의 해당 문장만 고치면 닫힌다"였다. `보유자`는 한 카드 안에서 `나`와 갈리지 않고, 3인칭이 자연스러운 자리(`time_pressure` "보유자도 예외가 아니다")가 대부분이다. 다만 `mirror_dora`·`sign_flip`은 같은 카드 안에서 갈려 1인칭으로 옮겼다 |
| `(열람 4순에 1회 · 재배열은 국에 1회)` | 사용 횟수가 둘로 갈린 예외적 머리말이라 `매 국 1회`로 뭉개면 뜻이 바뀐다 |

---

## 8. 검증

```
npx vitest run packages/content packages/client
  → Test Files 193 passed (193) · Tests 2029 passed (2029)
npm run typecheck && npm run typecheck:content && npm run typecheck:server && npm run typecheck:client
  → 4종 전부 에러 0
npx vitest run packages/server/test/HumanAgent.test.ts   → 47 passed
```

문구를 검사하던 기존 테스트 4개를 함께 갱신했다(전부 **정본 변경에 따른 갱신**이지,
검사를 느슨하게 한 것이 아니다).

| 파일 | 무엇을 |
| --- | --- |
| `test/riichi_qa_0820.test.ts` | `open_riichi_reveal` 배타 검사가 원본 정의 대신 **출고되는 카탈로그**(`contentAugments`)를 본다 — 배타 문장이 생성물이 됐으므로 |
| `test/honesty_fixes_0807.test.ts` | `genesis` 머리말 `한 국에 1회`→`매 국 1회`, `unification` `45000`→`45,000` |
| `test/description_numbers.test.ts` | 글과 코드 양쪽의 자릿점을 지우고 비교하도록 `flattenCommas` 추가(그룹이 여럿이어도 돈다). 그 결과 근거가 잡힌 허용 목록 2건(`devils_advance:9000`·`karma:12000`)을 뺐다 |
| `test/client_augment_brief.test.ts` | `대가` 매치 제거에 맞춰 기대값 갱신 + `"은닉의 대가가 하나 있다"`가 아무것도 잡지 않는다는 검사를 **추가**했다 |

신규: `test/qa_round2_text.test.ts` (의심 1 회귀 2건).
