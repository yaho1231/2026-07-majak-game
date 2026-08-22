/**
 * 확정 후보 — 염색(tile_dyeing)이 `handAlteredMark`(천화·지화 게이트)를 안 남긴다.
 *
 * 손패의 패 종류를 갈아 끼우는 형제 증강(tile_split·three_dragons_will·silent_swap·
 * table_flip·suitUnifyCore)은 전부 handAltered 표식을 남긴다. tile_dyeing만 빠졌다.
 * → 오야가 첫 순에 염색으로 손을 **완성시켜도** 천화 역만 48,000점이 그대로 붙는다.
 */
import {
  SYSTEM_PLAYER,
  ROUND_SETTLED,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return {
    ...s,
    players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)),
  };
}
function settled(game: ReturnType<typeof createStandardGameFromState>): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no settle");
}

// 오야(p0, seat0=dealer) 첫 순. 1s 한 장만 자리에 안 맞는 14장.
// 1s → 1p 로 염색하면 123m456m789m123p11p = 완성형.
function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m23p11p1s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    round: { ...base.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 },
  };
}

function run(label: string, dye: boolean): void {
  const s = withAug(scene(), "p0", ["tile_dyeing"]);
  const game = createStandardGameFromState(s);
  installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });

  let winTile: TileId;
  if (dye) {
    const ids = handIdsOf(game.engine.state, "p0");
    const target = ids.find((id) => kindKey(game.engine.state.tiles[id]!.kind) === "sou1")!;
    const r = game.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId: target, suit: "pin" },
    });
    console.log(`${label}: dye submit ok=${r.ok}`, r.ok ? "" : JSON.stringify(r));
    winTile = target;
  } else {
    winTile = game.engine.state.round.lastDrawnTile as TileId;
  }
  const marks = Object.keys(game.engine.state.augmentData).filter((k) =>
    k.startsWith("handAltered:"),
  );
  console.log(`${label}: handAltered 표식 =`, marks.length === 0 ? "(없음)" : marks);

  const res = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p0", from: null, tileId: winTile, winType: "tsumo" }] },
  });
  if (!res.ok) {
    console.log(`${label}: settle 실패`, JSON.stringify(res));
    return;
  }
  const p = settled(game);
  const info = p.wins?.[0]?.info;
  console.log(
    `${label}: yaku=[${(info?.yaku ?? []).map((y) => y.id).join(",")}] yakumanCount=${info?.yakumanCount} points=${info?.points} p0델타=${p.deltas["p0"]}`,
  );
}

// ① 대조군: 염색 없이 원래 완성형이던 손 (진짜 천화)
{
  const base = craft({
    hands: { p0: "123m456m789m123p11p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(
    { ...base, round: { ...base.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 } },
    "p0",
    [],
  );
  const game = createStandardGameFromState(s);
  const res = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: {
      wins: [
        {
          winner: "p0",
          from: null,
          tileId: game.engine.state.round.lastDrawnTile as TileId,
          winType: "tsumo",
        },
      ],
    },
  });
  const p = settled(game);
  const info = p.wins?.[0]?.info;
  console.log(
    `[대조 · 증강없음] ok=${res.ok} yaku=[${(info?.yaku ?? []).map((y) => y.id).join(",")}] yakumanCount=${info?.yakumanCount} p0델타=${p.deltas["p0"]}`,
  );
}

// ② 염색으로 손을 고쳐서 완성시킨 경우 — 천화가 붙으면 버그
run("[염색으로 완성]", true);

// ③ 형제 대조: tile_split 은 같은 상황에서 표식을 남기는가
{
  // 9s 를 4s+5s 로 쪼개 완성시키는 장면: 123m456m789m11p + 9s + 3p2p ... 단순히 표식만 확인
  const base = craft({
    hands: { p0: "123m456m789m23p11p9s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(
    { ...base, round: { ...base.round, firstTurn: true, goAroundBroken: false, dealerSeat: 0 } },
    "p0",
    ["tile_split"],
  );
  const game = createStandardGameFromState(s);
  installAugment(game.engine, tileSplit, "p0", { yaku: game.yaku });
  const ids = handIdsOf(game.engine.state, "p0");
  const target = ids.find((id) => kindKey(game.engine.state.tiles[id]!.kind) === "sou9")!;
  const r = game.engine.submit({
    player: "p0",
    type: "split_tile",
    payload: { tileId: target, a: 4 },
  });
  console.log("[형제 tile_split] submit ok=", r.ok, r.ok ? "" : JSON.stringify(r));
  console.log(
    "[형제 tile_split] handAltered 표식 =",
    Object.keys(game.engine.state.augmentData).filter((k) => k.startsWith("handAltered:")),
  );
}

// ④ 같은 손·같은 염색인데 첫 순이 아닌 경우 — 델타 차이가 곧 천화분이다
{
  const base = craft({
    hands: { p0: "123m456m789m23p11p1s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug({ ...base, round: { ...base.round, firstTurn: false, dealerSeat: 0 } }, "p0", [
    "tile_dyeing",
  ]);
  const game = createStandardGameFromState(s);
  installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
  const ids = handIdsOf(game.engine.state, "p0");
  const target = ids.find((id) => kindKey(game.engine.state.tiles[id]!.kind) === "sou1")!;
  game.engine.submit({ player: "p0", type: "tile_dye", payload: { tileId: target, suit: "pin" } });
  game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p0", from: null, tileId: target, winType: "tsumo" }] },
  });
  const p = settled(game);
  console.log(
    `[염색 · 첫순아님] yaku=[${(p.wins?.[0]?.info?.yaku ?? []).map((y) => y.id).join(",")}] p0델타=${p.deltas["p0"]}`,
  );
}
