#!/bin/sh
cd "$(dirname "$0")"
echo "== 웨이브별 판(국) 수"
for f in ../pairs/shard*.log out/*.log; do
  [ -f "$f" ] || continue
  last=$(grep -E "^\[?[0-9]?\]? *DONE|DONE" "$f" | tail -n1)
  cur=$(grep -oE "rounds=[0-9]+" "$f" | tail -n1)
  printf "%-46s %s %s\n" "$f" "${cur:-rounds=0}" "$last"
done
echo "== 합계"
{ for f in ../pairs/shard*.log out/*.log; do [ -f "$f" ] || continue; grep -oE "rounds=[0-9]+" "$f" | tail -n1; done; } | sed 's/rounds=//' | awk '{s+=$1} END {print "총 국 수:", s}'
{ for f in ../pairs/shard*.log out/*.log; do [ -f "$f" ] || continue; grep -oE "^\[?[0-9]?\]? ?[0-9]+/[0-9]+" "$f" | tail -n1 | grep -oE "^[0-9]+|[0-9]+/" ; done; } >/dev/null 2>&1
