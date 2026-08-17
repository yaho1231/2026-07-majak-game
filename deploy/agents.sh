#!/usr/bin/env bash
#
# agents.sh — 자동으로 도는 것들을 한 번에 켜고, 한 번에 확인한다.
#
#   bash deploy/agents.sh install     # 감시자 + 백업 등록 (로그인 시 자동 기동 포함)
#   bash deploy/agents.sh uninstall
#   bash deploy/agents.sh status      # 등록 여부 + 실제로 도는지 + 마지막 백업
#
# 무엇이 도는가
#   watchdog  1분마다 /healthz 점검 → 응답 없으면 서버를 세운다.
#             **RunAtLoad 라 로그인 직후에도 한 번 돈다 — 이것이 재부팅 후 자동 기동
#             경로다.** 별도의 부팅 전용 에이전트를 두지 않는 이유: 둘이 동시에
#             서버를 세우려 들면 서로를 밟는다.
#   backup    매일 04:30 에 DB 스냅샷 + 리플레이 미러 (scripts/backup.sh)
#
# ⚠ LaunchAgent는 **이 사용자가 로그인해 있는 동안**만 돈다. 재부팅 후 자동 로그인이
#   꺼져 있으면 로그인 화면에 머무는 동안에는 서버도 없다. 무인 운용을 원하면
#   시스템 설정 → 사용자 및 그룹 → 자동 로그인 을 켜야 한다.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RUNDIR="$ROOT/.majak"
# shellcheck source=deploy/launchd.sh
. "$HERE/launchd.sh"

WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL_SEC:-60}"
BACKUP_HOUR="${BACKUP_HOUR:-4}"
BACKUP_MINUTE="${BACKUP_MINUTE:-30}"

case "${1:-status}" in
  install)
    ok=0
    echo "── 감시자 (로그인 시 자동 기동 + ${WATCHDOG_INTERVAL}초 주기 점검)"
    majak_agent_install watchdog "$ROOT/scripts/watchdog.sh" \
      "  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$WATCHDOG_INTERVAL</integer>" \
      "서버가 누우면 다시 세운다" || ok=1

    echo
    echo "── 백업 (매일 $(printf '%02d:%02d' "$BACKUP_HOUR" "$BACKUP_MINUTE"))"
    majak_agent_install backup "$ROOT/scripts/backup.sh" \
      "  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$BACKUP_HOUR</integer>
    <key>Minute</key><integer>$BACKUP_MINUTE</integer>
  </dict>" \
      "DB 스냅샷 + 리플레이 미러" || ok=1

    echo
    if [ "$ok" = "0" ]; then
      echo "✓ 전부 등록되고 첫 실행도 성공했습니다."
      echo "  확인:  bash deploy/agents.sh status"
    else
      echo "✗ 일부가 등록만 되고 돌지 않습니다 — 위 안내를 따르세요."
      exit 1
    fi
    ;;

  uninstall)
    majak_agent_uninstall watchdog
    majak_agent_uninstall backup
    ;;

  status)
    echo "── 에이전트"
    majak_agent_status watchdog || true
    majak_agent_status backup || true

    echo "── 서버"
    if bash "$ROOT/deploy/serve.sh" health >/dev/null 2>&1; then
      echo "  응답 정상 (/healthz)"
    elif [ -f "$RUNDIR/paused" ]; then
      echo "  꺼짐 — 사람이 껐습니다(.majak/paused). 감시자가 건드리지 않습니다."
    else
      echo "  ⚠ 응답 없음"
    fi

    echo "── 백업"
    BK="${BACKUP_DIR:-$HOME/majak-backups}"
    latest="$(ls -1t "$BK"/db/majak-*.db.gz 2>/dev/null | head -1 || true)"
    if [ -n "$latest" ]; then
      echo "  마지막: $(basename "$latest")  ($(date -r "$latest" '+%Y-%m-%d %H:%M'))"
      echo "  위치:   $BK  ($(du -sh "$BK" 2>/dev/null | cut -f1))"
      # 이틀 넘게 백업이 없으면 조용한 실패다 — 여기서 잡는다.
      if [ -z "$(find "$latest" -mtime -2 2>/dev/null)" ]; then
        echo "  ⚠ 마지막 백업이 이틀을 넘었습니다 — 에이전트가 돌지 않는 것으로 보입니다."
      fi
    else
      echo "  ⚠ 백업이 하나도 없습니다 — bash scripts/backup.sh 로 한 번 돌려 보세요."
    fi

    echo "── 최근 알림"
    if [ -f "$RUNDIR/alerts.log" ]; then tail -5 "$RUNDIR/alerts.log" | sed 's/^/  /'; else echo "  (없음)"; fi
    ;;

  *)
    echo "사용법: $0 {install|uninstall|status}"; exit 1 ;;
esac
