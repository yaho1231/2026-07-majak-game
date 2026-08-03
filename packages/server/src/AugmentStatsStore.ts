/**
 * AugmentStatsStore — 증강별 실전 성적의 영속화와 티어 자동 조정.
 *
 * 사용자 확정(2026-08-03): **20판마다 티어별 승률 상위 10%는 반 단계 상향**,
 * 티어가 서서히 섞이도록 하위 10%는 반 단계 하향. 계산 규칙은 core의
 * `tierAdjust.ts`가 단일 진실이고, 여기서는 집계·영속화(I/O)만 한다
 * (core는 I/O 없음 원칙 — StatsStore와 같은 구조).
 *
 * 원본 티어표는 **덮어쓰지 않는다.** 조정은 `offsets`(누적 반 단계)로만 쌓이므로
 * 언제든 되돌릴 수 있고, 관리자 화면이 원본과 현재 가중치를 나란히 보여줄 수 있다.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ADJUST_EVERY_GAMES,
  computeAdjustment,
  weightsFromOffsets,
} from "@majak/core/augment/tierAdjust.js";
import type { AugmentRecord, TierOffsets } from "@majak/core/augment/tierAdjust.js";

interface AugmentStatsFile {
  version: 1;
  /** 증강 id → 보유 게임 수·1위 수 */
  records: Record<string, AugmentRecord>;
  /** 증강 id → 누적 반 단계 (양수 = 더 강하게 취급 = 덜 나온다) */
  offsets: Record<string, number>;
  /** 마지막 조정 이후 기록된 게임 수 */
  gamesSinceAdjust: number;
  /** 지금까지 조정이 돈 횟수 (관리자 표시용) */
  adjustments: number;
}

/** 프로토타입 오염 방지 — 증강 id가 키라 __proto__ 같은 값이 들어올 수 있다 */
function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function emptyFile(): AugmentStatsFile {
  return {
    version: 1,
    records: emptyMap<AugmentRecord>(),
    offsets: emptyMap<number>(),
    gamesSinceAdjust: 0,
    adjustments: 0,
  };
}

/** 한 게임의 결과 — 자리별 보유 증강과 최종 순위 */
export interface GameAugmentResult {
  augments: readonly string[];
  /** 1 = 우승 */
  rank: number;
}

export class AugmentStatsStore {
  private data: AugmentStatsFile = emptyFile();
  private loaded = false;
  /** 저장 직렬화용 큐 (동시 record가 파일을 덮어쓰지 않게 순차 처리) */
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AugmentStatsFile>;
      if (parsed !== null && typeof parsed === "object") {
        const next = emptyFile();
        for (const [id, rec] of Object.entries(parsed.records ?? {})) {
          const r = rec as Partial<AugmentRecord>;
          next.records[id] = {
            games: Math.max(0, Math.trunc(r.games ?? 0)),
            wins: Math.max(0, Math.trunc(r.wins ?? 0)),
          };
        }
        for (const [id, v] of Object.entries(parsed.offsets ?? {})) {
          if (typeof v === "number" && Number.isFinite(v)) next.offsets[id] = v;
        }
        next.gamesSinceAdjust = Math.max(0, Math.trunc(parsed.gamesSinceAdjust ?? 0));
        next.adjustments = Math.max(0, Math.trunc(parsed.adjustments ?? 0));
        this.data = next;
      }
    } catch {
      // 파일 없음/파싱 실패 → 빈 상태로 시작한다 (통계는 게임 진행을 막지 않는다)
    }
    this.loaded = true;
  }

  /** 이 게임의 드래프트에 쓸 가중치표 (조정 결과 반영) */
  weights(): Record<string, number> {
    return weightsFromOffsets(this.data.offsets);
  }

  /** 누적 반 단계 (관리자 화면·되돌리기용) */
  offsets(): TierOffsets {
    return { ...this.data.offsets };
  }

  /** 집계 원본 (관리자 화면용) */
  records(): Readonly<Record<string, AugmentRecord>> {
    return { ...this.data.records };
  }

  /** 조정 진행 상황 (관리자 화면용) */
  progress(): { gamesSinceAdjust: number; every: number; adjustments: number } {
    return {
      gamesSinceAdjust: this.data.gamesSinceAdjust,
      every: ADJUST_EVERY_GAMES,
      adjustments: this.data.adjustments,
    };
  }

  /**
   * 한 게임의 결과를 기록한다. 주기가 차면 그 자리에서 조정을 돌린다.
   * @returns 이번 호출로 조정이 돌았으면 true
   */
  record(results: readonly GameAugmentResult[]): boolean {
    if (!this.loaded) return false;
    for (const r of results) {
      // 같은 증강을 두 번 세지 않는다 (한 사람이 중복 보유할 수 있다)
      for (const id of new Set(r.augments)) {
        const rec = this.data.records[id] ?? { games: 0, wins: 0 };
        this.data.records[id] = {
          games: rec.games + 1,
          wins: rec.wins + (r.rank === 1 ? 1 : 0),
        };
      }
    }
    this.data.gamesSinceAdjust++;

    let adjusted = false;
    if (this.data.gamesSinceAdjust >= ADJUST_EVERY_GAMES) {
      this.data.offsets = {
        ...computeAdjustment(this.data.records, this.data.offsets),
      };
      this.data.gamesSinceAdjust = 0;
      this.data.adjustments++;
      adjusted = true;
    }
    this.queueSave();
    return adjusted;
  }

  /** 조정을 전부 되돌린다 (집계는 남긴다 — 관리자 리셋용) */
  resetOffsets(): void {
    this.data.offsets = emptyMap<number>();
    this.data.gamesSinceAdjust = 0;
    this.queueSave();
  }

  private queueSave(): void {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.saveChain = this.saveChain.then(async () => {
      try {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, snapshot, "utf8");
        await rename(tmp, this.filePath);
      } catch {
        // 통계 저장 실패가 게임을 멈춰선 안 된다
      }
    });
  }

  /** 저장이 끝날 때까지 기다린다 (테스트·종료 시) */
  async flush(): Promise<void> {
    await this.saveChain;
  }
}
