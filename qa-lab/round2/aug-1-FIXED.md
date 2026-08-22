# aug-1 확정 6건 수정 결과 (2026-08-22)

회귀 테스트: `packages/content/test/qa_aug1_round2.test.ts` (14 케이스, 전부 통과).
「되돌리면 실패함」은 **소스 수정만 임시로 되돌리고 그 테스트를 단독 실행해** 실측한 것이다.

---

## 확정 6건 — 전부 수정 완료 · 전부 되돌림 검증 완료

| # | 증강 | 수정 | 되돌리면 실패 |
|---|------|------|----------------|
| 1 🔴 | `blind_ron` | 정산 payload에 `blindRonApplied` 표식을 두고, 이미 서 있으면 그대로 `return event`. 보유자가 몇이든 재배선은 **국당 한 번**. | ✅ 표식 검사 한 줄을 지우면 「두 명이 들어도 이동은 한 번뿐」·「세 명이 들어도 결과가 같다」 2건 실패 |
| 2 🟡 | `blame_shift` | `splitEvenly`의 `Math.round` → `Math.floor`. 끝수가 언제나 마지막 몫(=쏜 사람)으로 몰린다. | ✅ `Math.round`로 되돌리면 「8000점 3분할에서 쏜 사람이 가장 많이 낸다」 실패 |
| 3 🟠 | `cliff_bloom` | `visibility.deadWall` 모디파이어에 `canPick(state, holder)` 게이트. 고를 차례가 열려 있을 때만 열람. | ✅ 게이트를 빼면 「깡을 한 번도 치지 않은 보유자는 왕패를 한 장도 볼 수 없다」 실패 |
| 4 🟠 | `counter` (× `last_stand`) | `RiichiCanceled` 리액션 추가 — 대납금 환급(`CounterReverted` 리듀서)·`struck` 해제·공개 채널 정리. 국당 1회(`spent`)는 소진 유지. | ✅ 리액션을 지우면 「승부수로 리치를 취소하면 대납 1,000점이 되돌아가고 struck이 내려간다」 실패 |
| 5 🟠 | `danger_sense` | `dangerKinds` 첫머리에 `discarderImmune`(내 버림의 `win.ronImmune`) 조기 반환 + `canRonWith`에 `belowMinHan`(`win.minHan` + `score.extraHan`) 게이트. | ✅ 두 게이트를 각각 되돌리면 해당 테스트가 각각 1건씩 실패 (a: 론 면역, b: 격) |
| 6 🟡 | `dead_wall_master` | 이름표 값을 `publishedRemaining`(창이 닫혔으면 0)으로 바꾸고, `TILE_DISCARDED`에서 한 번 더 발행. | ✅ `remainingSwaps` 직접 사용으로 되돌리면 「첫 타패를 넘기면 0으로 내려간다」 실패 |

앞 담당자의 소스 수정을 `git diff`로 전수 대조했다 — **확정 6건에 정확히 대응하고 빠진 건이 없다.**
`last_stand.ts` 변경(취소한 국의 재리치 차단·국 스코프 키)은 aug-2 담당 몫이라 손대지 않았다.

### 실패했던 4건의 원인 — 전부 **장면 조립/키 이름** 문제였다 (소스는 이미 옳았다)

- **확정 4 (2건)** — 리치는 `{type:"discard", payload:{riichi:true}}`가 아니라 **`{type:"riichi"}`** 라는 별도 옵션이다.
  FlowController는 제시한 객체와 완전히 같은 것만 받으므로 손으로 조립한 payload가 `Option was not offered`로 튕겼다.
  또 리치 선언패(1z)에 p1의 론 기회가 열려 루프가 멈췄다 → 프롬프트에서 옵션을 그대로 꺼내 쓰고, `pass`를 우선 처리하게 고쳤다.
  덤프: `qa-lab/round2/aug-1/dbg_counter.ts`
- **확정 5** — `roundViewKey`는 `#장-국-본장`이 아니라 **`#round`** 접미사를 붙인다(엔진 국 스코프 표식).
  키가 틀려 항상 `undefined`였다 — 그래서 「론 면역/격」 2건은 **거짓 통과**였다. 값도 `"s9"`가 아니라 `kindKey` 형식인 **`"sou9"`** 다.
  이제 값이 없으면 그 자리에서 실패하게 `expect(v).toBeDefined()`를 넣었다. 덤프: `qa-lab/round2/aug-1/dbg_danger.ts`
- **확정 6** — 같은 `#round` 키 문제. 장면 자체는 처음부터 정확했다(오야 자리·프롬프트·`dw_swap` 소멸까지). 덤프: `qa-lab/round2/aug-1/dbg_dwm.ts`

기대값은 하나도 느슨하게 하지 않았다 — 오히려 확정 5는 거짓 통과 2건을 진짜 검증으로 바꿨다.

### 확정 2·3의 파급 — 기존 테스트 2개가 **옛 (버그) 동작**을 박고 있었다

- `packages/content/test/settle_accounting_qa.test.ts` — blame_shift 더블론 2건.
  `-3900/-8400`은 `Math.round` 시절의 값이다. 확정 2의 방향(끝수는 쏜 사람)대로 `-3800/-8200`으로 고치고 근거를 주석에 남겼다.
- `packages/content/test/pair_audit_c3_c4.test.ts` — C-4 ⑥ 「좁은 쪽이 넓은 쪽을 깎지 않는다」.
  깡 문맥이 아닌 장면이라 이제 절벽이 정당하게 닫혀 있다. 테스트가 재려는 것(widenPeek 합성·순서 무관)은 그대로 두고
  **픽 창을 열어 둔 상태**에서 재도록 장면만 고쳤다.

---

## 의심 12건

### 실재를 확인하고 고친 것 (2건 · 되돌림 검증 완료)

- **의심 5 🟡 `brief_fog` — 결과 화면의 유령 배지.** 배지를 내리는 유일한 지점이 `TILE_DISCARDED`인데
  정산 뒤에는 버림이 없다. `ROUND_SETTLED` 리액션을 추가해 표식과 `revealTiles`를 함께 걷는다
  (`blind_ron`이 같은 증상을 고친 방식). ✅ 리액션을 지우면 해당 테스트 실패.
- **의심 9 🟡 `discard_lock` — 발동 즉시 쿨다운 칩이 안 선다.** `cooldownViewKey`를 쓰는 곳이
  `ROUND_STARTED` 하나뿐이라, 봉인해서 버튼이 사라진 뒤에도 칩은 다음 국까지 "0국"이었다.
  `DiscardLockSealed` 리액션을 추가해 그 자리에서 `2국`으로 올린다. ✅ 리액션을 지우면 해당 테스트 실패.

### 실재하지만 **고치지 않은** 것 (1건 · 근거 있음)

- **의심 10 🟡 `disarm` — 정산 도중 자가 해제.** 지적은 맞다(`engine:disarmed#round`·`disarm:locked:*#round`
  둘 다 국 스코프라 엔진이 지운다). 실제로 리액션을 지워 봤고 `qa_aug1_round2`는 통과했지만,
  **기존 `packages/content/test/disarm.test.ts`의 「국이 끝나면 되돌아온다」가 깨진다** —
  그 테스트는 `sys.settleAbort` **직후**에 `DISARMED_SOURCES_KEY === []`를 요구한다.
  엔진 청소는 다음 `setupRound`에서 도므로 "언제 잠금이 풀리는가"의 계약을 바꾸는 결정이 된다
  (정산 직후 vs 다음 국 시작). 내 판단으로 정할 일이 아니라 **변경을 되돌렸다.**
  구조적 테스트로는 잡을 수도 없다 — `publishUsesLeft`가 `reaction("*")`을 걸어 두어
  `reactionsFor(ROUND_SETTLED)`에 `aug:p0:disarm`이 어차피 하나 남는다(실측).

### 조사만 하고 손대지 않은 것 (9건 · 이유)

- **의심 1·2·3 (`counter`)** — 1(가상 론의 후리텐·죽은 대기·`options.from` 미지정)은 실재하지만
  강탈액 계산 전반을 다시 짜는 일이라 확정 4 수정과 같은 PR에 얹기엔 범위가 크다.
  2(`withAugPoint`에 han 미전달)와 3(공탁 0인 리치의 "대납")은 각각 `util.ts`(손대지 말 것)와
  `stealth_riichi`(내 담당 밖) 쪽 결정이 필요하다.
- **의심 4 (`conjure_draw`)** — `attrs.conjured`를 채점에서 읽는 곳이 core에 하나도 없다는 것을 재확인했다.
  고치려면 `packages/core`를 건드려야 한다(금지 범위). 카드 문구 위반은 아니고 설계 문서와의 어긋남이다.
- **의심 6·7 (`bottom_deal`·`alchemist` 컷인 중복 제거, `cliff_bloom` 연출)** — 전부
  `packages/client/src/App.tsx`와 FX 목록에 걸린다(금지 범위).
- **의심 8 (`cliff_bloom` 리치 중 손패 재작성)** — 문구를 고칠지 동작을 고칠지가 **설계 결정**이다
  (프리즘의 의도일 수 있다). QA가 단독으로 정할 사안이 아니라 보고만 남긴다.
- **의심 11 (`danger_sense` 리치 중 강제 쯔모기리)** — `FlowController.turnPrompt`의 자동 넘김 조건에
  걸리는 문제로, 같은 구조를 가진 증강이 여럿이다(`alchemist`는 명시 허용, `bluff_pretense`는 차단).
  카드가 무언인 이상 "리치 중 사용 가능/불가"를 정하는 것이 먼저다 — 문구 결정 대기.
- **의심 12 (`bluff_pretense` 공짜 퐁에 1회 소모)** — 고치려면 코어의 `sameCallKind`(mixedTri·polar 반영)를
  content에서 다시 써야 한다. 실재는 코드 대조로 확인했다.

---

## 검증

```
npx vitest run packages/content/test/qa_aug1_round2.test.ts   → 14 passed
npx vitest run packages/content                               → 1448 passed / 6 failed
npm run typecheck                                             → 통과 (에러 0)
npm run typecheck:content                                     → 내 파일 에러 0
```

남은 6 실패·1 타입 에러는 **전부 다른 담당자의 진행 중 작업**이며 내 30종 밖이다:

- `new_52_b.test.ts`·(직전 실행의) `info_fixes_batch8.test.ts` — `foresight`
- `riichi_family.test.ts` 3건 — `free_riichi_discard`
- `riichi_qa_0820.test.ts` — `stealth_riichi × last_stand` (aug-2의 재리치 차단 도입 여파)
- `settle_accounting_qa.test.ts` 1건 — `jackpot` (같은 파일에 다른 담당자가 새 케이스를 추가 중)
- `qa_aug2_round2.test.ts(122)` TS2322 `"minkan"` — aug-2 담당

시작 시점에도 같은 파일들이 실패하고 있었고(측정함), 내 변경 뒤 실패 수는 12 → 6으로 줄었다.

디버그 덤프 스크립트: `qa-lab/round2/aug-1/dbg_counter.ts` · `dbg_danger.ts` · `dbg_dwm.ts`
