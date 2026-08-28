/**
 * botnew 검증 스크립트 (2026-08-28) — hand_swap3·frame_up을 봇 정책 목록에서 뺀 뒤,
 * 실제로 봇이 그 증강을 발동하는지 확인한다. 네 자리 전부 BotAgent, 프리셋으로
 * 두 증강을 강제 배포한다.
 *
 * 실행: /Users/skul/majak/node_modules/.bin/tsx qa-lab/launch/fix/botnew/verify.ts
 */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../../../packages/server/src/BotAgent.js";

// 디버그 전용 — hand_swap3의 bot.choose를 감싸 이번 순 옵션·선택을 로그로 남긴다.
// (BotAgent.ts는 소유 파일이 아니라 건드리지 않고, 카탈로그만 여기서 갈아 끼운다.)
const debugCatalog = contentAugments.map((def) => {
  if (def.id !== "hand_swap3" || def.bot === undefined) return def;
  const original = def.bot;
  return {
    ...def,
    bot: {
      choose(ctx: Parameters<typeof original.choose>[0]) {
        const picked = original.choose(ctx);
        if (process.env["DEBUG_SWAP3"] === "1") {
          console.log(
            `[hand_swap3 choose] options=${JSON.stringify(
              ctx.options.map((o) => o.type),
            )} picked=${picked === null ? "null" : JSON.stringify(picked)}`,
          );
        }
        return picked;
      },
    },
  };
});

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

const preset: Record<PlayerId, readonly string[]> = {
  p0: ["hand_swap3"],
  p1: ["frame_up"],
  p2: [],
  p3: [],
};

let swap3Aimed = 0;
let swap3Given = 0;
let swap3Taken = 0;
let frameDiscarded = 0;
let crashed: string | undefined;
let rounds = 0;

async function main() {
  const agents = SEATS.map((id, i) => new BotAgent(id, `Bot_${id}`, 0xb07 + i, debugCatalog, 0));

  const ctrl = new HanchanController(
    agents,
    {
      ...DEFAULT_HANCHAN_CONFIG,
      mode: "hanchan",
      seed: 424242,
      maxWind: 2,
      westEntry: false,
      draftSchedules: ["eastFirst", "eastThird", "southEntry", "southThird"],
      extraAugments: debugCatalog,
      presetAugments: preset,
      agentDecideTimeoutMs: 20_000,
    },
    {
      onRoundStart: () => {
        rounds++;
      },
      onEvent: (j: string) => {
        try {
          const e = JSON.parse(j) as { type?: string; payload?: Record<string, unknown> };
          if (
            e.type === "AugmentDataSet" &&
            typeof (e.payload as { key?: unknown })?.key === "string" &&
            ((e.payload as { key: string }).key.includes("hand_swap3"))
          ) {
            console.log(`[hand_swap3 debug] ${JSON.stringify(e.payload)}`);
          }
          if (e.type === "HandSwap3Swapped") {
            swap3Taken++;
            console.log(
              `[hand_swap3] 교환 성사: ${JSON.stringify(e.payload)}`,
            );
          }
          if (e.type === "TileDiscarded" && (e.payload as { creditTo?: unknown })?.creditTo !== undefined) {
            frameDiscarded++;
            console.log(`[frame_up] 지목 버림: ${JSON.stringify(e.payload)}`);
          }
        } catch {
          // ignore malformed lines
        }
      },
    },
  );

  try {
    await ctrl.run();
  } catch (err) {
    crashed = String(err);
  }

  console.log("---");
  console.log(`rounds=${rounds}`);
  console.log(`swap3_aimed(추정, take 이벤트로 역산)=${swap3Aimed}`);
  console.log(`swap3 교환 성사=${swap3Taken}`);
  console.log(`frame_up 지목 버림=${frameDiscarded}`);
  console.log(`crashed=${crashed ?? "no"}`);
}

void main();
