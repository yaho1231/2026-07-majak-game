/**
 * 절벽 위에 피어난 꽃 (cliff_bloom, prism).
 * 게임당 1회. 액티브 버튼을 누르면 안깡을 하고, 가져온 보충패와 무관하게
 * 반드시 영상개화(嶺上開花)로 화료한다. 버튼은 "손패에서 깡이 가능하며,
 * 그 깡 이후 손패가 텐파이가 될 때"에만 활성화된다.
 *
 * 구현:
 * - bloom_kan 액션: 미사용·자기 턴·안깡 가능·깡 후 텐파이를 검사하고, 사용/무장
 *   플래그를 세운 뒤 KAN_DECLARED(kan_closed)를 낸다. 이후 표준 흐름이 영상패를 뽑는다.
 * - TILE_DRAWN(rinshan) 리액션: 무장 상태면, 뽑은 영상패의 종류를 현재 손패의
 *   대기패 중 하나로 바꾼다(tileKindChanged). 손이 화료형이 되어 다음 턴 프롬프트에
 *   쯔모(영상개화)가 뜬다 — 무장 상태에서는 어떤 패를 뽑든 화료가 보장된다.
 *
 * "가져온 보충패와 무관하게"를 종류 치환으로 실현하므로, rinshan_gamble처럼 4장
 * 한도를 넘는 패가 생길 수 있다(프리즘의 상식 파괴). 바뀐 패는 conjured로 표시한다.
 */

import {
  KAN_DECLARED,
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  sameKind,
  scoringOptionsOf,
  standardKinds,
  tileKindChanged,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileDrawnPayload,
  TileId,
} from "@majak/core";
import { flagOf } from "../util.js";

const ID = "cliff_bloom";
const ACTION = "bloom_kan";
/** 게임당 1회 사용 플래그 */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 영상패를 대기패로 치환할 예약 상태 */
const armedKey = (h: PlayerId): string => `${ID}:armed:${h}`;

/** 지정한 4장으로 안깡했을 때 남는 손패가 텐파이인가 */
function postKanTenpai(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  kanIds: readonly TileId[],
): boolean {
  const handIds = handIdsOf(state, holder);
  if (!kanIds.every((id) => handIds.includes(id))) return false;
  const restKinds = handIds
    .filter((id) => !kanIds.includes(id))
    .map((id) => kindOf(state, id));
  const meldCount = meldCountOf(state, holder) + 1; // + 이번 깡
  return (
    winningKinds(
      restKinds,
      meldCount,
      standardKinds(),
      scoringOptionsOf(state, rules, holder),
    ).length > 0
  );
}

/** 손패에서 안깡 가능한 종류의 4장 묶음들 */
function ankanGroups(state: GameState, holder: PlayerId): TileId[][] {
  const byKind = new Map<string, TileId[]>();
  for (const id of handIdsOf(state, holder)) {
    const k = kindKey(kindOf(state, id));
    byKind.set(k, [...(byKind.get(k) ?? []), id]);
  }
  const groups: TileId[][] = [];
  for (const ids of byKind.values()) {
    if (ids.length >= 4) groups.push(ids.slice(0, 4));
  }
  return groups;
}

const bloomKanAction: ActionDef<{ tileIds: TileId[] }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no cliff_bloom augment";
    }
    if (state.augmentData[usedKey(req.player)] === true) return "already used";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot bloom";
    }
    if ((state.zones[WALL]?.tileIds.length ?? 0) === 0) {
      return "cannot kan with empty wall";
    }
    if (state.round.kanCount >= 4) return "kan limit reached";
    const ids = req.payload.tileIds;
    if (!Array.isArray(ids) || new Set(ids).size !== 4) return "need 4 tiles";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const k = kindOf(state, ids[0]!);
    if (!ids.every((id) => sameKind(kindOf(state, id), k))) {
      return "tiles are not identical";
    }
    if (!postKanTenpai(state, rules, req.player, ids)) {
      return "hand is not tenpai after kan";
    }
    return null;
  },
  toEvents: (req) => [
    augmentDataSet(usedKey(req.player), true),
    augmentDataSet(armedKey(req.player), true),
    {
      type: KAN_DECLARED,
      payload: {
        player: req.player,
        kanKind: "kan_closed",
        handTileIds: req.payload.tileIds,
      },
    },
  ],
};

export const cliffBloom: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "절벽 위에 피어난 꽃",
  description:
    "게임당 1회, 액티브 버튼으로 안깡을 하고 어떤 보충패를 뽑든 반드시 영상개화로 화료한다. 손패에서 깡이 가능하고, 그 깡 이후 손이 텐파이가 될 때만 발동할 수 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(bloomKanAction);
    }

    // 영상패를 뽑는 순간, 무장 상태면 그 패를 대기패 중 하나로 바꿔 화료를 보장한다
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || !p.rinshan) return;
      if (!flagOf(rc.state, armedKey(holder))) return;
      rc.emit(augmentDataSet(armedKey(holder), false));

      const state = rc.state;
      const drawnId = p.tileId;
      const restKinds = handIdsOf(state, holder)
        .filter((id) => id !== drawnId)
        .map((id) => kindOf(state, id));
      const waits = winningKinds(
        restKinds,
        meldCountOf(state, holder),
        standardKinds(),
        scoringOptionsOf(state, rc.rules, holder),
      );
      const drawnKind = kindOf(state, drawnId);
      // 이미 대기패를 뽑았으면 그대로(자연 영상개화), 아니면 대기패로 치환
      const target = waits.find((k) => sameKind(k, drawnKind)) ?? waits[0];
      if (target === undefined) return; // 방어: validate가 텐파이를 보장
      if (!sameKind(target, drawnKind)) {
        rc.emit(
          tileKindChanged([
            { tileId: drawnId, kind: target, attrs: { conjured: true } },
          ]),
        );
      }
    });

    // 무장 플래그는 국을 넘겨 남지 않게 — 사용 전(미무장)엔 아무 옵션도 만들지 않는다.
    // 안깡 가능 + 깡 후 텐파이인 묶음마다 후보를 낸다 (합법성은 validate가 최종 판정).
    ctx.holderTurnOptions((state) => {
      if (state.augmentData[usedKey(holder)] === true) return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      return ankanGroups(state, holder)
        .filter((ids) => postKanTenpai(state, engine.rules, holder, ids))
        .map((ids) => ({ type: ACTION, payload: { tileIds: ids } }));
    });
  },
});
