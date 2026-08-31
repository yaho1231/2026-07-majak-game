# 49_SYNERGY4_FIX_PLAN — 4라운드 결함 수정 계획 (2026-08-31)

조사 결과는 [48_AUGMENT_SYNERGY_QA_2026-08-31.md](48_AUGMENT_SYNERGY_QA_2026-08-31.md).
사용자 결정으로 **의도된 동작**으로 확정돼 고치지 않는 것부터 적는다.

## 고치지 않는다 (사용자 결정)
- **B-1 «만든 패»가 패산으로 돌아가 종류별 4장을 넘는 것** — 보라색 이펙트로 구분되므로 문제 아님.
- **B-2 염색×연금술의 리치 중 버림패 선택** — 의도. 리치 중 위험패를 증강으로 피하게 하는 설계.
- **B-4 `push_riichi` × `soul_hunt` 강제 리치 강탈** — 의도.
- **C-5 `push_riichi` × `peek_riichi_waits`** — B-4와 같은 결. 의도로 간주.

## 사양 변경 (사용자 지시)
- **짝수의 세계**: 예외를 전부 없앤다. 도라인 홀수 패도, 적도라(빨간 5)도 **전부 짝수로 바뀐다.**
  자패만 불변(수패가 아니므로). 카드 설명·detail도 함께 고친다.

## 결정 사항
- **배수 계열**: 순수 배수(`jackpot`·`let_it_ride`·`blood_contract`)는 **서로 `conflicts`**.
  «한계 해제» 계열(`aotenjou`·`big_hand`)은 `antiIds`로 확률만 크게 낮춘다.
  더불어 **밑값 규약을 원본 화료점 고정으로 통일**해 겹쳐도 폭발하지 않게 한다.
- **봇 두 건(A-13·A-14) 이번에 포함.**
- **리치 선언 5종(C-6)**: `conflicts`로 잠그지 않고 **카드 설명에 명시**한다.
- **C-3 거울 × 가려진 도라**: 거울이 은폐를 못 뚫도록 **구현을 고친다**.

---

# 작업 묶음

각 묶음은 파일이 겹치지 않게 갈랐다. 묶음마다 **되돌리면 실패하는 회귀 테스트**를 함께 넣는다.

## 1. 타점 규약 통일
`jackpot.ts` · `counter.ts` · `util.ts(addWinPointBonus/winPointsWithExtraHan)` · `soul_strike`
- A-1·A-2·B-6: `jackpot`의 밑값을 현재 델타 → **원본 화료점**으로. 본장 취급도 형제와 통일.
- A-3·C-7: 밴드 차액 방식의 «+N판»을 실제 `extraHan` 경로로 옮겨 판수 상승분이 흡수되지 않게.
- A-4: `counter`가 `winPointsWithExtraHan`에 `hanSoFar`를 넘기게.
- B-7: 환산액이 0이어도 판수 표식(augPoint)을 남기게.

## 2. 정산 순서·손익 계열
`die_hard.ts` · `sign_flip.ts` · `karma.ts` · `devils_advance.ts` · `blame_shift.ts` · `settleStages.ts`
- A-8: `sign_flip`이 부호를 뒤집은 뒤 `die_hard`가 그걸 손실로 읽지 않게(원본 부호 기준 판정).
- A-9: `karma`가 인터셉터 이전의 «원래 잃은 값»을 보게.
- A-10: `sign_flip`에도 `die_hard`와 같은 뱅크 발행 상한.
- A-12: `devils_advance` × `sign_flip`의 픽 순서 의존 제거(결정적 순서 부여).
- B-8: `blame_shift`의 `Reassert`가 가불 상환분을 재분배하지 않게.

## 3. 쯔모·손패 술어 정리
`giant_god.ts` · `conjure_draw.ts` · `triple_peek`(예지) · `time_stop.ts` · `even_world.ts`
- A-11: 쯔모 변형 카드가 서로를 보는 **공통 술어**를 만든다(`haiteiLordWaits`를 일반화).
- B-11: 예지가 그 술어를 함께 읽어 예약 중엔 예고하지 않게.
- B-5: `time_stop`의 «적용됐다» 판정을 상태가 아니라 자기 인터셉터의 실제 변경으로.
- 짝수의 세계 사양 변경.

## 4. 다중 보유 면제 술어
`dora_conceal.ts` · `mirror_dora.ts` · `disarm.ts` · `client/App.tsx`
- B-10: 안개의 `fogCasterNow` 패턴을 올려 **보유자 누구든 면제**되게(공통 헬퍼).
- C-3: 거울이 은폐 중에는 표시패를 못 받게.
- C-2: `disarm` 다중 보유 시 해제 목록을 덮어쓰지 않게.
- C-4: 왕패 모달의 `flipped` 계산이 은폐에 흔들리지 않게.

## 5. 코어 화료형
`core/src/mahjong/scoring/WinContext.ts`
- A-5: 혼색 머리를 두 kind 전부로 견주도록 `buildVariants` 수정 + 회귀.

## 6. 봇
`content/augments/frame_up.ts` · `server/src/bot/*`
- A-0: 정책이 **자기 액션이 아닌 선택지**를 반환하지 못하게(`hand_swap3` 수정과 같은 모양).
- A-13: 샹텐 계산이 형 완화 옵션을 읽게.
- A-14: 봇이 자기 정보 증강의 `augmentData`를 읽게.

## 7. 좌석·오야·자원
`seat_swap.ts` · `pseudo_dealer` · `grave_rob.ts` · `reload`
- B-3: 자리바꿈이 `silent` 표식을 넘기지 않게.
- B-12: 오야 강탈 후 자리바꿈에서 오야가 상대에게 가지 않게.
- B-9: `robWins()`가 `win.minHan`을 보게.
- C-1: `reload`가 `keeps:` 카운터도 인정하게.

## 8. 리치
`open_riichi_reveal.ts` · 리치 선언 5종 설명
- A-6: 오픈 리치의 «3판 취급»이 다른 판수 증강과 함께여도 실리게.
- A-7: 봉인이 자기 오픈 리치의 역만 게이트를 막지 않게 + 시너지 표 anti.
- C-6: 선언 5종 설명에 «국당 하나만» 명시.

## 9. 드래프트 표 · 문서 (메인 세션)
`core/src/augment/synergy.ts` · 카드 `conflicts` · 주석 정정
- 배수 3종 conflicts, 천장 계열 antiIds, B-13(`no_ron_pact`×`ankan_dora`), A-7 anti.
- `blood_contract.ts:103` 주석, `mirror_dora.ts` 주석 정정.

## 게이트
전 묶음 병합 후 `npm test` + 타입체크 4종. 실패 시 병합 금지.
