/**
 * round2 / bot — 실제 BotAgent로 판을 돌리며 "명백히 틀린 판단"을 자동 검출한다.
 *
 *   tsx qa-lab/round2/bot/probe.ts <games> <seed> <mode> [--aug] [out.json]
 *
 * 검사 (전부 봇 자신의 뷰 + 코어 계산으로 독립 판정):
 *  V1 제시되지 않은 옵션 선택          (엔진이 거절 → 국 사망)
 *  V2 리치 후 손패 변경 (쯔모기리 위반)
 *  V3 텐파이인데 자기 오름패를 버림 (스스로 후리텐, 안전한 대안이 있었음)
 *  V4 방총: 상대 리치에 현물이 손에 있었는데 밀어서 쏨 (샹텐별)
 *  V5 화료 옵션을 두고 다른 것을 고름
 *  V6 decideSafely 폴백(정책 예외) / 결정 예외
 *  V7 결정 지연 이상치 (ms)
 *  V8 같은 프롬프트에 같은 답을 반복 (무응답/루프 징후)
 */
import {
  HanchanController,
  ROUND_STARTED,
  standardAugments,
  handZone,
  kindKey,
  winningKinds,
  shantenOf,
  isWinningShape,
} from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId, TileKind } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
import { writeFileSync } from "node:fs";

const games = Number(process.argv[2] ?? 20);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "tonpuu") as GameMode;
const useAug = process.argv.includes("--aug");
const out = process.argv.find((a) => a.endsWith(".json"));

const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];

function gameSeed(s: number, i: number): number {
  let h = (s ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

interface Violation {
  kind: string;
  game: number;
  bot: string;
  detail: Record<string, unknown>;
}

const violations: Violation[] = [];
const push = (v: Violation): void => {
  if (violations.length < 4000) violations.push(v);
};
const counts = new Map<string, number>();
const bump = (k: string, n = 1): void => counts.set(k, (counts.get(k) ?? 0) + n);

// 타이밍
let decisions = 0;
let totalMs = 0;
let maxMs = 0;
const slow: { ms: number; type: string; game: number; opts: number }[] = [];
const msByGame: number[] = [];

// 방총 추적: 마지막 버림 스냅샷 (플레이어별)
interface DiscardSnap {
  game: number;
  kind: string;
  tileId: number;
  shanten: number;
  tenpai: boolean;
  riichi: boolean;
  /** 상대별 현물(그 상대의 바닥에 있는 종류) 중 내 손에 있던 것 */
  genbutsuVs: Record<string, string[]>;
  /** 상대별 리치 여부 */
  riichiOpp: string[];
  optionKinds: string[];
}
let lastDiscard: Record<string, DiscardSnap | undefined> = {};

let currentGame = 0;
const proto = BotAgent.prototype as unknown as {
  decide: (p: unknown) => Promise<unknown>;
};
const origDecide = proto.decide;

// decideSafely 폴백 카운트 — logContentFailure는 console.error로 나온다
const origErr = console.error;
console.error = (...args: unknown[]): void => {
  const s = args.map(String).join(" ");
  if (/증강 코드 실패 \(decide\)/.test(s)) {
    bump("V6_decideFallback");
    push({ kind: "V6_decideFallback", game: currentGame, bot: "?", detail: { s: s.slice(0, 300) } });
    return;
  }
  if (/증강 코드 실패/.test(s)) {
    bump("V6_contentFailure");
    push({ kind: "V6_contentFailure", game: currentGame, bot: "?", detail: { s: s.slice(0, 300) } });
    return;
  }
  origErr(...args);
};
const origWarn = console.warn;
console.warn = (...args: unknown[]): void => {
  const s = args.map(String).join(" ");
  if (/정책이 제시되지 않은 옵션/.test(s)) {
    bump("V1b_unofferedPolicyOption");
    push({ kind: "V1b_unofferedPolicyOption", game: currentGame, bot: "?", detail: { s: s.slice(0, 300) } });
    return;
  }
  origWarn(...args);
};

/** 뷰에서 내 감춰진 손패 kind 목록 */
function handKinds(view: any, me: string): TileKind[] {
  const z = view.zones[handZone(me)];
  if (z === undefined) return [];
  return (z.tileIds as number[])
    .map((id) => view.tiles[id]?.kind)
    .filter((k: unknown): k is TileKind => k !== undefined);
}

/** 상대 바닥의 kindKey 집합 (그 상대에게 절대 안전 = 후리텐) */
function discardKeysOf(view: any, p: string): Set<string> {
  const z = view.zones[`discards:${p}`];
  const out = new Set<string>();
  if (z === undefined) return out;
  for (const id of z.tileIds as number[]) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.add(kindKey(k));
  }
  return out;
}

const repeatWindow = new Map<string, { key: string; n: number }>();

proto.decide = async function (prompt: any): Promise<unknown> {
  const t0 = performance.now();
  let chosen: any;
  try {
    chosen = await origDecide.call(this, prompt);
  } catch (err: any) {
    bump("V6_decideThrew");
    push({
      kind: "V6_decideThrew",
      game: currentGame,
      bot: this.id,
      detail: { msg: String(err?.message ?? err) },
    });
    throw err;
  }
  const ms = performance.now() - t0;
  decisions++;
  totalMs += ms;
  if (ms > maxMs) maxMs = ms;
  if (ms > 150 && slow.length < 200) {
    slow.push({ ms: Math.round(ms), type: String(chosen?.type), game: currentGame, opts: prompt.options.length });
  }

  const view = this.lastView;
  const me: string = this.id;
  if (view === null || view === undefined) return chosen;

  // ── V1: 제시되지 않은 옵션 ──
  if (!prompt.options.includes(chosen)) {
    const same = prompt.options.some(
      (o: any) => o.type === chosen.type && JSON.stringify(o.payload) === JSON.stringify(chosen.payload),
    );
    if (!same) {
      bump("V1_notOffered");
      push({
        kind: "V1_notOffered",
        game: currentGame,
        bot: me,
        detail: { chosen: JSON.stringify(chosen).slice(0, 200), offered: prompt.options.map((o: any) => o.type) },
      });
    }
  }

  // ── V8: 같은 프롬프트에 같은 답 반복 ──
  const pkey = `${me}|${prompt.options.map((o: any) => o.type).join(",")}|${view.round.turnCount}|${view.round.roundNumber}|${view.round.honba}`;
  const prev = repeatWindow.get(me);
  if (prev !== undefined && prev.key === pkey) {
    prev.n++;
    if (prev.n === 12) {
      bump("V8_repeatLoop");
      push({ kind: "V8_repeatLoop", game: currentGame, bot: me, detail: { pkey, chosen: String(chosen?.type) } });
    }
  } else repeatWindow.set(me, { key: pkey, n: 1 });

  const myRound = view.round.byPlayer[me] ?? {};
  const riichi = myRound.riichiDeclared === true;

  // ── V5: 화료를 두고 다른 것을 고름 ──
  const winOpt = prompt.options.find((o: any) => o.type === "win");
  if (winOpt !== undefined && chosen?.type !== "win") {
    bump("V5_passedWin");
    push({
      kind: "V5_passedWin",
      game: currentGame,
      bot: me,
      detail: { chosen: String(chosen?.type), aug: view.players.find((p: any) => p.id === me)?.augments },
    });
  }

  // ── V9: 후리텐 리치 (선언패 자신이 대기에 들어 있다) ──
  if (chosen?.type === "riichi") {
    const tid = Number((chosen.payload as any)?.tileId);
    const k = view.tiles[tid]?.kind;
    const mc = myRound.meldCount ?? 0;
    if (k !== undefined) {
      const rest = handKinds(view, me);
      const j = rest.findIndex((x) => kindKey(x) === kindKey(k));
      if (j >= 0) rest.splice(j, 1);
      if (rest.length === 13 - 3 * mc) {
        const w = winningKinds(rest, mc, undefined, view.scoringOptions).map(kindKey);
        const pond = discardKeysOf(view, me);
        const selfMade = w.includes(kindKey(k)) && !pond.has(kindKey(k));
        if (selfMade) {
          bump("V9_furitenRiichi");
          push({
            kind: "V9_furitenRiichi",
            game: currentGame,
            bot: me,
            detail: {
              declared: kindKey(k),
              waits: w,
              turn: view.round.turnCount,
              hand: handKinds(view, me).map(kindKey),
            },
          });
        }
      }
    }
  }

  if (chosen?.type !== "discard") return chosen;

  const tileId = Number((chosen.payload as any)?.tileId);
  const kinds = handKinds(view, me);
  const chosenKind = view.tiles[tileId]?.kind;
  if (chosenKind === undefined) return chosen;

  // ── V2: 리치 후 쯔모기리 위반 ──
  if (riichi && view.round.myDrawnTile !== null && view.round.myDrawnTile !== undefined) {
    if (tileId !== view.round.myDrawnTile) {
      bump("V2_riichiHandChange");
      push({
        kind: "V2_riichiHandChange",
        game: currentGame,
        bot: me,
        detail: { tileId, drawn: view.round.myDrawnTile, offered: prompt.options.filter((o: any) => o.type === "discard").length },
      });
    }
  }

  // ── V3: 텐파이인데 자기 오름패를 버림 ──
  const meldCount = myRound.meldCount ?? 0;
  const opts = view.scoringOptions;
  // 이 패를 버린 뒤의 13장으로 대기를 낸다 = 버린 후 텐파이이면서 그 패가 대기에 든다
  const after = [...kinds];
  const idx = after.indexOf(chosenKind);
  if (idx >= 0) after.splice(idx, 1);
  // 값싼 선행 검사: 버린 그 패로 화료 형태가 되는가 (isWinningShape 1회)
  const selfWait = !riichi && after.length === 13 - 3 * meldCount && isWinningShape([...after, chosenKind], meldCount, opts);
  if (selfWait) {
    const waitsAfter = winningKinds(after, meldCount, undefined, opts);
    if (waitsAfter.length > 0) {
      const wkeys = new Set(waitsAfter.map(kindKey));
      if (wkeys.has(kindKey(chosenKind))) {
        bump("V3b_selfFuritenAnyTenpai");
        // 대안: 버려도 텐파이가 유지되고 자기 대기가 아닌 후보가 있었는가
        const alts: string[] = [];
        for (const o of prompt.options as any[]) {
          if (o.type !== "discard") continue;
          const id2 = Number(o.payload?.tileId);
          const k2 = view.tiles[id2]?.kind;
          if (k2 === undefined || kindKey(k2) === kindKey(chosenKind)) continue;
          const a2 = [...kinds];
          const j = a2.indexOf(k2);
          if (j < 0) continue;
          a2.splice(j, 1);
          const w2 = winningKinds(a2, meldCount, undefined, opts);
          if (w2.length === 0) continue;
          if (!new Set(w2.map(kindKey)).has(kindKey(k2))) alts.push(kindKey(k2));
        }
        if (alts.length > 0) {
          bump("V3_selfFuriten");
          push({
            kind: "V3_selfFuriten",
            game: currentGame,
            bot: me,
            detail: {
              discarded: kindKey(chosenKind),
              waits: waitsAfter.map(kindKey),
              safeAlternatives: alts.slice(0, 6),
              turn: view.round.turnCount,
              hand: kinds.map(kindKey),
            },
          });
        }
      }
    }
  }

  // ── V4 준비: 버림 스냅샷 ──
  const genbutsuVs: Record<string, string[]> = {};
  const riichiOpp: string[] = [];
  for (const p of view.players as any[]) {
    if (p.id === me) continue;
    const pr = view.round.byPlayer[p.id];
    if (pr?.riichiDeclared !== true) continue;
    riichiOpp.push(p.id);
    const safe = discardKeysOf(view, p.id);
    const held = [...new Set(kinds.map(kindKey))].filter((k) => safe.has(k));
    genbutsuVs[p.id] = held;
  }
  let sh = 99;
  if (riichiOpp.length > 0) {
    try {
      sh = shantenOf(after, meldCount, opts);
    } catch {
      sh = 99;
    }
  }
  lastDiscard[me] = {
    game: currentGame,
    kind: kindKey(chosenKind),
    tileId,
    shanten: sh,
    tenpai: sh === 0,
    riichi,
    genbutsuVs,
    riichiOpp,
    optionKinds: (prompt.options as any[])
      .filter((o) => o.type === "discard")
      .map((o) => kindKey(view.tiles[Number(o.payload?.tileId)]?.kind ?? ({} as TileKind)))
      .filter((k) => k !== "undefined"),
  };
  return chosen;
};

// ─────────────────────────── 실행 ───────────────────────────

let rounds = 0;
let crash: string | null = null;
const augCatalog = useAug ? contentAugments : [];
const botCatalog = useAug ? [...standardAugments, ...contentAugments] : undefined;
const started = Date.now();

for (let g = 0; g < games; g++) {
  currentGame = g;
  lastDiscard = {};
  const gs = gameSeed(seed, g);
  const bots = SEATS.map((id, i) => {
    const b = new BotAgent(id, `Bot_${id}`, gs + i, botCatalog);
    b.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
    return b;
  });
  const gameStart = Date.now();
  const controller = new HanchanController(
    bots,
    {
      ...hanchanConfigForMode(mode),
      ...(useAug ? { extraAugments: augCatalog } : { draftSchedules: [], extraAugments: [] }),
      seed: gs,
    },
    {
      onEvent: (json: string) => {
        const ev = JSON.parse(json) as { type: string; payload?: any };
        if (ev.type === ROUND_STARTED) rounds++;
        if (ev.type === "WinDeclared") {
          const p = ev.payload;
          if (p?.from !== null && p?.from !== undefined) {
            const snap = lastDiscard[p.from];
            bump("dealIns");
            if (snap !== undefined) {
              const held = snap.genbutsuVs[p.winner] ?? [];
              if (snap.riichiOpp.includes(p.winner) && held.length > 0) {
                bump("V4_pushDealIn");
                if (snap.shanten >= 2) {
                  bump("V4_pushDealIn_far");
                  push({
                    kind: "V4_pushDealIn_far",
                    game: currentGame,
                    bot: String(p.from),
                    detail: {
                      discarded: snap.kind,
                      shantenAfter: snap.shanten,
                      genbutsuHeld: held,
                      winner: p.winner,
                    },
                  });
                }
              }
            }
          }
        }
      },
    },
  );
  let timer: any;
  try {
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error("SOFTLOCK: 게임이 600초를 넘겼다")), 600_000);
    });
    await Promise.race([controller.run(), timeout]);
    clearTimeout(timer);
  } catch (err: any) {
    clearTimeout(timer);
    crash = `game ${g}: ${String(err?.stack ?? err).slice(0, 1500)}`;
    bump("crash");
    push({ kind: "CRASH", game: g, bot: "-", detail: { msg: String(err?.message ?? err) } });
    break;
  }
  msByGame.push(Date.now() - gameStart);
  process.stderr.write(
    `[g${g}] ${Date.now() - gameStart}ms rounds=${rounds} dec=${decisions} ` +
      `V3=${counts.get("V3_selfFuriten") ?? 0}/${counts.get("V3b_selfFuritenAnyTenpai") ?? 0} V9=${counts.get("V9_furitenRiichi") ?? 0} V4far=${counts.get("V4_pushDealIn_far") ?? 0} ` +
      `V1=${counts.get("V1_notOffered") ?? 0} V2=${counts.get("V2_riichiHandChange") ?? 0} ` +
      `V5=${counts.get("V5_passedWin") ?? 0} V6=${(counts.get("V6_decideFallback") ?? 0) + (counts.get("V6_decideThrew") ?? 0)}\n`,
  );
  if (out !== undefined && g % 10 === 9) {
    writeFileSync(out, JSON.stringify({ partial: true, g, counts: [...counts], violations }, null, 1));
  }
}

console.error = origErr;
console.warn = origWarn;
proto.decide = origDecide;

const summary = {
  games,
  seed,
  mode,
  aug: useAug,
  rounds,
  decisions,
  crash,
  elapsedSec: ((Date.now() - started) / 1000).toFixed(1),
  avgDecisionMs: +(totalMs / Math.max(1, decisions)).toFixed(3),
  maxDecisionMs: +maxMs.toFixed(1),
  counts: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])),
  slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 10),
  gameMsFirst5: msByGame.slice(0, 5),
  gameMsLast5: msByGame.slice(-5),
};
console.log(JSON.stringify(summary, null, 1));
if (out !== undefined) {
  writeFileSync(out, JSON.stringify({ summary, violations }, null, 1));
  console.log(`\n→ ${out} (violations ${violations.length})`);
}
