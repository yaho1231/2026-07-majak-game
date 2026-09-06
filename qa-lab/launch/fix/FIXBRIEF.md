# 수정 웨이브 브리핑 — 평가점수 재선정 + 봇 전략 (2026-08-28)

사용자 지시(원문 요지):
> P0~P1에서 **밸런스가 달라지는 증강의 실제 기능 수정은 하지 말고**, 내부 평가점수
> 재선정 같은 것만 진행해라. 무엇을 바꿨는지 총정리해서 문서로 알려 달라.
> 그리고 **봇이 더 많은 증강을 쓸 수 있도록**, 전략이 없는 것은 증강별 전략을 짜고,
> 전략 작성 당시와 기능이 달라진 것은 그에 맞게 전략을 다시 세워라.

## 절대 하지 않는 것 (위반 시 되돌린다)
- **증강의 효과·수치·조건을 바꾸지 마라.** 배율, 점수, 임계값, 발동 조건, 지속 시간,
  대상 수 — 전부 그대로 둔다. 밸런스가 이상하다는 실측이 있어도 **이번 웨이브에서는
  고치지 않는다.** 그건 다음 결정 사항이다.
- `packages/core/src/engine/`, 룰 엔진, 정산 로직에 손대지 마라.

## 해도 되는 것
- `powerTier.ts`의 **평가축 점수(p·s·u·f)·shift·사유 문구** 재선정
- `docs/20`(파워 티어), `docs/27`(봇 플레이북) 문서 갱신
- **봇 정책**(`bot:` 필드, `botPlan.ts`, `botHelpers.ts`) 신설·수정 —
  봇 정책은 증강의 기능이 아니라 «봇이 그 증강을 어떻게 쓰는가»다. 이건 지시받은 작업이다.

## 근거는 실측이다
이번 라운드 보고서를 근거로 쓴다. 특히 [balance.md](../balance.md) — 반장 1,500판 +
동풍 1,800판 실측, 원자료 `qa-lab/launch/balance/*.json|csv`.
「내 느낌에 세 보인다」는 근거가 아니다. **표본 수를 함께 인용해라.**
balance.md가 「표본 부족·판단 보류」로 분류한 증강은 **건드리지 마라.**

## 게이트 (필수)
작업 후 반드시 통과해야 한다. 특히 `powerTier`는 전용 일관성 테스트가 있다:
```
npx vitest run packages/content/test/power_tier_consistency.test.ts
npx vitest run packages/content/test/bot_policy_coverage.test.ts packages/content/test/bot_policy_unusable.test.ts
```
전체 게이트(`npm test` + 타입체크 4종)는 **취합 담당(Opus)이 마지막에 한 번** 돌린다.
너는 네가 건드린 영역의 테스트만 돌려서 초록인지 확인해라.

## 보고
`qa-lab/launch/fix/<담당>.md` 에 **바꾼 것을 표로** 적어라:
`대상 | 이전 | 이후 | 근거(실측 수치·표본) | 파일:줄`
바꾸지 않기로 한 것과 그 이유도 적어라 — 그게 다음 판단의 근거가 된다.

## 파일 소유권 (겹치면 서로 덮어쓴다 — 엄수)
- `tier` 담당 : `packages/core/src/augment/powerTier.ts`, `docs/20_AUGMENT_POWER_TIER.md`
- `botnew` 담당 : `packages/content/src/augments/hand_swap3.ts`, `frame_up.ts`,
  `packages/content/src/augments/botHelpers.ts`, `packages/content/test/bot_policy_unusable.test.ts`
- `botfix` 담당 : 그 외 증강 파일의 `bot:` 필드, `packages/content/src/augments/botPlan.ts`
- `docs/27_AUGMENT_BOT_PLAYBOOK.md` 는 **botnew·botfix 둘 다 필요**하다 →
  각자 자기 절만 추가하고, **다른 담당의 절을 지우거나 파일 전체를 재작성하지 마라.**
  편집 전 반드시 다시 읽어라(그 사이 상대가 썼을 수 있다).

## 환경
- 워크트리 루트에서 작업. `node_modules/@majak/*` 링크 걸려 있음.
- tsx: `~/majak/node_modules/.bin/tsx`
- ⚠ `pkill -f` 금지(PID 로만). 공개 서버 PID 40070(포트 3011) 금지.
- ⚠ `git checkout -- ` · `git restore` · `git stash` 금지.
- 재위임 금지 — Agent/Task 도구를 쓰지 마라. 직접 한다.
