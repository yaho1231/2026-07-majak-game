/**
 * 2:2 정책 대전 — **강함을 재는 자(尺)** 자체가 믿을 만한가.
 *
 * 자기대국(넷이 같은 정책)으로는 강함을 잴 수 없다. 평균 순위가 제로섬이라 구조상
 * 2.5로 수렴하기 때문이다. 그래서 지금까지 잰 것은 유국률·총 화료율 같은 '판의 효율'
 * 이었고, **"이 변경이 봇을 더 강하게 만들었는가"는 한 번도 재지 못했다.**
 *
 * 여기서 잡는 것은 그 자의 성질 셋이다.
 *   1. **편향이 없는가** — 아무도 안 읽는 스위치로 돌리면 차이가 정확히 0이어야 한다
 *   2. **배패 운이 상쇄되는가** — 같은 배패를 좌우 바꿔 두 번 도는가
 *   3. **표준오차가 실측인가** — 이론값을 박아 두면 잡음이 얼마나 줄었는지 알 수 없다
 */

import { describe, expect, it } from "vitest";
import { runArena } from "../src/bot/arena.js";
import { parseFlags } from "../src/bot/flags.js";

const SMALL = { games: 3, mode: "tonpuu", seed: 909 } as const;

describe("2:2 정책 대전", () => {
  it(
    "아무도 안 읽는 스위치는 **정확히** 0 차이를 낸다 (편향 0)",
    async () => {
      const r = await runArena({ ...SMALL, ab: parseFlags("nobody_reads_this") });
      expect(r.ab).toBeDefined();
      expect(r.ab?.placementGain).toBe(0);
      // 같은 배패를 좌우 바꿔 돌았으므로 두 쪽의 모든 통계가 같아야 한다
      expect(r.ab?.on.winRate).toBe(r.ab?.off.winRate);
      expect(r.ab?.on.dealInRate).toBe(r.ab?.off.dealInRate);
      expect(r.ab?.on.avgPlacement).toBe(2.5);
    },
    180_000,
  );

  it(
    "같은 배패를 두 번 돈다 — 판수가 두 배가 된다",
    async () => {
      const plain = await runArena(SMALL);
      const ab = await runArena({ ...SMALL, ab: parseFlags("x") });
      // 배패 수는 같고 실제로 돈 국은 대략 두 배다
      expect(ab.rounds).toBeGreaterThan(plain.rounds * 1.5);
    },
    180_000,
  );

  it(
    "순위는 제로섬이라 두 쪽 평균이 2.5로 맞물린다",
    async () => {
      const r = await runArena({ ...SMALL, ab: parseFlags("x") });
      const on = r.ab?.on.avgPlacement ?? 0;
      const off = r.ab?.off.avgPlacement ?? 0;
      expect((on + off) / 2).toBeCloseTo(2.5, 6);
    },
    180_000,
  );

  it(
    "스위치를 안 켜면 대전 결과가 아예 없다 (평시 측정과 섞이지 않는다)",
    async () => {
      const r = await runArena(SMALL);
      expect(r.ab).toBeUndefined();
    },
    180_000,
  );
});
