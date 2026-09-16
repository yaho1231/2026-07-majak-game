# B-4 약속 검사기 보고 (2026-09-16 01:36)

입력: promise-0of1-smoke.jsonl, promise-0of1-mutant.jsonl · 약속: promises.json
판: 8 (카드 4종, 평균 468 ms/판) · 크래시 0 · 소프트락 0 · 훅 예외 판 0
판정: 확정 0 · 의심 0 · 관찰 3 · 0회 발동 0
약속: 117장 중 약속 없음 8장 (riichi_upgrade, open_kokushi, silent_swap, royal_kokushi, no_ron_pact, meld_dissolve, wind_lineage, silent_pact) · 괄호 못 읽음 0장

판정 규칙: «확정»은 실측이 문구와 직접 어긋난 것, «의심»은 측정 방법의 한계(다단계 액션·누적형 판수)로 오탐일 수 있는 것, «관찰»은 라벨 붙은 한도·판단 대기 항목의 기록. 〔알려짐〕은 계획 §8 목록과 겹치는 것 — 재보고 아님.

## 1. 초과 발동 (uses > 약속) — 0건

- 없음

## 2. 쿨다운 위반 (간격 < N) — 0건

- 없음

## 3. 모드 스케일 불일치 (채널 값 ≠ 모드별 약속) — 1건

- **big_hand** [hanchan] seed=1 · 관찰 〔알려짐 · 판단 대기 P-2 (scaledCooldown 미적용 15종)〕 — «2국에 1회» 반장전 간격 [3,3] — 문구(고정 2국)와 일치, scaledCooldown 미적용
  - 재현: `npx tsx qa-lab/round5/promise/run.ts 0 1 --cards=big_hand --modes=hanchan --seed=1`

## 4. 수치 불일치 (+N판 · N배 · 최소 만관) — 0건

- 없음

## 5. 조건 위반 (리치 중 · 첫 순) — 0건

- 없음

## 6. 공개 누설 («상대에게 공개되지 않는다») — 2건

- **tenpai_scan** [hanchan] seed=1 · 관찰 〔알려짐 · 판단 대기 P-1 (#454 pill 전원 공개 — 문구와 모순, 사용자 판단)〕 — «description+detail: 상대에게 공개되지 않는다» 인데 상대 뷰에 pill 사본 seat:p0:uses:tenpai_scan={"left":2,"total":2,"scope":"round"} (국 1)
  - 재현: `npx tsx qa-lab/round5/promise/run.ts 0 1 --cards=tenpai_scan --modes=hanchan --seed=1`
- **tenpai_scan** [tonpuu] seed=1 · 관찰 〔알려짐 · 판단 대기 P-1 (#454 pill 전원 공개 — 문구와 모순, 사용자 판단)〕 — «description+detail: 상대에게 공개되지 않는다» 인데 상대 뷰에 pill 사본 seat:p0:uses:tenpai_scan={"left":2,"total":2,"scope":"round"} (국 1)
  - 재현: `npx tsx qa-lab/round5/promise/run.ts 0 1 --cards=tenpai_scan --modes=tonpuu --seed=1`

## 7. 0회 발동 (조건 좁음 목록) — 0건

- 없음

## 8. 크래시 · 훅 예외 · 소프트락 · 불변식 · 잔량 채널 — 0건

- 없음

## 자기 검증 (결함 주입 mutant 행)

- **joker_fixed_cooldown** (2판): 울림 ✓ — #511 이전 조커(쿨다운 고정 2국)를 되살린 것. 반장전 usedSeq 간격 2 < 약속 3 이 «쿨다운 위반 확정»으로 나와야 한다.
  - **joker** [hanchan] seed=1 · 확정 — «동풍전 2국에 1회 · 반장전 3국에 1회» hanchan 기대 간격 ≥3, usedSeq 열 [1,3,5,7] 간격 [2,2,2]
    - 재현: `npx tsx qa-lab/round5/promise/run.ts 0 1 --cards=joker --modes=hanchan --seed=1 --mutant=joker_fixed_cooldown`

## 부록 A. 카드별 실측 요약 (카드 × 모드)

| 카드 | 모드 | 판 | 발동(합/최소~최대) | 국당 최대 | 쿨다운 간격(최소) | uses 채널 | +판 실측 | 상대 뷰 채널 | 흔적 |
|---|---|---|---|---|---|---|---|---|---|
| big_hand | hanchan | 1 | 3 / 3~3 | 1 | 3 | - | - | - +pill | ○ |
| big_hand | tonpuu | 1 | 2 / 2~2 | 1 | 3 | - | - | - +pill | ○ |
| no_ron_pact | hanchan | 1 | 0 / 0~0 | 0 | - | - | - | no_ron_pact:active:p0 no_ron_pact:p0 | ○ |
| no_ron_pact | tonpuu | 1 | 0 / 0~0 | 0 | - | - | - | no_ron_pact:active:p0 no_ron_pact:p0 | ○ |
| tenpai_scan | hanchan | 1 | 18 / 18~18 | 2 | - | 2 round | - | - +pill | ○ |
| tenpai_scan | tonpuu | 1 | 8 / 8~8 | 2 | - | 2 round | - | - +pill | ○ |
| joker | hanchan | 1 | 3 / 3~3 | 1 | 3 | - | - | joker:p0 +pill | ○ |
| joker | tonpuu | 1 | 2 / 2~2 | 1 | 2 | - | - | joker:p0 +pill | ○ |

## 부록 B. 약속이 안 뽑힌 카드 (사람이 검토)

- **riichi_upgrade** (이중 선언) — head=없음
- **open_kokushi** (우는 국사무쌍) — head=없음
- **silent_swap** (정적의 손) — head=없음
- **royal_kokushi** (왕의 징표) — head=없음
- **no_ron_pact** (불가침 조약) — head=없음
- **meld_dissolve** (파혼) — head=없음
- **wind_lineage** (바람의 계보) — head=없음
- **silent_pact** (묵계) — head=없음

## 부록 C. 스모크 소요 · 전체 예상 (2026-09-16)

- 스모크 8판(joker·tenpai_scan·big_hand·no_ron_pact × 2모드 × 시드 1): 4초, 평균 468 ms/판 (반장전 448~916 · 동풍전 192~372).
- 전체 = 232 카드×모드(117장, 모드 불일치 제외) × 5시드 = **1,160판** → 단일 프로세스 ≈ 9~10분, 8샤드 ≈ 2분.
- bot 좌석 수치 패스(`--p0=bot --opp=bot`): 판당 ~1,250 ms → 1,160판 ≈ 25분 단일, 8샤드 ≈ 4분.
- 자기 검증: `selfcheck.ts` A/B-1/B-2/C 전부 PASS (약속 사본 «1국에 1회» → SCALE_MISMATCH 확정 2건, «동풍전 3국·반장전 4국» → COOLDOWN_VIOLATION 확정 2건, mutant → 반장전 COOLDOWN_VIOLATION 확정).
