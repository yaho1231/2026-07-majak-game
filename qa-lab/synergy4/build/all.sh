#!/bin/bash
cd "$(dirname "$0")/../../.." || exit 1
KEYS=$(grep -oE 'key: "[a-z_]+"' qa-lab/synergy4/build/builds.ts | sed 's/key: "//;s/"//')
echo "$KEYS" | xargs -P 8 -I{} sh -c '~/majak/node_modules/.bin/tsx qa-lab/synergy4/build/runner.ts {} '"$1"' '"$2"' hanchan >> qa-lab/synergy4/build/out/log.txt 2>&1'
echo ALLDONE
