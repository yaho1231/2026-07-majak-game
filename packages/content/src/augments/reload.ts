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
import { counterOf, flagOf, matchUses, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "reload";
const ACTION = "reload_use";

/** 재장전 자신의 사용 카운터 (matchUses) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/**
 * 대상 증강의 사용 카운터 키 후보.
 *
 * 대부분은 `<id>:uses:<holder>`(matchUses 규약)를 쓰지만, 매치 스코프 카운터를
 * `<id>:used:<holder>`로 이름 붙인 증강도 넷 있다(연금술사·등가교환·연못 강탈·역만 방어술).
 * 예전에는 `uses`만 봐서 그 넷은 **재장전이 광고하는 "소진 복구"의 사각지대**였다
 * (2026-07-29 감사). 키를 옮기면 기존 상태·테스트가 깨지므로 여기서 둘 다 인정한다.
 */
const targetUsesKeys = (augId: string, h: PlayerId): string[] => [
  `${augId}:uses:${h}`,
  `${augId}:used:${h}`,
];

/**
 * 이 증강이 실제로 소진 이력을 남긴 카운터 키 (없으면 null).
 *
 * `:used:` 키는 숫자 카운터(예: pond_snatch)뿐 아니라 **불리언 플래그**로 소진을
 * 기록하는 증강도 있다(예: red_five_touch — `augmentDataSet(usedKey, true)`).
 * `counterOf`는 숫자가 아니면 0을 반환하므로 불리언 소진은 `flagOf`로도 함께 봐야
 * 사각지대가 생기지 않는다(2026-08 감사).
 */
function spentKeyOf(
  state: GameState,
  augId: string,
  holder: PlayerId,
): string | null {
  return (
    targetUsesKeys(augId, holder).find(
      (k) => counterOf(state, k) > 0 || flagOf(state, k),
    ) ?? null
  );
}

/** 복구 가능한(=소진 이력이 있는) 홀더의 다른 증강 id 목록 */
function reloadable(state: GameState, holder: PlayerId): string[] {
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined) return [];
  return player.augments.filter(
    (augId) => augId !== ID && spentKeyOf(state, augId, holder) !== null,
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
    if (spentKeyOf(state, req.payload.augmentId, req.player) === null) {
      return "that augment has no spent use to restore";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    // validate가 존재를 보장한다
    const key = spentKeyOf(state, req.payload.augmentId, req.player) as string;
    // 불리언 소진 플래그는 false로, 숫자 카운터는 1 감소로 되돌린다
    const restored = flagOf(state, key) ? false : counterOf(state, key) - 1;
    return [
      // 대상 증강의 사용 기록을 되돌린다 (한 번 더 쓸 수 있게)
      augmentDataSet(key, restored),
      // 재장전 자신을 1 소진
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 소진됐다고 믿던 증강이 되살아났음을 알린다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), req.payload.augmentId),
    ];
  },
};

export const reload: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "etc",
  complexity: 1,
  name: "재장전",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 사용 횟수를 이미 쓴 내 다른 증강 하나를 지목해 1회 복구한다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에, 이미 한 번 이상 쓴 내 다른 증강 하나를 지목해 사용 횟수를 한 번 되돌린다. '게임 내 1회'라는 절대 한도조차 무너뜨릴 수 있다. 복구 순간은 전원에게 공개되며, 사용 횟수 규약을 따르는 증강만 되살릴 수 있고 재장전 자신은 대상이 아니다.\n\n⚠ 복구할 수 있는 것은 게임 단위 사용 횟수를 쓰는 증강뿐이다. 국 단위 쿨다운으로 도는 증강은 눈에 띄게 소진돼 보여도 후보에 뜨지 않는다.",
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
  bot: plan({
    intent: "setup",
    // 재장전은 자기 순이면 언제든 된다 — 회수할 국이 남아 있을 때만 값이 있다
    // (올라스에 복구해 봐야 쓸 자리가 없다). 그 판단이 setup 적기다.
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
