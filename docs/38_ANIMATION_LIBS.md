# 38. 애니메이션 라이브러리 도입 분석 — anime.js v4 · react-spring · GSAP v3

> 조사 대상: <https://animejs.com/documentation/> (v4 문서 전체) · <https://www.react-spring.dev>
> (v10 문서 전체) · <https://gsap.com/docs/v3/> (v3 문서 전체)
>
> 처음 두 곳을 먼저 조사했고(§1~§9), **GSAP은 나중에 덧붙였다(§10)**. GSAP을 넣고 나니
> **§0의 결론이 바뀐다** — §10-5의 최종 비교표를 먼저 봐도 된다.

이 문서는 "라이브러리를 넣자"는 제안서가 아니다. **지금 손으로 짜고 있는 것 중 무엇이
라이브러리 기능과 1:1로 겹치는지**를 전부 대조하고, 겹치는 자리마다 바꿔서 실제로 나아지는
것(코드가 줄어드는가·못 하던 게 되는가)을 적었다. 나아지는 게 없으면 "쓰지 마라"라고 적었다.

관련 문서: [24_FX_LAB.md](24_FX_LAB.md)(연출 프로토타입 107종) · [18_UI_REDESIGN_BRIEF.md](18_UI_REDESIGN_BRIEF.md) · [35_CLIENT_SHELL_2026-08-19.md](35_CLIENT_SHELL_2026-08-19.md)

---

## 0. 한 줄 결론

| | 결론 |
| --- | --- |
| **anime.js v4** | **넣을 값이 있다.** 우리 연출은 "타임라인 + 스태거 + SVG 속성 애니메이션 + 슬로우모션"이 핵심인데, 그 넷이 정확히 anime.js가 CSS `@keyframes`보다 잘하는 것이다. 특히 `fx-lab`의 `fx-core.js`가 손으로 만든 WAAPI 래퍼·속도 배율·취소 토큰은 anime.js의 `waapi.animate` / `engine.speed` / `scope.revert()`와 **기능이 같다**. |
| **react-spring** | **부분적으로만.** 컷인·증강 연출 같은 *일회성 시네마틱*에는 안 맞는다(스프링은 "언제 끝나는지"를 정의하지 않는데 우리 연출 큐는 TTL이 생명이다). 대신 **손패 드래그·재정렬·타이머 게이지·점수 카운트업·목록 진입/이탈**처럼 *상태에 연동되는 상호작용*에는 지금 코드보다 확실히 낫다. |
| **GSAP v3** | **§10에서 따로 다룬다. 판단이 바뀐다.** 2025년 4월부터 플러그인까지 전부 무료가 됐고, 우리가 "라이브러리 없이는 못 한다"고 적어 둔 것들(FLIP · 좌표계 변환 · 흔들림 이징 · 캔버스 물리 · 폰트 로드 후 재분할)을 **한 라이브러리 안에서** 덮는다. 대신 번들이 가장 무겁다. |
| **셋 다 안 넣어도 되는 곳** | 이미 잘 도는 CSS `@keyframes` 89종. 여기를 JS로 옮기면 순수 손해다(§9). |

**역할 분담 한 문장(§1~§9 기준):** *anime.js는 "판 위에서 일어나는 사건"을, react-spring은
"손가락에 붙어 있는 것"을 맡는다.*

**⚠ 이 문장은 §10에서 수정된다.** GSAP 하나가 그 둘을 다 덮을 수 있고, 그러면 남는 질문은
"역할을 어떻게 나누나"가 아니라 **"번들을 얼마까지 쓸 것인가"** 하나가 된다.

---

## 1. 현황 재고 조사 — 지금 무엇을 손으로 짜고 있나

라이브러리 제안 전에 우리가 이미 가진 것을 세었다. **여기가 곧 적용 후보 목록이다.**

| 자리 | 지금 구현 | 파일 |
| --- | --- | --- |
| CSS 키프레임 89종 · `animation:` 143곳 · `transition:` 49곳 | 순수 CSS | `styles.css` |
| 화면 흔들림 4단 | `data-shake` 속성 토글 → CSS가 `.table`을 흔든다 | `App.tsx:3125` `styles.css:497` |
| 연출 큐(배너·컷인) | 등급 삽입 + 백로그 압축, `setTimeout`으로 TTL 관리 | `productionQueue.ts` `App.tsx:3034` |
| 점수 카운트업 | `requestAnimationFrame` + `1-(1-p)³` 손수 이징 + 90ms 간격 틱 사운드 | `App.tsx:19725` |
| 손패 드래그(재정렬·버리기) | pointer 이벤트 + 슬롯 중심 실측 + `transform` 인라인 + `settling` 트랜지션 | `App.tsx:16618~16720` |
| 예지 순서 바꾸기 | HTML5 `draggable` + 두 번 누르기 폴백 | `App.tsx:19222` |
| 프롬프트 타이머 | `setInterval(100ms)` + CSS 변수 `--timer-duration` | `App.tsx:15877` |
| 드래프트 카운트다운 | `setInterval(200ms)` | `App.tsx:20536` |
| 컷인 파티클 | `mulberry32` 시드 난수 + CSS 변수로 각도·거리 주입 | `App.tsx:1688` |
| FX 랩 107종 | WAAPI 래퍼 `anim()` · `playbackRate` 슬로우모션 · 캔버스 `drawHooks` · 취소 토큰 | `public/fx-core.js` |
| 접근성·설정 | `screenFx` · `prodSpeed`(1/0.6/0.35) · `doraFx` · `prefers-reduced-motion` 11곳 | `App.tsx:1112` `styles.css` |

### 1-1. 이 재고에서 나온 **실제 결함** 하나

`prodSpeed`(연출 속도)는 지금 **체류 시간(TTL)만 줄인다**(`effectiveProdTtl`, `App.tsx:1510`).
그런데 컷인의 실제 모션은 CSS에 고정 길이로 박혀 있다 — `.cutin-band`는 0.34s, `.cutin-slam`은
0.42s(`styles.css:4639,4652`). 그래서 0.35× 로 두면 **연출이 빨라지는 게 아니라 중간에 잘린다.**
"빠르게"를 고른 사람은 밴드가 미처 다 들어오기 전에 사라지는 걸 본다.

이건 두 라이브러리 어느 쪽으로도 고쳐진다:
- anime.js: `engine.speed = prodSpeed` 한 줄, 또는 타임라인별 `playbackRate`.
- react-spring: `config`의 `tension`을 배수로 밀거나 `Globals.assign({ skipAnimation })`.

**이 결함 하나만으로도 §8의 1단계는 값을 한다.**

---

## 2. 두 라이브러리의 성격 — 왜 갈라 쓰는가

react-spring 문서가 직접 이렇게 말한다: *"Springs don't have a defined curve or a set duration."*
그리고 Andy Matuschak을 인용해 "duration·curve로 매개변수화한 애니메이션 API는 연속적이고
유연한 상호작용과 근본적으로 반대"라고 한다.

우리 시스템에는 **정확히 그 반대가 필요한 자리가 있다.** 연출 큐는 TTL로 줄을 관리하고
(`backlogProdTtl`), 리치 알림이 늦으면 오판이 된다. "언제 끝나는지 모르는 애니메이션"은
그 줄에 세울 수가 없다. 그래서:

- **끝나는 시각이 계약인 것** → anime.js 타임라인 (컷인·증강 연출·개막·결과 정산)
- **손가락·상태를 따라가는 것** → react-spring (드래그, 게이지, 카드 진입/이탈, 호버)

---

## 3. anime.js v4 — 기능 전수와 적용처

### 3-1. `waapi.animate()` — **fx-core.js의 `anim()`을 그대로 대체**

문서: 3KB(전체 `animate`는 10KB), 네이티브 WAAPI 위에 다중 타깃·기본 단위·함수 기반 값·
개별 트랜스폼(`translate`/`rotate`를 따로)·스프링 이징을 얹는다. GPU 가속은 브라우저가 한다.

우리 `fx-core.js:111`의 `anim(el, kf, opt)`가 하는 일이 바로 이것이다. 다만 우리 것은
다중 타깃도, 스태거도, 단위 기본값도 없다. **fx-lab 10,403줄 중 상당 부분이 키프레임 배열을
손으로 펼치는 코드**다.

> **적용:** fx-lab의 `anim()`을 `waapi.animate()`로 바꾸면 연출 하나당 코드가 눈에 띄게 준다.
> 랩은 번들에 안 들어가므로(`public/` 정적 파일) **리스크 0의 실험장**이다 — 여기서 먼저 검증한다.

### 3-2. `createTimeline()` — 연출 큐의 뼈대

시간 위치 표기: 절대(`500`), 상대(`'+=100'` `'-=100'` `'*=.5'`), 라벨, `'<'`(직전 것이 끝나는
지점), `'<<'`(직전 것이 **시작**하는 지점), 조합(`'<<+=250'`), 그리고 `stagger()`.
`.call()`로 함수를, `.label()`로 이름표를, `.sync()`로 다른 타임라인을 붙인다.

지금 우리는 이걸 **중첩 `setTimeout`**으로 한다. `App.tsx:3178`의 임팩트 지연, fx-lab의
`later(fn, ms/speed)`(속도 배율을 손으로 나눈다), `CountUpPoints`의 `startDelay = 400`이 전부
같은 문제의 다른 얼굴이다.

> **적용 ①: 24_FX_LAB이 말한 "5단 구성"이 코드 구조가 된다.** 거신병의 예고→등장→충전→
> 발사→여운은 지금 주석에만 있는 개념인데, 타임라인 라벨로 쓰면 그대로 코드가 된다:
> ```js
> const tl = createTimeline({ defaults: { ease: 'out(3)' } })
>   .label('예고').add('.ash', { opacity: [0,1], duration: 400 })
>   .label('등장', '<<+=250').add('.giant', { scaleY: [0,1] })
>   .label('발사').add('.beam', { scaleX: [0,1] }, '<')
>   .call(() => sfx.augment(3), '발사')          // 소리도 같은 타임라인 위에
>   .label('여운').add('.veil', { opacity: 0 });
> ```
> **소리를 `.call()`로 타임라인에 박는 것이 핵심이다.** 지금은 사운드와 화면이 각자
> `setTimeout`이라 `prodSpeed`를 바꾸면 어긋난다.
>
> **적용 ②: 되감기가 공짜로 생긴다.** 증강 «무르기»는 fx-lab이 "같은 애니메이션의
> playbackRate를 음수로" 만들어 구현했다. 타임라인이면 `tl.reverse()` 한 줄이고,
> «재장전»(무장해제의 역동작)도 같은 타임라인을 뒤집어 쓰면 된다.
>
> **적용 ③: 연출 큐가 `seek()`를 얻는다.** 지금 Esc 건너뛰기는 TTL을 잘라 없애는 것뿐인데,
> `tl.complete()`면 **끝 상태로 정확히 착지**한다. 중간에 잘려 반쯤 열린 밴드가 남는 일이 없다.

### 3-3. `createTimer()` — 초읽기·드래프트 카운트다운

`setInterval` 대신 `onUpdate` 콜백을 가진 타이머. `frameRate`로 갱신 주기를 제한하고,
`pause`/`resume`/`seek`/`stretch`가 있다.

지금 `PromptTimer`는 `setInterval(100ms)` + `PausedContext`로 멈춤을 처리하고, 마감이 바뀌면
`key`를 바꿔 **컴포넌트를 통째로 재마운트**해 CSS 애니메이션을 다시 태운다(`App.tsx:15915`).
`DraftOverlay`는 별도로 `setInterval(200ms)`를 또 돌린다.

> **적용:** 두 카운트다운을 `createTimer({ duration, frameRate: 10, onUpdate })` 하나의 패턴으로
> 통일한다. `pause()`/`resume()`이 `PausedContext`에 바로 대응하므로 **재마운트 트릭이 사라진다.**
> `engine.pauseOnDocumentHidden`도 켜 둘 수 있다 — 탭을 숨겼다 돌아왔을 때 게이지가 튀지 않는다.
> ⚠ 단, **마감 판정 자체는 서버 `deadlineMs`가 진실**이다. 타이머는 표시만 한다(지금 규칙 유지).

### 3-4. `stagger()` — 우리가 제일 많이 손으로 짜는 것

세 종류: 시간 스태거(`delay: stagger(100)`), 값 스태거(`scale: stagger([1, .1])`), 타임라인
위치 스태거. 파라미터: `start`, `from`(인덱스·`'center'`·`'last'`), `reversed`, `ease`,
`grid: [x,y]`, `axis`, `modifier`, `use`, `total`, `jitter`.

지금 우리 코드에서 스태거를 손으로 만드는 곳:
- 드래프트 카드 3장: `style={{ animationDelay: `${i * 120}ms` }}` (`App.tsx:20630`)
- 컷인 파티클: `mulberry32`로 각도·지연을 뿌린다 (`App.tsx:1688`) → **`jitter` + `from:'center'`가 정확히 이것**
- fx-lab 전역: 손패 13장 스태거 플립·오픈 리치·통째로 바꾸기 26장

> **적용 ①: `grid` + `axis`가 마작판에 딱 맞는다.** 버림패(카와)는 6열 × n행 격자다.
> «박무»(안개가 바닥을 덮음)·«개벽»(판이 흩어짐)처럼 바닥 전체를 훑는 연출은
> `stagger(30, { grid: [6, 4], from: 'center' })` 한 줄로 물결이 된다. 지금은 인덱스 산술이다.
>
> **적용 ②: `from: 'center'` + `reversed`가 반대 문장 쌍을 만든다.** 24_FX_LAB이 세운
> «책임전가»(1→3 갈라짐) ↔ «덤터기»(3→1 모임) 대비는 같은 스태거의 `reversed` 토글이면 된다.
> 두 연출이 **코드 수준에서 대칭**이 되므로 어긋날 수가 없다.
>
> **적용 ③: `modifier`로 좌석 각도를 태운다.** «천리안»의 레이더 스윕은 "핑이 좌석 각도를
> 지날 때 뜬다"가 생명인데(24_FX_LAB: *동시에 다 뜨면 정보가 아니라 장식*),
> `stagger(0, { modifier: (v, i) => seatAngle(i) / 360 * sweepMs })`로 각도→지연 변환을 직접 쓴다.

### 3-5. `spring()` 이징 — 타임라인 안에서 쓰는 물리

`ease: spring({ bounce: .5, duration: 350 })` 또는 물리 파라미터(`mass` 1~10000,
`stiffness` 0~10000, `damping` 0~10000, `velocity`). **스프링의 정착 시간이 `duration`을 덮어쓴다.**

> **적용:** 24_FX_LAB이 정한 모션 규칙 — *"UI 크롬은 지수형 감속만, 패가 물리적으로 부딪히는
> 순간에는 스쿼시를 남긴다"* — 을 그대로 코드화한다. UI는 `ease: 'out(4)'`, 타패 슬램·분열
> 스냅·발굴 상승은 `ease: spring({ bounce: .35 })`. 지금은 `EASE_IMPACT` 상수
> (`cubic-bezier(0.2, 1.2, 0.4, 1)`)로 흉내 내고 있는데, 베지에로는 **한 번 튕기고 마는 것**밖에
> 못 한다. 무게감(mass)을 패 종류별로 다르게 주는 건 아예 불가능하다.
>
> ⚠ **주의:** 스프링은 duration을 스스로 정하므로 **연출 큐의 TTL과 어긋날 수 있다.**
> 큐에 서는 연출의 *마지막* 단계에는 스프링을 쓰지 말 것. 안쪽 단계에만 쓴다.

### 3-6. `createDraggable()` — 손패 드래그를 통째로 대체할 수 있다

설정: `x`/`y`(min·max), `snap`, `modifier`, `mapTo`, `trigger`, `container`, `containerPadding`,
`containerFriction`, `releaseContainerFriction`, `releaseMass`/`releaseStiffness`/`releaseDamping`,
`releaseEase`, `velocityMultiplier`, `min`/`maxVelocity`, `dragSpeed`, **`dragThreshold`**,
`scrollThreshold`, `scrollSpeed`, `cursor`.
콜백: `onGrab` `onDrag` `onUpdate` `onRelease` `onSnap` `onSettle` `onResize` `onAfterResize`.
메서드: `disable` `enable` `setX` `setY` `stop` `reset` `revert` `refresh`.

우리 손패 드래그(`App.tsx:16618~16720`)와 대조하면 **일대일로 겹친다**:

| 우리 코드 | anime.js |
| --- | --- |
| `HAND_DRAG_THRESHOLD` 임계값 | `dragThreshold` |
| `slotCenter` 실측 + `handDragTargetIdx` | `snap` (슬롯 중심 배열을 그대로 넘긴다) |
| `settling: true` + `transition: transform 0.16s ease` | `releaseEase` / `releaseStiffness`·`releaseDamping` |
| `setCommitting(true)` (커밋 프레임 트랜지션 off) | `onSettle` 콜백 |
| 창 레벨 pointermove 추적 | 내장 |
| `toLayoutPx()` 좌표 변환 | `modifier`로 한 곳에서 처리 |
| 슬롯 넘길 때 `sfx.slide()` | `onSnap` |

> **적용 ①: 손패 재정렬.** `snap`에 슬롯 중심 배열을 주고 `onSnap`에서 `sfx.slide()`,
> `onSettle`에서 `setManualOrder()`. **`setCommitting` 튐 방지 트릭이 통째로 없어진다.**
> ⚠ 우리 UI 배율(`uiScale.ts`)이 조상 `transform`을 걸고 있어 좌표계가 두 벌이다 —
> `modifier`로 `toLayoutPx`를 감싸 넣어야 한다. **여기가 이 교체의 유일한 난관이다.**
>
> **적용 ②: 버리기 드롭존.** `container`를 손패 띠로 두고 `containerFriction`을 낮게 주면
> 바닥으로 끌어낼 때 저항이 생긴다 — "되돌릴 수 없는 조작"에 마찰을 주는 건 UX상 옳다
> (오타패 문제, 감사 §5-2와 같은 방향).
>
> **적용 ③: «예지» 순서 바꾸기 탭.** 지금 HTML5 `draggable`이라 **모바일에서 드래그가 아예
> 안 되고**(주석이 그렇게 적고 있다) 두 번 누르기 폴백에 의존한다. `createDraggable`은
> 포인터 이벤트 기반이라 터치에서 그대로 된다. 두 번 누르기는 접근성용으로 남긴다.

### 3-7. `createLayout()` — FLIP. **지금 못 하는 것을 하게 해 준다**

`layout.record()` → DOM 변경 → `layout.animate()`, 또는 `layout.update(fn, opts)` 한 방.
`data-layout-id`로 재정렬 중에도 요소 정체성을 유지한다. `enterFrom` / `leaveTo` / `swapAt`,
`children`으로 대상 지정, delay에 스태거 가능.

> **적용 ①: 자동정렬 토글.** 지금 `autoSort`를 켜면 손패가 **순간이동**한다. 무엇이 어디로
> 갔는지 안 보인다. `layout.update(() => setAutoSort(true))` 면 13장이 각자 제자리로 미끄러진다.
> 마작에서 손패 순서는 곧 사고 과정이라 이 한 줄이 체감이 크다.
>
> **적용 ②: 후로(폰·치·깡).** 패가 손패에서 빠져 나와 오른쪽 멜드 자리로 간다. 지금은
> 사라지고 다시 나타난다. `data-layout-id={tileId}` 를 붙이면 **실제로 날아간다.**
> 이건 정보 전달이다 — 어느 패가 나갔는지 보인다.
>
> **적용 ③: 버림패(카와) 증가·«무르기» 회수.** 같은 원리.
>
> **적용 ④: 좌석 회전(«자리 바꿈» 증강).** 네 좌석 패널이 한 칸 도는 것을 `swapAt`으로.
>
> ⚠ 문서가 "common auto-layout gotchas"를 따로 두고 경고한다 — 기존 CSS `transition`과
> 충돌, `overflow` 제약, 조상 `transform` 간섭. **우리는 조상 transform(UI 배율)이 있으므로
> 반드시 fx-lab에서 먼저 확인한다.**

### 3-8. `splitText()` / `scrambleText()` — 컷인 타이포그래피

`splitText`: `chars`/`words`/`lines`로 쪼개고 `wrap`·`class`·`clone` 지정, `accessible`이
스크린리더용 원문을 유지한다(**중요 — 우리는 접근성을 지키는 저장소다**). `addEffect`,
`revert`, `refresh`.
`scrambleText`: `chars`(문자셋), `revealRate`, `revealDelay`, `settleRate`, `settleDuration`,
`perturbation`, `from`, `seed`(결정론!), `cursor`, `onChange`.

> **적용 ①: 컷인 제목.** 지금 «역만»·«론!»·증강 이름은 `cutin-slam`으로 통째로 들어온다.
> `splitText({ chars: true })` + `stagger(24, { from: 'center' })` 면 글자가 하나씩 박힌다.
> 역만처럼 **한 판에 한 번 있는 사건**에만 쓴다(§9 — 흔한 사건에 붙이면 통과의례가 된다).
>
> **적용 ②: `scrambleText`가 어울리는 증강이 실제로 있다.**
> - «투시»·«이면투시»·«천리안»·«선언 간파» — 정보를 해독하는 계열. 상대 대기패 이름이
>   난수 문자에서 확정되는 그림이 곧 "알아냈다"이다.
> - «수상한 주사위»·«조커»·«모 아니면 도» — 결과가 굴러가다 멎는 계열.
> - «일확천금»·«뚫린 천장» — 숫자가 폭주하다 착지. `chars: '0123456789'` 로 두면
>   24_FX_LAB이 말한 **오도미터 릴**이 된다("카운트업은 계산, 릴은 폭주로 보인다").
> - **`seed`가 있다는 게 중요하다** — 리플레이에서 같은 장면이 같은 난수를 재현한다.
>   우리가 `mulberry32`를 손수 만든 이유(`App.tsx:1682`)와 정확히 같은 요구다.

### 3-9. `svg.morphTo` / `createDrawable` / `createMotionPath`

> **`createDrawable`(선 그리기, `stroke-dashoffset`)의 적용처 — fx-lab이 이미 이 기법을 쓴다:**
> «핏빛 계약» 서명, «연금술사» 연성진 새김, «무장해제» 균열, «점수 경로» 계열 14종의
> 돈 흐름 선. 지금은 dash 길이를 손으로 계산하는데 `createDrawable`이 그걸 대신한다.
>
> **`createMotionPath`(경로 위 이동):** «기생충»이 상대 손패로 기어가는 궤적, «무덤 도굴»의
> 베지에 상승, «자리 바꿈»의 원호(우리 `arcPath()`, `fx-core.js:557`가 하던 일), 점수봉이
> 지불자→수령자로 날아가는 호. `offset-rotate`까지 따라오므로 **진행 방향으로 기울어진다** —
> 손으로 하면 매번 atan2를 쓰는 그 부분이다.
>
> **`morphTo`(도형 변형):** «양극»·«단색 세계»·«손바닥 뒤집기»처럼 상태가 뒤집히는 배지,
> 증강 카테고리 아이콘 전환.

### 3-10. **SVG 속성·CSS 변수 애니메이션 — CSS로는 못 하는 것**

`animate()`는 CSS 속성만이 아니라 **HTML/SVG 속성**과 **CSS 변수**, 그리고 **순수 JS 객체
프로퍼티**를 애니메이션한다.

> **이게 fx-lab의 SVG 필터 연출을 살린다.** «분열»의 gooey 필터는 `feGaussianBlur`의
> `stdDeviation`이 변해야 '목'이 생기고, «염색»은 `feTurbulence`의 `baseFrequency`가,
> «기생충»의 맥동 혈관은 `feMorphology`의 `radius`가 변해야 한다. **CSS로는 이 속성들을
> 애니메이션할 수 없다.** 지금은 rAF로 `setAttribute`를 직접 두드리는 수밖에 없다.
> ```js
> animate('#fGoo feGaussianBlur', { stdDeviation: [0, 8, 0], duration: 900, ease: 'inOut(2)' });
> ```
>
> **JS 객체 애니메이션은 캔버스 연출의 값 소스가 된다.** «밥상 뒤엎기»·«개벽»·«거신병»은
> 캔버스인데, 카메라·중력·발광 세기를 `animate(state, {...})`로 굴리면 **DOM 연출과 같은
> 타임라인·같은 `playbackRate` 위에 올라간다.** 지금은 DOM은 WAAPI, 캔버스는 rAF라 따로 논다.

### 3-11. `createAnimatable()` — 커서 추종·상시 반응

값마다 `unit`·`duration`·`ease`·`modifier`를 두고 세터로 밀면 그 값으로 부드럽게 따라간다.

> **적용:** 마우스 위치를 따라 판이 살짝 기우는 패럴랙스, 위험패 호버 시 하이라이트 추종,
> 중계 화면의 카메라 팬. **매 프레임 React 렌더 없이** 돌아간다.
> (같은 일을 react-spring `useSpring`+imperative API로도 한다 — §4-4. 둘 중 하나만 쓴다.)

### 3-12. `createScope()` — **React 통합의 정답**

```js
const root = useRef(null), scope = useRef(null);
useEffect(() => {
  scope.current = createScope({ root }).add(self => {
    self.add('playCutIn', (tone) => { /* 타임라인 */ });
  });
  return () => scope.current.revert();   // ← 언마운트 시 전부 되돌린다
}, []);
// 바깥에서: scope.current.methods.playCutIn('yakuman')
```

`mediaQueries` 파라미터로 미디어쿼리별 다른 애니메이션을 정의할 수 있다.

> **적용:** `revert()`가 **fx-lab의 취소 토큰(`bumpToken`/`alive`)과 `resetStage()`를 대체한다.**
> 24_FX_LAB이 직접 남긴 교훈 — *"`countUp`의 rAF 루프에 취소 검사가 없어서 이전 카운트업이
> 살아남아 초기화된 점수를 계속 덮어썼다… 전역 UI를 건드리는 연출은 되돌림까지가 연출이다"* —
> 가 정확히 `scope.revert()`가 구조적으로 막아 주는 버그다.
> `mediaQueries`는 우리 모바일/데스크톱 레이아웃 분기(§`--own-band`)에 바로 쓰인다.

### 3-13. `engine` — 전역 손잡이

`timeUnit`(ms/s), **`speed`**, `fps`, `precision`, **`pauseOnDocumentHidden`**,
`update()`/`pause()`/`resume()`, 인스턴스 `priority`.

> **적용 ①: `engine.speed = settings.prodSpeed`** → §1-1의 결함이 한 줄로 사라진다.
> **적용 ②: `pauseOnDocumentHidden`** → 탭을 숨겼다 돌아왔을 때 연출이 몰아서 재생되지 않는다.
> **적용 ③: `engine.fps` 제한** → 저사양 기기 대응 손잡이. 지금은 연출을 통째로 끄는 것밖에 없다.
> **적용 ④: «시간 정지» 증강** — `engine.pause()`로 판 전체를 멈추고 내 좌석 타임라인만
> 따로 돌린다. 24_FX_LAB이 `backdrop-filter grayscale` + 마스크 구멍으로 흉내 낸 것을
> **실제로 시간을 멈춰서** 한다. 이건 라이브러리 없이는 못 한다.
> **적용 ⑤: `priority`** — 흔들림이 항상 컷인보다 뒤에 계산되게 고정.

### 3-14. `composition: 'blend'` — 흔들림과 컷인이 싸우지 않게

`replace`(기본, 취소하고 대체) / `none`(교체 안 함, 성능 좋음) / **`blend`(가산 합성)**.
문서: translate·scale·rotate처럼 "요소를 움직이는" 속성에 이상적.

> **적용:** 지금 화면 흔들림은 `.table`의 `transform`을 통째로 잡는다. 그래서 흔드는 동안
> `.table`에 다른 transform 연출(줌·틸트)을 얹을 수가 없다 — 서로 덮어쓴다.
> `blend`면 **흔들림 + 줌 + 틸트가 더해진다.** «밥상 뒤엎기»(3D 틸트)에 흔들림을 겹치는 것,
> 역만 컷인에 줌인+흔들림을 겹치는 것이 그제야 된다.
> ⚠ 제약: 가산 애니메이션은 정방향 재생만, 다중 키프레임·색상값·`reverse()`/`loop` 미지원.

### 3-15. `utils` — 손으로 짠 수학의 대체

`$` `get` `set` `remove` `sync` `keepTime` `random` **`createSeededRandom`** `randomPick`
`shuffle` `round` `clamp` `snap` `wrap` `mapRange` `lerp` **`damp`** `roundPad` `padStart`
`padEnd` `degToRad` `radToDeg` + 체이닝.

> - **`createSeededRandom`** → `mulberry32`(`App.tsx:1682`) 대체. 리플레이 재현성·StrictMode
>   이중 렌더 방어라는 우리 요구를 그대로 만족한다.
> - **`damp(current, target, smoothing, delta)`** → 프레임률 독립 추종. 캔버스 카메라,
>   위험패 미터, 중계 화면 추적에 쓴다. 지금 `lerp(a,b,0.1)`류를 쓰면 fps에 따라 속도가 달라진다.
> - **`snap`** → 손패 슬롯 스냅, 「붉은 손길」 숫자 다이얼.
> - **`wrap`** → 좌석 인덱스(0~3) 순환, 바람 회전. 지금 `% 4` 산술이 곳곳에 있다.
> - **`roundPad`/`padStart`** → 점수 오도미터 자릿수 고정("00,300" 형태로 자리가 안 튄다).
> - **`mapRange`** → 남은 시간(ms) → 게이지 색/굵기, 위험도 → 붉기.

### 3-16. `onScroll` / ScrollObserver — **여기는 거의 안 쓴다**

스크롤 임계값·동기화 모드(진행도 연동·스무스 스크롤)·풍부한 콜백.

> **판정:** 대국 화면은 스크롤이 없다(고정 표면 원칙). 쓸 자리는 **도감(CodexScreen)·
> 도움말·용어집·증강 목록·피드백 보드**뿐이고, 거기는 정보를 읽는 화면이라 스크롤 연출이
> 오히려 방해다. **채택 보류.** 굳이 쓴다면 홈의 통계 카드가 처음 보일 때 한 번 정도.

### 3-17. `adapters` (Three.js)

> **판정: 해당 없음.** 3D 렌더러를 쓰지 않는다. (참고로 [16_UNITY_MIGRATION.md](16_UNITY_MIGRATION.md)가
> 별도 검토 중인 방향이지만 그건 웹 애니메이션 라이브러리와 무관하다.)

---

## 4. react-spring — 기능 전수와 적용처

### 4-1. `animated` 컴포넌트 + SpringValue

`<animated.div style={springs}>` — SpringValue를 style로 받아 **React 렌더 없이** DOM을 갱신한다.
서드파티 컴포넌트는 `animated(Component)`로 감싼다(style을 native 요소로 넘기는 경우에 한해).

> **적용:** 이게 react-spring을 쓸 유일하고 충분한 이유다. 우리 `App.tsx`는 21,119줄
> 단일 컴포넌트 트리이고, `useStableFn`·`React.memo`로 **렌더 비용과 싸운 흔적이 주석에 남아
> 있다**(`App.tsx:1527`). 애니메이션 값이 React state를 거치지 않는다는 건 그 싸움을 안 해도
> 된다는 뜻이다.

### 4-2. `useSpring` — 가장 쓸 곳이 많은 것

props: `from` `to` `loop` `delay` `immediate` `reset` `reverse` `pause` `cancel` `ref` `config` `events`.

> **적용 ①: `PromptTimer` 게이지 (초읽기).** 지금은 100ms `setInterval`로 리렌더 + CSS
> 애니메이션 재마운트 트릭. `useSpring({ to: { p: 0 }, config: { duration: total } })`에
> **`pause: paused`** 를 주면 `PausedContext`가 그대로 붙고, 재마운트가 필요 없다.
> 급해지는 단계 전환(10초·5초)은 `to`를 배열로 주는 체이닝(§4-7)으로 잇는다.
>
> **적용 ②: 점수 카운트업 (`CountUpPoints`).** 지금 rAF + `1-(1-p)³` + `sfx.countTick` 90ms
> 간격. `useSpring({ from:{n:0}, to:{n:value}, config: { tension: 40, friction: 26, clamp: true } })`
> 로 바꾸고 **`onChange`에서 틱 사운드**를 낸다. `clamp: true`가 중요하다 — 문서가 명시하듯
> 스프링은 목표를 넘겼다 돌아오는데, **점수가 최종값을 넘었다가 되돌아오면 오독이 된다.**
> 숫자 표시는 `.to(n => Math.round(n).toLocaleString())` 보간으로.
>
> **적용 ③: 위험패 미터·샹텐 배지·대기 표시** — 값이 계속 바뀌는 상시 표시. 스프링이 제일 잘하는 것.
>
> **적용 ④: 증강 «단색 세계»/«붉은 손길» 미리보기 틴트.** 24_FX_LAB이 못 박은 원칙 —
> *"되돌릴 수 없는 선택은 누르기 전에 결과가 보여야 한다"* — 의 구현. 후보 위를 훑을 때
> 색이 따라오는 건 정확히 스프링의 일이다(목표가 계속 바뀌므로 duration을 정할 수 없다).

### 4-3. `useSprings` / `useTrail`

`useSprings(count, fn)` — 독립된 n개. `useTrail(count, fn)` — **자동으로 줄줄이 이어진다**
(API는 `useSprings`와 동일).

> **적용 ①: 손패 13장.** 각 패의 들어올림·기울기·강조가 서로 독립이므로 `useSprings`.
> 드래그 중 "다른 패가 자리를 비켜주는" 동작(`tileDragStyle`의 인라인 transform)이 여기로 온다.
>
> **적용 ②: `useTrail`이 정확히 맞는 증강이 있다 — «지뢰 탐지».** 24_FX_LAB:
> *"좌→우로 한 장씩 판정이 올라온다. 13장이 한꺼번에 뜨면 읽지 않고 넘긴다."*
> 그게 `useTrail(13, ...)`의 정의다. 같은 이유로 «천리안» 좌석 핑, «예지» 4장 레일,
> 결과창 역 스탬프 목록, 드래프트 카드 3장에도 쓴다.

### 4-4. Imperative API (`useSpringRef` / `api.start()`)

문서가 **권장 방식**이라고 명시: 훅이 돌려주는 `api`로 `start()`하면 컴포넌트가 리렌더되지
않는다. "마우스 위치처럼 빠른 업데이트를 다루는 데 적합"하다고 직접 예시한다.
⚠ 경고: ref/api를 쓰면 **설정 객체 변경만으로는 애니메이션이 돌지 않는다. 반드시 `.start()`를 불러야 한다.**

> **적용:** 손패 드래그. 지금 `setDragBoth({...})`가 **pointermove마다 React state를 갱신한다** —
> 21,000줄 트리에서 초당 60회 렌더 트리거다. `api.start({ x, y, immediate: true })`면 렌더가 0이 된다.
> **이게 react-spring 도입의 가장 큰 실익이다.**

### 4-5. `useTransition` — 진입/이탈

props: `from` `enter` `update` `leave` `keys` `sort` **`trail`** `reverse` **`exitBeforeEnter`**
`expires` `ref` `config` `events`. 렌더 콜백 `(style, item, state, index) => ReactNode`.

> **적용 ①: 토스트·알림.** 문서의 대표 예제가 "Notification Hub"다. 우리 `showToast`가 그것.
> **적용 ②: 이모트 피드**(`EmoteFeed`), **증강 로그 줄**(`AugmentLog`), 대기실 인원 목록,
> 친구 목록, 관전자 목록 — 전부 "들어오고 나가는 목록"이다. 지금은 CSS `*-in` 키프레임만 있고
> **나가는 연출이 없다**(사라진다). `leave`가 그 공백을 메운다.
> **적용 ③: `exitBeforeEnter`가 컷인 교체에 맞는다.** 연출 큐에서 다음 연출이 앞 연출을
> 덮어쓰지 않고 **앞 것이 나간 뒤 들어온다.** 지금은 TTL로만 조절해 겹칠 위험이 있다.
> **적용 ④: 오버레이·모달**(드래프트·결과·설정·도감). 문서의 radix 예제 그대로.

### 4-6. `useChain` + `useSpringRef` — 서로 다른 훅을 순서대로

`useChain([springRef, transRef], [0, 0.4], 1000)` — timesteps × timeframe = 지연.

> **적용:** 국 결과창. ①패널이 열리고 → ②역 스탬프가 찍히고 → ③점수가 굴러가고 → ④증감표가
> 뜬다. 지금 `CountUpPoints`가 `startDelay = 400`이라는 **매직 넘버**로 ②를 기다린다
> (주석: *"역 스탬프가 먼저 찍히기 시작한 뒤 굴러간다"*). `useChain`이면 그 400이 사라지고
> **실제 의존 관계**가 된다.

### 4-7. Async animations — `to`에 배열 또는 스크립트 함수

배열이면 차례로, 함수면 `async (next, cancel) => { await next({...}) }`.

> **적용:** 초읽기 게이지의 단계 전환(가는 막대 → 숫자 → 굵고 붉게)을 한 스프링의
> 스크립트로 쓴다. `cancel`이 있어 **외부 사건(내가 결정을 내림)에 반응해 중단**할 수 있다.
> 지금은 렌더 시점 조건 분기라 전환에 연출이 없다.

### 4-8. Interpolation — `.to()`

`value.to(v => ...)`, `.to([0,1],[0,360])` 체이닝, `to([a,b,c], (x,y,z) => ...)` 결합,
config: `range` `output` `extrapolate`(`identity`/`clamp`/`extend`) `map`.

> **적용:** 스프링 하나로 여러 표현을 파생시킨다. 초읽기 진행도 `p` 하나에서
> 막대 폭·색(`extrapolate: 'clamp'`)·글자 크기·흔들림 세기를 전부 뽑는다. **값이 하나면
> 절대 어긋나지 않는다** — 지금은 `showCount`/`urgent` 두 불리언이 각자 임계값을 본다.

### 4-9. Events — `onStart` `onChange` `onRest` `onPause` `onResume` `onResolve` `onProps` `onDestroyed`

키별로 다르게 줄 수도 있다(`onStart: { x: ..., y: ... }`).

> **적용:** **소리·진동을 애니메이션에 붙이는 자리.** `onRest`에서 `sfx.countDone()`,
> `onChange`에서 카운트 틱, 드래그 스냅 `onRest`에서 `haptics.discard()`.
> 지금은 사운드 타이밍이 별도 `setTimeout`/rAF 계산이라 연출 길이를 바꾸면 어긋난다.

### 4-10. **`useReducedMotion` + `Globals.skipAnimation` — 우리 설정과 정확히 맞물린다**

문서: `Globals.assign({ skipAnimation: true })` 하나로 **전 애플리케이션의 스프링이 목표값으로
즉시 점프**한다. `useReducedMotion()`을 앱 루트에서 부르라고 권한다.

> **적용:** 우리 `screenFx: false` / `prefers-reduced-motion` 처리는 지금 **CSS 미디어쿼리 11곳
> + JSX 조건부 렌더 20여 곳**에 흩어져 있다(`App.tsx:5946~6022`). 새 연출을 추가할 때마다
> 두 군데를 같이 고쳐야 하고, 빠뜨리면 조용히 새어 나간다.
> ```js
> useEffect(() => {
>   Globals.assign({ skipAnimation: !settings.screenFx || reducedMotion });
> }, [settings.screenFx, reducedMotion]);
> ```
> **한 곳에서 끄는 스위치가 생긴다.** anime.js 쪽 대응은 `engine.speed`를 크게 올리거나
> 스코프를 `revert()` 하는 것 — react-spring이 이 점에서 더 낫다.
> ⚠ 단, `haptics.ts`가 세운 원칙은 유지한다: **"소리를 껐다"가 "아무 신호도 필요 없다"는
> 아니다.** `skipAnimation`은 움직임만 없애고 소리·진동·상태 표시는 남긴다.

### 4-11. `useInView` / `useScroll` / `useResize`

`useInView`는 IntersectionObserver 기반, `amount`(`'any'`/`'all'`/숫자)·`rootMargin`·`once`.

> **적용:** §3-16과 같은 판정 — 대국 화면에는 스크롤이 없다. **도감·통계·도움말 화면 한정.**
> `useResize`는 반응형 재계산에 쓸 수 있지만 우리는 `uiScale.ts`가 이미 그 일을 한다.

### 4-12. `Parallax` / `ParallaxLayer`

> **판정: 채택하지 않는다.** 랜딩페이지 컴포넌트다. 우리 홈 화면은 정보 밀도가 높은 대시보드지
> 스크롤 스토리텔링이 아니다.

### 4-13. Testing / SSR

`useIsomorphicLayoutEffect`(SSR 안전), 테스팅 가이드 존재.

> **적용:** 우리는 SSR을 쓰지 않는다(Vite SPA). 다만 **`packages/client`에 jsdom이 없어
> 컴포넌트 로직을 소스 스캔으로만 지킨다**(`productionQueue.ts` 헤더 주석). 애니메이션을
> 라이브러리로 옮기면 **연출 순서·길이 같은 순수 로직을 라이브러리 밖 순수 함수로 뽑아
> 테스트할 수 있다** — 오히려 검증 가능한 면적이 는다.

---

## 5. 화면·장면별 처방전

> 표기: **[A]** anime.js · **[S]** react-spring · **[—]** 지금 그대로 두는 게 낫다

### 5-1. 초읽기 · 프롬프트 타이머 (`PromptTimer`, `App.tsx:15877`)

| 지금 | 처방 |
| --- | --- |
| `setInterval(100ms)` + 재마운트 트릭 | **[S]** `useSpring` + `pause`. 재마운트 제거 |
| 10초·5초 단계 전환이 툭 바뀜 | **[S]** async `to` 스크립트로 잇는다 (§4-7) |
| 막대·숫자·색이 각자 계산 | **[S]** 진행도 하나에서 `.to()` 파생 (§4-8) |
| 5초 이하 맥동이 CSS 고정 | **[A]** `spring({ bounce })`으로 심장박동처럼 — 남은 시간에 따라 `stiffness`를 올린다 |
| 초읽기 국(5초) 진입을 모르고 지나감 | **[A]** 타임라인 1회: 시계 아이콘이 화면 중앙에서 게이지 자리로 날아가 앉는다(`createMotionPath`). **어디를 봐야 하는지 눈이 따라간다** |

**증강 «초읽기» 발동 연출 제안 (요청하신 예시에 대한 답):**
화면 흔들림은 **지금의 `data-shake` CSS를 그대로 두되**, anime.js의 `composition: 'blend'`로
그 위에 *심박형 흔들림*을 하나 더 얹는다 — 진폭 1~2px, 남은 시간에 반비례해 주기가 빨라지는
지속 진동. 큰 흔들림(shake 2~4)은 "사건이 터졌다"의 어휘라 초읽기처럼 **국 내내 지속되는
상태**에 쓰면 멀미가 된다. 대신:

```js
// 초읽기 무장 순간 — 1회성
createTimeline()
  .add('.table', { scale: [1, 0.985, 1], duration: 420, ease: spring({ bounce: .4 }) })
  .add('.prompt-timer', { '--timer-glow': [0, 1] }, '<<+=120')   // CSS 변수를 애니메이션
  .call(() => { sfx.augment(2); haptics.declare(); });

// 국이 도는 동안 — 남은 시간에 연동되는 미세 진동 (blend라 다른 transform과 안 싸운다)
animate('.table', {
  x: [0, 1.5, -1.5, 0], composition: 'blend', loop: true,
  duration: () => mapRange(secondsLeft, 0, 5, 260, 900),
});
```
그리고 `screenFx`가 꺼져 있으면 이 둘 다 안 돈다 — 대신 게이지 색만 남긴다(정보는 남기고
자극만 뺀다, `haptics.ts`가 세운 원칙).

### 5-2. 컷인 · 배너 · 연출 큐 (`ScreenOverlay`/`showCutIn`, `productionQueue.ts`)

| 지금 | 처방 |
| --- | --- |
| CSS 고정 길이 + `--prod-ttl` | **[A]** 연출 하나 = 타임라인 하나. TTL은 타임라인 duration이 된다 |
| `prodSpeed`가 연출을 자름 (§1-1) | **[A]** `engine.speed` 또는 `tl.playbackRate` — **결함 수정** |
| Esc 건너뛰기 = TTL 삭제 | **[A]** `tl.complete()` — 끝 상태로 정확히 착지 |
| 소리와 화면이 각자 타이머 | **[A]** `tl.call()`로 같은 타임라인에 |
| 큐가 밀리면 겹칠 위험 | **[S]** `useTransition` + `exitBeforeEnter` |
| 제목이 통째로 슬램 | **[A]** `splitText` + `stagger(from:'center')` — **역만·삼배만 등 희소한 것만** |
| 파티클 시드 난수 손수 구현 | **[A]** `utils.createSeededRandom` |
| 흔들림이 다른 transform과 배타 | **[A]** `composition: 'blend'` (§3-14) |

**큐 자체의 로직(등급·백로그 압축)은 건드리지 않는다.** 그건 정보 전달 규칙이지 애니메이션이
아니고, 이미 테스트가 붙어 있다.

### 5-3. 손패 — 여기가 react-spring의 본진

| 지금 | 처방 |
| --- | --- |
| pointermove마다 `setDragBoth` → 전역 리렌더 | **[S]** `useSprings` + `api.start({ immediate: true })`. **렌더 0** |
| `settling` + 0.16s transition + `setCommitting` 튐 방지 | **[S]** 스프링 `onRest`, 또는 **[A]** `createDraggable`의 `onSettle` |
| 슬롯 중심 실측 + 인덱스 산술 | **[A]** `createDraggable`의 `snap` |
| `autoSort` 토글 시 순간이동 | **[A]** `createLayout().update()` — **못 하던 것** |
| 쯔모패가 `hand-draw-in`으로 등장 | **[A]** 패산에서 실제 궤적으로(`createMotionPath`) |
| 후로 시 패가 사라졌다 나타남 | **[A]** `data-layout-id` FLIP — **정보 전달** |
| 두 번 눌러 버리기 1단계(들어올림) | **[S]** `useSpring` — 손가락에 붙는 감각이라 스프링이 맞다 |

⚠ **좌표계 주의:** `uiScale.ts`가 조상에 `transform: scale()`을 건다. `getBoundingClientRect`는
화면 좌표, 인라인 `transform`은 레이아웃 좌표다(`App.tsx:6386` 주석). `createDraggable`의
`modifier`, 또는 스프링의 `.to()` 보간에서 `toLayoutPx`를 반드시 통과시킨다.

### 5-4. 버림패(카와) · 도라 · 패산

| 지금 | 처방 |
| --- | --- |
| 버린 패가 `tile-in`으로 나타남 | **[A]** 손 → 바닥 궤적 + 착지 스쿼시(`spring({ bounce: .3 })`) |
| 도라 반짝임 `dora-shine` (설정 `doraFx`) | **[—]** 상시 표시다. CSS로 두는 게 옳다(§9) |
| 신도라(깡) 공개 | **[A]** 1회성이므로 타임라인 — 뒤집기 + 링 |
| 「무르기」 회수 | **[A]** 같은 타임라인 `reverse()` |
| 남은 패 수 감소 | **[—]** 숫자 하나. 연출 불필요 |

### 5-5. 증강 드래프트 (`DraftOverlay`, `App.tsx:20511`)

| 지금 | 처방 |
| --- | --- |
| `animationDelay: i*120ms` 손수 스태거 | **[S]** `useTrail(3)` 또는 **[A]** `stagger(120)` |
| 카드 새로고침 시 `key` 교체로 재등장 | **[S]** `useTransition` — 옛 카드가 **나가고** 새 카드가 들어온다. 지금은 사라진다 |
| 잠긴 카드(튜토리얼) 정지 | **[—]** 잠긴 것은 안 움직이는 게 옳다 |
| 카운트다운 `setInterval(200ms)` | **[A]** `createTimer` (초읽기와 같은 패턴으로 통일) |
| 10초 경고가 클래스 토글 | **[S]** 스프링으로 카드 테두리 긴장도를 연속 변화 |
| 「자세히 ▾」 펼침 | **[S]** `useSpring` + `useMeasure` 패턴(문서의 "Animating Auto" 예제) — 지금 높이 애니메이션이 없다 |
| 고른 카드 | **[A]** 고른 카드가 보유 알약 자리로 날아가 앉는다(FLIP) — **"내가 뭘 얻었는지"가 남는다** |

### 5-6. 국 결과 · 점수 정산 (`RoundResultPanel` / `CountUpPoints`)

| 지금 | 처방 |
| --- | --- |
| rAF + 손수 cubic ease + `startDelay = 400` | **[S]** `useSpring` + `useChain` (§4-2, §4-6). 매직 넘버 제거 |
| 90ms 간격 틱 사운드 | **[S]** `onChange` 이벤트 |
| 역 스탬프 `yaku-stamp` | **[A]** `stagger` — 역이 여러 개면 하나씩 |
| 점수 증감표 | **[S]** `useTrail` — 위에서 아래로 |
| 점수봉 이동 | **[A]** `createMotionPath` — **누가 누구에게 내는지가 보인다.** 지금은 숫자만 바뀐다 |
| 역만 꽃잎(`result-petal-fall`) | **[—]** CSS로 충분 |
| 오도미터가 필요한 증강(«뚫린 천장»·«일확천금») | **[A]** `scrambleText({ chars: '0123456789' })` + `utils.roundPad` |

### 5-7. 증강 상시 표시 (좌석 칩 · 로그 · 활성 컨트롤)

| 지금 | 처방 |
| --- | --- |
| `aug-pill-usable-pulse` 등 CSS 맥동 | **[—]** 상시 표시. 그대로 |
| 로그 줄 추가 | **[S]** `useTransition` (`trail`로 여러 줄이 한꺼번에 와도 읽힌다) |
| 액티브 증강 무장 상태 | **[S]** 스프링 — 무장/해제가 토글이라 스프링이 자연스럽다 |
| 상대에게 남는 낙인(«격»·«누명»·«기생충») | **[S]** `useTransition`으로 붙고 떨어짐 + **[A]** 붙는 순간만 타임라인 |

### 5-8. 로비 · 홈 · 대기실 · 인증

| 지금 | 처방 |
| --- | --- |
| `card-in` `bar-in` `home-loading-pulse` | **[—]** 대체로 그대로 |
| 통계 카드 진입 | **[S]** `useTrail` — 카드가 여러 장이다 |
| 대기실 인원 입장/퇴장 | **[S]** `useTransition` — **지금 퇴장 연출이 없다** |
| 탭 전환(인증 화면) | **[S]** `useTransition` + `exitBeforeEnter` |
| 티어 화면 승급 | **[A]** 1회성 축하 타임라인 |
| 도감(`CodexScreen`) 스크롤 | **[S]** `useInView` — **여기만** 스크롤 연출을 허용 |

### 5-9. 튜토리얼 코치 (`TutorialCoach`, `tutorial.ts` 1,057줄)

| 지금 | 처방 |
| --- | --- |
| `coach-pulse`로 대상 강조 | **[A]** 링 + 화살표가 **대상까지 그려진다**(`createDrawable`). "어디를 누르라는 건지"가 확실해진다 |
| 잠금 안내(`coachLock`) | **[S]** 잠기지 않은 패만 살짝 떠오름 — 금지가 아니라 유도 |
| 단계 전환 | **[A]** 타임라인 — 앞 안내가 나가고 다음이 들어온다 |

⚠ 튜토리얼은 **정확함이 연출보다 중요하다.** 지금 코드가 "지킬 수 있을 때만 잠근다"는 원칙을
세운 것처럼(`App.tsx:16155` 주석), 연출도 **판단을 흐리면 안 된다.**

### 5-10. 관전 · 중계 (`BroadcastPanel`, [36_BROADCAST_SPECTATOR.md](36_BROADCAST_SPECTATOR.md))

| 지금 | 처방 |
| --- | --- |
| 위험패 색칠(`specDanger`) | **[S]** 값 변화를 스프링으로 — 해설이 부드럽게 갱신된다 |
| 시점 전환 | **[A]** 카메라 팬(`createAnimatable` + `utils.damp`) |
| 좌석 하이라이트 | **[S]** 스프링 |

**중계는 "보는 사람"용 화면이라 연출 예산이 다르다** — 대국자에게는 방해지만 관전자에게는
정보다. `screenFx` 설정과 별개 손잡이를 둘 여지가 있다.

### 5-11. 리플레이 뷰어 (`ReplayViewer`)

**여기가 anime.js의 숨은 킬러 기능이다.**

`engine.speed` + 타임라인 `seek()` / `stretch()` / `playbackRate`(음수 가능)로
**리플레이 배속·되감기·프레임 이동이 연출까지 포함해 정확히 동작**한다. fx-lab이 이미
`setSpeed()`로 이 원리를 검증했고(*"속도를 0.25×로 낮추면 기법이 눈에 보인다 — 연출을 고를 때
이게 제일 유용하다"*), **그 도구가 그대로 사용자 기능이 된다.**

지금 CSS `@keyframes` 기반으로는 이게 원리적으로 불가능하다.

---

## 6. 증강별 연출 처방 — fx-lab 기법 → 라이브러리 기능

24_FX_LAB의 107종을 클라이언트로 옮길 때, **어떤 기법이 어떤 API로 내려앉는지**의 대조표다.

| 증강 | fx-lab 기법 | 라이브러리 매핑 |
| --- | --- | --- |
| 밥상 뒤엎기 | 3D 틸트 + DOM→캔버스 인계 + 중력 물리 | **[A]** 타임라인 + JS 객체 애니메이션(카메라·중력) + `composition:'blend'`로 흔들림 겹침 |
| 개벽 | 수백 입자 내폭 → 섬광 → 재배치 | **[A]** `stagger({ grid: [6,4], from:'center' })` + JS 객체 + `createSeededRandom` |
| 분열 | gooey(`feGaussianBlur` `stdDeviation`) | **[A]** **SVG 속성 애니메이션 — CSS로 불가** |
| 염색 | `feTurbulence baseFrequency` 번짐 | **[A]** 같음. + `morphTo`로 잉크 자국 |
| 박무 | `feTurbulence` 3겹 + `backdrop-filter` | **[A]** SVG 속성 + `stagger(grid)` |
| 기생충 | `offset-path` 기어가기 + `feMorphology radius` 맥동 | **[A]** `createMotionPath` + SVG 속성 |
| 투시 | `clip-path inset` 밴드 이동 | **[A]** `waapi.animate` (GPU) |
| 천리안 | `conic-gradient` 스윕 + 좌석별 핑 | **[A]** `stagger({ modifier: 좌석각도 })` · **[S]** `useTrail` |
| 스파이 | 레티클 락온 + 구멍 마스크 | **[S]** `config: { tension: 210, friction: 20, clamp: true }`(stiff+clamp = 기계적 락온) |
| 선언 간파 | 홀로그램 + 볼류메트릭 광주 | **[A]** `scrambleText`(대기패 이름 해독) + 캔버스 |
| 이면투시 | `backface-visibility` 양면 플립 | **[S]** `useSpring` rotateY + `.to()` 보간 |
| 예지 | `offset-path` 레일 + 서리유리 고스트 | **[A]** `createMotionPath` · **[S]** `useTrail(4)` · 재배열은 **[A]** `createDraggable`(모바일 지원!) |
| 밑장빼기 | 고스트 잔상 모션블러 | **[A]** `stagger` + 지연 사본 |
| 무르기 | `playbackRate` 음수 | **[A]** `tl.reverse()` |
| 무장해제 ↔ 재장전 | `clip-path polygon` 파편 / 복구 | **[A]** 같은 타임라인의 정/역 + `stagger({ grid, from:'center' })` |
| 핏빛 계약 | `stroke-dashoffset` 서명 + 슬램 | **[A]** `svg.createDrawable` + `spring({ bounce: .1 })` |
| 연금술사 | 연성진 새김 + 소용돌이 입자 | **[A]** `createDrawable` + JS 객체(구심·접선력) |
| 시간 정지 | grayscale + 마스크 구멍 | **[A]** **`engine.pause()`로 실제로 멈춘다** + 내 좌석만 별도 스코프 |
| 마작의 거신병 | 5단 구성(예고→등장→충전→발사→여운) | **[A]** 타임라인 **라벨** — 5단이 코드 구조가 된다 |
| 일확천금 | 릴 감속 + 동전 물리 + 숫자 롤업 | **[A]** `scrambleText(숫자)` + `snap` + 동전은 `spring` |
| 뚫린 천장 | 자리별 오도미터 릴 | **[A]** `scrambleText` + `utils.roundPad`(자리 고정) |
| 자리 바꿈 | 좌석 배지 원호 샘플링 | **[A]** `createMotionPath` + **[A]** `createLayout` `swapAt` |
| 통째로 바꾸기 | 26장 엇갈리는 두 흐름 | **[A]** `stagger` 두 벌 + `composition:'blend'` |
| 책임전가 ↔ 덤터기 | 1→3 갈라짐 / 3→1 모임 | **[A]** 같은 `stagger`의 `reversed` 토글 — **코드 수준 대칭** |
| 만년 오야 ↔ 찬탈자 | 자리 유지 / 탈취 | **[A]** `createLayout` `swapAt` 정/역 |
| 가려진 도라 | 남이 덜 본다 | **[S]** 스프링 opacity — 상태다 |
| 지뢰 탐지 | 좌→우 순차 판정 | **[S]** `useTrail(13)` — **정확히 이것** |
| 단색 세계 · 붉은 손길 | 미리보기 틴트 | **[S]** `useSpring` 색 보간(목표가 계속 바뀜) |
| 등가교환 | 저울이 기울다 균형 | **[S]** `config.wobbly`(`tension:180, friction:12`) |
| 손바닥 뒤집기 · 양극 | 상태 반전 | **[A]** `svg.morphTo` |
| 격(格) · 누명 | 상대에게 남는 낙인 | **[S]** `useTransition`(상시) + **[A]** 찍히는 순간만 타임라인 |
| 점수 경로 14종 | 돈이 흐르는 경로 | **[A]** `createDrawable`(경로) + `createMotionPath`(점수봉) |
| 화료형 14종 | ✕ 먼저 → 규칙이 휨 → 묶임 | **[A]** 타임라인 3단 라벨 — 공통 뼈대 하나를 14종이 공유 |
| 리치 계열 10종 | 리치봉이 어떻게 비틀리는가 | **[A]** 공통 타임라인 + `defaults` 오버라이드 |
| 수비 6종 | 충돌 → 정지 → 반사 | **[A]** `spring({ bounce })` — 반사에 물리가 필요하다 |
| 왕패 열람 | **일부러 심심하게** | **[—]** 상시 정보. 라이브러리 쓰지 않는다 |

**계열 공통 문장이 타임라인 팩토리가 된다.** 24_FX_LAB이 "69종을 69가지 방식으로 만들면
잡동사니가 된다"고 못 박았는데, anime.js의 `timeline({ defaults })` + 스코프 등록 메서드가
그 규율을 **코드로 강제**한다:

```js
// 화료형 14종이 공유하는 뼈대
const 규칙완화 = (target, { 금지문구, 완화연출 }) =>
  createTimeline({ defaults: { ease: 'out(3)' } })
    .label('금지').add(target, { '--x-mark': [0, 1], duration: 300 })
    .label('완화').call(완화연출)
    .label('묶임').add(target, { '--bind': [0, 1] }, '<+=120');
```

---

## 7. 접근성 · 설정 · 성능 배선

바꾸더라도 **이 저장소가 이미 세운 원칙은 하나도 못 깬다.**

| 원칙 | 근거 | 도입 후 지키는 법 |
| --- | --- | --- |
| `prefers-reduced-motion` 존중 | `haptics.ts`, CSS 11곳 | **[S]** `Globals.assign({ skipAnimation })` 한 곳 · **[A]** 스코프 `revert()` |
| `screenFx` off = 자극만 빼고 정보는 남긴다 | `App.tsx:12467` | 같은 스위치. **단 텍스트·상태 표시는 스킵 대상에서 제외** |
| `prodSpeed`는 "이미 다 아는 연출"을 위한 것 | `App.tsx:1513` 주석 | **[A]** `engine.speed` — §1-1 결함 수정 |
| 소리를 껐다 ≠ 신호가 필요 없다 | `haptics.ts` | 애니메이션 이벤트(`onRest`)에 진동을 붙이되 `skipAnimation`과 독립 배선 |
| 연출은 되돌림까지가 연출 | 24_FX_LAB 교훈 | **[A]** `scope.revert()`가 구조적으로 보장 |
| 리치 알림은 늦으면 오판 | `productionQueue.ts` | **큐 로직은 손대지 않는다.** 라이브러리는 재생만 맡는다 |
| 리플레이 재현성 | `mulberry32` | **[A]** `createSeededRandom` · `scrambleText({ seed })` |
| 수십 장은 캔버스로 | 24_FX_LAB | 그대로. 라이브러리는 **값만** 굴린다(§3-10) |
| 저사양 대응 | 지금은 on/off뿐 | **[A]** `engine.fps` 제한이라는 중간 단계가 생긴다 |

---

## 8. 도입 순서 — 각 단계가 독립적으로 값을 한다

> ⚠ **GSAP을 포함해 다시 쓴 순서가 §10-7에 있다.** 아래는 anime.js + react-spring만 놓고 짠 원안이다.

**0단계 · 랩에서만 (번들 영향 0)**
`packages/client/public/`에 anime.js를 넣고 `fx-core.js`의 `anim()`을 `waapi.animate()`로,
`setSpeed()`를 `engine.speed`로 바꾼다. 랩은 정적 파일이라 실패해도 게임에 영향이 없다.
**여기서 §3-7(FLIP)의 조상-transform 문제와 §5-3의 좌표계 문제를 미리 밟아 본다.**
→ 판단 근거: 연출 코드가 실제로 줄어드는가?

**1단계 · `prodSpeed` 결함 수정 (§1-1)**
가장 작고 가장 확실한 개선. 컷인 하나를 타임라인으로 옮겨 `engine.speed`를 물린다.
→ 검증: 0.35×에서 밴드가 **잘리지 않고 빨라지는지** 눈으로 확인.

**2단계 · 손패 드래그를 react-spring imperative API로 (§5-3)**
pointermove마다 도는 전역 리렌더를 없앤다. **성능 이득이 가장 큰 곳.**
→ 검증: React DevTools Profiler로 드래그 중 렌더 횟수 0 확인. 모바일 실기 확인 필수.

**3단계 · 진입/이탈이 없는 목록에 `useTransition` (§5-7, 5-8)**
토스트·이모트·로그·대기실. 위험이 낮고 체감이 빠르다.

**4단계 · FLIP(자동정렬·후로) (§3-7)**
가장 "못 하던 것"이지만 조상 transform 리스크가 있어 0단계 결과를 보고 결정.

**5단계 · 새 증강 연출을 라이브러리로만 만든다**
기존 89개 키프레임은 **옮기지 않는다.** 새로 만드는 것만 새 방식으로.

각 단계 후 저장소 규칙대로: `npm test` + 타입체크 4종 → PR → squash 머지.
⚠ **워크트리에서는 workspace 링크를 먼저 만든다**(CLAUDE.md).

### 번들 비용
`waapi.animate`는 3KB, 전체 `animate`는 10KB(문서 명시). react-spring `@react-spring/web`는
이보다 크다 — **정확한 수치는 도입 전 실측한다**(`npx vite-bundle-visualizer`).
지금 클라이언트는 의존성이 React 외에 사실상 없는 상태라, **처음 들어오는 무게**라는 점을
감안해야 한다. 그래서 §8의 0~1단계는 anime.js **서브패스 임포트**(`animejs/waapi`)만 쓴다.

---

## 9. 하지 말 것

> 9번부터는 §10-8에 이어진다(GSAP 관련).

1. **기존 89개 `@keyframes`를 JS로 옮기지 마라.** `dora-shine`·`turn-pulse`·`aug-pill-usable-pulse`
   같은 **상시 반복 표시**는 CSS가 더 싸고, 메인 스레드를 안 쓰고, 이미 잘 돈다.
2. **자주 일어나는 사건에 새 연출을 붙이지 마라.** 24_FX_LAB: *"스펙터클은 세 번째부터
   스킵하고 싶어진다."* `splitText` 글자 스태거는 역만·삼배만처럼 **한 판에 한 번** 있는
   것에만.
3. **연출 큐의 등급·압축 로직을 라이브러리로 대체하지 마라.** 그건 애니메이션이 아니라
   정보 전달 규칙이고, 리치 지연 사고로 얻은 결론이다.
4. **스프링을 연출 큐의 마지막 단계에 쓰지 마라.** 끝나는 시각이 계약인 자리다(§2).
5. **두 라이브러리로 같은 요소를 동시에 건드리지 마라.** 손패는 react-spring, 컷인은
   anime.js — **소유권을 요소 단위로 나눈다.** 겹치면 서로 `transform`을 덮어쓴다.
6. **`skipAnimation`이 텍스트·상태 표시까지 끄게 하지 마라.** 자극을 빼는 것이지
   정보를 빼는 게 아니다.
7. **상시 표시 정보에 강한 연출을 붙이지 마라.** 왕패 열람이 일부러 심심한 이유다.
8. **연출마다 새 인터랙션을 만들지 마라.** `pickSweep` 하나를 공유하기로 이미 정했다 —
   `createDraggable` 설정을 연출마다 다르게 두면 그 결정이 무너진다.

---

---

## 10. 추가 조사 — GSAP v3

앞의 §1~§9를 쓴 뒤에 GSAP을 덧붙여 조사했다. **결론이 바뀌므로 따로 둔다.**
바뀌는 이유는 하나다 — §1~§9에서 "이건 라이브러리 없이는 못 한다" 또는 "이게 이 교체의
유일한 난관이다"라고 적어 둔 것들을, GSAP이 **전용 도구로 이미 갖고 있다.**

### 10-1. 먼저 라이선스 — 2025년 4월부터 전부 무료다

이게 판단의 전제라 먼저 적는다. **2025년 4월부터 GSAP과 모든 플러그인이 무료다**(Webflow 후원).
예전에 유료(Club GreenSock) 회원 전용이던 **SplitText · MorphSVG · DrawSVG · Flip · Inertia ·
ScrollSmoother 까지 전부 포함**이고, 상업적 사용도 무료다.

⚠ **단, MIT가 아니다.** Webflow의 "Standard 'No Charge' GSAP License"라는 자체 라이선스이고,
금지 조항이 하나 있다 — *"Webflow의 비주얼 애니메이션 빌더와 경쟁하는, 코드 없이 애니메이션을
만드는 도구"*에 쓸 수 없다.

> **우리에게 해당하는가: 아니다.** 우리는 마작 게임이지 애니메이션 저작 도구가 아니다.
> 다만 저장소가 **MIT 계열 의존성만 쓰는 상태**라는 점은 기록해 둔다 — 정책적으로 걸린다면
> 그 자체가 anime.js를 고를 이유가 된다(anime.js v4는 MIT).

### 10-2. 코어 — anime.js와 겹치는 부분

`gsap.to/from/fromTo/set` · `gsap.timeline()` · 이징(power1~4, back, bounce, circ, elastic,
expo, sine, steps) · 스태거 · 키프레임 · 콜백 · `gsap.utils`.

**타임라인 위치 파라미터**가 anime.js보다 한 겹 더 있다:
`3`(절대) · `"+=1"` `"-=1"`(상대) · `"<"`(직전 것의 **시작**) · `">"`(직전 것의 **끝**) ·
`"<1"`(직전 시작 +1초) · `">-0.5"`(직전 끝 -0.5초) · `"label"` · `"label+=1"`.

> ⚠ **anime.js와 `<`의 뜻이 반대다.** anime.js에서 `'<'`는 *직전 것이 끝나는 지점*,
> `'<<'`가 *직전 것이 시작하는 지점*이다. GSAP은 `"<"`가 시작, `">"`가 끝이다.
> **두 라이브러리를 섞어 쓰면 여기서 반드시 사고가 난다** — §9-5(소유권을 요소 단위로
> 나눈다)에 이 이유를 하나 더 얹는다.

**타임라인 중첩**이 우리 구조에 맞다. §3-2에서 "거신병 5단 구성이 코드 구조가 된다"고
적었는데, GSAP은 거기서 한 걸음 더 간다 — 단계마다 타임라인을 만들어 반환하는 함수를
`master.add(buildIntro()).add(buildMain(), "+=0.5")`로 잇는다. **연출 하나가 함수 하나**가 된다.

`gsap.globalTimeline.timeScale()` / `tl.timeScale()` → §1-1의 `prodSpeed` 결함 수정.
`tl.seek()` `tl.progress()` `tl.reverse()` `tl.tweenTo()` → §5-11 리플레이 스크러빙.
그리고 **타임라인 자체를 트윈할 수 있다**: `gsap.to(tl, { timeScale: 2, duration: 2 })` —
연출이 *점점* 빨라진다. 배속 전환이 뚝 끊기지 않는다.

**스태거 객체**: `{ each, amount, from: "start"|"center"|"edges"|"random"|"end"|인덱스,
grid: [행,열] | "auto", axis, ease, repeat, yoyo }`.
`grid: "auto"`가 **행·열을 실측해서 알아서 잡는다** — 카와(버림패)는 국이 진행되며 행 수가
변하므로(§3-4에서 `grid: [6,4]`로 하드코딩했던 부분) 이쪽이 맞다.

**`gsap.utils`**: `clamp` `distribute` `getUnit` `interpolate` `mapRange` `normalize` `pipe`
`random(min,max,increment)` `selector` `shuffle` `snap` `splitColor` `toArray` `unitize`
`wrap` `wrapYoyo` `checkPrefix`.
`pipe()`로 체이닝한다: `gsap.utils.pipe(clamp(0,100), snap(5), quickTo(...))`.
> anime.js의 `utils`와 대부분 겹친다. 다만 **`createSeededRandom`이 없다** — 리플레이
> 재현성(§3-15)은 우리 `mulberry32`를 계속 쓰거나 `gsap.utils.random`에 시드를 물려야 한다.
> **이건 anime.js가 이기는 드문 지점이다.**

### 10-3. 플러그인 전수 → 적용처

#### Flip — §3-7·§5-3의 FLIP을 이걸로 한다

`Flip.getState(targets, { props })` → DOM 변경 → `Flip.from(state, {...})`.
설정: `absolute` `absoluteOnLeave` `nested` `scale` `simple` `spin` `stagger` `prune`
`props` `toggleClass` `targets` `onEnter` `onLeave` `fade`, 그리고 `data-flip-id`.

anime.js의 `createLayout()`보다 **우리에게 중요한 것 세 개를 더 갖고 있다**:

1. **`Flip.fit(a, b)`** — 요소 하나를 다른 요소의 자리·크기에 정확히 맞춘다.
   §5-5의 "고른 드래프트 카드가 보유 알약 자리로 날아가 앉는다"가 이 함수 하나다.
   후로 시 손패 → 멜드 자리도 같다.
2. **`Flip.batch()`** — **React 대응 전용.** 문서가 "프레임워크에서 필수"라고 명시한다.
   React가 리렌더하며 요소 인스턴스를 새로 만들기 때문에 `getState()`를 렌더 **전에**
   불러야 하고, `Flip.from`에 `targets`를 명시해야 한다. **§3-7에서 걱정한 부분에 대한
   공식 답이 이미 있다.**
3. **`onEnter` / `onLeave`** — 들어오고 나가는 요소를 따로 처리한다.
   §5-7·§5-8에서 "지금 퇴장 연출이 없다"고 적은 곳이 전부 여기로 들어온다.

`spin`은 덤이지만 «자리 바꿈»·«손바닥 뒤집기»에 그대로 쓰인다.

#### MotionPathPlugin — **§5-3의 "유일한 난관"에 대한 답**

`motionPath: { path, align, alignOrigin, autoRotate, start, end, curviness, offsetX/Y }`.
경로는 SVG `<path>`, path 문자열, **좌표 배열**(`[{x,y},...]`) 셋 다 된다.

우리에게 결정적인 건 **헬퍼 메서드**다:

- **`MotionPathPlugin.convertCoordinates()`** — 중첩된 transform을 가로질러 좌표를 변환한다.
- **`MotionPathPlugin.getRelativePosition(a, b)`** — 두 요소 사이 x/y 거리를 **모든 중첩
  transform을 감안해** 계산한다.
- **`MotionPathPlugin.getGlobalMatrix()`** — 로컬 좌표 → 뷰포트 좌표 행렬.

> **이게 `uiScale.ts` 문제의 정답이다.** §3-6·§5-3에서 "조상에 `transform: scale()`이 걸려
> 있어 화면 좌표와 레이아웃 좌표가 두 벌이고, 이게 이 교체의 유일한 난관"이라고 적었다.
> `App.tsx:6386`의 주석도 같은 말을 한다. **GSAP은 그 변환을 라이브러리 기능으로 갖고 있고,
> anime.js에는 대응물이 없다.** 우리 `toLayoutPx()`가 손으로 하던 일이다.
>
> 그리고 `align: 요소`는 "중첩 transform과 무관하게 대상을 경로 위에 정확히 올린다"고
> 문서가 직접 말한다 — 점수봉이 지불자 → 수령자로 날아가는 궤적(§5-6)처럼 **서로 다른
> 좌표 문맥에 있는 두 요소를 잇는** 연출이 그제야 안전해진다.

#### Draggable + InertiaPlugin — §5-3 손패 드래그

`Draggable.create(el, { type: "x,y"|"x"|"rotation"|..., bounds, trigger, cursor,
activeCursor, lockAxis, minimumMovement, dragResistance, edgeResistance, zIndexBoost,
dragClickables, snap, liveSnap, inertia, throwResistance, maxDuration })`.
콜백: `onPress` `onDragStart` `onDrag` `onDragEnd` `onRelease` `onThrowUpdate` `onThrowComplete`.
속성: `this.x/y` `startX/Y` `endX/Y` `isPressed` `isThrowing` `pointerX/Y`.

anime.js `createDraggable`과 대부분 겹치지만 **`liveSnap`이 우리 것과 정확히 같다**:
드래그하는 *동안* 슬롯에 붙는다. 우리 `handDragTargetIdx` + `targetIdx` 상태가 하는 일이
`liveSnap: { x: 슬롯중심배열 }` 한 줄이 된다. `minimumMovement`(기본 2px)는
`HAND_DRAG_THRESHOLD`, `edgeResistance`는 §3-6에서 제안한 "버리기에 마찰을 준다"에 해당한다.

`InertiaPlugin.getVelocity(target, "x")` — 던지듯 버리는 동작에서 속도를 읽어 세기를 정한다.

#### SplitText — §3-8보다 우리 사정에 맞는다

`type: "chars,words,lines"` · `mask: "lines"|"words"|"chars"` · **`autoSplit`** ·
**`aria: "auto"|"hidden"|"none"`** · `charsClass`("char++"로 자동 번호) · **`propIndex`**
(`--char: 3` 같은 CSS 변수를 각 조각에 넣는다) · `tag` · `deepSlice` · `smartWrap` ·
`prepareText` · `onSplit` · `revert()`.

세 가지가 anime.js `splitText`보다 낫다:

1. **`autoSplit`** — **폰트가 로드된 뒤 자동으로 다시 쪼갠다.** 우리는 한글 웹폰트를 쓰므로
   폰트 로드 전에 쪼개면 줄바꿈 위치가 어긋난다. 이게 없으면 컷인 글자가 첫 로드에서만 깨진다.
2. **`mask`** — 조각마다 클리핑 상자를 하나 더 만든다. "밑에서 올라와 드러나는" 연출이
   overflow 처리 없이 된다. 컷인 제목에 바로 쓴다.
3. **`prepareText`** — 문서가 "띄어쓰기가 없는 언어"용이라고 명시한다. 우리 컷인 문구에는
   «성립하지 않는 깡»처럼 **한글 + 한자 + 기호**가 섞인다 — 쪼개는 규칙을 여기서 손댈 수 있다.

그리고 `aria: "auto"`가 **기본으로** 부모에 `aria-label`, 조각에 `aria-hidden`을 붙인다.
접근성을 지키는 저장소에서 이건 "옵션"이 아니라 전제다.

#### ScrambleTextPlugin — §3-8의 해독 연출

`{ text, chars: "upperCase"|"lowerCase"|"XO"|커스텀, speed, delimiter(""|" "), tweenLength,
newClass, oldClass, revealDelay, rightToLeft }`.

> §3-8에 적은 적용처(«투시»·«선언 간파»·«천리안»·«수상한 주사위»·«일확천금»·«뚫린 천장»)가
> 그대로 유효하다. **`delimiter: " "`로 단어 단위 해독**이 되는 게 추가 이점 — 대기패 이름처럼
> "삼색동순" 같은 덩어리는 글자 단위로 풀리면 오히려 안 읽힌다.
> ⚠ **`seed`가 없다.** 리플레이 재현성이 필요하면 우리가 문자열을 미리 만들어 넘겨야 한다.

#### DrawSVG · MorphSVG · MotionPathHelper

- **DrawSVG** — `stroke-dashoffset` 선 그리기. §3-9의 적용처(«핏빛 계약» 서명, «연금술사»
  연성진, «무장해제» 균열, 점수 경로 14종) 그대로. dash 길이 계산을 대신해 준다.
- **MorphSVG** — 도형 변형. «양극»·«손바닥 뒤집기» 배지, 증강 카테고리 아이콘 전환.
  점 개수가 다른 path끼리도 알아서 맞춘다.
- **MotionPathHelper** — 브라우저에서 경로를 **끌어서 편집**하고 코드를 뽑는다. 연출을
  손으로 좌표 찍어 만드는 fx-lab 작업이 눈에 띄게 줄어든다(개발 도구, 배포엔 안 넣는다).

#### Physics2DPlugin / PhysicsPropsPlugin — **캔버스 물리를 손으로 안 짜도 된다**

`physics2D: { velocity, angle, gravity, acceleration, accelerationAngle, friction, xProp, yProp }`.

> 24_FX_LAB의 캔버스 연출들이 손으로 짠 것이 정확히 이것이다 — «밥상 뒤엎기»(중력·회전),
> «일확천금»(동전의 중력·바닥 반발·마찰), «개벽»(입자 내폭), «무장해제»(파편).
> `xProp`/`yProp`로 `left`/`top`이나 임의 프로퍼티에 물릴 수 있어서, **캔버스 스프라이트
> 객체에도 그대로 쓴다**(§3-10에서 anime.js의 JS 객체 애니메이션으로 하자고 한 것을
> 물리 모델까지 포함해서 한다).
> ⚠ 문서 주의: 물리 파라미터는 **도중에 바꿀 수 없고** 이징이 무시된다. 대신 되감기는 된다.

#### CustomWiggle / CustomBounce / CustomEase — **화면 흔들림에 전용 도구가 있다**

`CustomWiggle.create("myWiggle", { wiggles: 6, type: "easeOut"|"easeInOut"|"anticipate"|
"uniform"|"random", amplitudeEase, timingEase })`, 또는 축약형 `ease: "wiggle(15)"` ·
`ease: "wiggle({type: anticipate, wiggles: 8})"`.
**세기는 트윈 값이 정한다** — `rotation: 30`이 `rotation: 10`보다 세게 흔들린다.

> **이게 §5-1(초읽기 흔들림)과 §1의 `shake-1~4`에 대한 직접적인 답이다.**
> 지금 우리는 흔들림 4단을 **키프레임 4벌**로 손으로 적어 놨다(`styles.css:503~`).
> CustomWiggle이면 **한 이징에 세기만 바꿔** 4단이 나온다:
> ```js
> CustomWiggle.create("shake", { wiggles: 8, type: "easeOut" });
> const AMP = { 1: 2, 2: 5, 3: 9, 4: 14 };   // 4단이 숫자 하나로 갈린다
> gsap.fromTo(".table", { x: -AMP[level] }, { x: 0, duration: DUR[level], ease: "shake" });
> ```
> 그리고 `type: "anticipate"`가 있다 — **한 번 뒤로 당겼다가 터진다.** 론·역만처럼
> "맞았다"를 표현하는 흔들림에는 이쪽이 맞다. 지금 키프레임으로는 표현이 안 되는 결이다.
>
> **CustomBounce**(`strength`, `endAtStart`, `squash`)는 24_FX_LAB이 못 박은 규칙 —
> *"패가 물리적으로 부딪히는 순간에는 스쿼시를 남긴다"* — 의 `squash`가 **이름 그대로 있다.**
> 타패 슬램·분열 스냅·발굴 상승이 이것이다.

#### Observer — 입력 통합

`Observer.create({ target, type: "wheel,touch,pointer", onUp/onDown/onLeft/onRight/onChange/
onPress/onRelease/onDrag/onHover/onClick, tolerance, dragMinimum, lockAxis, preventDefault,
ignore, debounce })`.

> **적용:** 모바일 제스처. 지금 「누른 채로 게임판 보기」(`PeekButton`)·이모트·빠른 토글이
> 각자 포인터 이벤트를 다룬다. 다만 **우리는 이미 잘 도는 입력 코드가 있고 오조작이
> 치명적인 게임**이다(오타패 문제). **후순위** — 새 제스처를 만들 때만 쓴다.

#### ScrollTrigger / ScrollSmoother / ScrollToPlugin

> **§3-16·§4-11과 같은 판정: 대국 화면은 스크롤이 없다.** 도감·도움말·통계 한정.
> ScrollSmoother(관성 스크롤)는 **쓰지 않는다** — 정보를 찾아 읽는 화면에서 스크롤이
> 미끄러지면 방해다.

#### GSDevTools — fx-lab의 속도 슬라이더를 대체한다

타임라인 스크러버·재생 속도·루프를 화면에 띄우는 개발 도구.

> 24_FX_LAB이 *"속도를 0.25×로 낮추면 기법이 눈에 보인다 — 연출을 고를 때 이게 제일
> 유용하다"*고 적어 뒀는데, 그게 **완제품으로 있다.** 스크럽 바가 있어 특정 프레임으로
> 바로 갈 수도 있다(우리 슬라이더는 배속만 된다). **배포 번들에는 넣지 않는다.**

#### 안 쓰는 것

Pixi · EaselJS(다른 렌더러) · CSSRulePlugin(의사요소 — 우리는 클래스 토글로 충분) ·
ScrollSmoother · Parallax류.

### 10-4. GSAP만 푸는 것 — §1~§9에서 "못 한다"고 적은 자리들

| §1~§9에서 이렇게 적었다 | GSAP의 답 |
| --- | --- |
| §5-3 "조상 transform 좌표계가 **이 교체의 유일한 난관**" | `MotionPathPlugin.convertCoordinates` / `getRelativePosition` / `getGlobalMatrix` |
| §3-7 "FLIP은 조상 transform 리스크가 있어 0단계 결과를 보고 결정" | `Flip.batch()`(React 전용) · `absolute` · `nested` · `targets` — 문서가 프레임워크 사례를 직접 다룬다 |
| §5-5 "고른 카드가 보유 알약 자리로 날아가 앉는다" | `Flip.fit(a, b)` 한 줄 |
| §1 흔들림 4단을 키프레임 4벌로 손으로 적음 | `CustomWiggle` — 세기 숫자 하나로 4단 · `anticipate` 타입은 아예 새 표현 |
| 24_FX_LAB "패가 부딪히는 순간엔 스쿼시" | `CustomBounce`의 `squash` |
| 24_FX_LAB 캔버스 중력·반발·마찰을 손으로 | `Physics2DPlugin` (`xProp`/`yProp`로 캔버스 객체에도) |
| §3-8 컷인 글자 쪼개기 | `SplitText`의 `autoSplit`(**한글 웹폰트 로드 후 재분할**) · `mask` · `aria:"auto"` |
| §5-7·§5-8 "지금 퇴장 연출이 없다" | `Flip`의 `onLeave` / `absoluteOnLeave` |
| §7 reduced-motion을 CSS 11곳 + JSX 20여 곳에서 관리 | `gsap.matchMedia({ reduceMotion: "(prefers-reduced-motion: reduce)" })` — **한 곳** |
| `mulberry32` 주석의 "StrictMode 이중 렌더" 걱정 | `useGSAP()` 훅이 **명시적으로** React 18 StrictMode 이중 호출을 다룬다 |
| 24_FX_LAB "계열마다 공통 문장 하나를 정하고 변주만 갖는다" | `gsap.registerEffect({ name, effect, defaults, extendTimeline: true })` — 계열 문장이 **타임라인 메서드**가 된다 |
| §5-3 드래그의 초당 60회 리렌더 | `gsap.quickTo()` — 고빈도 갱신 전용. `gsap.utils.pipe(clamp, snap, quickTo)` |

#### `gsap.matchMedia()` — §7 접근성 배선의 정답

```js
const mm = gsap.matchMedia();
mm.add({
  isMobile:    "(max-width: 799px)",
  reduceMotion:"(prefers-reduced-motion: reduce)",
}, (ctx) => {
  const { isMobile, reduceMotion } = ctx.conditions;
  gsap.to(".table", { x: 0, duration: reduceMotion ? 0 : 0.42, ease: "shake" });
  return () => { /* 조건이 풀리면 자동 되돌림 */ };
});
```
**조건이 안 맞게 되는 순간 그 안에서 만든 것이 전부 되돌려진다.** §3-12에서 anime.js
`scope.revert()`를 두고 "24_FX_LAB의 되돌림 버그를 구조적으로 막는다"고 적었는데,
GSAP은 거기에 **미디어쿼리 조건까지** 묶는다. 우리는 `screenFx` 설정도 같이 물려야 하므로
`mm.add()` 조건에 커스텀 상태를 넣기보다 `gsap.context()`를 하나 더 두고 설정 변경 시
`revert()` 하는 편이 낫다.

#### `useGSAP()` — React 통합

```js
gsap.registerPlugin(useGSAP);
const root = useRef();
const { contextSafe } = useGSAP({ scope: root });      // 언마운트 시 자동 revert
const playCutIn = contextSafe((tone) => { /* 타임라인 */ });
```
`scope`가 셀렉터를 그 ref 아래로 한정하고, 훅이 끝난 **뒤에** 만드는 애니메이션(클릭 핸들러 ·
setTimeout · 소켓 메시지 콜백)은 `contextSafe()`로 감싸야 정리 대상이 된다.

> **우리 연출은 전부 "훅이 끝난 뒤"에 만들어진다** — 서버 메시지가 도착해서 `showCutIn`을
> 부르는 구조다(`App.tsx:3034`). 그래서 **`contextSafe`가 선택이 아니라 필수**다.
> 이걸 놓치면 국이 바뀌어도 이전 연출이 살아남는다 — 24_FX_LAB이 겪은 그 버그다.

### 10-5. 최종 비교 — 세 라이브러리

| 기준 | anime.js v4 | react-spring | **GSAP v3** |
| --- | --- | --- | --- |
| 라이선스 | MIT | MIT | Webflow 자체(무료, 경쟁 제한 조항) |
| 번들 | **가장 가볍다** (waapi 3KB / 전체 10KB) | 중간 | **가장 무겁다** (코어 + 플러그인마다 추가) |
| 구동 | WAAPI(하드웨어 가속) 선택 가능 | rAF | rAF (메인 스레드) |
| 타임라인 | 있다 | 없다(체이닝·`useChain`으로 대체) | **가장 성숙** (중첩·라벨·`tweenTo`·타임라인 트윈) |
| FLIP | `createLayout` | 없다 | **Flip 플러그인** (`fit` `batch` `onEnter/onLeave`) |
| 드래그 | `createDraggable` | 외부(use-gesture) | **Draggable + Inertia** (`liveSnap`) |
| 좌표계 변환 | **없다** | 없다 | **`convertCoordinates` 등** ← 우리 `uiScale` 문제 |
| 흔들림 이징 | 직접 키프레임 | 스프링으로 흉내 | **CustomWiggle**(`anticipate`) |
| 물리(입자·파편) | JS 객체 트윈 | 스프링 | **Physics2D**(중력·마찰·각도) |
| 텍스트 | `splitText`/`scrambleText` | 없다 | **SplitText**(`autoSplit` `mask` `aria`) / ScrambleText |
| SVG | `morphTo`/`createDrawable`/`createMotionPath` | 없다 | Morph/Draw/MotionPath **+ 편집 헬퍼** |
| 시드 난수(리플레이) | **`createSeededRandom`** | 없다 | 없다 |
| 전역 배속(`prodSpeed`) | `engine.speed` | 없다 | `globalTimeline.timeScale()` **+ 배속 자체를 트윈** |
| reduced-motion 일원화 | 스코프 revert | **`Globals.skipAnimation`** | **`matchMedia({reduceMotion})`** |
| React 통합 | `createScope` | **네이티브(선언적)** | `useGSAP` + `contextSafe` |
| 상태 연동 상호작용 | 약함 | **가장 강함** | `quickTo`로 대체 가능 |
| 개발 도구 | 없다 | 없다 | **GSDevTools** · MotionPathHelper |

### 10-6. 개정된 결론 — §0을 이렇게 고친다

**우리 요구 목록을 한 라이브러리로 가장 많이 덮는 것은 GSAP이다.** §1~§9를 쓸 때 "라이브러리
없이는 못 한다"·"이게 유일한 난관이다"라고 적은 자리들이 §10-4 표에 전부 답이 있다.
그중 **좌표계 변환**(`uiScale.ts`)과 **`Flip.batch()`의 React 대응**은 다른 두 라이브러리에
대응물이 아예 없다.

그래서 실제 선택지는 셋 중 고르는 게 아니라 **둘 중 하나**다:

**(A) GSAP 단독** — 연출(타임라인·Flip·물리·텍스트·SVG)과 상호작용(Draggable·quickTo)을
한 라이브러리로. 배울 것이 하나고, 두 라이브러리가 같은 `transform`을 놓고 싸울 일이 없다
(§9-5). **번들이 가장 무겁다는 것 하나만 감수하면 된다.**

**(B) anime.js(`animejs/waapi`) + react-spring** — §1~§9의 원안. 가볍고 MIT이며 WAAPI
하드웨어 가속을 쓴다. 대신 좌표계 변환·물리·CustomWiggle·SplitText autoSplit은 **계속 손으로**
짠다.

> **판단 기준은 하나로 좁혀진다: 번들 예산.** 지금 클라이언트 의존성이 React 외에 사실상
> 없다는 게 이 저장소의 성질이고, 그걸 지킬 가치가 있다고 보면 (B), 연출이 이 게임의 핵심
> 경험이라고 보면 (A)다.
>
> **개인 추천은 (A)다.** 증강 104종에 연출을 붙이는 게 이 프로젝트가 실제로 하려는 일이고
> (fx-lab 107종이 그 증거다), 그 일의 절반이 §10-4 표에 적힌 "손으로 짜던 것"이다.
> 다만 **번들 수치를 실측하고 결정하자** — 아래 0단계가 그 실측이다.

### 10-7. 개정된 도입 순서

**0단계 · fx-lab에서 GSAP과 anime.js를 나란히 (번들 영향 0)**
`packages/client/public/`은 정적 파일이라 실패해도 게임에 영향이 없다. 같은 연출 두세 개
(«분열» gooey · «자리 바꿈» 원호 · 손패 스태거)를 **양쪽으로 각각 만들어** 비교한다.
→ 여기서 반드시 확인할 것: ① `uiScale` 조상 transform 아래에서 좌표가 맞는가
② FLIP이 우리 레이아웃에서 도는가 ③ **실제 번들 증가량**(`npx vite-bundle-visualizer`)

**1단계 · `prodSpeed` 결함 수정 (§1-1)** — `globalTimeline.timeScale()` 또는 `engine.speed`.
컷인 하나만 옮겨서 검증한다.

**2단계 · 흔들림 4단을 CustomWiggle로** (GSAP을 고른 경우) — 키프레임 4벌이 숫자 하나가 되고,
`anticipate` 타입이라는 새 표현이 생긴다. 되돌리기 쉬운 작은 변경이다.

**3단계 · 손패 드래그** — `Draggable`(`liveSnap`) 또는 react-spring imperative API.
**성능 이득이 가장 큰 곳.** 모바일 실기 확인 필수.

**4단계 · Flip** — 자동정렬 · 후로 · 드래프트 카드 → 보유 알약(`Flip.fit`).

**5단계 · 새 증강 연출만 새 방식으로.** 기존 89개 키프레임은 옮기지 않는다(§9-1).

### 10-8. GSAP을 쓰면 안 되는 곳 — §9에 덧붙인다

9. **`ScrollSmoother`를 켜지 마라.** 도감·도움말은 정보를 찾아 읽는 화면이다. 스크롤이
   미끄러지면 원하는 줄에서 멈추기 어려워진다.
10. **`GSDevTools`·`MotionPathHelper`를 배포 번들에 넣지 마라.** 개발 도구다. fx-lab에만.
11. **anime.js와 GSAP을 같은 프로젝트에 함께 넣지 마라.** 기능이 90% 겹치는데 타임라인
    위치 문법의 `<`가 **서로 반대 뜻**이다(§10-2). 둘 다 있으면 반드시 사고가 난다.
12. **`Observer`로 기존 입력 코드를 갈아엎지 마라.** 오조작이 곧 타패인 게임이고, 지금
    입력 코드는 오타패 사고를 겪고 다듬은 것이다. 새 제스처를 만들 때만 쓴다.
13. **`registerEffect`로 계열 문장을 만들되, 문장 수를 늘리지 마라.** 24_FX_LAB이 계열을
    8개로 묶은 것이 요점이다. 도구가 편해졌다고 계열이 20개가 되면 그건 다시 잡동사니다.

## 부록 A. 이 문서를 다시 확인하는 법

- anime.js 문서 목차는 `https://animejs.com/documentation/` 사이드바에 전부 있다.
  본문에서 인용한 수치(3KB/10KB, spring 파라미터 범위, composition 기본값 전환 임계 1000개)는
  각 하위 페이지에 적혀 있다.
- react-spring 프리셋 값(`default {170,26}` `gentle {120,14}` `wobbly {180,12}` `stiff {210,20}`
  `slow {280,60}` `molasses {280,120}`)은 `/docs/advanced/config`에 있다.
- GSAP 문서는 `https://gsap.com/docs/v3/`. 라이선스는 `https://gsap.com/licensing/` —
  **2025년 4월 전면 무료화** 이전 자료가 웹에 많이 남아 있으니 반드시 원문을 본다.
- 우리 쪽 근거는 전부 `packages/client/src/App.tsx`·`styles.css`·`public/fx-*.js`의
  줄 번호로 달아 뒀다. **줄 번호는 낡는다 — 심볼 이름으로 찾아라.**
