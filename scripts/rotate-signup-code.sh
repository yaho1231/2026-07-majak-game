#!/usr/bin/env bash
#
# rotate-signup-code.sh — 가입 코드를 새 값으로 바꾼다.
#
#   bash scripts/rotate-signup-code.sh            # 새 코드를 만들어 바꾼다
#   bash scripts/rotate-signup-code.sh <새 코드>   # 값을 직접 지정
#
# 왜: 운영 중인 SIGNUP_CODE 가 5자였다. 감사 26·29가 두 번 지적했고 부팅 경고까지
# 들어갔지만 값은 그대로였다(감사 2026-08-17 §1-4). 이 코드를 통과하면 리더보드·제보·
# 리플레이·방 생성과 비싼 조회가 전부 열린다.
#
# ⚠ 이건 **바깥으로 나가는 변경**이다. 바꾸는 순간 옛 코드를 들고 있는 지인들은
#   가입할 수 없다. 이미 가입한 사람의 로그인에는 영향이 없다(세션·비밀번호는 그대로).
#   그래서 이 스크립트는 바꾸기 전에 무엇이 일어나는지 보여 주고 확인을 받는다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/deploy/majak.env"

[ -f "$ENV_FILE" ] || { echo "✗ 설정 파일이 없습니다: $ENV_FILE"; exit 1; }

NEW="${1:-}"
if [ -z "$NEW" ]; then
  # base64는 사람이 불러 주기 어려운 문자(+/=)가 섞인다. 헷갈리는 글자(0/O, 1/l/I)를
  # 뺀 사전으로 만든다 — 이건 카톡으로 불러 주는 코드다.
  NEW="$(LC_ALL=C tr -dc 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 20)"
fi
[ "${#NEW}" -ge 16 ] || { echo "✗ 코드가 너무 짧습니다 (${#NEW}자) — 16자 이상으로 하세요."; exit 1; }

OLD="$(grep -E '^SIGNUP_CODE=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"

echo "── 바뀌는 것"
echo "  SIGNUP_CODE : ${#OLD}자  →  ${#NEW}자"
echo
echo "  · 옛 코드를 들고 있는 사람은 **가입할 수 없게 됩니다**."
echo "  · 이미 가입한 사람의 로그인·세션·비밀번호에는 영향이 없습니다."
echo "  · 서버를 재시작해야 새 값이 적용됩니다(이 스크립트가 마지막에 물어봅니다)."
echo
printf '진행하려면 정확히 "바꾼다" 라고 입력하세요: '
read -r ANSWER
[ "$ANSWER" = "바꾼다" ] || { echo "취소했습니다."; exit 1; }

cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
chmod 600 "$ENV_FILE".bak.* 2>/dev/null || true

if grep -qE '^SIGNUP_CODE=' "$ENV_FILE"; then
  # 값에 / 나 & 가 들어갈 수 있으므로 sed 치환 대신 줄을 통째로 갈아 끼운다.
  awk -v new="SIGNUP_CODE=$NEW" '/^SIGNUP_CODE=/{print new; next} {print}' "$ENV_FILE" >"$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
else
  echo "SIGNUP_CODE=$NEW" >>"$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

echo
echo "✓ 바꿨습니다. 새 가입 코드:"
echo
echo "    $NEW"
echo
echo "  (백업: $(ls -1t "$ENV_FILE".bak.* | head -1))"
echo
printf '지금 서버를 재시작해 적용할까요? [y/N] '
read -r R
case "$R" in
  y|Y) bash "$ROOT/deploy/serve.sh" restart ;;
  *) echo "나중에 적용하려면: npm run serve:restart" ;;
esac
