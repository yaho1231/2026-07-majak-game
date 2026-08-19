# qa-lab — 증강 페르소나 플레이테스트 (2026-08-20)

[docs/36_AUGMENT_QA_2026-08-20.md](../docs/36_AUGMENT_QA_2026-08-20.md) 조사의 **도구와 증거**다.
결론은 그 문서에, 재현은 여기에 있다. `packages/` 는 이 조사에서 한 줄도 고치지 않았다.

## 실행

워크트리 루트에서:

```bash
/Users/skul/majak/node_modules/.bin/tsx qa-lab/<경로>.ts
```

> 워크트리라면 먼저 workspace 링크를 만들어야 **이 워크트리의 소스**를 검사한다
> (안 하면 상위 메인 체크아웃의 master를 검사한다 — CLAUDE.md 참고):
> ```bash
> mkdir -p node_modules/@majak
> for p in core content server client; do ln -sfn ../../packages/$p node_modules/@majak/$p; done
> ```

## 하네스 (`harness.ts`)

`HanchanController`를 페르소나 4인으로 완주시키고, 관전자 훅으로 **매 뷰 브로드캐스트마다**
상태 불변식을 검사한다.

```ts
import { PERSONAS, assignPreset, runMatch } from "./harness.js";

const r = await runMatch({
  seed: 7,
  mode: "hanchan",                     // "tonpuu"
  preset: { p0: ["spy", "karma"], p1: [], p2: [], p3: [] },  // 좌석별 강제 증강
  presetHands: { p0: ["man1", "man1"] },                     // 선택: 강제 배패(kindKey)
  personas: { p0: PERSONAS.masher!, p1: ..., p2: ..., p3: ... },
  onRound: (st, phase) => {},          // GameState 직접 관찰
  onState: (st, out) => {},            // 커스텀 불변식
});
// r.crash · r.effectErrors · r.violations · r.actionsTaken · r.finalScores · r.rounds
```

기본 검사: 패 중복·왕패 크기·손패 장수·점수 NaN/거대값·공탁 음수·**점수 총합 드리프트**·
**훅 예외**(`onEffectError` — 격리돼 조용히 삼켜지는 예외는 여기서만 보인다)·소프트락.

페르소나 6종: `masher`(증강광) · `riichiRusher` · `folder`(베타오리) · `caller`(울보) ·
`chaos` · `stall`(지연).

### ⚠ 점수 총합 보존은 이 게임의 불변식이 **아니다**

증강이 없는 점수를 만드는 "뱅크 발행"이 설계로 존재한다(`counter`의 BankTopUp,
`devils_advance`의 가불 10,000 등). 그래서 드리프트는 근거(`augPoints`·`ScoreChanged.reason`)의
**부분합**과 대조해 `SCORE_DRIFT_ATTRIBUTED` / `SCORE_DRIFT_UNEXPLAINED`로 가른다.
초기 버전은 근거 **한 건**과 1:1로만 맞춰 봐서 오탐을 냈다(짝 감사에서 16건 전부 오탐) —
한 정산에 발행이 둘 이상 겹치면(같은 증강을 두 사람이 들면 흔하다) 걸린다. 지금은 부분합이다.

## 파일 지도

| 경로 | 내용 |
|---|---|
| `harness.ts` | 공용 플레이테스트 하네스 |
| `sweep.ts` | 전 카탈로그 광역 스위프(좌석마다 무작위 2증강, 페르소나 혼합) |
| `drift.ts` | 점수 총합 드리프트 직전 이벤트 추적 |
| `findings/*.md` | 도메인별 보고서 16편 — 위치·기대·실제·재현 출력·영향 |
| `hand-a/ hand-b/ score-a/ score-b/ shape/ info/ riichi/ defcall/ disrupt-a/ disrupt-b/ cross/ pairs/ bot/ text/ live/` | 각 담당의 스위프·재현 스크립트 |
| `BRIEF.md` | QA팀에 준 작업 지침(방법·중복 회피·보고 형식) |

`findings/*.md` 안의 각 확정 항목이 자기 재현 스크립트 경로를 적어 두었다.
