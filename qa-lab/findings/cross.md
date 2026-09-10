# 시스템 횡단 (드래프트 · 동풍전 · 국 경계 상태 · 종료 판정 · 결정론) — 게임 전체를 감사하는 사람

## 요약

- **완주시킨 실제 대국 520판** — 전부 `presetAugments` 없이 **실제 드래프트**(`draftSchedules`)로 돌렸다.
  - 대량 감사 336판(반장전/동풍전 50:50, 페르소나 6종 무작위 조합) + 추가 90판 + 결정론 쌍 42×2판 + 파일럿 10판.
- **드래프트만 3,000회** 시뮬(`draft_sim.ts`, 1,500시드 × 2모드) — 국을 치지 않고 스테이지 4~3회를 전부 밟는다.
- **재설치(리플레이·이어하기) 순서 비교 600게임**(`rebuild_order.ts`).
- 증강 커버리지: 카탈로그 117종 **전부** 최소 1회 제시됨(모드 필터로 갈린 `late_bloomer_east`/`late_bloomer` 포함).
- **확정 3건 · 의심 3건.**

**크래시 0 · 훅 예외(effectErrors) 0 · 패 중복 0 · 왕패 초과 0 · 손패 장수 이상 0 · 공탁/본장 음수 0.**
점수 총합 드리프트는 전부 뱅크 발행 증강에 근거(augPoints/reason)가 붙어 있어 score 도메인에 넘긴다.

### 이미 다른 보고서에 있는 것 (중복 회피)
- 수상한 주사위가 **"게임 시작 드래프트 전용" 증강을 늦은 스테이지에 뿌리는 것**은
  `findings/disrupt-b.md` 확정 1과 같은 건이다. 내 대량 실행에서도 실제 드래프트로 2건 재현됐다
  (`seed=3408 hanchan` p1이 남1국 진입 드래프트에서 `devils_advance` → 그 국에 **+10,000 총합 드리프트**,
  `seed=3336 hanchan` p3가 남3국에서 `late_bloomer`). 여기서는 **재확인만** 하고 다시 세지 않는다.

---

## 확정 1. 🟠 드래프트 — **한 게임에 같은 증강을 두 사람이 보유한다** (정식 드래프트 경로, 사전 지급 아님)

- 위치: 불변식 선언 `packages/core/src/augment/DraftController.ts:1-30` /
  스테이지 진행 `packages/core/src/match/HanchanController.ts:1099-1162` (오퍼 추첨 → 전원 응답 → **고정 순서로 pick 적용**) /
  지급 `packages/core/src/augment/Augment.ts:472-515` (`grantAugments`) /
  지급 호출부 `packages/content/src/augments/cornucopia.ts:59-73`.
- 기대: `DraftController` 머리말이 못 박은 불변식 — *"② 스테이지가 열린 시점에 누가 보유한 증강은
  아무에게도 다시 제시하지 않는다 — **한 게임에 같은 증강을 둘이 갖는 일이 없다**"*.
  코어의 `grantAugments`도 같은 이유로 `heldByAnyone`을 걸어 둔다 —
  *"중복이 성립하면 보유자 전용 채널(잔량·쿨다운)이 좌석을 구분하지 못해, 이름표 pill에 남의 값이 내 값으로 찍히기도 했다"*(`Augment.ts:480-488`).
- 실제: **수상한 주사위(cornucopia)를 집은 좌석이 같은 스테이지에서 남이 이미 고른 카드를 지급받는다.**
  - 한 스테이지의 진행은 (전원 오퍼 추첨 → 전원 응답 → **고정 좌석 순서로 pick 적용**)이다.
  - p0가 cornucopia를 픽하는 순간 지급이 즉시 일어나는데, 그 시점에 p3의 픽은 **아직 적용 전**이라
    `heldByAnyone`에 없다. 곧바로 p3의 픽이 적용되면서 같은 증강이 두 사람 손에 남는다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/cross/repro_dup_live.ts 3443 tonpuu`
  (실제 대국, 페르소나 무작위, preset 없음)
  ```
  --- gameStart @1-1-0
     offer p0: die_hard, spy, cornucopia
     offer p3: discard_lock, time_stop, honba_hunter
     held: {"p0":["cornucopia","discard_lock","bluff_pretense"], … ,"p3":["discard_lock"]}
  >>> DUP_GAME: discard_lock = p0 + p3
  ```
  빈도: 완주 대국 336판 중 1판, 드래프트 전용 시뮬 3,000판 중 **12판(0.4%)**
  (`tsx qa-lab/cross/draft_sim.ts 1500` — 12건 **전부** cornucopia 보유 좌석이 낀 게임).
  겹친 증강 예: `discard_lock` `tanyao_break` `parasite` `counter` `peek_riichi_waits` `honor_return`.
- 영향: 설계가 명시적으로 금지한 상태가 정식 경로로 성립한다. 코어 주석이 적어 둔 부작용
  (보유자 전용 채널·이름표 pill 혼선)이 그대로 재개통되고, "한 판에 한 명만 가진다"는
  드래프트 다양성 설계가 무너진다.
- `findings/disrupt-b.md` **의심 2**는 같은 현상을 사전 지급(`installPreset`) 한정으로 보고하며
  *"정식 드래프트는 한 장씩 순차 확정이라 재현되지 않는다"*고 적었다 — **그 판단은 틀렸다.**
  정식 드래프트도 "전원 오퍼 → 전원 응답 → 순차 적용"이라 같은 창이 열린다.

---

## 확정 2. 🟠 리플레이/이어하기 — cornucopia가 낀 게임은 **증강 재설치 순서가 원본과 달라진다**

- 위치: `packages/core/src/augment/DraftController.ts:415-444` (`rebuildAugments`),
  소비처 `packages/server/src/ReplayReader.ts:135-140, 266-270`.
- 기대: `rebuildAugments`의 주석이 이 함수의 존재 이유를 직접 적어 둔다 —
  *"설치 순서를 원본 드래프트와 같은 모양으로 맞춘다. … 등록 순서(seq)가 달라졌고, seq에 기대는
  동률 훅의 결과가 뒤집혔다 — 즉 **이어하기·리플레이가 원본과 다른 점수를 낼 수 있었다**(docs/25 P6)."*
- 실제: 그 정렬은 **`player.augments`의 인덱스 = 드래프트 스테이지**라는 전제 위에 서 있는데,
  수상한 주사위가 한 스테이지에 3장을 밀어 넣으면 그 대응이 깨진다. 게다가 원본에서는
  지급분이 **cornucopia 자신보다 먼저** 등록된다(`grantAugments`가 `install()` 안에서 즉시 설치하고,
  cornucopia 자신의 `ctx.reaction`은 그 뒤에 등록된다).
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/cross/rebuild_order.ts 300`
  ```
  300 seeds × 2 모드 = 600 게임
  cornucopia 등장 76, 설치 순서 불일치 75
  hanchan seed=700005
    원본:   aug:p0:brief_fog aug:p0:last_stand aug:p0:cornucopia aug:p1:picky_eater …
    재설치: aug:p0:cornucopia aug:p1:picky_eater aug:p2:suit_unify aug:p3:alchemist aug:p0:brief_fog …
  ```
  cornucopia가 **없는** 524게임은 불일치 0건 — 원인이 이 한 증강으로 특정된다.
- 영향: 서버 재시작 후 `resume`·리플레이 재구성이 원본과 **다른 훅 실행 순서**로 이어진다.
  점수가 실제로 갈리는지는 여기서 끝까지 몰지 못했으나(그 자체가 별도 재현이 필요하다),
  "순서를 맞추는 것"이 이 코드의 유일한 목적이고 그 목적이 76판 중 75판에서 달성되지 않는다.

---

## 확정 3. 🟡 국 경계 — 국 번호를 이름에 박은 `augmentData` 키가 **아무도 지우지 않아 매치 내내 쌓인다**

- 위치: `packages/core/src/engine/state/GameState.ts:218-238` (`ROUND_SCOPED_MARK` / `isRoundScopedKey`),
  정리는 `:592-598` (`setupRound`).
- 기대: 국 스코프 상태는 국 경계에서 정리된다. 엔진은 `#round` 표식이 붙은 키만 지운다.
- 실제: 다수 증강이 표식 대신 **키 이름에 `장-국-본장`을 박아** 자동 만료를 흉내 낸다
  (`future_sight:stacks:2-1-4:p0`, `spy:marked:3-1-8:p2`, `hidden_river:fog:1-1-0:p0`,
  `cliff_bloom:kans:2-3-6:p2`, `pond_snatch:taken:1-2-1:p1`, `suit_unify:unified:2-4-7:p3` …).
  이런 키는 **읽히지 않게 될 뿐 지워지지 않는다** — `augmentData`가 국마다 단조 증가한다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/cross/keygrowth.ts 7 hanchan`
  ```
  R1 1-1-0  keys=10 (+10/-0)   R5  2-1-4  keys=43 (+16/-0)
  R8 2-4-7  keys=71 (+9/-0)    R12 3-4-11 keys=94 (+5/-0)
  최종 키 102개, 그중 국번호 박힌 것 52개   (12국 동안 삭제된 키는 1개뿐)
  ```
- 영향: 크래시나 오작동은 관측되지 않았다. 다만 `augmentData`는 **DB 스냅샷·리플레이 로그에
  통째로 실리는 상태**라 국 수에 비례해 부풀고, 다음 국에서 "지난 국 키"를 실수로 읽는 버그가
  조용히 살아남을 수 있는 토양이 된다(`findings/score-b.md` 의심 2가 `dora_afterimage` 한 건으로
  같은 형태를 지적했다 — **개별 증강 문제가 아니라 표식 미사용이 전반에 퍼진 패턴**이다).
- 참고: 매치 끝에 `#round` 표식 키 5개가 남아 있지만, 마지막 국 뒤에는 `setupRound`가 돌지
  않으므로 이것은 결함이 아니다.

---

## 확정되지 않은 것 — **깨끗했던 영역** (재현 시도 결과를 남긴다)

### 동풍전(tonpuu)
반장전에서만 검증된 증강이 4국짜리 판에서 깨지는지 168판(대량 336판의 절반) + 드래프트
시뮬 1,500판을 돌렸다. **모드 전용 증강 2종(`late_bloomer`/`late_bloomer_east`)의 필터는
오퍼·보유 양쪽에서 한 번도 새지 않았다**(3,000회 오퍼 중 `MODE` 위반 0). 국 수 기반 쿨다운
(`pseudo_dealer` `even_world` `regret` `invincible` `discard_lock`)은 동풍전에서 발동 횟수가
줄 뿐 계산이 깨지지 않았다. 크래시·소프트락·타임아웃 0건.

### 종료 판정
336+90판에서 종료 사유가 전부 나왔다 — `westEntryDecided` 250 · `normal` 108 · `dobi` 39 ·
`agariYame` 28 · `instantWin` 1. 자동 검사(`auditEnd`)로 확인한 것:
토비 종료인데 마이너스 좌석이 없는 경우 0건, 정규 구간을 다 안 돌고 끝난 경우 0건,
1위가 반환점 미만인데 서입 없이 끝난 경우 0건, `maxWind+2`를 넘겨 끝난 경우 0건.
최장 15국. 무한 연장(오라스 렌짱 소프트락) 0건.

### 드래프트 스케줄
`STAGE_TWICE`(같은 스테이지 2회) 0 · `STAGE_FLAG_MISSING`(완료 플래그 누락) 0 ·
`MISSED_STAGE`(그 국에 도달했는데 드래프트가 안 열림) 0 · `SHORT_OFFER`(3장 미만) 0 ·
`PICK_THROW`("제시된 적 없다" 예외) 0 · `OFFER_HELD_AGAIN` 0 · `CONFLICT_OFFERED` 0 ·
`CONFLICT_HELD` 0 · `STAGE`/`MODE` 오퍼 위반 0 (3,000회 드래프트 기준).
좌석 간 **오퍼 겹침도 0건** — 확정 1의 중복은 오퍼가 아니라 **지급**에서 생긴다.
중간 드래프트가 진행 중인 국과 충돌하는 일은 구조적으로 없다: 드래프트는 정산이 끝나고
`sys.startRound` **전에** 열린다(`HanchanController.ts:918-931`).

### 결정론
같은 시드·같은 페르소나로 두 번 돌린 **42쌍 전부** 이벤트 로그 다이제스트·최종 점수·
보유 증강·종료 사유가 완전히 일치했다 (`tsx qa-lab/cross/determinism.ts 14 <seed>`, 3샤드 × 14쌍).
**같은 프로세스 안에서의 비결정성은 발견하지 못했다.** (확정 2는 이것과 다른 축 —
같은 실행이 아니라 *재구성*에서 갈린다.)

---

## 의심 1. 드래프트 좌석 칸의 여유가 13장뿐 — 카탈로그가 조금만 줄면 조용히 중복 방지가 꺼진다

`DraftController.cellFor`는 `pool.length < seats*cellSize + draw`이면 `null`을 돌려주고,
그때 `draw()`는 **`heldByOthers`를 걸지 않는** `rollUniform`으로 떨어진다
(`DraftController.ts:298`, `:330-332`). 지금 값:

```
tsx qa-lab/cross/pool_size.ts
hanchan  gameStart   pool=115 need=102  cell OK
hanchan  eastThird   pool=114 need=102  cell OK   (reload 가 gameStart 제외라 1장 차이)
tonpuu   …           pool=114~115 need=102 cell OK
```

여유가 12~13장이다. 증강을 13종 빼거나 `modes`/`draftStages` 제한을 몇 개 더 걸면
**경고 없이** 전역 균등 추첨으로 내려가고, 그 순간 "같은 스테이지에 두 사람에게 같은 카드"가
정상 경로가 된다. 지금 당장 깨진 것이 아니라 의심으로 둔다.

## 의심 2. 반장전의 **58%가 서입(西入)까지 간다**

336판 중 `westEntryDecided` 199판(59%), 추가 90판 중 51판(57%). 정규 구간(남4국)이 끝난
시점에 1위가 30,000점에 못 미친다는 뜻이다. 증강판의 점수 이동이 생각보다 평평하다는
신호일 수 있으나, 내 페르소나(특히 `folder`)가 화료를 거의 못 하는 봇이라 **하네스 탓일
가능성이 크다**. 사람 대국 통계 없이는 확정할 수 없어 의심으로 둔다.

## 의심 3. 동풍전의 3번째 드래프트(`eastFourth`)는 **마지막 1국짜리**다

`hanchanConfigForMode("tonpuu")`는 `[gameStart, eastThird, eastFourth]`를 준다
(`HanchanController.ts:196-210`). `eastFourth`는 **동4국에 진입할 때** 열리므로, 그 증강은
오라스 한 국(+연장/남입)만 쓰인다. 반장전의 마지막 스테이지(`southThird`=남3국)가 2국을
남겨 두는 것과 비대칭이고, 아가리야메·토비로 그 국에서 끝나면 **한 순도 못 쓰고 게임이
끝난다. 동풍전 종료 사유에 `agariYame`·`dobi`가 실제로 섞여 나오므로 이 상황은 드물지
않다. "몇 판에서 실제로 0국이었나"까지는 세지 않았고 설계 의도일 수도 있어 의심으로 둔다.

---

## 만든 것 (`qa-lab/cross/`)

| 파일 | 하는 일 |
|---|---|
| `lib.ts` | 실제 드래프트로 완주시키는 러너 + 횡단 감사기(드래프트/스케줄/종료/국 스코프) |
| `mass.ts` | 대량 실행 (`tsx qa-lab/cross/mass.ts <n> <startSeed> [mode]`) |
| `draft_sim.ts` | 국을 치지 않고 드래프트만 수천 회 (`<seeds>`) |
| `determinism.ts` | 같은 시드 2회 실행 비교 (`<n> <startSeed>`) |
| `rebuild_order.ts` | 원본 설치 순서 vs `rebuildAugments` 재설치 순서 (`<seeds>`) |
| `keygrowth.ts` | `augmentData` 키 증식·잔류 (`<seed> <mode>`) |
| `pool_size.ts` | 스테이지·모드별 오퍼 풀 vs `cellFor` 요구치 |
| `repro_dup_live.ts` | 확정 1 최소 재현 (`3443 tonpuu`) |
| `repro_dupgame.ts` | 확정 1 드래프트 전용 재현 (`900050 tonpuu`) |
| `repro_drift.ts` | 점수 총합 드리프트 추적 (score 도메인 인계용) |
| `scope_scan.ts` | "국당 N회" 문구 vs 키 리셋 수단 정적 대조 (후보 추림용, 노이즈 많음) |
