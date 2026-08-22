# QA 4라운드 — mobile-a11y (작은 화면 · 손가락 · 눈/귀)

조사만 했다. 파일은 고치지 않았다.
근거는 전부 코드 인용이다(대국 화면은 서버·로그인이 필요해 실기 구동은 하지 않았고,
겹침 계산은 CSS 캐스케이드 규칙 + 리터럴 상수 산술로 확정했다).

먼저 적어 둘 것: **이 저장소의 모바일·접근성 수준은 이미 매우 높다.**
`prefers-reduced-motion`, safe-area, 44px 터치 목표, 손패 `aria-label` 상태 표기,
호버 전용 노출 제거, 스크롤 갇힘 방지는 이미 감사되어 처리돼 있다(§«없다고 확인한 것» 참고).
아래는 그 그물을 빠져나간 것들이다.

---

### [P1] 폰에서 우상단 아이콘 버튼 5개가 서로 4px씩 올라탄다
- 위치: packages/client/src/styles.css:13570 vs 7987-7991 / 8168-8172
- 증상: 터치 기기에서 나가기·설정·기록·도감·규칙 버튼이 각각 이웃에 4px 가려진다.
  DOM 순서상 나중에 그려지는 `.leave-btn`(App.tsx:12403)이 `.settings-btn`(12371)의
  오른쪽 4px를 덮고, `.auglog-btn`(13913)이 그 위를 또 덮는다. 가장자리를 짚으면
  엉뚱한 버튼이 열린다 — 그중 하나가 «나가기»다.
- 재현/근거: 좁은 판/가로 폰 블록이 버튼 폭을 34~40px로 잡고 **40px 피치**로 배치한다.
  ```css
  /* 8167 (@container ui max-height:560 and landscape) */
  .icon-btn { top: 8px; width: 34px; height: 34px; font-size: 15px; }
  .leave-btn { right: 8px; }  .settings-btn { right: 48px; }
  .auglog-btn { right: 88px; } .codex-btn { right: 128px; } .help-btn { right: 168px; }
  /* 7981-7991 (@container ui max-width:700) 도 동일한 40px 피치 */
  /* 13616 (@container ui max-width:480) */
  .icon-btn { width: 40px; height: 40px; font-size: 15px; }
  ```
  그런데 뒤에서 터치 목표를 강제한다:
  ```css
  /* 13569 */
  @media (pointer: coarse) { .icon-btn { min-width: 44px; min-height: 44px; } }
  ```
  `min-width`는 선언 순서와 무관하게 `width`를 이긴다 → 실제 폭 44px, 피치 40px
  → **쌍마다 4px 겹침**. (13570은 13616보다 앞이지만 속성이 달라 순서 문제가 아니다.)
- 판정: 확정
- 제안: `@media (pointer: coarse)` 안에서 피치도 44+ 로 맞춘다(8/56/104/152/200 또는
  `right: calc(8px + var(--i) * 48px)`). 또는 좁은 화면에서는 아이콘 줄을
  flex 컨테이너 하나로 묶어 `gap`으로 배치하고 개별 `right`를 없앤다.

### [P1] 규칙·수치의 유일한 설명이 `title=`에만 있어 터치에서 영영 안 보인다
- 위치: packages/client/src/App.tsx:18648, 8301-8306, 11841, 16091, 16104, 18636/18736, 20189/20217, 18379, 21391
- 증상: 네이티브 `title` 툴팁은 터치에서 뜨지 않는다(여러 줄이면 더더욱). 폰 사용자는
  화면에 뜬 숫자·태그가 무슨 뜻인지 알 방법이 하나도 없다.
- 재현/근거 (정보가 **다른 어디에도 없는** 것만 골랐다):
  ```jsx
  // 18648 — 오름패 위 숫자의 계산식. 보이는 글자는 "남은 장수" 뿐이다.
  title="패 위 숫자 = 기본 4장에서 버림패·후로·도라 표시패·내 손패에 나온 만큼을 뺀 수 (증강 생성패는 세지 않음)"
  // 8301-8306 — 티어표 열 머리. 보이는 글자는 "총점 / 가중치" 뿐이다.
  <th className="tier-num" title="타점×3 + 속도×3 + 무대응×2 + 빈도×2">총점</th>
  // 11841 — 서든데스 규칙. 다른 데 없다.
  title={`${m.name} — 증강 획득: ${m.drafts}\n정규 구간이 끝나도 …(서든데스)…`}
  // 16091 / 16104 — 일발·역없음의 뜻
  <span className="np-ippatsu" title="일발이 살아 있습니다 — 누가 울면 사라집니다">일발</span>
  <span className="np-noyaku" title="텐파이지만 역이 없어 화료할 수 없습니다">역없음</span>
  // 20189 — 「왜 지금 못 쓰는가」. 여러 줄이라 터치에서는 100% 사라진다.
  : `지금은 사용할 수 없습니다\n${activeIds.map(blockedNote).join("\n")}`
  // 18379 / 21391 — 상대·보유 증강의 설명 전문
  title={catalog[id]?.description ?? id}
  ```
  게다가 18648의 `.waits-badge-hint` 는 `cursor: help`(styles.css:7415)만 달린 맨 `<span>`
  이라 포커스도 안 잡힌다 → 키보드에서도 못 읽는다.
- 판정: 확정
- 제안: 저장소 안에 이미 두 가지 정답 패턴이 있다. 그대로 복사하면 된다.
  ① 탭하면 토스트 (App.tsx:17957 `props.onToast?.(sealed ? SEAL_HINT : KUIKAE_HINT)`)
  ② `tabIndex={0}` + 클릭 고정 팝오버 (App.tsx:15943 + styles.css:7449 `.aug-pill:focus-within .aug-tip`)
  최소한 18648 · 8301 · 20189 · 18379/21391 은 ②로 옮긴다.

### [P2] 적5(赤ドラ)가 화면상 **색 단독** — 고대비 모드에서도 보정되지 않는다
- 위치: packages/client/src/App.tsx:2337(`usesRedArt`), 2423, styles.css:3301-3320, 13468-13487
- 증상: 적색약·적록색맹 사용자에게 적5와 평범한 5는 그림이 완전히 같다(잉크 색만 다르다).
  점수가 1판 차이 나는 정보인데 화면에는 그 차이를 말하는 것이 색밖에 없다.
- 재현/근거:
  ```jsx
  // 2423 — 5인 적도라는 전용 그림을 쓰므로 .tile-red 클래스를 **일부러 뺀다**
  const red = tile !== undefined && isRed && !usesRedArt(tile.kind, true) ? " tile-red" : "";
  ```
  그래서 `forced-colors: active` 의 유일한 비색 표식도 5에는 안 걸린다:
  ```css
  /* 13480 */ .tile-red { outline: 2px dashed Highlight; outline-offset: -2px; }
  ```
  즉 Windows 고대비에서 적5는 그림의 붉은 잉크마저 평탄화되어 **더** 구분이 안 된다.
  텍스트 통로는 `formatTile()`의 `赤` 접두(App.tsx:2320)뿐 = 스크린리더 전용.
- 판정: 확정
- 제안: 적5에도 `.tile-red`(또는 `.tile-red-art`)를 붙여 모서리 표식 하나를 얹는다.
  최소한 `forced-colors` 블록에서 5 적도라에 dashed outline이 걸리게 한다.

### [P2] `prefers-contrast: more` 가 토큰 5개만 손대고 판 위 규칙은 0건
- 위치: packages/client/src/styles.css:13458-13466
- 증상: 고대비를 켜 둔 저시력 사용자에게 대국 화면은 사실상 아무것도 바뀌지 않는다.
  정작 중요한 표식들이 전부 리터럴 색이라 그대로다.
- 재현/근거: 블록 전문이 `--ink-2/3/4 · --line · --line-strong` 재정의뿐이다.
  손 안 대는 것들(전부 리터럴): `.plate-dealer #9c392e`, `.plate-turn` 황동 링,
  `.tile-dora #b8975c`, `.tile-dora-own #f9a0d7`, `.tile-red #e2564f`,
  `.hand-danger rgba(245,102,102,.9)`, `.spec-danger-md/hi`, `.hand-riichi #f68173`.
  바로 위 `prefers-reduced-motion` 블록(13402-13452)이 25개 선택자를 하나하나 따지는 것과 대조된다.
- 판정: 확정
- 제안: 위 표식들의 색을 변수로 뽑고 이 블록에서 채도·명도를 올린다. 표식마다
  «색 + 모양» 두 채널을 갖게 하는 쪽이 근본 해결이다.

### [P2] 공통 도라와 내 개인 도라가 **색조만** 다르다
- 위치: packages/client/src/styles.css:3351(.tile-dora) vs 3363(.tile-dora-own), 3388 vs 3392
- 증상: 금색(공통) / 장미색(개인)만 다르고 테두리 굵기·글로우 반경·`::before` 광택
  그라디언트는 바이트 단위로 동일하다. 색을 못 가리면 "이게 내 도라인가"를 알 수 없다.
- 재현/근거: 3388과 3392의 `::before` 그라디언트가 둘 다 `rgba(247,243,232,0.95)` 로 같다.
  `forced-colors` 에서만 `outline-style: double`(13475)로 갈라진다 — 평상시엔 갈래가 없다.
- 판정: 확정
- 제안: `forced-colors` 에서 이미 쓰는 double outline 을 평상시에도 쓴다(색과 무관한 갈래).

### [P2] 중계 위험도 2단계가 색만 — 텍스트·기호·툴팁이 전혀 없다
- 위치: packages/client/src/App.tsx:18223-18227, styles.css:11338-11365
- 증상: 관전 화면에서 «중간 위험»과 «높은 위험»이 호박색 vs 붉은색 2px 링으로만
  구분된다. 굵기·모양이 같아 색약 사용자에게는 단계 구분이 사라진다.
- 재현/근거:
  ```css
  .spec-danger-md { box-shadow: inset 0 0 0 2px rgba(226, 178, 92, 0.75); border-radius: 4px; }
  .spec-danger-hi { box-shadow: inset 0 0 0 2px rgba(226,  96, 84, 0.90); border-radius: 4px; }
  ```
  같은 게임의 본인용 위험 표시(`.hand-danger`)는 `⚠` 글리프 뱃지를 단다(App.tsx:17969) —
  중계 쪽만 빠졌다.
- 판정: 확정
- 제안: hi 는 3px 실선, md 는 2px 파선처럼 굵기/선종으로 갈라거나 `⚠`/`△` 글리프를 얹는다.

### [P3] 리치 표식이 **빈 `<span>`의 `title`** 뿐 — 보조기술에 이름이 안 선다
- 위치: packages/client/src/App.tsx:14540
- 증상: 중앙 패널의 리치봉 그래픽에 텍스트도 `aria-label`도 없다.
  ```jsx
  {riichi ? <span className="plate-stick" title="리치" /> : null}
  ```
  콘텐츠 없는 generic span의 `title`은 대부분의 스크린리더가 읽지 않는다.
- 완화: **선언 순간**은 연출 큐 live 영역(App.tsx:6316)으로 읽힌다. 문제는 지속 상태 —
  몇 순 지난 뒤 "누가 리치 중인지"를 다시 확인할 통로가 없다.
- 판정: 확정
- 제안: `role="img" aria-label="리치"` 를 붙인다(한 줄).

### [P3] 중앙 패널의 «차례»·«오야»는 색/맥동뿐 (이름표에는 텍스트가 있다)
- 위치: packages/client/src/styles.css:1016(.plate-dealer), 1024-1041(.plate-turn), App.tsx:14537-14538
- 증상: 이름표는 `<span className="np-turn" aria-label="현재 차례">차례</span>`(App.tsx:15901)
  로 제대로 말하는데, 중앙 4칸은 황동 링 + opacity 맥동만이고 오야는 붉은 배경뿐이다.
- 판정: 확정 (동일 정보가 이름표에 있으므로 심각도는 낮다)
- 제안: `.plate-turn` 에 `aria-current` 또는 sr-only 텍스트를 붙인다.

### [P3] 브라우저 **글자 크기** 설정(확대와 다름)이 완전히 무시된다
- 위치: packages/client/src/styles.css 전역
- 증상: `font-size: …px` 선언이 466곳, `rem` 사용은 5곳. 브라우저 기본/최소 글꼴 크기를
  키워 둔 저시력 사용자에게 화면이 1px도 안 바뀐다.
- 완화: 브라우저 확대(zoom)와 Alt +/− 배율 사다리(uiScale.ts, 최대 2.0)가 둘 다 살아 있고
  `user-scalable`도 안 막았다 → WCAG 1.4.4 자체는 통과한다. 그래서 P3다.
- 판정: 확정
- 제안: 즉시 고칠 성질이 아니다(고정 px가 이 배치의 전제다 — uiScale.ts 주석 참고). 기록만.

### [P3] `.home-loading` 만 `prefers-reduced-motion` 그물에서 빠졌다
- 위치: packages/client/src/styles.css:9787-9795
- 증상: 홈 로딩 문구가 움직임 축소 설정에서도 계속 명멸한다. 게다가 `--ink-4` 위에
  `opacity: 0.5` 까지 내려가 저점에서 대비가 ~2.4:1 이다.
- 재현/근거: 파일 전체 `infinite` 애니메이션 38개 중 reduce 블록이 안 덮는 유일한 항목.
  (나머지 37개는 13402-13452 등에서 전부 개별 처리돼 있다.)
- 판정: 확정
- 제안: reduce 블록에 `.home-loading { animation: none; opacity: 1; }` 한 줄.

### [P3] 롱프레스 복사 차단 — 코드 주석이 사실과 다르다
- 위치: packages/client/src/contextMenu.ts (window `contextmenu` 리스너)
- 증상: 폰에서 길게 눌러 텍스트를 복사할 수 없다. 롱프레스는 `contextmenu` 를 쏘고
  이 리스너가 `preventDefault()` 한다. 마우스에서는 Cmd/Ctrl+C 가 남지만 터치에는 대안이 없다.
- 재현/근거: 파일 주석은 `판 위의 글자는 선택·복사가 그대로 되고(우클릭 메뉴만 안 뜬다)`
  라고 적혀 있다 — 데스크톱 기준으로만 참이다. 방 코드만 탭-복사 버튼(App.tsx:11508)으로 구제된다.
- 판정: 확정
- 제안: `if (window.matchMedia("(pointer: coarse)").matches) return;` 로 터치에서는 통과시키거나,
  최소한 주석을 사실에 맞게 고친다.

### [P3] `TileImg` 의 `alt` 가 `owner` 를 안 넘겨 각인 적도라를 남의 손에서도 «赤»으로 읽는다
- 위치: packages/client/src/App.tsx:2434 (vs 2430)
- 증상: 화면에는 붉게 안 그리기로 한 패(§10-1, 각인 `redFor`)를 스크린리더는 「赤5만」으로
  읽는다. 눈으로 보는 사람과 듣는 사람이 **서로 다른 판을 본다**.
- 재현/근거:
  ```jsx
  // 2430 (텍스트 갈래) — owner 를 넘긴다
  {formatTile(tile, owner)}
  // 2434 (이미지 갈래) — 안 넘긴다
  <img src={src} alt={formatTile(tile)} draggable={false} />
  ```
- 판정: 확정
- 제안: `alt={formatTile(tile, owner)}`.

---

## 없다고 확인한 것 (억지로 채우지 않기 위해 명시)

- **호버 전용 기능**: `@media (hover: hover)` 8곳 전부 장식/억제뿐. 유일한
  `display:none → hover` 인 `.aug-tip` 은 `:focus`·`:focus-within`·`.aug-pill-pinned`
  (styles.css:7449) + 탭 고정(App.tsx:15943)으로 터치·키보드 모두 열린다. 이 항목은 깨끗하다.
- **`prefers-reduced-motion`**: 무한 애니메이션 38개 중 37개가 개별 처리돼 있고,
  각 결정에 근거 주석이 붙어 있다. 위 P3 한 건 외에 지적할 것이 없다.
- **터치 목표 44px**: styles.css:13569 블록이 아이콘·액션·탭·닫기 버튼을 전부 덮는다.
  손패 폭은 360px에서 ~22px 이지만 (a) 세로 46px 확보, (b) 폰 기본값 «두 번 눌러 버리기»
  (App.tsx:1168, 12974)로 오탭이 되돌려진다 → 결함으로 올리지 않는다.
- **safe-area / 노치**: `viewport-fit=cover` + `env(safe-area-inset-*)` 가 아이콘 줄·
  빠른 토글·배율 손잡이·`.own-area` 에 전부 걸려 있다(styles.css:13504-13650).
- **스크롤 갇힘 / 화면보다 큰 모달**: `.screen-overlay/.result-panel/.codex` 는
  `max-height:100cqh + overflow-y:auto`(13676), 설정·기록 패널은 `--panel-top` 을 빼고
  높이를 잡아 아래끝이 안 잘린다(6525). 드래그 패널은 `clamp()`로 화면 안에 갇히고
  위치를 저장하지 않는다(App.tsx:12869) → 갇히는 경로 없음.
- **키보드 플레이**: 손패가 `<button>` + 상태를 실은 `aria-label` + `onFocus` 미리보기
  (App.tsx:17782-17864), 상대 지목·증강 pill도 `tabIndex={0}`. 드래그 전용 필수 조작 없음.
- **음소거 시 정보 손실**: 연출 큐 전체가 sr-only live 영역으로 나가고(App.tsx:6316),
  차례/쯔모도 별도 live(17498). haptics.ts 가 소리 설정과 **독립**으로 동작한다.

---

## 확정건 요약

| 심각도 | 제목 | 위치 |
|---|---|---|
| P1 | 폰 우상단 아이콘 버튼 5개가 4px씩 겹친다 (min-width 44 vs 피치 40) | styles.css:13570 / 7987 / 8168 |
| P1 | 규칙·계산식 설명이 `title=` 에만 있어 터치에서 접근 불가 | App.tsx:18648, 8301, 11841, 20189, 18379, 21391 |
| P2 | 적5 도라가 화면상 색 단독 — forced-colors 에서도 미보정 | App.tsx:2423, styles.css:13480 |
| P2 | `prefers-contrast: more` 가 토큰 5개만, 판 위 규칙 0건 | styles.css:13458 |
| P2 | 공통 도라 vs 개인 도라가 색조만 다름 | styles.css:3351 / 3363 |
| P2 | 중계 위험도 2단계가 색만 (텍스트·기호 없음) | App.tsx:18223, styles.css:11338 |
| P3 | 리치 표식이 빈 span 의 `title` 뿐 | App.tsx:14540 |
| P3 | 중앙 패널 차례·오야가 색/맥동뿐 | styles.css:1016, 1024 |
| P3 | 브라우저 글자크기 설정 무시 (px 466 : rem 5) | styles.css 전역 |
| P3 | `.home-loading` 만 reduced-motion 미적용 + 저점 대비 2.4:1 | styles.css:9787 |
| P3 | 터치 롱프레스 복사 차단 — 주석이 사실과 다름 | contextMenu.ts |
| P3 | `TileImg` alt 이 owner 누락 → 각인 적도라 오독 | App.tsx:2434 |
