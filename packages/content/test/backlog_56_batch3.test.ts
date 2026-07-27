/**
 * backlog_56_batch3 — 개벽·천하통일 동작 검증.
 *  - genesis(개벽): 자기 턴에 발동하면 손패 자↔수가 통째로 뒤바뀐다. 새 패는 패산의
 *    실물에서 무작위로 가져오고(모자랄 때만 conjured 생성), 나간 손패는 패산 맨 밑으로.
 *  - unification(천하통일): install이 보유자에게만 match.instantWinScore=50000을 세팅.
 *    (shouldEnd의 score≥threshold 로직은 score.finalAdjust와 동일 계열이라 자명)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  WALL,
  createStandardGame,
  createStandardGameFromState,
  createInitialGameState,
  installAugment,
  handIdsOf,
  kindOf,
  isHonor,
  isNumberSuit,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";

import { genesis } from "../src/augments/genesis.js";
import { unification } from "../src/augments/unification.js";
import { tableFlip } from "../src/augments/table_flip.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";

/** p0 등에 augments를 심은 초기 상태 위에 게임을 만든다(직접 설치는 player.augments를 안 채운다) */
function gameWithAugment(
  seed: number,
  player: PlayerId,
  augId: string,
  mode?: "tonpuu" | "hanchan",
) {
  const base = createInitialGameState(
    { seed, playerIds: ["p0", "p1", "p2", "p3"] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const state: GameState = {
    ...base,
    ...(mode !== undefined ? { config: { ...base.config, mode } } : {}),
    players: base.players.map((p) =>
      p.id === player ? { ...p, augments: [augId] } : p,
    ),
  };
  return createStandardGameFromState(state);
}

describe("개벽 (genesis)", () => {
  it("자↔수가 전부 뒤바뀌고, 새 패는 패산 실물·나간 손패는 패산으로 돌아간다", () => {
    const game = gameWithAugment(7, "p0", "genesis");
    installAugment(game.engine, genesis, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();

    let flipped = false;
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 200) {
      const prompt = status.prompts[0]!;
      const opts = prompt.options as ActionOption[];
      const flip = opts.find((o) => o.type === "genesis_flip");
      if (flip && prompt.player === "p0") {
        const st0 = game.engine.state;
        const beforeHand = [...handIdsOf(st0, "p0")];
        const beforeWall = [...(st0.zones[WALL]?.tileIds ?? [])];
        const honorsBefore = beforeHand.filter((id) => isHonor(kindOf(st0, id))).length;
        const numbersBefore = beforeHand.length - honorsBefore;
        const prngBefore = st0.prngState;

        status = flow.submit("p0", flip);

        const st = game.engine.state;
        const afterHand = handIdsOf(st, "p0");
        const afterWall = st.zones[WALL]?.tileIds ?? [];
        // 총량 보존 — 1:1 교환이므로 손패·패산 장수 불변
        expect(afterHand.length).toBe(beforeHand.length);
        expect(afterWall.length).toBe(beforeWall.length);
        // 자↔수 반전 — 수패였던 만큼 자패가, 자패였던 만큼 수패가 된다
        const honorsAfter = afterHand.filter((id) => isHonor(kindOf(st, id))).length;
        expect(honorsAfter).toBe(numbersBefore);
        expect(afterHand.length - honorsAfter).toBe(honorsBefore);
        // 교환으로 나간 원래 손패는 전부 패산에 있다
        const wallSet = new Set(afterWall);
        const afterHandSet = new Set(afterHand);
        for (const id of beforeHand) {
          if (!afterHandSet.has(id)) expect(wallSet.has(id)).toBe(true);
        }
        // 패산에서 온 패는 실물(비-conjured), 손에 남아 변형된 패만 conjured
        const beforeHandSet = new Set(beforeHand);
        const beforeWallSet = new Set(beforeWall);
        for (const id of afterHand) {
          const tile = st.tiles[id]!;
          if (beforeHandSet.has(id)) {
            expect(tile.attrs?.conjured).toBe(true);
          } else {
            expect(beforeWallSet.has(id)).toBe(true);
            expect(tile.attrs?.conjured).not.toBe(true);
          }
        }
        // 난수 소비가 상태에 남는다 (리플레이 결정론)
        expect(st.prngState).not.toBe(prngBefore);
        flipped = true;
        break;
      }
      // 그 외에는 버림으로 진행
      const discard = opts.find((o) => o.type === "discard") ?? opts[0];
      status = flow.submit(prompt.player, discard!);
    }
    expect(flipped).toBe(true);
  });

  it("패산에 자패가 없으면 그 몫만 생성(conjured·적도라 소멸)하고 쯔모패도 승계된다", () => {
    // 자패 28장 전부를 세 손패에 몰아 패산의 자패를 0으로 만든다
    const base = craft({
      hands: {
        p0: "123m456m789m123p11z", // 수패 12 + 자패 2 (쯔모패 포함 14장, 5m은 적도라)
        p1: "1122223333444z", // 동×2 남×4 서×4 북×3
        p2: "4555566667777z", // 북×1 + 백발중×12
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["genesis"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, genesis, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opts = (status.prompts.find((p) => p.player === "p0")?.options ??
      []) as ActionOption[];
    const flip = opts.find((o) => o.type === "genesis_flip");
    expect(flip).toBeDefined();

    const st0 = game.engine.state;
    const beforeHand = [...handIdsOf(st0, "p0")];
    const numberIds = beforeHand.filter((id) => isNumberSuit(kindOf(st0, id)));
    const honorIds = beforeHand.filter((id) => isHonor(kindOf(st0, id)));
    const redId = numberIds.find((id) => st0.tiles[id]?.attrs.red === true);
    expect(redId).toBeDefined(); // 5m 첫 사본은 적도라
    const wallLenBefore = st0.zones[WALL]?.tileIds.length ?? 0;
    const drawnBefore = st0.round.lastDrawnTile;
    expect(drawnBefore !== null && honorIds.includes(drawnBefore)).toBe(true);

    flow.submit("p0", flip!);

    const st = game.engine.state;
    const afterHand = handIdsOf(st, "p0");
    const wallIds = st.zones[WALL]?.tileIds ?? [];
    expect(afterHand.length).toBe(beforeHand.length);
    expect(wallIds.length).toBe(wallLenBefore);
    // 수패 12장: 패산에 자패가 없으므로 전부 그 자리에서 자패로 생성(conjured)
    for (const id of numberIds) {
      const tile = st.tiles[id]!;
      expect(afterHand.includes(id)).toBe(true);
      expect(isHonor(tile.kind)).toBe(true);
      expect(tile.attrs.conjured).toBe(true);
    }
    // 생성 변형된 적도라 5m은 red를 잃는다 (자패 적도라 방지)
    expect(st.tiles[redId!]!.attrs.red).toBeUndefined();
    // 자패 2장: 패산의 실물 수패와 교환 — 원본은 패산으로, 실물이 손으로
    const wallSet = new Set(wallIds);
    for (const id of honorIds) {
      expect(afterHand.includes(id)).toBe(false);
      expect(wallSet.has(id)).toBe(true);
    }
    const incoming = afterHand.filter((id) => !beforeHand.includes(id));
    expect(incoming.length).toBe(honorIds.length);
    for (const id of incoming) {
      expect(isNumberSuit(kindOf(st, id))).toBe(true);
      expect(st.tiles[id]!.attrs.conjured).not.toBe(true);
    }
    // 쯔모패(자패)가 교환돼 나갔으니, 들어온 실물이 새 쯔모패다
    const drawnAfter = st.round.lastDrawnTile;
    expect(drawnAfter).not.toBe(drawnBefore);
    expect(drawnAfter !== null && afterHand.includes(drawnAfter)).toBe(true);
    expect(drawnAfter !== null && incoming.includes(drawnAfter)).toBe(true);
  });

  it("동풍전 1회 — 발동 후에는 genesis_flip 옵션이 사라진다", () => {
    const game = gameWithAugment(3, "p0", "genesis", "tonpuu");
    installAugment(game.engine, genesis, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    let used = false;
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 300) {
      const prompt = status.prompts[0]!;
      const opts = prompt.options as ActionOption[];
      const flip = opts.find((o) => o.type === "genesis_flip");
      if (prompt.player === "p0" && used) {
        // 이미 썼으면 다시 제시되면 안 된다
        expect(flip).toBeUndefined();
      }
      if (flip && prompt.player === "p0" && !used) {
        status = flow.submit("p0", flip);
        used = true;
        continue;
      }
      const discard = opts.find((o) => o.type === "discard") ?? opts[0];
      status = flow.submit(prompt.player, discard!);
    }
    expect(used).toBe(true);
  });
});

describe("밥상 뒤엎기 (table_flip)", () => {
  it("발동하면 손패가 새 13장으로 바뀌고 총 패 수는 보존된다", () => {
    const game = gameWithAugment(11, "p0", "table_flip");
    installAugment(game.engine, tableFlip, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();

    let flipped = false;
    let guard = 0;
    while (status.kind === "awaiting" && guard++ < 200) {
      const prompt = status.prompts[0]!;
      const opts = prompt.options as ActionOption[];
      const flip = opts.find((o) => o.type === "table_flip_do");
      if (flip && prompt.player === "p0") {
        const beforeHand = handIdsOf(game.engine.state, "p0").slice().sort();
        const beforeTotal =
          Object.values(game.engine.state.zones).reduce(
            (n, z) => n + z.tileIds.length,
            0,
          );
        status = flow.submit("p0", flip);
        const afterHand = handIdsOf(game.engine.state, "p0").slice().sort();
        const afterTotal = Object.values(game.engine.state.zones).reduce(
          (n, z) => n + z.tileIds.length,
          0,
        );
        // 손패 장수는 그대로, 구성은 달라졌다
        expect(afterHand.length).toBe(beforeHand.length);
        expect(afterHand).not.toEqual(beforeHand);
        // 전체 패 수 보존 (반납·재드로우로 총량 불변)
        expect(afterTotal).toBe(beforeTotal);
        flipped = true;
        break;
      }
      const discard = opts.find((o) => o.type === "discard") ?? opts[0];
      status = flow.submit(prompt.player, discard!);
    }
    expect(flipped).toBe(true);
  });
});

describe("허장성세 (bluff_pretense)", () => {
  it("같은 패 1장으로 펑하면 conjured 생성패가 낀 커쯔 멘쯔가 만들어진다", () => {
    // 여러 시드를 돌려 'p0가 버림패와 같은 종류를 딱 1장 든 리액션'을 찾는다.
    let triggered = false;
    for (let seed = 1; seed <= 60 && !triggered; seed++) {
      const game = gameWithAugment(seed, "p0", "bluff_pretense");
      installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
      const flow = new FlowController(game.engine);
      let status = flow.begin();
      let guard = 0;
      while (status.kind === "awaiting" && guard++ < 400) {
        const prompt = status.prompts[0]!;
        const opts = prompt.options as ActionOption[];
        const bluff = opts.find((o) => o.type === "bluff_pon");
        if (bluff && prompt.player === "p0") {
          status = flow.submit("p0", bluff);
          // 펑 직후 p0의 멜드에 conjured 생성패가 있어야 한다
          const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
          const pon = melds.find((m) => m.kind === "pon");
          expect(pon).toBeDefined();
          const hasConjured = (pon?.tileIds ?? []).some(
            (id) => game.engine.state.tiles[id]?.attrs?.conjured === true,
          );
          expect(hasConjured).toBe(true);
          // 멘쯔 3장이 전부 같은 종류(커쯔)
          const kinds = (pon?.tileIds ?? []).map((id) =>
            kindOf(game.engine.state, id),
          );
          expect(new Set(kinds.map((k) => `${k.suit}${k.rank}`)).size).toBe(1);
          triggered = true;
          break;
        }
        const win = opts.find((o) => o.type === "win");
        const move = win ?? opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "pass") ?? opts[0];
        status = flow.submit(prompt.player, move!);
      }
    }
    expect(triggered).toBe(true);
  });
});

describe("천하통일 (unification)", () => {
  it("install이 보유자에게만 match.instantWinScore=50000을 세팅한다", () => {
    const game = createStandardGame({ seed: 1, extraAugments: [unification] });
    installAugment(game.engine, unification, "p0", { yaku: game.yaku });
    const rules = game.engine.rules;
    const state = game.engine.state;
    expect(rules.resolve<number>("match.instantWinScore", { playerId: "p0", state })).toBe(50000);
    // 비보유자는 기본 0 (비활성)
    expect(rules.resolve<number>("match.instantWinScore", { playerId: "p1", state })).toBe(0);
  });
});
