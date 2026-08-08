# 19. UI 디자인 리소스 & 전체 리뉴얼 명세서 (코드 매핑판)

> **목적** — 디자이너가 바로 작업에 착수할 수 있도록, **코드 식별자 ↔ 에셋 파일명**을 1:1로 매핑하고 누락 요소를 발굴한 명세서.
> **기준** — 2026-07-25 (57차) 코드 전수 조사: `packages/client/src/App.tsx` 7,886줄 · `styles.css` 6,207줄 · `sfx.ts` 1,070줄 · `index.html` 12줄 · `packages/core` 타입.
> **자매 문서** — [17_DESIGN_ASSETS.md](17_DESIGN_ASSETS.md)(발주 물량·계약·개별 증강 연출), [18_UI_REDESIGN_BRIEF.md](18_UI_REDESIGN_BRIEF.md) **§10만 유효**(패 두께 4방향 규칙). 본 문서가 17과 어긋나는 곳은 **§0.4 정정**이 우선한다.
>
> **구분 범례**
> - `기존` — 코드·에셋 모두 존재. 이미지 **교체**만 하면 됨.
> - `격상` — 코드(State/클래스)는 존재하나 현재 CSS 도형·그라디언트·이모지로 표시 중. **에셋 신규 제작 + 교체**.
> - `신규` — 코드에도 없음. **개발 작업 + 에셋** 동시 필요.

---

## 0. 전제 — 아트 디렉션 · 코드 실태 · 정정

### 0.1 아트 디렉션 (2026-07-25 피벗 — 최신)

docs/18의 네온·홀로그램 방향은 **폐기**. 17번 C안(수묵) 계열로 회귀 중이며, 레퍼런스는 "증강체스"류 **네오브루탈리즘**(2px 먹선 테두리 + 오프셋 하드 섀도 + 플랫 채색 + 카드형 UI)을 "**어두운 탁자 위 종이 오브제**"로 번역하는 방향.

| 상태 | 내용 |
| --- | --- |
| ✅ 확정 | 평시 = 어두운 남색 유지(현행 팔레트·감지금니 프레이밍 그대로), **흰 패가 화면 최고 밝기 주인공** |
| ✅ 확정 | **패 뒷면 = 심록 `#1E4034`** (현행 코드의 청록 그라디언트는 폐기 대상, §1 참조) |
| ✅ 확정 | 네온·홀로그램·글리치 금지. 먹/붓/일본식/깔끔 |
| 🔶 제안 중 | 픽셀 수위(패·아이콘에 픽셀 느낌), 하드 vs 소프트 섀도, 리치=발묵 띠, 대형 화료=화지 반전, 증강=색먹 8색(`--fx-color` 재사용) |

> 17 §1.3의 재질 3종(펠트/금속/유리) 중 "유리/홀로그램"은 위 피벗으로 재검토 대상 — **종이/화지 + 먹선**이 대체 후보. 모션 규약(후로=타격, 증강=초자연·shake 금지, 17 §1.3)은 그대로 유효.

### 0.2 코드/에셋 실태 요약 (디자이너가 알아야 할 현실)

- 이미지 에셋은 **마작패 PNG 37장이 전부**다. `styles.css` 전체에 `url(...)` 참조 **0건**, 인라인 SVG 0건.
- 아이콘은 전부 **이모지/유니코드 23종+**(⚙ ✕ ↻ ▶ 👑 🔒 ⚠ ✦ …) — OS마다 다르게 렌더된다. §6.6 교체표.
- **웹폰트 미로드**: `font-family: "Pretendard", …` 선언만 있고 `@font-face`·CDN 링크가 없다 → 실제로는 OS 기본 고딕으로 렌더 중.
- **파비콘·로고·OG 이미지·매니페스트 전무**. `<title>Majak</title>` 뿐. "이능마작" 로고는 letter-spacing 걸린 텍스트 3곳.
- **디자인 토큰 부재**: `:root` CSS 변수 0개. 색·radius(5~999px 12종)·그림자 전부 하드코딩. 컷인용 `--fx-color/--fx-glow`만 존재.
- 애니메이션은 `@keyframes` **67종**이 CSS로 돌고 있음(§6). `prefers-reduced-motion` 대응 존재 → **모든 발광 에셋은 "가장 밝은 상태" 정지 프레임 버전 필요**.

### 0.3 캔버스·스케일 시스템 (작업 규격)

- 고정 캔버스 없음. **순수 DOM + `vmin` 비례 스케일**. 기준 작업 해상도 **1920×1080** (이때 보드 = `min(88vmin, 900px)` → **900×900px 정사각**, 중심 y=46%).
- 핵심 변수(`.table` 스코프, styles.css:111-135): `--board` / `--panel`(=board×0.3=270px) / `--rt-w`(바닥 패) / `--hand-w`(내 손패 52~84px) / `--mt-w`(후로 38~52px) / `--back-w`(상대 뒷면 38~50px) / `--dora-w`.
- 브레이크포인트: **900px**(보드 560px로 축소 + 좌우 이름표 소실), 700px(퀵토글), 560px(대기실/도감).
- 컷인은 풀블리드(`.cutin-rays` 150vmax) → **1920×1080 + 사방 10% 안전여백**으로 작업.
- **최소 판독 크기 17px**(증강 패널 미니 타일) — 모든 패·아이콘은 17px 축소 검수 선행 (17 §1.4).

### 0.4 docs/17 발주서 대비 정정 (2026-07-25 코드 기준)

| # | 정정 | 코드 근거 |
| --- | --- | --- |
| 1 | **티어(Silver/Gold/Prism) 카드 프레임 발주 금지.** 등급 UI는 폐기됐고 `tier`는 엔진 우선순위로만 남음. 드래프트/도감/pill 전부 `tier-prism` 하드코딩 = 사실상 단일 프레임. 시각 축은 **카테고리 8종**이 대체 | `App.tsx:2811` 주석, `:7645`, `:3236`, `:5161` |
| 2 | **증강 물량: 69종 → 108종** (계열은 2026-07-26에 `AugmentDef.category`로 전수 분류 완료) (콘텐츠 104 + 코어 4, 조사 중에도 3종 증가). 개별작 불가 — 17 §6.1 "조립 시스템(카테고리 프레임 8 + 심볼 라이브러리 + 조합 규칙)" 요구가 더 절실해짐 | `content/src/index.ts:254-369` |
| 3 | 증강 선택 모달 중 `silent_take`(정적의 손)·`foresight_order`(예지)는 **모달 방식에서 제외**됨 — 각각 바닥 직클릭 / 발동 후 드래그 재배열로 전환 | `App.tsx:510-517` 주석 |
| 4 | `TileAttrs.redFor`(개인 한정 적도라)가 **클라이언트 미구현** — 지금은 전원에게 진짜 적도라처럼 보임. 전용 시각 언어 필요(§1-B) | `core/tiles/Tile.ts:45`, App.tsx 참조 0건 |
| 5 | JSX가 붙이는 `.aug-cat-{카테고리}` 클래스가 **CSS에 미정의** — 카테고리 색은 컷인에서만 살아 있음. pill/배지 이식 필요 | `App.tsx:5162, 7652` vs styles.css |
| 6 | ~~동풍전 드래프트 2차 스테이지(`eastThird`) 라벨이 "남장 돌입"으로 오표기~~ → 2026-08-04 해소: 스테이지 5종 전부 `DRAFT_STAGE_HEADLINE` 표로 분리 | `App.tsx` `DRAFT_STAGE_HEADLINE` |

---

## 1. 손패 및 마작패 (Tiles)

- 참조 파일/코드: `packages/core/src/mahjong/tiles/Tile.ts` (`TileKind`·`TileAttrs`), `App.tsx:1237 tileImageSrcOf()` · `1279 TileImg` · `1252 preloadTileImages()`, `styles.css:1662 .tile-face`, `public/tiles/*.png`(80×129, 37장)

### 1-A. 패 본체

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 수패 만·통·삭 1~9 (27종) | 기존 | `TileKind{suit:"man"\|"pin"\|"sou", rank:1..9}` → `tileImageSrcOf()` | `1m.png`…`9m.png` / `1p`… / `1s`… | PNG-24 투명, @1x=80×129 + @2x/@3x, SVG 원본 | **파일명 변경 절대 불가**(코드 직접 참조). 인쇄면(문양)만 납품 — 아이보리 몸통 `#F8F5EC`+radius 5px+`inset 0 -3px` 그림자는 CSS가 그림(17 §3.2). 1m↔1s가 **17px에서 구분**돼야 함 |
| 풍패 東南西北 | 기존 | `suit:"wind", rank:1~4` | `1z.png`~`4z.png` | 〃 | 〃 |
| 삼원패 백·발·중 | 기존 | `suit:"dragon", rank:1~3` (5z=백 6z=발 7z=중) | `5z.png`~`7z.png` | 〃 | 백판은 "빈 패"와 혼동 없게 |
| 적도라 5 | 기존 | `TileAttrs.red===true` → rank 0 치환 | `0m.png` `0p.png` `0s.png` | 〃 | **빨강만으로 구분 금지**(색맹) — 외곽선·점 등 형태 단서 병기 |
| **방향별 두께 패 (앞면)** | 신규 | 배선 예정: `TileImg`가 놓인 위치/`Meld.calledFrom`으로 4변형 선택 (18 §10.3) | `{패}_top.png` `_bottom` `_left` `_right` (37×4=148) | 〃 | 앞면 정투영 동일, **한 변에만 측면 두께 3~6px**. 내 손패/내 바닥=bottom, 카미차가 버린 패=right, 시모차=left, 토이멘=top, **후로 패=울어온 상대 방향** |
| **패 뒷면 (심록)** | 격상 | 현재 CSS 그라디언트 `#3B6E8F→#24485F→#1A3549` **4곳 중복**: `.tile-back-face`(C:960) `.back-v`(C:702) `.back-h`(C:711) `.dora-back`(C:383) | `back.png` + `back_top/bottom/left/right.png` | 〃 | **단일 최우선 에셋**(화면 절반이 뒷면: 상대 손패 3인분+안깡+도라 5칸+안개 바닥). 기조색 **심록 `#1E4034` 확정**. 눕힌 가로 변형은 현재 그라디언트 각도만 90° 튼 가짜 — 실제 가로 변형본 필요 |
| 비표준 패 폴백 | 기존 | `Suit = string`(증강이 새 suit 등록 가능) → `formatTile()` 텍스트 렌더 `.tile-text` | — (증강별 협의) | — | 새 suit 증강 출시 시 전용 패 이미지 추가 발주 필요. 폴백은 10px 텍스트 |

### 1-B. 패 상태 오버레이 (17 A-7 확장)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 공통 도라 발광 | 격상 | `doraClassOf()`(A:837) → `.tile-dora` — border `#ffcf5a` + `dora-glow`/`dora-shine` | `tile-fx-dora@2x.png` | PNG/WebP 오버레이 or 스프라이트시트 | 금빛 링+광택 스윕. **정지 프레임 버전 필수**(reduced-motion) |
| 개인 전용 도라 | 격상 | `.tile-dora-own` — `#ff9ad9` 장미금 (`fx.personal`, 현재 이면투시産) | `tile-fx-dora-own@2x.png` | 〃 | 공통 도라와 색 축 분리(장미금) |
| **개인 한정 적도라** | **신규** | `TileAttrs.redFor: PlayerId` — **클라 미구현**(§0.4-4) | `tile-fx-red-own@2x.png` | 〃 | "나에게만 적도라" 상태. 소유자에겐 적도라 오라, 타인에겐 일반 패로 보이는 규칙 확정 필요 |
| 증강 생성패(conjured) | 격상 | `TileAttrs.conjured` → `.tile-conjured` — border `#c58cff` + 보라 시머(`conjured-shimmer`) | `tile-fx-conjured@2x.png` | 〃 | "이 세계 패가 아님" — 색먹 보라 계열. 4장 초과 존재 가능성을 알리는 표식 |
| 봉인 패 | 격상 | `.hand-sealed` + `.hand-seal-badge` **이모지 🔒** | `icon-seal-16.svg` + `tile-fx-sealed@2x.png` | SVG+PNG | 자물쇠/사슬 오버레이. 과거 "패가 클릭이 안 된다" 문의 지점 — 회색 처리만으로 끝내지 말 것 |
| 위험 패(지뢰 탐지) | 격상 | `.hand-danger` + `.hand-danger-badge` **이모지 ⚠** — outline `rgba(255,92,92,.9)` `danger-pulse` | `icon-danger-16.svg` | SVG | 적색 맥동. 뱃지 15px |
| 도박 잠금 | 격상 | `.hand-gamble` + `.gamble-hint-icon` **이모지 🎲** — `gamble-lock-glow` | `icon-dice-16.svg` | SVG | 주황 잠금 |
| 같은 종류 하이라이트 | 격상 | `.tile-hl`(hover 연동, `kindMatches`) — outline `#63d6ff` `hl-pulse` | `tile-fx-match@2x.png` | PNG | 시안 링 |
| 최신 버림패 | 격상 | `.rt-latest` — 금테+`tile-flash` 흰 플래시+`dust-out` 먼지 링(전부 CSS 도형) | `fx-dust-ring.png`(스프라이트) | 스프라이트시트+JSON | 타패 착지 먼지·플래시 실물화 (17 E-15~17) |
| 쯔모패 간격·발광 | 기존 | `.hand-drawn` — margin `--hand-w×0.4` + 금 glow | — (스펙만) | — | 에셋 불요, 발광 톤만 통일 |
| 리치 선언패(눕힘) | 격상 | `.rt-riichi`(`riichiTileIndex`) — `rotate(-90deg)` + 붉은 glow | (두께 패 `_left/_right`로 해결) | — | 두께 4변형 도입 시 자연 해결. 붉은 glow 톤 스펙 제출 |
| 무장 대상(증강) | 격상 | `.hand-armable` `.rt-armable` `.opp-armable` — 보라 outline `armable-pulse` | `tile-fx-armable@2x.png` | PNG | §4.5와 세트 |

### 1-C. 크기 프리셋 (코드 고정값 — 에셋 크롭/패딩 기준)

| `TileImg` size | 클래스 | 실효 치수(보드 900px) | 종횡비 |
| --- | --- | --- | --- |
| `hand` (내 손패) | `.tile-hand` | 최대 84×134px | **1:1.6** |
| `fill` (바닥/후로/도라) | `.tile-fill` | 바닥 52×78 / 후로 52×78 / 도라 36×53 | 1:1.5 / **1:1.45** |
| `mini` (뱃지/툴팁) | `.tile-mini` | 25×37 기본 (국소 23~34px 5종 오버라이드) | ~1:1.48 |
| `result` (결과창) | `.tile-result` | 24~34px | 1:1.5 |
| 상대 뒷면 | `.back-v/.back-h` | 최대 50×68 | **1:1.36** |

> ⚠ **종횡비 4종 분열** — 같은 PNG가 `object-fit:contain`으로 슬롯마다 다른 여백으로 letterbox 된다. **디자이너가 1:1.5 통일 제안 + 위치별 크롭 규칙을 스펙으로 제출**할 것(17 §3.2). 모달에서 `scale(1.3)` 확대 사용 중 → @2x 필수.

---

## 2. 작탁 및 중앙 보드

- 참조 파일/코드: `App.tsx:4834 CenterPanel` · `4062 .table-center` · `4939 River` · `5190 MeldGroup`, `styles.css:21 .game-root` · `289` · `301 .center-panel`, `WIND_CHAR`(A:60) `DORA_SLOTS=5`(A:4832) `wallLeft`(A:4844)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **작탁 전체 배경** | 격상 | `.game-root` — radial-gradient(`#2d5a80→#0a1826`) **1개가 배경의 전부** | `bg-table@2x.webp` | WebP(무손실) 1920×1080 + 2560 대응 | 17 B-1. 펠트+프레임+단일 광원 vignette. 수묵 피벗: 어두운 남색 유지, 종이/먹 텍스처 미세 노이즈 |
| 보드 경계 장식 | 신규 | `.table-center` — **background·border 선언 자체가 없음**(투명 배치 박스) | `board-frame@2x.png` (9-slice) | PNG 9-slice | 17 B-2. 900×900 정사각 기준. 먹선 프레임 후보 |
| 4방 바닥(강) 가이드 | 신규 | `.river-wrap .river-{side}` — 6열×3단, 가이드 시각 없음 | `board-river-guide@2x.png` | PNG 알파 | 17 B-3. 은은한 각인 수준 (정보 가리기 금지) |
| **중앙 인포 패널 프레임** | 격상 | `.center-panel` — 270×270, radius 16, 남색 그라디언트+금 헤어라인 | `panel-center-frame@2x.png` (9-slice) | PNG 9-slice | 17 B-4. 금테 + 코너 장식. 유리→**종이/옻칠** 재질로 피벗 검토 |
| 턴 방향 발광 4종 | 격상 | `.center-panel.turn-{bottom\|top\|left\|right}::after` — inset box-shadow `rgba(255,200,80,.92)` + `turn-edge` | `fx-turn-glow-{4방향}@2x.png` | PNG 알파 | 17 B-5. 금색 맥동. 정지 프레임 포함 |
| 장/국 표시 | 격상 | `view.round.prevalentWind`·`roundNumber` → `.center-round` "東1국" (`#ffd76a`, 패널×0.15) | `num-score-set` + 캘리그래피 병용 | §6.4 숫자 세트 | ⚠ 표기 불일치: 중앙 "東1국" vs 인트로/리플레이 "동1국" — 한자/한글 락업 통일 결정 필요 |
| 본장 표시 | 격상 | `r.honba` → 텍스트 "N본장" (클래스 없음) | `stick-100@2x.png` | PNG | 17 A-10. **100점봉 실물** + 개수. `honba_hunter` 증강 때문에 본장 시각화 가치 높음(달아오르는 연출 여지) |
| 공탁(리치봉 더미) | 격상 | `r.riichiPot` → 텍스트 "供N" (`.pot` `#ff9d7e`) | `stick-1000-pile@2x.png` | PNG | 17 B-9. **천점봉 스택 그래픽**(1~n개 상태). `供` 글리프 의존 제거 |
| 남은 패산 카운터 | 격상 | `wallLeft` → `.wall-count` "×N" 텍스트 | `wall-stack@2x.png` | PNG | 17 B-10/A-11. 패산 뭉치 아이콘+숫자. **잔여 임계(≤10 등) 경고 상태 없음** — 상태 2종 디자인 |
| 도라 슬롯 5칸 | 격상 | `DORA_SLOTS=5` · `.dora-slot` · 미공개 `.dora-back`(CSS 뒷면) | `panel-dora-tray@2x.png` | PNG 9-slice | 17 B-7. 공개/미공개(=심록 뒷면) 2상태. 뒷도라(`center-ura`)·이면투시(`center-ura-peek` 보라)는 §4 |
| **4방향 점수판 plate** | 격상 | `.plate.plate-{side}` 138×36 고정 + `.plate-score`(tabular-nums) + `.plate-turn`(금 링) | `panel-plate-{h\|v}@2x.png` | PNG 9-slice | 17 B-11. 좌우는 90° 회전 — 세로 숫자 가독 검수. **모바일 미대응**(패널 168px일 때도 138px 고정) 스펙 포함 |
| 자풍 표식 東南西北 | 격상 | `seatWindChar()`(A:1046) → `.plate-wind` 30×30 사각+한자 텍스트 | `wind-{e\|s\|w\|n}.svg` + 친 변형 4종 | SVG+PNG 30/44px | 17 B-6. 각인 타일 4종 + **친(붉은) 4종** |
| 오야 마커 | 신규 | 현재 `.plate-dealer`(wind==="東" 문자열 비교로 붉게) **뿐** — 전용 마커 없음 | `marker-dealer@2x.png` | PNG | ⚠ 턴 시 금색이 오야 적색을 **덮어 오야 표시가 사라짐** — 마커 분리로 해결. `pseudo_dealer`(찬탈) 증강이 오야 이동 연출을 요구 |
| 점수 증감 플로팅 | 격상 | `scoreFx`(A:1422) → `.score-float` `.score-plus #8fe3a1`/`.score-minus #ff8d7e` | `num-score-set` 재사용 | §6.4 | 17 B-13. 큰 점수 이동 임팩트 부족 — 점수봉 날아가는 연출 여지 |
| 버림 드롭존 | 격상 | `.discard-dropzone` — 금색 3px dashed + over 시 확대 | `dropzone-frame@2x.png` | PNG 9-slice | 17 B-14. 손그림 먹선 프레임+화살표. normal/over 2상태 |
| 후로 배치 | 기존 | `MeldGroup`·`MeldTile`·`MeldStack` — `.mtile-{row\|col}(-lying)` `.mtile-stack`(가깡) `kan_closed`=[뒷,앞,앞,뒷] | (두께 패로 해결) | — | 눕힘은 전부 CSS 회전 → §1-A 두께 4변형이 "어디서 울었는지"를 표현. 가깡 2단 겹침 스펙 유지 |
| 왕패/패산 시각화 | 신규 | 판 위 렌더 **없음**(왕패는 모달 안에서만, `deadWallSlotInfo` A:1173) | `deadwall-tray@2x.png` (선택) | PNG | 17 H급 제안. `dead_wall_master`가 왕패 14장 공개를 쓰므로 판 위 상설 표시 검토 가치 있음. **패산 밑**은 `bottom_deal`이 손패 위 스트립(`.bottom-deal-strip`, 실물 tileId 3장)으로 이미 상설 표시한다 — 판 위 렌더가 생기면 그쪽으로 옮길 후보 |

---

## 3. 플레이어 UI 및 타이머

- 참조 파일/코드: `App.tsx:5133 NamePlate` · `5031 OpponentStrip` · `5865 OwnArea` · `5993 .prompt-timer` · `7613 draft 타이머`, `core/src/information/PlayerView.ts:62 PlayerInfo`, `server/src/HumanAgent.ts:19 DECISION_TIMEOUT_MS=30_000`
- **데이터 현실**: `PlayerInfo = { id, seat, score, augments[], nickname, isBot }` — **avatar/rank/title/connected 필드 자체가 없음.** 한 플레이어의 정보가 이름표(가장자리)+점수판(중앙)+손패 3곳에 분산.

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 이름표 프레임 | 격상 | `.nameplate` / 차례 `.nameplate-turn` — 반투명 pill + 금테 | `nameplate-{normal\|turn}@2x.png` | PNG 9-slice | 17 C-33. 4방향 배치(top은 아래, left/right는 위에 붙음). **900px 이하에서 좌우 이름표 `display:none`** — 축약형(아이콘 온리) 별도 디자인 |
| 차례 뱃지 | 격상 | `.np-turn` "차례" — 금 그라디언트 pill + `turn-pulse` | `badge-turn@2x.png` | PNG | 턴 표시가 **5채널**(np-turn/nameplate-turn/plate-turn/center-panel glow/own-hand-turn)에 분산 — 금색 `#ffd76a` 축으로 톤 통일 스펙 제출 |
| **턴 타이머 게이지** | 격상+개발 | `.prompt-timer-fill` — `animation: timer-run 30s` **CSS 하드코딩, 서버 미동기**(`DecisionPrompt`에 deadline 필드 없음) | `timer-track@2x.png` + `timer-fill.png` | PNG 9-slice | 17 B-15. **개발 선행**: 프로토콜에 `deadlineMs` 추가. 디자인: 게이지+숫자+긴급(≤5s 적색 맥동) 3상태. 현재 숫자·긴급·소리 전부 없음 |
| 상대 턴 타이머 | 신규 | 없음 — 남의 차례 잔여 시간 표시 0 | `timer-ring-mini@2x.png` | PNG/SVG | 좌석별 소형 링. 4방향 회전 대응 |
| 드래프트 타이머 | 격상 | `.draft-timer`(`draft.deadlineMs` — 유일한 서버 동기 타이머) / `.draft-timer-urgent`(≤5s) | `timer-ring@2x.png` | PNG/SVG | 17 C-54. "⏳ 남은 시간 N초" 텍스트 → 링 게이지. normal/urgent |
| **좌석 아바타/문장** | 신규 | `PlayerInfo`에 필드 없음. 이미지 0 | `emblem-{동남서북 모티프 12~20종}.png` | PNG 96×96 원본 | 17 H-1/§10.1. 방위 모티프 추상 문장(인물 없음). 사용 크기: 이름표 24~32 / 대기실 40~48 / 결과 64px |
| BOT 표시 | 격상 | `isBot` → `botLabel()` "봇1…" + `.seat-bot` "BOT" 텍스트칩 | `badge-bot.svg` + 봇 전용 문장 1~3종 | SVG | 봇 아바타·"생각 중" 인디케이터 없음(thinkMs=0). 봇 문장을 아바타 세트에 포함 |
| 후리텐/역없음 뱃지 | 격상 | `.np-furiten`(`#ff8d7e`) `.np-noyaku`(`#ffcf6b`) — 본인 뷰 전용 | `badge-furiten.svg` `badge-noyaku.svg` | SVG | 17 C-36. 먹 스탬프 느낌 후보 |
| 리치 상태 표시 | 격상 | `riichiDeclared` → `.plate-stick`(26×5 CSS 막대+`#d04a3a` 점) | `stick-1000@2x.png` | PNG | 17 A-9. §6.2 리치 연출의 대형 봉과 동일 소스 |
| 오름패 뱃지 | 기존 | `WaitsBadge` 3변형: 내 것 / 간파 / 오픈리치(`.waits-badge-open` 대형·맥동) | `badge-waits-{3종}@2x.png` | PNG 9-slice | 17 C-37. "역없음" 취소선 오버레이(`.wait-tile-noyaku` grayscale) 포함 |
| **연결 끊김 표시** | 신규 | 서버는 `abandon()`으로 봇 대행하지만 **프로토콜에 미전송** — 상대가 나간 걸 알 수 없음 | `badge-disconnected.svg` | SVG | **개발 선행**(PlayerInfo.connected). 이름표 회색화+아이콘+"자동 진행" 태그 |
| **유국 텐파이 공개** | 신규 | `revealedHands`가 화료자만 채움 — 유국 시 텐파이/노텐·손패 공개 전무 | `badge-tenpai.svg` `badge-noten.svg` | SVG | **개발 선행**. 유국 결과 레이아웃(§6.3)과 세트 |
| 시점 전환/관전 바 | 기존 | `.sbx-observe-bar`(+`.my-turn`) `.spectate-bar` `.sbx-viewas .sbx-seat.on`(파랑=시점, 보라=대상) | — (관리자용, 발주 제외) | — | 17 §2 발주 제외 대상. 이모지(🔍👁)만 아이콘 교체 |

---

## 4. 증강 시스템 (Augment System)

- 참조 파일/코드: `core/src/augment/Augment.ts AugmentCategory`(계열 enum·**단일 진실**) · `App.tsx CATEGORY_META`(라벨·아이콘) · `App.tsx CATEGORY_BY_ID`(카탈로그 수신 시 채워짐) · `App.tsx:510 MODAL_PICK_TYPES` · `421 ARM_MODE` · `7600 DraftOverlay` · `6572 ActiveAugmentControl` · `4427 AugmentInfoPanel` · `6368 ActiveInfoBadges` · `3095 CodexScreen`, `core/src/augment/Augment.ts AugmentDef`, `content/src/index.ts:254 contentAugments`(104종)+코어 4종

### 4.1 카테고리 9종 — 아이콘 명세 (코드 고정 enum)

`type AugmentCategory = "scoring"|"info"|"hand"|"shape"|"call"|"riichi"|"defense"|"disrupt"|"etc"` — **정의 위치는 `core/src/augment/Augment.ts`**이고, 값은 각 증강 정의의 `AugmentDef.category`가 단일 진실이다(2026-07-26 이관). 서버 카탈로그(`AugmentCatalogEntry.category`)로 클라이언트에 오며, 예전의 id 관례 휴리스틱(`inferCategory`)·명시 맵(`AUGMENT_CATEGORY`)은 삭제됐다. 아이콘은 `CATEGORY_META`에 **이모지 임시값**(주석: "임시 아이콘 (추후 이미지로 교체)"). 색은 `--fx-color`(styles.css, 컷인과 칩·pill이 같은 팔레트)가 확정값.

| key | 라벨 | 임시 이모지 | 확정 색 | 파일명 (17 §12.3 규약) | 사용처 |
| --- | --- | --- | --- | --- | --- |
| `scoring` | 점수 | 💰 | `#FFD76A` | `augcat-scoring-{16\|32\|256}.svg` | 이름표 pill 16px / 드래프트·툴팁 배지 32px / 컷인 엠블럼 256px |
| `info` | 정보 | 👁 | `#4ADCC6` | `augcat-info-…` | 〃 |
| `hand` | 손패 조작 | 🔧 | `#B07EF2` | `augcat-hand-…` | 〃 |
| `shape` | 화료형 | 🧩 | `#FF8F5E` | `augcat-shape-…` | 〃 (2026-07-26 신설 — 분해 규칙·화료 조건을 넓히는 17종) |
| `call` | 후로 | 🀄 | `#3FE08C` | `augcat-call-…` | 〃 |
| `riichi` | 리치 | ⚡ | `#FFA64A` | `augcat-riichi-…` | 〃 |
| `defense` | 수비 | 🛡 | `#6FB6FF` | `augcat-defense-…` | 〃 |
| `disrupt` | 교란 | 🌀 | `#FF6FA8` | `augcat-disrupt-…` | 〃 |
| `etc` | 기타 | ✦ | `#D7C7FF` | `augcat-etc-…` | 〃 |

> 규격: **16px 모노 실루엣**(pill 상시 노출 — 극소 판독성 필수) / 32px 배지 / 256px 컷인. 수묵 피벗 시 "색먹 9색" 후보 — `--fx-color` 값을 그대로 계승.
> ✅ 개발 선행 2건 해소(2026-07-26): ① `.aug-cat-*` CSS 정의 완료(드래프트 칩·pill 아이콘이 계열 색을 입는다) ② 108종 전수 분류 완료(`AugmentDef.category` 필수 필드 + `augment_category.test.ts`가 누락·나태한 `etc`를 막는다). 계열별 분포: 손패23 · 점수18 · 화료형17 · 교란14 · 리치12 · 정보9 · 후로8 · 수비6 · 기타1.

### 4.2 드래프트 (3택 — "게임을 파는 화면", 17 §5.7)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 드래프트 카드 프레임 | 격상 | `DraftOverlay`·`draft: DraftOfferMessage`·`.draft-card`(240~290×300~360, radius 20, 상단 액센트 5px, `card-in` rotateX 등장) | `draft-card-frame@2x.png` (9-slice) | PNG, 290×360 기준 | **단일 프레임 1종**(티어 프레임 금지, §0.4-1). 상태 3종: normal / hover(-12px 부상+광택 스윕) / 잠김(`.draft-cards-locked` opacity .55). 종이 카드+먹선+하드섀도 문법 후보 |
| 카드 일러스트 슬롯 | 신규 | **DOM에 이미지 슬롯 없음**(텍스트만) — 개발 선행 | `aug-{id}-card.png` (조립 산출) | PNG 220×160 내외 | 108종 = **조립 시스템**(카테고리 프레임 9 + 심볼 40~50 + 조합 규칙)으로 납품 |
| 카드 뒷면 | 신규 | 등장 연출용(현재 rotateX 슬라이드뿐) | `draft-card-back@2x.png` | PNG | 뒤집기 연출 대비 |
| 액티브 배지 | 격상 | `isActiveAugment()`(62종) → `.aug-active-badge` "⚡ 액티브" | `badge-active.svg` | SVG | 번개 모티프. `.draft-active-note` 문구와 세트 |
| 스테이지 라벨 | 기존 | `DraftStage = "gameStart"\|"eastThird"\|"eastFourth"\|"southEntry"\|"southThird"` → `.draft-stage` | — | — | 스테이지별 문구는 `DRAFT_STAGE_HEADLINE`(App.tsx). 동풍전 3회·반장전 4회 |
| 타이틀 | 격상 | `.draft-title` "증강 선택"(`#ffd76a`+glow) | `calli-draft-title.png` | PNG/SVG | §6.4 캘리그래피 세트에 포함 |

### 4.3 인게임 보유/상태 표시

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 증강 pill (이름표 내) | 격상 | `player.augments[]` → `.aug-pill`(12px, 보라 pill) + `AugCatIcon` | `aug-pill-bg@2x.png` (9-slice) | PNG | 17 C-34. 최대 3~4슬롯(동풍전 3회·반장전 4회 드래프트, 도박사 계열이면 그 이상 — flex-wrap). **빈 슬롯 표시 없음** — 슬롯 프레임 개념 도입 검토 |
| 증강 툴팁 | 격상 | `.aug-tip` — 상/하 × 좌/중/우 **6배치**, max-width 240 | `tooltip-frame@2x.png` (9-slice+꼬리) | PNG | 17 C-35. 현재 꼬리 없음. `.wait-tip`(적색)과 톤 분열 — 통합 툴팁 시스템(§5.3) |
| **상태 뱃지 19종** | 격상 | `ActiveInfoBadges`(`.ai-badge`) + `AugmentInfoPanel`(`.ainfo-tag`, 변형: 기본 보라/`-seal` 적/`-peek` 청) | `augstate-{뒷도라\|영상패\|복수\|표적\|덤터기\|판돈\|스파이\|일확천금\|업보\|대기만성\|가불\|만년오야\|리치봉인\|이중선언\|가져온패\|안개바닥\|역만방어\|왕패교환\|본장사냥꾼\|격}.svg` | SVG 16~20px | 17 D-1. 현재 이모지(🎲🕵️💰⚖️🌸😈👑🔒🔮🌫🛡🏯🔥). 배경 2톤: 정보급/경고급 |
| 액티브 증강 버튼 | 격상 | `ActiveAugmentControl` → `.aug-btn` "✦ 액티브 증강 (N)" / `.aug-btn-on`(보라 그라디언트+`turn-pulse`) / `:disabled` | `btn-aug-{normal\|on\|disabled}@2x.png` | PNG 9-slice | §5.1 버튼 시스템의 보라 톤과 통일 |
| 발동 메뉴 | 격상 | `.aug-menu` 드롭다운 + `.aug-menu-item`(이름+`act-target`+미니 타일) | `panel-menu@2x.png` | PNG 9-slice | max-height min(60vh,420px) 스크롤 |

### 4.4 선택 모달군 (`.rinshan-pick-overlay` 계열 — 9종 유효)

`MODAL_PICK_TYPES = { mono_world(단색 세계), dw_swap(왕패의 주인·2단계), red_touch(붉은 손길), ura_swap(이면투시) }` + arm 후속 모달(`armSub` 패 변형), 등가교환(swap3), 미래를 보는 자, 영상패 선택, 예지(드래그 재배열 — 모달 규약 제외·전용 흐름). **포탈 규약**: `createPortal(document.body)` 필수(App.tsx:6781 주석).

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 모달 패널 프레임 | 격상 | `.rinshan-pick-panel` — 금빛 그라디언트+금테, max `min(94vw,900px)` | `modal-pick-frame@2x.png` (9-slice) | PNG | 17 C-41. 두루마리/장지 모티프 — 수묵 피벗과 정합 |
| 선택 타일 셀 | 격상 | `.rinshan-pick-tile`/`.aug-pick-tile` — 88px 고정 컬럼, 선택됨 `-on`(청록), `:disabled` | `modal-tile-cell-{3상태}@2x.png` | PNG | 17 C-42. 타일 `scale(1.3)` 확대 사용 — 패 @2x 필수 |
| 왕패 슬롯 색 4종+범례 | 격상 | `deadWallSlotInfo()` → `.rinshan-slot-{rinshan\|dora\|dora-open\|ura}` (`#8fe9b8`/`#ffd98c`/glow/`#cfa9ff`) + `.rinshan-legend` | `deadwall-slot-{4종}@2x.png` | PNG | 17 C-43. 영상=초록/도라=금/공개도라=금 glow/뒷도라=보라 |
| 변환 표시 | 격상 | `.aug-morph` + `.aug-morph-arrow` "→" 텍스트 | `icon-morph-arrow.svg` | SVG | 17 C-44. 전→후 패 변형 |
| 예지 재배열 UI | 격상 | `foresightArr`·HTML5 DnD·`.foresight-{cell\|mine\|dragging\|confirm}`·`DRAW_ORDER_LABELS=["하가","대면","상가","나"]` | `foresight-slot@2x.png` + `icon-star-mine.svg` | PNG | 4칸 드롭 슬롯+자리 라벨+내 쯔모(★) 강조+드래그 고스트. **UI 백로그(재설계 예정)** — 착수 전 기획 확인 |
| 모달 타이틀 아이콘 | 격상 | 타이틀 이모지 🎨🔮🔴🤫🏯🔄 하드코딩 | `icon-modal-{6종}.svg` | SVG | §6.6 교체표에 포함 |

### 4.5 무장(ARM) 모드 — 실물 클릭 발동

`type ArmMode = "hand"|"opp"|"own-river"|"opp-river"|"any-river"|"swap3"` (App.tsx:421-467) + `armPromptText`(6종 안내문) + `SelectionContext`(A:729).

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 무장 힌트 바 | 격상 | `.arm-hint`(+`.arm-swap`) "✦ {증강명} — {안내}" + `.arm-hint-cancel` | `armbar-frame@2x.png` | PNG 9-slice | 17 C-40. 보라 톤 |
| 클릭 타깃 하이라이트 | 격상 | `.hand-armable` / `.rt-armable` / `.opp-armable`+`.opp-arm-tag`("✦ 여기 클릭" 텍스트) | `tile-fx-armable@2x.png` + `marker-target@2x.png` | PNG | 17 E-25 표적 마커. 손패/바닥/상대 3종. 비대상 디밍(`.hand-dimmed`)과 세트 |

### 4.6 발동 연출 (컷인·피격 — §6.1과 연동)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 증강 컷인 프리미티브 | 격상 | `.cutin-aug` 모디파이어 — `.cutin-bolt`×2(대각 섬광)+`.cutin-scan`(스캔라인)+빠른 밴드(`cutin-band-fast .18s`) | `fx-bolt.png` `fx-scanline.png` | PNG/스프라이트 | 17 E-6/E-7. 규약: **"번개가 스치듯" 150~300ms, shake 금지**(후로=타격과 계열 분리) |
| 카테고리 컷인 엠블럼 | 신규 | `data-aug-cat` + `.cutin-aug-icon`(이모지) | `augcat-{8종}-256.svg` | SVG/PNG 256~512 | §4.1과 동일 소스. 개별 108종 대신 카테고리 8종 |
| 전용 톤 2종 | 기존 | `.cutin-grave`(`#c69c4a`, `grave-rise` 세피아) / `.cutin-spy`(`#4adcc6`, `spy-scan`) | `cutin-grave@2x.png` `cutin-spy@2x.png` | PNG | 무덤 도굴·스파이 — 유이한 전용 연출. 강화 방향은 17 §11 참조 |
| **피격자 전면 컷인** | 격상 | `rank_gate` 1종만 구현(모범 사례, A:2350-2364) — 지목형 12종 미구현 | `cutin-victim-frame@2x.png` | PNG | 17 E-22. "당했다" 전용 프레임 |
| **지목 관계선** | 신규 | 지목자↔피격자 연결 시각 **전무** | `fx-link-{beam\|chain\|tendril\|target}.png` | 스프라이트 | 17 E-23. 빔/사슬/촉수/표적선 4종 |
| 발동 사운드 | 기존 | `sfx.augment(weight)`(큰 북 "둥") `sfx.augmentSoft()`(작은 북) — 합성 | `sfx-augment-{heavy\|light\|soft}.ogg` | OGG/WAV | §6.5. 실물 북 녹음 대체 후보 |

### 4.7 도감 (CodexScreen)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 도감 카드 프레임 | 격상 | `.codex-card`(border-left 3px가 전부) / 잠김 `.codex-card-locked`(opacity+desaturate) | `codex-card-{normal\|locked}@2x.png` | PNG 9-slice | 17 C-11/C-12. 잠김은 **실루엣+자물쇠+노이즈**로 격상 |
| 도감 썸네일 | 신규 | **DOM에 이미지 슬롯 없음** — 개발 선행 | `aug-{id}-thumb.png` (조립 산출) | PNG 96~128 정방 | 108종 조립 시스템 산출물 |
| 수집 요소 | 격상 | `.codex-check` "✓" 텍스트 · `.codex-collect-badge` "N/108종 수집" · "증강 장인 👑" | `icon-check.svg` `gauge-collect@2x.png` `icon-crown.svg` | SVG/PNG | 17 C-13/C-5/C-9 |
| 배지 | 격상 | `codexBadges()` → 등장 스테이지·모드 전용 텍스트 배지 | `badge-stage-{3종}.svg` `badge-mode-{2종}.svg` | SVG | 17 C-14 |
| 상세 오버레이 | 격상 | `.codex-detail` + `.codex-para`(AugmentDef.detail 문단) | `codex-detail-frame@2x.png` | PNG 9-slice | 17 C-15 |

### 4.8 구조 결손 (에셋 발주 전 개발 결정 필요)

1. **이벤트 로그 부재** — 증강 발동이 1.6~2.4초 컷인+상시 배지로만 지나가고 되짚을 UI가 없음. 도입 시 로그 패널 프레임 발주 추가.
2. 드래프트/도감 카드에 **이미지 슬롯 DOM 없음** — 아트 납품 전에 슬롯 추가.
3. `etc` 폴백 다수(§4.1) 재분류 + `.aug-cat-*` CSS 정의.
4. 리롤 기능 없음 — 기획 도입 시 UI 동시 발주.
5. 고아 CSS 정리: `.tier-silver/gold`, `.aug-tier-*`, `.codex-filter-silver/gold/prism` 등 티어 잔재 다수(카테고리 필터로 재활용 후보).

---

## 5. 액션 버튼 및 하단 토글

- 참조 파일/코드: `App.tsx:7160 ActionBar` · `123 ACTION_LABEL`(~90종) · `274 AUGMENT_ACTION_TYPES` · `7223 ActionTiles`, `4245 QuickToggles` · `4277 SettingsPanel` · `683 interface Settings`(localStorage `majak.settings`)

### 5.1 액션 버튼 (마작 UI의 얼굴 — 17 C-31)

톤 결정: `o.type==="win"→act-win`, `"pass"→act-pass`, 증강→`act-aug`, 그 외 후로→`act-call` (A:7200-7207). **현재 상태는 hover(scale 1.07) 하나뿐 — active/disabled/focus 전무.**

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 론/쯔모 버튼 | 격상 | `type:"win"` → `.act.act-win` — `linear-gradient(#ff8c5f→#d84b2f)` (라벨: 내 턴="쯔모", 아니면 "론") | `btn-win-{normal\|hover\|pressed\|disabled}@2x.png` | PNG 9-slice, 텍스트 별도 | **6톤 × 4상태 + focus 링**. 21px/800 한글 조판, 최소 터치 44px. 눌림 깊이·사운드 싱크 스펙 포함 |
| 리치 버튼 | 격상 | `.act-riichi` — `#ff6f7d→#c22a44` → 누르면 2단계(`riichiMode`: `.action-hint` "리치할 패를 선택하세요" + `.act-cancel`) | `btn-riichi-…` | 〃 | 리치 모드 안내 바(17 C-32) 포함 |
| 치/펑/깡 버튼 | 격상 | `.act-call` — `#4f8fce→#2d5f96`. 라벨 "치/펑/깡/안깡/가깡/구종구패" | `btn-call-…` | 〃 | ⚠ **치 변형 선택 UI 공백**: 후보가 동일 라벨 버튼 N개로 나열, 구분은 버튼 속 미니 타일(`ActionTiles`)뿐. 적도라 포함/제외 조합 구분자 디자인 필요 |
| 패스 버튼 | 격상 | `.act-pass` — `#5a6b7a→#3a4854` | `btn-pass-…` | 〃 | 시각 무게 최저 |
| 취소 버튼 | 격상 | `.act-cancel` (pass와 동일 색) | `btn-cancel-…` | 〃 | |
| 증강 액션 버튼 | 격상 | `.act-aug` — `#8f5fd6→#5f3496` (+`.aug-btn` §4.3) | `btn-aug-…` | 〃 | 보라 톤 |
| 액션 바 컨테이너 | 격상 | `.action-bar` — 남색 반투명+금테, radius 14 | `actionbar-frame@2x.png` | PNG 9-slice | 프롬프트 SFX(`sfx.callPrompt` "삑")에 대응하는 **시각 큐**(사운드 OFF 유저용) 추가 |
| 키보드 단축키 | 신규 | **전무** (전역 keydown 0건) | — (스펙 문서) | — | 도입 시 버튼에 키 힌트 표기 슬롯 |

### 5.2 토글·설정 컨트롤

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 퀵토글 4종 (좌하단) | 격상 | `Settings.autoSort/autoWin/autoNoMeld/autoDiscard` → `QuickToggles` `.qt-item`(+`.qt-on` 호박색)+`.qt-dot`(LED 11px) | `qt-chip-{off\|on}@2x.png` + `icon-{sort\|autowin\|nomeld\|autodiscard}.svg` | PNG+SVG | 17 C-25. 라벨: 자동정렬/자동화료/후로없음/자동버림. ON=`#ffbe4d` LED glow. 툴팁이 네이티브 `title`뿐 — §5.3 통합 |
| 설정 토글 스위치 | 격상 | `.toggle`(52×29)+`.toggle-knob` / ON `linear-gradient(#61c880→#3d9a5c)` — 8행: +`showMyWaits/doraFx/screenFx/sfxOn` | `toggle-{off\|on\|disabled}@2x.png` | PNG | 17 C-26. ⚠ 퀵토글(호박)과 설정 토글(녹색)이 **같은 개념 다른 색** — 통일 결정 |
| 볼륨 슬라이더 2종 | 격상 | `bgmVolume`(.35)/`riichiBgmVolume`(.5) — 네이티브 `<input range>`+`accent-color`뿐 | `slider-track@2x.png` `slider-thumb@2x.png` | PNG | 17 C-27. OS마다 다르게 보이는 실사용 품질 저하 지점. ⚠ **효과음 볼륨 슬라이더 없음**(sfxOn 토글뿐) — 추가 검토 |
| 체크박스 | 격상 | `.codex-only` — 완전 네이티브 | `checkbox-{off\|on}.svg` | SVG | 도감 "수집한 것만" |
| 설정 아이콘 8종 | 신규 | 행에 아이콘 없음(텍스트만) | `icon-setting-{8종}.svg` | SVG 24px | 17 C-28 |

### 5.3 공통 컨트롤 시스템 (전 화면)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 버튼 시스템 | 격상 | 개별 버튼 클래스 **32종 난립**(`.lobby-join` `.wr-btn` `.home-create` `.icon-btn`…) — 공용 `.btn` 없음 | `btn-{primary\|secondary\|danger\|ghost}-{4상태}@2x.png` | PNG 9-slice | 17 C-63. 주(금 `#e7c470→#c39a3e`)/보조/위험(적)/고스트 × normal/hover/pressed/disabled. ⚠ `.lobby-join:disabled` 등 disabled 스타일 미정의 다수 |
| 입력 필드 | 격상 | `.lobby-card input`(`#0e2237`/`#34506b`) 외 4종 각기 다른 radius — `:focus`/`::placeholder`/error **전무** | `input-{normal\|focus\|error}@2x.png` | PNG 9-slice | 포커스 링 토큰 포함(접근성, 17 F-10) |
| 툴팁 통합 | 격상 | 3계층 분열: 네이티브 `title` 40곳+ / `.aug-tip`(보라) / `.wait-tip`(적+CSS 삼각 꼬리) | `tooltip-frame@2x.png` + 꼬리 6방향 | PNG 9-slice | 17 C-35. 모바일 롱프레스 대응 스펙 |
| 스크롤바 | 격상 | 커스텀 **0건** — 10곳 이상 OS 기본 | — (CSS 스펙) | — | 슬림 다크 트랙/썸 스펙 제출(17 F-9) |
| 모달 공통 | 격상 | `.overlay`(z50)/`.result-overlay`(z55)/`.rinshan-pick-overlay`(z120) 배경 3종 | `modal-dim.png`(선택) | — | 17 C-62. 암전+블러 값 통일 |
| 확인 다이얼로그 | 신규 | 계정 삭제가 `window.confirm()` 네이티브 | `modal-confirm-frame@2x.png` | PNG 9-slice | 프로덕트 톤 확인 모달 |
| 로비/홈/대기실 프레임 | 격상 | `.lobby-card` `.home-card` `.waitroom-card` `.waitroom-code`(dashed 금테) `.mode-btn`(반장/동풍) `.badge-{host\|ready\|wait}` `.seat-*` | `card-frame@2x.png`(공용 9-slice) + `icon-mode-{hanchan\|tonpuu}.svg` + `badge-{3종}.svg` | PNG/SVG | 17 C-1/C-17~C-22. ⚠ `.mode-btn:disabled`가 커서만 변함(비방장에게 조작 불가가 안 보임) — disabled 시각 필수. 순위칩 1~4위(17 C-4): 현재 `.rank-1`/`.replay-rank-1·2`만 존재, **3·4위 스타일 부재** |

---

## 6. 게임 연출 및 기타 누락 UI 에셋 (전체 리뉴얼 필수 항목)

- 참조 파일/코드: `App.tsx:891 Production`(연출 큐) · `1472 showCutIn` · `2530 리치` · `7415 RoundResultPanel` · `7676 GameOverModal` · `7373 CountUpPoints`, `sfx.ts` 전체, `styles.css` @keyframes 67종, `index.html`

### 6.1 컷인/배너 톤 시스템 (색은 코드 확정값 — `--fx-color`)

`type CutInTone = "tsumo"|"ron"|"yakuman"|"limit"|"draw"|"augment"|"chi"|"pon"|"kan"|"grave"|"spy"` + `data-tier`(mangan/haneman/baiman/sanbaiman).

| tone | `--fx-color` | 대상 에셋 (17 E-3) |
| --- | --- | --- |
| ron `#FF4A5E` / tsumo `#59AAFF` / yakuman `#FFD76A` / limit `#FFCF6A` / chi `#3FE08C` / pon `#55A4FF` / kan `#B07EF2` / draw(회청) / grave `#C69C4A` / spy `#4ADCC6` / augment(카테고리 8색 §4.1) | 좌 참조 | `cutin-band-{tone}@2x.png` 11종 + 만관 4단 변형 |

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 컷인 레이어 | 격상 | `.cutin-rays`(회전 광선)/`.cutin-ring`(충격파, 역만 2중)/`.cutin-flash`/`CutInBurst` 파티클(사각 div 16~40개)/`YakumanConfetti`(4색 사각) | `fx-rays.png` `fx-ring.png` `fx-particle-{금박\|유리\|불꽃}.png` `fx-confetti-{4색}.png` | 스프라이트시트+JSON | 17 E-4/5/8/9/10. 파티클 수 `BURST_COUNT`(A:995) 기준. reduced-motion 시 전부 display:none — 정지 대체 불필요 |
| 배너 8톤 | 격상 | `.banner-{riichi\|win\|draw\|info\|chi\|pon\|kan\|seal}` 그라디언트 띠 | `banner-{8톤}@2x.png` | PNG | 17 E-1. 상단 리본 |
| 화면 흔들림 | 기존 | `data-shake 1~4`·`SHAKE_MS={180,300,420,620}`·임팩트 지연 230/180ms | — (모션 스펙) | — | 에셋 없음 — 신규 연출도 이 타이밍 그리드 준수 |

### 6.2 리치 풀 연출 (CSS 밀도 최고 지점 — 17 §7.3)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 리치 스테이지 | 격상 | `.riichi-stage`(z60, ttl 1500ms) = vignette+붉은 밴드(`skewY(-2deg)`)+광택 스윕+봉+텍스트+플래시 | `fx-riichi-band@2x.png` `fx-vignette.png` | PNG | 17 E-13/14. 수묵 피벗: **발묵(먹 번짐) 띠** 후보. "추격 리치" 변형 존재 |
| **천점봉 실물** | 격상 | `.riichi-stick`+`.riichi-stick-dot` — CSS 그라디언트 막대(-70vw에서 슬라이드 인) | `stick-1000-large@2x.png` | PNG 460×36 내외 | 17 E-11/A-9. §2 plate-stick·공탁 더미와 동일 디자인 소스 |
| "리치" 글자 | 격상 | `.riichi-text` — 금속 그라디언트 `background-clip:text` | `calli-riichi.png` | PNG/SVG | 17 E-12. 캘리그래피 세트(§6.4) |
| 리치 BGM 연동 | 기존 | `riichiBgm`(4트랙 무작위, 직전 곡 회피)+`bgm` 덕킹 700ms/복귀 1400ms — **연출 표시 순간 시작** | — | — | 사운드-비주얼 싱크 규약. 트랙별 레벨 보정 슬롯 `RIICHI_BGM_GAIN` 존재 |

### 6.3 결과·정산 화면

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 화료 결과 패널 | 격상 | `RoundResultPanel`·`roundResult: RoundOverMessage`·`.result-win` grid·5초 자동닫힘(**무표시**) | `result-frame@2x.png` (9-slice) | PNG | 17 C-46. 족자/두루마리. 자동닫힘 진행 링 추가 |
| "화 료/유 국" 타이틀 | 격상 | `.result-title`(`#ffd76a`, letter-spacing 10px) | `calli-{horyo\|ryukyoku\|abort}.png` | PNG/SVG | 17 C-47. 캘리그래피 |
| **역 스탬프(낙관)** | 격상 | `.result-yaku`+`yaku-stamp` keyframe(90ms 스태거)+`sfx.yakuSteps` 펜타토닉 — 사각 박스뿐 | `stamp-yaku-bg@2x.png` | PNG | 17 C-45. **붉은 전각 도장** — 수묵 피벗 핵심 이식 지점. 증강 유래 역은 보라(`.result-yaku-aug`) 변형 |
| 판수 원형 배지 | 격상 | `.result-han-circle`(`clamp(112~158px)`, 금테 3px)+`.result-han-big`+`.result-fu-sm` | `emblem-han-circle@2x.png` | PNG | 작혼식 원형. 숫자는 §6.4 숫자 세트 |
| 등급 엠블럼 5종 | 신규 | `LIMIT_NAMES`(만관/하네만/배만/삼배만/역만)+`data-tier` | `emblem-{mangan\|haneman\|baiman\|sanbaiman\|yakuman}@2x.png` | PNG | 17 C-49 |
| 화료패 후광·꽃잎 | 격상 | `.result-tile-win`(금테)+`.result-petal`(CSS 도형 12개 낙하) | `fx-tile-halo@2x.png` `fx-petal.png` | PNG | 17 C-48. 꽃잎→먹 번짐/금박 조각 후보 |
| 점수 카운트업 | 기존 | `CountUpPoints`(로그 시간+`sfx.countTick/Done`, 더블론 2번째 뮤트) | `num-score-set` | §6.4 | 슬롯머신 감성 유지 |
| **유국 결과 레이아웃** | 신규 | 유국 시 타이틀+점수증감**만** 렌더 — 텐파이/노텐·손패 공개·유국 사유(구종구패 등)·유국만관 전무 | `result-ryukyoku-layout` (목업) | 1920×1080 목업 | **개발 선행**(§3 텐파이 공개). 4열 손패 공개 레이아웃 |
| 최종 순위 화면 | 격상 | `GameOverModal` — **420px 소형 카드**(국 결과창보다 초라), `.rank-1`만 강조, **우마·오카 미표시**(`RankingEntry.uma/oka` 데이터는 수신 중) | `gameover-layout` (목업) + `medal-{1\|2\|3\|4}@2x.png` | 목업+PNG | 17 C-57/C-58. 재설계 권고: 풀스크린 + 등수 발표 연출 + **소지점→우마→오카→최종 분해 표시**. 부호색 `#8fe3a1`/`#ff8d7e`/`#9db4c8` 유지 |
| 대국 시작 오버레이 | 격상 | `IntroOverlay` "대 국 시 작"+`.intro-line` CSS 선 | `calli-gamestart.png` + 장식 라인 | PNG | 17 E-21 |

### 6.4 폰트 · 커서 · 브랜딩 (기반 인프라)

| 분류 | 구분 | 코드 상 변수/Type/State | 디자이너 전달 파일명 | 추천 포맷/규격 | 비주얼 가이드 & 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **본문 웹폰트** | 격상 | `font-family:"Pretendard",…`(styles.css:12) — **로드 안 됨**(@font-face·link 0건) → OS 폴백 렌더 중 | `Pretendard-Variable.woff2` (서브셋) | WOFF2 가변 1파일 | **최우선 인프라.** weight 400~900 5단 사용 중. 한자(東南西北·役 등) 글리프 포함 서브셋 |
| 점수 숫자 세트 | 신규 | 현재 `font-variant-numeric: tabular-nums` 12곳뿐 | `num-score-{0-9,comma,plus,minus}.png` 또는 전용 폰트 | PNG 시트/WOFF2 | 17 C-60. 대/중/소 3사이즈. 점수판 감성의 핵심 |
| **캘리그래피 11종** | 신규 | 대형 연출 글자가 전부 시스템 고딕+letter-spacing 수동(10~26px) | `calli-{horyo\|ryukyoku\|abort\|riichi\|ron\|tsumo\|yakuman\|chi\|pon\|kan\|gamestart}.png` | PNG/SVG (투명) | 17 §7.4. **손글씨 이미지 — 수묵 피벗의 간판**. 남발 금지(이 11종만) |
| 마우스 커서 | 신규 | `cursor:` 시스템 키워드만(pointer 24곳/grab/not-allowed/help) | `cursor-{default\|pointer\|grab\|grabbing\|denied}.png` | PNG 32px+@2x | 17 F-11 (선택 등급) |
| 로고/워드마크 | 격상 | "이능마작" 텍스트 3곳(`.lobby-title` `.home-logo`) + 상단바 부제 "증강 리치마작" | `logo-{h\|square\|symbol\|mono}.svg` | SVG | 17 G-1. 도감이 로고 슬롯을 제목으로 전용 중 — 락업 규칙 포함 |
| 파비콘/메타 | 신규 | `index.html` 12줄 — icon·OG·theme-color·manifest **전무**, body 배경 미지정(로드 시 **흰 플래시**) | `favicon-{16\|32\|180\|512}.png` + `og-image.png`(1200×630) | PNG | 17 G-2/G-3. 개발: `body{background:#0a1826}` 1줄 선행 |
| 색 토큰 시스템 | 신규 | `:root` 변수 0개 — 전 색상 하드코딩 | `design-tokens.md` (문서) | 문서 | 17 G-6. 디자이너가 `--gold-500` 식 토큰표 제출 → 개발이 일괄 치환 |

### 6.5 사운드 인벤토리 (에셋 요청 리스트 — `sfx.ts`)

**파일 기반 2종뿐**(`/sfx/discard.wav` 83ms, `/sfx/call.wav`) — 나머지 **22종 전부 WebAudio 합성**. BGM 5트랙(mp3 총 ~34MB, 압축 검토). 규약: 잔향 금지, 어택 6ms 페이드, 후로=타악/증강=북(둥) 계열 분리.

| 그룹 | 이벤트(함수) | 현재 | 파일명 제안 |
| --- | --- | --- | --- |
| 타패/조작 | `discard(own)` `hoverTile` `slide` | 파일1+파생 | `sfx-discard.wav` `sfx-hover.wav` `sfx-slide.wav` |
| 후로 | `callChi` `callPon` `callKan` | 합성 클랙 3음색 | `sfx-call-{chi\|pon\|kan}.wav` |
| 리치 | `riichi`(임팩트+금속 링) | 하이브리드 | `sfx-riichi.wav` |
| 화료 | `ron` `tsumo` `yakuman`(공 98Hz 롱테일) `mangan(tier1~4)` `draw` | 합성 | `sfx-{ron\|tsumo\|yakuman\|mangan1-4\|draw}.wav` |
| 증강 | `augment(0\|1)` `augmentSoft` | 합성 북 | `sfx-augment-{heavy\|light\|soft}.wav` |
| UI/진행 | `callPrompt`(삑) `draft` `pick` `round` `score` | 합성 | `sfx-ui-{prompt\|draft\|pick\|round\|score}.wav` |
| 결과창 | `yakuSteps`(펜타토닉 계단) `countTick` `countDone` | 합성 | `sfx-result-{step\|tick\|done}.wav` |
| BGM | `bgm`(BackgroundBGM, 덕킹/정산 홀드) `riichiBgm`(4트랙 로테이션) | mp3 5개 | 유지·마스터링 보정(`RIICHI_BGM_GAIN`) |
| 부재 | 보이스(리치/론/쯔모/치/펑/깡 발성) · 로비 BGM · 효과음 볼륨 슬라이더 | — | 도입 여부 기획 결정 |

### 6.6 이모지 → 아이콘 교체표 (일괄)

| 사용처 | 현재 이모지 | 파일명 |
| --- | --- | --- |
| 시스템(설정/닫기/새로고침/복사/추가) | ⚙ ✕ ↻ ⟲ 📋 ＋ | `icon-{gear\|close\|refresh\|reset\|copy\|plus}.svg` |
| 리플레이 트랜스포트 | ⏮ ◀ ▶ ⏸ ⏭ | `icon-rp-{first\|prev\|play\|pause\|next}.svg` |
| 상태/장식 | 👑 🔒 ⚠ ✓ ✦ 👁 ⏳ ⟳ 🎲 📖 🧪 🀄 🌫 → | `icon-{crown\|lock\|warn\|check\|spark\|eye\|hourglass\|spin\|dice\|book\|flask\|tile\|fog\|arrow}.svg` |
| 증강 카테고리 8종 | 💰 👁 🔧 🀄 ⚡ 🛡 🌀 ✦ | `augcat-*`(§4.1) |
| 상태 뱃지 19종 | 🎲🕵️💰⚖️🌸😈👑🔒🔮🌫🛡🏯🔥 등 | `augstate-*`(§4.3) |
| 모달 타이틀 6종 | 🎨 🔮 🔴 🤫 🏯 🔄 | `icon-modal-*`(§4.4) |

> 규격: 24px 그리드, 선 굵기 1.5px, 단색(currentColor). 범용형은 무료 아이콘(Lucide 등)으로 대체 가능(17 §2) — **마작 고유·증강 계열만 커스텀**.

---

## 7. 웹 게임 디자이너 전달 시 핵심 체크리스트

**① 파일명·포맷**
- 마작패·증강 id는 **코드 참조명 그대로**(변경 불가): `1s.png`, `0m.png`, `aug-{snake_case_id}-*`. 그 외 `{영역}-{요소}-{상태}@2x.png`, 카테고리는 `augcat-{key}-{16|32|256}.svg`.
- 정적 UI(프레임·아이콘) = **SVG 원본 + PNG @1x/@2x**. 사진질 배경 = **WebP**(PNG 폴백). 애니메이션 = **스프라이트 시트 + JSON**(또는 APNG/WebP), Lottie는 사전 협의.

**② 캔버스·해상도**
- 기준 목업 **1920×1080 다크**(#0A1826 위 검수, 흰 배경 목업 금지). 보드는 900×900 정사각(중심 y=46%), 컷인은 풀블리드+안전여백 10%.
- `vmin` 비례 스케일 시스템이므로 **고정 px 의존 금지** — 9-slice/타일링 가능 구조로. 900px 브레이크(보드 560px)와 모바일 축소를 함께 검수.

**③ 스프라이트 시트 사용 기준**
- 다프레임 연출(먼지 링·파티클·모프·관계선)만 시트로. 상시 UI는 개별 파일. 시트는 **한 변 ≤2048px**, 프레임 좌표 JSON 동봉.

**④ 최소 크기 검수(가장 중요)**
- 마작패는 **17px 폭 축소 스크린샷 선검수**(1s~9s와 1m~9m 구분). 카테고리 아이콘은 16px 모노에서 8종이 서로 구분돼야 함. 상태 뱃지·pill 아이콘도 동일.

**⑤ 상태 세트 누락 금지**
- 버튼 4상태(normal/hover/pressed/disabled)+focus 링, 토글 on/off/disabled, 카드 normal/hover/잠김, 타이머 normal/urgent. **현재 코드가 hover만 갖고 있으므로 "상태가 곧 신규 작업량"이다.**
- 모든 발광/맥동 에셋은 `prefers-reduced-motion`용 **정지 프레임(가장 밝은 상태)** 1장 동봉.

**⑥ 모션·톤 규약(고정)**
- 후로/타패 = **타격**(80~200ms, 스쿼시·먼지) / 증강 = **초자연**(150~300ms, 섬광 스침, **shake 금지**) / 화료 = **의식**(600~2000ms, 암전→캘리그래피→도장→숫자) / UI 전환 = 무감정 120~180ms.
- 평시 채도 높은 색은 금색뿐, 증강 발동 순간에만 카테고리 8색 폭발. 흰 패가 화면 최고 밝기.

**⑦ 색·토큰**
- 팔레트 앵커(코드 실측): 금 `#FFD76A/#E7C470/#D6B25E` · 배경 `#0A1826~#12283F` · 패 몸통 `#F8F5EC` · **뒷면 심록 `#1E4034`** · 양수 `#8FE3A1`/음수 `#FF8D7E` · 컷인 톤 §6.1 · 카테고리 §4.1.
- 납품 시 **컬러 토큰표**(`--gold-500` 식)와 radius/그림자/간격 스케일 문서를 함께 제출(현재 코드에 토큰이 전무해 디자이너 안이 곧 표준이 된다).

**⑧ 우선순위(17 §13 갱신)**
- **P0**: 패 뒷면(심록)+두께 4변형+앞면 37종 재제작 / 작탁 배경 / 중앙 패널 / 방위·오야 마커 / 웹폰트 로드 / 파비콘·body 배경(흰 플래시 제거).
- **P1**: 카테고리 8종×3사이즈 + 조립 시스템(108종·증가 추세) / 드래프트 카드 / 액션 버튼 6톤×4상태 / 상태 뱃지 19종.
- **P2**: 리치 풀연출(천점봉·발묵 띠·캘리그래피 11종) / 결과창(낙관 스탬프·등급 엠블럼) / 컷인 프리미티브.
- **P3+**: 화면별 목업 / 장식 시스템 / 아바타 문장 / 사운드 실물화 / 지목 관계선.

**⑨ 저작권**
- 기존 마작 세트(작혼·천봉 등) 트레이스·파생 절대 금지, 재산권 양도+2차 수정권, 폰트·텍스처 상업 라이선스 목록, AI 생성물 사전 고지 (17 §12.1).

---

*본 문서는 코드 스냅샷(2026-07-25, 57차) 기준. 증강 수(108종)·상태 뱃지 수·카테고리 매핑은 콘텐츠 추가마다 변하므로, 발주 확정 직전 `content/src/index.ts`·`App.tsx AUGMENT_CATEGORY` 재검증 필수.*
