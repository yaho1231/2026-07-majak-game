# 증강 QA 플레이테스트 브리핑 (2026-08-19)

너는 **QA 플레이어**다. 목표는 **버그를 찾는 것**이지 고치는 게 아니다.
**절대 소스(packages/**)를 수정하지 마라.** 읽기는 자유. 네 작업 파일은 `qa-lab/` 안에만 만든다.

## 하네스

`qa-lab/harness.ts` — 실제 반장전/동풍전을 페르소나 에이전트로 완주시킨다.

```ts
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch } from "./harness.js"; // 경로는 네 파일 위치에 맞춰라

const r = await runMatch({
  seed: 7,
  mode: "hanchan",                       // 또는 "tonpuu"
  preset: { p0: ["spy","karma"], p1: [...], p2: [...], p3: [...] },  // 좌석별 강제 증강
  presetHands: { p0: ["man1","man1",...] },  // 선택: 강제 배패(kindKey)
  personas: { p0: PERSONAS.masher!, p1: ..., p2: ..., p3: ... },
  onRound: (st, phase) => {...},         // GameState 직접 관찰
  onState: (st, out) => {...},           // 매 뷰 브로드캐스트마다 커스텀 검사
});
// r.crash, r.effectErrors, r.violations, r.actionsTaken, r.finalScores, r.rounds
```

실행: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/<너의폴더>/x.ts`
(워크트리 루트에서 실행. `npm test`도 쓸 수 있다: `npx vitest run <파일>`)

기본 불변식(harness의 `checkState`)이 이미 검사하는 것: 패 중복, 왕패 초과, 손패 장수 이상,
점수 NaN/소수/거대값, **점수 총합 드리프트(점수 창조/소멸)**, 공탁·본장 음수.
`r.effectErrors`는 **훅에서 던져져 조용히 삼켜진 예외**다 — 나오면 그 자체로 버그다.

네 도메인에 맞는 **불변식을 직접 추가**해라(onState/onRound에서). 그게 이 QA의 핵심이다.

## 방법 (권장 순서)

1. 담당 증강의 소스(`packages/content/src/augments/<id>.ts`)와 `description`/`detail` 문구를 읽는다.
2. **설명이 약속하는 것**을 불변식/기대값으로 바꾼다 (예: "1회만", "리치 중엔 불가", "상대에게 공개되지 않는다").
3. 그 증강을 강제 지급하고 수십~수백 판 돌린다. 페르소나를 바꿔 가며(masher/folder/caller/riichiRusher/stall) 돌린다.
4. 이상 징후가 보이면 **최소 재현**(시드 + preset + presetHands)을 만들어 확정한다.
5. 확정 못 한 것은 "의심"으로 분리해 적는다. **추측을 확정처럼 쓰지 마라.**

## 이미 알려진 것 — 다시 보고하지 마라

`docs/21_AUGMENT_PAIR_AUDIT.md`, `22_AUGMENT_ERROR_AUDIT.md`, `24_AUGMENT_LIVE_TEST.md`,
`25_AUGMENT_QA_AUDIT_2026-08.md`, `28_QA_PREDEPLOY_2026-08-08.md`, `30_QA_PLAYER_INFO_2026-08-17.md`,
`34_QA_LAYOUT_2026-08-18.md` 에 적힌 항목. 보고 전에 해당 문서를 grep 해서 겹치지 않는지 확인해라.
특히 이미 기록된 것: seat_swap×리치, spy 더블론, reload boolean 플래그, three_dragons_will 설명,
open_kokushi 소프트락, broken_border 클라 desync, frame_up 후로 크래시, table_flip×take_back.

## 보고 형식 — `qa-lab/findings/<너의id>.md`

```
# <도메인> — <페르소나 이름>

## 요약
돌린 판 수 / 증강 커버리지 / 확정 N건 · 의심 M건

## 확정 1. 🔴|🟠|🟡 <증강id> — 한 줄 요약
- 위치: packages/content/src/augments/x.ts:123
- 기대: (설명/detail이 약속하는 것)
- 실제: (관측된 것)
- 재현: `tsx qa-lab/<폴더>/repro_x.ts` — seed=…, preset=…, 출력 발췌
- 영향: 게임이 죽는가/점수가 틀리는가/정보가 새는가/설명과 다른가

## 의심 1. …  (재현 실패 사유 명시)
```

재현 스크립트는 반드시 남겨라. 마지막 답변에는 **확정 건의 한 줄 목록**만 요약해서 돌려준다.
