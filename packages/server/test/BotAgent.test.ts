/**
 * BotAgent 회귀 테스트 — "봇이 리치·론·쯔모를 안 한다" 버그 방지.
 *
 * 예전 봇은 (1) 버림이 항상 마지막 옵션(쯔모기리)이라 손이 늘지 않았고,
 * (2) 펑·치를 무조건 불러 멘젠이 깨져 역 없는 손이 됐다.
 * → 리치 옵션이 생기지 않고 win이 validate를 통과하지 못해 화료가 없었다.
 *
 * 이 테스트는 실제 서버 BotAgent 4명으로 게임을 돌려 리치 선언과 화료가
 * 실제로 발생하는지 이벤트 로그로 검증한다.
 */

import { describe, expect, it } from "vitest";
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
  ROUND_SETTLED,
  TILE_DISCARDED,
  CALL_MADE,
  WIN_DECLARED,
} from "@majak/core";
import type { HanchanConfig } from "@majak/core";
import { BotAgent, keepValue } from "../src/BotAgent.js";
import type { TileKind } from "@majak/core";

const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });

describe("keepValue — 버림 휴리스틱", () => {
  it("외톨이 자패가 붙어 있는 수패보다 먼저 버려진다", () => {
    const hand = [k("wind", 1), k("man", 3), k("man", 4)];
    expect(keepValue(k("wind", 1), hand)).toBeLessThan(keepValue(k("man", 3), hand));
  });

  it("또이쯔(같은 패 2장)는 고립 수패보다 가치가 높다", () => {
    const hand = [k("pin", 5), k("pin", 5), k("sou", 9)];
    expect(keepValue(k("pin", 5), hand)).toBeGreaterThan(keepValue(k("sou", 9), hand));
  });
});

describe("BotAgent — 실게임에서 리치·화료가 발생한다", () => {
  it(
    "봇 4명 게임에서 리치 선언과 화료(win 정산)가 최소 1회 이상 나온다",
    async () => {
      let riichiCount = 0;
      let winCount = 0;

      // 여러 시드에서 동장전을 돌려 통계적으로 확실하게
      for (const seed of [11, 22, 33]) {
        const agents = ["p0", "p1", "p2", "p3"].map(
          (id, i) => new BotAgent(id, undefined, seed * 100 + i),
        );
        const cfg: Partial<HanchanConfig> = {
          ...DEFAULT_HANCHAN_CONFIG,
          maxWind: 1, // 동장만 (속도)
          westEntry: false,
          dobi: false,
          draftSchedules: [],
          seed,
          interRoundDelayMs: 0,
        };
        const ctrl = new HanchanController(agents, cfg, {
          onEvent: (json: string) => {
            const e = JSON.parse(json) as { type: string; payload?: any };
            if (e.type === TILE_DISCARDED && e.payload?.riichi === true) riichiCount++;
            if (e.type === ROUND_SETTLED && e.payload?.outcome === "win") winCount++;
          },
        });
        const rankings = await ctrl.run();
        expect(rankings).toHaveLength(4);
      }

      // 예전 봇은 둘 다 0이었다 — 수정 후에는 리치도 화료도 나와야 한다
      expect(riichiCount).toBeGreaterThan(0);
      expect(winCount).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    "봇이 역을 만들 수 있을 때 후로(펑·치)를 하고, 그 열린 손으로 화료도 한다",
    async () => {
      let callCount = 0;
      let openWin = 0; // 후로가 있는 손의 화료

      for (const seed of [5, 17, 41, 88, 123]) {
        const agents = ["p0", "p1", "p2", "p3"].map(
          (id, i) => new BotAgent(id, undefined, seed * 100 + i),
        );
        // 국마다 후로 여부 추적 (플레이어별)
        const opened = new Set<string>();
        const cfg: Partial<HanchanConfig> = {
          ...DEFAULT_HANCHAN_CONFIG,
          maxWind: 2,
          westEntry: false,
          dobi: false,
          draftSchedules: [],
          seed,
          interRoundDelayMs: 0,
        };
        const ctrl = new HanchanController(agents, cfg, {
          onEvent: (json: string) => {
            const e = JSON.parse(json) as { type: string; payload?: any };
            if (e.type === CALL_MADE) {
              callCount++;
              if (typeof e.payload?.caller === "string") opened.add(e.payload.caller);
            }
            if (e.type === WIN_DECLARED && opened.has(e.payload?.winner)) openWin++;
            if (e.type === ROUND_SETTLED) opened.clear(); // 국 경계 초기화
          },
        });
        await ctrl.run();
      }

      // 후로를 실제로 한다 (예전 봇은 무조건 멘젠이라 0이었다)
      expect(callCount).toBeGreaterThan(0);
      // 열린 손으로 화료도 성사된다 (역 없이 부르기만 하고 못 이기면 이 값이 0)
      expect(openWin).toBeGreaterThan(0);
    },
    120_000,
  );
});
