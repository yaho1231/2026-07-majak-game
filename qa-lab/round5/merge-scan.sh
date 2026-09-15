#!/usr/bin/env bash
# 머지 되돌림 스캐너 — docs/55 §7 «머지 사고 재발 방지».
#
# 왜 필요한가: squash 머지는 «오래된 base에서 딴 브랜치»가 직전 PR의 변경을 통째로
# 되돌려도 npm test·타입체크가 조용히 통과한다 — 되돌린 테스트가 함께 사라지기 때문이다.
# M-1(#512가 #511을)·M-2(#469가 #467을) 그렇게 서비스에서 빠졌다(docs/55 §2-1).
#
# 무엇을 보나(master first-parent 커밋 m 마다):
#   (a) m 이 손댄 파일 중 직전 N개 커밋 p 가 손댄 파일과 겹치는 것
#   (b) 그 파일의 m 버전이 «p 이전 버전(p^:f)»과 blob 단위로 같으면 «완전 되돌림»,
#       p 가 넣은 줄의 THRESH 이상을 m 이 도로 빼면(또는 p 가 뺀 줄을 도로 넣으면) «부분 되돌림»
#   (c) m 이 packages/*/test 에서 뺀 it(/test(/describe( 줄 — 같은 제목이 m 트리 어디에도
#       없으면 «사라짐»(의심), 있으면 «이동»(낮음)
#   (d) 제목이 «(#원PR) (#재적용PR)» 규약이면 재적용으로 표시한다(#466→#473, #468→#471).
#
# 쓰는 법: bash qa-lab/round5/merge-scan.sh [REF] [SINCE] [N]
#   기본 REF=origin/master SINCE=2026-08-25 N=5, 환경변수 THRESH=0.5(부분 되돌림 문턱)
#   PR 게이트: ONLY=origin/master..HEAD bash qa-lab/round5/merge-scan.sh  — 머지 전에 내 브랜치
#   커밋만 훑는다. «완전 되돌림» 행이 하나라도 있으면 머지 금지(재적용 PR이면 제목 규약으로 표시).
# git 조회만 한다 — 아무 파일도 고치지 않는다. bash 3.2(macOS 기본)에서 돈다.
#
# ⚠ 2026-09-16 실측: 세 사고(#412→#409·#410·#411, #469→#467, #512→#511) 모두 소스 브랜치의
# 커밋(bb6b481·e5a7d82·45d0aa0)이 **되돌린 커밋 바로 위에** 얹혀 있었다 — 즉 «오래된 base»가
# 아니라 리베이스·재커밋 때 낡은 워킹트리 내용이 그대로 실린 것이다. 그래서
# `git merge-base --is-ancestor origin/master HEAD` 게이트(docs/55 §7)만으로는 셋 다 못 막는다.
# 내용을 보는 이 스캐너를 PR 게이트에 같이 건다.
set -uo pipefail
REF=${1:-origin/master}
SINCE=${2:-2026-08-25}
N=${3:-5}
THRESH=${THRESH:-0.5}
MINLEN=${MINLEN:-6}   # 부분 되돌림 계산에서 `}`·`);` 같은 짧은 줄은 뺀다

cd "$(git rev-parse --show-toplevel)" || exit 1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

short() { git log -1 --date=short --format='%h %ad %s' "$1" | cut -c1-90; }
pr_of() { git log -1 --format='%s' "$1" | grep -oE '\(#[0-9]+\)' | tail -1 | tr -d '()'; }
is_reapply() { git log -1 --format='%s' "$1" | grep -qE '\((#[0-9]+)\) \(#[0-9]+\)$' && \
               [ "$(git log -1 --format='%s' "$1" | grep -oE '\(#[0-9]+\)' | sort -u | wc -l)" -ge 2 ]; }
# diff 의 순수 내용 줄(헤더 제외)을 부호별로 뽑아 trim·정렬·중복 제거
lines() { # $1=from $2=to $3=file $4=sign(+|-)
  git diff "$1" "$2" -- "$3" | grep -E "^\\$4" | grep -vE '^(\+\+\+|---) ' | cut -c2- \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk -v L="$MINLEN" 'length($0)>=L' | sort -u
}

if [ -n "${ONLY:-}" ]; then
  # PR 게이트 모드 — 범위(예: origin/master..HEAD)의 커밋만 m 으로 삼는다. 직전 N개(p)는
  # m^ 체인이라 master 의 최근 커밋이 그대로 비교 대상이 된다.
  git rev-list --first-parent --reverse "$ONLY" > "$TMP/commits"
else
  git log --first-parent --since="$SINCE" --format='%H' --reverse "$REF" > "$TMP/commits"
fi
echo "# merge-scan  REF=$REF SINCE=$SINCE N=$N THRESH=$THRESH ONLY=${ONLY:-}  커밋 $(wc -l < "$TMP/commits" | tr -d ' ')개"
echo
echo "## (a)(b) 되돌림 의심 — 머지 커밋 m 의 파일이 직전 커밋 p 의 «이전 상태»로 돌아갔다"
echo
echo "| 머지 커밋 m | 되돌려진 커밋 p | 파일 | 근거 | 비고 |"
echo "|---|---|---|---|---|"
while read -r m; do
  git diff --name-only "$m^" "$m" | sort > "$TMP/files_m"
  [ -s "$TMP/files_m" ] || continue
  note=""; is_reapply "$m" && note="재적용 규약 제목 → (d) 제외 후보"
  git rev-list --first-parent --max-count="$N" "$m^" > "$TMP/prev"
  while read -r p; do
    git diff --name-only "$p^" "$p" | sort > "$TMP/files_p"
    comm -12 "$TMP/files_m" "$TMP/files_p" > "$TMP/common"
    [ -s "$TMP/common" ] || continue
    while read -r f; do
      bm=$(git rev-parse -q --verify "$m:$f" 2>/dev/null || echo MISSING)
      bp0=$(git rev-parse -q --verify "$p^:$f" 2>/dev/null || echo MISSING)
      bp=$(git rev-parse -q --verify "$p:$f" 2>/dev/null || echo MISSING)
      if [ "$bm" = "$bp0" ] && [ "$bm" != "$bp" ]; then
        kind="완전 되돌림"; [ "$bm" = MISSING ] && kind="완전 되돌림(p 가 추가한 파일을 삭제)"
        echo "| $(short "$m") | $(short "$p") | \`$f\` | $kind: \`git rev-parse $m:$f\` == \`$p^:$f\` | $note |"
        continue
      fi
      lines "$p^" "$p" "$f" + > "$TMP/Ap"; lines "$p^" "$p" "$f" - > "$TMP/Dp"
      lines "$m^" "$m" "$f" - > "$TMP/Dm"; lines "$m^" "$m" "$f" + > "$TMP/Am"
      tot=$(( $(wc -l < "$TMP/Ap") + $(wc -l < "$TMP/Dp") ))
      [ "$tot" -gt 0 ] || continue
      x=$(( $(comm -12 "$TMP/Ap" "$TMP/Dm" | wc -l) + $(comm -12 "$TMP/Dp" "$TMP/Am" | wc -l) ))
      if awk -v x="$x" -v t="$tot" -v th="$THRESH" 'BEGIN{exit !(x/t>=th)}'; then
        echo "| $(short "$m") | $(short "$p") | \`$f\` | 부분 되돌림 $x/$tot: p 가 바꾼 줄 중 m 이 도로 뒤집은 비율 | $note |"
      fi
    done < "$TMP/common"
  done < "$TMP/prev"
done < "$TMP/commits"

echo
echo "## (c) 테스트 케이스가 빠진 머지 — packages/*/test 에서 뺀 it(/test(/describe( 줄"
echo
echo "| 머지 커밋 m | 파일 | 빠진 테스트 | 판정 |"
echo "|---|---|---|---|"
pat='^-[[:space:]]*(it|test|describe)(\.(only|skip|each|todo|concurrent))?\('
while read -r m; do
  # git pathspec의 * 는 경로 전체와 맞아야 해서 'packages/*/test' 는 아무것도 못 잡는다 — 뒤에 /* 를 붙인다
  git diff "$m^" "$m" -- 'packages/*/test/*' > "$TMP/tdiff"
  grep -qE "$pat" "$TMP/tdiff" || continue
  cur=""; cur_a=""
  while IFS= read -r line; do
    case "$line" in
      # 삭제된 파일은 "+++ /dev/null" 이라 이름이 "--- a/…" 쪽에만 있다
      "+++ /dev/null") cur="$cur_a (파일 삭제)" ;;
      "+++ "*) cur=${line#+++ b/} ;;
      "--- "*) cur_a=${line#--- a/} ;;
      *)
        echo "$line" | grep -qE "$pat" || continue
        title=$(printf '%s\n' "$line" | sed -E "s/^-[[:space:]]*(it|test|describe)(\.[a-z]+)?\([[:space:]]*[\"'\`]([^\"'\`]*).*/\3/")
        if [ "$title" = "$line" ] || [ -z "$title" ]; then
          verdict="제목 추출 실패 — 손으로 확인"; title=$(printf '%s' "$line" | cut -c2-80)
        elif git grep -qF -- "$title" "$m" -- 'packages/*/test/*' 2>/dev/null; then
          verdict="이동/유지(같은 제목이 m 트리에 있음) — 낮음"
        else
          verdict="사라짐 — 의심(PR 의도인지 되돌림인지 손으로 확인)"
        fi
        echo "| $(short "$m") | \`$cur\` | $title | $verdict |"
        ;;
    esac
  done < "$TMP/tdiff"
done < "$TMP/commits"
