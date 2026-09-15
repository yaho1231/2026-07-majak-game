# round5/solo — B-1 단독 스위프 (docs/55 §4 B-1)

증강 **1장 단독**(p0, 드래프트 끔) × p0 페르소나 6종 × 시드 N × 2모드. 상대 p1~p3 는
빈 preset + 고정 믹스(riichiRusher/folder/caller). 카탈로그 117 = content 113 + standard 4.

```
bash qa-lab/round5/solo/run-shards.sh 8 5          # 8샤드 백그라운드, 시드 5 → 6,800판 (+ modes 불일치 20건 skip)
tail -n 2 qa-lab/round5/solo/logs/*.log            # 진행
tsx qa-lab/round5/solo/analyze.ts                  # out/*.jsonl → report.md · summary.json
tsx qa-lab/round5/solo/repro.ts <aug> <persona> <mode> <seed>   # 한 판 재현
```

스모크(본 실행 결과와 폴더를 분리):
```
SOLO_AUGS=alchemist,spy,iron_wall SOLO_PERSONAS=masher,folder SOLO_OUT=out-smoke \
  tsx qa-lab/round5/solo/run.ts 0 1 1
tsx qa-lab/round5/solo/analyze.ts out-smoke report-smoke.md
```

판마다 기록(Row, `lib.ts`): aug·persona·mode·seed·preset · crash · fatal · softlock(타임아웃) ·
effectErrors · violations(kind별 수) · actionsTaken · fired(그 증강 액션이 눌린 수) ·
touched{data,events,fired} · hooks · passive · ms. `touched` 는 pairs/lib.ts 방식(augmentData 키
prefix)에 이벤트 줄 낱말 일치·`augmentIdForActionType` 액션 발동·**훅 계수**(hooks.ts:
reactEmit/interChange/optionOffer)를 더한 것이다. 훅 계수는 synergy3/instrument.ts 방식으로
def.install 을 이 프로세스 안에서만 감싼다(packages/ 무수정, `SOLO_NO_INSTRUMENT=1` 로 끄면
결과가 같음을 스모크 12판에서 확인). 규칙만 세우거나 인터셉터가 불렸지만 한 번도 바꾸지 않은
카드는 `passive`(표에서 `P`) — «발동 불가»가 아니라 «조건이 안 맞음/규칙형»이다.

불변식: harness `checkState` + `pairInvariants([aug])`. 단 USES_OVER_CAP(cap=matchUses 가정)은
`view:<seat>:uses:<id>` 채널의 `total` 이 있으면 그것과 대조해 `USES_OVER_TOTAL` 로만 남긴다
(scaledUses N>1 카드 오탐 방지). 소프트락은 `SOFTLOCK_TIMEOUT` 위반으로.
