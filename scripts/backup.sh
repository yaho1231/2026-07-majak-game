#!/usr/bin/env bash
#
# backup.sh — 계정·전적·리플레이를 복제한다.
#
#   bash scripts/backup.sh              # 한 번 백업
#   bash scripts/backup.sh --verify     # 마지막 백업을 검사만 (복제는 안 함)
#
# 왜 있는가: 2026-08-17까지 이 프로젝트에는 **백업이 하나도 없었다**. 전 계정·전 전적·
# 리플레이 466판이 맥 디스크 하나에 복제본 0개로 있었다. 디스크가 죽으면 그대로 끝이다.
#
# ⚠ `cp majak.db` 는 쓰면 안 된다. WAL 모드(SiteDb의 `PRAGMA journal_mode = WAL`)라
#   최근 커밋이 majak.db-wal 에만 있고 본체에는 아직 없다. 그대로 복사하면 **손상된
#   스냅샷**이 만들어지고, 그 사실을 복구하려는 순간에야 알게 된다. 그래서 sqlite3의
#   `.backup` 을 쓴다 — 잠금을 올바로 잡고 WAL을 접어 넣은 일관된 사본을 만든다.
#
# 설정(deploy/majak.env 또는 환경변수):
#   BACKUP_DIR       백업 위치 (기본 ~/majak-backups)
#                    ★ 되도록 **다른 물리 디스크**(외장/NAS)를 가리키게 하라.
#                      같은 디스크 안의 사본은 실수 삭제만 막고 디스크 고장은 못 막는다.
#   BACKUP_KEEP      DB 스냅샷 보관 세대 (기본 14)
#   DB_PATH          기본 <repo>/replays/majak.db
#   REPLAY_DIR       기본 <repo>/replays
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNDIR="$ROOT/.majak"
BLOG="$RUNDIR/backup.log"

# deploy/majak.env 를 읽어 DB_PATH·BACKUP_DIR 등을 배포 설정과 일치시킨다.
ENV_FILE="$ROOT/deploy/majak.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
# shellcheck source=scripts/notify.sh
. "$ROOT/scripts/notify.sh"

REPLAY_DIR="${REPLAY_DIR:-$ROOT/replays}"
DB_PATH="${DB_PATH:-$REPLAY_DIR/majak.db}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/majak-backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$RUNDIR"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >>"$BLOG"; echo "$*"; }
fail() { log "✗ $*"; notify "백업 실패" "$*"$'\n'"로그: $BLOG"; exit 1; }

# 백업본이 진짜 열리는지 확인한다. 검사하지 않은 백업은 백업이 아니다 —
# 복구가 필요한 날에야 깨진 걸 알게 되는 게 백업의 고전적 실패 방식이다.
# 읽기 전용으로 연다 — 검사가 원본을 건드리지 않게. 두 가지 함정을 피해 간다:
#   · `file:...?mode=ro` URI: macOS 기본 sqlite3는 URI 파일명이 꺼져 있어 (14)로 죽는다.
#   · `-readonly` + WAL: 읽기 전용 열기는 `-shm` 곁파일을 만들 수 없어 역시 (14)다.
#     그래서 스냅샷은 만들자마자 저널 모드를 DELETE로 바꾼다(아래) — 보관용 파일은
#     곁파일 없이 **혼자서 완결**되는 편이 옳다.
verify_db() {
  local f="$1"
  local out
  out="$(sqlite3 -readonly "$f" 'PRAGMA integrity_check;' 2>&1)" || { echo "$out"; return 1; }
  [ "$out" = "ok" ] || { echo "$out"; return 1; }
  # 스키마가 실제로 들어 있는지 — **빈 파일도 integrity_check는 ok를 준다.**
  # 0바이트 스냅샷을 "정상"으로 받아들이면 백업이 있다는 착각만 남는다.
  local n
  n="$(sqlite3 -readonly "$f" "SELECT count(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo 0)"
  [ "${n:-0}" -ge 1 ] || { echo "테이블이 0개입니다 (빈 스냅샷)"; return 1; }
  return 0
}

if [ "${1:-}" = "--verify" ]; then
  latest="$(ls -1t "$BACKUP_DIR"/db/majak-*.db.gz 2>/dev/null | head -1 || true)"
  [ -n "$latest" ] || fail "검사할 백업이 없습니다 ($BACKUP_DIR/db)"
  # 보관본은 gzip이라 그대로는 열 수 없다. 임시로 풀어서 검사하고 지운다 —
  # **실제로 복구에 쓰는 경로와 같은 절차**를 밟아야 검사에 의미가 있다.
  tmp="$(mktemp -t majak-verify)"
  trap 'rm -f "$tmp"' EXIT
  gunzip -c "$latest" >"$tmp" 2>/dev/null || fail "압축을 풀 수 없습니다: $latest"
  if msg="$(verify_db "$tmp")"; then
    echo "✓ $(basename "$latest") — 무결성 ok ($(wc -c <"$tmp" | tr -d ' ') bytes)"
  else
    fail "백업이 깨졌습니다: $latest — $msg"
  fi
  # DB만 멀쩡하고 통계가 없으면 "백업이 있다"는 말은 절반만 참이다 — 전적이 통째로 빠진다.
  for f in stats stats.augments; do
    newest="$(ls -1t "$BACKUP_DIR/stats/$f-"*.json 2>/dev/null | head -1 || true)"
    if [ -z "$newest" ]; then
      fail "$f.json 백업이 없습니다 — 누적 전적이 백업에 빠져 있습니다"
    fi
    python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$newest" 2>/dev/null \
      || fail "$f.json 백업이 깨졌습니다: $newest"
    echo "✓ $(basename "$newest") — JSON ok"
  done
  exit 0
fi

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 명령을 찾을 수 없습니다"
[ -f "$DB_PATH" ] || fail "DB가 없습니다: $DB_PATH"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/replays"
# 백업본은 원본과 **똑같이 민감하다** — 세션 토큰 평문과 비밀번호 해시가 그대로 들어 있다.
# 원본 DB만 0600으로 조이고 사본을 0644로 흘리면 조인 의미가 없다.
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/db" 2>/dev/null || true
stamp="$(date +%Y%m%d-%H%M%S)"
dest="$BACKUP_DIR/db/majak-$stamp.db"

# 1) DB — sqlite3 .backup 으로 일관된 사본. 서버가 돌고 있어도 안전하다.
if ! sqlite3 "$DB_PATH" ".backup '$dest'" 2>>"$BLOG"; then
  rm -f "$dest"
  fail "DB 스냅샷 실패: $DB_PATH"
fi
chmod 600 "$dest" 2>/dev/null || true
# 스냅샷은 원본의 저널 모드(WAL)를 물려받는다. 보관본은 곁파일 없이 혼자 완결되는 게
# 옳으므로 DELETE로 바꾼다 — 복구할 때 -wal/-shm 을 찾을 일이 없어진다.
sqlite3 "$dest" 'PRAGMA journal_mode=DELETE;' >/dev/null 2>>"$BLOG" || true
# 그 전환 과정에서 sqlite가 -shm/-wal 을 만들어 두고 간다. 보관 디렉터리에 곁파일이
# 남아 있으면 다음 사람이 "이게 백업의 일부인가?"를 고민하게 된다 — 치운다.
rm -f "$dest-shm" "$dest-wal"
if ! msg="$(verify_db "$dest")"; then
  rm -f "$dest"
  fail "DB 스냅샷이 무결성 검사를 통과하지 못했습니다 — $msg"
fi
db_size="$(wc -c <"$dest" | tr -d ' ')"
gzip -f "$dest" 2>/dev/null && dest="$dest.gz"

# 2) 리플레이 — .jsonl 은 한 번 쓰이면 안 바뀌므로 증분 미러로 충분하다.
#    --delete 는 **쓰지 않는다**: 원본에서 실수로 지운 것이 사본에서도 사라지면
#    백업의 의미가 없다. 대신 서버의 pruneReplays 가 원본을 정리한다.
rep_n=0
if [ -d "$REPLAY_DIR" ]; then
  rsync -a --include='*/' --include='*.jsonl' --exclude='*' \
    "$REPLAY_DIR/" "$BACKUP_DIR/replays/" 2>>"$BLOG" || fail "리플레이 복사 실패"
  rep_n="$(find "$BACKUP_DIR/replays" -name '*.jsonl' | wc -l | tr -d ' ')"
fi

# 3) 누적 통계 JSON — **DB에 없는 데이터다.**
#
# ⚠ 처음 이 스크립트를 쓸 때 이 둘을 빠뜨렸다(2026-08-18 실측에서 발견). `.jsonl`만
#   미러하고 DB만 스냅샷했는데, 정작 사람들의 **누적 전적은 SQLite가 아니라 JSON 파일**에
#   있다. 실측 시점 stats.json 에 플레이어 34명의 화료율·방총률·평균순위·판수가 들어
#   있었고, 그게 백업에서 통째로 빠져 있었다. DB만 살아 돌아와도 전적은 0이 된다.
#
# stats.json          플레이어별 누적 전적 (roundsPlayed·wins·placements…)
# stats.augments.json 증강별 실전 성적 + 티어 오프셋 — 20판마다 도는 밸런스 자동 조정의
#                     기억 전체다. 잃으면 지금까지의 조정이 리셋된다.
#
# 세대를 남긴다: 이 둘은 **덮어쓰기로 갱신**되는 파일이라(리플레이와 달리 불변이 아니다)
# 마지막 하나만 두면 손상된 저장이 그대로 유일본이 된다.
stats_n=0
mkdir -p "$BACKUP_DIR/stats"
for f in stats.json stats.augments.json; do
  src="$REPLAY_DIR/$f"
  [ -f "$src" ] || continue
  # JSON이 깨진 채 저장된 것을 백업하지 않는다 — 검사 없이 넣으면 복구할 때 알게 된다.
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$src" 2>/dev/null; then
    fail "통계 파일이 깨졌습니다: $src (이번 백업은 남기지 않는다)"
  fi
  cp "$src" "$BACKUP_DIR/stats/${f%.json}-$stamp.json"
  chmod 600 "$BACKUP_DIR/stats/${f%.json}-$stamp.json" 2>/dev/null || true
  stats_n=$((stats_n + 1))
  # 같은 종류의 옛 세대 정리 (DB와 같은 보관 수)
  ls -1t "$BACKUP_DIR/stats/${f%.json}-"*.json 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" \
    | while read -r old; do rm -f "$old"; done
done
chmod 700 "$BACKUP_DIR/stats" 2>/dev/null || true

# 4) 오래된 DB 스냅샷 정리 (리플레이 미러는 누적 — 판마다 파일이 하나라 증가가 완만하다)
ls -1t "$BACKUP_DIR"/db/majak-*.db.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  rm -f "$old"
done

total="$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo '?')"
log "✓ 백업 완료 — DB $(printf '%s' "$db_size") bytes → $(basename "$dest") · 리플레이 ${rep_n}판 · 통계 ${stats_n}종 · 총 $total ($BACKUP_DIR)"

# 백업 위치가 저장소와 같은 디스크면 한 번은 말해 준다 (디스크 고장은 못 막는다).
src_dev="$(df -P "$ROOT" | awk 'NR==2{print $1}')"
dst_dev="$(df -P "$BACKUP_DIR" | awk 'NR==2{print $1}')"
if [ "$src_dev" = "$dst_dev" ]; then
  log "  ⚠ 백업이 원본과 같은 디스크($src_dev)에 있습니다 — BACKUP_DIR을 외장/NAS로 바꾸는 것을 권합니다."
fi
