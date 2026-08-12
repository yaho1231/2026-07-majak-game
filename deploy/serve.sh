#!/usr/bin/env bash
#
# serve.sh — 이능마작 공개 배포 전용 실행 래퍼.
#
# deploy/majak.env(설정)를 읽어 환경변수로 주입하고 scripts/majak.sh를 호출한다.
# 클라 빌드·백그라운드 실행·PID 관리·종료는 majak.sh가 그대로 담당한다.
#
#   bash deploy/serve.sh            # = start (클라 빌드 후 서버 시작)
#   bash deploy/serve.sh stop
#   bash deploy/serve.sh restart
#   bash deploy/serve.sh status
#   bash deploy/serve.sh logs       # 실시간 로그(관리자 코드도 여기)
#   bash deploy/serve.sh health     # 상태 점검(JSON — 연결·방·진행 중 게임 수)
#
# 처음 한 번:  cp deploy/majak.env.example deploy/majak.env  후 값 채우기.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="$HERE/majak.env"

# 설정 로드 (KEY=VALUE 자동 export). 없으면 경고 후 기본값으로 진행.
if [ -f "$ENV_FILE" ]; then
  # 이 파일에는 SIGNUP_CODE(·ADMIN_CODE)가 들어 있다 — 같은 머신의 다른 사용자·
  # 프로세스가 읽을 수 있으면 안 된다. 0644로 만들어져 있던 것을 여기서 조인다
  # (감사 2026-08-12 §L-2). stat 문법은 macOS(BSD)와 리눅스(GNU)가 다르다.
  PERM="$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '')"
  if [ -n "$PERM" ] && [ "$PERM" != "600" ]; then
    chmod 600 "$ENV_FILE" && echo "🔒 $ENV_FILE 권한을 $PERM → 600 으로 조였습니다 (비밀 파일)"
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "⚠ 설정 파일이 없습니다: $ENV_FILE"
  echo "  cp deploy/majak.env.example deploy/majak.env  후 값을 채우세요. (기본값으로 계속 진행)"
fi

CMD="${1:-start}"
PORT_SHOW="${PORT:-3001}"

# 상태 점검 — 정적 파일이 아니라 WS 계층·방 개수까지 서버가 직접 답한다.
# (감시 도구가 "HTML이 온다"만 보고 살아 있다고 착각하지 않게 하려고 뚫은 문이다.)
if [ "$CMD" = "health" ]; then
  curl -fsS "http://127.0.0.1:${PORT_SHOW}/healthz" && echo
  exit $?
fi

if [ "$CMD" = "start" ] || [ "$CMD" = "restart" ]; then
  if [ -n "${SIGNUP_CODE:-}" ]; then GATE="켜짐"; else GATE="꺼짐(누구나 가입)"; fi
  echo "▶ 이능마작 공개 서버 — 포트 ${PORT_SHOW} · 가입게이트 ${GATE}"
fi

# 실제 실행은 기존 majak.sh에 위임 (env는 서브프로세스가 상속받는다)
bash "$ROOT/scripts/majak.sh" "$CMD"

if { [ "$CMD" = "start" ] || [ "$CMD" = "restart" ]; }; then
  if [ -n "${PUBLIC_HOST:-}" ]; then
    if [ -n "${TRUST_PROXY:-}" ]; then
      # 리버스 프록시(Cloudflare Tunnel·nginx) 뒤 — TLS는 프록시가 종단하고
      # 서버는 로컬 평문 포트만 연다. 포트포워딩이 필요 없다.
      echo "🌐 공개 주소:  https://${PUBLIC_HOST}"
      echo "   (리버스 프록시 경유 — TRUST_PROXY=${TRUST_PROXY}. 포트포워딩 불필요)"
      if [ "${HOST:-}" != "127.0.0.1" ]; then
        echo "   ⚠ HOST가 127.0.0.1이 아닙니다 — 평문 포트 ${PORT_SHOW}이 외부에 직접 노출될 수 있습니다."
      fi
    else
      echo "🌐 공개 주소:  http://${PUBLIC_HOST}:${PORT_SHOW}"
      echo "   (공유기에서 ${PORT_SHOW} 포트를 이 맥으로 포워딩해야 외부에서 접속됩니다)"
      echo "   ⚠ 평문 HTTP입니다 — 공개 배포는 리버스 프록시로 TLS(wss) 종단을 권장합니다."
    fi
  fi
fi
