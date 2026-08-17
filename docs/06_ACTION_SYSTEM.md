# 06_ACTION_SYSTEM
Version : 1.0
Status : Active
Last Updated : 2026-07-15

플레이어(사람·봇)가 할 수 있는 **행동(Action)의 정의·검증** 시스템.
구현: `packages/core/src/engine/actions/ActionRegistry.ts`

---

# 1. Action의 자리

파이프라인에서 Action은 **바깥 세계와 엔진의 유일한 접점**이다.

```
PlayerAgent → ActionRequest → [검증] → 루트 이벤트 → EventProcessor → GameState
```

- 클라이언트가 보내는 것은 항상 ActionRequest다. 이벤트를 직접 보낼 수 없다.
- Action은 **상태를 바꾸지 않는다.** 검증하고, 이벤트를 만들 뿐이다.
  상태 변경은 언제나 이벤트의 Reducer가 한다 (SSOT).

---

# 2. ActionDef — 행동 하나의 정의

```ts
interface ActionDef<TPayload> {
  type: string;   // "discard", "riichi", "draftPick" …

  /** 지금 이 플레이어가 이 행동을 해도 되는가?
      합법이면 null, 불법이면 거부 사유 문자열 (클라이언트에 그대로 전달됨) */
  validate(request, ctx): string | null;

  /** 합법 확정 후, 이 행동이 만들어낼 루트 이벤트(들) */
  toEvents(request, ctx): ProposedEvent[];
}
```

- `ctx = { state, rules }` — 검증은 GameState와 RuleRegistry만 참조한다.
  "리치에 필요한 점수"처럼 증강이 바꿀 수 있는 값은 반드시 rules에서 읽는다.
- validate와 toEvents는 **순수 함수**여야 한다 (상태 수정·난수·시계 금지).
- 거부 사유는 사람이 읽는 문자열이다. 봇도 이 문자열을 로그로 남긴다.

## ActionRegistry

```ts
actions.register(discardAction);   // 등록만으로 새 행동 추가 (Data Driven)
```

증강이 새 행동을 추가하는 것("버림패 회수" 등)도 같은 등록이다.
행동의 **활성화 여부**를 증강이 제어하려면 validate 안에서 Rule을 읽으면 된다
(예: `call.pon.enabled`).

---

# 3. 표준 행동 목록

> 상태 갱신 2026-08-18: 이 표는 오래도록 **전부 ⬜(미구현)** 인 채로 남아 있었다.
> 초기 스캐폴딩 상태 그대로 방치된 것이고, 실제로는 일곱 가지가 모두 구현·운영 중이다
> (`packages/core/src/mahjong/flow/standardActions.ts`). 문서를 믿고 "이제 만들어야겠다"고
> 시작하면 이미 있는 것을 다시 만들게 된다.

| 행동 | 주체 | 구현 상태 |
|------|------|-----------|
| discard (버림) | 턴 플레이어 | ✅ `standardActions.ts` |
| riichi (리치 선언) | 턴 플레이어 | ✅ |
| chi / pon / kan (후로) | 비턴 플레이어 | ✅ |
| win (론/쯔모 화료) | 해당 플레이어 | ✅ |
| kyuushu (구종구패 유국 선언) | 턴 플레이어 | ✅ |
| draftPick (증강 선택) | 전원 | ✅ `DraftController` |
| pass (후로 기회 포기) | 비턴 플레이어 | ✅ |

쯔모(draw)는 플레이어 행동이 아니라 **Game Flow(11)가 만드는 시스템 이벤트**다 —
플레이어에게 선택권이 없는 일은 Action이 아니다.

---

# 4. DecisionPrompt — 서버가 묻는 질문 (설계 예정)

버림패가 나왔을 때 "펑 할래?"처럼 **서버가 먼저 묻고 플레이어가 답하는** 흐름이 필요하다.

```
서버: DecisionPrompt { 가능한 Action 목록, 제한 시간 }
플레이어: 그중 하나의 ActionRequest (또는 pass)
```

- 프롬프트에 없는 행동이 오면 validate가 거부한다 — 프롬프트는 UI 편의이고,
  **진실은 언제나 validate다** (Server Authority).
- 타임아웃 시 기본 행동(pass/쯔모기리)은 서버가 대신 제출한다.
- 구체 설계는 11_GAME_FLOW(턴 진행·대기)와 함께 확정한다.

---

# 5. 확장 시나리오 점검

| 증강 아이디어 | 구현 | 엔진 수정 |
|---------------|------|-----------|
| 버림패 회수 행동 추가 | 새 ActionDef 등록 | 없음 |
| 펑 금지 | validate가 읽는 `call.pon.enabled`에 Modifier | 없음 |
| 리치 조건 완화 | `riichi.conditions` 관련 Rule에 Modifier | 없음 |
| 행동에 비용 부과 | ActionDef.toEvents가 비용 이벤트를 함께 방출 | 없음 |
