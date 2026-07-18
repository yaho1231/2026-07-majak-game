/**
 * ReplayWriter — JSONL 이벤트 로그 기록.
 *
 * replays/<roomId>_<timestamp>.jsonl 에 한 줄씩 기록한다.
 * 비동기 쓰기로 게임 루프를 블록하지 않는다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §5
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
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

  get path(): string {
    return this.filePath;
  }
}
