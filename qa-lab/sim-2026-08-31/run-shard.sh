#!/bin/bash
# 샤드 하나. 매니페스트 한 줄: 이름|판수|시드|풀인덱스(비면 전 카탈로그)
#
# 풀 id를 줄에 그대로 싣지 않는다 — BSD xargs -I 는 치환 문자열이 255바이트를
# 넘으면 "command line cannot be assembled, too long"으로 **줄 전체를 버린다.**
# 실제로 트랙 B 9샤드가 이렇게 통째로 실행되지 않았다. 인덱스만 넘기고 여기서 편다.
set -euo pipefail
cd "$(dirname "$0")"
IFS='|' read -r name games seed poolIdx <<< "$1"
out="out/${name}.jsonl"
log="logs/${name}.log"
[ -f "$out.done" ] && { echo "skip $name"; exit 0; }
rm -f "$out"
args=(--games "$games" --seed "$seed" --out "$out")
if [ -n "${poolIdx:-}" ]; then
  pool=$(node -e "process.stdout.write(require('./pools.json')[$poolIdx])")
  args+=(--pool "$pool")
fi
echo "[$(date +%H:%M:%S)] start $name games=$games pool=${poolIdx:-all}" >> "$log"
node --import tsx/esm runner.ts "${args[@]}" >> "$log" 2>&1
touch "$out.done"
echo "[$(date +%H:%M:%S)] done $name" >> "$log"
