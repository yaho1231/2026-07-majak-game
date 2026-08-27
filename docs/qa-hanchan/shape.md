# 반장전 밸런스 QA — GROUP `shape`

대상 16종. 전부 `packages/content/src/augments/` 실제 코드 확인.
공통 배선: `shapeDeclare.ts`(액티브 3종), `util.ts` `cooldownReady/trackRoundSeq`(국 단위 쿨다운),
`HanchanController.ts:212~230` `hanchanConfigForMode`(hanchan maxWind=2, 드래프트 4회).

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| async_chiitoi | 비대칭 | OK | – | async_chiitoi.ts:40-45 → shapeDeclare.ts:50 (`SHAPE_COOLDOWN_ROUNDS=2`), util.ts:530-544 | 없음 (쿨다운이 국 단위라 밀도 불변, 총 사용 횟수만 2배) |
| broken_border | 무너진 국경 | OK | – | broken_border.ts:50-55 → shapeDeclare.ts:50 | 없음 |
| mixed_triplet | 동수의 결속 | OK | – | mixed_triplet.ts:41-46 → shapeDeclare.ts:50 | 없음 |
| joker | 조커 | OK | – | joker.ts:73 (`COOLDOWN_ROUNDS=2`), joker.ts:225 `trackRoundSeq` | 없음 (국 단위 쿨다운) |
| broken_wall | 끝없는 윤회 | 강화 | P2 | broken_wall.ts:22-24 (`setHolderRule` 상시) | 없음 / 티어 재평가 |
| polar_ends | 양극 | 강화 | P1 | polar_ends.ts:48-50 (상시), 주석 22-28 (스안커·청노두 더블역만 의도) | 반장전에서 역만 시도 기회 2배 — 반장전 한정 하향 또는 `draftStages` 후반 제한 검토 |
| royal_kokushi | 왕의 징표 | 강화 | P2 | royal_kokushi.ts:24(`DUPES=1`), 36-38 (상시) | 없음 |
| tanyao_break | 탕야오 해방 | 강화 | P2 | tanyao_break.ts:29(`BREAK_HAN=2`), 45-66 (상시 역 등록) | 없음 |
| bottom_yaku | 바닥의 족보 | 강화 | P2 | bottom_yaku.ts:139-169 (상시 보조역 2·1판, 국마다 재판정) | 없음 |
| haitei_lord | 해저의 지배자 | 강화 | P2 | haitei_lord.ts:49(`BONUS_HAN=3`), 52-53 `roundScopedKey`(국 스코프 `fired`) | 없음 (국당 1회 → 반장전 발동 기회 2배) |
| mixed_nine_gates | 뒤섞인 아홉 개의 연꽃 | 강화 | P2 | mixed_nine_gates.ts:111-190 (상시, 역만 13판) | 없음 (도달률 낮아 실질 영향 작음) |
| wind_lineage | 바람의 계보 | 강화 | P2 | wind_lineage.ts:111, 141-152 (`PREVALENT_YAKU`가 `wctx.prevalentWind`를 봄) | 없음 — 아래 P1/P2 설명 참조 |
| true_dragon | 진짜 용 | 강화 | P2 | true_dragon.ts:124-133 (상시 16장·5멘쯔·+3판), conflicts 114-121 | 없음 (모드 무관, conflicts도 모드 무관) |
| avenger | 복수자 | 강화 | P2 | avenger.ts:34 `nemKey`(국 스코프 아님 → 국을 넘어 유지), 105-128 | 없음 |
| late_bloomer | 대기만성 (반장전) | 약화 | P1 | late_bloomer.ts:25(`BLOOM_HAN=3`), 28-32 `inBloom`, 44-46 (`draftStages:["gameStart"]`,`modes:["hanchan"]`) | 만개 시점을 남3국으로 앞당기거나 `BLOOM_HAN` 상향 |
| late_bloomer_east | 대기만성 (동풍전) | OK | – | late_bloomer_east.ts:20(`BLOOM_HAN=2`), 26-30 `inBloom`, 43-44 | 없음(기준선) |

## P1 — late_bloomer 짝의 비대칭 (모범 선례이지만 수치가 어긋난다)

두 파일의 구조는 **완전 대칭**이다: 같은 두 규칙(`win.furiten.enabled`·`win.requiresYaku`)을
모디파이어로 조건부 해제 + `addWinHanBonus` + `ROUND_STARTED` 공개. 다른 것은 두 곳뿐이다.

- 만개 조건: 반장전 `prevalentWind===2 && roundNumber>=4 || prevalentWind>=3` (남4국 또는 서입),
  동풍전 `prevalentWind===1 && roundNumber>=4 || prevalentWind>=2` (동4국 또는 남입).
  → 서든데스 편입까지 포함해 **논리적으로 정확히 대칭**이다(`hanchanConfigForMode`의
  `westEntry:true`가 두 모드 모두라 서든데스 장 번호도 각각 +1로 맞다). 오작동 없음.
- 판수: 반장전 +3 / 동풍전 +2.

문제는 **구간 비율**이다. 동풍전은 4국 중 1국(25%)이 만개 구간, 반장전은 8국 중 1국(12.5%)이다.
즉 반장전판은 "게임 전체를 버틴다"는 대가를 두 배로 치르고 구간 비중은 절반인데 보상은 +1판뿐이다.
`draftStages:["gameStart"]` 전용이라 대체 픽으로 갈아탈 수도 없다. **반장전에서 상대적으로 약하다.**
제안: 만개 시점을 남3국(`roundNumber>=3`)으로 앞당기거나 `BLOOM_HAN`을 4로.

## P1 — polar_ends (양극)

상시 패시브이고 문서상 "스안커·청노두 더블 역만 도달"이 **의도된 설계**로 확정돼 있다
(polar_ends.ts:22-28). 국 수가 2배면 그 역만 시도 횟수도 2배다 — 이 그룹에서 상시 패시브 중
분산이 가장 큰 카드라 반장전에서 매치 결과를 혼자 뒤집을 확률이 눈에 띄게 오른다.
(오작동은 아니므로 P0 아님.)

## wind_lineage — 남장 동작 확인 (요청 항목)

> ⚠ 2026-08-27 사용자 확정으로 자풍 갈래·장풍 갈래가 `wind_lineage_wind` 하나로 합쳐졌다
> (한 몸통에 자풍·장풍이 둘 다 들어도 1판). 아래는 합치기 전의 기록이다 — 「장풍 랭크가
> 바람 슌쯔에 끼었는지만 본다」는 판정 자체는 지금도 같고, 그 몫이 별도 1판이 아닐 뿐이다.

`계보 장풍패`는 `wctx.prevalentWind`를 그대로 읽어 그 랭크가 바람 슌쯔에 끼어 있는지만 본다
(wind_lineage.ts:141-152, `windRunHas` 51-65). 하드코딩된 장 번호가 없다.

- 반장전 남장: `prevalentWind=2`(남). 남은 **동남서·남서북 두 슌쯔 모두에** 들어 있으므로
  동장(동=동남서 하나뿐)보다 오히려 성립하기 쉽다.
- 서입(서장, `prevalentWind=3`): 서도 두 슌쯔 모두에 들어 있어 정상 성립.
- 자풍은 `wctx.seatWind`라 모드 무관.

→ **깨짐 없음.** 다만 반장전 후반에서 장풍 1판이 붙는 형태가 넓어져 미세하게 강해진다(P2).
북(rank 4)만 `남서북` 한 쪽에만 있는데, 북이 장풍이 되는 국은 두 모드 다 없다(maxWind+1까지).

## 모드 분리(late_bloomer 방식)가 필요한 다른 후보

- **없다 — 장/국을 하드코딩하는 증강은 이 그룹에서 late_bloomer 짝뿐이다.**
  `roundNumber`/`prevalentWind` 상수 비교는 두 파일 외에 나오지 않는다.
- 차선 후보는 **polar_ends**다. 다만 시점이 아니라 **분산** 문제라 `modes` 잠금·시점 분리가
  아니라 수치 하향(또는 반장전 전용 변형에서 커쯔 조건 축소)이 맞는 도구다.
- 액티브 4종(async_chiitoi·broken_border·mixed_triplet·joker)은 쿨다운이 **국 단위**라
  모드 분리가 불필요하다 — 국당 밀도가 두 모드에서 같다. 이 그룹에서 유일하게 길이 중립인 설계다.

## 총평

이 그룹에 **P0(오작동)은 없다.** 장·국을 하드코딩하는 곳은 late_bloomer 짝뿐이고 그 조건은
서든데스까지 포함해 정확히 대칭이다. 나머지 11종은 전부 상시 패시브라 반장전에서 그대로 2배로
굴러 "게임당 N회"형 증강 대비 상대적으로 강해진다 — 이 그룹 전체가 반장전에서 위로 밀린다.
반대로 유일한 게임 스코프 증강인 late_bloomer(반장전판)만 구간 비중이 절반이라 아래로 밀린다.
국 단위 쿨다운을 쓰는 액티브 4종이 유일하게 길이 중립이며, 다른 그룹의 "게임당 N회" 자원형을
고칠 때 참고할 만한 형태다.
