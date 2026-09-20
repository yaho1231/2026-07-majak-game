/**
 * 리플레이 되감기 하네스(`study/replayWalk.ts`)가 **기록된 수를 하나도 빠뜨리지 않고**
 * 결정 지점으로 되살리는지 — 그리고 그 자리에서 그림자 봇이 «제시된 수»만 고르는지.
 *
 * 봇 넷이 동풍전 한 판을 두며 흘린 이벤트를 그대로 파일에 적고, 그 파일을 되감는다.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HanchanController, hanchanConfigForMode } from "@majak/core";
import { describe, expect, it } from "vitest";
import { BotAgent } from "../src/BotAgent.js";
import { walkReplay } from "../src/study/replayWalk.js";

const SEATS = ["p0", "p1", "p2", "p3"] as const;

async function recordGame(seed: number): Promise<string> {
  const lines: string[] = [];
  const bots = SEATS.map((id, i) => {
    const b = new BotAgent(id, `Bot_${id}`, seed + i, []);
    b.setGameMode("tonpuu");
    return b;
  });
  const controller = new HanchanController(
    bots,
    { ...hanchanConfigForMode("tonpuu"), draftSchedules: [], extraAugments: [], seed },
    { onEvent: (json: string) => lines.push(json) },
  );
  await controller.run();
  const dir = mkdtempSync(join(tmpdir(), "study-"));
  const path = join(dir, "game.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

describe("study/replayWalk", () => {
  it("기록된 버림·리치·선언이 전부 결정 지점으로 되살아나고, 그림자 봇은 제시된 수만 고른다", async () => {
    const path = await recordGame(0x51ed);
    const discards: Record<string, number> = {};
    const calls: Record<string, number> = {};
    for (const line of (await import("node:fs")).readFileSync(path, "utf-8").split("\n")) {
      if (line.length === 0) continue;
      const e = JSON.parse(line) as { type: string; payload: { player?: string; caller?: string } };
      if (e.type === "TileDiscarded") discards[e.payload.player as string] = (discards[e.payload.player as string] ?? 0) + 1;
      if (e.type === "CallMade") calls[e.payload.caller as string] = (calls[e.payload.caller as string] ?? 0) + 1;
    }

    const shadow = new BotAgent("p0", "S", 7, []);
    shadow.setGameMode("tonpuu");
    const seen: Record<string, number> = {};
    const callsSeen: Record<string, number> = {};
    let unresolved = 0;
    let offeredOnly = 0;
    let points = 0;
    const result = walkReplay(path, [], {
      onDecision: (dp) => {
        points++;
        if (dp.actual === null) {
          unresolved++;
          return;
        }
        const t = dp.actual.type;
        if (dp.kind === "turn" && (t === "discard" || t === "riichi")) seen[dp.player] = (seen[dp.player] ?? 0) + 1;
        if (dp.kind === "reaction" && (t === "pon" || t === "chi")) callsSeen[dp.player] = (callsSeen[dp.player] ?? 0) + 1;
        // 실제 수는 항상 그 시점의 프롬프트에 «제시된» 옵션이어야 한다
        expect(dp.prompt.options.some((o) => JSON.stringify(o) === JSON.stringify(dp.actual))).toBe(true);
        if (dp.player === "p0") {
          shadow.sendView(dp.view);
          const chosen = shadow.decideShadow(dp.prompt);
          if (dp.prompt.options.some((o) => JSON.stringify(o) === JSON.stringify(chosen))) offeredOnly++;
          else throw new Error(`shadow chose an option that was not offered: ${JSON.stringify(chosen)}`);
        }
      },
    });

    expect(result.playerIds).toEqual([...SEATS]);
    expect(points).toBeGreaterThan(100);
    // 버림은 한 장도 빠지지 않는다 (리치 선언 버림 포함)
    expect(seen).toEqual(discards);
    // 울음도 마찬가지 — 남에게 진 선언은 기록에 없으므로 기록된 것은 전부 되살아난다
    expect(callsSeen).toEqual(calls);
    // 판별 불가는 «남의 선언에 진 리액션»뿐이라 드물다
    expect(unresolved).toBeLessThan(points * 0.05);
    expect(offeredOnly).toBeGreaterThan(0);
  }, 120_000);
});
