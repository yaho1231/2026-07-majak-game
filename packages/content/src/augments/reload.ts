/**
 * 재장전 (reload, prism) — "그거 또 있어?!"
 *
 * 동풍전 1·반장전 2회, 자기 턴에 **사용 횟수를 쓴 내 다른 증강 하나를 지목해 1회 복구**한다.
 * 이미 한 번 본 재앙(통째로 바꾸기·소용돌이 등)이 "재장전"과 함께 다시 장전되는 순간
 * 전원이 "소진됐다고 안심했는데?!" — '게임당 1회'라는 절대 한도가 무너진다.
 *
 * 구현: 순수 콘텐츠(augmentData 카운터 조작). 대상 증강의 사용 카운터
 * `<augmentId>:uses:<holder>`(matchUses 규약)를 1 감소시키면 그 증강의 validate/후보 노출이
 * 다시 열려 한 번 더 쓸 수 있게 된다. 규약을 따르는(=`:uses:` 카운터를 쓰는) 증강만 대상이며,
 * 최소 1회 소진한 것만 후보로 낸다. 재장전 자신은 대상에서 제외한다.
 *
 * ⚠ 이 증강은 다른 증강의 사용 규약(`<id>:uses:<holder>`)에 의존한다 — 그 규약을 따르지 않는
 * (usedKey 불리언·쿨다운 등) 증강은 복구 대상이 아니다.
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses, viewKey } from "../util.js";

const ID = "reload";
const ACTION = "reload_use";

/** 재장전 자신의 사용 카운터 (matchUses) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 대상 증강의 사용 카운터 키 (matchUses 규약) */
const targetUsesKey = (augId: string, h: PlayerId): string => `${augId}:uses:${h}`;

/** 복구 가능한(=소진 이력이 있는) 홀더의 다른 증강 id 목록 */
function reloadable(state: GameState, holder: PlayerId): string[] {
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined) return [];
  return player.augments.filter(
    (augId) => augId !== ID && counterOf(state, targetUsesKey(augId, holder)) > 0,
  );
}

const reloadAction: ActionDef<{ augmentId: string }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no reload augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (req.payload.augmentId === ID) return "cannot reload itself";
    if (!player.augments.includes(req.payload.augmentId)) {
      return "you do not have that augment";
    }
    if (counterOf(state, targetUsesKey(req.payload.augmentId, req.player)) <= 0) {
      return "that augment has no spent use to restore";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const spent = counterOf(state, targetUsesKey(req.payload.augmentId, req.player));
    return [
      // 대상 증강의 사용 카운터를 1 되돌린다 (한 번 더 쓸 수 있게)
      augmentDataSet(targetUsesKey(req.payload.augmentId, req.player), spent - 1),
      // 재장전 자신을 1 소진
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 소진됐다고 믿던 증강이 되살아났음을 알린다
      augmentDataSet(viewKey("*", `${ID}:${req.player}`), req.payload.augmentId),
    ];
  },
};

export const reload: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "etc",
  name: "재장전",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 사용 횟수를 이미 쓴 내 다른 증강 하나를 지목해 1회 복구한다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에, 이미 한 번 이상 쓴 내 다른 증강 하나를 지목해 사용 횟수를 한 번 되돌린다. '게임 내 1회'라는 절대 한도조차 무너뜨릴 수 있다. 복구 순간은 전원에게 공개되며, 사용 횟수 규약을 따르는 증강만 되살릴 수 있고 재장전 자신은 대상이 아니다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(reloadAction);
    }

    // 사용 횟수가 남았고 복구할 증강이 있으면 보유자 턴에 후보를 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      return reloadable(state, holder).map((augId) => ({
        type: ACTION,
        payload: { augmentId: augId },
      }));
    });
  },
  // 봇: 복구할 증강이 있으면 곧바로 되살린다 — 자원 회복은 언제나 이득(자해 없음).
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
