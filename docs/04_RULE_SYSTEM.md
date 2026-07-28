# 04_RULE_SYSTEM
Version : 1.1
Status : Active
Last Updated : 2026-07-15

게임의 모든 설정치와 판정 기준을 이름이 붙은 **Rule**로 정의하고, 증강이 이 값들을 충돌 없이 덮어쓸 수 있도록 지원하는 시스템.
구현: `packages/core/src/engine/rules/`

Rule은 "게임이 지금 어떤 값을 기준으로 판정해야 하는가"의 질의 지점이다.
엔진·Flow·Information Layer는 하드코딩된 상수 대신 RuleRegistry를 조회하고,
증강은 Modifier를 등록해 그 조회 결과만 바꾼다.

---

# 1. 핵심 설계 (Issue 001 해결)

증강 기반 게임에서 가장 큰 문제는 **"증강끼리 규칙을 동시에 덮어쓰려 할 때의 충돌"**이다.
- 증강 A: "리치 비용을 500점으로 만든다"
- 증강 B: "리치 비용을 0점으로 만든다"
- 증강 C: "리치 비용을 2배로 만든다"

마작 엔진은 `riichi.cost = 500` 식으로 직접 변수를 수정하는 대신, `RuleRegistry`를 통해 값을 획득한다.
모든 증강은 원본 값을 수정하지 않고 **Modifier(수정자)를 등록**하며, RuleRegistry가 일관된 기준에 따라 Modifier들을 합성하여 최종값을 도출한다.

---

# 2. RuleRegistry 작동 방식

## 2.1 기본값 정의 (Define)
게임이 초기화될 때, 표준 규칙의 기본값을 정의한다.
```ts
rules.define("riichi.cost", 1000);
rules.define("win.furiten.enabled", true);
```

## 2.2 Modifier 등록 (Add Modifier)
증강은 자신이 활성화될 때 Modifier를 등록한다.
```ts
rules.addModifier<number>("riichi.cost", {
  source: "aug:cheap_riichi",
  layer: RuleLayer.Silver,
  apply: (currentValue, context) => 500, // 기존 값을 덮어씀
});

rules.addModifier<number>("riichi.cost", {
  source: "aug:expensive_riichi",
  layer: RuleLayer.Prism,
  apply: (currentValue, context) => currentValue * 2, // 기존 값을 연산
});
```

## 2.3 값 조회 (Resolve)
엔진 코드는 무언가를 판정할 때마다 RuleRegistry에 값을 묻는다.
```ts
const cost = rules.resolve<number>("riichi.cost", { playerId: req.player });
```
조회 시 등록된 Modifier들을 우선순위에 따라 정렬한 뒤 `reduce`를 돌려 최종값을 구한다.

정의되지 않은 규칙을 조회하거나 수정하려 하면 즉시 예외가 난다.
이는 오타·등록 누락을 조기에 잡기 위한 의도적 실패다.

```ts
rules.resolve("unknown.rule");        // throw
rules.addModifier("unknown.rule", m); // throw
```

---

# 3. 합성 우선순위 (Layer System)

동일한 규칙에 여러 Modifier가 붙을 때, 어떤 증강의 효과가 먼저 적용(또는 최종 덮어쓰기)될지 결정하는 규칙.
정렬 기준은 `(Layer, priority, 등록 순서)` 다.

| Layer | 용도 | 설명 |
|-------|------|------|
| `Base` (0) | 게임 기본 규칙 | 마작의 기본 설정 |
| `Silver` (100) | Silver 등급 증강 | |
| `Gold` (200) | Gold 등급 증강 | |
| `Prism` (300) | Prism 등급 증강 | 기본 규칙을 근본적으로 바꾸는 증강 |
| `System` (1000) | 엔진 안전장치 | 절대 깨져서는 안 되는 불변식 보장용 |

- **높은 Layer가 나중에 적용된다** (최종 발언권을 가짐).
- **같은 Layer 내에서는 획득한 순서(등록 순서)대로 적용된다.**
- 이를 통해 합성 과정은 항상 결정적(Deterministic)이며 리플레이가 보장된다.
- `priority`는 같은 Layer 안에서만 쓰는 세부 순서다. 기본값은 0.
- `System` Layer는 테스트·서버 정책·불변식 보정처럼 매우 좁은 곳에만 쓴다.

---

# 4. Contextual Rule (Context)

마작의 규칙 중 일부는 "특정 플레이어에게만" 적용되어야 한다.
- 증강 A: "내(p0) 리치 비용만 500점이 된다."
이런 경우를 지원하기 위해 `resolve` 시 `RuleContext` 객체를 전달한다.

```ts
interface RuleContext {
  playerId?: PlayerId;
  state?: unknown;
}
```

증강 개발 시 `Context`를 확인하는 Modifier를 작성할 수 있으나, Augment System에서 이를 단순화한 헬퍼 메서드를 제공한다.
```ts
// Augment System에서 제공하는 헬퍼 사용 (특정 플레이어 전용 규칙)
ctx.setHolderRule("riichi.cost", 500); 

// 내부적으로 아래와 같이 등록됨:
rules.addModifier("riichi.cost", {
  apply: (current, ruleCtx) => 
    ruleCtx.playerId === holderId ? 500 : current
});
```

`state`는 순환 의존을 피하기 위해 타입을 강제하지 않는다.
Modifier는 필요한 경우 읽기 전용으로만 사용해야 하며, state를 직접 변경하면 안 된다.

---

# 5. 현재 표준 Rule 목록

## 5.1 Mahjong Flow

정의 위치: `packages/core/src/mahjong/flow/standardActions.ts`

| Rule key | 타입 | 기본값 | 사용처 |
|----------|------|--------|--------|
| `riichi.cost` | number | 1000 | 리치 비용·공탁 |
| `riichi.minWallTiles` | number | 4 | 리치 가능 패산 장수 |
| `riichi.requiresClosed` | boolean | true | 멘젠 리치 조건 |
| `dora.kanTiming` | `"beforeRinshan" \| "afterDiscard"` | `"beforeRinshan"` | 깡 새로운 도라 공개 타이밍 |
| `call.pon.enabled` | boolean | true | 펑 허용 |
| `call.chi.enabled` | boolean | true | 치 허용 |
| `draw.notenPenalty` | number | 3000 | 황패유국 노텐 벌부 |
| `win.requiresYaku` | boolean | true | 역 없음 화료 금지 |
| `win.furiten.enabled` | boolean | true | 후리텐 론 금지 |
| `win.blockedYaku` | string[] | `[]` | 성립 금지 역 id 목록 (evaluateWin에서 제외) |
| `win.treatAsDealer` | boolean | false | 점수 계산만 오야 취급 (연장은 실제 오야만) |
| `win.ronImmune` | boolean | false | 이 사람의 버림패는 론당하지 않는다 (천하무적). `playerId`는 '쏘일 사람' |
| `score.extraHan` | number | 0 | 화료 시 추가 판 (역만 제외, 동적 Modifier 가능) |
| `discard.blockedKinds` | string[] | `[]` | 버림 금지 kindKey 목록 (전부 봉인이면 허용) |
| `call.chi.fromAnyone` | boolean | false | 상가 외의 버림패도 치 가능 (펑>원격치>일반치) |
| `draw.notenExempt` | boolean | false | 유국 노텐 벌점 면제 |
| `scoring.wrapRuns` | boolean | false | 8-9-1 / 9-1-2 순환 슌쯔 허용 |
| `scoring.mixedRuns` | boolean | false | 무늬가 다른 수패로도 슌쯔 허용 (2만·3통·4삭 — 무너진 국경) |
| `scoring.uraWithoutRiichi` | boolean | false | 리치 없이도 뒷도라를 센다 (숨은 칼날). ctx에 `winType`·`isClosed`가 온다 |
| `scoring.totalSets` | number | 4 | 표준형 필요 멘쯔 수 (진짜 용 = 5) |
| `scoring.kokushiMeldAssist` | boolean | false | 요구패 펑 1개를 국사 구성(그 종류+작두)으로 인정 |
| `deal.handSize` | number | 13 | 배패 장수 (ROUND_STARTED reducer가 rules 클로저로 읽음) |
| `turn.direction` | number | 1 | 턴 진행 방향 (1 표준 / -1 역방향; 자풍·친 이동·치 방향 연동) |

`scoring.*` 계열은 `helpers.scoringOptionsOf(state, rules, player)`가 DecomposeOptions로
묶어서 화료 판정·텐파이·후리텐·대기·치 후보 등 모든 판정 지점에 일관 적용한다.
(`scoring.kokushiMeldAssist`가 켜지고 실제로 `kokushi_pon` 후로가 있으면 `kokushiOnly`가
함께 켜져 표준형·치토이 분해를 아예 열거하지 않는다 — 우는 국사무쌍은 국사로만 화료한다.)

**분해 규칙을 바꾸는 증강은 클라이언트 `waitDecompOptions`도 함께 고쳐야 한다.** 클라는
대기를 서버가 아니라 스스로 계산하므로, 여기만 고치면 화면의 오름패 표시가 실제 화료와 어긋난다.

`RuleContext`에는 가시성용 `zoneOwner` 외에 화료 문맥용 `winType`·`isClosed`가 있다
(`buildWinContext`가 채운다). 커스텀 역의 `check`는 GameState를 볼 수 없으므로, "이번 국에
선언했는가" 같은 상태 조건은 `win.blockedYaku` Modifier로 게이팅한다.

## 5.2 Augment Draft

정의 위치: `packages/core/src/augment/events.ts`

| Rule key | 타입 | 기본값 | 사용처 |
|----------|------|--------|--------|
| `augment.draft.weight.silver` | number | 60 | Silver 등장 가중치 |
| `augment.draft.weight.gold` | number | 30 | Gold 등장 가중치 |
| `augment.draft.weight.prism` | number | 10 | Prism 등장 가중치 |
| `augment.draft.choices` | number | 3 | 개인별 드래프트 선택지 수 |

## 5.3 Information

정의 위치: `packages/core/src/information/PlayerView.ts`

| Rule key | 타입 | 기본값 | 사용처 |
|----------|------|--------|--------|
| `visibility.hand` | VisibilityRule | `"owner"` | 손패 공개 범위 |
| `visibility.discards` | VisibilityRule | `"public"` | 버림패 공개 범위 |
| `visibility.melds` | VisibilityRule | `"public"` | 후로 공개 범위 |
| `visibility.wall` | VisibilityRule | `"hidden"` | 패산 공개 범위 |
| `visibility.deadWall` | VisibilityRule | `"hidden"` | 왕패 공개 범위 |

커스텀 Zone을 추가하는 콘텐츠는 `visibility.<zoneKind>` 기본값도 함께 정의해야 한다.

---

# 6. Modifier 작성 규율

- **모든 상수는 Rule로**: 새로운 하드코딩 상수를 도입하지 마라. 값이 변경될 여지가 있다면 반드시 `rules.define`으로 선언하고 `resolve`로 읽어라.
- **Rule 이름 규칙**: `category.subject.property` 형태의 네임스페이스를 권장한다. (예: `call.chi.enabled`, `visibility.hand`)
- **순수 함수 유지**: Modifier의 `apply` 함수는 부수 효과(Side Effect)를 일으켜서는 안 된다. 단순히 값을 변환하여 반환해야 한다.
- **동일 source 사용**: 증강이 여러 Modifier를 등록해도 source는 `aug:<player>:<augmentId>`처럼 같은 값을 써야 한다. 그래야 `removeBySource`로 일괄 제거된다.
- **플레이어별 규칙은 context로 제한**: 특정 보유자만 바뀌는 규칙은 직접 `addModifier`보다 `ctx.setHolderRule`을 우선 사용한다.
- **불변식은 Rule만으로 깨지지 않게**: Rule은 판정 기준을 바꿀 수 있지만, 패 보존·점수 보존 같은 엔진 불변식은 Reducer/Action 검증에서 지킨다.

---

# 7. 새 Rule 추가 절차

1. 규칙 키와 타입을 정한다.
2. 가장 가까운 시스템의 define 함수에 기본값을 등록한다.
3. 사용 지점은 하드코딩 대신 `rules.resolve<T>(key, ctx)`로 읽는다.
4. `01_GAME_RULES` 또는 해당 시스템 문서에 규칙 키를 기록한다.
5. 기본값 테스트와 Modifier 적용 테스트를 추가한다.
6. 외부 확장팩이 타입을 써야 하면 public export를 검토한다.

예시:

```ts
type KanDoraTiming = "beforeRinshan" | "afterDiscard";

rules.define<KanDoraTiming>("dora.kanTiming", "beforeRinshan");

const timing = rules.resolve<KanDoraTiming>("dora.kanTiming", { state });
```

---

# 8. 테스트 기준

RuleRegistry 자체 테스트:

| 케이스 | 목적 |
|--------|------|
| define/resolve | 기본값 조회 |
| 중복 define 실패 | 등록 실수 조기 발견 |
| Layer 합성 | Silver/Gold/Prism 우선순위 |
| priority/등록 순서 | 같은 Layer 내 결정성 |
| removeBySource | 증강 제거·재설치 안정성 |
| context 분기 | 보유자별 규칙 적용 |

규칙을 사용하는 시스템 테스트:

- 기본값에서 표준 룰이 유지되는지 확인한다.
- Modifier로 값을 바꿨을 때 실제 Flow/Scoring/View가 바뀌는지 확인한다.
- 리플레이 결정성을 깨지 않는지 확인한다.
