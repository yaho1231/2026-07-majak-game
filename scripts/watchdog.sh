#!/usr/bin/env bash
#
# watchdog.sh — 서버가 서 있는지 1분마다 확인하고, 누워 있으면 일으켜 세운다.
#
# launchd(deploy/watchdog.sh install)가 주기적으로 부른다. 손으로 한 번 돌려 봐도 된다:
#   bash scripts/watchdog.sh
#
# 왜 필요한가: 2026-08-08 로그를 보면 배포용 restart 도중 stop만 되고 start가 오지
# 않은 채 방치된 구간이 두 번(53분·5시간) 있었다. 프로세스는 크래시하지 않았고,
# 아무도 없는 동안 서버만 조용히 꺼져 있었다. 그 공백을 메우는 게 이 스크립트다.
#
# 판단 기준은 "프로세스가 있느냐"가 아니라 /healthz 응답이다 — 프로세스가 살아 있어도
# WS 계층이 죽어 있으면 사용자에겐 꺼진 것과 같기 때문이다.
#
# 손대지 않는 경우:
#   · .majak/paused 가 있다 (사람이 `npm stop`으로 일부러 껐다)
#   · 이미 다른 회차가 돌고 있다 (.majak/watchdog.lock)
#   · 최근 15분 안에 3번 이상 일으켜 세웠다 (부팅 자체가 깨졌다는 뜻 — 사람이 볼 일)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNDIR="$ROOT/.majak"
PAUSEFILE="$RUNDIR/paused"
LOCKDIR="$RUNDIR/watchdog.lock"
WLOG="$RUNDIR/watchdog.log"
RESTARTS="$RUNDIR/watchdog.restarts"

HEALTH_TRIES="${WATCHDOG_HEALTH_TRIES:-3}"      # 정상 재시작 창을 오해하지 않게 여러 번 본다
HEALTH_GAP_SEC="${WATCHDOG_HEALTH_GAP_SEC:-5}"
RESTART_WINDOW_SEC="${WATCHDOG_RESTART_WINDOW_SEC:-900}"
RESTART_LIMIT="${WATCHDOG_RESTART_LIMIT:-3}"

mkdir -p "$RUNDIR"

# 알림 통로. 예전에는 "손이 필요하다"를 파일에 쓰고 정상 종료했고, 그 파일을 보는 사람이
# 없었다 — 감시자가 포기한 것을 아무도 모르는 게 이 시스템의 지배적 고장 모드였다.
ENV_FILE="$ROOT/deploy/majak.env"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
# shellcheck source=scripts/notify.sh
. "$ROOT/scripts/notify.sh"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >>"$WLOG"; }

# 사람이 일부러 끈 상태는 존중한다.
if [ -f "$PAUSEFILE" ]; then exit 0; fi

# 앞 회차가 아직 도는 중이면(빌드가 길어질 수 있다) 이번 회차는 건너뛴다.
# 10분 넘게 남아 있는 잠금은 죽은 회차가 남긴 것으로 보고 치운다.
if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
  log "낡은 잠금 제거 (10분 초과)"
  rmdir "$LOCKDIR" 2>/dev/null || true
fi
if ! mkdir "$LOCKDIR" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT

healthy() { bash "$ROOT/deploy/serve.sh" health >/dev/null 2>&1; }

# 감시자가 **자기가 세운 서버를 자기가 죽이는** 상태인지 본다.
# launchd는 AbandonProcessGroup이 없으면 작업이 끝나는 순간 그 프로세스 그룹에 남은
# 프로세스 전부에 SIGTERM을 보낸다 → 서버를 세우자마자 이 스크립트가 끝나면서 죽인다.
# 2026-08-19 오전에 이 상태로 한 시간 넘게 폭주했고, 로그만 보면 "다시 세움 완료"라
# 원인이 보이지 않았다. 그래서 재시작 직전에 한 줄로 짚는다.
STALE_PLIST="$HOME/Library/LaunchAgents/com.yaho1231.majak.watchdog.plist"
warn_if_self_killing() {
  [ -f "$STALE_PLIST" ] || return 0
  grep -q "AbandonProcessGroup" "$STALE_PLIST" && return 0
  log "⚠ 낡은 플리스트(AbandonProcessGroup 없음) — 세운 서버를 launchd가 곧바로 죽입니다. 고치기: bash deploy/agents.sh install"
  return 1
}

for i in $(seq 1 "$HEALTH_TRIES"); do
  if healthy; then exit 0; fi
  if [ "$i" -lt "$HEALTH_TRIES" ]; then sleep "$HEALTH_GAP_SEC"; fi
done

# 여기까지 왔으면 정말 응답이 없다. 최근 재시작 횟수를 세어 폭주를 막는다.
now="$(date +%s)"
recent=0
if [ -f "$RESTARTS" ]; then
  awk -v now="$now" -v w="$RESTART_WINDOW_SEC" '$1 + 0 > now - w' "$RESTARTS" >"$RESTARTS.tmp" || true
  mv "$RESTARTS.tmp" "$RESTARTS"
  recent="$(wc -l <"$RESTARTS" | tr -d ' ')"
fi
if [ "${recent:-0}" -ge "$RESTART_LIMIT" ]; then
  log "최근 $((RESTART_WINDOW_SEC / 60))분간 ${recent}회 재시작 — 부팅 자체가 깨진 것으로 보고 멈춘다. 손이 필요하다."
  # 여기가 감시자가 포기하는 유일한 지점이다. 조용히 끝내면 서버가 죽은 채로 방치된다.
  # 같은 창 안에서 여러 회차가 계속 도니까 알림은 창당 한 번만 보낸다.
  GAVEUP="$RUNDIR/watchdog.gaveup"
  if [ ! -f "$GAVEUP" ] || [ -z "$(find "$GAVEUP" -newermt "-${RESTART_WINDOW_SEC} seconds" 2>/dev/null)" ]; then
    : >"$GAVEUP"
    notify "감시자가 포기했습니다 — 서버가 꺼져 있습니다" \
"$((RESTART_WINDOW_SEC / 60))분 안에 ${recent}번 다시 세웠는데 계속 죽습니다.
부팅 자체가 깨진 상황이라 자동 복구를 멈췄습니다.

확인:  bash deploy/serve.sh status
로그:  tail -50 $RUNDIR/server.log
재개:  원인을 고친 뒤 rm $RESTARTS && bash deploy/serve.sh start"
  fi
  exit 0
fi

log "응답 없음 — 서버를 다시 세운다 (최근 ${recent}회)"
SELF_KILLING=0
warn_if_self_killing || SELF_KILLING=1
echo "$now" >>"$RESTARTS"
# ⚠ `start` 가 아니라 **`restart`** 다 (QA 2차 server 확정 3).
#
# 이 감시자의 판단 기준은 위에 적어 둔 대로 "프로세스가 있느냐"가 아니라 /healthz
# 응답이다. 그런데 복구를 `start` 로 하면 그 기준과 어긋난다: `majak.sh start` 는
# 첫 줄에서 `is_running`(PID 파일 + kill -0)을 보고 «이미 실행 중입니다»를 찍은 뒤
# **종료코드 0으로 즉시 반환**한다. 그러면 여기 성공 분기로 들어와 "다시 세움 완료"를
# 남기고 gaveup 표식을 지우고 «자동 복구는 성공» 알림까지 보내는데, **실제로는 아무
# 것도 하지 않았고 서버는 계속 죽어 있다.** 15분에 3회를 채우면 "부팅 자체가 깨졌다"는
# 틀린 진단과 함께 포기한다 — `restart` 한 번이면 살아났을 상황에서.
#
# 그리고 그게 가장 흔한 운영 고장이다: 프로세스는 살아 있는데 서비스가 멎은 상태
# (이벤트 루프 점유 · HTTP 서버만 닫힘 · 반쯤 끝난 종료). `/healthz` 가 예외 5회 초과에
# HTTP 500 을 주며 "나를 다시 세워 달라"고 말하는 유일한 경로도 여기로 들어오는데,
# 받는 쪽에 그걸 실행할 수단이 없었다.
#
# `restart` 는 **빌드를 먼저 하고 성공했을 때만** 교체하므로(majak.sh:141) «빌드 깨진
# 커밋에 서버가 내려간 채로 남는» 예전 함정도 그대로 피한다.
if bash "$ROOT/deploy/serve.sh" restart >>"$WLOG" 2>&1; then
  log "다시 세움 완료"
  rm -f "$RUNDIR/watchdog.gaveup"
  # 되살아났다는 사실 자체가 신호다 — 왜 누웠는지 사람이 봐야 한다.
  if [ "$SELF_KILLING" = "1" ]; then
    notify "서버를 세웠지만 곧 다시 죽습니다 — 감시자 설정이 낡았습니다" \
"launchd 플리스트에 AbandonProcessGroup 이 없어, 감시자가 끝나는 순간 방금 세운 서버가
SIGTERM 으로 죽습니다. 1분마다 이 일이 반복됩니다.

고치기:  bash deploy/agents.sh install"
  else
    notify "서버가 누워 있어 다시 세웠습니다" \
"자동 복구는 성공했지만 원인은 남아 있습니다 (최근 $((RESTART_WINDOW_SEC / 60))분간 $((recent + 1))회).
로그: tail -50 $RUNDIR/server.log"
  fi
else
  log "✗ 다시 세우기 실패 — 위 출력과 .majak/server.log 를 볼 것"
  notify "서버를 다시 세우지 못했습니다" \
"자동 복구가 실패했습니다. 지금 서버는 꺼져 있습니다.
로그: tail -50 $WLOG
      tail -50 $RUNDIR/server.log"
fi
