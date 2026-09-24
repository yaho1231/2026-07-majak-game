/**
 * 위그드라실 (yggdrasil, prism) — 이번 국 손패의 자패가 전부 발이 된다.
 *
 * (동풍전 1회 · 반장전 2회) 자기 순에 발동하면, 그 순간 손패의 자패(동남서북백중)가 전부
 * 발이 되고 이번 국 동안 쯔모해 온 자패도 발이 된다. 발로만 화료하면 더블 역만
 * «위그드라실»이고, 다른 역만과는 중첩되지 않는다(2026-09-24 사용자 확정).
 *
 * - 바뀌는 것은 **발동 시의 손패**와 **이후 쯔모한 자패**뿐이다. 후로한 패·남의 버림패로
 *   론한 패는 바뀌지 않는다. 수패는 그대로다.
 * - 리치 중에는 발동할 수 없다(손이 고정). 발동한 뒤 리치를 걸면 쯔모 자패는 계속 바뀐다.
 * - 발동은 전원 공개(`yggdrasil:{holder}` 국 스코프 채널).
 *
 * ## 구현
 * - 발동: 손패 자패에 `tileKindChanged`(→발) + 국 스코프 켜짐 표식 + 게임 횟수 카운터.
 * - 쯔모: `TILE_DRAWN` 리액션이 켜진 국의 자패 쯔모를 발로 바꾼다(영상패 포함). 같은 한
 *   장을 노리는 쯔모 변형 카드들과는 `drawMutators.ts`의 우선순위로 조정한다 — 위그드라실은
 *   가장 뒤다(양보해도 자원이 타지 않는 상시 효과라서).
 * - 역: 커스텀 역만 `yggdrasil`(더블 역만, `exclusiveYakuman`). 손패·후로 전체가 발이면
 *   성립하고, 성립하면 evaluate가 다른 역만을 전부 버린다. 발동한 국에만 성립한다.
 */

import {
  Suits,
  TILE_DRAWN,
  allKinds,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isHonor,
  kindOf,
  playerAtSeat,
  sameKind,
  shantenOf,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileKind,
} from "@majak/core";
import {
  addYakuHolder,
  counterOf,
  flagOf,
  publishUsesLeft,
  roundViewKey,
  scaledUses,
  yakuHolders,
} from "../util.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { yggdrasilOnKey, yieldsDrawTo } from "./drawMutators.js";
import { handAlteredKey } from "./handAltered.js";

const ID = "yggdrasil";
const ACTION = "yggdrasil_call";
/** 역 id — 증강 id와 같다 */
const YAKU = "yggdrasil";

/** 역패 발 (삼원패 2) */
export const HATSU: TileKind = { suit: Suits.Dragon, rank: 2 };

/** 게임 횟수 (동풍전 1 · 반장전 2) */
const maxUses = (state: GameState): number => scaledUses(state, 1);
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
const usesLeft = (state: GameState, h: PlayerId): number =>
  Math.max(0, maxUses(state) - counterOf(state, usedKey(h)));

/** 이번 국에 켰는가 */
const isOn = (state: GameState, h: PlayerId): boolean => flagOf(state, yggdrasilOnKey(state, h));

/** 발로 바꿀 자패인가 (이미 발이면 아니다) */
const turnsToHatsu = (k: TileKind): boolean => isHonor(k) && !sameKind(k, HATSU);

/** 발동 사실 — 전원 공개 (국 스코프) */
const publicKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

const callAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const me = state.players.find((p) => p.id === req.player);
    if (me === undefined || !me.augments.includes(ID)) return "no yggdrasil augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) return "not your turn";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: hand is frozen";
    if (isOn(state, req.player)) return "already on";
    if (usesLeft(state, req.player) <= 0) return "no uses left";
    return null;
  },
  toEvents: (req, { state }) => {
    const changes = handIdsOf(state, req.player)
      .filter((id) => turnsToHatsu(kindOf(state, id)))
      .map((tileId) => ({ tileId, kind: HATSU, attrs: { conjured: true } }));
    return [
      ...(changes.length > 0 ? [tileKindChanged(changes)] : []),
      augmentDataSet(yggdrasilOnKey(state, req.player), true),
      augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
      augmentDataSet(publicKey(req.player), true),
      // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다
      augmentDataSet(handAlteredKey(state, req.player), true),
    ];
  },
};

/** 발동하면 샹텐이 얼마나 되는가 (봇 전용) */
function afterCall(view: Parameters<typeof handKindsOf>[0], holder: PlayerId): {
  before: number;
  after: number;
  honors: number;
} {
  const hand = handKindsOf(view, holder);
  const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
  const opts = view.scoringOptions ?? {};
  const converted = hand.map((k) => (turnsToHatsu(k) ? HATSU : k));
  return {
    before: shantenOf(hand, meldCount, opts),
    after: shantenOf(converted, meldCount, opts),
    honors: hand.filter(isHonor).length,
  };
}

export const yggdrasil: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "위그드라실",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 발동하면 손패의 자패가 전부 발이 되고, 이번 국 동안 쯔모한 자패도 발이 된다. 발로만 화료하면 더블 역만 위그드라실이다.",
  detail:
    "발동한 순간 손패의 자패가 전부 발이 되고, 이번 국 동안 쯔모한 자패도 발이 된다. 수패와 후로한 패는 바뀌지 않는다.\n\n손패와 후로가 전부 발인 채로 화료하면 더블 역만 위그드라실이 된다. 다른 역만과는 중첩되지 않는다. 리치 중에는 발동할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(callAction);

    const yaku = ctx.yaku;
    if (yaku !== undefined) {
      if (yaku.get(YAKU) === undefined) {
        yaku.register({
          // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
          source: ctx.instanceId,
          id: YAKU,
          name: "위그드라실",
          closedHan: 26,
          openHan: 26,
          isYakuman: true,
          yakumanMultiplier: 2,
          exclusiveYakuman: true,
          check: (variant, wctx) =>
            wctx.winnerId !== undefined &&
            yakuHolders(yaku, YAKU).has(wctx.winnerId) &&
            isOn(engine.state, wctx.winnerId) &&
            variant.form === "standard" &&
            allKinds(variant).every((k) => sameKind(k, HATSU)),
        });
      }
      addYakuHolder(ctx, yaku, YAKU);
    }

    publishUsesLeft(ctx, (state) => ({ left: usesLeft(state, holder), total: maxUses(state) }));

    // 무장해제되면 «발동 중» 공개 표시도 내린다 (disarmBanner.ts 머리말)
    clearViewOnDisarm(ctx, () => [publicKey(holder)]);

    // 켜진 국의 자패 쯔모를 발로 (영상패 포함). 더 센 쯔모 변형이 가져가면 양보한다.
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      if (!isOn(rc.state, holder)) return;
      if (!turnsToHatsu(kindOf(rc.state, p.tileId))) return;
      if (yieldsDrawTo(ID, rc.state, engine.rules, holder, p.tileId, p.rinshan === true)) return;
      rc.emit(tileKindChanged([{ tileId: p.tileId, kind: HATSU, attrs: { conjured: true } }]));
    });

    // 리치 중에는 후보를 내지 않는다 (리치 강제 쯔모기리 자동 진행을 지킨다)
    ctx.holderTurnOptions((state) => {
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      if (isOn(state, holder) || usesLeft(state, holder) <= 0) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  /**
   * 손을 전진시키는 물건이라 `advance`다. 게임에 한두 번뿐이라 `oneShot`.
   * 자패를 발로 바꿔 샹텐이 줄 때, 또는 자패가 손의 절반을 넘어 위그드라실을 노릴 만할 때 켠다.
   */
  bot: plan({
    intent: "advance",
    oneShot: true,
    fleeting: (ctx) => afterCall(ctx.view, ctx.holder).after <= 0,
    pick: (ctx) => {
      const { before, after, honors } = afterCall(ctx.view, ctx.holder);
      if (after >= before && honors < 7) return null;
      return ctx.options.find((o) => o.type === ACTION) ?? null;
    },
  }),
});

