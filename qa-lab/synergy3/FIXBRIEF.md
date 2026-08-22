# 시너지 결함 수정 브리핑 (2026-08-23, 3라운드 수정 단계)

너는 이제 **수정자**다. QA가 확정한 결함을 **실제로 고치고 회귀 테스트를 남긴다.**

## 규칙

1. **네 담당 결함만 고친다.** 다른 축의 파일은 건드리지 마라 — 여러 명이 동시에 고치고 있다.
2. **이미 다른 사람이 고친 파일은 손대지 마라** (오케스트레이터가 수정 중):
   `packages/content/src/util.ts` · `packages/core/src/augment/settleStages.ts` ·
   `packages/core/src/mahjong/scoring/score.ts` · `packages/core/src/mahjong/flow/standardActions.ts` ·
   `packages/core/src/augment/standardAugments.ts` ·
   `augments/{blame_shift,blind_ron,spy,die_hard,big_hand,aotenjou_ceiling,seat_swap}.ts`
   그 파일을 꼭 고쳐야만 결함이 닫힌다면 **고치지 말고 보고서에 그렇게 적어라.**
3. **회귀 테스트를 반드시 남긴다** — `packages/content/test/<너의id>_synergy_0823.test.ts` 한 파일에 모아라.
   테스트는 **수정 전에는 실패하고 수정 후에 통과해야 한다.** 수정을 잠깐 되돌려서
   실제로 실패하는지 확인해라(빈 테스트를 만들지 마라).
4. 검증: `npm run typecheck && npm run typecheck:content` 은 반드시 0이어야 한다.
   그리고 **네가 고친 증강 id를 언급하는 기존 테스트 파일 전부**를 돌려라:
   `npx vitest run $(grep -rln "<augid>" packages/content/test packages/core/test | tr '\n' ' ')`
   깨진 기존 테스트가 있으면 **왜 깨졌는지 판단**해라 — 옛 기대가 결함을 굳혀 놓은 것이면
   테스트를 고치고 그 이유를 주석에 남긴다. 그게 아니면 네 수정이 틀린 것이다.
5. 이 저장소의 주석 문화를 따라라 — **한국어**로, "왜 이렇게 됐는지"의 역사를 남긴다.
   기존 파일들의 주석 밀도·어투를 그대로 흉내 내라. 날짜는 2026-08-23,
   출처는 `QA synergy3 <축> 확정 N`.
6. 카드 문구(`description`/`detail`)가 실제 동작과 다른 것이 결함의 본질이면
   **문구를 고치는 것도 정당한 수정**이다. 다만 문구는 짧게 — 최근 커밋
   `docs(augment): 증강 설명을 읽을 수 있는 길이로 줄인다`의 방침을 지켜라.
7. 설계 판단이 필요해 함부로 못 고치는 것은 **고치지 말고 보고**해라. 추측으로 밸런스를 바꾸지 마라.

## 참고

- 원 보고서: `qa-lab/synergy3/<축>.md` — 위치·기대·실제·재현 스크립트가 다 적혀 있다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/synergy3/<축>/<파일>.ts`
- 유닛 테스트 본보기: `packages/content/test/settle_synergy_0823.test.ts`(오케스트레이터가 방금 쓴 것),
  `packages/content/test/discard_lock_hand_swap.test.ts`, `packages/content/test/helpers.ts`.

## 보고

최종 응답에 항목별로 **고쳤다 / 안 고쳤다(이유) / 문구만 고쳤다** 를 한 줄씩. 그리고
테스트 파일 경로와 `npx vitest run` 결과, 타입체크 결과를 적어라.
