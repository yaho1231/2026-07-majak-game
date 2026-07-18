# 13_CONTENT_PIPELINE
Version : 1.1
Status : Active
Last Updated : 2026-07-16

새로운 콘텐츠(증강, 역, 액션 등)를 엔진에 등록하고 관리하는 규약과 방법론.
모든 콘텐츠는 플러그인처럼 엔진 코드 수정 없이 외곽에서 등록할 수 있어야 한다.

---

# 0. @majak/content — 실전 콘텐츠 팩 (2026-07-16)

증강 카탈로그의 실제 보금자리. **증강 1종 = 파일 1개** 규약.

```
packages/content/
  src/augments/<augment_id>.ts   // export const <camelCase>: AugmentDef
  src/util.ts                    // statePrng·roundKey·viewKey·yakuHolders·counterOf·flagOf
  src/index.ts                   // contentAugments 배럴 (Silver/Gold/Prism 순 정렬)
  test/helpers.ts                // craft() — 원하는 국면 조립 하네스
  test/<group>.test.ts           // 그룹 단위 vitest
```

새 증강 추가 절차: augments/에 파일 생성 → index.ts의 contentAugments에 추가 → 테스트.
서버(`RoomManager`)와 리플레이 CLI(`replay.ts`)는 contentAugments를 그대로 주입하므로
그 외 코드 수정은 없다. 규약:

- 난수는 `statePrng(state)`로 잇고 소비 결과 prngState를 이벤트 payload로 되쓴다
- 새 이벤트 타입 이름은 증강 id에서 파생 (충돌 방지), 등록은 `has()` 가드
- 클라이언트에 보여줄 정보는 `view:{pid}:{key}` / `view:*:{key}` augmentData 규약 (09 §7.5)
- install은 등록만 한다 — 효과는 reaction/action 경유 (리플레이 재구성 시 재호출됨)

---

# 1. 증강 (Augment) 추가하기

증강은 `defineAugment`를 통해 정의되며, `AugmentRegistry`에 등록되어 게임 내 드래프트 시스템에서 무작위로 등장하게 된다.

## 1.1 증강의 기본 뼈대
```ts
import { defineAugment } from "@majak/core/augment/Augment";

export const myNewAugment = defineAugment({
  id: "my_new_augment",
  tier: "silver",          // "silver" | "gold" | "prism"
  name: "새로운 증강",
  description: "어떤 놀라운 효과를 설명합니다.",
  install(ctx) {
    // 1. 룰 변경 (Modifiers)
    // 2. 이벤트 감지 및 방출 (Effects)
  },
});
```

## 1.2 룰 변경 (Rule Modifiers)
증강의 보유자에게만 룰을 변경하고 싶다면 `ctx.setHolderRule`을 사용한다.
```ts
install(ctx) {
  // 예: 나의 리치 비용만 500점으로
  ctx.setHolderRule("riichi.cost", 500);
  
  // 예: 나의 손패를 모든 사람에게 공개 (가시성 변경도 룰이다!)
  ctx.setHolderRule("visibility.hand", "public");
}
```

## 1.3 이벤트 반응 (Effect Reactions & Interceptors)
마작의 흐름 속에서 어떤 일이 일어날 때(예: 누군가 론을 했을 때) 개입하고 싶다면 Effect 시스템을 사용한다.

- **Reaction**: 이벤트가 벌어진 *직후*에 새로운 이벤트를 연쇄적으로 발생시킨다.
- **Interceptor**: 이벤트가 확정되기 *직전*에 가로채서 이벤트 내용을 변경하거나 취소시킨다.

```ts
import { WIN_DECLARED } from "@majak/core/mahjong/flow/flowEvents";

install(ctx) {
  // 누군가 화료할 때
  ctx.reaction(WIN_DECLARED, (event, rc) => {
    const payload = event.payload;
    if (payload.winner === ctx.holder) {
      // 보유자가 이겼다면 추가 점수 이벤트를 발생시킨다
      rc.emit(scoreChanged(ctx.holder, 1000, "bonus"));
    }
  });
}
```

---

# 2. 역 (Yaku) 추가하기

새로운 역을 추가하려면 `YakuDef`를 작성하고 `YakuRegistry`에 등록한다.

## 2.1 YakuDef 구조
```ts
import type { YakuDef } from "@majak/core/mahjong/scoring/YakuRegistry";

export const newYaku: YakuDef = {
  id: "new_yaku",
  name: "신규 역",
  han: 2,           // 기본 판수 (울어도 동일하면 han만 정의)
  isYakuman: false, 
  evaluate: (ctx) => {
    // ctx.handKinds: 손패 (형태 정보 포함)
    // ctx.melds: 부로패 목록
    // ctx.winTile: 화료패
    
    // 조건 검사
    if (/* 조건 만족 */) {
      return { ok: true, han: 2 };
    }
    return { ok: false };
  },
};
```
만약 부로(멘젠이 깨짐) 시 판수가 깎이는 역(쿠이사가리)이라면, `evaluate` 내에서 `ctx.isClosed`를 확인해 리턴하는 판수를 조절하면 된다.

---

# 3. 액션 (Action) 추가하기

새로운 플레이어의 행동(예: 새로운 울기, 특별한 선언)을 추가하려면 `ActionDef`를 작성하고 `ActionRegistry`에 등록한다.

## 3.1 ActionDef 구조
```ts
import type { ActionDef } from "@majak/core/engine/actions/ActionRegistry";

export const newAction: ActionDef<{ targetId: string }> = {
  type: "custom_action",
  validate: (req, context) => {
    // 1. 현재 페이즈 확인 (예: turn.act)
    if (context.state.round.phase !== "turn.act") return "not in act phase";
    
    // 2. 플레이어 턴 확인
    if (!isTurnPlayer(context.state, req.player)) return "not your turn";
    
    // 유효하면 null, 불가하면 에러 메시지 반환
    return null;
  },
  toEvents: (req, context) => {
    // 행동의 결과로 일어날 이벤트 배열을 반환
    return [
      {
        type: "CUSTOM_EVENT_OCCURRED",
        payload: { player: req.player, target: req.payload.targetId },
      }
    ];
  },
};
```

**주의**: 새로운 액션을 만들면, 해당 액션이 언제 사용자에게 프롬프트(Prompt)로 제시될지 `FlowController.ts`의 로직에도 반영되어야 할 수 있다. 향후 액션 프롬프트 로직 자체도 선언적으로 분리하는 것이 목표다.

---

# 4. 새 Rule 추가하기

값이 바뀔 수 있는 상수는 코드에 직접 박지 않고 Rule로 만든다.

예시:

```ts
export type KanDoraTiming = "beforeRinshan" | "afterDiscard";

export function defineStandardFlowRules(rules: RuleRegistry): void {
  rules.define<KanDoraTiming>("dora.kanTiming", "beforeRinshan");
}
```

사용 지점은 항상 `rules.resolve`로 읽는다.

```ts
const timing = engine.rules.resolve<KanDoraTiming>("dora.kanTiming", {
  playerId,
  state,
});
```

규칙 추가 시 같이 갱신할 곳:

| 항목 | 확인 |
|------|------|
| 기본값 | `defineStandardFlowRules` 또는 해당 시스템의 define 함수 |
| 문서 | `01_GAME_RULES`의 규칙 키, 필요 시 세부 시스템 문서 |
| 증강 | `ctx.setHolderRule`로 플레이어별 변경 가능한지 검토 |
| 테스트 | 기본값 + Modifier 적용 케이스 최소 1개 |

---

# 5. Prompt가 필요한 콘텐츠

콘텐츠가 새 선택지를 플레이어에게 보여줘야 한다면 두 단계가 필요하다.

1. `ActionDef.validate`가 합법성을 판정한다.
2. Prompt 생성기가 그 액션 후보를 찾아 `DecisionPrompt.options`에 넣는다.

현재 표준 FlowController는 다음 후보를 직접 탐색한다.

| 페이즈 | Prompt 후보 |
|--------|-------------|
| `turn.act` | discard, riichi, win, ankan, shouminkan, kyushuKyuhai |
| `reaction` | win, pon, chi, minkan, pass |

따라서 규칙값만 바꾸는 증강은 Flow 수정이 필요 없지만, "새 버튼"이 필요한 증강은
Prompt 생성 경로도 추가해야 한다. 새 Prompt 경로를 만들 때는 다음을 지킨다.

- Prompt에 없던 선택은 `submit`에서 거부되어야 한다.
- Prompt에 있던 선택도 `ActionDef.validate`에서 다시 검증되어야 한다.
- 사람이든 봇이든 같은 `DecisionPrompt`를 받아야 한다.
- 리플레이에는 선택 결과 이벤트만 있으면 재현되어야 한다.

---

# 6. 테스트 기준

콘텐츠 종류별 최소 테스트:

| 콘텐츠 | 최소 테스트 |
|--------|-------------|
| Rule | 기본값 resolve + Modifier 적용 |
| Yaku | 성립/불성립, 멘젠/부로 차이, 도라가 역이 아님을 침범하지 않는지 |
| Action | validate 거부 1개 + 성공 이벤트 1개 + Flow Prompt 노출 |
| Reducer/Event | 상태 변화, 패 보존, event log 재현성 |
| Effect | 발동 조건, 미발동 조건, 연쇄 한도와 충돌하지 않는지 |
| Augment | Draft/Install 후 실제 게임 흐름에서 효과 확인 |
| Information | 본인/타인/관전자 뷰 차이, 새 공개 정보가 새지 않는지 |

회귀 테스트는 가능하면 수작업 상태(craft state)로 작게 만든다.
반장전 봇 관통 테스트는 최종 안전망이며, 특정 규칙의 유일한 테스트로 쓰지 않는다.

---

# 7. 콘텐츠 배포 (Registry 등록)

코어 패키지의 기본 콘텐츠들은 다음 팩토리 함수를 통해 일괄 등록된다.
새로운 확장 팩이나 모드를 만든다면 아래와 같은 셋업 함수를 만들어 엔진 기동 시 호출하면 된다.

```ts
// 예: standardGame.ts
export function createStandardGame(options) {
  const rules = new RuleRegistry();
  const yaku = new YakuRegistry();
  const actions = new ActionRegistry();
  const reducers = new ReducerRegistry();

  // 1. 기본 룰 및 시스템 등록
  defineStandardFlowRules(rules);
  defineVisibilityRules(rules);

  // 2. 마작 역 등록
  registerStandardYaku(yaku);

  // 3. 액션 및 리듀서 등록
  registerStandardActions(actions, yaku);
  registerFlowReducers(reducers);

  // 4. 엔진 생성
  const engine = new GameEngine({ state, rules, actions, reducers });
  
  // 5. 증강 로드 및 드래프트 준비
  const augments = [...standardAugments];

  return new StandardGame(engine, yaku, augments);
}
```

---

# 8. Public API 체크리스트

새 콘텐츠가 외부 확장팩·서버·테스트에서 써야 하는 이름을 만들면
`packages/core/src/index.ts`에 export한다.

| 추가한 것 | export 기준 |
|-----------|-------------|
| Event 상수·Payload 타입 | 리플레이/Effect/서버가 참조하면 export |
| Action type 문자열 | 일반적으로 Registry 등록으로 충분. 외부에서 직접 submit하면 문서화 |
| Rule key | 문자열 키는 문서에 기록. Type alias가 있으면 export 검토 |
| PlayerView 타입 | 클라이언트 프로토콜에 노출되면 export |
| helper 함수 | 증강 작성자가 반복해서 필요로 할 때만 export |

엔진 내부 헬퍼를 너무 빨리 public으로 만들지 않는다. 한 번 export하면 확장팩의 계약이 된다.
