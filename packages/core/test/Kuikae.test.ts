/**
 * 쿠이카에(먹고 바꾸기) 금지 (QA 2차 rules 확정 2, 2026-08-22).
 *
 * 일본 리치마작 표준 룰은 후로 직후 **울어서 만든 몸통과 같은 패를 버리는 것**을
 * 금지한다. 이 저장소는 그 금지를 **한 줄도 구현하지 않고 있었다** — `discardAction`의
 * validate가 직전 후로 몸통을 한 번도 참조하지 않았다.
 *
 * 없으면 후로가 **공짜 손패 교환**이 된다: 4m5m을 들고 3m을 친 뒤 6m을 버리면
 * 손패 장수도 텐파이 모양도 그대로인 채 필요 없는 패 하나를 흘릴 수 있다. 울 때마다
 * 무료 교체가 되므로 대인전에서 명백한 어드밴티지이고, **봇은 이 수를 쓰지 않으므로
 * 봇 상대로는 드러나지 않는다** — 사람끼리 두는 자리에서만 터진다.
 *
 * 함께 못을 박는 것: 판정이 **화면의 자물쇠와 같은 함수**(`lockedDiscardIds`)를 지난다.
 * 갈라지면 「자물쇠가 걸렸는데 실제로는 버려진다」 또는 그 반대의 거짓 UI가 된다.
 */

import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import { lockedDiscardIds } from "../src/mahjong/flow/helpers.js";
import { buildPlayerView } from "../src/information/PlayerView.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import type { StandardGame } from "../src/mahjong/flow/standardGame.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function craft(hands: Partial<Record<PlayerId, string>>, turnSeat: number, drawnLastFor: PlayerId): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };
  const zones = { ...base.zones };
  for (const p of PLAYERS) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: h(hands[p] ?? "").map(take),
    };
    zones[discardsZone(p)] = createZone(discardsZone(p), "discards", p);
    zones[meldsZone(p)] = createZone(meldsZone(p), "melds", p);
  }
  const rest = [...pool.values()].flat().sort((a, b) => a - b);
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };
  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: "turn.act",
      turnSeat,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: zones[handZone(drawnLastFor)]?.tileIds.at(-1) ?? null,
    },
  };
}

function idOf(game: StandardGame, player: PlayerId, spec: string): TileId {
  const want = kindKey(h(spec)[0]!);
  const st = game.engine.state;
  for (const id of st.zones[handZone(player)]?.tileIds ?? []) {
    const k = st.tiles[id]?.kind;
    if (k !== undefined && kindKey(k) === want) return id;
  }
  throw new Error(`${player} has no ${spec}`);
}

function reason(game: StandardGame, player: PlayerId, tileId: TileId): string | null {
  return game.engine.actions
    .get("discard")!
    .validate({ player, type: "discard", payload: { tileId } }, {
      state: game.engine.state,
      rules: game.engine.rules,
    });
}

/** p3이 3m을 버리고 p0이 4m5m으로 치한 직후의 상태를 만든다. */
function afterChi(): { game: StandardGame; flow: FlowController } {
  const game = createStandardGameFromState(
    craft({ p0: "45m3m6m123p456p135s", p3: "3m99m111z222z333z44z" }, 3, "p3"),
  );
  const flow = new FlowController(game.engine);
  flow.begin();
  const status = flow.submit("p3", {
    type: "discard",
    payload: { tileId: idOf(game, "p3", "3m") },
  });
  if (status.kind !== "awaiting") throw new Error("치 프롬프트가 없다");
  const chis = (status.prompts.find((x) => x.player === "p0")?.options ?? []).filter(
    (o) => o.type === "chi",
  );
  const want = chis.find((o) => {
    const ids = (o.payload as { tileIds: TileId[] }).tileIds;
    return ids
      .map((id) => kindKey(game.engine.state.tiles[id]!.kind))
      .sort()
      .join(",") === "man4,man5";
  });
  if (want === undefined) throw new Error("45m 치 후보가 없다");
  flow.submit("p0", want);
  return { game, flow };
}

describe("쿠이카에 금지 — 치", () => {
  it("현물: 4m5m으로 3m을 치한 뒤 손의 3m을 버릴 수 없다", () => {
    const { game } = afterChi();
    expect(reason(game, "p0", idOf(game, "p0", "3m"))).not.toBeNull();
  });

  it("스지: 같은 자리에서 6m(반대쪽 바깥)도 버릴 수 없다", () => {
    const { game } = afterChi();
    expect(reason(game, "p0", idOf(game, "p0", "6m"))).not.toBeNull();
  });

  it("그 밖의 패는 그대로 버릴 수 있다 (과잉 금지가 아니다)", () => {
    const { game } = afterChi();
    expect(reason(game, "p0", idOf(game, "p0", "1s"))).toBeNull();
  });

  it("한 번 버리고 나면 다음 순부터는 풀린다", () => {
    const { game, flow } = afterChi();
    // 다른 패를 버려 이 순을 넘긴다 — 그 뒤로는 3m·6m이 평범한 손패다.
    flow.submit("p0", { type: "discard", payload: { tileId: idOf(game, "p0", "1s") } });
    expect(game.engine.state.round.lastDiscard).not.toBeNull();
    expect(
      lockedDiscardIds(game.engine.state, game.engine.rules, "p0").size,
    ).toBe(0);
  });

  it("화면의 자물쇠와 검증이 같은 답을 낸다", () => {
    const { game } = afterChi();
    const locked = lockedDiscardIds(game.engine.state, game.engine.rules, "p0");
    for (const id of game.engine.state.zones[handZone("p0")]?.tileIds ?? []) {
      const blocked = reason(game, "p0", id) !== null;
      expect(locked.has(id), `tile ${id}`).toBe(blocked);
    }
  });
});

describe("쿠이카에 금지 — 펑", () => {
  it("5m 펑 직후 손의 5m을 버릴 수 없다", () => {
    const game = createStandardGameFromState(
      craft({ p0: "555m3m6m123p456p13s", p3: "5m99m111z222z333z44z" }, 3, "p3"),
    );
    const flow = new FlowController(game.engine);
    flow.begin();
    const status = flow.submit("p3", {
      type: "discard",
      payload: { tileId: idOf(game, "p3", "5m") },
    });
    if (status.kind !== "awaiting") throw new Error("펑 프롬프트가 없다");
    const pon = (status.prompts.find((x) => x.player === "p0")?.options ?? []).find(
      (o) => o.type === "pon",
    );
    expect(pon).toBeDefined();
    flow.submit("p0", pon!);
    expect(reason(game, "p0", idOf(game, "p0", "5m"))).not.toBeNull();
    // 펑에는 스지 금지가 없다 — 몸통이 슌쯔가 아니다.
    expect(reason(game, "p0", idOf(game, "p0", "6m"))).toBeNull();
  });
});

describe("화면에 실을 때는 봉인과 갈라 보낸다", () => {
  /**
   * 둘 다 자물쇠지만 근거도 수명도 다르다 — 봉인은 남의 증강이 국 내내 건 것이고,
   * 쿠이카에는 표준 룰이라 이 한 순이면 풀린다. 한 배열로 합쳐 보냈더니 증강이 하나도
   * 없는 판에서 치를 한 것만으로 「누군가 내 패 2장을 봉인했습니다」 배너와 「이번 국
   * 동안 버릴 수 없습니다」 툴팁이 떴다 (QA 2차 onboard 확정 1).
   */
  it("증강 0개 판의 쿠이카에는 sealedTileIds가 아니라 kuikaeTileIds로 간다", () => {
    const { game } = afterChi();
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const mine = view.round.byPlayer["p0"];
    const kuikae = mine?.kuikaeTileIds ?? [];
    expect(kuikae.length).toBe(2); // 현물 3m · 스지 6m
    expect(mine?.sealedTileIds ?? []).toEqual([]);
    // 자물쇠로 그려야 할 집합은 둘의 합이고, 그것이 곧 검증 결과와 같다.
    const locked = lockedDiscardIds(game.engine.state, game.engine.rules, "p0");
    expect(new Set([...(mine?.sealedTileIds ?? []), ...kuikae])).toEqual(locked);
  });

  it("아무것도 안 잠긴 순에는 두 배열이 다 붙지 않는다", () => {
    const { game, flow } = afterChi();
    flow.submit("p0", { type: "discard", payload: { tileId: idOf(game, "p0", "1s") } });
    const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const mine = view.round.byPlayer["p0"];
    expect(mine?.kuikaeTileIds).toBeUndefined();
    expect(mine?.sealedTileIds).toBeUndefined();
  });
});
