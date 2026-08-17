/**
 * ReplayWriter — JSONL 이벤트 로그 기록.
 *
 * replays/<roomId>_<timestamp>.jsonl 에 한 줄씩 기록한다.
 * 비동기 쓰기로 게임 루프를 블록하지 않는다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §5
 */

import { createWriteStream } from "node:fs";
import { mkdir, unlink, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import type { WriteStream } from "node:fs";

/**
 * 예외로 끝난 판의 기록을 옮겨 두는 하위 폴더 이름.
 *
 * `replays/` 본체와 섞지 않는 이유가 둘이다. ① `pruneOldReplays`는 `games`
 * 인덱스가 가리키는 파일만 지우므로, 인덱스에 없는 이 파일들은 본체에 두면
 * 영원히 남는 고아가 된다 — 폴더가 다르면 "인덱스 밖에 있는 것이 정상"이라는
 * 뜻이 파일 위치로 드러난다. ② 사람이 볼 때 `crashed/`에 파일이 있다는 것 자체가
 * 신호다. 평소에는 비어 있어야 하는 폴더다.
 */
export const CRASHED_REPLAY_DIR = "crashed";

export class ReplayWriter {
  private stream: WriteStream | null = null;
  private readonly filePath: string;

  constructor(
    private readonly replayDir: string,
    roomId: string,
  ) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = join(replayDir, `${roomId}_${timestamp}.jsonl`);
  }

  async open(): Promise<void> {
    await mkdir(this.replayDir, { recursive: true });
    this.stream = createWriteStream(this.filePath, { flags: "a", encoding: "utf-8" });
    // 스트림 에러(디스크 가득 참 등)가 처리되지 않은 'error' 이벤트로 프로세스를
    // 죽이지 않도록 로그만 남긴다 — 리플레이 기록 실패가 게임을 끊지 않는다.
    this.stream.on("error", (err) => console.error("ReplayWriter stream error:", err));
  }

  write(line: string): void {
    this.stream?.write(line + "\n");
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }

  /**
   * 스트림을 닫고 **파일까지 지운다.**
   *
   * 기록으로 남기지 않을 게임(무효·예외 종료·시작 실패) 전용이다. 그런 게임은
   * `recordGame`을 부르지 않아 `games` 인덱스에 행이 없고, `pruneOldReplays`는
   * 인덱스 행이 가리키는 파일만 지운다 — 즉 `close()`만 하면 그 `.jsonl`은
   * **아무도 못 보고 아무도 안 지우는** 파일로 디스크에 영원히 남는다.
   * (2026-08-11 실측: 운영 서버 replays/ 425개 중 292개가 그런 고아 파일이었다.)
   */
  async discard(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (stream !== null) {
      // end()는 비동기다 — 큐에 남은 쓰기가 다 나간 뒤에 지워야 파일이 되살아나지 않는다.
      await new Promise<void>((resolve) => stream.end(resolve));
    }
    try {
      await unlink(this.filePath);
    } catch {
      // 애초에 열지 않았거나 이미 지워진 파일 — 지우려던 목적은 달성됐다.
    }
  }

  /**
   * 스트림을 닫고 파일을 **`crashed/`로 옮긴다** — 예외로 끝난 판 전용 (감사 §2-6).
   *
   * 예전에는 이 경우도 `discard()`였다. 의도는 고아 파일 방지였고 그 목적 자체는
   * 옳았지만, 결과적으로 **크래시한 판만 골라서 증거를 없앴다.** 증강 117종이
   * 서로 얽히는 엔진에서 재현 자료 없이 남는 것은 스택 트레이스 한 줄뿐이고,
   * 그 한 줄로는 "어떤 증강 조합의 몇 번째 순이었나"를 되짚을 수 없다.
   *
   * 옮기기가 실패해도 예외를 밖으로 던지지 않는다 — 게임 정리를 막을 만한 일이 아니다.
   * 그때는 파일이 본체에 남는데, 그건 지금까지의 동작(고아 파일)과 같을 뿐 더 나쁘지 않다.
   */
  async preserveCrashed(): Promise<string> {
    const stream = this.stream;
    this.stream = null;
    if (stream !== null) {
      // discard()와 같은 이유 — 큐에 남은 쓰기가 다 나간 뒤에 옮긴다.
      await new Promise<void>((resolve) => stream.end(resolve));
    }
    const dir = join(this.replayDir, CRASHED_REPLAY_DIR);
    const dest = join(dir, basename(this.filePath));
    await mkdir(dir, { recursive: true });
    await rename(this.filePath, dest);
    return dest;
  }

  get path(): string {
    return this.filePath;
  }
}
