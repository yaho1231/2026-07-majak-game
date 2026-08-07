#!/usr/bin/env bash
#
# watchdog.sh — 감시자(scripts/watchdog.sh)를 launchd에 등록/해제한다.
#
#   bash deploy/watchdog.sh install     # 1분마다 점검 + 로그인 시 자동 기동
#   bash deploy/watchdog.sh uninstall
#   bash deploy/watchdog.sh status      # 등록 여부·최근 감시 로그
#   bash deploy/watchdog.sh run         # 지금 한 번만 점검 (등록과 무관)
#
# 주의: LaunchAgent라 **이 사용자가 로그인해 있는 동안** 돈다. 맥이 잠자면 깨어난 뒤
# 다음 회차부터 다시 돈다. 재부팅 후 자동 로그인이 아니면 로그인 전까지는 서버도 없다.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
LABEL="com.yaho1231.majak.watchdog"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNDIR="$ROOT/.majak"
INTERVAL="${WATCHDOG_INTERVAL_SEC:-60}"

case "${1:-status}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$RUNDIR"
    # launchd는 PATH가 거의 비어 있다. node·npm이 있는 곳을 명시해야 serve.sh가 돈다.
    NODE_BIN="$(dirname "$(command -v node)")"
    cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/watchdog.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>StandardOutPath</key><string>$RUNDIR/watchdog.launchd.log</string>
  <key>StandardErrorPath</key><string>$RUNDIR/watchdog.launchd.log</string>
</dict>
</plist>
PLIST_EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"

    # 등록만으로는 돈다고 말할 수 없다. 실제로 한 번 돌려 보고 종료코드를 확인한다.
    # ~/Documents·~/Desktop·~/Downloads 아래에 저장소가 있으면 macOS TCC가 launchd
    # 프로세스의 파일 접근을 막아 exit 126으로 죽는다 — 등록은 성공, 감시는 0회다.
    : >"$RUNDIR/watchdog.launchd.log"
    launchctl kickstart "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
    sleep 2
    RC="$(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | awk -F'= ' '/last exit code/ {print $2; exit}')"
    if [ "${RC:-0}" = "0" ] || [ -z "${RC:-}" ]; then
      echo "✓ 감시자 등록 완료 — ${INTERVAL}초마다 /healthz 점검, 응답 없으면 자동 기동"
      echo "  로그: tail -f $RUNDIR/watchdog.log"
      echo "  일부러 내려 둘 때는 npm stop — 감시자가 되살리지 않습니다."
    else
      echo "⚠ 등록은 됐지만 첫 실행이 실패했습니다 (종료코드 $RC) — 지금은 감시되지 않습니다."
      if grep -qi "not permitted" "$RUNDIR/watchdog.launchd.log" 2>/dev/null; then
        cat <<'TCC_EOF'

  원인: macOS 개인정보 보호(TCC)가 ~/Documents 아래 파일을 launchd 프로세스에게 막았습니다.
  저장소가 Documents·Desktop·Downloads 밖(예: ~/majak)에 있으면 이 문제는 없습니다.
  지금 자리를 유지하려면 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한 에서
  /bin/bash 를 추가해야 합니다(⌘⇧G 로 경로 입력). 단, 이 권한은 launchd·cron으로 도는
  모든 셸 스크립트에 적용되므로 범위가 넓다는 점을 알고 켜세요.
TCC_EOF
      else
        echo "  로그: $RUNDIR/watchdog.launchd.log"
      fi
      exit 1
    fi
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ 감시자 등록 해제"
    ;;
  run)
    exec bash "$ROOT/scripts/watchdog.sh"
    ;;
  status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "감시자: 등록됨 (${INTERVAL}초 주기)"
    else
      echo "감시자: 등록 안 됨 — 켜려면 bash deploy/watchdog.sh install"
    fi
    if [ -f "$RUNDIR/paused" ]; then echo "서버: 사람이 끔(.majak/paused) — 감시자가 건드리지 않습니다"; fi
    if [ -f "$RUNDIR/watchdog.log" ]; then echo "── 최근 감시 로그"; tail -10 "$RUNDIR/watchdog.log"; fi
    ;;
  *)
    echo "사용법: $0 {install|uninstall|status|run}"; exit 1 ;;
esac
