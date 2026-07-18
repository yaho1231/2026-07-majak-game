# 02_CORE_ENGINE
Version : 1.0
Status : Active
Last Updated : 2026-07-15

GameEngine — 파이프라인 전체를 하나로 꿰는 실행기.
구현: `packages/core/src/engine/GameEngine.ts`

---

# 1. 구성

GameEngine은 4개의 Registry와 상태를 묶는다. **모든 콘텐츠는 Registry 등록으로만
들어온다** — 이것이 "엔진 수정 없이 증강 1000개"의 실체다.

```
GameEngine
├── GameState        현재 상태 (유일한 진실)
├── RuleRegistry     규칙 값 (04)         ← rules.define / addModifier
├── EffectRegistry   이벤트 훅 (05)       ← effects.register
├── ActionRegistry   행동 정의 (06)       ← actions.register
├── ReducerRegistry  이벤트 → 상태 변경   ← reducers.register
└── EventProcessor   이벤트 큐 실행 (05)
└── Event Log        확정 이벤트 누적 (= 리플레이)
```

## 콘텐츠 등록 지점 요약

| 추가하고 싶은 것 | 등록 지점 |
|------------------|-----------|
| 규칙 값 변경 (리치 비용 등) | `rules.addModifier` |
| 새 규칙 | `rules.define` |
| 이벤트에 반응하는 능력 | `effects.register` |
| 새 플레이어 행동 | `actions.register` |
| 새 이벤트 종류 | `reducers.register` |

---

# 2. submit — 요청 하나의 일생

```ts
engine.submit({ player: "p1", type: "discard", payload: { tileId: 42 } })
```

```
① ActionRegistry에서 ActionDef 조회        (없으면 거부)
② validate(request, {state, rules})        (사유 반환 시 거부)
③ toEvents → 루트 이벤트(들)
④ 루트마다 EventProcessor.process 실행
     Interceptor → Reducer 적용 → Reaction (05 참조)
⑤ 성공: 새 상태 확정, lastEventSeq 갱신, Event Log에 이어 붙임
   반환: { ok: true, events, canceled }
```

## 실패 의미론 — 두 종류의 "안 됨"

| 종류 | 예 | 처리 |
|------|-----|------|
| **거부 (정상 흐름)** | 내 턴이 아님, 손에 없는 패 | `{ ok: false, reason }` — 클라이언트에 사유 전달 |
| **예외 (버그·폭주)** | 연쇄 한도 초과, Reducer 누락, 훅 내부 오류 | 같은 `{ ok: false }`로 변환하되 서버(12)가 오류 로그 |

**어느 쪽이든 상태는 조금도 변하지 않는다.** Reducer가 순수 함수라서
엔진은 성공했을 때만 새 상태를 채택한다 — Action은 트랜잭션이다.

## seq 관리

- 확정 이벤트만 seq를 소비한다 (`lastEventSeq + 1`부터). 취소·대체된 제안은
  seq를 받지 않는다.
- 한 Action이 루트 이벤트를 여러 개 만들면 이어지는 번호로 순서대로 처리된다.
- `engine.eventLog`는 append-only다. 이 배열 + 초기 상태(시드 포함) = 리플레이(12).

---

# 3. 표준 이벤트

엔진이 기본 제공하는 이벤트. 새 이벤트는 콘텐츠가 reducers.register로 추가한다.

| 이벤트 | payload | Reducer가 하는 일 |
|--------|---------|-------------------|
| `TilesMoved` | from, to, tileIds, insertAt? | `moveTiles`로 zones 갱신 (07의 이동 원시 연산) |

(08·11 진행에 따라 `ScoreChanged`, `PhaseChanged`, `RiichiDeclared` 등이 추가된다.
 추가 시 이 표를 갱신할 것.)

## Reducer 규약

- **모든 이벤트 type은 Reducer가 등록되어 있어야 한다.** 없으면 예외 → Action 거부.
  상태 변경이 없는 알림성 이벤트도 항등 Reducer를 명시적으로 등록한다 (오타 조기 발견).
- Reducer 안에서 난수가 필요하면 `state.prngState`를 읽고 전진시킨 값을
  새 상태에 담는다 (setupRound와 같은 패턴) — 순수성과 리플레이가 유지된다.

---

# 4. 엔진이 하지 않는 일

| 일 | 담당 |
|----|------|
| 턴 진행·쯔모·페이즈 전이 | Game Flow (11) — 시스템 이벤트를 submit과 같은 경로로 주입 |
| 화료 판정·점수 계산 | Mahjong Engine (08) — validate·toEvents가 호출하는 도메인 함수 |
| 플레이어별 가시성 필터 | Information Layer (09) — 확정 이벤트·상태를 받아 PlayerView 생성 |
| 네트워크·저장 | Server (12) |

GameEngine은 **규칙도 마작도 모른다.** 등록된 것을 순서대로 실행할 뿐이다.
