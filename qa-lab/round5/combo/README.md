# B-2 조합 스위프 — 3~4장 (qa-lab/round5/combo/)

계획 [docs/55 §4 B-2](../../../docs/55_QA_PLAN_2026-09-16.md). 한 사람(p0)이 3~4장을 동시에 들었을 때의
크래시·소프트락·훅 예외·불변식 위반을 잡고, 실패하면 부분집합으로 **자동 축소(shrink)** 해 최소 재현 조합을 남긴다.
`packages/` 는 읽기만 한다.

워크트리 루트에서 (workspace 링크 먼저 — [qa-lab/README.md](../../README.md)):

```bash
T=~/majak/node_modules/.bin/tsx
$T qa-lab/round5/combo/gen3.ts                 # ① RISKY 3장 전수 ② 문서 신호 쌍+같은 축 1장 ③ 실제 보유 분포 → combos.jsonl
$T qa-lab/round5/combo/smoke.ts                # 층별 2조합 × 시드 1 = 6판 + shrink 단위 확인 (전체 실행 아님)
for s in 0 1 2 3 4 5 6 7; do $T qa-lab/round5/combo/run3.ts $s 8 > qa-lab/round5/combo/out/run3-$s.log 2>&1 & done; wait
$T qa-lab/round5/combo/analyze.ts              # out/run3-*.jsonl → report.md
```

| 파일 | 역할 |
|---|---|
| `lib.ts` | 조합 검증(conflicts·모드 — `installPreset` 은 상호 배제를 **말없이** 버리므로 미리 거른다), 판 하나(`play`), 실패 시그니처, `shrink`, 판 배정(`gameArgs`) |
| `gen3.ts` | `combos.jsonl` 생성. 출처 태그: `risky:…` / `docs/48:36|…` / `dist:…:n=빈도`. `--pairs-dump` 로 뽑힌 쌍 확인 |
| `run3.ts <shard> <shards>` | 조합 idx % shards 로 분배. 판마다 시드·모드·preset·페르소나 기록. 실패 → 같은 시드·같은 p1~p3 로 shrink. 이어하기 지원(`--fresh` 로 초기화), `--only idx` 재현 |
| `analyze.ts` | 시그니처별 묶음 · 최소 재현 조합 표 · 설치 누락 · touched 커버리지 → `report.md` |
| `smoke.ts` | 도구 자체 검증 + 판당 ms 실측 + 전체 예상 시간 |

판 배정(재현 키): 시드 `710000 + idx*2 + k`, k=0 반장전·p0 masher / k=1 동풍전·p0 chaos(조합에 모드 제한이 있으면 가능한 쪽),
p1~p3 = `assignPreset` 무작위 2장 + 6종 페르소나 무작위, `drafts:false`, 판당 `--timeout`(기본 90초, 초과 = 소프트락).

판정: `crash`(엔진 throw) · `softlock`(타임아웃) · `effect`(onEffectError) · `violation`(하네스 기본 + pairs/lib 엄격 불변식,
`SCORE_DRIFT_ATTRIBUTED` 와 알려진 오탐 `disarm×true_dragon` 의 HAND_SIZE_STRICT 는 제외) · `invalid`(조합 카드가 1국에 설치되지 않음).
shrink 는 «같은 시그니처»를 우선해 내려가고, 마지막에 p0 빈손(대조군)도 돌려 조합 탓인지 p1~p3·시드 탓인지 가른다.
