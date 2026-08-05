# 00_MASTER_ARCHITECTURE
Version : 1.0
Status : Active
Last Updated : 2026-07-15

이 문서는 프로젝트 전체의 지도다.
각 시스템의 세부 설계는 번호가 매겨진 개별 문서(01~13)에서 다루고,
여기서는 **구조와 데이터 흐름, 시스템 간의 경계**만 정의한다.

---

# 1. 설계 목표

PROJECT_CHARTER의 핵심 목표를 아키텍처 언어로 번역하면 다음과 같다.

> "증강 1000개를 엔진 수정 없이 추가할 수 있어야 한다."

이를 위해 모든 구조는 아래 질문을 기준으로 검증한다.

- 새로운 증강이 이 시스템을 바꾸고 싶을 때, **엔진 코드를 고치지 않고** 가능한가?
- 가능하지 않다면, 어떤 **등록 지점(Registry / Hook)** 을 열어줘야 하는가?

---

# 2. 기술 스택 (확정)

| 영역 | 선택 | 이유 |
|------|------|------|
| 언어 | TypeScript (전 영역) | 클라이언트·서버·콘텐츠가 게임 타입과 로직을 공유 |
| 프론트엔드 | React + Vite | 확정 사항 |
| 백엔드 | Node.js 22 + `ws` (WebSocket) | 단일 언어, 성숙한 실시간 생태계 |
| 실시간 | WebSocket (JSON 메시지) | 확정 사항 |
| 영속성 (MVP) | 인메모리 게임 상태 + JSONL 이벤트 로그 파일(리플레이) | DB 없이 시작, 리플레이는 이벤트 로그 그 자체 |
| 영속성 (이후) | SQLite → 필요 시 PostgreSQL | 계정·전적·랭크가 생길 때 도입 |
| 테스트 | Vitest | 엔진은 순수 로직이므로 단위 테스트가 핵심 안전망 |
| 배포 | macOS 서버, 단일 Node 프로세스 | 확정 사항 |

---

# 3. 패키지 구조 (모노레포)

npm workspaces 기반 모노레포.

```
newMajak/
├── PROJECT_CHARTER.md
├── PROJECT_STATUS.md
├── docs/                  # 00~13, 99 설계 문서
├── packages/
│   ├── core/              # @majak/core    — 순수 게임 엔진 (I/O 없음)
│   ├── content/           # @majak/content — 증강·역 등 콘텐츠 정의
│   ├── server/            # @majak/server  — 권위 서버 (WebSocket, 방, 봇 구동)
│   └── client/            # @majak/client  — React UI
└── replays/               # 게임별 JSONL 이벤트 로그 (서버가 기록)
```

## 의존 방향 (절대 규칙)

```
client ──▶ core ◀── server
             ▲
          content
```

- **core는 아무것도 의존하지 않는다.** Node API, DOM, 네트워크, 파일시스템 금지.
  순수 함수와 데이터만 존재한다. 그래서 서버(권위 실행)와 클라이언트(표시·검증)가 같은 코드를 쓴다.
- **content는 core의 등록 API만 사용한다.** 증강 하나 = content 안의 파일 하나.
  엔진(core)을 수정하는 순간 설계 실패로 간주한다.
- **server와 client는 서로를 모른다.** 공유가 필요한 타입(프로토콜 메시지 등)은 core에 둔다.

---

# 4. 핵심 데이터 흐름

차터가 확정한 `Action → Event → Effect → GameState` 파이프라인의 전체 그림.

```
 [클라이언트 / 봇]
      │  ① ActionRequest ("나 이 패 버릴래")
      ▼
 [Action System]  ── ② RuleRegistry에 질의: 이 행동이 지금 합법인가?
      │              (불법이면 거부 응답, 상태 변화 없음)
      ▼
 [Event 생성]     ── ③ 합법이면 Action을 Event(들)로 변환 (TileDiscarded 등)
      ▼
 [Effect System]  ── ④ 이 Event에 반응하도록 등록된 Effect들이
      │              우선순위 순으로 실행 (증강의 훅이 여기 걸림)
      │              Effect는 Event를 수정·취소하거나 새 Event를 방출할 수 있다
      ▼
 [Reducer]        ── ⑤ 확정된 Event가 GameState를 갱신 (유일한 상태 변경 지점)
      ▼
 [Event Log]      ── ⑥ 확정 Event를 순서대로 기록 (= 리플레이 = 디버깅 자료)
      ▼
 [Information Layer] ─ ⑦ 플레이어별로 볼 수 있는 것만 걸러낸 PlayerView 생성
      ▼
 [각 클라이언트 / 봇에게 전송]
```

## 불변 규칙

1. **GameState를 바꾸는 유일한 방법은 확정된 Event다.** (Single Source of Truth)
2. **모든 난수는 GameState 안의 시드 PRNG에서 나온다.** `Math.random()`, `Date.now()` 는 core에서 금지.
   → 시드 + Event Log만 있으면 어떤 게임도 완전히 재현된다 (리플레이·버그 재현·디버깅).
3. **서버만 이 파이프라인을 실행한다.** 클라이언트는 ActionRequest를 보내고 PlayerView를 받을 뿐이다. (Server Authority)

---

# 5. 시스템 구성 요소

각 시스템의 한 줄 정의와 담당 문서. 세부 설계는 각 문서에서.

| 시스템 | 역할 | 문서 |
|--------|------|------|
| Core Engine | 파이프라인 실행기. Action 접수 → Event 확정 → 상태 갱신 루프 | 02 |
| Game State | 단 하나의 진실. 패·점수·순서·증강 보유 현황 전부 | 03 |
| Rule System | 모든 규칙 값·판정을 이름 붙은 Rule로 관리. 증강이 덮어씀 | 04 |
| Effect System | Event에 반응하는 훅 시스템. 증강 능력의 실행 지점 | 05 |
| Action System | 플레이어가 할 수 있는 행동의 정의·검증·프롬프트 | 06 |
| Tile System | 패와 Zone(패가 존재하는 공간)의 정의와 이동 연산 | 07 |
| Mahjong Engine | 리치마작 도메인 로직: 화료 판정, 역·부·판 계산, 텐파이 | 08 |
| Information System | 플레이어별 가시성 제어. "누가 무엇을 볼 수 있는가"도 Rule | 09 |
| Augment System | 증강 정의·드래프트·수명 관리 | 10 |
| Game Flow | 국·순·페이즈 진행. 동사국 → 다음 국 → 종국 판정 | 11 |
| Network & Replay | WebSocket 프로토콜, 재접속, 리플레이 저장·재생 | 12 |
| Content Pipeline | 새 증강·역을 등록하는 방법과 규약 | 13 |

## 5.1 Rule System — 증강 충돌의 해답 (Issue 001 해결)

모든 규칙은 `RuleRegistry`에 **이름 붙은 값**으로 존재한다.

```
"riichi.cost"            → 1000
"hand.maxSize"           → 13
"call.pon.enabled"       → true
"yaku.kokushi.allowOpen" → false
```

증강은 규칙을 직접 바꾸지 않고 **Modifier(수정자)를 등록**한다.
같은 규칙에 여러 Modifier가 붙으면 아래 순서로 결정적으로 합성된다.

```
정렬 기준: (Layer, priority, 등록 순서)

Layer:  Base(0) < Silver(100) < Gold(200) < Prism(300) < System(1000)
```

- 등급이 높은 증강이 나중에 적용된다 (= 최종 발언권).
- 같은 등급끼리는 **획득한 순서**대로 적용된다. 항상 결정적이고, 리플레이가 보장된다.
- System 레이어는 엔진 보호용 (예: 점수 하한선 같은 안전장치).

## 5.2 Zone — "패가 있는 공간"의 일반화

패산, 손패, 버림패, 후로, 왕패를 전부 **Zone**이라는 동일한 개념으로 다룬다.

```
wall / deadWall / hand[p] / melds[p] / discards[p] / (증강이 만든 커스텀 Zone)
```

- 모든 패 이동은 "Zone A → Zone B" 연산(TileOperation Event)이다.
- 쯔모 = wall→hand, 버림 = hand→discards, 펑 = discards→melds. 전부 같은 연산의 조합.
- **Prism 증강이 "새로운 Zone 생성"·"벽 구조 변경"을 하려면 Zone을 하나 등록하고
  이동 규칙만 정의하면 된다.** 엔진은 Zone이 몇 개인지 모른다.

## 5.3 Information Layer — 가시성도 규칙이다

서버는 전체 상태를 알고, 각 플레이어에게는 **걸러낸 PlayerView**만 보낸다.

- 각 Zone에는 가시성 Rule이 있다: `visibility.hand[p]` → "본인만", `visibility.discards` → "전원".
- "상대 패 확인", "패산 공개" 같은 Gold/Silver 증강은 **가시성 Rule에 Modifier를 붙이는 것**뿐이다.
- 클라이언트에 전송되지 않은 정보는 해킹으로도 볼 수 없다 (Server Authority의 실질적 의미).

## 5.4 Player Agent — 사람과 봇은 같은 인터페이스

```ts
interface PlayerAgent {
  onView(view: PlayerView): void;                    // 상태 갱신 수신
  decide(prompt: DecisionPrompt): Promise<Decision>; // 선택 요청 (버릴 패, 펑 여부, 드래프트 픽…)
}
```

- 사람 = WebSocket 세션에 연결된 HumanAgent (시간 초과 시 기본 행동).
- 봇 = 같은 인터페이스를 구현한 BotAgent (규칙 기반: 화료 → 액티브 증강 → 깡 → 후로 → 리치 → 버림).
  액티브 증강 발동은 각 증강 파일의 `AugmentDef.bot` 정책에 위임한다 (10 §6, 콜로케이트).
- 엔진은 상대가 사람인지 봇인지 **모른다.** 혼자서 봇 3명과 테스트 플레이 가능.

**봇의 판단 구조 (2026-07-29 재작성)** — `packages/server/src/bot/`. 매 결정마다 뷰 하나로
판을 한 번 읽고(`read.ts`) 네 갈래 판단이 그 읽기를 나눠 쓴다.

| 모듈 | 판단 | 근거 |
|------|------|------|
| `decide.ts` | **결정 코어** | 모든 후보가 점수로 입찰하고 이긴 것이 실행된다 (아래 참고) |
| `read.ts` | 판 읽기 스냅샷 | 샹텐·대기·도라·잔여 장수·상대 위협·순위를 결정당 1회 계산 |
| `value.ts` | 값어치 · 화료 확률 | 예상 판수 → 코어 점수표로 **점수**, 대기·우케이레·순목 → 화료 확률 |
| `match.ts` | 순위·판돈 | 점수판과 남은 국 수 → 위험 감수 성향 `riskAppetite`(-1 지킨다 ~ +1 뒤집는다) |
| `discard.ts` | 버림 · 리치 | **기대 획득(확률×값어치) − 기대 실점(확률×실점)** 의 뺄셈 하나 |
| `call.ts` | 후로 | 샹텐이 실제로 줄고(역패 펑만 예외) 화료할 역이 있을 때만. 종반엔 형식텐파이 |
| `kan.ts` | 깡 | 손이 상하지 않을 때만. 남이 리치 중이면 새 도라를 열어 주지 않는다 |
| `danger.ts` | 위험 읽기 | 현물·스지·노찬스 → 방총 확률, 상대 후로·리치·도라 → **예상 실점**. 곱해서 기대 실점 |
| `profile.ts` | 성격 | 시드에서 뽑는 공격성·후로 문턱·리치 성향·생각 시간 배율 (봇마다 다르게) |

샹텐·우케이레 계산기는 코어(`mahjong/scoring/shanten.ts`)에 있다 — 봇과 증강 정책이 함께 쓴다.

**단일 눈금 (2026-08-05).** 예전에는 판단마다 단위 없는 점수를 손으로 맞췄고
(`push*efficiency + fold*safety*14`), 그래서 서로 다른 판단을 비교할 수 없었다.
지금은 모든 판단이 **점수**라는 눈금 하나 위에서 이루어진다 — 값어치는 코어 점수표
(`calculateScore`)로, 확률은 대기 장수·남은 순목으로 낸다. 성격과 순위 압박은 판단
규칙을 갈라 놓지 않고 이 뺄셈의 양쪽에 곱해지는 **저울**로만 붙는다. 새 판단(증강·깡·
후로)을 이 축에 얹을 때 새 상수를 만들 필요가 없고, 봇이 왜 그렇게 뒀는지도 점수로
설명된다.

게임 모드(반장전/동풍전)는 뷰에 없어 서버가 게임 시작 시 `BotAgent.setGameMode`로
알려 준다 — "지금이 올라스인가"를 알아야 순위를 지키거나 뒤집는 판단이 나온다.

**입찰 코어 (2026-08-05).** 예전 `decideNow`는 고정된 우선순위 사슬이었다
(`화료 → 증강 → 깡 → 후로 → 리치 → 버림`). 각 단계가 "한다/안 한다"만 돌려주고
앞 단계가 하겠다면 뒤 단계는 물어보지도 않아서, **봇은 비교를 한 적이 없었다** —
이 펑이 리치보다 이득인지 물을 자리가 구조적으로 없었고, 새 판단은 사슬 어딘가에
끼워 넣어야 했다(그 위치가 곧 판단이 되어 버린다). 지금은 전부 점수로 입찰한다.

| 층 | 행동 | 입찰값의 뜻 | 뽑는 법 |
|----|------|-------------|---------|
| 화료 | 론·쯔모 | — | 무조건 |
| 추가 행동 | 깡 · 액티브 증강 | 안 했을 때 대비 **한계 이득** | 양수(문턱 초과) 중 최대 |
| 턴 소비 | 버림 · 리치 · 후로 · 패스 | 그 뒤 판의 **절대 EV** | 최대 |

남은 층 구분은 취향이 아니라 규칙이다 — 깡과 증강은 턴을 소비하지 않아 다른 행동과
애초에 경쟁하지 않는다(하고 나서 그대로 버릴 수 있다). 그래서 **다마텐도 '울지 않기'도
규칙이 아니라 결과**다: 그쪽 입찰이 이긴 것뿐이다. 증강 정책 115개는 `BOT_WEIGHT`라는
자기 눈금(0~100)을 그대로 쓰고, `augmentPoints`가 두 눈금 사이의 환율이 된다 —
정책을 한 줄도 고치지 않고 같은 축에 올라온다. 모든 입찰에는 `reason`이 붙는다.

## 5.5 Augment System — 증강 하나의 해부도

증강 = **데이터 + Modifier 목록 + Effect 핸들러 목록**. content 패키지의 파일 하나.

```ts
defineAugment({
  id: "cheap_riichi",
  tier: "silver",
  name: "가벼운 선언",
  description: "리치 비용이 500점이 된다.",
  modifiers: [{ rule: "riichi.cost", apply: () => 500 }],
  effects: [],   // 필요하면 Event 훅 등록
});
```

드래프트 (확정된 방식, 2026-07-15 수정):

- **지정된 국의 첫 진입마다 1개씩** (2026-08-04 변경):
  동풍전 동1·동3·동4 **총 3개**, 반장전 동1·동3·남1·남3 **총 4개**.
- 각 플레이어에게 **개인별 랜덤 3개 제시 → 1개 선택**.
- 3개 뽑기도 GameState의 시드 PRNG를 사용한다 (리플레이 보장).
- 스케줄(`HanchanConfig.draftSchedules`)과 드래프트 로직 자체도 Rule/모듈이라,
  이후 "매 국 드래프트" 같은 변형 모드를 설정 변경만으로 실험할 수 있다.
- 한 사람이 3~4개를 동시에 굴린다 — 증강 간 중첩 밸런스는 10_AUGMENT_SYSTEM에서 설계.

---

# 6. 네트워크 (개요)

세부는 12_NETWORK_REPLAY에서. 뼈대만:

- 전송: WebSocket, JSON 메시지.
- 클라이언트 → 서버: `ActionRequest`, `DecisionResponse`, 방 입장/퇴장.
- 서버 → 클라이언트: `ViewUpdate`(PlayerView), `DecisionPrompt`, 에러.
- 재접속: 방 입장 시 발급되는 토큰으로 세션 복구. 서버가 현재 PlayerView를 다시 보내면 끝
  (상태가 서버에만 있으므로 복구가 단순하다).
- MVP 로비: 닉네임만으로 방 생성/참가. 계정 시스템은 이후.

---

# 7. 미정 사항 (다음 결정 대상)

| 항목 | 상태 |
|------|------|
| 리치마작 세부 룰 | ✅ 확정 — 01_GAME_RULES 참조 (반장전, 적도라 3, 쿠이탄 허용, 25000/30000 우마 10-20) |
| 증강 밸런스 수치 (등급별 등장 확률 등) | 10_AUGMENT_SYSTEM 작성 시 결정 |
| 랭크 시스템 | 보류 (MVP 이후) |
| 관전자 시스템 | 보류 (Information Layer가 자연스럽게 지원 — "전부 보이는 PlayerView"일 뿐) |
| 계정/DB 구조 | 보류 (MVP는 닉네임 + 파일 리플레이) |

---

# 8. 확장 시 예상 이슈 (미리 기록)

- **Effect 연쇄 폭주**: 증강 A의 Effect가 낸 Event가 증강 B를 발동시키고… 무한 루프 가능.
  → Effect 실행 깊이 제한 + 같은 트리거 재진입 금지 규칙을 Effect System에 내장한다. (05에서 설계)
- **패 변환과 역 계산의 충돌 (Issue 002)**: 역 판정은 "패의 현재 속성"만 보도록 설계한다.
  패가 어디서 왔는지가 아니라 지금 무엇인지가 진실. (07·08에서 설계)
- **Prism의 한계 (Issue 003)**: "게임 진행 순서 변경"류는 Game Flow의 페이즈 전이표 자체를
  Rule로 만들어야 지원 가능. 11에서 페이즈 전이를 데이터로 정의한다.
