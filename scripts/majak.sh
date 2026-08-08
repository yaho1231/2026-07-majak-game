#!/usr/bin/env bash
#
# majak.sh — 한 터미널에서 이능마작 서버를 켜고 끈다.
#
# 단일 포트 배포(서버가 빌드된 클라이언트를 정적 서빙 + WS)라 프로세스 1개면 된다.
#   npm start     클라 빌드 → 서버를 백그라운드로 실행 (터미널은 곧 반환)
#   npm stop      실행 중인 서버 종료
#   npm run restart / status / logs
#
# 환경변수(그대로 서버로 전달): PORT(기본 3001)·DB_PATH·SESSION_TTL_MS·
#   INTER_ROUND_DELAY_MS·CLIENT_DIST.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNDIR="$ROOT/.majak"
PIDFILE="$RUNDIR/server.pid"
PORTFILE="$RUNDIR/server.port"
LOG="$RUNDIR/server.log"
# 사람이 **일부러** 껐다는 표식. 감시자(watchdog.sh)는 이 파일이 있으면 손대지 않는다.
# `stop`이 만들고 `start`가 지운다. `restart`의 내부 stop은 만들지 않는다 —
# 배포 도중(stop 직후) 세션이 끊겨도 감시자가 1분 안에 다시 세우게 하려는 것이다.
PAUSEFILE="$RUNDIR/paused"
PORT="${PORT:-3001}"

mkdir -p "$RUNDIR"

# 로그 1개 최대 크기(바이트)와 보관 세대 수. 작은 배포라 세대 3개면 충분하다.
LOG_MAX_BYTES="${LOG_MAX_BYTES:-10485760}"   # 10 MiB
LOG_KEEP="${LOG_KEEP:-3}"

# 로그가 상한을 넘었으면 세대를 밀어 낸다 (server.log → .1 → .2 → .3, 마지막은 버림).
rotate_log() {
  [ -f "$LOG" ] || return 0
  local size
  size="$(wc -c <"$LOG" 2>/dev/null || echo 0)"
  [ "$size" -lt "$LOG_MAX_BYTES" ] && return 0
  rm -f "$LOG.$LOG_KEEP"
  local i
  for ((i = LOG_KEEP - 1; i >= 1; i--)); do
    [ -f "$LOG.$i" ] && mv "$LOG.$i" "$LOG.$((i + 1))"
  done
  mv "$LOG" "$LOG.1"
}

is_running() {
  [ -f "$PIDFILE" ] || return 1
  local pid; pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# 실행 중인 서버의 실제 포트 (없으면 현재 PORT 기본값)
running_port() {
  if [ -f "$PORTFILE" ]; then cat "$PORTFILE"; else echo "$PORT"; fi
}

start() {
  if is_running; then
    echo "이미 실행 중입니다 (pid $(cat "$PIDFILE")) — http://localhost:$(running_port)"
    exit 0
  fi
  rm -f "$PAUSEFILE"
  echo "▶ 클라이언트 빌드 중…"
  if ! (cd "$ROOT" && npm run build:client >"$RUNDIR/build.log" 2>&1); then
    echo "✗ 클라이언트 빌드 실패:"; tail -20 "$RUNDIR/build.log"; exit 1
  fi
  echo "▶ 서버 시작 (포트 $PORT)…"
  # ⚠ 로그는 **덮어쓰지 않는다**(`>` → `>>`). 예전에는 재시작할 때마다 로그가 통째로
  #   비워져서, 가장 흔한 진단 흐름("죽었다길래 재시작했는데 로그 좀 보자")이 구조적으로
  #   불가능했다. 대신 크기가 차면 세대를 밀어 낸다.
  rotate_log
  {
    echo ""
    echo "──────── 서버 시작 $(date -u +%Y-%m-%dT%H:%M:%SZ) (포트 $PORT) ────────"
  } >>"$LOG"
  local started_at; started_at="$(wc -l <"$LOG" 2>/dev/null || echo 0)"
  # exec로 서브셸을 node로 치환 → $!가 node의 PID (stop이 정확히 그 프로세스를 종료)
  ( cd "$ROOT/packages/server" && export PORT="$PORT" && exec node --import tsx/esm src/index.ts ) >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  echo "$PORT" >"$PORTFILE"
  # 부팅 대기 (이번에 시작한 부분에서만 찾는다 — 로그가 누적되므로 지난 부팅의 줄에 속지 않게)
  for _ in $(seq 1 30); do
    tail -n +"$started_at" "$LOG" 2>/dev/null | grep -q "listening on" && break
    is_running || { echo "✗ 시작 실패:"; tail -20 "$LOG"; rm -f "$PIDFILE"; exit 1; }
    sleep 0.2
  done
  if is_running; then
    echo "✓ 실행 중 — http://localhost:$PORT   (끄기: npm stop)"
    grep -E "관리자 가입 코드" "$LOG" | tail -1 || true
    echo "  로그: npm run logs"
  else
    echo "✗ 시작 실패:"; tail -20 "$LOG"; rm -f "$PIDFILE"; exit 1
  fi
}

# stop [--for-restart]
#   --for-restart 를 주면 일시정지 표식을 남기지 않는다(곧 start가 뒤따르므로).
stop() {
  local keep_paused=1
  if [ "${1:-}" = "--for-restart" ]; then keep_paused=0; fi
  if [ "$keep_paused" = "1" ]; then : >"$PAUSEFILE"; fi
  if is_running; then
    local pid; pid="$(cat "$PIDFILE")"
    kill "$pid" 2>/dev/null || true
    # SIGTERM을 받은 서버는 진행 중인 판을 사람들에게 알리고 통계 저장을 마친 뒤
    # 스스로 나간다(index.ts의 정상 종료). 예전의 4초는 그 여유를 주지 못해
    # SIGKILL이 정리 도중을 잘랐다 — 서버 자체가 3초 안에 강제 탈출하므로 10초면 충분하다.
    for _ in $(seq 1 50); do is_running || break; sleep 0.2; done
    if is_running; then
      echo "⚠ 정상 종료가 끝나지 않아 강제 종료합니다."
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE" "$PORTFILE"
    echo "✓ 서버를 껐습니다."
  else
    rm -f "$PIDFILE" "$PORTFILE"
    echo "실행 중이 아닙니다."
  fi
  if [ "$keep_paused" = "1" ]; then
    echo "  (감시자는 이 상태를 건드리지 않습니다 — 다시 켜려면 npm start)"
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop --for-restart; start ;;
  status)
    if is_running; then echo "실행 중 (pid $(cat "$PIDFILE")) — http://localhost:$(running_port)";
    elif [ -f "$PAUSEFILE" ]; then echo "꺼짐 (사람이 끔 — 감시자가 되살리지 않습니다)";
    else echo "꺼짐"; fi ;;
  logs) exec tail -n 50 -f "$LOG" ;;
  *) echo "사용법: $0 {start|stop|restart|status|logs}"; exit 1 ;;
esac
