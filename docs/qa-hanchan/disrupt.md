# 반장전 밸런스 QA — GROUP `disrupt` (14종)

기준: tonpuu = 4국(maxWind 1) · 드래프트 3회 / hanchan = 8국(maxWind 2) · 드래프트 4회.
스케일 헬퍼: `packages/content/src/util.ts:117 matchUses`(동1→반2, **2배**),
`util.ts:141 scaledUses(N)`(반장 = `ceil(N*1.5)`, **1.5배**). 두 규약의 배수가 서로 다르다는 점이 이 그룹의 유일한 구조적 문제다.

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| pseudo_dealer | 찬탈자 | OK | — | pseudo_dealer.ts:43 `COOLDOWN_ROUNDS=2`, :120 ROUND_SETTLED 감소 / core standardActions.ts:855 `rotationSeat` 보존 / HanchanController.ts:331 아가리야메는 **정산 후 dealerSeat** | 없음 |
| blind_ron | 눈먼 총알 | 약화 | P1 | blind_ron.ts:86 `armOnNextRound` (획득 후 **1국** 한정), 모드 분기 없음 | 반장전 2국 지속 또는 `armOnNextRound` 2회 무장 |
| brief_fog | 박무 | OK | — | brief_fog.ts:66 `matchUses` (동1·반2), :144 문구 일치 | 없음 |
| call_seal | 함구령 | OK | — | call_seal.ts:30 `matchUses`, :40 turnKey 국 스코프(국 경계에서 만료) | 없음 |
| disarm | 무장해제 | OK | — | disarm.ts:47 `matchUses`, :133 문구 일치 | 없음 |
| discard_lock | 봉인술사 | OK | — | discard_lock.ts:55 `COOLDOWN_ROUNDS=2`, 봉인은 국 스코프 | 없음 |
| frame_up | 누명 | OK | — | frame_up.ts:52 `COOLDOWN_ROUNDS=2`, :54 `cooldownReady` | 없음 |
| hidden_river | 안개 덮인 바닥 | OK | — | hidden_river.ts:72 `matchUses`, 안개 수명은 국 스코프 | 없음 |
| hourglass | 뒤집힌 모래시계 | OK | — | hourglass.ts:150 "2국에 1회", `cooldownReady`/`trackRoundSeq` 국 단위 | 없음 |
| push_riichi | 등 떠밀기 | OK | — | push_riichi.ts:58 `usedKey`=`roundScopedKey`(매 국 1회), 낙인도 국 스코프 | 없음 |
| rank_gate | 격(格) | OK | — | rank_gate.ts:43 `roundScopedKey`(매 국 1회), :133/:136 ROUND_SETTLED·ROUND_STARTED 해제 | 없음 (단, 총평 참고) |
| seat_swap | 자리 바꿈 | 약화 | P2 | seat_swap.ts:77 `scaledUses(state,2)` → 반장 **3회**(1.5배), :89 국당 1회 잠금 | 반장전 4회로(= 2배 규약 통일) 또는 `scaledUses` 배수 규약 자체를 2배로 정리 |
| time_pressure | 초읽기 | 약화 | P1 | time_pressure.ts:65 `armOnNextRound` (획득 후 **1국** 한정), 모드 분기 없음 | blind_ron과 동일 처방 |
| time_stop | 시간 정지 | OK | — | time_stop.ts:46/:49 `roundScopedKey`(매 국 1회 자동 재충전) | 없음 |

## P1

**blind_ron / time_pressure — 반장전에서 체감 가치가 정확히 절반이 된다.**
둘 다 `armOnNextRound(ctx, ID, …)`(util.ts:`armOnNextRound`)으로 **획득 직후 시작되는 국 하나**에만 켜지고,
그 뒤로는 영구히 죽은 카드다(`armedRoundKey`가 남아 재무장 없음). 효과의 절대 크기는 모드와 무관한데
분모인 국 수는 4 → 8로 늘어난다. 즉 tonpuu에서는 게임의 25%를 지배하는 prism 카드가 hanchan에서는 12.5%짜리가 된다.
이 그룹의 다른 12종은 전부 `matchUses`·`scaledUses`·국 스코프 중 하나로 길이에 붙어 있어, 이 둘만 예외다.
드래프트 스케줄로도 보정되지 않는다 — 두 모드 모두 마지막 픽(tonpuu=eastFourth, hanchan=southThird)이라
"오라스 근처 1국"이라는 위치는 같고, 늘어난 것은 그 1국이 차지하는 비중의 감소뿐이다.
처방은 둘 중 하나: (a) 반장전에서만 2국 지속, (b) 무장을 2회분 주기(hanchan에서 `armOnNextRound`를 두 국에 걸어 재무장).
`modes` 잠금은 과하다 — 깨지는 게 아니라 희석되는 것뿐이다.

## 확인했고 문제 없던 것 (하드코딩 시점·순위·자리)

- **pseudo_dealer**: `round.dealerSeat`만 옮기고 `rotationSeat`는 건드리지 않는다(pseudo_dealer.ts:16 주석, :110 리듀서).
  코어 `advanceRound`(standardActions.ts:855)가 rotation 기준으로 다음 오야를 뽑으므로 장·국 진행이 두 모드에서 동일하게 유지된다.
  오라스(동4/남4) 강탈 → 렌짱 → 아가리야메 경로도 `agariYameTriggers`가 **정산 후 dealerSeat**로 판정해(HanchanController.ts:331)
  "연장한 사람"과 "점수를 보는 사람"이 어긋나지 않는다. 쿨다운 2국이라 가용 횟수가 국 수에 비례(동 2회 / 반 4회)한다.
- **rank_gate**: 순위·점수·장풍을 전혀 읽지 않는다. 이름과 달리 "격"은 판수(MIN_HAN=5) 게이트일 뿐이라 모드 의존이 없다.
  봇 정책만 상대 점수를 참조하는데(rank_gate.ts:168) 그건 상대 비교라 모드 중립.
- **seat_swap**: 자리 교환은 `dealerSeat`/자풍을 함께 옮기지만 장풍(prevalentWind)·국 번호와는 무관하고,
  turnSeat은 발동자를 따라간다(seat_swap.ts:19). 반장전에서 의미가 달라지지 않는다 — 달라지는 건 횟수 배수뿐.
- **점수 임계값**: 이 14종 중 30000(반환점)·토비·우마를 읽는 것은 **하나도 없다**.
  유일한 점수 참조는 push_riichi.ts:96(리치봉 1000점 지불 가능 여부)로, 규칙 조건이지 밸런스 상수가 아니다.
- **draftStages**: 이 14종 중 `draftStages`를 쓰는 것은 하나도 없다(전부 전 스테이지 등장). `modes` 잠금도 없다.

## 총평

- 이 그룹은 대체로 **모드 길이에 이미 붙어 있다** — 14종 중 12종이 `matchUses`(4) / 2국 쿨다운(4) / 매 국 1회(4)로 국 수에 비례한다.
  "매 국 1회"형과 "매치 예산"형의 상대비는 두 모드에서 4:1로 동일해, 사용자가 우려한 "동풍전 기준 밸런싱"이 여기서는 거의 성립하지 않는다.
- 진짜 예외는 **획득 즉시 1국형 2종(blind_ron·time_pressure)** 이다. 스케일 훅이 아예 없어 반장전에서 가치가 절반이 된다.
- 두 번째는 **배수 규약의 불일치**다: `matchUses`는 2배, `scaledUses(N≥2)`는 1.5배라 seat_swap만 혼자 덜 늘어난다. 규약을 한쪽으로 통일할 것.
- 시점·순위·자리 의존 항목(pseudo_dealer·rank_gate·seat_swap)은 코어가 rotationSeat / 정산 후 dealerSeat / 모드 파라미터(maxWind)로 정확히 흡수하고 있어 **깨짐(P0) 없음**.
