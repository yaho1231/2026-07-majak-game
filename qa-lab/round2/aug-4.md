# 증강 4군 (sign_flip … yakuman_shield) — aug-4

## 요약

- **커버리지: 담당 28종 소스 전부 정독** + 형제 증강 대조(`suit_unify`/`suitUnifyCore` ·
  `dead_wall_master` · `tile_split` · `three_dragons_will` · `peek_riichi_waits` ·
  `off_by_one` · `bluff_pretense`) + 코어 대조(`standardActions.ts` ankan/sysDraw/sysDrawRinshan ·
  `helpers.ts` uraIndicatorIds · `GameState.ts` doraIndicatorIndex/rinshanRemaining ·
  `augment/events.ts` TileKindChanged 리듀서 · `information/PlayerView.ts` augmentView 필터).
- **확정 5건 · 의심 5건.** 확정은 🔴 2 (천화·지화 게이트 누락 2종: `tile_dyeing` · `take_back`) ·
  🟠 3 (`tile_dyeing`·`void_kan` 의 5번째 장, `ura_peek` 의 도라 표시패 자리 미잠금).
- 플레이 스위프는 1차 시도분 **2,240판**이 이미 돌아 있고(crash 0 · effectError 0 ·
  담당 증강 위반 0), 이번 확정 5건은 전부 **그 스위프가 구조적으로 못 잡는 종류**다.
- **덜 본 범위**: 클라이언트 렌더(`App.tsx`)의 컷인·이름표는 코드 대조만 했고 화면으로
  확인하지 못했다. 봇 정책의 의사결정 품질은 범위 밖.

1차 시도에서 광역 스위프 **2,240판**(7샤드 × 320판, `qa-lab/round2/aug-4/sweep.ts`,
로그 `qa-lab/round2/aug-4/logs/`)을 이미 돌렸다: crash 0 · effectError 0 ·
도메인 위반은 전부 담당 밖 증강(devils_advance 점수 드리프트, polar_ends/hourglass 연속턴)이었다.
브리핑이 말한 대로 **이 결함 부류는 플레이로 안 잡힌다** — 이번 라운드는 형제 증강 대조에 집중한다.

---

## 확정 1. 🔴 염색(tile_dyeing)이 `handAltered` 표식을 안 남긴다 — 증강으로 **만든** 손에 천화 역만 48,000점

- 위치: `packages/content/src/augments/tile_dyeing.ts` (`dyeAction.toEvents` — `tileKindChanged` 만 내보내고 `handAlteredMark`/`handAlteredKey` 를 쓰지 않는다. 파일 전체에 `handAltered` 문자열이 없다.)
- 기대: `packages/content/src/augments/handAltered.ts` 의 규약 —
  *"손패의 패를 다른 실물/다른 종류로 갈아 끼우는 리듀서가 `handAltered:byAugment:…#round` 표식을 남긴다"*.
  손패 kind를 갈아 끼우는 형제들은 전부 지킨다: `tile_split` · `three_dragons_will` ·
  `silent_swap` · `table_flip` · `suitUnifyCore` · `dead_wall_master` · `genesis` ·
  `future_sight` · `grave_rob` · `pond_snatch`. **염색만 빠졌다.**
- 실제: 오야가 첫 순에 염색 한 번으로 손을 완성시키면 표식이 없어 코어 게이트
  (`packages/core/src/mahjong/flow/helpers.ts` `handAlteredByAugment`)가 통과하고
  **천화(天和)가 그대로 선다**.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/aug-4/repro-dye-tenhou.ts`
  ```
  [대조 · 증강없음] ok=true yaku=[] yakumanCount=undefined p0델타=48000   ← 진짜 천화
  [염색으로 완성]: dye submit ok=true
  [염색으로 완성]: handAltered 표식 = (없음)
  [염색으로 완성]: yaku=[] yakumanCount=undefined p0델타=48000            ← 가짜 천화
  [형제 tile_split] submit ok= true
  [형제 tile_split] handAltered 표식 = [ 'handAltered:byAugment:1-1-0:p0#round' ]
  [염색 · 첫순아님] yaku=[] p0델타=12000                                  ← 정상값
  ```
  같은 손·같은 염색인데 첫 순이냐 아니냐로 **12,000 → 48,000**. 차액 36,000점이
  "배패가 이미 완성돼 있었다"는 거짓 근거로 나간다. (2026-08-20 QA hand 확정 4와
  **완전히 같은 버그**가 염색에 남아 있는 것 — 그때는 `dead_wall_master` 로 실증됐고
  표식 규약이 그 대응으로 만들어졌는데 염색이 누락됐다.)
- 영향: 오야 첫 순 48,000점. 게임 하나가 그 자리에서 끝난다. 염색은 **게임 내 5회**라
  자원도 흔하고, 리치 중에도 쓸 수 있어 발동 문턱이 낮다. 배포 위험 최상.
- 제안 수정: `dyeAction.toEvents` 의 이벤트 배열에
  `augmentDataSet(handAlteredKey(state, req.player), true)` 한 줄 추가
  (`tile_split.ts` 가 하는 것과 같은 방식).
- 곁가지(담당 밖, 참고): 같은 기법을 쓰는 `alchemist` 도 `handAltered` 를 쓰지 않는다 —
  `grep -l handAltered packages/content/src/augments/*.ts` 목록에 없다. 확인 필요.

---

## 확정 2. 🔴 무르기(take_back)도 `handAltered` 표식을 안 남긴다 — 되뽑은 패로 나도 천화 48,000점

- 위치: `packages/content/src/augments/take_back.ts` (`EVENT = "TakeBackPerformed"` 리듀서 —
  `moveTiles` 두 번으로 쯔모패를 패산에 반납하고 새 패를 손에 넣지만 `augmentData` 에는
  `lastUsedKey` 와 공개 채널만 쓴다. 파일 전체에 `handAltered` 문자열이 없다.)
- 기대: `handAltered.ts` 규약 — 손패의 패를 **다른 실물**로 갈아 끼우는 리듀서는 표식을 남긴다.
  똑같이 "손패 1장 ↔ 다른 실물 1장"을 하는 형제는 전부 지킨다:
  `dead_wall_master`(왕패 교환) · `regret` · `pond_snatch`(날치기) · `grave_rob`(무덤 도굴) ·
  `future_sight` · `genesis`. **무르기만 빠졌다.** 그리고 `dead_wall_master` 가 바로
  2026-08-20 QA hand 확정 4의 실증 대상 — 그 대응으로 만들어진 규약을 무르기가 안 탄다.
- 실제: 오야가 첫 순에 쯔모패를 무르고 새로 뽑은 패로 완성하면 표식이 없어 코어 게이트
  (`helpers.ts` `handAlteredByAugment`)가 통과하고 **천화(天和)가 선다.**
  무르기는 실버 티어에 **쿨다운 3순**이라 첫 순에 반드시 열려 있다(국이 바뀌면 즉시 초기화).
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/aug-4/repro-takeback-tenhou.ts`
  ```
  [무르기로 완성 · 첫순]:   take_back ok=true
  [무르기로 완성 · 첫순]:   무른 뒤 손패 = man1..man9 pin2 pin3 pin1 pin1 pin1
  [무르기로 완성 · 첫순]:   handAltered 표식 = (없음)
  [무르기로 완성 · 첫순]:   yaku=[] yakumanCount=undefined p0델타=48000   ← 가짜 천화
  [무르기로 완성 · 첫순아님]: 같은 손·같은 무르기         p0델타=12000   ← 정상값
  ```
  차액 36,000점. 지화(자가 첫 쯔모)도 같은 경로다.
- 영향: 실버 티어(=드래프트에서 흔하다) 증강 하나가 오야 첫 순 48,000점을 만든다.
  염색(확정 1)보다 발동 문턱이 오히려 낮다 — 조건이 "쯔모패가 손에 있다" 뿐이다.
- 제안 수정: `TakeBackPerformed` 리듀서의 `augmentData` 에 `...handAlteredMark(state, p.holder)`
  한 줄 추가(`table_flip.ts` · `silent_swap.ts` 가 하는 것과 같은 방식).

---

## 확정 3. 🟠 염색(tile_dyeing)이 **세상에 없는 5번째 장**을 만든다 — 형제 `suit_unify`가 이미 버린 구현을 그대로 쓴다

- 위치: `packages/content/src/augments/tile_dyeing.ts` `dyeAction.toEvents` —
  `tileKindChanged` 로 손패의 kind만 덮어쓴다. 패산 실물과의 교환도, `copiesLeftUndrawn` 가드도 없다.
- 기대: **완전히 같은 조작**(수패의 무늬만 바꾸고 숫자는 유지)을 하는 형제 `suit_unify`의
  파일 머리 주석이 왜 이 구현을 버렸는지 직접 적어 두었다 —
  *"예전에는 손패의 kind를 그 자리에서 덮어써(conjured) 색만 바꿨다. 그러면 같은 종류가
  게임에 5장 이상 존재하는 비정상 분포가 생기고, 남은 패를 세는 쪽(대기·안전패 계산)이
  전부 틀어진다."* 그래서 `suitUnifyCore.monoWorldEvent` 는 패산의 같은 숫자·목표 색
  실물과 1:1로 맞바꾸고, 패산에 남지 않았을 때만 생성한다. 공용 자 `copiesLeftUndrawn`
  (`content/src/util.ts`)도 `off_by_one`·`peek_riichi_waits`가 쓰고 있다.
- 실제: 4장이 이미 다 보인 종류로도 그냥 물든다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/aug-4/repro-dye-fifth-copy.ts`
  ```
  [전] pin3 — 게임 전체 4장 · 이미 보인 장수 4장 · copiesLeftUndrawn=0
  염색 submit ok= true
  [후] pin3 — 게임 전체 5장 · 이미 보인 장수 5장 · copiesLeftUndrawn=0
  [후] man3 — 게임 전체 3장 (원래 4장)
  ```
- 영향: 장수 세기는 마작 수비의 근간이다. 바닥에서 3통 넉 장을 다 세고 "이건 절대 안 맞는다"며
  던진 안전패에 맞는다 — **대응 자체가 불가능한 화료**다. 염색은 게임 내 5회라 흔하고,
  카드 어디에도 이 말이 없다(형제 `suit_unify`는 카드에 실물 교환을 적어 두었다).
- 제안 수정: (a) `suitUnifyCore`처럼 패산의 같은 숫자·목표 색 실물과 맞바꾸거나,
  최소한 (b) `copiesLeftUndrawn(state, {suit, rank}) > 0` 을 validate·후보 열거 양쪽에 건다.

---

## 확정 4. 🟠 성립하지 않는 깡(void_kan)의 `forgeWait` 도 **세상에 없는 5번째 장**을 만든다

- 위치: `packages/content/src/augments/void_kan.ts` `forgeWait()` —
  `for (const candidate of standardKinds())` 로 34종을 통째로 훑으면서 **그 종류가 아직
  남아 있는지 한 번도 묻지 않는다.**
- 기대: 같은 부류가 이번 라운드 aug-3 확정 1(`peek_riichi_waits` 의 위조)로 이미 잡혔고,
  그 대응으로 공용 자 `copiesLeftUndrawn`(`packages/content/src/util.ts`)이 만들어져 있다.
  그 함수의 주석이 못을 박는다 — *"세 번째 자리가 생기면 여기를 쓴다."* void_kan 이 그
  세 번째 자리인데 안 쓴다. (`off_by_one` · `peek_riichi_waits` 만 쓰고 있다.)
- 실제: 네 장이 이미 다 나온 종류로도 손패를 갈아 끼운다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/aug-4/repro-voidkan-fifth-copy.ts`
  ```
  [전] p0 손패 = man2 man3 man4 man5 man6 man7 pin2..pin7 sou1
  [전] sou1 게임 전체 = 4 장 · copiesLeftUndrawn = 0     ← 1삭은 이미 소진(바닥 3 + 내 손 1)
  p1 안깡 submit ok= true
  [후] p0 손패 = man2 man3 sou1 man5 man6 man7 pin2..pin7 sou1
  [후] sou1 게임 전체 = 5 장 · copiesLeftUndrawn = 0     ← 패산에 없던 다섯 번째 1삭
  [후] p1 후로 = man1man1man1man1
  ```
  패산·왕패에 1삭이 한 장도 없는데(=`copiesLeftUndrawn 0`) 1삭이 한 장 더 생겼다.
- 영향: 화료 공개에서 1삭이 다섯 장 보인다. 장수를 세고 던진 안전패로 창깡 론을 맞는
  구도가 되며, 이 증강은 **상시·무제한**이라 매 깡마다 걸린다.
- 제안 수정: 후보 루프에 `copiesLeftUndrawn(state, candidate) > 0` 한 줄
  (`peek_riichi_waits.ts:198·317` 과 같은 방식).
- 곁가지 (같은 함수, 🟡): 재료 선택에 `isPreciousMaterial`(`bluff_pretense.ts`) 가드가 없다 —
  형제 `tile_split` · `three_dragons_will` 은 둘 다 재료에서 도라·적도라를 뺀다. void_kan 은
  손패 index 0부터 첫 성립 조합을 그냥 채택하므로 **다른 잡패로도 맞출 수 있는데 적5를
  태우는** 경우가 생긴다(`TileKindChanged` 리듀서가 종류가 바뀌면 red 표식을 뗀다).

---

## 확정 5. 🟠 이면투시(ura_peek) 바꿔치기가 **아직 뒤집히지 않은 도라 표시패 자리**를 잠그지 않는다 — 카드 문구가 거짓이고, 다음 깡 도라를 홀더가 정한다

- 위치: `packages/content/src/augments/ura_peek.ts` `lockedIndices(state)` —
  `for (const indicator of state.round.doraIndicators)` 로 **이미 뒤집힌** 표시패와 그 +1(뒷도라)만 잠근다.
- 기대: 카드(detail) — *"첫 번째 뒷도라 표시패를 왕패의 다른 패와 통째로 맞바꿔 …
  (**도라 표시패 자리는 건드릴 수 없다**)"*. 왕패의 표시패 블록은 늘 마지막 10장이고
  자리는 `doraIndicatorIndex(state, k) = len - 10 + 2k` 로 **처음부터 정해져 있다**
  (`core/src/engine/state/GameState.ts`). 즉 "도라 표시패 자리"는 5쌍 전부이지
  뒤집힌 것 하나가 아니다. 같은 파일이 `rinshanRemaining = len - 10` 으로 영상패와
  표시패 블록을 이미 그렇게 가른다 — 규약은 코어에 있는데 이 가드만 «뒤집힌 것»을 본다.
- 실제: 2번째(=다음 깡) 도라 표시패 자리도, 그 뒷도라 자리도, **영상패 자리(index 0 = 다음 깡 쯔모)** 도
  전부 교환 후보로 열려 있다. 게다가 이 증강은 바꿔치기 전까지 홀더에게 **왕패 전체를
  보여 주므로**(`visibility.deadWall`) 어디에 무엇이 있는지 다 알고 고른다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/aug-4/repro-urapeek-next-dora.ts`
  ```
  왕패 길이 = 14 · 영상패 남음 = 4
  2번째(=다음 깡) 도라 표시패 자리 index = 6, 지금 그 자리 = 53:pin5
  peek ok= true
  뒷도라 표시패(내가 본 것) = 51:pin4
  ura_swap(deadIndex=6) ok= true          ← 카드가 "건드릴 수 없다"고 한 자리
  바꾼 뒤 그 자리 = 51:pin4
  ankan ok= true / sys.flipDora ok= true
  깡 도라 개봉 후 도라 표시패 = 50:pin4 , 51:pin4   ← 홀더가 심어 둔 51번 패가 그대로 깡 도라
  ```
  같은 방식으로 `deadIndex: 0` 이면 **자기 다음 깡의 영상패**를 정해 놓을 수 있다
  (`sys.drawRinshan` 이 `deadWallIds(state)[0]` 을 뽑는다).
- 영향: ① 카드가 명시적으로 부정한 일을 한다. ② 깡 도라는 **테이블 전원의 손**에 붙는다 —
  자기 손에 맞는 도라를 심고 스스로 깡을 쳐서 여는 조합이 성립한다(이 증강은 실버 티어다).
  ③ 영상패 지정은 "왕패를 본다"는 정보 증강이 조용히 **패산 조작** 증강이 되는 것이다.
- 제안 수정: `lockedIndices` 를 뒤집힌 표시패가 아니라 **표시패 블록 전체**로 바꾼다 —
  `len - INDICATOR_BLOCK_SIZE` 이상인 index를 전부 잠근다(첫 뒷도라 자신은 교환의 한쪽이므로 예외).
  영상패 자리까지 막을지는 설계 판단이지만, 최소한 표시패 블록은 카드가 약속한 대로 닫아야 한다.

---

# 의심 (재현 못 했거나 설계 판단이 필요한 것)

## 의심 1. 🟠 `tile_split` · `three_dragons_will` 도 5번째 장을 만든다 — 다만 카드가 "생성"을 약속한다
- `tile_split`: 9통 → 4통+5통. 4통·5통이 이미 네 장씩 나와 있어도 막지 않는다.
- `three_dragons_will`: 부족한 삼원패 1~2장을 물질화. 그 종류가 이미 네 장 나와 있어도 막지 않는다.
- 확정 3·4와 **같은 부류**지만 두 카드는 "한 장이 두 장으로 갈라진다" / "물질화한다"고
  생성을 명시한다 — 염색·성립하지 않는 깡은 «무늬만 바꾼다» / «오름패가 되도록 맞춘다»라
  생성이라 읽히지 않는다. 「conjured 는 5장째를 허용한다」를 설계로 확정하고 카드에 적을지,
  아니면 `copiesLeftUndrawn` 를 전부에 거는지 **일관 결정이 필요하다**. 지금은 증강마다 다르다
  (`off_by_one`·`peek_riichi_waits` 는 막고, 나머지는 안 막는다).

## 의심 2. 🟡 `time_pressure` — 공개 채널이 보유자별이 아니다 (한 명 무장해제 = 두 명 효과 소멸)
- 위치: `time_pressure.ts` — 채널이 `roundViewKey("*", "time_pressure")` 로 **보유자 키가 없다**
  (주석이 "서버가 누가 보유자인지 모르는 채로도 한 곳만 보면 된다"고 의도를 밝힌다).
- 두 사람이 같은 국에 이 증강을 들면 한쪽만 무장해제해도 `AUGMENT_DISARMED` 리액션이
  **공용 채널을 지워** 나머지 한 명의 초읽기까지 함께 꺼진다. 반대로 두 명이 들어도
  효과는 한 번(5초)이라 «두 번 적용» 쪽 사고는 없다.
- 미재현(무장해제 조립이 필요). 드래프트에서 두 명이 같이 들 수 있는지 확인 필요.

## 의심 3. 🟡 `void_kan` 이 도라·적도라를 재료로 태울 수 있다
- 확정 4의 곁가지. `forgeWait` 가 손패 index 0부터 첫 성립 조합을 채택하므로 다른 잡패로도
  맞출 수 있는 상황에서 도라를 태울 수 있다. 형제 `tile_split`·`three_dragons_will` 은
  `isPreciousMaterial` 로 뺀다. 카드에 "어느 패가 바뀌는지는 고를 수 없다"고는 적혀 있지만
  "도라를 태울 수 있다"는 말은 없다.

## 의심 4. 🟡 `ura_peek` 의 바꿔치기가 **영상패 자리**까지 연다 (확정 5의 별개 축)
- `deadIndex: 0` = 다음 깡의 영상패. 왕패 전체 시야와 합쳐 «내 다음 깡 쯔모를 정한다»가 된다.
- 확정 5의 수정(표시패 블록 잠금)만 하면 이 축은 남는다. 카드에 적을지 막을지 판단 필요.

## 의심 5. 🟡 `soul_strike` — 폭주 중 리치가 취소되면(`last_stand`·`counter` 계열) 폭주는 계속된다
- `activeKey` 는 국 스코프 플래그라 리치 상태를 다시 보지 않는다. 판수 보너스는
  `addWinHanBonus` 가 라이브 리치를 함께 보도록 이미 고쳐져 있는데(주석에 경위가 있다)
  **연속 6쯔모 자체는 그 게이트를 안 탄다** — "리치를 걸고 여섯 순을 달린다"는 카드에서
  리치만 무르고 여섯 순은 챙기는 모양이 된다. 조합 조립 미재현.

---

## 검증 환경 메모
- 워크트리에는 다른 담당자들의 수정이 동시에 들어오고 있다(`git status` 기준
  `void_kan.ts` · `ura_peek.ts` 등이 이미 M 상태). 위 재현 스크립트는 **그 상태의
  워킹 트리에서 실제로 돌려** 확인한 것이라 지금 코드에 살아 있는 결함이다.
  `tile_dyeing.ts` · `take_back.ts` 는 아직 아무도 손대지 않았다(M 없음).
