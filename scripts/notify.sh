#!/usr/bin/env bash
#
# notify.sh — 운영 중 사람이 알아야 할 일을 바깥으로 내보낸다.
#
# 다른 스크립트가 `source` 해서 `notify "제목" "본문"` 으로 쓴다.
#
# 왜 있는가: 2026-08-17 감사에서 이 시스템의 지배적 고장 모드가 **조용한 실패**로
# 나왔다. 감시자는 재시작을 포기할 때 "손이 필요하다"를 파일에 쓰고 정상 종료했고,
# 그 파일을 보는 사람도 메일도 웹훅도 없었다. 백업은 아예 없었고, 있었더라도 실패를
# 알 방법이 없었다. 알림이 없는 자동화는 자동화가 아니라 **없는 것과 같다**.
#
# 설정(deploy/majak.env):
#   NOTIFY_WEBHOOK_URL   Discord/Slack 호환 웹훅. 비어 있으면 로컬 알림만 남긴다.
#   NOTIFY_WEBHOOK_KIND  discord | slack | raw   (기본 discord)
#
# 웹훅이 없어도 실패를 삼키지 않는다 — 항상 .majak/alerts.log 에 남기고,
# macOS면 알림 센터로도 띄운다. "어딘가에는 반드시 남는다"가 이 파일의 계약이다.

# shellcheck disable=SC2148

_notify_rundir() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "$root/.majak"
}

notify() {
  local title="${1:-majak}"
  local body="${2:-}"
  local rundir; rundir="$(_notify_rundir)"
  mkdir -p "$rundir"

  # 1) 로컬 기록 — 웹훅이 없거나 실패해도 흔적은 반드시 남는다.
  {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $title"
    [ -n "$body" ] && echo "$body" | sed 's/^/    /'
  } >>"$rundir/alerts.log"

  # 2) macOS 알림 센터 — 로그인해 있으면 사람이 즉시 본다.
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$(printf '%s' "$body" | head -c 200 | tr '"' "'")\" with title \"이능마작 — $(printf '%s' "$title" | tr '"' "'")\"" >/dev/null 2>&1 || true
  fi

  # 3) 웹훅 — 맥 앞에 없을 때 이게 유일한 통로다.
  local url="${NOTIFY_WEBHOOK_URL:-}"
  [ -z "$url" ] && return 0
  local kind="${NOTIFY_WEBHOOK_KIND:-discord}"
  local text; text="$(printf '%s\n%s' "**이능마작 — $title**" "$body")"
  # JSON 문자열로 안전하게 감싼다(따옴표·줄바꿈·역슬래시).
  local json_text
  json_text="$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)"
  [ -z "$json_text" ] && return 0
  local payload
  case "$kind" in
    slack) payload="{\"text\":$json_text}" ;;
    raw)   payload="{\"title\":$(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"body\":$json_text}" ;;
    *)     payload="{\"content\":$json_text}" ;;
  esac
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "$payload" "$url" >/dev/null 2>&1 || {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] (웹훅 전송 실패 — 위 알림은 로컬에만 남았습니다)" >>"$rundir/alerts.log"
  }
  return 0
}
