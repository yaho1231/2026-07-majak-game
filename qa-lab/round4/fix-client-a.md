# QA 4라운드 수정 로그 — client-fix-A (1차 배치)

담당 파일: `packages/client/src/` (App.tsx · styles.css). 서버 패키지는 손대지 않았다.
읽은 보고서: `qa-lab/round4/ingame-ux.md` · `qa-lab/round4/mobile-a11y.md`.

검증:
- `npm run typecheck:client` — 통과 (에러 0)
- `npx vitest run packages/client` — **43 파일 · 659 테스트 전부 통과** (새 파일 25건 포함)
- 회귀 테스트: `packages/client/test/qaRound4ClientA.test.ts` (신규, 25건)
- 레이아웃 건은 vite dev 서버 + 실측 하네스로 눈으로 확인했다(아래 «실측» 참고)

---

## 고친 것

| 항목 | 고친 방법 | 근거/테스트 |
|---|---|---|
| **P1** 증강 선택 모달이 제한시간을 가린다 (ingame-ux) | `PickTimer` 컴포넌트를 새로 만들어 **모든 `.rinshan-pick-panel` 모달 10곳** 머리에 `⏳ 남은 시간 N초` 줄을 세웠다. 드래프트 창의 `.draft-timer` 겉모습을 그대로 쓰고, 5초 아래에서 `draft-timer-urgent`로 갈아입는다. 마감이 없는 평시 국에서는 아무것도 그리지 않는다. `ActiveAugmentControl`에 `promptDeadline` prop을 새로 배선했다(등가교환·미래교환·영상패는 `OwnArea` 안이라 배선이 이미 있었다). | 테스트: 「모든 `.rinshan-pick-panel` 모달이 PickTimer 를 하나씩 갖는다」 — **개수로** 못을 박아 새 모달이 생겨도 빠뜨릴 수 없다. |
| **P1** 리플레이 재생 바가 하단 손패를 48px 덮는다 | `.replayer-bar { bottom: 10px }` → 토스트·건너뛰기 알약과 **완전히 같은 식**(`max(10px+safe-area, --own-band-full + 10px + safe-area)`). 44px 버튼으로 좁은 폭에서 줄이 넘치므로 `flex-wrap: wrap` + `justify-content: center` 도 같이 넣었다. | 테스트 2건. 실측(360px): 바 아래끝 630px · 손패 띠 위끝 640px → **겹침 0** (전에는 48px 겹침). |
| **P1** 폰 우상단 아이콘 5개가 4px씩 겹친다 (mobile-a11y) | `min-width:44px`(coarse)와 40px 피치가 부딪히는 문제 — 폭을 줄이는 대신 **피치를 48px로** 벌렸다. 40px 피치를 선언하는 두 블록(`@container ui (max-width:700px)` · `(max-height:560px) and (orientation:landscape)`)과 **정확히 같은 조건**의 `@media (pointer: coarse)` 안에서 `--icon-x` 기준 `calc(+48/96/144/192px)`. safe-area·대기실 변형(`.waitroom-card`)까지 함께 맞췄다. | 테스트 2건(피치 값 + **선언 순서**). 실측(360px, coarse): 5개 버튼 44px 폭 · 48px 피치 · **겹침 0**. 비-coarse에서는 예전 그대로(40px). |
| **P1** 규칙·계산식 설명이 `title=` 에만 있다 (mobile-a11y) | `InfoNote` 컴포넌트 신설 — `tabIndex={0}` + `role="button"` + `aria-expanded` 를 실은 span에 `ⓘ` 표식과 팝오버를 얹는다. **hover · focus-within · 탭 고정** 세 통로 전부 열린다(`.aug-pill:focus-within .aug-tip` 과 같은 식). `title` 은 남겼다(데스크톱 보조기술 통로). `white-space: pre-line` 이라 원래 `title` 의 줄바꿈이 살아난다. 옮긴 곳 **5**: ① 오름패 계산식(`waits-badge-hint`) ② 티어표 열 머리 6개 ③ 서든데스(모드 뱃지) ④ 중계 화면 증강 설명 전문 ⑤ 드래프트 «보유 중» 증강 설명 전문. | 테스트 4건. 겉모습은 원래 클래스가 그대로 지고, `.mode-badge` 만 `position:absolute`·`pointer-events:auto` 를 명시적으로 되돌렸다(원래 `pointer-events:none` 이라 **애초에 눌릴 수 없었다**). 실측 스크린샷으로 팝오버·줄바꿈 확인. |
| **P1** 「왜 지금 못 쓰는가」 (같은 항목의 5번째 자리) | 액티브 증강 버튼이 진짜 `disabled` 라 **포커스도 클릭도 안 잡혀 이유를 물을 방법 자체가 없었다**. `aria-disabled` 로 바꿔 누를 수는 있게 두고, 누르면 `haptics.reject()` + 이유 토스트(`… — 이름 — 쿨다운 2국 · …`)를 낸다. 겉모습은 `.aug-btn[aria-disabled="true"]` 로 그대로. | 테스트 1건(`disabled={!usable}` 이 돌아오면 실패). |
| **P2** «건너뛰기» 알약이 최신 토스트를 덮는다 | 두 요소의 `bottom` 식이 같아 노치 없는 기기에서 **완전히 같은 값**이었다. `body:has(.prod-skip) .toast-stack` 으로 알약이 떠 있는 동안만 토스트를 52px 올린다. 겸사겸사 `.toast-stack` 에 빠져 있던 `env(safe-area-inset-bottom)` 도 넣었다. | 테스트 2건. |
| **P2** 내 차례 알림이 시각뿐 (죽은 haptics) | `haptics.turn` / `win` / `reject` 세 함수 모두 실제 호출부를 만들었다. **turn**: 내 좌석의 버림 프롬프트(리액션 프롬프트 제외)마다. **win**: 내가 낀 화료 컷인. **reject**: 봉인패·쿠이카에 안내, 코치 차단, 못 쓰는 증강 버튼. | 테스트 4건. |
| **P2** 버림 프롬프트의 **소리** — 판단 | **초읽기 국에서만** 붙였다(`deadlineMs <= 12초`). 매 순 울리면 시끄럽고(한 국에 열여덟 번), 아예 없으면 마감 5~10초 국에서 화면을 안 보는 사람은 손도 못 써 본다. 진동은 소리 설정과 독립이라 상시. | 테스트 1건(조건식). |
| **P2** 리플레이 버튼이 터치 44px 명단에서 누락 | coarse 블록에 `.rp-btn { min-width/min-height: 44px }` · `.rp-speed { min-width: 52px }` · `.replayer-slider { min-height: 44px }`. 넘치는 줄은 위의 `flex-wrap` 이 접는다. | 테스트 1건 + 실측 스크린샷. |
| **P2** 판 위 공지 「✕」가 44px 명단에서 누락 | `.notice-close` 44×44 + `inline-flex` 중앙 정렬(글리프 크기는 그대로), 머리줄 여백 22→46px. **파일 끝**에 따로 뒀다 — 9-2 블록은 `.notice-close` 본체와 `.game-notice-float > .notice-banner .notice-head`(선택자가 더 세다)보다 앞이라 거기서는 여백을 못 이긴다. | 테스트 1건. |
| **P2** 적5 도라가 색 단독 (mobile-a11y) | 전용 그림(0m/0p/0s) 때문에 `.tile-red` 를 일부러 빼던 자리에 `.tile-red-art` 를 새로 붙인다. 겉은 **테두리 선종(파선)** 이라는 색과 무관한 채널 하나만 얹고, `forced-colors: active` 에서도 `.tile-red` 와 같은 dashed outline 을 받게 했다. | 테스트 1건. |
| **P2** `prefers-contrast: more` 가 판 위 규칙 0건 | 새 블록에서 `.plate-dealer`(+흰 안쪽 테) · `.plate-turn`(3px 링) · `.tile-dora` · `.tile-dora-own` · `.tile-red`/`.tile-red-art` · `.hand-danger` · `.spec-danger-md/hi` · `.hand-riichi` 의 색을 채도·명도 올려 다시 잡고, 동시에 굵기·선종을 키운다. | 테스트 1건(7개 선택자 명단). |
| **P2** 공통 도라 vs 개인 도라가 색조만 다르다 | `.tile-dora-own` 에 `outline: 4px double` — `forced-colors` 에서만 쓰던 이중선을 평상시에도 쓴다(색과 무관한 갈래). `outline` 이라 `.tile-red-art` 의 `border-style` 과 채널이 겹치지 않는다. | 테스트 1건 + 스크린샷. |
| **P2** 중계 위험도 2단계에 글리프 없음 | 색만 다르던 2px 링 둘을 **중간 = 2px 파선 / 높음 = 3px 실선** 으로 갈랐다(굵기 + 선종 두 채널). `forced-colors` 에서도 같은 갈래가 남는다. | 테스트 1건. |
| **P3** `TileImg` 의 `alt` 가 `owner` 누락 | `alt={formatTile(tile, owner)}`. 각인 적도라(`redFor`)는 그 주인의 손에서만 붉게 **그리는데** alt 만 owner 를 안 넘겨 남의 손의 같은 패를 「赤5만」으로 읽었다 — 화면과 스크린리더가 서로 다른 판을 말하던 건. | 테스트 1건. |

---

## 실측 (dev 서버 + 하네스, 확인 후 하네스는 지웠다)

`vite dev` + `styles.css` 를 그대로 물린 정적 하네스로 `getBoundingClientRect()` 를 쟀다.

- **360×760 · `pointer: coarse`**
  - 아이콘 5개: 폭 44px · 좌표 116/164/212/260/308 → **피치 48px, 겹침 0**
  - `.replayer-bar` 아래끝 630px, `.own-area`(`--own-band-full: 120px`) 위끝 640px → **겹침 0**
- **같은 폭 · `pointer: fine`** (수리가 coarse 밖으로 새지 않는지)
  - 아이콘 폭 40px · 피치 40px → 예전 그대로, 겹침 0
- **InfoNote 팝오버**: 오름패 계산식·서든데스 둘 다 열리고 줄바꿈이 살아 있음.
  적5(파선) · 도라(금테) · 개인 도라(이중 링) · 위험 중간(파선)/높음(실선)이 색 없이도 갈린다.

---

## 안 고친 것 / 2차 배치로 넘긴 것

- **mobile-a11y P3 나머지 전부** — 지침대로 P3는 지정된 한 건(`TileImg` alt)만 고쳤다.
  남은 것: 리치 표식의 빈 span `title`, 중앙 패널 «차례»·«오야»의 sr-only, 브라우저 글자 크기
  (px 466 : rem 5 — 보고서 자신이 «즉시 고칠 성질이 아니다»로 판정), `.home-loading` 의
  reduced-motion, 터치 롱프레스 복사 차단. → **2차 배치 판단 대상**.
- **ingame-ux 의 나머지** — 담당 6건을 전부 처리했다. 남긴 것 없음.
- **CSS 단독 건의 «되돌리면 실패하는» 테스트 한계** — 실제 픽셀 겹침은 단위 테스트로 못 잰다.
  대신 (a) 값·선언 순서를 문자열로 못 박고 (b) 위 실측으로 확인했다. `.replayer-bar` 는
  `bottom: 10px` 고정이 돌아오면 테스트가 실패한다.
- **`.mode-badge` 안의 `ⓘ` 가 이름·증강 수 아래 한 줄로 선다** (뱃지가 `flex-direction: column`
  이라). 배치를 바꾸면 뱃지 폭이 흔들리므로 그대로 뒀다 — 기능(탭해서 열기)에는 영향 없다.

## 2차 배치가 알아야 할 것 (같은 파일을 이어받으므로)

- `App.tsx` 에 컴포넌트 **둘**이 새로 생겼다: `InfoNote`(터치에서 열리는 설명 칩) ·
  `PickTimer`(모달 안 남은 시간). `title=` 만 있는 다른 자리를 고칠 때 `InfoNote` 를 그대로 쓰면 된다.
- `styles.css` 끝에 블록 넷이 붙었다: **9-2-b**(공지 ✕) · **9-2-c**(알약↔토스트) ·
  **9-4**(InfoNote) · **9-5**(색 말고 다른 채널). 셋은 «앞선 규칙을 이겨야 해서» 파일 끝에 있다 —
  중간으로 옮기면 조용히 무효가 된다.
- `ActiveAugmentControl` 에 `promptDeadline` · `onToast` prop 이 새로 생겼다.
