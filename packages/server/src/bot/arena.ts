/**
 * arena — 봇을 **재는** 자리.
 *
 * ## 왜 필요한가
 *
 * 2026-08-05의 봇 재작성(단일 눈금 · 입찰 코어 · 상대 읽기 · 의도 선언 · 성격)은
 * 전부 단위 테스트와 장면 시나리오로만 검증됐다. 그 테스트들은 "이 상황에서 이렇게
 * 두는가"는 잡지만, **"그래서 더 잘 두게 됐는가"는 한 번도 재지 않았다.**
 *
 * 그 결과 봇 곳곳의 상수 — `PUSH_HORIZON = 2.5`, `DEAL_IN_SCALE = 0.11`,
 * `RON_MULTIPLIER = 2.2`, 원형표의 값들 — 이 전부 **근거를 대고 고른 값**이지 맞춰서
 * 나온 값이 아니다. 근거는 그럴듯하지만 그럴듯함은 측정이 아니다.
 *
 * 이 파일은 봇끼리 실제로 판을 돌려 결과를 집계한다. 그러면 앞으로의 튜닝이
 * "이게 더 나아 보인다"에서 "이게 방총률을 0.02 낮췄다"로 바뀐다.
 *
 * ## 무엇을 재는가
 *
 * 집계는 코어가 이미 가진 `StatsTracker`를 그대로 쓴다 — 실제 대국의 전적 화면과
 * **같은 계산**이라야 여기서 잰 값이 실제 게임의 값과 같은 뜻을 가진다.
 * 여기서 더하는 것은 **원형별 묶기**뿐이다: 같은 판에서 공격형과 수비형이 정말로
 * 다르게 노는지는 성격표를 읽어서가 아니라 결과로 확인해야 한다.
 *
 * ## 결정론
 *
 * 시드 하나로 게임 시드와 봇 시드가 전부 파생된다 — 같은 인자면 같은 숫자가 나온다.
 * A/B를 비교할 때 이게 없으면 차이가 변경 때문인지 운 때문인지 알 수 없다.
 */

import {
  HanchanController,
  ROUND_STARTED,
  StatsTracker,
  createEmptyStats,
  deriveStats,
  mergeStats,
} from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type {
  AugmentDef,
  GameMode,
  PlayerId,
  PlayerStatsRaw,
  PlayerStatsView,
} from "@majak/core";
import { BotAgent } from "../BotAgent.js";
import { profileOf } from "./profile.js";
import type { ArchetypeName } from "./profile.js";

export interface ArenaOptions {
  /** 돌릴 판 수 */
  games: number;
  /** 시드 — 게임·봇 시드가 전부 여기서 파생된다 */
  seed?: number;
  /** 반장전(기본) / 동풍전. 동풍전은 절반 길이라 빠르게 재는 데 쓴다 */
  mode?: GameMode;
  /**
   * 증강 카탈로그. 비우면 **증강 없는 순수 리치마작**으로 잰다 —
   * 증강은 분산이 커서 기본 실력 변화를 덮어 버리므로, 기본값은 비움이다.
   */
  augments?: readonly AugmentDef[];
  /**
   * 좌석별 원형 고정 (4개). 지정하면 그 성격으로만 앉힌다 —
   * 원형 간 비교는 이렇게 고정해야 좌석·시드 운이 섞이지 않는다.
   * 생략하면 봇이 시드에서 스스로 뽑는다(실제 대국과 같은 조건).
   */
  seats?: readonly [ArchetypeName, ArchetypeName, ArchetypeName, ArchetypeName];
}

export interface ArenaResult {
  games: number;
  /** 진행된 총 국 수 */
  rounds: number;
  /** 좌석별 전적 */
  bySeat: { player: PlayerId; archetype: ArchetypeName; stats: PlayerStatsView }[];
  /** 원형별 합산 전적 — 성격이 실제로 다르게 노는가 */
  byArchetype: { archetype: ArchetypeName; stats: PlayerStatsView }[];
  /** 유국률 (아무도 화료하지 못한 국의 비율) */
  drawRate: number;
  elapsedMs: number;
}

const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];

/**
 * 시드에서 파생된 게임 시드. 게임마다 달라야 하지만(안 그러면 같은 판을 N번 돈다)
 * 전체는 시드 하나로 재현돼야 한다.
 */
function gameSeed(seed: number, i: number): number {
  let h = (seed ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 봇끼리 여러 판을 돌리고 전적을 집계한다 */
export async function runArena(opts: ArenaOptions): Promise<ArenaResult> {
  const seed = opts.seed ?? 0x5eed;
  const mode: GameMode = opts.mode ?? "hanchan";
  const started = Date.now();

  const totals = new Map<PlayerId, PlayerStatsRaw>();
  const archetypeOf = new Map<PlayerId, ArchetypeName>();
  let rounds = 0;
  let winRounds = 0;

  for (let g = 0; g < opts.games; g++) {
    const gs = gameSeed(seed, g);
    const bots = SEATS.map((id, i) => {
      const bot = new BotAgent(id, `Bot_${id}`, gs + i);
      const fixed = opts.seats?.[i];
      if (fixed !== undefined) bot.setProfile(profileOf(fixed));
      bot.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
      archetypeOf.set(id, bot.archetype);
      return bot;
    });

    const tracker = new StatsTracker([...SEATS]);
    const controller = new HanchanController(
      bots,
      {
        ...hanchanConfigForMode(mode),
        // 증강을 안 쓰면 드래프트도 돌리지 않는다 (드래프트만 돌면 시간만 든다)
        ...(opts.augments === undefined || opts.augments.length === 0
          ? { draftSchedules: [], extraAugments: [] }
          : { extraAugments: opts.augments }),
        seed: gs,
      },
      {
        onEvent: (json: string) => {
          const event = JSON.parse(json) as { type: string; payload?: unknown };
          if (event.type === ROUND_STARTED) rounds++;
          tracker.consume(event);
        },
      },
    );

    const rankings = await controller.run();
    tracker.recordGameEnd(rankings);

    for (const id of SEATS) {
      const s = tracker.get(id);
      if (s === undefined) continue;
      totals.set(id, mergeStats(totals.get(id) ?? createEmptyStats(), s));
    }
  }

  const bySeat = SEATS.map((id) => ({
    player: id,
    archetype: archetypeOf.get(id) ?? "balanced",
    stats: deriveStats(totals.get(id) ?? createEmptyStats()),
  }));

  // 유국률 — 전원 화료 수의 합이 곧 '누군가 이긴 국' 수다
  winRounds = bySeat.reduce((n, s) => n + s.stats.wins, 0);

  const byArch = new Map<ArchetypeName, PlayerStatsRaw>();
  for (const seat of bySeat) {
    const raw = totals.get(seat.player);
    if (raw === undefined) continue;
    byArch.set(seat.archetype, mergeStats(byArch.get(seat.archetype) ?? createEmptyStats(), raw));
  }

  return {
    games: opts.games,
    rounds,
    bySeat,
    byArchetype: [...byArch].map(([archetype, raw]) => ({
      archetype,
      stats: deriveStats(raw),
    })),
    drawRate: rounds === 0 ? 0 : Math.max(0, 1 - winRounds / rounds),
    elapsedMs: Date.now() - started,
  };
}

/** 사람이 읽는 한 장 요약 (CLI 출력) */
export function formatArena(r: ArenaResult): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(
    `게임 ${r.games}판 · 국 ${r.rounds} · 유국률 ${pct(r.drawRate)} · ${(r.elapsedMs / 1000).toFixed(1)}초`,
  );
  lines.push("");
  lines.push("원형        화료율  방총율  리치율  후로율  평균화료  평균방총  평균순위");
  for (const a of [...r.byArchetype].sort((x, y) => x.stats.avgPlacement - y.stats.avgPlacement)) {
    const s = a.stats;
    lines.push(
      [
        a.archetype.padEnd(11),
        pct(s.winRate).padStart(6),
        pct(s.dealInRate).padStart(7),
        pct(s.riichiRate).padStart(7),
        pct(s.callRate).padStart(7),
        Math.round(s.avgWinPoints).toString().padStart(9),
        Math.round(s.avgDealInPoints).toString().padStart(9),
        s.avgPlacement.toFixed(3).padStart(9),
      ].join(" "),
    );
  }
  return lines.join("\n");
}
