# round5/promise — B-4 약속 검사기 (docs/55 §4 B-4)

카드 설명이 **약속한 것**(«N국에 1회» «게임 내 N회» «매 국 K회» «+N판» «N배» «리치 중 불가»
«상대에게 공개되지 않는다» …)을 기계적으로 뽑아, 카드 1장을 p0 에 강제한 실측과 대조한다.
코드가 문구를 지키는지(#511 조커 쿨다운 스케일·천리안 2회 같은 회귀)를 117장 전체에서 한 번에 본다.

```
parse.ts   description+detail → promises.json (카드 117 = content 113 + standard 4, 약속 JSON + unparsed 목록)
run.ts     카드 1장 강제(p0, drafts:false) × masher 4명 × 2모드 × 시드 N → out/promise-<shard>of<shards>[-tag].jsonl
judge.ts   promises.json vs out/*.jsonl → report.md (8절 + 자기 검증 절 + 카드별 요약표 + 약속 없는 카드)
selfcheck.ts  검사기가 실제로 잡는지 — 약속 사본·결함 주입 양쪽으로 (종료코드 0/1)
dump_descs.ts 개발 보조 — 117장 설명 덤프 (정규식 맞출 때)
```

`packages/` 는 읽기만 한다. 결함 주입(`--mutant`)도 이 프로세스 안에서 카탈로그 def 를 감싸는 것뿐이다.

## 실행

```
T=~/majak/node_modules/.bin/tsx          # 워크트리엔 tsx 가 없다 — 메인 체크아웃 것을 쓴다

$T qa-lab/round5/promise/parse.ts        # promises.json 갱신 (설명을 고쳤을 때만)
$T qa-lab/round5/promise/run.ts 0 1 5    # 단일 프로세스: 232 카드×모드 × 5시드 = 1,160판
$T qa-lab/round5/promise/judge.ts        # out/promise-*.jsonl 전부(-dev 제외) → report.md
$T qa-lab/round5/promise/selfcheck.ts    # joker 행으로 검사기 자기 검증
```

`run.ts <shard> <shards> [seeds=5]` 옵션:

| 옵션 | 뜻 |
|---|---|
| `--cards=a,b` | 카드 id 목록 (기본 117장 전부; 모드 불일치 카드는 `offerable` 로 건너뜀) |
| `--modes=hanchan,tonpuu` | 기본 둘 다 |
| `--seed=1,2` | 시드를 직접 (기본 1000..1000+N-1) |
| `--p0=masher\|bot` `--opp=masher\|bot` | 좌석 에이전트. 증강광 넷은 화료를 거의 못 해 «+N판·N배·최소 만관» 수치가 안 보인다 → 수치 패스는 `--p0=bot --opp=bot` 으로 한 번 더 |
| `--mutant=joker_fixed_cooldown` | 결함 주입(자기 검증용). 행에 `mutant` 가 적혀 judge 본 판정에서 빠진다 |
| `--tag=smoke` | 출력 파일명 꼬리. `-dev` 가 들어가면 judge 기본 입력에서 제외 |
| `--timeout=150000` | 판당 ms — 넘으면 requestAbort + SOFTLOCK |
| `--resume` | 같은 출력 파일의 완료 행을 건너뜀 |

judge: `--in=a.jsonl,b.jsonl` `--out=report.md` `--promises=other.json`(자기 검증용 사본).

### 샤딩

판 목록은 결정적(카드 순 × 모드 × 시드)이고 `i % shards === shard` 로 나눈다. 8샤드 백그라운드:

```
for s in 0 1 2 3 4 5 6 7; do
  nohup $T qa-lab/round5/promise/run.ts $s 8 5 > qa-lab/round5/promise/out/log-$s.txt 2>&1 &
done
tail -n 1 qa-lab/round5/promise/out/log-*.txt       # 진행
$T qa-lab/round5/promise/judge.ts                    # 8개 jsonl 을 한 보고서로
```

수치 패스(bot 좌석)는 `--tag=bot` 을 붙여 같은 out/ 에 두면 judge 가 함께 읽는다(재현 명령에 `--p0=bot --opp=bot` 이 붙는다).

### 예상 소요 (2026-09-16 스모크 실측)

- masher 4명: 판당 평균 **~470 ms**(4카드×2모드×시드1, 반장전 ~450~900 · 동풍전 ~200~370; 이전 14카드 27판 평균 253 ms). 1,160판 ≈ **9~10분 단일 프로세스**, 8샤드면 **~2분** (+tsx 기동 ~3초/샤드).
- bot 4명(수치 패스): 판당 평균 ~1,250 ms(최대 3.5초) → 1,160판 ≈ 25분 단일, 8샤드 ~4분.
- 총 4×2×1 스모크 8판 = 4초.

## 판정 규칙 (judge.ts 머리 주석과 같다)

1. 초과 발동 — uses_match/uses_round 보다 많이 소모. `view:p0:uses:<id>` 잔량 채널의 감소량을 우선, 없으면 액션 픽 수(다단계 액션이면 «의심»).
2. 쿨다운 위반 — `<id>:usedSeq:p0` 변화열 간격 < 모드별 N. usedSeq 없는 카드는 픽 국 인덱스로 «의심».
3. 모드 스케일 — 잔량 채널 total · 쿨다운 채널 최댓값 ≠ 모드별 약속.
4. 수치 — +N판(extraHanBy·augPoints.han) · 최소 만관 · N배.
5. 조건 — «리치 중 불가»인데 리치 중 발동 · «첫 순»인데 버림/멘쯔 뒤 발동.
6. 공개 누설 — «상대에게 공개되지 않는다»인데 상대에게 **실제로 내려간** PlayerView.augmentView 에 카드 채널. pill 사본(`seat:p0:uses|cooldown*`)은 따로.
7. 0회 발동 — 그 모드 전 시드에서 발동·흔적 없음 (조건 좁음 목록, «관찰»).
8. 크래시·훅 예외·소프트락·불변식·잔량 채널 음수/초과.

«확정» = 실측이 문구와 직접 어긋남 · «의심» = 측정 한계로 오탐 가능 · «관찰» = 라벨 붙은 한도·판단 대기 기록.
〔알려짐〕 = 계획 §8 재보고 금지·판단 대기와 겹침(P-1 pill 전원 공개, P-2 scaledCooldown 미적용 15종, docs/49 B-2). 태그만 붙이고 지우지 않는다.

라벨 붙은 한도(«만개는 동풍전 1회 · 반장전 2회», «2국에 1회 교환»)는 카드 일부 기능에만 걸려 액션 수와 1:1이 아니므로 «관찰»로만 적는다.

## 자기 검증

이번 브랜치의 조커는 «동풍전 2국에 1회 · 반장전 3국에 1회»로 코드와 문구가 맞아 위반이 **안** 울린다. 검사기가 죽어서 조용한 게 아님을 세 갈래로 보인다 (`selfcheck.ts`, 코드 무수정):

- A 기준선: 진짜 promises.json → joker 판정 0건.
- B 약속 사본: joker 괄호를 «1국에 1회»로 바꾼 사본(`out/selfcheck/promises-joker-1.json`) → 쿨다운 채널 최댓값 3/2 ≠ 1 → SCALE_MISMATCH 확정. «동풍전 3국·반장전 4국» 사본 → 실측 간격 2/3 < 약속 → COOLDOWN_VIOLATION 확정.
  같은 걸 손으로: `$T judge.ts --in=out/promise-0of1-smoke.jsonl --promises=out/selfcheck/promises-joker-1.json --out=/tmp/x.md`
- C 결함 주입: `run.ts --mutant=joker_fixed_cooldown`(#511 이전의 고정 2국) → 반장전 usedSeq 간격 [2,2,2] < 3 → COOLDOWN_VIOLATION 확정. judge 보고서의 «자기 검증» 절에도 자동으로 적힌다.

## 한계 (사람이 봐야 하는 것)

- 약속 없는 카드 8장(`promises.json emptyCards`: riichi_upgrade, open_kokushi, silent_swap, royal_kokushi, no_ron_pact, meld_dissolve, wind_lineage, silent_pact)은 괄호 한도가 없다 — 규칙형·자동형이라 발동 수 약속 자체가 없다. 부록 B 에 나열된다.
- 순 단위 쿨다운(«N순에 1회»)은 채널 최댓값만 적고 간격은 안 잰다.
- standard 4종은 코어 레지스트리가 등록해 훅 계측 밖 — 흔적·픽으로만 본다.
- 증강광은 무작위로 버려 화료가 드물다. 수치 절(4)은 bot 패스 결과가 있어야 의미가 있다.
