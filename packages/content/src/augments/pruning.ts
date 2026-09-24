/**
 * 가지치기 (pruning, prism) — 손패 3장을 패산 맨 위 3장과 맞바꾼다.
 *
 * (동풍전 2국에 1회 · 반장전 3국에 1회) 자기 순에 손패 3장을 고르면, 그 3장이 패산 맨 위로 올라가고 원래 맨 위에
 * 있던 3장이 손으로 들어온다. 무엇이 들어올지는 미리 볼 수 없다(2026-09-24 사용자 확정).
 * 패산이 3장 이하로 남았으면 쓸 수 없다. 리치 중에는 손이 고정돼 있으므로 쓸 수 없다.
 *
 * 2026-09-24 이름 변경: 처음 이름은 «모래시계»(`sandglass`)였는데 뒤집힌 모래시계
 * (`hourglass`)와 헷갈려 같은 날 «가지치기»로 바꿨다(사용자 지시). 쓸모없는 가지 3장을
 * 쳐내고 새 가지를 받는 카드다.
 *
 * ## 구현
 * - 커스텀 이벤트 `PruningSwapped` 하나. 리듀서가 패산 앞 3장을 손으로, 고른 3장을
 *   패산 앞(0번 자리부터)으로 옮긴다. 장수 변화가 없어 유국 타이밍이 그대로다.
 * - 내보낸 패 중에 쯔모패가 있으면 들어온 마지막 패를 새 쯔모패로 세운다(미래를 보는 자와
 *   같은 규약). 쯔모패를 남겼으면 쯔모패는 그대로다.
 * - 후보는 손패 3장 조합 전부(C(14,3)=364)다. 화면은 실제 손패 3장을 클릭해 고르고
 *   [확인]으로 낸다(App.tsx ARM_MODE `pruning_swap: "hand3"`, 2026-09-24 사용자 지시).
 * - 쿨다운은 공용 "N국에 1회" 도구(`trackRoundSeq`·`cooldownUse`)를 쓰고, 반장전에서는
 *   `scaledCooldown`으로 늘린다(동풍전 2국 · 반장전 3국 — 조커와 같은 계보).
 * - 배패가 아닌 손이 되므로 천화·지화 게이트를 닫는다(handAltered.ts).
 */

import {
  WALL,
  defineAugment,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  replaceDrawnTile,
  scaledCooldown,
  trackRoundSeq,
} from "../util.js";
import { plan } from "./botPlan.js";
import { worstHandTiles } from "./botHelpers.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "pruning";
const ACTION = "pruning_swap";
/** 이 증강이 만들어내는 이벤트 */
const PRUNING_SWAPPED = "PruningSwapped";
/** 바꾸는 장수 */
const SWAP_TILES = 3;
/** 쿨다운 — 한 번 쓰면 이만큼 국이 지나야 다시 열린다 (동풍전 2국 · 반장전 3국) */
const cooldownRounds = (state: GameState): number => scaledCooldown(state, 2);

interface PruningSwappedPayload {
  player: PlayerId;
  /** 손에서 패산 맨 위로 올라가는 3장 (이 순서대로 0·1·2번 자리) */
  outIds: TileId[];
  /** 패산 맨 위에서 손으로 들어오는 3장 */
  inIds: TileId[];
}

function isSortedTriple(ids: unknown): ids is TileId[] {
  if (!Array.isArray(ids) || ids.length !== SWAP_TILES) return false;
  if (!ids.every((x) => typeof x === "number")) return false;
  const arr = ids as number[];
  return arr[0]! < arr[1]! && arr[1]! < arr[2]!;
}

/** 오름차순 tileId 3장 조합 전부 (옵션 제시용) */
function triples(ids: readonly TileId[]): TileId[][] {
  const sorted = [...ids].sort((a, b) => a - b);
  const out: TileId[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      for (let k = j + 1; k < sorted.length; k++) {
        out.push([sorted[i]!, sorted[j]!, sorted[k]!]);
      }
    }
  }
  return out;
}

/** 지금 이 보유자가 가지치기를 쓸 수 있는가 (null = 가능) */
function reject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined || !me.augments.includes(ID)) return "no pruning augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return "not your turn";
  if (state.round.byPlayer[player]?.riichi != null) return "riichi: hand is frozen";
  if ((state.zones[WALL]?.tileIds.length ?? 0) <= SWAP_TILES) return "not enough wall tiles";
  if (handIdsOf(state, player).length < SWAP_TILES) return "not enough tiles in hand";
  if (!cooldownReady(state, ID, player, cooldownRounds(state))) return "on cooldown";
  return null;
}

const swapAction: ActionDef<{ tileIds: TileId[] }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const common = reject(state, req.player);
    if (common !== null) return common;
    if (!isSortedTriple(req.payload.tileIds)) return "need three distinct tiles";
    const hand = handIdsOf(state, req.player);
    if (!req.payload.tileIds.every((id) => hand.includes(id))) return "tile not in hand";
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: PruningSwappedPayload = {
      player: req.player,
      outIds: [...req.payload.tileIds],
      inIds: (state.zones[WALL]?.tileIds ?? []).slice(0, SWAP_TILES),
    };
    return [
      { type: PRUNING_SWAPPED, payload },
      ...cooldownUse(state, ID, req.player, cooldownRounds(state)),
    ];
  },
};

export const pruning: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "가지치기",
  description:
    "(동풍전 2국에 1회 · 반장전 3국에 1회) 자기 순에 손패 3장을 골라 패산 맨 위 3장과 바꾼다. 패산이 3장 이하로 남으면 사용할 수 없다.",
  detail:
    "손패에서 고른 3장을 패산 맨 위 3장과 맞바꾼다. 가져올 3장은 미리 볼 수 없다.\n\n내가 넣은 3장은 패산 맨 위에 놓여 다음 쯔모로 나간다. 리치 중에는 사용할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.reducers.has(PRUNING_SWAPPED)) {
      engine.reducers.register(PRUNING_SWAPPED, (state, event) => {
        const p = event.payload as PruningSwappedPayload;
        const hand = handZone(p.player);
        // 패산 맨 위 3장을 손으로, 고른 3장을 패산 맨 위(0번 자리부터)로
        let zones = moveTiles(state.zones, WALL, hand, p.inIds);
        zones = moveTiles(zones, hand, WALL, p.outIds, 0);
        const drawn = state.round.lastDrawnTile;
        const round =
          drawn != null && p.outIds.includes(drawn)
            ? replaceDrawnTile(state.round, p.inIds[p.inIds.length - 1] ?? null)
            : state.round;
        return {
          ...state,
          zones,
          round,
          // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다
          augmentData: { ...state.augmentData, ...handAlteredMark(state, p.player) },
        };
      });
    }
    if (!engine.actions.has(ACTION)) engine.actions.register(swapAction);

    trackRoundSeq(ctx, ID, cooldownRounds);

    // 리치 중·쿨다운 중에는 후보를 내지 않는다 (리치 강제 쯔모기리 자동 진행을 지킨다)
    ctx.holderTurnOptions((state) => {
      if (reject(state, holder) !== null) return [];
      return triples(handIdsOf(state, holder)).map((tileIds) => ({
        type: ACTION,
        payload: { tileIds },
      }));
    });
  },
  /**
   * 손을 **갈아엎는** 물건이다 — 고립패 3장을 모르는 3장으로 바꾼다. 잡손일수록 값이 나고
   * 거의 다 된 손은 흩으면 손해라 `rewrite`다. 가장 고립된 3장을 내보낸다.
   */
  bot: plan({
    intent: "rewrite",
    oneShot: true,
    pick: ({ options, view, holder }) => {
      const want = worstHandTiles(view, holder, SWAP_TILES);
      if (want.length !== SWAP_TILES) return null;
      const key = want.join(",");
      return (
        options.find(
          (o) =>
            o.type === ACTION &&
            ((o.payload as { tileIds?: TileId[] }).tileIds ?? []).join(",") === key,
        ) ?? null
      );
    },
  }),
});
