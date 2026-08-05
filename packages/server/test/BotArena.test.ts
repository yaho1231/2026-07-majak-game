/**
 * 측정 하네스 — 봇을 **재는 자리**가 제대로 도는가.
 *
 * 여기서 잡는 것은 봇의 실력이 아니라 **자(尺)의 정확도**다. 숫자 자체를 테스트에
 * 박아 두면 봇을 고칠 때마다 테스트가 깨져 아무도 안 보게 된다. 그래서 잡는 것은
 * 셋뿐이다.
 *
 *   1. 같은 시드면 같은 숫자가 나오는가 (A/B 비교의 전제)
 *   2. 집계가 앞뒤가 맞는가 (순위 합·국 수·좌석 수)
 *   3. 값이 마작이라는 게임의 상식 범위 안에 있는가 (아주 넓은 띠)
 *
 * 실제 튜닝은 `npm run arena -- --games 40` 으로 사람이 돌려 보고 판단한다.
 */

import { describe, expect, it } from "vitest";
import { runArena } from "../src/bot/arena.js";
import type { ArenaResult } from "../src/bot/arena.js";

/** 동풍전은 반장전의 절반 길이라 자를 검사하는 데는 이쪽이 알맞다 */
const SMALL = { games: 3, mode: "tonpuu", seed: 4242 } as const;

let cached: ArenaResult | null = null;
async function arena(): Promise<ArenaResult> {
  cached ??= await runArena(SMALL);
  return cached;
}

describe("측정 하네스", () => {
  it(
    "같은 시드면 같은 숫자가 나온다 — 이게 없으면 A/B 차이가 변경 때문인지 운 때문인지 알 수 없다",
    async () => {
      const a = await runArena(SMALL);
      const b = await runArena(SMALL);
      expect(a.rounds).toBe(b.rounds);
      expect(a.drawRate).toBe(b.drawRate);
      expect(a.bySeat.map((s) => s.stats.avgPlacement)).toEqual(
        b.bySeat.map((s) => s.stats.avgPlacement),
      );
    },
    120_000,
  );

  it(
    "집계가 앞뒤가 맞는다",
    async () => {
      const r = await arena();
      expect(r.bySeat).toHaveLength(4);
      expect(r.rounds).toBeGreaterThanOrEqual(r.games * 4); // 동풍전은 최소 4국
      for (const seat of r.bySeat) {
        expect(seat.stats.games).toBe(r.games);
        expect(seat.stats.roundsPlayed).toBe(r.rounds);
      }
      // 순위는 매 판 1~4가 한 번씩 — 넷의 순위 합은 판수 × 10
      const sum = r.bySeat.reduce((n, s) => n + s.stats.placementSum, 0);
      expect(sum).toBe(r.games * 10);
    },
    120_000,
  );

  it(
    "값이 마작의 상식 범위 안에 있다 (실측 기준: 화료 20% · 방총 12% 근처)",
    async () => {
      const r = await arena();
      for (const seat of r.bySeat) {
        expect(seat.stats.winRate).toBeGreaterThan(0.03);
        expect(seat.stats.winRate).toBeLessThan(0.45);
        expect(seat.stats.dealInRate).toBeLessThan(0.35);
        // 화료 점수가 상식 밖이면 값어치 추정이 어딘가 깨진 것이다
        if (seat.stats.wins > 0) {
          expect(seat.stats.avgWinPoints).toBeGreaterThan(700);
          expect(seat.stats.avgWinPoints).toBeLessThan(30_000);
        }
      }
      expect(r.drawRate).toBeLessThan(0.5);
    },
    120_000,
  );

  it(
    "좌석 원형을 고정하면 그대로 앉는다 (원형 비교의 전제)",
    async () => {
      const r = await runArena({
        games: 1,
        mode: "tonpuu",
        seed: 7,
        seats: ["attacker", "defender", "speedster", "valueHunter"],
      });
      expect(r.bySeat.map((s) => s.archetype)).toEqual([
        "attacker",
        "defender",
        "speedster",
        "valueHunter",
      ]);
      expect(r.byArchetype).toHaveLength(4);
    },
    120_000,
  );
});
