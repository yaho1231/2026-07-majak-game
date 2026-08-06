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
  standardAugments,
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
import { NO_FLAGS } from "./flags.js";
import type { BotFlags } from "./flags.js";
import { CALL_OUTCOMES, CALL_OUTCOME_LABEL, CallTally } from "./callAudit.js";

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
  /**
   * **2:2 정책 대전.** 이 스위치를 켠 봇 둘과 끄지 않은 봇 둘을 같은 탁에 앉힌다.
   *
   * 자기대국(넷이 같은 정책)으로는 강함을 잴 수 없다 — 평균 순위가 구조상 2.5로
   * 수렴하기 때문이다. 강함은 상대적인 값이라 **같은 탁에 둘을 앉혀야** 나온다.
   *
   * **같은 배패를 좌우 바꿔 두 번 돌린다**(듀플리케이트 브리지와 같은 방식).
   * 한 번은 0·2번 자리가 스위치를 켜고, 한 번은 1·3번 자리가 켠다. 배패와 산이
   * 완전히 같으므로 **패 운이 통째로 상쇄되고** 남는 것은 정책 차이뿐이다.
   * 그냥 판마다 자리를 번갈아 앉히면 배패 운이 그대로 잡음으로 남아, 웬만한 개선은
   * 그 잡음에 묻힌다(실측: 120판 표준오차 ±0.118 — 어지간한 변경보다 크다).
   */
  ab?: BotFlags;
  /** 콜 기회가 어디서 걸렸는지 집계한다 (`--calls`) */
  auditCalls?: boolean;
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
  /**
   * **콜 기회가 어디서 걸렸는가** (`--calls`를 켰을 때만).
   * 후로율이 낮은 원인을 문턱에서 찾을지 값매김에서 찾을지 가르는 자료다.
   */
  calls?: CallTally;
  /** 2:2 정책 대전 결과 (ab를 켰을 때만) */
  ab?: {
    flags: string[];
    /** 스위치를 켠 두 자리의 합산 */
    on: PlayerStatsView;
    /** 끄고 앉은 두 자리의 합산 */
    off: PlayerStatsView;
    /** 평균 순위 차 (양수 = 켠 쪽이 우세) */
    placementGain: number;
    /**
     * **1인당 최종 점수 차** (양수 = 켠 쪽이 우세).
     *
     * 순위는 1~4의 네 칸뿐이라 둔하다 — 크게 이겼든 간신히 이겼든 같은 1위다.
     * 점수는 연속값이라 같은 판수에서 훨씬 많은 정보를 준다. 드물게 나오는
     * 변화(비싼 역을 제대로 세는 것 같은)는 순위로는 잘 안 보이고 점수로 먼저 보인다.
     */
    scoreGain: number;
    /** 점수 차의 실측 표준오차 */
    scoreStandardError: number;
    /**
     * 그 차이의 **실측** 표준오차. 배패별 차이의 표본표준편차에서 나온다 —
     * 이론값을 쓰면 듀플리케이트로 잡음이 얼마나 줄었는지를 알 수 없다.
     */
    standardError: number;
  };
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
  /**
   * 2:2 대전에서는 **성격을 통일한다**(따로 지정하지 않으면 균형형 넷).
   *
   * 안 그러면 봇이 시드에서 각자 원형을 뽑는데, 그러면 켠 쪽과 끈 쪽의 성격 구성이
   * 달라져 **스위치의 효과와 성격의 효과가 섞인다.** 실제로 아무도 안 읽는 스위치로
   * 재 봤을 때 순위 차가 0.11이나 나왔다 — 전부 성격 차이였다.
   */
  const seats =
    opts.seats ??
    (opts.ab !== undefined
      ? (["balanced", "balanced", "balanced", "balanced"] as const)
      : undefined);

  const totals = new Map<PlayerId, PlayerStatsRaw>();
  const archetypeOf = new Map<PlayerId, ArchetypeName>();
  let rounds = 0;
  let winRounds = 0;
  // 2:2 대전 집계 — 자리를 번갈아 앉히므로 좌석별이 아니라 '켠 쪽/끈 쪽'으로 모은다
  const abOn: PlayerStatsRaw = createEmptyStats();
  const abOff: PlayerStatsRaw = createEmptyStats();
  // 배패별 순위 차 — 표준오차를 이론이 아니라 **표본에서** 낸다
  const dealDiffs: number[] = [];
  const dealScoreDiffs: number[] = [];
  let dealOn = 0;
  let dealOff = 0;
  let dealScoreOn = 0;
  let dealScoreOff = 0;

  /**
   * 봇이 발동 판단에 쓸 증강 카탈로그 — **게임에 실제로 깔리는 것과 같아야 한다.**
   * 증강을 안 쓰는 기본 아레나에서는 비운다(보유가 없어 어차피 조회되지 않지만,
   * 기본 측정 경로를 한 치도 바꾸지 않기 위해서다).
   */
  const botCatalog =
    opts.augments === undefined || opts.augments.length === 0
      ? undefined
      : [...standardAugments, ...opts.augments];

  const calls = opts.auditCalls === true ? new CallTally() : undefined;

  // 2:2 대전은 같은 배패를 좌우 바꿔 두 번 돈다 — 그래서 실제 판수가 두 배다
  const mirrored = opts.ab !== undefined;
  const passes = mirrored ? 2 : 1;
  for (let g = 0; g < opts.games * passes; g++) {
    const deal = mirrored ? Math.floor(g / 2) : g;
    const side = mirrored ? g % 2 : 0;
    const gs = gameSeed(seed, deal);
    const bots = SEATS.map((id, i) => {
      // 카탈로그를 넘겨야 봇이 **액티브 증강을 발동한다**(`BotAgent.catalog`가 비면
      // 정책 조회가 통째로 비어 증강을 하나도 안 쓴다). 이게 빠져 있어서 `--augments`
      // 아레나는 증강을 **뽑기만 하고 쓰지는 않는** 판을 재고 있었다 — 정책 63개가
      // 측정에서 죽어 있었고, 증강 정책 변경은 스위치를 켜도 **정확히 0 차이**가 났다.
      const bot = new BotAgent(id, `Bot_${id}`, gs + i, botCatalog);
      const fixed = seats?.[i];
      if (fixed !== undefined) bot.setProfile(profileOf(fixed));
      bot.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
      // 같은 배패의 첫 번째 판은 0·2번, 두 번째 판은 1·3번이 스위치를 켠다
      if (opts.ab !== undefined && i % 2 === side) bot.setFlags(opts.ab);
      if (calls !== undefined) bot.setCallAudit(calls);
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
    if (mirrored) {
      for (const r of rankings) {
        const i = SEATS.indexOf(r.playerId);
        if (i < 0) continue;
        // 순위 점수(우마 포함)가 이 판의 성적이다 — 제로섬이라 합이 0이다
        const pts = (r as { score?: number }).score ?? 0;
        if (i % 2 === side) {
          dealOn += r.rank;
          dealScoreOn += pts;
        } else {
          dealOff += r.rank;
          dealScoreOff += pts;
        }
      }
      // 같은 배패의 두 판이 다 끝나면 그 배패의 차이를 기록한다 (각 쪽 4인분)
      if (side === 1) {
        dealDiffs.push((dealOff - dealOn) / 4);
        dealScoreDiffs.push((dealScoreOn - dealScoreOff) / 4);
        dealOn = 0;
        dealOff = 0;
        dealScoreOn = 0;
        dealScoreOff = 0;
      }
    }

    for (const [i, id] of SEATS.entries()) {
      const s = tracker.get(id);
      if (s === undefined) continue;
      totals.set(id, mergeStats(totals.get(id) ?? createEmptyStats(), s));
      if (opts.ab !== undefined) {
        const bucket = i % 2 === side ? abOn : abOff;
        Object.assign(bucket, mergeStats(structuredClone(bucket), s));
      }
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
    ...(calls === undefined ? {} : { calls }),
    ...(opts.ab !== undefined
      ? {
          ab: {
            flags: [...opts.ab],
            on: deriveStats(abOn),
            off: deriveStats(abOff),
            placementGain: mean(dealDiffs),
            standardError: standardError(dealDiffs),
            scoreGain: mean(dealScoreDiffs),
            scoreStandardError: standardError(dealScoreDiffs),
          },
        }
      : {}),
    elapsedMs: Date.now() - started,
  };
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** 표본표준편차 ÷ √n — 배패별 차이에서 직접 낸다 */
function standardError(xs: readonly number[]): number {
  if (xs.length < 2) return Infinity;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance / xs.length);
}

/** 사람이 읽는 한 장 요약 (CLI 출력) */
export function formatArena(r: ArenaResult): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(
    `게임 ${r.games}${r.ab !== undefined ? "배패 × 2(좌우 교대)" : "판"} · 국 ${r.rounds} · ` +
      `유국률 ${pct(r.drawRate)} · ${(r.elapsedMs / 1000).toFixed(1)}초`,
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
  if (r.ab !== undefined) {
    lines.push("");
    lines.push(`2:2 정책 대전 — 스위치 [${r.ab.flags.join(", ")}]`);
    lines.push("쪽    화료율  방총율  리치율  후로율  평균화료  평균순위");
    for (const [label, s] of [
      ["켠 쪽", r.ab.on],
      ["끈 쪽", r.ab.off],
    ] as const) {
      lines.push(
        [
          label.padEnd(5),
          pct(s.winRate).padStart(6),
          pct(s.dealInRate).padStart(7),
          pct(s.riichiRate).padStart(7),
          pct(s.callRate).padStart(7),
          Math.round(s.avgWinPoints).toString().padStart(9),
          s.avgPlacement.toFixed(4).padStart(9),
        ].join(" "),
      );
    }
    /**
     * 순위는 제로섬이라 두 쪽의 평균은 항상 2.5다 — **차이만이** 뜻을 가진다.
     * 표준오차는 이론값이 아니라 **배패별 차이의 표본**에서 낸다: 듀플리케이트로
     * 배패 운이 얼마나 상쇄됐는지는 실제로 재 봐야 알 수 있기 때문이다.
     */
    const diff = r.ab.placementGain;
    const se = r.ab.standardError;
    const verdict = !Number.isFinite(se)
      ? "표본 부족"
      : Math.abs(diff) > se * 2
        ? "유의미"
        : "판수 부족";
    lines.push(
      `평균 순위 차 ${diff >= 0 ? "+" : ""}${diff.toFixed(4)} ` +
        `(켠 쪽이 ${diff > 0 ? "우세" : diff < 0 ? "열세" : "동률"}) · ` +
        `표준오차 ±${se.toFixed(4)} → ${verdict}`,
    );
    // 순위는 네 칸뿐이라 둔하다 — 점수는 연속값이라 같은 판수에서 더 잘 보인다
    const sg = r.ab.scoreGain;
    const sse = r.ab.scoreStandardError;
    const sVerdict = !Number.isFinite(sse)
      ? "표본 부족"
      : Math.abs(sg) > sse * 2
        ? "유의미"
        : "판수 부족";
    lines.push(
      `1인당 점수 차 ${sg >= 0 ? "+" : ""}${sg.toFixed(0)} · ` +
        `표준오차 ±${sse.toFixed(0)} → ${sVerdict}`,
    );
  }

  const calls = r.calls;
  if (calls !== undefined && calls.total > 0) {
    lines.push("");
    lines.push(`콜 기회 ${calls.total}회 — 어디서 걸렸는가`);
    lines.push("결말           기회      비율    펑가능   치뿐  역패기회  평균샹텐");
    for (const outcome of CALL_OUTCOMES) {
      const n = calls.count(outcome);
      if (n === 0) continue;
      lines.push(
        `${CALL_OUTCOME_LABEL[outcome].padEnd(13)}` +
          `${String(n).padStart(6)}` +
          `${((n / calls.total) * 100).toFixed(1).padStart(9)}%` +
          `${String(calls.ponCount(outcome)).padStart(8)}` +
          `${String(calls.chiOnlyCount(outcome)).padStart(7)}` +
          `${String(calls.yakuhaiCount(outcome)).padStart(9)}` +
          `${calls.averageShanten(outcome).toFixed(2).padStart(10)}`,
      );
    }
    /**
     * 구조적 거절(문턱에서 EV를 계산해 보지도 않고 끝난 것)과 EV의 판단을 나눠 본다.
     * 어느 쪽이 큰지가 "문턱을 봐야 하는가, 값매김을 봐야 하는가"를 가른다.
     */
    const gated =
      calls.total - calls.count("taken") - calls.count("lost_to_pass");
    if (calls.lostSamples > 0) {
      // EV로 진 것 중 얼마나가 '아슬아슬하게' 졌는가 — 동전 던지기의 비율
      lines.push(
        `EV로 진 ${calls.lostSamples}건 중 5% 이내 ` +
          `${(calls.narrowLossRate(0.05) * 100).toFixed(1)}% · ` +
          `10% 이내 ${(calls.narrowLossRate(0.1) * 100).toFixed(1)}%`,
      );
    }
    lines.push(
      `구조적 거절 ${((gated / calls.total) * 100).toFixed(1)}% · ` +
        `EV 판단 ${((calls.count("lost_to_pass") / calls.total) * 100).toFixed(1)}% · ` +
        `실행 ${((calls.count("taken") / calls.total) * 100).toFixed(1)}%`,
    );
  }
  return lines.join("\n");
}
