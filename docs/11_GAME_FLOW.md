# 11_GAME_FLOW
Version : 1.0
Status : Active
Last Updated : 2026-07-15

국의 진행: 페이즈 전이, 표준 액션, 후로 우선순위, 화료·유국 정산.
구현: `packages/core/src/mahjong/flow/`

---

# 1. 페이즈 전이 (Issue 003 해결)

phase는 열린 문자열이고, 전이는 **이벤트의 Reducer가 데이터로 기록**한다.
FlowController는 "지금 페이즈에서 무엇을 해야 하는가"만 알고,
게임 규칙은 전부 Action validate와 Rule에 있다.

```
setup ──RoundStarted──▶ turn.draw ──TileDrawn──▶ turn.act
  ▲                        │(패산 소진)              │
  │                        ▼                        │ TileDiscarded
  │                   RoundSettled(유국)            ▼
  │                        │                    reaction ──CallMade──▶ turn.act
  │                        ▼                        │ (전원 패스) TurnPassed
  └─(다음 국)─────────  round.over  ◀─RoundSettled──┤                → turn.draw
                                     (화료/유국/유산)
```

- Prism 증강이 새 페이즈를 넣으려면: 새 이벤트+Reducer로 phase를 바꾸고,
  그 phase에서의 행동을 ActionDef로 등록하면 된다. 엔진·Flow 수정 없음.

---

# 2. FlowController — 결정 수집기

Flow는 **동기 상태 기계**다. 사람(비동기 소켓)과 봇(동기)이 같은 API를 쓴다.

```ts
flow.begin()                    → FlowStatus   // 자동 페이즈를 끝까지 진행
flow.submit(player, option)     → FlowStatus   // 결정 하나 반영
// FlowStatus = { kind:"awaiting", prompts } | { kind:"roundOver", outcome }
```

- **프롬프트는 ActionDef.validate에서 유도된다** — 합법인 선택지만 나열되고,
  submit 시에도 다시 검증된다 (진실은 언제나 validate — Server Authority).
- reaction에서는 프롬프트된 전원의 결정을 모은 뒤 한 번에 해소한다:
  **론 > 펑 > 치 > 패스**. 실제 옵션이 패스뿐인 플레이어는 프롬프트조차 받지 않는다
  (자동 패스 — 트래픽·대기 절약).
- 턴 쪽의 쌍둥이 규칙: **리치로 손이 잠겨 선택지가 쯔모기리 하나뿐이면**
  프롬프트에 `auto: true`가 붙는다. 안깡·쯔모·리치 취소(승부수 등 증강) 같은
  수가 하나라도 있으면 붙지 않는다. 진행부(HanchanController)는 auto 프롬프트를
  에이전트에게 묻지 않고 대신 두므로, 사람은 매 순 같은 패를 다시 클릭하지 않는다.
  화면에서 그 한 수가 앞 사람의 버림에 묻히지 않도록 `autoMoveDelayMs`만큼 쉰 뒤
  둔다(실서버 450ms, 테스트·봇 게임 0). 규칙 판정은 그대로다 — 옵션은 유일한
  합법 수이고, 직접 submit해도 결과는 같다.
- 시스템 액션(`sys.*`)은 `__system` 플레이어 전용이다. 서버(12)는 클라이언트가
  보낸 액션 type을 화이트리스트로 거른다.

---

# 3. 표준 액션 (06의 표 구현)

| 액션 | 페이즈 | 검증 요점 |
|------|--------|-----------|
| discard | turn.act | 내 턴, 손패 소유, **리치 후엔 쯔모패만** |
| riichi | turn.act | 멘젠, 미리치, 점수≥`riichi.cost`, 패산≥4, 버린 후 텐파이 |
| win (쯔모/론) | turn.act / reaction | evaluateWin ok (역 1+), **론은 후리텐 검사**, 가깡 직후 창깡 가능 |
| pon | reaction | 같은 kind 2장, `call.pon.enabled`, 리치 중 불가 |
| chi | reaction | **상가의 버림만**, 슌쯔 성립, `call.chi.enabled`, 리치 중 불가 |
| ankan | turn.act | 같은 kind 4장, 리치 중에는 마지막 쯔모패 포함 + 대기 불변일 때만 |
| minkan | reaction | 버림패와 같은 kind 3장, 리치 중 불가 |
| shouminkan | turn.act | 기존 pon에 같은 kind 1장 추가, 창깡 reaction 후 영상쯔모 |
| kyushuKyuhai | turn.act | 첫 순위 유지 중, 요구패 9종 이상 |
| pass | reaction | 항상 가능 (Flow가 처리, 이벤트 없음) |

시스템: `sys.startRound / sys.draw / sys.drawRinshan / sys.flipDora / sys.advanceTurn / sys.settleWin / sys.settleDraw / sys.settleAbort`

## 흐름 이벤트와 Reducer

| 이벤트 | 상태 변화 |
|--------|-----------|
| RoundStarted | setupRound (셔플·배패·도라, PRNG 전진) |
| TileDrawn | wall→hand, lastDrawnTile, 친이면 순+1, → turn.act |
| TileDiscarded | hand→discards, 리치 처리(공탁·더블·일발), lastDiscard, → reaction |
| CallMade | 버림패+손패→melds, 턴 이동, **전원 일발 소멸·첫바퀴 종료**, → turn.act |
| KanDeclared | 손패/버림패→melds, 깡 횟수·선언자 기록, 일발 소멸, 대명깡/안깡 → turn.draw, 가깡 → reaction |
| DoraFlipped | 새 도라 표시패 추가 |
| TurnPassed | 다음 자리, → turn.draw |
| WinDeclared | 상태 변화 없음 (기록·Effect 훅용) |
| RoundSettled | 점수 이동, 친·본장·공탁·국 갱신, → round.over |

---

# 4. 정산 규칙 (01 §5·§7 구현)

- **화료**: evaluateWin(뒷도라 포함) → calculateScore. 본장: 론 +300(방총자),
  쯔모 +100씩. 공탁은 첫 화료자(더블론 시 방총자 하가 우선)가 전액.
  친 화료 = 연친+본장+1 / 자 화료 = 친 이동+본장 0.
- **황패유국**: 텐파이 공개(winningKinds로 판정), 노텐 벌부 3000을
  텐파이 인원 비율로 분배. 친 텐파이면 연친. 본장+1, 공탁 이월.
- **트리플론**: 유산국 처리 (본장+1, 공탁 이월, 친 유지).
- **도중유국**: 구종구패(선택), 사풍연타, 사깡유국(2인 이상 4깡),
  사인리치, 트리플론을 `sys.settleAbort`로 처리한다.
- **깡**: 대명깡/가깡/안깡을 지원한다. 기본 룰은 깡 후 새로운 도라를 공개하고
  영상패를 쯔모한다. `dora.kanTiming = "afterDiscard"` 변형에서는 새로운 도라를
  예약했다가 깡 후 첫 버림 뒤 공개한다. 가깡은 창깡 reaction을 먼저 열고,
  전원 패스 시 영상패로 진행한다. 안깡 창깡은 국사무쌍에 한해 허용한다.
- **더블 리치**: 첫 버림 && 후로 없음. **일발**: 리치 후 자기 다음 버림 전까지,
  후로 발생 시 소멸. **후리텐**: 자기 버림패에 대기패가 있으면 론 불가.
  론 가능한 패를 넘기면 일시 후리텐이 붙고 다음 자기 쯔모 때 해제된다.
  리치 중 론 가능한 패를 넘기면 리치 후리텐으로 국 끝까지 론 불가다.

---

# 5. 이번 버전에서 뺀 것 (다음 콘텐츠 단계)

| 항목 | 이유 · 추가 방법 |
|------|------------------|
| 깡 도라 타이밍 세부 모드 추가 | 현재 `beforeRinshan`/`afterDiscard` 지원. 대회별 세부 차이는 Rule 값 추가로 확장 |
| 후리텐 UI 문구 현지화 | 판정·사유는 구현됨. 클라이언트 표시 문구는 UI 단계에서 결정 |
