#!/bin/bash
# 정보 축 티어 재평가 러너 — 시드 구간을 8갈래로 갈라 병렬 실행.
#   bash qa-lab/synergy4/build/info_all.sh <seedFrom> <seedTo>
cd "$(dirname "$0")/../../.." || exit 1
CARDS="xray_hand,tenpai_scan,danger_sense,hidden_river,brief_fog,dora_conceal,triple_peek,peek_riichi_waits,foresight,bottom_deal,rinshan_preview,ura_peek,dead_wall_master,mixed_triplet,bluff_pretense,tile_dyeing,hidden_blade,no_ron_pact,always_tenpai"
FROM=${1:-1}; TO=${2:-60}
mkdir -p qa-lab/synergy4/build/info_out
N=$(( (TO - FROM + 1 + 7) / 8 ))
for i in $(seq 0 7); do
  a=$(( FROM + i * N )); b=$(( a + N - 1 )); [ "$b" -gt "$TO" ] && b=$TO
  [ "$a" -gt "$TO" ] && continue
  /Users/skul/majak/node_modules/.bin/tsx qa-lab/synergy4/build/info_tier.ts "$a" "$b" "$CARDS" \
    >> qa-lab/synergy4/build/info_out/log.txt 2>&1 &
done
wait
echo INFO_ALLDONE
