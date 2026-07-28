/**
 * PlayerStats — 리치마작 플레이어 통계.
 *
 * 통계는 GameState를 직접 뒤지지 않고 **확정 이벤트 스트림**만 소비해 만든다.
 * (Event Log = Single Source of Truth 원칙 — 리플레이 로그만으로도 동일 통계 재구성 가능)
 *
 * StatsTracker는 한 판(반장전)의 이벤트를 순서대로 consume() 하고,
 * 국 종료(ROUND_SETTLED)마다 국 단위 지표를, 게임 종료 시 순위를 누적한다.
 * 순수 계산만 담당하므로 I/O·저장은 서버(StatsStore)가 맡는다.
 *
 * 설계: docs/14_LOBBY_STATS.md §2
 */

import type { PlayerId } from "../engine/zones/Zone.js";
import {
  ROUND_STARTED,
  TILE_DISCARDED,
  CALL_MADE,
  KAN_DECLARED,
  ROUND_SETTLED,
} from "../mahjong/flow/flowEvents.js";
import type {
  TileDiscardedPayload,
  CallMadePayload,
  KanDeclaredPayload,
  RoundSettledPayload,
} from "../mahjong/flow/flowEvents.js";
import { AUGMENT_OFFERED, AUGMENT_DRAFTED } from "../augment/events.js";
import type { AugmentOfferedPayload, AugmentDraftedPayload } from "../augment/events.js";

// ─────────────────────────── 원시 누적 통계 ───────────────────────────

/**
 * 증강 하나에 대한 원시 누적 카운터. 전부 합계 형태라 career 누적이 가능하다.
 * - offered/picked: 드래프트에서 제시된/선택된 횟수 → 픽률 = picked / offered.
 *   (도박사 지급분은 offered·picked 어디에도 안 들어간다 — 오퍼가 아니므로)
 * - games/placements/placementSum: 이 증강을 '보유한 채로' 끝낸 판의 최종 순위
 *   (지급분 포함 보유 기준) → 평균순위·1위율.
 */
export interface AugmentStatRaw {
  /** 드래프트 3지선다에 제시된 횟수 */
  offered: number;
  /** 드래프트에서 선택된 횟수 (지급 제외) */
  picked: number;
  /** 이 증강을 보유한 채 완료한 판 수 */
  games: number;
  /** 보유 판의 순위별 횟수 [1위, 2위, 3위, 4위] */
  placements: [number, number, number, number];
  /** 보유 판의 순위 합 (평균 순위용) */
  placementSum: number;
}

export function createEmptyAugmentStat(): AugmentStatRaw {
  return { offered: 0, picked: 0, games: 0, placements: [0, 0, 0, 0], placementSum: 0 };
}

function mergeAugmentStat(a: AugmentStatRaw, b: AugmentStatRaw): AugmentStatRaw {
  return {
    offered: a.offered + b.offered,
    picked: a.picked + b.picked,
    games: a.games + b.games,
    placements: [
      a.placements[0] + b.placements[0],
      a.placements[1] + b.placements[1],
      a.placements[2] + b.placements[2],
      a.placements[3] + b.placements[3],
    ],
    placementSum: a.placementSum + b.placementSum,
  };
}

/** 증강 통계 맵 깊은 복사 (저장·스냅샷에서 공유 참조 방지). */
function cloneAugments(m: Record<string, AugmentStatRaw>): Record<string, AugmentStatRaw> {
  const out: Record<string, AugmentStatRaw> = {};
  for (const [id, s] of Object.entries(m)) {
    out[id] = { ...s, placements: [...s.placements] as [number, number, number, number] };
  }
  return out;
}

/** 원시 통계 깊은 복사 (배열·중첩 맵의 공유 참조 방지). */
function cloneStatsRaw(s: PlayerStatsRaw): PlayerStatsRaw {
  return {
    ...s,
    placements: [...s.placements] as [number, number, number, number],
    augments: cloneAugments(s.augments ?? {}),
    augmentTierPicks: [...(s.augmentTierPicks ?? [0, 0, 0])] as [number, number, number],
  };
}

/**
 * 저장·병합되는 원시 카운터. 파생 비율은 저장하지 않고 deriveStats로 계산한다.
 * (합산 가능해야 career 누적이 되므로 전부 "합계" 형태로 보관)
 */
export interface PlayerStatsRaw {
  /** 참가한 국 수 (유국·도중유국 포함) */
  roundsPlayed: number;
  /** 화료(아가리) 횟수 */
  wins: number;
  /** 쯔모 화료 횟수 */
  tsumoWins: number;
  /** 론 화료 횟수 */
  ronWins: number;
  /** 화료로 얻은 점수 합 (본장·공탁 제외) */
  winPointsTotal: number;
  /** 방총(론 쏘임) 국 수 — 한 국에 여러 명에게 쏴도 1 */
  dealIns: number;
  /** 방총으로 잃은 점수 합 (양수) */
  dealInPointsTotal: number;
  /** 리치 선언 국 수 */
  riichiRounds: number;
  /** 후로(펑·치·대명깡·가깡) 국 수 — 안깡은 제외 (멘젠 유지) */
  callRounds: number;
  /** 완료한 반장전 수 */
  games: number;
  /** 순위별 횟수 [1위, 2위, 3위, 4위] */
  placements: [number, number, number, number];
  /** 순위 합 (평균 순위용) */
  placementSum: number;
  /** 증강 id별 누적 통계 (제시·선택·보유 판 성적) */
  augments: Record<string, AugmentStatRaw>;
  /** 획득(선택)한 증강의 등급 분포 [silver, gold, prism] — 지급 제외 */
  /**
   * @deprecated 2026-07-22 (52차) 등급 폐기로 더 이상 누적하지 않는다.
   * 이미 저장된 통계와의 호환을 위해 필드만 남긴다 — 신규 게임에서는 항상 0이다.
   */
  augmentTierPicks: [number, number, number];
}

/** 파생 비율까지 포함한 표시용 통계 (0~1 비율, 평균값). */
export interface PlayerStatsView extends PlayerStatsRaw {
  /** 화료율 = wins / roundsPlayed */
  winRate: number;
  /** 방총률 = dealIns / roundsPlayed */
  dealInRate: number;
  /** 리치율 = riichiRounds / roundsPlayed */
  riichiRate: number;
  /** 후로율 = callRounds / roundsPlayed */
  callRate: number;
  /** 쯔모 비율 = tsumoWins / wins */
  tsumoRate: number;
  /** 평균 화료 점수 = winPointsTotal / wins */
  avgWinPoints: number;
  /** 평균 방총 점수 = dealInPointsTotal / dealIns */
  avgDealInPoints: number;
  /** 평균 순위 = placementSum / games */
  avgPlacement: number;
  /** 1위율 = placements[0] / games */
  topRate: number;
  /** 연대율(1+2위) = (placements[0]+placements[1]) / games */
  rentaiRate: number;
}

export function createEmptyStats(): PlayerStatsRaw {
  return {
    roundsPlayed: 0,
    wins: 0,
    tsumoWins: 0,
    ronWins: 0,
    winPointsTotal: 0,
    dealIns: 0,
    dealInPointsTotal: 0,
    riichiRounds: 0,
    callRounds: 0,
    games: 0,
    placements: [0, 0, 0, 0],
    placementSum: 0,
    augments: {},
    augmentTierPicks: [0, 0, 0],
  };
}

/** 두 원시 통계를 합산 (career 누적·여러 판 합계). 입력은 변경하지 않는다. */
export function mergeStats(a: PlayerStatsRaw, b: PlayerStatsRaw): PlayerStatsRaw {
  const augments = cloneAugments(a.augments ?? {});
  for (const [id, s] of Object.entries(b.augments ?? {})) {
    augments[id] = mergeAugmentStat(augments[id] ?? createEmptyAugmentStat(), s);
  }
  const at = a.augmentTierPicks ?? [0, 0, 0];
  const bt = b.augmentTierPicks ?? [0, 0, 0];
  return {
    roundsPlayed: a.roundsPlayed + b.roundsPlayed,
    wins: a.wins + b.wins,
    tsumoWins: a.tsumoWins + b.tsumoWins,
    ronWins: a.ronWins + b.ronWins,
    winPointsTotal: a.winPointsTotal + b.winPointsTotal,
    dealIns: a.dealIns + b.dealIns,
    dealInPointsTotal: a.dealInPointsTotal + b.dealInPointsTotal,
    riichiRounds: a.riichiRounds + b.riichiRounds,
    callRounds: a.callRounds + b.callRounds,
    games: a.games + b.games,
    placements: [
      a.placements[0] + b.placements[0],
      a.placements[1] + b.placements[1],
      a.placements[2] + b.placements[2],
      a.placements[3] + b.placements[3],
    ],
    placementSum: a.placementSum + b.placementSum,
    augments,
    augmentTierPicks: [at[0] + bt[0], at[1] + bt[1], at[2] + bt[2]],
  };
}

/** 원시 카운터 → 표시용 비율/평균 계산. 분모 0이면 0. */
export function deriveStats(raw: PlayerStatsRaw): PlayerStatsView {
  const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);
  return {
    ...raw,
    placements: [...raw.placements] as [number, number, number, number],
    augments: cloneAugments(raw.augments ?? {}),
    augmentTierPicks: [...(raw.augmentTierPicks ?? [0, 0, 0])] as [number, number, number],
    winRate: ratio(raw.wins, raw.roundsPlayed),
    dealInRate: ratio(raw.dealIns, raw.roundsPlayed),
    riichiRate: ratio(raw.riichiRounds, raw.roundsPlayed),
    callRate: ratio(raw.callRounds, raw.roundsPlayed),
    tsumoRate: ratio(raw.tsumoWins, raw.wins),
    avgWinPoints: ratio(raw.winPointsTotal, raw.wins),
    avgDealInPoints: ratio(raw.dealInPointsTotal, raw.dealIns),
    avgPlacement: ratio(raw.placementSum, raw.games),
    topRate: ratio(raw.placements[0], raw.games),
    rentaiRate: ratio(raw.placements[0] + raw.placements[1], raw.games),
  };
}

// ─────────────────────────── StatsTracker ───────────────────────────

/** 이벤트 최소 형태 (JSON.parse 결과와 GameEvent 양쪽 호환) */
interface ConsumableEvent {
  type: string;
  payload?: unknown;
}

/** 순위 입력 (RankingEntry의 부분집합) */
export interface RankInput {
  playerId: PlayerId;
  rank: number;
}

/**
 * 한 판(반장전)의 이벤트를 소비해 플레이어별 통계를 누적한다.
 *
 * - 국 진행 이벤트(리치 버림·후로·깡)는 "이번 국" 플래그로만 표시하고,
 *   ROUND_SETTLED 시점에 국 단위 카운터에 반영한다 (국당 최대 1회 계상).
 * - 반장전 종료 시 recordGameEnd(rankings)로 순위를 누적한다.
 */
export class StatsTracker {
  private readonly stats = new Map<PlayerId, PlayerStatsRaw>();
  private readonly participants: PlayerId[];
  private roundRiichi = new Set<PlayerId>();
  private roundCall = new Set<PlayerId>();
  /** 게임 내내 각 플레이어가 획득한 증강(픽+지급) — 종료 시 순위 귀속용 */
  private readonly heldByPlayer = new Map<PlayerId, Set<string>>();
  /** 직전 오퍼(플레이어별) — 픽이 진짜 드래프트 선택인지(지급 아님) 판별용 */
  private readonly lastOffered = new Map<PlayerId, Set<string>>();

  constructor(playerIds: PlayerId[]) {
    this.participants = [...playerIds];
    for (const id of playerIds) {
      this.stats.set(id, createEmptyStats());
      this.heldByPlayer.set(id, new Set());
    }
  }

  /** 증강 통계 항목을 (없으면 만들어) 반환한다. */
  private ensureAug(s: PlayerStatsRaw, id: string): AugmentStatRaw {
    let a = s.augments[id];
    if (a === undefined) {
      a = createEmptyAugmentStat();
      s.augments[id] = a;
    }
    return a;
  }

  /** 확정 이벤트 하나를 소비한다. 리플레이 로그의 JSON도 그대로 넣을 수 있다. */
  consume(event: ConsumableEvent): void {
    switch (event.type) {
      case ROUND_STARTED:
        this.roundRiichi.clear();
        this.roundCall.clear();
        break;
      case TILE_DISCARDED: {
        const p = event.payload as TileDiscardedPayload;
        if (p.riichi) this.roundRiichi.add(p.player);
        break;
      }
      case CALL_MADE: {
        const p = event.payload as CallMadePayload;
        this.roundCall.add(p.caller);
        break;
      }
      case KAN_DECLARED: {
        const p = event.payload as KanDeclaredPayload;
        // 안깡은 멘젠을 깨지 않으므로 후로에 넣지 않는다.
        if (p.kanKind === "kan_open" || p.kanKind === "kan_added") {
          this.roundCall.add(p.player);
        }
        break;
      }
      case AUGMENT_OFFERED: {
        const p = event.payload as AugmentOfferedPayload;
        this.lastOffered.set(p.player, new Set(p.augmentIds));
        const s = this.stats.get(p.player);
        if (s !== undefined) {
          for (const id of p.augmentIds) this.ensureAug(s, id).offered++;
        }
        break;
      }
      case AUGMENT_DRAFTED: {
        const p = event.payload as AugmentDraftedPayload;
        this.heldByPlayer.get(p.player)?.add(p.augmentId);
        const s = this.stats.get(p.player);
        // 직전 오퍼에 포함된 픽만 '선택'으로 계상 (도박사 지급분은 제외).
        if (s !== undefined && this.lastOffered.get(p.player)?.has(p.augmentId) === true) {
          this.ensureAug(s, p.augmentId).picked++;
        }
        break;
      }
      case ROUND_SETTLED:
        this.settleRound(event.payload as RoundSettledPayload);
        break;
      default:
        break;
    }
  }

  private settleRound(p: RoundSettledPayload): void {
    // 화료·방총 집계 (방총은 국당 1회, 더블론이면 잃은 점수는 합산)
    const dealtInLoss = new Map<PlayerId, number>();
    for (const w of p.winInfos ?? []) {
      const winner = this.stats.get(w.winner);
      if (winner !== undefined) {
        winner.wins++;
        winner.winPointsTotal += w.points;
        if (w.winType === "tsumo") winner.tsumoWins++;
        else winner.ronWins++;
      }
      if (w.winType === "ron" && w.from !== null) {
        dealtInLoss.set(w.from, (dealtInLoss.get(w.from) ?? 0) + w.points);
      }
    }

    for (const id of this.participants) {
      const s = this.stats.get(id);
      if (s === undefined) continue;
      s.roundsPlayed++;
      if (this.roundRiichi.has(id)) s.riichiRounds++;
      if (this.roundCall.has(id)) s.callRounds++;
      const loss = dealtInLoss.get(id);
      if (loss !== undefined) {
        s.dealIns++;
        s.dealInPointsTotal += loss;
      }
    }

    this.roundRiichi.clear();
    this.roundCall.clear();
  }

  /** 반장전 종료 순위를 누적한다. rank는 1~4. */
  recordGameEnd(rankings: RankInput[]): void {
    for (const r of rankings) {
      const s = this.stats.get(r.playerId);
      if (s === undefined) continue;
      if (r.rank < 1 || r.rank > 4) continue;
      s.games++;
      s.placementSum += r.rank;
      const idx = r.rank - 1;
      s.placements[idx] = (s.placements[idx] ?? 0) + 1;
      // 이 판에 보유했던 증강(픽+지급)에 최종 순위를 귀속시킨다.
      const held = this.heldByPlayer.get(r.playerId);
      if (held !== undefined) {
        for (const id of held) {
          const a = this.ensureAug(s, id);
          a.games++;
          a.placementSum += r.rank;
          a.placements[idx] = (a.placements[idx] ?? 0) + 1;
        }
      }
    }
  }

  /** 플레이어별 현재 통계 스냅샷 (복사본). */
  snapshot(): Map<PlayerId, PlayerStatsRaw> {
    const out = new Map<PlayerId, PlayerStatsRaw>();
    for (const [id, s] of this.stats) out.set(id, cloneStatsRaw(s));
    return out;
  }

  /** 특정 플레이어의 통계 스냅샷 (복사본). */
  get(playerId: PlayerId): PlayerStatsRaw | undefined {
    const s = this.stats.get(playerId);
    return s === undefined ? undefined : cloneStatsRaw(s);
  }
}
