/**
 * 증강 대규모 시뮬레이션 러너.
 *
 * arena(`bot/arena.ts`)는 **봇을 재는** 자리라 집계가 좌석·원형 단위다. 여기서
 * 알고 싶은 것은 **증강 하나하나의 격차**이므로, 판마다 좌석의 원시 통계를
 * 통째로 한 줄씩 남기고 집계는 나중에 한다. 그래야 "이 증강을 든 판의 평균
 * 화료점수" 같은 질문을 표본을 다시 돌리지 않고 답할 수 있다.
 *
 * 좌석 통계는 코어의 `StatsTracker`를 그대로 쓴다 — 실대국 전적 화면과 같은
 * 계산이라야 여기 숫자가 게임의 숫자와 같은 뜻을 가진다.
 *
 *   node --import tsx/esm runner.ts --games 500 --seed 1 --out shard.jsonl \
 *        [--personas meta,fun,...] [--pool a,b,c] [--mode hanchan]
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  HanchanController,
  ROUND_SETTLED,
  StatsTracker,
  createEmptyStats,
  standardAugments,
} from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { AugmentDef, GameMode, PlayerId, PlayerStatsRaw } from "@majak/core";
import type { RoundSettledPayload } from "@majak/core/mahjong/flow/flowEvents.js";
import type { DraftStage } from "@majak/core/network/protocol.js";
import { contentAugments } from "@majak/content";
import { BotAgent } from "@majak/server/src/BotAgent.js";
import { ARCHETYPE_NAMES, profileOf } from "@majak/server/src/bot/profile.js";
import type { ArchetypeName } from "@majak/server/src/bot/profile.js";
import { PERSONAS, PERSONA_NAMES, registerCatalog } from "./personas.js";
import type { PersonaName } from "./personas.js";

const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];
const ALL: readonly AugmentDef[] = contentAugments;
registerCatalog([...ALL, ...standardAugments]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 페르소나를 입은 봇. 판의 진행은 손대지 않고 드래프트만 갈아 끼운다. */
class QaBot extends BotAgent {
  persona: PersonaName = "archetype";
  private offersLog: { stage: string; offered: string[]; picked: string }[] = [];

  get offers(): readonly { stage: string; offered: string[]; picked: string }[] {
    return this.offersLog;
  }

  override async decideDraft(stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    const held = this.heldIds();
    const pick = PERSONAS[this.persona](choices, {
      held,
      rand: () => this.personaRand(),
    });
    const id = pick?.id ?? (await super.decideDraft(stage, choices));
    this.offersLog.push({ stage, offered: choices.map((c) => c.id), picked: id });
    return id;
  }

  private heldIds(): string[] {
    const me = (this as unknown as { lastView?: { players: { id: string; augments?: string[] }[] } })
      .lastView?.players.find((p) => p.id === this.id);
    return me?.augments ?? [];
  }

  /** 봇 시드에서 파생 — 시드가 같으면 같은 판이 나온다 */
  private personaRand(): number {
    return (this as unknown as { rng: { next: () => number } }).rng.next();
  }
}

interface Row {
  game: number;
  seed: number;
  seat: PlayerId;
  archetype: ArchetypeName;
  persona: PersonaName;
  /** 판을 끝낸 시점에 들고 있던 증강 (지급분 포함) */
  augments: string[];
  offers: { stage: string; offered: string[]; picked: string }[];
  rank: number;
  /** 우마·오카 적용 순위점 */
  score: number;
  /** 최종 소지점 */
  rawScore: number;
  /** 유국에서 텐파이로 잡힌 국 수 */
  tenpaiDraws: number;
  /** 유국 국 수 */
  drawRounds: number;
  stats: PlayerStatsRaw;
}

async function main(): Promise<void> {
  const games = Number(arg("games") ?? 50);
  const seed = Number(arg("seed") ?? 1);
  const mode = (arg("mode") ?? "hanchan") as GameMode;
  const out = arg("out") ?? "shard.jsonl";
  const personas = (arg("personas")?.split(",") as PersonaName[] | undefined) ?? PERSONA_NAMES;
  /** 강제 커버리지 — 이 id들만 카탈로그에 깔아 반드시 제시되게 한다 */
  const poolIds = arg("pool")?.split(",");
  const pool: readonly AugmentDef[] =
    poolIds === undefined ? ALL : ALL.filter((d) => poolIds.includes(d.id));
  if (poolIds !== undefined && pool.length !== poolIds.length) {
    const missing = poolIds.filter((id) => !pool.some((d) => d.id === id));
    throw new Error(`--pool에 없는 증강: ${missing.join(",")}`);
  }
  mkdirSync(dirname(out), { recursive: true });

  const botCatalog = [...standardAugments, ...pool];

  for (let g = 0; g < games; g++) {
    const gs = gameSeed(seed, g);
    const tenpaiDraws = new Map<PlayerId, number>();
    let drawRounds = 0;

    const bots = SEATS.map((id, i) => {
      const bot = new QaBot(id, `Bot_${id}`, gs + i * 7919, botCatalog);
      // 원형과 페르소나를 **따로** 굴린다 — 둘을 묶으면 어느 쪽 효과인지 못 가른다
      const arch = ARCHETYPE_NAMES[(gs + i * 31) % ARCHETYPE_NAMES.length] as ArchetypeName;
      bot.setProfile(profileOf(arch));
      bot.persona = personas[(gs + i * 13) % personas.length] as PersonaName;
      bot.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
      return bot;
    });

    const tracker = new StatsTracker([...SEATS]);
    const controller = new HanchanController(
      bots,
      { ...hanchanConfigForMode(mode), extraAugments: pool, seed: gs },
      {
        onEvent: (json: string) => {
          const ev = JSON.parse(json) as { type: string; payload?: unknown };
          tracker.consume(ev);
          if (ev.type === ROUND_SETTLED) {
            const p = ev.payload as RoundSettledPayload;
            if (p.outcome === "draw") {
              drawRounds++;
              for (const id of p.tenpaiPlayers ?? []) {
                tenpaiDraws.set(id, (tenpaiDraws.get(id) ?? 0) + 1);
              }
            }
          }
        },
      },
    );

    const rankings = await controller.run();
    tracker.recordGameEnd(rankings);

    const lines: string[] = [];
    for (const [i, id] of SEATS.entries()) {
      const r = rankings.find((x) => x.playerId === id);
      const bot = bots[i] as QaBot;
      const row: Row = {
        game: g,
        seed: gs,
        seat: id,
        archetype: bot.archetype,
        persona: bot.persona,
        augments: heldOf(bot),
        offers: [...bot.offers],
        rank: r?.rank ?? 0,
        score: r?.score ?? 0,
        rawScore: r?.rawScore ?? 0,
        tenpaiDraws: tenpaiDraws.get(id) ?? 0,
        drawRounds,
        stats: tracker.get(id) ?? createEmptyStats(),
      };
      lines.push(JSON.stringify(row));
    }
    appendFileSync(out, lines.join("\n") + "\n");
    if ((g + 1) % 25 === 0) process.stderr.write(`  ${out}: ${g + 1}/${games}\n`);
  }
}

function heldOf(bot: BotAgent): string[] {
  const v = (bot as unknown as { lastView?: { players: { id: string; augments?: string[] }[] } })
    .lastView;
  return v?.players.find((p) => p.id === bot.id)?.augments ?? [];
}

/** arena와 같은 파생 — 판마다 다르되 시드 하나로 전체가 재현된다 */
function gameSeed(seed: number, i: number): number {
  let h = (seed ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

await main();
