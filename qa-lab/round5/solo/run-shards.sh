#!/bin/bash
# B-1 단독 스위프 — N 샤드를 백그라운드로 띄운다 (sim-2026-08-31/run-shard.sh 방식).
#
#   bash qa-lab/round5/solo/run-shards.sh <shards> [seeds=5] [outDir=out]
#
# 샤드 s 의 결과: <outDir>/<s>.jsonl, 로그: logs/<s>.log, 완료 표식: <outDir>/<s>.jsonl.done
# (표식이 있으면 건너뛴다. run.ts 는 이미 적힌 줄을 건너뛰므로 죽은 샤드는 그냥 다시 띄우면 이어 돈다.)
# PID 는 logs/pids-<outDir>.txt 에 적는다 — 죽일 땐 **그 PID 로만** (pkill 패턴 금지, CLAUDE.md).
# 환경변수 SOLO_AUGS/SOLO_PERSONAS/SOLO_MODES/SOLO_TIMEOUT_MS 는 run.ts 로 그대로 넘어간다.
set -euo pipefail
cd "$(dirname "$0")"
shards=${1:?usage: run-shards.sh <shards> [seeds] [outDir]}
seeds=${2:-5}
outDir=${3:-out}
TSX=${TSX:-$HOME/majak/node_modules/.bin/tsx}
[ -x "$TSX" ] || TSX="npx tsx"
mkdir -p "$outDir" logs
pidfile="logs/pids-${outDir}.txt"
: > "$pidfile"
for ((s = 0; s < shards; s++)); do
  out="$outDir/$s.jsonl"
  log="logs/$s.log"
  if [ -f "$out.done" ]; then echo "skip shard $s (done)"; continue; fi
  (
    echo "[$(date +%H:%M:%S)] start shard $s/$shards seeds=$seeds out=$outDir" >> "$log"
    if SOLO_OUT="$outDir" $TSX run.ts "$s" "$shards" "$seeds" >> "$log" 2>&1; then
      touch "$out.done"
      echo "[$(date +%H:%M:%S)] done shard $s" >> "$log"
    else
      echo "[$(date +%H:%M:%S)] FAILED shard $s (exit $?) — 다시 띄우면 이어 돈다" >> "$log"
    fi
  ) &
  echo "$! shard=$s" >> "$pidfile"
  echo "shard $s pid $!"
done
echo "launched. progress: tail -n 2 logs/*.log ; done markers: ls $outDir/*.done ; pids: $pidfile"
