/**
 * StatsStore — 닉네임별 누적(career) 통계의 파일 영속화.
 *
 * MVP엔 계정/DB가 없으므로 통계는 닉네임을 키로 JSON 파일에 누적한다.
 * 한 판이 끝나면 그 판의 원시 통계를 닉네임별로 병합해 저장한다.
 *
 * 통계 계산 자체는 @majak/core StatsTracker/mergeStats가 하고,
 * 여기서는 로드·병합·저장(I/O)만 담당한다 (core는 I/O 없음 원칙).
 *
 * 설계: docs/14_LOBBY_STATS.md §3
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createEmptyStats, mergeStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";

interface StatsFile {
  version: 1;
  players: Record<string, PlayerStatsRaw>;
}

/** 프로토타입 오염 방지 — 항상 프로토타입 없는 맵을 쓴다 (__proto__/toString 등 키 안전) */
function emptyPlayers(): Record<string, PlayerStatsRaw> {
  return Object.create(null) as Record<string, PlayerStatsRaw>;
}

export class StatsStore {
  private data: StatsFile = { version: 1, players: emptyPlayers() };
  private loaded = false;
  /** 저장 직렬화용 큐 (동시 record가 파일을 덮어쓰지 않게 순차 처리) */
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  /** 파일에서 통계를 읽는다. 파일이 없으면 빈 상태로 시작한다. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StatsFile>;
      if (parsed !== null && typeof parsed === "object" && parsed.players !== undefined) {
        // 누락 필드 보정 (스키마가 늘어나도 안전하게 병합)
        const players = emptyPlayers();
        for (const [name, s] of Object.entries(parsed.players)) {
          players[name] = mergeStats(createEmptyStats(), s as PlayerStatsRaw);
        }
        this.data = { version: 1, players };
      }
    } catch {
      // 파일 없음/파싱 실패 → 빈 상태 유지
      this.data = { version: 1, players: emptyPlayers() };
    }
    this.loaded = true;
  }

  /** 닉네임의 누적 통계 (없으면 null). */
  get(nickname: string): PlayerStatsRaw | null {
    return this.data.players[nickname] ?? null;
  }

  /** 모든 닉네임의 누적 통계 (복사본). */
  all(): Record<string, PlayerStatsRaw> {
    return JSON.parse(JSON.stringify(this.data.players)) as Record<string, PlayerStatsRaw>;
  }

  /** 한 판의 원시 통계를 닉네임별로 병합하고 저장한다. */
  async record(entries: { nickname: string; raw: PlayerStatsRaw }[]): Promise<void> {
    if (!this.loaded) await this.load();
    for (const { nickname, raw } of entries) {
      const prev = this.data.players[nickname] ?? createEmptyStats();
      this.data.players[nickname] = mergeStats(prev, raw);
    }
    await this.save();
  }

  /** 닉네임의 누적 통계를 삭제하고 저장한다 (계정 삭제 시 호출). */
  async remove(nickname: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (this.data.players[nickname] === undefined) return;
    delete this.data.players[nickname];
    await this.save();
  }

  /** 현재 상태를 원자적으로(임시 파일 → rename) 파일에 쓴다. */
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    // 직전 저장이 끝난 뒤 순차적으로 쓴다 (경쟁 방지)
    this.saveChain = this.saveChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await writeFile(tmp, snapshot, "utf8");
      await rename(tmp, this.filePath);
    });
    return this.saveChain;
  }
}
