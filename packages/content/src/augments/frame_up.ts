/**
 * 누명 (frame_up, prism) — "내가 버린 걸로 친다고? 나 이제 후리텐이야?!"
 *
 * **2국에 1회**, 자기 턴에 **내가 버릴 패를 상대 한 명의 바닥에 놓는다**. 그 패는
 * 그 사람이 버린 것으로 기록되어(후리텐 근거 `discardedKinds`에 새겨진다) 그가 그 종류로
 * 론할 수 없게 되고, 동시에 **내 바닥에는 남지 않아 내 후리텐도 회피**된다.
 *
 * 구현: 코어 `TileDiscardedPayload.creditTo`(신규 선택 필드)를 쓴다 — 패가 놓이는 바닥과
 * 후리텐 이력만 지목 대상 명의로 가고, **손패 출처·방총 책임(`lastDiscard.player`)·턴 진행은
 * 실제로 버린 나 그대로**다. 즉 심는 순간 다른 상대의 론 반응은 정상적으로 열리고, 그 패로
 * 쏘이면 책임은 내가 진다(원안 대응 규칙 그대로).
 *
 * 표준 버림을 대체하는 액션이므로 손패 장수·턴 흐름은 일반 버림과 완전히 같다.
 * 리치 중에는 버릴 패가 쯔모패로 고정되므로 발동할 수 없다.
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  lockedDiscardIds,
  kindKey,
  kindOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";

const ID = "frame_up";
const ACTION = "frame_discard";

/**
 * 쿨다운 — 한 번 심으면 이만큼 국(본장 포함)이 지나야 다시 열린다.
 * 2026-08-02 사용자 지시로 "동풍1/반장2"에서 **2국당 1회**로 상향했다 —
 * 매치당 1~2회는 국이 흘러가는 동안 쓸 자리를 못 찾고 사장되기 일쑤였다.
 */
const COOLDOWN_ROUNDS = 2;
/** 지금 심을 수 있는가 — 쓴 적이 없거나, 마지막 사용 이후 2국이 지났다 */
const offCooldown = (state: GameState, h: PlayerId): boolean =>
  cooldownReady(state, ID, h, COOLDOWN_ROUNDS);

/** 리치 중인가 (버릴 패가 고정돼 지목 버림 불가) */
const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

/**
 * 첫 바퀴(사풍연타 판정 창)인가 — 그 동안에는 심을 수 없다.
 *
 * 사풍연타는 "네 명의 **첫 버림**이 모두 같은 바람"으로 판정하는데, 엔진은 그것을
 * 각자 바닥의 장수로 센다(FlowController.isFourWindAbort). 누명은 버린 사람 바닥을
 * 0장, 지목당한 사람 바닥을 2장으로 만들어 그 판정을 조용히 무너뜨린다(성립해야 할
 * 도중유국이 안 나거나, 아직 버리지도 않은 사람이 1장으로 집계돼 오탐이 난다).
 * 창이 첫 바퀴뿐이라, 그 동안 발동을 막는 것이 판정을 건드리지 않는 가장 싼 해법이다.
 */
const inFirstGoAround = (state: GameState): boolean => state.round.firstTurn;

const frameAction: ActionDef<{ tileId: TileId; target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no frame_up augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!offCooldown(state, req.player)) return "on cooldown";
    if (inRiichi(state, req.player)) return "cannot frame during riichi";
    if (inFirstGoAround(state)) return "cannot frame on the first go-around";
    if (req.payload.target === req.player) return "cannot frame yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    /*
     * 봉인된 패는 명의를 남에게 돌려서도 버릴 수 없다.
     *
     * ⚠ 누명은 표준 discard 액션을 거치지 않고 `TILE_DISCARDED`를 직접 낸다. 그래서
     * 봉인술사(discard_lock)가 잠근 패를 **"누명 한 번"으로 털어낼 수 있었다**
     * (docs/25 방해 #3). 리치 선언 버림이 같은 이유로 봉인을 우회하던 것과 같은 구멍이다.
     * 판정은 버림 액션·리치 선언과 같은 `lockedDiscardIds`를 쓴다.
     */
    if (lockedDiscardIds(state, rules, req.player, hand).has(req.payload.tileId)) {
      return "tile is sealed";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    // 표준 버림과 동일하되 '명의'만 지목 대상에게 — 방총 책임·턴 진행은 나에게 남는다
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: false,
        riichiCost: 0,
        creditTo: req.payload.target,
      },
    },
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 전원 공개 — 누구 바닥에 무엇이 심겼는지 보여야 대응할 수 있다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
      target: req.payload.target,
      kind: kindKey(kindOf(state, req.payload.tileId)),
    }),
  ],
};

export const frameUp: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "누명",
  description:
    "(2국에 1회) 자기 순에 내가 버릴 패를 지목한 상대의 바닥에 놓는다 — 그 사람이 버린 것으로 기록되어 후리텐에 걸리고, 내 바닥에는 남지 않아 내 후리텐은 회피된다.",
  detail:
    "(2국에 1회) 자기 순에 버릴 패 한 장을 골라 상대 한 명의 바닥에 놓는다. 그 패는 그 사람이 버린 것으로 기록되어, 그가 그 종류로 기다리고 있었다면 후리텐에 걸린다. 동시에 그 패가 내 바닥에 남지 않아 내 후리텐은 회피된다. 다만 실제로 버린 사람은 나이므로 다른 상대의 론 반응은 평소대로 열려 있고 그 패로 쏘이면 책임도 내가 진다. 심긴 패는 전원에게 공개되며, 리치 중이거나 국의 첫 바퀴에는 쓸 수 없다.",
  // A급 파괴(docs/25 §conflicts): 누명은 creditTo로 버림을 남의 바닥에 심어 보유자의
  // discardedKinds가 0으로 고정된다. 그 필드를 "내 첫 순"의 근거로 쓰는 증강들이
  // 국 중반에도 첫 순으로 인정되어 발동 제한이 통째로 무력화된다.
  conflicts: [
    "seat_swap", // 완성된 상대 손을 자리째 강탈
    "suit_unify", // 손이 다 자란 뒤에 단색 세계
    "alchemist", // 턴 서명이 고정되어 제한이 어긋난다
    "take_back", // 쿨다운이 영원히 안 풀린다
  ],
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(frameAction);
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 손패 × 상대 조합을 후보로 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!offCooldown(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      if (inFirstGoAround(state)) return [];
      const opts: { type: string; payload: unknown }[] = [];
      for (const id of handIdsOf(state, holder)) {
        for (const p of state.players) {
          if (p.id === holder) continue;
          opts.push({ type: ACTION, payload: { tileId: id, target: p.id } });
        }
      }
      return opts;
    });
  },
  // 봇 정책 없음 — 어떤 패를 누구에게 심어야 이득인지는 상대 대기 추정이 필요하다.
});
