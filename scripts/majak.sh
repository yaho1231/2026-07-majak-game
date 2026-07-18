#!/usr/bin/env bash
#
# majak.sh — 한 터미널에서 MAJAK 서버를 켜고 끈다.
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
PORT="${PORT:-3001}"

mkdir -p "$RUNDIR"

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
  echo "▶ 클라이언트 빌드 중…"
  if ! (cd "$ROOT" && npm run build:client >"$RUNDIR/build.log" 2>&1); then
    echo "✗ 클라이언트 빌드 실패:"; tail -20 "$RUNDIR/build.log"; exit 1
  fi
  echo "▶ 서버 시작 (포트 $PORT)…"
  # exec로 서브셸을 node로 치환 → $!가 node의 PID (stop이 정확히 그 프로세스를 종료)
  ( cd "$ROOT/packages/server" && export PORT="$PORT" && exec node --import tsx/esm src/index.ts ) >"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  echo "$PORT" >"$PORTFILE"
  # 부팅 대기 (관리자 코드가 로그에 찍히면 준비됨)
  for _ in $(seq 1 30); do
    grep -q "listening on" "$LOG" 2>/dev/null && break
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

stop() {
  if is_running; then
    local pid; pid="$(cat "$PIDFILE")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do is_running || break; sleep 0.2; done
    if is_running; then kill -9 "$pid" 2>/dev/null || true; fi
    rm -f "$PIDFILE" "$PORTFILE"
    echo "✓ 서버를 껐습니다."
  else
    rm -f "$PIDFILE" "$PORTFILE"
    echo "실행 중이 아닙니다."
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status)
    if is_running; then echo "실행 중 (pid $(cat "$PIDFILE")) — http://localhost:$(running_port)";
    else echo "꺼짐"; fi ;;
  logs) exec tail -n 50 -f "$LOG" ;;
  *) echo "사용법: $0 {start|stop|restart|status|logs}"; exit 1 ;;
esac
