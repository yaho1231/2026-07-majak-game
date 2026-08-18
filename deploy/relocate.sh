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

# 워크트리는 **지우지 않는다.**
#
# 예전에는 워크트리가 하나라도 붙어 있으면 여기서 멈추고 "먼저 정리하세요"라고 했다.
# 근거는 옳았다 — 워크트리의 `.git` 파일과 본체의 `.git/worktrees/<이름>/gitdir` 이
# 서로를 **절대경로로** 가리키므로, 통째로 옮기면 양쪽이 다 어긋난다.
#
# 그런데 그 처방은 이 저장소에서 쓸 수 없다. 실측(2026-08-18)으로 워크트리가 **22개**
# 붙어 있었고 그중 둘에는 **커밋되지 않은 변경**이, 여럿에는 아직 안 올린 작업이 있었다.
# 다른 세션이 지금 쓰고 있는 작업 사본을 지우게 만드는 안내는 이전을 돕는 것이 아니라
# 막는 것이다 — 그래서 실제로 이전이 미뤄지고, 그동안 감시자·백업은 계속 안 돌았다.
#
# `git worktree repair` 가 정확히 이 어긋남을 고치라고 있는 명령이다. 옮긴 **뒤** 새
# 자리에서 한 번 부르면 양쪽 링크가 전부 새 경로로 다시 쓰인다. 지울 것이 없다.
WT_COUNT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -c '^worktree ' || echo 1)"
WT_COUNT=$((WT_COUNT - 1))
# 커밋되지 않은 변경이 있는 워크트리는 **이름을 불러 준다.** 파일은 그대로 따라가지만,
# 그 세션의 터미널은 옛 경로를 보고 있으므로 사람이 알고 있어야 한다.
DIRTY=""
while IFS= read -r wt; do
  [ -z "$wt" ] && continue
  [ "$wt" = "$ROOT" ] && continue
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    DIRTY="$DIRTY\n    $wt"
  fi
done <<< "$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}')"

echo "── 할 일"
echo "  1. 서버를 정상 종료합니다 (진행 중인 대국은 사람들에게 알린 뒤 끝납니다)"
echo "  2. 등록된 launchd 에이전트를 모두 해제합니다"
echo "  3. $ROOT"
echo "     → $DEST  로 통째로 옮깁니다"
echo "  4. 새 자리에서 에이전트를 다시 등록하고 서버를 세웁니다"
echo
echo "  ⚠ 옮긴 뒤에는 예전 경로로 열어 둔 터미널·에디터가 전부 무효가 됩니다."
echo "  ⚠ cloudflared 설정이 경로를 참조한다면 따로 고쳐야 합니다(포트만 참조하면 무관)."
if [ "$WT_COUNT" -gt 0 ]; then
  echo
  echo "  ℹ git 워크트리 ${WT_COUNT}개가 함께 따라갑니다 (지우지 않습니다)."
  echo "    옮긴 뒤 'git worktree repair' 로 링크를 새 경로에 다시 씁니다."
  if [ -n "$DIRTY" ]; then
    echo "  ⚠ 커밋되지 않은 변경이 있는 워크트리 — 파일은 그대로 따라가지만"
    echo "    그 세션의 터미널은 옛 경로를 보게 됩니다:"
    printf "%b\n" "$DIRTY"
  fi
fi
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

echo "▶ 워크트리 링크 고치기…"
cd "$DEST"
#
# ⚠ **새 경로를 직접 짚어 줘야 한다.** 인자 없이 `git worktree repair` 만 부르면
#   아무것도 안 고쳐진다 — 본체의 `.git/worktrees/<이름>/gitdir` 이 아직 옛 경로를
#   가리키고 있어 git 이 워크트리가 어디로 갔는지 모르기 때문이다. `worktree list`
#   에서 경로를 읽어 넘기는 것도 같은 이유로 소용없다(그 목록이 곧 옛 경로다).
#
#   실측(2026-08-18, 임시 저장소로 재현): 인자 없이 부르면 목록이 계속 옛 경로를
#   `prunable` 로 보여 주고 워크트리 안에서 `git status` 가 "깃 저장소가 아닙니다"
#   로 죽는다. 새 경로를 인자로 주면 양쪽 링크가 다 고쳐지고 **커밋되지 않은
#   파일도 그대로 남는다.**
#
if [ -d "$DEST/.claude/worktrees" ]; then
  git -C "$DEST" worktree repair "$DEST"/.claude/worktrees/* || true
fi
git -C "$DEST" worktree prune || true
# 고쳐졌는지 실제로 확인한다 — 여기서 조용히 실패하면 다른 세션이 그때서야 깨진 걸 안다.
BROKEN=0
while IFS= read -r wt; do
  [ -z "$wt" ] && continue
  git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 || { echo "  ✗ 링크가 깨졌습니다: $wt"; BROKEN=1; }
done <<< "$(git -C "$DEST" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}')"
if [ "$BROKEN" -eq 0 ]; then
  echo "  ✓ 워크트리 $(($(git -C "$DEST" worktree list | wc -l | tr -d ' ') - 1))개 정상"
else
  echo "  ⚠ 새 경로에서 직접 고치세요:  git -C $DEST worktree repair $DEST/.claude/worktrees/*"
fi

echo "▶ 새 자리에서 다시 세우기…"
bash "$DEST/deploy/agents.sh" install || true
bash "$DEST/deploy/serve.sh" start

echo
echo "✓ 완료 — 새 경로: $DEST"
echo "  이 터미널은 예전 경로를 보고 있습니다. 새 터미널을 열거나:  cd $DEST"
