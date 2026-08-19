/**
 * score-b 러너 — 하네스의 runMatch를 복제하되 **엔진 이벤트 로그**까지 본다.
 * (harness.runMatch는 GameState만 준다 — 정산 payload(deltas/winInfos)를 볼 수 없다.)
 *
 * 추가 불변식은 전부 여기 checkSettle에 있다.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  countDora,
  doraKindFor,
  frontDoraKindFor,
  handIdsOf,
  kindKey,
  kindOf,
  meldInfosOf,
  meldsZone,
  uraIndicatorIds,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, checkState } from "../harness.js";
import type { Ledger, Persona, Violation } from "../harness.js";

export { PERSONAS, SEATS };
export type { Persona, Violation };

// ─────────────────────────────────────────────────────────── util (content 복제)

const roundKey = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
const armedAt = (s: GameState, id: string, h: PlayerId, key: string): boolean =>
  s.augmentData[`${id}:armedRound:${h}`] === key;
const counterOf = (s: GameState, k: string): number =>
  typeof s.augmentData[k] === "number" ? (s.augmentData[k] as number) : 0;

const has = (s: GameState, h: PlayerId, id: string): boolean =>
  s.players.find((p) => p.id === h)?.augments.includes(id) === true;

function asKinds(v: unknown): TileKind[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (k): k is TileKind =>
      typeof k === "object" && k !== null &&
      typeof (k as TileKind).suit === "string" &&
      typeof (k as TileKind).rank === "number",
  );
}

/** 화료손의 전체 종류 (손패 + 후로) — evaluate의 fullKinds와 동형 */
function fullKinds(st: GameState, w: PlayerId): TileKind[] {
  return [
    ...handIdsOf(st, w).map((t) => kindOf(st, t)),
    ...meldInfosOf(st, w).flatMap((m) => m.tiles),
  ];
}

/** 빼놓은 北 장수 (north_trader와 동형) */
function pulledNorth(st: GameState, h: PlayerId): number {
  const inMelds = new Set((st.round.byPlayer[h]?.melds ?? []).flatMap((m) => m.tileIds));
  return (st.zones[meldsZone(h)]?.tileIds ?? []).filter((id: TileId) => {
    if (inMelds.has(id)) return false;
    const k = kindOf(st, id);
    return k.suit === "wind" && k.rank === 4;
  }).length;
}

function ankanTiles(st: GameState, h: PlayerId): number {
  return meldInfosOf(st, h)
    .filter((m) => m.kind === "kan_closed")
    .reduce((n, m) => n + m.tiles.length, 0);
}

// ─────────────────────────────────────────────────────────── 정산 불변식

interface WinInfoLite {
  winner: PlayerId; from: PlayerId | null; winType: "tsumo" | "ron";
  han: number; fu: number; yakumanCount: number; extraHan: number;
  extraHanBy?: { augId: string; han: number }[];
  doraHan: number; uraHan: number; redHan: number; augDoraHan?: number;
  points: number; honbaBonus?: number; riichiPotGain?: number;
  yaku: { id: string; name: string; han: number }[];
  limit: string | null;
}
interface SettlePayload {
  outcome: "win" | "draw" | "abort";
  deltas: Record<PlayerId, number>;
  honba: number; riichiPot: number;
  winInfos?: WinInfoLite[];
  augPoints?: { augId: string; player: PlayerId; points: number }[];
}

/** 정산 이벤트 하나를, 그 정산 **직전** 상태 스냅샷과 함께 검사 */
export function checkSettle(
  st: GameState,           // 정산 시점(=국 끝) 상태. ⚠ round 식별자는 이미 **다음 국**의 것이다
  p: SettlePayload,
  preKey: string,          // 방금 끝난 국의 roundKey (onRoundStart에서 잡아 둔 값)
  add: (kind: string, detail: string, seat?: PlayerId) => void,
): void {
  // ── A. 제로섬: Σdeltas = Σ회수한 공탁 (sign_flip 보유자가 무장 중이면 뱅크 발행 허용)
  const sum = Object.values(p.deltas).reduce((a, b) => a + b, 0);
  const potGain = (p.winInfos ?? []).reduce((n, w) => n + (w.riichiPotGain ?? 0), 0);
  /*
   * 뱅크 발행은 **근거가 있어야** 한다. sign_flip은 자기가 발행한 액수를 augPoints에
   * 정확히 적는다(-before*2). 그래서 "Σdeltas − 공탁회수 − sign_flip 발행액" 은 0이어야
   * 한다 — 남으면 아무도 서명하지 않은 점수가 생기거나 사라진 것이다.
   */
  const signFlipBank = (p.augPoints ?? [])
    .filter((n) => n.augId === "sign_flip")
    .reduce((n, x) => n + x.points, 0);
  const armedFlippers = st.players
    .filter((pl) => has(st, pl.id, "sign_flip") && armedAt(st, "sign_flip", pl.id, preKey))
    .map((pl) => pl.id);
  if (sum - potGain - signFlipBank !== 0) {
    add("SETTLE_NOT_ZEROSUM",
      `잔차=${sum - potGain - signFlipBank} Σdeltas=${sum} potGain=${potGain} signFlipBank=${signFlipBank} ` +
      `armed=[${armedFlippers.join(",")}] outcome=${p.outcome} deltas=${JSON.stringify(p.deltas)} ` +
      `augPoints=${JSON.stringify(p.augPoints ?? [])} ` +
      `augs=${st.players.map((x) => `${x.id}:${x.augments.join("+")}`).join(" ")}`);
  }

  // ── V. 공개 뷰 채널이 실제 상태와 맞는가 (전원 공개 약속)
  for (const pl of st.players) {
    const h = pl.id;
    if (has(st, h, "mirror_dora")) {
      const want = st.round.doraIndicators.map((t) => kindKey(frontDoraKindFor(kindOf(st, t))));
      const got = st.augmentData[`view:*:mirror_dora:${h}#round`];
      if (want.length > 0 && JSON.stringify(got) !== JSON.stringify(want)) {
        add("VIEW_DESYNC_MIRROR", `${h} 채널=${JSON.stringify(got)} 실제앞도라=${JSON.stringify(want)}`, h);
      }
    }
    if (has(st, h, "north_trader")) {
      const want = pulledNorth(st, h);
      const got = st.augmentData[`view:*:north_trader:${h}#round`] ?? 0;
      if (got !== want) add("VIEW_DESYNC_NORTH", `${h} 채널=${String(got)} 실제=${want}`, h);
    }
    if (has(st, h, "karma")) {
      const g = counterOf(st, `karma:gauge:${h}`);
      const got = st.augmentData[`view:*:karma:${h}`] ?? 0;
      if (got !== g) add("VIEW_DESYNC_KARMA", `${h} 채널=${String(got)} 게이지=${g}`, h);
      if (g % 100 !== 0) add("KARMA_GAUGE_GRID", `${h} 게이지=${g} (100 배수가 아니다)`, h);
      if (g < 0) add("KARMA_GAUGE_NEG", `${h} 게이지=${g}`, h);
    }
    if (has(st, h, "honba_hunter")) {
      const v = st.augmentData[`view:*:honba_hunter:${h}#round`] as { honba?: number; value?: number } | undefined;
      const honba = Number(preKey.split("-")[2] ?? 0);
      if (v !== undefined && v.honba !== honba) {
        add("VIEW_DESYNC_HONBA", `${h} 채널본장=${String(v.honba)} 실제본장=${honba} value=${String(v.value)}`, h);
      }
    }
  }

  if (p.outcome !== "win") return;

  for (const w of p.winInfos ?? []) {
    const seat = w.winner;

    // ── B. 도라 판 기대값 vs 실제
    const kinds = fullKinds(st, seat);
    const stdDora = st.round.doraIndicators.map((t) => doraKindFor(kindOf(st, t)));
    const extra: TileKind[] = [];
    if (has(st, seat, "mirror_dora")) {
      extra.push(...st.round.doraIndicators.map((t) => frontDoraKindFor(kindOf(st, t))));
    }
    if (has(st, seat, "dora_afterimage")) {
      extra.push(...asKinds(st.augmentData[`dora_afterimage:recalled:${preKey}:${seat}`]));
    }
    const expectDora = countDora(kinds, [...stdDora, ...extra]);

    const uraIds = uraIndicatorIds(st);
    const stdUra = uraIds.map((t) => doraKindFor(kindOf(st, t)));
    const extraUra: TileKind[] = has(st, seat, "mirror_dora")
      ? uraIds.map((t) => frontDoraKindFor(kindOf(st, t)))
      : [];
    const isRiichi = st.round.byPlayer[seat]?.riichi != null;
    const fromRiichi =
      w.winType === "ron" && w.from !== null && st.round.byPlayer[w.from]?.riichi != null;
    const countsUra =
      isRiichi || (has(st, seat, "soul_hunt") && w.winType === "ron" && fromRiichi);
    const expectUra = countsUra ? countDora(kinds, [...stdUra, ...extraUra]) : 0;

    // 역만이면 엔진이 도라를 세지 않는다
    if (w.yakumanCount === 0) {
      if (w.doraHan !== expectDora) {
        add("DORA_HAN_MISMATCH",
          `winner=${seat} doraHan=${w.doraHan} expect=${expectDora} ` +
          `ind=[${st.round.doraIndicators.map((t) => kindKey(kindOf(st, t))).join(",")}] ` +
          `extra=[${extra.map(kindKey).join(",")}] yaku=${w.yaku.map((y) => y.id).join("|")}`,
          seat);
      }
      if (w.uraHan !== expectUra) {
        add("URA_HAN_MISMATCH",
          `winner=${seat} uraHan=${w.uraHan} expect=${expectUra} riichi=${isRiichi} ` +
          `soul_hunt=${has(st, seat, "soul_hunt")} fromRiichi=${fromRiichi}`,
          seat);
      }
      // ── C. extraHan (ankan_dora / north_trader) 기대값
      let expectExtra = 0;
      if (has(st, seat, "ankan_dora")) expectExtra += ankanTiles(st, seat);
      if (has(st, seat, "north_trader")) expectExtra += pulledNorth(st, seat);
      const otherExtra = (w.extraHanBy ?? [])
        .filter((e) => e.augId !== "ankan_dora" && e.augId !== "north_trader")
        .reduce((n, e) => n + e.han, 0);
      if (w.extraHan - otherExtra !== expectExtra) {
        add("EXTRA_HAN_MISMATCH",
          `winner=${seat} extraHan=${w.extraHan} other=${otherExtra} expectMine=${expectExtra} ` +
          `by=${JSON.stringify(w.extraHanBy ?? [])}`, seat);
      }
      // 판 합산 정합성
      const yakuHan = w.yaku.reduce((n, y) => n + y.han, 0);
      if (w.han !== yakuHan + w.doraHan + w.uraHan + w.redHan + w.extraHan) {
        add("HAN_SUM_MISMATCH",
          `han=${w.han} yaku=${yakuHan} dora=${w.doraHan} ura=${w.uraHan} red=${w.redHan} extra=${w.extraHan}`, seat);
      }
    }

    // ── D. honba_hunter 단가
    if (w.honbaBonus !== undefined) {
      const per = has(st, seat, "honba_hunter") ? 1500 : 300;
      // ⚠ payload.honba는 **다음 국**의 본장이다. 이 국의 본장은 preKey에서 읽는다.
      const honba = Number(preKey.split("-")[2] ?? 0);
      if (w.honbaBonus !== honba * per) {
        add("HONBA_BONUS_MISMATCH",
          `winner=${seat} honba=${honba} bonus=${w.honbaBonus} expect=${honba * per} per=${per}`, seat);
      }
    }

    // ── E. blame_shift: 화료자의 론 지불이 3분할됐는가 + 화료자 수령 불변
    if (has(st, seat, "blame_shift") && w.winType === "ron" && w.from !== null) {
      const winners = new Set((p.winInfos ?? []).map((x) => x.winner));
      const losers = st.players.map((x) => x.id).filter((id) => !winners.has(id));
      const paid = losers.map((id) => -(p.deltas[id] ?? 0));
      const lo = Math.min(...paid), hi = Math.max(...paid);
      if (paid.some((v) => v < 0)) {
        add("BLAME_SHIFT_NEG", `losers pay=${JSON.stringify(paid)} (음수 = 오히려 받는다)`, seat);
      }
      if (hi - lo > 200) {
        add("BLAME_SHIFT_UNEVEN",
          `losers=${losers.join(",")} pay=${JSON.stringify(paid)} spread=${hi - lo}`, seat);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────── 러너

export interface RunOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  onRound?: (st: GameState, phase: "start" | "end") => void;
  onSettle?: (st: GameState, p: SettlePayload) => void;
  startScore?: number;
  /** 드래프트를 끄고 preset 증강만으로 돌린다 — 내 10종만 남기는 진짜 pure 모드 */
  noDraft?: boolean;
  timeoutMs?: number;
}

export interface Report {
  seed: number;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  rounds: number;
  settles: number;
  finalScores: Record<PlayerId, number>;
  actionsTaken: Record<string, number>;
  ended?: string;
}

export async function runMatch(o: RunOpts): Promise<Report> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: Ledger = { notes: [], reasons: [], drifts: [] };
  let rounds = 0;
  let settles = 0;
  let logSeen = 0;
  let preKey = "";

  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.noDraft === true
      ? []
      : mode === "tonpuu"
        ? ["eastFirst", "eastThird", "eastFourth"]
        : ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments,
    ...(o.startScore !== undefined ? { startScore: o.startScore } : {}),
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { state: GameState } }) => {
      rounds++;
      preKey = roundKey(g.engine.state);
      o.onRound?.(g.engine.state, "start");
    },
    onRoundEnd: (g: { engine: { state: GameState; eventLog: readonly { type: string; payload: unknown }[] } }) => {
      const st = g.engine.state;
      const log = g.engine.eventLog;
      const add = (kind: string, detail: string, seat?: PlayerId): void => {
        if (violations.length < 400) {
          violations.push(seat === undefined
            ? { kind, detail, round: preKey }
            : { kind, detail, round: preKey, seat });
        }
      };
      for (let i = logSeen; i < log.length; i++) {
        const e = log[i]!;
        if (e.type !== "RoundSettled") continue;
        settles++;
        const p = e.payload as SettlePayload;
        try {
          checkSettle(st, p, preKey, add);
        } catch (err) {
          add("CHECK_THREW", String(err));
        }
        o.onSettle?.(st, p);
      }
      logSeen = log.length;
      o.onRound?.(st, "end");
    },
    onEvent: (j: string) => {
      try {
        const e = JSON.parse(j) as { type?: string; payload?: Record<string, unknown> };
        if (e.type === "ScoreChanged") {
          const r = e.payload?.["reason"];
          if (typeof r === "string" && r !== "") {
            const d = Number(e.payload?.["delta"] ?? 0);
            seen.reasons.push({ label: `ScoreChanged(${r} ${d})`, amount: d });
          }
        } else if (e.type === "RoundSettled") {
          const notes = e.payload?.["augPoints"] as { player?: string; augId?: string; points?: number }[] | undefined;
          for (const n of notes ?? []) {
            seen.notes.push({ label: `augPoint(${n.augId} ${n.player} ${n.points ?? 0})`, amount: n.points ?? 0 });
          }
        }
      } catch { /* ignore */ }
    },
    onEffectError: (f: unknown) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? JSON.stringify(f))}`;
      if (effectErrors.length < 100) effectErrors.push(s);
    },
  } as never);

  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, violations, seen);
    },
  });

  const report: Report = {
    seed: o.seed, effectErrors, violations, rounds: 0, settles: 0,
    finalScores: {} as Record<PlayerId, number>, actionsTaken: {},
  };
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    report.crash = e instanceof Error
      ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}`
      : String(e);
  }
  {
    const pool = [...seen.notes, ...seen.reasons];
    const used = new Set<number>();
    for (const d of seen.drifts) {
      let hit = -1;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        if (pool[i]!.amount === d.delta) { hit = i; break; }
      }
      if (hit >= 0) {
        used.add(hit);
        violations.push({ kind: "SCORE_DRIFT_ATTRIBUTED", round: d.round, detail: `${d.from} -> ${d.to} (${d.delta >= 0 ? "+" : ""}${d.delta}) — ${pool[hit]!.label}` });
      } else {
        violations.push({ kind: "SCORE_DRIFT_UNEXPLAINED", round: d.round, detail: `${d.from} -> ${d.to} (${d.delta >= 0 ? "+" : ""}${d.delta}) — 같은 금액의 근거 없음. 후보: ${pool.map((x) => x.label).slice(-8).join(", ")}` });
      }
    }
  }
  const st = ctrl.gameState;
  if (st !== null) for (const pl of st.players) report.finalScores[pl.id] = pl.score;
  report.rounds = rounds;
  report.settles = settles;
  for (const a of agents) for (const t of a.actionLog) report.actionsTaken[t] = (report.actionsTaken[t] ?? 0) + 1;
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/** 검사 이름 → 몇 번 났는가 */
export function tally(vs: readonly Violation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vs) out[v.kind] = (out[v.kind] ?? 0) + 1;
  return out;
}

export const MINE = [
  "karma", "ankan_dora", "honba_hunter", "unification", "soul_hunt",
  "blame_shift", "north_trader", "mirror_dora", "dora_afterimage", "sign_flip",
] as const;
