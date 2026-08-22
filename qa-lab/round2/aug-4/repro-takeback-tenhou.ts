/**
 * 확정 후보 — 무르기(take_back)가 `handAlteredMark`(천화·지화 게이트)를 안 남긴다.
 *
 * 무르기는 쯔모패를 패산으로 되돌리고 **다른 실물 패**를 손에 넣는다 = 손패 갈아 끼우기.
 * 같은 일을 하는 형제(dead_wall_master · regret · pond_snatch · grave_rob)는 전부
 * handAltered 표식을 남긴다. take_back만 빠졌다.
 * → 오야가 첫 순에 무르기로 뽑은 패로 나면 천화 역만 48,000점이 그대로 붙는다.
 */
import {
  SYSTEM_PLAYER,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";

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

/** 패산 맨 앞(다음에 뽑힐 자리)에 지정한 종류의 패를 올린다 (다른 존과 1:1 맞교환) */
function wallFront(s: GameState, kind: string): GameState {
  const wall = s.zones[WALL]!.tileIds;
  const inWall = wall.findIndex((id) => kindKey(s.tiles[id]!.kind) === kind);
  if (inWall >= 0) {
    const next = [wall[inWall] as TileId, ...wall.filter((_, j) => j !== inWall)];
    return { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: next } } };
  }
  // 패산에 없으면 다른 존(자리 채운 손패 등)에서 한 장 빌려 와 맨 앞 패와 맞바꾼다
  const head = wall[0] as TileId;
  for (const [zid, z] of Object.entries(s.zones)) {
    if (zid === WALL || zid === "hand:p0") continue;
    const i = (z?.tileIds ?? []).findIndex((id) => kindKey(s.tiles[id]!.kind) === kind);
    if (i < 0) continue;
    const borrowed = z!.tileIds[i] as TileId;
    const zoneNext = z!.tileIds.map((id, j) => (j === i ? head : id));
    const wallNext = [borrowed, ...wall.slice(1)];
    return {
      ...s,
      zones: {
        ...s.zones,
        [zid]: { ...z!, tileIds: zoneNext },
        [WALL]: { ...s.zones[WALL]!, tileIds: wallNext },
      },
    };
  }
  throw new Error(`no ${kind} anywhere`);
}

function scene(firstTurn: boolean): GameState {
  // 오야(p0) 첫 순. 1s 한 장만 자리에 안 맞는 14장 — 무르기로 1s를 물리고 1p를 뽑으면 완성.
  const base = craft({
    hands: { p0: "123m456m789m23p11p1s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(
    { ...base, round: { ...base.round, firstTurn, goAroundBroken: false, dealerSeat: 0 } },
    "p0",
    ["take_back"],
  );
  return wallFront(s, "pin1");
}

function run(label: string, firstTurn: boolean): void {
  const game = createStandardGameFromState(scene(firstTurn));
  installAugment(game.engine, takeBack, "p0", { yaku: game.yaku });

  const r = game.engine.submit({ player: "p0", type: "take_back", payload: {} });
  console.log(`${label}: take_back ok=${r.ok}`, r.ok ? "" : JSON.stringify(r));
  const st = game.engine.state;
  const hand = st.zones["hand:p0"]!.tileIds.map((id) => kindKey(st.tiles[id]!.kind));
  console.log(`${label}: 무른 뒤 손패 = ${hand.join(" ")}`);
  const marks = Object.keys(st.augmentData).filter((k) => k.startsWith("handAltered:"));
  console.log(`${label}: handAltered 표식 =`, marks.length === 0 ? "(없음)" : marks);

  const res = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: {
      wins: [
        { winner: "p0", from: null, tileId: st.round.lastDrawnTile as TileId, winType: "tsumo" },
      ],
    },
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

run("[무르기로 완성 · 첫순]", true);
run("[무르기로 완성 · 첫순아님]", false);
