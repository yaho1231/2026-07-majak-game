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
RUNDIR="$ROOT/.majak"
INTERVAL="${WATCHDOG_INTERVAL_SEC:-60}"
# 등록/해제/확인의 공통 절차(플리스트 작성 → 즉시 실행 → **종료코드 확인** → TCC 진단)는
# deploy/launchd.sh 가 갖고 있다. 백업 에이전트와 같은 방식이어야 한 곳만 고치면 된다.
# shellcheck source=deploy/launchd.sh
. "$HERE/launchd.sh"

case "${1:-status}" in
  install)
    majak_agent_install watchdog "$ROOT/scripts/watchdog.sh" \
      "  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>" \
      "${INTERVAL}초마다 /healthz 점검 · 로그인 시 자동 기동"
    RC=$?
    if [ "$RC" = "0" ]; then
      echo "  감시 로그: tail -f $RUNDIR/watchdog.log"
      echo "  일부러 내려 둘 때는 npm stop — 감시자가 되살리지 않습니다."
      echo "  백업까지 함께 켜려면: bash deploy/agents.sh install"
    fi
    exit "$RC"
    ;;
  uninstall)
    majak_agent_uninstall watchdog
    ;;
  run)
    exec bash "$ROOT/scripts/watchdog.sh"
    ;;
  status)
    majak_agent_status watchdog || true
    if [ -f "$RUNDIR/paused" ]; then echo "서버: 사람이 끔(.majak/paused) — 감시자가 건드리지 않습니다"; fi
    if [ -f "$RUNDIR/watchdog.log" ]; then echo "── 최근 감시 로그"; tail -10 "$RUNDIR/watchdog.log"; fi
    ;;
  *)
    echo "사용법: $0 {install|uninstall|status|run}"; exit 1 ;;
esac
