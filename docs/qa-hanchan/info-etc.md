# 반장전 밸런스 QA — GROUP `info-etc` (정보계 11종)

감사 대상: `packages/content/src/augments/` 의 11개 파일. 코드 수정 없음(읽기 전용).

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| peek_riichi_waits | 선언 간파 | 강화 | P2 | peek_riichi_waits.ts:74-79(`roundScopedKey` 국당 1회), :238-242(`publishUsesLeft(...,"round")`) | 없음(국 단위 설계 일관). 필요하면 매치 상한 도입 |
| rinshan_preview | 영상 정찰 | 강화 | P2 | rinshan_preview.ts:57-59(국당 1회 플래그), :169-183(상시 열람 modifier) | 없음 |
| xray_hand | 투시 | OK | — | xray_hand.ts:37-41(`matchUses`), :78 카드 문구 "동풍전 1 · 반장전 2" | 없음 — 국당 밀도 0.25로 두 모드 동일 |
| danger_sense | 지뢰 탐지 | 강화 | P2 | danger_sense.ts:62-63(국 스코프 `usedKey`), :275-279 | 없음 |
| dora_conceal | 가려진 도라 | 강화 | P2 | dora_conceal.ts:32-46(순수 패시브, 국 시작마다 상시) | 없음 — 패시브 공통 성질 |
| foresight | 예지 | 강화 | **P1** | foresight.ts:68(`COOLDOWN_TURNS=4`, 순 단위), :72-74(국 스코프 `usedKey`), :70·:418-421(발동 국 화료 +2판) | 점수 라이더(+2판)를 매치 예산화하거나 반장전 한정 하향 |
| tenpai_scan | 천리안 | 강화 | P2 | tenpai_scan.ts:52-57(`USES_PER_ROUND=1`, 국 스코프), :20-24 주석(2026-08-14 매치→국 상향) | 없음 |
| triple_peek | 삼세 예지 | OK | — | triple_peek.ts:67-71(`COOLDOWN_ROUNDS=2` + `cooldownReady`) | 없음 — 국 수에 정비례(동풍 2회 / 반장 4회) |
| ura_peek | 이면투시 | 강화 | P2 | ura_peek.ts:47-51(국 스코프 `used`/`swapped`), :185-189 | 없음 |
| cornucopia | 수상한 주사위 | 강화 | P2 | cornucopia.ts:32(`GRANT_COUNT=2`), :59-71(획득 즉시 1회 지급, `draftStages` 제한 없음) | `draftStages: ["gameStart","eastThird"]` 등으로 늦은 스테이지 죽은 픽 방지(선택) |
| reload | 재장전 | OK | — | reload.ts:34-36(`matchUses`), :187(`draftStages` 4스테이지 합집합), :149-160(복구 이벤트) | 없음 |

## P1 — foresight (예지)

유일하게 **정보 + 점수**를 함께 주는 카드다. 소진·쿨다운이 전부 국(roundKey) 스코프고
쿨다운 단위가 **순(turn)** 이라(`COOLDOWN_TURNS = 4`, foresight.ts:68·200-204), 한 국에서 열
수 있는 횟수는 두 모드가 같다. 국 수가 2배인 반장전에서는 **발동 총량도 그대로 2배**가 되고,
그 각각이 `addWinHanBonus`로 **+2판**을 얹는다(foresight.ts:70, 418-421). 나머지 10종은 2배가
돼도 «정보가 두 배»에 그치지만 이것만 «점수 기대값이 두 배»가 된다 — 매치 단위 예산이 하나도
없는 것이 원인이다.

제안: ① +2판 라이더만 매치 예산(`scaledUses`)으로 묶어 반장전에서 총 N회까지만 붙이거나,
② 반장전 변형을 `modes`로 분리해 보너스를 +1판으로 내린다(late_bloomer / late_bloomer_east 선례).

P0 없음. 11종 어디에도 특정 장·국(동4국·남4국·오라스·서입) 하드코딩이나 30000점·토비·우마
같은 고정 점수 임계값이 없다.

## 총평

- 11종 중 **9종이 국(round) 단위**이고 매치 상한이 없다 — 반장전에서 발동 총량이 그대로 2배가 된다.
  다만 정보계는 «국당 밀도»가 값이라 국당 1회 유지 자체는 설계 의도에 맞고, 판을 깨지는 않는다.
- 매치 예산을 쓰는 둘(`xray_hand`·`reload`)은 `matchUses`(동풍 1 → 반장 2)를 타서 **국당 밀도가
  두 모드 동일**하다. 사용자 주장("동풍전 기준 밸런싱")이 이 그룹에서는 이미 해소된 자리다.
- `triple_peek`의 2국 쿨다운도 국 수에 정비례해 스케일한다(2회 → 4회) — 희석·폭주 어느 쪽도 아니다.
- 진짜 어긋나는 것은 `foresight` 하나뿐이다. 정보 doubling은 감수할 만하지만 그 위에 붙은
  **점수 라이더**가 매치 예산 없이 2배로 커진다.
- 누적/성장형(스택 폭주)은 이 그룹에 없다. 드래프트 스케줄 제한은 `reload`의 `draftStages`만
  쓰는데 동풍전·반장전 스테이지 이름의 합집합이라 두 모드에서 의도대로 동작한다.
