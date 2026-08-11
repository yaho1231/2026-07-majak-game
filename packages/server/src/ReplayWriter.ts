/**
 * ReplayWriter — JSONL 이벤트 로그 기록.
 *
 * replays/<roomId>_<timestamp>.jsonl 에 한 줄씩 기록한다.
 * 비동기 쓰기로 게임 루프를 블록하지 않는다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §5
 */

import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { WriteStream } from "node:fs";

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

  get path(): string {
    return this.filePath;
  }
}
