# QA 전수조사 — 플레이어 정보 결손·오류 (2026-08-17)

**목적**: "무언가 적용됐는데 플레이어에게 그 사실이 안 보이거나, 화면이 사실과 다르게 말하는" 지점을 전수로 찾는다.

기준 사례: 초읽기(`time_pressure`)가 판에 걸렸는데 플레이어는 타이머 숫자를 보고서야 눈치챌 수 있었다 → 국 시작 연출(`armedRoundNotices`)을 붙여 보완했다. 같은 성격의 공백을 나머지 전부에서 찾는다.

**이 문서는 조사 결과와 수정 방향만 담는다. 수정은 별도 지시 후에 한다.**

조사 범위 — 6개 영역 병렬 감사 + 직접 확인:
방/판 설정 고지 · 증강 113종 발동 알림 · 화료/유국 정산 화면 · 대국 HUD 상시 정보 · 증강 설명문 vs 구현 대조 · 드래프트 UI · 에러/타임아웃 피드백.

우선순위 표기: **P0 = 화면이 사실과 다르게 말한다** / **P1 = 적용됐는데 흔적이 없다** / **P2 = 보이지만 근거가 부족하다** / **P3 = 설명문·문구 보강**.

---

## P0 — 화면이 거짓을 말한다

가장 먼저 잡아야 할 계열이다. 정보가 없는 것보다 틀린 정보가 나쁘다.

### P0-1. 로비가 판 길이를 잘못 알려 준다 (서입·남입)

대기실 모드 버튼이 반장전 = `"동+남 · 남4국까지"`, 동풍전 = `"동장만 · 동4국까지"`로 단언한다 ([App.tsx:7338](packages/client/src/App.tsx:7338)). 그러나 `hanchanConfigForMode`는 **두 모드 모두 `westEntry: true`** 를 준다 ([HanchanController.ts:166](packages/core/src/match/HanchanController.ts:166), [:173](packages/core/src/match/HanchanController.ts:173)) — 반장전은 남4국 뒤 1위가 30000 미만이면 서장이 붙고, 동풍전은 동4국 뒤 남장이 붙는다. `WIND_CHAR`에 `西`가 있어 예고 없이 `西1국`이 뜬다.

오라스라 믿고 순위 굳히기/역전 라인을 짠 판단이 통째로 틀어진다.

**수정 방향**
- 대기실 sub 문구: `"동+남 · 남4국까지(30000 미만이면 서장 서든데스)"`.
- 서장/남장 첫 국의 `showBanner` `sub`에 `"서든데스 — 30000점을 먼저 넘기면 종료"`. `maxWind`는 클라에 없으므로 `view.round.mode`로 유도(hanchan→2, tonpuu→1).
- `ModeBadge`의 "증강 획득 국" 문구도 서장에는 증강이 없다는 사실을 함께 적는다.

### P0-2. 봉인된 패 안내가 지속 기간을 틀리게 말한다

봉인 패 클릭 시 `"🔒 봉인된 패 — 이 게임 동안 버릴 수 없습니다"` ([App.tsx:12325](packages/client/src/App.tsx:12325)). 실제 봉인은 **국 스코프**다 — 목록이 `roundViewKey`로 저장되고 국이 끝나면 채널이 사라진다 ([discard_lock.ts:90](packages/content/src/augments/discard_lock.ts:90)).

"이 게임 내내 못 버린다"로 읽으면 그 패를 안고 손을 다시 짤 이유가 없어진다.

**수정 방향**: 문구를 `"이번 국 동안 버릴 수 없습니다"`로. 덤으로 `hand-seal-badge`에 `title`이 없어 hover로는 아무것도 안 나온다 — 같은 문구를 `title`로도 단다.

### P0-3. 상대 이름표에 내 쿨다운·잔여 횟수가 그려진다

`cooldownRoundsLeft`([App.tsx:10414](packages/client/src/App.tsx:10414))·`uses:`([:10549](packages/client/src/App.tsx:10549))·`alchemist:left`/`tile_dyeing:left`([:10437](packages/client/src/App.tsx:10437))가 **playerId를 검사하지 않고** 뷰어 본인 채널을 읽어 좌석마다 그린다. `cooldownRoundsLeft`의 주석은 "보유자 본인 채널이라 남의 pill에는 값이 없다"고 전제하는데, **같은 증강을 두 사람이 들면 그 전제가 깨진다.**

중복 보유는 실제로 성립한다 — 수상한 주사위의 `grantAugments`가 후보에서 제외하는 `held`는 **보유자 자신의 증강뿐**이다 ([Augment.ts:480](packages/core/src/augment/Augment.ts:480)). 남이 가진 증강은 안 걸러진다.

**수정 방향**
- UI 가드: 세 갈래 모두 `player.id === view.playerId`일 때만 읽는다. `cooldownRoundsLeft(view, augId, playerId)`로 시그니처를 넓힌다.
- 원인 차단(별건): `grantAugments`의 `held`를 전 좌석 합집합으로 넓힐지는 밸런스 판단이 필요하다.

### P0-4. 화료 시 큰 점수와 바로 아래 증감표의 숫자가 어긋난다

`WinInfo.points`는 **본장·공탁 제외**다 ([flowEvents.ts:166](packages/core/src/mahjong/flow/flowEvents.ts:166)). 본장 가산과 리치봉 수령은 `deltas`에만 들어간다 ([standardActions.ts:940](packages/core/src/mahjong/flow/standardActions.ts:940), [:1043](packages/core/src/mahjong/flow/standardActions.ts:1043)).

결과 화면의 큰 숫자는 `w.points + augPointsOf(...)` ([App.tsx:14691](packages/client/src/App.tsx:14691))라 본장·리치봉이 빠져 있고, 바로 아래 증감표는 그 둘이 포함된 `deltas`를 그대로 찍는다. **2본장 + 리치봉 1개면 `8,000점`이 크게 굴러간 뒤 표에는 `+9,600`이 뜬다.**

게다가 `nextRoundNote`가 `if (!isWin)` 안에서만 만들어져 ([App.tsx:14544](packages/client/src/App.tsx:14544)) 화료 시에는 본장·리치봉 문구가 아예 없다 — 리치봉 1000점을 누가 왜 가져갔는지 화면 어디에도 없다.

**수정 방향**: `WinInfo`에 `honbaBonus`·`riichiPotGain`을 추가([standardActions.ts:988](packages/core/src/mahjong/flow/standardActions.ts:988)에서 채움), 역 목록 끝에 `본장 n본 +N점` / `리치봉 k개 +K점` 두 줄, 큰 숫자는 그 둘까지 더한 최종 수령액으로 굴린다. 본장 단가는 `honbaPerStick` 규칙을 태워야 정확하다(본장 사냥꾼이 이 값을 바꾼다).

### P0-5. 시간 초과 자동 진행이 완전히 무음이다

서버는 마감이 지나면 `safeFallbackOption`(패스 → 마지막 discard(쯔모기리) → 첫 옵션)으로 대신 누르고 `promptCancel`만 보낸다 ([HumanAgent.ts:506](packages/server/src/HumanAgent.ts:506)). 클라는 **UI만 닫는다** ([App.tsx:3203](packages/client/src/App.tsx:3203)) — 토스트도 배너도 없다.

즉 론·펑이 조용히 소실되고, 자기 턴이면 자동 쯔모기리가 나간다. 초읽기(5초) 국에서는 상시 발생한다. 플레이어에게는 "내가 안 눌렀는데 패가 나갔다"로 체감된다.

같은 화면의 **드래프트는 "시간이 다 되면 랜덤으로 결정된다"를 미리 적어 두는데**([App.tsx:14926](packages/client/src/App.tsx:14926)) 정작 결과는 안 알려 준다. 예고와 결과 고지가 비대칭이다.

**수정 방향**
- `PromptCancelMessage`에 `reason: "timeout" | "preempted"`(+ 가능하면 `chosen`: 대신 고른 액션 라벨)를 추가.
  - timeout → `"시간 초과 — 쯔모기리로 진행했습니다"`
  - preempted → `"다른 사람의 선언이 우선합니다"`
- `PromptTimer`([App.tsx:11254](packages/client/src/App.tsx:11254))에 `title`을 달아 **미리** 알린다 — 옵션에 `pass`가 있으면 `"시간이 다 되면 자동으로 패스합니다"`, 내 타패 순이면 `"쯔모한 패가 그대로 나갑니다"`. 5초 이하 긴급 구간에서는 실제로 띄운다.
- 드래프트 자동 선택 후 `showBanner("자동 선택", "info", "{증강명} 획득")`.

### P0-6. 유국역만 32,000점 이동이 "유 국 · 패산 소진"으로만 뜬다

`nagashi_yakuman`은 `outcome="draw"` 정산에 쯔모 역만 지불을 얹는데 ([nagashi_yakuman.ts:97](packages/content/src/augments/nagashi_yakuman.ts:97)) `augPoints`를 남기지 않는다. 컷인은 유국이면 무조건 `"유 국"`([App.tsx:3355](packages/client/src/App.tsx:3355)), 결과 화면 부제는 고정 문구 `"패산 소진 — 텐파이한 사람만 손을 공개한다"`([:14578](packages/client/src/App.tsx:14578)).

한 사람이 +32,000, 다른 사람이 -16,000인 화면에 "역만"이라는 단어도 증강 이름도 없다.

**수정 방향**: `RoundSettledPayload`에 `drawSpecial?: { augId, label, holder }` 추가. 부제를 `"유국역만 — {이름}의 버림패가 전부 요구패·자패"`로 갈고, 컷인도 역만 톤으로.

### P0-7. 용어사전이 이 게임에 없는 규칙을 설명한다

[glossary.ts:446](packages/client/src/glossary.ts:446)이 유국만관을 "버린 패가 전부 1·9와 자패였을 때 유국인데도 만관을 받는 규칙"이라고 단정한다. 저장소 전체에서 유국만관 판정은 `nagashi_yakuman` **증강 하나뿐**이고 표준 유국 정산(`sysSettleDraw`)에는 없다. 증강 없이 요구패만 버린 플레이어는 아무것도 못 받는데 사전은 받는다고 알려 준다.

**수정 방향**: 문구를 `이 게임에서는 "유국역만" 증강을 든 사람에게만 적용된다`로 고치거나, 표준 유국만관을 엔진에 구현한다.

---

## P1 — 적용됐는데 화면에 흔적이 없다

### P1-1. 천하통일 — 게임이 끝나는데 신호가 하나도 없다

보유자 점수가 45000에 닿으면 남은 국을 전부 무시하고 종국한다 ([HanchanController.ts:1287](packages/core/src/match/HanchanController.ts:1287)). `unification.ts`의 view 채널 **0개**, `App.tsx`의 `unification` 언급 **0건**(직접 확인). `GameOverMessage`에 종료 사유 필드 자체가 없다.

동2국에서 갑자기 최종 순위표가 뜨는데 아무 설명이 없다. 파일 주석은 "통일 사이렌이 울리면"이라 적어 뒀지만 그 사이렌이 구현돼 있지 않다.

**수정 방향**
- 진행 중 상시 pill: 보유자 이름표에 `{현재점수}/45000` 게이지(karma 게이지와 같은 꼴).
- 종국 직전 전면 컷인 `"천하통일" / "{이름} — 45000점 도달, 남은 국은 없다"`.
- `GameOverMessage`에 `reason` 추가(아래 P1-2와 함께).

### P1-2. 토비·아가리야메·서입 종국에 사유가 없다

`dobi: true`(0점 이하 즉시 종료, [HanchanController.ts:783](packages/core/src/match/HanchanController.ts:783))와 `agariYame: true`(오라스 오야 연장 + 단독 1위면 종국)가 켜져 있는데 `GameOverMessage`에 사유 필드가 없다. 클라도 "대국 종료"만 띄운다.

**수정 방향**: `GameOverMessage`에 `reason?: "normal" | "dobi" | "agariYame" | "westEntryDecided" | "unification"` 추가 → `GameOverModal` 헤더 아래 한 줄(`"토비 — 누군가 0점 이하가 되어 종료"`).

### P1-3. 통째로 바꾸기 — 손패 13장 강탈에 컷인이 없다

`full_hand_swap`의 공개 채널은 관계표식 하나뿐 ([full_hand_swap.ts:162](packages/content/src/augments/full_hand_swap.ts:162) → [App.tsx:8434](packages/client/src/App.tsx:8434) `RELATION_META`). 피해자 화면에서 손패 13장이 통째로 바뀌는데 컷인·배너·토스트가 없다.

**같은 문제를 3장 교환(등가교환)에서는 이미 고쳤다** — [App.tsx:3813](packages/client/src/App.tsx:3813)이 당사자 둘에게 전용 컷인을 띄운다(주석: 2026-08-12 사용자 지적). 3장은 고치고 13장은 남아 있다.

**수정 방향**: `SWAP3_NOTICE_KEY` 패턴을 그대로 복제. 보유자 `"{상대}의 손패를 통째로 빼앗았다"`, 피해자 `"{보유자}에게 손패를 통째로 빼앗겼다 — 패산에서 새 손을 받는다"`.

### P1-4. 지불자를 바꾸는 증강 5종이 정산 화면에 한 글자도 안 남는다 — 구조 문제

**뿌리 원인**: `augPoints`를 화면에 쓰는 코드가 두 곳뿐이고 둘 다 `w.winner`로 필터한다 ([App.tsx:14616](packages/client/src/App.tsx:14616), [:14449](packages/client/src/App.tsx:14449)). 게다가 둘 다 `winInfos` 루프 안에 있다. 따라서:

- **유국(`outcome="draw"`)의 `augPoints`는 렌더 경로가 아예 없다** — `always_tenpai`가 남기는 노트는 화면에 도달하지 못한다.
- **지불자·패자의 노트도 렌더되지 않는다** — `yakuman_shield`(환급), `die_hard`, `sign_flip`, `all_or_nothing`, `jackpot`(refunded), `blood_contract`, `karma`.
- `points !== 0` 필터 탓에 `devils_advance`(`withAugPoint(p, ctx, 0)`)는 설계상 영영 안 보인다 — 상대 셋이 3,000씩 잃는데 근거 줄이 없다.

그 위에 **아예 노트를 안 남기는** 지불자 재배선 증강들이 얹힌다:

| 증강 | 무슨 일이 일어나는가 | 근거 |
|---|---|---|
| 눈먼 총알 | 방총자의 지불 전액을 **난수로 뽑은 제3자**에게 옮김 | [blind_ron.ts:100](packages/content/src/augments/blind_ron.ts:100) |
| 책임전가 | 론 지불을 **나 뺀 세 명에게 분할** | [blame_shift.ts:60](packages/content/src/augments/blame_shift.ts:60) |
| 희생양 | 쯔모 지불 셋을 **지목 대상 한 명에게** 몰아줌 | [scapegoat.ts:87](packages/content/src/augments/scapegoat.ts:87) |
| 밀정 | 화료자 수령액 **전액 가로채기**(`deltas[winner] = 0`) | [spy.ts:148](packages/content/src/augments/spy.ts:148) |
| 유국역만 | 위 P0-6 | [nagashi_yakuman.ts:104](packages/content/src/augments/nagashi_yakuman.ts:104) |

밀정만 컷인을 낸다. 나머지 넷은 화료패를 버리지도 않은 사람이 8000점을 내는 장면이 무설명으로 뜬다.

**수정 방향** (두 단계)
1. **렌더 구조를 바꾼다** — augPoints 표시를 승자 블록에서 떼어 **증감표 기반**으로 옮긴다. `result-deltas` 각 행([App.tsx:14805](packages/client/src/App.tsx:14805)) 아래에 `settle.augPoints.filter(a => a.player === p.id)` 줄을 붙이고, 유국 블록([:14706](packages/client/src/App.tsx:14706))에도 같은 줄을 단다. 승자 역 목록에는 `han` 단위 노트만 남긴다.
2. **지불 이동 전용 노트를 만든다** — `AugPointNote`에 `kind: "transfer"` / `from` / `to`를 추가하고 위 5종이 채운다. 표시 예: `눈먼 총알 — 방총자 대신 지불 8,000`.

### P1-5. 파오(책임지불)가 엔진에는 있는데 화면에는 0건

`WinInfo.pao`는 실제로 채워지고([standardActions.ts:1005](packages/core/src/mahjong/flow/standardActions.ts:1005)) 책임자는 론이면 파오분 절반, 쯔모면 전액을 문다. 그런데 `packages/client/src` 전체에 `pao`·`책임지불`·`파오` 문자열이 **0건**이다. 대삼원을 확정시킨 후로를 내준 사람이 16,000을 무는데 화면에는 "← 방총자"조차 자기가 아닌 채로 큰 마이너스만 뜬다.

**수정 방향**: 승자 블록에 `책임지불 {이름} — {역명} {points}점` 배지, 증감표의 책임자 행에도 같은 태그. `glossary.ts`에 "파오/책임지불" 항목 추가.

### P1-6. 재접속하면 그 국의 룰 변경 고지가 통째로 증발한다

`detectTransitions`의 `prev === null` 분기(재접속·중간 합류)가 `armedRoundNotices(next)`를 순회하며 **컷인 없이 서명만 시드**한다 ([App.tsx:3437](packages/client/src/App.tsx:3437)). 중복 재생 방지가 의도지만, 결과적으로 재접속자는 초읽기(5초)·눈먼 총알·반전이 이 국에 걸렸다는 사실을 **한 번도 못 본다**.

기준 사례(초읽기)와 정확히 같은 실패 모드다 — 5초 제한을 모른 채 돌아온 사람은 첫 결정을 그대로 흘린다(그리고 P0-5에 따라 그 사실조차 안 알려 준다).

**수정 방향**: 시드 루프에서 재접속 전용 **요약 배너**를 한 번 띄운다 — `showBanner("이번 국 적용 중", "info", notices.map(n => n.title).join(" · "))`. 컷인 대신 배너로 하면 "지금 터졌다"는 오해도 피한다. 같은 자리에서 리치 상태도 시드만 하고 있으므로([:3399](packages/client/src/App.tsx:3399)) 함께 요약할 수 있다.

### P1-7. 관전자가 붙어도 대국자는 전혀 모른다

`spectate` 처리는 관전자 본인에게만 `spectateStarted`를 보내고 **방의 플레이어에게는 아무것도 보내지 않는다** ([RoomManager.ts:2540](packages/server/src/RoomManager.ts:2540)). 관전 뷰는 `SPECTATOR_ID`라 전원의 손패·패산·뒷도라가 그대로 열린다. 관전 종료 시에도 알림이 없다.

내 손패가 지금 누군가에게 열려 있다는 것은 가장 민감한 정보다. (현재 관전은 관리자 전용이지만, 그렇다고 무고지가 정당화되지는 않는다.)

**수정 방향**: `room.spectators` 크기가 0→1이 되는 순간 플레이어 전원에게 토스트 `"관리자가 이 게임을 관전 중입니다"` + 게임 화면에 상시 `👁 관전 중` 칩(`ModeBadge` 옆).

### P1-8. 중단 투표가 재접속으로 조용히 무산된다

`abortVote`는 접속 끊김·투표·좌석 이탈 확정 3곳에서만 나가고 **재접속 경로에는 없다** ([RoomManager.ts:2620](packages/server/src/RoomManager.ts:2620), 재접속 [:1893](packages/server/src/RoomManager.ts:1893)). 그런데 `needed`는 `isConnected()`인 사람 수라 재접속과 동시에 조용히 +1 된다. 결과: 돌아온 사람은 걸려 있는 투표를 못 보고, 남은 사람들 화면은 낡은 정족수를 계속 표시한다.

또 `abortVote` 수신 시 state만 갱신하고 알림이 없어([App.tsx:3275](packages/client/src/App.tsx:3275)) **설정 패널을 열어야만** 현황이 보인다 — 남이 투표를 시작해도 나는 모른다.

**수정 방향**
- 서버 한 줄: `joinRoom`의 재접속 분기(`refreshSeatStatus` 뒤)에 `this.retallyAbortVotes(room)`.
- 클라: 첫 투표 도착 시 토스트 1회 + 설정 버튼에 뱃지.

### P1-9. 모래시계 — 유국이 취소되고 혼자 4번 뽑는데 pill 하나뿐

황패유국 선언 순간 보유자가 텐파이면 국이 끝나지 않고, 왕패 4장이 패산으로 넘어와 **보유자 혼자 연속 쯔모**한다 ([hourglass.ts:100](packages/content/src/augments/hourglass.ts:100)). 화면 신호는 이름표 pill `"4장"` 하나. `ROUND_SETTLED` 인터셉터라 `actionFx` 컷인도 안 나간다.

전원이 유국을 기다리는데 국이 안 끝나고 한 사람만 계속 뽑는, 판이 가장 극적으로 뒤집히는 순간이다.

**수정 방향**: `AUG_EVENTS`에 추가 — `"뒤집힌 모래시계" / "{이름} — 유국이 취소됐다 · 왕패 4장을 혼자 뽑는다"`. 연장 중에는 뱃지 줄에 `⏳ 연장 {n}장 남음`.

### P1-10. 가려진 도라 — "숨겨진 것"과 "아직 안 열린 것"이 같은 그림이다

`dora_conceal`은 view 채널을 **하나도** 발행하지 않는 순수 Modifier다. `PlayerView`가 비보유자의 `doraIndicators`를 빈 배열로 만들고([PlayerView.ts:914](packages/core/src/information/PlayerView.ts:914)), 클라는 남은 칸을 `dora-back`으로 채운다([App.tsx:9633](packages/client/src/App.tsx:9633)) — **아직 안 뒤집힌 슬롯과 완전히 동일한 그림**이다. `useDoraFx`도 함께 비어 도라 반짝임이 전부 꺼지는데 그 이유도 안 나온다.

**수정 방향**: 표시패가 0칸인데 국이 진행 중이면 `center-dora`에 `"🌑 가려진 도라 — {보유자}"` 태그(`center-ura-peek`과 같은 형태). 증강 보유 자체가 공개 정보라 클라가 보유자를 바로 안다. 국 시작 컷인(`armedRoundNotices` 계열)도 함께 검토 — 초읽기와 같은 성격의 "이번 국 규칙이 바뀌었다"이다.

### P1-11. 형태 변경 패시브 6종 — 규칙 위반처럼 보이는 손이 무설명으로 공개된다

동수의 결속 · 양극 · 비대칭 · 왕의 징표 · 바람의 계보 · 장사진. 전부 `setHolderRule` 하나짜리 패시브라 view 채널이 **0개**다.

결과창에 `1만1통1삭` 커쯔, `199` 몸통, `동남서` 슌쯔, `3-4-5-6` 깡이 공개되는데 역 목록 어디에도 근거가 없다. 결과창은 승자의 증강 목록을 아예 표시하지 않는다. (대기 표시 자체는 `waitDecompOptions`가 미러링해 정확하다.)

**수정 방향**: 결과창 승자 블록에 "이 손을 성립시킨 증강" 줄 — `view.players[winner].augments` ∩ 형태변경 화이트리스트를 이름으로 나열. `yakulessLabel`([App.tsx:14483](packages/client/src/App.tsx:14483))이 같은 자리에 비슷한 줄을 내고 있어 그 옆에 붙이면 된다.

### P1-12. 일발 유효 여부가 뷰에 오는데 클라가 한 번도 읽지 않는다

`PlayerRoundView.ippatsu`는 본인 뷰에 채워지는데([PlayerView.ts:175](packages/core/src/information/PlayerView.ts:175)) `App.tsx` 전체에서 `.ippatsu`를 읽는 곳이 없다. 리치 후 누가 울어서 일발이 깨졌는지가 화면에 남지 않는다. 1판 차이가 만관/하네만 경계를 가르는데 **정보가 이미 전선에 실려 와서 버려지고 있다.**

**수정 방향**: 이름표의 `np-furiten`/`np-noyaku` 옆([App.tsx:10902](packages/client/src/App.tsx:10902))에 리치 중 + `ippatsu === true`일 때만 "일발" 칩. 깨지면 조용히 사라지는 것 자체가 정보다. (전원 공개 자리인 `plate-stick`은 본인 전용 정보라 부적합.)

### P1-13. 쿨다운·잔여 횟수가 화면에 안 실리는 증강들

공용 규약(`cooldownViewKey`/`publishUsesLeft` → pill `🕐N국`·`n회`)을 안 쓰고 자체 카운터를 쓰는 것들:

| 증강 | 실제 제약 | 근거 |
|---|---|---|
| 천하무적 | 2국 1회 | [invincible.ts:37](packages/content/src/augments/invincible.ts:37) |
| 봉인술사 | 2국 1회 | [discard_lock.ts:68](packages/content/src/augments/discard_lock.ts:68) |
| 예지 | 열람 4순 쿨다운 · 재배열 국당 1회 | [foresight.ts:125](packages/content/src/augments/foresight.ts:125) |
| 찬탈자 | 2국 1회 — **게다가 쿨다운 중에도 버튼이 그대로 뜨고 누르면 조용히 반려된다** | [pseudo_dealer.ts:116](packages/content/src/augments/pseudo_dealer.ts:116) |

예지는 "재배열은 국에 1회"라 두 번째 발동에서 드래그가 안 먹히는데 이유가 화면에 없다. 찬탈자는 정보 부족을 넘어 **작동하지 않는 버튼**이다.

추가로, 횟수 제한이 있는데 `publishUsesLeft`를 아예 안 거는 증강 11종: `jackpot`, `take_back`, `blood_contract`, `counter`, `riichi_seal`, `scapegoat`, `spy`, `stealth_riichi`, `open_riichi_reveal`, `rank_gate`, `devils_advance`.

순 단위 쿨다운(`take_back` 3순, `foresight` 4순, `future_sight` 3순, `bottom_deal` 매 순)은 채널 자체가 없어 **버튼이 사라지는 것으로만** 알 수 있다.

**수정 방향**: 전부 `trackRoundSeq` + `cooldownReady/cooldownUse` / `publishUsesLeft`로 정렬하면 기존 pill 배관이 그대로 그린다. 순 단위 쿨다운도 보유자 전용 채널로 `"다시 열리기까지 N순"`을 싣는다. 찬탈자는 `holderTurnOptions` 게이팅도 함께.

### P1-14. 봇 난이도는 게임에 들어가는 순간 확인 불가

`botDifficulty`는 `LobbyMessage`에만 있고 `PlayerView`/`PlayerInfo`에는 없다. 적용 자체는 정상(`withDifficulty`)이지만 게임 중·결과·리플레이 어디에도 표시가 없다. 성향(원형)은 이름표와 순위표에 있어 대비가 뚜렷하다. 전적·리더보드에 기록되는 판인데 "봇이 쉬움이었나"를 사후 확인할 수 없고, 게스트 체험 방은 대기실을 안 거쳐 **한 번도 못 본다**.

**수정 방향**: `ModeBadge` 옆에 난이도 칩. `lobby` state가 게임 시작 후에도 남으므로 클라만 고쳐도 되고, 정확히 하려면 `PlayerInfo`나 표시 전용 필드로 싣는다.

---

## P2 — 보이지만 근거가 부족하다

### P2-1. 우마·오카가 화면 어디에도 없다

`RankingEntry`는 `uma`·`oka`·`rawScore`를 실어 보내는데([protocol.ts:626](packages/core/src/network/protocol.ts:626)) 클라는 `rawScore`와 `score`만 그린다([App.tsx:15070](packages/client/src/App.tsx:15070)). `우마`·`오카`·`토비` 문자열은 `App.tsx`에 **0회**. 기본값 `uma [5,15]`, `oka 0`이라 3위가 -5, 4위가 -15를 조용히 먹는다.

**수정 방향**: `rank-row`에 `원점 → +우마 (+오카) = 최종` 분해 표기(서버 변경 불필요). 대기실 팁에 "우마 +15/+5/-5/-15, 반환점 30000" 한 줄.

### P2-2. 정산 화면을 닫으면 다시 볼 방법이 없다

- `ReplayViewer`는 `GameTable`과 재생 바만 렌더한다 — `settle`을 읽는 코드가 없어 역·판·부·증감을 리플레이에서 되짚을 수 없다.
- 📜 기록은 연출 텍스트만 담아 화료는 `"론!" / 이름` 정도이고 만관 이상만 점수 한 줄이 붙는다.
- 결과 화면은 `setRoundResult(null)`로만 닫히고 다시 여는 경로가 없다.

**볼 시간 자체는 충분하다**(`INTER_ROUND_DELAY_MS` 20초 + 카운트다운). 문제는 "다시 볼 방법"만 없다는 것.

**수정 방향**: (a) 클라가 `roundOver`를 국별로 쌓아 📜 기록에 "지난 국 정산" 탭 → `RoundResultPanel`을 읽기 전용(`deadlineAt=null`)으로 재사용. (b) 리플레이는 `rebuildReplay`가 이미 이벤트 로그를 읽으므로 `ROUND_SETTLED`를 잡아 국 끝 프레임에서 같은 패널을 띄운다.

### P2-3. 정산 중 판을 볼 수 없고, 표도라 표시패가 전송조차 안 된다

결과 화면은 `도라 N판`만 적고 표시패를 안 보여준다. `RoundOverMessage`에 표도라 필드가 아예 없다(`uraDoraIndicators`만 있음, [protocol.ts:594](packages/core/src/network/protocol.ts:594)). 게임판을 훔쳐볼 수도 없다 — `PEEK_OVERLAY_SEL`은 `.overlay-peekable, .rinshan-pick-overlay`인데 결과 오버레이 클래스는 거기 없고([App.tsx:4378](packages/client/src/App.tsx:4378), [:14555](packages/client/src/App.tsx:14555)) 배경이 판을 완전히 덮는다.

**수정 방향**: `RoundOverMessage`에 `doraIndicators` 추가 + `notifyRoundOver`에서 `includeTile`. 결과 화면 `result-ura` 위에 같은 형식의 `표도라` 줄. 부수적으로 `.result-overlay`에 `overlay-peekable`을 붙이면 버림패까지 확인 가능해진다.

### P2-4. 증강이 얹은 도라·판이 표준 도라와 구별되지 않는다

- 증강 개인 도라/뒷도라는 표준 배열에 **그대로 이어 붙어** 합산된다([helpers.ts:702](packages/core/src/mahjong/scoring/helpers.ts:702)). 화면에 뜬 뒷도라 표시패 1장으로 설명되지 않는 `뒷도라 3판`이 나와도 근거를 알 수 없다.
- `score.extraHan`은 최소 5개 증강(`ankan_dora`·`riichi_upgrade`·`cliff_bloom`·`no_retreat`·`true_dragon`, 여기에 `late_double`)이 가산하는데 화면에는 익명 한 줄 `증강 보너스 N판`으로만 뜬다([App.tsx:14602](packages/client/src/App.tsx:14602)). 둘 이상 겹치면 어느 증강이 몇 판인지 알 수 없다.

**수정 방향**: `WinInfo`에 `extraHanBy?: { augId, han }[]`·`extraDoraHan?`을 추가(모디파이어마다 `source`가 이미 있다). `증강 보너스` 한 줄을 증강별로 펼치고, 도라 줄은 `도라 5판 (표시패 3 · 거울의 도라 2)` 형태로 나눈다. 또는 `extraHan` 대신 `augPoints`에 `han` 필드로 실어 이름이 찍히게 한다.

### P2-5. 상대가 고민하는 30초 동안 "차례"가 방금 버린 사람에게 붙어 있다

타패 후 `phase`는 `"reaction"`이 되지만 `turnSeat`은 버린 사람 그대로다. 차례 표시는 전부 `turnSeat`만 본다(`np-turn` [App.tsx:10726](packages/client/src/App.tsx:10726), `plate-turn` [:9603](packages/client/src/App.tsx:9603), 이름표 펄스). 누군가 론/펑을 최대 30초 고민하는 동안 판이 멈춰 보인다. 접속 상태 칩에는 "생각 중과 끊김을 구분하려고"라는 주석까지 있는데 정작 "생각 중"에 해당하는 표시가 없다.

**수정 방향**: `RoundView`에 "지금 결정을 기다리는 좌석" 배열을 싣고(공개 정보다 — 실제 탁자에서도 누가 손을 멈췄는지 보인다) `np-conn`과 같은 자리에 "생각 중" 칩. 뷰 확장이 부담이면 최소 조치로 `phase === "reaction"`일 때 차례 표시를 끄고 중앙에 `"다른 자리의 선언을 기다리는 중"` 한 줄.

### P2-6. 왜 리치·깡을 못 하는지 알 길이 없다

`ActionBar`는 서버가 준 옵션만 그린다. 리치 차단 사유는 서버에 다섯 가지가 명시돼 있지만([standardActions.ts:176](packages/core/src/mahjong/flow/standardActions.ts:176) — 리치 봉인/멘젠 아님/점수 1000 미만/패산 부족/텐파이 아님) 이는 `validate` 반환값이라 **옵션이 제시되지 않는 경로**에서는 클라에 안 간다. 화면에는 버튼이 그냥 없다.

증강 리치 봉인과 손패 조작 차단은 이미 이유를 적어 준다(`ActiveInfoBadges`, `opp-arm-blocked`). **평범한 리치 불가**(점수 1000 미만·패산 4장 미만·손 열림)와 **깡 불가**만 구멍이다. 점수가 1000 아래로 떨어진 순간부터 리치 버튼이 영영 안 뜨는데 인과가 없다.

**수정 방향**: 서버가 `DecisionPrompt`에 `unavailable: {type, reason}[]`을 얹는 것이 정확하다. 가벼운 대안으로, 클라가 확실히 아는 조건만 검사해(`pushRiichiImminent`가 이미 같은 판정을 한다) 비활성 [리치] 버튼 + `title`.

### P2-7. 액티브 증강 버튼이 "왜 못 쓰는지" 말하지 않는다

쓸 수 없을 때 title이 `지금은 사용할 수 없습니다 — {이름들}`뿐이다([App.tsx:13763](packages/client/src/App.tsx:13763)). 쿨다운·잔량은 pill이 보여주지만 "국의 첫 순에만"(big_hand·jackpot·table_flip·full_hand_swap·dead_wall_master), "리치 중 불가", "텐파이 필요", "패산이 비었다" 같은 상태 조건은 화면 어디에도 없다.

**수정 방향**: 서버가 `validate` 반려 사유를 오퍼에 함께 싣고 버튼 title/메뉴에 붙인다.

### P2-8. 드래프트 카드가 상충·배제 관계를 안 알려 준다

- **역시너지(`anti`/`antiIds`)가 클라에 전혀 전달되지 않는다** — `packages/client/src` grep 0건. 시너지는 확률만 기울일 뿐 막지 않으므로 **서로 죽는 증강이 그대로 제시된다**: `hidden_blade`(anti riichi), `ura_peek`↔`soul_hunt`(완전 중복), `rinshan_preview`↔`dead_wall_master`, `hidden_river`↔`brief_fog`, `invincible`↔`no_ron_pact`, 스텔스 리치↔`riichi_open`/`riichi_deny`.
- **`conflicts`가 `AugmentCatalogEntry`에 필드조차 없다** — 11종이 선언하는데, 그 증강을 집는 순간 상대 증강들이 후보에서 **조용히 사라진다**. 플레이어는 이유를 모른다.
- 드래프트 오버레이의 `보유 중` pill은 이름 + description뿐이라 **쿨다운·소진 여부가 안 보인다** — 이미 다 쓴 증강 위에 시너지를 얹으려다 헛집을 수 있다.

**수정 방향**: `anti`/`antiIds` 매칭 결과를 서버가 오퍼에 실어 카드에 `⚠ 보유 중인 X와 상충` 배지. `AugmentCatalogEntry`에 `conflicts` 추가 → 도감 배지 `"함께 가질 수 없음: …"`. `보유 중` pill에 이름표와 같은 잔량/쿨다운 칩 재사용.

### P2-9. 박무 — 지속 상태가 접힌 📜 패널의 글줄 하나뿐

선언 컷인은 뜨지만 6순 지속 상태는 채널 head가 `PILL_OWNED_HEADS`·`AUG_EVENT_HEADS`·`RELATION_HEADS` 어디에도 없어 **폴백 로그 문자열**로만 떨어진다(📜 버튼 뒤, 기본 닫힘). 같은 계열인 안개 덮인 바닥(`hidden_river`)은 `ActiveInfoBadges`에 상시 뱃지가 있다([App.tsx:12921](packages/client/src/App.tsx:12921)) — 박무만 없다.

**수정 방향**: `hidden_river` 뱃지 옆에 `🌁 박무 / "{이름} 선언 — 바닥이 {n}순 동안 가려진다"`. 값에 이미 남은 순이 들어 있다.

### P2-10. 카운터 / 누명 — 피해자가 무슨 일을 당했는지 모른다

- **카운터**: 선리치자가 공탁 1000을 대납하고 **일발이 즉시 소멸**하는데, 신호는 관계표식 ↩️뿐. 일발 소멸은 화면에 흔적이 없다([counter.ts:224](packages/content/src/augments/counter.ts:224)).
- **누명**: 내 바닥에 안 버린 패가 심어져 후리텐이 되는데 관계표식 🖼뿐. 게다가 **후리텐 툴팁이 `"내가 이미 버린 패가 오름패에 있습니다"`라고 거짓을 말한다**([App.tsx:12540](packages/client/src/App.tsx:12540)).

**수정 방향**: 둘 다 피해자 전용 컷인(격/`rank_gate`의 피격자 패턴 [App.tsx:3848](packages/client/src/App.tsx:3848)). 누명은 `FuritenReason`에 `"framed"` 추가가 정공법이지만 코어 타입 변경이라, 가벼운 대안은 피해자 뷰에 채널을 실어 뱃지 `"🖼 누명당한 패 — 이 종류로 론할 수 없다"` + 해당 패 표시.

### P2-11. 화료 시 "친 연장 / 본장" 안내가 유국에만 나온다

`nextRoundNote` 조립이 `if (!isWin)` 안에 있다([App.tsx:14544](packages/client/src/App.tsx:14544)). `dealerContinues`는 화료 정산에도 실려 오는데 안 쓴다. 친이 화료해 연장인지, 친이 넘어가는지, 본장이 몇 개가 되는지 결과 화면에서 알 수 없다.

**수정 방향**: `nextRoundNote`를 outcome과 무관하게 만들고 화료일 때 `친 연장 · {honba}본장` / `친 넘어감`을 붙인다.

### P2-12. 쯔모 분담과 더블론 분해가 없다

`ScoreResult.payments`(론 `discarder` / 쯔모 `dealer`·`others`)가 `deltas` 계산에만 쓰이고 `WinInfo`에 안 실린다. 자 쯔모의 "친 3,900 / 자 2,000씩" 표준 분담이 어디에도 없고, 더블론에서 한 방총자가 두 화료자에게 내는 금액이 한 덩어리로 합쳐진다(리치봉은 `winInfos[0]`에게만 가는데 그것도 미표시).

**수정 방향**: `WinInfo`에 `payments`를 그대로 싣고 승자 블록 아래 `친 3,900 · 자 2,000×2` 한 줄. 증감표 지불자 행에 `← {화료자} {금액}` 태그.

### P2-13. 대기실 설정 변경에 알림이 없고 준비 상태도 초기화되지 않는다

`setGameMode`·`setBotDifficulty`·`shuffleSeats` 모두 값만 바꾸고 `broadcastLobby`만 한다. `room.ready`는 안 건드린다. 클라의 `lobby` 처리는 `setLobby(msg)` 한 줄뿐 — diff도 토스트도 없다. 방장이 나가면 `hostId`가 조용히 넘어간다.

동풍전으로 준비를 눌렀는데 반장전으로 시작하거나, 친이었던 내 자리가 섞여도 모른 채 시작할 수 있다.

**수정 방향**: 클라에서 이전 `lobby`와 비교해 토스트(서버 변경 불필요) — `"판 길이가 반장전으로 바뀌었습니다"`, `"자리를 다시 뽑았습니다 — 당신은 남가입니다"`, `"당신이 방장이 되었습니다"`. 모드 변경 시 서버에서 `room.ready.clear()`를 함께 하는 편이 안전하다.

### P2-14. HUD 텍스트에 용어 툴팁이 하나도 안 걸려 있다

`TermText`/`GlossaryTerm`은 증강 설명·도감·도움말·샌드박스에서만 쓰인다. 정작 판 위의 `供`·`본장`·`×N`·`후리텐`·`역없음`·`쯔모기리`·`형식 텐파이`는 맨 글자이거나 `title` 한 줄이다. 글로서리에는 그 항목이 전부 있는데 처음 만나는 자리에서 연결되지 않는다. `供`은 한자 한 글자라 추측조차 어렵다.

또 이름표의 `후리텐`에 `title`이 없다([App.tsx:10902](packages/client/src/App.tsx:10902)). 사유 문안 `FURITEN_REASON_TEXT`(버림/일시/리치)는 이미 있는데 `WaitsBadge`에서만 쓰이고, **그 뱃지는 손패 14장(내 쯔모 순)에는 사라진다**. 그 순간 "한 순만 참으면 되는 일시 후리텐"과 "이 국은 끝난 리치 후리텐"이 같은 두 글자로 보인다.

**수정 방향**: `center-sub` 세 항목과 이름표 후리텐·역없음에 `GlossaryTerm`을 걸거나 `GLOSSARY`의 `short`를 키로 끌어 `title`로. `np-furiten`에 `title={reasons.map(r => FURITEN_REASON_TEXT[r]).join(" · ")}` — 한 줄이고 `noYaku` 칩이 이미 같은 방식이다.

### P2-15. 오라스·남은 국 수 표시가 없다 (봇은 받는 정보)

중앙 패널은 `東1국`·본장·공탁·패산만 그린다. "마지막 국" 표식이 없다. 봇은 이 정보를 명시적으로 받는다 — `agent.setGameMode`에 달린 주석이 *"뷰에 없는 정보다. 이게 있어야 봇이 지금이 올라스인가를 알고 순위를 지키거나 뒤집는 판단을 한다"* 고 직접 적고 있다([RoomManager.ts:3241](packages/server/src/RoomManager.ts:3241)). **봇에게는 주고 사람에게는 안 주는 정보다.** P0-1(서입)과 겹치면 체감이 커진다.

**수정 방향**: `center-sub`에 `마지막 국` 칩(`round.mode`로 maxWind 유도). 그 국 시작 배너 `sub`에도 `"오라스"`.

### P2-16. 뒤늦은 출진 등 — `extraHan` 기여자가 익명이다

P2-4와 같은 뿌리. `late_double`의 추가 1판이 `증강 보너스 1판`으로만 뜬다.

---

## P3 — 설명문이 제약을 빠뜨린다

증강 113종 전수 대조 결과: **수치(배수·판수·장수·확률) 자체가 틀린 곳은 0건.** 전항목 일치 55종. 나머지는 조건·제약 누락이다. 플레이어가 오해해 손해 볼 정도(상/중)만 옮긴다.

### 상 — 오해하면 판을 잃는다

| 증강 | 설명이 빠뜨린 것 | 근거 | 제안 문구 |
|---|---|---|---|
| **성립하지 않는 깡** | 상대가 깡을 선언하는 순간 **론 여부와 무관하게 손패 1장이 영구히 덮어써진다.** 되돌리는 코드가 없고, 론을 넘기거나 새 대기가 후리텐이면 원래 대기가 사라진 채 국이 끝난다 | [void_kan.ts:109](packages/content/src/augments/void_kan.ts:109) | "⚠ 발동하면 **론을 하든 안 하든 손패 한 장이 그 자리에서 영구히 바뀐다.** 어느 패가 바뀌는지 고를 수 없고, 창깡 론을 넘기거나 바뀐 대기가 후리텐이면 원래 대기는 그대로 사라진다." |
| **등가교환** | "게임 내 2회"는 교환 2회가 아니라 **대상 지정 2회**. 대상이 리치를 걸거나 3장을 못 고른 채 국이 끝나면 그 1회는 소멸 | [hand_swap3.ts:258](packages/content/src/augments/hand_swap3.ts:258) | "**횟수는 대상을 지정하는 순간 소비된다** — 교환을 끝내지 못하고 국이 끝나거나 상대가 리치를 걸면 그 1회는 돌아오지 않는다." |
| **선언 간파** | **위조는 내가 리치 중이면 불가**(`riichi: hand is frozen`). 리치 걸어 두고 나중에 위조하는 플레이가 통째로 죽는다 | [peek_riichi_waits.ts:173](packages/content/src/augments/peek_riichi_waits.ts:173) | "위조는 **내가 리치를 걸기 전에만** 할 수 있다 — 리치를 걸면 손이 동결되어 이 경로로도 패를 바꿀 수 없다." |
| **밥상 뒤엎기** | ① "반납한 손패 13장" → 실제는 **그 순 쯔모패까지 14장**(진짜 용이면 17장) ② **치·펑 직후에는 발동 불가**(`lastDrawnTile === null`) — 첫 순에 울면 그 국 1회가 통째로 날아감 | [table_flip.ts:66](packages/content/src/augments/table_flip.ts:66) | "…**그 순의 쯔모패까지 포함해 전부** 잠깐 공개된다. **쯔모 없이 맞은 순(치·퐁 직후)에는 발동할 수 없다.**" |

### 중 — 알았으면 다르게 플레이했을 것

| 증강 | 차이 | 근거 |
|---|---|---|
| 오픈 리치 | 직격 역만 판정이 **"론 패가 공개된 오름패인지"를 안 본다** — 조건은 "선언 + 론 + 쏜 사람 비리치"뿐. detail이 실제보다 좁게 읽힌다. `conflicts` 3종도 미기재 | [open_riichi_reveal.ts:212](packages/content/src/augments/open_riichi_reveal.ts:212) |
| 큰손 | "화료 못 하면 아무 일도 안 일어난다" → **선언 순간 2국 쿨다운이 이미 소모** | [big_hand.ts:92](packages/content/src/augments/big_hand.ts:92) |
| 핏빛 계약 | "그 국 점수 1.5배" → **공탁·본장 수령분은 배수 대상에서 제외** | [blood_contract.ts:120](packages/content/src/augments/blood_contract.ts:120) |
| 박무 / 함구령 | "6순 동안"인데 기준 키가 국 스코프라 **국이 끝나면 즉시 해제**. 사용 횟수는 이미 소모 | [brief_fog.ts:66](packages/content/src/augments/brief_fog.ts:66), [call_seal.ts:37](packages/content/src/augments/call_seal.ts:37) |
| 허장성세 | 미기재 제약 4종: 리치 중 불가 / 함구령에 막힘 / 패산 0장이면 불가 / 희생할 잡패 없으면 불가 | [bluff_pretense.ts:109](packages/content/src/augments/bluff_pretense.ts:109) |
| 복수자 | "원수의 **버림패에 한해**" → 구현은 **창깡(원수의 가깡 강탈)** 도 포함 | [avenger.ts:50](packages/content/src/augments/avenger.ts:50) |
| 숨은 칼날 | **리치를 취소해도(승부수·손바닥 뒤집기) 그 국에는 +2판·뒷도라가 안 되살아난다** | [hidden_blade.ts:73](packages/content/src/augments/hidden_blade.ts:73) |
| 이중 선언 | "하가의 리치가 **그 국 동안** 봉인" → 실제로는 **내 리치가 살아 있는 동안만** | [riichi_upgrade.ts:147](packages/content/src/augments/riichi_upgrade.ts:147) |
| 붉은 손길 | "내 손에 들어올 때마다" → `handIdsOf`(암패 존)만 대상이라 **후로로 가져온 패는 각인 안 됨** | [red_five_touch.ts:91](packages/content/src/augments/red_five_touch.ts:91) |
| 등 떠밀기 | 강제 리치에 **공탁 낼 점수 + 패산 하한 + 리치 미봉인** 조건이 더 있음. 낙인은 **대상이 스스로 건 리치로도 소진** | [push_riichi.ts:81](packages/content/src/augments/push_riichi.ts:81) |
| 사방치기 | **보유자의 원격 치가 원래 상가의 일반 치보다 우선**한다는 사실 미기재 | [FlowController.ts:586](packages/core/src/mahjong/flow/FlowController.ts:586) |
| 북풍 상인 | ① "**남의** 깡 네 번" → `rinshanRemaining`은 자기 깡도 셈 ② **패산이 비면 못 뺀다** 미기재 | [north_trader.ts:135](packages/content/src/augments/north_trader.ts:135) |
| 귀환 | **리치 중 발동 불가**가 어디에도 없음 | [honor_return.ts:94](packages/content/src/augments/honor_return.ts:94) |
| 잔상 | description엔 `(2국에 1회)`가 있는데 **detail에는 쿨다운이 한 글자도 없다** — 도감만 읽으면 매 순 쓰는 것으로 읽힘 | [dora_afterimage.ts:127](packages/content/src/augments/dora_afterimage.ts:127) |
| 진짜 용 | detail의 배제 목록에 **`void_kan`이 빠져 있다**(`conflicts`에는 있음) | [true_dragon.ts:114](packages/content/src/augments/true_dragon.ts:114) |
| 왕패의 주인 | "그 뒤 **짝수 자리**가 도라 표시패" → 깡이 나면 앞에서 줄어 홀수 자리가 됨(코어는 뒤에서 셈) | [GameState.ts:280](packages/core/src/engine/state/GameState.ts:280) |
| 뒤섞인 아홉 개의 연꽃 | description "울면" ↔ detail "안깡 포함" — **두 문구가 서로 어긋남**(detail이 맞음) | [mixed_nine_gates.ts:143](packages/content/src/augments/mixed_nine_gates.ts:143) |
| 영상 정찰 | "자신만 **항상** 볼 수 있다" → 남은 영상패가 0이면 열람도 닫힘 | [rinshan_preview.ts:174](packages/content/src/augments/rinshan_preview.ts:174) |
| 양극 | detail 1문단 "깡은 대상이 아니다" ↔ 2문단 "가깡은 얹을 수 있다" — **자기모순**(2문단이 맞음) | — |
| 삼원의 의지 | detail이 "두 장"을 단정, 실제는 `3 - have`로 1~2장 | — |
| 책임전가 | 더블론이면 3분할이 아니라 2분할 | — |
| 천하통일 | **우승 확정이 아니라 종료 조건일 뿐** — 같은 정산에서 남이 더 높으면 그쪽이 우승 | — |

### `augmentBrief.ts` 요약 배지가 제약을 떨어뜨린다

`client_augment_brief.test.ts`가 막는 것은 "배지가 원문보다 넓은 횟수를 지어내는" **한 방향뿐**이라, 반대 방향(제약을 통째로 떨어뜨리는 것)이 남아 있다.

| 증강 | 배지 vs 원문 | 심각도 |
|---|---|---|
| void_kan | 배지 `상시` ↔ 원문 `상시 · **리치 중에는 발동하지 않는다**`. 요약 본문에도 없어 **리치 플레이어가 함정에 그대로 걸린다** | 상 |
| eternal_dealer | 배지 `상시` ↔ `상시 · **연장은 게임 내 3회**`. 요약도 연장을 안 말함 | 중 |
| karma | 배지 `상시` ↔ `상시 적립 · **게이지 8,000 이상일 때 발동**`. 요약 "태우면"에 문턱 없음 | 중 |
| mixed_nine_gates | 배지 `상시` ↔ `상시 · **멘젠 한정**` | 중 |
| red_five_touch | **리치 제약**이 사라짐 | 중 |
| genesis / suit_unify / hand_swap3 | 원문의 `**한 국에 1회**`가 떨어짐 | 중 |
| take_back | 요약이 "**전원에게 공개**"라는 유일한 대가를 뺌 | 중 |

`blind_ron`·`cornucopia`·`sign_flip`·`time_pressure`는 **description에 머리말 자체가 없어** 배지를 요약이 단독으로 지어낸다 — 원문과 대조할 근거가 없다.

---

## 부수 발견 — 정보 문제가 아닌 실제 버그

조사 중 나온 것들. 정보 결손과 별개로 잡아야 한다.

1. **승부수(리치 취소) 후 상태가 안 정리된다** — 리치 BGM이 안 꺼지고(`riichiBgm.stop()`은 국 종료·새 국에서만), `shown.riichi`에서 좌석이 안 빠져 **같은 국에 다시 리치를 걸면 컷인·BGM이 아예 안 나온다** ([App.tsx:3589](packages/client/src/App.tsx:3589) 추가 / [:3477](packages/client/src/App.tsx:3477) 리셋).
2. **`bluff_pon`이 `ACTION_AUGMENT`에 없다** — `ACTION_LABEL`에는 있는데([App.tsx:258](packages/client/src/App.tsx:258)) 매핑이 빠져 `augmentCategory("bluff_pon")`이 `etc` 폴백으로 떨어진다. 컷인의 계열 색·아이콘이 틀린다. `silent_pon`은 매핑돼 있다([:404](packages/client/src/App.tsx:404)). **한 줄 수정.**
3. **찬탈자 버튼이 쿨다운 중에도 뜬다** — `holderTurnOptions`가 무조건 옵션을 내보내 누르면 조용히 반려된다 ([pseudo_dealer.ts:124](packages/content/src/augments/pseudo_dealer.ts:124)).
4. **철벽/개문선언/무형화료 +판이 오야 취급 증강과 겹치면 0이 된다** — core 로컬 `addWinHanBonus`가 오야를 `dealerSeat`만으로 판정한다([standardAugments.ts:81](packages/core/src/augment/standardAugments.ts:81)). 콘텐츠 쪽 `content/util.ts:748`은 `win.treatAsDealer`를 함께 본다 — 그쪽이 정답.
5. **회수(discard_recall)가 `lastDrawRinshan`을 안 끈다** — 깡 직후 회수하면 **바닥에서 되가져온 패로도 영상개화 +1판**이 붙는다. validate에 리치 가드도 없다 ([standardAugments.ts:330](packages/core/src/augment/standardAugments.ts:330)).
6. **영혼의 일격 +1판이 리치 취소 후에도 남는다** — 국 스코프 플래그만 보고 리치 생존을 안 본다. 같은 계열 `riichi_upgrade.ts:173`은 생존을 함께 본다.
7. **`remainingCounter`가 엿보기로 실제 보고 있는 상대 손패를 안 센다** — 툴팁은 그 숫자를 "아직 보이지 않은 장수"라고 설명하는데 계산과 어긋난다 ([waitCounts.ts:67](packages/client/src/waitCounts.ts:67)). 오차는 안전한 방향(실제보다 큼).
8. **`PlayerRoundView.sealedKinds`가 클라에서 전혀 안 쓰인다** — 현재 `discard.blockedKinds`를 거는 증강이 없어 무해하지만, 종류 단위 봉인이 추가되면 자물쇠가 안 그려진다.
9. **`grantAugments`의 중복 필터가 자기 증강만 본다** — P0-3의 원인. 밸런스 판단이 필요한 별건.
10. **중앙 패널 `역행` 칩을 켜는 증강이 없다**(미확인) — `turn.direction`을 `-1`로 바꾸는 콘텐츠가 grep에 없다. 죽은 표시인지 예약인지 확인 필요.

---

## 착수 순서 제안

1. **문구만 고치면 되는 것** (코드 위험 0, 즉시) — P0-2(봉인 "이번 국"), P0-1(대기실 sub), P0-7(글로서리 유국만관), P3 설명문 일괄, `bluff_pon` 매핑 한 줄.
2. **클라만 고치면 되는 것** (데이터는 이미 와 있음) — P2-1(우마·오카), P1-12(일발), P2-14(용어 툴팁·후리텐 사유), P2-13(로비 diff 토스트), P0-3(pill 가드), P1-6(재접속 요약 배너).
3. **프로토콜 한 필드씩** — P0-5(`promptCancel.reason`), P1-2(`GameOverMessage.reason`), P2-3(표도라), P0-4(`honbaBonus`/`riichiPotGain`).
4. **구조 작업** — P1-4(augPoints 렌더를 증감표 기반으로) → 이게 열리면 P1-5(파오)·P0-6(유국역만)·P2-4(extraHan 분해)가 전부 같은 자리에 붙는다.
5. **증강별 알림 추가** — P1-1·P1-3·P1-9·P1-10·P1-11·P2-9·P2-10, P1-13(쿨다운 규약 정렬).

---

# 처리 결과 (2026-08-17)

이 문서의 항목을 착수 순서대로 전부 구현했다. 커밋은 배치 단위로 나뉘어 있고,
각 커밋 메시지가 그 배치에서 무엇을 왜 고쳤는지 담고 있다.

**게이트**: 테스트 2390개 전부 통과 · 타입체크 4종 0에러.

## 반영된 것

- **P0 7건 전부.** 유국만관은 문구를 고치는 대신 **규칙으로 구현**했다
  (`draw.nagashiMangan`) — 사전이 오래도록 설명하던 규칙이 엔진에는 없었다.
- **P1** — P1-7(관전 고지)만 지시에 따라 제외, 나머지 전부.
- **P2** — P2-8(드래프트 상충 표시)만 지시에 따라 제외, 나머지 전부.
- **P3** — 상 4건 + 중 22건 + `augmentBrief` 배지 8종. 설명은 늘리지 않고
  빠진 절만 덧붙였다. 파일 상단 주석이 실제 이름·수치와 어긋나던 것도 함께 정리.
- **부수 발견 버그** — #1·#3·#4·#5·#6·#9·#10 수정, #2는 B1에서 처리.

## 조사와 달라진 판단

- **#7 `remainingCounter`** — 계산이 아니라 **툴팁 문구**를 고쳤다. `waitCounts.ts`의
  zone 화이트리스트는 "뷰가 넓어져도 안 새게" 하려는 의도적 방어선이고 주석과 테스트
  두 개가 그렇게 못 박고 있다. 어긋난 것은 셈이 아니라 "아직 보이지 않은 장수"라는
  짧은 문구 쪽이었다.
- **#8 `sealedKinds`** — 지금은 무해하다(종류 단위 봉인 증강이 없다). 그대로 둔다.
- **P1-13의 "잔량 미표시 11종"** — 대부분 *매 국 1회*이고 발동 상태가 이미 pill에
  뜬다(덤터기 대상·계약 역·배수…). 거기에 "1회 남음"을 더하면 잡음이라 넣지 않았다.
  실제 구멍이던 **순 단위 쿨다운 3종**(무르기·예지·미래를 보는 자)에 채널을 새로 뒀다.
- **P2-7 액티브 버튼 사유** — 잔량·쿨다운·무장해제는 서버가 실어 주므로 그대로 적고,
  상태 조건("국의 첫 순에만" 등)은 **지어내지 않았다**. 틀린 이유를 대느니 아는 것만
  말하는 편이 낫다. 그 대신 조건은 P3에서 설명문에 넣었다.
- **P2-6 리치 불가 사유** — "손을 열어서 막힘"은 뱃지에 넣지 않았다. 내 후로는 내
  자리에 펼쳐져 있어 스스로 설명하고, 넣으면 후로한 사람에게 국 내내 같은 뱃지가
  서 있게 된다. 화면을 봐서는 알 수 없는 둘(점수 부족·패산 부족)만 알린다.
- **#10 역행 칩** — `turn.direction`을 −1로 바꾸는 콘텐츠가 아직 없음을 확인했다.
  규칙은 엔진·봇·삼세 예지까지 배선돼 있어 표시만 미리 서 있는 상태이므로, 지우지
  않고 주석으로 남겼다.

## 함께 고친 테스트

옛 동작을 고정하고 있던 테스트 8건을 갱신했다. 그중 하나는 테스트 자체의 결함이었다 —
`charter_rule2_visible`의 표식 판정이 함수 이름만 보고 있어 **주석에 적힌 이름까지**
표식으로 셌다(호출부만 세도록 고쳤다).
