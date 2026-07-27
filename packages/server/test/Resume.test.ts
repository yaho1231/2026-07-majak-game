/**
 * 이어하기(resume) 코어 로직 — 리플레이 재구성으로 중간에서 이어 돌리기.
 *
 * 봇 4명 반장전을 돌려 이벤트 로그를 캡처 → 여러 지점에서 잘라 "서버가 죽은
 * 시점"을 흉내 → reconstructGame + HanchanController.resume로 이어서 완주 →
 * (1) 4인 순위·제로섬, (2) 재개 게임의 합친 로그가 그대로 리플레이됨(무결성) 검증.
 */

import { describe, it, expect } from "vitest";
import { HanchanController } from "@majak/core/match/HanchanController.js";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../src/BotAgent.js";
import { reconstructGame } from "../src/ReplayReader.js";

function bots(): BotAgent[] {
  return [0, 1, 2, 3].map((i) => new BotAgent(`p${i}` as never, `Bot_p${i}`));
}

async function playAndCapture(seed: number): Promise<string[]> {
  const lines: string[] = [];
  const ctrl = new HanchanController(
    bots(),
    { seed, extraAugments: contentAugments },
    { onEvent: (json) => lines.push(json) },
  );
  await ctrl.run();
  return lines;
}

describe("이어하기 (resume) — 리플레이 재구성", () => {
  it(
    "여러 절단 지점에서 재구성해 이어 완주하고, 재개 로그가 그대로 재현된다",
    async () => {
      const full = await playAndCapture(0xa17c);
      expect(full.length).toBeGreaterThan(200);

      for (const frac of [0.25, 0.5, 0.8]) {
        const cut = Math.max(1, Math.floor(full.length * frac));
        const partial = full.slice(0, cut);

        // 재구성 + 이어하기 (새 이벤트 캡처)
        const { game, eventCount } = reconstructGame(partial, contentAugments);
        expect(eventCount).toBe(partial.filter((l) => l.trim().length > 0).length - 1);
        const resumed: string[] = [];
        const ctrl = new HanchanController(
          bots(),
          { extraAugments: contentAugments },
          { onEvent: (json) => resumed.push(json) },
        );
        const rankings = await ctrl.resume(game);

        // (1) 정상 종국 — 순위 1~4가 정확히 한 번씩, 점수 공식 일관성.
        //     (뱅크식 보너스 증강이 발동하면 총점이 100000에서 벗어나므로
        //      제로섬은 더 이상 불변식이 아니다 — content util.ts 참고)
        expect(rankings).toHaveLength(4);
        expect([...rankings.map((r) => r.rank)].sort()).toEqual([1, 2, 3, 4]);
        for (const r of rankings) {
          // 제로섬 기준점은 원점(startScore 25000), 오카 0 (순수 우마).
          expect(r.score).toBe(r.rawScore - 25000 + r.uma * 1000 + r.oka * 1000);
        }

        // (2) 재개 무결성 — 과거(partial) + 새 이벤트를 합쳐 재구성하면
        //     이어하기가 끝낸 최종 상태와 점수가 정확히 일치한다.
        const combined = [...partial, ...resumed];
        const recon = reconstructGame(combined, contentAugments);
        const reconScores = recon.game.engine.state.players.map((p) => p.score);
        const finalScores = game.engine.state.players.map((p) => p.score);
        expect(reconScores).toEqual(finalScores);
      }
    },
    120_000,
  );
});
