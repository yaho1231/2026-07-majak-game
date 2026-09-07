/**
 * **개벽이 터진 판에서도 봇은 자기 손을 계산한다** (2026-09-08 사용자 보고).
 *
 * 2026-08-18에 반대 방향의 구멍을 메웠다 — 개벽으로 손이 통째로 자패가 된 사람에게
 * 봇 셋이 東·南·白을 계속 흘려 더블 역만을 헌납했다. 그 수리(`AUGMENT_PLAY.genesis.fired`)가
 * 이번에는 너무 크게 잡혀 반대쪽으로 넘어갔다: 자패 한 장의 기대 실점이 2100점이라
 * **어떤 손·어떤 성격이든** 밀기가 이길 수 없었고, 개벽이 한 번 터지면 봇 전원이
 * 화료를 포기한 채 국이 끝날 때까지 자패를 한 장도 안 냈다.
 *
 * 여기서 못박는 것은 「무서워하는가」가 아니라 **「성격과 손에 따라 갈리는가」**다.
 * 죽지 않는 것만이 수비가 아니다 — 손이 서면 싸울 줄도 알아야 사람과 두는 판이 된다.
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { chooseDiscard } from "../src/bot/discard.js";
import { profileOf } from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";
import type { TileId } from "@majak/core";

/**
 * 3멘쯔 + 머리가 이미 섰고 남은 것은 5삭과 中 한 장 — 中을 흘리면 텐파이,
 * 접으려면 완성된 슌쯔를 헐어야 한다. 즉 밀기/접기가 순수하게 갈리는 자리다.
 */
const HAND = "123m456m789m11p5s7z";

const GENESIS: BotViewOptions = {
  hand: HAND,
  turnCount: 9,
  discards: { p1: "234m567p89s1m", p2: "1m2m3m", p3: "9p8p7p" },
  augments: { p1: ["genesis"] },
  augmentView: { "genesis:p1": true },
  doraIndicator: "4s", // 5삭 도라 — 밀 값어치가 있는 텐파이
};

function pick(opts: BotViewOptions, archetype: ArchetypeName): string {
  const scene = botScene(opts);
  const read = buildRead(scene.view, "p0");
  const picked = chooseDiscard(read, scene.discardOptions(), null, profileOf(archetype));
  const id = (picked?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = id !== undefined ? scene.view.tiles[id]?.kind : undefined;
  if (kind === undefined) return "none";
  const suit =
    kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
  return `${kind.suit === "dragon" ? kind.rank + 4 : kind.rank}${suit}`;
}

describe("개벽이 터진 상대 — 성격에 따라 밀고 접는다", () => {
  it("공격형은 값나가는 텐파이를 들고 자패를 민다", () => {
    expect(pick(GENESIS, "attacker")).toBe("7z");
  });

  it("수비형은 같은 손에서 접는다 — 갈리는 것이 요점이다", () => {
    expect(pick(GENESIS, "defender")).not.toBe("7z");
  });

  it("개벽이 안 터졌으면 누구든 외톨이 자패부터 흘린다", () => {
    const quiet: BotViewOptions = { ...GENESIS, augmentView: {} };
    expect(pick(quiet, "attacker")).toBe("7z");
    expect(pick(quiet, "defender")).toBe("7z");
  });
});
