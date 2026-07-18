# 99_IMPLEMENTATION_GUIDE
Version : 1.0
Status : Active
Last Updated : 2026-07-15

새 작업을 시작할 때 보는 구현 가이드.
설계 원칙은 00~13 문서가 진실이고, 이 문서는 실제 작업 순서와 확인 목록이다.

---

# 1. 빠른 시작

```bash
npm install
npm run typecheck
npm test
```

현재 핵심 패키지:

| 경로 | 역할 |
|------|------|
| `packages/core` | 순수 게임 엔진. 네트워크·파일·DOM 금지 |
| `packages/server` | WebSocket 서버, 방, 사람/봇 Agent, 리플레이 기록 |
| `docs` | 설계와 구현 규칙 |

자주 쓰는 명령:

```bash
npm run typecheck          # core TypeScript 검사
npm test                   # 전체 Vitest
npm test -- GameFlow.test  # 특정 테스트 파일 실행
```

---

# 2. 작업 전 확인 순서

1. `PROJECT_STATUS.md`의 현재 목표와 다음 우선순위를 확인한다.
2. 관련 설계 문서를 읽는다.
3. 관련 구현 파일과 테스트를 같이 읽는다.
4. 변경이 Rule/Event/Action/Effect/State/View 중 어디에 속하는지 먼저 정한다.
5. 작은 테스트를 추가하거나 기존 테스트를 확장한다.
6. 구현한다.
7. `npm run typecheck`와 `npm test`를 통과시킨다.
8. 변경한 시스템 문서와 `PROJECT_STATUS.md`를 갱신한다.

---

# 3. 수정 위치 빠른 지도

| 하고 싶은 일 | 먼저 볼 문서 | 주요 파일 |
|--------------|--------------|-----------|
| 새 규칙값 추가 | 04, 13 | `RuleRegistry.ts`, 해당 시스템의 define 함수 |
| 새 플레이어 행동 추가 | 06, 11, 13 | `standardActions.ts`, `FlowController.ts` |
| 새 이벤트/상태 전이 추가 | 03, 05, 11 | `flowEvents.ts`, `GameState.ts` |
| 새 역 추가 | 08 | `standardYaku.ts`, `evaluate.ts` 테스트 |
| 새 증강 추가 | 10, 13 | `standardAugments.ts`, `Augment.test.ts` |
| 새 공개 정보 추가 | 09 | `PlayerView.ts`, `PlayerView.test.ts` |
| 서버 메시지 변경 | 12 | `network/protocol.ts`, server 패키지 |
| 반장전 흐름 변경 | 11, 12 | `HanchanController.ts`, `Hanchan.test.ts` |

---

# 4. 절대 규칙

- `packages/core`는 순수 로직만 둔다. 파일시스템, 네트워크, 시간, DOM 접근 금지.
- GameState는 JSON 직렬화 가능한 데이터만 담는다.
- 상태 변경은 확정 Event의 Reducer로만 한다.
- 플레이어 요청은 Action validate를 통과해야 한다.
- Prompt에 나온 선택도 submit 시 다시 validate되어야 한다.
- 새 상수는 Rule로 정의한다.
- 새 Zone은 기본 visibility Rule을 함께 정의한다.
- 증강은 가능한 한 등록 API만 사용한다. 엔진 수정이 필요하면 먼저 등록 지점이 부족한지 의심한다.
- 테스트에서 임의성은 seed 또는 수작업 상태로 고정한다.

---

# 5. 새 Rule 추가 체크리스트

1. Rule key를 `category.subject.property` 형태로 정한다.
2. 타입을 명확히 한다.
3. 기본값을 define 함수에 추가한다.
4. 사용 지점에서 `rules.resolve<T>(key, ctx)`로 읽는다.
5. `01_GAME_RULES` 또는 해당 시스템 문서에 기록한다.
6. 기본값 테스트와 Modifier 테스트를 추가한다.

예시:

```ts
rules.define<"beforeRinshan" | "afterDiscard">(
  "dora.kanTiming",
  "beforeRinshan",
);
```

---

# 6. 새 Action 추가 체크리스트

1. `ActionDef<Payload>`를 만든다.
2. `validate`에서 페이즈, 플레이어, 패 소유, Rule 조건을 검사한다.
3. `toEvents`는 순수하게 ProposedEvent 배열만 반환한다.
4. 필요하면 새 Event와 Reducer를 등록한다.
5. FlowController의 Prompt 후보에 추가한다.
6. 서버가 클라이언트 action type을 허용하는지 확인한다.
7. 테스트:
   - 불법 요청 거부
   - 합법 요청 이벤트 생성
   - Flow Prompt 노출
   - 봇 관통전 불변식

---

# 7. 새 Event/Reducer 추가 체크리스트

1. Event 상수와 Payload 타입을 만든다.
2. Reducer는 입력 state를 직접 mutate하지 않는다.
3. 패 이동은 가능하면 `moveTiles`를 사용한다.
4. Event가 외부 콘텐츠나 리플레이에서 필요하면 `packages/core/src/index.ts`에 export한다.
5. 상태가 늘어나면 `GameState.ts`, 수작업 테스트 유틸, `PlayerView` 폴백을 함께 갱신한다.
6. 문서 03과 해당 시스템 문서를 갱신한다.

---

# 8. 새 Augment 추가 체크리스트

1. `defineAugment`로 데이터와 install을 작성한다.
2. 보유자 한정 Rule 변경은 `ctx.setHolderRule`을 우선 사용한다.
3. 이벤트 반응은 `ctx.reaction`, 이벤트 수정은 `ctx.interceptor`를 쓴다.
4. 새 Action/Zone/Rule이 필요하면 먼저 04/06/07/11/13 절차를 따른다.
5. `standardAugments` 또는 확장팩 Registry에 등록한다.
6. 테스트:
   - 드래프트에 등장 가능한지
   - pick 후 GameState에 기록되는지
   - install 후 실제 효과가 나는지
   - rebuildAugments 후 효과가 재현되는지

---

# 9. Information Layer 체크리스트

새 정보가 클라이언트에 필요할 때:

1. 그 정보가 공개 정보인지, 본인 전용인지, 관전자 전용인지 정한다.
2. `PlayerView` 타입을 확장한다.
3. `buildPlayerView`에서 viewerId 기준으로 필터링한다.
4. 타인 뷰에 새지 않는 테스트를 추가한다.
5. `docs/09_INFORMATION_SYSTEM.md`와 protocol 필요 여부를 확인한다.

---

# 10. 검증 기준

작업 완료 기준:

```bash
npm run typecheck
npm test
```

변경 규모별 권장 테스트:

| 변경 | 최소 검증 |
|------|-----------|
| 문서만 | 관련 문서 링크·상태표 정합성 확인 |
| 타입만 | `npm run typecheck` |
| core 로직 | 관련 단위 테스트 + 전체 테스트 |
| Flow/Match | `GameFlow.test.ts`, `Hanchan.test.ts`, 전체 테스트 |
| 정보 공개 | `PlayerView.test.ts`, 서버 브로드캐스트 테스트 |
| 서버 | 서버 typecheck 또는 실제 WebSocket smoke test |

---

# 11. 현재 남은 큰 작업

| 우선순위 | 작업 |
|----------|------|
| 1 | 리플레이 재생 도구 |
| 2 | 콘텐츠 팩 분리 (`packages/content`) |
| 3 | 계정/DB/랭크는 MVP 이후 |

클라이언트 MVP 스캐폴딩, 서버 smoke test, 공개 tile metadata, 손패 클릭 UX는 완료되었다.
다음 목표는 JSONL 리플레이를 읽어 이벤트 로그를 재생하고 PlayerView를 확인할 수 있는 도구다.
