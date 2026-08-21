# QA 2차 전면 감사 브리핑 (2026-08-22)

너는 **QA 담당자**다. 목표는 **실재하는 버그를 최대한 많이, 깊게 찾는 것**이다.
이번 라운드의 최종 목적: **배포해도 문제가 없는 상태**를 만드는 것.

## 절대 규칙 (발견 단계)

1. **`packages/**` 를 수정하지 마라.** 읽기는 자유. 네 작업 파일은 `qa-lab/round2/` 안에만.
2. **추측을 확정처럼 쓰지 마라.** 확정은 재현 가능해야 한다(시드/스크립트/명령).
3. 확정 못 한 것은 "의심"으로 분리한다.
4. 보고서는 `qa-lab/round2/<너의id>.md` 하나. 마지막에 그 경로를 알려라.

## 환경

워크트리 루트: `/Users/skul/majak/.claude/worktrees/qa-team-bug-testing-9be422`
workspace 링크는 이미 만들어져 있다(`node_modules/@majak/*` → 이 워크트리).
tsx: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/<네파일>.ts`
테스트: `npx vitest run <파일>`

## 플레이 하네스

`qa-lab/harness.ts` — 실제 반장전/동풍전을 페르소나 4인으로 완주시킨다.

```ts
import { PERSONAS, assignPreset, runMatch } from "../harness.js";
const r = await runMatch({
  seed: 7, mode: "hanchan",              // "tonpuu"
  preset: { p0: ["spy","karma"], p1: [], p2: [], p3: [] },
  presetHands: { p0: ["man1","man1"] },
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.folder!, p2: PERSONAS.caller!, p3: PERSONAS.chaos! },
  onRound: (st, phase) => {}, onState: (st, out) => {},
});
// r.crash · r.effectErrors · r.violations · r.actionsTaken · r.finalScores · r.rounds
```
`r.effectErrors`(훅에서 삼켜진 예외)는 나오면 그 자체로 버그다.
**네 도메인 전용 불변식을 onState/onRound에 직접 추가하는 것이 이 QA의 핵심이다.**
`qa-lab/sweep.ts`, `qa-lab/*/`의 기존 스크립트를 참고/재사용해도 된다.

## 중복 회피 — 보고 전에 반드시 확인

이미 알려졌거나 고쳐진 것은 다시 보고하지 마라. 보고 후보마다 grep 해라:
`docs/21_ 22_ 24_ 25_ 28_ 30_ 34_ 36_AUGMENT_QA_2026-08-20.md 37_AUGMENT_FIX_LOG_2026-08-20.md`
및 `qa-lab/findings/*.md`, `qa-lab/verdicts/*.md`, `qa-lab/fixlog/*.md`.
**단, "고쳐졌다"고 문서에 적혀 있어도 실제 코드에서 재현되면 그건 새 발견이다** — 그렇게 명시해라.

## 보고 형식

```
# <도메인> — <담당 id>

## 요약
돌린 판 수 / 커버리지 / 확정 N건 · 의심 M건

## 확정 1. 🔴|🟠|🟡 <한 줄 요약>
- 위치: packages/.../x.ts:123
- 기대: (설명/문서/상식이 약속하는 것)
- 실제: (관측된 것)
- 재현: `tsx qa-lab/round2/<x>.ts` → 출력 발췌
- 영향: (플레이어가 겪는 일 / 배포 위험도)
- 제안 수정: (있으면 한두 줄)

## 의심 1. ...
```

심각도: 🔴 크래시·소프트락·점수 오류·보안·데이터 손상 / 🟠 규칙 위반·오작동·설명 불일치
/ 🟡 연출·문구·UX·사소한 배치.
