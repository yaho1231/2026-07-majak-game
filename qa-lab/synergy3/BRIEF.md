# 증강 **시너지 의미 검증** 브리핑 (2026-08-23, 3라운드)

너는 QA 플레이어다. **버그를 찾는 게 일이고, 고치는 건 내(오케스트레이터) 몫이다.**
**`packages/**` 를 절대 수정하지 마라.** 읽기는 자유. 네 파일은 `qa-lab/synergy3/<너의id>/` 안에만.

## 이번 라운드가 앞 라운드와 다른 점 (중요)

앞 라운드들(`qa-lab/round2/synergy.md`, `qa-lab/findings/pairs.md`)은 **구조 불변식**을 봤다 —
크래시·훅 예외·점수 총합 드리프트·드래프트 편향. 그건 이미 훑었다. **다시 하지 마라.**

이번은 **의미**다:

> **두 증강(때로 셋)의 설명을 읽고 "함께 들면 이런 숫자/동작이 나와야 한다"를 먼저 종이에
> 적은 뒤, 실제로 그 상황을 강제로 만들어 숫자를 재고, 다른지 본다.**

찾는 것의 예:
- **이중 계산** — 같은 보너스가 두 번 얹힌다 (예: 두 증강이 각각 뒷도라를 주는데 합이 4배가 된다)
- **조용한 삼킴** — A가 켜지면 B가 아무 일도 안 하는데 설명 어디에도 그런 말이 없다
- **곱셈/덧셈 순서** — 설명이 "2배"와 "+2판"을 약속하는데 실제 적용 순서가 반대라 결과가 다르다
- **1회 제한의 공유** — 서로 다른 증강인데 잔량·쿨다운 키를 공유해 한쪽을 쓰면 다른 쪽이 죽는다
- **조건 상호 파괴** — A가 리치를 강제하고 B가 멘젠 리치를 금지하는데 둘 다 제시된다
- **설명에 없는 상호작용** — 실제로는 강력한 조합인데 설명만 읽으면 예측 불가능
- **공개/은닉 모순** — 한쪽이 "전원에게 공개", 다른 쪽이 "숨긴다" → 실제 뷰는 어느 쪽인가
  (관전자 뷰·상대 뷰를 반드시 확인해라)

## 도구 (둘 다 써라 — 유닛이 빠르고 확실하다)

### A. 유닛 재현 (권장 · 1차 도구)
`packages/content/test/helpers.ts`의 `craft()` + `createStandardGameFromState` + `installAugment`
로 **원하는 손패·버림패·멜드를 가진 판을 직접 조립**하고, 증강 2~3개를 같은 좌석(또는 다른 좌석)에
심은 뒤 이벤트를 태워 점수를 잰다. 본보기: `packages/content/test/discard_lock_hand_swap.test.ts`,
`packages/content/test/giant_god.test.ts`.

너의 스크립트는 `qa-lab/synergy3/<너의id>/*.ts` 에 두고 tsx로 돌린다:
```bash
~/majak/node_modules/.bin/tsx qa-lab/synergy3/<너의id>/x.ts
```
(vitest로 돌려도 된다: `npx vitest run <파일>` — 단 테스트 파일을 `packages/` 안에 만들지 마라.)

**중요한 대조군 방법**: 같은 장면을 (증강 없음) / (A만) / (B만) / (A+B) 네 번 돌려 점수를
표로 찍어라. "A+B가 A와 B의 합/곱과 다른가"가 곧 시너지 버그의 신호다.

### B. 실게임 하네스
`qa-lab/harness.ts`의 `runMatch({ seed, mode, preset, presetHands, personas, onRound, onState })`.
좌석별로 증강을 강제 지급한다. 사용법은 `qa-lab/BRIEF.md`·`qa-lab/README.md`.
유닛으로 확인한 것을 **실게임에서도 재현되는지** 확인할 때 쓴다. 느리므로 남발하지 마라
(반장전 1판 = 10~90초). 조합당 시드 몇 개면 충분하다.

> 워크트리 링크는 이미 만들어져 있다. 없다면:
> `mkdir -p node_modules/@majak && for p in core content server client; do ln -sfn ../../packages/$p node_modules/@majak/$p; done`

## 자료

- `qa-lab/synergy3/catalog.tsv` — `id \t 이름 \t 티어 \t description \t detail` (113종)
- 소스: `packages/content/src/augments/<id>.ts` · 공용 헬퍼 `packages/content/src/util.ts`
- 시너지 축 표: `packages/core/src/augment/synergy.ts`
- 정산 단계·우선순위: `packages/core/src/augment/settleStages.ts`
- 설계 문서: `docs/10_AUGMENT_SYSTEM.md` · `docs/17_AUGMENT_BALANCE.md` · `docs/26_AUGMENT_SYNERGY.md`

## 이미 알려진 것 — 다시 보고하지 마라

`qa-lab/round2/synergy.md`, `qa-lab/findings/*.md`, `qa-lab/verdicts/*.md`,
`docs/21_AUGMENT_PAIR_AUDIT.md`, `docs/22`, `docs/25`, `docs/36`, `docs/37`, `docs/39` 에 적힌 것.
특히: 배율 연쇄(let_it_ride×jackpot×blood_contract) · devils_advance 드리프트 ·
seat_swap 정산 순서 · conflicts↔synergy 표 모순 · 폴백 중복 보유.
**보고 전에 반드시 `grep -ri "<증강id>" qa-lab/ docs/` 로 겹치는지 확인해라.**

## 방법 (순서)

1. 담당 축의 증강 소스와 설명/상세를 **전부** 읽는다.
2. 조합 후보를 **직접 고른다** — "설명만 보면 강하게 겹칠 것 같은" 쌍·삼중을 20~40개 뽑아라.
   실제 드래프트에서 함께 뜰 수 있는지(`conflicts` 아닌지)를 먼저 확인해라. conflicts면
   같이 못 드니 검증 대상이 아니다(단, 그 conflicts가 **누락**된 위험 쌍을 찾는 건 유효한 발견이다).
3. 조합마다 **기대값을 먼저 글로 쓴다.** 그 다음에 돌린다. (반대로 하면 결과에 설명을 맞추게 된다.)
4. 다르면 **최소 재현**을 만든다 — 대조군 4칸 표 또는 시드+preset.
5. 확정 못 한 것은 "의심"으로 분리한다. **추측을 확정처럼 쓰지 마라.**

## 보고 — `qa-lab/synergy3/<너의id>.md`

```
# <축 이름> — <너의id>

## 요약
검증한 조합 수 / 확정 N건 · 의심 M건 / 음성 확인 K건

## 확정 1. 🔴|🟠|🟡 <a> × <b> — 한 줄 요약
- 위치: packages/content/src/augments/x.ts:123
- 설명이 약속한 것: (원문 인용)
- 기대: (내가 미리 적은 숫자)
- 실제: (측정한 숫자 · 대조군 표)
- 재현: tsx qa-lab/synergy3/<id>/repro_x.ts
- 영향: (플레이어가 실제로 겪는가 · 얼마나 자주 함께 뜨는가)
- 제안 수정: (한두 줄)

## 음성 확인 (돌려 봤고 깨끗했다)
| 조합 | 기대 | 실제 | 판정 |
```

심각도: 🔴 게임이 부서짐/점수가 크게 틀림 · 🟠 설명과 명백히 다름 · 🟡 문구·미세 오차.

**마지막에 반드시 `## 음성 확인` 표를 채워라** — 무엇을 봤는데 멀쩡했는지가 다음 라운드의 자산이다.
