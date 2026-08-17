#!/usr/bin/env bash
#
# gen-brand-assets.sh — 아이콘·공유 카드 PNG를 SVG 원본에서 다시 만든다.
#
#   bash scripts/gen-brand-assets.sh
#
# 원본은 packages/client/brand/ 의 SVG다. 산출물은 packages/client/public/ 에 들어가고
# **커밋한다** — 배포 머신에 이미지 툴체인이 없어도 되게, 그리고 빌드가 아이콘 생성에
# 의존하지 않게 하려는 것이다. 아이콘을 고쳤으면 이 스크립트를 돌리고 결과도 함께 커밋한다.
#
# 왜 qlmanage 인가: 이 맥에 rsvg-convert·ImageMagick·Inkscape가 없다. macOS 기본 도구만
# 쓰면 아무 설치 없이 누구나 재생성할 수 있다. 대신 두 가지 버릇을 감안해야 한다 —
#   · 결과가 항상 **정사각**이다 (그래서 og는 정사각 캔버스로 그리고 가운데를 오려 낸다)
#   · 파일명이 `<원본이름>.png` 로 나온다 (그래서 옮겨 담는다)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRAND="$ROOT/packages/client/brand"
OUT="$ROOT/packages/client/public"
TMP="$(mktemp -d -t majak-brand)"
trap 'rm -rf "$TMP"' EXIT

command -v qlmanage >/dev/null || { echo "✗ qlmanage가 없습니다 (macOS 전용 스크립트)"; exit 1; }
command -v sips >/dev/null || { echo "✗ sips가 없습니다 (macOS 전용 스크립트)"; exit 1; }

# svg → png (정사각). $1 원본, $2 크기, $3 결과 경로
render() {
  local src="$1" size="$2" dest="$3"
  rm -rf "$TMP/r"; mkdir -p "$TMP/r"
  qlmanage -t -s "$size" -o "$TMP/r" "$src" >/dev/null 2>&1
  local made="$TMP/r/$(basename "$src").png"
  [ -f "$made" ] || { echo "✗ 렌더 실패: $src"; exit 1; }
  # qlmanage가 요청 크기보다 작게 줄 때가 있어 한 번 더 맞춘다.
  sips -z "$size" "$size" "$made" >/dev/null 2>&1
  mv "$made" "$dest"
  echo "  $(basename "$dest")  ${size}×${size}"
}

echo "▶ 아이콘"
cp "$BRAND/icon.svg" "$OUT/icon.svg"          # 최신 브라우저는 SVG 파비콘을 그대로 쓴다
render "$BRAND/icon.svg" 512 "$OUT/icon-512.png"
render "$BRAND/icon.svg" 192 "$OUT/icon-192.png"
render "$BRAND/icon.svg" 180 "$OUT/apple-touch-icon.png"
render "$BRAND/icon.svg" 32 "$OUT/favicon-32.png"
render "$BRAND/icon.svg" 16 "$OUT/favicon-16.png"
render "$BRAND/icon-maskable.svg" 512 "$OUT/icon-maskable-512.png"

# favicon.ico — 링크 태그를 안 보는 도구(옛 브라우저·일부 크롤러·RSS 리더)가 루트에서
# 곧장 찾는 자리다. 없으면 SPA 폴백이 **HTML을 200으로** 내주고, 받는 쪽은 그걸
# 깨진 아이콘으로 표시한다. ICO 안에 PNG를 그대로 넣는 형식(Vista+)을 쓴다.
echo "▶ favicon.ico"
node -e '
const fs = require("fs");
const png = fs.readFileSync(process.argv[1]);
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);   // reserved
head.writeUInt16LE(1, 2);   // type = icon
head.writeUInt16LE(1, 4);   // image count
const dir = Buffer.alloc(16);
dir[0] = 32; dir[1] = 32;   // 32×32
dir[2] = 0;  dir[3] = 0;    // palette / reserved
dir.writeUInt16LE(1, 4);    // color planes
dir.writeUInt16LE(32, 6);   // bits per pixel
dir.writeUInt32LE(png.length, 8);
dir.writeUInt32LE(22, 12);  // offset = 6 + 16
fs.writeFileSync(process.argv[2], Buffer.concat([head, dir, png]));
' "$OUT/favicon-32.png" "$OUT/favicon.ico"
echo "  favicon.ico  32×32"

echo "▶ 공유 카드"
node "$BRAND/og.build.mjs"
render "$BRAND/og.svg" 1200 "$TMP/og-square.png"
cp "$TMP/og-square.png" "$OUT/og.png"
sips -c 630 1200 "$OUT/og.png" >/dev/null 2>&1   # 정사각에서 가운데 띠만 오려 낸다
W="$(sips -g pixelWidth "$OUT/og.png" | awk '/pixelWidth/{print $2}')"
H="$(sips -g pixelHeight "$OUT/og.png" | awk '/pixelHeight/{print $2}')"
[ "$W" = "1200" ] && [ "$H" = "630" ] || { echo "✗ og.png 크기가 ${W}×${H} 입니다 (1200×630 이어야 함)"; exit 1; }
echo "  og.png  1200×630"

echo
echo "✓ 완료 — 결과를 커밋하세요:"
echo "  git add packages/client/public/{icon.svg,icon-*.png,apple-touch-icon.png,favicon*,og.png} packages/client/brand/og.svg"
