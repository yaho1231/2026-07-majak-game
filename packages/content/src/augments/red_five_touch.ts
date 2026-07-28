/**
 * 붉은 손길 (red_five_touch) — 게임당 1회, 자기 턴에 **숫자 하나를 지정해**
 * 손패의 그 숫자를 전부 적도라로 만든다.
 *
 * 52차 개편: "손패의 5를 전부 적도라"였던 고정 대상을 **1~9 아무 숫자나 지정**으로
 * 넓혔다. 5가 없으면 아무것도 못 하던 증강이, 손패를 보고 가장 많이 쥔 숫자를
 * 골라 한 번에 물들이는 선택형 액티브가 된다.
 *
 * 구현:
 * - 액션 payload가 `{}` → `{ rank }`(1~9)로 바뀌었다. ⚠ 클라이언트는 이 액션을
 *   전용 모달(숫자 선택)로 보여줘야 한다.
 * - `holderTurnOptions`는 **손패에 실제로 있는 랭크만** 후보로 낸다 — 없는 숫자를
 *   고르는 빈 옵션이 뜨지 않는다. (FlowController.submit은 제시 옵션과 JSON 완전일치를
 *   요구하므로 후보는 오름차순 랭크로 안정 정렬해 낸다.)
 * - 게임당 1회·자기 턴 조건은 그대로.
 *
 * 55차(사용자 피드백: "증강으로 생성한 도라는 나만 사용가능하게"):
 * 물들인 패의 attrs에 `redFor: <보유자 id>`를 함께 새긴다. 예전엔 `{ red: true }`만
 * 붙어서, 그 패를 버려 상대가 펑·치로 가져가면 **상대가 내 적도라로 이득을 봤다**.
 * 이제 소유자가 패에 각인되고, `redFor`가 자기 것이 아닌 적도라를 채점에서 세지 않는
 * 처리는 코어 채점부가 담당한다 — 이 파일은 각인만 정확히 한다.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileKindChangedPayload,
} from "@majak/core";

const ID = "red_five_touch";
const ACTION = "red_touch";
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

/** 손패에서 지정 숫자에 해당하는 수패 id 목록 */
function rankIdsOf(
  state: GameState,
  player: PlayerId,
  rank: number,
): number[] {
  return handIdsOf(state, player).filter((id) => {
    const kind = kindOf(state, id);
    return isNumberSuit(kind) && kind.rank === rank;
  });
}

/** 손패에 실제로 존재하는 수패 랭크 목록 (오름차순) */
function ranksInHand(state: GameState, player: PlayerId): number[] {
  const set = new Set<number>();
  for (const id of handIdsOf(state, player)) {
    const kind = kindOf(state, id);
    if (isNumberSuit(kind)) set.add(kind.rank);
  }
  return [...set].sort((a, b) => a - b);
}

const redTouchAction: ActionDef<{ rank: number }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no red_five_touch augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "red_touch already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    const rank = req.payload.rank;
    if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
      return "rank must be 1..9";
    }
    if (rankIdsOf(state, req.player, rank).length === 0) {
      return "no tiles of that rank in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const changes: TileKindChangedPayload["changes"] = rankIdsOf(
      state,
      req.player,
      req.payload.rank,
      // redFor = 이 적도라의 주인(= 발동한 보유자). 이 패를 버려서 상대가 펑·치로
      // 가져가도 상대의 채점에는 적도라로 세어지지 않는다 (채점 쪽 처리는 코어 담당).
    ).map((tileId) => ({
      tileId,
      attrs: { red: true, redFor: req.player },
    }));
    return [tileKindChanged(changes), augmentDataSet(usedKey(req.player), true)];
  },
};

export const redFiveTouch: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  category: "hand",
  name: "붉은 손길",
  description:
    "(게임 내 1회) 자기 순에 숫자 하나(1~9)를 지정해 손패의 그 숫자를 전부 적도라로 만든다. 이렇게 만든 적도라는 나만 쓸 수 있다.",
  detail:
    "(게임 내 1회) 자기 순에 발동하면서 1부터 9까지 중 숫자 하나를 고르면, 그 시점 손패에 있는 그 숫자의 수패(만·통·삭)가 전부 적도라로 바뀐다. 이 적도라에는 소유자가 각인되어, 버린 패를 상대가 후로로 가져가도 상대의 점수로는 계산되지 않는다. 손에 없는 숫자는 고를 수 없다.",
  // 봇: 텐파이일 때, 손패에 가장 많은 랭크를 골라 발동한다 —
  //     그 시점 손에 쥔 패가 그대로 남아 적도라가 될 확률이 높다.
  //     (해당 랭크가 손에 없으면 애초에 후보로 뜨지 않는다.)
  bot: {
    choose({ options, tenpai, view, holder }) {
      if (!tenpai) return null;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const counts = new Map<number, number>();
      for (const id of view.zones[handZone(holder)]?.tileIds ?? []) {
        const kind = view.tiles[id]?.kind;
        if (kind === undefined || !isNumberSuit(kind)) continue;
        counts.set(kind.rank, (counts.get(kind.rank) ?? 0) + 1);
      }
      let best = mine[0] ?? null;
      let bestCount = -1;
      for (const o of mine) {
        const rank = (o.payload as { rank?: number }).rank;
        const c = rank === undefined ? 0 : (counts.get(rank) ?? 0);
        if (c > bestCount) {
          bestCount = c;
          best = o;
        }
      }
      return best;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(redTouchAction);
    }

    // 손패에 실제로 있는 랭크만 후보로 — 빈 옵션이 뜨지 않는다
    ctx.holderTurnOptions((state) =>
      ranksInHand(state, holder).map((rank) => ({
        type: ACTION,
        payload: { rank },
      })),
    );
  },
});
