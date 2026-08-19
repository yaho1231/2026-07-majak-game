/**
 * 손바닥 뒤집기(palm_flip)는 2026-08-15부터 **리치를 풀지 않는다**(대기 교체).
 * 그런데 다른 증강들의 **플레이어 노출 문구**는 아직 "손바닥 뒤집기로 리치를 풀면 …"이라고
 * 적혀 있다. 실제로 풀리지 않는지, 그래서 문구가 약속하는 해제 효과가 안 일어나는지 확인한다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { riichiSeal } from "../../packages/content/src/augments/riichi_seal.js";
import { palmFlip } from "../../packages/content/src/augments/palm_flip.js";
import { allOrNothing } from "../../packages/content/src/augments/all_or_nothing.js";

const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

// p0: 리치 중. 46s 칸짱에 7s를 쯔모 → 4s를 버려 67s 량면으로 갈아탄다.
function scene(augs: string[], extra: Record<string, unknown> = {}): GameState {
  const base = craft({
    hands: { p0: "123m456m789m11p467s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: [...augs] } : p,
    ),
    augmentData: { ...base.augmentData, ...extra },
    round: {
      ...base.round,
      riichiPot: 1000,
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...base.round.byPlayer["p0"]!,
          riichiFuriten: true,
          riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
        },
      },
    },
  };
  return st;
}

const tileOf = (st: GameState, key: string): TileId =>
  st.zones["hand:p0"]!.tileIds.find(
    (id) => `${st.tiles[id]!.kind.suit}${st.tiles[id]!.kind.rank}` === key,
  )!;

// ── ① 리치 봉인 × 손바닥 뒤집기 ──
{
  const base = scene(["riichi_seal", "palm_flip"]);
  const st: GameState = {
    ...base,
    augmentData: { ...base.augmentData, [`riichi_seal:sealed:${rk(base)}:p0`]: true },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, riichiSeal, "p0", { yaku: game.yaku });
  installAugment(game.engine, palmFlip, "p0", { yaku: game.yaku });
  // p1이 리치를 걸 수 있는가? (봉인 확인)
  const blockedBefore = game.engine.rules.resolve<boolean>("riichi.blocked", {
    playerId: "p1",
    state: game.engine.state,
  });
  const r = game.engine.submit({
    player: "p0",
    type: "flip_riichi",
    payload: { tileId: tileOf(game.engine.state, "sou4") },
  });
  const after = game.engine.state;
  const blockedAfter = game.engine.rules.resolve<boolean>("riichi.blocked", {
    playerId: "p1",
    state: after,
  });
  console.log(
    `[riichi_seal × palm_flip] flip.ok=${r.ok} riichi유지=${after.round.byPlayer["p0"]?.riichi != null} ` +
      `p1봉인 ${blockedBefore} -> ${blockedAfter}  (문구: "손바닥 뒤집기로 리치를 풀면 봉인도 풀린다")`,
  );
}

// ── ② 모 아니면 도 × 손바닥 뒤집기 ──
{
  const base = scene(["all_or_nothing", "palm_flip"]);
  const st: GameState = {
    ...base,
    augmentData: {
      ...base.augmentData,
      [`all_or_nothing:active:${rk(base)}:p0`]: 12000,
      [`all_or_nothing:uses:${rk(base)}:p0`]: 1,
    },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, allOrNothing, "p0", { yaku: game.yaku });
  installAugment(game.engine, palmFlip, "p0", { yaku: game.yaku });
  const r = game.engine.submit({
    player: "p0",
    type: "flip_riichi",
    payload: { tileId: tileOf(game.engine.state, "sou4") },
  });
  const after = game.engine.state;
  console.log(
    `[all_or_nothing × palm_flip] flip.ok=${r.ok} riichi유지=${after.round.byPlayer["p0"]?.riichi != null} ` +
      `판돈=${String(after.augmentData[`all_or_nothing:active:${rk(after)}:p0`])}  (문구: "그 리치가 풀리면(승부수·손바닥 뒤집기) 판돈도 함께 사라진다")`,
  );
}
