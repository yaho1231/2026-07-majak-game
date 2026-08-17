/**
 * 고아 리플레이 청소 — `games` 인덱스에 없는 `.jsonl`을 보존 기간이 지나면 지운다.
 *
 * # 왜 필요한가
 *
 * 리플레이 파일은 `openGame`에서 열리지만 인덱스 행(`games`)은 **정상 종료 때만**
 * `recordGame`이 만든다. 무효 처리·예외 종료·시작 실패·서버 재시작으로 끝난 판은
 * 설계상 기록하지 않으므로(`무효 처리는 기록하지 않는다`) 행이 생기지 않는다.
 * 그런데 `pruneOldReplays`는 `db.pruneGamesBefore`가 돌려준 경로 —
 * 즉 **행이 있는 파일만** 지운다. 결과적으로 그 파일들은 열어 볼 길도 없고
 * 지워지지도 않는 채 무한히 쌓였다 (2026-08-11 운영 서버 실측: 425개 중 292개, 4.9MB).
 *
 * 무효 처리 경로는 이제 `ReplayWriter.discard()`가 그 자리에서 지운다.
 * 여기서 쓸어 담는 것은 **그렇게 못 지운 나머지** — 서버가 SIGKILL로 죽었거나,
 * 재시작에 끊겨 `shutdown()`이 일부러 남겨 둔 파일들이다. 남겨 두는 데 이유가 있는
 * 파일이므로 즉시 지우지 않고 **일반 리플레이와 같은 보존 기간**을 준다.
 *
 * ⚠ **예외·시작 실패는 이제 지우지 않는다** (감사 §2-6). 그 판들의 기록은
 * `ReplayWriter.preserveCrashed()`가 `replays/crashed/`로 옮긴다 — 크래시한 판만
 * 골라 재현 증거를 없애고 있었기 때문이다. 여기 `readdir`는 재귀하지 않으므로
 * 그 하위 폴더는 대상에 들어오지 않는다. **의도된 것이다**: 크래시 기록은 사람이
 * 보고 지우는 것이고, 평소에는 그 폴더가 비어 있어야 한다.
 */

import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface OrphanPruneResult {
  /** 실제로 지운 파일 수 */
  removed: number;
  /** 지운 파일 경로 (로그·테스트용) */
  paths: string[];
}

/**
 * `dir` 안의 `.jsonl` 중 **인덱스에 없고** 마지막 수정이 `cutoffMs`보다 오래된 것을 지운다.
 *
 * @param dir           리플레이 디렉터리
 * @param indexedPaths  `games.replay_path` 전부 (절대·상대 경로 섞여도 된다 — 정규화한다)
 * @param cutoffMs      이 시각(epoch ms)보다 오래 수정된 파일만 대상
 *
 * 진행 중인 게임의 파일을 지우지 않는 근거는 mtime이다 — 살아 있는 게임은 계속 쓰이므로
 * 보존 기간(기본 365일)을 넘긴 mtime을 가질 수 없다. `.jsonl`만 보므로 `majak.db`·
 * `stats.json`은 애초에 후보에 들어오지 않는다.
 */
export async function pruneOrphanReplays(
  dir: string,
  indexedPaths: readonly string[],
  cutoffMs: number,
): Promise<OrphanPruneResult> {
  const indexed = new Set(indexedPaths.map((p) => resolve(p)));
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { removed: 0, paths: [] }; // 디렉터리가 아직 없다 — 지울 것도 없다
  }

  const paths: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const full = resolve(join(dir, name));
    if (indexed.has(full)) continue;
    try {
      const st = await stat(full);
      if (!st.isFile()) continue;
      if (st.mtimeMs >= cutoffMs) continue;
      await unlink(full);
      paths.push(full);
    } catch {
      // 경쟁적으로 사라졌거나 권한이 없다 — 다음 주기에 다시 본다
    }
  }
  return { removed: paths.length, paths };
}
