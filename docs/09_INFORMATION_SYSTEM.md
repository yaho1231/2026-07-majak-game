# 09_INFORMATION_SYSTEM
Version : 1.0
Status : Active
Last Updated : 2026-07-15

가시성 제어와 PlayerView 생성.
구현: `packages/core/src/information/`

**설계 리트머스**: 가시성 변경은 Rule Modifier 하나로 끝나야 한다.
`buildPlayerView(state, playerId, rules)` 호출 시 엔진 수정 없이 새로운 공개 범위가 반영된다.

---

# 1. 핵심 원칙

> 가시성도 규칙이다.

클라이언트에 전송되지 않은 정보는 해킹으로도 볼 수 없다 (Server Authority의 실질적 의미).
서버는 GameState 전체를 알고, 각 플레이어에게는 **걸러낸 PlayerView**만 보낸다.

---

# 2. 가시성 규칙

각 Zone의 패 공개 여부는 Rule로 관리된다.

## 규칙 키 체계

```
visibility.<zoneKind>          → VisibilityRule   # 종류별 기본값
visibility.<zoneKind>.<owner>  → VisibilityRule   # 소유자 한정 오버라이드 (미래 확장)
```

## VisibilityRule 값

```ts
type VisibilityRule =
  | "public"           // 전원 공개 (버림패, 후로, 도라 표시패)
  | "owner"            // 소유자만 공개 (손패)
  | "hidden"           // 전원 비공개 (패산, 왕패)
  | "count_only"       // 장수만 공개, 내용 비공개 (손패의 뒷면 표시용)
```

## 기본 가시성 규칙 (표준)

| Zone kind  | 기본값       | 이유 |
|------------|------------|------|
| `hand`     | `owner`    | 손패는 본인만 |
| `discards` | `public`   | 버림패는 전원 공개 |
| `melds`    | `public`   | 후로패는 전원 공개 |
| `wall`     | `hidden`   | 패산은 비공개 |
| `deadWall` | `hidden`   | 왕패는 비공개 |

커스텀 Zone은 등록 시 기본 가시성을 지정한다.

---

# 3. PlayerView 구조

```ts
interface PlayerView {
  /** 조회 대상 플레이어 */
  playerId: PlayerId;

  /** 이 뷰에서 공개된 tile id의 kind/attrs */
  tiles: Record<TileId, PublicTileView>;

  /** 가시성이 적용된 Zone 목록. hidden Zone은 tileIds가 빈 배열 */
  zones: Record<ZoneId, ZoneView>;

  /** 플레이어 정보 (점수·증강은 전원 공개) */
  players: PlayerInfo[];

  /** 국 진행 정보 (공개 정보만) */
  round: RoundView;
}

interface ZoneView {
  id: ZoneId;
  kind: string;
  owner?: PlayerId;
  /** 공개된 패. hidden이면 []. owner-only이면 나 자신 것만 실제 id, 나머지는 마스킹 */
  tileIds: TileId[];
  /** 숨겨진 패의 장수 (count_only / owner일 때 다른 플레이어 시점) */
  hiddenCount: number;
}

interface PublicTileView {
  id: TileId;
  kind: TileKind;
  attrs: TileAttrs;
}

interface PlayerInfo {
  id: PlayerId;
  seat: number;
  score: number;
  augments: string[];  // 전원 공개 (2026-07-15 확정)
}

interface RoundView {
  prevalentWind: number;
  roundNumber: number;
  honba: number;
  riichiPot: number;
  dealerSeat: number;
  turnSeat: number;
  turnCount: number;
  phase: string;
  doraIndicators: TileId[];   // 공개된 도라 표시패만 (실제 TileId)
  lastDiscard: { player: PlayerId; tileId: TileId } | null;
  /** byPlayer: 본인 정보만 완전 공개, 타인은 리치 여부만 */
  byPlayer: Record<PlayerId, PlayerRoundView>;
}

interface PlayerRoundView {
  riichiDeclared: boolean;   // 리치 선언 여부 (공개)
  doubleRiichi: boolean;     // 더블리치 여부 (공개)
  ippatsu?: boolean;         // 본인만 알 수 있음
  furiten?: boolean;         // 본인만 알 수 있음
  furitenReasons?: ("discard" | "temporary" | "riichi")[]; // 본인만 알 수 있음
  meldCount: number;         // 후로 수 (공개 — melds Zone에서 계산 가능하지만 편의용)
  sealedKinds?: string[];    // 봉인되어 버릴 수 없는 kindKey 목록 — 본인(관전자는 전원)만.
                             // discard.blockedKinds 규칙의 해석 결과 (봉인술사 등).
                             // 클릭해 보면 어차피 드러나는 정보라 본인에게는 숨기지 않는다
                             // (클라가 🔒 표시·클릭 안내·봉인 배너에 사용).
}
```

---

# 4. buildPlayerView — 핵심 함수

```ts
function buildPlayerView(
  state: GameState,
  viewerId: PlayerId,
  rules: RuleRegistry,
): PlayerView
```

1. 모든 Zone을 순회하며 `rules.resolve<VisibilityRule>("visibility." + zone.kind)` 조회
2. 조회 결과에 따라 Zone을 필터링:
   - `public` → tileIds 그대로, hiddenCount = 0
   - `owner` → viewerId === zone.owner이면 tileIds 그대로, 아니면 tileIds = [], hiddenCount = 실제 장수
   - `hidden` → tileIds = [], hiddenCount = 실제 장수
   - `count_only` → tileIds = [], hiddenCount = 실제 장수
3. RoundState에서 공개 가능한 정보만 RoundView에 담아 반환

---

# 5. 증강과 가시성의 결합

가시성을 바꾸는 증강은 Rule Modifier 하나만 추가하면 된다.

## 예시: 상대 손패 공개 (Gold 증강)

```ts
defineAugment({
  id: "third_eye",
  tier: "gold",
  name: "천리안",
  description: "모든 플레이어의 손패가 공개된다.",
  install(ctx) {
    ctx.setHolderRule("visibility.hand", "public");
  },
});
```

**주의**: `setHolderRule`은 보유자의 RuleContext(playerId)에서만 적용된다.
"보유자가 보는 뷰에서만" 상대 손패가 공개되는 것이지, 상대의 뷰는 그대로다.
→ 완전한 전체 공개를 원하면 System 레이어 Modifier를 사용한다.

## 예시: 패산 장수 표시 (Silver 증강)

```ts
defineAugment({
  id: "wall_counter",
  tier: "silver",
  name: "패산 카운터",
  description: "남은 패산 장수가 보인다.",
  install(ctx) {
    ctx.setHolderRule("visibility.wall", "count_only");
  },
});
```

---

# 6. 관전자 지원

관전자(spectator)는 모든 것이 공개된 PlayerView다.

```ts
// 관전자는 특수 playerId로 처리
buildPlayerView(state, "__spectator", rules)
```

관전자 뷰에서는 모든 Zone의 가시성을 `public`으로 해석한다.
별도 코드 없이 `visibility.hand` → `public`인 RuleRegistry를 넘기면 된다.

## 6.1 증강 테스트 시점 전환 (2026-07-25 추가)

증강 테스트(샌드박스)에서 관리자는 **다른 좌석 시점으로 뷰를 갈아 볼 수 있다** —
"내가 쓴 능력이 상대에게 어떻게 보이는가"를 그 상대의 가시성 필터 그대로 확인하기 위해서다.
같은 `buildPlayerView`에 `viewerId`만 바꿔 넘기면 되므로 엔진·규칙 수정이 전혀 없다.

- `PlayerAgent.viewSeatOverride?(): PlayerId | null` — 뷰 브로드캐스트 시 이 좌석 대신
  볼 좌석(또는 `SPECTATOR_ID` = 전체 공개)을 돌려준다. `HanchanController.broadcastViews`와
  `resendViewTo`가 `agent.viewSeatOverride?.() ?? agent.id`를 `buildPlayerView`의 viewerId로 쓴다.
  형식텐파이(noYaku) 같은 '본인 뷰' 정보도 **관찰 대상 좌석 기준**으로 채워져 그 좌석의 실제 화면을 재현한다.
- 클라이언트→서버 `sandboxViewAs { seat }`(관리자·샌드박스 전용) → `HumanAgent.setViewSeat`가
  override를 세팅하고 `resendViewTo`가 다음 상태 변화를 기다리지 않고 즉시 새 시점 뷰를 보낸다.
- **관찰 전용**: 결정(`decide`)은 언제나 본인 좌석으로 처리된다. 클라이언트는 `sandbox.seat`(실제 좌석)과
  `view.playerId`(현재 보는 좌석)를 비교해, 다르면 조작 UI를 숨기고 "관찰 중" 배너 + "내 차례" 복귀 안내를 띄운다.

---

# 7. 뒷도라 처리

뒷도라는 화료 시 공개한다. deadWall은 평소 `hidden`이나,
화료 정산(RoundSettled) 이후에는 뒷도라 표시패만 RoundView에 별도 필드로 담는다.

```ts
interface RoundView {
  // ...
  /** 화료 정산 후 공개 (평소 null) */
  uraDoraIndicators: TileId[] | null;
}
```

---

# 7.5 부분 공개(peek)와 증강 정보 채널 (2026-07-16 추가)

## peek 가시성

`VisibilityRule`에 객체 값 `{ mode: "peek", count: N, pick?: "front" | "random" }`이 추가되었다.
소유자에게는 전체, 타인에게는 **N장만** 공개하고 나머지는 장수만 보인다.
`pick` 생략/`"front"`=앞 N장, `"random"`=무작위 N장(손패 tile id 집합을 시드로 잡아
손패가 그대로면 매 렌더 같은 패가 뽑혀, 리렌더로 더 많은 패가 새지 않는다. 쯔모·버림으로
손패가 바뀌면 자연히 다시 뽑힌다). 가시성 규칙 resolve 시 문맥에 `zoneOwner`(존 주인)와
`state`가 함께 전달되므로, Modifier가 "보는 사람이 보유자이고 남의 손패일 때만 peek" 같은
조건을 걸 수 있다.

```ts
// 투시(xray_hand): 상대 손패 무작위 3장 공개
engine.rules.addModifier("visibility.hand", {
  source, layer,
  apply: (cur, ctx) =>
    ctx.playerId === holder && ctx.zoneOwner !== holder
      ? { mode: "peek", count: 3, pick: "random" }
      : cur,
});
```

## augmentView — 증강 정보 채널

`PlayerView.augmentView`는 augmentData의 특정 키를 클라이언트로 흘려보내는 규약이다.

- `view:{playerId}:{key}` → 그 플레이어의 뷰에만 `augmentView[key]`로 담긴다
- `view:*:{key}` → 전원의 뷰에 담긴다 (전원 공개 정보 — 봉인 목록, 현상금 역 등)

값은 JSON 직렬화 가능한 표시용 데이터(kindKey 문자열 등)를 넣는다. tile id를 넣으면
상대 클라이언트에 kind 메타데이터가 없어 렌더링할 수 없다.

`RoundView.direction`(턴 진행 방향)도 함께 노출된다 — 역행 증강 시 자풍 표기용.

---

# 8. 설계 이유 — 왜 별도 시스템인가?

| 접근 방식 | 문제점 |
|-----------|--------|
| 클라이언트에서 필터링 | Server Authority 위반 — GameState 전체가 노출됨 |
| GameState 자체를 분리 | Single Source of Truth 위반 — 상태 이중 관리 |
| **Information Layer** (채택) | 서버가 파생 뷰만 전송. GameState는 하나. 가시성은 Rule이라 증강이 수정 가능 |

---

# 9. 확장 시나리오 점검

| 증강 아이디어 | 구현 방법 | 엔진 수정 |
|---------------|-----------|-----------|
| 상대 손패 공개 | `visibility.hand` → `public` Modifier | 없음 |
| 패산 공개 | `visibility.wall` → `public` Modifier | 없음 |
| 특정 플레이어 손패만 공개 | `visibility.hand.<playerId>` 규칙 추가 | 없음 |
| 관전자 시스템 | `__spectator` playerId + 전공개 규칙 | 없음 |
| 리치 선언 후 손패 공개 (개문리치) | Effect Reaction으로 Modifier 등록·해제 | 없음 |
