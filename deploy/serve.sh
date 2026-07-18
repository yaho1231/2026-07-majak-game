#!/usr/bin/env bash
#
# serve.sh — MAJAK 공개 배포 전용 실행 래퍼.
#
# deploy/majak.env(설정)를 읽어 환경변수로 주입하고 scripts/majak.sh를 호출한다.
# 클라 빌드·백그라운드 실행·PID 관리·종료는 majak.sh가 그대로 담당한다.
#
#   bash deploy/serve.sh            # = start (클라 빌드 후 서버 시작)
#   bash deploy/serve.sh stop
#   bash deploy/serve.sh restart
#   bash deploy/serve.sh status
#   bash deploy/serve.sh logs       # 실시간 로그(관리자 코드도 여기)
#
# 처음 한 번:  cp deploy/majak.env.example deploy/majak.env  후 값 채우기.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="$HERE/majak.env"

# 설정 로드 (KEY=VALUE 자동 export). 없으면 경고 후 기본값으로 진행.
if [ -f "$ENV_FILE" ]; then
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

if [ "$CMD" = "start" ] || [ "$CMD" = "restart" ]; then
  if [ -n "${SIGNUP_CODE:-}" ]; then GATE="켜짐"; else GATE="꺼짐(누구나 가입)"; fi
  echo "▶ MAJAK 공개 서버 — 포트 ${PORT_SHOW} · 가입게이트 ${GATE}"
fi

# 실제 실행은 기존 majak.sh에 위임 (env는 서브프로세스가 상속받는다)
bash "$ROOT/scripts/majak.sh" "$CMD"

if { [ "$CMD" = "start" ] || [ "$CMD" = "restart" ]; }; then
  if [ -n "${PUBLIC_HOST:-}" ]; then
    echo "🌐 공개 주소:  http://${PUBLIC_HOST}:${PORT_SHOW}"
    echo "   (공유기에서 ${PORT_SHOW} 포트를 이 맥으로 포워딩해야 외부에서 접속됩니다)"
  fi
fi
