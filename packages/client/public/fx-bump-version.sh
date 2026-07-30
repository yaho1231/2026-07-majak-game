#!/usr/bin/env bash
# 연출 랩 에셋 버전 올리기 (캐시 무효화)
#
# 왜 필요한가: 공개 서버는 Cloudflare 뒤에 있고, CF 가 .css/.js 를 브라우저 캐시
# 4시간(max-age=14400)으로 덮어쓴다. 오리진은 no-cache 를 보내지만 소용없다.
# fx-lab.html 은 CF 가 캐시하지 않으므로(cf-cache-status: DYNAMIC), HTML 안의
# 에셋 URL 에 ?v=N 을 붙여 두고 N 을 올리면 새 URL = 새 캐시 키가 된다.
#
# 중요: 모든 참조가 같은 N 이어야 한다. 버전이 섞이면 브라우저가 /fx-core.js?v=3 과
# ?v=4 를 서로 다른 모듈로 취급해 두 번 로드하고, 캔버스 루프·애니메이션 집합이
# 두 벌 생겨 조용히 오작동한다. 그래서 손으로 고치지 말고 이 스크립트를 쓴다.
#
# 사용법:  bash packages/client/public/fx-bump-version.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

cur=$(grep -oh 'fx-lab\.css?v=[0-9]*' fx-lab.html | grep -o '[0-9]*$')
next=$((cur + 1))

for f in fx-lab.html fx-*.js; do
  # 확장자를 [a-z]* 로 잡는다 — BSD sed(macOS) 는 BRE 에서 \| 교체를 지원하지 않아
  # \(js\|css\) 를 쓰면 조용히 아무것도 안 바뀐다.
  # -i 의 인자 차이(BSD 는 -i '')도 피하려고 임시 파일을 쓴다.
  sed "s|\(/fx-[a-z0-9-]*\.[a-z]*\)?v=[0-9]*|\1?v=${next}|g" "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
done

echo "에셋 버전 ${cur} → ${next}"
echo "확인:"
grep -oh '/fx-[a-z0-9-]*\.[a-z]*?v=[0-9]*' fx-lab.html fx-*.js | sort | uniq -c

# 실제로 바뀌었는지, 그리고 한 값으로 통일됐는지 둘 다 본다
found=$(grep -oh 'v=[0-9]*' fx-lab.html fx-*.js | sort -u)
if [ "$found" != "v=${next}" ]; then
  echo "✗ 버전이 v=${next} 로 통일되지 않았다 (발견: ${found}) — sed 가 안 먹었을 수 있다" >&2
  exit 1
fi
echo "✓ 모든 참조가 v=${next} 로 일치"
