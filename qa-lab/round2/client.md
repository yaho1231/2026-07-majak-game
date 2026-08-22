# 클라이언트 — 화면 배치·상태·연출 (client)

## 요약

- 방식: **코드 정독 + 소스 재현 스크립트**. 지시대로 브라우저 자동화는 쓰지 않았다.
- 재현 스크립트 6개 — `qa-lab/round2/client/t01…t06.ts`. 전부 `/Users/skul/majak/node_modules/.bin/tsx <경로>` 로 그대로 돈다.
- 기존 회귀 스위트 기준선: `npx vitest run --root packages/client` → **38파일 556테스트 전부 통과**. 아래 확정 건은 전부 그 그물 **바깥**이다.
- ⚠ **줄 번호 주의**: 이 워크트리는 여러 QA 담당이 함께 쓰고 있고, 감사 중 auth 담당이 `App.tsx`(+36줄)·`RoomManager.ts`·`SiteDb.ts` 를 고쳤다. 아래 `App.tsx` 줄 번호는 **2026-08-22 감사 종료 시점의 워킹트리 기준**이다. 어긋나면 함께 인용한 코드 조각으로 grep 하거나 재현 스크립트를 다시 돌려라 — 스크립트들은 전부 줄 번호를 **그때그때 다시 찾아서** 찍는다.
- 중복 확인: `docs/21·22·24·25·28·30·31·34·35·36·37`, `qa-lab/findings|verdicts|fixlog` 전수 grep — 겹치는 기록 없음. (`docs/34 §3`·`docs/35`에 이미 «남아 있다»고 적힌 배치 건은 제외했다. 닉네임은 서버가 2~12자로 강제하므로(`SiteDb.ts:185`) «16자 닉네임» 시나리오는 성립하지 않아 보고 대상에서 뺐다.)

**확정 19건 · 의심 12건.**

| # | 심각도 | 한 줄 |
|---|---|---|
| 1 | 🔴 | 연출 «건너뛰기» 알약이 내 손패를 덮는다 — 토스트가 받은 수리를 이 버튼만 못 받았다 |
| 2 | 🔴 | `--own-reserve`(액션 바 자리 비우기)가 기기 px `@media` 에 걸려 있어 UI 확대 배율에서 통째로 빠진다 |
| 3 | 🟠 | 튜토리얼 코치가 판을 나가도 안 꺼져 **다음 실전 판의 손패를 잠근다** |
| 4 | 🟠 | 드래그 중 프롬프트가 죽으면 낡은 액션이 나가고 **새 프롬프트가 화면에서 지워진다** |
| 5 | 🟠 | 손패를 드래그한 직후의 **진짜 클릭 한 번이 통째로 먹힌다** |
| 6 | 🟠 | 최종 순위표의 «우마·오카»가 k단위인데 옆 숫자는 점 단위 — 1000배 어긋난다 |
| 7 | 🟠 | «두 번 눌러 버리기» 게이트가 리치 전환에서 뚫려 **한 탭에 리치가 확정**된다 |
| 8 | 🟠 | 무장형 리치(오픈·스텔스·올인)에는 «두 번 눌러 버리기»가 아예 안 걸린다 |
| 9 | 🟠 | 설정에서 «진동»을 **꺼도 그 세션 내내 계속 울린다** |
| 10 | 🟠 | 중계 «오버레이 모드»가 남아 내 대국 판을 크로마키 초록으로 칠한다 (되돌릴 단추 없음) |
| 11 | 🟠 | 내 후로 넉 장이 내 손패 위로 올라탄다 |
| 12 | 🟠 | 예지 재배열만 남은 순 — «✦ 액티브 증강 (0)» + 빈 메뉴 + 툴팁 «undefined 사용» |
| 13 | 🟠 | 「이 판 다시 보기」가 순위표 **뒤에서** 열리고 재생 바만 위로 삐져나온다 |
| 14 | 🟠 | 리플레이 재구성이 한 줄만 깨져도 판 전체를 못 연다 (서버는 같은 자리를 견딘다) |
| 15 | 🟠 | 「대화」 버튼에 포커스 표시가 **전혀** 없다 (전역 규칙이 뒤 블록에 덮였다) |
| 16 | 🟠 | 폐기 선언된 `#5f7469`(3.68:1)가 9곳에 그대로 |
| 17 | 🟠 | `vw` 두 곳이 가상 뷰포트를 안 봐 확대 시 상자가 화면의 1.8배가 된다 |
| 18 | 🟠 | 함구령의 «남은 횟수»가 pill에 절대 안 뜬다 |
| 19 | 🟠 | 박무(brief_fog) 중 강 4개가 **동시에** «최신 타패» 금색 링을 단다 |
| 20 | 🟡 | «처음부터»(clearAllStorage)가 `majak.tutorialDone`을 안 지운다 — 가드 테스트에 사각지대 |
| 21 | 🟡 | `.layout-hint` 가 봇 난이도 배지를 정면으로 덮는다 |
| 22 | 🟡 | 재연결 띠가 무효 투표 배너(찬성/반대 버튼)를 통째로 가린다 |
| 23 | 🟡 | `.room-notice` 가 우상단 아이콘 줄 밑으로 들어간다 |
| 24 | 🟡 | 증강을 고른 뒤에는 «자세히 ▾»가 죽어 설명을 못 읽는다 |
| 25 | 🟡 | 리플레이 정산 패널이 되감으면 사라졌다가 앞으로 가면 혼자 다시 뜬다 |
| 26 | 🟡 | 드래프트 경고 문구가 «10초» 고정 (3초 남아도 «10초 남았다») |
| 27 | 🟡 | ⏮ 이 «현재 국 처음»이 아니라 항상 이전 국으로 뛴다 |
| 28 | 🟡 | 리플레이에서 Space가 포커스된 버튼 대신 항상 재생/정지를 먹는다 |
| 29 | 🟡 | 가깡이 있으면 상대 손패·후로 타일이 필요보다 작게 그려진다 |
| 30 | 🟡 | ♻ 재장전 표식이 다음 국에 사라진다 (채널은 국 스코프, 문구는 «이번 게임») |
| 31 | 🟡 | 되감기 ◀ 버튼이 맨 앞에서도 계속 활성 |

### App.tsx 구역별 정독 표 (21,283줄)

| 줄 범위 | 내용 | 상태 |
|---|---|---|
| 1–2530 | 상수·프로토콜 표·타일 헬퍼·왕패 계산·`ScaleControl`·`LayoutHint` | ✅ 정독 |
| 2531–6218 | **App 본체** — 연결/하트비트/재연결, `handleServerMessage` 전량, 연출 큐 펌프, `detectTransitions` 전량, 화면 라우팅 | ✅ 정독 (전량) |
| 6219–6560 | `PauseOverlay`·`PeekButton`·`coachBlocks*` | ✅ 정독 |
| 6560–6860 | `TutorialCoach` | ✅ 정독 (상반부 + `tutorial.ts` 강의 표) |
| 6857–9290 | `AuthScreen`·도감·티어·도움말·역 표 | ⬜ **미독** (구조 스캔만) |
| 9290–11400 | 제보 게시판·`HomeScreen`·`WaitingRoom`·친구 | ⬜ **미독** (구조 스캔만) |
| 11398–12185 | `GameTable`·`useDoraFx` | ✅ 정독 |
| 12185–12600 | `useSelection`·`EmoteFeed`·`QuickToggles` | ✅ 정독 |
| 12599–14124 | `SettingsPanel`·관계 표식·증강 로그·샌드박스 | 🔶 부분 (설정 패널·관계 표만) |
| 14124–14300 | `CenterPanel` | ✅ 정독 |
| 14299–15970 | `River`·`OpponentStrip`·pill 계산·`NamePlate`·`Meld*` | ✅ 정독 |
| 15970–17612 | **`OwnArea`** (손패 클릭·드래그·무장·모달) | ✅ 정독 |
| 17613–18205 | `ShantenBadge`·`WaitsBadge`·`WaitTip`·`BroadcastPanel` | 🔶 부분 |
| 18205–19450 | `ActiveInfoBadges`·`ActiveAugmentControl` | ✅ 정독 |
| 19451–19885 | `ActionBar`·`ActionHotkeys`·`ActionTiles` | ✅ 정독 |
| 19885–20675 | `CountUpPoints`·`WinHand`·**`RoundResultPanel`** | ✅ 정독 |
| 20675–21283 | `DraftOverlay`·`GameOverModal`·`ReplayViewer` | ✅ 정독 |

부속 모듈 — `productionQueue.ts`·`lockNotice.ts`·`drawOrder.ts`·`waitCounts.ts`·`resendPolicy.ts`·`storage.ts`·`replayRebuild.ts`·`ErrorBoundary.tsx`·`contextMenu.ts`·`haptics.ts`·`winShapeView.ts` ✅ 전량 정독. `styles.css`(14,000줄+)·`uiScale.ts` ✅ 전량 정독.

---

# 확정

## 확정 1. 🔴 연출 «건너뛰기» 알약이 내 손패를 덮는다 — 토스트가 받은 수리를 이 버튼만 못 받았다

- 위치: `packages/client/src/styles.css:13100-13106` (vs 고쳐진 쪽 `styles.css:11428-11444`)
  ```css
  .prod-skip {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 250;
    ...
    min-height: 44px;
  ```
- 기대: 컷인이 도는 동안에도 내 손패는 읽을 수 있어야 한다. **같은 문제를 토스트에서 이미 한 번 고쳤다** — `.toast-stack` 은 `bottom: max(28px, calc(var(--own-band-full, 0px) + 12px))` 로 내 영역 위로 비켜서고, 그 자리에 실측까지 남아 있다(«1280×1120에서 13장 중 5장, 375×812에서 8장 = 62%가 3.2초간 사라졌다»).
- 실제: `.prod-skip` 은 `bottom: 12px` 그대로다. 화면 아래 가운데 y[bottom 12…56], z 250 → `.own-area`(z 10) 위에 얹힌다.
  - **375×812 폰 세로**: 손패 상자 bottom 18…76, 타일 높이 34px. 알약 폭 ≈130px가 가운데에 서므로 **가운데 5장쯤이 타일 높이 전부** 가려진다.
  - **1280×800**: 타일 높이 98px 중 아래 38px이 가운데 2장에서 가려진다.
- 재현: 남이 리치·후로·화료해 컷인이 뜨는 순간 자기 손패를 본다(=버릴 패를 고르는 바로 그 순간). 폰이면 손패 한가운데가 통째로 사라진다.
- 영향: 컷인은 남의 선언마다 뜨므로 «지금 내 패를 다시 보는» 순간과 정확히 겹친다. 초읽기 국에서는 그 몇 초가 판단 시간의 전부다.
- 제안 수정: `.toast-stack` 과 같은 식으로 `bottom: max(12px, calc(var(--own-band-full, 0px) + 12px))`.

## 확정 2. 🔴 `--own-reserve`(액션 바 자리 비우기)가 기기 px `@media` 에 걸려 있어 UI 확대 배율에서 통째로 빠진다

- 위치: `packages/client/src/styles.css:13444`·`13470` (vs 배치를 가르는 `styles.css:7852` `@container ui (max-width: 700px)`)
  ```css
  @media (max-width: 480px) {           /* ← 진짜 창 폭 */
    .game-root { --own-reserve: 68px; }
    .action-bar { flex-wrap: wrap; ... }
    .hand-tile { min-height: 46px; }
  ```
- 기대: 좁은 **배치**가 만든 문제(액션 바가 내 버림패를 덮는다 — `docs/34 §1 #4`가 고친 것)는 그 배치가 켜질 때마다 함께 막혀야 한다.
- 실제: 배치는 `@container ui`(=UI 배율이 곱해진 **가상 뷰포트**)로 갈리는데, 그 배치의 부작용을 막는 값만 `@media`(실제 기기 px)에 있다. `--own-reserve` 는 파일 전체에서 이 한 곳에서만 켜진다(정의는 `styles.css:226`).
- 재현: **데스크톱 800×1200 창 + 화면 배율 «+»로 2.0** → `uiScale` 1.44 → 가상 뷰포트 555×833. `@container ui (max-width:700px)` 규칙은 전부 걸리고 `@media (max-width:480px)` 는 하나도 안 걸린다. 보드는 폰과 같은 크기로 줄어드는데 액션 바 자리는 비워 두지 않는다 → 치·펑 프롬프트가 뜨는 순간 내 바닥이 다시 먹힌다. `.hand-tile { min-height: 46px }`(터치 목표)·`.own-area { bottom: max(18px, env(...)) }` 도 함께 빠진다.
- 영향: 큰 글씨를 쓰려고 배율을 올린 사람 = 정확히 이 보호가 가장 필요한 사람이 보호를 못 받는다.
- 제안 수정: 이 블록을 `@container ui (max-width: 480px)` 로 옮긴다(파일의 다른 반응형 규칙과 같은 기준).

## 확정 3. 🟠 튜토리얼 코치가 판을 나가도 안 꺼져 **다음 실전 판의 손패를 잠근다**

- 위치: `packages/client/src/App.tsx:2734`(`startCoach`) · `:5982`(마운트 조건) · `:3408`(자동응답 차단) · `:6163`(결과창 카운트다운) · `packages/client/src/tutorial.ts:430,539,558,601`(`lock`)
- 기대: `App.tsx:2701` 이 못 박은 대로 «코치는 튜토리얼 방에서만 돈다».
- 실제: `coachOn`을 끄는 곳은 **코치 자신의 `onFinish`(마무리·«그만 보기»)와 홈의 «연습 대국(안내 없음)» 둘뿐**이다. `returnHome`·`resetGameState`·`logout`·`gameAborted`·`kicked` 는 손대지 않고, 마운트 조건 `coachOn && inGame && !intro && !isSpectator` 에는 **방 종류 검사가 없다**. 그래서 튜토리얼 도중 「나가기」를 누르면 `coachOn=true` 인 채 홈으로 나오고, 그 뒤 아무 실전 판에 들어가면 코치가 **첫 강의부터** 다시 붙는다. 그 판에서:
  1. **손패가 잠긴다.** `discard-script`(`tutorial.ts:430`) 의 `when` 은 `myTurn && handKinds.has(SCRIPT_DISCARD) && turns === 0` — 실전 첫 순에 그 종류를 들고만 있으면 성립하고, `lock: { kind, how: "discard" }` 가 걸려 **그 한 종류 말고는 아무 패도 못 버린다**(`coachBlocks`, App.tsx:6446).
  2. **`how: "augment"` 잠금(`tutorial.ts:539`, `when: c.augmentReady && handKinds.has(SCRIPT_ALCHEMY) && turns >= 1`)은 더 세다** — `coachBlocksDiscard`(App.tsx:6466-6472)가 `lock.how === "augment"` 하나로 true를 돌려주므로 **어떤 패도 버릴 수 없다.** 클릭도 드래그도 막힌다.
  3. `tryAutoRespond` 가 `coachOnRef.current` 에서 즉시 false를 돌려줘 **자동화료·후로없음·자동버림 설정이 조용히 무시된다**(App.tsx:3408).
  4. 결과창 카운트다운이 사라진다(App.tsx:6163).
  5. 실전 방에 `tutorialHold` 가 나간다(App.tsx:5587).
- 재현: `tsx qa-lab/round2/client/t05-coach-leak.ts`
  ```
  function returnHome 이 코치를 끄는가 : false
  function resetGameState 이 코치를 끄는가 : false
  function logout 이 코치를 끄는가 : false
  코치 마운트 조건에 «튜토리얼 방인가»가 들어 있는가 : false
  tutorial.ts:539  [aug-script] lock: { kind: SCRIPT_ALCHEMY, how: "augment" }
  coachBlocksDiscard: return lock.how === "augment" || coachBlocks(...)
  ```
  손으로: 로그인 → «🎓 튜토리얼» → 강의 도중 화면의 「나가기」 → 홈 → 방 만들기 + 봇 3 → 시작 → 첫 순.
- 영향: **실전 판에서 버릴 수 있는 패가 없어지는 구간이 생긴다.** 유일한 탈출구는 말풍선의 «건너뛰기/그만 보기»인데, 그게 탈출구라는 걸 아는 사람만 빠져나온다. 소프트락에 가장 가까운 건이다.
- 제안 수정: `resetGameState()`(방을 떠나는 모든 경로가 지난다)에서 `setCoachOn(false); setCoachLock(null); cbCoachHold(false)`. 더 튼튼하게는 마운트 조건에 「튜토리얼 방인가」를 함께 건다.

## 확정 4. 🟠 드래그 중 프롬프트가 죽으면 낡은 액션이 나가고 **새 프롬프트가 화면에서 지워진다**

- 위치: `packages/client/src/App.tsx:16932-16933`(의존성) · `:16881-16911`(`onMove`/`onUp`) · `:5379`(`submitOption`의 무조건 `dropPrompt`)
  ```js
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);
  ```
- 기대: 드래그 도중 상황이 바뀌면 **그 시점의 실제 선택지**로 판단한다.
- 실제: 이 이펙트의 `onMove`/`onUp` 은 **드래그가 시작된 렌더**의 `discardOptionFor`(=`optionsByTile`·`armedAug`·`props.riichiMode`)·`autoSort`·`props.onSubmit` 을 붙잡고 재구독하지 않는다. `overDiscard` 도 `dragRef` 에 박제돼, 프롬프트가 죽어 드롭존이 언마운트돼도 **포인터를 움직이지 않으면 `true` 로 남는다**(`showDropzone` 은 최신 렌더 기준, `:16968`).
  손을 떼면 `discardOptionFor(b.id)` 가 죽은 옵션을 돌려주고 `props.onSubmit(opt)` → `submitOption` 이 전송에 성공하면 **`seat` 의 프롬프트를 무조건 `dropPrompt`** 한다. 그 순간 화면에 떠 있던 것이 방금 도착한 **론/치·펑 프롬프트**라면 그 버튼이 통째로 사라진다.
- 재현: `tsx qa-lab/round2/client/t04-hand-input.ts` (`B.` 절)
  ```
  B. 드래그 리스너 의존성        App.tsx:16933  }, [drag !== null]);
  B. onUp 의 제출 경로           App.tsx:16904  const opt = discardOptionFor(b.id);
  B. submitOption 의 무조건 dropPrompt   App.tsx:5379
  ```
  손으로: 내 차례에 패를 드롭존 위까지 끌어다 **가만히 든 채로** 제한시간 만료를 기다린다(초읽기 국은 5초) → 손을 뗀다.
- 영향: 서버는 «지금 고를 수 있는 선택지가 아닙니다»를 돌려주고(토스트), 화면은 살아 있던 프롬프트를 잃는다 — 론을 흘린다.
- 제안 수정: `onUp` 에서 제출 직전 최신 값을 다시 읽는다(`optionsByTile` 을 ref로 두거나 의존성을 실제로 채운다). 최소한 `submitOption` 의 `dropPrompt(seat)` 를 «그 프롬프트가 아직 같은 것일 때만»으로 좁힌다.

## 확정 5. 🟠 손패를 드래그한 직후의 **진짜 클릭 한 번이 통째로 먹힌다**

- 위치: `packages/client/src/App.tsx:16902`(세팅) · `:17363-17366`(해제)
  ```js
  suppressClickRef.current = true; // 드래그 뒤 딸려오는 click 무시
  ...
  onClick={() => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
  ```
- 기대: 드래그 뒤 브라우저가 딸려 보내는 유령 `click` **한 번만** 무시한다.
- 실제: 플래그를 푸는 곳이 **타일 button의 onClick 안**뿐이다. 그런데 재정렬로 다른 슬롯에 놓거나 드롭존에 끌어다 버리면 `pointerdown` 타깃과 `pointerup` 타깃이 달라서 `click` 이 타일이 아니라 공통 조상(`.own-hand` 이상)에서 발생한다 → 타일 `onClick` 이 안 돌고 플래그가 **true로 남는다**. 그 뒤 사람이 실제로 누른 클릭 한 번이 삼켜진다.
- 재현: `tsx qa-lab/round2/client/t04-hand-input.ts` (`A.` 절)
  ```
  A. suppressClickRef 쓰기/읽기
    App.tsx:16232  const suppressClickRef = useRef(false);
    App.tsx:16902  suppressClickRef.current = true; // 드래그 뒤 딸려오는 click 무시
    App.tsx:17363  if (suppressClickRef.current) {      ← 푸는 곳은 타일 onClick 안뿐
  ```
  손으로: 손패를 끌어 다른 자리에 놓는다(또는 드롭존에 끌어 버린다) → 이어서 아무 패나 한 번 클릭 → **아무 일도 안 일어남** → 두 번째 클릭에야 반응. `tapTwiceToDiscard` 가 켜진 폰이면 «들어 올리기»까지 한 탭 더 밀려 **총 3탭**이 된다.
- 영향: 손패 정렬을 쓰는 사람에게 상시로 일어난다. 초읽기 국에서 헛클릭 한 번은 그대로 시간 초과다.
- 제안 수정: 플래그를 시각으로 재우거나(`suppressUntil = Date.now() + 250`), 손패 컨테이너의 `onClickCapture` 에서 풀어 준다.

## 확정 6. 🟠 최종 순위표의 «우마·오카»가 k단위인데 옆 숫자는 점 단위 — 1000배 어긋난다

- 위치: `packages/client/src/App.tsx:20990-21012` · 서버 `packages/core/src/match/HanchanController.ts:1795-1803` · 타입 주석 `packages/core/src/network/protocol.ts:1069-1072`
  ```ts
  // 서버
  score: raw - startScore + umaValue * 1000 + okaValue * 1000,
  rawScore: raw,
  uma: umaValue,      // ← ×1000 하지 않은 k단위 그대로
  ```
  ```jsx
  // 클라
  {r.rawScore.toLocaleString()}점
  ... `우마 ${r.uma > 0 ? "+" : ""}${r.uma}` ... `오카 ...`
  {r.score > 0 ? "+" : ""}{r.score.toLocaleString()}
  ```
- 기대: 바로 위 주석이 밝힌 목적 — «25000점이 왜 −5가 되는지 역산할 수 있게». 세 값이 같은 단위여야 그 역산이 성립한다.
- 실제: 기본 설정은 `uma: [5, 15]`(k단위)다. 화면에는 `40,000점 · 우마 +15` 옆에 최종 `+30,000` 이 뜬다 — 40,000−25,000=15,000 에 15를 더해도 30,000이 안 된다. `protocol.ts:1069` 의 주석(«우마 점수 (+20/+10/-10/-20)»)도 실제 값과 다르다.
- 재현: `tsx qa-lab/round2/client/t06-display.ts` (`A.` 절)
  ```
  1위  화면: "40,000점 · 우마 +15"  →  최종 "+30,000"   (…15,000 에 15 를 더해도 30,000 이 안 된다)
  4위  화면: "13,000점 · 우마 -15"  →  최종 "-27,000"
  ```
- 영향: 점수 표시 정확성. 유일하게 «최종 점수가 어떻게 나왔는가»를 설명하는 줄이 설명을 못 한다.
- 제안 수정: 클라에서 `r.uma * 1000` / `r.oka * 1000` 로 찍거나(점 단위 통일), 최종도 k단위로 함께 적는다. `protocol.ts` 의 주석도 함께 고친다.

## 확정 7. 🟠 «두 번 눌러 버리기» 게이트가 리치 전환에서 뚫려 **한 탭에 리치가 확정**된다

- 위치: `packages/client/src/App.tsx:17420`(게이트) · `:16545-16551`·`:16557-16559`(`armedTileId` 리셋 경로)
- 기대: 두 번 탭이 켜져 있으면 되돌릴 수 없는 수는 반드시 두 단계를 거친다(감사 §5-2가 이 기능을 만든 이유).
- 실제: 들어 올린 패(`armedTileId`)는 **`props.promptSeq` 변화**와 **`tapTwiceToDiscard` OFF** 에서만 내려간다. `riichiMode` 전환에서는 안 내려간다.
  → 패 A를 한 번 탭(«한 번 더» 뱃지) → 액션 바 [리치] → 패 A를 **한 번** 탭 → `armedTileId === id` 라 게이트를 건너뛰고 **즉시 리치 제출**. 반대(리치 모드에서 들어 올린 뒤 리치 취소 → 한 탭에 그냥 타패)도 같다.
- 재현: `tsx qa-lab/round2/client/t04-hand-input.ts` (`C.` 절)
  ```
  C. armedTileId 리셋 경로   App.tsx:16550 / 16558 / 17425
  C. 리셋 이펙트의 의존성    [props.promptSeq] / [props.tapTwiceToDiscard]
  C/D. 두 번 탭 게이트 위치  App.tsx:17420
  D. 무장 분기 — 게이트보다 위에서 return 한다  App.tsx:17382  (게이트는 17420)
  riichiMode 변화로 armedTileId 를 푸는 코드가 있는가 : false
  ```
- 영향: 폰에서 되돌릴 수 없는 리치가 오탭 한 번에 나간다.
- 제안 수정: `useEffect(() => setArmedTileId(null), [props.riichiMode])` 한 줄.

## 확정 8. 🟠 무장형 리치(오픈·스텔스·올인 …)에는 «두 번 눌러 버리기»가 아예 안 걸린다

- 위치: `packages/client/src/App.tsx:17382-17390`(무장 분기 — 게이트보다 **위**에서 return) · `:17420`(게이트) · `:926-934`(`DRAG_DISCARD_ARM_TYPES`)
- 기대: 평범한 타패보다 더 되돌릴 수 없는 수(오픈 리치·올인 리치)에 게이트가 더 약할 이유가 없다.
- 실제: `if (armedAug !== null) { … sel.submit(opts[0]!) … return; }` 가 `tapTwiceToDiscard` 검사보다 먼저 있고 그대로 `return` 한다. 무장 상태에서는 **오탭 한 번 = 오픈 리치/올인 리치 확정**이다.
- 재현: `tsx qa-lab/round2/client/t04-hand-input.ts` (`D.` 절 — 무장 분기 `17382` 가 게이트 `17420` 보다 위임을 그대로 찍는다)
  손으로: (폰) 리치 가능한 순에 액션 바의 «⚡ 오픈 리치»를 눌러 무장 → 손패를 한 번 탭 → 확인 없이 확정.
- 제안 수정: 무장 분기 안에서도 `tapTwiceToDiscard` 를 먼저 본다(적어도 `DRAG_DISCARD_ARM_TYPES` 에 한해).

## 확정 9. 🟠 설정에서 «진동»을 **꺼도 그 세션 내내 계속 울린다**

- 위치: `packages/client/src/App.tsx:2991-3007`(`updateSetting`) · `:3249-3253`(동기화 이펙트)
- 기대: 스위치를 끄면 그 즉시 진동이 멎는다.
- 실제: 배선이 두 곳뿐인데 **둘 다 «끄기»를 처리하지 않는다.**
  - `updateSetting` 은 `key === "haptics" && value === true` 일 때만 `setHapticsEnabled(true)` — `false` 경로가 없다.
  - 동기화 이펙트는 `setHapticsEnabled(settings.haptics && hapticsSupported())` 를 부르지만 **의존성이 `[settings.sfxOn]`** 이라 `haptics` 가 바뀌어도 다시 돌지 않는다.
  - 결과: 새로고침하거나 «효과음»을 껐다 켜기 전까지 `haptics.ts` 의 `enabled` 가 `true` 로 남는다.
- 재현: `tsx qa-lab/round2/client/t01-haptics-off.ts`
  ```
  (a) updateSetting 에 setHapticsEnabled(false) 경로가 있는가 : false
  (a) 동기화 이펙트의 의존성                                : settings.sfxOn
  (b) 켜져 있을 때 타패 진동 횟수 : 1 (기대 1)
  (b) 끈 뒤 진동 횟수             : 3 (기대 0)
  → 확정: 껐는데 계속 울린다
  ```
- 영향: 진동을 끄는 사람은 끌 이유가 있다(공공장소·손 떨림·배터리). 죽은 접근성 스위치.
- 제안 수정: 이펙트 의존성을 `[settings.sfxOn, settings.sfxVolume, settings.haptics]` 로 넓히거나 `updateSetting` 에 `if (key === "haptics") setHapticsEnabled(value === true && hapticsSupported())`.

## 확정 10. 🟠 중계 «오버레이 모드»가 남아 내 대국 판을 크로마키 초록으로 칠한다 (되돌릴 단추 없음)

- 위치: `packages/client/src/App.tsx:2873`(상태) · `:5733`(무조건 GameTable로 내려감) · `:5738`·`:11897`(끄는 단추는 관전 중에만) · `:11810-11814` · `packages/client/src/styles.css:10980-10994`
- 기대: 중계 오버레이는 관전석의 장치다. 관전을 끝내면 원래 화면으로 돌아온다.
- 실제: `setOverlayMode` 를 부르는 곳은 **관전 중에만 넘기는 `onOverlayMode` 하나뿐**이고, `resetGameState`·`clearProductions`·`returnHome`·`continueInRoom`·`spectateEnded` 어느 것도 되돌리지 않는다. 그런데 `overlayMode` 는 `props.spectator` 와 무관하게 `.table` 에 붙는다.
  ```css
  .table-overlay-clear, .table-overlay-green { background: none !important; }
  .table-overlay-green { background: #00b140 !important; }
  .table-overlay-clear .quick-toggles, .table-overlay-green .quick-toggles { display: none; }
  ```
  → 내 판이 통째로 크로마키 초록이 되고 **빠른 토글 바(자동정렬·자동화료·후로없음·자동버림)가 사라진다.** 되돌릴 단추는 `props.onOverlayMode !== undefined` 일 때만 그려지므로 **탈출구가 새로고침뿐**이다.
- 재현: `tsx qa-lab/round2/client/t03-overlay-mode-stuck.ts`
  ```
  ① setOverlayMode 호출 지점 : App.tsx:2873(선언), App.tsx:5738(관전 전용 콜백)
  ② resetGameState / returnHome / continueInRoom / clearProductions / spectateEnded — 전부 false
  ```
  손으로: (관리자) 홈 → 진행 중인 탁자 관전 → 상단 «오버레이: 초록» → 관전 종료 → 방 만들기 → 시작.
- 영향: 중계를 한 사람이 곧바로 판에 앉는 것이 이 기능의 평범한 사용 흐름이다.
- 제안 수정: `clearProductions()` 에서 `setOverlayMode("off")`, 또는 `GameTable` 에 `isSpectator` 일 때만 넘긴다.

## 확정 11. 🟠 내 후로 넉 장이 내 손패 위로 올라탄다

- 위치: `packages/client/src/styles.css:2954-2961` (App.tsx:17480 — `.own-area` 의 **형제**라 담는 상자가 `.table` = 화면 전체)
  ```css
  .own-corner-right {
    position: absolute;
    right: 16px;
    bottom: 20px;
    z-index: 11;      /* .own-area(10)보다 위 */
  ```
  폭 상한도 `overflow` 도 없고, 반응형 오버라이드도 없다(파일 전체에서 이 규칙 하나뿐).
- 실제(계산):
  - **1280×800, 후로 4개** — `--mt-cap = clamp(38px, 5cqmin, 52px) = 40px` → 후로 줄 폭 ≈ 4×140 + 3×10 = **590px** (x 674…1264 / y bottom 20…80). 손패는 후로 4개면 2장뿐이라 레일 폭 200px(x 540…740) → **쯔모패(오른쪽 끝)의 아래 60px이 후로 뒤로 들어간다.**
  - **375×812, 후로 4개** — 후로 줄 ≈261px(x 98…359), 손패 2장 x 151…223 → 타일 34px 중 **아래 25px** 이 가려진다.
  - 후로 3개에서도 1280×800 기준 21px 겹친다.
- 영향: 후로 4개 + 마지막 한 장(단기 대기)은 «그 한 장을 봐야 하는» 상황과 정확히 겹친다.
- 제안 수정: `.own-corner-right` 에 `max-width` + `overflow-x: auto`, 또는 `.own-area` 의 폭 예산(`--own-*`)에 후로 줄을 넣는다.

## 확정 12. 🟠 예지 재배열만 남은 순 — «✦ 액티브 증강 (0)» + 빈 메뉴 + 툴팁 «undefined 사용»

- 위치: `packages/client/src/App.tsx:18588-18596`(augOptions 필터 — `foresight_order` 를 안 뺀다) · `:18690`(`usable`) · `:18720`(`types` — 여기서만 뺀다) · `:18788`(`displayCount`) · `:19317-19322`(툴팁) · `:19333`(버튼 글자) · 콘텐츠 `packages/content/src/augments/foresight.ts:293-300`
- 기대: 쓸 수 있는 증강이 없으면 버튼이 비활성이거나 개수가 맞아야 하고, 툴팁에 내부값이 새면 안 된다.
- 실제: 콘텐츠는 «발동(REVEAL)을 못 쓰는 순»에는 후보를 **ORDER 하나만** 낸다.
  ```ts
  if (canReveal(state, holder)) return [{ type: REVEAL, payload: {} }];
  if (revealedThisTurn(...) && !flagOf(...) && frontIds(state).length >= PEEK) {
    return ALL_ORDERS.map((order) => ({ type: ORDER, payload: { order: [...order] } }));
  }
  ```
  그러면 클라에서 `augOptions.length = 24` → `usable = true`, `types = []`(필터에서 다 빠짐), `displayCount = 0`:
  - 버튼이 **활성인데 «✦ 액티브 증강 (0)»** 으로 뜬다.
  - `click()` 이 `types.length === 1` 이 아니므로 `setOpen(true)` → **항목이 0개인 «사용할 증강 선택» 메뉴**가 열린다.
  - 툴팁이 `` `${augNameFor(types[0]!)} 사용` `` → `augActionName(catalog, undefined)` 은 `catalog[undefined]?.name ?? ACTION_LABEL[undefined] ?? type` = `undefined` → **«undefined 사용»** 이 그대로 화면에 뜬다. (`!` 단언이 타입 에러를 가리고 있다.)
- 재현: `tsx qa-lab/round2/client/t06-display.ts` (`B.` 절). 손으로: 예지(future_sight)를 들고 **같은 순에 발동을 이미 쓴 뒤** 자기 턴에서 ✦ 버튼을 본다.
- 제안 수정: `augOptions` 필터에도 `o.type !== "foresight_order"` 를 넣는다(`bloom_pick`·`swap3_*`·`future_exchange` 와 같은 이유·같은 자리).

## 확정 13. 🟠 「이 판 다시 보기」가 순위표 **뒤에서** 열리고 재생 바만 위로 삐져나온다

- 위치: `packages/client/src/App.tsx:6169-6171`(`onOpenReplay` — 상태를 하나도 안 걷는다) · `:4128-4130`(`replayData` 핸들러도 `setRankings(null)` 없음) · `packages/client/src/styles.css:11357`(`.replayer { position: relative }`, z-index auto) · `:11363`(`.replayer-bar { z-index: 60 }`) · `:3681`(`.overlay { z-index: 50 }`)
- 기대: 순위표가 닫히고 리플레이가 열린다.
- 실제: `.replayer` 는 `z-index: auto` 라 **쌓임 맥락을 만들지 않는다.** 그래서 자손인 `.replayer-bar`(60) 가 순위표 `.overlay`(50)보다 위에 그려진다 — 판은 아래에 깔리고 **재생 바(⏮◀▶⏭ 슬라이더)만** 순위표 위로 떠오른다. 게다가 뷰어의 window `keydown`(`:21146`, `:21167`)이 살아 있어 Space/←/→ 가 **안 보이는 판**을 조작한다.
- 재현: `tsx qa-lab/round2/client/t06-display.ts` (`C.` 절). 손으로: 대국 종료 → 순위표의 「이 판 다시 보기」.
  (※ 「로비로」는 `returnHome` 이 `setReplayData(null)` 까지 하므로 정상 복귀한다 — 갇히지는 않는다.)
- 제안 수정: `onOpenReplay` 에서 `setRankings(null)`(또는 `replayData` 핸들러에서), 그리고 `.replayer { isolation: isolate }`.

## 확정 14. 🟠 리플레이 재구성이 한 줄만 깨져도 판 전체를 못 연다

- 위치: `packages/client/src/replayRebuild.ts:62-70` (vs 서버 `packages/server/src/ReplayReader.ts` `reconstructGame`)
  ```ts
  for (const line of lines.slice(1)) {
    const event = JSON.parse(line) as GameEvent;
    state = game.engine.reducers.dispatch(state, event);
  ```
- 기대: 서버는 같은 절차에서 «마지막 줄이 반만 써져 있을 수 있다»며 그 줄에서 끊고 이어가고, 훅 예외도 격리한다.
- 실제: 클라이언트에는 `try/catch` 가 하나도 없다. 잘린 마지막 줄 하나에 `rebuildReplay` 가 통째로 throw → 뷰어는 `JSON.parse` 원문(«Unexpected end of JSON input»)만 띄운다(`App.tsx:21212`).
- 영향: 서버가 비정상 종료했다가 감시자가 되살린 판 — 즉 **가장 다시 보고 싶은 판**의 리플레이가 안 열린다.
- 제안 수정: 루프를 `try/catch` 로 감싸 «여기까지 복원했다»로 물러난다(서버와 같은 정책).

## 확정 15. 🟠 「대화」 버튼에 포커스 표시가 **전혀** 없다

- 위치: `packages/client/src/styles.css:13071-13081`(전역 `:focus-visible`) vs `:13762-13775`(`.emote-toggle`)
  ```css
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--felt-0), 0 0 0 4px var(--brass-bright);
  }
  ...
  .emote-toggle { ... box-shadow: var(--shadow-2); }   /* 파일에서 더 뒤 */
  ```
- 기대: Tab으로 닿으면 황동 링(WCAG 2.4.7).
- 실제: `:where(...)` 는 특이성 0이라 전역 규칙은 `(0,1,0)`(`:focus-visible` 만큼), `.emote-toggle` 도 `(0,1,0)` — **뒤에 온 쪽이 이긴다.** 링 `box-shadow` 가 덮이고 `outline: none` 만 남는다. `13075` 의 주석(«이 규칙은 파일 끝에 있어 같은 특이성을 이긴다»)의 전제가 `13744~` 블록이 뒤에 추가되면서 깨졌다.
- 재현: 대국 화면에서 Tab으로 「대화」 버튼까지 이동 → 화면이 아무 말도 안 한다.
- 제안 수정: 전역 `:focus-visible` 블록을 파일 맨 끝으로 옮기거나 `.emote-toggle:focus-visible` 을 따로 준다.

## 확정 16. 🟠 폐기 선언된 `#5f7469`(3.68:1)가 9곳에 그대로

- 위치: `packages/client/src/styles.css:31-34` 가 스스로 «못 쓴다»고 적고 토큰을 갈았고 `:8848` 에서 실제로 한 곳을 그 이유로 고쳤는데, 리터럴이 남아 있다:
  `:349 .lobby-hint` · `:5047 .result-draw-hidden` · `:6057 .stat-chip-empty` · `:6516 .settings-grip` · `:8542 .auth-optional` · **`:8562 .auth-advanced-toggle`(버튼 라벨)** · `:9688 .home-empty`(빈 카드에서 유일한 글자) · `:10268 .codex-dim` · `:12598 .tier-td-id`
- 계산: `#5f7469` on `--chrome-fill #0c1511` = **3.68:1** (본문 4.5:1 미달). 같이 남은 `#7b9084` 는 5.45:1이라 통과 — 문제는 `#5f7469` 만이다.
- 제안 수정: 이미 있는 대체 토큰으로 9곳을 치환.

## 확정 17. 🟠 `vw` 두 곳이 가상 뷰포트를 안 봐 확대 시 상자가 화면의 1.8배가 된다

- 위치: `packages/client/src/styles.css:10844` `.room-notice { max-width: min(86vw, 640px); }` · `:11290` `.pause-card { max-width: min(90vw, 420px); }`
- 기대: 파일 규약(`:127`) — «이 파일의 화면 비례 단위는 전부 `vw/vh/vmin` 이 아니라 `cqw/cqh/cqmin`». 실제로 이 둘 말고는 파일에 `vw/vh/vmin` 이 하나도 없다.
- 실제: **390px 폰 + 화면 배율 «+»로 2.0** → 가상 뷰포트 195px. `86vw` = 335px, `90vw` = 351px → 상자가 화면 폭의 **1.7~1.8배**. `.pause-overlay` 는 `place-items: center` 라 좌우가 **양쪽 다** 잘려 일시정지 사유 문구를 못 읽는다. 반대(축소 0.6)에서는 공지 띠가 의도의 54%로 쪼그라든다.
- 제안 수정: `86cqw` / `90cqw`.

## 확정 18. 🟠 함구령(`call_seal`)의 «남은 사용 횟수»가 pill에 절대 안 뜬다

- 위치: `packages/client/src/App.tsx:15230-15236`
  ```js
  if (augId === "call_seal") {
    const m = av[`call_seal:${playerId}`] as { until?: number } | null;
    if (m === null || typeof m !== "object" || typeof m.until !== "number") return null;
    const left = m.until - view.round.turnCount;
    if (left <= 0) return null;
    return { chip: `${left}순`, note: `앞으로 ${left}순 동안 아무도 후로할 수 없다` };
  }
  ```
  이 분기가 `usesStatus`(`:15323`)보다 **먼저 return** 한다.
- 기대: `packages/content/src/augments/call_seal.ts:100` 이 «횟수형 증강 공용 규약»으로 `publishUsesLeft` 를 명시적으로 발행하고, App.tsx:15319-15321 주석이 «이제 둘 다 있으면 상태 뱃지 뒤에 `·n회` 로 붙여 함께 보여준다»고 약속한다.
- 실제: 봉인 전·만료 후에는 **아무 칩도 없고**, 봉인 중에는 `6순` 만 나와 잔량이 통째로 묻힌다. 같은 자리에서 `hand_swap3`(`:15365-15372`)은 `return usesStatus` 로 올바르게 처리하고 있어 대비가 명확하다.
- 재현: 반장전에서 함구령 보유 → 자기 이름표 pill 확인(발동 전 / 발동 중 / 6순 경과 후 모두).

## 확정 19. 🟠 박무(`brief_fog`) 중 강 4개가 **동시에** «최신 타패» 금색 링을 단다

- 위치: `packages/client/src/App.tsx:14435`(`ownLastId` 폴백) · `:14444`(`rt-latest`) · `packages/client/src/styles.css:1209-1213`
  `ownLastId` 는 테이블 최신 버림(`round.lastDiscard`)이 **아닐 때** `fogLastId`(각자의 마지막 한 장, 전원 공개 채널)로 떨어진다. `.rt-latest` 는 `outline: 2px solid #f0c86a` + `latest-glow` 무한 애니메이션 = «지금 막 버려진 그 한 장».
- 기대: 판 전체에 `rt-latest` 하나.
- 실제: 박무의 `count_only` 구간 동안 네 사람의 강이 각자 자기 마지막 패에 금색 링을 계속 켜 둔다 → 누가 방금 버렸는지 판독 불가.
- 부수(🟡): 이 칸의 key가 `h${i}`(자리 번호)라 다음 버림이 와도 key·class가 그대로 → `styles.css:1219` `::before` 착지 플래시가 재생되지 않는다.
- 재현: 박무 발동국, 아무나 한 장 버린 뒤 네 강을 본다.

## 확정 20. 🟡 «처음부터»가 `majak.tutorialDone` 을 안 지운다 — 가드 테스트에 사각지대

- 위치: `packages/client/src/storage.ts:76-90`(`STORAGE_KEYS`) · `packages/client/src/tutorial.ts:1057`(`TUTORIAL_KEY`) · `packages/client/test/bootAndCrashGuards.test.ts:80-93`
- 기대: `storage.ts` 스스로의 약속 — «⚠ 새 키를 만들면 여기에도 넣어라. 빠뜨리면 "처음부터"가 처음부터가 아니게 되고, 그게 정확히 사용자가 마지막으로 기대는 탈출구다.»
- 실제: `majak.tutorialDone` 이 목록에 없다. 기존 가드는 **`App.tsx` 와 `uiScale.ts` 의 문자열 리터럴만** 훑는데(`for (const src of [APP, UISCALE])`), 이 키는 `tutorial.ts` 에 상수로 있고 App은 `TUTORIAL_KEY` 로만 부르므로 스캔에 안 잡힌다.
- 재현: `tsx qa-lab/round2/client/t02-storage-reset.ts`
  ```
  빠진 키 : majak.tutorialDone  (tutorial.ts)
  가입 직후 튜토리얼 분기가 이 값을 본다: App.tsx:3938  !tutorialDone.current
  ```
- 영향: 에러 바운더리의 최후 탈출구를 눌러 계정까지 지우고 다시 가입해도, 새 계정이 **가입 직후 튜토리얼 판으로 안내되지 않는다**(App.tsx:3934-3942).
- 제안 수정: 목록에 키 추가 + 가드 테스트의 스캔 대상을 `src/*.ts(x)` 전체로 넓힌다(이 스크립트가 그렇게 한다).

## 확정 21. 🟡 `.layout-hint` 가 봇 난이도 배지를 정면으로 덮는다

- 위치: `packages/client/src/styles.css:11579-11584`(`top: 62px; left: 8px; z-index: 310`) vs `:630-634`(`.bot-diff-badge { top: 60px }`, `.mode-badge` z 40)
- `11581` 의 주석은 `.mode-badge`(아래끝 46~57)만 피했는데 **그 아래 60px에 두 번째 배지가 있다**(App.tsx:12042 `className="mode-badge bot-diff-badge"`, `cursor: help`).
- 재현: 마우스 있는 기기 + 창 **880×600**(=`isLayoutCramped`) + 봇 대국. 안내 y 62…~100 / x 8…348 위에 배지 y 60…~94 / x 8…~140 → z 310이 z 40을 완전히 덮는다.

## 확정 22. 🟡 재연결 띠가 무효 투표 배너(찬성/반대 버튼)를 통째로 가린다

- 위치: `packages/client/src/styles.css:11742-11747`(`.reconnect-bar { fixed; top:0; z-index:300; pointer-events:none }`) · `:11762-11767`(`.abort-banner { fixed; top:0; z-index:290 }`)
- 둘은 배타적이지 않다(App.tsx:5633 `connection === "reconnecting"` / `:12881` 게임 상태). 재연결 중에도 마지막 뷰가 그대로 렌더되므로 투표 배너는 살아 있는데, 불투명한 재연결 띠(z 300)가 **찬성/반대 버튼까지 완전히 가린다**. `role="alertdialog"` 짜리 배너가 시각적으로 사라진다.
- 곁들여: `.abort-banner`(z 290, 세로 2~3줄)는 폰 세로에서 `.icon-btn` 줄(top 8, z 58)과 `.opp-strip-top`(top 48)을 함께 덮어 나가기·설정에 손이 안 닿는다.

## 확정 23. 🟡 `.room-notice` 가 우상단 아이콘 줄 밑으로 들어간다 (폰)

- 위치: `packages/client/src/styles.css:10835-10844` — `top: 12px; left: 50%; z-index: 46`, 좁은 폭 오버라이드 없음.
- 375px에서 `min(86vw, 640px)` = 322px → x 26…348, y 12…~48. 같은 자리의 `.icon-btn` 다섯 개는 x 173…367 / y 8…42, **z 58** → 공지 글자의 오른쪽 절반이 단추 밑으로 들어간다(`pointer-events:none` 이라 조용히 가려지기만 한다). 확정 17과 같은 줄이 원인의 절반이다.

## 확정 24. 🟡 증강을 고른 뒤에는 «자세히 ▾»가 죽어 설명을 못 읽는다

- 위치: `packages/client/src/App.tsx:20862`(`disabled={picked}`) + `packages/client/src/styles.css:3931`(`.draft-cards-locked { pointer-events: none }`)
- 바로 위 주석(`:20819-20824`)이 «고를 수 없는 것과 읽을 수 없는 것은 다르다»며 `lockedOut` 에는 일부러 `disabled` 를 안 걸었는데 `picked` 에는 걸었다. 다른 사람을 기다리는 동안(=가장 시간이 남는 구간) 카드 설명을 펼칠 수 없다.

## 확정 25. 🟡 리플레이 정산 패널이 되감으면 사라졌다가 앞으로 가면 혼자 다시 뜬다

- 위치: `packages/client/src/App.tsx:21146`(`shownSettlements = settlements.filter((sx) => sx.index <= idx)`) · `:21290`(`setOpenSettle(shownSettlements.length - 1)`) · `:21307`(렌더 가드)
- `openSettle` 은 **길이가 변하는 배열의 인덱스**인데 `idx` 가 줄면 배열이 짧아진다.
- 재현: 2국 이상 진행된 프레임에서 🧾 로 정산을 연다(`openSettle=1`) → ◀/←/슬라이더로 그 정산 이벤트 이전으로 되감는다 → 패널이 «닫힌 것처럼» 사라진다(사용자는 닫은 적 없다) → 다시 앞으로 가면 저절로 다시 뜬다.

## 확정 26. 🟡 드래프트 경고 문구가 «10초» 고정

- 위치: `packages/client/src/App.tsx:20756`(`urgent = showTimer && remainSec <= 10`) · `:20793`(문구 `"🎲 10초 남았다 — …"` 고정)
- 3초가 남아도 «10초 남았다»가 뜬다. 바로 위 `:20789` 은 실제 숫자를 찍고 있어 **한 화면에서 두 값이 어긋난다.**

## 확정 27. 🟡 ⏮ 이 «현재 국 처음»이 아니라 항상 이전 국으로 뛴다

- 위치: `packages/client/src/App.tsx:21221-21226` — `const target = currentRound - 1 + delta;`
- 3국 한복판에서 ⏮ 은 3국 시작이 아니라 **2국 시작**으로 간다(영상 플레이어 관습과 어긋난다).

## 확정 28. 🟡 리플레이에서 Space가 포커스된 버튼 대신 항상 재생/정지를 먹는다

- 위치: `packages/client/src/App.tsx:21182` — `if (e.key === " ") { e.preventDefault(); setPlaying(v => !v); }` (INPUT/TEXTAREA/SELECT만 제외)
- 🧾·속도(`rp-speed`)·⏮ 버튼에 포커스를 두고 Space를 누르면 그 버튼이 아니라 재생이 토글된다(`preventDefault` 가 버튼 활성화를 막는다). 키보드 사용자는 그 버튼들을 Enter로만 쓸 수 있다.

## 확정 29. 🟡 가깡이 있으면 상대 손패·후로 타일이 필요보다 작게 그려진다

- 위치: `packages/client/src/App.tsx:14677`
  ```js
  const meldTileCount = melds.reduce((n, m) => n + m.tileIds.length, 0) + pulledMeldTileIds(view, player.id).length;
  ```
- `--meld-n` 은 «후로 줄이 먹는 **칸** 수» 예산인데(`:14673-14676` 주석), `kan_added`(`:15850-15879`)는 `upright` 2장 + `MeldStack` 1칸 = **3칸**인데 `tileIds.length` 는 4다. (`kan_closed` 4칸/4장, 치·펑 3칸/3장은 일치.) 가깡 1회당 1칸씩 과다 계상 → 뒷면과 후로가 같은 예산을 나눠 갖는 구조라 **손패 뒷면까지 함께 줄어든다.**

## 확정 30. 🟡 ♻ 재장전 표식이 다음 국에 사라진다

- 위치: `packages/client/src/App.tsx:14905`(`reloadedAugmentsOf` — 주석 «이번 게임에 되살린») · `:15587`(칩) · `:15638-15640`(툴팁 «♻ 재장전 — 이 증강을 다시 쓸 수 있다») vs `packages/content/src/augments/reload.ts:167`
- 콘텐츠가 `augmentDataSet(roundViewKey("*", …))` 즉 **국 스코프**로 발행한다. 되살린 사용 횟수는 게임 내내 유지되는데 표식만 국이 넘어가는 순간 사라진다 — 주석이 말하는 «이번 게임»과 채널 수명이 어긋난다.

## 확정 31. 🟡 되감기 ◀ 버튼이 맨 앞에서도 계속 활성

- 위치: `packages/client/src/App.tsx:11861`(◀ — `disabled` 없음) vs `:11879`(▶ — 있음)
- `Math.max(0, cur - 1)` 로 클램프만 되어, 버퍼 맨 앞에서 눌러도 아무 일이 없다.

---

# 의심

## 의심 1. 🟠 `.waits-badge` 에 줄바꿈·상한·`overflow` 가 없어 최대 내용에서 화면 밖으로 잘린다

- 위치: `packages/client/src/styles.css:7094-7105`·`:7265-7269` — `flex-wrap` 없음, `max-width` 없음, `overflow` 없음. 담는 `.own-top` 은 `max-width: calc(100cqw - 8px)`(`:2028`)뿐이고 `.game-root { overflow: hidden }`(`:206`)이 넘친 부분을 **잘라 버린다**(스크롤도 없다).
- 계산: **375×812**, 오름패 9종(`WAIT_TILE_CAP = 9`, App.tsx:17656) + 후리텐 태그 + `N종` 칩 → 타일 24px×9 + gap 3×8 = 240, 라벨 뭉치 ≈154, 여백·테두리 24 → **≈425px** vs 상한 367px → 좌우 각 29px씩 잘려 **양끝 오름패 한 장씩이 사라진다.**
- **의심인 이유**: 라벨 뭉치 폭이 글꼴 실측에 달렸다. 9종·후리텐 없음(≈337px)은 들어간다 — 후리텐 태그나 `N종` 칩이 붙는 순간부터가 경계다.

## 의심 2. 🟠 `.opp-strip-top` 의 `--top-side-reserve` 가 `max-width` 뿐이다

- 위치: `packages/client/src/styles.css:1302-1303` — `flex-wrap` 도 `min-width:0` 도 `overflow` 도 없는 한 줄 flex라, 이름표+뒷패의 `min-content` 합이 `100cqw - 528px` 을 넘으면 max-width가 지켜지지 않고 줄이 좌우로 삐져나온다. `docs/34 §1 #6` · `:1296` 주석이 고쳤다는 「이름표 × 📘」 겹침이 되살아나는 경로다.
- 조건: **≥901cqw + 가로 + 배율 1.5 이상** (예: 1400×800에서 «+»→1.5 → 가상 933×533에서 예산 405px, 뒷패 줄만 하한 14px×13 = 218px). `.aug-pill-name` 의 말줄임이 어디까지 줄여 주는지에 달려 실측 필요.

## 의심 3. 🟠 액티브 증강의 `dwQueue` 가 국을 넘어 남으면 **지시하지 않은 교환이 자동 전송**될 수 있다

- 위치: `packages/client/src/App.tsx:18668-18686` — `dwQueue` 가 남은 채 `myPrompt` 가 null이 되면(턴 종료·국 전환) 큐가 영구히 남는다. 다음 국의 프롬프트에 우연히 같은 `handTileId`/`deadIndex` 쌍의 `dw_swap` 후보가 있으면 그대로 나간다.
- 확인 필요: 타일 id가 국을 넘어 재사용되는지(재사용되면 실제로 도달 가능).

## 의심 4. 🟡 `promptCancel`(시간 초과·선점)에서는 `promptSeq` 가 오르지 않는다

- 위치: `packages/client/src/App.tsx:4507-4529`(도착 경로 `:4501` 에만 `setPromptSeq`)
- 그래서 `armedTileId`·`swap3Sel`·`futureDismissed`·`rinshanDismissed` 초기화(`:16545-16551`, `:16596-16598`, `:16619-16621`)가 타임아웃 순에는 안 돈다. 다음 프롬프트가 오면 정리되므로 영향은 «들어 올려진 패의 «한 번 더» 뱃지가 남는다» 정도지만, **확정 7과 겹치면** 다음 순 첫 탭이 곧 타패가 될 여지가 있다.

## 의심 5. 🟡 드래그 중 DOM 순서 «고정»이 실제로는 구현돼 있지 않다

- 위치: `packages/client/src/App.tsx:16013-16014`(주석: «드래그 중 DOM 순서는 이걸로 고정한다») vs `:17233`(`displayIds.map(...)` — 항상 최신 목록). `drag.order` 는 `:16919` 커밋에만 쓰인다.
- 드래그 도중 `displayIds` 가 바뀌면(증강으로 손패가 늘거나 바뀜, 쯔모 도착, 자동정렬 토글) DOM은 즉시 재배치되는데 `slotCenter`·`fromIdx` 는 시작 시점 값이라 다른 자리에 꽂힐 수 있다. `autoSort` 도 `onUp` 에서 스테일이다(확정 4와 같은 뿌리).

## 의심 6. 🟡 빠른 «던지기» 제스처는 버리기 대신 재정렬이 된다

- 위치: `packages/client/src/App.tsx:16964-16968`(드롭존은 `drag.moved === true` 이후에야 마운트) · `:16881`(`overDiscard` 는 `dropzoneRef.current` 를 읽는다)
- 임계값을 넘긴 **그 move 이벤트**에서는 드롭존이 아직 없어 `overDiscard` 가 항상 false다. 터치 이벤트가 성기게 들어오는 빠른 플릭이면 그 뒤 move 없이 손을 떼게 되어 안 버려진다. 기기 없이 확인 불가.

## 의심 7. 🟡 폰에서 액션 바가 두 줄로 접히면 「대화」 알약과 만난다

- 위치: `packages/client/src/styles.css:13882`(`@container ui (max-width:700px)` 에서 `.emote-bar { bottom: 150px }`) · `:7976`(`.action-bar { flex-wrap: wrap }`)
- 액션 바 한 줄일 때 `.own-area` 위끝이 143px이라 7px 여유뿐이다. 치×3 + 펑 + 깡 + 론 + 패스가 두 줄이 되면 위끝이 ~193px → 「대화」 알약(z 60)이 액션 바(`.own-area` 안, z 10) 오른쪽 끝에 얹힌다.

## 의심 8. 🟡 `.emote-feed` 에 `max-width` 가 없고 `.emote-bubble` 은 `white-space: nowrap`

- 위치: `packages/client/src/styles.css:13811-13831`
- 닉네임(최대 12자) + «좋은 판이었습니다» ≈ 311px. 360px 이상에서는 들어가지만 320px급에서는 넘치고, `position: fixed` 라 `.game-root` 의 `overflow:hidden` 으로도 안 잘리고 문서 밖으로 나간다.

## 의심 9. 🟡 `.notice-head-clickable` 의 포커스 링 대비 ≈1.5:1

- 위치: `packages/client/src/styles.css:14316-14320` — `outline: 2px solid var(--line-strong)`(rgba(236,228,210,.18)). 특이성 (0,2,0)이라 전역 황동 링(0,1,0)을 이긴다. 공지 띠 배경 위에 합성하면 ≈`#343330` → 인접 대비 **1.5:1** (WCAG 2.4.11의 3:1 미달). `a11yBatchF` 는 링의 *존재*만 보고 대비는 안 본다. 합성 색 계산이라 실측 필요.

## 의심 10. 🟡 StrictMode(개발 모드)에서 연출 하나가 조용히 사라진다

- 위치: `packages/client/src/App.tsx:3111-3132` — 주석은 «shift는 … 이펙트 안에서만 일어나 StrictMode 이중호출에도 안전하다»라고 적었는데, React 18의 StrictMode는 **이펙트 본문 자체를 두 번 실행**한다. 두 번째 실행 시점에도 `activeProd` 는 아직 null이라 큐에서 하나를 더 `shift` 하고 `setActiveProd` 가 마지막 것으로 덮인다 → 앞의 연출이 유실된다.
- **프로덕션 빌드에서는 일어나지 않는다.** 배포 위험은 없고, 주석이 사실과 다른 것이 문제다.

## 의심 11. 🟡 점수 변동 플로팅 타이머가 겹치면 앞엣것이 일찍 지워진다

- 위치: `packages/client/src/App.tsx:4937-4941` — `setScoreFx(deltas); window.setTimeout(() => setScoreFx({}), 2600);` 취소 경로 없음. 2.6초 안에 점수가 두 번 움직이면 먼저 걸린 타이머가 나중 표시를 지운다. 연출만의 문제.

## 의심 12. 🟡 결과창 «역 스탬프» 소리 계단 수가 실제 줄 수와 어긋난다

- 위치: `packages/client/src/App.tsx:20248-20261` — `headRows` 는 `infos[0]` 의 역·도라·뒷도라·적도라·`extraHan>0` 만 세는데, 실제 `yakuRows`(`:20333-20419`)에는 `extraHanBy` 가 **여러 줄로** 펼쳐지고 `augPoints`·본장·리치봉 줄까지 붙는다. 증강이 많이 얹힌 손에서 소리 계단이 줄보다 짧다.

### 그 밖에 확인이 필요한 작은 것들

- `App.tsx:15330` `const total = typeof uses.total === "number" ? uses.total : left;` — `total` 누락 + `left === 0` 이면 note가 «게임 내 **0회**를 모두 사용했다»가 되고 게이지도 사라진다. `publishUsesLeft` 는 항상 total을 보내므로 도달 가능성은 낮다.
- `App.tsx:15064` `unification` 게이지 `(total - m.left) / total` — 원점 25000/문턱 45000이면 게임 시작부터 게이지가 56%로 차 있다. 설계 의도 확인 필요.
- `App.tsx:11720-11726` `specDanger` 가 `props.insight` 만 보고 `props.spectator` 가드가 없다. 지금은 서버가 대국자에게 `insight` 를 안 보내므로 안전하지만 **이 한 줄이 유일한 방어선**이다(상대 손패 위험도 누출 경로).
- `App.tsx:14666-14667` `gapAt = separated ? (side === "right" ? 0 : slots.length - 1) : -1` — 서버가 쯔모기리 index를 항상 맨 끝으로 싣는지 확인 필요.
- `App.tsx:18351-18352` `if (typeof scape === "string")` 만 본다(인접한 avenger `:18341` 는 `!== ""` 도 본다) — 서버가 빈 문자열로 지우면 이름 없는 «덤터기» 뱃지가 남을 수 있다.
- `App.tsx:12115`·`:12128` 증강 테스트 시점 관찰 중(`observing`)에는 `view.playerId` 가 봇 좌석이라 `iVoted` 가 항상 false, `requesterName` 폴백도 봇 이름으로 떨어진다(관리자 전용).
- `App.tsx:18794` + `:11735-11747` 무장 중 ✦ 버튼의 «다시 눌러 취소» — `.own-aug` 루트에 `data-arm-zone` 이 없어 전역 `pointerdown` 해제가 먼저 돌고, 이어지는 click 시점에는 이미 `armedType === null` → 취소 대신 메뉴가 열린다.
- `App.tsx:21125-21133` `useMemo` 안에서 `setError(...)`(렌더 중 상태 갱신) — StrictMode/동시성 경고 대상.
- `App.tsx:21152-21158` 끝 프레임에서 ▶ 를 누르면 `setPlaying(true)` → 즉시 `false`. 버튼이 «아무 일도 안 하는» 것처럼 보인다.
- `App.tsx:18854-18858` + `:19455-19464` `confirmForesight` 가 후보를 못 찾으면 아무 것도 안 보내는데 onClick은 탭을 무조건 닫는다 → «이 순서로 확정»이 무반응 + 탭 닫힘이 될 수 있다.

---

# 확인했으나 문제가 아니었던 것 (재확인 비용을 아끼려고 남긴다)

- `productionQueue.ts` — `insertByPriority` 는 큐를 항상 등급 내림차순으로 유지한다(모든 삽입이 이 함수를 지난다). 같은 등급 FIFO도 지켜진다. `backlogProdTtl` 바닥값(520ms)·`effectiveProdTtl`·`PROD_PAINT_FALLBACK_MS`(400ms) 삼중 받침 덕에 «연출이 안 끝나 입력이 잠기는» 경로는 없다(백그라운드 탭 포함).
- `drawOrder.ts` `relativeSeatLabel` 은 역행(`direction = -1`)에서도 옳다.
- `ActionHotkeys` — 숫자 배치(`hotIndex`)와 `keyed` 인덱스, 글자 단축키(R/P)의 오프셋 계산이 정확히 맞는다.
- `deadWallSlotInfo`/`rinshanSpentOf`/`rinshanLeftOf` — 전부 `deadWallSizeOf`(가려진 장수 포함)로 불린다. 문서 주석과 달리 호출부는 일관적이다.
- 더블클릭 연타로 같은 타패가 두 번 나가는 경로는 없다: `submitOption` 이 전송 성공 즉시 `dropPrompt` 해 두 번째 클릭에서는 옵션 자체가 없다. 액티브 메뉴/모달도 같다.
- `--hand-n`/`--hand-slots`(`:16954-16961`) — 14장·17장(진짜 용)·후로 4개에서 폭이 흔들리지 않는다.
- 드래프트 새로고침 연타는 서버가 슬롯당 1회로 막는다(`HumanAgent.ts:1015`). `draftPicked` 잔존도 없다(`setDraftPicked(false)` 가 `setDraft(null)` 경로 전부에 짝지어져 있다: 3665·4310·4332·4427·4444·4477·4512·4526·4558).
- 정보 누출 — `sealedPeekOf`(14538)·`peekedWaits`(2273)·`useDoraFx` 의 `ura`(11419)는 전부 `roundViewKey(holder, …)` 보유자 전용·국 스코프다.
- `PILL_FLAG` 9종은 전부 `roundViewKey("*", …)` 라 «발동» 칩이 국을 넘어 남지 않는다. `cooldownRoundsLeft/TurnsLeft` 의 좌석 가드도 정확하다.
- React key 중복 없음: `River` rows/cells, `slotKey`, `MeldGroup` 의 `"called"`/`"stack"`, `pills` 의 `key={a}`.
- 닉네임은 서버가 2~12자로 강제한다(`SiteDb.ts:185`) — `.np-name`·`.seat-name`·`.result-delta-name` 은 자기 `overflow:hidden` 으로 flex 최소 크기가 0이 되어 넘치지 않는다.
- 오버레이 스크롤 — `.draft-cards`(flex-wrap), `.aug-menu`·`.aug-pick-rows`·`.rinshan-pick-panel`·`.overlay` 모두 `max-height` + `overflow-y` 가 걸려 5장 이상·긴 설명·왕패 14장에서 넘치지 않는다.
