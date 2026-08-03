#!/usr/bin/env bash
# 효과음 랩 에셋 버전 올리기 (캐시 무효화) — fx-bump-version.sh 와 같은 원리.
# Cloudflare 가 .css/.js 를 4시간 캐시하므로 ?v=N 을 올려 새 캐시 키를 만든다.
# 모든 참조가 같은 N 이어야 한다 — 손으로 고치지 말고 이 스크립트를 쓴다.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

cur=$(grep -oh 'sfx-lab\.css?v=[0-9]*' sfx-lab.html | grep -o '[0-9]*$')
next=$((cur + 1))

for f in sfx-lab.html sfx-*.js; do
  sed "s|\(/sfx-[a-z0-9-]*\.[a-z]*\)?v=[0-9]*|\1?v=${next}|g" "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
done

echo "에셋 버전 ${cur} → ${next}"
found=$(grep -oh '/sfx-[a-z0-9-]*\.[a-z]*?v=[0-9]*' sfx-lab.html sfx-*.js | grep -o 'v=[0-9]*' | sort -u)
if [ "$found" != "v=${next}" ]; then
  echo "✗ 버전이 v=${next} 로 통일되지 않았다 (발견: ${found})" >&2
  exit 1
fi
echo "✓ 모든 참조가 v=${next} 로 일치"
