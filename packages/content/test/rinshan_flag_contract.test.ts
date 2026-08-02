/**
 * 쯔모패 교체 시 lastDrawRinshan 동반 갱신 계약 (docs/25 P2).
 *
 * 영상개화는 `state.round.lastDrawRinshan` 플래그 하나로만 판정된다
 * (`helpers.ts`의 `rinshan: winType === "tsumo" && state.round.lastDrawRinshan`).
 * 그래서 깡 직후(영상 쯔모 상태)에 쯔모패를 다른 패로 갈아끼우면서 플래그를
 * 안 끄면, 바닥·남의 손·패산에서 가져온 패로 화료해도 영상개화 +1판이 붙었다.
 *
 * pond_snatch·take_back·meld_dissolve·grave_rob은 각자 껐지만
 * silent_swap·hand_swap3·suit_unify에는 안 퍼져 있었다. 개별 수정은 또 새기
 * 때문에, 여기서 **소스 스캔으로 계약을 강제**한다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AUG_DIR = fileURLToPath(new URL("../src/augments/", import.meta.url));

/**
 * 영상패로 뽑는 것 자체가 능력이라 플래그를 의도적으로 세우는 증강.
 * 여기에 추가하려면 "왜 영상개화가 성립해야 하는가"를 설명할 수 있어야 한다.
 */
const INTENTIONAL_RINSHAN = new Set(["north_trader.ts"]);

describe("lastDrawRinshan 동반 갱신 계약", () => {
  const files = readdirSync(AUG_DIR).filter((f) => f.endsWith(".ts"));

  it("쯔모패를 바꾸는 증강은 replaceDrawnTile을 쓰거나 플래그를 함께 다룬다", () => {
    const offenders: string[] = [];

    for (const f of files) {
      const src = readFileSync(AUG_DIR + f, "utf8");
      // `lastDrawnTile:` 로 값을 **쓰는** 곳만 본다 (읽기는 `state.round.lastDrawnTile`)
      const writes = src.match(/lastDrawnTile:\s*(?!undefined)/g) ?? [];
      if (writes.length === 0) continue;
      if (INTENTIONAL_RINSHAN.has(f)) continue;
      const handled =
        src.includes("replaceDrawnTile") || src.includes("lastDrawRinshan");
      if (!handled) offenders.push(f);
    }

    expect(offenders, `쯔모패를 갈아끼우면서 lastDrawRinshan을 안 다루는 증강`).toEqual([]);
  });

  it("의도적으로 영상 플래그를 세우는 증강은 목록에 명시돼 있다", () => {
    const setsTrue = files.filter((f) =>
      /lastDrawRinshan:\s*true/.test(readFileSync(AUG_DIR + f, "utf8")),
    );
    expect(new Set(setsTrue)).toEqual(INTENTIONAL_RINSHAN);
  });
});

/**
 * 계약이 실제 게임 경로에서도 지켜지는지 — 정적의 손(silent_swap)으로 확인한다.
 * 안깡 → 영상 쯔모 상태에서 남의 바닥 패를 집어 화료하면, 예전에는
 * 영상개화 +1판이 그대로 붙었다.
 */
describe("정적의 손 — 영상 쯔모 직후 바닥 패를 집으면 영상개화가 안 붙는다", () => {
  it("lastDrawRinshan이 내려가 rinshan 판정이 false가 된다", async () => {
    const { craft } = await import("./helpers.js");
    const { createStandardGameFromState, installAugment, handZone } = await import(
      "@majak/core"
    );
    const { silentSwap } = await import("../src/augments/silent_swap.js");

    const base = craft({
      hands: { p0: "234m567m88p99p1s", p1: "111z", p2: "222z", p3: "333z" },
      discards: { p1: "1s" },
      phase: "turn.act",
      turnSeat: 0,
    });
    // 안깡 직후를 흉내낸다 — 영상 쯔모 상태
    const drawn = base.zones[handZone("p0")]?.tileIds.at(-1) ?? null;
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: [silentSwap.id] } : p,
      ),
      round: { ...base.round, lastDrawnTile: drawn, lastDrawRinshan: true },
    };

    const game = createStandardGameFromState(state, undefined, [silentSwap]);
    installAugment(game.engine, silentSwap, "p0", { yaku: game.yaku });

    const target = state.zones["discards:p1"]?.tileIds[0];
    if (target === undefined) throw new Error("no pond tile");

    const res = game.engine.submit({
      player: "p0",
      type: "silent_take",
      payload: { tileId: target },
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.round.lastDrawRinshan).toBe(false);
    expect(game.engine.state.round.lastDrawnTile).toBe(target);
  });
});
