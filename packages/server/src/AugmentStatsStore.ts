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
 *
 * ## 게임 모드별로 따로 쌓는다 (2026-08-25, 반장전 밸런스 QA 시스템 P1)
 *
 * 예전에는 집계에 모드 축이 아예 없어서 **동풍전(4국)과 반장전(8국)의 성적이 한
 * 통에 섞였고**, 거기서 나온 가중치 하나가 두 모드에 동시에 걸렸다. 같은 증강이라도
 * 판이 두 배 긴 반장전에서는 값어치가 다르고, `late_bloomer`(반장전 전용)와
 * `late_bloomer_east`(동풍전 전용)처럼 **애초에 모집단이 다른 짝**은 같은 백분위
 * 줄에 서면 안 된다 — 서로 상대의 표본에 밀려 엉뚱한 방향으로 조정된다.
 *
 * 그래서 records·offsets·조정 주기 카운터를 통째로 **모드별 한 벌**로 나눈다.
 * 조정은 그 모드의 게임이 `ADJUST_EVERY_GAMES`판 찼을 때 그 모드의 모집단에서만
 * 돌고, 드래프트 가중치도 그 모드의 것만 쓴다.
 *
 * ### 최소 표본(`MIN_SAMPLE`)은 그대로 둔다
 *
 * "표본이 모드별로 쪼개져 절반이 된다"는 걱정은 **주기 카운터도 함께 쪼개졌기**
 * 때문에 성립하지 않는다. 조정은 그 모드의 20판마다 도는데, 그 20판 동안 그 모드의
 * records도 예전과 같은 속도로 찬다 — 한 조정 주기당 증강 하나가 모으는 표본 수는
 * 나누기 전과 **똑같다**. 달라지는 것은 실시간(현실 시간으로 첫 조정까지 두 배)뿐이라
 * 문턱의 통계적 의미는 변하지 않는다. 그래서 5를 유지한다.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ADJUST_EVERY_GAMES,
  computeAdjustment,
  weightsFromOffsets,
} from "@majak/core/augment/tierAdjust.js";
import type {
  AugmentRecord,
  TierOffsets,
} from "@majak/core/augment/tierAdjust.js";
import type { GameMode } from "@majak/core/engine/state/GameState.js";

/** 집계를 나누는 축 — 게임 모드 하나당 한 벌 */
export const STATS_MODES = ["hanchan", "tonpuu"] as const;

/** 한 모드의 집계 한 벌 */
interface ModeBucket {
  /** 증강 id → 보유 게임 수·1위 수 */
  records: Record<string, AugmentRecord>;
  /** 증강 id → 누적 반 단계 (양수 = 더 강하게 취급 = 덜 나온다) */
  offsets: Record<string, number>;
  /** 마지막 조정 이후 이 모드에서 기록된 게임 수 */
  gamesSinceAdjust: number;
  /** 지금까지 이 모드에서 조정이 돈 횟수 (관리자 표시용) */
  adjustments: number;
}

interface AugmentStatsFile {
  /**
   * 2 = 모드별 분리(2026-08-25). 1은 모드 없이 한 통에 쌓던 옛 형식이며
   * `load()`가 읽어서 옮긴다 — 아래 «레거시» 주석 참고.
   */
  version: 2;
  modes: Record<GameMode, ModeBucket>;
  /**
   * 모드 축이 생기기 전에 한 통에 쌓인 집계 (읽기 전용 보관).
   *
   * 이 행들이 동풍전 것인지 반장전 것인지는 **알 방법이 없다**. 그래서
   * 조정 모집단에는 넣지 않는다 — 넣으면 (양쪽에 복사하든 한쪽에 몰든) 모드를
   * 섞지 않겠다는 이번 변경의 목적을 그 자리에서 되돌린다. 그렇다고 버리지도
   * 않는다: 관리자 화면이 "이전 집계"로 계속 보여 줄 수 있어야 하고, 지워 버리면
   * 되돌릴 수 없다.
   */
  legacyRecords: Record<string, AugmentRecord>;
}

/** 프로토타입 오염 방지 — 증강 id가 키라 __proto__ 같은 값이 들어올 수 있다 */
function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function emptyBucket(): ModeBucket {
  return {
    records: emptyMap<AugmentRecord>(),
    offsets: emptyMap<number>(),
    gamesSinceAdjust: 0,
    adjustments: 0,
  };
}

function emptyFile(): AugmentStatsFile {
  return {
    version: 2,
    modes: { hanchan: emptyBucket(), tonpuu: emptyBucket() },
    legacyRecords: emptyMap<AugmentRecord>(),
  };
}

/** 한 게임의 결과 — 자리별 보유 증강과 최종 순위 */
export interface GameAugmentResult {
  augments: readonly string[];
  /** 1 = 우승 */
  rank: number;
}

/**
 * 한 게임의 드래프트 노출 — 증강 id → 제시·선택 횟수 (좌석 전부를 합친 값).
 * 픽률(`strengthOf`)의 근거이며, 근거는 리플레이 이벤트다(`AUGMENT_OFFERED`).
 */
export type GameAugmentOffers = Readonly<
  Record<string, { offered: number; picked: number }>
>;

/** 알 수 없는 값이 오면 동풍전으로 본다 (기본 모드) */
function normalizeMode(mode: string): GameMode {
  return mode === "hanchan" ? "hanchan" : "tonpuu";
}

function sanitizeRecords(
  raw: Record<string, unknown> | undefined,
  into: Record<string, AugmentRecord>,
): void {
  for (const [id, rec] of Object.entries(raw ?? {})) {
    const r = (rec ?? {}) as Partial<AugmentRecord>;
    into[id] = {
      games: Math.max(0, Math.trunc(r.games ?? 0)),
      wins: Math.max(0, Math.trunc(r.wins ?? 0)),
      // 2026-08-08 이전 파일에는 없다 — 0으로 시작해 다시 쌓는다.
      offered: Math.max(0, Math.trunc(r.offered ?? 0)),
      picked: Math.max(0, Math.trunc(r.picked ?? 0)),
    };
  }
}

function sanitizeBucket(
  raw: Partial<Record<keyof ModeBucket, unknown>> | undefined,
): ModeBucket {
  const b = emptyBucket();
  sanitizeRecords(
    raw?.records as Record<string, unknown> | undefined,
    b.records,
  );
  for (const [id, v] of Object.entries(
    (raw?.offsets ?? {}) as Record<string, unknown>,
  )) {
    if (typeof v === "number" && Number.isFinite(v)) b.offsets[id] = v;
  }
  b.gamesSinceAdjust = Math.max(
    0,
    Math.trunc(Number(raw?.gamesSinceAdjust ?? 0) || 0),
  );
  b.adjustments = Math.max(0, Math.trunc(Number(raw?.adjustments ?? 0) || 0));
  return b;
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
      const parsed = JSON.parse(raw) as Partial<AugmentStatsFile> & {
        // v1 필드 (모드 축이 없던 시절)
        records?: Record<string, unknown>;
        offsets?: Record<string, unknown>;
        gamesSinceAdjust?: number;
        adjustments?: number;
      };
      if (parsed !== null && typeof parsed === "object") {
        const next = emptyFile();
        if (parsed.modes !== null && typeof parsed.modes === "object") {
          for (const mode of STATS_MODES) {
            next.modes[mode] = sanitizeBucket(parsed.modes?.[mode]);
          }
          sanitizeRecords(
            parsed.legacyRecords as Record<string, unknown> | undefined,
            next.legacyRecords,
          );
        } else {
          /*
           * v1 파일(모드 없이 한 통) → v2 이관.
           *
           * - **records**: 모드를 알 수 없으므로 `legacyRecords`로 옮겨 보관만 한다
           *   (조정 모집단에서 뺀다). 근거는 위 인터페이스 주석.
           * - **offsets**: 반대로 **두 모드 모두에 그대로 복사한다.** 이건 «표본»이
           *   아니라 «이미 적용 중인 드래프트 가중치»라, 버리면 다음 판부터 모든
           *   증강의 확률이 정적 티어표로 툭 되돌아간다. 이관 시점의 노출을 그대로
           *   유지하고, 이후 각 모드가 자기 성적으로 여기서부터 갈라져 나가게 한다.
           * - **주기 카운터**: 두 모드에 함께 복사한다(어느 쪽 판이었는지 모르니
           *   양쪽 모두 그만큼 진행된 것으로 본다 — 손해 보는 쪽은 없다).
           */
          const legacy = sanitizeBucket({
            records: parsed.records,
            offsets: parsed.offsets,
            gamesSinceAdjust: parsed.gamesSinceAdjust,
            adjustments: parsed.adjustments,
          });
          next.legacyRecords = legacy.records;
          for (const mode of STATS_MODES) {
            const b = next.modes[mode];
            b.offsets = { ...legacy.offsets };
            b.gamesSinceAdjust = legacy.gamesSinceAdjust;
            b.adjustments = legacy.adjustments;
          }
        }
        this.data = next;
      }
    } catch {
      // 파일 없음/파싱 실패 → 빈 상태로 시작한다 (통계는 게임 진행을 막지 않는다)
    }
    this.loaded = true;
  }

  /** 이 모드의 드래프트에 쓸 가중치표 (그 모드의 조정 결과만 반영) */
  weights(mode: GameMode): Record<string, number> {
    return weightsFromOffsets(this.data.modes[normalizeMode(mode)].offsets);
  }

  /** 이 모드의 누적 반 단계 (관리자 화면·되돌리기용) */
  offsets(mode: GameMode): TierOffsets {
    return { ...this.data.modes[normalizeMode(mode)].offsets };
  }

  /** 이 모드의 집계 원본 (관리자 화면용). 행을 제자리에서 누적하므로 복사해 내보낸다. */
  records(mode: GameMode): Readonly<Record<string, AugmentRecord>> {
    const out: Record<string, AugmentRecord> = {};
    for (const [id, r] of Object.entries(
      this.data.modes[normalizeMode(mode)].records,
    )) {
      out[id] = { ...r };
    }
    return out;
  }

  /** 모드 축이 생기기 전의 집계 (조정에는 쓰지 않는다 — 보관·표시용) */
  legacyRecords(): Readonly<Record<string, AugmentRecord>> {
    const out: Record<string, AugmentRecord> = {};
    for (const [id, r] of Object.entries(this.data.legacyRecords))
      out[id] = { ...r };
    return out;
  }

  /** 이 모드의 조정 진행 상황 (관리자 화면용) */
  progress(mode: GameMode): {
    gamesSinceAdjust: number;
    every: number;
    adjustments: number;
  } {
    const b = this.data.modes[normalizeMode(mode)];
    return {
      gamesSinceAdjust: b.gamesSinceAdjust,
      every: ADJUST_EVERY_GAMES,
      adjustments: b.adjustments,
    };
  }

  /**
   * 한 게임의 결과를 **그 게임의 모드 통에** 기록한다. 그 모드의 주기가 차면
   * 그 자리에서 그 모드의 모집단만으로 조정을 돌린다.
   * @returns 이번 호출로 조정이 돌았으면 true
   */
  record(
    mode: GameMode,
    results: readonly GameAugmentResult[],
    offers: GameAugmentOffers = {},
  ): boolean {
    if (!this.loaded) return false;
    const bucket = this.data.modes[normalizeMode(mode)];
    const bump = (id: string): AugmentRecord =>
      (bucket.records[id] ??= { games: 0, wins: 0, offered: 0, picked: 0 });
    for (const r of results) {
      // 같은 증강을 두 번 세지 않는다 (한 사람이 중복 보유할 수 있다)
      for (const id of new Set(r.augments)) {
        const rec = bump(id);
        rec.games++;
        if (r.rank === 1) rec.wins++;
      }
    }
    // 제시·선택은 **보유와 무관하게** 센다 — 안 집힌 증강의 픽률이 곧 그 증강이
    // 얼마나 매력 없는지의 근거라, 보유자에게만 세면 분모가 사라진다.
    for (const [id, o] of Object.entries(offers)) {
      const rec = bump(id);
      rec.offered = (rec.offered ?? 0) + Math.max(0, Math.trunc(o.offered));
      rec.picked = (rec.picked ?? 0) + Math.max(0, Math.trunc(o.picked));
    }
    bucket.gamesSinceAdjust++;

    let adjusted = false;
    if (bucket.gamesSinceAdjust >= ADJUST_EVERY_GAMES) {
      bucket.offsets = { ...computeAdjustment(bucket.records, bucket.offsets) };
      bucket.gamesSinceAdjust = 0;
      bucket.adjustments++;
      adjusted = true;
    }
    this.queueSave();
    return adjusted;
  }

  /**
   * 조정을 전부 되돌린다 (집계는 남긴다 — 관리자 리셋용).
   * 모드를 주면 그 모드만, 없으면 전부.
   */
  resetOffsets(mode?: GameMode): void {
    const targets = mode === undefined ? STATS_MODES : [normalizeMode(mode)];
    for (const m of targets) {
      const b = this.data.modes[m];
      b.offsets = emptyMap<number>();
      b.gamesSinceAdjust = 0;
    }
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
