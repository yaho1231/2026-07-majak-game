/**
 * 아레나 봇이 **증강을 실제로 쓰는가.**
 *
 * ## 무엇이 있었나
 *
 * 증강 정책 하나를 고치고 `--augments --ab <스위치>`로 400배패를 쟀더니 결과가
 * **정확히 0.0000 ± 0.0000** 이었다. 이 프로젝트에서 그 숫자는 "아무도 안 읽는 스위치"의
 * 서명이다(`BotArenaAB.test.ts`가 그걸로 편향 0을 검증한다).
 *
 * 원인은 정책이 아니라 **자(尺)** 였다. 아레나가 봇을 `new BotAgent(id, name, seed)`로
 * 만들면서 **증강 카탈로그를 안 넘겼고**, 카탈로그가 비면 `BotAgent`는 정책 조회 자체를
 * 못 해 액티브 증강을 하나도 발동하지 않는다. 즉 `--augments` 측정은 증강을
 * **뽑기만 하고 쓰지는 않는** 판을 재고 있었다 — 정책 63개가 통째로 죽은 채로.
 * (실서버 `RoomManager`는 `ALL_AUGMENT_DEFS`를 넘긴다. 아레나만 빠져 있었다.)
 *
 * 그래서 여기서는 "봇이 정책을 물어보긴 하는가"를 직접 잡는다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";
import type { AugmentDef, BotDecisionContext } from "@majak/core";
import { runArena } from "../src/bot/arena.js";

describe("아레나 봇은 증강 정책을 실제로 물어본다", () => {
  it("증강을 켜면 봇이 자기 증강의 정책을 조회한다", async () => {
    let asked = 0;
    let installed = 0;
    // 실제 카탈로그를 그대로 쓰되 **세는 껍데기**를 씌운다 — 가짜 증강 하나로는
    // 드래프트에 뽑히지 않아 "정책이 죽어 있다"와 "안 뽑혔다"를 구분할 수 없다.
    const counted = contentAugments.map((def): AugmentDef => {
      const inner = def.bot;
      return {
        ...def,
        install: (ctx) => {
          installed++;
          def.install(ctx);
        },
        ...(inner === undefined
          ? {}
          : {
              bot: {
                choose: (ctx: BotDecisionContext) => {
                  asked++;
                  return inner.choose(ctx);
                },
              },
            }),
      };
    });

    await runArena({ games: 3, seed: 7, mode: "tonpuu", augments: counted });

    // 설치는 예전에도 됐다(패시브는 엔진이 건다). 죽어 있던 것은 **정책 조회**다.
    expect(installed).toBeGreaterThan(0);
    expect(asked).toBeGreaterThan(0);
  }, 300_000);

  it("증강을 안 쓰는 기본 측정은 그대로다 (드래프트가 아예 안 돈다)", async () => {
    const r = await runArena({ games: 1, seed: 7, mode: "tonpuu" });
    expect(r.rounds).toBeGreaterThan(0);
  });
});
