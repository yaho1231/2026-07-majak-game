# 방해(disrupt) B — "시간을 훔치는 사람"

담당: `call_seal` `brief_fog` `disarm` `push_riichi` `frame_up` `hourglass` `time_pressure`
`blind_ron` `reload` `cornucopia`

## 요약

- 돌린 판: **310매치 이상 / 1,800국 이상** (반장전·동풍전 혼합, 페르소나 6종 무작위 배정,
  담당 증강을 좌석에 강제 지급). 완주 집계가 찍힌 것만 해도 동풍전 3배치 **120매치·519국**,
  반장전 6배치가 각 25매치 이상(≈1,200국), 모래시계 집중 배치(전원 베타오리)와
  커버리지 배치 35매치가 더 있다. 다른 QA 에이전트들이 같은 기계에서 대형 소크를 돌리고 있어
  반장전 배치 일부는 집계 출력 전에 시간이 끊겼다 — 위반 판정은 매 매치 스트리밍으로 찍었다.
- 실행 스크립트: `qa-lab/disrupt-b/run.ts` · `run_cov.ts` · `run_hourglass.ts` · `checks.ts`
- 증강 커버리지(커버리지 배치 30매치 기준 실제 발동 횟수):
  `push_brand` 57 · `frame_discard` 25 · `disarm_lock` 24 · `declare_brief_fog` 21 ·
  `call_seal_use` 20 · `reload_use` 6. 자동 발동 4종(`hourglass` `time_pressure`
  `blind_ron` `cornucopia`)은 강제 지급으로 전 매치 커버.
- **확정 6건 · 의심 3건.** 크래시·소프트락(선택지 0개)·타임아웃·패 중복·손패 장수 이상은
  담당 증강 경로에서 **한 건도 재현되지 않았다**(아래 §검사했으나 이상 없던 것).

---

## 확정 1. 🟠 cornucopia — "게임 시작 드래프트 전용" 증강을 늦은 드래프트에 뿌린다 (기록된 수정이 뒤집혀 있다)

- 위치: `packages/core/src/augment/Augment.ts:508-517` (`grantAugments` 후보 필터)
- 기대: docs/28 §2-9가 이미 지적하고 "수정함"으로 기록한 항목 —
  *"`draftStages`를 검사하지 않아 게임 시작 전용 증강(마왕의 진군=가불 인생 등)을 남3국에
  뿌린다 — '앞당겨 받는 10,000점'이 대가 없는 +10,000이 된다."*
- 실제: 넣은 조건이 **정확히 반대**다.
  ```ts
  (d.draftStages === undefined || d.draftStages.includes("gameStart"))
  ```
  `draftStages: ["gameStart"]`인 증강(`devils_advance` `late_bloomer`)은 이 조건을 **통과**하고,
  오히려 늦은 스테이지 전용인 `reload`만 후보에서 빠진다. 지적된 사례가 그대로 살아 있다.
- 재현: `tsx qa-lab/disrupt-b/repro_cornucopia_gamestart.ts`
  ```
  후보 115개 중 gameStart 전용: [ 'late_bloomer', 'devils_advance' ]
  후보에서 빠진 늦은 스테이지 전용: []
  남3국 지급 60회 중 게임시작 전용이 섞인 경우 4회 (6.7%)
    seed=12 → [ 'devils_advance', 'true_dragon' ] …
  지급 후 p0 증강: [ 'cornucopia', 'devils_advance', 'true_dragon' ]
  국 시작 전 총점: 100000 [25000,25000,25000,25000]
  남3국 시작 후 총점: 110000 [35000,25000,25000,25000]   ← 뱅크에서 +10,000 발행
  ```
- 영향: 남3국에 수상한 주사위를 집으면 **6.7%로 그 자리에서 뱅크 10,000점**(가불 인생은
  "첫 국에 10,000 선지급 → 이후 만관을 치면 상대 셋에게서 9,000을 걷어 뱅크에 갚는다"라
  갚는 쪽도 보유자 손해가 아니다). 남은 국이 1~2개뿐이라 사실상 순수 +10,000이다.
  `late_bloomer`(반장전 전용·게임 시작 전용, 남4국부터 후리텐 무시+무역 화료+3판)도 같은 경로로
  남3국에 들어와 **만개 직전에 받는 공짜 규칙**이 된다.

## 확정 2. 🟠 reload — 지속 중인 6순 효과(함구령·박무)를 그 자리에서 꺼 버린다

- 위치: `packages/content/src/augments/reload.ts:170-183` ·
  `call_seal.ts:41-47`(`sealActive`) · `brief_fog.ts:93-101`(`fogActive`)
- 기대: 재장전 detail — *"사용 횟수를 한 번 되돌린다"*. 함구령 detail — *"선언한 그 순간부터
  6순 동안 … 6순이 지나면 봉인이 풀리고, 6순이 다 가기 전에 **국이 끝나면** 함께 걷힌다"*.
  즉 걷히는 조건은 **6순 경과** 또는 **국 종료** 둘뿐이다.
- 실제: 두 증강 모두 "지금 효과가 살아 있는가"를 `사용 카운터 > 0 && turnCount − 선언순 < 6`
  으로 판정한다. 재장전이 그 카운터를 1 되돌리면 **카운터가 0이 되어 활성 판정이 즉시 거짓**이
  된다 — 6순 중 0순만 지났어도 봉인·안개가 그 자리에서 걷힌다.
- 재현: `tsx qa-lab/disrupt-b/repro_reload_cancels_window.ts`
  ```
  선언 직후 (turnCount=0) p1 후로 봉인: true   uses= 1
  재장전: true
  재장전 직후 (turnCount=0, 아직 1순도 안 지났다) p1 후로 봉인: false   uses= 0
  ---
  선언 직후 p1이 보는 바닥: count_only
  재장전 직후 p1이 보는 바닥: public   uses= 0
  ```
- 영향: 자원을 늘리려고 누른 버튼이 **자기 봉인을 스스로 해제**한다. 봇 정책(`reload`는
  복구 대상이 있으면 즉시 누른다)이 이 자해를 확률적으로 밟는다. 같은 순에 다시 선언하면
  창이 리셋돼 겉으로는 안 보이지만, 선언하지 않으면 남은 순이 통째로 사라진다.
  (알려진 `reload` boolean 플래그 건과는 다른 경로다 — 이쪽은 **카운터를 활성 판정에 겸용**한 탓.)

## 확정 3. 🟠 disarm — 초읽기(time_pressure)를 잠그지 못한다 (5초 제한이 그대로 산다)

- 위치: `packages/content/src/augments/time_pressure.ts:47-54`(`armOnNextRound`) ·
  `packages/core/src/engine/GameEngine.ts:91`(`isSourceDisarmed` 게이트) ·
  `packages/server/src/HumanAgent.ts:696`
- 기대: 무장해제 detail — *"그 증강이 이번 국이 끝날 때까지 **완전히** 잠긴다. 상시 규칙도,
  정산 개입도, 액티브 버튼도 전부 사라진다."*
- 실제: 초읽기의 효과 전부는 **국 시작에 한 번 실려 버린 공개 채널 값**
  (`view:*:time_pressure#round` = 5)이다. 무장해제 게이트는 Modifier·Interceptor·Reaction·
  액티브 버튼만 건너뛰므로 **이미 실린 값은 손대지 못한다**. 서버 `HumanAgent`는 매 결정마다
  그 채널을 읽어 대기 시간을 5초로 줄이므로, 잠근 뒤에도 국이 끝날 때까지 **테이블 전원이
  계속 5초 안에 결정**해야 한다.
- 재현: `tsx qa-lab/disrupt-b/repro_disarm_time_pressure.ts`
  ```
  국 시작 후 초읽기 채널: ["view:*:time_pressure#round",5]
  무장해제(time_pressure): true    무장해제 목록: ["aug:p1:time_pressure"]
  잠근 뒤 초읽기 채널: ["view:*:time_pressure#round",5]   ← 그대로
  잠근 뒤 눈먼 총알 채널: ["view:*:blind_ron:p1#round",true]  ← 효과는 죽었는데 표시는 산다
  ```
- 영향: ① 무장해제 1회(반장전 2회 중 하나)를 쓰고도 아무것도 잠기지 않는다 — 설명과 정반대.
  사람 플레이어에게 걸리는 유일한 실시간 압박이라 체감 손해가 크다.
  ② 같은 구조의 눈먼 총알은 **효과는 정상으로 잠기지만 "이 국의 론은 무작위로 날아간다"는
  공개 표시만 남아**, 상대는 이미 죽은 위협을 피해 국을 마친다(정보 오류).

## 확정 4. 🟠 frame_up — 유국만관(나가시)을 유지시켜 준다 (한 방에 12,000점 뒤집힘)

- 위치: `packages/content/src/augments/frame_up.ts:141-149`(`creditTo`) ·
  `packages/core/src/mahjong/flow/standardActions.ts:1144-1164`(`nagashiManganSeats`)
- 기대: 누명 detail이 광고하는 것은 **후리텐 이력 오염**과 **내 후리텐 회피** 두 가지다.
  "내 바닥에 남지 않는다"의 부수효과로 **유국만관 자격까지 지켜 준다**는 말은 없다.
- 실제: 나가시 판정은 `round.byPlayer[x].discardedKinds`로 하는데 누명은 그 이력을 지목당한
  사람에게 새긴다. 그래서 보유자는 **중장패를 버리고도 자기 이력은 요구패만 남아** 나가시가
  이어진다. 반대로 피해자는 자기가 버리지도 않은 한 장 때문에 나가시가 깨진다.
- 재현: `tsx qa-lab/disrupt-b/repro_frameup_nagashi.ts` (같은 손·같은 패, 버리는 방법만 다르다)
  ```
  표준으로 5만 버림: p0 discardedKinds=[man1,man1,man9,pin1,pin9,wind1,man5]
     점수 변화: -3000/+1000/+1000/+1000        (노텐 벌점)
  누명으로 5만 버림: p0 discardedKinds=[man1,man1,man9,pin1,pin9,wind1]
                     p1 discardedKinds=[man2,man3,man4,man5]
     점수 변화: +9000/-3000/-3000/-3000        (유국만관 성립)
  ```
- 영향: 한 번 심는 것으로 **12,000점 스윙**. 2국에 1회라 반장전에서 2~4장의 중장패를
  남의 바닥으로 흘릴 수 있고, `nagashi_yakuman` 증강과 겹치면 역만이 된다.
  (이미 알려진 후로 크래시와는 무관한 경로다.)

## 확정 5. 🟡 blind_ron — 본장 가산분까지 함께 엉뚱한 사람에게 옮긴다

- 위치: `packages/content/src/augments/blind_ron.ts:117`
  (`const owed = -(deltas[shooter] ?? 0)`)
- 기대: detail — *"옮겨 가는 것은 **손의 지불분**이며 **공탁·본장은 원래대로** 정산된다."*
- 실제: 쏜 사람의 **음수 델타 전체**를 옮긴다. 론의 델타에는 본장 가산분(300×본장)이 이미
  섞여 있어(`standardActions.ts:966-969`) 본장 몫까지 함께 날아간다.
- 재현: `tsx qa-lab/disrupt-b/repro_blindron_honba.ts` (2본장, p2→p1 8000점 론)
  ```
  seed=2 실제 쏜 사람=p2 → 청구된 사람=p3  증감 {"p1":8600,"p3":-8600}
     기대: 8000만 옮기고 p2가 본장 600 부담 / 실제: 600까지 p3가 물었다
  seed=3 → p0가 8600 전액 부담
  ```
- 영향: 총액은 보존되므로 회계는 안 깨지지만 **설명과 다르다**. 본장이 쌓인 국(4본장이면
  1,200점)에서 엉뚱한 사람이 남의 연장료까지 문다.

## 확정 6. 🟡 push_riichi × frame_up — 선언패가 자기 바닥에 없는 리치가 만들어진다

- 위치: `packages/content/src/augments/push_riichi.ts:186-199`(TILE_DISCARDED 인터셉터) ·
  `frame_up.ts:141`(직접 `TILE_DISCARDED` 발행) ·
  `packages/core/src/mahjong/flow/flowEvents.ts:472-492`
- 기대: 리치 선언패는 선언자의 바닥에 옆으로 눕혀 놓인다(선언 시점의 단일 진실).
- 실제: 낙인이 찍힌 사람이 **누명으로** 버리면 인터셉터가 그 이벤트에 `riichi:true`를 얹는다.
  결과는 `riichi.discardTileId` = 남의 바닥에 심긴 패, `discardIndex` = 0(빈 자기 바닥),
  리치봉 1000점은 정상 차감. `PlayerView`가 선언패를 자기 바닥에서 못 찾아 **리치 표식이
  어디에도 그려지지 않는다**(리치는 성립해 있다).
- 재현: `tsx qa-lab/disrupt-b/repro_frameup_forced_riichi.ts`
  ```
  누명 제출: true
  p1 리치 상태: {"double":true,"ippatsu":true,"discardIndex":0,"discardTileId":68,"cost":1000}
  p1 점수: 24000  공탁: 1000
  p1 바닥: 0장   p2 바닥: 1장 (심긴 패)
  리치 선언패가 p1 바닥에 있는가: false / p2 바닥에 있는가: false(존 이동 후 인덱스 불일치)
  ```
  (위 출력의 `double:true`는 크래프트 상태에서 p1 바닥이 비어 있던 탓이다 —
  실전에서는 누명이 첫 바퀴에 금지돼 재현되지 않는다. 확정 대상은 **선언패 소실**뿐이다.)
- 영향: 리치를 걸었는데 어느 바닥에도 표식이 없다 — 상대는 "몇 순째 리치인지"를 읽을 수 없고,
  같은 값을 쓰는 `riichi_upgrade`의 더블리치 판정도 자기 바닥 인덱스를 본다.

---

## 의심 1. 등 떠밀기 낙인 표시가 정산·드래프트 화면 내내 남는다 (재현은 되지만 영향 확정 못 함)

`push_riichi`의 낙인 공개 채널은 국 스코프(`roundViewKey`)라 **다음 국 배패 때** 지워지는데,
국이 끝나고 다음 국이 시작될 때까지 사이에 정산 화면과 증강 드래프트가 통째로 끼어 있다.
그 동안 이미 죽은 낙인 관계선이 이름표에 계속 서 있다 — 눈먼 총알이 2026-08-12에
`ROUND_SETTLED`에서 표시를 내리도록 고친 것과 **같은 구조**인데 이쪽은 안 고쳐져 있다.
대량 실행에서 50매치가 `brand=null / view=p3` 형태로 걸렸다(전부 정산~배패 사이 구간).
클라이언트가 그 구간에 이름표를 실제로 그리는지까지는 확인하지 못해 의심으로 둔다.

## 의심 2. 사전 지급(sandbox `presetAugments`) 순서 탓에 수상한 주사위가 중복·상호배제를 뚫는다

`HanchanController.installPreset`(`HanchanController.ts:847-855`)은 좌석 순서대로 하나씩
설치한다. p0의 수상한 주사위가 설치되는 시점에는 **뒤 좌석의 사전 지급 증강이 아직 상태에
없어서** `heldByAnyone`·`mine` 검사가 통과한다.
- `seed=143`: p0가 지급받은 `regret`을 p1도 들고 있었다(`AUG_DUP`).
- `seed=951`(동풍전): p3가 `stealth_riichi` + `all_or_nothing`(상호 배제)을 함께 들었다.
정식 드래프트는 한 장씩 순차 확정이라 재현되지 않는다. 다만 서버 샌드박스 모드가 같은
경로(`RoomManager.ts:4816`)를 쓰므로 그 방에서는 실제로 일어날 수 있다.

## 의심 3. 함구령·박무의 "순" 계수는 후로가 끼면 늘어난다

`turnCount`는 **오야가 뽑을 때만** +1 한다(`flowEvents.ts:402`). 남이 오야의 버림을 울어
오야의 쯔모가 건너뛰어지면 그 바퀴는 세지 않으므로, 후로가 잦은 국에서는 "6순"이 실제로는
7~8바퀴가 된다. 박무는 후로를 막지 않으므로 이쪽이 특히 늘어난다. 설계 의도(=turnCount가
곧 순)일 수 있어 의심으로 둔다.

---

## 검사했으나 이상 없던 것 (되짚지 않도록 남긴다)

- **함구령의 봉인 범위**: 치·펑·대명깡 세 validate 모두 `call.blocked`를 본다
  (`standardActions.ts:385,446,576`). 커스텀 콜(`open_kokushi` `silent_pact` `bluff_pretense`)도
  전부 검사한다. 대량 실행에서 잡힌 `SEAL_BROKEN_CALL`은 **딱 1건**이고, 최소 재현
  (`tsx qa-lab/disrupt-b/run.ts --n 1 --start 1016 --tonpuu`)으로 파 보니 그 국에 p1이
  p0의 함구령을 **무장해제**한 뒤 친 치였다 — `disarmed=["aug:p0:call_seal"]`. 즉 정상 동작이고
  봉인이 새는 경로는 아니다. 국·본장이 바뀌면 키가 달라져 저절로 만료되는 것도 확인했다.
- **모래시계의 왕패 회계**: 넘겨받는 장수를 `rinshanRemaining`으로 자르므로 도라 표시패
  블록(뒤 10장)을 침범하지 않는다. 연장 중에는 영상패가 0이라 깡 자체가 거부된다
  (`standardActions.ts:505,572,621,729`) — 연장 중 깡으로 도라가 어긋나는 경로는 없다.
  전원 베타오리 30매치 집중 실행에서 왕패 침범·타가 강제 진행 위반 0건.
- **재장전의 회계**: `<id>:uses:`/`:used:` 카운터가 음수가 되거나, 관측된 복구 횟수가 재장전
  사용 횟수를 넘는 사례 0건. 쿨다운형(모래시계·누명)은 규약이 달라 후보에 뜨지 않는다(설계대로).
- **수상한 주사위의 총량**: 지급으로 인한 패 중복·손패 장수 이상·점수 총합 구멍 0건
  (지급 자체가 만드는 문제는 확정 1의 경로뿐이다).
- **소프트락**: 선택지 0개(`EMPTY_OPTIONS`)·프롬프트 타임아웃 0건. 등 떠밀기의 강제 리치도
  리치 성립 조건(멘젠·버린 뒤 텐파이·공탁 여유·패산 잔량·리치 미봉쇄)을 전부 다시 보므로
  강제 수 오류는 관측되지 않았다.
- **박무·함구령의 만료 표시**: 만료 뒤에도 공개 채널 값이 그 국 끝까지 남지만
  (`CALLSEAL_STALE_NOTICE` 62매치·`FOG_STALE_REVEAL` 54매치), 클라이언트가
  `until - turnCount <= 0`이면 pill을 그리지 않고(`App.tsx:14340-14347`), 안개가 걷히면
  바닥이 어차피 전부 공개라 남은 tileId 공개도 무해하다 — **버그 아님**으로 판정.
