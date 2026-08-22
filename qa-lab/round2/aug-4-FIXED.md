# 증강 4군 (aug-4) — 수정 보고

대상: `qa-lab/round2/aug-4.md` 확정 5건 전부 + 의심 5건 판정.
회귀 테스트: `packages/content/test/qa_aug4_round2.test.ts` (11 it, 전부 통과).
각 수정마다 **소스를 잠깐 되돌리면 그 테스트가 실패하는 것**을 확인했다(아래 각 항목의 「되돌림 확인」).

---

## 확정 1 🔴 — 염색이 `handAltered` 표식을 안 남긴다 (가짜 천화 48,000점)

- 고친 곳: `packages/content/src/augments/tile_dyeing.ts` `dyeAction.toEvents`
- 수정: 이벤트 배열에 `augmentDataSet(handAlteredKey(state, req.player), true)` 추가
  (형제 `tile_split`·`suitUnifyCore`와 같은 방식).
- 재현 전: `repro-dye-tenhou.ts` → `handAltered 표식 = (없음)` · `p0델타=48000`
- 재현 후: `handAltered 표식 = [ 'handAltered:byAugment:1-1-0:p0#round' ]` · **`p0델타=12000`**
  (첫 순이든 아니든 같은 값 — 가짜 천화 36,000점이 사라졌다)
- 테스트: `확정 1: 염색으로 손을 고치면 handAltered 표식이 남는다`
- 되돌림 확인: 그 한 줄을 지우면 이 it만 실패(10 passed / 1 failed).

## 확정 2 🔴 — 무르기도 표식을 안 남긴다

- 고친 곳: `packages/content/src/augments/take_back.ts` `TakeBackPerformed` 리듀서
- 수정: `augmentData`에 `...handAlteredMark(state, p.holder)` 추가.
- 재현 전: `p0델타=48000` (첫 순) / `12000` (첫 순 아님)
- 재현 후: **첫 순도 12,000** — `repro-takeback-tenhou.ts` 출력이 두 경로 모두
  `handAltered 표식 = [...]` · `p0델타=12000`으로 바뀌었다.
- 테스트: `확정 2: TakeBackPerformed 가 handAltered 표식을 남긴다`
- 되돌림 확인: 그 한 줄을 지우면 이 it만 실패.

## 확정 3 🟠 — 염색의 「세상에 없는 5번째 장」

- 고친 곳: `tile_dyeing.ts` — `wallPartners()` · `visibleCopies()` 신설,
  `dyeAction.validate` / `toEvents` / `holderTurnOptions` 전부.
- 수정 두 축:
  1. **분포 보존**: `suitUnifyCore`와 같은 규약으로 패산의 같은 숫자·목표 색 실물과
     **종류를 맞바꾼다**(적도라는 교환 상대에서 뺀다 — 안 그러면 염색으로 적5가 생긴다).
     패산에 실물이 없을 때만 그 자리에서 생성한다(suitUnifyCore와 같은 최후수단).
     - 물리 이동이 아니라 **kind 맞교환**을 골랐다: 손패의 tileId가 그대로 남아야
       "그 패가 물들었다"는 카드 문구·클라이언트 표시·기존 적도라 회귀 테스트가 유지된다.
       패산은 아무에게도 안 보이므로 결과는 물리 교환과 같다.
  2. **가드**: 「그 종류가 이미 넉 장 다 **보이면**」 발동 불가 (`visibleCopies >= 4`).
- ⚠ **`copiesLeftUndrawn`을 쓰지 않은 이유** (보고서 제안과 다른 지점 — 의도적이다):
  그 값은 패산+왕패만 세므로 **상대 손패에 있는 장을 세지 않는다** = 보유자가 알 수 없는
  값이다. 그걸로 액티브 후보를 열고 닫으면 **버튼의 유무만으로 "3통이 패산에 남았는가"가
  새어 나간다** — 정보 증강도 아닌 카드가 패산을 들여다보는 셈이다(Rule #2 위반을
  만들면서 다른 결함을 고치는 꼴). 반면 확정 3이 지목한 실제 피해("바닥에서 넉 장을
  다 세고 던진 안전패에 맞는다")는 **넉 장이 전부 공개돼 있을 때만** 성립한다.
  그래서 공개 정보인 「보이는 장수」로 막았다 — 피해가 생기는 경우를 정확히 덮으면서
  판정이 공개 정보라 새는 것이 없다.
  (선택이 없는 `void_kan`(확정 4)은 정보 누출 축이 없으므로 그쪽은 `copiesLeftUndrawn`을
   그대로 쓴다. 두 곳의 기준이 다른 것은 **선택권의 유무** 때문이고, 주석에 적어 두었다.)
- 카드(detail)에 제약을 명시했다: "넉 장이 이미 전부 드러난 종류로는 물들 수 없다".
- 재현 전: `[후] pin3 — 게임 전체 5장`
- 재현 후: `염색 submit ok= false {"reason":"all four copies of that tile are already visible"}` ·
  `[후] pin3 — 게임 전체 4장`
- 테스트: `확정 3: 염색은 패산의 실물과 맞바꾼다 — 장수 분포가 보존된다`,
  `확정 3: 넉 장이 이미 전부 드러난 종류로는 물들 수 없다 (후보에서도 빠진다)`
- 되돌림 확인: 가드를 지우면 후자만 실패, 교환 항목을 지우면 전자만 실패(각각 1 failed).

## 확정 4 🟠 — `void_kan.forgeWait`의 5번째 장 (+ 의심 3 도라 소각)

- 고친 곳: `packages/content/src/augments/void_kan.ts` `forgeWait()`
- 수정:
  - 후보 종류를 `copiesLeftUndrawn(state, k) > 0`인 것만으로 좁혔다
    (`peek_riichi_waits`와 같은 방식 — 공용 자의 "세 번째 자리"가 여기다).
  - ⚠ **깡패 자신(`target`)은 예외로 남겼다 — 의도적이다.** 깡패는 넉 장이 전부 그 깡에
    들어가 있어 `copiesLeftUndrawn`가 **언제나 0**이다. 함께 막으면 «깡패로 단기를
    만든다»가 통째로 죽는데, **자패 안깡에는 그 길밖에 없다** — 카드의 본체("그 깡패가
    내 오름패가 되도록 손을 맞춘다")가 성립하지 않게 된다. 실제로 기존 회귀
    (`new_52_c.test.ts` 안깡 위조 2건 · `rule_holes_0808.test.ts` 기준선 2건)가 전부
    그 경로를 굳혀 두고 있다. 확정 4가 지목한 피해는 **깡패와 무관한 종류**(홀더의
    원래 대기 등)를 소진된 채 위조하는 쪽이었고, 그건 필터가 정확히 막는다.
    → **남는 것**: 깡패 자신은 화료 공개에서 다섯 장으로 보일 수 있다. 카드의 핵심
      메커니즘이라 밸런스/문구 결정 사항으로 남긴다(detail에 적을지 판단 필요).
  - **의심 3 함께 처리**: 재료 루프를 `for (const allowPrecious of [false, true])`로 두 번
    돌려 **도라·적도라(`isPreciousMaterial`)를 먼저 피한다.** 잡패만으로 맞출 수 없을
    때만 도라를 태운다(능력 자체가 죽지 않게). 형제 `tile_split`·`three_dragons_will`과
    같은 판정 함수를 쓴다.
- 재현 전: `[후] sou1 게임 전체 = 5 장` · `p0 손패 … sou1 … sou1`
- 재현 후: `[후] sou1 게임 전체 = 3 장` — 소진된 1삭의 **다섯 번째 장이 사라졌다**
  (내 손의 1삭이 깡패로 바뀌어 오히려 3장이 된다). 대신 유일하게 남은 합법 경로인
  «깡패(1만) 단기»를 채택한다 — 위 ⚠의 의도적 예외.
- 테스트: `확정 4: 넉 장이 이미 다 나온 종류로는 위조하지 않는다`,
  `아직 남아 있는 종류로는 예전처럼 위조한다 (능력이 죽지 않았다)`,
  `의심 3: 다른 잡패로도 맞출 수 있으면 도라를 재료로 태우지 않는다`
- 되돌림 확인: 필터를 되돌리면 확정 4 it 실패, 재료 2패스를 되돌리면 의심 3 it도 함께 실패
  (2 failed).

## 확정 5 🟠 — 이면투시가 아직 안 뒤집힌 도라 표시패 자리를 안 잠근다

- 고친 곳: `packages/content/src/augments/ura_peek.ts` `lockedIndices()`
- 수정: `state.round.doraIndicators`(=이미 뒤집힌 것)를 보던 것을 버리고,
  코어 규약대로 **표시패 블록 전체**(`len - INDICATOR_BLOCK_SIZE` 이상 인덱스 10자리)를
  잠근다. 뒤집혔든 아니든 도라·뒷도라 표시패 자리는 전부 닫힌다.
- 카드(detail)도 실제 동작에 맞췄다: "왕패의 **영상패**와 통째로 맞바꾼다 /
  도라·뒷도라 표시패 자리는 뒤집혔든 아니든 건드릴 수 없다 — 다음 깡 도라를 심을 수는 없다".
- 재현 전: `ura_swap(deadIndex=6) ok= true` → 깡 도라가 홀더가 심은 패
- 재현 후: `ura_swap(deadIndex=6) ok= false {"reason":"cannot swap with an indicator slot"}` ·
  깡 도라 개봉 후 표시패가 원래의 `53:pin5`
- 테스트: `확정 5: 아직 안 뒤집힌 2번째(다음 깡) 도라 표시패 자리와는 바꿀 수 없다`(후보
  열거에서도 빠지는 것까지), `표시패 블록 다섯 쌍이 전부 잠긴다 — 영상패 자리만 남는다`
- 되돌림 확인: 옛 `lockedIndices`로 되돌리면 두 it 모두 실패(2 failed).

---

# 의심 판정

## 의심 1 🟠 `tile_split`·`three_dragons_will`의 5번째 장 → **무죄로 닫는다** (설계 판단)

- 근거: 두 카드가 **생성을 명시한다.**
  - `tile_split` detail: "손패의 수패 한 장을 골라 **두 숫자로 쪼갠다** — 두 숫자의 합이
    원래 숫자가 되고 … 두 번째 조각은 … **그 조각으로 바뀌어 채우므로** 손패 장수는
    변하지 않는다".
  - `three_dragons_will` detail: "부족한 만큼(한두 장)이 손패의 가장 쓸모없는 잡패에서
    **물질화해** 커쯔를 채운다".
- 반면 염색은 "무늬만 바꾼다", 성립하지 않는 깡은 "오름패가 되도록 맞춘다"라 어디에도
  생성이 없다 — 그래서 그 둘만 고쳤다. 브리핑의 판정 기준("문구가 생성을 명시하면 무죄")을
  그대로 적용한 결과다.
- ⚠ 남는 일(담당 밖, 설계 결정): 「conjured 는 5장째를 허용한다」를 **전역 규약으로 문서에
  적을지**가 아직 미정이다. 지금은 증강마다 다르고(막는 쪽: `off_by_one`·
  `peek_riichi_waits`·`void_kan`·`tile_dyeing` / 허용: `tile_split`·`three_dragons_will`·
  `suitUnifyCore` 최후수단), 그 차이가 **카드에 생성이 적혀 있는가**로 정렬돼 있다는 것이
  이번에 확인한 사실이다. 그 규칙을 docs에 한 줄 못 박아 두기를 권한다.

## 의심 2 🟡 `time_pressure` 공용 채널 → **진짜였다. 고쳤다.**

- 코드 확인: `AUGMENT_DISARMED` 리액션이 `p.target === ctx.holder`만 보고 공용 채널
  (`roundViewKey("*", "time_pressure")`)을 무조건 지웠다. 두 명이 들면 한쪽 무장해제로
  둘 다 꺼진다.
- 수정(`time_pressure.ts`): 지우기 전에 **아직 살아 있는 다른 보유자**가 있는지 본다 —
  `armedNow(state, ID, pl.id) && !isSourceDisarmed(state, augmentInstanceId(pl.id, ID))`.
  (이 리액션은 무장해제 목록에 들어가기 **전에** 오므로 나 자신은 명시적으로 뺀다 —
   `disarm.ts` toEvents의 순서 계약.)
- 테스트: `의심 2: 두 명이 들었을 때 한쪽만 잠그면 5초 제한은 남는다`.
  기존 `qa_disrupt_b_0820.test.ts`의 "한 명일 때는 그 자리에서 내려간다"도 그대로 통과한다.
- 되돌림 확인: `stillArmed` 검사를 지우면 새 it이 실패.

## 의심 3 🟡 `void_kan` 도라 재료 소각 → **진짜였다. 확정 4와 함께 고쳤다.** (위 참조)

## 의심 4 🟡 `ura_peek` 영상패 지정 → **진짜지만 지금 구조로는 못 막는다 (재설계 필요)**

- 확인: `deadIndex: 0`은 `sys.drawRinshan`이 뽑는 `deadWallIds(state)[0]`, 즉 **다음 깡의
  영상패**가 맞다. 왕패 전체 시야와 합치면 "내 다음 깡 쯔모를 내가 정한다"가 된다.
- **막지 않았다.** 왕패는 영상패 4 + 표시패 블록 10이 전부다. 확정 5로 표시패 블록을
  전부 잠근 지금, 영상패까지 잠그면 **교환 상대가 하나도 남지 않아 능력이 통째로 죽는다.**
  반쪽으로 index 0만 막는 것도 실효가 거의 없다 — 홀더가 index 1에 심고 깡을 한 번 더
  치면 같은 결과가 되고, 기존 회귀 테스트(`buff_52_cdf.test.ts`가 `deadIndex: 0`을 쓴다)만
  깨진다.
- 그래서 **카드를 실제 동작에 맞추는 쪽**을 택했다(detail에 "왕패의 **영상패**와 통째로
  맞바꾼다"를 명시). 이 축을 정말 닫으려면 교환 상대를 왕패가 아니라 **패산에서 가져오도록
  재설계**해야 한다 — 왕패 장수·표시패 인덱스 불변식을 건드리므로 설계 결정 사항으로 남긴다.
  판단 근거는 `ura_peek.ts` `lockedIndices` 주석에 적어 두었다.

## 의심 5 🟡 `soul_strike` 리치 취소 후 연속 6쯔모 지속 → **진짜였다. 고쳤다.**

- 코드 확인: `isActive`가 국 스코프 플래그만 봤다. `TURN_PASSED` 인터셉터·`TILE_DRAWN`
  리액션이 전부 그 값을 쓰므로, `last_stand`(`cancel_riichi`)·`stealthBreak`로 리치가
  지워져도 여섯 순은 그대로 굴러갔다. 판수 보너스(`addWinHanBonus`)만 이미 라이브 리치를
  함께 보고 있었다 — 같은 판단이 두 곳으로 갈려 있던 것이 원인이다.
- 수정(`soul_strike.ts`):
  - `isActive = flagOf(activeKey) && state.round.byPlayer[h]?.riichi != null` — 판단을
    한 곳으로 합쳤다.
  - 리치가 사라졌는데 플래그가 남아 있으면 정리하는 `"*"` 리액션 추가 — 안 그러면
    이름표에 "남은 6쯔모"가 계속 떠 상대가 아직 폭주 중인 줄 알고 수비한다.
- 테스트: `의심 5: 리치가 사라지면 연속 쯔모 플래그가 그 자리에서 내려간다`
- 되돌림 확인: 라이브 리치 검사 + 정리 리액션을 되돌리면 이 it이 실패.

---

# 검증

```
npx vitest run packages/content/test/qa_aug4_round2.test.ts   → 11 passed
npm run typecheck        (core)     → 통과
npm run typecheck:content           → 통과 (에러 0)
```

- **플레이 스위프 재확인**: `qa-lab/round2/aug-4/sweep.ts 0 1 120` (반장 120판) →
  `crash=0 eff=0 viol=1`. 유일한 위반은 `TURN_RUN [p3 seat=3 run=5]`이고 그 자리의 증강은
  `true_dragon · mixed_triplet · snake_kan · pond_snatch` — **내가 고친 5종과 무관**하고
  (같은 판의 `tile_dyeing` 보유자는 p0다) 깡 연속 쯔모로 순이 이어지는 기존 검출기 특성이다.
  1차 감사에서도 같은 부류(polar_ends·hourglass 연속턴)가 담당 밖으로 분류됐다.
- **`npx vitest run packages/content` 전체 → 157 파일 / 1467 it 전부 통과, 실패 0.**
  (다른 담당자들의 작업이 같은 트리에 있는 상태에서 돌린 결과다.)
  내 수정으로 **한 번 깨졌던 기존 테스트는 전부 원인을 찾아 정리했다**:
  - `tile_dyeing_uses.test.ts`(4 it) — 첫 시안의 가드가 「패산에 실물이 남았는가」
    (숨은 정보)였다. 「보이는 장수」로 바꾸면서 전부 통과. **테스트는 안 고쳤다.**
  - `new_52_c.test.ts`(2) · `rule_holes_0808.test.ts`(2) · `likely55_leftovers.test.ts`(1)
    — void_kan 필터가 «깡패로 단기»까지 막아 버렸다. 깡패 자신을 예외로 두어 통과.
      **테스트는 안 고쳤다.**
  - `batch_0804_new_augments.test.ts`(3) — 리치 없이 폭주 플래그만 세운 하네스라
    의심 5 수정과 충돌했다. **실제 게임에 존재하지 않는 자리**라 하네스 쪽을 고쳤다
    (`running(base, left)` 헬퍼 신설 — 폭주 상태를 만들 때 살아 있는 리치를 함께 세운다).
    이 파일은 다른 담당자의 수정 대상이 아니다(`git status` M 목록에 없다).

## 만진 파일 (전부 aug-4 담당분)

```
packages/content/src/augments/tile_dyeing.ts
packages/content/src/augments/take_back.ts
packages/content/src/augments/void_kan.ts
packages/content/src/augments/ura_peek.ts
packages/content/src/augments/soul_strike.ts
packages/content/src/augments/time_pressure.ts
packages/content/test/qa_aug4_round2.test.ts        (신규)
packages/content/test/batch_0804_new_augments.test.ts  (하네스만 — 위 검증 절 참고)
```

공용 파일(`util.ts`·`index.ts`·`conflictNotes.ts`)과 코어·서버·클라이언트는 건드리지 않았다.
`bluff_pretense.ts`의 `isPreciousMaterial`은 **읽어서 import만** 했다(수정 없음).

## 곁가지 — 담당 밖 후속 (보고서 원문의 지적 포함)

- `alchemist`가 `handAltered`를 안 쓴다(보고서 확정 1의 곁가지). 염색과 같은 기법이라
  같은 가짜 천화 경로가 열려 있을 가능성이 높다 — **담당 밖이라 손대지 않았다.**
  `grep -l handAltered packages/content/src/augments/*.ts` 목록으로 한 번 훑기를 권한다.
- 「conjured 는 5장째를 허용하는가」 전역 규약 문서화 (의심 1).
- `ura_peek` 교환 상대를 패산으로 옮기는 재설계 (의심 4).
