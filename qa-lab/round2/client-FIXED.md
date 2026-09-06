# 클라이언트 감사 수리 기록 (`qa-lab/round2/client.md` 대응)

- 대상: 확정 31건(🔴2 · 🟠17 · 🟡12) + 의심 12건 + 다른 담당의 도감 검색 건 1건.
- **고친 것 32건 · 안 고친 것 3건**(이유는 §3).
- 회귀 테스트: `packages/client/test/qaRound2Client.test.ts` **신규 52개** +
  `codexFilter.test.ts` **+3** + 기존 가드 2개 보강(`a11yPerfGuards`·`bootAndCrashGuards`).
- 검증: `npx vitest run --root packages/client` **39파일 608테스트 전부 통과**(기준선 38/556) ·
  타입체크 4종 0에러 · `npm run build:client` 성공.

원칙은 두 가지였다. ① **같은 실수가 다시 나지 않게** — 개수를 세던 가드는 성질을
보게 바꾸고, 두 곳에 복사돼 있던 술어는 함수로 묶었다. ② **고칠 수 없는 것은
문구를 사실에 맞춘다** — 콘텐츠·코어를 못 건드리는 건은 거짓말하는 주석을 지웠다.

---

## 1. 확정 — 번호별로 무엇을 어떻게 고쳤나

### 1·2·15 (앞선 시도가 남긴 CSS 수리) — 검증만
셋 다 워킹트리에 이미 들어와 있었다. **맞게 됐는지 확인하고 못을 박았다.**

- **1** `.prod-skip` 이 `.toast-stack` 과 같은 `--own-band-full` 기준으로 비켜선다. ✅
- **2** `--own-reserve: 68px` 블록이 `@container ui (max-width: 480px)` 로 옮겨졌다. ✅
  - **다른 규칙을 깨지 않는지 확인**: 그 블록이 켜는 값은 `--own-reserve`·
    `.hand-tile { min-height }`·`.own-area { bottom }`·`.quick-toggles` 접기 등
    **전부 좁은 배치의 동반 수리**다. 같은 파일의 다른 반응형 규칙 51개가 이미
    `@container ui` 기준이고, `body { container: ui / size }` 라 `cqw` 도 같은 저울을
    쓴다 — 저울이 하나로 모였을 뿐 기준값(480px)은 그대로다.
    `--own-reserve` 를 켜는 곳이 파일에서 **여전히 한 곳뿐**임을 테스트로 못 박았다
    (두 저울에 나뉘면 같은 어긋남이 되살아난다).
- **15** `.emote-toggle:focus-visible` 로 황동 링을 되돌렸다. ✅
  - 다만 **가드가 이 수리를 오탐**했다: `a11yPerfGuards` 가 `outline: none` 을
    «한 곳뿐»으로 **개수**를 세고 있었다. 그 셈은 «전역 규칙이 파일 끝에 있다»는
    전제 위에 서 있었고, 그 전제가 깨진 것이 바로 확정 15다. 개수가 아니라
    **같은 블록에 황동 링이 함께 있는가**를 보도록 바꿨다 — 링을 되돌리는 수리는
    통과하고, 링 없이 지우기만 하는 규칙은 몇 개든 잡힌다.

### 3 🟠 튜토리얼 코치 누수 (소프트락)
`resetGameState()` 에서 `setCoachOn(false)` · `coachOnRef.current = false` ·
`setCoachLock(null)` · 코치 hold 표식(`coachHoldSent`/`coachHoldWanted`/타이머)까지
되돌린다. 방을 떠나는 경로(`returnHome`·`logout`·`gameAborted`·`kicked`·
`SESSION_REVOKED`·`TOKEN_INVALID`·`GAME_CRASHED`)가 **전부 이 한 곳을 지난다** —
끄는 자리를 하나로 모았다. 튜토리얼을 **켜는** 두 경로(가입 직후·홈 버튼)는
`resetGameState` 를 지나지 않으므로 영향이 없다(호출부 7곳 전수 확인).

> 마운트 조건에 「튜토리얼 방인가」를 함께 걸자는 제안은 **채택하지 못했다**:
> 프로토콜에 방 종류를 알려 주는 필드가 없다(`tutorial` 은 클라 → 서버 방향뿐).
> 서버를 손대야 하는 일이라 이번 범위 밖이다.

### 4 🟠 드래그 중 프롬프트가 죽으면 낡은 액션이 나간다
세 겹으로 막았다.

1. `dragLiveRef` — `discardOptionFor`·`autoSort`·`armedAug`·`onSubmit`·`sel.submit`
   을 렌더마다 갱신하고 리스너는 늘 여기서 읽는다(재구독은 그대로 `[drag !== null]`
   하나 — 매 렌더 떼었다 붙이면 포인터 이벤트를 흘린다).
2. `onUp` 에서 **드롭존 위인가를 다시 잰다.** 드롭존이 언마운트됐으면
   `dropzoneRef.current` 가 null 이라 자연히 false 가 되어 재정렬로 물러난다.
3. `submitOption` 의 `dropPrompt` 를 «지금 떠 있는 프롬프트가 이 수를 갖고 있을
   때만» 으로 좁혔다 — 낡은 타패가 새 론 프롬프트를 걷어 가지 못한다.

### 5 🟠 드래그 직후의 진짜 클릭 한 번이 먹힌다
`suppressClickRef`(boolean) → `suppressClickUntil`(시각, `SUPPRESS_CLICK_MS = 250`).
플래그를 푸는 자리가 타일 `onClick` 안뿐이라, click 이 타일이 아닌 조상에서 나는
경우(재정렬·드롭존 드롭) true 로 남았던 것이 원인이다. 시각으로 재우면 어디서
click 이 나든 저절로 풀린다.

### 6 🟠 우마·오카가 k단위
클라에서 `(r.uma * 1000).toLocaleString()` · `(r.oka * 1000).toLocaleString()` 로
점 단위 통일. (`protocol.ts` 의 주석도 실제 값과 다르지만 **core 는 손대지 말라는
지시**라 남겨 뒀다 — §3-2.)

### 7 🟠 리치 전환에서 두 번 탭 게이트가 뚫린다
`useEffect(() => setArmedTileId(null), [props.riichiMode])`.

### 8 🟠 무장형 리치에는 게이트가 아예 안 걸린다
무장 분기 안(`opts.length === 1` 경로)에서도 `tapTwiceToDiscard` 를 먼저 본다.
`DRAG_DISCARD_ARM_TYPES`(= «무장 → 버릴 패를 고른다» 형)에만 건다 — 나머지 선택형
증강은 대상 지목이라 취소가 되고, 게이트를 걸면 손만 늘어난다. 게이트를 통과한
뒤에는 `setArmedTileId(null)` 로 반드시 내린다.

### 9 🟠 «진동»을 꺼도 계속 울린다
양쪽 다 고쳤다 — **한쪽만 고치면 같은 일이 또 난다.**
- 동기화 이펙트 의존성: `[settings.sfxOn]` → `[settings.sfxOn, settings.sfxVolume, settings.haptics]`
- `updateSetting`: `key === "haptics"` 분기를 켜기/끄기 양방향으로
  (`setHapticsEnabled(value === true && hapticsSupported())`). 끌 때는 울리지 않는다.

### 10 🟠 중계 오버레이가 내 판을 크로마키로 칠한다
두 겹. ① `overlayMode={spectating === null ? "off" : overlayMode}` — 관전 중이 아니면
값이 남아 있어도 내 판에 못 붙는다. ② `resetGameState()` 에서 `setOverlayMode("off")`.

### 11 🟠 내 후로 넉 장이 손패 위로 올라탄다
`.own-corner-right` 에 `max-width: var(--own-corner-max, none)` + `overflow-x: auto`.
CSS 만으로는 손패 레일 폭을 알 수 없어서(`--hand-w`·`--hand-slots` 는 레일에서만
치환된다) 띠를 재는 `useLayoutEffect` 에서 **«레일 오른쪽에 남는 폭»을 함께 실측해**
`--own-corner-max` 로 올려 준다(`OWN_CORNER_GUTTER = 28` · `OWN_CORNER_MIN_W = 120`).
대국 밖에서는 변수가 없으므로 예전처럼 상한이 없다.

### 12 🟠 «✦ 액티브 증강 (0)» + 빈 메뉴 + «undefined 사용»
`menuOptions = augOptions.filter(o => o.type !== "foresight_order")` 를 세워
`usable`·조기 반환·툴팁이 **같은 목록**을 보게 했다. `byType` 에는 그대로 남겨 둔다
(드래그 모달이 거기서 후보를 골라 제출한다). 툴팁의 `types[0]!` 단언도 걷었다 —
그 단언이 «undefined 사용»을 화면까지 흘려보낸 장본인이다.

### 13 🟠 리플레이가 순위표 뒤에서 열린다
`.replayer { z-index: 55; isolation: isolate; }`.
**순위표를 걷지 않고 위로 올린 이유**: 걷어 버리면 뷰어를 닫았을 때 「이어하기」·
「로비로」로 돌아갈 길이 없어진다. `isolation` 으로 안쪽 z-index 를 상자 안에 가둬
재생 바가 다시는 바깥 오버레이와 높이를 다투지 않게 했다.

### 14 🟠 리플레이 재구성이 한 줄에 통째로 죽는다
`replayRebuild.ts` 의 루프를 서버 `ReplayReader` 와 **같은 정책**으로 감쌌다:
`JSON.parse` 실패는 «여기까지»로 break, `dispatch` 예외도 같이 받는다(클라는 서버와
달리 콘텐츠 버전이 어긋난 옛 판을 열 수 있다). `installAugment` 실패도 판을 닫지
않는다. 잘린 줄을 붙인 입력으로 «그 앞까지 되살아나는지»를 실제로 돌려 확인한다.

### 16 🟠 폐기된 `#5f7469` 9곳
전부 `var(--ink-4)` 로 치환. 파일에 리터럴이 하나도 남지 않았음을 테스트로 못 박았다.

### 17 🟠 `vw` 두 곳
`.room-notice` `86vw → 86cqw` · `.pause-card` `90vw → 90cqw`.
파일 전체에 `vw/vh/vmin` 이 하나도 없음을 테스트로 못 박았다.

### 18 🟠 함구령의 «남은 횟수»가 안 뜬다
`call_seal` 분기를 `usesStatus`·`withUses` **뒤로** 내리고, 조기 반환을 `null` →
`usesStatus` 로, 성공 반환을 `withUses({...})` 로 바꿨다. 바로 아래 `hand_swap3` 와
같은 규약이 됐다.

### 19 🟠 박무 중 강 4개가 동시에 금색 링
`rt-latest` 는 `last.player === playerId`(= 테이블 최신 버림의 주인)일 때만 붙인다.
부수 건도 함께: key 를 `h${i}` → `` `h${i}:${ownLastId}` `` 로 바꿔 착지 플래시가
다음 버림마다 다시 재생된다.

### 20 🟡 «처음부터»가 `majak.tutorialDone` 을 안 지운다
`STORAGE_KEYS` 에 키를 추가하고, **가드의 사각지대 자체를 없앴다**:
`bootAndCrashGuards` 의 스캔 대상을 `[APP, UISCALE]` 두 파일 → `src/**/*.ts(x)`
전체로 넓혔다. 스캔 대상이 «지금 열어 둔 두 파일»이면 같은 일이 또 난다.

### 21 🟡 `.layout-hint` 가 봇 난이도 배지를 덮는다
`top: 62px → 100px`(`.bot-diff-badge` 아래끝 ~94 아래). 봇이 없는 판에서는 그만큼
여백이 생기지만, 잠깐 떴다 사라지는 안내라 자리가 밀리는 편이 겹치는 것보다 낫다.

### 22 🟡 재연결 띠가 무효 투표 배너를 가린다
`.abort-banner` 는 `GameTable` 안쪽이라 형제 선택자로 닿지 않는다. App 이
`document.body.classList.toggle("reconnecting", …)` 로 표식을 달고,
`body.reconnecting .abort-banner { top: 34px }` 로 내려선다(34px = 띠의 실제 높이).

### 23 🟡 `.room-notice` 가 아이콘 줄 밑으로 들어간다
폭을 줄여서는 못 피한다(공지는 가운데 정렬인데 단추 줄이 그 가운데까지 내려와
있다). `@container ui (max-width: 700px)` 에서 `top: 54px` 로 한 줄 내린다.
관전 화면은 `.room-notice-spec` 이 이미 더 아래에 있어 `:not()` 으로 제외했다.

### 24 🟡 고른 뒤 «자세히 ▾»가 죽는다
카드의 `disabled={picked}` → `aria-disabled` + `onClick` 가드. CSS 도
`.draft-cards-locked { pointer-events: none }` 을 카드 본체에만 걸고
`.draft-cards-locked .draft-card .augdesc-more { pointer-events: auto }` 로 «읽기»만
살렸다. 바로 위 주석이 잠긴 카드에 대해 이미 말한 규칙(«고를 수 없는 것과 읽을 수
없는 것은 다르다»)을 `picked` 에도 적용한 것이다.

### 25 🟡 리플레이 정산 패널이 혼자 다시 뜬다
`openSettle` 이 담는 것을 «배열 위치» → **«그 정산의 이벤트 인덱스»** 로 바꿨다.
되감아 그 정산 이전으로 가면 이펙트가 `setOpenSettle(null)` 로 **아예 닫는다** —
사용자가 닫지 않은 패널이 혼자 되살아나지 않는다.

### 26 🟡 «10초» 고정
`` `🎲 ${remainSec}초 남았다 …` `` — 바로 위 줄이 찍는 숫자와 같아졌다.

### 27 🟡 ⏮ 이 늘 이전 국으로 뛴다
영상 플레이어 관습대로 **«이 국의 처음»**이 먼저다. 이미 그 자리에 서 있을 때만
이전 국으로 넘어간다.

### 28 🟡 Space 가 포커스된 버튼을 가로챈다
`e.target.closest("button, [role='button'], a[href]")` 이면 양보한다(= 브라우저가
그 버튼을 누른다). 빈 곳에 포커스가 있을 때만 재생/정지로 받는다.

### 29 🟡 가깡이 후로 예산을 과다 계상
`meldSlotCount(m)` 헬퍼 — `kan_added` 는 4장째를 겹쳐 쌓으므로 **3칸**이다
(`upright` 2 + `MeldStack` 1). 치·퐁(3/3)·안깡(4/4)은 그대로.

### 31 🟡 되감기 ◀ 가 맨 앞에서도 활성
`disabled={(props.rewindAt ?? (props.rewindLen ?? 0) - 1) <= 0}`.
리플레이 바의 ◀/▶/재생도 같은 규칙으로 함께 잠갔다(끝 프레임의 ▶ 는
`setPlaying(true)` → 즉시 `false` 라 «아무 일도 안 하는» 버튼이었다).

---

## 2. 의심 12건 — 판정과 처리

| # | 판정 | 처리 |
|---|---|---|
| 1 `.waits-badge` 넘침 | **유죄** | `flex-wrap: wrap` + `max-width: calc(100cqw - 16px)`. `.game-root { overflow: hidden }` 이라 넘친 부분이 스크롤도 없이 잘렸다 — 실측 폭이 경계에 걸치든 말든 상자가 스스로 폭을 지키는 것이 맞다 |
| 2 `.opp-strip-top` 예산 | **유죄** | `min-width: 0` 을 컨테이너와 `> *` 에 준다. 줄바꿈 없는 한 줄 flex 는 자식의 `min-content` 합이 넘으면 `max-width` 를 안 지킨다 — docs/34 §1 #6 이 고친 겹침이 되살아나는 길이 실재한다. `overflow: hidden` 은 **일부러 안 걸었다**(pill 툴팁이 이 상자 밖으로 나가야 한다) |
| 3 `dwQueue` 국 넘김 | **유죄(도달 가능성 미확정)** | 타일 id 재사용 여부를 확인하지 않고 **국 경계에서 끊었다**. 접는 조건이 «프롬프트가 왔는데 그 쌍이 후보에 없다» 하나뿐이라, «우연이 닿지 않기를 바라는» 상태였다 — 그건 방어가 아니다 |
| 4 `promptCancel` 의 `promptSeq` | **유죄** | 취소 경로에서도 `setPromptSeq((s) => s + 1)`. 확정 7과 겹쳐 «다음 순 첫 탭이 곧 타패»가 되는 길을 함께 막는다 |
| 5 드래그 중 DOM 순서 «고정» | **유죄(주석이 거짓)** | 렌더는 늘 최신 `displayIds` 를 돌고 `drag.order` 는 커밋에만 쓰인다. **구조를 바꾸지 않고 주석을 사실로 고쳤다** — 진짜로 고정하려면 렌더가 그 배열을 봐야 하는데, 그건 손패 렌더 경로 전체를 건드리는 일이라 이 범위에서 안전하게 못 한다 |
| 6 빠른 «던지기» | **유죄 — 확정 4 수리로 함께 해소** | 원인이 «임계값을 넘긴 그 move 에서는 드롭존이 아직 없어 `overDiscard` 가 false» 였는데, 이제 `onUp` 이 **손을 뗀 시점에** 드롭존 위인가를 다시 재므로 그 사이 move 가 없어도 버려진다 |
| 7 액션 바 두 줄 ↔ 「대화」 알약 | **유죄** | `.emote-bar { bottom: max(150px, calc(var(--own-band-full, 0px) + 10px)) }`. 150px 은 «한 줄일 때»의 실측이라 여유가 7px 뿐이었다 — 상수 대신 실측 띠를 하한으로 쓰면 줄이 접히든 말든 늘 그 위에 선다 |
| 8 `.emote-feed` 넘침 | **유죄** | `.emote-feed` 에 `max-width`, `.emote-bubble` 은 `nowrap → normal` + `word-break: keep-all`. `position: fixed` 라 `overflow:hidden` 으로도 안 잘리고 문서 밖으로 나간다 |
| 9 포커스 링 대비 1.5:1 | **유죄** | `outline: 2px solid var(--line-strong)` → 전역과 같은 황동 두 겹 `box-shadow`. 사실상 안 보이는 링이 특이성(0,2,0)으로 보이는 링을 밀어낸 자리였다 |
| 10 StrictMode 연출 유실 | **유죄(개발 모드 한정)** | 주석만 고치지 않고 **가드도 넣었다** — `prodPumpPending` ref 로 «꺼냈지만 아직 못 세운» 구간을 표시한다. `activeProd` 가 서면 풀리므로 프로덕션 동작은 그대로다 |
| 11 `scoreFx` 타이머 겹침 | **유죄** | `scoreFxTimer` ref 로 앞 타이머를 취소한 뒤 새로 건다 |
| 12 역 스탬프 소리 계단 | **미수리(무죄 아님)** | §3-3 |

### «그 밖에 확인이 필요한 작은 것들» 중 함께 고친 것
- `specDanger` 에 `props.spectator === true` 가드 추가 — 상대 손패 위험도 누출의
  방어선이 «서버가 안 보낸다» 한 줄뿐이었다. **누출을 막는 조건은 보내는 쪽과
  그리는 쪽 양쪽에 있어야 한다.**
- `scapegoat` 빈 문자열 처리(`!== ""`) — 인접한 avenger 와 기준을 맞췄다. 서버가
  빈 문자열로 지우면 이름 없는 «덤터기» 뱃지가 남는다.
- 리플레이 끝 프레임의 ▶ 잠금(확정 31과 같은 자리에서 함께).

---

## 3. 안 고친 것과 이유

### 3-1. 확정 30 🟡 ♻ 재장전 표식이 다음 국에 사라진다 — **절반만**
표식이 사라지는 원인은 `packages/content/src/augments/reload.ts:167` 이
`roundViewKey("*", …)`(국 스코프)로 발행하는 것이고, **`packages/content/src/**` 는
손대지 말라는 지시**를 받았다. 클라에서 할 수 있는 것은 «거짓말을 멈추는» 것뿐이라
그것만 했다:
- 함수 주석 «이번 게임에 되살린» → «이번 국에» + 왜 그런지·어디를 고쳐야 하는지 명시
- 툴팁 «♻ 재장전 — 이 증강을 다시 쓸 수 있다» → «♻ 재장전 — 이번 국에 되살렸다»

**남은 일**: 표식을 게임 내내 남기려면 콘텐츠 담당이 채널을 게임 스코프로 올려야
한다. 그때 이 두 문구도 함께 되돌린다.

### 3-2. 확정 6의 곁가지 — `protocol.ts` 주석
`packages/core/src/network/protocol.ts:1069` 의 «우마 점수 (+20/+10/-10/-20)» 는
실제 값(`[5, 15]` k단위)과 다르다. **`packages/core/src/**` 금지** 라 남겼다.
화면에 보이는 잘못(1000배 어긋난 세 수)은 클라에서 전부 고쳤다.

### 3-3. 의심 12 🟡 역 스탬프 소리 계단 수
`headRows`(`infos[0]` 기준)와 실제 `yakuRows` 의 줄 수가 어긋난다는 지적은
**맞을 가능성이 높다**. 고치지 않은 이유: 맞추려면 `yakuRows` 가 실제로 몇 줄을
그리는지를 렌더 전에 다시 계산해야 하는데(`extraHanBy` 전개 + `augPoints` + 본장 +
리치봉), 그 계산을 두 벌로 두는 순간 **다음에 줄이 하나 늘 때 또 갈린다**.
제대로 고치려면 «줄 목록을 한 번 만들어 소리와 렌더가 같은 배열을 쓰게» 해야 하고,
그건 `RoundResultPanel` 의 렌더 구조를 바꾸는 일이다. 연출(소리 계단)만의 문제라
위험 대비 이득이 맞지 않아 남긴다.

### 3-4. 확정 3 의 «더 튼튼한» 제안
마운트 조건에 「튜토리얼 방인가」를 거는 것 — 프로토콜에 그 사실을 알려 주는
필드가 없다(§1-3). 서버 변경이 필요해 범위 밖.

---

## 4. 추가한 테스트

| 파일 | 개수 | 무엇을 |
|---|---|---|
| `packages/client/test/qaRound2Client.test.ts` (신규) | 52 | 확정 1~29·31 + 의심 1·2·3·4·7·8·9·10·11 + 정보 누출 방어선. 정적 소스 스캔이 기본이고, 리플레이 재구성 한 건만 **실제 모듈을 불러 잘린 줄로 돌린다** |
| `packages/client/test/codexFilter.test.ts` | +3 | 도감 검색 코퍼스에 요약이 들어갔는가 · 목록 필터와 계열 칩이 **같은 술어**를 쓰는가 · 확인된 세 낱말이 실제로 요약에 있는가 |
| `packages/client/test/a11yPerfGuards.test.ts` | 수정 | `outline: none` 을 **개수**로 세던 것 → «같은 블록에 황동 링이 함께 있는가». 확정 15 를 놓친 것이 정확히 이 셈 때문이다 |
| `packages/client/test/bootAndCrashGuards.test.ts` | 수정 | 저장소 키 스캔 대상을 두 파일 → `src/**/*.ts(x)` 전체로. 확정 20 의 사각지대 자체를 없앤다 |

테스트를 «수리의 형태»가 아니라 **«그 수리가 지키려는 성질»** 로 쓰려 했다.
예: 확정 16은 «9곳을 고쳤다»가 아니라 «파일에 리터럴이 하나도 없다», 확정 17은
«두 곳을 바꿨다»가 아니라 «`vw/vh/vmin` 이 하나도 없다» 로 적었다.

---

## 5. 추가 건 — 도감 검색이 카드에 인쇄된 «요약»을 못 찾는다

(`qa-lab/round2/codex-text.md` 확정 8)

`CodexScreen` 의 필터 술어가 이름·id·설명·상세 넷만 봤는데, 도감 카드에 실제로
찍히는 본문은 `<AugDesc variant="codex" expanded={false} />` = **요약**
(`augmentBrief.ts`) 한 줄이다. 사람은 눈앞에 보이는 낱말을 치는데 그 낱말만 코퍼스에
없었다.

- **같은 술어가 두 곳에 복사돼 있던 것이 애초에 어긋남의 씨앗**이라, 먼저
  `codexMatchesQuery(cat, q)` 로 묶고 목록 필터·계열 칩 개수가 함께 그것을 쓰게 했다.
- 요약 본문(`brief.text`)에 더해 **배지(`brief.use`)도 코퍼스에 넣었다** —
  «상시»·«매 국 1회» 도 카드에 인쇄되는 글자다.
- 확인된 셋(`giant_god`+«텐파이», `danger_sense`+«방총», `true_dragon`+«몸통»)이
  실제로 요약에 있음을 테스트가 확인한다.

---

## 6. 검증 결과

```
$ npx vitest run --root packages/client
  Test Files  39 passed (39)
       Tests  608 passed (608)          # 기준선 38파일 556테스트 → +1파일 +52테스트

$ npm run typecheck:client               # 0 에러
$ npm run typecheck                      # core   0 에러
$ npm run typecheck:content              # 0 에러
$ npm run typecheck:server               # 0 에러

$ npm run build:client                   # ✓ built in 3.25s
  dist/assets/index-*.css   211.83 kB │ gzip:  43.15 kB
  dist/assets/index-*.js    564.78 kB │ gzip: 199.02 kB
```

재현 스크립트도 다시 돌렸다(`~/majak/node_modules/.bin/tsx`):

- `t02-storage-reset` → **「빠진 키 : (없음)」 · 「재현 실패」**
- `t03-overlay-mode-stuck` → 「resetGameState 이 overlayMode 를 되돌리는가 : **true**」
- `t04-hand-input` → 「riichiMode 변화로 armedTileId 를 푸는 코드가 있는가 : **true**」
- `t01-haptics-off` → 「의존성에 settings.haptics 가 들어 있는가 : **true**」
  (스크립트의 (b) 절은 «App 이 아무것도 호출하지 않는다»를 손으로 흉내 내는 부분이라
  수리 뒤에도 3을 찍는다 — 실제 배선은 (a) 절과 새 회귀 테스트가 본다)
- `t06-display` → `.replayer` 에 「z-index: 55 /* .overlay(50) 위 */」가 찍힌다.
  스크립트가 인용하는 A절 우마 표기는 다음 줄로 밀린 `* 1000` 을 못 읽는다 —
  실제 값은 `qaRound2Client.test.ts` 가 본다
- `t05-coach-leak` → 잠금 강의 목록은 그대로(콘텐츠는 안 바뀌었다). 누수를 막은 것은
  `resetGameState` 쪽이고 그건 새 테스트가 본다

### 손대지 않은 것 (지시대로)
`packages/server/src/**` · `packages/core/src/**` · `packages/content/src/**` ·
`packages/client/src/glossary.ts` · `App.tsx` 의 로그인/회원가입 폼과
`msg.type === "error"` 처리 블록. `App.tsx` 는 전부 **부분 치환(Edit)** 으로만 고쳤다.
