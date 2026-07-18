# 03_GAME_STATE
Version : 1.0
Status : Active
Last Updated : 2026-07-15

GameState는 게임의 **유일한 진실**이다 (Single Source of Truth).
구현: `packages/core/src/engine/state/GameState.ts`

---

# 1. 불변 규칙

1. GameState는 **서버에 단 하나** 존재하고, 확정된 Event의 Reducer만이 이를 바꾼다.
2. **JSON으로 직렬화 가능해야 한다.** 클래스 인스턴스·Map·함수를 상태에 넣지 않는다.
   (순수 데이터 + 순수 함수) 구조여야 스냅샷 저장·리플레이·네트워크 전송이 공짜가 된다.
3. PRNG의 내부 상태(`prngState`)도 GameState의 일부다.
   → `시드 포함 초기 상태 + Event Log = 완전한 재현`.
4. 클라이언트가 받는 것은 GameState가 아니라 Information Layer(09)가 걸러낸
   **PlayerView**다. GameState 자체는 절대 밖으로 나가지 않는다.

---

# 2. 전체 구조

```ts
interface GameState {
  config: GameConfig;                 // 시드, 플레이어 목록 — 게임 내내 불변
  prngState: number;                  // 결정론 난수의 현재 상태
  players: PlayerState[];             // 게임 단위 상태 (자리 순서 고정, [0] = 기가)
  tiles: Record<TileId, Tile>;        // 모든 패 인스턴스 (id → 패)
  zones: Record<ZoneId, Zone>;        // 모든 Zone (패의 물리적 위치)
  round: RoundState;                  // 국 단위 상태 (매 국 리셋)
  lastEventSeq: number;               // 마지막으로 적용된 이벤트 번호
}
```

## 게임 단위 vs 국 단위의 분리

**"매 국 리셋되는가?"** 가 기준이다. 이 분리 덕에 국 전환 로직은
"RoundState를 새로 만든다"로 단순해지고, 증강의 지속 범위도 명확해진다
(게임 지속 증강 → PlayerState, 이번 국 한정 효과 → RoundState).

| 게임 단위 (PlayerState) | 국 단위 (RoundState) |
|--------------------------|-----------------------|
| 점수 | 리치 선언·일발·후리텐 |
| 보유 증강 (**전원 공개** — 2026-07-15 확정) | 멜드 목록 |
| 자리(seat) | 도라 표시패, 현재 턴·순·페이즈 |

```ts
interface PlayerState {
  id: PlayerId;       // "p0" ~ "p3"
  seat: number;       // 0~3, [0] = 기가(최초 동가). 게임 내내 불변
  score: number;
  augments: string[]; // 증강 인스턴스 id 목록. 전원에게 공개된다
}

interface RoundState {
  prevalentWind: number;   // 장풍: 1동 2남 (서입 시 3서)
  roundNumber: number;     // 국 번호 1~4
  honba: number;           // 본장
  riichiPot: number;       // 공탁 리치봉 (점수 단위, 이월 포함)
  dealerSeat: number;      // 친의 seat
  turnSeat: number;        // 현재 턴의 seat
  turnCount: number;       // 현재 순 (친의 n번째 쯔모 = n순)
  phase: string;           // 현재 페이즈 id — 전이표는 11_GAME_FLOW에서 데이터로 정의
  doraIndicators: TileId[];// 공개된 도라 표시패 (deadWall 인덱스 규약은 07 §2)
  lastDiscard: { player, tileId } | null; // reaction 대상 (11에서 추가)
  lastDrawnTile: TileId | null;           // 쯔모 화료·리치 후 버림 제한용 (11에서 추가)
  lastDrawRinshan: boolean;               // 영상개화 판정용
  chankan: { player, tileId, closedKan } | null; // 창깡 판정 대상
  kanCount: number;                       // 사깡유국 판정용
  kanCallers: PlayerId[];                 // 깡 선언자 이력
  firstTurn: boolean;                     // 구종구패·사풍연타 판정용
  goAroundBroken: boolean;                // 첫 바퀴 부로 여부 — 더블리치 판정 (11에서 추가)
  byPlayer: Record<PlayerId, PlayerRoundState>;
}

interface PlayerRoundState {
  riichi: RiichiState | null;  // 선언 전 null
  temporaryFuriten: boolean;   // 다음 자기 쯔모까지 론 불가
  riichiFuriten: boolean;      // 리치 후 국 끝까지 론 불가
  furiten: boolean;            // 명시 후리텐 플래그/확장용
  melds: Meld[];               // 의미 정보. 물리 위치는 melds:p Zone (07 §4)
}
```

- 자풍은 저장하지 않는다 — `(seat - dealerSeat + 4) % 4`로 유도 가능한 값은
  상태에 넣지 않는다 (중복 = 불일치 버그의 씨앗).
- phase는 열린 문자열이다. 표준 페이즈 외에 증강이 새 페이즈(새로운 Zone에서의
  선택 단계 등)를 추가할 수 있다 — Issue 003의 해결 방향.

---

# 3. 상태 생성과 국 준비

```
createInitialGameState(config, options)
  → 136장 생성(전부 wall), 표준 Zone 13개, 점수 배분, 1국 RoundState

setupRound(state)
  → PRNG로 wall 셔플 → deadWall 14장 분리 → 친부터 13장씩 배패
  → 첫 도라 표시패 공개 → 친의 쯔모 대기 상태로
```

- 둘 다 **순수 함수**다: 이전 상태를 받아 새 상태를 반환하고, 원본을 건드리지 않는다.
- `setupRound`가 소비한 난수만큼 `prngState`가 전진한다. 같은 시드는 같은 배패를 만든다.
- 시작 점수·적도라 수 등은 호출자(Core Engine)가 RuleRegistry에서 읽어 옵션으로
  넘긴다. GameState 모듈 자신은 RuleRegistry를 모른다 (의존 방향 단순화).

---

# 4. 스냅샷과 리플레이

- **리플레이 파일** = `초기 GameState(시드 포함) + Event Log (JSONL)`.
- 특정 시점 복원 = 초기 상태에서 Event를 seq 순서로 재적용.
- 긴 게임의 빠른 복원이 필요해지면 주기적 스냅샷(예: 매 국 시작)을 추가한다 —
  구조상 `JSON.stringify(state)` 한 줄이므로 언제든 넣을 수 있다.

---

# 5. 확장 시나리오 점검

| 증강 아이디어 | 상태 변경 | 엔진 수정 |
|---------------|-----------|-----------|
| 점수 이자 (매 국 +500) | RoundState 전환 시 Effect가 score 변경 이벤트 방출 | 없음 |
| 이번 국 한정 버프 | RoundState.byPlayer에 증강이 쓰는 임시 데이터* | 없음* |
| 5번째 플레이어(관전 봇) | players 배열은 가변 길이 — seat 로직만 Rule로 | 없음 |
| 새 페이즈 삽입 | phase 문자열 + 전이표 데이터 추가 (11) | 없음 |

\* 증강 전용 임시 데이터를 어디 둘지는 10_AUGMENT_SYSTEM에서 설계한다
(후보: `RoundState.augmentData: Record<string, unknown>`). 현재는 미정.
