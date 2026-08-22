# QA 4라운드 — ingame-ux (대국 중 손이 미끄러지고 눈이 헤매는 순간)

담당 관점: 오조작 · 타이머 가시성 · 정보 가림 · 연출/조작 마찰 · 되돌릴 수 없는 선택 · 관전/리플레이 조작.

읽은 것: `packages/client/src` 전부(App.tsx 21,964줄 · styles.css · confirm.tsx · contextMenu.ts ·
haptics.ts · sfx.ts · drawOrder.ts · waitCounts.ts · lockNotice.ts · uiScale.ts), `git log --oneline -40`,
`packages/core/src/information/PlayerView.ts`(리치 선언패 인덱스 검증용).

먼저 적어 둘 것: **이 축은 이미 아주 두껍게 방어돼 있다.** 두 번 눌러 버리기 게이트,
게이트가 새는 세 경로(promptSeq·설정 OFF·리치 모드 전환) 전부 차단, 토스트가 손패를
피하도록 `--own-band-full` 실측, 드래그 중 프롬프트 교체 방어(`dragLiveRef`),
드래프트 카드 안의 «자세히»·용어 링크 `stopPropagation`, 리치 선언패를 인덱스가 아니라
tileId로 되찾기, `window.confirm` 제거(서버 타이머가 흐르는 동안 메인 스레드를 멈추던 것) —
이번 라운드에서 새로 무너뜨릴 수 있었던 것은 **아래 여섯 건**뿐이다. 억지로 채우지 않았다.

---

### [P1] 증강 선택 모달이 뜨는 동안 제한시간이 화면에서 사라진다 — 시간이 다 되면 서버가 대신 고른다
- 위치: `packages/client/src/styles.css:2407` (`.rinshan-pick-overlay`) / `packages/client/src/App.tsx:17666` (`PromptTimer`) / `packages/client/src/styles.css:1981` (`.own-area`)
- 증상: 등가교환(swap3), 예지 재배열, 영상패(bloom_pick), 미래교환(future_exchange),
  분열·염색의 «어느 패로 바꿀까» 서브메뉴 — 전부 **살아 있는 프롬프트의 결정**이고
  서버 마감(`deadlineMs`)이 그대로 흐른다. 그런데 이 모달들은 전면 오버레이라
  남은 시간을 보여 주는 유일한 장치인 `PromptTimer`를 통째로 덮는다. 상대 손패
  여섯 장을 비교하다 시간이 지나면 **아무 예고 없이** 창이 닫히고 서버 폴백이 들어온다
  (초읽기(time_pressure) 국은 마감이 5~10초라 거의 확정이다).
- 재현/근거:
  - `PromptTimer`는 `OwnArea` 안에서만 그려진다 — App.tsx:17656 `{myPrompt !== null ? (<> <ActionBar …/> <PromptTimer …/> </>)}`.
  - `OwnArea`가 붙는 `.own-area`는 `z-index: 10` (styles.css:1990).
  - 모달은 `position: fixed; inset: 0; z-index: 120; background: rgba(11,19,16,0.62); backdrop-filter: blur(4px)` (styles.css:2407–2415) — body 직속 포털이라 판 전체를 덮는다.
  - 대비: 드래프트 창은 **자기 타이머를 창 안에 갖고 있고**(App.tsx:21351 `⏳ 남은 시간 N초`), 국 결과창도 마찬가지(App.tsx:21247). 이 모달들만 빠졌다.
  - 부분 완화는 있다: `PeekButton`이 `.rinshan-pick-overlay`도 대상으로 잡아(App.tsx:6451) **누르고 있는 동안** 판이 비친다. 하지만 그때 보이는 것은 가는 게이지 한 줄이고, 애초에 "시간이 가고 있다"를 모르면 누를 이유가 없다.
- 판정: **확정**
- 제안: `.rinshan-pick-panel` 머리줄에 드래프트 창과 같은 `⏳ 남은 시간 N초` 줄을 넣는다.
  `promptDeadline`은 이미 `GameTable`→`OwnArea`까지 내려와 있으므로(App.tsx:12505) 배선은 없고,
  `PromptTimer`를 `onTimeout` 문구와 함께 패널 안에 한 번 더 그리면 된다.

---

### [P1] 리플레이 재생 바가 하단 좌석 손패를 덮는다
- 위치: `packages/client/src/styles.css:11488` (`.replayer-bar`) vs `packages/client/src/styles.css:1981` (`.own-area`)
- 증상: 리플레이를 열면 화면 아래 가운데 재생 바(⏮◀▶▶⏭ + 슬라이더 + 🧾)가
  **하단 시점 좌석의 손패 위에 얹힌다.** 손패를 한 수씩 되짚어 보려고 여는 화면인데
  정작 그 손패의 아랫부분이 불투명한 바에 가린다.
- 재현/근거: 둘 다 같은 상자(`.replayer` → `GameTable`)에 바닥 기준으로 붙는다.
  ```css
  .own-area    { position: absolute; bottom: 18px; z-index: 10; }   /* :1981 */
  .replayer-bar{ position: absolute; bottom: 10px; z-index: 60;
                 padding: 10px 16px; background: rgba(11,19,16,0.95); } /* :11488 */
  .rp-btn      { height: 34px; }                                    /* :11512 */
  ```
  바의 실측 높이 = 34(버튼) + 10+10(padding) + 2(테두리) ≈ **56px**, 차지 구간은 바닥에서
  10~66px. `.own-area`는 18px에서 시작하므로 **18~66px = 48px**이 겹치고, 그 구간은
  `.own-area`의 맨 아래 자식인 손패 줄이다(`.hand-tile`은 폰에서 최소 46px, styles.css:13617).
  z 60 > z 10 이라 바가 위다.
- 근거 보강 — **같은 문제의 정답이 이미 이 저장소에 있다.** 토스트(`.toast-stack`, :11553)와
  건너뛰기 알약(`.prod-skip`, :13244)은 정확히 이 사고로 수리돼서
  `bottom: max(…, calc(var(--own-band-full, 0px) + 12px))` 을 쓴다. `--own-band-full`은
  `OwnArea`가 실측해 `.game-root`에 올려 주는 값이라(App.tsx:16862–16865) 리플레이에서도
  그대로 살아 있는데, `.replayer-bar`만 `bottom: 10px` 고정으로 남았다.
  덤으로 `env(safe-area-inset-bottom)`도 없어 아이폰에서는 홈 인디케이터 밑으로 들어간다.
- 판정: **확정**
- 제안: `.replayer-bar { bottom: max(calc(10px + env(safe-area-inset-bottom,0px)), calc(var(--own-band-full,0px) + 10px + env(safe-area-inset-bottom,0px))); }` —
  토스트·건너뛰기와 완전히 같은 식으로 맞춘다.

---

### [P2] 연출 «건너뛰기» 알약이 가장 최근 토스트를 정확히 덮는다
- 위치: `packages/client/src/styles.css:13244` (`.prod-skip`) vs `packages/client/src/styles.css:11553` (`.toast-stack`)
- 증상: 컷인이 도는 동안 토스트가 뜨면 **가장 새 토스트가 건너뛰기 알약에 가려 안 보인다.**
  하필 겹치는 조합이 실제로 자주 난다: 남이 론·후로·증강을 선언하면 컷인이 돌고(=알약이 뜨고),
  그 순간 내 프롬프트는 `promptCancel(reason:"preempted")`로 접히며
  「다른 사람의 선언이 우선합니다」 토스트를 낸다(App.tsx:4615). 시간 초과
  (「시간 초과 — 쯔모기리로 자동 진행했습니다」, App.tsx:4605)도 같은 자리에 온다.
- 재현/근거: 두 요소가 **같은 좌표식**을 쓴다.
  ```css
  .toast-stack { left:50%; transform:translateX(-50%); z-index:100;
                 bottom: max(28px, calc(var(--own-band-full,0px) + 12px));
                 flex-direction: column-reverse; }   /* 새 것이 맨 아래 */
  .prod-skip   { left:50%; transform:translateX(-50%); z-index:250; min-height:44px;
                 background: rgba(9,16,13,0.86);
                 bottom: max(calc(12px+env(safe-area-inset-bottom,0px)),
                             calc(var(--own-band-full,0px) + 12px + env(safe-area-inset-bottom,0px))); }
  ```
  대국 중에는 `--own-band-full`이 항상 세팅되므로(App.tsx:16865) 두 `max()`의 승자는 같은 항이고,
  노치 없는 기기(safe-area = 0)에서는 **bottom 값이 완전히 동일**하다. `column-reverse`라
  가장 새 토스트가 스택 맨 아래 = 알약과 같은 줄에 서고, 알약이 z 250 · 불투명 배경이라 덮는다.
- 판정: **확정**
- 제안: 토스트 스택 쪽을 알약 높이만큼 더 올리거나(`+ 56px` 를 알약이 떠 있을 때만),
  둘을 한 세로 흐름으로 묶는다. `.toast-stack`에 `env(safe-area-inset-bottom)`이 빠져 있는 것도
  같이 맞춘다(아이폰에서 토스트만 홈 인디케이터 쪽으로 내려간다).

---

### [P2] «내 차례다»를 알리는 신호가 시각 말고 하나도 없다 — 만들어 둔 진동은 호출되지 않는 죽은 코드다
- 위치: `packages/client/src/haptics.ts:60` (`haptics.turn`) / `packages/client/src/App.tsx:4585` (`sfx.callPrompt`)
- 증상: 치·펑·깡·론 같은 **반응 프롬프트**에는 "삑" 소리가 나는데, **내 턴의 평범한 버림
  프롬프트에는 소리도 진동도 없다.** 화면을 잠깐 안 보고 있으면 내 순이 시작된 줄 모르고,
  초읽기(5초) 국에서는 그대로 쯔모기리 폴백으로 넘어간다.
- 재현/근거:
  - 소리: App.tsx:4583–4590 의 주석이 명시한다 — `// 내 턴의 일반 버림 프롬프트에는 울리지 않는다`.
    조건은 `opts.some(o => o.type === "pass") && opts.some(o => o.type !== "pass")` 라 버림 프롬프트는 걸리지 않는다.
  - 진동: `haptics.ts`가 정확히 이 용도의 함수를 갖고 있다 —
    `turn: () => buzz(12)  /** 내 차례가 왔다 (초읽기 국에서 특히 — 화면을 안 보고 있을 수 있다) */`.
    그런데 저장소 전체에서 호출부가 0건이다:
    ```
    $ grep -rn "haptics\.\(turn\|win\|reject\)" packages/client/src packages/client/test
    (출력 없음)
    ```
    실제로 쓰이는 것은 `haptics.discard`(App.tsx:3495, 5479)와 `haptics.declare`(3023, 5189)뿐이다.
    `haptics.win`(화료)·`haptics.reject`(못 누르는 것을 눌렀을 때)도 같이 죽어 있다 —
    특히 `reject`는 봉인패·쿠이카에를 눌렀을 때 토스트만 뜨고(App.tsx:17955) 손끝 신호가 없다.
- 판정: **확정** (죽은 코드는 grep으로 확정, "신호가 없다"는 위 두 근거의 직접 귀결)
- 제안: `prompt` 도착 처리(App.tsx:4585 근처)에서 내 좌석의 버림 프롬프트일 때 `haptics.turn()`을
  부른다(소리는 매 순 울리면 시끄러우니 진동만, 또는 초읽기 국 한정). 화료 컷인에 `haptics.win()`,
  봉인/쿠이카에 안내 토스트(App.tsx:17955)와 코치 차단(17878)에 `haptics.reject()`를 붙이면
  세 함수가 모두 의도대로 산다.

---

### [P2] 리플레이 조작 버튼이 터치 목표 규격에서 통째로 빠졌다
- 위치: `packages/client/src/styles.css:11512` (`.rp-btn`) vs `packages/client/src/styles.css:13569` (`@media (pointer: coarse)` 블록)
- 증상: 폰에서 리플레이를 보면 ⏮ ◀ ▶ ▶ ⏭ 🧾 🔗 이 **36×34px**로 서고, 그 사이에 네이티브
  range 슬라이더가 `flex: 1`로 끼어 있다. 한 수씩 되짚는 조작을 수백 번 하는 화면인데
  버튼이 좁고 서로 8px 간격이라 «다음 한 수»를 누르려다 «다음 국»으로 뛴다 — 되감으면
  복구는 되지만 위치를 다시 찾아야 한다.
- 재현/근거: 파일이 스스로 기준을 적어 두었다(styles.css:13566) —
  「9-2. 손가락 목표 크기 — 최소 44px」. 그 `@media (pointer: coarse)` 블록의 명단은
  `.icon-btn .qt-item .act .aug-pill .auth-tab .auth-advanced-toggle .aug-btn .codex-tab
  .codex-back .coach-next .coach-quit .rotate-hint-close .home-refresh .ui-zoom-btn .codex-cat`
  이다. `.rp-btn` / `.rp-play` / `.rp-speed` / `.replayer-slider` 는 **하나도 없다.**
  (`.rp-play`만 `width: 44px`이고 높이는 여전히 34px이다 — styles.css:11524.)
- 판정: **확정**
- 제안: coarse 블록에 `.rp-btn { min-width: 44px; min-height: 44px; }` 를 더한다.
  좁은 폭에서 줄이 넘치면 `.replayer-bar { flex-wrap: wrap }` 로 접는다(액션 바가 쓰는 방식과 같다).

---

### [P2] 판 위 공지를 내리는 「✕」가 손가락으로 누를 수 없는 크기다
- 위치: `packages/client/src/styles.css:14539` (`.notice-close`) / `packages/client/src/App.tsx:10044`
- 증상: 대국 중 전역 공지는 왼쪽 위에 카드로 선다. 좁은 화면에서는 폭이
  `min(260px, 100cqw - 16px)` · 높이 최대 `40cqh` 라 **375px 폰에서 가로의 69%**를 물고,
  거기가 상가(왼쪽 자리)의 버림패·이름표 자리다. 내릴 방법은 카드 오른쪽 위 「✕」 하나뿐인데
  그 버튼이 대략 17px이라 폰에서 잘 안 눌린다 — 몇 번 헛짚다가 그냥 두고 두게 된다.
- 재현/근거:
  ```css
  .notice-close { position:absolute; top:4px; right:6px;
                  padding: 2px 5px; font-size: 13px; line-height: 1; }  /* :14539 */
  ```
  높이 = 13(글자) + 2+2(padding) ≈ **17px**. `@media (pointer: coarse)` 명단(styles.css:13569)에
  `.notice-close`가 없다 — 그 블록은 같은 성격의 `.rotate-hint-close`(30px)를 「못 누르면
  막다른 골목이 된다」는 이유로 명시적으로 44px로 올려 두었는데 이것만 빠졌다.
  카드 폭은 styles.css:14520–14525 (`@container ui (max-width: 700px)`).
- 판정: **확정**
- 제안: coarse 블록에 `.notice-close { min-width: 44px; min-height: 44px; }` 를 넣고,
  머리줄의 `padding-right: 22px`(styles.css:14537)도 그만큼 늘린다.

---

## 확정건 요약

| 심각도 | 제목 | 위치 |
|---|---|---|
| P1 | 증강 선택 모달이 제한시간 표시를 덮는다 — 시간 초과 시 서버가 대신 고른다 | styles.css:2407 / App.tsx:17666 |
| P1 | 리플레이 재생 바가 하단 좌석 손패를 48px 덮는다 (`--own-band-full` 미적용) | styles.css:11488 |
| P2 | «건너뛰기» 알약이 가장 최근 토스트와 같은 좌표에 서서 덮는다 | styles.css:13244 / :11553 |
| P2 | 내 차례 알림이 시각뿐 — `haptics.turn`·`win`·`reject`가 호출부 0건인 죽은 코드 | haptics.ts:60 / App.tsx:4585 |
| P2 | 리플레이 조작 버튼(36×34)이 터치 44px 규격 명단에서 누락 | styles.css:11512 / :13569 |
| P2 | 판 위 공지의 「✕」가 ~17px — 유일한 해제 수단인데 폰에서 못 누른다 | styles.css:14539 |

의심 항목으로 남길 만한 것: **없음.** 아래는 확인했으나 **문제가 아니었다**(중복 보고 방지용 기록).

- 버림패 두 번 탭 게이트의 새는 경로 셋 — 전부 막혀 있다(App.tsx:16994, 16999, 17013).
- 액션 바 이중 제출 — `submitOption`이 전송 성공 즉시 `dropPrompt`로 버튼을 걷는다(App.tsx:5500).
- 드래프트 카드 안 «자세히»/용어 링크가 증강을 뽑아 버리는가 — `stopPropagation` 있음(App.tsx:8148, 8013).
- 리치 선언패가 후로·도굴로 밀려 엉뚱한 패에 눕는가 — 코어가 tileId로 되찾는다(PlayerView.ts:891, 테스트 PlayerView.test.ts:450).
- 초대장이 판을 가리는가 — `!inGame && !inWaiting` 조건으로 대국 중엔 안 뜬다(App.tsx:6364).
- Esc·Space(연출 건너뛰기)가 액션 단축키와 충돌하는가 — `ActionHotkeys`가 둘을 의도적으로 안 잡는다(App.tsx:20238 주석).
- 모달 위 정형구(`.emote-bar`, z 60)가 탭을 가로채는가 — `body:has(.overlay)`로 걷히고, 증강 픽 모달은 z 120이라 그 위다.
