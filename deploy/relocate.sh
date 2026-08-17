#!/usr/bin/env bash
#
# relocate.sh — 저장소를 TCC 보호 디렉터리 밖으로 옮긴다.
#
#   bash deploy/relocate.sh ~/majak
#
# 왜 필요한가: 이 저장소는 ~/Documents 아래에 있다. macOS 개인정보 보호(TCC)는 launchd로
# 뜬 프로세스가 그 아래 파일을 읽는 것을 막는다. 그래서 감시자·백업 에이전트를 등록해도
# **등록만 되고 한 번도 돌지 않는다**(2026-08-17 감사에서 실제로 확인: launchctl 조회
# 실패, .majak/watchdog.log 파일 자체가 없음). 자리를 옮기면 권한을 넓히지 않고 원인이
# 사라진다.
#
# 이 스크립트는 되돌리기 어려운 일을 한다(서버 중단 + 디렉터리 이동). 그래서 무엇을 할지
# 먼저 전부 보여 주고, 사람이 직접 타이핑해 확인해야만 진행한다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-}"

if [ -z "$DEST" ]; then
  echo "사용법: bash deploy/relocate.sh <새 경로>   (예: ~/majak)"
  exit 1
fi
DEST="${DEST/#\~/$HOME}"
case "$DEST" in /*) ;; *) DEST="$PWD/$DEST" ;; esac

if [ -e "$DEST" ]; then
  echo "✗ 이미 존재합니다: $DEST — 비어 있는 새 경로를 지정하세요."
  exit 1
fi
case "$DEST/" in
  "$HOME"/Documents/*|"$HOME"/Desktop/*|"$HOME"/Downloads/*)
    echo "✗ $DEST 도 TCC 보호 디렉터리 아래입니다. 옮기는 의미가 없습니다."
    exit 1 ;;
esac

# 워크트리가 붙어 있으면 이동이 깨진다(.git 경로가 절대경로로 박혀 있다).
WT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -c '^worktree ' || echo 1)"
if [ "${WT:-1}" -gt 1 ]; then
  echo "✗ git 워크트리가 $((WT - 1))개 붙어 있습니다. 먼저 정리하세요:"
  git -C "$ROOT" worktree list | tail -n +2 | sed 's/^/    /'
  echo "    git worktree remove <경로>"
  exit 1
fi

echo "── 할 일"
echo "  1. 서버를 정상 종료합니다 (진행 중인 대국은 사람들에게 알린 뒤 끝납니다)"
echo "  2. 등록된 launchd 에이전트를 모두 해제합니다"
echo "  3. $ROOT"
echo "     → $DEST  로 통째로 옮깁니다"
echo "  4. 새 자리에서 에이전트를 다시 등록하고 서버를 세웁니다"
echo
echo "  ⚠ 옮긴 뒤에는 예전 경로로 열어 둔 터미널·에디터가 전부 무효가 됩니다."
echo "  ⚠ cloudflared 설정이 경로를 참조한다면 따로 고쳐야 합니다(포트만 참조하면 무관)."
echo
printf '진행하려면 정확히 "옮긴다" 라고 입력하세요: '
read -r ANSWER
[ "$ANSWER" = "옮긴다" ] || { echo "취소했습니다."; exit 1; }

echo "▶ 서버 종료…"
bash "$ROOT/deploy/serve.sh" stop || true

echo "▶ 에이전트 해제…"
bash "$ROOT/deploy/agents.sh" uninstall || true

echo "▶ 이동…"
mkdir -p "$(dirname "$DEST")"
mv "$ROOT" "$DEST"

echo "▶ 새 자리에서 다시 세우기…"
cd "$DEST"
bash "$DEST/deploy/agents.sh" install || true
bash "$DEST/deploy/serve.sh" start

echo
echo "✓ 완료 — 새 경로: $DEST"
echo "  이 터미널은 예전 경로를 보고 있습니다. 새 터미널을 열거나:  cd $DEST"
