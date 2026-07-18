# 07_TILE_SYSTEM
Version : 1.0
Status : Active
Last Updated : 2026-07-15

패(Tile)와 패가 존재하는 공간(Zone), 그리고 패 이동 연산(TileOperation)의 정의.
구현: `packages/core/src/mahjong/tiles/Tile.ts`, `packages/core/src/engine/zones/Zone.ts`

---

# 1. 설계의 핵심: 정체성과 속성의 분리

**Issue 002(패 변환과 역 계산의 충돌)의 해답이 여기 있다.**

```ts
interface Tile {
  id: TileId;        // 물리적 정체성. 게임 내내 절대 변하지 않는다
  kind: TileKind;    // 현재 종류 (5만, 동풍…). 증강이 바꿀 수 있다
  attrs: TileAttrs;  // 확장 가능한 속성 주머니 (red = 적도라 등)
}
```

- **id는 불변이다.** 이벤트 로그·Zone은 항상 id로 패를 가리킨다.
  덕분에 "이 패가 어디로 이동했는가"의 역사가 변형과 무관하게 추적된다.
- **kind와 attrs는 가변이다.** 증강이 "5만을 백판으로 바꾸는" 효과는
  `TileTransformed` 이벤트로 kind를 바꾸는 것이다.
- **역·점수 계산은 오직 현재의 kind·attrs만 본다.** 패의 과거는 보지 않는다.
  → 패가 어떻게 변형됐든 역 계산 로직은 수정할 필요가 없다.

## TileKind

```ts
interface TileKind {
  suit: string;   // "man" | "pin" | "sou" | "wind" | "dragon" + 증강이 등록하는 새 suit
  rank: number;   // 수패: 1~9 / 풍패: 1동 2남 3서 4북 / 삼원패: 1백 2발 3중
}
```

- suit는 **열린 문자열 집합**이다. 표준 5종은 `Suits` 상수로 제공하지만,
  Prism 증강이 새로운 suit("flower" 등)를 등록해도 엔진은 수정되지 않는다.
- 판정 헬퍼(`isHonor`, `isTerminal`, `isTerminalOrHonor`, `sameKind`, `kindKey`)는
  kind만 보고 동작한다.

## 표준 패 세트

- `buildStandardTileSet()` — 136장 (만·통·삭 1~9 ×4 + 자패 7종 ×4).
- 적도라: 수패 suit마다 5의 첫 번째 사본에 `attrs.red = true` (기본 3장, 01_GAME_RULES).
- id는 0~135, 생성 순서 고정 (suit → rank → 사본). **섞는 것은 국 시작 시 PRNG의 일이다.**

---

# 2. Zone — 패가 존재하는 공간

패산, 손패, 버림패를 전부 같은 구조로 다룬다.

```ts
interface Zone {
  id: ZoneId;        // "wall", "hand:p0", "discards:p2", 커스텀…
  kind: string;      // "wall" | "deadWall" | "hand" | "discards" | "melds" | 커스텀
  owner?: PlayerId;  // 플레이어 소속 Zone일 때
  tileIds: TileId[]; // 순서 있는 목록 — 순서가 곧 의미다
}
```

## 표준 Zone 구성 (4인 기준 14개 = wall + deadWall + 플레이어당 3개)

| Zone id | kind | 순서의 의미 | 가시성 Rule 기본값 |
|---------|------|-------------|--------------------|
| `wall` | wall | 쯔모 순서 (앞에서 뽑음) | 아무도 못 봄 |
| `deadWall` | deadWall | §3 참조 | 도라 표시패만 공개 |
| `hand:p{n}` | hand | 정렬은 클라이언트 표현일 뿐, 서버는 무순서 취급 | 본인만 |
| `discards:p{n}` | discards | 버린 순서 (후리텐·리치 선언패 판정) | 전원 |
| `melds:p{n}` | melds | 부로한 순서 | 전원 |

- 가시성은 Zone에 저장하지 않는다. `visibility.<zone kind>` Rule이며
  Information Layer(09)가 조회한다. "패산 공개" 증강 = `visibility.wall`에 Modifier 하나.
- Prism 증강의 **커스텀 Zone**은 Zone 하나를 등록하고 가시성 Rule을 정의하면 끝이다.
  엔진은 Zone 목록을 열거할 뿐, 표준 Zone과 커스텀 Zone을 구분하지 않는다.

## deadWall 내부 규약 (14장)

| 인덱스 | 역할 |
|--------|------|
| 0~3 | 영상패 (깡 보충패, 0부터 사용) |
| 4, 6, 8, 10, 12 | 도라 표시패 (4가 첫 표시패, 깡마다 다음 인덱스 공개) |
| 5, 7, 9, 11, 13 | 우라도라 표시패 (바로 앞 도라 표시패와 짝) |

깡 발생 시 패산 마지막 패 1장이 deadWall로 이동해 14장을 유지한다 — 이것도 Zone 이동 연산이다.

---

# 3. TileOperation — 단 하나의 이동 원시 연산

모든 패 이동은 아래 하나의 연산으로 표현된다.

```ts
moveTiles(zones, from, to, tileIds, insertAt?)  // 순수 함수, 새 zones를 반환
```

| 게임 행동 | Zone 연산 |
|-----------|-----------|
| 쯔모 | `wall[0]` → `hand:p` |
| 버림 | `hand:p` → `discards:p` (맨 뒤에 추가) |
| 펑/치 | `discards:상대` 마지막 패 + `hand:p` 2장 → `melds:p` |
| 영상패 쯔모 | `deadWall[0~3]` → `hand:p`, 이어서 `wall` 마지막 → `deadWall` |
| 버림패 회수 (Gold 증강) | `discards:p` → `hand:p` |
| 커스텀 Zone 증강 | 등록한 Zone ↔ 기존 Zone |

- 존재하지 않는 패를 옮기려 하면 **즉시 예외** (엔진 버그 조기 발견).
- 실제 게임에서는 이 연산이 `TilesMoved` 이벤트의 Reducer로 실행된다 (02_CORE_ENGINE).
- 어떤 이동이 **합법인지**는 Tile System의 관심사가 아니다 — Action System(06)과
  RuleRegistry가 판정한다. 여기는 물리 법칙만 담당한다.

---

# 4. 멜드(부로 묶음)의 이중 표현

- **물리적 위치**: 부로된 패들은 `melds:p` Zone에 있다 (Tile System 관심사).
- **의미**: 어떤 패들이 하나의 묶음인지, 누구에게서 울었는지는
  `PlayerRoundState.melds`(03_GAME_STATE)의 Meld 메타데이터가 담는다.

Zone은 "패가 어디 있는가"만 알고, 게임 의미는 GameState의 도메인 데이터가 안다.
이 분리 덕에 "멜드를 해체하는" 증강도 Zone 이동 + 메타데이터 수정으로 표현 가능하다.

---

# 5. 확장 시나리오 점검

| 증강 아이디어 | 필요한 것 | 엔진 수정 |
|---------------|-----------|-----------|
| 적도라 추가 | 특정 패에 `attrs.red = true` | 없음 |
| 패를 다른 패로 변형 | `TileTransformed` 이벤트로 kind 교체 | 없음 |
| 새로운 패 종류 (꽃패 등) | 새 suit + 패 인스턴스 추가 이벤트 | 없음 |
| 패산 공개 | `visibility.wall` Modifier | 없음 |
| 개인 "보관함" Zone | Zone 등록 + 이동 Rule + 가시성 Rule | 없음 |
| 5번째 사본 추가 | 새 Tile 인스턴스 생성 (id는 신규 발급) | 없음 |
