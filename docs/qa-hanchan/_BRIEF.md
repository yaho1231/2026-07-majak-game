# 반장전 밸런스 QA 공통 브리프

저장소: /Users/skul/majak/.claude/worktrees/augment-balancing-qa-review-95f55a (읽기 전용 감사. 코드 수정 금지.)

## 배경
- 두 모드가 있다: `tonpuu`(동풍전, maxWind=1, 드래프트 3회: gameStart/eastThird/eastFourth)와
  `hanchan`(반장전, maxWind=2, 드래프트 4회: gameStart/eastThird/southEntry/southThird). 둘 다 서입(서든데스) 있음.
  근거: packages/core/src/match/HanchanController.ts `hanchanConfigForMode` (약 195~230줄).
- 증강은 `packages/content/src/augments/*.ts`, 정의 스키마는 packages/core/src/augment/Augment.ts
  (`modes?: readonly GameMode[]` 로 모드 잠금 가능, 현재 late_bloomer/late_bloomer_east 2개만 사용).
- 사용자 주장: **증강 대부분이 동풍전 기준으로 밸런싱돼 있다.** 반장전(국 수 약 2배, 드래프트 4회)에서
  그 밸런싱이 깨지는지 확인하는 것이 이 감사의 목적이다.

## 각 증강마다 판정할 것
1. **길이 민감도**: 효과가 국(round) 단위인가, 게임(match) 단위인가?
   - 「게임당 N회」 자원형 → 반장전에서 국당 밀도가 절반으로 희석(약화)
   - 「매 국마다」 상시형 → 반장전에서 발동 횟수 2배(강화)
   - 누적/성장형(스택이 쌓임) → 반장전에서 상한 없이 폭주하는가?
2. **시점·트리거 고정값**: 특정 장/국(예: 동4국, 남4국, 오라스, 서입)을 하드코딩하는가?
   두 모드에서 그 시점이 같은 의미인가? (오라스=동풍전 동4국 vs 반장전 남4국)
3. **점수 임계값**: 30000(반환점)/토비/우마 등 고정 점수를 쓰는 효과가 국 수가 2배인 판에서도 적절한가?
4. **드래프트 스케줄**: 4회 픽(반장전)이면 조합/스택이 하나 더 얹힌다. `draftStages` 제한이
   반장전에서 의도대로 동작하는가? (예: `["gameStart"]` 전용은 반장전에서 더 오래 굴러 더 강함)
5. **판정**: `OK` / `약화(반장전에서 상대적으로 약함)` / `강화(반장전에서 과함)` / `깨짐(로직·시점 오작동)`
   + 심각도 P0(오작동·게임 파탄) P1(밸런스 크게 어긋남) P2(미세) 와 **제안 수정**(수치 조정 / `modes` 잠금 /
   모드별 변형 분리 / 없음).

## 참고 문서
- docs/17_AUGMENT_BALANCE.md (밸런스 지표·티어), docs/20_AUGMENT_POWER_TIER.md (파워 티어),
  docs/10_AUGMENT_SYSTEM.md (원칙·확정보상 단위)
- 선례: packages/content/src/augments/late_bloomer.ts / late_bloomer_east.ts (모드별 변형 분리 방식)

## 출력 형식 (반드시 지킬 것)
마크다운 표 한 개 + 그 아래 P0/P1 항목만 짧은 설명.
표 컬럼: | id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
판정이 OK인 것도 전부 표에 넣어라(누락 금지). 마지막에 3~5줄 총평.
결과를 파일로도 저장: docs/qa-hanchan/<GROUP>.md
