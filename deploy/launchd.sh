#!/usr/bin/env bash
#
# launchd.sh — 이 저장소의 launchd 에이전트(감시자·자동 기동·백업)를 한 방식으로 등록한다.
#
# 다른 스크립트가 `source` 해서 쓴다:
#   majak_agent_install  <라벨접미사> <실행할 스크립트> <스케줄 XML>  [설명]
#   majak_agent_uninstall <라벨접미사>
#   majak_agent_status    <라벨접미사>
#
# 왜 공통으로 뽑았는가: 2026-08-17 감사에서 **감시자가 등록돼 있다고 문서에 적혀 있는데
# 실제로는 한 번도 돈 적이 없었다**(launchctl 조회 실패, 로그 파일 부재). 등록 성공과
# 동작은 다른 사건이고, 그 차이를 매번 손으로 확인하지 않으면 또 놓친다. 그래서 여기서
# 등록 → 즉시 실행 → **종료코드 확인**까지를 한 덩어리로 묶었다.
#
# macOS TCC 함정: 저장소가 ~/Documents·~/Desktop·~/Downloads 아래에 있으면 launchd가
# 띄운 프로세스는 파일 접근이 막혀 exit 126으로 죽는다. 등록은 성공하고 동작은 0회다.
# 이 저장소가 정확히 그 자리에 있어서 감시자가 죽어 있었다.

# shellcheck disable=SC2148

MAJAK_LAUNCHD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAJAK_LAUNCHD_RUNDIR="$MAJAK_LAUNCHD_ROOT/.majak"

# 저장소가 TCC 보호 디렉터리 아래에 있는가?
majak_in_protected_dir() {
  case "$MAJAK_LAUNCHD_ROOT/" in
    "$HOME"/Documents/*|"$HOME"/Desktop/*|"$HOME"/Downloads/*) return 0 ;;
    *) return 1 ;;
  esac
}

majak_tcc_help() {
  cat <<TCC_EOF

  ── 왜 실패했나
  macOS 개인정보 보호(TCC)가 launchd로 뜬 프로세스의 ~/Documents 접근을 막았습니다.
  저장소가 지금 여기 있습니다:  $MAJAK_LAUNCHD_ROOT

  ── 해결 (택 1)
  [권장] 저장소를 보호 디렉터리 밖으로 옮긴다 — 권한을 넓히지 않고 문제 자체를 없앤다:
      bash deploy/relocate.sh ~/majak
    (서버를 잠깐 내렸다가 새 자리에서 다시 세우고, 에이전트를 새 경로로 재등록합니다.)

  [대안] 지금 자리를 유지하고 /bin/bash 에 전체 디스크 접근 권한을 준다:
      시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한 → + → ⌘⇧G → /bin/bash
    이 권한은 launchd·cron으로 도는 **모든** 셸 스크립트에 적용됩니다. 범위가 넓다는
    점을 알고 켜세요.
TCC_EOF
}

# majak_agent_install <suffix> <script-path> <schedule-xml> [설명]
majak_agent_install() {
  local suffix="$1" script="$2" schedule="$3" desc="${4:-}"
  local label="com.yaho1231.majak.$suffix"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  local node_bin; node_bin="$(dirname "$(command -v node)")"

  mkdir -p "$HOME/Library/LaunchAgents" "$MAJAK_LAUNCHD_RUNDIR"
  cat >"$plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$script</string>
  </array>
  <key>WorkingDirectory</key><string>$MAJAK_LAUNCHD_ROOT</string>
  <!-- ⚠ 이 키가 없으면 감시자가 세운 서버를 launchd가 곧바로 죽인다.
       기본값(false)에서 launchd는 **작업이 끝나는 순간 그 프로세스 그룹에 남은 프로세스
       전부에 SIGTERM**을 보낸다. 감시자는 서버를 백그라운드 자식으로 띄우고 곧 끝나므로,
       "다시 세움 완료"를 찍은 그 초에 서버가 SIGTERM으로 죽었다. 그러면 1분 뒤 감시자가
       또 세우고 또 죽는다 — 2026-08-19 오전의 재시작 폭주가 정확히 이것이었다.
       (손으로 켠 서버는 launchd 작업 밖이라 멀쩡히 몇 시간씩 돌았고, 그 대비가 단서였다.) -->
  <key>AbandonProcessGroup</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$node_bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
$schedule
  <key>StandardOutPath</key><string>$MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log</string>
  <key>StandardErrorPath</key><string>$MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log</string>
</dict>
</plist>
PLIST_EOF

  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"

  # 등록만으로는 돈다고 말할 수 없다 — 실제로 한 번 돌려 종료코드를 본다.
  : >"$MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log"
  launchctl kickstart "gui/$(id -u)/$label" >/dev/null 2>&1 || true
  sleep 2
  local rc
  rc="$(launchctl print "gui/$(id -u)/$label" 2>/dev/null | awk -F'= ' '/last exit code/ {print $2; exit}')"
  if [ "${rc:-0}" = "0" ] || [ -z "${rc:-}" ]; then
    echo "✓ 등록 완료 — $label${desc:+  ($desc)}"
    echo "  로그: $MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log"
    return 0
  fi

  echo "⚠ 등록은 됐지만 첫 실행이 실패했습니다 (종료코드 $rc) — 지금은 동작하지 않습니다."
  if majak_in_protected_dir || grep -qi "not permitted\|Operation not permitted" "$MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log" 2>/dev/null; then
    majak_tcc_help
  else
    echo "  로그: $MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log"
    tail -10 "$MAJAK_LAUNCHD_RUNDIR/$suffix.launchd.log" 2>/dev/null | sed 's/^/    /'
  fi
  return 1
}

majak_agent_uninstall() {
  local label="com.yaho1231.majak.$1"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
  echo "✓ 등록 해제 — $label"
}

# 등록 여부 + **실제로 돌았는지**를 함께 답한다. 등록만 확인하면 감사 때 놓친 것과
# 같은 착시("설치돼 있다")가 다시 생긴다.
majak_agent_status() {
  local suffix="$1"
  local label="com.yaho1231.majak.$suffix"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    echo "  $suffix: 등록 안 됨"
    return 1
  fi
  # 플리스트는 install 때만 다시 쓰인다 — 이 키가 생기기 전에 등록해 둔 것이 그대로
  # 남아 있으면 감시자가 세운 서버를 launchd가 즉시 죽인다(위 주석 참고). 조용히 도는
  # 고장이라 상태 점검에서 반드시 짚는다.
  if [ -f "$plist" ] && ! grep -q "AbandonProcessGroup" "$plist"; then
    echo "  $suffix: 등록됨 — 그러나 **낡은 플리스트**입니다 (AbandonProcessGroup 없음)."
    echo "     이 상태로는 감시자가 세운 서버를 launchd가 곧바로 죽입니다 → 재시작 폭주."
    echo "     고치기:  bash deploy/agents.sh install"
    return 1
  fi
  local rc
  rc="$(launchctl print "gui/$(id -u)/$label" 2>/dev/null | awk -F'= ' '/last exit code/ {print $2; exit}')"
  if [ -n "${rc:-}" ] && [ "$rc" != "0" ]; then
    echo "  $suffix: 등록됨 — 그러나 마지막 실행이 실패했습니다 (종료코드 $rc)"
    majak_in_protected_dir && echo "     저장소가 $HOME/Documents 아래입니다 — TCC 차단이 유력합니다."
    return 1
  fi
  echo "  $suffix: 등록됨 · 정상"
  return 0
}
