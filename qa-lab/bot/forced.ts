/**
 * 강제 지급 스위프 — 증강 하나를 네 봇 전원에게 쥐어 주고 실제 BotAgent로 돌린다.
 *
 * 아레나는 드래프트로만 증강이 들어와 카탈로그 전체를 덮지 못한다(표본이 얇다).
 * 여기서는 `presetAugments`로 모든 증강을 순회하며 **기회 대비 발동**을 센다.
 *
 *   tsx qa-lab/bot/forced.ts <shardIndex> <shardCount> <gamesPerAug> <out.json>
 */
import { HanchanController, DEFAULT_HANCHAN_CONFIG, standardAugments } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { newMetrics, patchBot, wrapCatalog } from "./instrument.js";
import { writeFileSync } from "node:fs";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const gamesPer = Number(process.argv[4] ?? 1);
const out = process.argv[5] ?? "/tmp/forced.json";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const m = newMetrics();
const restore = patchBot(m);
const catalog = wrapCatalog(m, contentAugments);
const botCatalog = [...standardAugments, ...catalog];

const only = (process.argv[6] ?? "").split(",").filter((x) => x !== "");
const ids =
  only.length > 0
    ? contentAugments.map((d) => d.id).filter((id) => only.includes(id))
    : contentAugments.map((d) => d.id).filter((_, i) => i % shards === shard);

interface Row {
  id: string;
  games: number;
  crash: string | null;
  effectErrors: string[];
  opportunity: number;
  fired: number;
  proposed: number;
  chooseCalls: number;
  threw: number;
  throws: number;
  contentFailures: [string, number][];
  unoffered: [string, number][];
  actions: string[];
  lostTo: [string, number][];
  selfTarget: number;
  randomFire: number;
  samples: string[];
}
const rows: Row[] = [];

for (const [idx, id] of ids.entries()) {
  const before = {
    opp: m.aug.get(id)?.opportunity ?? 0,
    fired: m.aug.get(id)?.fired ?? 0,
    proposed: m.aug.get(id)?.proposed ?? 0,
    calls: m.aug.get(id)?.chooseCalls ?? 0,
    threw: m.aug.get(id)?.threw ?? 0,
    thr: m.decideNowThrows.length,
    cf: new Map(m.contentFailures),
    uo: new Map(m.unofferedWarns),
  };
  let crash: string | null = null;
  const effectErrors: string[] = [];
  for (let g = 0; g < gamesPer; g++) {
    const seed = 900_000 + idx * 97 + g * 13 + shard * 7;
    const bots = SEATS.map((s, i) => {
      const b = new BotAgent(s, `Bot_${s}`, seed + i, botCatalog);
      b.setGameMode("tonpuu");
      return b;
    });
    const extra = (process.argv[7] ?? "").split(",").filter((x) => x !== "");
    const preset = Object.fromEntries(SEATS.map((s) => [s, [id, ...extra]])) as Record<
      PlayerId,
      readonly string[]
    >;
    const ctrl = new HanchanController(
      bots,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        mode: "tonpuu",
        seed,
        maxWind: 1,
        westEntry: false,
        // 드래프트를 끄고 강제 지급만 쓴다 — 다른 증강이 섞이면 귀속이 흐려진다
        draftSchedules: [],
        extraAugments: catalog,
        presetAugments: preset,
        agentDecideTimeoutMs: 20_000,
      } as never,
      {
        onEffectError: (f: unknown) => {
          const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String(
            (f as { error?: unknown }).error ?? "",
          )}`;
          if (effectErrors.length < 20) effectErrors.push(s);
        },
      } as never,
    );
    try {
      await Promise.race([
        ctrl.run(),
        new Promise((_r, rej) => setTimeout(() => rej(new Error("TIMEOUT 120s")), 120_000)),
      ]);
    } catch (err: unknown) {
      crash = String((err as Error)?.stack ?? err).split("\n").slice(0, 8).join("\n");
      break;
    }
  }
  const c = m.aug.get(id);
  const diffMap = (now: Map<string, number>, was: Map<string, number>): [string, number][] =>
    [...now].map(([k, v]) => [k, v - (was.get(k) ?? 0)] as [string, number]).filter(([, v]) => v > 0);
  rows.push({
    id,
    games: gamesPer,
    crash,
    effectErrors,
    opportunity: (c?.opportunity ?? 0) - before.opp,
    fired: (c?.fired ?? 0) - before.fired,
    proposed: (c?.proposed ?? 0) - before.proposed,
    chooseCalls: (c?.chooseCalls ?? 0) - before.calls,
    threw: (c?.threw ?? 0) - before.threw,
    throws: m.decideNowThrows.length - before.thr,
    contentFailures: diffMap(m.contentFailures, before.cf),
    unoffered: diffMap(m.unofferedWarns, before.uo),
    actions: [...(m.augActions.get(id) ?? [])],
    lostTo: [...(c?.lostTo ?? new Map())] as [string, number][],
    selfTarget: c?.selfTarget ?? 0,
    randomFire: c?.randomFire ?? 0,
    samples: c?.samples ?? [],
  });
  const r = rows[rows.length - 1]!;
  console.log(
    `${idx + 1}/${ids.length} ${id} opp=${r.opportunity} fired=${r.fired} prop=${r.proposed} calls=${r.chooseCalls} threw=${r.threw} thr=${r.throws} crash=${crash === null ? "-" : "YES"}`,
  );
  writeFileSync(out, JSON.stringify({ shard, shards, gamesPer, rows }, null, 1));
}
restore();
writeFileSync(out, JSON.stringify({ shard, shards, gamesPer, rows, done: true }, null, 1));
