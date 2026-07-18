# 05_EFFECT_SYSTEM
Version : 1.0
Status : Active
Last Updated : 2026-07-15

Event에 반응하는 훅 시스템. **증강 능력이 실제로 실행되는 지점**이다.
구현: `packages/core/src/engine/effects/EffectRegistry.ts`, `EventProcessor.ts`

RuleRegistry(04)가 "규칙 값이 무엇인가"를 담당한다면,
Effect System은 "게임에서 일이 벌어질 때 무엇을 하는가"를 담당한다.

---

# 1. 두 종류의 훅

이벤트의 삶은 `제안(Proposed) → 확정(Confirmed) → 적용됨` 이고, 훅은 두 지점에 걸린다.

## Interceptor — 적용 전

제안된 이벤트를 **수정·취소·대체**할 수 있다.

```ts
(event: ProposedEvent, ctx) => ProposedEvent | null
```

| 반환 | 의미 | 예시 증강 |
|------|------|-----------|
| 같은 type의 이벤트 | 수정 (payload 변경) | "리치 공탁이 절반만 나간다" |
| `null` | 취소 — 이벤트는 없던 일이 된다 | "첫 방총을 1회 무효화" |
| **다른 type**의 이벤트 | 대체 — 새 이벤트가 파이프라인에 재진입 | "버림이 버림이 아니라 봉인 Zone 이동이 된다" |

## Reaction — 적용 후

확정·적용된 이벤트를 보고 **새 이벤트를 방출(emit)** 할 수 있다. 되돌릴 수는 없다.

```ts
(event: GameEvent, ctx) => void   // ctx.emit(...)으로 후속 이벤트 제안
```

예시: "도라 표시패가 공개될 때마다 500점 획득" — `DoraRevealed`에 Reaction을 걸고
`ScoreChanged`를 emit.

## 문맥(ctx)이 보는 상태

- Interceptor는 **적용 전** 상태를 본다.
- Reaction은 **적용 후** 상태를 본다.
- 둘 다 `ctx.rules`(RuleRegistry)를 조회할 수 있다.
- **상태를 직접 수정하는 것은 불가능하다.** 상태 변경은 오직 이벤트로만 (SSOT).

---

# 2. 등록과 실행 순서

```ts
effects.register({
  source: "aug-instance-7",   // 증강 인스턴스 id — 소멸 시 removeBySource로 일괄 제거
  layer: RuleLayer.Gold,      // RuleRegistry와 같은 Layer 체계
  priority: 0,                // 같은 layer 내 세부 순서 (선택)
  on: "TileDiscarded",        // 반응할 이벤트 type. "*" = 모든 이벤트
  intercept: ...,             // 둘 중 최소 하나
  react: ...,
});
```

실행 순서는 RuleRegistry와 동일한 결정론 규칙이다:

```
(layer 오름차순, priority, 등록 순서)
Base(0) < Silver(100) < Gold(200) < Prism(300) < System(1000)
```

- 나중(높은 layer)에 실행될수록 앞의 결과를 덮을 수 있다 = 최종 발언권.
- 취소는 즉시 확정이다 — 뒤 순서의 Interceptor는 실행되지 않는다.
- 같은 조건이면 항상 같은 순서 → 리플레이 보장.

---

# 3. 이벤트 처리 파이프라인 (EventProcessor)

하나의 루트 이벤트(Action이 만든 이벤트)가 들어오면:

```
큐 = [루트 이벤트(depth 0)]
큐가 빌 때까지:
  이벤트 꺼냄
  ── 한도 검사 (§4) ──
  Interceptor들 실행 (layer 순)
      취소되면 → 기록하고 다음 이벤트로
      대체되면 → 새 이벤트를 큐 맨 앞에 (depth+1), 원본은 취소 기록
  seq 부여 → Reducer로 상태 적용 → Event Log에 확정 기록
  Reaction들 실행 (layer 순)
      emit된 이벤트는 큐 맨 뒤에 (depth+1, causedBy = 방금 seq)
```

- **대체는 큐 맨 앞** (원본의 자리를 이어받는다), **방출은 큐 맨 뒤** (너비 우선).
  순서가 항상 결정적이다.
- `causedBy` 체인으로 "어떤 증강 연쇄가 이 이벤트를 만들었나"를 리플레이에서 추적할 수 있다.
- 훅 안에서 예외가 나면 **루트 Action 전체가 거부된다.** Reducer가 순수 함수라
  호출자가 원본 상태를 그대로 유지하면 되므로, 롤백은 공짜다 (트랜잭션 의미론).

---

# 4. Issue 004 해결 — 연쇄 폭주 방지

증강 A의 Reaction이 낸 이벤트가 증강 B를 발동시키고, B가 다시 A를… 를 막는 두 한도:

| 한도 | 기본값 | 걸리는 경우 |
|------|--------|-------------|
| `maxChainDepth` | 16 | A→B→A→B… 세로 연쇄 (대체 포함 매 홉마다 depth+1) |
| `maxEventsPerRoot` | 128 | 한 Action이 만든 이벤트 총량 (가로 폭발 포함) |

- 한도 초과 시 **예외 → Action 거부 → 상태 원복.** 조용히 잘라내지 않는다 —
  콘텐츠 버그는 시끄럽게 죽어야 테스트에서 잡힌다.
- "같은 트리거 재진입 금지" 대신 depth 한도를 택했다: 정당한 콤보(2~3중 연쇄)는
  증강 게임의 재미이므로 허용하되, 상한으로 폭주만 막는다.
- 한도는 EventProcessor 옵션이다. 지금은 상수, 필요해지면 System layer 보호가 있는
  Rule로 승격할 수 있다.

---

# 5. 시나리오 점검

| 증강 | 구현 |
|------|------|
| 리치 비용 500 | Rule Modifier만 (Effect 불필요 — 값 변경은 04의 일) |
| 도라 공개마다 +500점 | `DoraRevealed`에 react → `ScoreChanged` emit |
| 첫 방총 무효 | `WinDeclared`에 intercept → 조건부 null (자기 상태는 별도 이벤트로 소모 처리) |
| 버림패가 봉인 Zone으로 | `TileDiscarded`에 intercept → `TilesMoved`(커스텀 Zone행)로 대체 |
| 남의 증강 발동에 반응 | 그 증강이 내는 이벤트 type에 react — 증강끼리도 이벤트로만 대화한다 |

**설계 리트머스**: 증강끼리 직접 참조하는 순간 실패다.
모든 상호작용은 이벤트와 Rule을 통해서만 일어난다.

---

# 6. 남은 설계 과제 (02·10에서)

- Action → 루트 이벤트 변환과 seq/lastEventSeq 관리는 02_CORE_ENGINE의 몫.
- "1회 한정" 능력의 사용 횟수 저장 위치 (증강 임시 데이터, 10에서).
- 취소 불가능해야 하는 엔진 필수 이벤트의 보호 정책 (필요해지면 protectedTypes 도입).
