# hand 후반 11종 — "판을 뒤엎는 사람" (hand-b)

담당: `dead_wall_master` · `genesis` · `table_flip` · `even_world` · `giant_god` ·
`conjure_draw` · `regret` · `honor_return` · `tile_split` · `three_dragons_will` · `picky_eater`

## 요약

- **돌린 판**: 반장전 137매치(약 1,120국) + 동풍전 14매치(약 60국) + 국경 넘김 전용 매치,
  그 위에 `craft()` 기반 정밀 시나리오 30여 건. 페르소나는 masher/caller/riichiRusher/folder/chaos/stall 무작위 배정.
- **증강 커버리지**: 11종 전부 강제 지급(좌석당 내 증강 2종 + 무작위 1종). 실제 발동이 관측된 액션 —
  `dw_swap` `genesis_flip` `table_flip_do` `even_world_flip` `split_tile` `dragons_will`
  `honor_recall` `conjure_tsumo` `mono_world`(picky). `giant_god`·`picky_unify`는 자연 발생 조건이
  극단적이라 `craft()` 정밀 시나리오로 따로 밟았다.
- **확정 4건 · 의심 2건.**
- 하네스 기본 불변식 + 내가 추가한 불변식(패 총량 보존 / 쯔모패가 손에 있는가 / 왕패=14−깡수 /
  도라 표시패가 왕패 안에 있는가 / 바닥 > 버림이력 / 국 스코프 예약 누수)에서
  **광역 스윕 중 crash 0, effectError 0, 위반 0**이었다 — 위 4건은 전부 정밀 시나리오에서 나왔다.

---

## 확정 1. 🔴 dead_wall_master — 첫 순 안깡 뒤 왕패에서 오름패를 골라 와도 **영상개화(린샨카이호)가 붙는다**

- 위치: `packages/content/src/augments/dead_wall_master.ts:214-222`
- 기대: `dw_swap`은 쯔모패를 왕패의 다른 패로 갈아 끼운다. 갈아 끼운 패는 **깡으로 뽑은
  영상패가 아니다** — 같은 일을 하는 개벽·단색 세계·밥상 뒤엎기는 전부 `replaceDrawnTile()`을
  쓰고, 그 함수가 하는 일이 바로 `lastDrawRinshan`을 false로 되돌리는 것이다
  (`packages/content/src/util.ts:224-229`).
- 실제: 이 리듀서만 `round.lastDrawnTile`만 바꾸고 `lastDrawRinshan`은 손대지 않는다.
  발동 창이 "아직 한 장도 버리지 않은 내 순"이라 **첫 순 안깡 직후에도 열려 있고**,
  왕패 14장이 전부 보이는 증강이라 그 안의 오름패를 골라 오면 그대로 영상개화가 얹힌다.
- 재현: `tsx qa-lab/hand-b/repro_dwm_rinshan.ts`
  ```
  안깡 후: 손패=11 영상쯔모=pin3 lastDrawRinshan=true 왕패=13 discardCount=0
  dw_swap 후보 = 143 (영상 쯔모 직후인데 열려 있다)
  교환 후: 손패=pin2 pin3 pin4 pin5 pin6 pin7 sou2 sou3 sou4 sou9 sou9
          lastDrawnTile=sou9 lastDrawRinshan=true  ← 왕패에서 골라 온 패인데 영상 쯔모 취급
  화료(win) 제시 = true
    실제 역: menzen_tsumo,rinshan / 5판 60부
    rinshan 플래그를 끄면: menzen_tsumo / 4판 60부
  정산 후 점수: p0=37000 p1=21000 p2=21000 p3=21000
  ```
- 영향: **점수가 틀린다.** 없는 역 1판(영상개화)이 붙는다 — 위 예에서 오야 쯔모 8000 → 12000.
  게다가 왕패가 전부 보이므로 "안깡 → 왕패에서 오름패 집기 → 영상개화"는 우연이 아니라
  **재현 가능한 절차**다. 안깡을 두 번 치면 교환 2회를 다 써서 더 확실해진다.

## 확정 2. 🔴 giant_god — 쯔모패를 바닥으로 내던져 **완성된 국사무쌍인데 화료 버튼이 뜨지 않는다**

- 위치: `packages/content/src/augments/giant_god.ts:153` (`handIdsOf(...).slice(0, 13)`)
  · 리듀서 `:192`
- 기대: "손패 앞 13장을 바닥으로" — 손패 14장(막 쯔모)이면 "앞 13장만 나가고 뽑은 1장이 남는다"고
  헤더 주석(`:16-17`)이 약속한다. 밥상 뒤엎기는 같은 위험을 리듀서 주석에 적어 두고
  (`table_flip.ts:137-146`) `replaceDrawnTile`로 막는다 — *"쯔모패를 손에서 빼는 다른 증강이
  moveTiles에서 국을 죽인다"*.
- 실제: `slice(0, 13)`은 **배열 앞 13장**이지 "쯔모패를 뺀 13장"이 아니다. 쯔모패가 배열 끝이
  아닌 상태에서 누르면 쯔모패가 바닥으로 나가고 `round.lastDrawnTile`이 손 밖(바닥)을 가리킨다.
  거신병은 `replaceDrawnTile`을 쓰지 않는다.
  - 도달 경로(실제 게임): **개벽(genesis) → 같은 순에 거신병**. 개벽은 패산과 맞바꾼 패를
    손패 **끝에** 붙이고, 패산에 그 분류가 모자라 그 자리에서 종류만 바뀐 패는 원래 자리에
    남는다(`genesis.ts:203-219`). 그래서 개벽 직후 쯔모패가 배열 중간으로 밀린다.
    (둘 다 hand 계열이고 conflicts가 없다.)
- 재현: `tsx qa-lab/hand-b/repro_genesis_giant.ts` — p0에 `genesis`+`giant_god`,
  바닥 `19m19p19s1234z567z`(국사 13종), 손패 `2345678m2345678p`(14장, 쯔모패 마지막)
  ```
  패산자패=8: 개벽 후 손패=14장, 쯔모패(64→64) 위치=5  ← 마지막이 아니다
     거신병 후 손패=14 바닥=13
     lastDrawnTile=64  손에 있는가=false  바닥에 있는가=true
     손패: dragon2 man1 man9 pin1 pin9 sou1 sou9 wind1 wind2 wind3 wind4 dragon1 dragon2 dragon3
     프롬프트 옵션종류=discard,riichi
     화료(win) 제시=false  / lastDrawnTile의 kind=wind3

  [대조군] 같은 국사 완성형 · 쯔모패가 손 안: 화료 제시=true
  ```
  손패 14장은 **국사무쌍 13종 + dragon2 아타마 = 완성형**인데 `win`이 제시되지 않는다.
- 원인 사슬: `buildWinContext`(`core/src/mahjong/flow/helpers.ts:708-711`)는
  `concealedIds = 손패.filter(id !== winningTileId)` 뒤 화료패를 한 장 얹는다. 화료패가 손에
  없으면 필터가 아무것도 걸러내지 않아 **채점 손패가 15장**이 되고 어떤 화료도 성립하지 않는다.
- 영향: 역만을 완성해 놓고 화료할 수 없다(게임이 죽지는 않는다). 부수적으로 물리 바닥에
  쯔모패가 한 장 더 쌓이고 `lastDrawnTile`이 존 밖을 가리키는 상태가 국 끝까지 남는다.
  ⚠ **리치 중이었다면 소프트락이다** — `discardAction`은 리치 중 쯔모패만 버리게 하는데
  (`standardActions.ts:170`) 그 쯔모패가 손에 없으므로 어떤 버림도 반려된다. 거신병 자신은
  리치를 막지만, 같은 `slice(0,13)` 결함이라 리치를 막지 않는 다른 손 재배열 증강과 만나면
  거기까지 간다.

## 확정 3. 🟠 giant_god — "발동하면 조건이 스스로 무너진다"가 거짓: **무한 재발동**

- 위치: `packages/content/src/augments/giant_god.ts:26-30, 270-272`
- 기대: 설명/헤더가 리미트를 조건 자체로 둔다 — *"횟수 제한은 없지만 발동과 동시에 바닥이 비어
  조건이 스스로 무너진다"*. 기존 회귀 테스트도 이걸 단정한다
  (`packages/content/test/giant_god.test.ts` — "상시지만 — 발동으로 바닥이 비어 조건이 스스로 무너진다").
- 실제: 발동은 손패 13장과 바닥의 국사 13장을 **맞바꾸는** 것이다. 내려간 손패가 다시 국사 13종을
  덮으면 조건이 그대로 유지된다. 발동은 턴을 넘기지 않으므로 버튼이 **같은 순에 무한히 다시 뜬다**.
- 재현: `tsx qa-lab/hand-b/probe_giant.ts` — 손패 `19m19p19s1234567z`(순국사 13장),
  바닥 `19m19p19s1234z567z`
  ```
  ### A) 재각성 루프
    연속 발동 횟수 = 50        (루프 상한에서 끊었다 — 옵션이 계속 제시된다)
    손패=13 바닥=13
    → 🔴 무한 재발동 (턴이 넘어가지 않는다)
  ```
- 영향: 사람이 누르면 턴을 벗어나지 못하는 무한 버튼(발동 컷인·전원 공개 채널도 매번 재발행).
  거신병 봇 정책은 `intent:"win"` · `fleeting:true` · 조건 없이 `options.find(ACTION)`
  (`giant_god.ts:274-279`)이라 **서버 봇이 이 손을 잡으면 같은 순을 못 벗어날 수 있다**.
  또 `discardedKinds`를 매번 13장 빼고 13장 더하므로 후리텐 이력이 반복해서 다시 쓰인다.

## 확정 4. 🟠 picky_eater × frame_up — 누명이 건 `conflicts` 잠금이 **아무것도 막지 못한다**

- 위치: `packages/content/src/augments/frame_up.ts:144-149` (`conflicts: ["picky_eater"]`)
  · `packages/content/src/augments/picky_eater.ts:99-112`
- 기대: 누명 소스가 그 잠금의 이유를 이렇게 적어 뒀다 — *"편식은 자기 바닥에서 퀘스트를 세는데
  누명은 남의 바닥에 실물을 심는다. 심긴 패 한 장이 퀘스트를 통째로 깨고, 피해자는 플레이로
  피할 수 없다. 그래서 **피해자 쪽을 하나 잠근다**."*
- 실제: `conflicts`는 **한 사람이 두 증강을 같이 갖는 것**만 막는다
  (`core/src/augment/DraftController.ts:173-199` — `held` 기준, 상대 보유 증강은 보지 않는다).
  누명은 애초에 **남에게** 쓰는 증강이라, 같은 사람이 둘 다 가진 조합은 피해가 성립하지 않는
  유일한 조합이다. 즉 이 잠금은 막으려던 상황을 하나도 막지 못하고, 드래프트 후보만 줄인다.
- 재현: `tsx qa-lab/hand-b/repro_picky_frameup.ts` — p0=편식(만수만 9장+자패 2장 버림, 11/12),
  p1=누명이 p0 바닥에 통수를 심는다
  ```
  심기 전 p0 퀘스트: {"suit":"man","count":11,"failed":false,"ready":false}
  심는 패: pin1
  심은 뒤 p0 퀘스트: {"suit":"man","count":12,"failed":true,"ready":false}
  p0 discardedKinds: man1 … man9 wind1 wind2 pin1
  p0 discardCount: 11        ← p0가 실제로 버린 것은 11장뿐이다
  ```
- 영향: 피해자는 자기가 버리지도 않은 패 때문에 그 국 능력을 잃는다.
  반대 방향도 열려 있다 — `count`가 `discardedKinds.length`라 **심긴 패가 진행도를 올려 준다**
  (11 → 12). 같은 무늬를 심으면 편식이 12장을 채우지 않고도 `ready`가 된다.
- 겹침 고지: 기저 상호작용 자체는 `docs/28_QA_PREDEPLOY_2026-08-08.md:173`에 이미 기록돼 있다
  (당시 "상호 conflict 없음"). **새로운 것은 그 뒤 추가된 `conflicts` 잠금이 무효라는 사실**과,
  퀘스트를 깨는 방향뿐 아니라 **진행도를 올려 주는 방향**도 열려 있다는 점이다.
  `picky_eater.ts:101`을 `discardCount`로 옮기라는 같은 문서 `:359`의 조치는 아직 반영되지 않았다.

---

## 의심 1. 🟡 conjure_draw — 손 계열에서 혼자 리치 가드가 없다 (리치 중 확정 쯔모)

- 위치: `packages/content/src/augments/conjure_draw.ts:84-99` (validate에 리치 검사 없음)
- 근거: `honor_return.ts:91-96`이 계열 규약을 명시한다 — *"같은 계열(giant_god·tile_split·
  genesis·even_world)과 같은 규약 — 리치 중에는 손패를 건드리는 액티브를 막는다(docs/21 D-2).
  이 증강은 다음 국 배패에만 영향을 주지만, 일관된 규약을 지킨다."* 소환만 그 규약 밖에 있다.
- 관측: `tsx qa-lab/hand-b/repro_conjure_riichi.ts` — 리치·단기(5s) 대기
  ```
  리치 중 p0 옵션: discard,conjure_tsumo
  conjure_tsumo 후보 = 14  ← 리치 중인데 발동 가능
  소환 대상: sou5 (단기 대기패)
  p0의 다음 쯔모 = sou5 (conjured=true)
  화료(win) 제시 = true
  ```
- 왜 "의심"인가: `detail`이 "리치 중 불가"를 약속하지 않으므로 **설명 위반은 아니다**.
  다만 손패를 안 건드린다는 이유는 단기·샹퐁 대기에서 무너진다 — 대기패가 손에 있으므로
  그것을 지목하면 다음 쯔모가 **확정 오름패**가 된다(리치는 쯔모기리 강제라 흘릴 수도 없다).
  의도된 설계인지 규약 누락인지는 소스만으로 판별할 수 없어 의심으로 남긴다.

## 의심 2. 🟡 손패 변형 액티브 + 오야 첫 순 → 천화(天和)

- 대상: `table_flip` `even_world` `tile_split` `three_dragons_will` `dead_wall_master` `genesis`
- 근거: `buildWinContext`의 천화/지화 판정은 `firstTurn && !goAroundBroken && discardedKinds.length === 0`
  뿐이다(`core/src/mahjong/flow/helpers.ts:761-772`). 위 액티브들은 전부 그 창 안에서 발동할 수
  있고 `firstTurn`을 깨지 않는다 — 배패가 아니라 **증강이 완성한 손**에 역만(천화/지화)이 붙는다.
- 왜 "의심"인가: 자연 발생 확률이 극히 낮아 200판 스윕에서 한 번도 밟히지 않았고, 배패를 다시
  받는 계열(밥상 뒤엎기 등)에서는 "다시 받은 배패"로 보는 것이 의도일 수도 있다. 손패를 억지로
  맞춰 재현할 수는 있으나 **자연 도달을 확인하지 못해** 확정으로 올리지 않는다.

---

## 확인했고 문제 없던 것 (회귀 기준선)

- 패 총량 136 보존: 개벽(패산 0장에서 발동 포함) · 밥상 뒤엎기 · 왕패의 주인 · 분열 ·
  삼원의 의지 · 짝수의 세계 전부 통과.
- 왕패 크기 = 14 − 깡수: 광역 스윕 1,100국 내내 위반 0. 깡 3회로 11장이 된 왕패에서도
  `dw_swap` 후보의 `deadIndex` 상한이 정확히 맞고, 교환 뒤 왕패 장수·도라 표시패 승계·
  뒷도라(표시패+1)가 모두 왕패 안에 남는다.
- 밥상 뒤엎기: 패산 총량 불변, 새 쯔모패가 손패 마지막, **같은 순 재발동 불가**(매 국 1회).
- 짝수의 세계: 9→8, 도라 홀수패 유지, 적5 유지, 같은 순 재발동 불가(2국 쿨다운).
- 분열: `a+b=r`, `a ≤ r/2`만 제시, 손패 장수 불변.
- 삼원의 의지: 재료가 완성 몸통(789m)을 먹는 것은 `detail`이 이미 경고한 대로 — 설명과 일치.
- 국 스코프 예약(`giant_god:tsumo:` · `conjure_draw:pending:`)이 다음 국으로 새는 사례 0.
- 하네스가 삼킨 훅 예외(`effectErrors`) 0, 크래시 0.

## 재현 스크립트

| 파일 | 내용 |
| --- | --- |
| `qa-lab/hand-b/inv.ts` | 도메인 불변식(패 총량 / 쯔모패 소재 / 왕패=14−깡 / 도라 표시패 / 바닥·이력 / 국 스코프 누수) |
| `qa-lab/hand-b/run_broad.ts` | 광역 스윕 (`tsx qa-lab/hand-b/run_broad.ts <판수> <시작시드> [mode]`) |
| `qa-lab/hand-b/run_crossround.ts` | 국경 넘김(regret·honor_return) 배달 검증 |
| `qa-lab/hand-b/probe_giant.ts` | 확정 3 (무한 재발동) + 쯔모패 축출 최소 확인 |
| `qa-lab/hand-b/repro_genesis_giant.ts` | 확정 2 (개벽 → 거신병, 화료 불가) |
| `qa-lab/hand-b/repro_dwm_rinshan.ts` | 확정 1 (왕패의 주인 × 첫 순 안깡, 영상개화 오탑재) |
| `qa-lab/hand-b/repro_picky_frameup.ts` | 확정 4 (편식 × 누명, conflicts 무효) |
| `qa-lab/hand-b/repro_conjure_riichi.ts` | 의심 1 (리치 중 소환 확정 쯔모) |
| `qa-lab/hand-b/probe_misc.ts` | 나머지 8종의 약속 대조(극단 타이밍) |
