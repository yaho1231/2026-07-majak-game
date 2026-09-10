/**
 * 골든 해시 — 성능 리팩토링이 **판을 한 비트도 바꾸지 않았는가**를 재는 자리.
 *
 *   node --import tsx/esm src/goldenCli.ts [--games 6] [--seed 1] [--augments] [--mode tonpuu]
 *
 * 봇 넷이 같은 시드로 판을 돌리는 동안 나가는 **이벤트 전부**와 봇에게 배달되는
 * **뷰 전부**(사람이 받는 것과 같은 `PlayerView`)를 순서대로 해시한다. 같은 시드에
 * 같은 해시가 나오면 엔진·뷰·봇 판단이 전부 같다는 뜻이다 — 결정·프롬프트 순서·
 * 뷰의 필드 하나가 달라져도 해시가 바뀐다.
 *
 * 아레나의 집계표는 합계라 미세한 차이를 덮는다. 이쪽은 덮지 않는다.
 */

import { createHash } from "node:crypto";
import { contentAugments } from "@majak/content";
import { HanchanController, standardAugments } from "@majak/core";
import { hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { GameMode, PlayerId, PlayerView } from "@majak/core";
import { BotAgent } from "./BotAgent.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const games = Number(arg("games") ?? 6);
const seed = Number(arg("seed") ?? 1);
const mode = (arg("mode") ?? "hanchan") as GameMode;
const withAugments = process.argv.includes("--augments");
const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];

function gameSeed(seed: number, i: number): number {
  let h = (seed ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const hash = createHash("sha256");
let events = 0;
let views = 0;
const started = Date.now();
for (let g = 0; g < games; g++) {
  const gs = gameSeed(seed, g);
  const catalog = withAugments ? [...standardAugments, ...contentAugments] : undefined;
  const bots = SEATS.map((id, i) => {
    const bot = new BotAgent(id, `Bot_${id}`, gs + i, catalog);
    bot.setGameMode(mode === "tonpuu" ? "tonpuu" : "hanchan");
    const orig = bot.sendView.bind(bot);
    bot.sendView = (view: PlayerView) => {
      views++;
      hash.update("V" + JSON.stringify(view));
      orig(view);
    };
    return bot;
  });
  const controller = new HanchanController(
    bots,
    {
      ...hanchanConfigForMode(mode),
      ...(withAugments
        ? { extraAugments: contentAugments }
        : { draftSchedules: [], extraAugments: [] }),
      seed: gs,
    },
    {
      onEvent: (json: string) => {
        events++;
        hash.update("E" + json);
      },
    },
  );
  const rankings = await controller.run();
  hash.update("R" + JSON.stringify(rankings));
}
console.log(
  `golden ${hash.digest("hex").slice(0, 24)}  games=${games} seed=${seed} augments=${withAugments} events=${events} views=${views} ${Date.now() - started}ms`,
);
