/**
 * 빌드 러너 — harness.runMatch 의 변형.
 *
 * 다른 점:
 *  1) `draftSchedules: []` — 드래프트를 끈다. 그래야 preset 으로 준 3~4개 **말고는**
 *     아무 증강도 안 붙어서, 대조군(preset 비움)과 1:1 비교가 성립한다.
 *  2) 카탈로그를 계측기로 감싸 증강별 발동 횟수를 센다.
 *  3) RoundSettled 를 뜯어 좌석별 화료 수·평균 타점·역·augPoints 를 모은다.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  handZone,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS, checkState } from "../../harness.js";
import type { Violation } from "../../harness.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
import type { ArchetypeName } from "../../../packages/server/src/bot/profile.js";
import { newMetrics, wrapCatalog } from "./instrument.js";
import type { Metrics } from "./instrument.js";
import { newMetrics as newBotMetrics, patchBot, wrapCatalog as wrapBot } from "../../bot/instrument.js";
import type { Metrics as BotMetrics } from "../../bot/instrument.js";

export interface WinRec {
  winner: PlayerId;
  from: PlayerId | null;
  han: number;
  fu: number;
  points: number;
  yakumanCount: number;
  yaku: string[];
  extraHanBy: { augId: string; han: number }[];
  doraHan: number;
  uraHan: number;
  redHan: number;
  limit: string | null;
}

export interface BuildReport {
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  actionsTaken: Record<string, number>;
  actionsBySeat: Record<string, Record<string, number>>;
  rounds: number;
  finalScores: Record<PlayerId, number>;
  wins: WinRec[];
  outcomes: Record<string, number>;
  augPoints: { augId: string; player: string; points: number }[];
  riichiBySeat: Record<string, number>;
  metrics: Metrics;
  botMetrics: BotMetrics;
  ms: number;
}

export interface BuildOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  /** 좌석 원형 (기본 전원 balanced — 좌석 간 성향 잡음을 없앤다) */
  seats?: Record<PlayerId, ArchetypeName>;
  presetHands?: Record<PlayerId, readonly string[]>;
  onRound?: (st: GameState, phase: "start" | "end") => void;
  /** 이벤트 원본을 그대로 받는다 (순서를 봐야 하는 검증용) */
  onEvent?: (e: { type?: string; payload?: Record<string, unknown> }) => void;
  timeoutMs?: number;
  /** 드래프트를 켤지 (기본 false) */
  drafts?: boolean;
}

export async function runBuild(o: BuildOpts): Promise<BuildReport> {
  const t0 = Date.now();
  const mode = o.mode ?? "tonpuu";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const m = newMetrics();
  const bm = newBotMetrics();
  const restoreBot = patchBot(bm);
  const catalog = wrapBot(bm, wrapCatalog(m, contentAugments));
  const agents = SEATS.map(
    (id, i) => new BotAgent(id, `bot-${id}`, o.seed * 131 + i * 7 + 1, catalog, 0, o.seats?.[id] ?? "balanced"),
  );
  const seen = { notes: [] as { label: string; amount: number }[], reasons: [] as { label: string; amount: number }[], drifts: [] as { delta: number; round: string; from: number; to: number }[] };
  let rounds = 0;
  const wins: WinRec[] = [];
  const outcomes: Record<string, number> = {};
  const augPoints: { augId: string; player: string; points: number }[] = [];
  const riichiBySeat: Record<string, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };

  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.drafts === true
      ? (mode === "tonpuu" ? ["gameStart", "eastThird", "eastFourth"] : ["gameStart", "eastThird", "southEntry", "southThird"])
      : [],
    extraAugments: catalog,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: any) => { rounds++; o.onRound?.(g.engine.state, "start"); },
    onRoundEnd: (g: any) => { o.onRound?.(g.engine.state, "end"); },
    onEvent: (j: string) => {
      try {
        const e = JSON.parse(j) as { type?: string; payload?: any };
        o.onEvent?.(e);
        if (e.type === "ScoreChanged") {
          const r = e.payload?.reason; const d = e.payload?.delta;
          if (typeof r === "string" && r !== "" && typeof d === "number") {
            seen.reasons.push({ label: `ScoreChanged(${r} ${d})`, amount: d });
          }
        } else if (e.type === "TileDiscarded") {
          if (e.payload?.riichi === true) {
            const p = String(e.payload?.player ?? "?");
            riichiBySeat[p] = (riichiBySeat[p] ?? 0) + 1;
          }
        } else if (e.type === "RoundSettled") {
          const p = e.payload ?? {};
          outcomes[String(p.outcome)] = (outcomes[String(p.outcome)] ?? 0) + 1;
          for (const w of (p.winInfos ?? []) as any[]) {
            wins.push({
              winner: w.winner, from: w.from ?? null, han: w.han ?? 0, fu: w.fu ?? 0,
              points: w.points ?? 0, yakumanCount: w.yakumanCount ?? 0,
              yaku: ((w.yaku ?? []) as any[]).map((y) => String(y.id)),
              extraHanBy: (w.extraHanBy ?? []) as { augId: string; han: number }[],
              doraHan: w.doraHan ?? 0, uraHan: w.uraHan ?? 0, redHan: w.redHan ?? 0,
              limit: w.limit ?? null,
            });
          }
          for (const n of (p.augPoints ?? []) as any[]) {
            augPoints.push({ augId: String(n.augId), player: String(n.player), points: Number(n.points ?? 0) });
            seen.notes.push({ label: `augPoint(${n.augId} ${n.player} ${n.points ?? 0})`, amount: n.points ?? 0 });
          }
        }
      } catch { /* ignore */ }
    },
    onEffectError: (f: any) => {
      const s = `${f?.event?.type ?? "?"}: ${String(f?.error ?? "")}`;
      if (effectErrors.length < 100) effectErrors.push(s);
    },
  } as never);

  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, violations, seen as never);
      // 액션 발동 계측: PersonaAgent 로그로 세지 못하는 것은 없다 (아래에서 합산)
    },
  } as never);

  const report: BuildReport = {
    seed: o.seed, mode, preset: o.preset, effectErrors, violations,
    actionsTaken: {}, actionsBySeat: {}, rounds: 0,
    finalScores: {} as Record<PlayerId, number>,
    wins, outcomes, augPoints, riichiBySeat, metrics: m, botMetrics: bm, ms: 0,
  };
  bm.onDecision = ({ bot, chosen, firedAug }): void => {
    const seat = String((bot as unknown as { id: string }).id);
    const t = String(chosen?.type ?? "?");
    report.actionsTaken[t] = (report.actionsTaken[t] ?? 0) + 1;
    const per = (report.actionsBySeat[seat] ??= {});
    per[t] = (per[t] ?? 0) + 1;
    if (firedAug !== null) {
      for (const c of [m.aug.get(firedAug), m.bySeat.get(`${seat}|${firedAug}`)]) if (c !== undefined) c.actionFired++;
    }
  };
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    report.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) report.finalScores[p.id] = p.score;
  report.rounds = rounds;
  restoreBot();
  report.ms = Date.now() - t0;
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export function handCount(st: GameState, seat: PlayerId): number {
  return st.zones[handZone(seat)]?.tileIds.length ?? 0;
}
