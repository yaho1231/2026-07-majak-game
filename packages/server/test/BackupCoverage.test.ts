/**
 * 백업이 **서버가 실제로 쓰는 상태 파일 전부**를 덮는가.
 *
 * 이 가드가 있는 이유: 처음 `scripts/backup.sh` 를 쓸 때 `stats.json` ·
 * `stats.augments.json` 을 빠뜨렸다. DB 스냅샷과 `.jsonl` 미러만 있어서
 * "백업이 있다"고 믿었는데, 정작 **사람들의 누적 전적은 SQLite가 아니라 JSON 파일**에
 * 있었다 — 발견 시점 stats.json 에 플레이어 34명의 기록이 들어 있었고 그게 통째로
 * 빠져 있었다(2026-08-18 실측). DB만 복구해도 전적은 0이 된다.
 *
 * 빠뜨림은 **조용하다.** 백업은 매일 성공하고, 잘못됐다는 걸 복구하는 날에야 안다.
 * 그래서 "서버가 쓰는 파일"과 "백업이 담는 파일"을 코드에서 뽑아 맞춰 본다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const BACKUP_SH = readFileSync(join(REPO, "scripts/backup.sh"), "utf8");
const SERVER_INDEX = readFileSync(join(REPO, "packages/server/src/index.ts"), "utf8");

describe("백업이 서버 상태를 빠짐없이 덮는다", () => {
  it("서버가 replays/ 아래에 만드는 상태 파일을 전부 안다", () => {
    /*
     * 서버가 쓰는 영속 상태는 셋이다:
     *   majak.db            SiteDb (계정·세션·게임 인덱스·제보)
     *   stats.json          StatsStore (플레이어 누적 전적)
     *   stats.augments.json AugmentStatsStore (증강 성적 + 티어 오프셋)
     * 여기에 넷째가 생기면 이 테스트가 먼저 깨져야 한다 — 그때 백업도 같이 고치게 된다.
     */
    expect(SERVER_INDEX).toContain("stats.json");
    expect(SERVER_INDEX).toMatch(/\.augments\.json/);
    expect(SERVER_INDEX).toContain("majak.db");
  });

  it("백업이 DB·리플레이·통계 셋을 모두 담는다", () => {
    expect(BACKUP_SH, "DB 스냅샷이 없다").toContain(".backup");
    expect(BACKUP_SH, "리플레이 미러가 없다").toContain("*.jsonl");
    expect(BACKUP_SH, "누적 전적(stats.json)이 빠졌다").toContain("stats.json");
    expect(BACKUP_SH, "증강 통계(stats.augments.json)가 빠졌다").toContain("stats.augments.json");
  });

  it("통계 백업도 세대를 남긴다 (덮어쓰기로 갱신되는 파일이라 마지막 하나만 두면 위험하다)", () => {
    expect(BACKUP_SH).toMatch(/BACKUP_KEEP/);
    expect(BACKUP_SH).toMatch(/stats\/\$\{f%\.json\}-/);
  });

  it("담기 전에 JSON이 깨지지 않았는지 본다", () => {
    // 깨진 채 저장된 파일을 그대로 백업하면, 복구하는 날 깨진 것을 복구하게 된다.
    expect(BACKUP_SH).toMatch(/json\.load\(open\(sys\.argv\[1\]\)\)/);
  });

  it("--verify 가 DB만 보고 통과시키지 않는다", () => {
    // DB만 멀쩡하고 전적이 없으면 "백업이 있다"는 말은 절반만 참이다.
    const at = BACKUP_SH.indexOf('if [ "${1:-}" = "--verify" ]');
    expect(at).toBeGreaterThan(0);
    const block = BACKUP_SH.slice(at, BACKUP_SH.indexOf("\nfi\n", at));
    expect(block).toContain("stats");
  });

  it("백업본 권한을 원본만큼 조인다", () => {
    // 세션 토큰 평문과 비밀번호 해시가 그대로 들어 있다.
    expect(BACKUP_SH).toMatch(/chmod 600 "\$dest"/);
    expect(BACKUP_SH).toMatch(/chmod 700 "\$BACKUP_DIR/);
  });
});
