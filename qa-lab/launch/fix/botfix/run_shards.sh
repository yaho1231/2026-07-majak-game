#!/bin/bash
# run_shards.sh — fire_rate.ts를 8개 덩이(프로세스)로 나눠 돌린다.
# 한 프로세스가 수백 판을 넘기지 않게 하는 것이 요점(2026-08-28 augbug 감사 반영:
# 350판 넘게 한 프로세스에 몰았다가 5시간 헛돈 사고가 있었다). 여기는 덩이당
# 10종 × 20판 = 200판이라 그 절반 수준이다.
set -e
cd "$(dirname "$0")/../../../.." # repo root
TSX=/Users/skul/majak/node_modules/.bin/tsx
GAMES=20
OUTDIR=qa-lab/launch/fix/botfix
mkdir -p "$OUTDIR"

# 74종을 [0,10) [10,20) ... [70,74) 8덩이로 — 배열로 둬 파이프 서브셸을 피한다(wait가 보여야 한다)
STARTS=(0 10 20 30 40 50 60 70)
ENDS=(10 20 30 40 50 60 70 74)

for i in "${!STARTS[@]}"; do
  start="${STARTS[$i]}"
  end="${ENDS[$i]}"
  out="$OUTDIR/fire_rate.shard_${start}_${end}.jsonl"
  log="$OUTDIR/fire_rate.shard_${start}_${end}.log"
  echo "launching shard [$start,$end) -> $out"
  nohup "$TSX" "$OUTDIR/fire_rate.ts" "$GAMES" "$out" "$start" "$end" > "$log" 2>&1 &
  echo "  pid=$!"
done
wait
echo "all shards finished"
