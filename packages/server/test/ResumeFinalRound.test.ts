/**
 * 이어하기 × **마지막 국 결과 화면 대기 중** 끊긴 판 (2026-09-25 W5 통합 리뷰 lifecycle-1).
 *
 * 결함: `resume()`이 국 사이(`round.over`)에서 되살린 판은 첫 반복의 종국 판정(토비·
 * 일반 종국·아가리야메)을 통째로 건너뛰고 곧장 다음 국을 시작했다. 마지막 국의 결과창이
 * «최종 결과 보기»(roundOver.gameEnds)를 띄운 채 기다리는 사이 서버가 죽으면, 되살린 판이
 * **한 국을 더** 두고 다른 사유로 끝났다(동풍전 시드 103: 라이브=normal, 재개=남1국 추가 뒤
 * westEntryDecided). 이제 로그의 마지막 `RoundSettled`로 «방금 친 국»을 되짚어 라이브와 같은
 * 판정을 한다.
 *
 * 확인하는 것:
 *  1. 끝난 판의 전체 로그로 되살리면 새 국을 하나도 시작하지 않고, 종국 사유가 라이브와 같다.
 *  2. 중간 국 사이(첫 정산 직후)에서 되살리면 판정이 «안 끝남»이라 다음 국을 그대로 시작한다
 *     — B-10(오라스 직전 재개가 이미 올라간 round를 방금 친 국으로 읽던 결함)이 돌아오지 않는다.
 */
import { describe, expect, it } from "vitest";
import type { PlayerAgent, PlayerId, RankingEntry } from "@majak/core";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, hanchanConfigForMode } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../src/BotAgent.js";
import { reconstructGame } from "../src/ReplayReader.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function bots(seed: number, salt: number): PlayerAgent[] {
  return SEATS.map((id, i) => {
    const b = new BotAgent(id, undefined, seed * 131 + i * 7 + 1 + salt, contentAugments, 0);
    b.setGameMode("tonpuu");
    return b;
  });
}

function cfg(extra: object) {
  return {
    ...DEFAULT_HANCHAN_CONFIG,
    ...hanchanConfigForMode("tonpuu"),
    ...extra,
    extraAugments: contentAugments,
    agentDecideTimeoutMs: 20_000,
  };
}

async function playLive(seed: number): Promise<{ lines: string[]; end: string | null }> {
  const lines: string[] = [];
  let end: string | null = null;
  const live = new HanchanController(bots(seed, 0), cfg({ seed }), {
    onEvent: (j: string) => lines.push(j),
    onGameOver: (_r: RankingEntry[], reason: string) => {
      end = reason;
    },
  } as never);
  await live.run();
  return { lines, end };
}

async function resumeFrom(
  lines: string[],
  seed: number,
): Promise<{ roundStarts: number; end: string | null }> {
  const recon = reconstructGame(lines, { extraAugments: contentAugments });
  expect(recon.game.engine.state.round.phase).toBe("round.over");
  const post: { type: string }[] = [];
  let end: string | null = null;
  const revived = new HanchanController(bots(seed, 7919), cfg(recon.hanchan), {
    onEvent: (j: string) => post.push(JSON.parse(j) as { type: string }),
    onGameOver: (_r: RankingEntry[], reason: string) => {
      end = reason;
    },
  } as never);
  await revived.resume(recon.game);
  return { roundStarts: post.filter((e) => e.type === "RoundStarted").length, end };
}

describe("이어하기 — 마지막 국 결과 화면에서 끊긴 판 (lifecycle-1)", () => {
  // 103=평범한 종국, 1=아가리야메, 2=서입 결정, 3=즉시 우승 — 종국 사유별로 한 판씩.
  for (const seed of [103, 1, 2, 3]) {
    it(`시드 ${seed}: 되살려도 새 국 없이 라이브와 같은 사유로 끝난다`, async () => {
      const live = await playLive(seed);
      expect(live.end).not.toBeNull();
      const resumed = await resumeFrom(live.lines, seed);
      expect(resumed.roundStarts, "끝난 판이 한 국을 더 두었다").toBe(0);
      expect(resumed.end).toBe(live.end);
    }, 60_000);
  }

  it("중간 국 사이(첫 정산 직후)에서 되살리면 다음 국을 그대로 시작한다", async () => {
    const seed = 103;
    const live = await playLive(seed);
    const firstSettle = live.lines.findIndex(
      (l) => (JSON.parse(l) as { type?: string }).type === "RoundSettled",
    );
    expect(firstSettle).toBeGreaterThan(0);
    const resumed = await resumeFrom(live.lines.slice(0, firstSettle + 1), seed);
    expect(resumed.roundStarts).toBeGreaterThan(0);
    expect(resumed.end).not.toBeNull();
  }, 60_000);
});
