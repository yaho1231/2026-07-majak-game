/**
 * hand_swap3 (3장 강탈) — 게임당 1회, 자기 턴에 상대를 지정해
 * 내 무작위 3장과 상대 무작위 3장을 교환한다 (리치 중인 상대는 불가).
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import { statePrng } from "../util.js";

const ID = "hand_swap3";
const ACTION = "swap3";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const HAND_SWAP3_PERFORMED = "HandSwap3Performed";
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

interface HandSwap3Payload {
  holder: PlayerId;
  target: PlayerId;
  /** 보유자 → 상대에게 넘어가는 3장 */
  give: TileId[];
  /** 상대 → 보유자에게 넘어오는 3장 */
  take: TileId[];
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

const swap3Action: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no hand_swap3 augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "swap3 already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (target.id === req.player) return "cannot target yourself";
    if (state.round.byPlayer[target.id]?.riichi != null) {
      return "target is in riichi";
    }
    if (handIdsOf(state, req.player).length < 3) return "not enough tiles in hand";
    if (handIdsOf(state, target.id).length < 3) return "target has too few tiles";
    return null;
  },
  toEvents: (req, { state }) => {
    const prng = statePrng(state);
    // 양쪽 손패에서 무작위 3장씩 — 셔플 후 앞 3장 (결정적)
    const give = prng.shuffle([...handIdsOf(state, req.player)]).slice(0, 3);
    const take = prng.shuffle([...handIdsOf(state, req.payload.target)]).slice(0, 3);
    const payload: HandSwap3Payload = {
      holder: req.player,
      target: req.payload.target,
      give,
      take,
      prngState: prng.getState(),
    };
    return [{ type: HAND_SWAP3_PERFORMED, payload }];
  },
};

export const handSwap3: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "3장 강탈",
  description:
    "게임당 1회, 자기 턴에 상대를 지정해 내 무작위 3장과 상대의 무작위 3장을 맞바꾼다 (리치 중인 상대는 불가).",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(HAND_SWAP3_PERFORMED)) {
      engine.reducers.register(HAND_SWAP3_PERFORMED, (state, event) => {
        const p = event.payload as HandSwap3Payload;
        let zones = moveTiles(
          state.zones,
          handZone(p.holder),
          handZone(p.target),
          p.give,
        );
        zones = moveTiles(zones, handZone(p.target), handZone(p.holder), p.take);
        // 쯔모패가 give에 섞여 손을 떠났다면, 받아온 마지막 패를 쯔모패로
        // 대체해 이어지는 버림 흐름(리치 제한·쯔모기리 표시)이 깨지지 않게 한다.
        const drawn = state.round.lastDrawnTile;
        const replacement = p.take[p.take.length - 1];
        const nextDrawn =
          drawn !== null && p.give.includes(drawn) && replacement !== undefined
            ? replacement
            : drawn;
        const next: GameState = {
          ...state,
          zones,
          prngState: p.prngState,
          round: { ...state.round, lastDrawnTile: nextDrawn },
          augmentData: { ...state.augmentData, [usedKey(p.holder)]: true },
        };
        return next;
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(swap3Action);
    }

    // 보유자 턴에 상대마다 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions((state) =>
      state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } })),
    );
  },
});
