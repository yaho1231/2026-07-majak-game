/**
 * studyCli — 리플레이에서 **사람의 선택 분포**와 **그림자 봇의 일치율**을 뽑는다.
 *
 *   node --import tsx/esm packages/server/src/study/studyCli.ts \
 *     --dir ~/majak/replays [--limit N] [--workers 6] [--flags a,b] [--who human|bot] \
 *     --out study.json
 *
 * 무엇을 세는가는 docs/57 §2-2·§2-3. 결과 JSON은 `studyReport.ts`가 표로 옮긴다.
 *
 * 병렬: 파일 목록을 `--workers`개 조각으로 나눠 자식 프로세스(같은 스크립트,
 * `--shard i/N`)가 각자 세고, 부모가 합친다. 되감기는 판당 0.3~1초라 1,200판이면
 * 한 프로세스로 15분, 6개면 3분쯤이다.
 */

import { fork } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentAugments } from "@majak/content";
import { kindKey } from "@majak/core";
import type { ActionOption, PlayerId, PlayerView, TileKind } from "@majak/core";
import { BotAgent } from "../BotAgent.js";
import { buildRead } from "../bot/read.js";
import type { BotRead } from "../bot/read.js";
import { profileOf } from "../bot/profile.js";
import { parseFlags } from "../bot/flags.js";
import { isStandardType, walkReplay } from "./replayWalk.js";
import type { DecisionPoint } from "./replayWalk.js";
import {
  Tally,
  bucketPoints,
  bucketShanten,
  bucketThreat,
  bucketTurn,
  bucketWait,
} from "./tally.js";
import type { Cell } from "./tally.js";

// ─────────────────────────── 인자 ───────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DIR = arg("dir") ?? join(process.env["HOME"] ?? "", "majak", "replays");
const LIMIT = Number(arg("limit") ?? 0);
const WORKERS = Number(arg("workers") ?? 6);
const FLAGS = arg("flags") ?? "";
const WHO = (arg("who") ?? "human") as "human" | "bot";
const OUT = arg("out") ?? "study.json";
const SHARD = arg("shard"); // "i/N"

// ─────────────────────────── 사람 계층 ───────────────────────────

interface PlayerStat {
  games: number;
  placementSum: number;
}
function loadTiers(): Map<string, string> {
  const tiers = new Map<string, string>();
  try {
    const raw = JSON.parse(readFileSync(join(DIR, "stats.json"), "utf-8")) as {
      players: Record<string, PlayerStat>;
    };
    for (const [nick, s] of Object.entries(raw.players)) {
      if (s.games === undefined || s.games < 5) {
        tiers.set(nick, "few");
        continue;
      }
      const avg = s.placementSum / s.games;
      tiers.set(nick, s.games >= 10 && avg <= 2.4 ? "top" : avg <= 2.6 ? "mid" : "low");
    }
  } catch {
    /* 없으면 전부 unknown */
  }
  return tiers;
}

// ─────────────────────────── 집계 ───────────────────────────

interface Study {
  files: number;
  failed: number;
  points: number;
  riichi: Record<string, Cell>; // P(리치|가능) 사람
  riichiBot: Record<string, Cell>; // 같은 자리 그림자 봇
  call: Record<string, Cell>;
  callBot: Record<string, Cell>;
  callKind: Record<string, Cell>; // 사람이 실제로 운 종류(pon/chi/minkan) 분포
  defense: Record<string, Cell>; // 위협 시 사람의 버림 안전도 (k=현물, sum=safety)
  defenseBot: Record<string, Cell>;
  discardAgree: Record<string, Cell>; // 버림 일치 (k=같은 종류)
  discardConf: Record<string, Cell>; // 불일치 교차표 human×bot 종류
  discardLoss: Record<string, Cell>; // 사람 버림의 기대실점 - 봇 버림의 기대실점 (sum)
  augUse: Record<string, Cell>; // 옵션 타입별 P(발동|제시)
  augUseBot: Record<string, Cell>;
  augTurn: Record<string, Cell>; // 발동 순목 분포 (key=type|turnBucket)
  augOwner: Record<string, string[]>; // 옵션 타입 → 후보 증강 (교집합)
  draft: Record<string, Cell>; // 증강별 P(픽|제시) 사람
  draftBot: Record<string, Cell>; // 같은 오퍼에서 봇의 픽
  draftAgree: Record<string, Cell>;
  agreeNick: Record<string, Cell>; // 사람별 턴 일치율 (이상치 탐지)
  outcome: Record<string, Cell>; // 국 결과: key=tier|riichi/call/quiet → k=화료, sum=delta
  dealIn: Record<string, Cell>; // 방총 당한 패 종류 분포 (사람 방총자 기준) key=class
  kanUse: Record<string, Cell>;
  agree: Record<string, Cell>; // 전체 일치율 by kind
  timeMs: number;
}

function newStudy(): Study {
  return {
    files: 0, failed: 0, points: 0,
    riichi: {}, riichiBot: {}, call: {}, callBot: {}, callKind: {}, defense: {}, defenseBot: {},
    discardAgree: {}, discardConf: {}, discardLoss: {}, augUse: {}, augUseBot: {}, augTurn: {}, augOwner: {},
    draft: {}, draftBot: {}, draftAgree: {}, outcome: {}, dealIn: {}, kanUse: {}, agree: {}, agreeNick: {}, timeMs: 0,
  };
}

class Acc {
  riichi = new Tally(); riichiBot = new Tally();
  call = new Tally(); callBot = new Tally(); callKind = new Tally();
  defense = new Tally(); defenseBot = new Tally();
  discardAgree = new Tally(); discardConf = new Tally(); discardLoss = new Tally();
  augUse = new Tally(); augUseBot = new Tally(); augTurn = new Tally();
  augOwner = new Map<string, Set<string>>();
  draft = new Tally(); draftBot = new Tally(); draftAgree = new Tally();
  outcome = new Tally(); dealIn = new Tally(); kanUse = new Tally(); agree = new Tally(); agreeNick = new Tally();
  files = 0; failed = 0; points = 0;

  toStudy(ms: number): Study {
    const s = newStudy();
    s.files = this.files; s.failed = this.failed; s.points = this.points; s.timeMs = ms;
    for (const k of TALLY_KEYS) (s as unknown as Record<string, unknown>)[k] = (this[k] as Tally).toJSON();
    s.augOwner = Object.fromEntries([...this.augOwner].map(([t, set]) => [t, [...set]]));
    return s;
  }
}
const TALLY_KEYS = [
  "riichi", "riichiBot", "call", "callBot", "callKind", "defense", "defenseBot", "discardAgree",
  "discardConf", "discardLoss", "augUse", "augUseBot", "augTurn", "draft", "draftBot", "draftAgree",
  "outcome", "dealIn", "kanUse", "agree", "agreeNick",
] as const;

function mergeStudy(into: Acc, s: Study): void {
  into.files += s.files; into.failed += s.failed; into.points += s.points;
  for (const k of TALLY_KEYS) (into[k] as Tally).merge(s[k]);
  for (const [t, list] of Object.entries(s.augOwner)) {
    const cur = into.augOwner.get(t);
    if (cur === undefined) into.augOwner.set(t, new Set(list));
    else for (const x of [...cur]) if (!list.includes(x)) cur.delete(x);
  }
}

// ─────────────────────────── 특징 ───────────────────────────

function tileClass(kind: TileKind, read: BotRead): string {
  const dora = read.doraIn([kind]) > 0 ? "D" : "";
  if (kind.suit === "wind" || kind.suit === "dragon") return `honor${dora}`;
  if (kind.rank === 1 || kind.rank === 9) return `19${dora}`;
  if (kind.rank === 2 || kind.rank === 8) return `28${dora}`;
  return `37${dora}`;
}
function safetyClass(safety: number): string {
  return safety >= 0.999 ? "genbutsu" : safety >= 0.9 ? "safe" : safety >= 0.75 ? "mid" : "risky";
}
function kindOfOption(view: PlayerView, o: ActionOption | null): TileKind | null {
  if (o === null) return null;
  if (o.type !== "discard" && o.type !== "riichi") return null;
  const id = (o.payload as { tileId: number }).tileId;
  return view.tiles[id]?.kind ?? null;
}
function rankOf(view: PlayerView, me: PlayerId): number {
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  return sorted.findIndex((p) => p.id === me) + 1;
}

// ─────────────────────────── 한 파일 ───────────────────────────

interface RoundMark {
  riichi: Set<PlayerId>;
  called: Set<PlayerId>;
  won: Set<PlayerId>;
  dealtIn: Set<PlayerId>;
}

function studyFile(path: string, tiers: Map<string, string>, acc: Acc, flags: ReadonlySet<string>): void {
  const { init } = ((): { init: { payload: { config: { playerIds: PlayerId[]; playerMeta?: Record<string, { nickname: string; isBot: boolean }>; mode?: string } } } } => {
    const first = readFileSync(path, "utf-8").split("\n", 1)[0] ?? "";
    return { init: JSON.parse(first) };
  })();
  const meta = init.payload.config.playerMeta;
  if (meta === undefined) return; // 좌석 메타 없는 옛 파일
  const tracked = new Set<PlayerId>();
  const tierOf: Record<PlayerId, string> = {};
  const nickOf: Record<PlayerId, string> = {};
  for (const id of init.payload.config.playerIds) {
    const m = meta[id];
    const isBot = m?.isBot ?? true;
    if ((WHO === "human") !== isBot) {
      tracked.add(id);
      nickOf[id] = m?.nickname ?? id;
      tierOf[id] = isBot ? `bot:${(m as { archetype?: string } | undefined)?.archetype ?? "?"}` : (tiers.get(m?.nickname ?? "") ?? "unknown");
    }
  }
  if (tracked.size === 0) return;
  const mode = (init.payload.config.mode ?? "hanchan") as "hanchan" | "tonpuu";

  const shadows = new Map<PlayerId, BotAgent>();
  for (const id of tracked) {
    const a = new BotAgent(id, `Shadow_${id}`, 12345, contentAugments, 0, "balanced");
    a.setProfile(profileOf("balanced"));
    a.setGameMode(mode);
    a.setFlags(flags);
    shadows.set(id, a);
  }
  let mark: RoundMark = { riichi: new Set(), called: new Set(), won: new Set(), dealtIn: new Set() };

  walkReplay(path, contentAugments, {
    track: tracked,
    onDecision: (dp) => {
      acc.points++;
      const tier = tierOf[dp.player] ?? "unknown";
      const agent = shadows.get(dp.player) as BotAgent;
      agent.sendView(dp.view);
      let read: BotRead;
      try {
        read = buildRead(dp.view, dp.player, { mode, profile: profileOf("balanced"), flags });
      } catch {
        return;
      }
      let shadow: ActionOption | null = null;
      try {
        shadow = agent.decideShadow(dp.prompt);
      } catch {
        shadow = null;
      }
      const turnB = bucketTurn(read.turn);
      const threatB = bucketThreat(read.threat);
      const dealer = read.match.isDealer ? "dealer" : "nondealer";
      const rank = String(rankOf(dp.view, dp.player));
      const actualType = dp.actual?.type ?? null;

      if (dp.kind === "turn") {
        if (dp.actual === null) return;
        if (actualType === "riichi") mark.riichi.add(dp.player);
        // ── 리치 ──
        const riichiOpts = dp.prompt.options.filter((o) => o.type === "riichi");
        if (riichiOpts.length > 0 && !read.riichiDeclared) {
          const value = read.valueOf({ plan: null });
          const dims = [
            ["tier", tier], ["wait", bucketWait(read.waitTiles)], ["turn", turnB],
            ["pts", bucketPoints(value.points)], ["dealer", dealer], ["threat", threatB], ["rank", rank],
          ] as const;
          const pairs = [["wait", "turn"], ["pts", "turn"], ["wait", "threat"]] as const;
          acc.riichi.addMarginals(dims, actualType === "riichi", 0, pairs);
          if (shadow !== null) acc.riichiBot.addMarginals(dims, shadow.type === "riichi", 0, pairs);
        }
        // ── 증강 발동 ── 사람: 보유 증강별 «쓸 수 있었나 → 썼나». 봇: 고른 옵션 타입 (보고서가 증강으로 옮긴다)
        const custom = dp.prompt.options.filter((o) => !isStandardType(o.type));
        if (custom.length > 0) {
          const me = dp.view.players.find((p) => p.id === dp.player);
          const held = me?.augments ?? [];
          const usedAug = actualType !== null && actualType.startsWith("augment:") ? actualType.slice(8) : null;
          const seen = new Set<string>();
          for (const o of custom) {
            if (seen.has(o.type)) continue;
            seen.add(o.type);
            const cur = acc.augOwner.get(o.type);
            if (cur === undefined) acc.augOwner.set(o.type, new Set(held));
            else for (const x of [...cur]) if (!held.includes(x)) cur.delete(x);
            if (shadow !== null && shadow.type === o.type) {
              acc.augUseBot.addMarginals([["type", o.type], ["tier", tier], ["turn", turnB], ["sh", bucketShanten(read.shanten)], ["threat", threatB]], true, 0, [["type", "turn"], ["type", "sh"]]);
            }
          }
          for (const aug of held) {
            const uses = dp.view.augmentView[`uses:${aug}`] as { left?: number } | undefined;
            if (uses !== undefined && (uses.left ?? 0) <= 0) continue; // 다 썼다
            const dims = [["aug", aug], ["tier", tier], ["turn", turnB], ["sh", bucketShanten(read.shanten)], ["threat", threatB]] as const;
            const used = usedAug === aug;
            acc.augUse.addMarginals(dims, used, 0, [["aug", "turn"], ["aug", "sh"], ["aug", "tier"], ["aug", "threat"]]);
            if (used) acc.augTurn.add(`${aug}|${read.turn}`, true, read.shanten);
          }
          // 봇 쪽 분모: 옵션이 제시된 프롬프트 수 (타입별)
          for (const t of seen) {
            if (shadow !== null && shadow.type === t) continue; // 위에서 true로 셌다
            acc.augUseBot.addMarginals([["type", t], ["tier", tier], ["turn", turnB], ["sh", bucketShanten(read.shanten)], ["threat", threatB]], false, 0, [["type", "turn"], ["type", "sh"]]);
          }
        }
        // ── 안깡·가깡 ──
        const kanOpts = dp.prompt.options.filter((o) => o.type === "ankan" || o.type === "shouminkan");
        if (kanOpts.length > 0) {
          const dims = [["tier", tier], ["sh", bucketShanten(read.shanten)], ["threat", threatB]] as const;
          acc.kanUse.addMarginals(dims, actualType === "ankan" || actualType === "shouminkan");
        }
        // ── 버림 일치·수비 ──
        const hk = kindOfOption(dp.view, dp.actual);
        const bk = kindOfOption(dp.view, shadow);
        if (hk !== null && (actualType === "discard" || actualType === "riichi")) {
          const humanSafety = read.safetyOf(hk);
          const humanLoss = read.expectedLoss(hk);
          const sh = bucketShanten(read.shanten);
          if (read.threat >= 0.8 && !read.riichiDeclared) {
            const value = read.valueOf({ plan: null });
            const src = read.threats.some((t) => t.riichi && t.level >= 0.8) ? "riichi" : "open";
            const dims = [["tier", tier], ["src", src], ["sh", sh], ["pts", bucketPoints(value.points)], ["turn", turnB], ["cls", safetyClass(humanSafety)]] as const;
            const pairs = [["sh", "pts"], ["sh", "turn"], ["sh", "cls"], ["tier", "cls"], ["src", "sh"], ["src", "cls"]] as const;
            acc.defense.addMarginals(dims, humanSafety >= 0.999, humanSafety, pairs);
            if (bk !== null) {
              const bs = read.safetyOf(bk);
              const bdims = [["tier", tier], ["src", src], ["sh", sh], ["pts", bucketPoints(value.points)], ["turn", turnB], ["cls", safetyClass(bs)]] as const;
              acc.defenseBot.addMarginals(bdims, bs >= 0.999, bs, pairs);
            }
          }
          if (bk !== null) {
            const same = kindKey(hk) === kindKey(bk);
            const dims = [["tier", tier], ["sh", sh], ["turn", turnB], ["threat", threatB]] as const;
            acc.discardAgree.addMarginals(dims, same, 0, [["sh", "turn"], ["sh", "threat"]]);
            if (!same) {
              acc.discardConf.add(`${threatB}|${tileClass(hk, read)}>${tileClass(bk, read)}`, true);
              acc.discardConf.add(`${threatB}|h:${tileClass(hk, read)}`, true);
              acc.discardConf.add(`${threatB}|b:${tileClass(bk, read)}`, true);
              acc.discardLoss.add(`${threatB}|${sh}`, humanLoss > read.expectedLoss(bk), humanLoss - read.expectedLoss(bk));
            }
          }
        }
        if (shadow !== null) {
          acc.agree.add(`turn|${tier}`, sameChoice(dp.actual, shadow));
          acc.agreeNick.add(`${nickOf[dp.player] ?? "?"}|${tier}`, sameChoice(dp.actual, shadow));
        }
      } else {
        // ── 리액션: 후로 기회 ──
        if (dp.actual === null) return;
        const callOpts = dp.prompt.options.filter((o) => o.type === "pon" || o.type === "chi" || o.type === "minkan");
        if (callOpts.length === 0) return;
        const took = actualType === "pon" || actualType === "chi" || actualType === "minkan";
        if (took) mark.called.add(dp.player);
        const last = dp.view.round.lastDiscard;
        const calledKind = last !== null ? dp.view.tiles[last.tileId]?.kind ?? null : null;
        const isYakuhai =
          calledKind !== null &&
          (calledKind.suit === "dragon" ||
            (calledKind.suit === "wind" && (calledKind.rank === read.seatWind || calledKind.rank === dp.view.round.prevalentWind + 1)));
        const canPon = callOpts.some((o) => o.type === "pon" || o.type === "minkan");
        const dims = [
          ["tier", tier], ["sh", bucketShanten(read.shanten)], ["turn", turnB],
          ["kind", canPon ? (isYakuhai ? "yakuhai" : "pon") : "chi"],
          ["dora", calledKind !== null && read.doraIn([calledKind]) > 0 ? "dora" : "plain"],
          ["menzen", read.menzen ? "menzen" : "open"], ["dealer", dealer], ["threat", threatB],
        ] as const;
        const pairs = [["kind", "sh"], ["kind", "turn"], ["kind", "menzen"], ["sh", "menzen"]] as const;
        acc.call.addMarginals(dims, took, 0, pairs);
        if (shadow !== null) {
          const botTook = shadow.type === "pon" || shadow.type === "chi" || shadow.type === "minkan";
          acc.callBot.addMarginals(dims, botTook, 0, pairs);
          acc.agree.add(`reaction|${tier}`, took === botTook);
        }
        if (took) acc.callKind.add(`${tier}|${actualType}`, true);
      }
    },
    onDraft: (d) => {
      const tier = tierOf[d.player] ?? "unknown";
      if (d.picked === null) return;
      const defs = d.offered.map((id) => contentAugments.find((a) => a.id === id)).filter((x) => x !== undefined);
      if (defs.length !== d.offered.length) return; // 옛 id
      for (const id of d.offered) acc.draft.addMarginals([["aug", id], ["tier", tier]], id === d.picked, 0, [["aug", "tier"]]);
      const agent = shadows.get(d.player) as BotAgent;
      // decideDraft는 async지만 홀드가 없으면 동기적으로 resolve된 Promise를 준다 — 값을 바로 꺼낼 수 없어
      // chooseDraft 경로를 그대로 쓰는 대신 then으로 받는다 (파일 처리 끝에 flush).
      pendingDrafts.push(
        agent.decideDraft("gameStart", defs as never).then((pick) => {
          for (const id of d.offered) acc.draftBot.addMarginals([["aug", id], ["tier", tier]], id === pick, 0, [["aug", "tier"]]);
          acc.draftAgree.add(tier, pick === d.picked);
        }),
      );
    },
    onSettled: (_state, event) => {
      const p = event.payload as { deltas: Record<PlayerId, number>; winInfos?: { winner: PlayerId; from: PlayerId | null; winningTileId: number }[] };
      for (const w of p.winInfos ?? []) {
        mark.won.add(w.winner);
        if (w.from !== null) mark.dealtIn.add(w.from);
      }
      for (const id of tracked) {
        const tier = tierOf[id] ?? "unknown";
        const style = mark.riichi.has(id) ? "riichi" : mark.called.has(id) ? "called" : "quiet";
        acc.outcome.add(`${tier}|${style}|win`, mark.won.has(id), p.deltas[id] ?? 0);
        acc.outcome.add(`${tier}|${style}|dealin`, mark.dealtIn.has(id), 0);
      }
      mark = { riichi: new Set(), called: new Set(), won: new Set(), dealtIn: new Set() };
    },
  });
}

const pendingDrafts: Promise<void>[] = [];

function sameChoice(a: ActionOption | null, b: ActionOption): boolean {
  if (a === null) return false;
  if (a.type !== b.type) return false;
  return JSON.stringify(a.payload) === JSON.stringify(b.payload);
}

// ─────────────────────────── 실행 ───────────────────────────

function listFiles(): string[] {
  const all = readdirSync(DIR).filter((f) => f.endsWith(".jsonl")).sort();
  return LIMIT > 0 ? all.slice(-LIMIT) : all;
}

async function runShard(files: string[]): Promise<Study> {
  const t0 = Date.now();
  const acc = new Acc();
  const tiers = loadTiers();
  const flags = parseFlags(FLAGS);
  for (const f of files) {
    acc.files++;
    try {
      studyFile(join(DIR, f), tiers, acc, flags);
      await Promise.all(pendingDrafts.splice(0));
    } catch (err) {
      acc.failed++;
      if (process.env["STUDY_VERBOSE"]) console.error(`[study] ${f}: ${(err as Error).message}`);
    }
  }
  return acc.toStudy(Date.now() - t0);
}

async function main(): Promise<void> {
  const files = listFiles();
  if (SHARD !== undefined) {
    const [i, n] = SHARD.split("/").map(Number) as [number, number];
    const mine = files.filter((_, idx) => idx % n === i);
    const s = await runShard(mine);
    process.send?.(s);
    return;
  }
  const t0 = Date.now();
  const acc = new Acc();
  const self = fileURLToPath(import.meta.url);
  const passthrough = process.argv.slice(2);
  await Promise.all(
    Array.from({ length: WORKERS }, (_, i) =>
      new Promise<void>((resolve, reject) => {
        const child = fork(self, [...passthrough, "--shard", `${i}/${WORKERS}`], {
          execArgv: ["--import", "tsx/esm"],
        });
        child.on("message", (s) => mergeStudy(acc, s as Study));
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`shard ${i} exit ${code}`))));
      }),
    ),
  );
  const study = acc.toStudy(Date.now() - t0);
  writeFileSync(OUT, JSON.stringify(study));
  console.log(`files ${study.files} failed ${study.failed} points ${study.points} in ${(study.timeMs / 1000).toFixed(0)}s → ${OUT}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
